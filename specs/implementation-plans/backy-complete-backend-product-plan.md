# Plan: Backy Complete Backend Product

**Generated**: 2026-05-07
**Estimated Complexity**: High
**Target**: Make Backy a complete backend CMS/product that can power any frontend, while also providing a default generated/editable frontend.

## Overview

Backy should become a backend-first CMS and site platform with:

- Wix-like visual site creation: collections, datasets, dynamic pages, templates, media, forms, SEO, and visitor submissions.
- WordPress-like publishing simplicity: pages, posts, reusable blocks, revisions, users, roles, media library, REST APIs, and themes.
- Canva-like editing depth where content, assets, typography, colors, video, audio, layout, and individual element properties are controlled from Backy.
- Headless-first output so any custom frontend can consume Backy through stable APIs without importing admin/editor internals.

The next implementation should not start by adding more UI screens. The product is blocked by source-of-truth drift: admin uses local mock persistence, public uses a seeded in-memory store, and editor/public/core define different content contracts. The first milestone must freeze the content/API contract and move toward durable, authenticated, DB-backed services.

## Reference Inputs

- [Backy platform gap analysis](../backy-platform-gap-analysis-and-ai-frontend-contract.md)
- [AI frontend contract starter](../ai-frontend-contract/README.md)
- [Backy completion spec](../backy-cms-completion-spec.md)
- [Backy Wix/Canva/CMS roadmap](../backy-wix-canva-cms-v1-roadmap.md)
- Wix CMS overview: https://support.wix.com/en/article/cms-content-management-system-an-overview
- Wix Studio CMS docs: https://support.wix.com/en/article/wix-studio-using-the-cms
- WordPress Block Editor: https://developer.wordpress.org/block-editor/
- WordPress REST API: https://developer.wordpress.org/rest-api/

## Product Principles

1. **One content contract**
   - Admin editor, public renderer, APIs, database, SDKs, and AI-generated frontends use the same document model.

2. **API-first, not admin-first**
   - A custom frontend should need only public APIs and schemas.
   - Admin internals must never leak into custom frontend requirements.

3. **Blocks everywhere**
   - Page editor, blog editor, dynamic page templates, reusable sections, forms, and default generated frontend should reuse the same block composition model.

4. **Assets are first-class**
   - Images, videos, audio, files, fonts, icons, captions, alt text, variants, and usage bindings need a durable asset service.

5. **Every visible thing should be addressable**
   - Text spans, images, buttons, theme colors, fonts, spacing, actions, sounds, videos, and responsive overrides should map to stable Backy IDs.

6. **Publish is a workflow, not a boolean**
   - Draft, preview, publish, schedule, unpublish, archive, version, rollback, and audit need explicit contracts.

## Prerequisites and Decisions

- Choose one DB/query package boundary:
  - preferred: keep `packages/db` as schema/query boundary and retire duplicate `packages/database` after migration;
  - alternative: promote `packages/database` and fold `packages/db` schema into it.
- Choose auth/session provider:
  - Supabase Auth is fastest with current repo direction;
  - custom JWT/session layer is more portable but slower.
- Choose storage provider abstraction:
  - local/Supabase Storage first, S3/R2-compatible adapter second.
- Decide whether the first durable persistence milestone uses a local seeded SQLite/Postgres dev DB or Supabase-only.

## Sprint 1: Canonical Contracts and AI Frontend Schemas

**Goal**: Create the source-of-truth contract that admin, public, APIs, and AI-generated frontends will use.

**Demo/Validation**:
- Run typecheck for shared packages.
- Validate sample JSON payloads against schema files.
- Show that admin/editor/public contracts can reference the same exported types.

### Task 1.1: Define `BackyContentDocument`

- **Location**:
  - `packages/core/src/types/index.ts`
  - `packages/core/src/content-contract.ts` or equivalent new file
- **Description**:
  - Add a canonical document model for pages, posts, templates, and dynamic item pages.
  - Include `schemaVersion`, `kind`, `elements`, `themeTokenRefs`, `assets`, `interactions`, `seo`, `editableMap`, and `version`.
- **Dependencies**: none
- **Acceptance Criteria**:
  - Supports nested blocks and flat lookup by ID.
  - Supports responsive overrides.
  - Supports data bindings to collection fields.
  - Supports asset IDs instead of raw URLs only.
  - Supports action definitions for links/forms/media/custom actions.
