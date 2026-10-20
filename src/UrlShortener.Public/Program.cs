using UrlShortener.Public.Components;
using UrlShortener.Shared;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddUrlShortenerCore(builder.Configuration);
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

// Forwarded headers are enabled via ASPNETCORE_FORWARDEDHEADERS_ENABLED (Dockerfile),
// matching the main site; behind Cloudflare the scheme is already https so this no-ops.
app.UseHttpsRedirection();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

await app.EnsureDatabaseAsync();
app.Run();
