using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

public sealed class ApiFault(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

public sealed class ApiV1Links(IDbContextFactory<AppDbContext> contexts, IOptions<UrlShortenerOptions> options)
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    public static void Require(bool condition, int status, string code, string message)
    {
        if (!condition) throw new ApiFault(status, code, message);
    }

    public static void Page(int page, int size, string? search = null)
        => Require(page is >= 1 and <= 1000000 && size is >= 1 and <= 200 && (search?.Length ?? 0) <= 200,
            400, "invalid_pagination", "page must be 1..1000000, page_size 1..200 and search at most 200 characters.");

    public LinkView View(Url link)
    {
        Require(PublicLink.ValidBase(options.Value.PublicBaseUrl), 503, "public_url_unconfigured", "Canonical Public URL is not configured.");
        return new(link.Id, link.ShortPath, PublicLink.Build(options.Value.PublicBaseUrl!, link.ShortPath), link.RedirectUrl,
            link.IsPrivate, link.Listed, link.Archived, link.Deprecated, link.ScheduleStart, link.ScheduleEnd,
            link.UsageQuota, link.UsageCount, link.EditVersion, Outcome(link, DateTimeOffset.UtcNow));
    }

    public static string Outcome(Url link, DateTimeOffset at) => link.Archived ? "archived"
        : link.Deprecated ? "deprecated" : link.ScheduleStart > at ? "not_started"
        : link.ScheduleEnd <= at ? "expired" : link.UsageQuota is not null && link.UsageCount >= link.UsageQuota ? "quota_exhausted"
        : !LinkAccess.Available(link, at) ? "unavailable" : link.IsPrivate ? "password_required" : "redirect";

    public async Task<PageResult<LinkView>> List(int page, int size, string? search, string? status, string? privacy,
        bool privateAccess, CancellationToken ct)
    {
        Page(page, size, search);
        Require(status is null or "active" or "deprecated" or "archived", 400, "invalid_status", "Choose active, deprecated or archived.");
        Require(privacy is null or "public" or "private", 400, "invalid_privacy", "Choose public or private.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        var query = db.Urls.AsNoTracking();
        if (!privateAccess || privacy == "public") query = query.Where(u => !u.IsPrivate);
        if (privacy == "private") query = query.Where(u => u.IsPrivate);
        if (status == "active") query = query.Where(u => !u.Deprecated && !u.Archived);
        if (status == "deprecated") query = query.Where(u => u.Deprecated && !u.Archived);
        if (status == "archived") query = query.Where(u => u.Archived);
        var term = search?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(term)) query = query.Where(u => u.ShortPath.ToLower().Contains(term) || u.RedirectUrl.ToLower().Contains(term));
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(u => u.ShortPath).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(items.Select(View).ToList(), total, page, size);
    }

    public static async Task<Url> Find(AppDbContext db, Guid id, bool privateAccess, CancellationToken ct)
    {
        var link = await FindOptional(db, id, ct);
        return link is not null && (privateAccess || !link.IsPrivate) ? link : throw new ApiFault(404, "link_not_found", "Link not found.");
    }

    internal static async Task<Url?> FindOptional(AppDbContext db, Guid id, CancellationToken ct)
    {
        if (db.Database.IsNpgsql() && db.Database.CurrentTransaction is not null)
        {
            // Serialize editable state before inserting its unique revision. An
            // optimistic UPDATE alone can lose to the revision INSERT first.
            var table = db.Model.FindEntityType(typeof(Url))!.GetTableName()!.Replace("\"", "\"\"");
            // Only the quoted model identifier is composed; the caller's ID is a parameter.
#pragma warning disable EF1002
            var rows = await db.Urls.FromSqlRaw($"SELECT * FROM \"{table}\" WHERE link_id = {{0}} FOR UPDATE", id).ToListAsync(ct);
#pragma warning restore EF1002
            return rows.SingleOrDefault();
        }
        return await db.Urls.SingleOrDefaultAsync(u => u.Id == id, ct);
    }

    public async Task<LinkView> Get(Guid id, bool privateAccess, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        return View(await Find(db, id, privateAccess, ct));
    }

    public static void Validate(LinkCreate body, bool privateAccess)
    {
        Require(body.ShortPath is null || InputValidation.Path(body.ShortPath), 400, "invalid_short_path", "Invalid or reserved short path.");
        Require(InputValidation.Destination(body.DestinationUrl), 400, "invalid_destination", "A valid HTTP(S) destination without credentials is required.");
        Require(LinkAccess.ValidSettings(body.ScheduleStart, body.ScheduleEnd, body.UsageQuota, null), 400, "invalid_settings", "Invalid schedule or quota.");
        Require(!body.Private || privateAccess, 403, "private_scope_required", "Private-link permission required.");
        Require(!body.Private || !string.IsNullOrEmpty(body.Password), 400, "password_required", "Password required for private links.");
        Require((body.Password?.Length ?? 0) <= PrivateLinkPassword.MaxLength, 400, "invalid_password", "Password is too long.");
    }

    public static async Task Lock(AppDbContext db, string resource, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext({resource}))", ct);
    }

    // Store only a slow salted fingerprint, never a request containing a password.
    public static string Digest<T>(T body) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body, Json))));
    public static void Key(string key) => Require(key.Length is >= 8 and <= 128 && key.All(c => c is >= '!' and <= '~'),
        400, "invalid_idempotency_key", "Idempotency-Key must contain 8..128 printable ASCII characters.");

    public static async Task<ApiIdempotency?> Replay(AppDbContext db, string actor, string route, string key, string digest, CancellationToken ct)
    {
        Key(key);
        await Lock(db, $"api-v1:{actor}:{route}:{key}", ct);
        var record = await db.ApiIdempotency.FindAsync([actor, route, key], ct);
        if (record is not null)
        {
            Require(record.CreatedAt >= DateTimeOffset.UtcNow.AddHours(-24), 409, "idempotency_expired", "This key has expired; use a new key.");
            Require(BCrypt.Net.BCrypt.Verify(digest, record.Fingerprint), 409, "idempotency_conflict", "Key already used for different request content.");
        }
        return record;
    }

    public static void Remember(AppDbContext db, string actor, string route, string key, string digest, Guid resource)
        => db.ApiIdempotency.Add(new ApiIdempotency { Actor = actor, Route = route, Key = key,
            Fingerprint = BCrypt.Net.BCrypt.HashPassword(digest), ResourceId = resource });

    public async Task<LinkView> Create(LinkCreate body, string actor, string key, bool privateAccess, CancellationToken ct)
    {
        Validate(body, privateAccess);
        Require(PublicLink.ValidBase(options.Value.PublicBaseUrl), 503, "public_url_unconfigured", "Canonical Public URL is not configured.");
        await using var db = await contexts.CreateDbContextAsync(ct);
        db.MutationActor = actor;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var digest = Digest(body);
        var previous = await Replay(db, actor, "links.create", key, digest, ct);
        if (previous is not null) return View(await Find(db, previous.ResourceId, privateAccess, ct));
        var alias = body.ShortPath ?? "s" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
        var link = new Url { ShortPath = alias, RedirectUrl = body.DestinationUrl!, IsPrivate = body.Private,
            Listed = body.Listed, PasswordHash = body.Private ? PrivateLinkPassword.Hash(body.Password!) : null,
            ScheduleStart = body.ScheduleStart?.ToUniversalTime(), ScheduleEnd = body.ScheduleEnd?.ToUniversalTime(),
            UsageQuota = body.UsageQuota, CreatedAt = DateTimeOffset.UtcNow };
        db.Urls.Add(link);
        Remember(db, actor, "links.create", key, digest, link.Id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (InputValidation.IsUniqueConflict(ex))
        { throw new ApiFault(409, "alias_conflict", "Alias or idempotency key already exists; retry with the same key after a concurrent request completes."); }
        await tx.CommitAsync(ct);
        return View(link);
    }

    public async Task<LinkView> Patch(Guid id, long version, LinkPatch body, string actor, bool privateAccess,
        CancellationToken ct, bool? archived = null)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        db.MutationActor = actor;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var link = await Find(db, id, privateAccess, ct);
        Require(link.EditVersion == version, 412, "version_conflict", "Link changed; reload and retry.");
        var start = body.ClearSchedule ? null : body.ScheduleStart?.ToUniversalTime() ?? link.ScheduleStart;
        var end = body.ClearSchedule ? null : body.ScheduleEnd?.ToUniversalTime() ?? link.ScheduleEnd;
        var quota = body.ClearQuota ? null : body.UsageQuota ?? link.UsageQuota;
        var privacy = body.Private ?? link.IsPrivate;
        Validate(new LinkCreate { DestinationUrl = body.DestinationUrl ?? link.RedirectUrl,
            Private = privacy, Password = body.Password ?? (link.PasswordHash is not null || link.Password is not null ? "existing" : null),
            ScheduleStart = start, ScheduleEnd = end, UsageQuota = quota }, privateAccess);
        link.RedirectUrl = body.DestinationUrl ?? link.RedirectUrl;
        link.Deprecated = body.Deprecated ?? link.Deprecated;
        link.Listed = body.Listed ?? link.Listed;
        link.Archived = archived ?? link.Archived;
        link.ScheduleStart = start; link.ScheduleEnd = end; link.UsageQuota = quota;
        link.IsPrivate = privacy;
        if (!privacy) { link.Password = null; link.PasswordHash = null; }
        else if (body.Password is not null) { link.PasswordHash = PrivateLinkPassword.Hash(body.Password); link.Password = null; }
        // A no-op still checks the supplied version against concurrent writers.
        db.Entry(link).Property(u => u.EditVersion).IsModified = true;
        link.EditVersion = version + 1;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ApiFault(412, "version_conflict", "Link changed; reload and retry."); }
        await tx.CommitAsync(ct);
        return View(link);
    }

    public async Task Delete(Guid id, long version, string actor, bool privateAccess, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        db.MutationActor = actor;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var link = await Find(db, id, privateAccess, ct);
        Require(link.EditVersion == version, 412, "version_conflict", "Link changed; reload and retry.");
        db.Urls.Remove(link);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ApiFault(412, "version_conflict", "Link changed; reload and retry."); }
        // Retain historical identity/revisions. Queued changes cannot apply to a
        // new link reusing this alias because they reference the deleted ID.
        await tx.CommitAsync(ct);
    }

    public async Task<LinkCheck> Check(Guid id, DateTimeOffset? at, bool privateAccess, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var link = await Find(db, id, privateAccess, ct);
        var time = at?.ToUniversalTime() ?? DateTimeOffset.UtcNow;
        return new(id, time, Outcome(link, time));
    }

    public async Task<PageResult<LinkRevision>> History(Guid id, int page, int size, bool privateAccess, CancellationToken ct)
    {
        Page(page, size);
        await using var db = await contexts.CreateDbContextAsync(ct);
        await Find(db, id, privateAccess, ct);
        var query = db.LinkRevisions.AsNoTracking().Where(r => r.LinkId == id);
        return new(await query.OrderByDescending(r => r.Version).Skip((page - 1) * size).Take(size).ToListAsync(ct),
            await query.CountAsync(ct), page, size);
    }

    public async Task<LinkView> RestoreRevision(Guid id, Guid revision, long version, string actor, bool privateAccess, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await Find(db, id, privateAccess, ct);
        var row = await db.LinkRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.Id == revision && r.LinkId == id, ct)
            ?? throw new ApiFault(404, "revision_not_found", "Revision not found.");
        return await Patch(id, version, new() { DestinationUrl = row.DestinationUrl }, actor, privateAccess, ct);
    }
}
