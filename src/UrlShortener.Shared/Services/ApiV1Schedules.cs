using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed class ApiV1Schedules(IDbContextFactory<AppDbContext> contexts, TimeProvider? timeProvider = null)
{
    private readonly TimeProvider time = timeProvider ?? TimeProvider.System;
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
        var now = time.GetUtcNow();
        ApiV1Links.Require(InputValidation.Destination(body.DestinationUrl) && body.RunAt > now
            && body.RunAt <= now.AddYears(1), 400, "invalid_schedule", "Choose a valid destination and a future time within one year.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApiV1Links.Lock(db, "scheduled-destinations", ct);
        var digest = ApiV1Links.Digest(new { id, version, body });
        var previous = await ApiV1Links.Replay(db, actor, "schedule.create", key, digest, ct);
        var link = await ApiV1Links.Find(db, id, privateAccess, ct);
        if (previous is not null)
            return await db.ScheduledLinkChanges.SingleAsync(s => s.Id == previous.ResourceId && s.LinkId == id, ct);
        ApiV1Links.Require(link.EditVersion == version && !link.Archived, 412, "version_conflict", "Link changed or is archived.");
        ApiV1Links.Require(!await db.ScheduledLinkChanges.AnyAsync(s => s.LinkId == id && s.Status == "pending", ct),
            409, "schedule_exists", "Cancel the pending change before scheduling its replacement.");
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
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApiV1Links.Lock(db, "scheduled-destinations", ct);
        await ApiV1Links.Find(db, id, privateAccess, ct);
        var now = time.GetUtcNow();
        var changed = await db.ScheduledLinkChanges.Where(s => s.Id == changeId && s.LinkId == id && s.Status == "pending")
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "cancelled").SetProperty(x => x.CompletedAt, now), ct);
        ApiV1Links.Require(changed == 1, 409, "schedule_not_pending", "Change is missing, completed or no longer pending.");
        await tx.CommitAsync(ct);
    }

    public async Task<int> ProcessDue(CancellationToken ct, string? shortPath = null)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var now = time.GetUtcNow();
        var query = db.ScheduledLinkChanges.Where(s => s.Status == "pending" && s.RunAt <= now);
        if (shortPath is not null) query = query.Where(s => db.Urls.Any(u => u.Id == s.LinkId && u.ShortPath == shortPath));
        // Ordinary redirects need no shared application lock when no change is due.
        // ConsumeAsync still closes a boundary reached after this fast-path read.
        if (!await query.AnyAsync(ct)) return 0;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApiV1Links.Lock(db, "scheduled-destinations", ct);
        now = time.GetUtcNow();
        var rows = await query.OrderBy(s => s.RunAt).ThenBy(s => s.Id).Take(20).ToListAsync(ct);
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
