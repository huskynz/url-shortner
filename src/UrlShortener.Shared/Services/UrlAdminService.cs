using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

/// <summary>
/// URL administration. Port of src/app/api/admin-urls/route.js (GET/POST/PUT/DELETE)
/// and src/app/actions/urlActions.js.
/// </summary>
public sealed class UrlAdminService
{
    private readonly AppDbContext _db;
    private readonly ILogger<UrlAdminService> _logger;

    public UrlAdminService(AppDbContext db, ILogger<UrlAdminService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>GET: all URLs.</summary>
    public async Task<List<Url>> GetAllAsync(CancellationToken ct = default) =>
        await _db.Urls.AsNoTracking().ToListAsync(ct);

    /// <summary>POST: create a URL with validation mirroring the original route.</summary>
    public async Task<ServiceResult> CreateAsync(UrlCreateRequest body, CancellationToken ct = default)
    {
        if (body is null || string.IsNullOrEmpty(body.ShortPath) || string.IsNullOrEmpty(body.RedirectUrl))
        {
            return ServiceResult.Fail(400, "Missing required fields");
        }

        if (body.Private == true && string.IsNullOrEmpty(body.Password))
        {
            return ServiceResult.Fail(400, "Password required for private URLs");
        }

        var exists = await _db.Urls.AsNoTracking().AnyAsync(u => u.ShortPath == body.ShortPath, ct);
        if (exists)
        {
            return ServiceResult.Fail(400, "URL already exists");
        }

        _db.Urls.Add(new Url
        {
            ShortPath = body.ShortPath,
            RedirectUrl = body.RedirectUrl,
            Deprecated = false,
            IsPrivate = body.Private ?? false,
            Password = string.IsNullOrEmpty(body.Password) ? null : body.Password,
            ScheduleStart = body.ScheduleStart,
            ScheduleEnd = body.ScheduleEnd,
            UsageQuota = body.UsageQuota,
            CustomRules = body.CustomRules
        });

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inserting URL");
            return ServiceResult.Fail(500, "Failed to add URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>PUT: update a URL. Null fields are treated as "not provided".</summary>
    public async Task<ServiceResult> UpdateAsync(UrlUpdateRequest body, CancellationToken ct = default)
    {
        if (body is null || string.IsNullOrEmpty(body.ShortPath))
        {
            return ServiceResult.Fail(400, "short_path required");
        }

        var url = await _db.Urls.FirstOrDefaultAsync(u => u.ShortPath == body.ShortPath, ct);
        if (url is null)
        {
            return ServiceResult.Success(); // Original performs a no-op update if nothing matches
        }

        if (body.Deprecated is not null) url.Deprecated = body.Deprecated.Value;
        if (body.RedirectUrl is not null) url.RedirectUrl = body.RedirectUrl;

        if (body.Private is not null)
        {
            url.IsPrivate = body.Private.Value;
            if (!body.Private.Value)
            {
                url.Password = null; // Turning private off clears the password
            }
            else if (body.Password is not null)
            {
                url.Password = body.Password == string.Empty ? null : body.Password;
            }
            // private on with no password field: leave password unchanged
        }
        else if (body.Password is not null)
        {
            url.Password = body.Password == string.Empty ? null : body.Password;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating URL");
            return ServiceResult.Fail(500, "Failed to update URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>DELETE: remove a URL by short_path.</summary>
    public async Task<ServiceResult> DeleteAsync(string? shortPath, CancellationToken ct = default)
    {
        try
        {
            await _db.Urls.Where(u => u.ShortPath == shortPath).ExecuteDeleteAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting URL");
            return ServiceResult.Fail(500, "Failed to delete URL");
        }

        return ServiceResult.Success();
    }

    /// <summary>POST /api/verify-password: plaintext password check (kept as-is from the original).</summary>
    public async Task<ServiceResult<string>> VerifyPasswordAsync(string? shortPath, string? password, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(shortPath) || string.IsNullOrEmpty(password))
        {
            return ServiceResult<string>.Fail(400, "Missing required fields");
        }

        var url = await _db.Urls.AsNoTracking().FirstOrDefaultAsync(u => u.ShortPath == shortPath, ct);
        if (url is null)
        {
            return ServiceResult<string>.Fail(404, "URL not found");
        }

        if (!url.IsPrivate)
        {
            return ServiceResult<string>.Fail(400, "URL is not password protected");
        }

        if (url.Password != password)
        {
            return ServiceResult<string>.Fail(401, "Invalid password");
        }

        return ServiceResult<string>.Success(url.RedirectUrl);
    }
}
