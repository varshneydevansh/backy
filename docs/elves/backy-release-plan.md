# Plan: Backy Release Parity Hardening

## Mission

Bring Backy from the current 41 Ready / 4 Partial audit state into a coherent, releaseable product experience for secure multi-site website backends, custom frontend handoff, and Canva/Wix-style page editing. The remaining audit partials are external live Settings/Commerce provider certification artifacts; product work during this run should focus on the admin UX, canvas editor reliability, custom frontend discoverability, and release verification around those known external gates.

## Canonical Launch-Critical Status

Last refreshed: 2026-07-10 IST. This section is the current operational launch tracker. The page-surface audit remains canonical for the separate `41 Ready / 4 Partial` product count.

| Launch capability | Current state | Evidence / remaining gate |
| --- | --- | --- |
| Protected Backy admin | Ready | `https://backy-admin.vercel.app/login` is live; the production login-shell smoke exposes no demo credentials or development MFA phrase. |
| Backy public/API runtime | Ready | `https://backy-public.vercel.app` is live on Supabase/Postgres-backed database mode; production readiness passes 47 checks for discovery, handoff, manifest, OpenAPI, and render. Exact production CORS origins are configured for Backy admin, the deployed custom frontend, and the apex/`www` website hosts. |
| Production owner access | Ready | Production Supabase contains two active Backy owner profiles and owner team memberships. The prior "created as editor" blocker is closed. The one-time owner bootstrap token is absent from production after use. |
| Real website site record | Ready for authoring | `devanshvarshney` / `devanshvarshney.com` exists as a published Backy site with a published homepage. DNS/domain status remains pending until the live domain is moved and verified. |
| Separate custom frontend | Ready on Vercel | `https://devanshvarshney-frontend.vercel.app` is deployed separately. The strict production connection gate passes 113 checks using canonical site id `f766b8f8-6480-40bb-abec-775b75e09c07`, including public API, DOM control attributes, `/api/backy-connection`, editable-map, responsive, template registry, blog inheritance, and frontend-design pointers. |
| Pages and blog publishing | Ready for use | Backy page/blog creation, templates, canvas persistence, public render, long-page growth, audio/transcript starter, custom-frontend template inheritance, and publish APIs are implemented and smoke-guarded. Real authored content still needs to be entered by the owner. |
| Media, files, fonts, forms, newsletter | Ready for use | Media/file/font records, upload contracts, form submission, contacts, newsletter consent/subscriber management, issue-draft handoff, and public frontend bridges are implemented. Outbound email delivery remains provider-backed by design. |
| Products and orders | Core ready; paid checkout externally gated | Product/catalog/order records and public APIs are implemented. Taking real card payments requires configured provider credentials and fresh Commerce certification evidence. |
| Release audit | 41 Ready / 4 Partial | `/settings`, Settings admin APIs, `/products`, and `/orders` remain Partial only because fresh live Settings/Commerce provider artifacts are not present. Artifact-accepted mode is `45 Ready / 0 Partial`. |

### Remaining launch actions

- [ ] Sign in with one of the active owner accounts and author the first real pages, posts, media, newsletter form, products, and policies.
- [x] Configure exact `BACKY_CORS_ALLOWED_ORIGINS` entries for Backy admin, the deployed custom frontend, and the future apex/`www` website hosts; redeploy `backy-public` and rerun the 47-check production and 113-check custom-frontend gates.
- [ ] Attach `devanshvarshney.com` to the separate frontend Vercel project, update DNS, and verify the Backy domain mapping without interrupting the current Hostinger site.
- [ ] Select and configure the payment provider used for real checkout, then run Commerce provider certification and save the redacted artifact.
- [ ] Configure the chosen outbound email provider when newsletter delivery is needed; subscriber capture and export do not depend on it.
- [ ] Run the optional credential-redacted live admin login/session/logout proof from a private shell before final launch promotion.

### Current proof commands

```bash
BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app \
BACKY_VERCEL_PRODUCTION_SITE_ID=devanshvarshney \
BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 \
npm run test:vercel-production-readiness

BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api \
BACKY_CUSTOM_FRONTEND_SITE_ID=f766b8f8-6480-40bb-abec-775b75e09c07 \
BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=devanshvarshney.com \
BACKY_CUSTOM_FRONTEND_URL=https://devanshvarshney-frontend.vercel.app \
BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 \
BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 \
BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 \
npm run test:custom-frontend-connection
```

## Scope

### In Scope

- Fix visible admin UI clipping, overlapping, and discoverability issues on the high-traffic surfaces the user reported.
- Harden the page/blog canvas editor so selection, drag/drop, resize, zoom, layers, components, and responsive modes behave like a professional visual builder.
- Preserve and expose custom frontend design metadata, editable maps, page/blog/product/form structures, newsletter/subscriber handoff, manifest, OpenAPI, and SDK contracts.
- Keep the release doctor, secret scanning posture, and Vercel deployment topology ready for protected production deployment.
- Commit in small logical slices with relevant focused tests.

### Out of Scope

