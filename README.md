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
- Build Command: `npm run build`
- Development Command: `npm run dev`
- Runtime config: set `BACKY_DATA_MODE=database`, `BACKY_DATABASE_URL`, `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, storage/provider secrets, and `NEXT_PUBLIC_BACKY_ADMIN_APP_URL`.
- Cron config: `apps/public/vercel.json` schedules `/api/admin/commerce/reconcile?limit=100` at `0 3 * * *`.
- Cron protection: set `CRON_SECRET` to the same server-only value as `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY`. Vercel sends it as a bearer token, and Backy authenticates the scheduled reconciliation request through the admin-key path.

### `backy-admin`

- Root Directory: `apps/admin`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Runtime config: set `VITE_BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api`, `VITE_BACKY_ADMIN_API_BASE_URL=https://<backy-public-domain>/api/admin`, and `VITE_BACKY_ADMIN_API_KEY`.
- SPA routing and baseline headers are tracked in `apps/admin/vercel.json`.

### Protected topology

- Keep `backy-admin` private or access-controlled. It is the editor/admin shell and should call the protected `backy-public` admin APIs with an admin API key.
- Keep `backy-public` public for rendering, discovery, forms, comments, newsletter signup, and custom frontend API reads. Admin writes still require sessions or admin API keys.
- Run custom website frontends as separate Vercel projects when useful. Each frontend should set `BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api`, `BACKY_SITE_ID=<site-id-or-slug>`, and optionally `BACKY_SITE_PUBLIC_HOST=<custom-host>`.
- Subdomains such as `akriti.devanshvarshney.com`, `blog.devanshvarshney.com`, or `docs.devanshvarshney.com` are modeled as site custom domains. Use one Backy site per independent subdomain when content, navigation, SEO, or design tokens differ.
- Frontend builders and AI agents should start with `GET /api/sites/:siteId/agent-handoff`, then read manifest, OpenAPI, render, and frontend-design before creating UI or templates. Do not copy Backy content into a frontend-local JSON source of truth.

Run `npm run test:vercel-release-config` before release to verify the checked-in Vercel topology and launch homepage links.

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
