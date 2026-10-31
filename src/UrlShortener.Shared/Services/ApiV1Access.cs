using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Data;

namespace UrlShortener.Shared.Services;

public static class ApiV1Access
{
    public static bool CookieAdmin(ClaimsPrincipal user) => user.Identities.Any(i => i.IsAuthenticated
        && i.AuthenticationType == AuthConstants.CookieScheme && AuthConstants.IsAdminRole(i.FindFirst(ClaimTypes.Role)?.Value));
    public static bool Allows(ClaimsPrincipal user, string scope) => CookieAdmin(user) || user.Identities.Any(i => i.IsAuthenticated
        && i.AuthenticationType == AuthConstants.ApiKeyScheme && i.HasClaim("scope", scope));
    public static bool Private(ClaimsPrincipal user) => Allows(user, "urls:private");
    public static string Actor(ClaimsPrincipal user)
    {
        // An admin cookie grants the complete operator permissions; otherwise use
        // the key that actually grants the request, not a viewer cookie.
        var identity = user.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme
                && AuthConstants.IsAdminRole(i.FindFirst(ClaimTypes.Role)?.Value))
            ?? user.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.ApiKeyScheme)
            ?? user.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme);
        ApiV1Links.Require(identity is not null && Guid.TryParse(identity.FindFirst(ClaimTypes.NameIdentifier)?.Value, out _),
            401, "identity_required", "Authenticated immutable caller identity required.");
        return (identity!.AuthenticationType == AuthConstants.ApiKeyScheme ? "key:" : "user:") + identity.FindFirst(ClaimTypes.NameIdentifier)!.Value;
    }

    public static async Task<bool> Current(AppDbContext db, string actor, string scope, bool needsPrivate, CancellationToken ct)
    {
        var parts = actor.Split(':');
        if (parts.Length != 2 || !Guid.TryParse(parts[1], out var id)) return false;
        if (parts[0] == "user")
            return await db.Admins.AnyAsync(a => a.Id == id && a.Enabled && (a.Role == "owner" || a.Role == "admin"), ct);
        if (parts[0] != "key") return false;
        var now = DateTimeOffset.UtcNow;
        var key = await db.ApiKeys.AsNoTracking().SingleOrDefaultAsync(k => k.Id == id && k.IsActive
            && (k.ExpiresAt == null || k.ExpiresAt > now), ct);
        var scopes = key?.Scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];
        return scopes.Contains("urls:write") && scopes.Contains(scope) && (!needsPrivate || scopes.Contains("urls:private"));
    }
}
