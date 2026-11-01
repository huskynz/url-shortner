using System.Security.Cryptography;

namespace UrlShortener.Shared.Services;

public interface IShortPathGenerator { string Generate(); }

/// <summary>64 random bits, URL-safe 17-character aliases. Not an access control.</summary>
public sealed class ShortPathGenerator : IShortPathGenerator
{
    public string Generate() => "s" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
}
