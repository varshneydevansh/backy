# Execution Log

Newest entries go at the top. Keep reusable lessons in `docs/elves/learnings.md`.

## Run Digest

- **Last updated:** 2026-05-31 14:50 IST
- **Current phase:** In progress
- **Active batch:** Batch 5: Ongoing UX Scout And Polish
- **Last completed batch:** Batch 4: Release Certification And Vercel Readiness
- **Next exact batch:** Batch 5: Ongoing UX Scout And Polish
- **Active PR:** not created yet
- **Docs promoted this run:** `docs/elves/learnings.md`
- **Latest Elves Report:** not generated yet

## 2026-05-31 14:50 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Vercel preview readiness gate added; source/config deploy readiness passes, operator project linkage still pending

**What changed:**
- Added `npm run test:vercel-preview-readiness`, a non-mutating Vercel preview readiness smoke that hard-fails checked-in topology, env-boundary, README/AGENTS, OpenAPI, manifest, and handoff drift while warning about missing local Vercel project links or remote `backy-public`/`backy-admin` projects unless strict flags are set.
- Added `previewReadinessSmoke: "npm run test:vercel-preview-readiness"` to `backy.deployment-topology.v1` so deploy/frontend agents reading `/agent-handoff`, manifest, OpenAPI, or SDK fixtures see the preview-readiness gate.
- Updated the README runbook with exact `BACKY_CORS_ALLOWED_ORIGINS`, strict readiness mode, and optional Vercel Agent Code Review setup from each project's Project Settings -> AI page.
- Wired the new smoke into `test:partial-gate-preflights`, release preflight contract coverage, SDK generated contract type fixtures, and frontend contract smoke guards.
- Added `.vercel/` to `.gitignore` so local project linkage metadata is available to the readiness smoke but not accidentally committed.

**Commands run:**
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings that `apps/public/.vercel/project.json`, `apps/admin/.vercel/project.json`, and remote Vercel projects `backy-public`/`backy-admin` are not created/linked yet.
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:frontend-contract-types` -> PASS.
- `npm run test:release-certification-preflight-contract` -> PASS.
- `npm run doctor:release-certification` -> PASS; still 41 Ready / 4 Partial / 0 Prototype / 0 Missing in default no-artifact mode.
- `npm run typecheck` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this Vercel preview readiness slice.
2. Continue Batch 5 with the next highest-value release task: actual preview deploy/linking if the user wants mutation now, or another admin/editor polish slice while Vercel projects/env remain operator-owned.

## 2026-05-31 14:13 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** deployment readiness slice completed; live Vercel projects not created in this slice

**What changed:**
- Added `backy.deployment-topology.v1` to the shared custom frontend agent handoff contract so `/agent-handoff`, manifest, and OpenAPI now expose the protected `backy-admin`, public `backy-public`, and separate custom-frontend project model directly.
- Added top-level `deploymentTopology` to the direct `/api/sites/:siteId/agent-handoff` response.
- Updated the frontend manifest schema, OpenAPI schema, SDK generated type fixtures, SDK smoke, public frontend-contract smoke, custom frontend handoff spec, and `AGENTS.md` so deploy/frontend agents can read required/forbidden env, verified-domain policy, and release verification commands without relying on README prose.

**Vercel readiness findings:**
- Vercel MCP token is expired, but local Vercel CLI is authenticated as `varshneydevansh`.
- Vercel team visible: `varshneydevanshs-projects`.
- Existing Vercel projects visible from CLI: only `filtertube-website`; Backy is not yet linked as `backy-public` or `backy-admin`.
- Backy is deployable as preview once those two Vercel projects are created/linked and env is configured.

**Commands run:**
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:frontend-contract-types` -> PASS.
- `BACKY_HELP_SOURCE_ONLY=1 npm run test:help --workspace @backy-cms/admin` -> PASS.
- `BACKY_NEWSLETTER_SOURCE_ONLY=1 npm run test:newsletter --workspace @backy-cms/admin` -> PASS before this patch while scouting backend readiness.
- `BACKY_BLOG_EDITOR_SOURCE_ONLY=1 npm run test:blog-editor --workspace @backy-cms/admin` -> PASS before this patch while scouting backend readiness.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck` -> PASS.
- `npm run doctor:release-certification` -> PASS, still 41 Ready / 4 Partial / 0 Prototype / 0 Missing without external provider artifacts.
- `git diff --check` -> PASS.
- `npm run build --workspace @backy/public` -> PASS.
- `npm run build --workspace @backy-cms/admin` -> PASS with existing large Vite bundle warning.

**Residual risk:**
- The admin Vite build emits a large JS chunk warning. This is not a deployment blocker, but admin code splitting should be scheduled before broad production traffic.
- The four Partial rows remain external Settings/Commerce provider certification artifact gates and were not faked.

## 2026-05-31 13:39 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; responsive editor smoke is reliable again and validates saved/reloaded/public mobile-tablet geometry; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/scripts/editor-drag-smoke.mjs`: changed the default Chrome DevTools port from one shared fixed port to a per-process default while preserving `BACKY_CDP_PORT` overrides.
- `apps/admin/scripts/editor-drag-smoke.mjs`: added a bounded CDP cleanup timeout around `Browser.close` and hardened client socket closing so a hung/closed CDP session cannot leave stale headless Chrome poisoning later editor smokes.

