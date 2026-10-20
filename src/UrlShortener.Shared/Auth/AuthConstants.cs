using System.Security.Claims;

namespace UrlShortener.Shared.Auth;

/// <summary>
/// Shared authentication constants so the Admin app (which issues the cookie)
/// and the API (which can also accept it) agree on scheme, cookie, claims, and policies.
/// </summary>
public static class AuthConstants
{
    public const string CookieScheme = "Cookies";
    public const string ApiKeyScheme = "ApiKey";

    /// <summary>Cookie name used for the admin session.</summary>
    public const string CookieName = ".UrlShortener.Auth";

    /// <summary>Application name for the shared Data Protection key ring.</summary>
    public const string DataProtectionAppName = "UrlShortener";

    // Claim types
    public const string PassetClaim = "passset";

    // Roles
    public const string RoleOwner = "owner";
    public const string RoleAdmin = "admin";
    public const string RoleViewer = "viewer";

    // Authorization policies
    /// <summary>Valid API key OR an admin/owner cookie session (port of validateRequest).</summary>
    public const string AdminOrApiKeyPolicy = "AdminOrApiKey";

    /// <summary>Admin or owner cookie session (port of requireAdminSession).</summary>
    public const string AdminSessionPolicy = "AdminSession";

    /// <summary>Owner cookie session (port of requireAdminSession requireOwner).</summary>
    public const string OwnerSessionPolicy = "OwnerSession";

    /// <summary>Any authenticated cookie session (port of getToken checks).</summary>
    public const string AnyUserPolicy = "AnyUser";

    public static bool IsAdminRole(string? role) => role is RoleAdmin or RoleOwner;

    /// <summary>Reads the role from a principal (empty if none).</summary>
    public static string? GetRole(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.Role);
}
