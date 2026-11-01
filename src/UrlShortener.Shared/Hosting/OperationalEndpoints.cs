using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using UrlShortener.Shared.Data;

namespace UrlShortener.Shared.Hosting;

public static class OperationalEndpoints
{
    // Before HTTPS/authentication: HTTP probes must not redirect or require cookies.
    public static IApplicationBuilder UseOperationalEndpoints(this IApplicationBuilder app, string robots)
        => app.Use(async (http, next) =>
        {
            var path = http.Request.Path;
            if (path != "/health/live" && path != "/health/ready" && path != "/robots.txt")
            {
                await next(http);
                return;
            }
            http.Response.Headers.CacheControl = "no-store";
            http.Response.ContentType = "text/plain; charset=utf-8";
            if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
            {
                http.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
                http.Response.Headers.Allow = "GET, HEAD";
                return;
            }
            var text = path == "/robots.txt" ? robots : "Live\n";
            if (path == "/health/ready")
            {
                try
                {
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted);
                    timeout.CancelAfter(TimeSpan.FromSeconds(5));
                    var factory = http.RequestServices.GetRequiredService<IDbContextFactory<AppDbContext>>();
                    await using var db = await factory.CreateDbContextAsync(timeout.Token);
                    db.Database.SetCommandTimeout(3);
                    // Zero-row projections/index metadata only: no data scans/writes.
                    await SchemaCompatibility.VerifyStructureAsync(db, timeout.Token);
                    text = "Ready\n";
                }
                catch (Exception) when (!http.RequestAborted.IsCancellationRequested)
                {
                    http.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                    text = "Not ready\n";
                }
            }
            if (!HttpMethods.IsHead(http.Request.Method)) await http.Response.WriteAsync(text, http.RequestAborted);
        });

    public const string PublicRobots = "User-agent: *\nDisallow: /urls\nDisallow: /password-protected\nDisallow: /admin\nDisallow: /api/\n";
    public const string PrivateRobots = "User-agent: *\nDisallow: /\n";
}
