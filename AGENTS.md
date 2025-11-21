# Repository Guidelines

## Project Structure & Module Organization
- Next.js 15 app-router code lives in `src/app`; route folders map directly to paths (root links page in `src/app/page.js`, all-urls view in `src/app/urls`, admin panel in `src/app/admin`, API handlers in `src/app/api`).
- Shared building blocks sit in `src/app/components`, hooks in `src/app/hooks`, helpers in `src/app/utils.js` and `src/app/lib`. Global styles are in `src/app/globals.css`; middleware and auth/redirect logic live in `src/middleware.js`.
- Static assets are under `src/public`. Supabase schema and seeds are kept in `supabase/sql`; update these when database shape changes.

## Build, Test, and Development Commands
- `pnpm install` (required via `npx only-allow pnpm`) installs dependencies.
- `pnpm dev` runs the app with Turbopack on port 3000 for local work.
- `pnpm build` creates the production bundle; `pnpm start` serves that build.
- `pnpm lint` runs Next.js ESLint; keep it clean before pushing.

## Coding Style & Naming Conventions
- Use modern React/Next patterns (server vs client components as needed). Prefer functional components and keep side effects in hooks.
- Indent with 2 spaces; keep imports ordered (third-party, then internal), and default to named exports for shared utilities.
- Routes and directories use kebab-case (`set-password`, `access-denied`); functions/constants use camelCase; environment keys match the `.env.example` names.
- Styling is Tailwind-first; add global CSS only when necessary and avoid inline style objects unless dynamic.

## Testing Guidelines
- No automated tests exist yet; add them alongside features. Default to `*.test.js` files near the code or an `__tests__` folder per route/module.
- Cover critical flows: redirect handling, auth/role gating, and Supabase/Redis interactions. Include simple mocks for external services.
- Block merges that break `pnpm lint`; if you add a test runner (Jest/Playwright), wire a `pnpm test` script and document required env vars.

## Commit & Pull Request Guidelines
- Follow the existing log style: concise imperative subjects, optionally with linked PR numbers (e.g., `Normalize Redis URL configuration (#50)`). Keep commits focused.
- Target the `dev` branch for PRs. Provide a clear summary, linked issues, and screenshots/gifs for UI changes (`/urls`, `/admin`, `/password-protected`).
- Call out schema or env changes (`.env`, `supabase/sql`) and update `.env.example` when adding new variables. Confirm you ran `pnpm lint`/`pnpm build` locally.

## Environment & Security Notes
- Base your secrets on `.env.example`; do not commit `.env` files. Key variables: `GITHUB_ID/SECRET`, `NEXTAUTH_SECRET/URL`, `SUPABASE_URL/KEY/SERVICE_ROLE_KEY`, `APIKEY_DB`, `ADMINS_DB`, `NEXT_PUBLIC_*`. Optional: `REDIS_URL` to enable caching of redirect lookups.
- Avoid logging secrets or returning them from API routes. Keep issued secrets stable; only replace them if you intentionally regenerate credentials and then propagate updates to Supabase/NextAuth configs.
