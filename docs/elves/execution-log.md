# Execution Log

Newest entries go at the top. Keep reusable lessons in `docs/elves/learnings.md`.

## Run Digest

- **Last updated:** 2026-05-31 06:01 IST
- **Current phase:** In progress
- **Active batch:** Batch 5: Ongoing UX Scout And Polish
- **Last completed batch:** Batch 4: Release Certification And Vercel Readiness
- **Next exact batch:** Batch 5: Ongoing UX Scout And Polish
- **Active PR:** not created yet
- **Docs promoted this run:** `docs/elves/learnings.md`
- **Latest Elves Report:** not generated yet

## 2026-05-31 06:01 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Sites/New Site frontend handoff now exposes agent read-start and host-aware subdomain routing; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/sites.tsx`: the Site frontend API panel now surfaces `Agent handoff`, host-aware resolve/render URLs using `domain={host}`, and frontend env guidance for `BACKY_PUBLIC_API_BASE_URL`, `BACKY_SITE_ID`, and `BACKY_SITE_PUBLIC_HOST`. The copied `backy.site.frontend.v1` contract now includes domain verification status, public host, environment variables, and a routing block with subdomain examples such as `akriti.devanshvarshney.com`.
- `apps/admin/src/routes/sites.new.tsx`: New Site creation now explicitly tells users that subdomains are valid exact custom domains, adds a visible frontend-agent read-start block, and includes `/agent-handoff`, manifest, host-aware resolve/render, frontend env, and routing metadata in the creation handoff manifest.
- `apps/admin/scripts/sites-smoke.mjs`: Sites source guards now assert the new Sites/New Site handoff fields, and the rendered layout guard checks that the visible Sites API panel includes `/agent-handoff`, `Resolve with host`, `Render with host`, and `BACKY_SITE_PUBLIC_HOST`.

**Commands run:**
- `BACKY_SITES_SOURCE_ONLY=1 npm run test:sites --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:sites --workspace @backy-cms/admin` -> FAILED after the new rendered Sites API panel assertion passed; the later existing duplicate-site UI step reported `Duplicated site was not created for Sites Smoke mpt1j6bk`.

