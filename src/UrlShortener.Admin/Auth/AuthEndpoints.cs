using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Services;

namespace UrlShortener.Admin.Auth;

/// <summary>
/// Cookie sign-in/out endpoints. Sign-in must happen on a real HTTP request
/// (not over the SignalR circuit), so the /signin page posts here.
/// </summary>
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/auth/login", async (
            HttpContext http,
            [FromForm] string? email,
            [FromForm] string? password,
            [FromForm] string? callbackUrl,
            AuthService auth) =>
        {
            var target = string.IsNullOrEmpty(callbackUrl) ? "/admin/dashboard" : callbackUrl;
            var result = await auth.ValidateCredentialsAsync(email, password);
            if (result is null)
            {
                return Results.Redirect($"/signin?error=1&callbackUrl={Uri.EscapeDataString(target)}");
            }

            var principal = CookieAuthExtensions.BuildAdminPrincipal(result.Id, result.Email, result.Role, result.Passset);
            await http.SignInAsync(AuthConstants.CookieScheme, principal);
            return Results.Redirect(target);
        }).DisableAntiforgery();

        app.MapPost("/auth/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(AuthConstants.CookieScheme);
            return Results.Redirect("/signin");
        }).DisableAntiforgery();
    }
}
