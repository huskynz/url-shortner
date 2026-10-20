using Microsoft.AspNetCore.Mvc;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

/// <summary>
/// Public API endpoints: /api/verify-password, /api/status, /api/robots.txt.
/// Ports verify-password/route.js, status/route.js, and robots.txt.
/// </summary>
public static class PublicApiEndpoints
{
    private static readonly Lazy<string> StatusText = new(() =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "status-art.txt");
        var art = File.Exists(path) ? File.ReadAllText(path) : "This HuskyNZ Site is responding to your request!";
        return "\n" + art + "\n";
    });

    private const string RobotsTxt =
        "User-agent: *\n" +
        "Allow: /\n\n" +
        "# Disallow admin routes\n" +
        "Disallow: /admin\n" +
        "Disallow: /api/*\n" +
        "Disallow: /urls\n";

    public static void MapPublicApi(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/verify-password", async ([FromBody] VerifyPasswordRequest body, UrlAdminService svc, CancellationToken ct) =>
        {
            var result = await svc.VerifyPasswordAsync(body.ShortPath, body.Password, ct);
            return result.Ok
                ? Results.Json(new { success = true, redirect_url = result.Value })
                : Results.Json(new { error = result.Error }, statusCode: result.Status);
        });

        app.MapGet("/api/status", () =>
            Results.Text(StatusText.Value, "text/plain; charset=utf-8"));

        app.MapGet("/api/robots.txt", () =>
            Results.Text(RobotsTxt, "text/plain; charset=utf-8"));
    }
}
