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

The current repo is a strong prototype, not yet a complete CMS platform. The biggest risk is not missing UI quantity. The biggest risk is that core flows still have multiple sources of truth.

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

- Admin persistence still comes from `apps/admin/src/stores/mockStore.ts`, a Zustand store persisted to localStorage.
- Admin authentication still comes from `apps/admin/src/stores/authStore.ts`, with hardcoded mock users and development-only passwords.
- The page editor route saves page content by calling `updatePage` in the mock store, not a DB-backed, authenticated page API.
- Public data comes from `apps/public/src/lib/backyStore.ts`, which is an in-memory seeded store, not the same persistent data plane used by admin.
- There are at least three editor/content contracts:
  - `packages/core/src/types/index.ts` uses a node-map `PageContent` model.
  - `apps/admin/src/types/editor.ts` uses a canvas `elements[]` model.
  - `apps/public/src/components/PageRenderer.tsx` declares another local renderer `CanvasElement` and `PageContent`.
- Public API responses are not consistently wrapped in the documented `{ success, data, error }` envelope.
- Admin/public route boundaries are not hardened into separate read/write surfaces.
- Media upload now has runtime admin/public APIs, environment-selected local/S3/Supabase-compatible storage, quotas, signed private delivery, generated responsive WebP transform files, DB-backed retained-version create/list/compare/restore/delete paths with checksum/path/name/timeline diff review plus media-aware previews, static upload safety checks, optional HTTP scanner and ClamAV `clamd` scanning, quarantine controls, manual provider/CDN metric intake with conversions/value/attribution windows, media.configure-gated provider metadata controls, media.edit-gated mutation routes, provider analytics batch ingestion by media id/storage path/URL, library-wide provider ROI rollups, and admin audit logging. Production still needs automated provider-account bucket creation/secret rotation, cross-channel attribution beyond provider feeds, and per-site ownership enforcement; the current media flow validates the active runtime bucket/path and gives operators a credential-rotation runbook without storing secrets.
- Settings include a delivery-mode/API display surface, but API keys are local mock settings, not real scoped credentials.
- Blog authoring reuses general editor surfaces and lacks a complete post workflow around categories, tags, authors, featured images, scheduling, revisions, and feeds.

## 3. Gap against Wix-like CMS builders

Official Wix CMS docs describe collection-backed content, datasets that connect editor elements to collection fields, dynamic list/item pages, visitor submissions into collections, presets, AI-assisted collection setup, and dynamic-page SEO controls.

Backy currently has pieces of this model but not the complete loop.

