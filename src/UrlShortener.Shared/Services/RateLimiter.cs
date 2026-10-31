using System.Security.Cryptography;
using System.Text;

namespace UrlShortener.Shared.Services;

/// <summary>Thread-safe, bounded in-process sliding windows. Full state denies new keys.</summary>
public sealed class RateLimiter(TimeProvider clock)
{
    public const int MaxKeys = 4096;
    private sealed class Entry(int limit, long windowMs)
    {
        public int Limit { get; } = limit;
        public long WindowMs { get; } = windowMs;
        public Queue<(long At, Guid Id)> Requests { get; } = new();
    }

    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private long _nextCleanup;

    public bool CheckRateLimit(string key, int limit = 100, long windowMs = 60000)
        => Reserve((key, limit, windowMs)) is not null;

    // Reserve all budgets atomically. A successful authentication refunds only
    // its own reservations, never other concurrent requests or failed attempts.
    public Reservation? Reserve(params (string Key, int Limit, long WindowMs)[] budgets)
    {
        foreach (var budget in budgets) Validate(budget.Limit, budget.WindowMs);
        var policies = budgets.Select(b => (Id: Key(b.Key), b.Limit, b.WindowMs)).ToArray();
        lock (_gate)
        {
            var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
            Cleanup(now);
            if (_entries.Count + policies.Count(p => !_entries.ContainsKey(p.Id)) > MaxKeys) return null;
            foreach (var policy in policies)
            {
                if (!_entries.TryGetValue(policy.Id, out var entry)) continue;
                if (entry.Limit != policy.Limit || entry.WindowMs != policy.WindowMs)
                    throw new InvalidOperationException("A limiter key must use one consistent policy.");
                Prune(entry, now);
                if (entry.Requests.Count >= entry.Limit) return null;
            }
            var reservationId = Guid.NewGuid();
            foreach (var policy in policies)
            {
                if (!_entries.TryGetValue(policy.Id, out var entry))
                    _entries[policy.Id] = entry = new Entry(policy.Limit, policy.WindowMs);
                entry.Requests.Enqueue((now, reservationId));
            }
            return new Reservation(this, policies.Select(p => p.Id).ToArray(), reservationId);
        }
    }

    public sealed class Reservation(RateLimiter owner, string[] keys, Guid id) : IDisposable
    {
        private int _completed;
        public void Succeed()
        {
            if (Interlocked.Exchange(ref _completed, 1) != 0) return;
            lock (owner._gate)
            {
                foreach (var key in keys)
                {
                    if (!owner._entries.TryGetValue(key, out var entry)) continue;
                    var retained = entry.Requests.Where(r => r.Id != id).ToArray();
                    entry.Requests.Clear();
                    foreach (var request in retained) entry.Requests.Enqueue(request);
                    if (entry.Requests.Count == 0) owner._entries.Remove(key);
                }
            }
        }
        // Failure, cancellation or exception retains the bounded-window attempt.
        public void Dispose() => Interlocked.Exchange(ref _completed, 1);
    }

    public (int Remaining, int Total, long Reset) GetRateLimitInfo(string key, int limit = 100, long windowMs = 60000)
    {
        Validate(limit, windowMs);
        lock (_gate)
        {
            var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
            if (!_entries.TryGetValue(Key(key), out var entry)) return (limit, limit, now + windowMs);
            Prune(entry, now);
            return (Math.Max(0, entry.Limit - entry.Requests.Count), entry.Limit,
                entry.Requests.Count > 0 ? entry.Requests.Peek().At + entry.WindowMs : now + entry.WindowMs);
        }
    }

    public int TrackedKeyCount { get { lock (_gate) return _entries.Count; } }

    private void Cleanup(long now)
    {
        if (now < _nextCleanup && _entries.Count < MaxKeys) return;
        foreach (var pair in _entries.ToArray())
        {
            Prune(pair.Value, now);
            if (pair.Value.Requests.Count == 0) _entries.Remove(pair.Key);
        }
        _nextCleanup = now + 60000;
    }

    private static void Prune(Entry entry, long now)
    {
        while (entry.Requests.TryPeek(out var first) && first.At <= now - entry.WindowMs)
            entry.Requests.Dequeue();
    }

    private static string Key(string key) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    private static void Validate(int limit, long windowMs)
    {
        if (limit is < 1 or > 1000) throw new ArgumentOutOfRangeException(nameof(limit));
        if (windowMs is < 1 or > 3600000) throw new ArgumentOutOfRangeException(nameof(windowMs));
    }
}
