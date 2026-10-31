# 6.2 — Admin workspace (HUS-4) and legacy API removal (HUS-67)

## Changes

- Responsive dark workspace with persistent desktop navigation, wrapping mobile
  navigation, current-page indication, keyboard focus and skip-to-content link.
- Links use the shared versioned services in-process, not cross-host HTTP. Public
  aliases stay unchanged; immutable IDs identify management operations.
- Search, status/privacy filters, honest page-local metrics and paginated inventory.
- Create links with generated/custom aliases, password protection and directory
  visibility. Repeated identical create/schedule requests retain their retry key.
- Version-checked destination, password, visibility, deprecation, availability
  window and quota edits. Conflicts require reload; drafts are not silently retried.
- Archive/restore reserves aliases. Explicit typed confirmation retains
  permanent deletion with an atomic ID/version condition to protect recycled aliases.
- Paginated destination history and destination-only restoration; UTC scheduled
  changes and cancellation. Scheduled changes retain version/permission guards.
- Dashboard shortcuts and recoverable errors; existing Stats charts, owner account
  creation, role/password and permanent account-removal workflows remain available.
- Workspace reads/writes revalidate the cookie session; safe audit events contain
  no form bodies, destinations or credentials. The API specification remains an
  authenticated Admin-host-only download. An authenticated `/admin/api` Swagger
  explorer supports browsing/filtering operations and schemas with self-hosted
  assets. Try it out targets only the configured trusted API base URL, with exact
  Admin-origin CORS and automatic CSRF proof for API-v1 cookie writes. Request
  credentials are memory-only; API/Public do not expose the explorer. Parameter,
  schema, description and response text use high-contrast dark-theme styling.
- Breaking API change: all unversioned `/api/*` endpoints are removed, including
  their OpenAPI entries. V1 now also provides permanent link deletion, direct owner
  account creation/deletion/password reset and the protected historical dashboard.
  Swagger executes only `/api/v1/` routes. Public aliases and in-process UI workflows
  remain unchanged; operational probes and robots use their standard non-API paths.

## Rollout

No new schema is introduced by 6.2. Apply the complete 6.1
schema before deploying these hosts. `UrlShortener:PublicBaseUrl` must be the
canonical Public host URL; inventory fails safely when it is invalid or missing.
Before deploying the API host, migrate every external unversioned client using
the [API migration table](API.md#migrating-unversioned-clients-breaking-change).
Old routes return 404; rollback requires the matching previous API binary, not a
proxy redirect. Probe `/health/live` and `/health/ready`, never the removed API status.
For explorer execution, set `UrlShortener__ApiBaseUrl` on Admin and
`Cors__AdminOrigin` on API to your trusted API base URL and exact Admin origin.
Both require HTTPS except on loopback; empty settings keep browser execution
disabled. Shared-cookie execution also needs the existing shared CookieDomain
and Data Protection key ring; otherwise use an API key in Authorize. Existing
authorization, CSRF, throttling, ETag and idempotency requirements still apply.
Normal link removal should use archive. Clearing an existing single availability
bound requires clearing both bounds and saving before setting the replacement.

Run `bash tests/run-regressions.sh` with isolated PostgreSQL binaries or the CI
image. Validate Admin sign-in, circuit reconnects, clipboard permissions, keyboard
navigation and narrow screens behind the actual reverse proxy before release.
Local tests/previews are not evidence of deployment acceptance.