| Capability | Wix-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Collections | Structured content collections independent of pages | Generic collection schema/record admin APIs, public read APIs, and a backend-backed admin `/collections` builder now exist in the runtime adapter. The builder supports schema fields, select/tag option metadata, reference target metadata, public-read status, record CRUD, record search/filter/sort controls, backend-paginated record lists, selected-record bulk status/delete actions, filtered CSV import/export, custom list/item route patterns, dynamic route links, portable JSON backup export/import for collection schemas plus records, metadata-backed generated list/item template presets with title/summary/image/detail field roles, and permission-aware admin UI affordances for `collections.view`, `collections.edit`, `collections.export`, and `collections.delete`; required/unique field validation, select/tag option validation, public visibility guards, CSV export, CSV import, backup export/import, admin record pagination metadata, bulk record actions, generated dynamic list/item routes, and session-backed `collections.view`/`collections.export`/`collections.edit`/`collections.delete` RBAC enforcement with deny overrides are covered by `test:admin-contract`. Database-mode collection record reads now push status, search, field-value, sort, count, limit, and offset predicates into the repository query layer with composite collection/record indexes plus repository smoke coverage for URL-string field filters, tag-array filters, search, sort, full count metadata, and materialized page-size queries. Drizzle schema and Supabase migrations now declare JSONB containment, trigram search, and published-feed indexes for field-heavy collection record values. | Add broader reusable binding presets, record previews, and richer dataset UX inside the canvas editor |
| Dataset binding | Page elements bind to collection fields | Collection-bound element `dataBindings` now normalize into `/render` dataset/binding manifests with resolved public field schemas and records for record/slug/search/filter/sort-bound datasets, and Backy's public payload/hosted renderer now resolves bound values into element props. Render payloads also support a collection-backed `repeater` element contract that hydrates records into `props.records` and exposes the same dataset manifest for custom frontends. The editor property panel provides collection/field/target binding controls, reusable title/summary/image/link binding presets, selected-record value previews, recent-record selection, manual record id/slug override, and query/filter/sort/pagination controls for selected elements, plus first-class repeater dataset, field mapping, query, and grid layout controls. | Broaden canvas dataset UX with preview thumbnails, preset management/saving, and cross-dataset joins |
| Dynamic pages | One template renders collection list and many item URLs | Page/blog routes exist, public `/:collectionSlug` plus `/:collectionSlug/:recordSlug` routes now resolve/render generated collection list/item payloads after normal pages/blog posts, and admin page/collection writes reject conflicting route patterns. There is still no admin-authored collection template routing model. | Add custom template routes, preview records, richer slug policy, and admin controls for list/detail page design |
| Presets/templates | Starter CMS presets create sample collection plus list/detail pages | Editor component library now supports composed nested presets and includes hero, feature-grid, and lead-capture form blocks that save as normal canvas child trees. Admin reusable-section CRUD APIs persist saved canvas sections with category/tag/status filters, the editor library can save the selected element tree plus reload/insert/rename/delete active saved sections, insert synced canvas instances, refresh selected synced instances from the saved source, detach instances into independent copies, and active saved sections are discoverable through public APIs, manifest/OpenAPI, and the SDK. A complete persisted site/page/blog/form template registry is still absent. | Add site/page/blog/form template registry, cloning/versioning, richer saved-section metadata editing, and dynamic list/detail page presets |
| Forms to content | Inputs can write to collections with permissions | Forms submit to seeded public store and contact-share helpers; public form list reads now emit contract/cache headers with ETags and conditional 304 responses, while form detail reads remain private/no-store because they include submissions. Public collection record creation respects `publicCreate`, validates submitted values, and stores visitor-created records as draft collection records for moderation. Canvas form props can now target a collection, map form fields to collection fields, create draft collection records from accepted public form submissions, and retain submission-to-record links for admin moderation shortcuts. | Add form-builder presets, export, webhook/email delivery hardening, integrations, and a separate cacheable public form-definition endpoint |
| Dynamic SEO | SEO variables per dynamic page/item | Page metadata exists; generated dynamic item payloads derive title/description/canonical/OG basics from collection records, and `GET /api/sites/:siteId/seo` now exposes page/post/dynamic-item SEO route metadata plus sitemap and robots response modes for custom/default frontends. Site SEO defaults now persist through `GET/PATCH /api/admin/sites/:siteId/seo`, are editable in `/sites/:siteId`, and are applied to public SEO discovery titles, fallback descriptions, Open Graph images, site-level JSON-LD defaults, sitemap enablement/default priority/default frequency/dynamic-route inclusion, and robots index/follow/custom directives. Admin SEO read/save responses now include supported title variables plus sample dynamic collection list/item route previews that apply the current template/defaults to real collection and record values. Public SEO discovery now preserves path-based canonical fields while adding absolute `canonicalUrl` values, custom-domain canonical bases, and custom-domain sitemap/robots public URLs when a site has a custom domain. Cacheable public contract JSON responses now emit `x-backy-cache-revision` beside ETags, SEO sitemap/robots responses carry the same SEO revision, and SEO JSON supports ETag/304 revalidation against that revision seed. `@backy/db` now has a durable `cache_invalidation_events` table plus repository contract/factory support for recording scoped invalidation revisions, and database-mode admin SEO, navigation, redirect, page, blog post, collection, collection record, media, and media folder mutations record scoped invalidation events. Public route resolution plus navigation, page, blog, media, collection, and reusable-section read feeds now also emit public contract/cache headers, ETags, conditional 304 responses, and scoped cache revisions for frontend cache coordination while preview-token content reads remain no-store. Page/post metadata can now carry route-specific JSON-LD arrays that flow into render payload SEO and public SEO discovery, with page settings exposing JSON-LD editing. Site readiness now flags duplicate page/post canonical paths as publish-blocking SEO errors. Site settings now persist exact redirect/410 rules, `GET /api/sites/:siteId/resolve` exposes `redirect` and `gone` route results, and manifest/OpenAPI/SDK surfaces now advertise redirect capabilities and typed route results for custom frontends. Admin clients and `/sites/:siteId` can now manage redirect/410 rules through `GET/PATCH /api/admin/sites/:siteId/redirects`, and `POST /api/admin/sites/:siteId/redirects` previews unsaved rules for route-shadowing and missing internal-target warnings without persisting changes. | Propagate revision headers to remaining legacy public feeds |
| Live manage pages | Permissioned users can manage content from live site | Comments/forms exist; no live content management mode | Add public authenticated manage routes with strict permissions |

