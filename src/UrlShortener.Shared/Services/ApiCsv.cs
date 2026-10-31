using System.Text;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

public static class ApiCsv
{
    public static string Cell(string? value)
    {
        value ??= "";
        // Neutralize spreadsheet formulas, including leading whitespace controls.
        var first = value.TrimStart().FirstOrDefault();
        if (first is '=' or '+' or '-' or '@' || value.StartsWith('\t') || value.StartsWith('\r')) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    public static List<List<string>> Parse(string text)
    {
        ApiV1Links.Require(text.Length is > 0 and <= 1048576, 400, "invalid_csv", "CSV must contain at most 1 MiB of characters.");
        var rows = new List<List<string>>();
        var row = new List<string>();
        var value = new StringBuilder();
        var quoted = false;
        var closed = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { value.Append('"'); i++; }
                else if (c == '"') { quoted = false; closed = true; }
                else value.Append(c);
            }
            else if (c == '"')
            {
                ApiV1Links.Require(value.Length == 0 && !closed, 400, "invalid_csv", "Unexpected quote.");
                quoted = true;
            }
            else if (c == ',' || c == '\n' || c == '\r')
            {
                row.Add(value.ToString()); value.Clear(); closed = false;
                if (c != ',')
                {
                    if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                    rows.Add(row); row = [];
                    ApiV1Links.Require(rows.Count <= 201, 400, "csv_row_limit", "CSV supports at most 200 data rows.");
                }
            }
            else
            {
                ApiV1Links.Require(!closed, 400, "invalid_csv", "Unexpected text after a closing quote.");
                value.Append(c);
            }
            ApiV1Links.Require(value.Length <= 4096 && row.Count <= 16, 400, "invalid_csv", "CSV field or column limit exceeded.");
        }
        ApiV1Links.Require(!quoted, 400, "invalid_csv", "Unclosed quote.");
        if (value.Length > 0 || row.Count > 0 || closed) { row.Add(value.ToString()); rows.Add(row); }
        ApiV1Links.Require(rows.Count is >= 2 and <= 201, 400, "invalid_csv", "CSV requires a header and 1..200 data rows.");
        return rows;
    }

    public static string Links(IEnumerable<LinkView> rows)
    {
        var result = new StringBuilder("id,short_path,short_url,destination_url,private,listed,archived,deprecated,schedule_start,schedule_end,usage_quota,usage_count,version\r\n");
        foreach (var r in rows)
            result.AppendLine(string.Join(',', new[] { r.Id.ToString(), r.ShortPath, r.ShortUrl, r.DestinationUrl,
                r.Private.ToString().ToLowerInvariant(), r.Listed.ToString().ToLowerInvariant(), r.Archived.ToString().ToLowerInvariant(),
                r.Deprecated.ToString().ToLowerInvariant(), r.ScheduleStart?.ToString("O"), r.ScheduleEnd?.ToString("O"),
                r.UsageQuota?.ToString(), r.UsageCount.ToString(), r.Version.ToString() }.Select(Cell)));
        return result.ToString();
    }
}
