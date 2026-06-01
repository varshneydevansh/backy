# READ THIS FILE FIRST AFTER ANY COMPACTION OR RESTART

This is the Elves survival guide for the Backy release parity run. Trust this file over chat memory after compaction. Read order: this file -> `.elves-session.json` -> `docs/elves/learnings.md` -> `docs/elves/backy-release-plan.md` -> `docs/elves/execution-log.md` -> `AGENTS.md` -> `DESIGN.md`.

## Mission

Continue completing Backy as a secure Wix/Webflow-like backend with WordPress-like ease and a Canva-like visual editor. The remaining audit partials are external live Settings/Commerce provider certification artifacts; local product work should now harden admin UX, canvas/editor fidelity, custom frontend handoff, newsletter/subscriber management, and release verification.

## Run Control

- **Run mode:** open-ended
- **Stop policy:** explicit-user-stop or genuine blocker only
- **User intent:** "please keep pursue it and complete the work" plus repeated instructions to keep going, use subagents/skills, commit logical slices, and prepare for release in about 3 days.
- **Checkpoint due by:** none
- **Checkpoint semantics:** delivery target only
- **May continue after checkpoint:** yes
- **Actual stop conditions:** stop only if the user explicitly stops/pauses, or a true blocker leaves no viable workaround.
- **Final-response policy:** disallowed while planned batches remain unless the user asks for status or handoff.
- **Batch completion rule:** Every completed batch ends with execution log update, survival guide update, commit, and push attempt when safe.
- **Re-read rule:** After every commit/push, re-read this file before choosing the next task.
- **Continuation rule:** If work remains and stop conditions are not met, continue without waiting for user acknowledgment.

## Session Budget

- **Started:** 2026-05-30 23:52 IST
- **User returns:** open-ended
- **Checkpoint expectation:** steadily close release UX/editor gaps, keep commits logical, and keep the release doctor green.
- **Time budget:** unlimited until user stop
- **Average batch time so far:** not enough data
- **Batches remaining:** 1 of 5

## Stop Gate

- **Planned batches remaining:** 1
- **Stop allowed right now:** no
- **Why:** The user asked to keep pursuing Backy completion and the ongoing UX scout/polish batch remains.
- **Next required action:** Continue Batch 5: Ongoing UX Scout And Polish.

## Effort Standard

- Work hard through implementation, validation, review, and documentation.
- Do not stop at a shallow pass when visible UI/editor defects remain.
- Prefer root-cause fixes, existing Backy primitives, and focused verified commits.
- When a batch completes, move to the next highest-value release gap.

## Forbidden Stop Reasons

- A commit succeeded.
- Tests are green for one slice.
- The four provider partials are external.
- A subagent result arrived.
- The user is silent.
- A summary would be useful.

## Memory Surfaces

- **Plan:** `docs/elves/backy-release-plan.md`
- **Survival guide:** `docs/elves/survival-guide.md`
- **Learnings:** `docs/elves/learnings.md`
- **Execution log:** `docs/elves/execution-log.md`
- **Repo standing rules:** `AGENTS.md`, `DESIGN.md`

## Non-Negotiables

- Never fake live provider certification evidence for the four remaining partials.
- Never expose provider secrets in public manifest/OpenAPI/handoff payloads.
- Preserve canvas/content design metadata and custom frontend editable maps.
- Do not revert unrelated user or prior-agent changes.
- Do not use destructive git commands.
- Do not weaken tests to pass.
- Never merge; the user controls release and merge.

## Launch Readiness

- [x] Plan cleaned and saved to disk
- [x] Survival guide updated from the current plan
- [x] Learnings file initialized
- [x] Execution log initialized with batch breakdown and preflight notes
- [x] Branch confirmed: `main` is currently the local release integration branch
- [ ] PR opened or existing PR recorded
- [x] Preflight run and critical failures checked
- [x] Run mode, return time, and non-negotiables recorded
- [x] Stop Gate initialized with `Stop allowed right now: no`
- [x] Launch prompt prepared in execution log

