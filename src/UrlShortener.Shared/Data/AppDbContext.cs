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
    public string MutationActor { get; set; } = "system";
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
    public DbSet<LinkRevision> LinkRevisions => Set<LinkRevision>();
    public DbSet<ScheduledLinkChange> ScheduledLinkChanges => Set<ScheduledLinkChange>();
    public DbSet<ApiOperation> ApiOperations => Set<ApiOperation>();
    public DbSet<ApiIdempotency> ApiIdempotency => Set<ApiIdempotency>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Url>(e =>
        {
            e.ToTable(_options.UrlsTable);
            e.HasKey(u => u.ShortPath);
            e.HasIndex(u => u.Id).IsUnique();
            e.Property(u => u.EditVersion).IsConcurrencyToken();
        });

        modelBuilder.Entity<Admin>(e =>
        {
            e.ToTable(_options.AdminsTable);
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.Email).IsUnique();
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

        foreach (var type in new[] { typeof(LinkRevision), typeof(ScheduledLinkChange), typeof(ApiOperation), typeof(ApiIdempotency) })
            foreach (var property in modelBuilder.Entity(type).Metadata.GetProperties())
                property.SetColumnName(System.Text.Json.JsonNamingPolicy.SnakeCaseLower.ConvertName(property.Name));
        modelBuilder.Entity<LinkRevision>().HasIndex(r => new { r.LinkId, r.Version }).IsUnique();
        modelBuilder.Entity<ScheduledLinkChange>().HasIndex(s => new { s.Status, s.RunAt });
        modelBuilder.Entity<ScheduledLinkChange>().Property(s => s.Status).IsConcurrencyToken();
        modelBuilder.Entity<ApiOperation>().Property(o => o.Status).IsConcurrencyToken();
        modelBuilder.Entity<ApiOperation>().HasIndex(o => new { o.Actor, o.CreatedAt });
        modelBuilder.Entity<ApiIdempotency>().HasKey(i => new { i.Actor, i.Route, i.Key });

        base.OnModelCreating(modelBuilder);
    }

    private void PrepareLinkRevisions()
    {
        foreach (var entry in ChangeTracker.Entries<Url>().ToArray())
        {
            var added = entry.State == EntityState.Added;
            var editable = entry.State == EntityState.Modified && entry.Properties.Any(p => p.IsModified
                && p.Metadata.Name is not (nameof(Url.UsageCount) or nameof(Url.EditVersion)));
            if (editable)
                entry.Entity.EditVersion = entry.Property(u => u.EditVersion).OriginalValue + 1;
            if ((added || (editable && entry.Property(u => u.RedirectUrl).IsModified))
                && !LinkRevisions.Local.Any(r => r.LinkId == entry.Entity.Id && r.Version == entry.Entity.EditVersion))
                LinkRevisions.Add(new LinkRevision { LinkId = entry.Entity.Id,
                    Version = entry.Entity.EditVersion, DestinationUrl = entry.Entity.RedirectUrl, Actor = MutationActor });
        }
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        PrepareLinkRevisions();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        PrepareLinkRevisions();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }
}
