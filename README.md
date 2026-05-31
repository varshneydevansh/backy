# Backy

> **Free, open-source visual website builder and CMS backend.**
> Product name is **backy**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-2.0-3ECF8E.svg)](https://supabase.com/)

---

## What Backy is

Backy is a backend-first, open-source CMS platform with a drag-and-drop editor.  
The goal is to give non-technical and technical teams a complete website-authoring backend with API-first output for any custom frontend.

---

## Features

- Wix-like visual editor (canvas + absolute layout, components, properties, preview).
- CMS workflows (sites, pages, blog posts, media, forms, comments).
- Team and role-based access model.
- Public rendering and API surface for custom frontends.
- Theme system (colors, spacing, fonts, tokens).

---

## Repo structure

```
backy/
├── apps/
│   ├── admin/   # Backy admin UI + editor + management
│   └── public/  # Backy public renderer + public endpoints
├── packages/
│   ├── core/    # Shared types and utilities
│   ├── database/# DB adapters and queries
│   ├── auth/    # Auth/contracts/helpers
│   ├── storage/ # Storage abstraction
│   ├── editor/  # Editor-specific UI logic
│   └── billing/ # Billing layer (future/optional)
├── specs/       # Product and implementation specs
├── supabase/    # Database migrations
└── scripts/     # Setup/build helpers
```

---

## Quick start

### 1) Clone

```bash
git clone <your-fork>/backy.git backy
cd backy
```

### 2) Install

```bash
npm install
```

### 3) Configure env

```bash
# apps/admin/.env
VITE_BACKY_PUBLIC_API_BASE_URL=http://localhost:3001/api
VITE_BACKY_ADMIN_API_BASE_URL=http://localhost:3001/api/admin
VITE_BACKY_ADMIN_API_KEY=dev-admin-key-change-me
```

### 4) Start

```bash
npm run dev
```

Admin runs on `http://localhost:5173`; public app runs on `http://localhost:3001`.

---

## Deployment model (recommended for production)

Backy is designed to run as two deployable apps:

1. `backy-admin`
   - Admin UI
   - Content editor
   - DB/write operations
2. `backy-public`
   - Public page rendering
   - Read endpoints
   - Form/comment submission endpoints

For external/custom frontends, use the public endpoints from `apps/public` directly and treat `backy-public` as your headless CMS host.
AI agents and external frontend teams should start with `GET /api/sites/:siteId/agent-handoff`; it returns a copyable `agentBrief`, canonical read order, manifest/OpenAPI/render/SDK pointers, every-component APIability rules, canvas-first creation routes, and design-state round-trip rules required for Backy canvas compatibility. Use `specs/custom-frontend-agent-handoff.md` as the human-readable companion.

## Vercel release runbook

Create two Vercel projects from this repo so admin/editor traffic and public/custom frontend traffic stay operationally separate.

### `backy-public`

- Root Directory: `apps/public`
- Framework Preset: Next.js
- Build Command: `npm --prefix=../.. run build:vercel:public`
- Development Command: `npm run dev`
- Runtime config: set `BACKY_DATA_MODE=database`, `BACKY_DATABASE_URL`, `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, storage/provider secrets, `NEXT_PUBLIC_BACKY_ADMIN_APP_URL`, and exact custom-frontend origins in `BACKY_CORS_ALLOWED_ORIGINS`.
- Cron config: `apps/public/vercel.json` schedules `/api/admin/commerce/reconcile?limit=100` at `0 3 * * *`.
- Cron protection: set `CRON_SECRET` to the same server-only value as `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY`. Vercel sends it as a bearer token, and Backy authenticates the scheduled reconciliation request through the admin-key path.

### `backy-admin`

- Root Directory: `apps/admin`
- Framework Preset: Vite
- Build Command: `npm --prefix=../.. run build:vercel:admin`
- Output Directory: `dist`
- Runtime config: set `VITE_BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api` and `VITE_BACKY_ADMIN_API_BASE_URL=https://<backy-public-domain>/api/admin`. Production admin auth uses session login plus the httpOnly `backy_admin_session` cookie against `backy-public`; do not put admin API keys in Vite/client environment variables.
- SPA routing and baseline headers are tracked in `apps/admin/vercel.json`.

### Protected topology

- Keep `backy-admin` protected with Vercel Deployment Protection, team SSO, or an equivalent access-control layer. It is only the editor/admin shell; it must not receive server-only database, storage, provider, cron, or admin API keys.
- Keep `backy-public` public for rendering, discovery, forms, comments, newsletter signup, and custom frontend API reads. Server-only admin APIs still require session cookies or admin API keys.
- Run custom website frontends as separate Vercel projects when useful. Each frontend should set `BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api`, `BACKY_SITE_ID=<site-id-or-slug>`, and optionally `BACKY_SITE_PUBLIC_HOST=<custom-host>`.
- Subdomains such as `studio.example.com`, `blog.example.com`, or `docs.example.com` are modeled as site custom domains. Use one Backy site per independent subdomain when content, navigation, SEO, or design tokens differ.
- Frontend builders and AI agents should start with `GET /api/sites/:siteId/agent-handoff`, then read manifest, OpenAPI, render, and frontend-design before creating UI or templates. Do not copy Backy content into a frontend-local JSON source of truth.
- Optional Vercel Agent: after the two projects are linked, enable Vercel Agent Code Review from each project's Project Settings -> AI page. It is a Vercel platform setting; Backy does not need a runtime package or client-visible secret for it.

| Vercel project | Public status | Domains | Required env | Forbidden env |
| --- | --- | --- | --- | --- |
| `backy-public` | Public app with protected admin API routes | `content.<domain>` or the Backy API/rendering domain | `BACKY_DATA_MODE=database`, `BACKY_DATABASE_URL`/`DATABASE_URL` or Vercel Marketplace `POSTGRES_URL`, `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, provider/storage secrets, `CRON_SECRET`, `NEXT_PUBLIC_BACKY_ADMIN_APP_URL`, and exact custom-frontend origins in `BACKY_CORS_ALLOWED_ORIGINS` | Client-exposed copies of database, storage, provider, cron, or admin secrets |
| `backy-admin` | Protected admin shell | `admin.<domain>` or private Vercel preview/production URL | `VITE_BACKY_PUBLIC_API_BASE_URL`, `VITE_BACKY_ADMIN_API_BASE_URL` | `BACKY_DATABASE_URL`, storage/provider secrets, `CRON_SECRET`, `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, and any `VITE_*` admin key |
| Custom frontend | Public website/app | `www.<domain>`, `blog.<domain>`, `studio.example.com`, or another site-specific domain | `BACKY_PUBLIC_API_BASE_URL`, `BACKY_SITE_ID`, optional `BACKY_SITE_PUBLIC_HOST` | Backy admin URLs, admin/session secrets, provider secrets, database URLs, or copied Backy content as a second source of truth |

Backy-hosted routes in `apps/public` currently support `/sites/<site-slug>` paths and custom-domain lookup through the public site APIs. For separate custom frontend projects, resolve the site by `BACKY_SITE_ID` first, then use `BACKY_SITE_PUBLIC_HOST` only as metadata for canonical URLs, SEO, and domain ownership until host-based rendering is promoted through the production-hardening gate.

### Secure admin account setup

The local seeded accounts are for development only. Production admin access should not depend on committed emails, passwords, or client-visible keys.

- Configure Supabase Auth or another provider-backed login on `backy-public` with server-side env only: `BACKY_SUPABASE_URL` plus `BACKY_SUPABASE_ANON_KEY` or a server-only service-role key when needed by the provider path.
- For a fresh production database, create the first real owner through `POST /api/admin/auth/bootstrap-owner` using a server-only `BACKY_OWNER_BOOTSTRAP_TOKEN`. The endpoint creates the Supabase Auth user, Backy `owner` profile, and initial workspace membership, then refuses to create another active owner.
- Create the real owner/editor users in the Backy database and keep their email addresses aligned with the identity provider. Backy grants workspace roles from its own user records after provider authentication succeeds.
- Keep MFA configured for production with `BACKY_ADMIN_MFA_TOTP_SECRET` or user recovery codes stored in the persistent settings store; use `BACKY_ADMIN_MFA_CODE` only for controlled development or disposable certification runs.
- Keep `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, `CRON_SECRET`, database URLs, storage/provider secrets, and payment keys on `backy-public` server-side env. Do not configure them on `backy-admin`, custom frontends, `NEXT_PUBLIC_*`, or `VITE_*` variables.
- Do not enable `BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH` or `BACKY_ALLOW_PRODUCTION_DEMO_MODE` for a release. The production build guard rejects those flags so a demo-auth deployment cannot be promoted accidentally.
- Use Vercel Deployment Protection or SSO on `backy-admin` even though API/session enforcement also lives on `backy-public`; the editor shell should not be broadly discoverable.

Example first-owner bootstrap request. Keep the token and password out of Git, shell history, screenshots, and frontend env:

```bash
curl -X POST https://<backy-public-domain>/api/admin/auth/bootstrap-owner \
  -H "content-type: application/json" \
  -H "authorization: Bearer $BACKY_OWNER_BOOTSTRAP_TOKEN" \
  --data '{"email":"you@example.com","password":"use-a-long-private-password","fullName":"Your Name"}'
```

Run `npm run test:vercel-release-config && npm run test:vercel-preview-readiness && npm run test:vercel-production-readiness && npm run test:repo-public-hygiene` before release to verify the checked-in Vercel topology, launch homepage links, local Vercel CLI auth, packaging ignores, project linkage, GitHub repository connection, env-boundary warnings, production promotion rules, public repo hygiene, and expected remote project names. For strict operator validation, run `BACKY_VERCEL_REQUIRE_CLI=1 BACKY_VERCEL_REQUIRE_PROJECT_LINKS=1 BACKY_VERCEL_REQUIRE_REMOTE_PROJECTS=1 BACKY_VERCEL_REQUIRE_REMOTE_ENV=1 npm run test:vercel-preview-readiness` after creating/linking `backy-public` and `backy-admin` and configuring the required Vercel env on both projects.

Use Vercel CLI `47.2.2+` for preview deploys; the local global CLI may be older, so `npx vercel@latest` is the safest release command. The repo root and app roots include `.vercelignore` files so local `.next`, `dist`, cache, Vercel link, and `node_modules` folders are not uploaded as source.

Deploy from the repo root after linking that root to the target Vercel project. The Vercel project `Root Directory` still points at the app, so the build command must jump back to the monorepo root and build workspace packages first:

```bash
npx vercel@latest link --project backy-public --yes
npx vercel@latest deploy --target=preview --yes

npx vercel@latest link --project backy-admin --yes
npx vercel@latest deploy --target=preview --yes \
  --build-env VITE_BACKY_PUBLIC_API_BASE_URL=https://<backy-public-preview>/api \
  --build-env VITE_BACKY_ADMIN_API_BASE_URL=https://<backy-public-preview>/api/admin
```

Do not use the current prebuilt standalone output as release proof for `backy-public`; it can produce static assets without the Next.js API routes Backy needs for `/api/sites/:siteId/agent-handoff`, manifest, OpenAPI, render, forms, and admin API traffic.

### Production promotion gate

Never promote a preview or production alias while `BACKY_DATA_MODE=demo`, while database/provider/storage env is missing, or while the public production URL cannot serve Backy JSON contracts. A Vercel deployment can be marked Ready even when the public alias points at a stale static build, so production proof must hit the final public domain directly.

Vercel production builds run a public env guard before Next.js builds. Missing `BACKY_DATA_MODE=database`, database URL, admin keys, cron secret, admin app URL, or CORS origins now fail the production build early instead of producing a Ready deployment with crashing API routes. The guard also rejects production builds that leave `BACKY_ALLOW_PRODUCTION_DEMO_MODE` or `BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH` enabled. Run `npm run test:vercel-public-production-env-guard` when changing the guard or release scripts.

Before promoting or sharing a production URL, set `BACKY_DATA_MODE=database` on `backy-public`, configure real Supabase/Postgres, storage/provider, admin/session, cron, and CORS env, then run:

```bash
BACKY_VERCEL_PRODUCTION_URL=https://<backy-public-production-domain> \
BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 \
npm run test:vercel-production-readiness
```

The live gate fetches:

- `/api/sites/site-demo/agent-handoff`
- `/api/sites/site-demo/manifest`
- `/api/sites/site-demo/openapi`
- `/api/sites/site-demo/render?path=/`

All four must return JSON from the final public domain. A 401 Vercel protection page, 404 `NOT_FOUND`, static HTML, or missing production-readiness topology is a failed production proof. Use `BACKY_VERCEL_PRODUCTION_SITE_ID=<site-id-or-slug>` when certifying a non-demo production site.

The public repository should also stay neutral: do not commit local absolute paths, personal email addresses, generated Vercel deployment URLs, Vercel project/team/deployment ids, or user-specific domains. `npm run test:repo-public-hygiene` guards the generic cases; local operators can add private marker checks with `BACKY_REPO_HYGIENE_PRIVATE_MARKERS` without committing those markers.

---

## Documentation and tracking

- [Completion spec](./specs/backy-cms-completion-spec.md)
- [Platform gap analysis and AI frontend contract](./specs/backy-platform-gap-analysis-and-ai-frontend-contract.md)
- [Page and backend completeness audit](./specs/page-completion-audit/backy-page-surface-audit.md)
- [AI frontend contract area](./specs/ai-frontend-contract/README.md)
- [Parity roadmap](./specs/backy-wix-canva-cms-v1-roadmap.md)
- [Editor spec](./specs/editor_complete_spec.md)
- [Editor v2 spec](./specs/editor_v2.md)
- [API contracts](./specs/backy-api-contracts.md)

---

## License

This project is licensed under MIT. See [LICENSE](./LICENSE).

---

<p align="center">
  <strong>Built for people who want full control without SaaS lock-in.</strong>
</p>