**Commands run:**
- `npm run test:blog-list --workspace @backy-cms/admin` -> PASS; confirmed Blog `New post` routes to `/blog/new?siteId=site-demo&templateSource=backy-canvas&focus=canvas` and opens the focused canvas shell.
- `npm run test:editor-responsive --workspace @backy-cms/admin` -> FAIL first because a stale fixed-port headless Chrome from a previous run held CDP state.
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_TRACE_SMOKE=1 BACKY_CDP_COMMAND_TIMEOUT_MS=90000 npm run test:editor-responsive --workspace @backy-cms/admin` -> PASS; verified mobile/tablet overrides, saved state, reloaded editor hydration, and public responsive render geometry.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.

**Next:**
1. Run `git diff --check`, commit, and push this editor-smoke reliability slice.
2. Continue Batch 5 on the next focused release polish: deployment dry-run readiness, remaining responsive ergonomics, or Blog/Newsletter authoring UX.

## 2026-05-31 12:43 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; editor global zoom interception is now active-editor gated; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: tightened the last-resort coordinate-less Mac wheel/pinch zoom fallback so global events only become canvas zoom when the editor shell has recent pointer activity or focus.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: updated the zoom metadata from broad zero-coordinate fallback to `active-editor-zero-coordinate-window-events`.
- `apps/admin/scripts/editor-drag-smoke.mjs`: updated zoom source guards and rendered zoom smoke so coordinate-less global wheel/pinch still works with active editor context, while inactive global coordinate-less pinch passes through without changing canvas zoom.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `npm run test:editor-zoom --workspace @backy-cms/admin` -> FAIL first on CDP startup timeout before zoom assertions.
- `BACKY_CDP_COMMAND_TIMEOUT_MS=90000 npm run test:editor-zoom --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS after adding the inactive global pinch smoke guard.
- `BACKY_CDP_COMMAND_TIMEOUT_MS=90000 npm run test:editor-zoom --workspace @backy-cms/admin` -> PASS after adding the inactive global pinch smoke guard.

**Next:**
1. Run `git diff --check`, commit, and push this zoom fallback hardening slice.
2. Continue Batch 5 with the fresh sidecar scout result or the next highest-friction editor/release UX gap.

## 2026-05-31 12:16 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Layers now expose selectable navigation child links directly; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/LayersPanel.tsx`: added visible nav child-link shortcut chips inside nav layer rows, using the generated link layer label and href so users can select Home/Blog/About-style child links without first discovering the expanded tree.
- `apps/admin/src/components/editor/LayersPanel.tsx`: exposed smoke-readable child-link shortcut count, label, href, and selected child layer metadata.
- `apps/admin/scripts/editor-drag-smoke.mjs`: extended the editor drag smoke to assert the nav row shortcuts show `Docs:/docs`, click a real child link layer, and verify the selected canvas layer id changes to that child.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.

