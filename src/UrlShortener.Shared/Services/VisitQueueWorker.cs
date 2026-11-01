using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UrlShortener.Shared.Options;

namespace UrlShortener.Shared.Services;

public sealed class VisitQueueWorker(IServiceScopeFactory scopes, IOptions<UrlShortenerOptions> options,
    ILogger<VisitQueueWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.VisitQueueConsumerEnabled) return;
        var nextReport = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            var processed = 0;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var processor = scope.ServiceProvider.GetRequiredService<VisitQueueProcessor>();
                processed = await processor.ProcessBatchAsync(stoppingToken);
                if (DateTimeOffset.UtcNow >= nextReport)
                {
                    var backlog = await processor.BacklogAsync(stoppingToken);
                    logger.LogInformation("Visit queue pending={Count}, oldest={Oldest}", backlog.Count, backlog.Oldest);
                    nextReport = DateTimeOffset.UtcNow.AddSeconds(30);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Visit queue batch rolled back; retrying in 5 seconds. Investigate persistent failures.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            if (processed < 100) await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }
}
