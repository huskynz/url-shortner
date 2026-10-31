// Self-hosted explorer. Credentials stay in memory, and API requests are restricted
// to the administrator-configured server. No validator or telemetry service.
(async function () {
    const root = document.getElementById("api-explorer");
    const error = document.getElementById("api-explorer-error");
    const notice = document.getElementById("api-explorer-notice");
    try {
        const response = await fetch("/openapi/v1.json", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Specification unavailable");
        const spec = await response.json();
        if (!spec.openapi || !spec.paths) throw new Error("Invalid specification");
        const configResponse = await fetch("/admin/api-config", { credentials: "same-origin", cache: "no-store" });
        if (!configResponse.ok || !configResponse.headers.get("content-type")?.includes("application/json")) throw new Error("Configuration unavailable");
        const config = await configResponse.json();
        const api = config.apiBaseUrl ? new URL(config.apiBaseUrl) : null;
        if (api) {
            spec.servers = [{ url: config.apiBaseUrl, description: "Configured API host" }];
            notice.textContent = "Try it out is enabled for " + config.apiBaseUrl + ". Execute sends real requests; writes can change data. Your shared session is used automatically, or choose Authorize to use an API key. Cookie writes receive CSRF proof automatically. Supply If-Match and Idempotency-Key where documented.";
        } else {
            notice.textContent = "Request execution is disabled until UrlShortener:ApiBaseUrl is set to a trusted API URL and the API's Cors:AdminOrigin allows this Admin origin. You can still browse every operation and schema.";
        }
        if (typeof SwaggerUIBundle !== "function") throw new Error("Explorer unavailable");
        SwaggerUIBundle({
            spec,
            dom_id: "#api-explorer",
            // Blazor's base href is '/', so hash-only deep links would resolve
            // against the host root instead of this protected explorer page.
            deepLinking: false,
            filter: true,
            displayOperationId: true,
            docExpansion: "list",
            defaultModelsExpandDepth: 1,
            persistAuthorization: false,
            supportedSubmitMethods: api ? ["get", "head", "post", "put", "patch", "delete", "options"] : [],
            withCredentials: true,
            validatorUrl: null,
            syntaxHighlight: { activated: true, theme: "monokai" },
            presets: [SwaggerUIBundle.presets.apis],
            requestInterceptor: async request => {
                const target = new URL(request.url, location.href);
                const prefix = api ? api.pathname.replace(/\/$/, "") + "/api/v1/" : "";
                if (!api || target.origin !== api.origin || !target.pathname.startsWith(prefix) || target.username || target.password)
                    throw new Error("Requests are restricted to the configured API host and /api/v1/ routes.");
                request.credentials = "include";
                request.redirect = "error";
                const method = (request.method || "GET").toUpperCase();
                if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
                    const csrf = await fetch(config.apiBaseUrl + "/api/v1/auth/csrf", { credentials: "include", cache: "no-store", redirect: "error" });
                    if (csrf.ok) {
                        const proof = await csrf.json();
                        if (!proof.token) throw new Error("CSRF proof unavailable. Sign in again.");
                        request.headers = request.headers || {};
                        request.headers["X-CSRF-Token"] = proof.token;
                    } else {
                        const hasKey = Object.keys(request.headers || {}).some(name => ["authorization", "x-api-key"].includes(name.toLowerCase()) && request.headers[name]);
                        if (![401, 403].includes(csrf.status) || !hasKey)
                            throw new Error("Sign in to the shared API session or authorize with an API key. Check API CORS/cookie settings.");
                    }
                }
                return request;
            }
        });
    } catch {
        root.replaceChildren();
        error.hidden = false;
    }
})();
