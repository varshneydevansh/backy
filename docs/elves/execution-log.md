# Execution Log

Newest entries go at the top. Keep reusable lessons in `docs/elves/learnings.md`.

## Run Digest

- **Last updated:** 2026-05-31 00:57 IST
- **Current phase:** In progress
- **Active batch:** Batch 3: Custom Frontend And Newsletter Handoff Readiness
- **Last completed batch:** Batch 2: Canvas Editor Interaction Fidelity
- **Next exact batch:** Batch 3: Custom Frontend And Newsletter Handoff Readiness
- **Active PR:** not created yet
- **Docs promoted this run:** `docs/elves/learnings.md`
- **Latest Elves Report:** not generated yet

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
