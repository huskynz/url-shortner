using UrlShortener.Shared.Services;

namespace UrlShortener.Shared.Hosting;

/// <summary>Browser execution destinations must be administrator-configured,
/// credential-free HTTPS URLs (HTTP is limited to loopback development).</summary>
public static class BrowserApiTrust
{
    public static bool ValidBase(string? value) => PublicLink.ValidBase(value)
        && Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == "https" || uri.IsLoopback);

    public static bool ValidOrigin(string? value) => ValidBase(value)
        && Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.AbsolutePath == "/";
}
