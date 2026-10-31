namespace UrlShortener.Shared.Models;

/// <summary>Aggregated analytics, mirroring the /api/admin-analytics response.</summary>
public sealed class AnalyticsResult
{
    /// <summary>Legacy compatibility flag. Complete charts no longer omit groups/dates.</summary>
    public bool OutputLimited { get; set; }
    public bool CategoriesGrouped { get; set; }
    public string DateBucket { get; set; } = "day";
    public int UndatedVisits { get; set; }
    public int TotalUrls { get; set; }
    public int TotalVisits { get; set; }
    public int ActiveUrls { get; set; }
    public int DeprecatedUrls { get; set; }
    public double AverageClicks { get; set; }
    public List<NamedCount> VisitStats { get; set; } = new();
    public List<RecentVisit> RecentVisits { get; set; } = new();
    public List<NamedCount> BrowserDistribution { get; set; } = new();
    public List<NamedCount> OsDistribution { get; set; } = new();
    public List<DateCount> VisitsOverTime { get; set; } = new();
    public List<NamedCount> WeekdayDistribution { get; set; } = new();
    public List<NamedCount> HourDistribution { get; set; } = new();
}

public sealed class NamedCount
{
    public bool IsOther { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ShortPath { get; set; }
    public int Count { get; set; }
}

public sealed class DateCount
{
    public string Date { get; set; } = string.Empty;
    public int Count { get; set; }
}

/// <summary>UTC time-of-week SQL aggregation; at most 7 × 24 rows.</summary>
public sealed class VisitTimeCount
{
    public int Weekday { get; set; }
    public int Hour { get; set; }
    public int Count { get; set; }
}

public sealed class RecentVisit
{
    public string? ShortPath { get; set; }
    public string? UserAgent { get; set; }
    public string? IpAddress { get; set; }
    public string? Environment { get; set; }
    public string? VersionNumber { get; set; }
    public DateTimeOffset? VisitedAt { get; set; }
    public Guid? UserId { get; set; }
}
