# Backy Platform Gap Analysis and AI Frontend Contract

Date: 2026-05-07
Status: product/architecture audit
Audience: Backy core developers, future AI frontend builders, contributors

## 1. Product target

Backy should become a complete backend-first website CMS:

- a visual site/page/post builder for non-technical users;
- a WordPress-like content system for pages, posts, media, users, comments, forms, SEO, publishing, and revisions;
- a Wix/Squarespace-like builder for drag/drop layout, templates, theme controls, responsive design, asset management, and live publishing;
- a headless API platform where any custom frontend can consume Backy content without importing Backy admin internals;
- an AI-readable contract so generated frontends can map every visible element, token, asset, form, and interaction back to Backy-managed data.

Backy is not yet a complete Wix/Canva/WordPress-class CMS platform, but the current page-surface audit has moved most primary admin/editor/API surfaces out of prototype status. The biggest remaining risk is no longer generic UI scaffolding; it is proving the remaining database and live-provider gates without confusing demo/mock-provider coverage for production certification.

## 2. Current repo state, based on code

### What exists

- Monorepo layout exists with `apps/admin`, `apps/public`, and shared packages.
- Admin UI exists for dashboard, sites, pages, blog, media, users, settings, and a reusable `CanvasEditor`.
- The editor supports many block types: text, headings, images, videos, buttons, forms, inputs, lists, embeds, maps, quotes, comments, and layout containers.
- The editor has save, autosave, undo/redo, copy/paste, cut, duplicate, delete, breakpoint size toggle, page settings, media picker, custom fonts, and comments/form property controls in code.
- Public renderer exists at `apps/public/src/components/PageRenderer.tsx` and can render many block types plus form and comment interactions.
- Public API routes exist for sites, pages, media, blog, forms, comments, reports, contacts, and events.
- Core type definitions include sites, pages, blog posts, media, forms, comments, contacts, public payloads, domains, custom links, activity logs, and page views.
- Database schema scaffolding exists in Drizzle/Supabase migrations for important CMS entities.

### What is incomplete or unsafe for production

- Some admin UI routes still import the demo `mockStore` types/state for local fallback and hydrated client context, but mutation-critical routes have moved behind authenticated admin/public APIs and repository adapters for the current Ready surfaces.
- Admin authentication is backend-backed through `apps/public` auth routes with httpOnly sessions, invite/password reset flows, MFA, audit events, Supabase Auth integration, production local-auth policy guards, and site/team RBAC coverage.
- The page editor save path now writes through the authenticated admin page API with conflict detection and reload-latest recovery instead of relying on a browser-only `updatePage` mock mutation.
- Public data can still run in seeded/demo mode, but the remaining production risk is executing the configured Supabase/Postgres service-data gates for Forms and SDK manifests plus live provider certification.
- There are at least three editor/content contracts:
  - `packages/core/src/types/index.ts` uses a node-map `PageContent` model.
  - `apps/admin/src/types/editor.ts` uses a canvas `elements[]` model.
  - `apps/public/src/components/PageRenderer.tsx` declares another local renderer `CanvasElement` and `PageContent`.
- Public API responses are not consistently wrapped in the documented `{ success, data, error }` envelope.
- Admin/public route boundaries are not hardened into separate read/write surfaces.
- Media upload now has runtime admin/public APIs, environment-selected local/S3/Supabase-compatible storage, quotas, signed private delivery, generated responsive WebP transform files, DB-backed retained-version create/list/compare/restore/delete paths with checksum/path/name/timeline diff review plus media-aware previews, static upload safety checks, optional HTTP scanner and ClamAV `clamd` scanning, quarantine controls, manual provider/CDN metric intake with conversions/value/attribution windows, media.configure-gated provider metadata controls, media.edit-gated mutation routes, site/team-scoped ownership enforcement through central admin access checks, provider analytics batch ingestion by media id/storage path/URL, library-wide provider ROI rollups, and admin audit logging. Production still needs automated provider-account bucket creation/secret rotation and cross-channel attribution beyond provider feeds; the current media flow validates the active runtime bucket/path and gives operators a credential-rotation runbook without storing secrets.
- Settings now include backend-backed delivery mode, API-key rotation history, hash-only named service-key issuance/revocation, runtime diagnostics, provider metadata, audit logs, and site-scoped settings; remaining risk is live external provider certification.
- Blog authoring reuses the shared editor while now owning post workflow controls for categories, tags, authors, featured images, scheduling, revisions, previews, comments, and public feeds; remaining blog/editor risk is deeper canonical content-contract convergence and broader visual QA rather than missing editorial workflow primitives.

