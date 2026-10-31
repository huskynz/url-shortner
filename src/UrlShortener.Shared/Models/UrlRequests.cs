using System.Text.Json.Serialization;

namespace UrlShortener.Shared.Models;

/// <summary>Body for POST /api/admin-urls (create).</summary>
public sealed class UrlCreateRequest
{
    [JsonPropertyName("short_path")] public string? ShortPath { get; set; }
    [JsonPropertyName("redirect_url")] public string? RedirectUrl { get; set; }
    [JsonPropertyName("password")] public string? Password { get; set; }
    [JsonPropertyName("schedule_start")] public DateTimeOffset? ScheduleStart { get; set; }
    [JsonPropertyName("schedule_end")] public DateTimeOffset? ScheduleEnd { get; set; }
    [JsonPropertyName("usage_quota")] public int? UsageQuota { get; set; }
    [JsonPropertyName("custom_rules")] public string? CustomRules { get; set; }
    [JsonPropertyName("private")] public bool? Private { get; set; }
}

/// <summary>Body for PUT /api/admin-urls (update). Null means "not provided".</summary>
public sealed class UrlUpdateRequest
{
    [JsonPropertyName("schedule_start")] public DateTimeOffset? ScheduleStart { get; set; }
    [JsonPropertyName("schedule_end")] public DateTimeOffset? ScheduleEnd { get; set; }
    [JsonPropertyName("usage_quota")] public int? UsageQuota { get; set; }
    [JsonPropertyName("custom_rules")] public string? CustomRules { get; set; }
    [JsonPropertyName("clear_schedule")] public bool ClearSchedule { get; set; }
    [JsonPropertyName("clear_quota")] public bool ClearQuota { get; set; }
    [JsonPropertyName("clear_custom_rules")] public bool ClearCustomRules { get; set; }
    [JsonPropertyName("short_path")] public string? ShortPath { get; set; }
    [JsonPropertyName("redirect_url")] public string? RedirectUrl { get; set; }
    [JsonPropertyName("deprecated")] public bool? Deprecated { get; set; }
    [JsonPropertyName("password")] public string? Password { get; set; }
    [JsonPropertyName("private")] public bool? Private { get; set; }
}
