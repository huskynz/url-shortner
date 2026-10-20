using System.Security.Claims;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using UrlShortener.Shared.Auth;

namespace UrlShortener.Admin.Auth;

/// <summary>
/// Flows the cookie-authenticated user from the initial HTTP request into the
/// interactive Blazor Server circuit. During prerender it reads HttpContext.User;
/// it persists the essential claims so the interactive circuit can rebuild the
/// principal (there is no HttpContext once the SignalR circuit is running).
/// </summary>
public sealed class PersistingAuthStateProvider : AuthenticationStateProvider, IDisposable
{
    private sealed record UserRecord(string Id, string? Email, string? Role, bool Passset);

    private readonly PersistentComponentState _state;
    private readonly PersistingComponentStateSubscription _subscription;
    private readonly IHttpContextAccessor _httpContextAccessor;

    private Task<AuthenticationState> _authenticationStateTask;

    public PersistingAuthStateProvider(PersistentComponentState state, IHttpContextAccessor httpContextAccessor)
    {
        _state = state;
        _httpContextAccessor = httpContextAccessor;

        var principal = BuildInitialPrincipal();
        _authenticationStateTask = Task.FromResult(new AuthenticationState(principal));

        _subscription = state.RegisterOnPersisting(PersistAsync, RenderMode.InteractiveServer);
    }

    public override Task<AuthenticationState> GetAuthenticationStateAsync() => _authenticationStateTask;

    private ClaimsPrincipal BuildInitialPrincipal()
    {
        // Prerender / SSR: the cookie principal is on HttpContext.
        var httpUser = _httpContextAccessor.HttpContext?.User;
        if (httpUser?.Identity?.IsAuthenticated == true)
        {
            return httpUser;
        }

        // Interactive circuit: restore from persisted state.
        if (_state.TryTakeFromJson<UserRecord>("auth", out var record) && record is not null)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, record.Id),
                new(AuthConstants.PassetClaim, record.Passset ? "true" : "false"),
            };
            if (!string.IsNullOrEmpty(record.Email)) claims.Add(new Claim(ClaimTypes.Email, record.Email));
            if (!string.IsNullOrEmpty(record.Role)) claims.Add(new Claim(ClaimTypes.Role, record.Role));
            return new ClaimsPrincipal(new ClaimsIdentity(claims, AuthConstants.CookieScheme));
        }

        return new ClaimsPrincipal(new ClaimsIdentity());
    }

    private Task PersistAsync()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated == true)
        {
            var id = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(id))
            {
                _state.PersistAsJson("auth", new UserRecord(
                    id,
                    user.FindFirstValue(ClaimTypes.Email),
                    user.FindFirstValue(ClaimTypes.Role),
                    user.FindFirstValue(AuthConstants.PassetClaim) == "true"));
            }
        }
        return Task.CompletedTask;
    }

    public void Dispose() => _subscription.Dispose();
}