PR is not opened yet because this workspace is already carrying local release commits on `main`, while origin `main` is behind. Use a branch/PR once push strategy is confirmed or when converting the release stack into a PR is safer than direct main push.

## Current Phase

**Status:** In progress

**Active batch:** Batch 5: Ongoing UX Scout And Polish

**What was just finished:** Batch 5 has completed several pushed polish checkpoints while staying open-ended: component drag previews no longer leak the component rail into the canvas, the component-library hover preview is now a docked rail footer instead of a clipped absolute overlay, Inspector/Layers affordances are clearer, Pages/Users/Settings dense layout overlap was reduced, public custom-domain discovery/hosted resolution now requires verified DNS state by default, Help explains verified domain/subdomain routing, the Layers map now exposes nav child-link counts and link href metadata, editor preview mode now keeps zoom canvas-scoped instead of letting Mac pinch/Cmd-scroll zoom the whole browser page, Inspector/property-panel edits to root section/header/footer/nav geometry now reuse root-section flow so following sections are pushed consistently, root section/header/footer/nav resize frames now normalize derived sibling shifts and verify editor-save/public-render parity, Help now exposes the exact copyable component API contract pointer for frontend agents, Blog editor posts now expose a provider-safe Newsletter issue handoff with send-ready subscriber sync and external delivery boundary metadata, Newsletter/Blog now have an admin-only provider-safe issue draft builder that returns `backy.newsletter-issue-draft.v1` payloads without raw subscriber emails or provider secrets, navigation layer rows now distinguish selectable child link layers from props-only nav items with visible expand/edit hints and searchable label/href metadata, the sidebar active-site selector is now visibly labelled as a no-signout Site switcher with Help guidance, the editor viewport toolbar now clearly labels tablet/mobile inheritance versus local responsive override layer counts, the Sites/New Site handoff surfaces now expose `/agent-handoff`, host-aware resolve/render, subdomain examples, and frontend env variables, the rendered Sites smoke now handles global billing quota limits correctly when validating create plus duplicate, Help now has guarded deployment topology guidance plus a copyable custom-frontend env starter for protected `backy-admin`, public `backy-public`, and separate website frontend projects, root section/header/footer/nav insertion now snaps out of overlapping flow sections with editor/persisted/public render smoke coverage, the Settings More actions menu now overlays the sticky active-section workbar with rendered stacking coverage, the Pages library table now uses a tighter 2140px column budget with rendered cell-fit coverage, nested keyboard nudges now expose step-clamped behavior with parent-bound smoke coverage, the full editor drag smoke is green again after deterministic nav child-link layer settling, Preview now fits width while preserving vertical page scroll with rendered smoke coverage proving lower authored content is reachable, Layers nav rows now show direct child-link shortcut chips that select real child link layers, Mac coordinate-less global zoom is now gated to active editor pointer/focus context with inactive global gestures passing through, editor CDP smokes now use isolated default debug ports plus bounded cleanup so responsive validation is not poisoned by stale headless Chrome, the public `/agent-handoff`/manifest/OpenAPI contract now includes a machine-readable `backy.deployment-topology.v1` block for protected `backy-admin`, public `backy-public`, separate custom frontend projects, required/forbidden env, verified-domain policy, and release smoke commands, the repo now has a non-mutating `npm run test:vercel-preview-readiness` gate that distinguishes source readiness from pending Vercel project linkage, in-app Help now mirrors that preview-readiness/Vercel Agent guidance with rendered copy-button smoke coverage, `.env.example` now separates `backy-public`, protected `backy-admin`, and custom website frontend env boundaries, editor Layers/Inspector bulk selection now exposes sibling/mixed-scope status with runnable smoke coverage, the shared sidebar/header site switcher now exposes direct Domains/subdomains shortcuts with site-scoped rendered smoke coverage, global admin search now exposes Custom frontend handoff and Component API contract Tool results with rendered login-smoke coverage, the component library now has a persistent Page sections starter shelf with quick-add section presets covered by rendered editor-library smoke, Inspector now exposes selected-layer properties, layer tree, and quick-actions purpose metadata across toolbar/context/panel chrome with rendered shortcut smoke coverage, Layers now expose breakpoint-specific override/inheritance badges plus an Overrides scope so mobile/tablet local edits are visible in the layer map, the admin Vercel build now uses TanStack Router route-level code splitting so every admin route is no longer bundled into the initial shell, repo-root source previews for `backy-public` and `backy-admin` are now deployable on Vercel with verified protected-preview API/admin behavior, production promotion now has a live public-domain contract gate, stale Backy Vercel aliases have been removed, tracked public-repo files now have a hygiene guard for local paths, personal identifiers, generated Vercel URLs/ids, and optional private markers, the current Vercel preview runtime failure has been diagnosed to missing `backy-public` data-mode env, fixed for preview with preview-only demo env, and reverified through public handoff/manifest/OpenAPI/render plus admin `/login`, `backy-admin` production now has persistent non-secret Vite API base URL env and a redeployed shell while `backy-public` production remains blocked on real database/admin/cron/CORS env, `backy-public` production builds now run a value-redacted env guard before Next.js so missing production env fails the build instead of shipping a false-ready runtime crash, the public root now labels itself as the public API/render runtime with a documented secure-admin setup path for provider-backed auth, MFA, protected admin access, and server-only env boundaries, the Vercel project-domain routing bug has been fixed in source so `*.vercel.app` control hosts are no longer rewritten into tenant site routes while admin auth network errors now explain the configured Vercel API boundary, production Supabase is now provisioned/migrated with Vercel `POSTGRES_URL` alias support plus a one-time server-token owner bootstrap path while production demo credentials are hidden from the hosted admin shell and admin production source maps are opt-in only, the `backy-public` Vercel database runtime packaging path now bundles Backy workspace packages with traceable imports while keeping only unused optional DB drivers lazy/external, production owner bootstrap now succeeds through hardened Supabase Auth profile triggers with the bootstrap token removed and the live public handoff/manifest/OpenAPI/render gate green against a database-backed site, database-backed admin login/session/logout now persist sessions through Supabase `platform_settings.auth` instead of immutable Vercel local files, the deployed production owner login/session/logout plus live contract gate are green with no Vercel error logs, code snippet blocks now share a syntax-highlighting contract across admin canvas, public renderer, Inspector controls, and smoke-tested persisted metadata, marquee selection anchor reprojection now stays unclamped so layout/scroll shifts cannot collapse the drag rectangle to the canvas top-left, and page creation now surfaces backend `BILLING_PAGE_LIMIT` blockers while its full smoke raises/restores the local quota fixture deterministically.

