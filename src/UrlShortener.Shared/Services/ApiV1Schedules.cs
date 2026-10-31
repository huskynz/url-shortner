using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed class ApiV1Schedules(IDbContextFactory<AppDbContext> contexts)
{
    public async Task<PageResult<ScheduledLinkChange>> List(Guid id, int page, int size, bool privateAccess, CancellationToken ct)
    {
        ApiV1Links.Page(page, size);
        await using var db = await contexts.CreateDbContextAsync(ct);
        await ApiV1Links.Find(db, id, privateAccess, ct);
        var query = db.ScheduledLinkChanges.AsNoTracking().Where(s => s.LinkId == id);
        return new(await query.OrderByDescending(s => s.CreatedAt).ThenBy(s => s.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct),
            await query.CountAsync(ct), page, size);
    }

    public async Task<ScheduledLinkChange> Create(Guid id, long version, DestinationChange body, string actor,
        string key, bool privateAccess, CancellationToken ct)
    {
        ApiV1Links.Require(InputValidation.Destination(body.DestinationUrl) && body.RunAt > DateTimeOffset.UtcNow
            && body.RunAt <= DateTimeOffset.UtcNow.AddYears(1), 400, "invalid_schedule", "Choose a valid destination and a future time within one year.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var digest = ApiV1Links.Digest(new { id, version, body });
        var previous = await ApiV1Links.Replay(db, actor, "schedule.create", key, digest, ct);
        var link = await ApiV1Links.Find(db, id, privateAccess, ct);
        if (previous is not null)
            return await db.ScheduledLinkChanges.SingleAsync(s => s.Id == previous.ResourceId && s.LinkId == id, ct);
        ApiV1Links.Require(link.EditVersion == version && !link.Archived, 412, "version_conflict", "Link changed or is archived.");
        var row = new ScheduledLinkChange { LinkId = id, ExpectedVersion = version, DestinationUrl = body.DestinationUrl,
            RunAt = body.RunAt.ToUniversalTime(), Actor = actor };
        db.ScheduledLinkChanges.Add(row);
        ApiV1Links.Remember(db, actor, "schedule.create", key, digest, row.Id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return row;
    }

    public async Task Cancel(Guid id, Guid changeId, bool privateAccess, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await ApiV1Links.Find(db, id, privateAccess, ct);
        var now = DateTimeOffset.UtcNow;
        var changed = await db.ScheduledLinkChanges.Where(s => s.Id == changeId && s.LinkId == id && s.Status == "pending")
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "cancelled").SetProperty(x => x.CompletedAt, now), ct);
        ApiV1Links.Require(changed == 1, 409, "schedule_not_pending", "Change is missing, completed or no longer pending.");
    }

    public async Task<int> ProcessDue(CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var rows = db.Database.IsNpgsql()
            ? await db.ScheduledLinkChanges.FromSqlInterpolated($"SELECT * FROM scheduled_link_changes WHERE status = 'pending' AND run_at <= {now} ORDER BY run_at, id LIMIT 20 FOR UPDATE SKIP LOCKED").ToListAsync(ct)
            : await db.ScheduledLinkChanges.Where(s => s.Status == "pending" && s.RunAt <= now).OrderBy(s => s.RunAt).Take(20).ToListAsync(ct);
        foreach (var row in rows)
        {
            var link = await ApiV1Links.FindOptional(db, row.LinkId, ct);
            if (link is null || link.Archived || link.EditVersion != row.ExpectedVersion) row.Status = "conflict";
            else if (!await ApiV1Access.Current(db, row.Actor, "urls:write", link.IsPrivate, ct)) row.Status = "permission_revoked";
            else
            {
                db.MutationActor = row.Actor;
                link.RedirectUrl = row.DestinationUrl;
                // Even scheduling the same destination invalidates other stale work.
                link.EditVersion++;
                row.Status = "completed";
            }
            row.CompletedAt = now;
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return rows.Count;
    }
}