## 3. Gap against Wix-like CMS builders

Official Wix CMS docs describe collection-backed content, datasets that connect editor elements to collection fields, dynamic list/item pages, visitor submissions into collections, presets, AI-assisted collection setup, and dynamic-page SEO controls.

Backy currently has pieces of this model but not the complete loop.

| Capability | Wix-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Collections | Structured content collections independent of pages | Generic collection schema/record admin APIs, public read APIs, and a backend-backed admin `/collections` builder now exist in the runtime adapter. The builder supports schema fields, select/tag option metadata, reference target metadata, public-read status, visitor-create/update/delete controls, collection-scoped public write-token configuration, selected visitor create/update field allowlists, record CRUD, record search/filter/sort controls, backend-paginated record lists, selected-record bulk status/delete actions, filtered CSV import/export, custom list/item route patterns, dynamic route links, portable JSON backup export/import for collection schemas plus records, metadata-backed generated list/item template presets with title/summary/image/detail field roles, and permission-aware admin UI affordances for `collections.view`, `collections.edit`, `collections.export`, and `collections.delete`; required/unique field validation, select/tag option validation, public visibility guards, CSV export, CSV import, backup export/import, admin record pagination metadata, bulk record actions, generated dynamic list/item routes, collection-bound render payload hydration including reference-field joins, and session-backed `collections.view`/`collections.export`/`collections.edit`/`collections.delete` RBAC enforcement with deny overrides are covered by `test:admin-contract`. Public record creation stores visitor-created records as drafts behind `permissions.publicCreate` and selected create-field allowlists, while public record update/delete now require `permissions.publicUpdate`/`permissions.publicDelete` plus a collection-scoped public write token and selected update-field allowlists before mutating records. Database-mode collection record reads now push status, search, field-value, sort, count, limit, and offset predicates into the repository query layer with composite collection/record indexes plus repository smoke coverage for URL-string field filters, tag-array filters, search, sort, full count metadata, and materialized page-size queries. Drizzle schema and Supabase migrations now declare JSONB containment, trigram search, and published-feed indexes for field-heavy collection record values. | Add richer dataset UX inside the canvas editor |
| Dataset binding | Page elements bind to collection fields | Collection-bound element `dataBindings` now normalize into `/render` dataset/binding manifests with resolved public field schemas and records for record/slug/search/filter/sort-bound datasets, and Backy's public payload/hosted renderer now resolves bound values into element props, including multi-hop reference joins such as `author.company.name`. Render payloads also support a collection-backed `repeater` element contract that hydrates records into `props.records`, materializes joined repeater field paths such as `record.values["author.company.name"]`, resolves dynamic item reverse-relationship filters through `$currentRecord.id`, and exposes the same dataset manifest for custom frontends. The editor property panel provides collection/field/target binding controls, reusable title/summary/image/link binding presets, site-scoped shared saved preset management backed by `/api/admin/sites/:siteId/editor/collection-binding-presets` with local fallback, nested reference-field join controls, selected-record value previews with image thumbnails plus resolved joined values, recent-record selection, manual record id/slug override, and query/filter/sort/pagination controls for selected elements, plus first-class repeater dataset, join-aware field mapping, joined query filter/sort controls, current-record reference filter controls, query-backed matching-record previews with joined title/summary/image resolution, and grid layout controls. The `/collections` surface now includes a visual relationship browser for outgoing references, incoming reverse references, unmapped relationship warnings, linked schema counts, route hints, controls to attach a captured frontend collection template to an existing schema, and dataset authoring shortcuts that copy repeater presets, field-binding presets, list-page briefs, item-page briefs, and list/item page-builder handoff routes. `/pages/new` now consumes `collectionId` plus `datasetMode`, renders a dataset import panel, includes collection field mappings in the creation handoff manifest, and seeds collection-backed list pages with repeater props or item pages with bound title/summary elements. The `/collections` surface can also capture Backy-authored page canvases as collection list/item templates and publish them through dynamic routes when no higher-priority captured frontend template is attached, exposes preview-record controls that resolve hosted/render list and item URLs from real records, keeps a bounded capture history for authored list/item templates with restore controls, and compares active captures against saved history versions with root-element, page, canvas-size, and custom-CSS diff summaries. | Add deeper in-editor dataset UX |
| Dynamic pages | One template renders collection list and many item URLs | Page/blog routes exist, public `/:collectionSlug` plus `/:collectionSlug/:recordSlug` routes now resolve/render generated collection list/item payloads after normal pages/blog posts, and admin page/collection writes reject conflicting route patterns. Backy-authored list/item page canvases can now be captured into collection metadata and used by dynamic collection routes when no captured frontend-design template is attached, and the Collections UI resolves preview record URLs for hosted and render API list/item routes. | Add richer slug policy, versioned template management, and deeper admin controls for list/detail page design |
| Presets/templates | Starter CMS presets create sample collection plus list/detail pages | Editor component library now supports composed nested presets and includes hero, feature-grid, and lead-capture form blocks that save as normal canvas child trees. Admin reusable-section CRUD APIs persist saved canvas sections with category/tag/status filters, the editor library can save the selected element tree plus reload/insert/rename/delete active saved sections, insert synced canvas instances, refresh selected synced instances from the saved source, detach instances into independent copies, and active saved sections are discoverable through public APIs, manifest/OpenAPI, and the SDK. Site frontend-design templates persist captured page/blog/form/section/collection/product templates, create APIs can seed from `frontendDesignTemplateId`, and `GET /api/admin/sites/:siteId/templates` now exposes a normalized `backy.template-registry.v1` admin registry with type filters, content summaries, binding counts, and clone targets for the corresponding create APIs. `/sites/:siteId` also lists captured templates with operator actions that deep-link page/blog templates into their create flows and route form/product/collection/section templates to their site-scoped template workspaces with a `frontendTemplate` search id so the selected captured template is highlighted on arrival. | Add versioned template management UI, richer dynamic list/detail page presets, and broader composed-template visual coverage |
| Forms to content | Inputs can write to collections with permissions | Forms submit to seeded public store and contact-share helpers; public form list reads now emit contract/cache headers with ETags and conditional 304 responses, while form detail reads remain private/no-store because they include submissions. Public collection record creation respects `publicCreate`, applies collection metadata visitor-create field allowlists before validation/storage, validates submitted values, and stores visitor-created records as draft collection records for moderation. Public collection record update/delete are now available for authenticated visitor workflows through collection-scoped public write tokens, `publicUpdate`/`publicDelete` permission flags, and selected public-update field allowlists. Canvas form props can now target a collection, map form fields to collection fields, create draft collection records from accepted public form submissions, and retain submission-to-record links for admin moderation shortcuts. `/forms` now exposes built-in and captured frontend form templates as a downloadable `backy.form-template-pack.v1` JSON pack in addition to handoff manifests and per-template schema copy actions. | Add deeper integrations beyond webhook/email delivery hardening and keep expanding cacheable public form-definition coverage |
| Dynamic SEO | SEO variables per dynamic page/item | Page metadata exists; generated dynamic item payloads derive title/description/canonical/OG basics from collection records, and `GET /api/sites/:siteId/seo` now exposes page/post/dynamic-item SEO route metadata plus sitemap and robots response modes for custom/default frontends. Site SEO defaults now persist through `GET/PATCH /api/admin/sites/:siteId/seo`, are editable in `/sites/:siteId`, and are applied to public SEO discovery titles, fallback descriptions, Open Graph images, site-level JSON-LD defaults, sitemap enablement/default priority/default frequency/dynamic-route inclusion, and robots index/follow/custom directives. Admin SEO read/save responses now include supported title variables plus sample dynamic collection list/item route previews that apply the current template/defaults to real collection and record values. Public SEO discovery now preserves path-based canonical fields while adding absolute `canonicalUrl` values, custom-domain canonical bases, and custom-domain sitemap/robots public URLs when a site has a custom domain. Cacheable public contract JSON responses now emit `x-backy-cache-revision` beside ETags, SEO sitemap/robots responses carry the same SEO revision, and SEO JSON supports ETag/304 revalidation against that revision seed. `@backy/db` now has a durable `cache_invalidation_events` table plus repository contract/factory support for recording scoped invalidation revisions, and database-mode admin SEO, navigation, redirect, page, blog post, collection, collection record, media, and media folder mutations record scoped invalidation events. Public route resolution plus navigation, page, blog, media, collection, and reusable-section read feeds now also emit public contract/cache headers, ETags, conditional 304 responses, and scoped cache revisions for frontend cache coordination while preview-token content reads remain no-store. Page/post metadata can now carry route-specific JSON-LD arrays that flow into render payload SEO and public SEO discovery, with page settings exposing JSON-LD editing. Site readiness now flags duplicate page/post canonical paths as publish-blocking SEO errors. Site settings now persist exact redirect/410 rules, `GET /api/sites/:siteId/resolve` exposes `redirect` and `gone` route results, and manifest/OpenAPI/SDK surfaces now advertise redirect capabilities and typed route results for custom frontends. Admin clients and `/sites/:siteId` can now manage redirect/410 rules through `GET/PATCH /api/admin/sites/:siteId/redirects`, and `POST /api/admin/sites/:siteId/redirects` previews unsaved rules for route-shadowing and missing internal-target warnings without persisting changes. | Propagate revision headers to remaining legacy public feeds |
| Live manage pages | Permissioned users can manage content from live site | Comments/forms exist, and `/api/sites/:siteId/manage/pages/:pageId` now provides a public authenticated live-management bridge for page reads and edits. The route requires `pages.view` for GET, `pages.edit` for PATCH, enforces site team scope outside the nested admin URL path, delegates to the existing admin page detail behavior for validation/conflicts/audit/cache invalidation, and is advertised in the public manifest and OpenAPI endpoint maps. Hosted page routes can opt into the first session-backed live management overlay with `?backyManage=1`, which hides for non-admin visitors, lets authorized editors save title/status/homepage metadata with optimistic conflict protection, inspects rendered `data-backy-element-id` targets, highlights selected elements, patches simple text-like element content, button/link destinations, image source/alt/title/object-fit fields, top-level layout fields, and common appearance props including color, border, radius, padding, margin, shadow, opacity, font family, font sizing, line height, text transform/decoration, letter spacing, and alignment inline through the same live bridge, and hands the selected `elementId` into the full canvas editor. | Expand inline live overlays beyond quick content, CTA, image, layout, and appearance fields, and broaden live-management routes beyond page detail |

