using System.ComponentModel.DataAnnotations.Schema;

namespace UrlShortener.Shared.Entities;

/// <summary>Maps a client IP to a stable user id. Mirrors "user_ip_mapping".</summary>
[Table("user_ip_mapping")]
public sealed class UserIpMapping
{
    [Column("ip_address")]
    public string IpAddress { get; set; } = string.Empty;

    [Column("user_id")]
    public Guid UserId { get; set; }
}
