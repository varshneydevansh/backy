# Backy Parity Roadmap (Wix + Canva + WordPress-style)

**Project:** `backy`  
**Date:** 2026-02-24  
**Owner:** Core product + backend + editor platform  
**Tracking mode:** Working spec for implementation cadence, feature parity, and regression control

## 0) Executive decision

Backy is not yet at full Wix/Canva/WordPress parity, but the current audit has moved most primary admin/editor/API surfaces out of prototype status. The canonical page-surface audit is `specs/page-completion-audit/backy-page-surface-audit.md`, currently tracking 39 Ready / 6 Partial / 0 Prototype / 0 Missing.

The active blockers are now narrower and should be closed one page or gate at a time:

1. Run the configured Supabase/Postgres service-data gates for Forms and SDK manifests against a disposable migrated database.
2. Certify live Settings and Commerce providers, including Supabase, Vercel, storage, notification, payment, tax, shipping, catalog, subscription, and provider-managed webhook families.
3. Keep editor parity protected with focused regression guards for rich-text table/list depth, imported list-indent edits, responsive breakpoints, grouping, and long-session stress.
4. Keep product/order live-provider certification separate from mock-provider CI so real TaxJar/Avalara/EasyPost/Shippo/Stripe-discount/subscription behavior is proven without leaking provider secrets.

## 1) Canonical scope of this spec

This roadmap covers backend CMS parity for:

1. page/site/blog/post CRUD + draft/publish lifecycle
2. drag-and-drop responsive editor
3. media + typography + themes + tokens
4. forms/comments as first-class modules
5. auth/RBAC + audit + activity
6. two-app deployment topology (`backy-admin`, `backy-public`)
7. public API consumption by any frontend
8. sellable product catalog and private order-intake primitives

It explicitly excludes:

1. design-specific pixel-perfect WYSIWYG visual polish beyond the editor UX and responsive visual-regression stories
2. declaring live provider or database readiness complete from mock-provider CI alone; the release certification gates remain the authority for external services

## 2) What is currently present vs missing

### 2.1 Current strengths

1. backend-backed admin/public routes across most core pages in `apps/admin` and `apps/public`
2. page editor interactions for drag, resize, selection, multi-select, grouping/ungrouping, layers, shortcuts, responsive overrides, history, save, and publish-state workflows
3. shared editor/public renderer contracts for the current element and interactive component set
4. public form/comment/media/manifest/OpenAPI/SDK routes with cache and contract headers
5. shared DB package, migrations, repository adapters, and repository-mode smoke coverage for the main content/settings modules
6. release, database, Settings provider, Commerce provider, and mock-provider certification workflows with source-level preflight guards

### 2.2 Current blockers (high priority)

1. live Supabase/Postgres certification has not been run in this environment for the remaining database-gated surfaces
2. live provider certification is still required before Settings, Products, Orders, and external connector APIs can be marked production-certified
3. product/order subscription and provider-managed tax/shipping/discount workflows still need deeper real-provider execution evidence beyond mock-provider coverage
4. editor parity is locally guarded for rich-text table/list depth, imported list-indent edits, responsive breakpoints, grouping, and long-session stress; remaining launch blockers are external certification gates
5. production launch still needs operator-owned release certification runs, provider secrets, disposable database confirmation, and custom deployment/domain verification

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

1. full breakpoint editor model (desktop/tablet/mobile with per-breakpoint overrides; persisted layout/content/style, layer visibility/lock override paths, group-level inheritance reset controls, and mobile/tablet smoke coverage are implemented, with fuller QA and visual regression thresholds still remaining)
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
2. reusable blog/content component presets now exist in the editor catalog for post cards, latest-post/archive sections, category-list navigation, and related-content sections, with tablet/mobile preset geometry carried into inserted canvas elements.
3. those blog/content presets now seed binding-slot metadata for title, excerpt, media, link, category/taxonomy, and collection-record targets, and the editor Data panel surfaces those slots with apply actions that turn matching fields on the selected collection into real `dataBindings`.
4. selecting a composed card/section can now apply matching child binding slots across descendant elements in one editor history step, including named root slots that target child repeaters, repeater collection/field props, and virtual record URL/slug targets for link slots.
5. binding-slot metadata is preserved through the shared Backy content contract and public render payload schema, so custom frontend handoff can inspect intended fields before or alongside a real collection binding.
6. remaining blog-page template depth is broadening hosted visual QA and dedicated blog-template UX, not absence of draggable, responsive, or binding-aware blog section blocks.

