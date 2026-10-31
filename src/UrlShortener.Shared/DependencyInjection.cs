using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using UrlShortener.Shared.Data;
using UrlShortener.Shared.Options;
using UrlShortener.Shared.Services;
using UrlShortener.Shared.Auth;

namespace UrlShortener.Shared;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the shared data layer and services: EF Core over Postgres,
    /// in-memory caching, options, and all business services. Call from each
    /// host (API, Public, Admin).
    /// </summary>
    public static IServiceCollection AddUrlShortenerCore(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<UrlShortenerOptions>().Bind(configuration.GetSection(UrlShortenerOptions.SectionName))
            .Validate(o => string.IsNullOrEmpty(o.PublicBaseUrl) || PublicLink.ValidBase(o.PublicBaseUrl),
                "UrlShortener:PublicBaseUrl must be an absolute HTTP(S) URL without credentials, query or fragment.")
            .ValidateOnStart();
        services.AddTrustedProxies(configuration);
        services.AddScoped<VisitQueueProcessor>();
        services.AddHostedService<VisitQueueWorker>();

        var connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Missing connection string 'ConnectionStrings:Postgres'.");

        services.AddDbContextFactory<AppDbContext>(o => o.UseNpgsql(connectionString), ServiceLifetime.Scoped);
        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<AuthenticationAttemptLimiter>();
        services.AddSingleton<ISecurityAuditSink, LoggingSecurityAuditSink>();
        services.AddScoped<SecurityAudit>();

        services.AddScoped<RedirectService>();
        services.AddScoped<VisitLogger>();
        services.AddScoped<UrlAdminService>();
        services.AddScoped<ApiKeyService>();
        services.AddScoped<AdminService>();
        services.AddScoped<AnalyticsService>();
        services.AddScoped<ApiV1Links>();
        services.AddScoped<ApiV1Schedules>();
        services.AddScoped<ApiV1Operations>();
        services.AddScoped<ApiV1Analytics>();
        services.AddScoped<ApiV1Keys>();
        services.AddScoped<ApiV1Users>();
        services.AddScoped<AuthService>();
        services.AddScoped<SessionValidator>();
        services.AddSingleton<RateLimiter>();

        return services;
    }

    /// <summary>
    /// Applies the schema at startup unless disabled via config "Database:AutoMigrate"
    /// (default true). Idempotent; retries while the database comes up. Call once from
    /// each host after Build(), before Run().
    /// </summary>
    public static async Task EnsureDatabaseAsync(this IHost app)
    {
        var config = app.Services.GetRequiredService<IConfiguration>();
        var autoMigrate = config.GetValue("Database:AutoMigrate", true);
        if (!autoMigrate)
        {
            return;
        }

        await DatabaseInitializer.EnsureSchemaAsync(app.Services);
    }
}
