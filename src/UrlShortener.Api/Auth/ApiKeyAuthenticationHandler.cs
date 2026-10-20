using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Auth;

/// <summary>
/// Authenticates requests carrying an API key via the "X-API-Key" header or an
/// "Authorization: Bearer &lt;key&gt;" header. Port of the API-key branch of
/// verifyAuth / validateRequest. Emits an "api_key" claim on success so policies
/// can distinguish key-based callers from cookie sessions.
/// </summary>
public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly ApiKeyService _apiKeys;

    public ApiKeyAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ApiKeyService apiKeys)
        : base(options, logger, encoder)
    {
        _apiKeys = apiKeys;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var key = ExtractKey();
        if (string.IsNullOrEmpty(key))
        {
            return AuthenticateResult.NoResult(); // Let other schemes (cookie) try.
        }

        var ip = Request.Headers["x-forwarded-for"].FirstOrDefault()
                 ?? Context.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var valid = await _apiKeys.VerifyApiKeyAsync(key, ip, userAgent, Context.RequestAborted);
        if (!valid)
        {
            return AuthenticateResult.Fail("Invalid API key");
        }

        var identity = new ClaimsIdentity(new[]
        {
            new Claim("api_key", "true"),
        }, AuthConstants.ApiKeyScheme);

        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), AuthConstants.ApiKeyScheme);
        return AuthenticateResult.Success(ticket);
    }

    private string? ExtractKey()
    {
        var apiKeyHeader = Request.Headers["x-api-key"].FirstOrDefault();
        if (!string.IsNullOrEmpty(apiKeyHeader))
        {
            return apiKeyHeader;
        }

        var auth = Request.Headers.Authorization.ToString();
        if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return auth["Bearer ".Length..].Trim();
        }

        return null;
    }
}
