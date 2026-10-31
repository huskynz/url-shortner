using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.AspNetCore.Routing;
using Microsoft.OpenApi;
using UrlShortener.Api.Endpoints;
using UrlShortener.Shared;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Services;

namespace UrlShortener.Api;

/// <summary>Offline generation from the actual API mappings; no listener, request,
/// database connection, migrations or hosted workers are started.</summary>
public static class ApiSpecification
{
    public static async Task<string> Generate(CancellationToken ct = default)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [],
            ApplicationName = typeof(ApiSpecification).Assembly.GetName().Name,
            EnvironmentName = "Production", ContentRootPath = AppContext.BaseDirectory });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        { ["ConnectionStrings:Postgres"] = "Host=invalid.test;Database=unused;Username=unused;Password=unused" });
        builder.Logging.ClearProviders();
        builder.Services.AddUrlShortenerCore(builder.Configuration);
        builder.Services.AddUrlShortenerAuthorization(AuthConstants.CookieScheme, AuthConstants.ApiKeyScheme);
        builder.Services.AddApiV1Runtime();
        builder.Services.ConfigureHttpJsonOptions(o =>
        {
            o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
            o.SerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict;
        });
        builder.Services.AddOpenApi("v1");
        EndpointDataSource? source = null;
        // A non-started WebApplication has not attached its route sources to the
        // hosting pipeline's composite source. Give ApiExplorer the actual mapped
        // sources explicitly; never start a listener merely to generate a spec.
        builder.Services.AddSingleton<EndpointDataSource>(_ => source!);
        await using var app = builder.Build();
        app.MapApiV1();
        source = new CompositeEndpointDataSource(((IEndpointRouteBuilder)app).DataSources);
        var endpoints = ((IEndpointRouteBuilder)app).DataSources.SelectMany(s => s.Endpoints).OfType<RouteEndpoint>().ToList();
        var provider = app.Services.GetRequiredKeyedService<IOpenApiDocumentProvider>("v1");
        var doc = await provider.GetOpenApiDocumentAsync(ct);
        using var text = new StringWriter(CultureInfo.InvariantCulture);
        await doc.SerializeAsync(new OpenApiJsonWriter(text), OpenApiSpecVersion.OpenApi3_0, ct);
        var root = JsonNode.Parse(text.ToString())!.AsObject();
        root["info"] = new JsonObject { ["title"] = "URL Shortener API", ["version"] = "v1",
            ["description"] = "API-host contract. All API operations use /api/v1; unversioned API routes were removed in 6.2. Specification is downloadable from authenticated Admin /openapi/v1.json and browsable in the Admin-only /admin/api explorer. Try it out requires configured ApiBaseUrl and API Cors:AdminOrigin; cookie writes require CSRF proof. API/Public do not expose a documentation UI. Public /m and /github remain short aliases. API-v1 uses separate analytics:read and urls:private scopes; existing keys are not silently upgraded. Historical traffic is explicitly legacy and cannot reliably be assigned to a recreated alias. Health probes use /health/live and /health/ready; crawler discovery uses /robots.txt." };
        root["servers"] = new JsonArray(new JsonObject { ["url"] = "https://{api_host}", ["description"] = "API host, not Admin or Public",
            ["variables"] = new JsonObject { ["api_host"] = new JsonObject { ["default"] = "api.example.test" } } });
        var components = root["components"]?.AsObject() ?? new JsonObject();
        root["components"] = components;
        components["securitySchemes"] = JsonNode.Parse("""
            {"ApiKey":{"type":"apiKey","in":"header","name":"X-API-Key"},
             "Bearer":{"type":"http","scheme":"bearer","description":"Opaque API key, not a JWT"},
             "Cookie":{"type":"apiKey","in":"cookie","name":".UrlShortener.Auth","description":"Admin-issued cookie; cookie mutations require X-CSRF-Token from /api/v1/auth/csrf"}}
            """);
        foreach (var endpoint in endpoints)
        {
            var raw = endpoint.RoutePattern.RawText!;
            var path = raw.Replace(":guid", "").TrimEnd('/');
            var policies = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Select(a => a.Policy).Where(p => p is not null).ToArray();
            var methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods;
            foreach (var method in methods)
            {
                if (root["paths"]?[path]?[method.ToLowerInvariant()] is not JsonObject operation)
                    throw new InvalidOperationException($"Undocumented API route: {method} {path}");
                operation["x-authorization-policies"] = JsonSerializer.SerializeToNode(policies);
                var cookieOnly = policies.Any(p => p is AuthConstants.AdminSessionPolicy or AuthConstants.OwnerSessionPolicy or AuthConstants.SelfServicePolicy);
                operation["security"] = policies.Length == 0 ? new JsonArray()
                    : cookieOnly ? JsonNode.Parse("[{\"Cookie\":[]}]")
                    : JsonNode.Parse("[{\"ApiKey\":[]},{\"Bearer\":[]},{\"Cookie\":[]}]");
                var notes = "No-store. Errors use Problem Details with code and request_id. Pagination: page 1..1000000, page_size 1..200, search <=200. Cookie mutations require CSRF proof. ";
                if (method != "GET") notes += "Secret issuance is reveal-once and never cached. " ;
                var matchRequired = (method == "PATCH" || method == "DELETE" && path.EndsWith("{id}")) && path.StartsWith("/api/v1/links/")
                    || method == "POST" && path.StartsWith("/api/v1/links/")
                        && (path.EndsWith("/scheduled-changes") || path.EndsWith("/archive") || path.EndsWith("/restore"));
                if (matchRequired)
                {
                    notes += "Link mutations require strong If-Match; stale versions return 412 and missing proof 428. ";
                    AddHeader(operation, "If-Match", "Strong quoted edit version returned by GET, for example \"1\".");
                }
                if (method == "POST" && (path == "/api/v1/links" || path.EndsWith("scheduled-changes")
                    || path is "/api/v1/imports" or "/api/v1/bulk-operations"))
                {
                    notes += "Idempotency-Key: 8..128 printable ASCII characters, caller/route/request-bound, replay for 24h. Expired keys return 409; never reuse. ";
                    AddHeader(operation, "Idempotency-Key", "Caller/route/request-bound printable key, 8..128 characters; never reuse after the 24h replay window.");
                }
                if (path.EndsWith("/verify-password"))
                    notes += "Successful admission consumes quota and records a visit; this is NOT a read-only check. Private passwords <=1024; schedules UTC; positive quota; custom rules unsupported. ";
                if (path.Contains("imports")) notes += "CSV preview accepts short_path,destination_url,listed only, <=200 rows, no passwords. Confirmation queues work and rechecks current permissions and link versions. ";
                if (path.EndsWith("/qr")) notes += "Local PNG generation targeting the canonical Public URL. ";
                operation["description"] = notes;
                {
                    var responses = operation["responses"]!.AsObject();
                    foreach (var status in new[] { "400", "401", "403", "404", "409", "412", "413", "415", "428", "429", "500", "503" })
                        responses[status] ??= new JsonObject { ["description"] = "Problem Details: stable code and request_id; no secrets or provider messages",
                            ["content"] = new JsonObject { ["application/problem+json"] = new JsonObject { ["schema"] = Schema(typeof(ApiProblem)) } } };
                    foreach (var response in responses.Where(r => r.Key.StartsWith('2')).Select(r => r.Value!.AsObject()))
                    {
                        var headers = response["headers"]?.AsObject() ?? new JsonObject();
                        response["headers"] = headers;
                        headers["Cache-Control"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("no-store") } };
                        headers["X-Request-Id"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "string" } };
                        if (path.StartsWith("/api/v1/links/") && !path.Contains("/history") && !path.Contains("scheduled-changes")
                            && method != "DELETE" && (method == "PATCH" || method == "GET" && path.EndsWith("{id}") || matchRequired))
                            headers["ETag"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "string" } };
                    }
                    ApplyParameterBounds(operation);
                }
            }
        }
        Normalize(root);
        ApplyBodyBounds(components["schemas"]!.AsObject());
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    private static void AddHeader(JsonObject operation, string name, string description)
    {
        var parameters = operation["parameters"] as JsonArray;
        if (parameters is null) { parameters = new JsonArray(); operation["parameters"] = parameters; }
        parameters.Add(new JsonObject { ["name"] = name, ["in"] = "header", ["required"] = true,
            ["description"] = description, ["schema"] = new JsonObject { ["type"] = "string" } });
    }

    private static void ApplyParameterBounds(JsonObject operation)
    {
        if (operation["parameters"] is not JsonArray parameters) return;
        foreach (var parameter in parameters.OfType<JsonObject>())
        {
            if (parameter["schema"] is not JsonObject schema) continue;
            switch (parameter["name"]?.GetValue<string>())
            {
                case "page": schema["minimum"] = 1; schema["maximum"] = 1000000; break;
                case "page_size": schema["minimum"] = 1; schema["maximum"] = 200; break;
                case "search": schema["maxLength"] = 200; break;
                case "status": schema["enum"] = new JsonArray("active", "deprecated", "archived"); break;
                case "privacy": schema["enum"] = new JsonArray("public", "private"); break;
                case "role": schema["enum"] = new JsonArray("owner", "admin", "viewer"); break;
                case "resolution": schema["enum"] = new JsonArray("hour", "day", "month", "year"); break;
            }
        }
    }

    private static void ApplyBodyBounds(JsonObject schemas)
    {
        foreach (var name in new[] { "LinkCreate", "LinkPatch", "DestinationChange" })
        {
            var properties = schemas[name]!["properties"]!.AsObject();
            if (properties["destination_url"] is JsonObject destination) { destination["maxLength"] = 4096; destination["format"] = "uri"; }
            if (properties["short_path"] is JsonObject alias) { alias["minLength"] = 1; alias["maxLength"] = 128; alias["pattern"] = "^[A-Za-z0-9][A-Za-z0-9_-]*$"; }
            if (properties["password"] is JsonObject password) { password["minLength"] = 1; password["maxLength"] = 1024; password["writeOnly"] = true; }
            if (properties["usage_quota"] is JsonObject quota) quota["minimum"] = 1;
        }
        schemas["LinkCreate"]!["required"] = new JsonArray("destination_url");
        schemas["LinkCreate"]!["properties"]!["listed"]!["default"] = true;
        schemas["CsvPreview"]!["properties"]!["csv"]!["maxLength"] = 1048576;
        schemas["BulkPreview"]!["properties"]!["links"]!["minItems"] = 1;
        schemas["BulkPreview"]!["properties"]!["links"]!["maxItems"] = 200;
        schemas["BulkPreview"]!["properties"]!["action"]!["enum"] = new JsonArray("archive", "restore", "deprecate", "activate", "list", "unlist");
        schemas["KeyIssue"]!["properties"]!["expires_in_days"]!["minimum"] = 1;
        schemas["KeyIssue"]!["properties"]!["expires_in_days"]!["maximum"] = 365;
        schemas["KeyRotate"]!["properties"]!["overlap_minutes"]!["minimum"] = 0;
        schemas["KeyRotate"]!["properties"]!["overlap_minutes"]!["maximum"] = 1440;
        foreach (var name in new[] { "UserCreate", "OwnerPasswordReset", "PasswordChange", "TokenPassword" })
            if (schemas[name]?["properties"]?["password"] is JsonObject password)
            { password["minLength"] = AdminPassword.MinLength; password["maxLength"] = AdminPassword.MaxLength; password["writeOnly"] = true; }
        schemas["UserCreate"]!["required"] = new JsonArray("email", "password", "role");
        schemas["UserCreate"]!["properties"]!["email"]!["maxLength"] = 320;
        schemas["UserCreate"]!["properties"]!["email"]!["format"] = "email";
        schemas["UserCreate"]!["properties"]!["role"]!["enum"] = new JsonArray("owner", "admin", "viewer");
        schemas["OwnerPasswordReset"]!["required"] = new JsonArray("password");
    }

    private static JsonNode Schema(Type type)
    {
        var schema = new JsonSerializerOptions(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            TypeInfoResolver = new DefaultJsonTypeInfoResolver(), NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict }.GetJsonSchemaAsNode(type);
        // Exporter pointers are relative to this standalone schema, not the
        // enclosing OpenAPI document. Inline them before embedding the schema.
        schema = ExpandLocalReferences(schema, schema);
        Normalize(schema);
        return schema;
    }
    private static JsonNode ExpandLocalReferences(JsonNode root, JsonNode node, int depth = 0)
    {
        if (depth > 32) throw new InvalidOperationException("Recursive schema requires an explicit component mapping.");
        if (node is JsonObject obj)
        {
            if (obj["$ref"] is JsonValue value)
            {
                var pointer = value.GetValue<string>();
                if (!pointer.StartsWith("#/", StringComparison.Ordinal)) throw new InvalidOperationException("Unexpected external schema reference.");
                var target = root;
                foreach (var part in pointer[2..].Split('/')) target = target[part.Replace("~1", "/").Replace("~0", "~")]!;
                return ExpandLocalReferences(root, target, depth + 1);
            }
            var result = new JsonObject();
            foreach (var property in obj) result[property.Key] = property.Value is null ? null : ExpandLocalReferences(root, property.Value, depth + 1);
            return result;
        }
        if (node is JsonArray array)
        {
            var result = new JsonArray();
            foreach (var item in array) result.Add(item is null ? null : ExpandLocalReferences(root, item, depth + 1));
            return result;
        }
        return node.DeepClone();
    }
    private static void Normalize(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            if (obj["type"] is JsonArray types)
            {
                var values = types.Select(t => t!.GetValue<string>()).ToList();
                if (values.Remove("null")) obj["nullable"] = true;
                obj["type"] = values.FirstOrDefault() ?? "object";
            }
            foreach (var value in obj.ToArray()) Normalize(value.Value);
            // Null-valued response properties are omitted by the real host; the
            // corresponding nullable request fields may also be omitted.
            if (obj["required"] is JsonArray required && obj["properties"] is JsonObject properties)
            {
                foreach (var field in required.ToArray())
                    if (properties[field!.GetValue<string>()]?["nullable"]?.GetValue<bool>() == true)
                        required.Remove(field);
                if (required.Count == 0) obj.Remove("required");
            }
        }
        else if (node is JsonArray array) foreach (var value in array) Normalize(value);
    }
}

public sealed record ApiProblem(string Type, string Title, int Status, string Detail, string Code,
    string RequestId, Dictionary<string, string[]>? Errors);
