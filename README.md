# Textile Loom Production Management System

React frontend and Node.js/Express backend for loom setup, worker assignments, daily production, submitted entries, reports, audit history, and Excel exports. Factory accounts are isolated with Supabase Auth and PostgreSQL Row Level Security (RLS). The backend uses Prisma for transactional, revision checked persistence. Supabase Postgres Changes updates open browsers without a page refresh.

## Structure

```text
frontend/           React, Tailwind, Vite entry and public assets
backend/            Express routes, auth, data services and scripts
backend/sql/        Supabase schema and RLS migration
prisma/             Prisma model for tenants, profiles and tenant state
shared/             Reserved for shared contracts
data/               Local legacy backup (gitignored)
```

The existing calculation and report services read one coherent `tenant_states.state` JSONB snapshot per factory. Every request is authenticated, bound to its profile's tenant, and writes with a revision guard to prevent lost updates. Admins explicitly select a factory. A concurrent edit returns HTTP 409 and should be retried after refreshing the view. The database also applies RLS to tenant state and Realtime events. The service role key is used only by backend admin routes and scripts.

## Setup

1. Install Node.js 20 or newer and run `npm ci`.
2. Copy `.env.example` to `.env` and set the Supabase URL, publishable key, server only service role key, and the URL encoded Postgres `DATABASE_URL`. Never put the service role key in a `VITE_` variable. `.env` is gitignored.
3. Run `backend/sql/001_tenants.sql` once in the Supabase SQL Editor. This creates tenants, profiles, tenant state, RLS policies, the revision update function, and the Realtime publication. If it was already applied, do not run it again.
4. Run `npm run db:generate` and `npm run db:check`.
5. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) in your local `.env`, then run `npm run db:bootstrap-admin` once.
6. Run `npm run dev` and open `http://localhost:3002`. Admin can create a factory owner and select that factory. Factory owners see only their own data.

The legacy JSON file is deliberately excluded from Git. To import it, put the backup at `data/loom_db.json` (or set `IMPORT_FILE`), create a factory from the admin screen, then run `npm run db:import-json` with `IMPORT_TENANT_ID` set to the new factory UUID. Import refuses to overwrite a factory after its first write. Legacy plaintext demo users are removed from the imported snapshot.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express with Vite middleware on port 3002 |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Serve the production build and API |
| `npm run lint` | TypeScript check |
| `npm run db:check` | Check Prisma and Supabase API connectivity |
| `npm run test:realtime` | Send a settings update and verify an RLS authorized live event; needs owner test credentials in local `.env` |

## Security notes

- Rotate the service role key if it was shared outside a secure channel. It bypasses RLS and must remain on the server.
- Owner tenant IDs come from verified Supabase Auth profiles, never from request headers. The `x-tenant-id` header is accepted only for an admin selecting an existing active factory.
- Admin created owner passwords are temporary. Owners can use **Change password** in the app after signing in.
- Keep database backups. `tenant_states` stores the full factory data snapshot, and the JSON backup is not in the repository.
