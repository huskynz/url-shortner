using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public sealed record ImportRow(string ShortPath, string DestinationUrl, bool Listed, Guid? ExistingId, long? Version);

public sealed class ApiV1Operations(IDbContextFactory<AppDbContext> contexts)
{
    public static OperationView View(ApiOperation op) => new(op.Id, op.Kind, op.Status, op.CreatedAt, op.ExpiresAt,
        op.CompletedAt, JsonSerializer.Deserialize<List<ItemOutcome>>(op.Results, ApiV1Links.Json) ?? []);

    public async Task<OperationView> Get(Guid id, string actor, bool administrator, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var op = await db.ApiOperations.AsNoTracking().SingleOrDefaultAsync(o => o.Id == id && (o.Actor == actor || administrator), ct)
            ?? throw new ApiFault(404, "operation_not_found", "Operation not found.");
        return View(op);
    }

    public async Task<PageResult<OperationView>> Imports(int page, int size, string actor, bool administrator, CancellationToken ct)
    {
        ApiV1Links.Page(page, size);
        await using var db = await contexts.CreateDbContextAsync(ct);
        var query = db.ApiOperations.AsNoTracking().Where(o => o.Kind == "import" && (o.Actor == actor || administrator));
        var rows = await query.OrderByDescending(o => o.CreatedAt).ThenBy(o => o.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows.Select(View).ToList(), await query.CountAsync(ct), page, size);
    }

