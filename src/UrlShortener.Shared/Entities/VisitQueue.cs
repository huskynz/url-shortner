using System.ComponentModel.DataAnnotations.Schema;

namespace UrlShortener.Shared.Entities;

/// <summary>A queued visit awaiting async processing. Mirrors "visit_queue".</summary>
[Table("visit_queue")]
public sealed class VisitQueue
{
    [Column("id")]
    public Guid Id { get; set; }

    [Column("short_path")]
    public string ShortPath { get; set; } = string.Empty;

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

    [Column("received_at")]
    public DateTimeOffset ReceivedAt { get; set; }

    [Column("processed_at")]
    public DateTimeOffset? ProcessedAt { get; set; }

    [Column("processing_status")]
    public string? ProcessingStatus { get; set; }
}