Cache revision follow-up: global public site discovery (`GET /api/sites` and `GET /api/sites?identifier=...`) now records and emits database `discovery` invalidation revisions from admin site create/update, so custom frontend bootstrap clients can revalidate site identity, domain, and publication metadata changes through the same `x-backy-cache-revision` protocol used by site-scoped feeds.

Hosted RSS follow-up: `/sites/:siteSlug/blog/rss.xml` now uses the repository runtime in database mode, applies the same published/past-scheduled visibility rules as `/api/sites/:siteId/blog/rss`, includes database taxonomy/author joins, caps caller-provided feed limits, and emits content-scope `x-backy-cache-revision` plus ETag revalidation through the public contract response.

## 4. Gap against WordPress-like CMS

Official WordPress docs describe a block editor, reusable/synced patterns, global styles, REST APIs for pages/posts/media/users/taxonomies/revisions/templates/comments, and authenticated access rules.

Backy has the right direction but lacks the production maturity.

| Capability | WordPress-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Posts/pages | Mature CRUD with status, author, parent, slug, revisions | Admin page/blog create/edit/list flows save through backend APIs with auth/session coverage, template seeding, status/SEO settings, conflict handling, public render/manifest contracts, and list-visible page/post revision summaries that deep-link into rollback history; revision graph/diff depth remains the main parity gap | Add richer revision graph, diff, rollback, publish snapshots, and audit metadata |
| Block editor | Blocks, inserter, settings panel, list view, undo/redo | Canvas editor exists with many actions, and the inserter can now drop composed presets as nested editable element trees | Stabilize contract, layers/list view, nested block confidence, keyboard coverage, responsive overrides |
| Patterns/reusable blocks | Saved patterns can be inserted, synced, managed, exported | Static composed presets now exist for hero, feature-grid, and lead-capture form blocks. Admin reusable-section CRUD APIs store saved canvas section patterns; the editor can save/insert/rename/delete active site sections, insert them as synced canvas instances, refresh selected instances from the saved source, detach them into independent editable copies, and expose active saved sections to custom frontends through public list/detail APIs, manifest/OpenAPI, and the SDK. | Add richer saved-section metadata editing, conflict/version history, block/template registry, JSON export/import |
| Media library | Durable uploads, metadata, attachment usage | Runtime media endpoints and admin `/media` now cover upload/list/update/delete, media.configure-gated storage metadata controls, media.edit-gated existing-media mutations, stable-ID replacement with retained prior version metadata and DB-backed retained-version compare/restore/delete, folders, custom upload metadata, visibility, usage links, bulk actions, explicit page/post bind-unbind, per-asset and library audit activity, library usage analytics, generated responsive image manifests, Backy-served delivery analytics, manual provider/CDN metric intake with conversion/value attribution fields, batch provider analytics ingestion with replace/increment modes, provider summary rollups, and provider ROI rollups for attributed value, conversions, CVR, and value/request, retained-version checksum/path/name/timeline comparison with image/video/audio-aware preview fallbacks, static upload safety-scan state, optional HTTP scanner and ClamAV `clamd` verdict metadata, quarantine controls, and uploaded font registration metadata with fallback/display controls; admin upload/delete/replace/transform/version routes write through the active `@backy/storage` adapter while preserving stable media ids, storage paths, generated transform byte counts, SHA-256 binary fingerprints, and quota accounting; public media list/detail/file/transform feeds now emit cache/contract headers, ETags where applicable, conditional 304 responses for feeds, responsive image `srcSet`/variant metadata, delivery request counts for Backy-served file/transform endpoints, and media-scope cache revisions; `@backy/storage` defines local/S3/R2/Supabase upload/read/delete/sign/list/stat adapters with local smoke coverage; public render payloads expose public font assets and hosted pages inject `@font-face` rules | Add automated provider-account bucket creation/secret rotation and cross-channel attribution beyond provider feeds; active runtime bucket/path validation and credential rotation guidance now exist in Media |
| Taxonomies | Categories/tags/custom taxonomies | Blog category/tag admin CRUD and public category/tag/author feeds exist, post list APIs support taxonomy/author filters, public taxonomy feeds emit contract/cache headers with ETags and conditional 304 responses, and database-mode category/tag mutations record scoped invalidation events. | Add custom taxonomies, richer taxonomy management screens, RBAC, and audit trails |
| Revisions | Content and template revisions | Page/post revision endpoints, editor rollback panels, and page/blog list summary cells now expose saved snapshot counts/latest notes with history deep links; PageVersion type/schema still lacks rich graph/diff depth | Add revision graph, diff, rollback, publish snapshots, audit metadata |
| Users/RBAC | Users, roles, permissions, authenticated API scopes | Backend auth routes, invite/reset/session/MFA flows, service keys, role/status editing, permission previews, team/site scoping, audit activity, and browser/API smoke coverage exist; broader external auth-provider rollout remains a certification/runtime gate | Run production auth-provider certification and keep extending site/team scoping where new admin routes are added |
| REST/headless | Stable JSON APIs with auth rules | Public manifest/OpenAPI/SDK contracts now cover frontend discovery, routing, navigation, SEO, media, forms, comments, collections, reusable sections, commerce, interactive registry/runtime, cache headers, ETags, and admin capability discovery. Runtime data can still run in demo JSON mode, while DB-backed service-data certification remains gated by Supabase/Postgres workflow execution. | Run the SDK Postgres smoke against a migrated database and keep route additions covered by manifest/OpenAPI/SDK contract tests |
| Themes/global styles | Site-wide styles and per-block style supports | Theme types/settings exist; no compiler pipeline | Add theme token compiler, per-block token inheritance, CSS var output |

