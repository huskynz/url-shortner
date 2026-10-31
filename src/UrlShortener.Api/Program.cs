using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using UrlShortener.Api.Auth;
using UrlShortener.Api;
using UrlShortener.Api.Endpoints;
using UrlShortener.Shared;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Hosting;

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
builder.Services.AddApiV1Runtime();
builder.Services.AddAdminExplorerCors(builder.Configuration);
builder.Services.AddHostedService<ApiV1Worker>();

var app = builder.Build();

if (args.Contains("--check-schema", StringComparer.Ordinal))
{
    Environment.ExitCode = await UrlShortener.Shared.Data.SchemaCompatibility.RunAsync(app.Services);
    return;
}

app.UseForwardedHeaders();
app.UseSecretResponsePolicies();
app.UseApiV1Errors();
app.UseOperationalEndpoints(OperationalEndpoints.PrivateRobots);
app.UseCors(AdminExplorerCors.Policy);
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapApiV1();

await app.EnsureDatabaseAsync();
app.Run();

// Exposes the entry point for isolated API integration tests.
public partial class Program { }