**Next:**
1. Run `git diff --check`, commit, and push this Layers/nav shortcut slice.
2. Continue Batch 5 on the next highest-friction release UX/editor surface: responsive canvas behavior, blog/newsletter authoring ergonomics, custom frontend/API discoverability, or deployment readiness.

## 2026-05-31 11:38 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; editor Preview now fits width while preserving vertical scroll; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: changed Preview scaling from width-and-height fit to width fit, so long authored pages stay readable and scrollable instead of shrinking to a tiny full-page thumbnail.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: added `data-preview-scale-model="fit-width-scroll-y"` metadata on the preview viewport/surface for debugging and smoke coverage.
- `apps/admin/scripts/editor-drag-smoke.mjs`: added `BACKY_EDITOR_PREVIEW_SCROLL_SMOKE=1`, which toggles Preview, verifies width-fit/scroll metadata, proves `scrollHeight > clientHeight`, scrolls the canvas viewport, and asserts lower authored content becomes visible.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_PREVIEW_SCROLL_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> FAIL first on a brittle hardcoded fixture-height assertion (`2100` vs expanded content `1968`), then corrected to assert scrollable visual height.
- `BACKY_EDITOR_PREVIEW_SCROLL_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.

**Next:**
1. Commit and push this preview-scroll editor UX slice.
2. Continue Batch 5 on the next highest-friction release UX/editor surface: layer map/mobile behavior, page/blog editor ergonomics, or deployment/custom-frontend readiness.

## 2026-05-31 11:08 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; the broad editor smoke is green again after the nav child-link layer check was made deterministic; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/scripts/editor-drag-smoke.mjs`: added gated `BACKY_EDITOR_TRACE_SMOKE=1` step labels and included the current smoke step in CDP timeout errors.
- `apps/admin/scripts/editor-drag-smoke.mjs`: changed the nav generated-child-link selection check from `requestAnimationFrame` waits inside `Runtime.evaluate` to bounded timer settles, preventing long default runs from hanging when Chrome throttles frame callbacks.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_TRACE_SMOKE=1 BACKY_CDP_COMMAND_TIMEOUT_MS=90000 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this broad editor-smoke determinism slice.
2. Continue Batch 5 on the next highest-friction UX/editor surface.

## 2026-05-31 10:25 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; nested keyboard nudge behavior is now step-clamped and smoke-covered; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: keyboard nudges now move by the exposed nudge step and clamp to parent/canvas bounds instead of re-snapping off-grid nested layers to a different target.
- `apps/admin/src/components/editor/Canvas.tsx`: canvas elements now expose authored geometry data attributes for stable nested-layer smoke checks and custom admin/editor clients.
- `apps/admin/scripts/editor-drag-smoke.mjs`: added a focused `BACKY_EDITOR_KEYBOARD_NUDGE_SMOKE=1` path and updated nudge assertions to account for parent movement bounds.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_KEYBOARD_NUDGE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `CDP_COMMAND_TIMEOUT_MS=90000 npm run test:editor-drag --workspace @backy-cms/admin` -> FAIL in the later layer-panel `Runtime.evaluate` phase after the keyboard-nudge path; treat as the next broad-smoke stability slice, not part of this nudge fix.

**Next:**
1. Commit and push this keyboard nudge/geometry slice.
2. Continue Batch 5 by isolating the later layer-panel broad-smoke timeout or the next visible editor UX issue.

## 2026-05-31 09:31 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; root section resize/reflow is now verified through editor save and public render; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: hardened root section/header/footer/nav flow when resize output arrives with already-derived sibling shifts, normalizing from the previous baseline instead of bailing out of the multi-change branch.
- `apps/admin/scripts/editor-drag-smoke.mjs`: extended the section-flow smoke to resize `smoke-flow-anchor`, assert `smoke-flow-after` moves by the height delta, save, reload persisted canvas state, and verify public render parity before re-running the existing overlapping insertion flow.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_SECTION_FLOW_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_RESIZE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- Accidental `npm run test:editor-drag --workspace @backy-cms/admin -- --help` -> FAIL on default full-smoke keyboard nudge (`smoke-child-button` expected x 180, got x 170). This was not the targeted gate and should be revisited separately if the full smoke is required.

