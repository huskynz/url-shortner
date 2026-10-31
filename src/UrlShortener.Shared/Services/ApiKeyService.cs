using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

/// <summary>Safe listing shared by both key-management routes.</summary>
public sealed record ApiKeyListItem(Guid Id, string? Name, DateTimeOffset? CreatedAt,
    bool IsActive, DateTimeOffset? ExpiresAt, long UseCount, DateTimeOffset? LastUsed, string Scopes);
public sealed record IssuedApiKey(Guid Id, string? Name, string Key, DateTimeOffset? CreatedAt);
public sealed record VerifiedApiKey(Guid Id, string Scopes);

/// <summary>
/// API-key management and verification. Ports src/app/api/api-keys and
/// src/app/api/admin-keys, plus the key-verification logic in lib/auth.js.
/// </summary>
public sealed class ApiKeyService
{
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly ILogger<ApiKeyService> _logger;
    private readonly SecurityAudit _audit;

    public ApiKeyService(IDbContextFactory<AppDbContext> contexts, ILogger<ApiKeyService> logger, SecurityAudit audit)
    {
        _contexts = contexts;
        _logger = logger;
        _audit = audit;
    }

    // ---- /api/api-keys (session-scoped, simple key format) ----

    /// <summary>Compatibility first page (at most 200); use GetPageAsync for traversal.</summary>
    public async Task<List<ApiKeyListItem>> ListSimpleAsync(CancellationToken ct = default)
        => (await GetPageAsync(ct: ct)).Items;

    public async Task<PageResult<ApiKeyListItem>> GetPageAsync(int page = 1, int pageSize = 200,
        string? search = null, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var (number, size, term) = Paging.Normalize(page, pageSize, search);
        var query = _db.ApiKeys.AsNoTracking();
        if (term.Length > 0) query = query.Where(k => k.Name != null && k.Name.ToLower().Contains(term));
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(k => k.CreatedAt).ThenBy(k => k.Id).Skip((number - 1) * size).Take(size)
            .Select(k => new ApiKeyListItem(k.Id, k.Name, k.CreatedAt, k.IsActive, k.ExpiresAt, k.UseCount, k.LastUsed, k.Scopes))
            .ToListAsync(ct);
        return new(items, total, number, size);
    }

    public Task<ServiceResult<IssuedApiKey>> CreateSimpleAsync(string? name, CancellationToken ct = default) =>
        _audit.RunAsync("api-key.issue", name?.Trim(), () => CreateSimpleCoreAsync(name, ct));

    private async Task<ServiceResult<IssuedApiKey>> CreateSimpleCoreAsync(string? name, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        name = name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 128 || name.Any(char.IsControl))
        {
            return ServiceResult<IssuedApiKey>.Fail(400, "Name is required");
        }

        var key = "sk_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var entity = new ApiKey
        {
            Id = Guid.NewGuid(),
            Name = name,
            Key = HashKey(key),
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.ApiKeys.Add(entity);
        await _db.SaveChangesAsync(ct);
        return ServiceResult<IssuedApiKey>.Success(new IssuedApiKey(entity.Id, entity.Name, key, entity.CreatedAt));
    }

    // ---- /api/admin-keys (owner-scoped, hex key format) ----

    public Task<List<ApiKeyListItem>> ListFullAsync(CancellationToken ct = default) => ListSimpleAsync(ct);

    public Task<ServiceResult<string>> CreateFullAsync(string? name, string? expiration, CancellationToken ct = default,
        string? scopes = null) => _audit.RunAsync("api-key.issue", name?.Trim(), () => CreateFullCoreAsync(name, expiration, ct, scopes));

