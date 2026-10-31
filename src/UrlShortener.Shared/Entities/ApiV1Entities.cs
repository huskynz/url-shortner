using System.ComponentModel.DataAnnotations.Schema;

namespace UrlShortener.Shared.Entities;

[Table("link_revisions")]
public sealed class LinkRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LinkId { get; set; }
    public long Version { get; set; }
    public string DestinationUrl { get; set; } = "";
    public string Actor { get; set; } = "system";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

[Table("scheduled_link_changes")]
public sealed class ScheduledLinkChange
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LinkId { get; set; }
    public long ExpectedVersion { get; set; }
    public string DestinationUrl { get; set; } = "";
    public string Actor { get; set; } = "";
    public DateTimeOffset RunAt { get; set; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

[Table("api_operations")]
public sealed class ApiOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Actor { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Status { get; set; } = "preview";
    public string Payload { get; set; } = "";
    public string Results { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddHours(24);
    public DateTimeOffset? CompletedAt { get; set; }
}

[Table("api_idempotency")]
public sealed class ApiIdempotency
{
    public string Actor { get; set; } = "";
    public string Route { get; set; } = "";
    public string Key { get; set; } = "";
    public string Fingerprint { get; set; } = "";
    public Guid ResourceId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
