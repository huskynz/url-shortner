namespace UrlShortener.Shared.Models;

/// <summary>
/// A lightweight result carrying an HTTP-ish status so callers (API controllers
/// and Blazor pages) can reproduce the original route responses 1:1.
/// </summary>
public interface IServiceOutcome
{
    bool Ok { get; }
    int Status { get; }
}

public sealed class ServiceResult : IServiceOutcome
{
    public bool Ok { get; init; }
    public int Status { get; init; }
    public string? Error { get; init; }

    public static ServiceResult Success(int status = 200) => new() { Ok = true, Status = status };
    public static ServiceResult Fail(int status, string error) => new() { Ok = false, Status = status, Error = error };
}

public sealed class ServiceResult<T> : IServiceOutcome
{
    public bool Ok { get; init; }
    public int Status { get; init; }
    public string? Error { get; init; }
    public T? Value { get; init; }

    public static ServiceResult<T> Success(T value, int status = 200) => new() { Ok = true, Status = status, Value = value };
    public static ServiceResult<T> Fail(int status, string error) => new() { Ok = false, Status = status, Error = error };
}
