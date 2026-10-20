using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

/// <summary>/api/admin-analytics — port of src/app/api/admin-analytics/route.js.</summary>
public static class AnalyticsEndpoints
{
    public static void MapAnalytics(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin-analytics", async (int? timeRange, AnalyticsService svc, CancellationToken ct) =>
            Results.Json(await svc.GetAnalyticsAsync(timeRange ?? 0, ct)))
            .RequireAuthorization(AuthConstants.AdminOrApiKeyPolicy);
    }
}
