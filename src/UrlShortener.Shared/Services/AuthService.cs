using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;

namespace UrlShortener.Shared.Services;

/// <summary>The result of validating admin credentials.</summary>
public sealed record AuthenticatedAdmin(Guid Id, string? Email, string? Role, bool IsAdmin, bool Passset);

/// <summary>
/// Credential authentication for the web/admin cookie login. Port of the
/// CredentialsProvider.authorize logic in src/app/lib/auth.js, using BCrypt.Net
/// which verifies the existing $2a/$2b bcrypt hashes produced by bcryptjs.
/// </summary>
public sealed class AuthService
{
    private readonly AppDbContext _db;
    private readonly ILogger<AuthService> _logger;

    public AuthService(AppDbContext db, ILogger<AuthService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Validates an email/password pair; returns the admin on success, else null.</summary>
    public async Task<AuthenticatedAdmin?> ValidateCredentialsAsync(string? email, string? password, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            return null;
        }

        var user = await _db.Admins.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Email == email, ct);
        if (user is null)
        {
            return null;
        }

        var passwordHash = user.EffectiveHash;
        if (string.IsNullOrEmpty(passwordHash))
        {
            return null;
        }

        bool isValid;
        try
        {
            isValid = BCrypt.Net.BCrypt.Verify(password, passwordHash);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password verification failed for {Email}", email);
            return null;
        }

        if (!isValid)
        {
            return null;
        }

        var role = user.Role ?? (user.IsAdmin ? "admin" : null);
        return new AuthenticatedAdmin(user.Id, user.Email, role, IsAdmin: true, Passset: user.Passset ?? false);
    }

    public static string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, 10);
}
