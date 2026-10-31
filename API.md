# API v1 — release 6.2

All API operations now use `/api/v1`. Release 6.2 removes the unversioned API
(HUS-67); old routes return **404**, without redirects or compatibility shims.
Contract version `v1` is independent of application release `6.2`. Permanent
deletion and direct owner-account workflows are available through v1 as below.
The Admin/Public UIs continue calling shared services in-process, not HTTP.

## Hosts and authentication

* **API:** `/api/v1` resources below. Operational probes use `/health/live` and
  `/health/ready`; crawler discovery uses `/robots.txt` (not API resources).
* **Admin:** cookie login/logout; `GET /openapi/v1.json` for current admin/owner
  cookies only, with a navigation download link. Generated offline from actual API
  routes/DTOs without starting/contacting an API listener or database.
* **Public:** human-facing aliases such as `/m` and `/github`, never replaced by IDs.

Release 6.2 adds an authenticated Admin-only Swagger explorer at `/admin/api`
with local assets, operation filtering and expandable schemas. Request execution
requires `UrlShortener__ApiBaseUrl` on Admin and `Cors__AdminOrigin` on API, set
to the exact trusted API base URL and Admin origin respectively. HTTPS is required
except for loopback development. Without the API URL the explorer is browse-only.
The browser uses the shared cookie (configure CookieDomain/key ring for sibling
hosts) or an API key entered in Authorize; credentials are not persisted. API-v1
cookie writes automatically obtain fresh CSRF proof. Supply `If-Match` and
`Idempotency-Key` where documented; execution can mutate real data. CORS trusts
one configured origin, never a wildcard, and exposes ETag/retry headers. There is no `/docs`
route; API/Public serve neither the specification nor an explorer. Replace the
example server with your API hostname in consuming
tools. Set `UrlShortener__PublicBaseUrl` to the trusted canonical Public URL,
including supported path base; `short_url` and QR never use caller Host or the
Admin/API origin. Homepage links remain hardcoded; directory Visit is HUS-64.

Keys use `X-API-Key` or `Authorization: Bearer` with an opaque key, not a digest/JWT.
Supported space-separated scopes:

| Scope | Permission |
|---|---|
| `urls:read` | Links/check/QR and schedule listing |
| `urls:write` | Mutations, schedules, operation results; does not also require read |
| `urls:private` | Additional visibility/mutation permission for private links |
| `urls:history` | With read/write, history listing/restoration |
| `urls:import` | With write, preview/confirm; alone, import listing/details |
| `urls:export` | Inventory export with read |
| `urls:bulk` | Bulk preview/confirm with write |
| `analytics:read` | Aggregates; per-link analytics also requires read |

Existing keys receive **no automatic scope upgrade**. Issue/rotate appropriately
scoped keys before migrating clients. Private resources without private permission
return 404. Aggregate analytics without that permission excludes private links and
unassigned legacy traffic. Admin/owner cookies grant link/analytics permissions;
viewer cookies grant only self-service. Account/key listings/details and diagnostics
require admin/owner cookies; issuance/revocation/rotation/invitations/role/disable/
reset-token issuance and direct account creation/deletion/password reset require
owner cookies. The historical dashboard is also admin/owner-cookie-only. Keys
cannot cross these boundaries.

Cookie mutations require `X-CSRF-Token` and its matching antiforgery cookie from
`GET /api/v1/auth/csrf`, even if a key accompanies an ambient login cookie. No
permissive CORS is enabled; only the explicitly configured Admin origin is trusted.

## Complete resource families

Paths are relative to `/api/v1`; GUIDs are immutable management identities.

