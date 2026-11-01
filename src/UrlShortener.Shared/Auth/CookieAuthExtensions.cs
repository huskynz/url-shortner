using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace UrlShortener.Shared.Auth;

public static class CookieAuthExtensions
{
    /// <summary>
    /// Configures the shared Data Protection key ring so the cookie issued by the
    /// Admin app can also be read by the API. Set "DataProtection:KeyRingPath" to a
    /// directory shared between the services (a mounted volume in k8s/compose).
    /// </summary>
    public static IServiceCollection AddSharedDataProtection(this IServiceCollection services, IConfiguration configuration)
    {
        var builder = services.AddDataProtection().SetApplicationName(AuthConstants.DataProtectionAppName);
        var keyRingPath = configuration["DataProtection:KeyRingPath"];
        if (!string.IsNullOrWhiteSpace(keyRingPath))
        {
            Directory.CreateDirectory(keyRingPath);
            builder.PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));
        }
        return services;
    }

    /// <summary>Adds the shared cookie authentication scheme used for admin sessions.</summary>
    public static AuthenticationBuilder AddSharedCookie(this AuthenticationBuilder builder, IConfiguration configuration)
    {
        var cookieDomain = configuration["Auth:CookieDomain"];
        return builder.AddCookie(AuthConstants.CookieScheme, options =>
        {
            options.Cookie.Name = AuthConstants.CookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = configuration.GetValue("Auth:RequireSecureCookies", true)
                ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
            if (!string.IsNullOrWhiteSpace(cookieDomain))
            {
                options.Cookie.Domain = cookieDomain;
            }
            options.LoginPath = "/signin";
            options.AccessDeniedPath = "/access-denied";
            options.ExpireTimeSpan = TimeSpan.FromDays(30);
            options.SlidingExpiration = true;
            options.Events.OnValidatePrincipal = async context =>
            {
                var validator = context.HttpContext.RequestServices.GetRequiredService<SessionValidator>();
                if (!await validator.IsCurrentAsync(context.Principal!, context.HttpContext.RequestAborted))
                {
                    context.RejectPrincipal();
                    await context.HttpContext.SignOutAsync(AuthConstants.CookieScheme);
                }
            };
        });
    }

    /// <summary>Builds the claims principal stored in the admin session cookie.</summary>
    public static ClaimsPrincipal BuildAdminPrincipal(Guid id, string? email, string? role, bool passset, Guid sessionStamp)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, id.ToString()),
            new(AuthConstants.PassetClaim, passset ? "true" : "false"),
            new(AuthConstants.SessionStampClaim, sessionStamp.ToString()),
        };
        if (!string.IsNullOrEmpty(email)) claims.Add(new Claim(ClaimTypes.Email, email));
        if (!string.IsNullOrEmpty(role)) claims.Add(new Claim(ClaimTypes.Role, role));

        var identity = new ClaimsIdentity(claims, AuthConstants.CookieScheme);
        return new ClaimsPrincipal(identity);
    }
}
