using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

/// <summary>
/// Computes dashboard analytics. Port of src/app/api/admin-analytics/route.js,
/// with the 30s cache preserved via IMemoryCache.
/// </summary>
public sealed class AnalyticsService
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly UrlShortenerOptions _options;

    public AnalyticsService(AppDbContext db, IMemoryCache cache, IOptions<UrlShortenerOptions> options)
    {
        _db = db;
        _cache = cache;
        _options = options.Value;
    }

    /// <param name="timeRange">Days to look back; 0 = all time.</param>
    public Task<AnalyticsResult> GetAnalyticsAsync(int timeRange, CancellationToken ct = default) =>
        _cache.GetOrCreateAsync($"analytics_{timeRange}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return await ComputeAsync(timeRange, ct);
        })!;

    private async Task<AnalyticsResult> ComputeAsync(int timeRange, CancellationToken ct)
    {
        DateTimeOffset? cutoff = timeRange > 0 ? DateTimeOffset.UtcNow.AddDays(-timeRange) : null;

        IQueryable<Entities.Visit> visitsQuery = _db.Visits.AsNoTracking();
        if (cutoff is not null)
        {
            visitsQuery = visitsQuery.Where(v => v.VisitedAt >= cutoff);
        }

        var totalUrls = await _db.Urls.AsNoTracking().CountAsync(ct);
        var totalVisits = await visitsQuery.CountAsync(ct);

        var recentVisits = await visitsQuery
            .OrderByDescending(v => v.VisitedAt)
            .Take(10)
            .Select(v => new RecentVisit
            {
                ShortPath = v.ShortPath,
                UserAgent = v.UserAgent,
                IpAddress = v.IpAddress,
                Environment = v.Environment,
                VersionNumber = v.VersionNumber,
                VisitedAt = v.VisitedAt,
                UserId = v.UserId
            })
            .ToListAsync(ct);

        var rows = await visitsQuery
            .OrderByDescending(v => v.VisitedAt)
            .Take(_options.AnalyticsMaxRows)
            .Select(v => new { v.ShortPath, v.Browser, v.Os, v.VisitedAt })
            .ToListAsync(ct);

        var deprecatedUrls = await _db.Urls.AsNoTracking().CountAsync(u => u.Deprecated, ct);

        var visitStats = rows
            .GroupBy(r => r.ShortPath ?? "Unknown")
            .Select(g => new NamedCount { ShortPath = g.Key, Count = g.Count() })
            .OrderByDescending(c => c.Count)
            .ToList();

        var browserDistribution = AggregateCounts(rows.Select(r => r.Browser));
        var osDistribution = AggregateCounts(rows.Select(r => r.Os));

        var visitsOverTime = rows
            .Where(r => r.VisitedAt is not null)
            .GroupBy(r => r.VisitedAt!.Value.UtcDateTime.ToString("yyyy-MM-dd"))
            .Select(g => new DateCount { Date = g.Key, Count = g.Count() })
            .OrderBy(d => d.Date, StringComparer.Ordinal)
            .ToList();

        return new AnalyticsResult
        {
            TotalUrls = totalUrls,
            TotalVisits = totalVisits,
            ActiveUrls = totalUrls - deprecatedUrls,
            DeprecatedUrls = deprecatedUrls,
            AverageClicks = totalVisits / (double)(totalUrls == 0 ? 1 : totalUrls),
            VisitStats = visitStats,
            RecentVisits = recentVisits,
            BrowserDistribution = browserDistribution,
            OsDistribution = osDistribution,
            VisitsOverTime = visitsOverTime
        };
    }

    private static List<NamedCount> AggregateCounts(IEnumerable<string?> values) =>
        values
            .GroupBy(v => v ?? "Unknown")
            .Select(g => new NamedCount { Name = g.Key, Count = g.Count() })
            .OrderByDescending(c => c.Count)
            .ToList();
}