    public async Task<OperationView> PreviewImport(string csv, string actor, bool privateAccess, CancellationToken ct)
    {
        var rows = ApiCsv.Parse(csv);
        ApiV1Links.Require(rows[0].SequenceEqual(new[] { "short_path", "destination_url", "listed" }), 400, "invalid_csv_header",
            "CSV header must be short_path,destination_url,listed. Passwords and other settings are never imported implicitly.");
        var plan = new List<ImportRow>();
        var errors = new List<ItemOutcome>();
        await using var db = await contexts.CreateDbContextAsync(ct);
        var aliases = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 1; i < rows.Count; i++)
        {
            var row = rows[i];
            if (row.Count != 3 || !InputValidation.Path(row[0]) || !InputValidation.Destination(row[1])
                || !bool.TryParse(row[2], out _) || !aliases.Add(row[0]))
            { errors.Add(new(null, i, 400, "invalid_row")); continue; }
            var link = await db.Urls.AsNoTracking().SingleOrDefaultAsync(u => u.ShortPath == row[0], ct);
            if (link is not null && (link.Archived || (link.IsPrivate && !privateAccess)))
            { errors.Add(new(null, i, 409, "link_unavailable")); continue; }
            plan.Add(new(row[0], row[1], bool.Parse(row[2]), link?.Id, link?.EditVersion));
        }
        var op = new ApiOperation { Actor = actor, Kind = "import", Status = errors.Count == 0 ? "preview" : "invalid",
            Payload = JsonSerializer.Serialize(plan, ApiV1Links.Json), Results = JsonSerializer.Serialize(errors, ApiV1Links.Json) };
        db.ApiOperations.Add(op);
        await db.SaveChangesAsync(ct);
        return View(op);
    }

    public async Task<OperationView> PreviewBulk(BulkPreview body, string actor, bool privateAccess, CancellationToken ct)
    {
        ApiV1Links.Require(body.Action is "archive" or "restore" or "deprecate" or "activate" or "list" or "unlist"
            && body.Links is { Count: > 0 and <= 200 } && body.Links.Select(l => l.Id).Distinct().Count() == body.Links.Count,
            400, "invalid_bulk", "Choose a supported action and 1..200 distinct links with versions.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        var errors = new List<ItemOutcome>();
        foreach (var item in body.Links)
        {
            var link = await db.Urls.AsNoTracking().SingleOrDefaultAsync(u => u.Id == item.Id && (privateAccess || !u.IsPrivate), ct);
            if (link is null || link.EditVersion != item.Version) errors.Add(new(item.Id, 0, 412, "version_conflict"));
        }
        var op = new ApiOperation { Actor = actor, Kind = "bulk", Status = errors.Count == 0 ? "preview" : "invalid",
            Payload = JsonSerializer.Serialize(body, ApiV1Links.Json), Results = JsonSerializer.Serialize(errors, ApiV1Links.Json) };
        db.ApiOperations.Add(op);
        await db.SaveChangesAsync(ct);
        return View(op);
    }

    public async Task<OperationView> Commit(Guid preview, string kind, string actor, string key, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var digest = ApiV1Links.Digest(new { preview, kind });
        var previous = await ApiV1Links.Replay(db, actor, "operation.commit", key, digest, ct);
        var id = previous?.ResourceId ?? preview;
        var op = await db.ApiOperations.SingleOrDefaultAsync(o => o.Id == id && o.Actor == actor && o.Kind == kind, ct)
            ?? throw new ApiFault(404, "preview_not_found", "Preview not found.");
        if (previous is not null) return View(op);
        ApiV1Links.Require(op.Status == "preview" && op.ExpiresAt > DateTimeOffset.UtcNow, 409, "preview_not_valid", "Preview is invalid, expired or already confirmed.");
        var now = DateTimeOffset.UtcNow;
        var changed = await db.ApiOperations.Where(o => o.Id == id && o.Status == "preview" && o.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "pending"), ct);
        ApiV1Links.Require(changed == 1, 409, "preview_not_valid", "Preview was already confirmed.");
        ApiV1Links.Remember(db, actor, "operation.commit", key, digest, id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        op.Status = "pending";
        return View(op);
    }

    public async Task<int> Process(CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var now = DateTimeOffset.UtcNow;
        await db.ApiOperations.Where(o => (o.Status == "preview" || o.Status == "invalid") && o.ExpiresAt <= now)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "expired").SetProperty(o => o.Payload, ""), ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var op = db.Database.IsNpgsql()
            ? (await db.ApiOperations.FromSqlRaw("SELECT * FROM api_operations WHERE status = 'pending' ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED").ToListAsync(ct)).FirstOrDefault()
            : await db.ApiOperations.Where(o => o.Status == "pending").OrderBy(o => o.CreatedAt).FirstOrDefaultAsync(ct);
        if (op is null) return 0;
        db.MutationActor = op.Actor;
        var results = new List<ItemOutcome>();
        var authorized = await ApiV1Access.Current(db, op.Actor, op.Kind == "import" ? "urls:import" : "urls:bulk", false, ct);
        if (!authorized) { op.Status = "permission_revoked"; op.Payload = ""; }
        else if (op.Kind == "import")
        {
            var plan = JsonSerializer.Deserialize<List<ImportRow>>(op.Payload, ApiV1Links.Json)!;
            for (var i = 0; i < plan.Count; i++)
            {
                var row = plan[i];
                await tx.CreateSavepointAsync("import_item", ct);
                var link = await db.Urls.SingleOrDefaultAsync(u => u.ShortPath == row.ShortPath, ct);
                if (link is not null)
                {
                    // Refresh a tracked snapshot after waiting for the row lock.
                    db.Entry(link).State = EntityState.Detached;
                    link = await ApiV1Links.FindOptional(db, link.Id, ct);
                }
                if (link is null && row.ExistingId is null)
                {
                    link = new Url { ShortPath = row.ShortPath, RedirectUrl = row.DestinationUrl, Listed = row.Listed, CreatedAt = DateTimeOffset.UtcNow };
                    db.Urls.Add(link);
                }
                else if (link is null || link.Id != row.ExistingId || link.EditVersion != row.Version || link.Archived
                    || !await ApiV1Access.Current(db, op.Actor, "urls:import", link.IsPrivate, ct))
                { results.Add(new(row.ExistingId, i + 1, 409, "link_conflict")); continue; }
                else { link.RedirectUrl = row.DestinationUrl; link.Listed = row.Listed; }
                try { await db.SaveChangesAsync(ct); }
                catch (DbUpdateException ex) when (ex is DbUpdateConcurrencyException || InputValidation.IsUniqueConflict(ex))
                {
                    // A racing alias creator/legacy writer is a row outcome, not
                    // a poison job that retries forever and blocks other work.
                    await tx.RollbackToSavepointAsync("import_item", ct);
                    foreach (var entry in db.ChangeTracker.Entries().Where(e => e.Entity is Url or LinkRevision).ToArray())
                        entry.State = EntityState.Detached;
                    results.Add(new(row.ExistingId, i + 1, 409, "link_conflict"));
                    continue;
                }
                results.Add(new(link.Id, i + 1, 200, "applied"));
            }
        }
        else
        {
            var plan = JsonSerializer.Deserialize<BulkPreview>(op.Payload, ApiV1Links.Json)!;
            foreach (var item in plan.Links)
            {
                var link = await ApiV1Links.FindOptional(db, item.Id, ct);
                if (link is null || link.EditVersion != item.Version || !await ApiV1Access.Current(db, op.Actor, "urls:bulk", link.IsPrivate, ct))
                { results.Add(new(item.Id, 0, 409, "link_conflict")); continue; }
                switch (plan.Action)
                {
                    case "archive": link.Archived = true; break;
                    case "restore": link.Archived = false; break;
                    case "deprecate": link.Deprecated = true; break;
                    case "activate": link.Deprecated = false; break;
                    case "list": link.Listed = true; break;
                    case "unlist": link.Listed = false; break;
                }
                link.EditVersion++;
                results.Add(new(item.Id, 0, 200, "applied"));
            }
        }
        if (authorized) op.Status = results.Any(r => r.Status != 200) ? "completed_with_conflicts" : "completed";
        op.Results = JsonSerializer.Serialize(results, ApiV1Links.Json);
        op.CompletedAt = DateTimeOffset.UtcNow;
        op.Payload = ""; // Remove input destinations once work has finished.
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return 1;
    }
}