**Next:**
1. Continue Batch 5 on another high-friction release surface: section/component resizing semantics, blog/newsletter authoring polish, or a targeted follow-up to the duplicate-site rendered smoke if it repeats.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 05:33 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; responsive viewport state is now visible in the editor toolbar; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: the viewport toolbar now counts responsive override layers and exposes an active breakpoint state of `desktop-source`, `inherits-desktop`, or `overrides`. Tablet/mobile mode shows a compact status pill such as `0 Inherits desktop` or `2 override layers`, with action-status metadata explaining how to create or clear breakpoint-specific canvas overrides.
- `apps/admin/scripts/editor-drag-smoke.mjs`: editor source and rendered viewport smokes now guard the responsive inheritance metadata, active/total override counts, and compact mobile preset path.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_EDITOR_PRIMARY_ACTION_STATUS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: section/component resizing semantics, blog/newsletter authoring polish, domain/subdomain management wording, or custom frontend/APIability discoverability.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 05:01 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; site switching discoverability improved; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/layout/Sidebar.tsx`: the active-site selector now has a visible `Site` label, no-signout action copy, and source-visible discovery metadata so it reads as a real control instead of passive workspace text under the Backy logo.
- `apps/admin/src/routes/help.tsx`: the Switch active site topic now tells users exactly where the selector is, that switching does not require logout, and that the adjacent Manage link opens the active site command center for readiness, domains, subdomains, and frontend handoff.
- `apps/admin/scripts/login-smoke.mjs` and `apps/admin/scripts/help-smoke.mjs`: smokes now guard the visible Site switcher label, no-signout copy, and Help wording.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin` -> PASS.
- `npm run test:login --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: mobile/compact editor ergonomics, section reflow clarity, blog/newsletter authoring polish, custom frontend/APIability discoverability, or release deploy readiness.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 04:47 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; editor navigation layer-map discoverability improved; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/LayersPanel.tsx`: nav rows now distinguish selectable child link layers from props-only nav items. Layer rows expose nav child-link count, edit mode, label/href metadata, and a visible hint such as “Expand to select individual link layers” or “Edit nav items in Inspector to sync selectable link layers.”
- `apps/admin/src/components/editor/LayersPanel.tsx`: layer search now indexes nav labels/hrefs plus readable nav/link metadata, so users can find `Docs`, `/pricing`, or a generated link row directly from the layer map.
- `apps/admin/scripts/editor-drag-smoke.mjs`: source and rendered nav component smoke now assert the layer-map nav metadata, child-link mode, href labels, child layer expansion, individual link selection, Inspector link editing, save, and reload.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_COMPONENT_SMOKE=nav npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: mobile/compact editor ergonomics, section reflow clarity, Help discoverability, site switching/domain management wording, or newsletter/blog authoring polish.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 04:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; blog-to-newsletter authoring workflow improved; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/blog.$postId.tsx`: blog posts now expose a dedicated Newsletter issue panel. It includes a copyable `backy.blog-newsletter-issue-source.v1` handoff, send-ready subscriber sync URL, held-subscriber URL, contact-sync template, source post metadata, public render/resolve URLs, issue readiness, and explicit external mail-provider boundary metadata.
- `apps/admin/src/routes/blog.$postId.tsx`: editor handoff JSON now includes `newsletterIssue`, and the command-center map includes a Newsletter section so report authors can move from writing a post to preparing a provider-safe newsletter issue without knowing the separate Newsletter workspace first.
- `apps/admin/scripts/blog-editor-smoke.mjs`: source guard now asserts the Blog editor newsletter issue panel, copy action, active-site Newsletter link, send-ready sync, and secret-exclusion boundary.

**Commands run:**
- `BACKY_BLOG_EDITOR_SOURCE_ONLY=1 npm run test:blog-editor --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: layer-map/mobile editor behavior, site/domain management wording, or additional blog/newsletter ergonomics.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 04:06 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; frontend-agent APIability discoverability improved; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/help.tsx`: the frontend-agent Help panel now has a copyable Component contract starter pointing at `agent-handoff.componentApiContract.componentTypeContracts + componentApiContract.propertyMap`. The copy brief now explicitly tells agents that every canvas element is API-addressable by id, type, props, styles, responsive overrides, token refs, assets, actions, data bindings, binding slots, accessibility, metadata, and children.
- `apps/admin/scripts/help-smoke.mjs`: Help source and rendered smoke contracts now assert the component API contract pointer and copy behavior.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: blog/newsletter authoring, layer-map/mobile editor behavior, or site/domain management wording.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 03:56 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Inspector section-flow parity improved; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: Inspector/property-panel geometry edits now route root section/header/footer/nav changes through the same `applyRootSectionFlow` path as canvas drag/resize interactions, then merge the shifted result back into the active breakpoint. Typed height/position edits now push following root sections consistently.
- `apps/admin/scripts/editor-drag-smoke.mjs`: root-section flow source guard now asserts the Inspector/property-panel path, not only direct canvas resize/drop paths.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another small release polish slice: blog/newsletter authoring, Help discoverability, layer-map/mobile editor behavior, site/domain management wording, or custom frontend/APIability discoverability.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 03:47 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; preview zoom friction reduced; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: preview mode now uses the same canvas-scoped zoom path as edit mode, including Cmd/Ctrl keyboard zoom, wheel zoom, Mac pinch gesture handling, and fit-to-canvas. Preview scale is backed by the expanded rendered canvas bounds instead of only the base canvas size, so overflow content participates in preview fitting.
- `apps/admin/scripts/editor-drag-smoke.mjs`: source guard now asserts preview canvas zoom metadata, expanded-content scale basis, and the preview scroll owner contract.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Decision made:**
- Kept the existing editor layout and canvas model; this slice only fixes the preview zoom/scale behavior that caused browser-level zoom in the canvas preview path.

**Next:**
1. Continue Batch 5 on the next highest-friction editor/content surface: responsive section/layout flow, blog/newsletter authoring, Help discoverability, or site/domain management wording.
2. Keep each slice small, verified, committed, and pushed.

## 2026-05-31 03:08 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; focused UX/security slices completed and pushed; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/ComponentLibrary.tsx`: component drag previews no longer keep the sticky component-preview pane active during a drag, preventing the component rail from appearing inside the canvas drag image.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: Inspector and Layers controls now expose clearer labels, tooltips, ARIA names, and stable purpose data attributes so users and agent smokes can understand what Inspector actually edits.
- `apps/admin/src/routes/pages.tsx`, `apps/admin/src/routes/users.tsx`, and `apps/admin/src/routes/settings.tsx`: dense Pages/Users tables use wider explicit route-local column contracts and wrapping text where needed; Settings More actions is lifted above the active appearance banner.
- `apps/public/src/lib/publicRouteHost.ts`, `apps/public/src/app/api/sites/route.ts`, and `apps/public/src/app/api/sites/[siteId]/resolve/route.ts`: public custom-domain and locale-domain matching now requires verified DNS state by default before site discovery or hosted route lookup accepts that host.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS for component drag/inspector source guards.
- `BACKY_EDITOR_MARQUEE_ORIGIN_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS; current canvas marquee origin is anchored to the actual pointer, not the top-left corner.
- `BACKY_PAGES_LIST_SOURCE_ONLY=1 npm run test:pages-list --workspace @backy-cms/admin` -> PASS.
- `BACKY_USERS_SOURCE_ONLY=1 npm run test:users --workspace @backy-cms/admin` -> PASS.
- `BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin` -> PASS.
- `BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE=1 npm run test:pages-list --workspace @backy-cms/admin` -> PASS.
- `BACKY_USERS_DATAGRID_LAYOUT_SMOKE=1 npm run test:users --workspace @backy-cms/admin` -> PASS.
- `npm run test:localized-routes --workspace @backy/public` -> PASS.
- `npm run test:public-security --workspace @backy/public` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS for admin slices.
- `npm run typecheck --workspace @backy/public` -> PASS for public-domain slice.
- `git diff --check` -> PASS before commits.

**Review findings:**
- [Medium] Public host matching accepted saved custom/locale domain strings without checking verification status. Resolved by centralizing host matching behind `publicRouteHostMatchesSite` with a strict verified-domain default and explicit test/demo escape hatch.
- [Medium] Pages and Users route tables were relying on too-tight column widths for long operational copy. Resolved route-locally instead of changing `DataGrid` globally.
- [Low] Inspector was technically functional but poorly named for the user. Resolved with selected-layer purpose labels and smoke-visible data attributes.

**Decisions made:**
- Kept the audit count honest: these product/security fixes do not convert the four external Settings/Commerce provider certification rows.
- Kept custom frontend direct render/resolve APIs available by site id; the stricter change applies to public site discovery and hosted host-to-site matching.
- Did not globally restyle the admin shell in this checkpoint; the recent user feedback says the current Backy editor direction is liked, so the work stayed on correctness and friction fixes.

**Commits pushed:**
- `41a78aae fix(editor): hide component preview during drags`
- `18f6877c fix(editor): clarify inspector affordances`
- `b056a40f fix(admin): reduce dense table overlap`
- `30d47ca0 fix(public): require verified custom domains`
- `882a41f6 fix(admin): explain verified domain routing`
- `5a81efd8 fix(editor): clarify nav layers in layer map`

**Follow-up checkpoint at 03:26 IST:**
- Help now has a source-guarded `verified-domain-routing` topic explaining that a saved custom domain is only setup intent until exact-host DNS verification is marked `verified`, and the copyable frontend-agent brief now tells agents to verify DNS before relying on domain discovery or host-to-site routing.
- The editor Layers map now exposes `data-layer-nav-link-count`, `data-layer-link-href`, and a readable meta line such as `nav · 3 links · site.navigation.primary` or `link · /about`, making navigation child layers easier to identify and select.
- Additional commands passed: `npm run test:help --workspace @backy-cms/admin`, `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin`, `npm run typecheck --workspace @backy-cms/admin`, and `git diff --check`.

**Next:**
1. Continue Batch 5 on the next highest-friction creation surface: blog/newsletter authoring, Help discoverability, layer-map/mobile responsive editor behavior, or site/domain management wording.
2. Keep each slice small, verified, committed, and pushed.

## 2026-05-31 01:51 IST

**Batch:** 4: Release Certification And Vercel Readiness
**Contract status:** all local criteria met; four audit partials remain external live-provider artifact gated

**Timing:**
- Implement: 8m | Validate: 13m | Review/subagent: 5m | Total: 26m
- Session elapsed: 122m | Budget remaining: open-ended

**What changed:**
- `README.md`: removed the production instruction to configure `VITE_BACKY_ADMIN_API_KEY`; added a protected topology matrix for `backy-public`, `backy-admin`, and custom frontend Vercel projects; clarified current subdomain/custom-domain behavior and the host-based rendering hardening gate.
- `SETUP.md`: clarified that server-only database/storage/provider/cron/admin secrets belong on `backy-public`, while the Vite admin shell receives only API base URLs and authenticates via session login/httpOnly cookie.
- `scripts/backy-release-certification-doctor.mjs`: expanded raw-secret artifact detection to reject bearer tokens, GitHub token shapes, Vercel token shapes, and JWT-like values in certification artifacts.
- `scripts/backy-release-certification-doctor-contract-smoke.mjs`: added runtime-built leak fixtures for those token classes without committing push-protection-looking secrets.
- `scripts/vercel-release-config-smoke.mjs`: added assertions that the production Vercel runbook includes protected topology guidance and does not mention `VITE_BACKY_ADMIN_API_KEY`.

**Commands run:**
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:release-certification-doctor-contract` -> PASS.
- `npm run test:release-certification-preflight-contract` -> PASS.
- `npm run doctor:release-certification` -> PASS, default audit still `41 Ready / 4 Partial / 0 Prototype / 0 Missing`; artifact-accepted audit remains `45 Ready / 0 Partial / 0 Prototype / 0 Missing`.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:partial-gate-preflights` -> PASS.
- `rg -n "VITE_BACKY_ADMIN_API_KEY|ghp_[A-Za-z0-9_]{24,}|vercel_[A-Za-z0-9_-]{24,}|Bearer [A-Za-z0-9._~+/=-]{24,}|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}" README.md SETUP.md scripts/backy-release-certification-doctor-contract-smoke.mjs scripts/backy-release-certification-doctor.mjs scripts/vercel-release-config-smoke.mjs` -> PASS for committed secret hygiene; only local-dev README env and smoke negative assertions mention `VITE_BACKY_ADMIN_API_KEY`.

**Test results:**
- Release doctor: PASS.
- Provider partial aggregate preflights: PASS.
- Vercel release config smoke: PASS.
- Admin typecheck: PASS.
- Diff check: PASS.

**Review findings:**
- [P1] Production Vercel docs suggested a client-exposed Vite admin key. Resolved by documenting cookie/session auth for production admin and adding a negative smoke assertion.
- [P1] Protected deployment topology lacked an operator-ready matrix. Resolved with project/domain/env/forbidden-env guidance for public/admin/custom frontend deployments.
- [P2] Artifact raw-secret detection was narrow. Resolved by expanding token-shaped leak detection and contract fixtures.
- [P3] Custom-domain routing wording could imply direct host-based rendering is already complete. Resolved by clarifying the current `BACKY_SITE_ID` custom frontend path and the remaining host-based rendering hardening gate.

**Decisions made:**
- Did not fake or synthesize live provider artifacts. The four partials remain legitimately external until fresh redacted Settings and Commerce artifacts pass admission.
- Kept local development README `VITE_BACKY_ADMIN_API_KEY=dev-admin-key-change-me` unchanged because it is dev-only and already bypassed in browser production flows.
- Did not deploy to Vercel in this batch; this was the release-readiness/doc/secret-safety hardening slice.

**Docs:**
- Impacted: `README.md`, `SETUP.md`, `docs/elves/survival-guide.md`, `docs/elves/execution-log.md`, `docs/elves/learnings.md`, `.elves-session.json`.
- Updated: deployment docs, release smokes, doctor contracts, and Elves run-state files.
- Promoted: production Vercel runbooks must never put admin keys in Vite/client env; provider artifact admission should reject broad token-shaped leaks, not only payment-provider keys.

**Regression attestation:**
- Cumulative diff: batch code commit changed 5 release/doc/smoke files.
- Files outside batch scope: none.
- Shared surfaces modified: release doctor raw-secret regex and Vercel config smoke only; no admin UI, public renderer, or API behavior changed.
- Consumers verified: release doctor contract, release preflight contract, full partial-gate preflights, Vercel release config smoke, admin typecheck, diff check.
- Residual risk: actual live Settings/Commerce provider artifacts still require configured external credentials and CI/runtime secrets before the audit can move from 41/4 to 45/0.
- Confidence: HIGH for local release readiness and secret-safe topology docs.

**Commit:** `ba7346b4`
**Rollback tag:** `elves/pre-batch-4`

**Next:**
1. Start Batch 5 by scanning the next visible UX/editor defect and picking a narrow polish slice.
2. Prioritize fixes that improve canvas/blog/page creation flow while preserving release doctor and handoff contracts.

## 2026-05-31 01:28 IST

**Batch:** 3: Custom Frontend And Newsletter Handoff Readiness
**Contract status:** all criteria met for local/admin handoff readiness

**Timing:**
- Implement: 16m | Validate: 13m | Review/subagent: 6m | Total: 31m
- Session elapsed: 96m | Budget remaining: open-ended

**What changed:**
- `apps/admin/src/routes/newsletter.tsx`: Newsletter API handoff now visibly exposes the site-scoped custom frontend agent start URLs: `/agent-handoff`, manifest, OpenAPI, render, resolve, plus provider-safe `audience=sendable` and contact-sync URLs. The copied newsletter handoff now includes a `customFrontendAgent` block pointing back to the canonical Backy site handoff contract.
- `apps/admin/src/routes/sites.$siteId.tsx`: Site Frontend handoff now surfaces the component API schema and `componentApiContract.componentTypeContracts` property-map pointer in the visible quick-read grid.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: Editor Composition handoff now exposes the same component contract schema and `componentTypeContracts` pointer in both data attributes and visible compact copy.
- `apps/admin/scripts/newsletter-smoke.mjs`, `apps/admin/scripts/site-detail-smoke.mjs`, `apps/admin/scripts/editor-drag-smoke.mjs`: focused source/render guards now assert the new copyable, site-scoped handoff metadata.
- `specs/custom-frontend-agent-handoff.md`: clarified that the Newsletter workspace handoff includes the canonical `/agent-handoff`, manifest, and OpenAPI start points.

**Commands run:**
- `npm run test:newsletter --workspace @backy-cms/admin` -> PASS.
- `npm run test:help --workspace @backy-cms/admin` -> PASS.
- `BACKY_SITE_DETAIL_SOURCE_ONLY=1 npm run test:site-detail --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin` -> FAIL once because Chrome DevTools did not start on default port `9396`; rerun with `BACKY_HELP_CDP_PORT=9496` -> PASS.

**Test results:**
- Typecheck: PASS.
- Source guards: PASS for Help, Site Detail, Newsletter, and Editor handoff contracts.
- Rendered smokes: PASS for Help handoff copy/site-scoped URL behavior on rerun.
- Process cleanup: PASS, no stray help/editor/site/newsletter smoke or Chrome CDP processes remained after validation.

**Review findings:**
- [Medium] Newsletter handoff exposed provider-safe sync URLs in copied JSON but not as first-class visible UI snippets. Resolved by adding visible send-ready and contact-sync rows.
- [Medium] Component/property contract discoverability was implicit in JSON. Resolved by surfacing `backy.canvas-component-api-contract.v1` and `componentApiContract.componentTypeContracts` in Site Detail and Editor handoff quick-read surfaces.
- [Low] The requested `CompositionHandoffPanel.tsx` path does not exist; the Composition handoff remains inline in `CanvasEditor.tsx`. No shim added because this batch improved the active surface and smoke coverage directly.

**Decisions made:**
- Did not change public API shape or generated SDK contracts. The patch improves admin handoff discoverability only, so SDK contract type checks were not required for this batch.
- Kept delivery provider secrets out of handoff payloads. Newsletter and issue handoffs expose endpoint templates, sync policy, and boundaries only.

**Docs:**
- Impacted: `docs/elves/survival-guide.md`, `docs/elves/execution-log.md`, `docs/elves/learnings.md`, `.elves-session.json`, `specs/custom-frontend-agent-handoff.md`.
- Updated: custom frontend/newsletter handoff spec and Elves run-state files.
- Promoted: visible handoff surfaces should name the canonical read path and component property-map pointer, not rely only on copied JSON.

**Regression attestation:**
- Cumulative diff: batch code commit changed 7 product/spec/smoke files.
- Files outside batch scope: none.
- Shared surfaces modified: editor handoff quick-read only; no canvas geometry, renderer, public API, or persistence behavior changed.
- Consumers verified: newsletter smoke, help smoke, site-detail source smoke, editor source smoke, rendered Help smoke, admin typecheck, diff check.
- Residual risk: Site Detail full rendered smoke was not rerun because source guard covers the handoff additions and full route smoke is heavier; run it before release if Site Detail rendering changes again.
- Confidence: HIGH for handoff discoverability and no-secret boundary because changes are additive, site-scoped, and guarded.

**Commit:** `19071d60`
**Rollback tag:** `elves/pre-batch-3`

**Next:**
1. Start Batch 4 by running `npm run doctor:release-certification`.
2. Inspect release/provider/Vercel docs and scripts for secret-safe artifact admission and deployment topology clarity.

## 2026-05-31 00:57 IST

**Batch:** 2: Canvas Editor Interaction Fidelity
**Contract status:** core criteria met; full responsive mega-smoke attempted but stopped after no output for about 10 minutes

**Timing:**
- Implement: 18m | Validate: 24m plus one long stopped responsive attempt | Review: 8m | Total: 43m
- Session elapsed: 65m | Budget remaining: open-ended

**What changed:**
- `apps/admin/src/components/editor/Canvas.tsx`: marquee selection now stores the original client pointer and reprojects that anchor against the current canvas rect during pointer moves. This prevents selection rectangles from drifting when the canvas scroll/rect settles between mouse-down and drag.
- `apps/admin/src/components/editor/ComponentLibrary.tsx`: component drags clear the sticky preview pane, mark the library as drag-active, force layout on the custom drag image before `setDragImage`, and keep the drag image rendered behind the page instead of offscreen so Chrome is less likely to fall back to a screenshot of the component rail.
- `apps/admin/scripts/editor-drag-smoke.mjs`: updated source/runtime guards for anchored marquee behavior and opaque component-library drag previews.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_MARQUEE_ORIGIN_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> FAIL before patch with marquee start drift; PASS after patch.
- `BACKY_EDITOR_ZOOM_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS on rerun after an earlier CDP socket close.
- `BACKY_EDITOR_LIBRARY_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_LAYERS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_EDITOR_RESPONSIVE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> STOPPED after about 10 minutes with no output to clean up the stuck Chrome/CDP process. Source guards still cover responsive defaults/render bounds, and layers smoke covered layer-map behavior.

**Test results:**
- Typecheck: PASS.
- Source guards: PASS for editor contracts, including nav binding/child-layer source coverage and component drag preview contract.
- Rendered smokes: PASS for marquee origin, zoom/page-zoom stability, component library drag preview, and layers panel behavior.
- Responsive mega-smoke: inconclusive due long no-output hang, no assertion failure captured.

**Review findings:**
- [Medium] Marquee start coordinates were stable only relative to the canvas rect at pointer-down. When the rect shifted before the first move/read, the overlay origin could drift. Resolved by storing the client anchor and reprojecting it.
- [Low] Component drag preview used a custom drag image, but it was staged offscreen and the sticky preview pane stayed active during drag. Resolved by clearing drag preview state and staging the drag image in a rendered behind-page position before `setDragImage`.

**Decisions made:**
- Did not change zoom event routing because the zoom smoke proves canvas zoom changes while page zoom stays stable, including wheel, keyboard, legacy mousewheel, and gesture paths.
- Did not patch layer/nav behavior because existing source guards and the rendered layers smoke passed.
- Stopped the unbounded responsive smoke instead of leaving orphaned Chrome processes. Treat the long runtime as test-suite debt, not a product regression from this batch.

**Docs:**
- Impacted: `docs/elves/survival-guide.md`, `docs/elves/execution-log.md`, `docs/elves/learnings.md`, `.elves-session.json`.
- Updated: these Elves run-state files.
- Promoted: marquee anchor and component drag-image learnings.

**Regression attestation:**
- Cumulative diff: batch code commit changed 3 files with focused editor interaction edits and smoke assertions.
- Files outside batch scope: none.
- Shared surfaces modified: canvas pointer selection and component library drag handling only.
- Consumers verified: editor source guards, marquee rendered smoke, zoom rendered smoke, component-library rendered smoke, layers rendered smoke, admin typecheck.
- Residual risk: full responsive mega-smoke needs a bounded/partitioned mode; current source and rendered layer/zoom/marquee checks are green.
- Confidence: HIGH for marquee/drag-preview fixes, MEDIUM for broader responsive parity because the mega-smoke did not complete in this run.

**Commit:** `8229065c`
**Rollback tag:** `elves/pre-batch-2`

**Next:**
1. Start Batch 3 by inspecting Help, Site Detail, editor Composition handoff, manifest/OpenAPI, and newsletter subscriber management.
2. Add or tighten copyable handoff smoke coverage for custom frontend agents without exposing secrets.

## 2026-05-31 00:14 IST

**Batch:** 1: Admin Layout And Site Discoverability
**Contract status:** all criteria met

**Timing:**
- Implement: 14m | Validate: 10m | Review: 4m | Total: 28m
- Session elapsed: 22m | Budget remaining: open-ended

**What changed:**
- `apps/admin/src/components/layout/Sidebar.tsx`: added an explicit active-site Manage link beside the sidebar site switcher, using the route id convention already used by the header.
- `apps/admin/scripts/login-smoke.mjs`: extended source guards for the sidebar active-site management route and test hooks.
- `apps/admin/scripts/dashboard-smoke.mjs`: added rendered dashboard assertions for the new sidebar site-management link.
- `apps/admin/scripts/settings-smoke.mjs`: aligned the rendered settings menu layer assertion with the current source contract where the sticky workbar computes to `z-index: 30`.

**Commands run:**
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin` -> PASS.
- `BACKY_DASHBOARD_SOURCE_ONLY=1 npm run test:dashboard --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:dashboard --workspace @backy-cms/admin` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE=1 npm run test:pages-list --workspace @backy-cms/admin` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 BACKY_USERS_DATAGRID_LAYOUT_SMOKE=1 npm run test:users --workspace @backy-cms/admin` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:settings --workspace @backy-cms/admin` -> PASS after smoke contract update.
- `git diff --check` -> PASS.

**Test results:**
- Typecheck: PASS.
- Source smokes: PASS for login/sidebar and dashboard/sidebar.
- Rendered smokes: PASS for dashboard sidebar, Pages DataGrid layout, Users DataGrid layout, and Settings header action menu/workbar layering.

**Review findings:**
- [Medium] Settings rendered smoke expected stale `z-index: 10` while source and UI use `z-30`: resolved by aligning the smoke with the existing source contract and verifying the menu is in-flow, non-overlapping, and top-clickable.

**Decisions made:**
- Kept `DataGrid` unchanged because the rendered Pages and Users layout smokes already pass against the current implementation. Avoiding a shared primitive change reduced regression risk.
- Added a dedicated sidebar Manage link instead of making the select label or Backy logo do double duty. This makes the site management affordance explicit while preserving dashboard and switcher behavior.

**Process adjustments:**
- Continue using rendered smokes for visible overlap reports before changing shared layout primitives.

**Docs:**
- Impacted: `docs/elves/survival-guide.md`, `docs/elves/execution-log.md`, `.elves-session.json`.
- Updated: these Elves run-state files.
- Promoted: existing learnings already capture DataGrid and settings-menu traps.
- Deferred: none for Batch 1.

**Regression attestation:**
- Cumulative diff: batch code commit changed 4 files with focused sidebar/smoke edits.
- Files outside batch scope: none.
- Shared surfaces modified: `Sidebar.tsx` global admin shell component, additive link only; no navigation model or route matching behavior changed.
- Consumers verified: login/dashboard source guards plus rendered dashboard sidebar smoke.
- Test baseline: no numeric baseline captured; focused gates are recorded above.
- Confidence: HIGH, because the change is additive, source guards cover route/test hooks, rendered dashboard validates the new link, and the reported Pages/Users/Settings layout smokes are green.

**Commit:** `70521694`
**Rollback tag:** `elves/pre-batch-1`

**Next:**
1. Start Batch 2 by inspecting canvas marquee, zoom, component drag preview, layer map/nav child selection, and responsive preview contracts.
2. Run focused editor smokes before and after any canvas patch.

## Batch 1 Contract: 2026-05-30 23:52 IST

**Behaviors:**
- Sidebar active-site identity has a clear site-management/switching target without signing out.
- Pages, Users, and Settings layouts do not overlap, clip action/status text, or hide controls behind adjacent panels at normal desktop widths.
- Dense table fixes are narrowly scoped and do not weaken all `DataGrid` consumers.

**Build on:**
- `AGENTS.md` Backy-specific design/content preservation rules.
- `DESIGN.md` control-room UI rules.
- Shared `DataGrid` and `useDataTable` primitives where table behavior is shared.
- Existing route smokes for pages, users, and settings instead of ad hoc visual-only checks.

**Acceptance criteria:**
- [ ] `npm run typecheck --workspace @backy-cms/admin`
- [ ] Relevant focused pages/users/settings smoke or source guard passes.
- [ ] `git diff --check`
- [ ] Batch changes are committed with a logical message.

**Blast radius:**
- `apps/admin/src/components/layout/Sidebar.tsx`: global admin layout, medium risk, user-facing discoverability.
- `apps/admin/src/components/ui/DataGrid.tsx`: shared admin table primitive, medium/high risk if modified globally.
- `apps/admin/src/routes/pages.tsx`: pages list, medium risk due dense delivery/status cells.
- `apps/admin/src/routes/users.tsx`: users list, medium risk due role/status controls.
- `apps/admin/src/routes/settings.tsx`: settings command/workbar layout, low/medium risk.
- Smoke scripts: additive source/render assertions only.

**Pre-implementation survey:**
- Existing subagent audits identify `DataGrid` containment, `/pages` inline delivery `<details>`, `/users` filter/table spacing, and `/settings` absolute `More actions` menu as primary layout suspects.
- Existing active work before Elves bootstrapping was aimed at making the sidebar site identity actionable.

## Session Setup: 2026-05-30 23:52 IST

**Phase:** Launch started from existing user-approved goal
**Plan:** `docs/elves/backy-release-plan.md`
**Survival guide:** `docs/elves/survival-guide.md`
**Learnings:** `docs/elves/learnings.md`
**Execution log:** `docs/elves/execution-log.md`
**Branch:** `main`
**PR:** not created yet
**Run mode:** open-ended | **User returns:** open-ended
**Checkpoint semantics:** delivery target only | **Actual stop conditions:** explicit user stop or genuine blocker only
**Active compute at launch:** none recorded
**Continuation guard:** stop_allowed=no | remaining_batches=5 | checkpoint_is_stop=no | next_required_action=Start Batch 1: Admin Layout And Site Discoverability

**Batch breakdown:**
1. Admin Layout And Site Discoverability - sidebar site target, pages/users/settings overlap fixes.
2. Canvas Editor Interaction Fidelity - marquee, zoom, drag preview, layers/nav child selection, responsive preview.
3. Custom Frontend And Newsletter Handoff Readiness - handoff discoverability, APIable components, newsletter subscriber management.
4. Release Certification And Vercel Readiness - release doctor, secret hygiene, provider artifact admission, deployment topology.
5. Ongoing UX Scout And Polish - page-by-page small verified UI/UX fixes.

**Preflight:**
- Git remote: PASS, origin points to `https://github.com/varshneydevansh/backy.git`.
- GitHub CLI: WARN, stale invalid `GITHUB_TOKEN` exists but keyring login for `varshneydevansh` is present.
- Secret-history check: PASS for the previously reported blocked commit ids; they are not valid commits in current local history.
- Validation gate dry run: deferred to Batch 1 focused gates because this setup is documentation/process-only.
- Environment/sleep/notification checks: WARN/N/A, no Slack webhook or sleep-prevention process recorded.

**Launch readiness:** READY with PR/push strategy warning.

**Launch prompt:**
> Continue the open-ended Backy Elves run from `docs/elves/survival-guide.md`. Do not stop unless explicitly stopped or genuinely blocked. Work batch by batch, validate, commit logical slices, and keep release UX/editor/custom-frontend readiness moving.
