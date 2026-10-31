using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

/// <summary>
/// Resolves short paths to redirect targets. Port of src/app/utils.js
/// (fetchRedirectUrl / shapeRedirectPayload / fetchDisplayUrls / addUrl / deleteUrl),
/// with the Redis cache replaced by an in-process IMemoryCache.
/// </summary>
public sealed class RedirectService
{
    /// <summary>Routes that stay within the app and are never treated as short paths.</summary>
    public static readonly IReadOnlySet<string> ReservedRoutes = new HashSet<string>(StringComparer.Ordinal)
    {
        "invaildlink", "deprecated", "urls", "access-denied", "password-protected"
    };

    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly IMemoryCache _cache;
    private readonly ILogger<RedirectService> _logger;

    public RedirectService(
        IDbContextFactory<AppDbContext> contexts,
        IMemoryCache cache,
        IOptions<UrlShortenerOptions> options,
        ILogger<RedirectService> logger)
    {
        _contexts = contexts;
        _cache = cache;
        _logger = logger;
    }

    private static string CacheKey(string location) => $"redirect:{location}";

    /// <summary>Resolves a short path to a redirect payload, or null for reserved routes.</summary>
    public async Task<RedirectPayload?> FetchRedirectUrlAsync(string location, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (ReservedRoutes.Contains(location))
        {
            return null; // Special routes stay within the app
        }

        // Admission must always use current database state, never a cached destination.

        var fallback = new RedirectPayload { RedirectUrl = "/invaildlink", Deprecated = false };

        Url? urlData;
        try
        {
            urlData = await _db.Urls.AsNoTracking()
                .FirstOrDefaultAsync(u => u.ShortPath == location, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Error fetching redirect for '{Location}'", location);
            return new RedirectPayload { Unavailable = true };
        }

        if (urlData is null)
        {
            // Don't cache negatives: caches are per-process (no shared Redis to
            // invalidate), so caching "not found" would hide a newly-added link
            // until the entry expired. A short-path PK lookup is cheap anyway.
            _logger.LogWarning("URL not found: {Location}", location);
            return fallback;
        }

        try
        {
            var response = ShapeRedirectPayload(urlData, location)!;
            if (!urlData.Deprecated && (!LinkAccess.Available(urlData, DateTimeOffset.UtcNow)
                || (!urlData.IsPrivate && !await LinkAccess.ConsumeAsync(_db, urlData, ct))))
                return new RedirectPayload { RedirectUrl = "/access-denied" };
            return response;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Redirect admission unavailable");
            return new RedirectPayload { Unavailable = true };
        }
    }

    private void InvalidateCache(string shortPath) => _cache.Remove(CacheKey(shortPath));

    /// <summary>Port of shapeRedirectPayload: applies deprecated/private routing rules.</summary>
    private static RedirectPayload? ShapeRedirectPayload(Url urlData, string? location = null)
    {
        if (urlData is null)
        {
            return null;
        }

        if (urlData.Deprecated)
        {
            return new RedirectPayload { RedirectUrl = "/deprecated", Deprecated = true };
        }

        if (urlData.IsPrivate)
        {
            return new RedirectPayload
            {
                RedirectUrl = "/password-protected",
                Private = true,
                ShortPath = location ?? urlData.ShortPath
            };
        }

        return new RedirectPayload
        {
            LinkId = urlData.Id,
            RedirectUrl = urlData.RedirectUrl,
            Deprecated = urlData.Deprecated,
            Private = urlData.IsPrivate,
            ShortPath = urlData.ShortPath
        };
    }

    /// <summary>Compatibility first page of public URLs; use GetDisplayPageAsync for traversal.</summary>
    public async Task<List<Url>> FetchDisplayUrlsAsync(CancellationToken ct = default)
        => (await GetDisplayPageAsync(ct: ct)).Items;

    public async Task<PageResult<Url>> GetDisplayPageAsync(int page = 1, int pageSize = 200, string? search = null,
        string? status = null, string? sort = null, bool descending = false, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var (number, size, term) = Paging.Normalize(page, pageSize, search);
        var now = DateTimeOffset.UtcNow;
        var query = _db.Urls.AsNoTracking().Where(u => !u.IsPrivate && !u.Archived && u.Listed
            && (u.ScheduleStart == null || u.ScheduleStart <= now) && (u.ScheduleEnd == null || u.ScheduleEnd > now)
            && (u.UsageQuota == null || u.UsageCount < u.UsageQuota) && u.CustomRules == null);
        if (term.Length > 0) query = query.Where(u => u.ShortPath.ToLower().Contains(term) || u.RedirectUrl.ToLower().Contains(term));
        if (status == "active") query = query.Where(u => !u.Deprecated);
        if (status == "deprecated") query = query.Where(u => u.Deprecated);
        var total = await query.CountAsync(ct);
        var ordered = sort == "redirect_url"
            ? (descending ? query.OrderByDescending(u => u.RedirectUrl).ThenBy(u => u.ShortPath) : query.OrderBy(u => u.RedirectUrl).ThenBy(u => u.ShortPath))
            : (descending ? query.OrderByDescending(u => u.ShortPath) : query.OrderBy(u => u.ShortPath));
        var items = await ordered.Skip((number - 1) * size).Take(size)
            .Select(u => new Url { ShortPath = u.ShortPath, RedirectUrl = u.RedirectUrl, Deprecated = u.Deprecated })
             .ToListAsync(ct);
        return new(items, total, number, size);
    }

    /// <summary>Port of fetchUrlByShortPath (used by the password-protected page).</summary>
    public async Task<Url?> FetchUrlByShortPathAsync(string shortPath, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        return await _db.Urls.AsNoTracking()
            .Select(u => new Url
            {
                ShortPath = u.ShortPath, IsPrivate = u.IsPrivate, Deprecated = u.Deprecated,
                RedirectUrl = string.Empty
            })
            .FirstOrDefaultAsync(u => u.ShortPath == shortPath, ct);
    }

    /// <summary>Port of addUrl.</summary>
    public async Task<bool> AddUrlAsync(string shortPath, string redirectUrl, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (!InputValidation.Path(shortPath) || !InputValidation.Destination(redirectUrl)) return false;
        try
        {
            _db.Urls.Add(new Url { ShortPath = shortPath, RedirectUrl = redirectUrl, Deprecated = false });
            await _db.SaveChangesAsync(ct);
            InvalidateCache(shortPath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding URL");
            return false;
        }
    }

    /// <summary>Port of deleteUrl.</summary>
    public async Task<bool> DeleteUrlAsync(string shortPath, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        try
        {
            var deleted = await _db.Urls.Where(u => u.ShortPath == shortPath).ExecuteDeleteAsync(ct);
            InvalidateCache(shortPath);
            return deleted != 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting URL");
            return false;
        }
    }
}
