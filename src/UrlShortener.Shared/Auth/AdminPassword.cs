namespace UrlShortener.Shared.Auth;

/// <summary>New credentials use exact UTF-8 prehashing; old bcrypt remains login-compatible.</summary>
public static class AdminPassword
{
    public const int MinLength = 12;
    public const int MaxLength = 1024;
    public const string Error = "Use a password between 12 and 1,024 characters.";

    public static bool ValidNew(string? password) => password is { Length: >= MinLength and <= MaxLength };
    public static bool ValidInput(string? password) => password is { Length: > 0 and <= MaxLength };

    public static bool ValidStoredHash(string? hash) => hash is not null &&
        System.Text.RegularExpressions.Regex.IsMatch(hash,
            @"\A(?:bcrypt-sha256:)?\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}\z");

    public static string Hash(string password)
    {
        if (!ValidNew(password)) throw new ArgumentException(Error, nameof(password));
        return PrivateLinkPassword.Hash(password);
    }

    public static bool Verify(string? password, string? hash)
    {
        if (!ValidInput(password) || string.IsNullOrEmpty(hash)) return false;
        if (hash.StartsWith(PrivateLinkPassword.Prefix, StringComparison.Ordinal))
            return PrivateLinkPassword.Verify(password!, hash);
        // Legacy bcrypt may have truncated at 72 UTF-8 bytes. Do not silently
        // reinterpret old credentials; every explicit password change upgrades them.
        try { return BCrypt.Net.BCrypt.Verify(password, hash); }
        catch (BCrypt.Net.SaltParseException) { return false; }
    }
}
