using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

/// <summary>
/// Computes historical Admin dashboard analytics,
/// with the 30s cache preserved via IMemoryCache.
/// </summary>
public sealed class AnalyticsService
{
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly IMemoryCache _cache;
    private readonly TimeProvider _time;

    public AnalyticsService(IDbContextFactory<AppDbContext> contexts, IMemoryCache cache, IOptions<UrlShortenerOptions> options, TimeProvider? timeProvider = null)
    {
        _contexts = contexts;
        _cache = cache;
        _time = timeProvider ?? TimeProvider.System;
    }

    /// <param name="timeRange">Days to look back; 0 = all time.</param>
    public async Task<AnalyticsResult> GetAnalyticsAsync(int timeRange, CancellationToken ct = default, bool refresh = false, string dateBucket = "day", int? maxBuckets = null, string? shortPath = null)
    {
        if (dateBucket is not ("hour" or "day" or "month" or "year"))
            throw new ArgumentOutOfRangeException(nameof(dateBucket), "Choose hour, day, month or year.");
        timeRange = Math.Clamp(timeRange, 0, 36500);
        var key = $"analytics_{timeRange}_{dateBucket}_{maxBuckets}_{shortPath}";
        if (refresh)
        {
            var result = await ComputeAsync(timeRange, dateBucket, maxBuckets, ct, shortPath);
            _cache.Set(key, result, TimeSpan.FromSeconds(30));
            return result;
        }
        return (await _cache.GetOrCreateAsync(key, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return await ComputeAsync(timeRange, dateBucket, maxBuckets, ct, shortPath);
        }))!;
    }

    private async Task<AnalyticsResult> ComputeAsync(int timeRange, string bucket, int? maxBuckets, CancellationToken ct, string? shortPath)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        // Totals and every distribution must see the same visits while the queue
        // consumer is adding rows. This is a per-operation read snapshot, not a
        // change to shared PostgreSQL server settings.
        await using var transaction = await _db.Database.BeginTransactionAsync(_db.Database.IsNpgsql()
            ? System.Data.IsolationLevel.RepeatableRead : System.Data.IsolationLevel.Serializable, ct);
        timeRange = Math.Clamp(timeRange, 0, 36500);
        var now = _time.GetUtcNow();
        DateTimeOffset? cutoff = timeRange > 0 ? now.AddDays(-timeRange) : null;
        DateTimeOffset? observationEnd = timeRange > 0 ? now : null;

        IQueryable<Entities.Visit> visitsQuery = _db.Visits.AsNoTracking();
        if (shortPath is not null) visitsQuery = visitsQuery.Where(v => v.ShortPath == shortPath);
        if (cutoff is not null)
        {
            visitsQuery = visitsQuery.Where(v => v.VisitedAt >= cutoff && v.VisitedAt <= observationEnd);
        }

        var linksQuery = _db.Urls.AsNoTracking();
        if (shortPath is not null) linksQuery = linksQuery.Where(u => u.ShortPath == shortPath);
        var totalUrls = await linksQuery.CountAsync(ct);
        var totalVisits = await visitsQuery.CountAsync(ct);

        var recentVisits = await visitsQuery
            .OrderByDescending(v => v.VisitedAt).ThenBy(v => v.Id)
            .Take(10)
            .Select(v => new RecentVisit
            {
                ShortPath = v.ShortPath,
                UserAgent = shortPath == null ? v.UserAgent : null,
                IpAddress = shortPath == null ? v.IpAddress : null,
                Environment = v.Environment,
                VersionNumber = v.VersionNumber,
                VisitedAt = v.VisitedAt,
                UserId = v.UserId
            })
            .ToListAsync(ct);

        var deprecatedUrls = await linksQuery.CountAsync(u => u.Deprecated, ct);

        const int outputLimit = 1000;
        var visitStats = await visitsQuery
            .GroupBy(r => r.ShortPath ?? "Unknown")
            .Select(g => new NamedCount { ShortPath = g.Key, Count = g.Count() })
            .OrderByDescending(c => c.Count).ThenBy(c => c.ShortPath).Take(outputLimit - 1).ToListAsync(ct);

        var browserDistribution = await visitsQuery.GroupBy(v => v.Browser ?? "Unknown")
            .Select(g => new NamedCount { Name = g.Key, Count = g.Count() })
            .OrderByDescending(c => c.Count).ThenBy(c => c.Name).Take(outputLimit - 1).ToListAsync(ct);
        var osDistribution = await visitsQuery.GroupBy(v => v.Os ?? "Unknown")
            .Select(g => new NamedCount { Name = g.Key, Count = g.Count() })
            .OrderByDescending(c => c.Count).ThenBy(c => c.Name).Take(outputLimit - 1).ToListAsync(ct);

        AnalyticsGroups.AddRemainder(visitStats, totalVisits);
        AnalyticsGroups.AddRemainder(browserDistribution, totalVisits);
        AnalyticsGroups.AddRemainder(osDistribution, totalVisits);

        var oldest = await visitsQuery.MinAsync(v => v.VisitedAt, ct);
        var newest = await visitsQuery.MaxAsync(v => v.VisitedAt, ct);
        var undated = await visitsQuery.CountAsync(v => v.VisitedAt == null, ct);
        // Resolution is chosen explicitly, never silently coarsened at 1,000 points.

        List<DateCount> visitsOverTime;
        List<VisitTimeCount> timePatterns;
        if (_db.Database.IsNpgsql())
        {
            // Explicit UTC buckets, independent of PostgreSQL session timezone.
            var format = bucket == "year" ? "YYYY" : bucket == "month" ? "YYYY-MM" : bucket == "hour" ? "YYYY-MM-DD HH24:00" : "YYYY-MM-DD";
            visitsOverTime = await _db.Database.SqlQueryRaw<DateCount>(
                "SELECT to_char(visited_at AT TIME ZONE 'UTC', {1}) AS \"Date\", count(*)::integer AS \"Count\" " +
                "FROM visits WHERE visited_at IS NOT NULL AND ({0} IS NULL OR visited_at >= {0}) AND ({2} IS NULL OR visited_at <= {2}) AND ({3} IS NULL OR short_path = {3}) " +
                "GROUP BY 1 ORDER BY 1", new Npgsql.NpgsqlParameter { Value = (object?)cutoff ?? DBNull.Value,
                    NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.TimestampTz }, format,
                     new Npgsql.NpgsqlParameter { Value = (object?)observationEnd ?? DBNull.Value, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.TimestampTz },
                     new Npgsql.NpgsqlParameter { Value = (object?)shortPath ?? DBNull.Value, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Text }).ToListAsync(ct);
            timePatterns = await _db.Database.SqlQueryRaw<VisitTimeCount>(
                "SELECT (extract(isodow FROM visited_at AT TIME ZONE 'UTC')::integer - 1) AS \"Weekday\", " +
                "extract(hour FROM visited_at AT TIME ZONE 'UTC')::integer AS \"Hour\", count(*)::integer AS \"Count\" " +
                "FROM visits WHERE visited_at IS NOT NULL AND ({0} IS NULL OR visited_at >= {0}) AND ({1} IS NULL OR visited_at <= {1}) AND ({2} IS NULL OR short_path = {2}) " +
                "GROUP BY 1, 2", new Npgsql.NpgsqlParameter { Value = (object?)cutoff ?? DBNull.Value,
                    NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.TimestampTz },
                     new Npgsql.NpgsqlParameter { Value = (object?)observationEnd ?? DBNull.Value, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.TimestampTz },
                     new Npgsql.NpgsqlParameter { Value = (object?)shortPath ?? DBNull.Value, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Text }).ToListAsync(ct);
        }
        else
        {
            // The isolated SQLite model stores UTC ticks; aggregation still runs in SQL.
            var format = bucket == "year" ? "%Y" : bucket == "month" ? "%Y-%m" : bucket == "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";
            visitsOverTime = await _db.Database.SqlQueryRaw<DateCount>(
                "SELECT strftime({1}, (visited_at - 621355968000000000) / 10000000.0, 'unixepoch') AS Date, count(*) AS Count " +
                "FROM visits WHERE visited_at IS NOT NULL AND ({0} IS NULL OR visited_at >= {0}) AND ({2} IS NULL OR visited_at <= {2}) AND ({3} IS NULL OR short_path = {3}) " +
                "GROUP BY 1 ORDER BY 1", (object?)cutoff?.UtcTicks ?? DBNull.Value, format, (object?)observationEnd?.UtcTicks ?? DBNull.Value, (object?)shortPath ?? DBNull.Value).ToListAsync(ct);
            timePatterns = await _db.Database.SqlQueryRaw<VisitTimeCount>(
                "SELECT ((cast(strftime('%w', (visited_at - 621355968000000000) / 10000000.0, 'unixepoch') AS integer) + 6) % 7) AS Weekday, " +
                "cast(strftime('%H', (visited_at - 621355968000000000) / 10000000.0, 'unixepoch') AS integer) AS Hour, count(*) AS Count " +
                "FROM visits WHERE visited_at IS NOT NULL AND ({0} IS NULL OR visited_at >= {0}) AND ({1} IS NULL OR visited_at <= {1}) AND ({2} IS NULL OR short_path = {2}) " +
                "GROUP BY 1, 2", (object?)cutoff?.UtcTicks ?? DBNull.Value, (object?)observationEnd?.UtcTicks ?? DBNull.Value, (object?)shortPath ?? DBNull.Value).ToListAsync(ct);
        }
        // Include quiet periods too, so horizontal chart spacing represents time.
        if (cutoff is not null || (oldest is not null && newest is not null))
        {
            // Rolling selected ranges include the partial first/current UTC bucket,
            // even with no traffic. All time retains recorded-history endpoints.
            var first = BucketStart((cutoff ?? oldest!.Value).UtcDateTime, bucket);
            var last = BucketStart((observationEnd ?? newest!.Value).UtcDateTime, bucket);
            var bucketCount = bucket switch
            {
                "hour" => (last - first).Ticks / TimeSpan.TicksPerHour + 1,
                "day" => (last - first).Ticks / TimeSpan.TicksPerDay + 1,
                "month" => (last.Year - first.Year) * 12L + last.Month - first.Month + 1,
                _ => last.Year - first.Year + 1L
            };
            // Reject malformed enormous spans before allocating any empty timeline.
            ApiV1Links.Require(bucketCount <= (maxBuckets ?? 1000000), 400, "bucket_limit", "Too many date buckets; select a coarser resolution or shorter range.");
            var counts = visitsOverTime.ToDictionary(d => d.Date, d => d.Count, StringComparer.Ordinal);
            visitsOverTime = new((int)bucketCount);
            var format = bucket == "year" ? "yyyy" : bucket == "month" ? "yyyy-MM" : bucket == "hour" ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";
            for (var date = first; ; date = NextBucket(date, bucket))
            {
                ct.ThrowIfCancellationRequested();
                var label = date.ToString(format, System.Globalization.CultureInfo.InvariantCulture);
                visitsOverTime.Add(new DateCount { Date = label, Count = counts.GetValueOrDefault(label) });
                if (date >= last) break;
            }
        }

        await transaction.CommitAsync(ct);
        return new AnalyticsResult
        {
            TotalUrls = totalUrls,
            TotalVisits = totalVisits,
            ActiveUrls = totalUrls - deprecatedUrls,
            DeprecatedUrls = deprecatedUrls,
            AverageClicks = totalVisits / (double)(totalUrls == 0 ? 1 : totalUrls),
            CategoriesGrouped = visitStats.Any(g => g.IsOther) || browserDistribution.Any(g => g.IsOther) || osDistribution.Any(g => g.IsOther),
            DateBucket = bucket,
            ObservationStart = cutoff ?? oldest,
            ObservationEnd = observationEnd ?? newest,
            UndatedVisits = undated,
            VisitStats = visitStats,
            RecentVisits = recentVisits,
            BrowserDistribution = browserDistribution,
            OsDistribution = osDistribution,
            VisitsOverTime = visitsOverTime,
            WeekdayDistribution = Enumerable.Range(0, 7).Select(day => new NamedCount
            {
                Name = new[] { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" }[day],
                Count = timePatterns.Where(row => row.Weekday == day).Sum(row => row.Count)
            }).ToList(),
            HourDistribution = Enumerable.Range(0, 24).Select(hour => new NamedCount
            {
                Name = hour.ToString("D2", System.Globalization.CultureInfo.InvariantCulture) + ":00",
                Count = timePatterns.Where(row => row.Hour == hour).Sum(row => row.Count)
            }).ToList()
        };
    }

    private static DateTime BucketStart(DateTime date, string bucket) => bucket == "year"
        ? new DateTime(date.Year, 1, 1) : bucket == "month" ? new DateTime(date.Year, date.Month, 1)
        : bucket == "hour" ? new DateTime(date.Year, date.Month, date.Day, date.Hour, 0, 0) : date.Date;

    private static DateTime NextBucket(DateTime date, string bucket) => bucket == "year"
        ? date.AddYears(1) : bucket == "month" ? date.AddMonths(1) : bucket == "hour" ? date.AddHours(1) : date.AddDays(1);

}
