namespace UrlShortener.Shared.Models;

/// <summary>
/// The shaped redirect result returned by <see cref="Services.RedirectService"/>,
/// mirroring the payload the original utils.js produced.
/// </summary>
public sealed class RedirectPayload
{
    public Guid? LinkId { get; set; }
    public string RedirectUrl { get; set; } = string.Empty;
    public bool Deprecated { get; set; }
    public bool Private { get; set; }
    public bool Unavailable { get; set; }
    public string? ShortPath { get; set; }
}
