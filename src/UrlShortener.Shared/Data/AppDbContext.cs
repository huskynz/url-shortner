using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Data;

/// <summary>
/// EF Core context over the local Postgres database. Table names for the
/// configurable entities (urls, admins, api keys) come from
/// <see cref="UrlShortenerOptions"/> so they can match an imported Supabase schema.
/// </summary>
public sealed class AppDbContext : DbContext
{
    private readonly UrlShortenerOptions _options;

    public AppDbContext(DbContextOptions<AppDbContext> dbOptions, IOptions<UrlShortenerOptions> options)
        : base(dbOptions)
    {
        _options = options.Value;
    }

    public DbSet<Url> Urls => Set<Url>();
    public DbSet<Admin> Admins => Set<Admin>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<Visit> Visits => Set<Visit>();
    public DbSet<VisitQueue> VisitQueue => Set<VisitQueue>();
    public DbSet<UserIpMapping> UserIpMappings => Set<UserIpMapping>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Url>(e =>
        {
            e.ToTable(_options.UrlsTable);
            e.HasKey(u => u.ShortPath);
        });

        modelBuilder.Entity<Admin>(e =>
        {
            e.ToTable(_options.AdminsTable);
            e.HasKey(a => a.Id);
        });

        modelBuilder.Entity<ApiKey>(e =>
        {
            e.ToTable(_options.ApiKeysTable);
            e.HasKey(k => k.Id);
        });

        modelBuilder.Entity<Visit>(e =>
        {
            e.ToTable("visits");
            e.HasKey(v => v.Id);
        });

        modelBuilder.Entity<VisitQueue>().HasKey(v => v.Id);

        modelBuilder.Entity<UserIpMapping>(e =>
        {
            e.HasKey(m => m.IpAddress);
            e.HasIndex(m => m.IpAddress).IsUnique();
        });

        modelBuilder.Entity<PasswordResetToken>().HasKey(t => t.Id);

        base.OnModelCreating(modelBuilder);
    }
}
