# Backy Parity Roadmap (Wix + Canva + WordPress-style)

**Project:** `backy`  
**Date:** 2026-02-24  
**Owner:** Core product + backend + editor platform  
**Tracking mode:** Working spec for implementation cadence, feature parity, and regression control  

## 0) Executive decision

Backy is not yet at Wix/Canva/WordPress parity.  
Current state is a strong prototype with a lot of UI and route scaffolding, but the real blockers are:

1. Persistence is still mostly mock-backed in both admin and public flows.
2. Editor/runtime contracts are duplicated and drifting across admin/public boundaries.
3. The feature surface is incomplete around permissions, moderation, publishing, and workflow controls.
4. Simple editor/product controls are not connected end-to-end (actions, labels, toggles, and save/publish paths).

## 1) Canonical scope of this spec

This roadmap covers backend CMS parity for:

1. page/site/blog/post CRUD + draft/publish lifecycle
2. drag-and-drop responsive editor
3. media + typography + themes + tokens
4. forms/comments as first-class modules
5. auth/RBAC + audit + activity
6. two-app deployment topology (`backy-admin`, `backy-public`)
7. public API consumption by any frontend

It explicitly excludes:

1. design-specific pixel-perfect WYSIWYG visual polish (governed by editor UX stories)
2. heavy e-commerce checkout workflows (unless integrated later via plugin modules)

## 2) What is currently present vs missing

### 2.1 Current strengths

1. route and feature skeleton across core pages in `apps/admin` and `apps/public`
2. baseline page editor interactions exist (drag, resize, selection, history scaffolds)
3. basic renderer can display many block types
4. public/form/comment API routes are declared
5. shared DB package and migration scaffolding exists
6. specs already exist for editor and API contracts

### 2.2 Current blockers (high priority)

1. mock store usage remains in main flows
2. DB schema and editor payload contracts are not fully unified
3. admin pages are mostly UI shells without authoritative backend linkage
4. many important UI controls are disconnected or ambiguous
5. no complete production workflow around publish/versioning/rollback
6. admin auth is currently mock-based in routes and is not production-secure yet

## 3) Complete missing feature map vs Wix/Canva baseline

### 3.1 Core CMS and site architecture

1. Multi-site tenancy with role-scoped ownership
2. Custom domains and subdomain routing
3. Page slug uniqueness and redirects
4. draft/published/scheduled/archived transitions
5. versioning and rollback
6. page path resolver with 404/410/301 behavior
7. template + section + block reusable modules
8. global and site-scoped media catalogs
9. complete SEO metadata and OpenGraph pipeline
10. analytics hooks for page views and editor actions
11. webhook event pipeline

### 3.2 Editor parity features

1. full breakpoint editor model (desktop/tablet/mobile with per-breakpoint overrides)
2. layer stacking operations (bring forward/send backward)
3. true copy/paste, duplicate, delete with undo safety
4. keyboard and multiselect editing
5. alignment and snapping guides
6. component property labels and accessibility (not icon-only controls)
7. visible button labels on all key actions in toolbars and modals
8. connected save / publish / rollback / status toggle
9. comment block content and moderation controls
10. block-level form field creation, validation, and mapping

### 3.3 Canva-level UI quality backlog

1. visual hierarchy and spacing tokens
2. responsive canvas preview with live fidelity across device widths
3. clear empty-state screens and contextual tips
4. consistent icon+text action buttons
5. safe defaults for typography scale, line height, contrast
6. reusable style presets and theme token inheritance

### 3.4 WordPress-like content and publishing

1. post categories/tags
2. blog post lifecycle (draft->review->publish)
3. media attachment metadata
4. editorial comments and revision history
5. comment moderation queue
6. SEO + sitemap + robots behavior

### 3.5 Blog + creator templates

1. blog pages currently reuse the same canvas editor component as regular page/blog flows, which is useful for parity but not yet a dedicated blog page template system.
2. no reusable "post card", "post list", "article preview", or "category block" component templates are defined in the editor catalog yet.
3. no blog page nesting/embedding model in editor UX for sections like `latest posts`, `related posts`, `tag lists`.

## 4) User-visible issues currently breaking perceived maturity

1. Buttons with no action:
   1. Save button in editor toolbar
   2. Undo/redo controls
   3. Page settings modal action
   4. Publish/unpublish toggles in list and editor contexts
   5. New media/form/blog actions where modal opens but state not persisted
2. Labels and text not visible:
   1. controls with only icon affordance and no accessible label
   2. inconsistent color contrast in button state text
   3. settings toggles without inline helper labels
3. Form subsystem incompleteness:
   1. block container exists in schema but workflow incomplete
   2. no production validation UX and no moderation state
4. Comment subsystem incompleteness:
   1. no moderation and no status pipeline
   2. no bulk moderation actions
5. API parity gaps:
   1. routes exist but do not persist to DB
   2. inconsistent response envelopes between admin/public calls

## 5) Page-by-page completion checklist (admin)

1. `/` dashboard: connect real KPIs and onboarding hints
2. `/login`: secure auth, session middleware, reset flow
3. `/sites`: create/list/edit site with ownership and domain assignment
4. `/sites.new`: schema validation + backend success/fail states
5. `/sites/$siteId`: details panel, publish controls, theme binding
6. `/pages`: persisted filtering, paging, search, status chips
7. `/pages.new`: slug uniqueness + template starter + validation
8. `/pages.$pageId.edit`: connected save/publish/power controls + responsive editing
9. `/blog`: status controls, tag/category UI and list filters
10. `/blog.new`: post metadata + publish path
11. `/blog.$postId`: revisioning and publication state
12. `/media`: upload -> validation -> metadata edit -> storage urls
13. `/users`: role matrix and invitation flows
14. `/users.new`: invite token and provisioning states
15. `/users.$userId`: active session and permission display
16. `/settings`: SMTP, API keys, security, theme defaults

