using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using System.Data.Common;
using UrlShortener.Shared.Auth;

namespace UrlShortener.Shared.Services;

/// <summary>The result of validating admin credentials.</summary>
public sealed record AuthenticatedAdmin(Guid Id, string? Email, string? Role, bool IsAdmin, bool Passset, Guid SessionStamp);

/// <summary>
/// Credential authentication for the web/admin cookie login. Port of the
/// CredentialsProvider.authorize logic in src/app/lib/auth.js, using BCrypt.Net
/// which verifies the existing $2a/$2b bcrypt hashes produced by bcryptjs.
/// </summary>
public sealed class AuthService
{
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly ILogger<AuthService> _logger;
    private readonly AuthenticationAttemptLimiter _attempts;

    public AuthService(IDbContextFactory<AppDbContext> contexts, ILogger<AuthService> logger, AuthenticationAttemptLimiter attempts)
    {
        _contexts = contexts;
        _logger = logger;
        _attempts = attempts;
    }

    /// <summary>Validates an email/password pair; returns the admin on success, else null.</summary>
    public async Task<AuthenticatedAdmin?> ValidateCredentialsAsync(string? email, string? password, CancellationToken ct = default)
        => (await AuthenticateAsync(email, password, ct)).Value;

    public async Task<ServiceResult<AuthenticatedAdmin>> AuthenticateAsync(string? email, string? password, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        email = InputValidation.Email(email);
        if (string.IsNullOrEmpty(email) || email.Length > 320 || !AdminPassword.ValidInput(password))
        {
            return ServiceResult<AuthenticatedAdmin>.Fail(401, "Invalid email or password");
        }

        using var attempt = _attempts.Begin("login", email.Trim().ToLowerInvariant());
        if (attempt is null)
            return ServiceResult<AuthenticatedAdmin>.Fail(429, AuthenticationAttemptLimiter.Error);

        Admin? user;
        try
        {
            user = await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Email != null && a.Email.Trim().ToLower() == email, ct);
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "Account storage unavailable during authentication.");
            return ServiceResult<AuthenticatedAdmin>.Fail(503, "Sign-in is temporarily unavailable. Contact the administrator.");
        }
        if (user is null || !user.Enabled)
        {
            return ServiceResult<AuthenticatedAdmin>.Fail(401, "Invalid email or password");
        }

        var passwordHash = user.EffectiveHash;
        if (string.IsNullOrEmpty(passwordHash))
        {
            return ServiceResult<AuthenticatedAdmin>.Fail(401, "Invalid email or password");
        }

        bool isValid;
        try
        {
            isValid = AdminPassword.Verify(password, passwordHash);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password verification failed for {Email}", email);
            return ServiceResult<AuthenticatedAdmin>.Fail(401, "Invalid email or password");
        }

        if (!isValid)
        {
            return ServiceResult<AuthenticatedAdmin>.Fail(401, "Invalid email or password");
        }

        var role = user.Role ?? (user.IsAdmin ? "admin" : null);
        attempt.Succeed();
        return ServiceResult<AuthenticatedAdmin>.Success(new AuthenticatedAdmin(user.Id, user.Email, role, IsAdmin: user.IsAdmin,
            Passset: user.Passset ?? false, SessionStamp: user.SessionStamp));
    }

    public static string HashPassword(string password) => AdminPassword.Hash(password);
}
