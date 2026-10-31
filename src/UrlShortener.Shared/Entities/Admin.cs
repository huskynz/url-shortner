using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace UrlShortener.Shared.Entities;

/// <summary>An admin user. Mirrors the Supabase "github_admins" (ADMINS_DB) table.</summary>
public sealed class Admin
{
    [Column("enabled"), JsonIgnore]
    public bool Enabled { get; set; } = true;
    [Column("id")]
    public Guid Id { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    /// <summary>Preferred bcrypt hash column.</summary>
    [Column("password_hash")]
    [JsonIgnore]
    public string? PasswordHash { get; set; }

    /// <summary>Legacy bcrypt hash column (kept for parity with older schemas).</summary>
    [Column("password")]
    [JsonIgnore]
    public string? Password { get; set; }

    [Column("session_stamp")]
    [JsonIgnore]
    public Guid SessionStamp { get; set; } = Guid.NewGuid();

    /// <summary>Role: "owner", "admin", or "viewer".</summary>
    [Column("role")]
    public string? Role { get; set; }

    /// <summary>Whether the user has set a password.</summary>
    [Column("passset")]
    public bool? Passset { get; set; }

    [Column("github_username")]
    public string? GithubUsername { get; set; }

    [Column("github_id")]
    public string? GithubId { get; set; }

    [Column("created_at")]
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>Resolves the effective hash, preferring password_hash then legacy password.</summary>
    [NotMapped]
    [JsonIgnore]
    public string? EffectiveHash => string.IsNullOrEmpty(PasswordHash) ? Password : PasswordHash;

    /// <summary>True when the role grants admin access (admin or owner).</summary>
    [NotMapped]
    [JsonIgnore]
    public bool IsAdmin => Role is "admin" or "owner";
}
