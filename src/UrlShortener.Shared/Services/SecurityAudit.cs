using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed record SecurityAuditEvent(DateTimeOffset Timestamp, string ActorType, string? ActorId,
    string Action, string Target, string Outcome, int Status, string CorrelationId);

public interface ISecurityAuditSink
{
    void Write(SecurityAuditEvent entry);
}

/// <summary>Dedicated structured stream. Never receives request bodies or credentials.</summary>
public sealed class LoggingSecurityAuditSink(ILogger<LoggingSecurityAuditSink> logger) : ISecurityAuditSink
{
    public void Write(SecurityAuditEvent entry) => logger.LogInformation(new EventId(3400, "SecurityAudit"),
        "SecurityAudit {AuditEvent}", JsonSerializer.Serialize(entry));
}

public sealed class SecurityAudit(IHttpContextAccessor http, IServiceProvider services,
    ISecurityAuditSink sink, ILogger<SecurityAudit> logger, TimeProvider clock)
{
    public const string RecordedKey = "UrlShortener.SecurityAudit.Recorded";

    public async Task<T> RunAsync<T>(string action, string? target, Func<Task<T>> operation,
        ClaimsPrincipal? principal = null) where T : IServiceOutcome
    {
        var actor = principal ?? await ResolveActorAsync();
        var correlation = http.HttpContext?.TraceIdentifier ?? Guid.NewGuid().ToString("N");
        try
        {
            var result = await operation();
            Write(actor, action, target, result.Ok ? "success" : result.Status >= 500 ? "error" : "denied", result.Status, correlation);
            return result;
        }
        catch (OperationCanceledException)
        {
            Write(actor, action, target, "cancelled", 499, correlation);
            throw;
        }
        catch (Exception)
        {
            // Do not log exceptions/inputs: provider messages can contain secrets.
            Write(actor, action, target, "error", 500, correlation);
            throw;
        }
    }

    private async Task<ClaimsPrincipal> ResolveActorAsync()
    {
        // Circuit identity comes from Blazor's server-owned provider, not a stale
        // HTTP accessor or client-supplied actor ID. API uses authenticated claims.
        var provider = services.GetService<AuthenticationStateProvider>();
        if (provider is not null)
        {
            try { return (await provider.GetAuthenticationStateAsync()).User; }
            catch (InvalidOperationException) { /* HTTP request outside component scope */ }
        }
        return http.HttpContext?.User ?? new ClaimsPrincipal();
    }

    public void Write(ClaimsPrincipal actor, string action, string? target, string outcome, int status, string correlation)
    {
        var cookie = actor.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme);
        var key = actor.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.ApiKeyScheme);
        // Account/key management is cookie-owned. For URL writes, a viewer cookie
        // must not be attributed as the authority when an API key grants the write.
        var identity = action.StartsWith("url.", StringComparison.Ordinal)
            && cookie?.FindFirst(ClaimTypes.Role)?.Value is not ("owner" or "admin")
            ? key ?? cookie : cookie ?? key;
        identity ??= actor.Identities.FirstOrDefault(i => i.IsAuthenticated);
        var type = identity is null ? "anonymous" : identity.AuthenticationType == AuthConstants.ApiKeyScheme ? "api-key" : "account";
        var id = Guid.TryParse(identity?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var guid) ? guid.ToString() : null;
        var entry = new SecurityAuditEvent(clock.GetUtcNow(), type, id, action,
            TargetId(target), outcome, status, correlation.Length <= 128 ? correlation : correlation[..128]);
        if (http.HttpContext is { } context) context.Items[RecordedKey] = true;
        try { sink.Write(entry); }
        catch (Exception)
        {
            // A post-commit sink failure must not turn a completed mutation into a
            // retryable application error. Alert separately; no sensitive exception.
            try { logger.LogCritical(new EventId(3401, "SecurityAuditWriteFailed"),
                "Security audit sink failed. Mutation outcome {Outcome}; correlation {CorrelationId}", outcome, entry.CorrelationId); }
            catch (Exception) { /* Never mask the actual operation outcome. */ }
        }
    }

    // Only pseudonymous targets leave the service. No destinations, emails, names,
    // submitted IDs or reset/key/password material are passed to the log sink.
    public static string TargetId(string? value) => "target:" + Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(value ?? "unspecified")));
}
