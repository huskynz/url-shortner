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
    public bool VisitQueueConsumerEnabled { get; set; }

    /// <summary>Table holding shortened URLs (was SUPABASE_DB_NAME, default "urls").</summary>
    public string UrlsTable { get; set; } = "urls";

    /// <summary>Table holding admin users (was ADMINS_DB, default "github_admins").</summary>
    public string AdminsTable { get; set; } = "github_admins";

    /// <summary>Table holding API keys (was APIKEY_DB, default "api_keys").</summary>
    public string ApiKeysTable { get; set; } = "api_keys";

    /// <summary>
    /// Legacy compatibility setting; admission always uses current database state.
    /// </summary>
    public int RedirectCacheTtlSeconds { get; set; }

    /// <summary>Short-lived cache TTL for admin/role lookups in seconds (was the 30s Supabase map cache).</summary>
    public int AdminCacheTtlSeconds { get; set; } = 30;

    /// <summary>Legacy compatibility setting; analytics now aggregates all input visits in SQL.</summary>
    public int AnalyticsMaxRows { get; set; } = 5000;

    /// <summary>Legacy compatibility setting; analytics now aggregates all input visits in SQL.</summary>
    public int AnalyticsBatchSize { get; set; } = 1000;

    /// <summary>Deployment environment label surfaced in the UI (was NEXT_PUBLIC_ENV).</summary>
    public string Environment { get; set; } = "unknown";

    /// <summary>Version label surfaced in the UI (was NEXT_PUBLIC_Version_Number).</summary>
    public string VersionNumber { get; set; } = "unknown";

    /// <summary>Logo URL used across the UIs (was NEXT_PUBLIC_LOGO_URL).</summary>
    public string LogoUrl { get; set; } = "https://serv.husky.nz/logo/default.png";

    /// <summary>Canonical Public origin/path base; required for Admin copy actions.</summary>
    public string? PublicBaseUrl { get; set; }
    /// <summary>Trusted API base URL for Admin explorer execution; empty keeps it browse-only.</summary>
    public string? ApiBaseUrl { get; set; }
}
