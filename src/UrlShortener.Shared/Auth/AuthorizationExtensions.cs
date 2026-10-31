using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

namespace UrlShortener.Shared.Auth;

public static class AuthorizationExtensions
{
    /// <summary>
    /// Registers the authorization policies mirroring the original route guards
    /// (validateRequest / requireAdminSession / requireOwner / getToken).
    /// Pass the authentication schemes this host actually registers: the API passes
    /// both Cookies and ApiKey; the Admin app passes only Cookies. Passing none
    /// leaves policies scheme-agnostic (evaluated against the current principal).
    /// </summary>
    public static IServiceCollection AddUrlShortenerAuthorization(this IServiceCollection services, params string[] schemes)
    {
        static string? CookieRole(ClaimsPrincipal user) => user.Identities
            .FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme)
            ?.FindFirst(ClaimTypes.Role)?.Value;
        void ApplySchemes(Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder policy)
        {
            if (schemes.Length > 0)
            {
                policy.AddAuthenticationSchemes(schemes);
            }
        }

        services.AddAuthorization(options =>
        {
            options.AddPolicy(AuthConstants.SelfServicePolicy, policy =>
            {
                policy.AddAuthenticationSchemes(AuthConstants.CookieScheme);
                policy.RequireAuthenticatedUser();
            });

            // Valid API key OR an admin/owner cookie session.
            options.AddPolicy(AuthConstants.AdminOrApiKeyPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx =>
                    ctx.User.Identities.Any(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.ApiKeyScheme
                        && i.HasClaim("api_key", "true") && i.HasClaim("scope", "urls:read"))
                    || AuthConstants.IsAdminRole(CookieRole(ctx.User)));
            });

            options.AddPolicy(AuthConstants.UrlWritePolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx => AuthConstants.IsAdminRole(CookieRole(ctx.User))
                    || ctx.User.Identities.Any(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.ApiKeyScheme
                        && i.HasClaim("api_key", "true") && i.HasClaim("scope", "urls:write")));
            });

            // Admin or owner cookie session.
            options.AddPolicy(AuthConstants.AdminSessionPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx => AuthConstants.IsAdminRole(CookieRole(ctx.User)));
            });

            // Owner-only cookie session.
            options.AddPolicy(AuthConstants.OwnerSessionPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx => CookieRole(ctx.User) == AuthConstants.RoleOwner);
            });

            // Any authenticated user (cookie or api key).
            options.AddPolicy(AuthConstants.AnyUserPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAuthenticatedUser();
            });
        });

        return services;
    }
}
