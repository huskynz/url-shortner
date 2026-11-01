using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Antiforgery;
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
            var target = LoginCallback.SafeTarget(callbackUrl);
            var attempt = await auth.AuthenticateAsync(email, password);
            if (attempt.Status == 503)
                return Results.Text(attempt.Error!, statusCode: 503);
            if (attempt.Status == 429)
            {
                http.Response.Headers.RetryAfter = "300";
                return Results.Text(AuthenticationAttemptLimiter.Error, statusCode: 429);
            }
            var result = attempt.Value;
            if (!attempt.Ok || result is null)
            {
                return Results.Redirect($"/signin?error=1&callbackUrl={Uri.EscapeDataString(target)}");
            }

            var principal = CookieAuthExtensions.BuildAdminPrincipal(result.Id, result.Email, result.Role, result.Passset, result.SessionStamp);
            await http.SignInAsync(AuthConstants.CookieScheme, principal);
            return Results.LocalRedirect(target);
        });

        app.MapPost("/auth/logout", async (HttpContext http, IAntiforgery antiforgery) =>
        {
            try { await antiforgery.ValidateRequestAsync(http); }
            catch (AntiforgeryValidationException) { return Results.BadRequest(); }
            await http.SignOutAsync(AuthConstants.CookieScheme);
            return Results.Redirect("/signin");
        });
    }
}