## 4. Gap against WordPress-like CMS

Official WordPress docs describe a block editor, reusable/synced patterns, global styles, REST APIs for pages/posts/media/users/taxonomies/revisions/templates/comments, and authenticated access rules.

Backy has the right direction but lacks the production maturity.

| Capability | WordPress-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Posts/pages | Mature CRUD with status, author, parent, slug, revisions | Types/schema exist; admin uses mock store | Move CRUD to DB-backed admin APIs with auth and status workflows |
| Block editor | Blocks, inserter, settings panel, list view, undo/redo | Canvas editor exists with many actions, and the inserter can now drop composed presets as nested editable element trees | Stabilize contract, layers/list view, nested block confidence, keyboard coverage, responsive overrides |
| Patterns/reusable blocks | Saved patterns can be inserted, synced, managed, exported | Static composed presets now exist for hero, feature-grid, and lead-capture form blocks. Admin reusable-section CRUD APIs store saved canvas section patterns; the editor can save/insert/rename/delete active site sections, insert them as synced canvas instances, refresh selected instances from the saved source, detach them into independent editable copies, and expose active saved sections to custom frontends through public list/detail APIs, manifest/OpenAPI, and the SDK. | Add richer saved-section metadata editing, conflict/version history, block/template registry, JSON export/import |
| Media library | Durable uploads, metadata, attachment usage | Runtime media endpoints and admin `/media` now cover upload/list/update/delete, media.configure-gated storage metadata controls, media.edit-gated existing-media mutations, stable-ID replacement with retained prior version metadata and DB-backed retained-version compare/restore/delete, folders, custom upload metadata, visibility, usage links, bulk actions, explicit page/post bind-unbind, per-asset and library audit activity, library usage analytics, generated responsive image manifests, Backy-served delivery analytics, manual provider/CDN metric intake with conversion/value attribution fields, batch provider analytics ingestion with replace/increment modes, provider summary rollups, and provider ROI rollups for attributed value, conversions, CVR, and value/request, retained-version checksum/path/name/timeline comparison with image/video/audio-aware preview fallbacks, static upload safety-scan state, optional HTTP scanner and ClamAV `clamd` verdict metadata, quarantine controls, and uploaded font registration metadata with fallback/display controls; admin upload/delete/replace/transform/version routes write through the active `@backy/storage` adapter while preserving stable media ids, storage paths, generated transform byte counts, SHA-256 binary fingerprints, and quota accounting; public media list/detail/file/transform feeds now emit cache/contract headers, ETags where applicable, conditional 304 responses for feeds, responsive image `srcSet`/variant metadata, delivery request counts for Backy-served file/transform endpoints, and media-scope cache revisions; `@backy/storage` defines local/S3/R2/Supabase upload/read/delete/sign/list/stat adapters with local smoke coverage; public render payloads expose public font assets and hosted pages inject `@font-face` rules | Add automated provider-account bucket creation/secret rotation and cross-channel attribution beyond provider feeds; active runtime bucket/path validation and credential rotation guidance now exist in Media |
| Taxonomies | Categories/tags/custom taxonomies | Blog category/tag admin CRUD and public category/tag/author feeds exist, post list APIs support taxonomy/author filters, public taxonomy feeds emit contract/cache headers with ETags and conditional 304 responses, and database-mode category/tag mutations record scoped invalidation events. | Add custom taxonomies, richer taxonomy management screens, RBAC, and audit trails |
| Revisions | Content and template revisions | PageVersion type/schema exists, no complete UI/API loop | Add revision graph, diff, rollback, publish snapshots, audit metadata |
| Users/RBAC | Users, roles, permissions, authenticated API scopes | Mock auth; limited roles | Add session provider, team/site scoped roles, invite flow, access audits |
| REST/headless | Stable JSON APIs with auth rules | Public endpoints exist, `/api/sites/:siteId/manifest` now provides a site-level frontend discovery document with schema refs, capabilities, route patterns, redirect/gone metadata, configured navigation, endpoint URLs, module summaries, collections, forms, and media/font counts, and `/api/sites/:siteId/openapi` exports a site-scoped OpenAPI 3.1 document for the public frontend surface including redirect/gone route schemas. Admin clients can now read/write stored site menus through `GET/PATCH /api/admin/sites/:siteId/navigation`, and `/sites/:siteId` exposes a connected navigation-management UI for primary/footer menus. Runtime data still uses the seeded/JSON adapter and some legacy endpoints have inconsistent envelopes. | Add generated SDK examples, CORS hardening, API keys, read/write route separation, and DB-backed services |
| Themes/global styles | Site-wide styles and per-block style supports | Theme types/settings exist; no compiler pipeline | Add theme token compiler, per-block token inheritance, CSS var output |

