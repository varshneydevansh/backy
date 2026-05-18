# Dashboard completion contract

Date: 2026-05-09

This contract defines what the Backy admin dashboard must do before it can be called complete for the Wix/WordPress/Canva-like backend goal. The dashboard is the operator cockpit for custom frontend control, publishing readiness, storage health, and recent backend activity.

## Dashboard purpose

The dashboard must answer four questions without requiring the operator to hunt through pages:

- What content and sites exist across this Backy workspace?
- What needs attention before a site or custom frontend can safely publish?
- Is the backend/API/storage path healthy enough for external frontends?
- What changed recently, and where can I continue working?

## Required controls and behavior

| Surface | Behavior | Backend/API source | Completion state |
| --- | --- | --- | --- |
| Refresh dashboard | Reloads sites, pages, posts, users, media, settings, audit logs, and readiness. Shows loading/error state without losing the last known dashboard. | Admin APIs through `apps/admin/src/lib/adminContentApi.ts` and `mediaApi.ts` | Implemented in `apps/admin/src/routes/index.tsx` |
| Metric cards | Show total sites, pages, blog posts, media assets, team members, and readiness blockers. Cards link to the owning admin page. | `GET /api/admin/sites`, per-site pages/blog/readiness, media, users | Implemented, except readiness blocker count is shown in the attention module instead of a metric card |
| Quick actions | New site, new page, new post, media upload/library, collections, API settings. Every action must route to a real page, not an inert button. | Admin routes | Implemented |
| Publishing readiness | Shows blocking errors and warnings from site readiness checks, with a direct link to the first affected site. | `GET /api/admin/sites/:siteId/readiness` | Implemented as dashboard-level blocker/warning summary |
| Backend health | Shows API status, delivery mode, media storage provider/configured state, and asset count. No fake "connected" labels. | `GET /api/admin/settings`, media list | Implemented |
| Recent activity | Shows real audit log events first, falling back to local activity only when audit reads fail. Each row shows entity/action/time/request id. | `GET /api/admin/audit-logs` | Implemented |
| Custom frontend readiness | Links operators to manifest/API settings and warns about incomplete readiness, storage config, and publishing blockers. | Settings + readiness + public contract docs | Implemented for current settings/collections/readiness surface |

## Later dashboard modules

- Product commerce health: implemented for the current products/orders/settings slice. The dashboard now renders total and loaded product counts, low-stock/out-of-stock inventory warnings, checkout URL coverage, payment/tax/shipping/discount provider readiness, setup score, open/failed/paid order counts, and loaded order value with direct links to Products, Orders, and Settings.
- Form/comment moderation queue: implemented for the current forms/comments slice. The dashboard now renders form submission totals and loaded sample counts, pending form/comment queues, form spam, reported/spam/blocked comments, approval throughput, manual-review form count, moderation audit events, sample coverage, and direct links to Forms and Comments.
- Deployment health: Vercel project status, last deploy, domain verification, cache invalidation/rebuild status.
- Supabase connectivity: implemented for runtime-visible persistence state. The dashboard now renders database mode/provider/configuration, repository mode, Supabase project/database/auth/service-role readiness, storage bucket, missing runtime env, and explicit migration/RLS/backup external-gate labels instead of fake connected states.
- API consumers: implemented for the current Settings/API contract slice. The dashboard now renders API consumer readiness with public/admin endpoint counts, API key configured state, active/revoked named service-key counts, rotation/revocation history counts, recent API access audit events, and the same non-secret counts in the downloadable handoff JSON.

## UX rules

- Dense but readable operational UI, not a marketing hero.
- Every visible button or link must perform a real navigation/action.
- Loading, empty, and error states must be explicit.
- The dashboard should work on mobile, tablet, and desktop using existing Tailwind breakpoints.
- Cards are allowed for individual metrics/modules only; do not nest cards inside cards.
