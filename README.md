# Textile Loom Production Management System

React frontend and Node.js/Express backend for loom setup, worker assignments, daily production, submitted entries, reports, audit history, and Excel exports. Factory accounts are isolated with Supabase Auth and PostgreSQL Row Level Security (RLS). Supabase stores one JSONB production snapshot per factory, keyed by `tenant_id`; the backend uses revision checks to prevent concurrent saves from overwriting each other. Supabase Postgres Changes updates each factory's open browsers without a page refresh.

## Structure

```text
frontend/           React, Tailwind, Vite entry and public assets
backend/            Express routes, auth, data services and scripts
backend/sql/        Supabase schema and RLS migration
shared/             Reserved for shared contracts
data/               Local legacy backup (gitignored)
```

The existing calculation and report services read one coherent `tenant_states.state` JSONB snapshot per factory. Factory owner requests always use the `tenant_id` assigned to the verified Supabase Auth profile; a request header cannot switch an owner to another factory. Admins explicitly select an active factory. Each save updates only that tenant's row with a revision guard; concurrent edits return HTTP 409. The service role key stays on the backend, where routes enforce the authenticated profile's tenant, while RLS scopes factory owners' Realtime subscriptions.

## Setup

1. Install Node.js 22.12 or newer (below 25) and run `npm ci`.
2. Copy `.env.example` to `.env` and set the Supabase URL, publishable key, and server only service role key. Never put the service role key in a `VITE_` variable. `.env` is gitignored. The application runtime uses Supabase's API; direct Postgres connectivity is not required.
3. Run `backend/sql/001_tenants.sql` once in the Supabase SQL Editor. This creates tenants, profiles, tenant state, RLS policies, the revision update function, and the Realtime publication. If it was already applied, do not run it again.
4. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) in your local `.env`, then run `npm run db:bootstrap-admin` once.
5. Run `npm run db:check` to verify every factory has its own state row.
6. Run `npm run dev` and open `http://localhost:3002`. Admin can create a factory owner and select that factory. Each factory owner signs in to their own workspace and sees only their factory's data.

The legacy JSON file is deliberately excluded from Git. To import it, put the backup at `data/loom_db.json` (or set `IMPORT_FILE`), create a factory from the admin screen, then run `npm run db:import-json` with `IMPORT_TENANT_ID` set to the new factory UUID. Import refuses to overwrite a factory after its first write. Legacy plaintext demo users are removed from the imported snapshot.

## Cloud deployment

- **Vercel frontend:** connect this repository at its root, build with `npm ci --include=dev` and `npm run build`, and publish `dist/`. Set `VITE_API_URL` to the Render API origin, plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for authenticated realtime updates.
- **Render backend:** use `npm ci --include=dev` and `npm start`. Set `NODE_ENV=production`, `SERVE_FRONTEND=false`, `CORS_ORIGINS` to the exact Vercel site origin, and the Supabase URL, publishable key, and service-role key. Render supplies `PORT`; `/healthz` is the health endpoint. Keep the service-role key only on Render.
- Configure `VITE_API_URL` in Vercel to the deployed Render service URL. Configure `CORS_ORIGINS` in Render to the deployed Vercel production URL. Redeploy both services after changing these values.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express with Vite middleware on port 3002 |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Serve the production build and API |
| `npm run lint` | TypeScript check |
| `npm run db:check` | Verify Supabase access and that each factory has a state row |
| `npm run test:realtime` | Send a settings update and verify an RLS authorized live event; needs owner test credentials in local `.env` |

## Security notes

- Rotate the service role key if it was shared outside a secure channel. It bypasses RLS and must remain on the server.
- Owner tenant IDs come from verified Supabase Auth profiles, never from request headers. The `x-tenant-id` header is accepted only for an admin selecting an existing active factory.
- Admin created owner passwords are temporary. Owners can use **Change password** in the app after signing in.
- Keep database backups. `tenant_states` stores the full factory data snapshot, and the JSON backup is not in the repository.