    private async Task<ServiceResult<string>> CreateFullCoreAsync(string? name, string? expiration, CancellationToken ct, string? scopes)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        name = name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 128 || name.Any(char.IsControl))
            return ServiceResult<string>.Fail(400, "Valid name required");
        scopes ??= "urls:read";
        if (!ValidScopes(scopes))
            return ServiceResult<string>.Fail(400, "Invalid scopes");
        string key = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        DateTimeOffset? expiresAt = null;
        if (!string.IsNullOrEmpty(expiration))
        {
            if (!TryParseDuration(expiration, out var span))
            {
                return ServiceResult<string>.Fail(400, "Expiration must be a positive duration up to 365 days");
            }
            expiresAt = DateTimeOffset.UtcNow.Add(span);
        }

        _db.ApiKeys.Add(new ApiKey
        {
            Id = Guid.NewGuid(),
            Name = name,
            Key = HashKey(key),
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            Scopes = scopes,
            ExpiresAt = expiresAt
        });
        await _db.SaveChangesAsync(ct);
        return ServiceResult<string>.Success(key);
    }

    public Task<ServiceResult> DeleteAsync(string? id, CancellationToken ct = default) =>
        _audit.RunAsync("api-key.revoke", Guid.TryParse(id, out var guid) ? guid.ToString() : id, () => DeleteCoreAsync(id, ct));

    private async Task<ServiceResult> DeleteCoreAsync(string? id, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (!Guid.TryParse(id, out var guid))
        {
            return ServiceResult.Fail(400, "ID is required");
        }

        try
        {
            if (await _db.ApiKeys.Where(k => k.Id == guid).ExecuteDeleteAsync(ct) == 0)
                return ServiceResult.Fail(404, "API key not found");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting API key");
            return ServiceResult.Fail(500, "Failed to delete API key");
        }

        return ServiceResult.Success();
    }

    /// <summary>Checks active, unexpired digests only; never accepts stored digests as bearer keys.</summary>
    public async Task<bool> KeyExistsAsync(string? key, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(key) || key.Length > 256) return false;
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var hash = HashKey(key);
        var now = DateTimeOffset.UtcNow;
        return await _db.ApiKeys.AsNoTracking().AnyAsync(k => k.Key == hash && k.IsActive
            && (k.ExpiresAt == null || k.ExpiresAt > now), ct);
    }

    // ---- Verification (port of verifyAuth's API-key branch) ----

    /// <summary>Validates an API key, updating usage metadata on success.</summary>
    public async Task<bool> VerifyApiKeyAsync(string apiKey, string? ip, string? userAgent, CancellationToken ct = default) =>
        await AuthenticateKeyAsync(apiKey, ip, userAgent, ct) is not null;

    public async Task<VerifiedApiKey?> AuthenticateKeyAsync(string apiKey, string? ip, string? userAgent, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(apiKey) || apiKey.Length > 256)
        {
            return null;
        }

        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var hash = HashKey(apiKey);
        var now = DateTimeOffset.UtcNow;
        var match = await _db.ApiKeys.AsNoTracking()
            .FirstOrDefaultAsync(k => k.Key == hash && k.IsActive
                && (k.ExpiresAt == null || k.ExpiresAt > now), ct);

        if (match is null)
        {
            return null;
        }

        try
        {
            // Recheck revocation, expiry and scopes at the same atomic increment.
            var changed = await _db.ApiKeys.Where(k => k.Id == match.Id && k.Key == hash && k.IsActive
                    && k.Scopes == match.Scopes && (k.ExpiresAt == null || k.ExpiresAt > now))
                .ExecuteUpdateAsync(s => s.SetProperty(k => k.UseCount, k => k.UseCount + 1)
                    .SetProperty(k => k.LastUsed, now).SetProperty(k => k.LastIp, ip), ct);
            return changed == 1 ? new VerifiedApiKey(match.Id, match.Scopes) : null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating API key usage");
            return null;
        }
    }

    public static string HashKey(string key) =>
        "sha256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();

    public static readonly string[] SupportedScopes = ["urls:read", "urls:write", "urls:private", "urls:history",
        "urls:import", "urls:export", "urls:bulk", "analytics:read"];
    public static bool ValidScopes(string scopes)
    {
        var values = scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return scopes.Length <= 256 && values.Length > 0 && values.Distinct().Count() == values.Length
            && values.All(SupportedScopes.Contains);
    }

    private static bool TryParseDuration(string duration, out TimeSpan span)
    {
        span = TimeSpan.Zero;
        if (duration.Length > 12) return false;
        var match = System.Text.RegularExpressions.Regex.Match(duration, @"\A([0-9]+)([dhm])\z");
        if (!match.Success)
        {
            return false;
        }

        if (!int.TryParse(match.Groups[1].Value, out var value) || value <= 0 || value > 525600) return false;
        span = match.Groups[2].Value switch
        {
            "d" => TimeSpan.FromDays(value),
            "h" => TimeSpan.FromHours(value),
            "m" => TimeSpan.FromMinutes(value),
            _ => TimeSpan.Zero
        };
        return span <= TimeSpan.FromDays(365);
    }
}
