using System.Globalization;
using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed class ApiV1Analytics(IDbContextFactory<AppDbContext> contexts)
{
    public async Task<ApiAnalytics> Get(DateTimeOffset? from, DateTimeOffset? to, string resolution,
        Guid? linkId, bool privateAccess, CancellationToken ct)
    {
        var end = to?.ToUniversalTime() ?? DateTimeOffset.UtcNow;
        var start = from?.ToUniversalTime() ?? end.AddDays(-30);
        ApiV1Links.Require(resolution is "hour" or "day" or "month" or "year" && start < end
            && end - start <= TimeSpan.FromDays(3650), 400, "invalid_analytics_range", "Choose hour/day/month/year and an increasing range of at most 3650 days.");
        var first = Bucket(start.UtcDateTime, resolution);
        var last = Bucket(end.AddTicks(-1).UtcDateTime, resolution);
        var buckets = new List<DateTime>();
        for (var date = first; date <= last; date = Next(date, resolution))
        {
            ApiV1Links.Require(buckets.Count < 10000, 400, "bucket_limit", "At most 10000 buckets; select a coarser resolution or shorter range.");
            buckets.Add(date);
        }
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(db.Database.IsNpgsql()
            ? System.Data.IsolationLevel.RepeatableRead : System.Data.IsolationLevel.Serializable, ct);
        if (linkId is not null) await ApiV1Links.Find(db, linkId.Value, privateAccess, ct);
        var query = db.Visits.AsNoTracking().Where(v => v.VisitedAt >= start && v.VisitedAt < end);
        if (linkId is not null) query = query.Where(v => v.LinkId == linkId);
        // Without private access, aggregate only known public-link events. This
        // prevents aggregate breakdowns from bypassing object-level restrictions.
        if (!privateAccess && linkId is null)
            query = query.Where(v => v.EventType == "directory" || db.Urls.Any(u => u.Id == v.LinkId && !u.IsPrivate));
        var redirects = query.Where(v => v.EventType == "redirect");
        var total = await redirects.CountAsync(ct);
        var directory = await query.CountAsync(v => v.EventType == "directory", ct);
        var legacy = await query.CountAsync(v => v.EventType == "legacy", ct);
        var browsers = await redirects.GroupBy(v => v.Browser ?? "Unknown").Select(g => new NamedCount { Name = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count).ThenBy(g => g.Name).Take(999).ToListAsync(ct);
        var systems = await redirects.GroupBy(v => v.Os ?? "Unknown").Select(g => new NamedCount { Name = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count).ThenBy(g => g.Name).Take(999).ToListAsync(ct);
        AnalyticsGroups.AddRemainder(browsers, total); AnalyticsGroups.AddRemainder(systems, total);
        // Group in SQL, not by downloading visitor rows. A bounded period prevents
        // unbounded quiet-range expansion. Provider-specific SQL remains parameterized.
        var table = db.Model.FindEntityType(typeof(Entities.Url))!.GetTableName()!;
        var quoted = "\"" + table.Replace("\"", "\"\"") + "\"";
        var access = privateAccess ? "" : $" AND EXISTS(SELECT 1 FROM {quoted} u WHERE u.link_id = visits.link_id AND NOT u.private)";
        List<DateCount> grouped;
        var format = resolution == "hour" ? "yyyy-MM-dd HH:00" : resolution == "month" ? "yyyy-MM" : resolution == "year" ? "yyyy" : "yyyy-MM-dd";
        if (db.Database.IsNpgsql())
        {
            var sqlFormat = resolution == "hour" ? "YYYY-MM-DD HH24:00" : resolution == "month" ? "YYYY-MM" : resolution == "year" ? "YYYY" : "YYYY-MM-DD";
            // Composed SQL contains only quoted EF metadata and fixed predicates;
            // dates, format and immutable link ID are parameters on both providers.
#pragma warning disable EF1003
            grouped = await db.Database.SqlQueryRaw<DateCount>("SELECT to_char(visited_at AT TIME ZONE 'UTC', {2}) AS \"Date\", count(*)::integer AS \"Count\" FROM visits " +
                "WHERE event_type = 'redirect' AND visited_at >= {0} AND visited_at < {1} AND ({3} IS NULL OR link_id = {3})" + access + " GROUP BY 1 ORDER BY 1",
                start, end, sqlFormat, new Npgsql.NpgsqlParameter { Value = (object?)linkId ?? DBNull.Value, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Uuid }).ToListAsync(ct);
        }
        else
        {
            var sqlFormat = resolution == "hour" ? "%Y-%m-%d %H:00" : resolution == "month" ? "%Y-%m" : resolution == "year" ? "%Y" : "%Y-%m-%d";
            grouped = await db.Database.SqlQueryRaw<DateCount>("SELECT strftime({2}, (visited_at - 621355968000000000) / 10000000.0, 'unixepoch') AS Date, count(*) AS Count FROM visits " +
                "WHERE event_type = 'redirect' AND visited_at >= {0} AND visited_at < {1} AND ({3} IS NULL OR link_id = {3})" + access + " GROUP BY 1 ORDER BY 1",
                start.UtcTicks, end.UtcTicks, sqlFormat, (object?)linkId ?? DBNull.Value).ToListAsync(ct);
        }
#pragma warning restore EF1003
        var counts = grouped.ToDictionary(g => g.Date, g => g.Count);
        var traffic = buckets.Select(b => new DateCount { Date = b.ToString(format, CultureInfo.InvariantCulture),
            Count = counts.GetValueOrDefault(b.ToString(format, CultureInfo.InvariantCulture)) }).ToList();
        await tx.CommitAsync(ct);
        return new(start, end, resolution, DateTimeOffset.UtcNow, true, total, directory, legacy, traffic, browsers, systems);
    }

    public static string Csv(ApiAnalytics data) => "utc_bucket,redirect_visits\r\n" + string.Join("\r\n",
        data.Traffic.Select(row => ApiCsv.Cell(row.Date) + "," + row.Count.ToString(CultureInfo.InvariantCulture))) + "\r\n";
    private static DateTime Bucket(DateTime date, string unit) => unit == "year" ? new(date.Year, 1, 1)
        : unit == "month" ? new(date.Year, date.Month, 1) : unit == "hour" ? new(date.Year, date.Month, date.Day, date.Hour, 0, 0) : date.Date;
    private static DateTime Next(DateTime date, string unit) => unit == "year" ? date.AddYears(1)
        : unit == "month" ? date.AddMonths(1) : unit == "hour" ? date.AddHours(1) : date.AddDays(1);
}