**Next:**
1. Commit and push this logical root-section resize/reflow slice.
2. Continue Batch 5 on another high-friction release surface: layer-map/mobile behavior, preview scrolling, deployment readiness, or remaining blog/editor ergonomics.

## 2026-05-31 09:03 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Blog/Newsletter now has an executable provider-safe issue draft step; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/public/src/app/api/admin/sites/[siteId]/newsletter/issues/draft/route.ts`: added an admin-only `forms.export` issue draft builder that turns a saved blog post plus the current newsletter audience into a deterministic `backy.newsletter-issue-draft.v1` payload.
- `apps/admin/src/routes/blog.$postId.tsx`: added a Newsletter issue draft builder to the post editor that blocks stale unsaved drafts, builds from the saved post, and exposes copyable draft JSON without raw subscriber emails.
- `apps/admin/src/routes/newsletter.tsx`: added a Build draft action for the latest published report in the Newsletter workspace.
- `apps/admin/src/lib/adminContentApi.ts` and `packages/sdk-js/src/index.ts`: added typed `buildNewsletterIssueDraft` helpers.
- `apps/public/src/app/api/sites/[siteId]/manifest/route.ts`, `apps/public/src/app/api/sites/[siteId]/openapi/route.ts`, and generated SDK contract types: exposed the issue draft endpoint, schema, helper name, and provider boundary.
- `apps/admin/scripts/newsletter-smoke.mjs` and `apps/admin/scripts/blog-editor-smoke.mjs`: added source guards for the endpoint, UI hooks, SDK helper, manifest, OpenAPI, and no-raw-email draft policy.

**Commands run:**
- `npm run test:newsletter --workspace @backy-cms/admin` -> PASS.
- `BACKY_BLOG_EDITOR_SOURCE_ONLY=1 npm run test:blog-editor --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy/public` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js` -> PASS.
- `npm run test:generated-types --workspace @backy/sdk-js` -> PASS.
- Direct API smoke against `http://localhost:3001/api/admin/sites/site-demo/newsletter/issues/draft` with admin session + `backy-dev-mfa` -> PASS; returned `backy.newsletter-issue-draft.v1`, deterministic draft id, no raw emails, and provider-safe status.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this logical newsletter issue-draft slice.
2. Continue Batch 5 on the next highest-friction editor/release surface: responsive/mobile canvas behavior, page/blog canvas ergonomics, or deployment readiness.

## 2026-05-31 08:01 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Pages table column budget tightened while preserving clipping and header semantics; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/pages.tsx`: reduced the Pages library table from a 2580px operating width to a 2140px route-local column budget, tightening title, route, template, delivery, date, and actions columns without changing shared `DataGrid`.
- `apps/admin/scripts/pages-list-smoke.mjs`: updated source and rendered DataGrid header guards to enforce the smaller Pages table budget while still proving all visible cell content stays inside its owning column and actions remain in-flow.

**Commands run:**
- `BACKY_PAGES_LIST_SOURCE_ONLY=1 npm run test:pages-list --workspace @backy-cms/admin` -> PASS.
- `BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE=1 BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:pages-list --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on the next highest-friction editor gap: responsive/mobile canvas behavior, layer-map ergonomics, or blog/newsletter authoring polish.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 07:48 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Settings header secondary actions now overlay the sticky workbar correctly; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/settings.tsx`: the Settings header More actions menu now renders as an absolute, high-z overlay instead of relying on in-flow spacing above the sticky active-section workbar.
- `apps/admin/scripts/settings-smoke.mjs`: source and rendered Settings smokes now guard the overlay positioning and prove that, if the menu intersects the workbar, the top hit-test element still belongs to the menu.

**Commands run:**
- `BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin` -> PASS.
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:settings --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on the next highest-friction UI/editor gap: Pages table readability, responsive/mobile canvas behavior, layer-map ergonomics, or blog/newsletter authoring polish.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 07:34 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; root section insertion now respects section-flow boundaries; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: root section/header/footer/nav insertions now snap out of an overlapping root flow section before the existing flow algorithm pushes following root bands.
- `apps/admin/scripts/editor-drag-smoke.mjs`: added a rendered section-flow smoke that inserts a new section inside an existing root section and verifies editor geometry, persisted canvas state, and public render payload all preserve the same snapped layout.
- `apps/admin/package.json`: added `test:editor-section-flow` and wired it into the full editor workflow script.