- **Current progress**:
  - `packages/core/src/content-contract.ts` now exports the canonical `BackyContentDocument`, `BackyContentElement`, action, data-binding, theme-token, asset, SEO, interaction, and editable-map types.
  - Core helpers create documents, validate required structure and duplicate element ids, build a flat element index, and find nested elements by stable id.
  - `packages/sdk-js` now imports its public `BackyContentDocument` and `BackyElement` types from the core content contract instead of maintaining a separate local shape.
- **Validation**:
  - Typecheck `packages/core`.
  - Add unit tests for minimal valid page/post/template documents.
  - Current command: `npm run test:content-contract --workspace @backy-cms/core`.

### Task 1.2: Generate AI contract JSON Schemas

- **Location**:
  - `specs/ai-frontend-contract/content-payload.schema.json`
  - `specs/ai-frontend-contract/theme-tokens.schema.json`
  - `specs/ai-frontend-contract/element-actions.schema.json`
  - `specs/ai-frontend-contract/data-bindings.schema.json`
  - `specs/ai-frontend-contract/editable-map.schema.json`
- **Description**:
  - Convert the TypeScript contract into JSON Schema so external/AI frontends have a machine-readable boundary.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Schemas are versioned and reference each other consistently.
  - Schemas include examples or `$defs` for page, blog post, dynamic page, form, and comments.
- **Validation**:
  - Add JSON schema validation script or npm command.
  - Validate all example payloads.
  - Current command: `npm run test:ai-contract-examples --workspace @backy/public`.

### Task 1.3: Add canonical sample payloads

- **Location**:
  - `specs/ai-frontend-contract/examples/page.json`
  - `specs/ai-frontend-contract/examples/blog-post.json`
  - `specs/ai-frontend-contract/examples/dynamic-item-page.json`
  - `specs/ai-frontend-contract/examples/form-page.json`
- **Description**:
  - Add realistic examples that include layout, text, images, buttons, forms, theme tokens, SEO, and editable maps.
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Examples cover static page, blog post, collection-backed dynamic page, and interactive form page.
  - Each visible text/image/button maps to `editableMap`.
- **Validation**:
  - Schema validation passes for all examples.

### Task 1.4: Map old editor/public content into the new contract