- Building first-party mailbox hosting or outbound newsletter delivery inside Backy. Backy owns subscriber management and provider-safe handoff; actual mailbox/delivery stays provider-backed for now.
- Declaring the four external provider partials complete without real Settings/Commerce provider artifacts.
- Replacing Backy's operational control-room admin UI with a marketing dashboard.

## Batches

### Batch 1: Admin Layout And Site Discoverability

**Tasks:**
- [x] Make the sidebar active-site identity actionable so users can manage/switch sites from the left rail without signing out.
- [x] Fix dense `/pages` row overlap/clipping around delivery health, revisions, route, status, and row actions.
- [x] Tighten `/users` table wrapping and spacing so role/status controls and actions do not collide.
- [x] Make Settings `More actions` render in a stable in-flow or collision-safe surface instead of hiding behind the Appearance/workbar area.

**Acceptance criteria:**
- [x] Pages, Users, and Settings source/render smokes cover the non-overlap conditions.
- [x] `npm run typecheck --workspace @backy-cms/admin` passes in the current post-plan-change verification pass.
- [x] `git diff --check` passes in the current post-plan-change verification pass.

**Current evidence:**
- Sidebar and header site management/switching are guarded by `apps/admin/scripts/login-smoke.mjs` and `apps/admin/scripts/dashboard-smoke.mjs`, including the Manage, Site selector, Domains, Help, and no-signout action-status contracts.
- `/pages` dense-row overlap is guarded by `apps/admin/scripts/pages-list-smoke.mjs`, including `BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE`, explicit table width, in-flow actions, delivery-cell clipping, and delivery-history details.
- `/users` table wrapping is guarded by `apps/admin/scripts/users-smoke.mjs`, including `BACKY_USERS_DATAGRID_LAYOUT_SMOKE`, explicit role/status/person/action widths, wrapped names/emails/activity, and constrained action cells.
- Settings `More actions` layering is guarded by `apps/admin/scripts/settings-smoke.mjs`, including the header/workbar stack-layer contract and a rendered top-element overlap assertion.

**Docs likely touched:**
- `docs/elves/*`
- Focused smoke scripts if source guards need to record the fixed layout contract.

**Risk:** Medium. `DataGrid` is shared, so any overflow fix must be opt-in or narrowly scoped to avoid regressing other admin tables.

### Batch 2: Canvas Editor Interaction Fidelity

**Tasks:**
- [x] Verify and harden marquee selection origin so drag rectangles start at the pointer, not the canvas top-left.
- [x] Verify Mac trackpad/mouse in-canvas zoom intercepts canvas gestures without browser/page zoom.
- [x] Fix component drag preview so the source palette does not visibly smear or stack into the canvas.
- [x] Ensure preview/editor scroll behavior works in desktop/tablet/mobile canvas modes.
- [x] Make navigation child links selectable/linkable as layer items when a nav block is generated or imported.
- [ ] Keep expanding editor command execution coverage so every visible command/palette action has an executor invariant and a rendered smoke guard.
- [ ] Continue polishing long-page authoring and custom-frontend blog templates against real authored pages.

**Acceptance criteria:**
- [ ] Focused editor drag/zoom/component/layers smokes pass.
- [ ] Canvas changes preserve existing element geometry, responsive overrides, and save/publish behavior.
- [ ] Public renderer remains aligned for any canvas contract change.

**Current evidence:**
- Marquee origin, reverse marquee, and root-surface marquee are guarded by `BACKY_EDITOR_MARQUEE_ORIGIN_SMOKE`.
- Canvas zoom, preview scroll, rendered long-page media drops, component drag image isolation, section flow, resize auto-growth, and navigation child-link layer controls are guarded in `apps/admin/scripts/editor-drag-smoke.mjs` and related editor smoke scripts.
- Command palette coverage now proves zero registered-but-unwired commands, `zoom-fit` execution, blocked `undo` status, plus rendered execution for non-destructive shell/view commands: grid, snap, pan, component panel, layers panel, inspector panel, and focus mode.
- The remaining editor work is now less about missing primitives and more about proving every visible command and template workflow stays executable as the editor grows.

**Docs likely touched:**
- Smoke scripts and, if a durable rule is discovered, `docs/elves/learnings.md`.

**Risk:** High. Canvas event handling, pointer capture, transform math, and nested selection are tightly coupled.

### Batch 3: Custom Frontend And Newsletter Handoff Readiness

**Tasks:**
- [x] Ensure Help, Site Detail, and Editor composition handoff clearly show where AI/frontend agents read Backy APIs.
- [x] Confirm every component/element remains API-addressable through manifest/OpenAPI/SDK/render payloads with properties, bindings, design tokens, fonts, media, animations, and editable maps preserved.
- [x] Make newsletter subscriber management and provider-safe sync/export handoff discoverable for publishing/journalism workflows.

**Acceptance criteria:**
- [x] Help/site/newsletter smokes cover copyable handoff blocks and site-scoped URLs.
- [x] Generated SDK contract type checks pass when public contract changes.
- [x] Handoff docs do not expose secrets or admin-only payloads in public endpoints.

