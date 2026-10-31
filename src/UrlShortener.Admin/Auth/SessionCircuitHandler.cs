using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Server.Circuits;

namespace UrlShortener.Admin.Auth;

// Route attributes and cached UI flags are not authorization for event handlers.
// Revalidate before dispatching every event on a previously authenticated circuit.
public sealed class SessionCircuitHandler(AuthenticationStateProvider authentication) : CircuitHandler
{
    private bool _authenticatedCircuit;

    public override async Task OnCircuitOpenedAsync(Circuit circuit, CancellationToken ct)
    {
        _authenticatedCircuit = (await authentication.GetAuthenticationStateAsync()).User.Identity?.IsAuthenticated == true;
    }

    public override Func<CircuitInboundActivityContext, Task> CreateInboundActivityHandler(
        Func<CircuitInboundActivityContext, Task> next) => async context =>
    {
        if (_authenticatedCircuit && (await authentication.GetAuthenticationStateAsync()).User.Identity?.IsAuthenticated != true)
            throw new UnauthorizedAccessException("Session revoked. Sign in again.");
        await next(context);
    };
}
