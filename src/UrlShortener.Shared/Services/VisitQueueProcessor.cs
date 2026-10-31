using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;

namespace UrlShortener.Shared.Services;

public sealed class VisitQueueProcessor(IDbContextFactory<AppDbContext> contexts)
{
    public async Task<int> ProcessBatchAsync(CancellationToken ct = default)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Row locks allow multiple PostgreSQL workers. Crash/cancellation rolls the entire batch back.
        var rows = db.Database.IsNpgsql()
            ? await db.VisitQueue.FromSqlRaw("SELECT * FROM visit_queue WHERE processing_status = 'pending' ORDER BY received_at, id LIMIT 100 FOR UPDATE SKIP LOCKED").ToListAsync(ct)
            : await db.VisitQueue.Where(q => q.ProcessingStatus == "pending").OrderBy(q => q.ReceivedAt).ThenBy(q => q.Id).Take(100).ToListAsync(ct);
        foreach (var row in rows)
        {
            if (!await db.Visits.AnyAsync(v => v.Id == row.Id, ct))
                db.Visits.Add(new Visit
                {
                    Id = row.Id, LinkId = row.LinkId, EventType = row.EventType,
                    ShortPath = row.ShortPath, IpAddress = row.IpAddress, UserAgent = row.UserAgent,
                    Environment = row.Environment, VersionNumber = row.VersionNumber, UserId = row.UserId,
                    Browser = row.Browser, Os = row.Os, VisitedAt = row.ReceivedAt
                });
            row.ProcessingStatus = "processed";
            row.ProcessedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return rows.Count;
    }

    public async Task<(int Count, DateTimeOffset? Oldest)> BacklogAsync(CancellationToken ct = default)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var pending = db.VisitQueue.Where(q => q.ProcessingStatus == "pending");
        return (await pending.CountAsync(ct), await pending.Select(q => (DateTimeOffset?)q.ReceivedAt).MinAsync(ct));
    }
}