## 5. Highest-priority missing platform modules

1. Canonical content contract
   - One `BackyContentDocument` used by admin editor, public renderer, APIs, DB, and generated frontends.
   - Must include elements, children, responsive overrides, style tokens, data bindings, actions, animations, accessibility, SEO hooks, and version metadata.

2. DB-backed persistence and service layer
   - Keep replacing remaining fallback `mockStore` dependencies where they are still source-of-truth for non-Ready surfaces.
   - Run the configured Forms and SDK Supabase/Postgres gates before marking database-backed service data complete.
   - Keep seed/demo adapters only for local demos and tests, with release certification making provider/database mode explicit.

3. Auth and RBAC
   - Maintain backend-backed admin sessions, MFA, Supabase Auth exchange, and invite/reset/session lifecycle coverage.
   - Keep site/team scoped roles and central `requireAdminAccess` checks applied as new admin routes are added.
   - Run production auth-provider certification before treating external provider rollout as complete.

4. Public API contract
   - Make `backy-public` the stable read/interact surface.
   - Keep admin-only mutations under authenticated admin APIs.
   - Use a consistent envelope and request IDs.
   - Expose one frontend discovery manifest before route-specific render payloads.

5. Publishing/versioning
   - Draft, publish, unpublish, archive, schedule, preview, revision diff, rollback.
   - Public renderer must only serve publishable content unless preview credentials are present.

