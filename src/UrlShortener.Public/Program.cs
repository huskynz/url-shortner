using UrlShortener.Public.Components;
using UrlShortener.Shared;
using UrlShortener.Shared.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddUrlShortenerCore(builder.Configuration);
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

if (args.Contains("--check-schema", StringComparer.Ordinal))
{
    Environment.ExitCode = await UrlShortener.Shared.Data.SchemaCompatibility.RunAsync(app.Services);
    return;
}

app.UseForwardedHeaders();
app.UseOperationalEndpoints(OperationalEndpoints.PublicRobots);
// A page view is one successful HTTP GET, not each component lifecycle instance.
// Hydration/reconnect uses /_blazor and never fabricates an unknown visitor here.
app.Use(async (http, next) =>
{
    var listing = HttpMethods.IsGet(http.Request.Method)
        && string.Equals(http.Request.Path.Value?.TrimEnd('/'), "/urls", StringComparison.OrdinalIgnoreCase);
    await next(http);
    if (listing && http.Response.StatusCode is >= 200 and < 300)
    {
        try
        {
            await http.RequestServices.GetRequiredService<UrlShortener.Shared.Services.VisitLogger>()
                .LogUserDataAsync("urls", http.Connection.RemoteIpAddress?.ToString(),
                    http.Request.Headers.UserAgent.ToString(), http.RequestAborted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ListingVisits")
                .LogWarning("Listing visit enqueue failed; page response preserved.");
        }
    }
});

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

// Scheme/client identity come only from explicitly configured trusted proxies.
app.UseHttpsRedirection();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

await app.EnsureDatabaseAsync();
app.Run();

public partial class Program { }
