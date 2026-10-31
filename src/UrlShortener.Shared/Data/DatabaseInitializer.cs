using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace UrlShortener.Shared.Data;

/// <summary>
/// Applies the canonical schema (embedded db/schema.sql) to the target database.
/// The script is fully idempotent (CREATE ... IF NOT EXISTS), so it is safe to run
/// on every startup and to migrate an existing Supabase-imported database.
/// </summary>
public static class DatabaseInitializer
{
    private const string ResourceName = "UrlShortener.Shared.schema.sql";

    /// <summary>Reads the embedded schema.sql.</summary>
    public static string GetSchemaSql()
    {
        var assembly = typeof(DatabaseInitializer).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{ResourceName}' not found.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    /// <summary>Executes the schema against the given context (single batched command).</summary>
    public static async Task ApplySchemaAsync(AppDbContext db, CancellationToken ct = default)
    {
        // ExecuteSqlRaw treats braces as composite-format placeholders, including
        // braces in SQL regex/JSON literals. Escape the trusted embedded script.
        await db.Database.ExecuteSqlRawAsync(GetSchemaSql().Replace("{", "{{").Replace("}", "}}"), ct);
    }

    /// <summary>
    /// Resolves an AppDbContext from DI and applies the schema, retrying while the
    /// database is still coming up. Best-effort: logs and rethrows only after retries.
    /// </summary>
    public static async Task EnsureSchemaAsync(
        IServiceProvider services,
        int maxAttempts = 10,
        TimeSpan? delay = null,
        CancellationToken ct = default)
    {
        var wait = delay ?? TimeSpan.FromSeconds(3);
        var logger = services.GetService<ILoggerFactory>()?.CreateLogger("DatabaseInitializer");

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var scope = services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await ApplySchemaAsync(db, ct);
                logger?.LogInformation("Database schema ensured (attempt {Attempt}).", attempt);
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger?.LogWarning(ex, "Schema apply failed (attempt {Attempt}/{Max}); retrying in {Delay}s.",
                    attempt, maxAttempts, wait.TotalSeconds);
                await Task.Delay(wait, ct);
            }
        }
    }
}