## 6) Public-route completion checklist

1. `/` landing: production landing + self-check status
2. `/sites/[subdomain]/[[...path]]`: real subdomain+slug resolver
3. `/api/sites`: published site discoverability and cache policy
4. `/api/sites/[siteId]/pages`: status-filtered page resolve
5. `/api/sites/[siteId]/media`: metadata + signed URL access contract
6. `/api/sites/[siteId]/blog`: public feed with pagination cursor
7. `/api/sites/[siteId]/forms/...`: production form submit endpoint
8. `/api/sites/[siteId]/comments`: moderation-aware public read and create
9. `PageRenderer.tsx`: single shared rendering contract with editor schema

## 7) Forms + Contact Share + Comments next-pass contract

### 7.1 Form submissions

1. form definition schema: fields, required, validation, hidden metadata
2. endpoint: `POST /api/sites/:siteId/forms/:formId/submissions`
3. anti-bot: honeypot, submit-timestamp, rate cap
4. validation errors:
   1. field-level messages
   2. server-side schema validation
5. storage:
   1. `status: pending|approved|spam|rejected`
6. admin:
   1. review list with filters
   2. change status and add notes
7. integration:
   1. webhook or email trigger

### 7.2 Contact share flow

1. canonical endpoint receives optional source metadata
2. per-site allowed action controls (email, internal ticketing, CRM webhook)
3. dedupe based on source fingerprint and spam heuristics
4. fallback delivery strategy for failed integrations

### 7.3 Comment block behavior

1. comment submit API with strict field validation
2. moderation state and visibility control
3. admin moderation UI:
   1. approve/reject/spam
4. thread support:
   1. parent-child for replies
5. anti-spam baseline:
   1. throttling and blacklist
6. public response:
   1. only approved comments served by default

### 7.4 Progress note (2026-02-24)

1. Forms + comments hardening pass in progress
   1. anti-spam/rate baseline for comments is now implemented in shared store (`apps/public/src/lib/backyStore.ts`)
   2. both page/post comment POST routes now classify submissions (honeypot, timing threshold, duplicate, and per-target rate limit)
   3. comment thread renderer now sends request metadata (`requestId`, `startedAt`, and honeypot placeholder) with each submission payload
2. remaining comment parity items before Wix-level parity
   1. bulk moderation actions and moderation filters in admin
   2. user report/blocking flows and reason taxonomy
   3. comment moderation queue analytics + export

## 8) Architecture and code consolidation

### 8.1 Shared contracts

1. Single editor schema in shared package
2. Single API payload and response envelope for admin/public
3. Shared status enums and validation across admin and public
4. One media catalog service used by editor and backend

### 8.2 Backend topology

1. `backy-admin`:
   1. full auth
   2. write APIs
   2. admin UI
2. `backy-public`:
   1. public read APIs
   2. form/comment interaction
3. shared database:
   1. Supabase Postgres or Postgres-compatible
   2. migration ownership in one folder
4. media:
   1. Supabase Storage or S3-compatible object store
   2. optional image transforms

## 9) Implementation phases (chronological, non-repeating)

### Phase A: Stabilize truth + persistence (2 weeks)

1. wire all core admin routes to DB-backed store
2. replace mock data reads in public APIs
3. connect auth middleware and site-scoped RBAC
4. finalize shared contract types and response envelope

### Phase B: Editor action completion (2 weeks)

1. connect save/publish/page settings
2. connect undo/redo/copy/paste/delete
3. fix connected/disconnected button wiring
4. add labels for all toolbar/action controls
5. connect preview + breakpoint selection to persisted overrides

### Phase C: Forms/comments production module (2 weeks)

1. form definition + field-level schema
2. submission and moderation APIs
3. comment block submit/retrieve endpoints
4. anti-spam and rate-limits

### Phase D: Publish/versioning/public quality (2 weeks)

1. revision store, rollback, status timeline
2. scheduling and redirect handling
3. SEO head generation + canonical URLs
4. cache and rendering guards for unpublished content

### Phase E: UI/UX parity pass (1-2 weeks)

1. accessibility labels and readable buttons
2. component discoverability (search/favorites/tooltips)
3. consistency pass for theme and token application
4. final manual functional matrix review against this spec

## 10) Complexity / effort guardrails

1. Priority is now-feature-complete before advanced extras.
2. Avoid duplicated features; every new feature should map to one package service.
3. Keep editor and renderer in lockstep through typed contracts and golden test fixtures.
4. Every page should have three states:
   1. Loading
   2. Empty but actionable
   3. Error with recoverable action

## 11) Done criteria before release candidate

1. 90%+ core editor actions produce persisted server-side state.
2. All page routes show connected action labels and real responses.
3. form and comment flows are fully operational and moderated.
4. publish/versioning works with rollback.
5. API and admin contract coverage are validated via contract tests or explicit payload fixtures.
6. one-click deployment pattern is documented and reproducible for two Vercel apps plus one DB.

## 12) Open risk register

1. icon-only buttons reducing usability if labels are not enforced in product spec
2. duplicated schema causing silent drift between editor and renderer
3. migration risk in switching from in-memory seed data to DB-backed live state
4. performance regressions from large canvas payloads without pagination/indexing
5. missing anti-spam controls causing form/comment abuse in production
