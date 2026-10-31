namespace UrlShortener.Shared.Services;

public static class PublicLink
{
    public static bool ValidBase(string? value) => value is not null && value == value.Trim()
        && InputValidation.Destination(value) && Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Query.Length == 0 && uri.Fragment.Length == 0;

    public static string Build(string baseUrl, string shortPath)
    {
        if (!ValidBase(baseUrl)) throw new ArgumentException("Configure a valid Public base URL.", nameof(baseUrl));
        if (!InputValidation.Path(shortPath)) throw new ArgumentException("Invalid short path.", nameof(shortPath));
        return new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), Uri.EscapeDataString(shortPath)).AbsoluteUri;
    }
}
