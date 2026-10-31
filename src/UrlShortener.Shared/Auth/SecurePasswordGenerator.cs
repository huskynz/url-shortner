using System.Security.Cryptography;

namespace UrlShortener.Shared.Auth;

public static class SecurePasswordGenerator
{
    public static string Generate(int length = 20)
    {
        if (length is < 16 or > 128) throw new ArgumentOutOfRangeException(nameof(length));
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";
        return new string(Enumerable.Range(0, length)
            .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
    }
}
