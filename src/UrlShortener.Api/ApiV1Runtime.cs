using System.Data.Common;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api;

public static class ApiV1Runtime
{
    public static void AddApiV1Runtime(this IServiceCollection services)
    {
        services.AddAntiforgery(o => o.HeaderName = "X-CSRF-Token");
        services.AddAuthorization(o =>
        {
            foreach (var scope in ApiKeyService.SupportedScopes)
                o.AddPolicy("v1:" + scope, policy =>
                {
                    policy.AddAuthenticationSchemes(AuthConstants.CookieScheme, AuthConstants.ApiKeyScheme);
                    policy.RequireAssertion(c => ApiV1Access.Allows(c.User, scope));
                });
        });
        services.AddRateLimiter(o =>
        {
            o.AddPolicy("api-v1", context => RateLimitPartition.GetFixedWindowLimiter(
                ApiV1Access.CookieAdmin(context.User) || context.User.Identities.Any(i => i.IsAuthenticated)
                    ? context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown"
                    : context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            o.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.Headers.RetryAfter = "60";
                await Problem(ctx.HttpContext, 429, "rate_limited", "Request limit reached; retry later.").ExecuteAsync(ctx.HttpContext);
            };
        });
    }

    public static IResult Problem(HttpContext http, int status, string code, string detail)
    {
        var extensions = new Dictionary<string, object?> { ["code"] = code, ["request_id"] = http.TraceIdentifier };
        if (status == 400)
        {
            var field = code switch { "invalid_destination" => "destination_url", "invalid_short_path" => "short_path",
                "password_required" or "invalid_password" => "password", "invalid_email" => "email", _ => "request" };
            extensions["errors"] = new Dictionary<string, string[]> { [field] = [detail] };
        }
        return Results.Problem(statusCode: status, title: Microsoft.AspNetCore.WebUtilities.ReasonPhrases.GetReasonPhrase(status),
            detail: detail, extensions: extensions);
    }

    public static IApplicationBuilder UseApiV1Errors(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        if (!http.Request.Path.StartsWithSegments("/api/v1")) { await next(http); return; }
        if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = 2 * 1024 * 1024;
        http.Response.Headers["X-Request-Id"] = http.TraceIdentifier;
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
            http.Response.OnStarting(() =>
            {
                if (!http.Items.ContainsKey(SecurityAudit.RecordedKey))
                    http.RequestServices.GetRequiredService<SecurityAudit>().Write(http.User,
                        MutationAction(http), http.Request.Path,
                        http.Response.StatusCode < 400 ? "success" : http.Response.StatusCode < 500 ? "denied" : "error",
                        http.Response.StatusCode, http.TraceIdentifier);
                return Task.CompletedTask;
            });
        try
        {
            await next(http);
            if (http.Response.StatusCode >= 400 && !http.Response.HasStarted && http.Response.ContentType is null)
                await Problem(http, http.Response.StatusCode, "http_" + http.Response.StatusCode, "The request could not be completed.").ExecuteAsync(http);
        }
        catch (ApiFault ex) when (!http.Response.HasStarted)
        { await Problem(http, ex.Status, ex.Code, ex.Message).ExecuteAsync(http); }
        catch (BadHttpRequestException ex) when (!http.Response.HasStarted)
        { await Problem(http, ex.StatusCode, "invalid_request", "Invalid request body, content type or parameters.").ExecuteAsync(http); }
        catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested) { }
        catch (Exception ex) when (!http.Response.HasStarted)
        {
            // Do not serialize provider messages, payloads or credentials.
            http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiV1")
                .LogError("API request {RequestId} failed ({ExceptionType}).", http.TraceIdentifier, ex.GetType().Name);
            await Problem(http, ex is DbException || ex is Microsoft.EntityFrameworkCore.DbUpdateException ? 503 : 500,
                "service_unavailable", "The request could not be completed; retry later.").ExecuteAsync(http);
        }
    });

    private static string MutationAction(HttpContext http)
    {
        var path = http.Request.Path.Value ?? "";
        if (path == "/api/v1/users" && HttpMethods.IsPost(http.Request.Method)) return "account.create";
        if (path.StartsWith("/api/v1/api-keys", StringComparison.Ordinal) && HttpMethods.IsPost(http.Request.Method))
        {
            if (path.EndsWith("/revoke", StringComparison.Ordinal)) return "api-key.revoke";
            if (path.EndsWith("/rotate", StringComparison.Ordinal)) return "api-key.rotate";
            if (path == "/api/v1/api-keys") return "api-key.issue";
        }
        if (path.StartsWith("/api/v1/users/", StringComparison.Ordinal))
        {
            if (path.EndsWith("/reset-password", StringComparison.Ordinal)) return "account.password-reset";
            if (HttpMethods.IsDelete(http.Request.Method)) return "account.remove";
        }
        if (path.StartsWith("/api/v1/links", StringComparison.Ordinal))
        {
            if (path == "/api/v1/links" && HttpMethods.IsPost(http.Request.Method)) return "url.create";
            if (HttpMethods.IsPatch(http.Request.Method)) return "url.update";
            if (HttpMethods.IsDelete(http.Request.Method) && !path.Contains("/scheduled-changes/")) return "url.delete";
        }
        return "api-v1." + http.Request.Method.ToLowerInvariant();
    }

    public static async ValueTask<object?> Guard(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            // API-key-only requests do not use ambient cookies. If a cookie is
            // present, validate CSRF even when a key was supplied as well.
            if (http.Request.Cookies.ContainsKey(AuthConstants.CookieName))
            {
                try { await http.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(http); }
                catch (AntiforgeryValidationException) { return Problem(http, 400, "csrf_failed", "Valid antiforgery proof required for cookie-authenticated mutations."); }
            }
        }
        return await next(context);
    }

    public static long Version(HttpContext http)
    {
        var tag = http.Request.Headers.IfMatch.ToString();
        ApiV1Links.Require(tag.Length > 0, 428, "precondition_required", "Supply the strong ETag in If-Match.");
        ApiV1Links.Require(tag.Length >= 3 && tag[0] == '"' && tag[^1] == '"' && long.TryParse(tag[1..^1], out var version) && version > 0,
            400, "invalid_etag", "If-Match must contain one quoted positive version.");
        return long.Parse(tag[1..^1]);
    }
    public static IResult Link(HttpContext http, Shared.Models.LinkView link, bool created = false)
    {
        http.Response.Headers.ETag = $"\"{link.Version}\"";
        return created ? Results.Created($"{http.Request.PathBase}/api/v1/links/{link.Id}", link) : Results.Ok(link);
    }
    public static string Key(HttpContext http) => http.Request.Headers["Idempotency-Key"].ToString();
    public static void Outcome(Shared.Models.ServiceResult result)
    { if (!result.Ok) throw new ApiFault(result.Status, "operation_failed", result.Error ?? "Operation failed."); }
}