**Current evidence:**
- The strict deployed custom frontend gate passes 113 checks for the real production site and separate Vercel frontend, including component properties, editable maps, responsive metadata, template reuse, blog inheritance, and the secret-free connection probe.
- Help, Site Detail, Newsletter, manifest, OpenAPI, SDK, and starter source contracts are covered by the custom frontend control-plane gate and focused admin/public smokes.
- Public-repo hygiene and frontend forbidden-env checks keep database, Supabase service-role, admin, bootstrap, cron, SMTP, and payment secrets out of the custom frontend contract.

**Docs likely touched:**
- `AGENTS.md`
- `specs/custom-frontend-agent-handoff.md`
- `specs/backy-api-contracts.md`
- `docs/elves/learnings.md`

**Risk:** Medium. Contract changes must remain backward compatible for custom frontend builders.

### Batch 4: Release Certification And Vercel Readiness

**Tasks:**
- [x] Keep `npm run doctor:release-certification` green in default no-artifact mode.
- [x] Keep provider artifact admission commands documented and machine-readable for Settings and Commerce.
- [x] Confirm git history no longer contains the previously blocked Stripe sentinel commits and push protection stays clean.
- [x] Keep Vercel protected deployment topology documented for Backy admin/public and custom frontend deployments.

**Acceptance criteria:**
- [x] Release certification doctor passes.
- [x] Secret scans/contract smokes avoid raw provider-looking keys.
- [x] Vercel deployment docs identify backend/admin topology, frontend deployment separation, and domain/subdomain routing expectations.

**Current evidence:**
- Default release doctor passes and reports the honest artifact-free `41 Ready / 4 Partial` audit plus the artifact-accepted `45 Ready / 0 Partial` impact.
- `backy-public`, `backy-admin`, and `devanshvarshney-frontend` production deployments are Ready as separate Vercel projects.
- Live public production readiness passes 47 checks and the protected production login shell exposes no demo credentials or development MFA phrase.
- The two commits previously rejected by GitHub push protection are not ancestors of `main`, public-repo hygiene passes, and the current branch pushes cleanly.

**Docs likely touched:**
- Release docs/specs only if the verified behavior changes.

**Risk:** Medium. Live provider completion depends on operator-owned secrets/artifacts and must not be faked in code.

### Batch 5: Ongoing UX Scout And Polish

**Tasks:**
- [ ] Continue page-by-page audit for overwhelming UI, broken buttons, clipped text, missing help, and unclear controls.
- [ ] Prefer small shippable fixes with tests over broad redesign churn.
- [ ] Keep Backy's look aligned with `DESIGN.md`: serious creative control room, dense but readable, no decorative dashboard drift.

**Acceptance criteria:**
- [ ] Each fix has a focused verification gate.
- [ ] New UI behavior is discoverable without visible explanatory clutter.
- [ ] No page regresses custom frontend or canvas persistence guarantees.

**Docs likely touched:**
- `docs/elves/execution-log.md`
- `docs/elves/learnings.md` for reusable design or testing lessons.

**Risk:** Medium. Polish work can sprawl; keep each commit tied to a concrete bug or workflow.

## Non-Negotiables

- Never fake the four external Settings/Commerce provider partials; only real artifacts or accepted no-artifact status can close them.
- Preserve custom frontend design metadata, editable maps, bindings, media/font identities, animations, responsive overrides, and canvas content on every create/update path.
- Fix root causes and use existing Backy primitives/patterns before adding new abstractions.
- Do not weaken tests to make a gate pass.
- Do not merge. The user controls merge/release decisions.

## Test Strategy

- **Admin type gate:** `npm run typecheck --workspace @backy-cms/admin`
- **Editor source gate:** `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin`
- **Editor coverage gate:** `npm run test:editor-smoke-coverage --workspace @backy-cms/admin`
- **Editor zoom gate:** `BACKY_EDITOR_ZOOM_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`
- **Pages layout gate:** `BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE=1 npm run test:pages-list --workspace @backy-cms/admin`
- **Users layout gate:** `BACKY_USERS_DATAGRID_LAYOUT_SMOKE=1 npm run test:users --workspace @backy-cms/admin`
- **Settings gate:** `npm run test:settings --workspace @backy-cms/admin`
- **Help/handoff gate:** `npm run test:help --workspace @backy-cms/admin`
- **Release gate:** `npm run doctor:release-certification`
- **Diff hygiene:** `git diff --check`

## Notes

- `AGENTS.md` is the standing Backy-specific source of truth for custom frontend agents, design preservation, canvas-first creation, and safety boundaries.
- Current audit baseline is 41 Ready / 4 Partial / 0 Prototype / 0 Missing. The four partials are external live Settings/Commerce provider certification artifacts.
- Recent subagent audits identified `DataGrid`, `/pages`, `/users`, `/settings`, `Canvas`, `CanvasEditor`, `PropertyPanel`, `LayersPanel`, and `PageRenderer` as the main release-hardening targets.
