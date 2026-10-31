using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Auth;

namespace UrlShortener.Shared.Services;

/// <summary>
/// In-process URL administration for Public/Admin workflows.
/// and src/app/actions/urlActions.js.
/// </summary>
public sealed class UrlAdminService
{
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private readonly ILogger<UrlAdminService> _logger;
    private readonly AuthenticationAttemptLimiter _attempts;
    private readonly VisitLogger _visits;
    private readonly IHttpContextAccessor _http;
    private readonly SecurityAudit _audit;

    public UrlAdminService(IDbContextFactory<AppDbContext> contexts, ILogger<UrlAdminService> logger, AuthenticationAttemptLimiter attempts,
        VisitLogger visits, IHttpContextAccessor http, SecurityAudit audit)
    {
        _contexts = contexts;
        _logger = logger;
        _attempts = attempts;
        _visits = visits;
        _http = http;
        _audit = audit;
    }

    /// <summary>Compatibility first page (at most 200); use GetPageAsync for traversal.</summary>
    public async Task<List<Url>> GetAllAsync(CancellationToken ct = default)
        => (await GetPageAsync(ct: ct)).Items;

    public async Task<PageResult<Url>> GetPageAsync(int page = 1, int pageSize = 200, string? search = null,
        string? status = null, string? privacy = null, CancellationToken ct = default)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        var (number, size, term) = Paging.Normalize(page, pageSize, search);
        var query = _db.Urls.AsNoTracking();
        if (term.Length > 0) query = query.Where(u => u.ShortPath.ToLower().Contains(term) || u.RedirectUrl.ToLower().Contains(term));
        if (status == "active") query = query.Where(u => !u.Deprecated);
        if (status == "deprecated") query = query.Where(u => u.Deprecated);
        if (privacy == "private") query = query.Where(u => u.IsPrivate);
        if (privacy == "public") query = query.Where(u => !u.IsPrivate);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(u => u.ShortPath).Skip((number - 1) * size).Take(size).Select(u => new Url
        {
            ShortPath = u.ShortPath, RedirectUrl = u.RedirectUrl, IsPrivate = u.IsPrivate,
            Deprecated = u.Deprecated, ScheduleStart = u.ScheduleStart, ScheduleEnd = u.ScheduleEnd,
            UsageQuota = u.UsageQuota, UsageCount = u.UsageCount, CustomRules = u.CustomRules, CreatedAt = u.CreatedAt
        }).ToListAsync(ct);
        return new(items, total, number, size);
    }

    /// <summary>POST: create a URL with validation mirroring the original route.</summary>
    public Task<ServiceResult> CreateAsync(UrlCreateRequest body, CancellationToken ct = default) =>
        _audit.RunAsync("url.create", body?.ShortPath, () => CreateCoreAsync(body!, ct));

    private async Task<ServiceResult> CreateCoreAsync(UrlCreateRequest body, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (body is null || string.IsNullOrEmpty(body.ShortPath) || string.IsNullOrEmpty(body.RedirectUrl))
        {
            return ServiceResult.Fail(400, "Missing required fields");
        }

        if (!InputValidation.Path(body.ShortPath) || !InputValidation.Destination(body.RedirectUrl))
            return ServiceResult.Fail(400, "Invalid short path or HTTP(S) destination");
        if (!LinkAccess.ValidSettings(body.ScheduleStart, body.ScheduleEnd, body.UsageQuota, body.CustomRules))
            return ServiceResult.Fail(400, "Invalid schedule/quota; custom rules are not supported");

        if (body.Private == true && string.IsNullOrEmpty(body.Password))
        {
            return ServiceResult.Fail(400, "Password required for private URLs");
        }

        if (body.Password?.Length > PrivateLinkPassword.MaxLength)
            return ServiceResult.Fail(400, "Password is too long");

        var exists = await _db.Urls.AsNoTracking().AnyAsync(u => u.ShortPath == body.ShortPath, ct);
        if (exists)
        {
            return ServiceResult.Fail(409, "URL already exists");
        }

        _db.Urls.Add(new Url
        {
            ShortPath = body.ShortPath,
            RedirectUrl = body.RedirectUrl,
            Deprecated = false,
            IsPrivate = body.Private ?? false,
            PasswordHash = body.Private == true ? PrivateLinkPassword.Hash(body.Password!) : null,
            ScheduleStart = body.ScheduleStart?.ToUniversalTime(),
            ScheduleEnd = body.ScheduleEnd?.ToUniversalTime(),
            UsageQuota = body.UsageQuota,
            CustomRules = null
        });

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex))
        {
            return ServiceResult.Fail(409, "URL already exists");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inserting URL");
            return ServiceResult.Fail(500, "Failed to add URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>PUT: update a URL. Null fields are treated as "not provided".</summary>
    public Task<ServiceResult> UpdateAsync(UrlUpdateRequest body, CancellationToken ct = default) =>
        _audit.RunAsync("url.update", body?.ShortPath, () => UpdateCoreAsync(body!, ct));

    private async Task<ServiceResult> UpdateCoreAsync(UrlUpdateRequest body, CancellationToken ct)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (body is null || string.IsNullOrEmpty(body.ShortPath))
        {
            return ServiceResult.Fail(400, "short_path required");
        }

        var url = await _db.Urls.FirstOrDefaultAsync(u => u.ShortPath == body.ShortPath, ct);
        if (url is null)
        {
            return ServiceResult.Fail(404, "URL not found");
        }

        var original = new { url.Id, url.EditVersion, url.RedirectUrl, url.Deprecated, url.IsPrivate, url.Password, url.PasswordHash,
            url.ScheduleStart, url.ScheduleEnd, url.UsageQuota, url.CustomRules, url.CreatedAt };

        if (!InputValidation.Path(body.ShortPath) || (body.RedirectUrl is not null && !InputValidation.Destination(body.RedirectUrl)))
            return ServiceResult.Fail(400, "Invalid short path or HTTP(S) destination");
        var start = body.ClearSchedule ? null : body.ScheduleStart?.ToUniversalTime() ?? url.ScheduleStart;
        var end = body.ClearSchedule ? null : body.ScheduleEnd?.ToUniversalTime() ?? url.ScheduleEnd;
        var quota = body.ClearQuota ? null : body.UsageQuota ?? url.UsageQuota;
        var rules = body.ClearCustomRules ? null : body.CustomRules ?? url.CustomRules;
        if (!LinkAccess.ValidSettings(start, end, quota, rules))
            return ServiceResult.Fail(400, "Invalid schedule/quota; custom rules are not supported");
        if (body.Password?.Length > PrivateLinkPassword.MaxLength)
            return ServiceResult.Fail(400, "Password is too long");
        var isPrivate = body.Private ?? url.IsPrivate;
        if (isPrivate && (body.Password == string.Empty ||
            (body.Password is null && string.IsNullOrEmpty(url.PasswordHash) && string.IsNullOrEmpty(url.Password))))
            return ServiceResult.Fail(400, "Password required for private URLs");

        if (body.Deprecated is not null) url.Deprecated = body.Deprecated.Value;
        if (body.RedirectUrl is not null) url.RedirectUrl = body.RedirectUrl;
        url.ScheduleStart = start;
        url.ScheduleEnd = end;
        url.UsageQuota = quota;
        url.CustomRules = null;

        url.IsPrivate = isPrivate;
        if (!isPrivate)
        {
            url.Password = null;
            url.PasswordHash = null;
        }
        else if (body.Password is not null)
        {
            url.PasswordHash = PrivateLinkPassword.Hash(body.Password);
            url.Password = null;
        }

        try
        {
            // Compare editable state, not the admission counter: live traffic must
            // not invalidate an edit. Merge, validation and write apply to one state.
            // Production uses PostgreSQL: mutation and revision commit together.
            // SQLite regression interceptors intentionally interleave a second
            // writer immediately before the conditional UPDATE; an immediate
            // SQLite transaction would deadlock that test-only writer.
            await using var transaction = _db.Database.IsNpgsql() ? await _db.Database.BeginTransactionAsync(ct) : null;
            var changed = await _db.Urls.Where(u => u.ShortPath == body.ShortPath && u.Id == original.Id && u.EditVersion == original.EditVersion
                    && u.RedirectUrl == original.RedirectUrl && u.Deprecated == original.Deprecated
                    && u.IsPrivate == original.IsPrivate && u.Password == original.Password
                    && u.PasswordHash == original.PasswordHash && u.ScheduleStart == original.ScheduleStart
                    && u.ScheduleEnd == original.ScheduleEnd && u.UsageQuota == original.UsageQuota
                    && u.CustomRules == original.CustomRules && u.CreatedAt == original.CreatedAt)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.RedirectUrl, url.RedirectUrl)
                    .SetProperty(u => u.Deprecated, url.Deprecated).SetProperty(u => u.IsPrivate, url.IsPrivate)
                    .SetProperty(u => u.Password, url.Password).SetProperty(u => u.PasswordHash, url.PasswordHash)
                    .SetProperty(u => u.ScheduleStart, url.ScheduleStart).SetProperty(u => u.ScheduleEnd, url.ScheduleEnd)
                    .SetProperty(u => u.UsageQuota, url.UsageQuota).SetProperty(u => u.CustomRules, url.CustomRules)
                    .SetProperty(u => u.EditVersion, u => u.EditVersion + 1), ct);
            if (changed != 1) return ServiceResult.Fail(409, "Link changed. Reload it and retry your edit.");
            if (original.RedirectUrl != url.RedirectUrl)
            {
                _db.LinkRevisions.Add(new LinkRevision { LinkId = original.Id, Version = original.EditVersion + 1,
                    DestinationUrl = url.RedirectUrl });
                _db.Entry(url).State = EntityState.Detached;
                await _db.SaveChangesAsync(ct);
            }
            if (transaction is not null) await transaction.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating URL");
            return ServiceResult.Fail(500, "Failed to update URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>DELETE: remove a URL by short_path.</summary>
    public Task<ServiceResult> DeleteAsync(string? shortPath, CancellationToken ct = default, Guid? expectedId = null, long? expectedVersion = null) =>
        _audit.RunAsync("url.delete", shortPath, () => DeleteCoreAsync(shortPath, ct, expectedId, expectedVersion));

    private async Task<ServiceResult> DeleteCoreAsync(string? shortPath, CancellationToken ct, Guid? expectedId, long? expectedVersion)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (!InputValidation.Path(shortPath)) return ServiceResult.Fail(400, "Invalid short path");
        try
        {
            var deleted = await _db.Urls.Where(u => u.ShortPath == shortPath
                && (expectedId == null || u.Id == expectedId) && (expectedVersion == null || u.EditVersion == expectedVersion)).ExecuteDeleteAsync(ct);
            if (deleted == 0) return expectedId is null ? ServiceResult.Fail(404, "URL not found")
                : ServiceResult.Fail(412, "Link changed; reload before deleting.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting URL");
            return ServiceResult.Fail(500, "Failed to delete URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>Throttled password verification, with an atomic legacy transition.</summary>
    public async Task<ServiceResult<string>> VerifyPasswordAsync(string? shortPath, string? password, CancellationToken ct = default, Guid? expectedId = null)
    {
        await using var _db = await _contexts.CreateDbContextAsync(ct);
        if (string.IsNullOrEmpty(shortPath) || shortPath.Length > 256 ||
            string.IsNullOrEmpty(password) || password.Length > PrivateLinkPassword.MaxLength)
        {
            return ServiceResult<string>.Fail(400, "Missing required fields");
        }

        using var attempt = _attempts.Begin("private-link", shortPath);
        if (attempt is null)
            return ServiceResult<string>.Fail(429, AuthenticationAttemptLimiter.Error);

        var url = await _db.Urls.AsNoTracking().FirstOrDefaultAsync(u => u.ShortPath == shortPath && (expectedId == null || u.Id == expectedId), ct);
        if (url is null)
        {
            return ServiceResult<string>.Fail(404, "URL not found");
        }

        if (!url.IsPrivate)
        {
            return ServiceResult<string>.Fail(400, "URL is not password protected");
        }

        if (url.Deprecated)
            return ServiceResult<string>.Fail(403, "URL is deprecated");
        if (!LinkAccess.Available(url, DateTimeOffset.UtcNow))
            return ServiceResult<string>.Fail(403, "Link is unavailable");

        var hash = url.PasswordHash;
        if (hash is not null)
        {
            if (!PrivateLinkPassword.Verify(password, hash))
                return ServiceResult<string>.Fail(401, "Invalid password");
        }
        else
        {
            if (!PrivateLinkPassword.VerifyLegacy(password, url.Password))
                return ServiceResult<string>.Fail(401, "Invalid password");
            hash = PrivateLinkPassword.Hash(password);
            var changed = await _db.Urls.Where(u => u.ShortPath == shortPath && u.IsPrivate && !u.Deprecated
                    && u.PasswordHash == null && u.Password == url.Password)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, hash)
                    .SetProperty(u => u.Password, (string?)null), ct);
            if (changed != 1) return ServiceResult<string>.Fail(401, "Link changed. Try again.");
        }

        // Re-check current status and credential after expensive hashing. Never
        // release a stale destination after concurrent password rotation/deprecation.
        var target = await _db.Urls.AsNoTracking()
            .Where(u => u.ShortPath == shortPath && u.Id == url.Id && u.IsPrivate && !u.Deprecated && u.PasswordHash == hash)
            .Select(u => u.RedirectUrl).SingleOrDefaultAsync(ct);
        if (target is null) return ServiceResult<string>.Fail(401, "Link changed. Try again.");
        url.PasswordHash = hash;
        if (!await LinkAccess.ConsumeAsync(_db, url, ct))
            return ServiceResult<string>.Fail(403, "Link changed or is unavailable");
        attempt.Succeed();
        var context = _http.HttpContext;
        await _visits.LogUserDataAsync(shortPath, context?.Connection.RemoteIpAddress?.ToString(),
            context?.Request.Headers.UserAgent.ToString(), ct, url.Id);
        return ServiceResult<string>.Success(url.RedirectUrl);
    }
}