## 5. Highest-priority missing platform modules

1. Canonical content contract
   - One `BackyContentDocument` used by admin editor, public renderer, APIs, DB, and generated frontends.
   - Must include elements, children, responsive overrides, style tokens, data bindings, actions, animations, accessibility, SEO hooks, and version metadata.

2. DB-backed persistence and service layer
   - Replace direct `mockStore` usage in admin routes.
   - Replace seeded public `backyStore` with query/service adapters.
   - Keep a seed/demo adapter only for local demos and tests.

3. Auth and RBAC
   - Replace hardcoded mock users with real sessions.
   - Add site/team scoped roles: owner, admin, editor, viewer.
   - Gate admin write routes and sensitive read routes.

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

- Dashboard: UI exists; needs backend metrics, onboarding, recent edits, publish status, alerts.
- Sites: list/create/edit exists; needs real ownership, domain verification, status workflow, slug uniqueness.
- Pages: list/new/edit exists; needs API-backed persistence, templates, slug tree, publish/revision flow.
- Editor: useful action wiring exists; responsive overrides, layer controls, multi-select operations, composed presets, editor-level synced reusable-section instances, reusable-section instance propagation, and conflict-safe page saves are now implemented. Page editor saves send `expectedUpdatedAt`, stale saves return `PAGE_VERSION_CONFLICT`, and the editor renders a reload-latest recovery action. It still needs a canonical schema, shared renderer parity hardening, nested block confidence, and richer keyboard/undo QA.
- Blog: list/new/edit exists; needs categories/tags, author, featured image, scheduling, editorial statuses, post templates, RSS/feed API.
- Media: backend and UI now cover runtime storage, media.configure-gated provider metadata, media.edit-gated existing-media mutations, metadata, folders, replacement, retained-version listing/compare/restore/deletion with SHA-256/path/name/timeline deltas plus media-aware previews, bindings, safety-scan state, optional HTTP and ClamAV scanning, quarantine controls, generated responsive manifests, quotas, signed/private delivery, audit activity, usage analytics, Backy-served delivery counts, manual provider/CDN metric recording with conversions/value/attribution windows, batch provider/CDN analytics ingestion, and provider ROI dashboards; still needs automated provider-account bucket creation/secret rotation and cross-channel attribution beyond provider feeds; active runtime bucket/path validation and credential rotation guidance now exist in Media.
- Users: UI exists; needs invitations, team/site scopes, session/device state, audit trail.
- Settings: UI exists; needs real secrets, API key issuance, webhooks, SMTP, analytics, security settings, environment validation.

### Public app

- Site/page resolution works against seeded and DB-backed site settings for slug, path, redirects, gone routes, dynamic lists/items, and unpublished guards; domain and locale routing are still incomplete.
- Public renderer exists; needs to consume the canonical content contract rather than local types.
- Forms/comments are relatively advanced for a prototype; they need durable persistence, abuse controls that survive process restarts, admin ownership checks, and export/integration workflows.
- Public API has manifest/OpenAPI/SDK coverage and configurable navigation backed by a dedicated admin endpoint; it still needs CORS policy, domain/locale variants, stronger cache invalidation, and preview token auditing.

### Shared packages

- `packages/core` has many useful types, but the editor model does not match the admin/public canvas model.
- `packages/db` and `packages/database` both exist, which creates a decision point. Choose one database package boundary and one ORM/query strategy.
- Auth/storage packages are placeholders or partial abstractions and need to become real service boundaries.

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

### Phase 2: Replace mock persistence

- Add admin APIs for sites, pages, blog, media, users, settings.
- Route admin UI through API clients.
- Replace public seeded store with read/interact service adapters.
- Keep a demo seed mode behind explicit config.

### Phase 3: Secure Backy

- Real auth sessions.
- Team/site scoped RBAC.
- API key issuance and rotation.
- Audit logs and request IDs.

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

- `apps/admin/src/stores/mockStore.ts`: localStorage-backed mock persistence.
- `apps/admin/src/stores/authStore.ts`: hardcoded development users.
- `apps/admin/src/routes/pages.$pageId.edit.tsx`: page editor save path updates mock store.
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
