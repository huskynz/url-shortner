namespace UrlShortener.Shared.Models;

/// <summary>
/// The shaped redirect result returned by <see cref="Services.RedirectService"/>,
/// mirroring the payload the original utils.js produced.
/// </summary>
public sealed class RedirectPayload
{
    public string RedirectUrl { get; set; } = string.Empty;
    public bool Deprecated { get; set; }
    public bool Private { get; set; }
    public string? ShortPath { get; set; }
}
