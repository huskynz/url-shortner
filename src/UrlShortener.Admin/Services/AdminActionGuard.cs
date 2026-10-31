using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Services;

namespace UrlShortener.Admin.Services;

/// <summary>Revalidate circuit identity for every workspace read/write, not just
/// the page's initial authorization. Never trust role or actor supplied by a form.</summary>
public sealed class AdminActionGuard(AuthenticationStateProvider authentication, SessionValidator sessions, SecurityAudit audit)
{
    public Task<T> RunOwner<T>(string action, string target, Func<ClaimsPrincipal, Task<T>> operation)
        => Run(action, target, user =>
        {
            var owner = user.Identities.Any(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme
                && i.FindFirst(ClaimTypes.Role)?.Value == "owner");
            if (!owner) throw new ApiFault(403, "owner_required", "Owner access required.");
            return operation(user);
        });

    public async Task<T> Run<T>(string action, string target, Func<ClaimsPrincipal, Task<T>> operation, bool mutation = false)
    {
        var user = (await authentication.GetAuthenticationStateAsync()).User;
        try
        {
            if (!await sessions.IsCurrentAsync(user)) throw new ApiFault(401, "session_expired", "Your session has changed. Sign in again.");
            if (!ApiV1Access.CookieAdmin(user)) throw new ApiFault(403, "admin_required", "Administrator access required.");
            var result = await operation(user);
            if (mutation) audit.Write(user, action, target, "success", 200, Guid.NewGuid().ToString("N"));
            return result;
        }
        catch (ApiFault ex)
        {
            if (mutation) audit.Write(user, action, target, ex.Status >= 500 ? "error" : "denied", ex.Status, Guid.NewGuid().ToString("N"));
            throw;
        }
        catch (Exception)
        {
            if (mutation) audit.Write(user, action, target, "error", 500, Guid.NewGuid().ToString("N"));
            throw;
        }
    }
}
