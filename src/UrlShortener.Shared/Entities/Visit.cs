using System.ComponentModel.DataAnnotations.Schema;

namespace UrlShortener.Shared.Entities;

/// <summary>A processed visit record. Mirrors the Supabase "visits" table.</summary>
public sealed class Visit
{
    [Column("id")]
    public Guid Id { get; set; }

    [Column("short_path")]
    public string? ShortPath { get; set; }

    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("user_agent")]
    public string? UserAgent { get; set; }

    [Column("environment")]
    public string? Environment { get; set; }

    [Column("version_number")]
    public string? VersionNumber { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("browser")]
    public string? Browser { get; set; }

    [Column("os")]
    public string? Os { get; set; }

    [Column("visited_at")]
    public DateTimeOffset? VisitedAt { get; set; }
}
