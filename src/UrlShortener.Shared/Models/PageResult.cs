namespace UrlShortener.Shared.Models;

public sealed record PageResult<T>(List<T> Items, int Total, int Page, int PageSize)
{
    public bool HasNext => (long)Page * PageSize < Total;
}

public static class Paging
{
    public static (int Page, int Size, string Search) Normalize(int page, int size, string? search)
    {
        var term = (search ?? "").Trim().ToLowerInvariant();
        return (Math.Clamp(page, 1, 1000000), Math.Clamp(size, 1, 200), term[..Math.Min(term.Length, 200)]);
    }
}
