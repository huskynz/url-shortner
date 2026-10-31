using UrlShortener.Shared.Hosting;

namespace UrlShortener.Api;

public static class AdminExplorerCors
{
    public const string Policy = "AdminApiExplorer";

    public static void AddAdminExplorerCors(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCors(cors =>
        {
            var origin = configuration["Cors:AdminOrigin"];
            if (!string.IsNullOrWhiteSpace(origin) && !BrowserApiTrust.ValidOrigin(origin))
                throw new InvalidOperationException("Cors:AdminOrigin must be one HTTPS origin without a path, credentials, query or fragment (HTTP is allowed only on loopback).");
            cors.AddPolicy(Policy, policy =>
            {
                // No configuration means no browser origin is trusted. Never reflect
                // arbitrary Origin headers or combine wildcard origins with cookies.
                if (string.IsNullOrWhiteSpace(origin)) return;
                policy.WithOrigins(new Uri(origin).GetLeftPart(UriPartial.Authority))
                    .WithMethods("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                    .WithHeaders("Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token", "If-Match", "Idempotency-Key")
                    .WithExposedHeaders("ETag", "X-Request-Id", "Retry-After", "Location", "X-Total-Count", "X-Page", "X-Page-Size", "X-Has-Next", "Link")
                    .AllowCredentials();
            });
        });
    }
}
