using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

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
        void ApplySchemes(Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder policy)
        {
            if (schemes.Length > 0)
            {
                policy.AddAuthenticationSchemes(schemes);
            }
        }

        services.AddAuthorization(options =>
        {
            // Valid API key OR an admin/owner cookie session.
            options.AddPolicy(AuthConstants.AdminOrApiKeyPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx =>
                    ctx.User.HasClaim(c => c.Type == "api_key" && c.Value == "true")
                    || AuthConstants.IsAdminRole(AuthConstants.GetRole(ctx.User)));
            });

            // Admin or owner cookie session.
            options.AddPolicy(AuthConstants.AdminSessionPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx => AuthConstants.IsAdminRole(AuthConstants.GetRole(ctx.User)));
            });

            // Owner-only cookie session.
            options.AddPolicy(AuthConstants.OwnerSessionPolicy, policy =>
            {
                ApplySchemes(policy);
                policy.RequireAssertion(ctx => AuthConstants.GetRole(ctx.User) == AuthConstants.RoleOwner);
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
