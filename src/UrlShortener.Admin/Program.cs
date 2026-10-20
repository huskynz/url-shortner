using Microsoft.AspNetCore.Components.Authorization;
using UrlShortener.Admin.Auth;
using UrlShortener.Admin.Components;
using UrlShortener.Shared;
using UrlShortener.Shared.Auth;

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
builder.Services.AddScoped<AuthenticationStateProvider, PersistingAuthStateProvider>();
builder.Services.AddCascadingAuthenticationState();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

// Forwarded headers via ASPNETCORE_FORWARDEDHEADERS_ENABLED (Dockerfile), like the main site.
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapAuthEndpoints();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

await app.EnsureDatabaseAsync();
app.Run();
