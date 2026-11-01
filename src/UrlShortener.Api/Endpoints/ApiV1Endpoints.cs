using System.Text;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using QRCoder;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Options;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

public static class ApiV1Endpoints
{
    public static void MapApiV1(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1").RequireRateLimiting("api-v1").AddEndpointFilter(ApiV1Runtime.Guard);
        var links = api.MapGroup("/links");
        links.MapGet("", async (int? page, [FromQuery(Name = "page_size")] int? size, string? search, string? status,
            string? privacy, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
                await svc.List(page ?? 1, size ?? 50, search, status, privacy, ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:urls:read").WithSummary("List authorized links");
        links.MapPost("", async (LinkCreate body, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
            ApiV1Runtime.Link(http, await svc.Create(body, ApiV1Access.Actor(http.User), ApiV1Runtime.Key(http), ApiV1Access.Private(http.User), ct), true))
            .RequireAuthorization("v1:urls:write").Produces<LinkView>(201).WithSummary("Create an idempotent short link");
        links.MapGet("/{id:guid}", async (Guid id, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
            ApiV1Runtime.Link(http, await svc.Get(id, ApiV1Access.Private(http.User), ct)))
            .RequireAuthorization("v1:urls:read").Produces<LinkView>().WithSummary("Get a link and its strong ETag");
        links.MapPatch("/{id:guid}", async (Guid id, LinkPatch body, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
            ApiV1Runtime.Link(http, await svc.Patch(id, ApiV1Runtime.Version(http), body, ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct)))
            .RequireAuthorization("v1:urls:write").Produces<LinkView>().WithSummary("Edit a link using If-Match");
        links.MapDelete("/{id:guid}", async (Guid id, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
        { await svc.Delete(id, ApiV1Runtime.Version(http), ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct); return Results.NoContent(); })
            .RequireAuthorization("v1:urls:write").Produces(204).WithSummary("Permanently delete a link using If-Match; prefer archive");
        foreach (var action in new[] { "archive", "restore" })
        {
            var archive = action == "archive";
            links.MapPost("/{id:guid}/" + action, async (Guid id, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
                ApiV1Runtime.Link(http, await svc.Patch(id, ApiV1Runtime.Version(http), new(), ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct, archive)))
                .RequireAuthorization("v1:urls:write").Produces<LinkView>().WithSummary(archive ? "Archive a link" : "Restore an archived link");
        }
        links.MapPost("/{id:guid}/check", async (Guid id, LinkCheckRequest body, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
            await svc.Check(id, body.At, ApiV1Access.Private(http.User), ct)).RequireAuthorization("v1:urls:read")
            .WithSummary("Evaluate admission without consuming quota or recording visits");
        links.MapGet("/{id:guid}/qr", async (Guid id, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
        {
            var link = await svc.Get(id, ApiV1Access.Private(http.User), ct);
            using var generator = new QRCodeGenerator();
            using var data = generator.CreateQrCode(link.ShortUrl, QRCodeGenerator.ECCLevel.Q);
            using var png = new PngByteQRCode(data);
            return Results.File(png.GetGraphic(8), "image/png", $"link-{id}.png");
        }).RequireAuthorization("v1:urls:read").Produces(200, contentType: "image/png").WithSummary("Download a QR for the Public short URL");
        links.MapPost("/{id:guid}/verify-password", async (Guid id, PasswordProof body, UrlAdminService svc,
            IDbContextFactory<AppDbContext> contexts, HttpContext http, CancellationToken ct) =>
        {
            await using var db = await contexts.CreateDbContextAsync(ct);
            var path = await db.Urls.Where(u => u.Id == id && u.IsPrivate && !u.Archived).Select(u => u.ShortPath).SingleOrDefaultAsync(ct);
            if (path is null) throw new ApiFault(401, "invalid_link_proof", "Invalid link or password.");
            var result = await svc.VerifyPasswordAsync(path, body.Password, ct, id);
            if (!result.Ok)
            {
                if (result.Status == 429) http.Response.Headers.RetryAfter = "300";
                throw new ApiFault(result.Status == 429 ? 429 : 401, "invalid_link_proof", "Invalid link or password.");
            }
            return Results.Ok(new PasswordAdmission(true, result.Value!));
        }).AllowAnonymous().Produces<PasswordAdmission>().WithSummary("Admit a password-protected link; consumes quota and records a visit");
        links.MapGet("/{id:guid}/history", async (Guid id, int? page, [FromQuery(Name = "page_size")] int? size,
            HttpContext http, ApiV1Links svc, CancellationToken ct) => await svc.History(id, page ?? 1, size ?? 50, ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:urls:read", "v1:urls:history").WithSummary("List destination revisions");
        links.MapPost("/{id:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid revisionId,
            HttpContext http, ApiV1Links svc, CancellationToken ct) => ApiV1Runtime.Link(http,
                await svc.RestoreRevision(id, revisionId, ApiV1Runtime.Version(http), ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct)))
            .RequireAuthorization("v1:urls:write", "v1:urls:history").Produces<LinkView>().WithSummary("Restore a destination as a new revision");
        links.MapGet("/{id:guid}/scheduled-changes", async (Guid id, int? page, [FromQuery(Name = "page_size")] int? size,
            HttpContext http, ApiV1Schedules svc, CancellationToken ct) => await svc.List(id, page ?? 1, size ?? 50, ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:urls:read").WithSummary("List scheduled destination changes");
        links.MapPost("/{id:guid}/scheduled-changes", async (Guid id, DestinationChange body, HttpContext http, ApiV1Schedules svc, CancellationToken ct) =>
        {
            var change = await svc.Create(id, ApiV1Runtime.Version(http), body, ApiV1Access.Actor(http.User), ApiV1Runtime.Key(http), ApiV1Access.Private(http.User), ct);
            return Results.Created($"{http.Request.PathBase}/api/v1/links/{id}/scheduled-changes", change);
        }).RequireAuthorization("v1:urls:write").Produces<ScheduledLinkChange>(201).WithSummary("Schedule a guarded destination change");
        links.MapDelete("/{id:guid}/scheduled-changes/{changeId:guid}", async (Guid id, Guid changeId, HttpContext http, ApiV1Schedules svc, CancellationToken ct) =>
        { await svc.Cancel(id, changeId, ApiV1Access.Private(http.User), ct); return Results.NoContent(); })
            .RequireAuthorization("v1:urls:write").Produces(204).WithSummary("Cancel a pending destination change");
        links.MapGet("/export", async (string? search, string? status, string? privacy, HttpContext http, ApiV1Links svc, CancellationToken ct) =>
        {
            // Export never silently truncates. Larger inventories use paginated API
            // traversal until streaming/background export is explicitly introduced.
            var rows = await svc.List(1, 200, search, status, privacy, ApiV1Access.Private(http.User), ct);
            ApiV1Links.Require(!rows.HasNext, 400, "export_limit", "Export limit is 200 links; narrow filters or traverse the paginated API.");
            return Results.File(Encoding.UTF8.GetBytes(ApiCsv.Links(rows.Items)), "text/csv", "links.csv");
        }).RequireAuthorization("v1:urls:read", "v1:urls:export").Produces(200, contentType: "text/csv").WithSummary("Export bounded authorized link inventory");

        MapAnalytics(api);
        MapOperations(api);
        MapKeys(api);
        MapUsers(api);
        api.MapGet("/system/status", async (VisitQueueProcessor queue, IOptions<UrlShortenerOptions> options,
            IDbContextFactory<AppDbContext> contexts, CancellationToken ct) =>
        {
            await using var db = await contexts.CreateDbContextAsync(ct);
            await SchemaCompatibility.VerifyStructureAsync(db, ct);
            var backlog = await queue.BacklogAsync(ct);
            return new SystemStatus(options.Value.VersionNumber, true, options.Value.VisitQueueConsumerEnabled,
                backlog.Count, backlog.Oldest, await db.VisitQueue.MaxAsync(q => q.ProcessedAt, ct), DateTimeOffset.UtcNow);
        }).RequireAuthorization(AuthConstants.AdminSessionPolicy).WithSummary("Restricted safe system diagnostics");
    }

    private static void MapAnalytics(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/analytics").RequireAuthorization("v1:analytics:read");
        group.MapGet("/dashboard", async ([FromQuery(Name = "time_range")] int? days, string? resolution,
            AnalyticsService svc, CancellationToken ct) =>
        {
            ApiV1Links.Require(days is null or >= 0 and <= 3650 && resolution is null or "hour" or "day" or "month" or "year",
                400, "invalid_analytics_range", "time_range must be 0 (all time)..3650 days; choose hour/day/month/year.");
            var a = await svc.GetAnalyticsAsync(days ?? 30, ct, dateBucket: resolution ?? "day", maxBuckets: 10000);
            return new AnalyticsDashboard(a.TotalUrls, a.TotalVisits, a.ActiveUrls, a.DeprecatedUrls, a.AverageClicks,
                a.UndatedVisits, a.DateBucket, a.CategoriesGrouped, a.VisitStats, a.BrowserDistribution, a.OsDistribution,
                a.VisitsOverTime, a.WeekdayDistribution, a.HourDistribution,
                a.RecentVisits.Select(v => new DashboardActivity(v.ShortPath, v.Environment, v.VersionNumber, v.VisitedAt)).ToList());
        }).RequireAuthorization(AuthConstants.AdminSessionPolicy)
            .WithSummary("Admin dashboard aggregates including historical traffic; recent activity omits visitor identifiers");
        group.MapGet("/overview", async (DateTimeOffset? from, DateTimeOffset? to, HttpContext http, ApiV1Analytics svc, CancellationToken ct) =>
        {
            var a = await svc.Get(from, to, "day", null, ApiV1Access.Private(http.User), ct);
            return new AnalyticsOverview(a.From, a.To, a.GeneratedAt, a.RedirectVisits, a.DirectoryViews, a.LegacyVisits);
        }).WithSummary("Aggregate traffic totals and freshness");
        group.MapGet("/traffic", async (DateTimeOffset? from, DateTimeOffset? to, string? resolution, HttpContext http, ApiV1Analytics svc, CancellationToken ct) =>
        {
            var a = await svc.Get(from, to, resolution ?? "day", null, ApiV1Access.Private(http.User), ct);
            return new AnalyticsTraffic(a.From, a.To, a.Resolution, a.GeneratedAt, a.Complete, a.Traffic);
        }).WithSummary("Complete UTC traffic buckets including quiet periods");
        group.MapGet("/breakdowns", async (DateTimeOffset? from, DateTimeOffset? to, HttpContext http, ApiV1Analytics svc, CancellationToken ct) =>
        {
            var a = await svc.Get(from, to, "day", null, ApiV1Access.Private(http.User), ct);
            return new AnalyticsBreakdowns(a.From, a.To, a.GeneratedAt, a.Browsers, a.OperatingSystems);
        }).WithSummary("Privacy-filtered aggregate browser and OS breakdowns");
        group.MapGet("/export", async (DateTimeOffset? from, DateTimeOffset? to, string? resolution, HttpContext http, ApiV1Analytics svc, CancellationToken ct) =>
            Results.File(Encoding.UTF8.GetBytes(ApiV1Analytics.Csv(await svc.Get(from, to, resolution ?? "day", null, ApiV1Access.Private(http.User), ct))), "text/csv", "analytics.csv"))
            .Produces(200, contentType: "text/csv").WithSummary("Export UTC redirect buckets as CSV");
        api.MapGet("/links/{id:guid}/analytics", async (Guid id, DateTimeOffset? from, DateTimeOffset? to, string? resolution,
            HttpContext http, ApiV1Analytics svc, CancellationToken ct) => await svc.Get(from, to, resolution ?? "day", id, ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:analytics:read", "v1:urls:read").WithSummary("Analytics for one immutable link identity");
    }

    private static void MapOperations(RouteGroupBuilder api)
    {
        api.MapPost("/imports/preview", async (CsvPreview body, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
            await svc.PreviewImport(body.Csv, ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:urls:write", "v1:urls:import").WithSummary("Mutation-free CSV import preview");
        api.MapPost("/bulk-operations/preview", async (BulkPreview body, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
            await svc.PreviewBulk(body, ApiV1Access.Actor(http.User), ApiV1Access.Private(http.User), ct))
            .RequireAuthorization("v1:urls:write", "v1:urls:bulk").WithSummary("Mutation-free bulk action preview");
        foreach (var pair in new[] { (Path: "imports", Kind: "import", Scope: "urls:import"), (Path: "bulk-operations", Kind: "bulk", Scope: "urls:bulk") })
            api.MapPost("/" + pair.Path, async (PreviewCommit body, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
            {
                var op = await svc.Commit(body.PreviewId, pair.Kind, ApiV1Access.Actor(http.User), ApiV1Runtime.Key(http), ct);
                return Results.Accepted($"{http.Request.PathBase}/api/v1/operations/{op.Id}", op);
            }).RequireAuthorization("v1:urls:write", "v1:" + pair.Scope).Produces<OperationView>(202).WithSummary("Confirm a preview and queue durable work");
        api.MapGet("/imports", async (int? page, [FromQuery(Name = "page_size")] int? size, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
            await svc.Imports(page ?? 1, size ?? 50, ApiV1Access.Actor(http.User), ApiV1Access.CookieAdmin(http.User), ct))
            .RequireAuthorization("v1:urls:import").WithSummary("List authorized imports");
        api.MapGet("/imports/{id:guid}", async (Guid id, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
        {
            var op = await svc.Get(id, ApiV1Access.Actor(http.User), ApiV1Access.CookieAdmin(http.User), ct);
            ApiV1Links.Require(op.Kind == "import", 404, "import_not_found", "Import not found.");
            return op;
        }).RequireAuthorization("v1:urls:import").WithSummary("Import progress and row outcomes");
        api.MapGet("/operations/{id:guid}", async (Guid id, HttpContext http, ApiV1Operations svc, CancellationToken ct) =>
            await svc.Get(id, ApiV1Access.Actor(http.User), ApiV1Access.CookieAdmin(http.User), ct))
            .RequireAuthorization("v1:urls:write").WithSummary("Authorized durable operation results");
    }

    private static void MapKeys(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/api-keys");
        group.MapGet("", async (int? page, [FromQuery(Name = "page_size")] int? size, string? search, ApiKeyService svc, CancellationToken ct) =>
        { ApiV1Links.Page(page ?? 1, size ?? 50, search); return await svc.GetPageAsync(page ?? 1, size ?? 50, search, ct); })
            .RequireAuthorization(AuthConstants.AdminSessionPolicy).WithSummary("List safe API-key metadata");
        group.MapGet("/{id:guid}", async (Guid id, ApiV1Keys svc, CancellationToken ct) => await svc.Get(id, ct))
            .RequireAuthorization(AuthConstants.AdminSessionPolicy).WithSummary("Get safe API-key metadata");
        group.MapPost("", async (KeyIssue body, HttpContext http, ApiV1Keys svc, CancellationToken ct) =>
        { var key = await svc.Issue(body, ct); return Results.Created($"{http.Request.PathBase}/api/v1/api-keys/{key.Id}", key); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces<IssuedApiKey>(201).WithSummary("Issue a scoped expiring key; reveal secret once");
        group.MapPost("/{id:guid}/revoke", async (Guid id, ApiV1Keys svc, CancellationToken ct) =>
        { await svc.Revoke(id, ct); return Results.NoContent(); }).RequireAuthorization(AuthConstants.OwnerSessionPolicy)
            .Produces(204).WithSummary("Revoke a key without deleting its metadata");
        group.MapPost("/{id:guid}/rotate", async (Guid id, KeyRotate body, HttpContext http, ApiV1Keys svc, CancellationToken ct) =>
        { var key = await svc.Rotate(id, body.OverlapMinutes, ct); return Results.Created($"{http.Request.PathBase}/api/v1/api-keys/{key.Id}", key); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces<IssuedApiKey>(201).WithSummary("Rotate a key with bounded overlap; reveal replacement once");
    }

    private static void MapUsers(RouteGroupBuilder api)
    {
        api.MapGet("/users", async (int? page, [FromQuery(Name = "page_size")] int? size, string? search, string? role, ApiV1Users svc, CancellationToken ct) =>
            await svc.List(page ?? 1, size ?? 50, search, role, ct)).RequireAuthorization(AuthConstants.AdminSessionPolicy).WithSummary("List authorized accounts");
        api.MapGet("/users/{id:guid}", async (Guid id, ApiV1Users svc, CancellationToken ct) => await svc.Get(id, ct))
            .RequireAuthorization(AuthConstants.AdminSessionPolicy).WithSummary("Get safe account details");
        api.MapPost("/users", async (UserCreate body, HttpContext http, ApiV1Users svc, CancellationToken ct) =>
        { var user = await svc.Create(body, ct); return Results.Created($"{http.Request.PathBase}/api/v1/users/{user.Id}", user); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces<UserView>(201).WithSummary("Owner creates an account with an initial password; prefer invitations");
        api.MapDelete("/users/{id:guid}", async (Guid id, ApiV1Users svc, CancellationToken ct) =>
        { await svc.Delete(id, ct); return Results.NoContent(); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces(204).WithSummary("Delete an account and invalidate tokens; protect the last usable owner");
        api.MapPost("/users/{id:guid}/reset-password", async (Guid id, OwnerPasswordReset body, ApiV1Users svc, CancellationToken ct) =>
        { await svc.ResetPassword(id, body, ct); return Results.NoContent(); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces(204).WithSummary("Owner resets a password and revokes sessions and tokens");
        api.MapPatch("/users/{id:guid}", async (Guid id, UserPatch body, ApiV1Users svc, CancellationToken ct) => await svc.Patch(id, body, ct))
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).WithSummary("Change role or enabled state; protect the last usable owner");
        api.MapPost("/invitations", async (InvitationRequest body, HttpContext http, ApiV1Users svc, CancellationToken ct) =>
        { var invite = await svc.Invite(body, ct); return Results.Created($"{http.Request.PathBase}/api/v1/users/{invite.UserId}", invite); })
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces<InvitationView>(201).WithSummary("Create an invitation; reveal setup token once");
        api.MapPost("/auth/accept-invitation", async (TokenPassword body, AdminService svc, CancellationToken ct) =>
        { ApiV1Runtime.Outcome(await svc.ResetPasswordWithTokenAsync(body.Email, body.Password, body.Token, ct, "invitation")); return Results.NoContent(); })
            .AllowAnonymous().Produces(204).WithSummary("Redeem a single-use invitation token");
        api.MapPost("/users/{id:guid}/password-reset-tokens", async (Guid id, ApiV1Users users, AdminService svc, CancellationToken ct) =>
        {
            var user = await users.Get(id, ct);
            ApiV1Links.Require(user.Enabled, 409, "account_disabled", "Account is disabled.");
            var result = await svc.CreatePasswordTokenAsync(user.Email, ct);
            if (!result.Ok) throw new ApiFault(result.Status, "token_issue_failed", result.Error!);
            return Results.Ok(new ResetTokenView(result.Value!));
        }).RequireAuthorization(AuthConstants.OwnerSessionPolicy).Produces<ResetTokenView>().WithSummary("Issue a single-use account-bound reset token");
        api.MapPost("/auth/reset-password", async (TokenPassword body, AdminService svc, CancellationToken ct) =>
        { ApiV1Runtime.Outcome(await svc.ResetPasswordWithTokenAsync(body.Email, body.Password, body.Token, ct)); return Results.NoContent(); })
            .AllowAnonymous().Produces(204).WithSummary("Redeem a single-use password-reset token");
        api.MapGet("/me", async (HttpContext http, ApiV1Users svc, CancellationToken ct) => await svc.Get(ApiV1Users.Identity(http.User), ct))
            .RequireAuthorization(AuthConstants.SelfServicePolicy).WithSummary("Get the signed-in profile");
        api.MapPatch("/me", async (ProfilePatch body, HttpContext http, ApiV1Users svc, CancellationToken ct) =>
            await svc.Profile(ApiV1Users.Identity(http.User), body, ct)).RequireAuthorization(AuthConstants.SelfServicePolicy).WithSummary("Change own email using current-password proof");
        api.MapPost("/me/change-password", async (PasswordChange body, HttpContext http, ApiV1Users users, AdminService svc, CancellationToken ct) =>
        {
            var user = await users.Get(ApiV1Users.Identity(http.User), ct);
            ApiV1Runtime.Outcome(await svc.SetOwnPasswordAsync(http.User, user.Email, body.Password, body.CurrentPassword, ct));
            return Results.NoContent();
        }).RequireAuthorization(AuthConstants.SelfServicePolicy).Produces(204).WithSummary("Change own password and revoke old sessions");
        api.MapGet("/auth/csrf", (HttpContext http, IAntiforgery antiforgery) =>
            new CsrfTokenView(antiforgery.GetAndStoreTokens(http).RequestToken!))
            .RequireAuthorization(AuthConstants.SelfServicePolicy).WithSummary("Get CSRF proof for cookie-authenticated API mutations");
    }
}

public sealed record PasswordAdmission(bool Success, string RedirectUrl);
public sealed record ResetTokenView(string Token);
public sealed record CsrfTokenView(string Token);
public sealed record SystemStatus(string Version, bool Ready, bool VisitConsumerEnabled, int PendingVisits,
    DateTimeOffset? OldestPendingVisit, DateTimeOffset? LastProcessedVisit, DateTimeOffset GeneratedAt);
public sealed record AnalyticsOverview(DateTimeOffset From, DateTimeOffset To, DateTimeOffset GeneratedAt,
    int RedirectVisits, int DirectoryViews, int LegacyVisits);
public sealed record AnalyticsTraffic(DateTimeOffset From, DateTimeOffset To, string Resolution,
    DateTimeOffset GeneratedAt, bool Complete, List<DateCount> Buckets);
public sealed record AnalyticsBreakdowns(DateTimeOffset From, DateTimeOffset To, DateTimeOffset GeneratedAt,
    List<NamedCount> Browsers, List<NamedCount> OperatingSystems);
public sealed record DashboardActivity(string? ShortPath, string? Environment, string? VersionNumber, DateTimeOffset? VisitedAt);
public sealed record AnalyticsDashboard(int TotalUrls, int TotalVisits, int ActiveUrls, int DeprecatedUrls, double AverageClicks,
    int UndatedVisits, string DateBucket, bool CategoriesGrouped, List<NamedCount> VisitStats,
    List<NamedCount> BrowserDistribution, List<NamedCount> OsDistribution, List<DateCount> VisitsOverTime,
    List<NamedCount> WeekdayDistribution, List<NamedCount> HourDistribution, List<DashboardActivity> RecentVisits);
