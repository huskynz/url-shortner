# Swagger UI assets

Vendored from `swagger-ui-dist@5.34.1` (Apache-2.0). No npm installation,
postinstall script, CDN, external validator or telemetry integration is used.
Only the browser bundle, stylesheet and license/notice are included.
Assets are embedded and served only through authenticated Admin endpoints.

Source: https://registry.npmjs.org/swagger-ui-dist/-/swagger-ui-dist-5.34.1.tgz

Verified npm archive integrity (SHA-512):
`VSr8fXfI93obYaQicLJbLUKGRxDojj/SfRJDDLCioGTUBj4BK/Nj4eE9jCeCAnJxVLi7iS+08PbiZLyrQKBkJQ==`

SHA-256:

- `swagger-ui-bundle.js`: `36EEB4D5640B9C036B1D0F854499AF1CCEEBBDB260B790A03A18BE5E8488FBF5`
- `swagger-ui.css`: `C3CFE8248C4B0B89673600FB829924EAFBAC6DE4BC4B2B06F5F5243483074D0A`

`explorer.js` and `explorer.css` are application-owned initialization/theme files.
The explorer enables API execution only for an administrator-configured trusted
API base URL. Cookies use exact-origin API CORS and fresh CSRF proof for API-v1
writes. API keys stay in memory; the external validator remains disabled.
