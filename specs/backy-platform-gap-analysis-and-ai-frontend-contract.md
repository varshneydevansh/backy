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
- Media upload is UI/local-store oriented and does not yet prove durable storage, MIME validation, quotas, transforms, signed URLs, or per-site ownership.
- Settings include a delivery-mode/API display surface, but API keys are local mock settings, not real scoped credentials.
- Blog authoring reuses general editor surfaces and lacks a complete post workflow around categories, tags, authors, featured images, scheduling, revisions, and feeds.

## 3. Gap against Wix-like CMS builders

Official Wix CMS docs describe collection-backed content, datasets that connect editor elements to collection fields, dynamic list/item pages, visitor submissions into collections, presets, AI-assisted collection setup, and dynamic-page SEO controls.

Backy currently has pieces of this model but not the complete loop.

| Capability | Wix-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Collections | Structured content collections independent of pages | Generic collection schema/record admin APIs, public read APIs, and a backend-backed admin `/collections` builder now exist in the runtime adapter. The builder supports schema fields, select/tag option metadata, reference target metadata, public-read status, record CRUD, record search/filter/sort controls, backend-paginated record lists, filtered CSV import/export, and dynamic route links; required/unique field validation, select/tag option validation, public visibility guards, CSV export, CSV import, and admin record pagination metadata are covered by `test:admin-contract`. Durable DB querying is still absent. | Add DB-backed indexes/querying, backups, audit events, full RBAC permissions, and bulk management |
| Dataset binding | Page elements bind to collection fields | Collection-bound element `dataBindings` now normalize into `/render` dataset/binding manifests with resolved public field schemas and records for record/slug/search/filter/sort-bound datasets, and Backy's public payload/hosted renderer now resolves bound values into element props. The editor property panel provides a basic collection/field/target binding UI for selected elements. | Add richer repeater/list rules and DB-backed dataset resolution/indexes |
| Dynamic pages | One template renders many item URLs | Page/blog routes exist, and public `/:collectionSlug/:recordSlug` routes now resolve/render generated collection item payloads after normal pages/blog posts. There is still no admin-authored collection template routing model. | Add custom template routes, item URL variables, preview records, conflict-safe slug policy, and admin controls for list/detail page generation |
| Presets/templates | Starter CMS presets create sample collection plus list/detail pages | Specs mention templates; code has block catalog but no complete preset pipeline | Add site/page/blog/form template registry and cloning/versioning |
| Forms to content | Inputs can write to collections with permissions | Forms submit to seeded public store and contact-share helpers | Persist submissions, route to collection records, add moderation/export/integrations |
| Dynamic SEO | SEO variables per dynamic page/item | Page metadata exists; generated dynamic item payloads derive title/description/canonical/OG basics from collection records, but no admin SEO template variables exist yet | Add SEO templates, canonical/OG generation controls, sitemap, robots, redirects |
| Live manage pages | Permissioned users can manage content from live site | Comments/forms exist; no live content management mode | Add public authenticated manage routes with strict permissions |

## 4. Gap against WordPress-like CMS

Official WordPress docs describe a block editor, reusable/synced patterns, global styles, REST APIs for pages/posts/media/users/taxonomies/revisions/templates/comments, and authenticated access rules.

Backy has the right direction but lacks the production maturity.

| Capability | WordPress-like expectation | Backy state | Required Backy work |
|---|---|---|---|
| Posts/pages | Mature CRUD with status, author, parent, slug, revisions | Types/schema exist; admin uses mock store | Move CRUD to DB-backed admin APIs with auth and status workflows |
| Block editor | Blocks, inserter, settings panel, list view, undo/redo | Canvas editor exists with many actions | Stabilize contract, layers/list view, nested blocks, keyboard coverage, responsive overrides |
| Patterns/reusable blocks | Saved patterns can be inserted, synced, managed, exported | No complete reusable block/template system | Add reusable blocks, synced sections, block/template registry, JSON export/import |
| Media library | Durable uploads, metadata, attachment usage | Runtime media endpoints and admin `/media` now cover upload/list/update/delete, folders, metadata, visibility, usage links, and uploaded font registration metadata; public render payloads expose public font assets and hosted pages inject `@font-face` rules | Add storage adapter, quotas, transforms, signed/private delivery, font variant grouping, and stronger bulk/reference management |
| Taxonomies | Categories/tags/custom taxonomies | Blog category/tag types exist; admin workflow incomplete | Add category/tag CRUD, assignment UI, public filtering, API contracts |
| Revisions | Content and template revisions | PageVersion type/schema exists, no complete UI/API loop | Add revision graph, diff, rollback, publish snapshots, audit metadata |
| Users/RBAC | Users, roles, permissions, authenticated API scopes | Mock auth; limited roles | Add session provider, team/site scoped roles, invite flow, access audits |
| REST/headless | Stable JSON APIs with auth rules | Public endpoints exist but use seeded store and inconsistent envelopes | Add OpenAPI, SDK examples, CORS, API keys, read/write route separation |
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

5. Publishing/versioning
   - Draft, publish, unpublish, archive, schedule, preview, revision diff, rollback.
   - Public renderer must only serve publishable content unless preview credentials are present.

6. Media/font/asset service
   - Durable uploads for images, files, videos, audio, and fonts.
   - MIME validation, quotas, alt text, captions, folders, tags, transforms, signed/public URLs.
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
- Editor: useful action wiring exists; still needs canonical schema, true responsive override persistence, shared renderer parity, layers, reusable blocks, nested block confidence, and conflict-safe save.
- Blog: list/new/edit exists; needs categories/tags, author, featured image, scheduling, editorial statuses, post templates, RSS/feed API.
- Media: UI exists; needs durable storage and metadata workflow.
- Users: UI exists; needs invitations, team/site scopes, session/device state, audit trail.
- Settings: UI exists; needs real secrets, API key issuance, webhooks, SMTP, analytics, security settings, environment validation.

### Public app

- Site/page resolution works against seeded store; needs DB-backed route resolver for slug, path, domain, locale, redirects, unpublished guards.
- Public renderer exists; needs to consume the canonical content contract rather than local types.
- Forms/comments are relatively advanced for a prototype; they need durable persistence, abuse controls that survive process restarts, admin ownership checks, and export/integration workflows.
- Public API needs stable response envelopes, OpenAPI, SDK examples, cache policy, CORS policy, and preview token behavior.

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

- Responsive overrides, nested blocks, layers, reusable blocks, templates, dynamic dataset bindings.
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
