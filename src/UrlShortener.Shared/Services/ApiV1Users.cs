using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed record InvitationView(Guid UserId, string Email, string Token, DateTimeOffset ExpiresAt);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UserCreate(string? Email, string? Password, string? Role);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OwnerPasswordReset(string? Password);

public sealed class ApiV1Users(IDbContextFactory<AppDbContext> contexts)
{
    public static UserView View(Admin a) => new(a.Id, a.Email, a.Role, a.Enabled, a.Passset ?? false, a.CreatedAt);
    public async Task<UserView> Get(Guid id, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        return View(await db.Admins.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new ApiFault(404, "user_not_found", "Account not found."));
    }

    public async Task<PageResult<UserView>> List(int page, int size, string? search, string? role, CancellationToken ct)
    {
        ApiV1Links.Page(page, size, search);
        ApiV1Links.Require(role is null or "owner" or "admin" or "viewer", 400, "invalid_role", "Choose owner, admin or viewer.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        var query = db.Admins.AsNoTracking();
        if (role is not null) query = query.Where(a => a.Role == role);
        var term = search?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(term)) query = query.Where(a => a.Email != null && a.Email.ToLower().Contains(term));
        var rows = await query.OrderBy(a => a.Email).ThenBy(a => a.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows.Select(View).ToList(), await query.CountAsync(ct), page, size);
    }

    public async Task<UserView> Patch(Guid id, UserPatch body, CancellationToken ct)
    {
        ApiV1Links.Require(body.Role is null or "owner" or "admin" or "viewer", 400, "invalid_role", "Choose owner, admin or viewer.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await AdminService.LockOwnerChangesAsync(db, ct);
        var user = await db.Admins.SingleOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new ApiFault(404, "user_not_found", "Account not found.");
        if ((body.Enabled == false || (body.Role is not null && body.Role != "owner")) && user.Email is not null)
            ApiV1Links.Require(!await AdminService.WouldRemoveFinalOwnerAsync(db, user.Email, ct), 409, "final_owner", AdminService.FinalOwnerError);
        user.Role = body.Role ?? user.Role;
        user.Enabled = body.Enabled ?? user.Enabled;
        user.SessionStamp = Guid.NewGuid();
        await db.SaveChangesAsync(ct);
        if (!user.Enabled)
            await db.PasswordResetTokens.Where(t => t.Email == user.Email && !t.Used).ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await tx.CommitAsync(ct);
        return View(user);
    }

    public async Task<UserView> Create(UserCreate body, CancellationToken ct)
    {
        var email = InputValidation.Email(body.Email);
        ApiV1Links.Require(email is not null, 400, "invalid_email", "Valid email required.");
        ApiV1Links.Require(body.Role is "owner" or "admin" or "viewer", 400, "invalid_role", "Choose owner, admin or viewer.");
        ApiV1Links.Require(AdminPassword.ValidNew(body.Password), 400, "invalid_password", AdminPassword.Error);
        await using var db = await contexts.CreateDbContextAsync(ct);
        var user = new Admin { Id = Guid.NewGuid(), Email = email, Role = body.Role!, Passset = true,
            PasswordHash = AuthService.HashPassword(body.Password!), CreatedAt = DateTimeOffset.UtcNow };
        db.Admins.Add(user);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex))
        { throw new ApiFault(409, "account_exists", "Account already exists."); }
        return View(user);
    }

    public async Task Delete(Guid id, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await AdminService.LockOwnerChangesAsync(db, ct);
        var user = await db.Admins.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new ApiFault(404, "user_not_found", "Account not found.");
        if (user.Email is not null)
            ApiV1Links.Require(!await AdminService.WouldRemoveFinalOwnerAsync(db, user.Email, ct), 409, "final_owner", AdminService.FinalOwnerError);
        await db.PasswordResetTokens.Where(t => t.Email == user.Email && !t.Used).ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await db.Admins.Where(a => a.Id == id).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task ResetPassword(Guid id, OwnerPasswordReset body, CancellationToken ct)
    {
        ApiV1Links.Require(AdminPassword.ValidNew(body.Password), 400, "invalid_password", AdminPassword.Error);
        var hash = AuthService.HashPassword(body.Password!);
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await AdminService.LockOwnerChangesAsync(db, ct);
        var user = await db.Admins.SingleOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new ApiFault(404, "user_not_found", "Account not found.");
        ApiV1Links.Require(user.Enabled, 409, "account_disabled", "Account is disabled.");
        user.PasswordHash = hash; user.Password = null; user.Passset = true; user.SessionStamp = Guid.NewGuid();
        await db.SaveChangesAsync(ct);
        await db.PasswordResetTokens.Where(t => t.Email == user.Email && !t.Used).ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await tx.CommitAsync(ct);
    }

    public async Task<InvitationView> Invite(InvitationRequest body, CancellationToken ct)
    {
        var email = InputValidation.Email(body.Email);
        ApiV1Links.Require(email is not null && body.Role is "owner" or "admin" or "viewer", 400, "invalid_invitation", "Valid email and role required.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        ApiV1Links.Require(!await db.Admins.AnyAsync(a => a.Email != null && a.Email.Trim().ToLower() == email, ct),
            409, "account_exists", "Account already exists; use a password-reset token for an existing account.");
        var user = new Admin { Id = Guid.NewGuid(), Email = email, Role = body.Role, Passset = false, CreatedAt = DateTimeOffset.UtcNow };
        var token = $"{user.Id:N}.{Convert.ToHexString(RandomNumberGenerator.GetBytes(32))}";
        var expiry = DateTimeOffset.UtcNow.AddHours(24);
        db.Admins.Add(user);
        db.PasswordResetTokens.Add(new PasswordResetToken { Id = Guid.NewGuid(), Email = email!, Purpose = "invitation",
            Token = "sha256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))), ExpiresAt = expiry });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex)) { throw new ApiFault(409, "account_exists", "Account already exists."); }
        await tx.CommitAsync(ct);
        return new(user.Id, email!, token, expiry);
    }

    public async Task<UserView> Profile(Guid id, ProfilePatch body, CancellationToken ct)
    {
        var email = InputValidation.Email(body.Email);
        ApiV1Links.Require(email is not null, 400, "invalid_email", "Valid email required.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Admins.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id && a.Enabled, ct)
            ?? throw new ApiFault(401, "invalid_session", "Sign in again.");
        ApiV1Links.Require(AdminPassword.Verify(body.CurrentPassword, user.EffectiveHash ?? ""), 401, "invalid_password", "Current password required.");
        var stamp = Guid.NewGuid();
        int count;
        try
        {
            count = await db.Admins.Where(a => a.Id == id && a.Enabled && a.SessionStamp == user.SessionStamp)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.Email, email).SetProperty(a => a.SessionStamp, stamp), ct);
        }
        catch (Exception ex) when (InputValidation.IsUniqueConflict(ex)) { throw new ApiFault(409, "email_exists", "Email is already registered."); }
        ApiV1Links.Require(count == 1, 409, "account_changed", "Account changed; sign in again.");
        await db.PasswordResetTokens.Where(t => !t.Used && (t.Email == user.Email || t.Email == email)).ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true), ct);
        await tx.CommitAsync(ct);
        user.Email = email; user.SessionStamp = stamp;
        return View(user);
    }

    public static Guid Identity(ClaimsPrincipal principal)
    {
        var identity = principal.Identities.FirstOrDefault(i => i.IsAuthenticated && i.AuthenticationType == AuthConstants.CookieScheme);
        if (!Guid.TryParse(identity?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id))
            throw new ApiFault(401, "invalid_session", "Sign in required.");
        return id;
    }
}