**Latest add-on:** Production readiness now has an optional credential-redacted live admin login/session/logout proof, and the requested Gmail owner is verified active in production Supabase.

**Newest contract polish:** OpenAPI now documents `domain`, `host`, and `x-forwarded-host` on public resolve/render operations so host-aware custom frontend routing is visible outside the `x-backy-*` extension.

**Newest verification polish:** The live production readiness check now handles canonical database site ids in OpenAPI path keys when the requested site identifier is an alias such as `site-demo`.

**Newest production auth polish:** Unauthenticated admin password recovery now reports `local-outbox` as `not_configured`, keeps known/unknown envelopes identical, and skips unreachable reset-token creation unless external email delivery or explicit local recovery exposure is configured.

**Newest production discovery polish:** The live production readiness gate now proves `GET /api/sites?identifier=<site>` and `GET /api/sites?limit=1` on the final public domain before site-scoped handoff/manifest/OpenAPI/render checks, so Supabase-backed public bootstrap discovery is part of release proof.

**Newest hosted admin polish:** The login smoke now has a `BACKY_LOGIN_PRODUCTION_SHELL_SMOKE=1` mode plus `test:login-production-shell` script that proves hosted `backy-admin` renders credential-manager login controls without demo credentials or the dev MFA phrase.

**Newest production recovery polish:** Forgot Password now explicitly says no recovery email was sent when production is on `local-outbox`/no transactional provider, while keeping the neutral anti-enumeration envelope and documenting Supabase owner-assisted reset as the immediate access path.

