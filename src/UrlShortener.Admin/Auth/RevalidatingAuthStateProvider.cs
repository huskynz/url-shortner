using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Server;
using UrlShortener.Shared.Auth;

namespace UrlShortener.Admin.Auth;

// ServerAuthenticationStateProvider receives the validated principal from the
// server circuit host. Never rebuild identities from client/persisted claims.
public sealed class RevalidatingAuthStateProvider(ILoggerFactory logger, SessionValidator validator)
    : RevalidatingServerAuthenticationStateProvider(logger)
{
    protected override TimeSpan RevalidationInterval => TimeSpan.FromSeconds(30);

    protected override Task<bool> ValidateAuthenticationStateAsync(AuthenticationState state, CancellationToken ct) =>
        validator.IsCurrentAsync(state.User, ct);

    public override async Task<AuthenticationState> GetAuthenticationStateAsync()
    {
        var state = await base.GetAuthenticationStateAsync();
        if (state.User.Identity?.IsAuthenticated == true && !await validator.IsCurrentAsync(state.User))
        {
            state = new AuthenticationState(new ClaimsPrincipal(new ClaimsIdentity()));
            SetAuthenticationState(Task.FromResult(state));
        }
        return state;
    }
}