6. Media/font/asset service
   - Durable uploads for images, files, videos, audio, and fonts.
   - MIME validation, static upload safety checks, quotas, alt text, captions, folders, tags, transforms, signed/public URLs.
   - Asset bindings to pages, posts, templates, and reusable blocks.

7. Templates, blocks, and reusable modules
   - Page templates, blog templates, section templates, form templates, reusable/synced blocks.
   - Same editor composition logic must serve pages, blog posts, landing pages, forms, and dynamic item templates.

8. Dynamic content and AI binding
   - Collection schemas and data bindings so an AI/frontend can know what is editable and where it renders.
   - Element-level control down to text spans, assets, actions, tokens, and conditions.

## 6. Current incomplete surfaces by area

### Admin app

- Dashboard: backend metrics, onboarding, recent activity, publish/readiness status, workflow alerts, API consumer readiness, persistence/deployment health, RBAC scoping, and a named downloadable `backy.dashboard-handoff.v1` contract are implemented; remaining dashboard risk belongs to the global production auth/RBAC, provider, and database rollout gates.
- Sites: list/create/detail now cover owner/team-scoped creation and access, backend slug validation, status workflows, custom-domain DNS verification metadata, readiness, SEO/navigation/redirect controls, frontend-design template registry, and downloadable create/detail handoff manifests; remaining Sites risk belongs to global production auth/RBAC, provider execution, and database rollout gates.
- Pages: list/new/edit now use authenticated backend APIs for create/read/update/delete, page quotas, route/slug conflict checks, parent/child hierarchy, dataset and frontend-design template seeding, SEO/social metadata, status/schedule handling, preview/publish/archive/rollback workflows, revision summaries, delivery/readiness diagnostics, conflict-safe saves with `expectedUpdatedAt`, and downloadable handoff manifests; remaining Pages risk belongs to global database rollout, cross-browser visual CI, and the broader canonical editor/content contract hardening.
- Editor: useful action wiring exists; responsive overrides, layer controls, multi-select operations, composed presets, editor-level synced reusable-section instances, reusable-section instance propagation, and conflict-safe page saves are now implemented. Page editor saves send `expectedUpdatedAt`, stale saves return `PAGE_VERSION_CONFLICT`, and the editor renders a reload-latest recovery action. It still needs a canonical schema, shared renderer parity hardening, nested block confidence, and richer keyboard/undo QA.
- Blog: list/new/edit now cover backend-backed posts, taxonomy categories/tags, author resources, featured media, scheduling/editorial statuses, frontend-design post templates, canvas focus authoring, SEO/comment controls, public search/archive/RSS feeds, preview/publish/archive/rollback workflows, revision summaries, conflict-safe updates, and downloadable CSV/handoff exports; remaining Blog risk belongs to global database rollout, audit/event UI hardening, and broader editor/content contract convergence.
- Forms: backend form builder, public definition/submit APIs, moderation, contacts, analytics, reusable embed-block export, notification delivery, template pack export, and downloadable non-secret Postgres persistence-certification evidence are implemented; remaining risk is running the configured Supabase/Postgres service-data gate.
- Media: backend and UI now cover runtime storage, media.configure-gated provider metadata, media.edit-gated existing-media mutations, metadata, folders, replacement, retained-version listing/compare/restore/deletion with SHA-256/path/name/timeline deltas plus media-aware previews, bindings, safety-scan state, optional HTTP and ClamAV scanning, quarantine controls, generated responsive manifests, quotas, signed/private delivery, audit activity, usage analytics, Backy-served delivery counts, manual provider/CDN metric recording with conversions/value/attribution windows, batch provider/CDN analytics ingestion, and provider ROI dashboards; still needs automated provider-account bucket creation/secret rotation and cross-channel attribution beyond provider feeds; active runtime bucket/path validation and credential rotation guidance now exist in Media.
- Products: catalog schema, product records, media/download references, storefront API handoff, provider sync controls, provider reconciliation preview, and downloadable non-secret commerce provider-certification evidence are implemented; remaining risk is live provider execution/certification for payment, tax, shipping, discount, catalog, webhook, and subscription providers.
- Orders: private order schema, analytics, quote refresh, shipping labels/tracking, fulfillment dispatch, provider refunds, webhook settlement, reconciliation readiness, and downloadable non-secret commerce provider-certification evidence are implemented; remaining risk is live provider execution/certification across payment, tax, shipping, fulfillment, tracking, refund, webhook, and reconciliation providers.
- Users: backend-backed invite/reset/session/MFA, role/status, team-scoped access, billing-limit enforcement, audit activity, and smoke coverage are Ready; remaining work is broader external auth-provider rollout and certification.
- Settings: backend-backed delivery, API/service keys, security policy, notifications, storage/Supabase/Vercel/commerce metadata, provider diagnostics, audit history, site-scoped settings, and downloadable non-secret provider-certification handoff evidence are Ready; remaining work is live provider certification for Supabase, Vercel, storage, notification, and commerce providers.

