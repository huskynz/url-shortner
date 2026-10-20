using Microsoft.AspNetCore.Mvc;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

/// <summary>
/// /api/api-keys (session-scoped, simple keys) and /api/admin-keys (owner-scoped, hex keys).
/// Ports src/app/api/api-keys and src/app/api/admin-keys.
/// </summary>
public static class ApiKeysEndpoints
{
    public static void MapApiKeys(this IEndpointRouteBuilder app)
    {
        // --- /api/api-keys (requires an admin session) ---
        var keys = app.MapGroup("/api/api-keys").RequireAuthorization(AuthConstants.AdminSessionPolicy);

        keys.MapGet("", async (ApiKeyService svc, CancellationToken ct) =>
            Results.Json(await svc.ListSimpleAsync(ct)));

        keys.MapPost("", async ([FromBody] ApiKeySimpleRequest body, ApiKeyService svc, CancellationToken ct) =>
        {
            var result = await svc.CreateSimpleAsync(body.Name, ct);
            return result.Ok
                ? Results.Json(result.Value)
                : Results.Json(new { error = result.Error }, statusCode: result.Status);
        });

        keys.MapDelete("/{id}", async (string id, ApiKeyService svc, CancellationToken ct) =>
            ToSuccess(await svc.DeleteAsync(id, ct)));

        // --- /api/admin-keys (requires owner) ---
        var adminKeys = app.MapGroup("/api/admin-keys").RequireAuthorization(AuthConstants.OwnerSessionPolicy);

        adminKeys.MapGet("", async (ApiKeyService svc, CancellationToken ct) =>
            Results.Json(await svc.ListFullAsync(ct)));

        adminKeys.MapPost("", async ([FromBody] ApiKeyFullRequest body, ApiKeyService svc, CancellationToken ct) =>
        {
            var result = await svc.CreateFullAsync(body.Name, body.Expiration, ct);
            return result.Ok
                ? Results.Json(new { key = result.Value })
                : Results.Json(new { error = result.Error }, statusCode: result.Status);
        });

        // The original allows either a valid key or an admin session on this delete,
        // so it is mapped outside the owner-scoped group.
        app.MapDelete("/api/admin-keys/{id}", async (string id, ApiKeyService svc, CancellationToken ct) =>
            ToSuccess(await svc.DeleteAsync(id, ct)))
            .RequireAuthorization(AuthConstants.AdminOrApiKeyPolicy);
    }

    private static IResult ToSuccess(ServiceResult result) =>
        result.Ok
            ? Results.Json(new { success = true })
            : Results.Json(new { error = result.Error }, statusCode: result.Status);
}