- **Location**:
  - `packages/core/src/content-migrations.ts`
  - `apps/admin/src/components/editor/editorCatalog.ts`
  - `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Add migration helpers from existing `elements[]` payloads into `BackyContentDocument`.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Existing mock pages can render through the public renderer after migration.
  - Migration is additive and does not delete existing stored content.
- **Current progress**:
  - `packages/core/src/content-migrations.ts` now normalizes current canvas-shaped `elements[]` payloads into canonical `BackyContentDocument` data.
  - The migration keeps nested children, responsive overrides, JSON-safe props/styles, actions, data bindings, asset ids, accessibility hints, duplicate-id suffixing, animation metadata, canvas size metadata, and custom CSS metadata.
  - Public `/render` payload construction now runs page, post, and dynamic item content through the core migration helper before returning the schema-compatible content subset.
  - Admin page and blog saves now include a canonical `contentDocument` beside the legacy canvas fields, and the public store/renderer preserve and render from that document when available.
- **Validation**:
  - Add tests for current sample page content.
  - Current command: `npm run test:content-contract --workspace @backy-cms/core`.
  - Current command: `npm run test:admin-contract --workspace @backy/public`.

## Sprint 2: Durable Data and Service Boundary

**Goal**: Replace local/mock truth with a real service layer while preserving demo mode.

**Demo/Validation**:
- Create a site/page in admin, reload the app, and confirm data persists from the service layer.
- Public API reads the same content admin saved.

### Task 2.1: Choose and consolidate DB package

- **Location**:
  - `packages/db`
  - `packages/database`
  - `package.json`
- **Description**:
  - Pick one canonical DB package and document the decision.
  - Move or re-export schema/query APIs behind one import path.
- **Dependencies**: none
- **Acceptance Criteria**:
  - No new code imports both DB packages for the same responsibility.
  - Decision record exists in `specs/decisions/`.
- **Current progress**:
  - `specs/decisions/0001-database-boundary.md` accepts `@backy/db` as the canonical schema/adapter/repository package.
  - `@backy-cms/database` is documented as legacy Supabase scaffolding that new code must not import.
  - Admin no longer declares `@backy-cms/database`, `@db/*`, or a Vite external for the legacy package.
- **Validation**:
  - `rg "packages/database|@backy-cms/database|@backy/db"` shows expected imports only.

### Task 2.2: Add repository interfaces

- **Location**:
  - `packages/core/src/repositories.ts`
  - `packages/db/src/repositories/`
- **Description**:
  - Define interfaces for sites, pages, posts, collections, media, forms, comments, users, settings, and audit logs.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Admin and public route handlers depend on repository interfaces, not direct mock stores.
- **Current progress**:
  - `packages/core/src/repositories.ts` now defines the shared repository contracts for sites, pages, posts, collections/records, media, forms/submissions/contacts, comments, users, settings, and audit logs.
  - Page and post repository entities require canonical `BackyContentDocument` content so DB adapters cannot reintroduce legacy canvas-only storage as the primary contract.
  - `@backy-cms/core/repositories` is exported as a subpath for DB adapters and route handlers.
  - Admin sites list/detail/create/update/delete route handlers now branch through repository interfaces in database mode while preserving explicit demo-store behavior for local demo mode.
- **Validation**:
  - Typecheck.
  - Current command: `npm run test:repositories --workspace @backy-cms/core`.

### Task 2.3: Add explicit demo adapter

- **Location**:
  - `packages/db/src/adapters/demo.ts`
  - `apps/public/src/lib/backyStore.ts`
  - `apps/admin/src/stores/mockStore.ts`
- **Description**:
  - Keep seeded content only as an explicit demo adapter.
  - Stop calling it a database.
- **Dependencies**: Task 2.2
- **Acceptance Criteria**:
  - Production paths cannot accidentally use demo adapter unless a config flag enables it.
- **Current progress**:
  - `@backy/db` now exports `resolveBackyDataRuntimeConfig`, `createBackyRuntimeAdapter`, and an explicit `createDemoAdapter` marker.
  - `apps/public/src/lib/repositoryRuntime.ts` now exposes the server-side bridge that returns database repositories only in database mode and returns a non-repository demo runtime in explicit demo mode.
  - Runtime config parsing has been split into `@backy/db/runtime-config` so route handlers can inspect mode without bundling optional database drivers.
  - Runtime mode defaults to `database`; demo mode requires `BACKY_DATA_MODE=demo` or legacy `BACKY_DEMO_MODE=true`.
  - Database mode validates required connection config instead of silently falling back to demo data.
- **Validation**:
  - Unit test config selection.
  - Current command: `npm run test:runtime --workspace @backy/db`.

### Task 2.4: Add DB-backed site/page/post repositories

- **Location**:
  - `packages/db/src/repositories/sites.ts`
  - `packages/db/src/repositories/pages.ts`
  - `packages/db/src/repositories/posts.ts`
- **Description**:
  - Implement create/read/update/list for sites, pages, and posts.
- **Dependencies**: Task 2.2
- **Acceptance Criteria**:
  - Site/page/post CRUD is available through repository APIs.
  - Slug uniqueness and status filters are enforced.
- **Current progress**:
  - `packages/db/src/repositories/site-page-post.ts` now exports Drizzle-backed site, page, and post repository factories.
  - `packages/db/src/repositories/factory.ts` exposes `createDatabaseRepositories` as the initial server-side repository set for database mode.
  - Page and post repositories persist canonical `BackyContentDocument` payloads and normalize legacy JSON content on read.
  - Slug checks are exposed for sites, pages, and posts; list methods enforce status filters and unpublished visibility defaults.
- **Validation**:
  - Repository tests against local test database or Supabase test project.
  - Current command: `npm run typecheck --workspace @backy/db`.
  - Current command: `npm run build --workspace @backy/db`.
  - Current command: `npm run test:repositories --workspace @backy/db`.
  - Remaining gap: add execution tests against a real local test database once the test DB service is configured; current repository smoke uses a Drizzle-shaped fake DB and covers repository behavior without a real engine.

## Sprint 3: Admin API and Auth/RBAC

**Goal**: Make admin mutations authenticated and site/team scoped.

**Demo/Validation**:
- Viewer cannot mutate site/page/media.
- Editor can edit content but cannot manage users/security settings.
- Admin can publish and manage users.

### Task 3.1: Replace mock auth with session provider

- **Location**:
  - `apps/admin/src/stores/authStore.ts`
  - `packages/auth/src/index.ts`
  - admin API middleware
- **Description**:
  - Replace hardcoded users with real session handling.
- **Dependencies**: Sprint 2 repository boundaries
- **Acceptance Criteria**:
  - Login/logout/refresh works through configured provider.
  - No hardcoded production credentials remain.
- **Validation**:
  - Auth unit tests and manual login flow.

### Task 3.2: Add capability model

- **Location**:
  - `packages/core/src/permissions.ts`
  - `packages/auth/src/permissions.ts`
- **Description**:
  - Define owner/admin/editor/viewer capabilities at team and site scope.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - `canRead`, `canEdit`, `canPublish`, `canManageUsers`, `canManageSettings`, `canManageBilling` are explicit.
- **Validation**:
  - Permission matrix tests.

### Task 3.3: Add admin CRUD APIs

- **Location**:
  - admin API routes or Next/Vite backend boundary selected for `backy-admin`
- **Description**:
  - Add authenticated endpoints for sites, pages, posts, media, collections, forms, comments, users, and settings.
- **Dependencies**: Sprint 2 and Task 3.2
- **Acceptance Criteria**:
  - Mutations are authenticated.
  - Unauthorized scopes return consistent error envelopes.
- **Validation**:
  - API tests for owner/admin/editor/viewer.

### Task 3.4: Move admin routes off `mockStore`

- **Location**:
  - `apps/admin/src/routes/*.tsx`
  - `apps/admin/src/components/editor/MediaLibraryModal.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
- **Description**:
  - Replace direct Zustand mock reads/writes with API clients and query state.
- **Dependencies**: Task 3.3
- **Acceptance Criteria**:
  - No write-critical admin route imports `mockStore`.
  - Save/reload proves persistence from API.
- **Validation**:
  - `rg "mockStore" apps/admin/src/routes apps/admin/src/components/editor`.

## Sprint 4: Public API, Renderer, and Custom Frontend Boundary

**Goal**: Make `backy-public` the stable contract for any frontend.

**Demo/Validation**:
- A tiny standalone frontend fetches site, page, media, forms, and comments without importing admin code.

### Task 4.1: Standardize public response envelope

- **Location**:
  - `apps/public/src/app/api/**/route.ts`
  - `packages/core/src/api.ts`
- **Description**:
  - Enforce `{ success, data, error, requestId }` for all public APIs.
- **Dependencies**: Sprint 1 contracts
- **Acceptance Criteria**:
  - All public API routes use shared helpers.
- **Validation**:
  - API route tests.

### Task 4.2: Implement route resolver

- **Location**:
  - `packages/core/src/route-resolver.ts`
  - `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`
- **Description**:
  - Resolve domain/subdomain/path/locale to page, blog post, dynamic item, redirect, 404, or 410.
- **Dependencies**: Sprint 2 repositories
- **Acceptance Criteria**:
  - Published content resolves publicly.
  - Draft/private content is hidden unless preview token is valid.
- **Validation**:
  - Resolver tests for homepage, nested path, blog path, redirect, missing page, archived page.

### Task 4.3: Move public renderer to canonical contract

- **Location**:
  - `apps/public/src/components/PageRenderer.tsx`
  - `packages/core/src/content-contract.ts`
- **Description**:
  - Remove local renderer type drift and consume `BackyContentDocument`.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Public renderer supports all official element types through the shared contract.
- **Validation**:
  - Render snapshot tests for example payloads.

### Task 4.4: Publish OpenAPI and SDK starter

- **Location**:
  - `specs/openapi/backy-public.openapi.yaml`
  - `packages/sdk-js/`
- **Description**:
  - Document public APIs for custom frontends and add a minimal TypeScript client.
- **Dependencies**: Tasks 4.1 and 4.2
- **Acceptance Criteria**:
  - External frontend can call site resolve, page fetch, media list, collection reads/writes, form list/detail/submit/review/contact endpoints, comment list/detail/update/report endpoints, and interaction event reads.
- **Current progress**:
  - `packages/sdk-js` exposes a TypeScript public API client for site discovery, manifest/OpenAPI bootstrap, frontend-design contract reads, resolve, render, navigation, media, collection records, forms/submissions/contacts, comments/reports, and interaction events.
  - The SDK exports starter public contract types for frontend-design contracts, render payloads, content documents/elements, media/font assets, collection schemas/records, forms/submissions/contacts, comments, events, response metadata, and conditional 304 results.
  - `manifestCached`, `frontendDesignCached`, `openapiCached`, `renderCached`, `pagesCached`, `blogCached`, `navigationCached`, `seoCached`, `mediaCached`, `mediaAssetCached`, `mediaFontsCached`, `collectionsCached`, `collectionCached`, `reusableSectionsCached`, `reusableSectionCached`, `recordsCached`, and `commerceCatalogCached` expose Backy's cache/contract headers and send `If-None-Match` so custom frontends can reuse cached discovery/frontend-design/render/page/blog/navigation/SEO/media/font/collection-schema/reusable-section/dynamic-data/product-catalog payloads through the SDK.
  - Public manifest, OpenAPI, and render endpoints emit cache-control, ETag/304 revalidation, plus Backy contract/schema/request/site headers; preview and error responses are no-store.
- **Validation**:
  - SDK smoke test against local public app, including cached manifest/frontend-design/OpenAPI/render/page/blog/navigation/SEO/media/font/collection-schema/reusable-section/collection-record/product-catalog 304 revalidation and temporary-site public write coverage for collection records, forms, contacts, comments, reports, and events.
  - Public contract smoke verifies that the site manifest advertises the same interaction endpoint templates that the site-scoped OpenAPI document exposes and that discovery/render cache headers, contract headers, and conditional 304 responses are present.

## Sprint 5: Media, Fonts, Files, Video, and Audio Management

**Goal**: Provide a complete asset management area that supports custom frontend use and visual editing.

**Demo/Validation**:
- Upload an image, video, audio file, document, and font.
- Use uploaded asset in editor.
- Public frontend receives asset manifest and renders the right URL/variant.

### Task 5.1: Storage adapter contract

- **Location**:
  - `packages/storage/src/index.ts`
- **Description**:
  - Define provider-agnostic upload/read/delete/sign/transform interfaces.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Local/Supabase first adapter works.
  - S3/R2-compatible adapter shape is documented.
- **Current progress**:
  - `@backy/storage` now exposes a provider-neutral adapter contract for upload, read, delete, public URL, signed URL, list, exists, and stat operations.
  - Local storage blocks path traversal, provides deterministic site/type/date key generation through `createStoragePath`, and is covered by `npm run test:smoke --workspace @backy/storage`.
  - S3/R2 and Supabase adapters expose the same contract shape with upload metadata/cache controls and signed URL support.
  - Admin media upload/delete/read routes now resolve the runtime storage adapter from environment configuration: default local storage, S3/R2-compatible storage, or Supabase Storage.
  - Upload metadata records the storage provider path so private delivery and cleanup work even when the public URL is remote and not shaped like `/uploads/...`.
  - `GET /api/admin/settings` exposes a non-secret `runtimeStorage` diagnostic summary that the admin Delivery settings page renders for operators.
- **Validation**:
  - Storage adapter tests with local temp storage.

### Task 5.2: Media metadata and usage tracking

- **Location**:
  - `packages/db/src/repositories/media.ts`
  - database migrations
- **Description**:
  - Persist MIME type, size, dimensions/duration, alt text, caption, tags, folder, visibility, variants, and usage bindings.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - Page/post/template usage is queryable.
- **Current progress**:
  - Runtime media APIs persist upload metadata, extension metadata, storage path/provider metadata, alt text, captions, tags, folders, visibility, page/post bindings, and uploaded font registration metadata through the configured storage adapter.
  - `npm run test:admin-contract --workspace @backy/public` verifies font upload metadata, storage-backed public asset readability, metadata merge preservation after edits, public font listing, private visibility hiding, and page media binding.
- **Validation**:
  - Upload and usage repository tests.

### Task 5.3: Admin asset library

- **Location**:
  - `apps/admin/src/routes/media.tsx`
  - `apps/admin/src/components/editor/MediaLibraryModal.tsx`
- **Description**:
  - Replace mock upload UI with API-backed library, folders, filters, metadata editing, and upload progress.
- **Dependencies**: Task 5.2
- **Acceptance Criteria**:
  - Asset library handles image/video/audio/file/font.
  - Editor can bind selected assets by asset ID.
- **Validation**:
  - Browser test upload/select/edit/delete.

### Task 5.4: Font management

- **Location**:
  - `apps/admin/src/components/editor/fontCatalog.ts`
  - media/font APIs
  - public renderer font injection
- **Description**:
  - Add uploaded fonts and Google/system fonts to theme tokens and per-element font controls.
- **Dependencies**: Task 5.3
- **Acceptance Criteria**:
  - Site-level and element-level font choices render in admin and public.
- **Current progress**:
  - The editor property panel can open the backend-backed media picker from text font controls, upload/select font files, and apply the registered font family to the selected element.
  - The public SDK exposes typed `BackyFontManifest` helpers with ETag/304 revalidation so custom frontends can cache uploaded font families, variants, and generated `@font-face` CSS.
- **Validation**:
  - Visual render test and CSS output inspection.

## Sprint 6: Collections, Dataset Bindings, and Dynamic Pages

**Goal**: Add Wix-like dynamic CMS behavior.

**Demo/Validation**:
- Create a collection.
- Create dynamic list and item pages.
- Bind text/image/button elements to collection fields.
- Submit a form into a collection.

### Task 6.1: Collection schema model

- **Location**:
  - `packages/core/src/collections.ts`
  - database migrations
  - collection repositories
- **Description**:
  - Add collection definitions, fields, indexes, permissions, folders, import/export metadata.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Supports text, rich text, number, boolean, date, media, reference, multi-reference, JSON, URL, email, phone, select, tags.
- **Validation**:
  - Collection schema tests.

### Task 6.2: Dataset binding contract

- **Location**:
  - `packages/core/src/data-bindings.ts`
  - `specs/ai-frontend-contract/data-bindings.schema.json`
- **Description**:
  - Define read/write dataset bindings, filters, sorts, pagination, field mappings, and actions.
- **Dependencies**: Sprint 1 and Task 6.1
- **Acceptance Criteria**:
  - Element props can bind to collection fields.
  - Forms can write to collection fields.
- **Validation**:
  - Binding resolver tests.

### Task 6.3: Dynamic page templates

- **Location**:
  - page/template repositories
  - admin page/template routes
  - public route resolver
- **Description**:
  - Add dynamic list/item/category page model and URL variables.
- **Dependencies**: Task 6.2
- **Acceptance Criteria**:
  - One template can render multiple collection items.
  - SEO variables resolve per item.
- **Validation**:
  - Resolver tests and public render snapshots.

### Task 6.4: Admin collection builder UI

- **Location**:
  - new `apps/admin/src/routes/collections*.tsx`
- **Description**:
  - Create/manage collections, fields, rows, permissions, imports/exports, saved views.
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - Table/list/gallery admin views.
  - CSV import/export.
  - Permission controls.
- **Validation**:
  - Browser tests for collection CRUD and CSV roundtrip.

## Sprint 7: Editor Completion and Reusable Blocks

**Goal**: Make the visual editor reliable and reusable across pages, blog posts, templates, and default generated frontend.

**Demo/Validation**:
- Same editor component edits a page, blog post body, reusable section, form template, and dynamic item template.
- Admin editor typecheck and build pass before new editor features are added.
- Manual browser smoke covers select, edit text, drag, resize, copy, paste, delete, undo, redo, save, reload, preview, breakpoint toggle, and publish toggle.

### Task 7.0: Editor bug stabilization gate

- **Location**:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
  - `apps/admin/src/components/editor/RichTextFormatting.tsx`
  - `apps/admin/src/components/editor/PropertyPanel.tsx`
  - `packages/editor/src/**`
- **Description**:
  - Treat editor reliability bugs as release blockers before adding more CMS product surface.
  - Keep a bug ledger for selection/editing, text formatting, media picker, drag/drop, resize, layers, undo/redo, breakpoint persistence, save/autosave, and renderer parity.
- **Dependencies**: Sprint 1 contract work for deeper fixes, but compile/runtime defects should be fixed immediately.
- **Acceptance Criteria**:
  - `npm run typecheck --workspace @backy-cms/admin` passes.
  - No known parser/type errors in the editor package or admin editor.
  - Browser smoke confirms core editing interactions do not regress.
  - Every confirmed editor bug is either fixed or logged with reproduction steps and severity.
- **Validation**:
  - Typecheck plus browser smoke recording/screenshots.
  - Regression fixture for at least one text block, one image block, one form block, one comment block, and one nested/container block.

#### Confirmed editor bugs to reproduce/fix first

- **High / patched, smoke-covered**: Canvas elements select but do not drag reliably in the current editor runtime.
  - Repro area: `apps/admin/src/components/editor/Canvas.tsx`
  - Latest patch: root drops now resolve against the actual canvas rect, pasteboard drops outside the canvas are ignored, pointer capture is used for element movement, nested children receive their own drag ids, drag/resize coordinates snap/clamp inside the canvas, active transforms are ref-backed so pointer movement is available immediately, and drag/resize creates one undo entry on release instead of one entry per move. Arrow-key nudging now moves selected unlocked elements inside canvas bounds. Canvas zoom/fit controls are scale-aware for drag, resize, drop, and canvas-height resize math.
  - Validation added: `npm run test:editor-drag --workspace @backy-cms/admin` covers text/image/container/nested-child/form drag, image/form resize, Shift+Arrow keyboard nudging, Ctrl+Z/Ctrl+Shift+Z drag undo/redo, backend save persistence, and fresh editor reload rehydration. Remaining validation: broader manual browser QA across zoom/breakpoints and additional undo/redo coverage for property edits, deletes, paste, layer changes, and responsive mode changes.
- **High**: Right-side text controls and canvas text editing still need selection preservation tests after focus moves between canvas and property panel.
- **High**: Breakpoint controls currently change canvas dimensions, but true per-breakpoint element overrides are not complete.
- **Medium**: Site workflow panel depends on public API server and should show a clear setup/offline state instead of raw JSON parse errors.

### Task 7.1: Move editor state to canonical document

- **Location**:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/types/editor.ts`
  - `packages/core/src/content-contract.ts`
- **Description**:
  - Remove separate admin-only element contract where possible.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Editor reads/writes `BackyContentDocument`.
- **Validation**:
  - Typecheck and editor smoke tests.

### Task 7.2: Complete responsive overrides

- **Location**:
  - `CanvasEditor.tsx`
  - `Canvas.tsx`
  - public renderer
- **Description**:
  - Add breakpoint-specific position, size, visibility, style, and token overrides.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - Desktop/tablet/mobile changes persist independently with inheritance.
- **Validation**:
  - Editor and public render tests across breakpoints.

### Task 7.3: Add layers, lock/hide, multi-select, alignment, and guides

- **Location**:
  - `apps/admin/src/components/editor/LayersPanel.tsx`
  - `CanvasEditor.tsx`
  - `Canvas.tsx`
- **Description**:
  - Bring editor interactions closer to Wix/Canva expectations.
- **Current progress**:
  - Layers panel is wired into the editor shell and persists `visible`/`locked` flags on canvas elements.
  - Root layer reordering updates z-index order, lock blocks canvas drag/resize/delete, and hidden elements are skipped by the public renderer.
  - Canvas drag/resize now uses transient move state with single history commits, and selected elements support arrow-key nudging with Shift for larger moves.
  - The editor viewport now has scale-aware zoom in/out and fit controls in the canvas status bar.
  - Nested children are displayed and selectable in the layer tree, but nested drag-reorder and multi-select transforms are still open.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - Layer ordering, lock/hide, group selection, align/distribute, keyboard nudge work.
- **Validation**:
  - Browser editor interaction tests.

### Task 7.3a: Align canvas UX with Wix/Canva editor standards

- **Location**:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/ComponentLibrary.tsx`
  - `apps/admin/src/components/editor/PropertyPanel.tsx`
  - `apps/admin/src/components/editor/LayersPanel.tsx`
  - `apps/admin/src/index.css`
- **Description**:
  - Upgrade the editor shell from a basic admin page into a purpose-built design surface.
  - Match expected Wix/Canva affordances without copying their branding: fixed top command bar, left insert panel, central infinite-ish canvas viewport, right inspector, bottom zoom/status bar, clear selection handles, grid/guides, and stable layers.
- **Dependencies**: Task 7.0, Task 7.1
- **Acceptance Criteria**:
  - Canvas viewport supports zoom controls, fit-to-screen, panning, and visible current zoom.
  - Elements have professional selection outlines, corner/edge resize handles, drag cursor states, and visible bounding-box dimensions while dragging/resizing.
  - Left component palette has search, categories, drag affordance, and compact density.
  - Right inspector groups content/layout/style/animation without duplicated or conflicting text controls.
  - Layers panel supports rename, select, reorder, lock, hide, and nested children.
  - Toolbar actions use recognizable icons with tooltips and disabled states.
  - Text does not overlap controls at desktop/tablet widths.
- **Validation**:
  - Browser screenshots at desktop/tablet/mobile editor viewport sizes.
  - Manual smoke for drag, resize, zoom, pan, snap, layer select, property edit, preview.
  - No regression in `npm run typecheck --workspace @backy-cms/admin` or admin build.

### Task 7.4: Reusable blocks and synced sections

- **Location**:
  - block/template repositories
  - editor component library
  - admin reusable-block route
- **Description**:
  - Add saved sections/components that can be inserted into pages/posts/templates.
  - Support synced and detached copies.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - Editing a synced section updates all usages after publish.
  - Detached copy no longer follows source.
- **Validation**:
  - Repository and render tests.

## Sprint 8: Publishing, Versioning, SEO, and Default Frontend

**Goal**: Ship complete content lifecycle and generated frontend behavior.

**Demo/Validation**:
- Create a site from template, edit pages/posts/assets/theme, preview, publish, rollback, and serve generated frontend.

### Task 8.1: Draft/publish/version workflow

- **Location**:
  - repositories
  - admin APIs
  - admin editor toolbar
- **Description**:
  - Add snapshots, publish metadata, rollback, scheduled publish, conflict tokens.
- **Dependencies**: Sprints 2-4
- **Acceptance Criteria**:
  - Public only sees published snapshots.
  - Preview token can view draft.
  - Rollback restores prior snapshot.
- **Validation**:
  - API and browser tests.

### Task 8.2: SEO and routing pipeline

- **Location**:
  - public metadata generation
  - sitemap/robots routes
  - redirect repository
- **Description**:
  - Add title/description/OG/canonical/robots/JSON-LD/sitemap/redirect handling.
- **Dependencies**: Task 8.1
- **Acceptance Criteria**:
  - Static and dynamic pages generate correct metadata.
- **Validation**:
  - Metadata snapshots and crawler smoke tests.

### Task 8.3: Default generated frontend templates

- **Location**:
  - `apps/public`
  - template registry
- **Description**:
  - Add simple complete frontend presets for users without their own frontend.
- **Dependencies**: Sprint 6 and Sprint 7
- **Acceptance Criteria**:
  - User can create a site and publish a default responsive frontend.
  - Every default template maps back to editable Backy fields.
- **Validation**:
  - Browser tests for site creation, edit, publish, public render.

### Task 8.4: Audit, analytics, and webhooks

- **Location**:
  - repositories
  - admin settings
  - public/admin API helpers
- **Description**:
  - Add action audit logs, page view tracking, form/comment events, webhook retries.
- **Dependencies**: Sprint 3 and Sprint 4
- **Acceptance Criteria**:
  - Admin can inspect publish/edit/upload/form/comment events.
- **Validation**:
  - Event tests and admin view smoke tests.

## Testing Strategy

- **Unit tests**
  - content contract validation
  - route resolver
  - permissions matrix
  - repositories
  - dataset binding resolver
  - migration helpers

- **API tests**
  - public envelopes
  - auth/RBAC responses
  - form/comment submit
  - media upload metadata
  - publish/preview/rollback

- **Browser tests**
  - editor add/select/move/resize/edit/save/reload/publish
  - media upload/select/font application
  - collection create/bind/dynamic page render
  - default frontend publish flow

- **Contract tests**
  - JSON Schema validates examples
  - SDK can consume public API without admin imports
  - public renderer matches editor output for known fixtures

## Potential Risks and Gotchas

- **Contract churn can break everything**
  - Mitigation: ship migration helpers and schema versioning before replacing old content paths.

- **Admin/public split can become duplicated**
  - Mitigation: repositories and core contracts live in packages; apps only orchestrate UI/API behavior.

- **Mock store removal may slow local development**
  - Mitigation: keep explicit demo adapter and seed scripts, but block it from production config.

- **Responsive editor work can become a UI rewrite**
  - Mitigation: first persist overrides in the contract, then incrementally improve editor UX.

- **Media storage provider decisions can delay product work**
  - Mitigation: define provider interface first and ship local/Supabase adapter before S3/R2.

- **Collection builder can become too broad**
  - Mitigation: start with field schemas, CRUD, dataset binding, CSV import/export, and permissions; defer advanced app-collection integrations.

## Rollback Plan

- Keep current mock/demo stores behind explicit `BACKY_DEMO_MODE=true` while repositories are introduced.
- Add content migration functions without deleting old content shape until public renderer and admin editor pass fixtures.
- Introduce new public API aliases while preserving current routes for one compatibility window.
- Gate risky editor changes behind schema-version checks and fixture tests.

## First Implementation Target

Start with **Sprint 1, Task 1.1**:

1. Add the canonical `BackyContentDocument` and related element/token/action/binding types in `packages/core`.
2. Add examples and JSON Schemas under `specs/ai-frontend-contract`.
3. Add migration helpers from current admin/public `elements[]` content.

This is the smallest step that directly supports every major goal: any frontend support, default generated frontend, modular page/blog/template reuse, durable persistence, and precise element-level control.