### Public app

- Site/page resolution works against seeded and DB-backed site settings for slug, custom-domain discovery, path, redirects, gone routes, dynamic lists/items, and unpublished guards. The public manifest now advertises delivery domains, locale strategy, locale route variants, sitemap/robots URLs, and canonical bases; remaining delivery risk is hosted custom-domain/edge deployment certification rather than missing manifest metadata.
- Public renderer exists; needs to consume the canonical content contract rather than local types.
- Forms/comments are backend-backed with moderation, delivery, analytics, RBAC, repository coverage, and public/admin API contracts; remaining Forms risk is executing the configured Supabase/Postgres smoke against a migrated disposable database.
- Public API has manifest/OpenAPI/SDK coverage, configurable navigation backed by a dedicated admin endpoint, configured-origin CORS handling, locale/domain delivery variants, discovery cache headers with ETag/revision support, tokenless preview-token creation audits bound to resolved admin actors, tokenless preview-token use audits for page/blog/render/resolve/hosted reads, and hosted SEO/RSS feed success/error responses on the public cache/contract header contract; remaining work is hosted-domain certification and keeping future public feed variants on the same contract.

### Shared packages

- `packages/core` has many useful types, while the remaining contract risk is continued convergence between editor, public renderer, and generated frontend schemas as new blocks are added.
- `packages/db` and `packages/database` both exist, which creates a decision point. Choose one database package boundary and one ORM/query strategy.
- Auth and storage now have real app-level service paths through admin auth, media storage, provider diagnostics, and secret handoff contracts; the remaining package-level work is consolidating those boundaries so shared packages own the reusable provider adapters instead of app-local glue.

