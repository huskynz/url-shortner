using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;

namespace UrlShortener.Shared.Services;

/// <summary>One atomic admission per released destination, independent of visit logging.</summary>
internal static class LinkAccess
{
    public static bool ValidSettings(DateTimeOffset? start, DateTimeOffset? end, int? quota, string? rules) =>
        (start is null || end is null || start < end) && (quota is null || quota > 0)
        && string.IsNullOrWhiteSpace(rules);

    public static bool Available(Url url, DateTimeOffset now) => !url.Deprecated && !url.Archived
        && (url.ScheduleStart is null || url.ScheduleStart <= now)
        && (url.ScheduleEnd is null || url.ScheduleEnd > now)
        && (url.UsageQuota is null || url.UsageCount < url.UsageQuota)
        && string.IsNullOrWhiteSpace(url.CustomRules) && InputValidation.Destination(url.RedirectUrl);

    public static async Task<bool> ConsumeAsync(AppDbContext db, Url snapshot, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        if (!Available(snapshot, now)) return false;
        // The predicate also guards destination edits and password rotations during verification.
        return await db.Urls.Where(u => u.ShortPath == snapshot.ShortPath && u.Id == snapshot.Id && !u.Deprecated && !u.Archived
                && u.IsPrivate == snapshot.IsPrivate && u.PasswordHash == snapshot.PasswordHash
                && u.RedirectUrl == snapshot.RedirectUrl && u.CustomRules == snapshot.CustomRules
                && (u.ScheduleStart == null || u.ScheduleStart <= now)
                && (u.ScheduleEnd == null || u.ScheduleEnd > now)
                && (u.UsageQuota == null || u.UsageCount < u.UsageQuota))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.UsageCount, u => u.UsageCount + 1), ct) == 1;
    }
}
