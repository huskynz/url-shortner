using Microsoft.AspNetCore.Mvc;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api.Endpoints;

/// <summary>
/// /api/admin-management (+ create-password-token), /api/auth/signup, /api/auth/set-password.
/// Ports admin-management/route.js, auth/signup, auth/set-password, create-password-token.
/// </summary>
public static class AdminManagementEndpoints
{
    public static void MapAdminManagement(this IEndpointRouteBuilder app)
    {
        // GET requires an admin session; mutating verbs require owner.
        app.MapGet("/api/admin-management", async (AdminService svc, CancellationToken ct) =>
            Results.Json(await svc.ListAdminsAsync(ct)))
            .RequireAuthorization(AuthConstants.AdminSessionPolicy);

        var owner = app.MapGroup("/api/admin-management").RequireAuthorization(AuthConstants.OwnerSessionPolicy);

        owner.MapPost("", async ([FromBody] AddAdminRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.AddAdminAsync(body.Email, body.Role, ct)));

        owner.MapDelete("", async ([FromBody] EmailRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.RemoveAdminAsync(body.Email, ct)));

        owner.MapPut("", async ([FromBody] UpdateRoleRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.UpdateRoleAsync(body.Email, body.Role, ct)));

        owner.MapPatch("", async ([FromBody] ResetPasswordRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.ResetPasswordAsync(body.Email, body.Password, ct)));

        owner.MapPost("/create-password-token", async ([FromBody] EmailRequest body, AdminService svc, CancellationToken ct) =>
        {
            var result = await svc.CreatePasswordTokenAsync(body.Email, ct);
            return result.Ok
                ? Results.Json(new { token = result.Value })
                : Results.Json(new { error = result.Error }, statusCode: result.Status);
        });

        // Signup creates a new admin (owner-gated in the original).
        app.MapPost("/api/auth/signup", async ([FromBody] SignupRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.SignupAsync(body.Email, body.Password, body.Role, ct)))
            .RequireAuthorization(AuthConstants.OwnerSessionPolicy);

        // Set password by identifier (public in the original: matches on id/github fields).
        app.MapPost("/api/auth/set-password", async ([FromBody] SetPasswordRequest body, AdminService svc, CancellationToken ct) =>
            ToSuccess(await svc.SetPasswordAsync(body.Email, body.Password, body.Id, body.GithubUsername, body.GithubId, ct)));
    }

    private static IResult ToSuccess(ServiceResult result) =>
        result.Ok
            ? Results.Json(new { success = true })
            : Results.Json(new { error = result.Error }, statusCode: result.Status);
}