**Newest deploy verification:** `d8f56617` and `a188a7b6` are pushed. `backy-public` and `backy-admin` production deployments are Ready, live production readiness and hosted login-shell smokes pass, the deployed recovery endpoint reports no email sent/local-outbox not configured, and recent Vercel error logs are empty.

**Newest Users auth UX polish:** The Users command center now explains the hosted identity-provider boundary: production login validates Supabase/Auth credentials first, Backy stores role/status/invite state, and `admin_user_credentials` rows are not the hosted access path.

**Newest shell UX polish:** The expanded sidebar brand/site switcher now reserves a 120px stacked header for Backy, Manage, Site select, Domains, and Help, with dashboard smoke coverage proving it does not clip into quick-create controls.

**Newest deploy verification:** `7071d8de` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest auth hardening:** Supabase/Auth-created identities now default to invited/inactive Backy profiles in `supabase/migrations/014_invite_only_auth_profile_defaults.sql`; production Supabase has had the trigger applied and verified. Existing active owners/admins are unchanged.

**Newest deploy verification:** `efe19571` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, the production Supabase trigger still verifies hardened, and recent Vercel error logs are empty.

**Newest Help polish:** Help now explains role-aware admin UI filtering: Backy combines signed-in profile role, profile status/invite state, and the backend permission matrix to decide visible/enabled navigation, quick-create actions, dashboard shortcuts, Settings, and Users controls.

**Newest header role polish:** The account menu now shows the active Backy role and permission source, and its Settings shortcut is blocked with a clear reason when the signed-in role/permission matrix lacks `settings.view`.

**Newest deploy verification:** `8ac88c33` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Single next action:** Continue Batch 5 with the next visible admin/editor friction point.

## Active Compute

No active paid or long-running compute recorded by this guide. Local dev servers may exist in the user's browser/session; inspect terminal/processes before starting duplicates.

## Next Exact Batch

**Batch:** 5: Ongoing UX Scout And Polish

**Scope:**
- Re-check the remaining highest-friction admin/editor surfaces the user called out: responsive preview behavior, layer-map/mobile behavior, site switching/domain/subdomain help, newsletter/blog authoring flows, shared chrome semantics, and custom frontend/APIability discoverability.
- Prefer small, root-cause fixes with existing Backy primitives and smoke coverage.
- Keep custom frontend/APIability, design metadata persistence, and release doctor behavior intact.
- Use rendered smokes when the defect is visual or interaction-based; use source guards for handoff/contract-only changes.

**Acceptance criteria:**
- `npm run typecheck --workspace @backy-cms/admin` passes.
- Relevant focused route/editor smoke passes.
- `git diff --check` passes.
- Changes are committed as a logical UX/polish slice and Elves docs are updated.

**Known files to inspect first:**
- `apps/admin/src/components/editor/Canvas.tsx`
- `apps/admin/src/components/editor/CanvasEditor.tsx`
- `apps/admin/src/components/editor/ComponentLibrary.tsx`
- `apps/admin/src/components/editor/LayerPanel.tsx`
- `apps/admin/src/routes/pages.tsx`
- `apps/admin/src/routes/blog.tsx`
- `apps/admin/src/routes/help.tsx`
- `apps/admin/src/routes/sites.$siteId.tsx`
- route smoke scripts under `apps/admin/scripts/`
