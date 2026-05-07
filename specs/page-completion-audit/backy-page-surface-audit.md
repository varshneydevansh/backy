# Backy page and backend completeness audit

Date: 2026-05-07

This audit tracks whether each Backy admin/public surface has the necessary backend and editor behavior expected from a WordPress/Wix/Canva-like product. It is intentionally strict: a page is not complete until it persists through backend APIs, exposes the right public/admin contract, handles loading/empty/error states, and supports the workflows users expect from a production CMS/editor.

## Completion legend

- **Ready**: backend-backed, validated, user-facing behavior is complete for the current product scope.
- **Partial**: usable path exists, but important backend/product behavior is missing.
- **Prototype**: mostly local/mock UI or incomplete workflow.
- **Missing**: route or workflow is absent.

## Product-level gates

Backy should not be called complete until these gates are satisfied:

- **Durable backend**: sites, pages, posts, users, settings, media, forms, comments, events, and publish state are stored in the same durable backend, not split between seed data, localStorage, and local JSON files.
- **Admin APIs**: every admin page has authenticated CRUD endpoints with validation, pagination, RBAC, audit trails, and consistent `{ success, requestId, data/error }` envelopes.
- **Public render contract**: custom frontends can fetch exact site/page/post data, theme tokens, assets, actions, bindings, SEO, and editable maps without relying on admin implementation details.
- **Editor parity**: page/post editing covers Canva/Wix expectations: drag/resize, selection, layers, snapping/alignment, grouping, undo/redo, responsive breakpoints, media/font insertion, template sections, preview, publish, and revision history.
- **WordPress parity**: pages/posts/media/users/settings support drafts, publish/schedule, slugs/permalinks, SEO, revisions, categories/tags where relevant, comments/moderation, forms, roles, and export/import hooks.
- **Operational readiness**: auth, permissions, rate limits, storage quotas, telemetry, backups, webhook retries, tests, and deployment configuration are documented and verified.

## Admin page matrix

| Surface | Status | Current evidence | Required to complete |
| --- | --- | --- | --- |
| `/login` | Prototype | `apps/admin/src/stores/authStore.ts` uses mock users and localStorage. | Replace mock auth with backend sessions/tokens, password reset, invite acceptance, MFA-ready flow, role enforcement on routes, and server-side authorization. |
| `/` dashboard | Partial | `apps/admin/src/routes/index.tsx` shows stats from local store and recent activity. | Backend aggregate metrics, real storage/database status, failed workflow alerts, publishing health, onboarding state, and links to unfinished work. |
| `/sites` | Partial | `apps/admin/src/routes/sites.tsx` now loads and deletes through `GET/DELETE /api/admin/sites`, with local fallback state. | Add filters, ownership/RBAC, domain/publish status, duplicate/archive flows, and stronger destructive-action confirmation UX. |
| `/sites/new` | Partial | `apps/admin/src/routes/sites.new.tsx` now creates through `POST /api/admin/sites`, with local fallback state. | Add template/site type selection, domain validation, default pages, publish target configuration, and richer failure recovery. |
| `/sites/$siteId` | Partial | `apps/admin/src/routes/sites.$siteId.tsx` now saves/deletes site settings through `PATCH/DELETE /api/admin/sites/:siteId`; forms/comments moderation sections are backend-connected. | Add domain verification, SEO/theme/publish settings, webhook configuration, form builder management, comment policy settings, and audit logs. |
| `/pages` | Partial | `apps/admin/src/routes/pages.tsx` now loads and deletes through `GET/DELETE /api/admin/sites/:siteId/pages`, with local fallback state. | Add site selector, hierarchy/navigation management, published/draft/scheduled filters, route conflict checks, bulk actions, revisions, and public preview links. |
| `/pages/new` | Partial | `apps/admin/src/routes/pages.new.tsx` now creates through `POST /api/admin/sites/:siteId/pages`, with local fallback state. | Apply real templates, add site-aware navigation placement, richer SEO defaults, and immediate transition into editor. |
| `/pages/$pageId/edit` | Partial | `apps/admin/src/routes/pages.$pageId.edit.tsx` now loads and saves through `GET/PATCH /api/admin/sites/:siteId/pages/:pageId`, with local fallback state. | Add revision history, preview URL, stronger autosave status, responsive breakpoints, layers/alignment/snapping/grouping, keyboard shortcuts, robust undo/redo, and complete component properties. |
| `/blog` | Partial | `apps/admin/src/routes/blog.tsx` now loads and deletes through `GET/DELETE /api/admin/sites/:siteId/blog`, with local fallback state. | Add category/tag filters, author profiles, scheduled posts, SEO metadata, bulk actions, comments status, and preview/published URLs. |
| `/blog/new` | Partial | `apps/admin/src/routes/blog.new.tsx` now creates through `POST /api/admin/sites/:siteId/blog`, with local fallback state. | Add category/tag assignment, featured image, excerpt/SEO validation, autosave/revisions, preview, and block/editor defaults suited to long-form writing. |
| `/blog/$postId` | Partial | `apps/admin/src/routes/blog.$postId.tsx` now loads, saves, and deletes through `GET/PATCH/DELETE /api/admin/sites/:siteId/blog/:postId`, with local fallback state. | Add revisions, schedule/publish flow, categories/tags, featured media, canonical/SEO controls, preview, and comments/moderation status. |
| `/media` | Partial | `apps/admin/src/routes/media.tsx` now loads/uploads via `GET/POST /api/admin/sites/:siteId/media`, with local fallback and loading/error states. | Backend delete/update, alt/caption editing, folders/tags/search, private media permissions, image transforms, storage provider abstraction, quota checks, font registration, and reference tracking. |
| Editor media modal | Partial | `apps/admin/src/components/editor/MediaLibraryModal.tsx` now uses backend list/upload and scopes assets to page/post/global contexts. | Same media gaps as `/media`, plus insert sizing presets, upload progress, replace asset, crop/focal point, and font picker integration. |
| `/users` | Prototype | `apps/admin/src/routes/users.tsx` lists local users and roles. | Backend users API, invitations, RBAC permissions matrix, team/workspace membership, activity logs, deactivate/reactivate, and protected self-role changes. |
| `/users/new` | Prototype | Local invite/create flow exists. | Real invite email/token flow, role validation, duplicate checks, workspace scoping, and audit events. |
| `/users/$userId` | Prototype | Local user edit route exists. | Backend user update endpoint, permissions matrix, session revocation, activity timeline, and safeguards for last admin. |
| `/settings` | Partial | `apps/admin/src/routes/settings.tsx` stores delivery mode/API keys locally and documents public/admin endpoints. | Backend persisted settings, real key management, key rotation/revocation, webhook/integration settings, site defaults, SEO/social settings, billing/storage limits, and environment validation. |

