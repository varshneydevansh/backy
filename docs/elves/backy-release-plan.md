# Plan: Backy Release Parity Hardening

## Mission

Bring Backy from the current 41 Ready / 4 Partial audit state into a coherent, releaseable product experience for secure multi-site website backends, custom frontend handoff, and Canva/Wix-style page editing. The remaining audit partials are external live Settings/Commerce provider certification artifacts; product work during this run should focus on the admin UX, canvas editor reliability, custom frontend discoverability, and release verification around those known external gates.

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
- [ ] Make the sidebar active-site identity actionable so users can manage/switch sites from the left rail without signing out.
- [ ] Fix dense `/pages` row overlap/clipping around delivery health, revisions, route, status, and row actions.
- [ ] Tighten `/users` table wrapping and spacing so role/status controls and actions do not collide.
- [ ] Make Settings `More actions` render in a stable in-flow or collision-safe surface instead of hiding behind the Appearance/workbar area.

**Acceptance criteria:**
- [ ] Pages, Users, and Settings source/render smokes cover the non-overlap conditions.
- [ ] `npm run typecheck --workspace @backy-cms/admin` passes.
- [ ] `git diff --check` passes.

**Docs likely touched:**
- `docs/elves/*`
- Focused smoke scripts if source guards need to record the fixed layout contract.

**Risk:** Medium. `DataGrid` is shared, so any overflow fix must be opt-in or narrowly scoped to avoid regressing other admin tables.

### Batch 2: Canvas Editor Interaction Fidelity

**Tasks:**
- [ ] Verify and harden marquee selection origin so drag rectangles start at the pointer, not the canvas top-left.
- [ ] Verify Mac trackpad/mouse in-canvas zoom intercepts canvas gestures without browser/page zoom.
- [ ] Fix component drag preview so the source palette does not visibly smear or stack into the canvas.
- [ ] Ensure preview/editor scroll behavior works in desktop/tablet/mobile canvas modes.
- [ ] Make navigation child links selectable/linkable as layer items when a nav block is generated or imported.

**Acceptance criteria:**
- [ ] Focused editor drag/zoom/component/layers smokes pass.
- [ ] Canvas changes preserve existing element geometry, responsive overrides, and save/publish behavior.
- [ ] Public renderer remains aligned for any canvas contract change.

**Docs likely touched:**
- Smoke scripts and, if a durable rule is discovered, `docs/elves/learnings.md`.

**Risk:** High. Canvas event handling, pointer capture, transform math, and nested selection are tightly coupled.

### Batch 3: Custom Frontend And Newsletter Handoff Readiness

**Tasks:**
- [ ] Ensure Help, Site Detail, and Editor composition handoff clearly show where AI/frontend agents read Backy APIs.
- [ ] Confirm every component/element remains API-addressable through manifest/OpenAPI/SDK/render payloads with properties, bindings, design tokens, fonts, media, animations, and editable maps preserved.
- [ ] Make newsletter subscriber management and provider-safe sync/export handoff discoverable for publishing/journalism workflows.

**Acceptance criteria:**
- [ ] Help/site/newsletter smokes cover copyable handoff blocks and site-scoped URLs.
- [ ] Generated SDK contract type checks pass when public contract changes.
- [ ] Handoff docs do not expose secrets or admin-only payloads in public endpoints.

**Docs likely touched:**
- `AGENTS.md`
- `specs/custom-frontend-agent-handoff.md`
- `specs/backy-api-contracts.md`
- `docs/elves/learnings.md`

**Risk:** Medium. Contract changes must remain backward compatible for custom frontend builders.

### Batch 4: Release Certification And Vercel Readiness

**Tasks:**
- [ ] Keep `npm run doctor:release-certification` green in default no-artifact mode.
- [ ] Keep provider artifact admission commands documented and machine-readable for Settings and Commerce.
- [ ] Confirm git history no longer contains the previously blocked Stripe sentinel commits and push protection stays clean.
- [ ] Keep Vercel protected deployment topology documented for Backy admin/public and custom frontend deployments.

**Acceptance criteria:**
- [ ] Release certification doctor passes.
- [ ] Secret scans/contract smokes avoid raw provider-looking keys.
- [ ] Vercel deployment docs identify backend/admin topology, frontend deployment separation, and domain/subdomain routing expectations.

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
