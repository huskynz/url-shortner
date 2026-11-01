using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed class ApiV1Keys(IDbContextFactory<AppDbContext> contexts)
{
    private static ApiKeyListItem View(ApiKey k) => new(k.Id, k.Name, k.CreatedAt, k.IsActive, k.ExpiresAt, k.UseCount, k.LastUsed, k.Scopes);
    public async Task<ApiKeyListItem> Get(Guid id, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        return View(await db.ApiKeys.AsNoTracking().SingleOrDefaultAsync(k => k.Id == id, ct)
            ?? throw new ApiFault(404, "key_not_found", "Key not found."));
    }

    public async Task<IssuedApiKey> Issue(KeyIssue body, CancellationToken ct)
    {
        ApiV1Links.Require(body.Name is { Length: > 0 and <= 128 } && !body.Name.Any(char.IsControl)
            && body.Scopes is not null && ApiKeyService.ValidScopes(body.Scopes) && body.ExpiresInDays is >= 1 and <= 365,
            400, "invalid_key_settings", "Choose a name, supported scopes and expiry of 1..365 days.");
        var secret = "sk_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var key = new ApiKey { Id = Guid.NewGuid(), Name = body.Name.Trim(), Key = ApiKeyService.HashKey(secret),
            Scopes = string.Join(' ', body.Scopes!.Split(' ', StringSplitOptions.RemoveEmptyEntries).Order()),
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(body.ExpiresInDays) };
        await using var db = await contexts.CreateDbContextAsync(ct);
        db.ApiKeys.Add(key); await db.SaveChangesAsync(ct);
        return new(key.Id, key.Name, secret, key.CreatedAt);
    }

    public async Task Revoke(Guid id, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var count = await db.ApiKeys.Where(k => k.Id == id).ExecuteUpdateAsync(s => s.SetProperty(k => k.IsActive, false), ct);
        ApiV1Links.Require(count == 1, 404, "key_not_found", "Key not found.");
    }

    public async Task<IssuedApiKey> Rotate(Guid id, int overlap, CancellationToken ct)
    {
        ApiV1Links.Require(overlap is >= 0 and <= 1440, 400, "invalid_overlap", "Overlap must be 0..1440 minutes.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApiV1Links.Lock(db, $"key.rotate:{id}", ct);
        var now = DateTimeOffset.UtcNow;
        var key = await db.ApiKeys.AsNoTracking().SingleOrDefaultAsync(k => k.Id == id && k.IsActive
            && (k.ExpiresAt == null || k.ExpiresAt > now), ct)
            ?? throw new ApiFault(409, "key_unavailable", "Key is missing, revoked or expired.");
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(overlap);
        if (key.ExpiresAt < cutoff) cutoff = key.ExpiresAt.Value;
        var changed = await db.ApiKeys.Where(k => k.Id == id && k.IsActive && k.ExpiresAt == key.ExpiresAt && k.Key == key.Key)
            .ExecuteUpdateAsync(s => s.SetProperty(k => k.ExpiresAt, cutoff).SetProperty(k => k.IsActive, overlap > 0), ct);
        ApiV1Links.Require(changed == 1, 409, "key_changed", "Key changed during rotation.");
        var secret = "sk_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var replacement = new ApiKey { Id = Guid.NewGuid(), Name = key.Name, Key = ApiKeyService.HashKey(secret), Scopes = key.Scopes,
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(90) };
        db.ApiKeys.Add(replacement); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(replacement.Id, replacement.Name, secret, replacement.CreatedAt);
    }
}
