namespace UrlShortener.Shared.Options;

/// <summary>
/// Central configuration for the URL shortener, replacing the environment
/// variables the original Next.js app relied on (SUPABASE_DB_NAME, ADMINS_DB,
/// APIKEY_DB, REDIS_REDIRECT_TTL, ADMIN_ANALYTICS_*, NEXT_PUBLIC_*).
/// Bind from the "UrlShortener" configuration section.
/// </summary>
public sealed class UrlShortenerOptions
{
    public const string SectionName = "UrlShortener";

    /// <summary>Table holding shortened URLs (was SUPABASE_DB_NAME, default "urls").</summary>
    public string UrlsTable { get; set; } = "urls";

    /// <summary>Table holding admin users (was ADMINS_DB, default "github_admins").</summary>
    public string AdminsTable { get; set; } = "github_admins";

    /// <summary>Table holding API keys (was APIKEY_DB, default "api_keys").</summary>
    public string ApiKeysTable { get; set; } = "api_keys";

    /// <summary>
    /// Redirect cache TTL in seconds. 0 (default) disables caching so link changes are
    /// instant; a positive value enables a short in-process cache on hot paths.
    /// </summary>
    public int RedirectCacheTtlSeconds { get; set; }

    /// <summary>Short-lived cache TTL for admin/role lookups in seconds (was the 30s Supabase map cache).</summary>
    public int AdminCacheTtlSeconds { get; set; } = 30;

    /// <summary>Max rows pulled when computing analytics (was ADMIN_ANALYTICS_MAX_ROWS).</summary>
    public int AnalyticsMaxRows { get; set; } = 5000;

    /// <summary>Batch size for analytics paging (was ADMIN_ANALYTICS_BATCH_SIZE).</summary>
    public int AnalyticsBatchSize { get; set; } = 1000;

    /// <summary>Deployment environment label surfaced in the UI (was NEXT_PUBLIC_ENV).</summary>
    public string Environment { get; set; } = "unknown";

    /// <summary>Version label surfaced in the UI (was NEXT_PUBLIC_Version_Number).</summary>
    public string VersionNumber { get; set; } = "unknown";

    /// <summary>Logo URL used across the UIs (was NEXT_PUBLIC_LOGO_URL).</summary>
    public string LogoUrl { get; set; } = "https://serv.husky.nz/logo/default.png";
}
