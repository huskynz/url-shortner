using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace UrlShortener.Shared.Entities;

/// <summary>An API key. Mirrors the Supabase API key table (APIKEY_DB).</summary>
public sealed class ApiKey
{
    [Column("id")]
    public Guid Id { get; set; }

    [Column("name")]
    public string? Name { get; set; }

    [Column("key")]
    [JsonIgnore]
    // One-way digest only. Bearer secrets are returned once on creation.
    public string Key { get; set; } = string.Empty;

    [Column("is_active")]
    public bool IsActive { get; set; }

    [Column("scopes")]
    public string Scopes { get; set; } = "urls:read";

    [Column("created_at")]
    public DateTimeOffset? CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset? ExpiresAt { get; set; }

    [Column("use_count")]
    public long UseCount { get; set; }

    [Column("last_used")]
    public DateTimeOffset? LastUsed { get; set; }

    [Column("last_ip")]
    public string? LastIp { get; set; }

    /// <summary>Arbitrary metadata (jsonb), e.g. last_user_agent. Stored as raw JSON text.</summary>
    [Column("metadata", TypeName = "jsonb")]
    public string? Metadata { get; set; }
}
