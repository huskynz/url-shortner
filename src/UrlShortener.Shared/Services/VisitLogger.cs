using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

/// <summary>
/// Records visits by mapping an IP to a stable user id and enqueuing a row into
/// visit_queue for async processing. Port of logUserData + getBrowser/getOS in utils.js.
/// </summary>
public sealed class VisitLogger
{
    private readonly IDbContextFactory<AppDbContext> _contexts;
    private static readonly SemaphoreSlim EnqueueSlots = new(32, 32);
    private readonly UrlShortenerOptions _options;
    private readonly ILogger<VisitLogger> _logger;

    public VisitLogger(IDbContextFactory<AppDbContext> contexts, IOptions<UrlShortenerOptions> options, ILogger<VisitLogger> logger)
    {
        _contexts = contexts;
        _options = options.Value;
        _logger = logger;
    }

    public static string GetBrowser(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "Unknown";
        if (userAgent.Contains("Firefox") || userAgent.Contains("FxiOS/")) return "Firefox";
        if (userAgent.Contains("SamsungBrowser")) return "Samsung Browser";
        if (userAgent.Contains("Opera") || userAgent.Contains("OPR")) return "Opera";
        if (userAgent.Contains("Edge/") || userAgent.Contains("Edg/")
            || userAgent.Contains("EdgA/") || userAgent.Contains("EdgiOS/")) return "Edge";
        if (userAgent.Contains("Chrome") || userAgent.Contains("CriOS/")) return "Chrome";
        if (userAgent.Contains("Safari")) return "Safari";
        if (userAgent.Contains("MSIE") || userAgent.Contains("Trident")) return "IE";
        return "Unknown";
    }

    public static string GetOs(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "Unknown";
        if (userAgent.Contains("Windows")) return "Windows";
        if (userAgent.Contains("Android")) return "Android";
        if (userAgent.Contains("iPhone") || userAgent.Contains("iPad")) return "iOS";
        if (userAgent.Contains("Mac")) return "macOS";
        if (userAgent.Contains("Linux")) return "Linux";
        return "Unknown";
    }

    /// <summary>Await durable enqueue before redirecting; bounded database concurrency with backpressure.</summary>
    public async Task LogUserDataAsync(string location, string? ip, string? userAgent, CancellationToken ct = default, Guid? linkId = null)
    {
        ip ??= "Unknown IP";
        userAgent = userAgent is { Length: > 2048 } ? userAgent[..2048] : userAgent ?? "Unknown";
        await EnqueueSlots.WaitAsync(ct);

        try
        {
            await using var _db = await _contexts.CreateDbContextAsync(ct);
            var userId = await GetOrCreateUserIdAsync(_db, ip, ct);
            if (userId is null)
            {
                return;
            }

            _db.VisitQueue.Add(new VisitQueue
            {
                Id = Guid.NewGuid(),
                LinkId = linkId,
                EventType = location == "urls" ? "directory" : "redirect",
                ShortPath = location,
                IpAddress = ip,
                UserAgent = userAgent,
                Environment = _options.Environment,
                VersionNumber = _options.VersionNumber,
                UserId = userId,
                Browser = GetBrowser(userAgent),
                Os = GetOs(userAgent),
                ReceivedAt = DateTimeOffset.UtcNow,
                ProcessingStatus = "pending"
            });

            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enqueueing visit for async processing");
        }
        finally { EnqueueSlots.Release(); }
    }

    /// <summary>Get-or-create equivalent of the upsert on user_ip_mapping (onConflict ip_address).</summary>
    private static async Task<Guid?> GetOrCreateUserIdAsync(AppDbContext _db, string ip, CancellationToken ct)
    {
        var existing = await _db.UserIpMappings.AsNoTracking()
            .FirstOrDefaultAsync(m => m.IpAddress == ip, ct);
        if (existing is not null)
        {
            return existing.UserId;
        }

        var mapping = new UserIpMapping { IpAddress = ip, UserId = Guid.NewGuid() };
        try
        {
            _db.UserIpMappings.Add(mapping);
            await _db.SaveChangesAsync(ct);
            return mapping.UserId;
        }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex))
        {
            // Lost a race to insert; re-read the winning row.
            _db.Entry(mapping).State = EntityState.Detached;
            var winner = await _db.UserIpMappings.AsNoTracking()
                .FirstOrDefaultAsync(m => m.IpAddress == ip, ct);
            return winner?.UserId;
        }
    }
}