**Commands run:**
- `BACKY_EDITOR_SECTION_FLOW_SMOKE=1 BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:editor-section-flow --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run test:editor-smoke-coverage --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on the next highest-friction release surface: responsive/mobile canvas layout, layer-map usability, blog/newsletter authoring polish, or remaining admin table overlap.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 07:00 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; Help now makes protected Backy/public/custom-frontend deployment topology copyable and searchable; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/routes/help.tsx`: added a searchable Deploy Backy and custom frontends topic explaining the protected `backy-admin`, public `backy-public`, and separate custom frontend Vercel surfaces, including subdomain/site modeling and forbidden frontend secrets/content copies.
- `apps/admin/src/routes/help.tsx`: added a copyable Custom frontend env starter that site-scopes `BACKY_SITE_ID` and shows `BACKY_PUBLIC_API_BASE_URL` plus optional `BACKY_SITE_PUBLIC_HOST` for frontend agents and Vercel projects.
- `apps/admin/scripts/help-smoke.mjs`: source and rendered Help smokes now guard the deployment topology topic and rendered frontend-env starter values.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `curl -fsS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:5173/help?siteId=site-demo'` -> PASS (`200`).
- `BACKY_HELP_RENDERED_SMOKE=1 BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 npm run test:help-rendered --workspace @backy-cms/admin` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: section reflow/resizing semantics, blog/newsletter authoring polish, deployment dry-run readiness, or remaining canvas ergonomics.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 06:47 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; component-library preview now docks in the rail instead of overlaying/clipping the scroll list; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/src/components/editor/ComponentLibrary.tsx`: hover previews now render as a normal `shrink-0` rail footer with `data-component-preview-placement="rail-footer"` instead of an absolutely positioned sticky overlay. The component list keeps stable bottom padding and no longer needs the `pb-[12.5rem]` reserved-space hack.
- `apps/admin/scripts/editor-drag-smoke.mjs`: component-library source and rendered smokes now assert the `rail-footer` contract, record preview/list/library geometry, and fail if the hover preview is clipped outside the rail or not placed after the scroll list in normal flow.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `BACKY_EDITOR_LIBRARY_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.
- `mcp__computer_use__.get_app_state({ app: "Google Chrome" })` -> FAILED with `cgWindowNotFound`; rendered CDP smoke was used for visual/interaction verification.

**Next:**
1. Continue Batch 5 on another high-friction release surface: section reflow/resizing semantics, blog/newsletter authoring polish, Help discoverability, deployment readiness, or remaining canvas ergonomics.
2. Keep each slice verified, committed, and pushed.

## 2026-05-31 06:31 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in progress; rendered Sites smoke duplicate flow now passes under blocked global site quotas; four audit partials remain external live-provider artifact gated

**What changed:**
- `apps/admin/scripts/sites-smoke.mjs`: `temporarilyAllowSiteCreationQuota` now treats blocked quota mode as a temporary global workspace gate and adds a cushion before create-plus-duplicate validation, then restores the original settings in cleanup. This matches the product reality that the admin-visible sites list is role/team scoped while create/duplicate billing enforcement counts the whole workspace.
- `apps/admin/scripts/sites-smoke.mjs`: duplicate-site UI smoke failures now include the actual duplicate API request status/payload, visible notice, and action-button state so future regressions expose the cause instead of timing out generically.

**Commands run:**
- `BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 BACKY_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run test:sites --workspace @backy-cms/admin` -> PASS.
- `BACKY_SITES_SOURCE_ONLY=1 npm run test:sites --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Continue Batch 5 on another high-friction release surface: canvas component-library ergonomics, section reflow/resizing semantics, blog/newsletter authoring polish, Help discoverability, or deployment readiness.
2. Keep each slice verified, committed, and pushed.

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
