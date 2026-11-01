using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Auth;
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
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly IMemoryCache _cache;
    private readonly ILogger<AdminService> _logger;
    private readonly SecurityAudit _audit;

    public AdminService(IDbContextFactory<AppDbContext> contexts, IMemoryCache cache, IOptions<UrlShortenerOptions> options, ILogger<AdminService> logger, SecurityAudit audit)
    {
        _contexts = contexts;
        _cache = cache;
        _logger = logger;
        _audit = audit;
    }

    // ---- Fresh lookups: authorization must never use cached account state ----

    public async Task<Admin?> GetAdminByIdAsync(Guid id, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        return await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
    }

    public async Task<Admin?> GetAdminByEmailAsync(string email, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalized = InputValidation.Email(email);
        return normalized is null ? null : await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Email != null && a.Email.Trim().ToLower() == normalized, ct);
    }

    /// <summary>Resolves the current role; missing/unknown roles grant no privileges.</summary>
    public async Task<string?> ResolveRoleAsync(Guid id, CancellationToken ct = default)
    {
        var admin = await GetAdminByIdAsync(id, ct);
        return admin?.Role;
    }

    // ---- Management operations (owner-gated at the callsite) ----

    /// <summary>Compatibility first page (at most 200); use GetPageAsync for traversal.</summary>
    public async Task<List<AdminListItem>> ListAdminsAsync(CancellationToken ct = default)
        => (await GetPageAsync(ct: ct)).Items;

    public async Task<PageResult<AdminListItem>> GetPageAsync(int page = 1, int pageSize = 200,
        string? search = null, string? role = null, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var (number, size, term) = Paging.Normalize(page, pageSize, search);
        var query = _db.Admins.AsNoTracking();
        if (term.Length > 0) query = query.Where(a => (a.Email != null && a.Email.ToLower().Contains(term)) || (a.Role != null && a.Role.ToLower().Contains(term)));
        if (role is "admin" or "owner" or "viewer") query = query.Where(a => a.Role == role);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(a => a.Email).ThenBy(a => a.Id).Skip((number - 1) * size).Take(size)
            .Select(a => new AdminListItem(a.Id, a.Email, a.Role, a.Passset,
                a.GithubUsername, a.GithubId, a.CreatedAt)).ToListAsync(ct);
        return new(items, total, number, size);
    }

    public Task<ServiceResult> AddAdminAsync(string? email, string? role, CancellationToken ct = default) =>
        _audit.RunAsync("account.add", InputValidation.Email(email) ?? email, () => AddAdminCoreAsync(email, role, ct));

    private async Task<ServiceResult> AddAdminCoreAsync(string? email, string? role, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail))
        {
            return ServiceResult.Fail(400, "Email is required");
        }

        var adminRole = role == "owner" ? "owner" : role == "viewer" ? "viewer" : "admin";

        var exists = await _db.Admins.AsNoTracking().AnyAsync(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail, ct);
        if (exists)
        {
            return ServiceResult.Fail(409, "Admin already exists");
        }

        _db.Admins.Add(new Admin { Id = Guid.NewGuid(), Email = normalizedEmail, Role = adminRole });
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex)) { return ServiceResult.Fail(409, "Admin already exists"); }
        return ServiceResult.Success();
    }

    public Task<ServiceResult> RemoveAdminAsync(string? email, CancellationToken ct = default) =>
        _audit.RunAsync("account.remove", InputValidation.Email(email) ?? email, () => RemoveAdminCoreAsync(email, ct));

    private async Task<ServiceResult> RemoveAdminCoreAsync(string? email, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail))
        {
            return ServiceResult.Fail(400, "Email required");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        await LockOwnerChangesAsync(_db, ct);
        if (await WouldRemoveFinalOwnerAsync(_db, normalizedEmail, ct))
            return ServiceResult.Fail(409, FinalOwnerError);
        var deleted = await _db.Admins.Where(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail).ExecuteDeleteAsync(ct);
        await transaction.CommitAsync(ct);
        return deleted == 0 ? ServiceResult.Fail(404, "Account not found") : ServiceResult.Success();
    }

    public Task<ServiceResult> UpdateRoleAsync(string? email, string? role, CancellationToken ct = default) =>
        _audit.RunAsync("account.role-change", InputValidation.Email(email) ?? email, () => UpdateRoleCoreAsync(email, role, ct));

    private async Task<ServiceResult> UpdateRoleCoreAsync(string? email, string? role, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (normalizedEmail is null) return ServiceResult.Fail(400, "Valid email required");
        var adminRole = role is "owner" or "admin" or "viewer" ? role : null;
        if (adminRole is null)
        {
            return ServiceResult.Fail(400, "Invalid role");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        await LockOwnerChangesAsync(_db, ct);
        if (adminRole != "owner" && await WouldRemoveFinalOwnerAsync(_db, normalizedEmail, ct))
            return ServiceResult.Fail(409, FinalOwnerError);
        var stamp = Guid.NewGuid();
        var changed = await _db.Admins.Where(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Role, adminRole)
                .SetProperty(a => a.SessionStamp, stamp), ct);
        await transaction.CommitAsync(ct);
        return changed == 0 ? ServiceResult.Fail(404, "Account not found") : ServiceResult.Success();
    }

    public const string FinalOwnerError = "Cannot remove or demote the final usable owner. Set up another owner first.";

    // Cross-process PostgreSQL transaction lock, scoped to this database/table.
    // Read committed queries after the lock see the preceding mutation's commit.
    // SQLite's write transaction serializes these operations in isolated tests.
    internal static async Task LockOwnerChangesAsync(AppDbContext db, CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return;
        var entity = db.Model.FindEntityType(typeof(Admin))!;
        var resource = $"urlshortener:owners:{entity.GetSchema() ?? "public"}.{entity.GetTableName()}";
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext({resource}))", ct);
    }

    internal static async Task<bool> WouldRemoveFinalOwnerAsync(AppDbContext db, string email, CancellationToken ct)
    {
        var owners = await db.Admins.AsNoTracking().Where(a => a.Role == "owner").ToListAsync(ct);
        var usable = owners.Where(a => a.Enabled && InputValidation.Email(a.Email) is not null
            && AdminPassword.ValidStoredHash(a.EffectiveHash)).ToArray();
        return usable.Any(a => InputValidation.Email(a.Email) == email)
            && !usable.Any(a => InputValidation.Email(a.Email) != email);
    }

    /// <summary>In-process owner reset of another admin's password.</summary>
    public Task<ServiceResult> ResetPasswordAsync(string? email, string? password, CancellationToken ct = default) =>
        _audit.RunAsync("account.password-reset", InputValidation.Email(email) ?? email, () => ResetPasswordCoreAsync(email, password, ct));

    private async Task<ServiceResult> ResetPasswordCoreAsync(string? email, string? password, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        if (!AdminPassword.ValidNew(password)) return ServiceResult.Fail(400, AdminPassword.Error);
        var hashed = AuthService.HashPassword(password);
        var stamp = Guid.NewGuid();
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var changed = await _db.Admins.Where(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.Passset, true)
                .SetProperty(a => a.PasswordHash, hashed)
                .SetProperty(a => a.SessionStamp, stamp)
                .SetProperty(a => a.Password, (string?)null), ct);
        if (changed == 0) return ServiceResult.Fail(404, "Account not found");
        await _db.PasswordResetTokens.Where(t => t.Email == normalizedEmail && !t.Used)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await transaction.CommitAsync(ct);
        return ServiceResult.Success();
    }

    /// <summary>Create a new admin account with a password for the Admin UI.</summary>
    public Task<ServiceResult> SignupAsync(string? email, string? password, string? role, CancellationToken ct = default) =>
        _audit.RunAsync("account.create", InputValidation.Email(email) ?? email, () => SignupCoreAsync(email, password, role, ct));

    private async Task<ServiceResult> SignupCoreAsync(string? email, string? password, string? role, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        if (!AdminPassword.ValidNew(password)) return ServiceResult.Fail(400, AdminPassword.Error);
        var pickedRole = role == "owner" ? "owner" : role == "admin" ? "admin" : "viewer";

        var exists = await _db.Admins.AsNoTracking().AnyAsync(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail, ct);
        if (exists)
        {
            return ServiceResult.Fail(409, "Email already registered");
        }

        _db.Admins.Add(new Admin
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Role = pickedRole,
            PasswordHash = AuthService.HashPassword(password)
        });
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex)) { return ServiceResult.Fail(409, "Email already registered"); }
        return ServiceResult.Success();
    }

    /// <summary>Create a one-time password-set token.</summary>
    public Task<ServiceResult<string>> CreatePasswordTokenAsync(string? email, CancellationToken ct = default) =>
        _audit.RunAsync("account.reset-token-issue", InputValidation.Email(email) ?? email, () => CreatePasswordTokenCoreAsync(email, ct));

    private async Task<ServiceResult<string>> CreatePasswordTokenCoreAsync(string? email, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail))
        {
            return ServiceResult<string>.Fail(400, "Email is required");
        }

        var admin = await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Email != null && a.Email.Trim().ToLower() == normalizedEmail, ct);
        if (admin is null)
        {
            return ServiceResult<string>.Fail(404, "Account not found");
        }

        // Bind the opaque token to the immutable account ID as well as its email.
        // A deleted account's token must not apply to a new account reusing that email.
        var token = $"{admin.Id:N}.{Convert.ToHexString(RandomNumberGenerator.GetBytes(32))}";
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        await _db.PasswordResetTokens.Where(t => t.Email == normalizedEmail && !t.Used)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Token = HashResetToken(token),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(24),
            Used = false
        });
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return ServiceResult<string>.Success(token);
    }

    /// <summary>Change only the authenticated cookie account, never a client-supplied identifier.</summary>
    public Task<ServiceResult> SetOwnPasswordAsync(ClaimsPrincipal user, string? email, string? password, string? currentPassword, CancellationToken ct = default) =>
        _audit.RunAsync("account.password-change", user.FindFirstValue(ClaimTypes.NameIdentifier),
            () => SetOwnPasswordCoreAsync(user, email, password, currentPassword, ct), user);

    private async Task<ServiceResult> SetOwnPasswordCoreAsync(ClaimsPrincipal user, string? email, string? password, string? currentPassword, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var identity = user.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme);
        if (identity is null || !Guid.TryParse(identity.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id))
        {
            return ServiceResult.Fail(401, "Unauthorized");
        }

        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }

        if (!AdminPassword.ValidNew(password)) return ServiceResult.Fail(400, AdminPassword.Error);
        var admin = await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (admin is null)
        {
            return ServiceResult.Fail(401, "Unauthorized");
        }

        if (!string.IsNullOrEmpty(admin.EffectiveHash) && !VerifyCurrentPassword(currentPassword, admin.EffectiveHash))
        {
            return ServiceResult.Fail(401, "Current password is required and must be correct");
        }

        if (await _db.Admins.AsNoTracking().AnyAsync(a => a.Id != id && a.Email != null && a.Email.Trim().ToLower() == normalizedEmail, ct))
        {
            return ServiceResult.Fail(409, "Email is already registered");
        }

        var hash = AuthService.HashPassword(password);
        var stamp = Guid.NewGuid();
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        // If another request already changed credentials, do not overwrite them
        // using proof of the previous password.
        int updated;
        try
        {
            updated = await _db.Admins.Where(a => a.Id == id
                && a.PasswordHash == admin.PasswordHash && a.Password == admin.Password)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.Email, normalizedEmail)
                .SetProperty(a => a.Passset, true)
                .SetProperty(a => a.PasswordHash, hash)
                .SetProperty(a => a.SessionStamp, stamp)
                .SetProperty(a => a.Password, (string?)null), ct);
        }
        catch (Exception ex) when (InputValidation.IsUniqueConflict(ex))
        {
            return ServiceResult.Fail(409, "Email is already registered");
        }
        if (updated != 1)
        {
            return ServiceResult.Fail(409, "Credentials changed; sign in again");
        }

        await _db.PasswordResetTokens.Where(t => !t.Used && (t.Email == admin.Email || t.Email == normalizedEmail))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await transaction.CommitAsync(ct);
        InvalidateAdminCache(id, admin.Email, normalizedEmail);
        return ServiceResult.Success();
    }

    /// <summary>Set a password using an account-bound, expiring, single-use token.</summary>
    public Task<ServiceResult> ResetPasswordWithTokenAsync(string? email, string? password, string? token, CancellationToken ct = default, string purpose = "reset") =>
        _audit.RunAsync("account.token-password-reset", InputValidation.Email(email) ?? email, () => ResetPasswordWithTokenCoreAsync(email, password, token, ct, purpose));

    private async Task<ServiceResult> ResetPasswordWithTokenCoreAsync(string? email, string? password, string? token, CancellationToken ct, string purpose)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var normalizedEmail = InputValidation.Email(email);
        if (string.IsNullOrEmpty(normalizedEmail) || string.IsNullOrEmpty(password))
        {
            return ServiceResult.Fail(400, "Email and password are required");
        }
        if (!AdminPassword.ValidNew(password)) return ServiceResult.Fail(400, AdminPassword.Error);
        if (token is null || token.Length != 97 || token[32] != '.'
            || !Guid.TryParseExact(token[..32], "N", out var accountId)
            || !token[33..].All(Uri.IsHexDigit))
        {
            return ServiceResult.Fail(401, "Invalid or expired reset token");
        }

        var tokenHash = HashResetToken(token);
        var now = DateTimeOffset.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        // Check cheaply before bcrypt. Final conditional redemption below is the
        // authority; reading a token here does not reserve or consume it.
        var validToken = await _db.PasswordResetTokens.AsNoTracking().AnyAsync(t => t.Token == tokenHash
            && t.Email == normalizedEmail && t.Purpose == purpose && !t.Used && t.ExpiresAt > now, ct);
        if (!validToken)
        {
            return ServiceResult.Fail(401, "Invalid or expired reset token");
        }

        var admin = await _db.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Id == accountId && a.Enabled && a.Email != null && a.Email.Trim().ToLower() == normalizedEmail, ct);
        if (admin is null)
        {
            return ServiceResult.Fail(401, "Invalid or expired reset token");
        }

        var hash = AuthService.HashPassword(password);
        var stamp = Guid.NewGuid();
        var updated = await _db.Admins.Where(a => a.Id == admin.Id && a.Enabled && a.Email != null && a.Email.Trim().ToLower() == normalizedEmail)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.Passset, true)
                .SetProperty(a => a.PasswordHash, hash)
                .SetProperty(a => a.SessionStamp, stamp)
                .SetProperty(a => a.Password, (string?)null), ct);
        if (updated != 1)
        {
            return ServiceResult.Fail(401, "Invalid or expired reset token");
        }
        // Lock the account before its tokens, as self-service/owner resets do.
        // Only one concurrent request can redeem the token. A loser rolls back
        // its password update along with this transaction.
        var redeemedAt = DateTimeOffset.UtcNow;
        var redeemed = await _db.PasswordResetTokens.Where(t => t.Token == tokenHash
                && t.Email == normalizedEmail && t.Purpose == purpose && !t.Used && t.ExpiresAt > redeemedAt)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        if (redeemed != 1)
        {
            return ServiceResult.Fail(401, "Invalid or expired reset token");
        }
        await _db.PasswordResetTokens.Where(t => t.Email == normalizedEmail && !t.Used)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await transaction.CommitAsync(ct);
        InvalidateAdminCache(admin.Id, admin.Email, normalizedEmail);
        return ServiceResult.Success();
    }

    private static string HashResetToken(string token) =>
        "sha256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static bool VerifyCurrentPassword(string? password, string hash)
        => AdminPassword.Verify(password, hash);

    private void InvalidateAdminCache(Guid id, string? oldEmail, string newEmail)
    {
        _cache.Remove($"admin-id-{id}");
        if (oldEmail is not null) _cache.Remove($"admin-email-{oldEmail.ToLowerInvariant()}");
        _cache.Remove($"admin-email-{newEmail}");
    }
}
