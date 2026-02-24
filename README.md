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
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_API_URL=http://localhost:3001
VITE_ADMIN_URL=http://localhost:3000
```

### 4) Start

```bash
npm run dev
```

Admin runs on `http://localhost:3000`; public app runs on `http://localhost:3001`.

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

---

## Documentation and tracking

- [Completion spec](./specs/backy-cms-completion-spec.md)
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