## 7. AI-readable frontend contract area

The canonical area for generated/custom frontends should be:

`specs/ai-frontend-contract/`

That folder should be treated as the human-readable and machine-readable integration boundary for any AI that builds a frontend on top of Backy.

Minimum files this area should own:

- `README.md`: plain-language contract and allowed assumptions.
- `content-payload.schema.json`: JSON Schema for public page/post/template payloads.
- `theme-tokens.schema.json`: JSON Schema for colors, typography, spacing, radius, shadows, motion, breakpoints.
- `element-actions.schema.json`: JSON Schema for link, submit, open modal, route, media, video, audio, and custom actions.
- `data-bindings.schema.json`: JSON Schema for mapping content collections to element fields.
- `examples/`: sample payloads for page, blog post, dynamic collection page, form page, and comment-enabled page.

This pass adds the starter `README.md`. The schema files should be generated after Backy locks the canonical content model.

## 8. Required contract for AI-built frontends

An AI-built frontend should need only these inputs:

1. Site bootstrap
   - site id, slug, locale, status, theme tokens, enabled modules, public assets base URL.

2. Route resolve
   - current path/domain/locale mapped to page, blog post, dynamic item, redirect, 404, or 410.

3. Render payload
   - canonical content document with elements, children, styles, responsive overrides, animations, actions, data bindings, and editable field IDs.