## 4) Current launch maturity risks

1. External certification, not local button wiring, is the active blocker:
   1. editor save, undo/redo, page settings, publish/archive, media, blog, forms, and comment workflows are locally guarded by focused smoke suites
   2. the remaining Forms/Contacts and public SDK risks require the disposable Supabase/Postgres service-data gates
   3. the remaining Settings, Products, and Orders risks require live provider certification
2. UI polish should continue as regression hardening:
   1. keep accessibility labels, visible state text, and toggle helper copy covered as new controls ship
   2. keep cross-browser visual checks and additional composed-template permutations as optional launch-hardening breadth
3. Forms and comments are Ready locally with database-service certification pending:
   1. form builder, reusable embed blocks, public submission, moderation, delivery retry, consent/retention, analytics, and contacts are implemented for the local product scope
   2. comments include moderation queues, status pipelines, bulk actions, reporting, blocklists, replies, export, analytics, and delivery retry
4. Public API parity is locally guarded:
   1. public render, manifest, OpenAPI, generated SDK, media, forms, comments, commerce, reusable-section, and interactive component contracts are guarded
   2. database-mode certification remains pending until `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke` runs against a migrated disposable Supabase/Postgres service

## 5) Page-by-page completion checklist (admin)

1. `/` dashboard: connect real KPIs and onboarding hints
2. `/login`: secure auth, session middleware, reset flow
3. `/sites`: create/list/edit site with ownership and domain assignment
4. `/sites.new`: schema validation + backend success/fail states
5. `/sites/$siteId`: backend-backed site workspace with details, publish/readiness controls, theme-token editing, navigation/redirect/SEO editors, form/comment operations, frontend handoff, site-level comment policy controls, and backend permission/ownership scoping; remaining work is live domain/deploy execution and deeper workflow polish
6. `/pages`: persisted filtering, paging, search, status chips
7. `/pages.new`: slug uniqueness + template starter + validation
8. `/pages.$pageId.edit`: connected save/publish/power controls, responsive editing, and interactive block authoring for `interactiveFigure`/`codeComponent` blocks; uploaded/signed custom component bundles, hostile-bundle browser security fixtures, component usage governance, and production repository smoke are now covered for the current platform scope
9. `/blog`: status controls, tag/category UI and list filters
10. `/blog.new`: post metadata + publish path
11. `/blog.$postId`: revisioning and publication state
12. `/media`: upload -> validation -> metadata edit -> storage urls
13. `/users`: backend-backed access command center with users API handoff, search/role/status/access-review filters, inline role/status updates, invite/password-reset/MFA/session flows, permission summaries, registration handoff links, team-scoped access checks, audit activity, billing-limit enforcement, and smoke coverage through `test:users`; current user-management scope is Ready, with only broader production auth-provider certification tracked globally
14. `/users.new`: invite command center with readiness checks, role/status selection, access preview, API payload preview, backend user creation through `POST /api/admin/users`, generated invite delivery metadata, invite acceptance flow, billing seat-limit enforcement, and browser/API coverage through `test:users`; current invite creation scope is Ready
15. `/users.$userId`: user access detail workspace with readiness checks, role/status editing, permission preview, lifecycle status actions, reset-password flow, active session history/revocation controls, per-user MFA and recovery-code management, self/current-session protection, audit activity, and smoke coverage through `test:users`; current user-detail scope is Ready
16. `/settings`: backend-backed delivery mode, API keys, service keys, security policy, notification routing, theme/SEO defaults, handoff manifest, Supabase/Vercel/storage metadata, billing/storage limits, deployment history, commerce provider execution diagnostics including generic subscription lifecycle adapter settings, site-scoped Settings API/UI, localization, and site webhook dispatch coverage including interactive registry create/update/delete/review/bundle/migration/rollback mutations; remaining work is deeper provider/live-service certification and broader production connector rollout
17. `/products`: backend-backed product catalog workspace with schema setup/sync, public catalog API readiness, product editor, pricing, variants, inventory, delivery/checkout URLs, merchandising, SEO fields, CSV/handoff export, customer linkage, product analytics, page-template shortcuts, product automation, subscription lifecycle panels/actions, direct catalog sync for Stripe/PayPal/Paddle/Square/Shopify/BigCommerce/WooCommerce/Etsy plus HTTP, public checkout quote providers for HTTP, TaxJar, Avalara, EasyPost, Shippo, and Stripe promotion codes, and mock-backed first-class checkout/provider coverage through `test:commerce` and `ci:commerce-provider-smoke`; remaining work is real-provider certification depth and deeper production subscription lifecycle certification
18. `/orders`: backend-backed private order operations workspace with schema setup/sync, private order permissions, public checkout-intake contract, payment/fulfillment/tracking/refund/address fields, quote refresh from Settings pricing rules, shipment-label, fulfillment-dispatch, provider-refund actions, configured order notification delivery, fraud-risk review fields, CSV/handoff export, Stripe/Adyen/Mollie refund execution, EasyPost label purchase/void/tracking execution, provider webhook settlement, subscription lifecycle analytics, and smoke coverage through `test:commerce`/`test:orders`; remaining work is broader live-provider certification and production provider workflow hardening
19. `/forms`: backend-backed forms command center with direct template-to-form creation, standalone form-builder editing, reusable embed blocks, advanced validation-rule persistence, public definition/submission APIs, inbox moderation, contact-share context, delivery email/webhook execution and retry, consent export/retention controls, analytics, RBAC/billing enforcement, durable Supabase/Postgres migration coverage, repository persistence smoke coverage, and UI/API coverage through `test:forms`; remaining work is executing the configured database-mode smoke against a migrated disposable Supabase/Postgres service
20. `/contacts`: backend-backed lead pipeline for form contact-share records with all-form/source-form filtering, lifecycle status, notes, private API handoff, CSV export/import, duplicate merge/dedupe, bulk lifecycle actions, contact-to-user/customer promotion, delivery sync, consent/retention controls, segmentation, analytics, RBAC, DB repository coverage, and smoke coverage through `test:contacts`; current Contacts scope is Ready, with broader Supabase/Postgres service smoke tracked under Forms/Contacts APIs
21. `/comments`: backend-backed moderation command center for page/blog discussions with readiness checks, moderation metrics, API handoff, CSV export, search/status/target/triage/sort filters, visible selection, moderation reasons, threaded replies/reparenting, report triage, blocklists, notification/webhook execution and retry, analytics, RBAC, repository persistence coverage, and smoke coverage through `test:comments`; current Comments scope is Ready, with broader Supabase/Postgres service smoke tracked globally

