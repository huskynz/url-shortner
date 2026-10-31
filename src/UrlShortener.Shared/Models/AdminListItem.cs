namespace UrlShortener.Shared.Models;

// Explicit allow-list: never return credential fields or session stamps.
public sealed record AdminListItem(Guid Id, string? Email, string? Role, bool? Passset,
    string? GithubUsername, string? GithubId, DateTimeOffset? CreatedAt);