## Public/API matrix

| Surface | Status | Current evidence | Required to complete |
| --- | --- | --- | --- |
| `GET /api/sites` | Partial | `apps/public/src/app/api/sites/route.ts` resolves seeded sites. | Consistent response envelope, auth/rate limits where needed, pagination, custom domain resolution, and durable data source. |
| `GET /api/sites/:siteId/pages` | Partial | Public page retrieval exists from `backyStore`. | Route conflict handling, preview tokens, draft access, cache headers, navigation tree, and complete SEO/meta payload. |
| `GET /api/sites/:siteId/render` | Partial | `apps/public/src/app/api/sites/[siteId]/render/route.ts` returns the new AI/custom-frontend render payload. | Schema validation tests, version negotiation, preview mode, post/dynamic route coverage, cache strategy, and stable SDK examples. |
| `GET /api/sites/:siteId/media` | Partial | Public media list exists. | Signed/private access, transformations, responsive variants, metadata edits, reference tracking, and CDN/storage integration. |
| `GET/POST /api/admin/sites/:siteId/media` | Partial | Admin media upload/list endpoint stores files under `public/uploads` and metadata under `data/backy/media-library.json`. | Auth/RBAC, durable database, object storage, delete/update endpoints, virus/type scanning, quotas, background transforms, and audit events. |
| Sites/pages admin APIs | Partial | `GET/POST/PATCH/DELETE /api/admin/sites` and `/api/admin/sites/:siteId/pages` now persist to `data/backy/admin-content.json`. | Auth/RBAC, durable database, UI wiring, revisions, preview tokens, publish endpoints, cache invalidation, audit events, and contract tests. |
| Blog admin APIs | Partial | `GET/POST/PATCH/DELETE /api/admin/sites/:siteId/blog` now persists posts to `data/backy/admin-content.json`. | Auth/RBAC, durable database, UI wiring, category/tag/author resources, revisions, preview tokens, publish endpoints, cache invalidation, audit events, and contract tests. |
| Forms APIs | Partial | Form definitions, submissions, contacts, spam checks, CSV-like admin exports, and audit events exist in `apps/public/src/lib/backyStore.ts`. | Builder/admin UI, durable persistence, email/webhook delivery, retry dashboard, field-level validation schema, consent exports, and analytics. |
| Comments APIs | Partial | Page/blog comments, reports, moderation filters, and report reasons exist. | Admin policy settings, durable persistence, moderation queues in dashboard, notifications, author blocking, anti-spam provider hooks, and analytics. |
| Blog APIs | Partial | Public blog routes exist. | Admin write APIs, category/tag APIs, author profiles, RSS/sitemap, archive/search endpoints, and preview/draft access. |
| Public hosted pages | Partial | `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx` renders seeded content. | Full route resolution, draft preview, 404/redirects, sitemap/robots, theme inheritance, responsive rendering guarantees, and deployment/cache policy. |

## Immediate implementation order

1. **Real admin persistence API**: add authenticated admin endpoints for sites/pages/posts/users/settings and move admin store writes behind API helpers.
2. **Editor completion pass**: layers panel, snapping/alignment, undo/redo hardening, responsive canvas modes, preview/publish, and revision autosave.
3. **Media management completion**: delete/update metadata, search/tags/folders, alt/caption editor, font registration, object storage abstraction.
4. **Publishing model**: unify draft/published/scheduled states across admin/public APIs with preview tokens and cache invalidation.
5. **Backend validation/test suite**: endpoint contract tests, editor serialization tests, render payload schema validation, and smoke tests for every admin page.

## Current conclusion

Backy has meaningful scaffolding for a CMS/editor and now has stronger media and render-contract foundations, but most admin pages are still **Prototype** or **Partial**. The next milestone should be replacing local admin CRUD with real backend APIs before adding more visual features, otherwise new Wix/Canva-style UI controls will keep saving into a non-production data model.