## 6) Public-route completion checklist

1. `/` landing: production landing + self-check status
2. `/sites/[subdomain]/[[...path]]`: real subdomain+slug resolver
3. `/api/sites`: published site discoverability and cache policy
4. `/api/sites/[siteId]/pages`: status-filtered page resolve
5. `/api/sites/[siteId]/media`: metadata + signed URL access contract
6. `/api/sites/[siteId]/blog`: public feed with pagination cursor
7. `/api/sites/[siteId]/forms/...`: public definition and submit endpoints with validation/moderation/contact-share coverage plus admin create/update/delete/contact lifecycle, delivery execution/retry, consent export/retention, analytics, RBAC, billing, reusable embed-block, and DB repository coverage; remaining work is executing the configured Supabase/Postgres database smoke against an external migrated service
8. `/api/sites/[siteId]/comments`: moderation-aware public read/create/update, site-wide queue listing, site policy enforcement, report triage, author blocklists, notifications/webhooks, delivery retry, analytics, admin UI moderation coverage, repository persistence, and cleanup behavior; current Comments API scope is Ready, with broader configured database-service smoke tracked globally
9. `PageRenderer.tsx`: single shared rendering contract with editor schema, trusted interactive figures, sandboxed custom code components, CSP/permission metadata, allowed data bindings, and static fallback states
10. `/api/sites/[siteId]/commerce/catalog`: public product catalog and product detail contract for custom storefronts
11. `/api/sites/[siteId]/commerce/orders`: public checkout-intake contract that writes private Backy orders and reserves inventory

## 7) Interactive animation/code component platform checklist

