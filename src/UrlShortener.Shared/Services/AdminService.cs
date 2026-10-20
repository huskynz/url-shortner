using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

/// <summary>
/// Admin-user management. Ports src/app/api/admin-management/route.js,
/// api/auth/signup, api/auth/set-password, and admin lookups from lib/auth.js.
/// </summary>
public sealed class AdminService
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _adminTtl;
    private readonly ILogger<AdminService> _logger;

    public AdminService(AppDbContext db, IMemoryCache cache, IOptions<UrlShortenerOptions> options, ILogger<AdminService> logger)
    {
        _db = db;
        _cache = cache;
        _adminTtl = TimeSpan.FromSeconds(options.Value.AdminCacheTtlSeconds);
        _logger = logger;
    }

    // ---- Cached lookups (used by role checks / auth) ----

    public Task<Admin?> GetAdminByIdAsync(Guid id, CancellationToken ct = default) =>
        _cache.GetOrCreateAsync($"admin-id-{id}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = _adminTtl;
            return _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        })!;

    public Task<Admin?> GetAdminByEmailAsync(string email, CancellationToken ct = default) =>
        _cache.GetOrCreateAsync($"admin-email-{email.ToLowerInvariant()}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = _adminTtl;
            return _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Email == email, ct);
        })!;

    /// <summary>Resolves the effective role for an admin id, honoring the cache.</summary>
    public async Task<string?> ResolveRoleAsync(Guid id, CancellationToken ct = default)
    {
        var admin = await GetAdminByIdAsync(id, ct);
        return admin?.Role ?? (admin is not null ? "admin" : null);
    }

    // ---- Management operations (owner-gated at the callsite) ----

    public async Task<List<Admin>> ListAdminsAsync(CancellationToken ct = default) =>
        await _db.Admins.AsNoTracking().OrderByDescending(a => a.CreatedAt).ToListAsync(ct);

    public async Task<ServiceResult> AddAdminAsync(string? email, string? role, CancellationToken ct = default)
    {
        var normalizedEmail = email?.ToLowerInvariant().Trim();
        if (string.IsNullOrEmpty(normalizedEmail))
        {
            return ServiceResult.Fail(400, "Email is required");
        }

        var adminRole = role == "owner" ? "owner" : role == "viewer" ? "viewer" : "admin";

        var exists = await _db.Admins.AsNoTracking().AnyAsync(a => a.Email == normalizedEmail, ct);
        if (exists)
        {
            return ServiceResult.Fail(400, "Admin already exists");
        }

        _db.Admins.Add(new Admin { Id = Guid.NewGuid(), Email = normalizedEmail, Role = adminRole });
        await _db.SaveChangesAsync(ct);
        return ServiceResult.Success();
    }

    public async Task<ServiceResult> RemoveAdminAsync(string? email, CancellationToken ct = default)
    {
        var normalizedEmail = email?.ToLowerInvariant();
        if (string.IsNullOrEmpty(normalizedEmail))
        {
            return ServiceResult.Fail(400, "Email required");
        }

        await _db.Admins.Where(a => a.Email == normalizedEmail).ExecuteDeleteAsync(ct);
        return ServiceResult.Success();
    }

    public async Task<ServiceResult> UpdateRoleAsync(string? email, string? role, CancellationToken ct = default)
    {
        var normalizedEmail = email?.ToLowerInvariant();
        var adminRole = role is "owner" or "admin" or "viewer" ? role : null;
        if (adminRole is null)
        {
            return ServiceResult.Fail(400, "Invalid role");
        }

        await _db.Admins.Where(a => a.Email == normalizedEmail)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Role, adminRole), ct);
        return ServiceResult.Success();
    }

    /// <summary>Owner reset of another admin's password (PATCH /api/admin-management).</summary>
    public async Task<ServiceResult> ResetPasswordAsync(string? email, string? password, CancellationToken ct = default)
    {
        var normalizedEmail = email?.ToLowerInvariant().Trim();
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        var hashed = AuthService.HashPassword(password);
        await _db.Admins.Where(a => a.Email == normalizedEmail)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.Passset, true)
                .SetProperty(a => a.PasswordHash, hashed), ct);
        return ServiceResult.Success();
    }

    /// <summary>Create a new admin account with a password (POST /api/auth/signup).</summary>
    public async Task<ServiceResult> SignupAsync(string? email, string? password, string? role, CancellationToken ct = default)
    {
        var normalizedEmail = email?.ToLowerInvariant().Trim();
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        var pickedRole = role == "owner" ? "owner" : role == "admin" ? "admin" : "viewer";

        var exists = await _db.Admins.AsNoTracking().AnyAsync(a => a.Email == normalizedEmail, ct);
        if (exists)
        {
            return ServiceResult.Fail(400, "Email already registered");
        }

        _db.Admins.Add(new Admin
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Role = pickedRole,
            PasswordHash = AuthService.HashPassword(password)
        });
        await _db.SaveChangesAsync(ct);
        return ServiceResult.Success();
    }

    /// <summary>Create a one-time password-set token (POST /api/admin-management/create-password-token).</summary>
    public async Task<ServiceResult<string>> CreatePasswordTokenAsync(string? email, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(email))
        {
            return ServiceResult<string>.Fail(400, "Email is required");
        }

        var token = Guid.NewGuid().ToString();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            Email = email,
            Token = token,
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(24),
            Used = false
        });
        await _db.SaveChangesAsync(ct);
        return ServiceResult<string>.Success(token);
    }

    /// <summary>Set an admin's email + password by identifier (POST /api/auth/set-password).</summary>
    public async Task<ServiceResult> SetPasswordAsync(string? email, string? password, string? id, string? githubUsername, string? githubId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        Admin? admin = null;
        if (!string.IsNullOrEmpty(id) && Guid.TryParse(id, out var guid))
        {
            admin = await _db.Admins.FirstOrDefaultAsync(a => a.Id == guid, ct);
        }
        else if (!string.IsNullOrEmpty(githubUsername))
        {
            admin = await _db.Admins.FirstOrDefaultAsync(a => a.GithubUsername == githubUsername, ct);
        }
        else if (!string.IsNullOrEmpty(githubId))
        {
            admin = await _db.Admins.FirstOrDefaultAsync(a => a.GithubId == githubId, ct);
        }
        else
        {
            return ServiceResult.Fail(401, "Unauthorized");
        }

        if (admin is null)
        {
            return ServiceResult.Fail(401, "Unauthorized");
        }

        admin.Email = email.ToLowerInvariant().Trim();
        admin.Passset = true;
        admin.PasswordHash = AuthService.HashPassword(password);
        await _db.SaveChangesAsync(ct);
        return ServiceResult.Success();
    }
}
