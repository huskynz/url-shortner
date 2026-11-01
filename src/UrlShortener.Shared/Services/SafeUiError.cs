using Microsoft.Extensions.Logging;
using UrlShortener.Shared.Models;

namespace UrlShortener.Shared.Services;

/// <summary>Correlates recoverable UI failures without copying provider secrets into logs or markup.</summary>
public static class SafeUiError
{
    public static string Report(Exception exception, ILogger logger, string operation, string message)
    {
        if (exception is ApiFault fault) return fault.Message;
        var reference = Guid.NewGuid().ToString("N");
        // Exception messages, Data and connection strings are untrusted and may
        // contain credentials. Record only safe diagnostic metadata here.
        logger.LogError("UI {Operation} failed with {ExceptionType}. Reference {Reference}",
            operation, exception.GetType().FullName, reference);
        return $"{message} Reference: {reference}.";
    }
}
