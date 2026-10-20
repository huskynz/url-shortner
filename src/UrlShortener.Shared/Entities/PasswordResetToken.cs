using System.ComponentModel.DataAnnotations.Schema;

namespace UrlShortener.Shared.Entities;

/// <summary>A one-time password-set token. Mirrors "password_reset_tokens".</summary>
[Table("password_reset_tokens")]
public sealed class PasswordResetToken
{
    [Column("id")]
    public Guid Id { get; set; }

    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Column("token")]
    public string Token { get; set; } = string.Empty;

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("used")]
    public bool Used { get; set; }
}
