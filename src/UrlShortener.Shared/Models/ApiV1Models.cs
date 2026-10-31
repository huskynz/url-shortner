using System.Text.Json.Serialization;

namespace UrlShortener.Shared.Models;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LinkCreate
{
    public string? ShortPath { get; set; }
    public string? DestinationUrl { get; set; }
    public bool Private { get; set; }
    public string? Password { get; set; }
    public bool Listed { get; set; } = true;
    public DateTimeOffset? ScheduleStart { get; set; }
    public DateTimeOffset? ScheduleEnd { get; set; }
    public int? UsageQuota { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LinkPatch
{
    public string? DestinationUrl { get; set; }
    public bool? Private { get; set; }
    public string? Password { get; set; }
    public bool? Listed { get; set; }
    public bool? Deprecated { get; set; }
    public DateTimeOffset? ScheduleStart { get; set; }
    public DateTimeOffset? ScheduleEnd { get; set; }
    public int? UsageQuota { get; set; }
    public bool ClearSchedule { get; set; }
    public bool ClearQuota { get; set; }
}

public sealed record LinkView(Guid Id, string ShortPath, string ShortUrl, string DestinationUrl,
    bool Private, bool Listed, bool Archived, bool Deprecated, DateTimeOffset? ScheduleStart,
    DateTimeOffset? ScheduleEnd, int? UsageQuota, long UsageCount, long Version, string Availability);
public sealed record LinkCheckRequest(DateTimeOffset? At);
public sealed record LinkCheck(Guid Id, DateTimeOffset At, string Outcome);
public sealed record DestinationChange(string DestinationUrl, DateTimeOffset RunAt);
public sealed record PasswordProof(string Password);
public sealed record PreviewCommit(Guid PreviewId);
public sealed record CsvPreview(string Csv);
public sealed record BulkItem(Guid Id, long Version);
public sealed record BulkPreview(string Action, List<BulkItem> Links);
public sealed record ItemOutcome(Guid? Id, int Row, int Status, string Code);
public sealed record OperationView(Guid Id, string Kind, string Status, DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt, DateTimeOffset? CompletedAt, List<ItemOutcome> Results);
public sealed record KeyIssue(string Name, string Scopes, int ExpiresInDays = 90);
public sealed record KeyRotate(int OverlapMinutes = 0);
public sealed record UserPatch(string? Role, bool? Enabled);
public sealed record InvitationRequest(string Email, string Role = "viewer");
public sealed record TokenPassword(string Email, string Token, string Password);
public sealed record ProfilePatch(string Email, string CurrentPassword);
public sealed record PasswordChange(string CurrentPassword, string Password);
public sealed record UserView(Guid Id, string? Email, string? Role, bool Enabled, bool PasswordSet, DateTimeOffset? CreatedAt);
public sealed record ApiAnalytics(DateTimeOffset From, DateTimeOffset To, string Resolution,
    DateTimeOffset GeneratedAt, bool Complete, int RedirectVisits, int DirectoryViews, int LegacyVisits,
    List<DateCount> Traffic, List<NamedCount> Browsers, List<NamedCount> OperatingSystems);
