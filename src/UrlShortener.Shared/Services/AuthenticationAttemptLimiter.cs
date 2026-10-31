using Microsoft.AspNetCore.Http;

namespace UrlShortener.Shared.Services;

/// <summary>One gate for API, HTTP login and in-process interactive submissions.</summary>
public sealed class AuthenticationAttemptLimiter(RateLimiter limiter, IHttpContextAccessor context)
{
    public const long WindowMs = 300000;
    public const int TargetLimit = 10;
    public const int ClientLimit = 30;
    public const string Error = "Too many authentication attempts. Try again in five minutes.";

    // Capture the trusted peer when this request/circuit-scoped service is created.
    // Never substitute caller-supplied forwarding headers or a random circuit ID.
    private readonly string _client = context.HttpContext?.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    public bool Allow(string operation, string target)
    {
        return Begin(operation, target) is not null;
    }

    public RateLimiter.Reservation? Begin(string operation, string target) => limiter.Reserve(
        ($"auth:client:{_client}", ClientLimit, WindowMs),
        ($"auth:{operation}:client-target:{_client}:{target}", TargetLimit, WindowMs));
}
