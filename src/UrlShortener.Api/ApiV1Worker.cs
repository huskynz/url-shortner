using UrlShortener.Shared.Services;

namespace UrlShortener.Api;

public sealed class ApiV1Worker(IServiceScopeFactory scopes, ILogger<ApiV1Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<ApiV1Schedules>().ProcessDue(stoppingToken);
                await scope.ServiceProvider.GetRequiredService<ApiV1Operations>().Process(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                // Failed transactions remain pending and are retryable. No secrets
                // or database connection details enter the worker log.
                logger.LogWarning("API work rolled back ({ExceptionType}); will retry.", ex.GetType().Name);
            }
        }
    }
}
