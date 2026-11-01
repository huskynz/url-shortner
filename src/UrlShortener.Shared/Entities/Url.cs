using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace UrlShortener.Shared.Entities;

/// <summary>A shortened URL. Mirrors the Supabase "urls" (SUPABASE_DB_NAME) table.</summary>
public sealed class Url
{
    [Column("link_id"), JsonIgnore]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("edit_version"), JsonIgnore]
    public long EditVersion { get; set; } = 1;

    [Column("archived"), JsonIgnore]
    public bool Archived { get; set; }

    [Column("listed"), JsonIgnore]
    public bool Listed { get; set; } = true;

    [Column("short_path")]
    public string ShortPath { get; set; } = string.Empty;

    [Column("redirect_url")]
    public string RedirectUrl { get; set; } = string.Empty;

    /// <summary>Mapped to the "private" column (reserved keyword in C#).</summary>
    [Column("private")]
    [JsonPropertyName("private")]
    public bool IsPrivate { get; set; }

    [Column("deprecated")]
    public bool Deprecated { get; set; }

    /// <summary>Legacy input only; cleared by the HUS-10 upgrade or successful verification.</summary>
    [Column("password")]
    [JsonIgnore]
    public string? Password { get; set; }

    [Column("password_hash")]
    [JsonIgnore]
    public string? PasswordHash { get; set; }

    [Column("schedule_start")]
    public DateTimeOffset? ScheduleStart { get; set; }

    [Column("schedule_end")]
    public DateTimeOffset? ScheduleEnd { get; set; }

    [Column("usage_quota")]
    public int? UsageQuota { get; set; }

    [Column("usage_count")]
    public long UsageCount { get; set; }

    /// <summary>Free-form JSON rules (jsonb), stored as raw JSON text.</summary>
    [Column("custom_rules", TypeName = "jsonb")]
    public string? CustomRules { get; set; }

    [Column("created_at")]
    public DateTimeOffset? CreatedAt { get; set; }
}
