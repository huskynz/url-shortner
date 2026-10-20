using Microsoft.AspNetCore.Mvc;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

/// <summary>/api/admin-urls — port of src/app/api/admin-urls/route.js.</summary>
public static class AdminUrlsEndpoints
{
    public static void MapAdminUrls(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin-urls").RequireAuthorization(AuthConstants.AdminOrApiKeyPolicy);

        group.MapGet("", async (UrlAdminService svc, CancellationToken ct) =>
            Results.Json(await svc.GetAllAsync(ct)));

        group.MapPost("", async ([FromBody] UrlCreateRequest body, UrlAdminService svc, CancellationToken ct) =>
            ToResult(await svc.CreateAsync(body, ct)));

        group.MapPut("", async ([FromBody] UrlUpdateRequest body, UrlAdminService svc, CancellationToken ct) =>
            ToResult(await svc.UpdateAsync(body, ct)));

        group.MapDelete("", async ([FromBody] DeleteUrlRequest body, UrlAdminService svc, CancellationToken ct) =>
            ToResult(await svc.DeleteAsync(body.ShortPath, ct)));
    }

    private static IResult ToResult(ServiceResult result) =>
        result.Ok
            ? Results.Json(new { success = true })
            : Results.Json(new { error = result.Error }, statusCode: result.Status);
}
