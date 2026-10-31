namespace UrlShortener.Api;

public static class ApiResponsePolicies
{
    public static IApplicationBuilder UseSecretResponsePolicies(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        var path = http.Request.Path.Value?.TrimEnd('/') ?? "";
        // Runs before authentication/binding: denied and malformed issuance requests
        // must be no-store too, not just successfully generated secrets.
        if (path.StartsWith("/api/v1/", StringComparison.Ordinal))
            http.Response.OnStarting(() =>
            {
                http.Response.Headers.CacheControl = "no-store";
                return Task.CompletedTask;
            });
        await next(http);
    });
}
