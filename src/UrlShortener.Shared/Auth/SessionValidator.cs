using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;

namespace UrlShortener.Shared.Auth;

// Fresh scopes avoid cached/tracked users and sharing circuit DbContexts with
// background revalidation. Storage failures deny access, never preserve it.
public sealed class SessionValidator(IServiceScopeFactory scopes, ILogger<SessionValidator> logger)
{
    public async Task<bool> IsCurrentAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        var identity = principal.Identities.FirstOrDefault(i => i.IsAuthenticated
            && i.AuthenticationType == AuthConstants.CookieScheme);
        if (identity is null
            || !Guid.TryParse(identity.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id)
            || !Guid.TryParse(identity.FindFirst(AuthConstants.SessionStampClaim)?.Value, out var stamp))
            return false;
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var account = await db.Admins.AsNoTracking().Where(a => a.Id == id)
                .Select(a => new { a.Enabled, a.SessionStamp, a.Role, a.Email, a.Passset }).SingleOrDefaultAsync(ct);
            return account is not null && account.Enabled && account.SessionStamp == stamp
                && account.Role == identity.FindFirst(ClaimTypes.Role)?.Value
                && account.Email == identity.FindFirst(ClaimTypes.Email)?.Value
                && (account.Passset ?? false) == (identity.FindFirst(AuthConstants.PassetClaim)?.Value == "true");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "Session validation failed; denying access.");
            return false;
        }
    }
}