- Platform rule: interactive blog/page visuals like communication-round diagrams, simulations, calculators, scrollytelling figures, and any bespoke animation design execute in the frontend, but Backy owns the backend content model, data bindings, controls, publishing checks, public API contract, component registry, and safety boundary. Do not ship a production free-form script box; fully custom code must be selected from a reviewed registry or loaded as a constrained sandboxed component bundle.
- [x] Define `interactiveFigure` and `codeComponent` element schemas for pages and blog posts, including `componentKey`, `version`, props, controls, data bindings, dimensions, fallback content, and render capability metadata.
- [x] Add Backy-owned component registry APIs for trusted built-ins and registered custom component versions, with ownership, review/publish status, rollback, allowed data scopes, dependency metadata, audit logs, signed uploaded bundle storage, and production repository/schema adapters.
- [x] Add sandboxed iframe execution for custom code components with strict CSP, sandbox flags, permission allowlists, postMessage data/resize/error protocol, blocked-script fallback rendering, and no access to parent DOM/cookies/secrets.
- [x] Add editor controls for selecting components, binding collections/media/forms/commerce data, editing props and fallbacks, previewing animation states, and blocking publish when registry/security requirements are not met.
- [x] Extend public render payloads, frontend manifest, OpenAPI, and SDK types so external frontends can render registered interactive blocks without reading admin/editor internals.
- [x] Add signed uploaded bundle storage, integrity verification, dependency metadata, bundle promotion/rollback metadata, and admin component-version management beyond the demo/editor picker path.
- [x] Add production repository/schema wiring plus Supabase/Postgres-style repository smoke coverage for registry create/review/update/rollback/delete/public-runtime metadata.
- [x] Add hostile-bundle browser security tests for sandbox allowlists, server-side permission validation, parent DOM/location access, cookie/storage access, top navigation, and popup escape attempts.
- [x] Add usage governance: page/post dependency inventory, unsafe publish blocking, review approval gates, import/export metadata, and component-version migration tools.
- [x] Add a communication-round/self-correction figure preset (`backy.figure.rounds`) so article figures like "Self-correction at work, across communication rounds" can be selected from the editor catalog and discovered through the public registry contract.

## 8) Forms + Contact Share + Comments next-pass contract

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
   3. direct template-to-form creation and standalone form-builder editing are covered by `test:forms`
   4. contact-share list, notes, and lifecycle status are covered by `test:contacts`
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
   1. approve/reject/spam/block
   2. real `/comments` page coverage through `test:comments`
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
   1. site-level policy settings and default comment behavior controls
   2. threaded reply management and report triage
   3. user report/blocking flows and reason taxonomy
   4. notification/webhook execution
   5. comment moderation queue analytics

## 9) Architecture and code consolidation

### 8.1 Shared contracts

1. Single editor schema in shared package
2. Single API payload and response envelope for admin/public
3. Shared status enums and validation across admin and public
4. One media catalog service used by editor and backend

### 8.2 Backend topology

1. `backy-admin`:
   1. full auth
   2. write APIs
   3. admin UI
2. `backy-public`:
   1. public read APIs
   2. form/comment interaction
3. shared database:
   1. Supabase Postgres or Postgres-compatible
   2. migration ownership in one folder
4. media:
   1. Supabase Storage or S3-compatible object store
   2. optional image transforms

## 10) Implementation phases (chronological, non-repeating)

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
5. admin comments moderation smoke and fallback cleanup coverage

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

## 11) Complexity / effort guardrails

1. Priority is now-feature-complete before advanced extras.
2. Avoid duplicated features; every new feature should map to one package service.
3. Keep editor and renderer in lockstep through typed contracts and golden test fixtures.
4. Every page should have three states:
   1. Loading
   2. Empty but actionable
   3. Error with recoverable action

## 12) Done criteria before release candidate

1. 90%+ core editor actions produce persisted server-side state.
2. All page routes show connected action labels and real responses.
3. form and comment flows are fully operational and moderated.
4. publish/versioning works with rollback.
5. API and admin contract coverage are validated via contract tests or explicit payload fixtures.
6. one-click deployment pattern is documented and reproducible for two Vercel apps plus one DB.

## 13) Open risk register

1. icon-only buttons reducing usability if labels are not enforced in product spec
2. duplicated schema causing silent drift between editor and renderer
3. migration risk in switching from in-memory seed data to DB-backed live state
4. performance regressions from large canvas payloads without pagination/indexing
5. missing anti-spam controls causing form/comment abuse in production
