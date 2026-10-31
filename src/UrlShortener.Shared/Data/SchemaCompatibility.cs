using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace UrlShortener.Shared.Data;

/// <summary>Read-only release preflight; never initializes or upgrades a database.</summary>
public static class SchemaCompatibility
{
    public static async Task VerifyAsync(AppDbContext db, CancellationToken ct = default)
    {
        await VerifyStructureAsync(db, ct);
        if (await db.Urls.AnyAsync(u => u.Password != null, ct))
            throw new InvalidOperationException("Private-link password upgrade is incomplete.");
        if (await db.ApiKeys.AnyAsync(k => !k.Key.StartsWith("sha256:"), ct))
            throw new InvalidOperationException("API-key upgrade is incomplete.");
    }

    public static async Task VerifyStructureAsync(AppDbContext db, CancellationToken ct = default)
    {
        // Zero-row queries still validate every mapped column, including the
        // session_stamp and private password_hash columns required by this release.
        await db.Admins.AsNoTracking().OrderBy(a => a.Id).Take(0).ToListAsync(ct);
        await db.Urls.AsNoTracking().OrderBy(u => u.ShortPath).Take(0).ToListAsync(ct);
        await db.ApiKeys.AsNoTracking().OrderBy(k => k.Id).Take(0).ToListAsync(ct);
        await db.Visits.AsNoTracking().Take(0).ToListAsync(ct);
        await db.VisitQueue.AsNoTracking().Take(0).ToListAsync(ct);
        await db.UserIpMappings.AsNoTracking().Take(0).ToListAsync(ct);
        await db.PasswordResetTokens.AsNoTracking().Take(0).ToListAsync(ct);
        await db.LinkRevisions.AsNoTracking().Take(0).ToListAsync(ct);
        await db.ScheduledLinkChanges.AsNoTracking().Take(0).ToListAsync(ct);
        await db.ApiOperations.AsNoTracking().Take(0).ToListAsync(ct);
        await db.ApiIdempotency.AsNoTracking().Take(0).ToListAsync(ct);
        if (db.Database.IsNpgsql())
        {
            var table = db.Model.FindEntityType(typeof(Entities.Admin))!;
            var indexes = await db.Database.SqlQueryRaw<int>(
                "SELECT count(*)::integer AS \"Value\" FROM pg_index i " +
                "JOIN pg_class ix ON ix.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid " +
                "JOIN pg_namespace n ON n.oid = t.relnamespace " +
                "WHERE ix.relname = 'idx_github_admins_normalized_email' AND t.relname = {0} AND n.nspname = {1} " +
                "AND i.indisunique AND i.indisvalid", table.GetTableName()!, table.GetSchema() ?? "public").SingleAsync(ct);
            if (indexes != 1) throw new InvalidOperationException("Normalized-email uniqueness upgrade is incomplete.");
        }
    }

    public static async Task<int> RunAsync(IServiceProvider services)
    {
        try
        {
            using var scope = services.CreateScope();
            await VerifyAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>());
            Console.WriteLine("Read-only schema compatibility check passed.");
            return 0;
        }
        catch (Exception)
        {
            // Do not dump connection details or data. SQL/provider logs remain
            // available locally; the deployment failure message names the remedy.
            Console.Error.WriteLine("Database is unavailable or incompatible with this image. " +
                "Verify the approved security and API-v1 (HUS-66) upgrades and connection configuration; no changes were made by this check.");
            return 1;
        }
    }
}
