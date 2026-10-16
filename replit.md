# Automation Hub

An authenticated hub for organizing mini automation apps by category, with admin-managed categories and app cards.

## Run & Operate

- The `artifacts/automation-hub: web` workflow runs the React + Vite app.
- `pnpm --filter @workspace/api-server run dev` — run the shared API server.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Supabase schema: run `artifacts/automation-hub/supabase/migrations/001_automation_hub.sql` in the Supabase SQL Editor.
- Required Replit Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TypeScript
- Authentication and app data: Supabase Auth + PostgreSQL with row-level security
- API: Express 5 for password-reset email delivery
- Email: Brevo transactional API through the Replit connector
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/automation-hub/` — the app, Supabase migration, and setup guide
- `lib/api-spec/openapi.yaml` — API contract; generated clients and schemas live under `lib/api-client-react/` and `lib/api-zod/`
- `artifacts/api-server/src/routes/password-reset.ts` — creates recovery links server-side and sends them through Brevo

## Architecture decisions

- Supabase is the source of truth for login, roles, and app data; the service-role key is server-only.
- Database policies enforce the admin/user distinction; hiding admin controls in the UI is not the security boundary.
- Password-reset responses do not disclose whether an email belongs to an account.

## Product

- Authenticated users browse categories and launch app cards.
- Admins create, edit, and delete categories and their app cards.
- App cards require a name and HTTP(S) link.

## User preferences

- Visual direction: glossmorphism, with `#BD0F72` and `#FFFFFF`; responsive across devices.
- Use TypeScript, React + Vite, Supabase Auth/database, and Brevo email.

## Gotchas

- Run the Supabase migration before using the app.
- Create users in Supabase Auth; profiles default to `user`. Promote the first admin from the Supabase SQL Editor as documented in the app README.
- Supabase Auth must allow the app's preview and published URLs as redirect destinations.
- Brevo needs an active verified sender before password-reset emails can be delivered.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