4. Asset manifest
   - images, videos, audio, documents, fonts, icons, captions, alt text, variants, visibility, and URLs.

5. Interaction manifest
   - forms, comments, search, filters, submit endpoints, validation rules, auth requirements, captcha/anti-spam hints.
   - public moderation metadata such as comment report reasons should be discoverable through contract/cache-aware endpoints, not duplicated inside generated frontends.

6. SEO manifest
   - title, description, canonical, robots, OG/Twitter, JSON-LD, sitemap priority/change frequency.

7. Design-control manifest
   - which parts are editable from Backy: theme colors, font families, per-element style tokens, text spans, images, videos, sounds, buttons, links, component visibility, and responsive overrides.

The custom frontend must not import from `apps/admin`. It should consume only public APIs, public SDKs, or generated JSON contracts.

## 9. Proposed build sequence

### Phase 1: Freeze source of truth

- Choose the canonical content document.
- Move admin/public/editor to that contract.
- Create validators and migration helpers.
- Add JSON Schemas in `specs/ai-frontend-contract/`.

### Phase 2: Finish persistence certification

- Keep admin UI on authenticated API clients for mutation-critical flows.
- Replace any remaining fallback mock-store source-of-truth paths as each page exits Partial status.
- Run the configured Supabase/Postgres service-data gates before treating database mode as production-certified.
- Keep demo seed mode behind explicit config for local development and mock-provider CI.

### Phase 3: Secure Backy

- Keep backend auth sessions, MFA, service keys, site/team scoped RBAC, audit logs, and request IDs covered as new admin routes are added.
- Certify external auth/provider deployments through the release gates before launch.

### Phase 4: Complete editor/CMS parity

- Harden responsive overrides, nested blocks, layers, synced reusable blocks, templates, and dynamic dataset bindings into stable production contracts.
- Blog-specific authoring and post template workflow.
- Durable media and font service.

### Phase 5: Public/headless hardening

- OpenAPI docs, SDK examples, CORS, cache policy, preview tokens.
- SEO/sitemap/redirect pipeline.
- Deployment docs for `backy-admin` and `backy-public`.

## 10. Evidence used

Local repo evidence:

- `specs/page-completion-audit/backy-page-surface-audit.md`: current 39 Ready / 6 Partial / 0 Prototype / 0 Missing audit state.
- `apps/public/src/app/api/admin/auth/login/route.ts`: backend auth, Supabase Auth exchange, MFA challenge, and httpOnly session issuance.
- `apps/admin/src/stores/authStore.ts`: API-backed admin sign-in/session client with tokenless persisted metadata.
- `apps/admin/src/routes/pages.$pageId.edit.tsx`: authenticated page editor save path with conflict handling and reload-latest recovery.
- `apps/admin/src/stores/mockStore.ts`: remaining demo/fallback state and legacy type source that should not be treated as proof of production persistence.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: editor action surface and autosave exist.
- `apps/public/src/lib/backyStore.ts`: seeded public data and in-memory form/comment/contact state.
- `apps/public/src/components/PageRenderer.tsx`: local renderer contract and public interaction implementation.
- `packages/core/src/types/index.ts`: broader core CMS type definitions.
- `packages/db/src/schema/index.ts`: database schema scaffolding.
- `specs/backy-cms-completion-spec.md` and `specs/backy-wix-canva-cms-v1-roadmap.md`: prior roadmap baseline.

External product references:

- Wix CMS overview: https://support.wix.com/en/article/cms-content-management-system-an-overview
- Wix Studio CMS docs: https://support.wix.com/en/article/wix-studio-using-the-cms
- WordPress Block Editor handbook: https://developer.wordpress.org/block-editor/
- WordPress REST API handbook: https://developer.wordpress.org/rest-api/
- WordPress Pages REST API: https://developer.wordpress.org/rest-api/reference/pages/
- WordPress Block Patterns: https://developer.wordpress.org/block-editor/reference-guides/block-api/block-patterns/
- WordPress Global Styles: https://developer.wordpress.org/block-editor/explanations/architecture/styles/
