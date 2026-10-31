namespace UrlShortener.Shared.Models;

public static class AnalyticsGroups
{
    /// <summary>Keep displayed categories bounded without dropping their visits.</summary>
    public static List<NamedCount> Compact(IEnumerable<NamedCount>? groups, int limit)
    {
        var rows = groups?.ToList() ?? new();
        limit = Math.Max(2, limit);
        if (rows.Count <= limit) return rows;
        var shown = rows.Where(r => !r.IsOther).OrderByDescending(r => r.Count)
            .ThenBy(r => r.Name, StringComparer.Ordinal).ThenBy(r => r.ShortPath, StringComparer.Ordinal)
            .Take(limit - 1).ToList();
        AddRemainder(shown, rows.Sum(r => r.Count));
        return shown;
    }

    public static void AddRemainder(List<NamedCount> shown, int total)
    {
        var remainder = total - shown.Sum(r => r.Count);
        if (remainder > 0) shown.Add(new NamedCount { Name = "Other", IsOther = true, Count = remainder });
    }
}
