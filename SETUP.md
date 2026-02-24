# Backy Setup

## Local environment

```bash
cd "/Users/devanshvarshney/Downloads/Scythian /backy"
npm install
```

## Environment variables

Create a `.env` at repo root:

```bash
# Database (SQLite for quick local run)
DATABASE_TYPE=sqlite
DATABASE_URL=./data/backy.sqlite

# PostgreSQL (production pattern)
# DATABASE_TYPE=postgres
# DATABASE_URL=postgresql://user:password@localhost:5432/backy

# Storage (local for local)
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=./uploads

# Auth
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRY=7d

# Optional OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Admin + public endpoints
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000
PUBLIC_SITE_URL=http://localhost:3001
```

## Run apps

```bash
npm run dev
```

You can also run separately:

- Admin: `cd apps/admin && npm run dev`
- Public: `cd apps/public && npm run dev`

## DB and storage workflows

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Deployment (Vercel)

Backy can be deployed as two Vercel apps:

1. `backy-admin` from `apps/admin`
2. `backy-public` from `apps/public`

Shared storage and database keys must be set in both apps (or only on `backy-public` for read-only flows).

## Security status notes

- Current local auth flow in `apps/admin` uses `mockStore` + mocked login helper for fast dev.
- SSO providers are scaffolded through environment settings and the auth package, but admin login is not yet production-grade.
- Public endpoints are also mostly scaffolded on top of mock data today and should be switched to DB-backed auth + RBAC before launch.

## Custom frontend and domain model

Use `backy-public` as the API host and renderer host:

1. Configure a custom domain on Vercel for `backy-public` (e.g. `content.your-domain.com`).
2. Use `/api/sites`, `/api/sites/:siteId/pages`, `/api/sites/:siteId/blog/...`, and form/comment endpoints in your frontend.
3. For custom customer domains, resolve domain-to-site mapping in your route layer before page render.
4. Move from path-based site slug (`/sites/[subdomain]/...`) to host-based lookup as part of production hardening.
