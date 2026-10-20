using System.Collections.Concurrent;

namespace UrlShortener.Shared.Services;

/// <summary>
/// In-memory sliding-window rate limiter. Direct port of src/app/lib/rateLimit.js.
/// NOTE: the original app defined this utility but never wired it into any route,
/// so it is registered and available but not applied by default (kept for parity).
/// </summary>
public sealed class RateLimiter
{
    private sealed class Entry
    {
        public List<long> Requests { get; } = new();
        public long LastCleanup { get; set; }
    }

    private readonly ConcurrentDictionary<string, Entry> _rateLimits = new();

    private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public bool CheckRateLimit(string key, int limit = 100, long windowMs = 60000)
    {
        var now = NowMs();
        var entry = _rateLimits.GetOrAdd(key, _ => new Entry { LastCleanup = now });

        lock (entry)
        {
            var windowStart = now - windowMs;
            entry.Requests.RemoveAll(t => t <= windowStart);

            if (entry.Requests.Count >= limit)
            {
                return false;
            }

            entry.Requests.Add(now);
            entry.LastCleanup = now;
            return true;
        }
    }

    public (int Remaining, int Total, long Reset) GetRateLimitInfo(string key, int limit = 100, long windowMs = 60000)
    {
        var now = NowMs();
        if (!_rateLimits.TryGetValue(key, out var entry))
        {
            return (limit, limit, now + windowMs);
        }

        lock (entry)
        {
            var windowStart = now - windowMs;
            var requests = entry.Requests.Where(t => t > windowStart).ToList();
            var reset = requests.Count > 0 ? requests[0] + windowMs : now + windowMs;
            return (Math.Max(0, limit - requests.Count), limit, reset);
        }
    }
}
