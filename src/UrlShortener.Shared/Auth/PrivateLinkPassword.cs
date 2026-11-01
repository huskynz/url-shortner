using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace UrlShortener.Shared.Auth;

/// <summary>Versioned bcrypt of a SHA-256 prehash: no bcrypt 72-byte truncation.</summary>
public static partial class PrivateLinkPassword
{
    public const int MaxLength = 1024;
    public const string Prefix = "bcrypt-sha256:";

    public static string Hash(string password) =>
        Prefix + BCrypt.Net.BCrypt.HashPassword(Prehash(password), 10);

    public static bool Verify(string password, string? hash)
    {
        if (hash is null || !HashFormat().IsMatch(hash)) return false;
        try { return BCrypt.Net.BCrypt.Verify(Prehash(password), hash[Prefix.Length..]); }
        catch (BCrypt.Net.SaltParseException) { return false; }
    }

    public static bool VerifyLegacy(string password, string? legacy) =>
        !string.IsNullOrEmpty(legacy) && CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(password)), SHA256.HashData(Encoding.UTF8.GetBytes(legacy)));

    private static string Prehash(string password) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    [GeneratedRegex(@"\Abcrypt-sha256:\$2[aby]\$10\$[./A-Za-z0-9]{53}\z")]
    private static partial Regex HashFormat();
}