| Methods and paths | Purpose |
|---|---|
| `GET, POST /links`; `GET, PATCH, DELETE /links/{id}` | Pagination/create/details/edit/permanent deletion |
| `POST /links/{id}/archive`, `/restore`, `/check` | Lifecycle / no-admission evaluation |
| `GET /links/{id}/qr`; `POST /links/{id}/verify-password` | Public-URL PNG / anonymous password admission |
| `GET /links/{id}/history`; `POST /links/{id}/history/{revisionId}/restore` | Destination revisions/new restoration revision |
| `GET, POST /links/{id}/scheduled-changes`; `DELETE /links/{id}/scheduled-changes/{changeId}` | Durable guarded destination changes/cancellation |
| `GET /analytics/overview`, `/traffic`, `/breakdowns`, `/export` | Totals/UTC buckets/browser+OS/CSV |
| `GET /analytics/dashboard` | Cookie-only historical dashboard: totals, alias/browser/OS/weekday/hour distributions, quiet buckets, safe recent activity |
| `GET /links/{id}/analytics`; `GET /links/export` | Exact-incarnation analytics / inventory CSV |
| `POST /imports/preview`, `POST /imports`; `GET /imports`, `/imports/{id}` | Dry run/confirmation/progress/results |
| `POST /bulk-operations/preview`, `POST /bulk-operations`; `GET /operations/{id}` | Dry run/confirmation/caller-authorized results |
| `GET, POST /api-keys`; `GET /api-keys/{id}`; `POST /api-keys/{id}/revoke`, `/rotate` | Safe metadata/scoped issuance/revocation/rotation |
| `GET, POST /users`; `GET, PATCH, DELETE /users/{id}` | Accounts/direct creation/role/enabled state/permanent removal |
| `POST /users/{id}/reset-password` | Direct owner reset using `{ "password": "..." }`; revokes sessions/tokens |
| `POST /invitations`; `POST /auth/accept-invitation` | Setup token/recipient chooses password |
| `POST /users/{id}/password-reset-tokens`; `POST /auth/reset-password` | Reset issuance/redemption |
| `GET, PATCH /me`; `POST /me/change-password`; `GET /auth/csrf` | Self-service/current-password proof/CSRF |
| `GET /system/status` | Safe schema/queue/build diagnostics |

Anonymous password verification uses an ID supplied by an authorized manager.
Existing Public password pages retain short-path addressing and the same admission
service; there is no anonymous ID enumeration endpoint. Successful verification
consumes quota and queues a visit: **never blindly replay it on timeout**. `/check`
accepts `{ "at": "UTC timestamp" }` or `{}` and never admits, fetches or records.

## Edits, retries and work

JSON is `snake_case`. Strong `ETag` (e.g. `"1"`) must be sent in `If-Match` for
PATCH, permanent link DELETE, archive/restore, history restoration and schedule creation. Missing proof
returns 428; stale drafts return 412. Admissions do not invalidate edit versions.
Destination changes append history; visibility/lifecycle changes only advance the
version. IDs/aliases never change. Unknown create/patch fields are rejected.
`clear_schedule` / `clear_quota` explicitly clear settings; otherwise omitted/null
patch fields retain their values. No alias rename endpoint is provided.

Archive blocks admission and hides directory entries; unlisting only hides entries.
Permanent link deletion returns 204 and releases the alias. It preserves historical
identity/revisions; old scheduled work and deleted IDs cannot affect a replacement.
Restore cannot bypass password/deprecation/schedule/quota. Bulk actions are archive,
restore, deprecate, activate, list and unlist, with 1..200 distinct IDs/versions.

Creation returns 201 + Location; queued work 202 + operation Location. Link creation,
schedule creation and import/bulk confirmation require `Idempotency-Key`: 8..128
printable non-space ASCII characters, bound to caller/action/resource/request.
Same-key replay returns the same resource's **current state**, not an old snapshot;
changed content returns 409. Replay lasts 24h; expired keys remain tombstones and
return 409. Never reuse an old key. Request fingerprints are salted hashes, not
credential-bearing payloads. Secret issuance/admission is not idempotently replayed.

Preview expiration is 24h; confirmation is caller-bound, not transferable between
keys. The API worker polls every five seconds. PostgreSQL transactions and row/
advisory locks support multiple workers; crashes/cancellation roll back. Execution
rechecks permissions, immutable identity and expected versions; stale/revoked work
never overwrites newer state. Import conflicts are per-row, bulk conflicts per-ID.
Infrastructure failure remains pending for retry. Completed job input and expired
preview input are erased. Idempotency tombstones and history require application-DB
storage monitoring; no destructive retention job is introduced.

## Bounds and errors

* Pagination: `page` 1..1,000,000; `page_size` 1..200 (default 50); search <=200.
  Envelopes contain items/total/page/page_size/continuation flags; stable alias or
  creation-time/ID ordering. Status active/deprecated/archived, privacy public/private,
  roles owner/admin/viewer; unknown filters return 400.
* Aliases 1..128 ASCII alphanumeric/underscore/hyphen, alphanumeric first; reserved
  paths rejected. HTTP(S) destinations <=4096, no credentials/controls/backslashes.
  No destination fetch/SSRF probe. Link passwords 1..1024, new account passwords
  12..1024, emails <=320. Positive quota; start precedes end; custom rules unsupported.
* API-server body limit 2 MiB. Versioned throttling: 120 requests/minute/caller
  (IP for anonymous), no queue; password/token proof also uses shared credential
  attempt limits. These are process-local; distributed edge limits need rollout review.
