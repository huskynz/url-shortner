namespace UrlShortener.Shared.Auth;

public static class LoginCallback
{
    public static string SafeTarget(string? callback)
    {
        if (string.IsNullOrEmpty(callback) || callback[0] != '/' ||
            callback.Contains('\\') || callback.Any(char.IsControl)) return "/admin/dashboard";
        var decoded = Uri.UnescapeDataString(callback);
        return decoded.StartsWith("//", StringComparison.Ordinal) || decoded.Contains('\\') || decoded.Any(char.IsControl)
            ? "/admin/dashboard" : callback;
    }
}
