using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

/// <summary>A trimmed API-key view matching the original /api/api-keys GET projection.</summary>
public sealed record ApiKeyListItem(Guid Id, string? Name, string Key, DateTimeOffset? CreatedAt);

/// <summary>
/// API-key management and verification. Ports src/app/api/api-keys and
/// src/app/api/admin-keys, plus the key-verification logic in lib/auth.js.
/// </summary>
public sealed class ApiKeyService
{
    private const string Base36 = "abcdefghijklmnopqrstuvwxyz0123456789";

    private readonly AppDbContext _db;
    private readonly ILogger<ApiKeyService> _logger;

    public ApiKeyService(AppDbContext db, ILogger<ApiKeyService> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ---- /api/api-keys (session-scoped, simple key format) ----

    public async Task<List<ApiKeyListItem>> ListSimpleAsync(CancellationToken ct = default) =>
        await _db.ApiKeys.AsNoTracking()
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new ApiKeyListItem(k.Id, k.Name, k.Key, k.CreatedAt))
            .ToListAsync(ct);

    public async Task<ServiceResult<ApiKeyListItem>> CreateSimpleAsync(string? name, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(name))
        {
            return ServiceResult<ApiKeyListItem>.Fail(400, "Name is required");
        }

        var key = $"sk_{RandomBase36(13)}{RandomBase36(13)}";
        var entity = new ApiKey
        {
            Id = Guid.NewGuid(),
            Name = name,
            Key = key,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.ApiKeys.Add(entity);
        await _db.SaveChangesAsync(ct);
        return ServiceResult<ApiKeyListItem>.Success(new ApiKeyListItem(entity.Id, entity.Name, entity.Key, entity.CreatedAt));
    }

    // ---- /api/admin-keys (owner-scoped, hex key format) ----

    public async Task<List<ApiKey>> ListFullAsync(CancellationToken ct = default) =>
        await _db.ApiKeys.AsNoTracking().OrderByDescending(k => k.CreatedAt).ToListAsync(ct);

    public async Task<ServiceResult<string>> CreateFullAsync(string? name, string? expiration, CancellationToken ct = default)
    {
        string key = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        DateTimeOffset? expiresAt = null;
        if (!string.IsNullOrEmpty(expiration))
        {
            if (!TryParseDuration(expiration, out var span))
            {
                return ServiceResult<string>.Fail(500, "Failed to create API key");
            }
            expiresAt = DateTimeOffset.UtcNow.Add(span);
        }

        _db.ApiKeys.Add(new ApiKey
        {
            Id = Guid.NewGuid(),
            Name = name,
            Key = key,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt
        });
        await _db.SaveChangesAsync(ct);
        return ServiceResult<string>.Success(key);
    }

    public async Task<ServiceResult> DeleteAsync(string? id, CancellationToken ct = default)
    {
        if (!Guid.TryParse(id, out var guid))
        {
            return ServiceResult.Fail(400, "ID is required");
        }

        try
        {
            await _db.ApiKeys.Where(k => k.Id == guid).ExecuteDeleteAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting API key");
            return ServiceResult.Fail(500, "Failed to delete API key");
        }

        return ServiceResult.Success();
    }

    /// <summary>Whether a key exists (active) — used by the direct-token delete path.</summary>
    public Task<bool> KeyExistsAsync(string? key, CancellationToken ct = default) =>
        _db.ApiKeys.AsNoTracking().AnyAsync(k => k.Key == key, ct);

    // ---- Verification (port of verifyAuth's API-key branch) ----

    /// <summary>Validates an API key, updating usage metadata on success.</summary>
    public async Task<bool> VerifyApiKeyAsync(string apiKey, string? ip, string? userAgent, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(apiKey))
        {
            return false;
        }

        var match = await _db.ApiKeys
            .FirstOrDefaultAsync(k => k.Key == apiKey && k.IsActive
                && (k.ExpiresAt == null || k.ExpiresAt > DateTimeOffset.UtcNow), ct);

        if (match is null)
        {
            return false;
        }

        try
        {
            match.UseCount += 1;
            match.LastUsed = DateTimeOffset.UtcNow;
            match.LastIp = ip;
            var metadata = string.IsNullOrEmpty(match.Metadata)
                ? new JsonObject()
                : JsonNode.Parse(match.Metadata)?.AsObject() ?? new JsonObject();
            metadata["last_user_agent"] = userAgent;
            match.Metadata = metadata.ToJsonString();
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating API key usage");
        }

        return true;
    }

    private static string RandomBase36(int length)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        var sb = new StringBuilder(length);
        foreach (var b in bytes)
        {
            sb.Append(Base36[b % Base36.Length]);
        }
        return sb.ToString();
    }

    private static bool TryParseDuration(string duration, out TimeSpan span)
    {
        span = TimeSpan.Zero;
        var match = System.Text.RegularExpressions.Regex.Match(duration, @"^(\d+)([dhm])$");
        if (!match.Success)
        {
            return false;
        }

        var value = int.Parse(match.Groups[1].Value);
        span = match.Groups[2].Value switch
        {
            "d" => TimeSpan.FromDays(value),
            "h" => TimeSpan.FromHours(value),
            "m" => TimeSpan.FromMinutes(value),
            _ => TimeSpan.Zero
        };
        return true;
    }
}