* CSV import is JSON `{ "csv": "..." }` with exact header
  `short_path,destination_url,listed`, 1..200 rows, <=1 MiB characters and <=4096/field.
  Updates retain other settings; invalid previews cannot be confirmed. Inventory
  export errors above 200 filtered links, **never truncates**; traverse pagination
  for larger inventories. CSV neutralizes spreadsheet formulas; no password/visitor data.
* Analytics `from` inclusive / `to` exclusive, last 30 days by default; UTC
  hour/day/month/year, <=3650 days and <=10,000 buckets. Quiet buckets remain, totals
  are exact, browser/OS Other preserves totals. Historical traffic stays `legacy`,
  never guessed into a recreated alias. Restricted per-link history is identity-bound.
* Key expiry 1..365 days (default 90); rotation overlap 0..1440 minutes never extends
  old expiry; replacement defaults to 90 days. Invitation/reset tokens expire in 24h,
  have distinct purposes and are account-bound/single-use. Account disabling revokes
  cookies/tokens; the final usable owner is protected.

Versioned errors are Problem Details with `code`, `request_id`, and validation
`errors` field maps; 429 includes `Retry-After`. All versioned responses use
`Cache-Control: no-store`, including secret issuance/denial/errors. Audits record
caller/action/status/request ID, never bodies, credentials or database details.
New keys/setup/reset tokens are reveal-once; metadata never returns stored secrets.

## Migrating unversioned clients (breaking change)

| Removed legacy functionality | v1 replacement |
|---|---|
| `/api/admin-urls` and `/page` | `/api/v1/links`; use the pagination envelope, `page_size`, `destination_url`, IDs and ETags |
| `/api/admin-analytics` | `/api/v1/analytics/*`; `/dashboard` preserves historical aggregates for Admin cookies |
| `/api/api-keys`, `/api/admin-keys` and `/page` | `/api/v1/api-keys`; scoped expiring issuance, revoke instead of metadata deletion |
| `/api/admin-management` and `/page` | `/api/v1/users`; target immutable user IDs for PATCH/DELETE |
| `/api/auth/signup` or passwordless account creation | `POST /api/v1/users` with email/password/role, or `POST /api/v1/invitations` |
| Direct owner password reset | `POST /api/v1/users/{id}/reset-password` |
| `/api/admin-management/create-password-token` | `POST /api/v1/users/{id}/password-reset-tokens` |
| `/api/auth/set-password` | `POST /api/v1/me/change-password`; email changes use `PATCH /api/v1/me` |
| `/api/auth/reset-password` | `POST /api/v1/auth/reset-password`; invitation tokens use `/auth/accept-invitation` |
| `/api/verify-password` | `POST /api/v1/links/{id}/verify-password`; Public short-path password pages are unchanged |
| `/api/status`, `/api/robots.txt` | `/health/live`, `/health/ready`, `/robots.txt`; restricted diagnostics at `/api/v1/system/status` |

Lists no longer return bare arrays or legacy continuation headers. Traverse `items`
using `page`/`page_size` until `has_next` is false. New link bodies use
`destination_url`, not `redirect_url`; edits and deletion target IDs, never aliases.
Key issuance returns `id` and a reveal-once `key`; expiry uses `expires_in_days`.
Do not automatically grant existing keys new private/analytics scopes. Recent
dashboard activity deliberately omits IPs, raw user agents and visitor IDs; raw
visitor identifiers are not restored to the API. Dashboard `time_range` is days
(default 30, 0 for all time, maximum 3650); `resolution` is explicit and output is
limited to 10,000 buckets with an error, not silent truncation. Its historical
totals include legacy/directory visits; identity-bound `/analytics/*` views separate
those from redirects. Dashboard responses can be cached internally for 30 seconds.
Migrate external integrations and probes **before** deploying 6.2. No legacy
redirect is provided because replaying mutations with old bodies is unsafe.

## Schema and rollout

The canonical embedded `src/UrlShortener.Shared/Db/schema.sql` adds unique `link_id`,
`edit_version`, archive/listing flags, account enabled state, token purpose, visit
identity/type and revision/schedule/operation/idempotency tables. Existing aliases
remain primary keys; IDs and initial destination history backfill once. Historical
visits remain unassigned. Read-only readiness/preflight includes the new tables.
Admin builds the API contract assembly but does not start its worker/listener.

Back up and approve a maintenance-window migration of the **application database**
before rolling all three hosts. Auto-migration=false still requires applying and
verifying this schema. The standalone source Migrator is not CSV import or a
job/history backup/restore tool; use database backups. Implementation has not
deployed anything or changed shared PostgreSQL. Live proxy caching, browser/cookie/
host isolation and staged rollout acceptance remain separate from local tests.
