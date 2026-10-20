namespace UrlShortener.Api;

// Request bodies for the API endpoints. With the snake_case JSON policy configured
// in Program.cs, wire keys like "short_path" bind to these PascalCase members.

public sealed record EmailRequest(string? Email);
public sealed record AddAdminRequest(string? Email, string? Role);
public sealed record UpdateRoleRequest(string? Email, string? Role);
public sealed record ResetPasswordRequest(string? Email, string? Password);
public sealed record SignupRequest(string? Email, string? Password, string? Role);
public sealed record SetPasswordRequest(string? Email, string? Password, string? Id, string? GithubUsername, string? GithubId);
public sealed record VerifyPasswordRequest(string? ShortPath, string? Password);
public sealed record ApiKeySimpleRequest(string? Name);
public sealed record ApiKeyFullRequest(string? Name, string? Expiration);
public sealed record DeleteUrlRequest(string? ShortPath);
