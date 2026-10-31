using UrlShortener.Shared.Auth;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Options;
using UrlShortener.Shared.Hosting;

namespace UrlShortener.Admin.Services;

public static class ApiExplorerAssets
{
    public static void MapApiExplorerAssets(this IEndpointRouteBuilder app)
    {
        app.MapGet("/admin/api-config", (HttpContext http, IOptions<UrlShortenerOptions> options) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var value = options.Value.ApiBaseUrl;
            var url = BrowserApiTrust.ValidBase(value) ? value!.TrimEnd('/') : null;
            return Results.Json(new { apiBaseUrl = url });
        }).RequireAuthorization(AuthConstants.AdminSessionPolicy);

        app.MapGet("/admin/api-assets/{asset}", (string asset, HttpContext http) =>
        {
            var type = asset switch
            {
                "swagger-ui-bundle.js" or "explorer.js" => "text/javascript; charset=utf-8",
                "swagger-ui.css" or "explorer.css" => "text/css; charset=utf-8",
                "LICENSE" or "NOTICE" => "text/plain; charset=utf-8",
                _ => null
            };
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            if (type is null) return Results.NotFound();
            var stream = typeof(ApiExplorerAssets).Assembly.GetManifestResourceStream(
                "UrlShortener.Admin.Assets.SwaggerUI." + asset);
            return stream is null ? Results.NotFound() : Results.Stream(stream, type);
        }).RequireAuthorization(AuthConstants.AdminSessionPolicy);
    }
}
