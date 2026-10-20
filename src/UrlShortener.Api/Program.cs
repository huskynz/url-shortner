using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using UrlShortener.Api.Auth;
using UrlShortener.Api.Endpoints;
using UrlShortener.Shared;
using UrlShortener.Shared.Auth;

var builder = WebApplication.CreateBuilder(args);

// Shared data layer + services (EF Core / Postgres, caching, business services).
builder.Services.AddUrlShortenerCore(builder.Configuration);

// snake_case JSON to match the original Supabase/Next.js response shape.
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// Authentication: API key (X-API-Key / Bearer) plus the shared admin cookie.
builder.Services.AddSharedDataProtection(builder.Configuration);
builder.Services
    .AddAuthentication(AuthConstants.ApiKeyScheme)
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(AuthConstants.ApiKeyScheme, _ => { })
    .AddSharedCookie(builder.Configuration);

builder.Services.AddUrlShortenerAuthorization(AuthConstants.CookieScheme, AuthConstants.ApiKeyScheme);

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapAdminUrls();
app.MapAnalytics();
app.MapApiKeys();
app.MapAdminManagement();
app.MapPublicApi();

await app.EnsureDatabaseAsync();
app.Run();
