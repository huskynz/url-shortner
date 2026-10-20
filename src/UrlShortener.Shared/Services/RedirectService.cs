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

    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly UrlShortenerOptions _options;
    private readonly ILogger<RedirectService> _logger;

    public RedirectService(
        AppDbContext db,
        IMemoryCache cache,
        IOptions<UrlShortenerOptions> options,
        ILogger<RedirectService> logger)
    {
        _db = db;
        _cache = cache;
        _options = options.Value;
        _logger = logger;
    }

    private static string CacheKey(string location) => $"redirect:{location}";

    /// <summary>Resolves a short path to a redirect payload, or null for reserved routes.</summary>
    public async Task<RedirectPayload?> FetchRedirectUrlAsync(string location, CancellationToken ct = default)
    {
        if (ReservedRoutes.Contains(location))
        {
            return null; // Special routes stay within the app
        }

        var cacheKey = CacheKey(location);
        if (CachingEnabled && _cache.TryGetValue(cacheKey, out RedirectPayload? cached) && cached is not null)
        {
            return cached;
        }

        var fallback = new RedirectPayload { RedirectUrl = "/invaildlink", Deprecated = false };

        Url? urlData;
        try
        {
            urlData = await _db.Urls.AsNoTracking()
                .FirstOrDefaultAsync(u => u.ShortPath == location, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching redirect for '{Location}'", location);
            return fallback;
        }

        if (urlData is null)
        {
            // Don't cache negatives: caches are per-process (no shared Redis to
            // invalidate), so caching "not found" would hide a newly-added link
            // until the entry expired. A short-path PK lookup is cheap anyway.
            _logger.LogWarning("URL not found: {Location}", location);
            return fallback;
        }

        var response = ShapeRedirectPayload(urlData, location)!;
        CacheRedirect(cacheKey, response);
        return response;
    }

    // Caching is opt-in. With 0 (the default) every redirect is a fresh DB lookup, so
    // adds/edits/deprecations take effect instantly across all replicas. A positive
    // value trades that immediacy for a short in-process cache on hot paths.
    private bool CachingEnabled => _options.RedirectCacheTtlSeconds > 0;

    private void CacheRedirect(string cacheKey, RedirectPayload payload)
    {
        if (!CachingEnabled)
        {
            return;
        }
        _cache.Set(cacheKey, payload, TimeSpan.FromSeconds(_options.RedirectCacheTtlSeconds));
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
            RedirectUrl = urlData.RedirectUrl,
            Deprecated = urlData.Deprecated,
            Private = urlData.IsPrivate,
            ShortPath = urlData.ShortPath
        };
    }

    /// <summary>Port of fetchDisplayUrls: URLs shown on the public /urls page.</summary>
    public async Task<List<Url>> FetchDisplayUrlsAsync(CancellationToken ct = default)
    {
        return await _db.Urls.AsNoTracking()
            .Select(u => new Url { ShortPath = u.ShortPath, RedirectUrl = u.RedirectUrl, Deprecated = u.Deprecated })
            .ToListAsync(ct);
    }

    /// <summary>Port of fetchUrlByShortPath (used by the password-protected page).</summary>
    public async Task<Url?> FetchUrlByShortPathAsync(string shortPath, CancellationToken ct = default)
    {
        return await _db.Urls.AsNoTracking()
            .FirstOrDefaultAsync(u => u.ShortPath == shortPath, ct);
    }

    /// <summary>Port of addUrl.</summary>
    public async Task<bool> AddUrlAsync(string shortPath, string redirectUrl, CancellationToken ct = default)
    {
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
        try
        {
            await _db.Urls.Where(u => u.ShortPath == shortPath).ExecuteDeleteAsync(ct);
            InvalidateCache(shortPath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting URL");
            return false;
        }
    }
}
