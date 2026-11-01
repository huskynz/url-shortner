using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Server.Circuits;
using UrlShortener.Admin.Auth;
using UrlShortener.Admin.Components;
using UrlShortener.Shared;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Hosting;
using UrlShortener.Api;
using UrlShortener.Admin.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddUrlShortenerCore(builder.Configuration);
builder.Services.AddHttpContextAccessor();

// Cookie authentication (shared with the API via a common Data Protection key ring).
builder.Services.AddSharedDataProtection(builder.Configuration);
builder.Services.AddAuthentication(AuthConstants.CookieScheme)
    .AddSharedCookie(builder.Configuration);
builder.Services.AddUrlShortenerAuthorization(AuthConstants.CookieScheme);

// Flow the cookie identity into the interactive Blazor circuit.
builder.Services.AddScoped<AuthenticationStateProvider, RevalidatingAuthStateProvider>();
builder.Services.AddScoped<CircuitHandler, SessionCircuitHandler>();
builder.Services.AddScoped<UrlShortener.Admin.Services.AdminActionGuard>();
builder.Services.AddCascadingAuthenticationState();

var app = builder.Build();

if (args.Contains("--check-schema", StringComparer.Ordinal))
{
    Environment.ExitCode = await UrlShortener.Shared.Data.SchemaCompatibility.RunAsync(app.Services);
    return;
}

app.UseForwardedHeaders();
app.UseOperationalEndpoints(OperationalEndpoints.PrivateRobots);

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

// Scheme/client identity come only from explicitly configured trusted proxies.
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (http, next) =>
{
    if (http.Request.Path.StartsWithSegments("/admin/api") || http.Request.Path.StartsWithSegments("/admin/api-assets"))
        http.Response.Headers.CacheControl = "no-store";
    await next(http);
});
app.UseAntiforgery();

app.MapStaticAssets();
app.MapAuthEndpoints();
app.MapApiExplorerAssets();
// The specification is generated from the API assembly without contacting it.
// It is never placed in wwwroot or mapped by the API/Public hosts.
app.MapGet("/openapi/v1.json", async (HttpContext http) =>
{
    http.Response.Headers.CacheControl = "no-store";
    return Results.Text(await ApiSpecification.Generate(http.RequestAborted), "application/json");
}).RequireAuthorization(AuthConstants.AdminSessionPolicy);
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

await app.EnsureDatabaseAsync();
app.Run();

public partial class Program { }
