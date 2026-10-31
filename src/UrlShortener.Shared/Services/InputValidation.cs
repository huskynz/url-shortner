using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace UrlShortener.Shared.Services;

public static partial class InputValidation
{
    public static string? Email(string? email)
    {
        var normalized = email?.Trim().ToLowerInvariant();
        return normalized is { Length: > 0 and <= 320 } && MailAddress.TryCreate(normalized, out var parsed)
            && parsed.Address == normalized ? normalized : null;
    }

    public static bool Path(string? path) => path is { Length: > 0 and <= 128 }
        && PathFormat().IsMatch(path) && !Reserved.Contains(path);

    public static bool Destination(string? target) => target is { Length: > 0 and <= 4096 }
        && target == target.Trim()
        && !target.Any(char.IsControl) && !target.Contains('\\')
        && Uri.TryCreate(target, UriKind.Absolute, out var uri)
        && uri.Scheme is "http" or "https" && !string.IsNullOrEmpty(uri.Host) && string.IsNullOrEmpty(uri.UserInfo);

    public static readonly IReadOnlySet<string> Reserved = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "invaildlink", "deprecated", "urls", "access-denied", "password-protected", "admin", "api",
        "signin", "auth", "set-password", "error", "health", "_framework", "_blazor", "app.js", "favicon.ico", "robots.txt"
    };

    public static bool IsUniqueConflict(Exception exception) =>
        exception is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }
        || exception.GetType().GetProperty("SqliteExtendedErrorCode")?.GetValue(exception) is 1555 or 2067
        || (exception.InnerException is not null && IsUniqueConflict(exception.InnerException));

    [GeneratedRegex(@"\A[A-Za-z0-9][A-Za-z0-9_-]*\z")]
    private static partial Regex PathFormat();
}
