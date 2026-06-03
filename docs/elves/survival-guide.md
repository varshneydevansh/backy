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
- **Next required action:** Continue highest-friction Backy UX/editor polish after the release plan was reconciled with current guards. Do not spend the next slice re-solving Batch 1 sidebar/Pages/Users/Settings overlap rows unless a fresh rendered regression appears. Focus on editor command execution invariants, long-page authoring, and custom-frontend blog-template polish. Vercel GitHub App access for the private separate frontend repository is now an automation convenience rather than the current release blocker; attach the public website domain only when ready to move DNS.

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

**Newest domain/subdomain polish:** Same-site verified hosts are now modeled as `site.settings.domainAliases`, exposed through admin Site settings, public host matching, manifest/OpenAPI/SDK/agent-handoff delivery metadata, and Site Detail handoff copy. Use aliases for multiple verified hosts on the same site; create separate Backy sites when subdomains need independent content, navigation, SEO, or design tokens.

**Newest deploy verification:** `20ba4a8b` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest custom frontend proof:** The separate `devanshvarshney-frontend` project is updated at commit `7d6294d`, redeployed on its stable production alias, and the strict live Backy custom-frontend connection gate passes 112 checks with live API, deployed DOM, and `/api/backy-connection` probe requirements enabled.

**Newest admin shell coverage:** The rendered Sites smoke now verifies the shared blank-space/overflow contract across Dashboard, Pages, Users, and Settings in addition to `/sites/new`: document/body stay locked, the main pane owns route overflow, ordinary content remains contained, and the operational footer stays inside the main pane. The full rendered `test:sites` smoke is green with the dev MFA verifier configured.

**Newest editor/APIability polish:** The selected-layer Inspector now exposes a copyable `backy.editor-selected-component-api-contract.v1` Element API payload with selected element id/type, props, styles, responsive overrides, tokens, media asset ids, motion, bindings, child summaries, and the canonical `agent-handoff.componentApiContract.componentTypeContracts` plus `render.data.content.elements[]` pointers. Source and rendered Inspector smokes are green.

**Newest deploy verification:** `732a7ed1` and `a0f84af7` are pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest dashboard authority polish:** Dashboard RBAC now exposes an Account authority panel with signed-in role/source, active owner/admin/user counts, access state, and direct Users/Settings review actions, so Supabase/Auth identity state and Backy role-gated admin controls are visible from the cockpit.

**Newest deploy verification:** `8819f704` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest Users authority polish:** Users now exposes a Workspace authority panel with signed-in role/status, active owner/admin/user counts, invited owner count, active-owner/admin filters, owner-continuity readiness, and non-PII handoff metadata so account changes happen with production owner safety visible.

**Newest deploy verification:** `2b8486c0` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest newsletter subscriber polish:** Newsletter now exposes All, Send-ready, Held, and Unsubscribed audience views with canonical readiness counts, search over subscriber/topic/source/form metadata, visible-count machine metadata, and CSV export scoped to the current visible audience.

**Newest admin shell polish:** Authenticated admin routes now lock `html`/`body`/`#root` document scrolling, reset leaked browser scroll on route changes, and render an ordinary-route operational footer inside the main pane. `/sites/new` smoke coverage proves the browser window cannot scroll into blank body space while the main pane owns long-route overflow. Global search also refreshes its latest request key on each active-site load so site switching cannot leave search stuck in `loading`.

**Newest deploy verification:** `d32950b7` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest global route containment polish:** Ordinary admin pages now share a `MainLayout`/`PageShell`/`Panel`/`DataGrid` containment contract so Dashboard, Pages, Users, Settings, and New Site keep browser scroll pinned, body/root locked to the viewport, horizontal document overflow at zero, and long content scrolling inside the admin main pane.

**Newest deploy verification:** `2cca0970` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest all-route verification polish:** The login smoke now verifies ordinary route containment across Dashboard, Sites, Site Detail, New Site, Pages, New Page, Blog, Media, Collections, Reusable Sections, Forms, Contacts, Comments, Newsletter, Products, Orders, Users, New User, User Detail, Teams, Settings, and Help, while preserving editor routes on their separate unframed canvas contract.

**Newest compact editor shell polish:** The editor shell now detects compact widths and auto-collapses Components/Inspector/Layers into overlay panels instead of docking fixed side rails beside the canvas. Responsive smoke proves compact auto-collapse, overlay Components/Layers open/close, canvas width preservation while overlays are open, and docked panel restoration on desktop; preview-scroll remains green.

**Newest custom frontend launch polish:** Site Detail now exposes a copyable `backy.custom-frontend-project-launch.v1` block that tells owners and frontend agents to attach the public website domain to the separate custom frontend Vercel project, use `backy-public` as the API/render origin, keep `backy-admin` protected, copy only public/read env values, and keep Supabase/database/provider/admin secrets out of the frontend. Site Detail smoke, typecheck, diff check, and repo-public hygiene are green.

**Newest custom frontend env polish:** Public `/agent-handoff`, manifest schema, SDK generated contract types, Help, and AGENTS now distinguish browser-safe `NEXT_PUBLIC_BACKY_*` env from server-side `BACKY_*` env for separate custom website frontend projects, while naming the custom frontend Vercel project as the public-domain owner and keeping server/provider/admin secrets forbidden.

**Newest Sites handoff polish:** Sites and New Site now mirror the same env boundary in their visible handoff panels: browser-safe `NEXT_PUBLIC_BACKY_*` for custom website client bundles, server-side `BACKY_*` for loaders only, and `custom-frontend-vercel-project` as the public-domain owner.

**Newest Dashboard launch polish:** Dashboard API consumer readiness now includes a first-class `backy.dashboard-custom-frontend-launch.v1` panel with browser-safe env, server-loader env, public host, agent-handoff read start, and a Sites handoff shortcut so owners can start a separate Vercel website project from the cockpit.

**Newest deploy verification:** `331ebd18` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and recent Vercel error logs are empty.

**Newest custom frontend alias polish:** Site identity now has shared host helpers for `customDomain`, `settings.domainVerification.domain`, `settings.domainAliases[].host`, and managed `{slug}.backy.app` hosts. Header, Sidebar, Dashboard, and Sites use those helpers so custom domains/subdomains are selectable, visible, searchable, exported, and copied into browser-safe/server-side custom frontend env handoffs consistently.

**Newest deploy verification:** `dd5a9ef5` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, and the hosted admin login shell still exposes no demo credentials or dev MFA phrase.

**Newest Blog verification polish:** The rendered Blog list smoke has been re-run successfully and its API helper now retries only idempotent GET requests on short local network resets, keeping taxonomy/post mutations single-attempt while reducing false-negative `fetch failed` failures.

**Newest custom frontend Help polish:** Help now has a dedicated separate-custom-frontend connection checklist with copyable browser-safe `NEXT_PUBLIC_BACKY_*` env, optional server-loader `BACKY_*` env, host-aware agent-handoff/manifest/OpenAPI/resolve/render read order, and explicit Supabase/database/provider/admin/session/bootstrap/cron forbidden-secret boundaries. Source and rendered Help smokes are green.

**Newest custom frontend SDK polish:** `@backy/sdk-js` now has `resolveBackyCustomFrontendConfig`, `createBackyCustomFrontendClient`, and `createBackyCustomFrontendClientFromEnv` so separate website projects can bootstrap directly from safe `NEXT_PUBLIC_BACKY_*` or server-loader `BACKY_*` env. The SDK accepts public API bases ending in `/api`, exposes `getApiBaseUrl()`, carries `sitePublicHost`, and sends the host as `domain` for `resolve()`, `render()`, and `renderCached()` unless a per-call `domain`/`host` override is provided. Public handoff metadata, Help, AGENTS, and the custom frontend spec advertise these helpers and keep database/Supabase/provider/admin/session/bootstrap/cron/SMTP secrets forbidden.

**Newest verification:** Core typecheck, SDK typecheck/build, admin typecheck, Help source/rendered smokes, read-only SDK smoke with local dev MFA, diff check, and repo-public hygiene are green for the SDK bootstrap slice.

**Newest deploy verification:** `8e6fd479` is pushed. The latest `backy-public` and `backy-admin` production deployments are Ready, live public readiness and hosted login-shell smokes pass, deployed `/api/sites/site-demo/agent-handoff` exposes the new SDK bootstrap helpers, and recent Vercel error logs are empty.

**Newest custom frontend starter polish:** `examples/custom-frontend-next` now gives frontend agents a checked Next.js launch shape for separate website projects: safe `NEXT_PUBLIC_BACKY_*` / server-loader `BACKY_*` env bootstrap, host-aware `render()` calls through `createBackyCustomFrontendClient`, API-addressable `data-backy-element-id` and `data-backy-element-type` attributes, newsletter signup, and public form submission. `npm run test:custom-frontend-starter` guards the starter against admin-boundary calls and private env drift.

**Newest verification:** Starter source smoke, starter TypeScript smoke, SDK typecheck, diff check, and repo-public hygiene are green for the custom frontend starter slice.

**Newest installability polish:** `@backy/sdk-js` is not currently published on npm (`npm view @backy/sdk-js` returns `E404`), so the Next.js starter now vendors a tiny public Backy client in `examples/custom-frontend-next/src/lib/backy-client.ts` instead of depending on the unpublished package. The starter keeps the same safe env/bootstrap shape, host-aware render behavior, newsletter signup, and form submission boundary, while the full monorepo SDK remains packable for later publication.

**Newest verification:** SDK npm lookup confirms the package is unpublished, local SDK dry-run pack is green, self-contained starter source/type smoke is green, SDK typecheck is green, and repo-public hygiene is green.

**Newest custom frontend DOM contract polish:** The self-contained Next.js starter now preserves richer per-element APIability metadata in rendered DOM: component-contract pointers, prop/style key lists, responsive breakpoint names, token ref keys, asset ids, action/binding counts, animation type, accessibility label, editable-map count, and the canonical editable-map pointer. Frontend agents can replace the starter renderer with a custom design system while preserving Backy control over each element.

**Newest verification:** Starter source/type smoke, admin typecheck, diff check, and repo-public hygiene are green for the richer custom frontend DOM contract slice.

**Newest custom frontend connection gate:** `npm run test:custom-frontend-connection` now proves the separate website connection path. Source mode checks contracts/docs/schemas; live API mode validates site discovery, agent handoff, manifest, OpenAPI, resolve, render, deployment topology, and component APIability; deployed frontend mode can require `data-backy-site-id`, `data-backy-route`, `data-backy-element-id`, `data-backy-element-type`, `data-backy-component-contract-pointer`, and `data-backy-editable-map-pointer` on the custom frontend DOM.

**Newest verification:** Source connection smoke, local live public API connection smoke against `http://127.0.0.1:3001/api`, Help source/rendered smokes, admin typecheck, SDK typecheck, frontend contract type generation, custom frontend starter smoke, and diff check are green for the connection gate slice. Production live proof must wait until this slice is pushed and Vercel redeploys.

**Newest deploy verification:** `7ea5c3aa` is pushed. Latest `backy-public` and `backy-admin` production deployments are Ready, the new live custom frontend connection gate passes 38 checks against `https://backy-public.vercel.app/api`, production readiness passes, hosted login-shell smoke passes, and recent Vercel error logs are empty.

**Newest custom frontend self-probe polish:** `examples/custom-frontend-next` now exposes `GET /api/backy-connection` with schema `backy.custom-frontend-connection.v1`. The endpoint returns only public configuration and booleans: Backy API base, site id, public host, manifest reachability, required DOM control attributes, and forbidden private env names present by name only, with `includesSecretValues: false`.

**Newest custom frontend admin verifier polish:** Site Detail now exposes a protected `backy.admin-custom-frontend-connection-check.v1` verifier for deployed separate frontends. It posts to `/api/admin/sites/:siteId/custom-frontend/connection`, rejects local/private/reserved frontend hosts, checks `/api/backy-connection`, required `data-backy-*` DOM control attributes, expected Backy API/site/host values, and forbidden private env names without exposing secret values. Help mirrors the verifier workflow for owners and frontend agents.

**Newest custom frontend starter export polish:** Backy now exposes protected `GET /api/admin/sites/:siteId/custom-frontend/starter` with `backy.custom-frontend-starter-export.v1`: selected site identity/hosts, checked `examples/custom-frontend-next` source path, safe browser/server-loader env, forbidden private env names, generated `.env.example`, generated `BACKY_FRONTEND_STARTER.md`, preserve-file list, read order, and verifier command. Site Detail has a Download starter manifest action and Help mirrors the pointer for frontend agents.

**Newest custom frontend starter bundle polish:** The protected starter export now includes `starterProject.schemaVersion=backy.custom-frontend-starter-project.v1`, `exportFormat=file-list`, install/build/dev commands, generated site env/runbook files, and the complete checked Next starter file list. A frontend agent can create a separate website repo by writing every `files[].path` from the downloaded JSON instead of needing direct Backy monorepo access.

**Newest custom frontend materializer polish:** The repo now exposes `npm run custom-frontend:materialize -- --manifest <downloaded-starter-json> --out <target-dir>`. The protected starter export, generated runbook, Help, and Site Detail all point to it. The script validates starter schemas, rejects unsafe paths, refuses non-empty targets unless forced, writes every exported `files[].path`, and reports install/build/dev commands plus path-safety metadata.

**Newest custom frontend scaffold polish:** The repo now exposes `npm run custom-frontend:scaffold -- --site-id <site-id-or-slug> --public-host <domain> --api-base <https://backy-public-domain/api> --out <target-dir>`. It uses only public site/API inputs, emits the same `backy.custom-frontend-starter-export.v1` and `backy.custom-frontend-starter-project.v1` file-list schema as the protected admin download, and delegates writes to the path-safe materializer. Site Detail, Help, and the protected starter export now expose the copyable scaffold command.

**Newest custom frontend scaffold readiness polish:** The scaffold command now verifies public site discovery, manifest, and home render before writing starter files. Production currently proves `site-demo` can scaffold successfully, while `devanshvarshney` correctly fails with `SITE_NOT_FOUND` until the real Backy site is created/published. `--skip-site-verify` exists only for offline fixture manifests that will be verified before deployment.

**Newest custom frontend ensure-site polish:** The repo now exposes `npm run custom-frontend:ensure-site -- --site-id <site> --name "<site name>" --public-host <domain> --api-base <https://backy-public-domain/api>`. It verifies public discovery/manifest/render first, creates or updates the site through the protected admin API key boundary when configured, and can fall back to server-side Supabase REST with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` when the admin key is intentionally empty. It refuses command-line admin/service-role secrets, can activate an existing owner profile with `--owner-email`, can seed/publish the homepage, and prints only browser-safe/server-loader custom frontend env plus scaffold/verification commands.

**Newest production site readiness:** The real production `devanshvarshney`/`devanshvarshney.com` Backy site has been created and published through the server-side operator path, a published homepage exists, and the current signed-in Gmail profile is owner on the resolved team. Public discovery, manifest, home render, verify-only ensure-site, no-browser scaffold, and the live custom frontend connection gate now pass for the real site. The separate website frontend project itself still needs to be materialized/deployed and then verified with DOM/probe checks.

**Newest verification:** Source connection smoke, Help source/rendered smokes, Site Detail rendered smoke, admin typecheck, public typecheck, production API connection smoke against `https://backy-public.vercel.app/api`, and diff check are green for the in-admin custom frontend verifier slice.

**Newest verification:** Starter source smoke, starter typecheck, production API connection smoke, Help source/rendered smokes, Site Detail smoke, admin typecheck, public typecheck, SDK typecheck, diff check, env-backed starter production build, and a full 49-check local starter connection proof against production Backy are green. The full proof uses `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1` and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.

**Newest custom frontend materialization:** The real separate Next.js website frontend has been scaffolded from production Backy using the published `devanshvarshney` site and safe public/server-loader env only. The generated project audits clean after the Backy starter PostCSS override, typechecks, builds, exposes `/api/backy-connection`, and passes the strict 61-check local custom frontend connection gate with DOM attributes plus probe enabled.

**Newest starter security polish:** `examples/custom-frontend-next` now pins a PostCSS override in `package.json`, the generated public starter file-list template includes the same override, and `npm run test:custom-frontend-starter` fails if future starter edits remove it.

**Newest separate frontend deploy:** The separate custom website frontend has been deployed as its own Vercel project with only safe Backy public/read env values. Production and development env targets contain the six safe Backy frontend env names; Preview branch env is pending because the separate frontend project does not yet have a connected Git repository. No live website domain has been moved.

**Newest deployed frontend verification:** The separate website frontend deployment passes the strict 61-check custom frontend connection gate with production Backy live checks, deployed DOM `data-backy-*` attributes, and `/api/backy-connection` probe required. Backy production readiness passes 47 checks, and the hosted admin login shell still exposes no demo credentials or dev MFA phrase.

**Newest separate frontend Git state:** The separate website frontend now has a private GitHub repository with the initial scaffold committed and pushed. Vercel CLI could not connect the private repo to the existing Vercel frontend project because Vercel has not been granted access to that private repo yet, so branch-scoped Preview env is still pending. Production/development env and deployed frontend verification remain green.

**Newest custom frontend control-plane polish:** Future Next.js starter exports now expose `backy.custom-frontend-control-plane.v1` through the secret-free `/api/backy-connection` probe. The probe names the safe agent read order, Backy API endpoints, component contract/property-map/render/editable-map/frontend-design/deployment-topology pointers, and verifies home render reachability without exposing content secrets. Existing deployed frontends remain compatible, while new source/starter gates require the richer probe.

**Newest starter typecheck polish:** The checked Next.js custom frontend starter now runs `next typegen && tsc --noEmit`, and the generated protected starter bundle plus starter smoke guard that route-type generation happens before TypeScript. This prevents fresh separate frontend repos from failing `npm run typecheck` because ignored `.next` route types have not been generated yet.

**Newest deployed frontend control-plane verification:** The separate private `devanshvarshney-frontend` repo is pushed at `fa88c09` and the linked Vercel production project has been redeployed. `https://devanshvarshney-frontend.vercel.app/api/backy-connection` now exposes `backy.custom-frontend-control-plane.v1`, render reachability, editable-map presence, and no forbidden private env names; the deployed custom frontend connection gate passes 65 checks.

**Newest frontend design-source sync:** `npm run custom-frontend:ensure-site` now accepts `--frontend-url`, `--frontend-repository`, and `--frontend-branch`, preserves same-domain verification state, and can persist the deployed custom frontend as a synced `backy.frontend-design.v1` source contract for an already-public site. The real production `devanshvarshney` site now exposes `manifest.data.site.frontendDesign.status = "synced"` with source type `custom-frontend`, source URL `https://devanshvarshney-frontend.vercel.app`, branch `main`, and 4 editable site-level bindings. Strict deployed frontend connection remains green at 65 checks and production readiness remains green at 47 checks.

**Newest custom frontend template sync:** `npm run custom-frontend:ensure-site` now seeds generated default `frontendDesign.templates[]` entries when a deployed custom frontend is synced. The real production site now exposes six versioned custom-frontend templates in the public manifest: `custom-frontend-page`, `custom-frontend-blog-post`, `custom-frontend-section`, `custom-frontend-form`, `custom-frontend-product`, and `custom-frontend-collection`. These entries drive the existing Backy template registry and `frontendDesignTemplateId` seeding path for new pages, posts, forms, products, collections, and reusable sections, while the public frontend-design contract no longer includes the private frontend repository URL.

**Newest blog starter polish:** Backy-canvas blog starter intents now generate real starter-specific canvas structures instead of only toggling a label. Investigation report, Audio transcript, Newsletter issue, and Case study starters seed APIable blocks, audio/transcript/file guidance, newsletter signup, evidence/timeline/source sections, proof/repeater sections, and persist `selectedBlogStarterIntent` through autosave plus serialized `blogStarterIntent` metadata.

**Newest verification:** Blog-create source smoke and admin typecheck are green for the starter-specific blog canvas slice. Current Vercel `backy-public` and `backy-admin` aliases are Ready for the prior pushed commit `8ac05dc`.

**Newest canvas persistence polish:** Canvas geometry commits now persist long-page `canvasSize` growth through the same content-bounds/clamp path used by insertions. Transient drag previews stay transient, committed desktop/tablet/mobile geometry can grow the saved page frame, and resize smoke proves a bottom section edit saves `content.canvasSize.height=2148` after crossing the initial 2100px page height.

**Newest custom frontend template gate:** The custom frontend connection contract now proves template-reuse actionability, not only template presence. Handoff, manifest mirror, and `/api/backy-connection` probe checks require page, blog post, section, form, product, and collection template coverage plus template registry, clone fields, aliases, and admin creation entry points.

**Newest verification:** Custom frontend connection smoke, custom frontend starter smoke, admin typecheck, rendered editor resize smoke, and diff check are green for the canvas auto-grow/template actionability slice.

**Newest Vercel linkage check:** Vercel CLI auth is active as `varshneydevansh`, but `vercel git connect` still fails for the private separate frontend repository because the Vercel GitHub App has not been granted access. Preview env writes also fail until that Git repository is connected. This is an external Vercel/GitHub App access blocker, not a Backy code blocker.

**Newest custom frontend template verification:** Source custom-frontend connection smoke passes 22 checks, starter smoke passes 93 checks, strict deployed real-site custom frontend connection passes 69 checks, production readiness passes 47 checks, and the public manifest check proves `templateCount=6` with no GitHub repository URL in `frontendDesign`.

**Newest source push:** The custom-frontend template-registry source slice has been committed and pushed to `main`. The latest verified runtime evidence for this slice is the real-site live custom frontend connection gate at 69 checks, production readiness at 47 checks, and a public manifest proof of six generated custom-frontend templates with no GitHub repository URL in `frontendDesign`. If Vercel auto-deploys from `main`, the next release pass should check the fresh `backy-public`/`backy-admin` deployment logs.

**Newest custom frontend contract fix:** After fresh `e34f543` production deployment, public readiness and hosted login-shell smokes passed, but the stricter live custom-frontend connection gate exposed that `customFrontendRouteFieldAliases` was only nested under `contentCreation.canvasFirst`. The canonical handoff now also exposes the alias list directly at `contentCreation.customFrontendRouteFieldAliases`, with source custom-frontend connection, starter smoke, admin/core/SDK typechecks green. Commit/push and redeploy before rerunning the live strict custom-frontend gate.

**Newest live custom frontend gate:** Fresh `f5dd4ee` `backy-admin` and `backy-public` production deployments are Ready. Production readiness passes 47 checks, hosted login-shell smoke passes with no demo/dev credentials, and the strict live custom-frontend API gate now passes 86 checks after the smoke learned to accept canonical database site ids and public `/agent-handoff` wrapper shape for template registry endpoint assertions. Deployed custom frontend DOM proof was skipped because `BACKY_CUSTOM_FRONTEND_URL` was not supplied in that run.

**Newest Inspector canvas persistence polish:** Inspector/property-panel geometry edits now share the persisted canvas auto-grow path with drag/resize commits. `handleElementUpdate` grows `content.canvasSize` from the flowed displayed element tree, and the rendered resize smoke proves an `editor-layout-height` edit on `smoke-flow-after` persisted canvas height growth from `2148` to `2408`.

**Newest Spark finding resolved:** Spark sidecar `019e8936-af32-7f61-ba3c-1f1db9ba7f5a` reviewed the property-panel auto-grow coverage and confirmed `testResizeControls` plus `editor-layout-height` was the right focused smoke insertion point. The earlier Spark gap from `019e891c-1089-7410-8570-e3adfde06c16` is now implemented locally pending commit/push.

**Newest Site Detail control polish:** Site Detail now exposes `backy.custom-frontend-control-readiness.v1` inside the Separate custom frontend project panel and site workspace handoff. The panel separates Backy-controlled readiness from operator/manual gates: public API contract, frontend design source, template registry, starter/export path, deployed frontend verifier, public-domain cutover, and Vercel Git branch previews. Focused Site Detail smoke, admin typecheck, live custom frontend connection gate, production readiness, hosted login-shell smoke, diff check, and repo-public hygiene are green for this slice.

**Newest Site Detail sync polish:** Site Detail now has a gated `Sync verified frontend` action in the deployed custom frontend verifier result. It only enables after a Ready protected verifier check, then persists the verified frontend URL through the existing `backy.frontend-design.v1` save flow with `status=synced`, `source.type=custom-frontend`, `source.capturedAt`, preserved tokens/chrome/templates/editable-map JSON, and an audit note. The custom frontend control-readiness panel now includes a Backy-controlled `Verified design-source sync` row. Site Detail source guard, full rendered Site Detail smoke, admin typecheck, diff check, and repo-public hygiene are green.

**Newest Site Detail next-action polish:** Site Detail now derives a copyable `backy.custom-frontend-next-action.v1` payload from the custom frontend readiness rows. The Separate custom frontend project panel renders a `Next control action` bar with Backy-owned versus operator-owned status, target surface, action detail, and copyable JSON so owners/frontend agents can act without reading the full checklist. Site Detail source guard, full rendered Site Detail smoke, admin typecheck, diff check, and repo-public hygiene are green for this slice.

**Newest editor responsive control polish:** Canvas Editor now derives a copyable `backy.editor-responsive-next-action.v1` payload from the active breakpoint, selected layer, hidden/locked state, local override groups, and responsive override counts. The contract is exposed on viewport metadata, the wide viewport toolbar, selected-layer Inspector breakpoint controls, and the empty Inspector state so users/frontend agents know whether to switch breakpoints, select a layer, create a local tablet/mobile override, continue/reset local overrides, or unblock a layer. Editor source guard, admin typecheck, diff check, and repo-public hygiene are green; the long rendered responsive smoke was stopped as inconclusive after several silent minutes and should be rerun later with trace/bounds if this visual surface changes again.

**Newest editor responsive verification polish:** `test:editor-responsive-next-action` now provides the bounded rendered proof for `backy.editor-responsive-next-action.v1`. It verifies desktop next action, mobile empty Inspector guidance, inherited selected-layer guidance on `smoke-image`, and the transition to `continue-or-reset-local-overrides` after a real Inspector layout edit creates a local mobile override. Smoke coverage, rendered smoke, admin typecheck, diff check, and repo-public hygiene are green.

**Newest custom frontend responsive starter polish:** The checked Next.js starter renderer now generates tablet/mobile media-query CSS from Backy responsive layout/style overrides, sanitizes generated CSS declaration text, preserves a `render.generatedResponsiveCss` pointer in DOM metadata, keeps breakpoint-revealable hidden elements renderable, and regenerates the protected starter file-list template so exported/scaffolded separate frontend repos inherit the same behavior.

**Newest verification:** Starter source/type smoke with `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1`, source custom-frontend connection smoke, public typecheck, diff check, and repo-public hygiene are green for the responsive starter slice.

**Newest custom frontend verifier polish:** Responsive control is now part of the required custom frontend connection contract. The starter probe, protected admin verifier, protected starter export, scaffold manifest, Help copy, and `npm run test:custom-frontend-connection` all require `data-backy-responsive-css`, `data-backy-responsive-style-pointer`, and the `render.generatedResponsiveCss` pointer.

**Newest separate frontend deploy:** The separate private `devanshvarshney-frontend` repo is pushed at `c0c4998` and redeployed to Vercel production. Its `/api/backy-connection` probe reports the responsive required attributes, `responsiveStylePointer=render.generatedResponsiveCss`, no forbidden private env, and `includesSecretValues=false`; the strict deployed custom frontend connection gate passes 69 checks.

**Newest Dashboard control polish:** Dashboard now mirrors the custom frontend control state through `backy.dashboard-custom-frontend-control-readiness.v1` and copyable `backy.dashboard-custom-frontend-next-action.v1`. The Custom frontend launch panel separates Backy-owned checks from operator-owned domain/Git preview gates, links directly to the Site Detail verifier, and includes the readiness block in the downloadable dashboard handoff. Dashboard rendered smoke, admin typecheck, diff check, and repo-public hygiene are green.

**Newest Dashboard agent-brief polish:** Dashboard custom-frontend launch state is now built by a typed helper and exposes copyable `backy.dashboard-custom-frontend-agent-brief.v1` with read order, safe browser/server-loader env, forbidden env names, scaffold command, deployed verification command, readiness summary, next action, and manual domain/Git gates.

**Newest Dashboard content-control polish:** Dashboard now exposes `backy.dashboard-custom-frontend-content-creation.v1` inside the custom frontend launch state and agent brief. It derives preferred page/blogPost templates from `frontendDesign.templates[]`, emits custom-frontend create routes with `templateSource=custom-frontend`, `frontendDesignTemplateId`, and `focus=canvas`, keeps explicit Backy-canvas fallback routes, and renders New custom page/post actions or Sync template actions when the registry is not ready. This shipped as `2f18beb9`; fresh `backy-admin` and `backy-public` production deployments are Ready, production readiness passes 47 checks, hosted admin login shell is clean of demo/dev credentials, strict deployed custom frontend connection passes 69 checks, and fresh Vercel error logs are empty.

**Newest Dashboard content fallback polish:** Spark sidecar `019e8962-f2dd-7430-a310-d2a4c0c372d7` found that dashboard custom-frontend fallbacks for forms, products, collections, and reusable sections could land on passive list views. Backy now emits actionable fallbacks: `/forms?quickCreate=blank`, `/products?quickCreate=product`, `/collections?draft=new`, and `/reusable-sections?draft=new`, with reusable-sections route support for the new draft link. Dashboard source/rendered smokes, admin typecheck, custom-frontend source gate, reusable-sections source guard, and diff check are green. Full reusable-sections rendered smoke hit a transient local API reset/stale-session cleanup failure after passing the updated canvas-height point; rerun it from a clean local backend session before changing that surface again.

**Newest launch-handoff polish:** The repo now exposes `npm run test:custom-frontend-control-plane`, a compact launch-critical gate for low-context handoff. It chains the checked custom frontend starter, custom frontend connection contract, Vercel production-readiness contract, and public-repo hygiene, and the agent-facing README/AGENTS/custom-frontend spec now call out which remaining gates are operator-owned: private website repo Vercel Git access, branch/Preview env after Git connection, final DNS cutover, and real live provider certification artifacts.

**Newest creator/dynamic-content polish:** Complete `backy.frontend-design.v1` replacement now truly replaces stale fallback source/tokens/chrome/templates/editable maps while partial patches still merge. Page-create, blog-create, forms, products source/catalog, collections, template-registry, admin typecheck, and public typecheck are green locally. Collections now counts all published/unpublished schemas before raising/restoring local billing quota fixtures and the UI draft-schema smoke asserts the actual create request plus persisted custom field key/label. Forms refresh smoke now waits through transient loading states. Full commerce runtime still requires a running public app with matching signed webhook/provider env and does not close the external commerce provider certification partial.

**Newest editor priority:** Audio files are supported in the media/upload boundary, but automatic transcription is not wired as a provider-backed feature yet. The next high-friction editor slice should focus on direct canvas asset insertion/drop behavior, long-page auto-height/flow editing, and Canva-like media insertion ergonomics while preserving custom frontend template chrome for new pages/blog posts.

**Newest canvas media polish:** Audio is now a first-class canvas/API/custom-frontend component with catalog entry, component-library icon, Inspector URL/media/upload/caption/transcript/toggle controls, admin canvas render, public renderer output, custom frontend starter output, and `componentTypeContract('audio')` handoff metadata. Direct canvas file drops upload through the existing media API, preserve `assetIds`, media ids, scope/folder/signed-url metadata, and `backy.canvas-asset-drop.v1` provenance; URL-like drops from other tabs create image/video/audio/link elements at the pointer without stealing ordinary component drags.

**Newest long-page canvas polish:** Canvas width and height now have separate clamps: width remains bounded to 3840px for desktop/tablet/mobile viewport semantics, while page height can grow to 24000px so pages/blog posts can continue vertically with content instead of being forced into a fixed hero-sized frame.

**Newest verification:** `test:editor-canvas-media-drop`, editor smoke coverage, admin/public/SDK typechecks, SDK generated-types smoke, custom frontend starter smoke, source custom-frontend connection smoke, diff check, and repo-public hygiene are green for the audio/direct-drop/long-page-height slice. Automatic transcription remains future provider-backed work, not a completed local feature.

**Newest deploy verification:** `3c9edc18` is pushed. Fresh `backy-admin` and `backy-public` production deployments are Ready, production readiness passes 47 checks, hosted admin login shell exposes no demo credentials/dev MFA, and strict deployed real-site custom frontend connection passes 69 checks with the canonical production site id resolved by public discovery. A slug-based custom frontend gate run passed 68 checks and failed only the probe site-id equality check because the deployed frontend is configured with the canonical site id; public discovery resolves the slug to that id.

**Newest rendered canvas verification:** `test:editor-canvas-media-drop-rendered` now proves the direct-drop path in a real editor page: external image/video/audio data-URL drops create media elements at the pointer, a local audio-file drop uploads through the media API, the selected audio layer exposes Inspector caption/transcript/playback controls, save persists `canvas-file-drop` provenance, `assetIds`, `mediaType=audio`, transcript text, and the canvas height grows beyond the original viewport while staying below the 24000px page-height cap. The smoke is now part of `test:editor-workflows`, and PropertyPanel normalization now treats `audio` as a canonical editable element type.

**Newest nested media drop polish:** Canvas file/URL drops now carry target-parent, coordinate-space, and root-canvas fallback metadata. Dropping images, videos, audio, files, or external URLs onto eligible section/container/chrome layers inserts the generated element as a child of that target layer instead of always creating a root layer, while root canvas drops still preserve long-page auto-growth and root-section flow behavior.

**Newest custom frontend provenance polish:** Public custom frontend provenance now exposes `templateSource`, `templateSourceLabel`, and `backy.shared-chrome-bindings.v1` for shared header/navigation/footer chrome. OpenAPI, generated SDK types, SDK source types, the frontend manifest schema, frontend contract smoke, admin contract source guard, SDK smoke, and generated-types gate now treat audio as a first-class API-addressable component and shared chrome/template provenance as a public contract.

**Newest custom frontend page-create polish:** New Page now keeps the full starter template library visible in Custom frontend mode, auto-matches starter intent to captured `frontendDesign.templates[]`, marks matched/missing/blank starter states in the UI, preserves `templateSource=custom-frontend`, and wraps non-blank custom frontend fallback seeds with shared chrome when a captured element tree is not available.

**Newest nested canvas drop verification:** Canvas media URL/file drops now infer eligible nested targets from the actual drop event target, clamp inserted children to parent bounds, expose parent ids in the editor DOM, and the rendered media-drop smoke proves an external URL dropped on `smoke-box` persists as a child with exact `mediaExternalUrl`/`href` provenance.

**Newest verification:** Editor media-drop source smoke, admin typecheck, page-create source guard, focused custom-frontend page-create browser smoke, nested-group smoke, rendered canvas media-drop smoke, and diff check are green. The full unfiltered page-create smoke was stopped as inconclusive after several silent minutes; the focused custom-frontend mode covers the changed page-create behavior.

**Newest production login guard:** The hosted admin login shell had regressed because a stale `VITE_BACKY_SHOW_DEMO_ACCESS=1` env could still expose the local/demo credentials block in a production build. Source now hard-disables demo access when `import.meta.env.MODE === 'production'`; admin typecheck, production admin build with stale demo env, built-bundle credential scan, login source-only smoke, diff check, and repo-public hygiene are green.

**Newest hosted login verification:** `c8101f07` is pushed and the latest `backy-admin` production deployment is Ready. The deployed admin bundle no longer contains visible `Demo access`; hosted login-shell smoke passes against `https://backy-admin.vercel.app/login` with no seeded credentials/dev MFA and no demo buttons. The smoke now accepts both `BACKY_ADMIN_*` and `BACKY_LOGIN_*` URL env aliases and retries Chrome temp profile cleanup.

**Newest custom frontend blog-create polish:** Blog creation now mirrors the New Page custom-frontend starter model. `/blog/new` exposes a visible Blog starter intent shelf for Article post, Investigation report, Audio transcript, Newsletter issue, and Case study. In Custom frontend mode, each intent auto-matches captured `frontendDesign.templates[]` blog-post templates, marks matched/missing states, keeps explicit captured-template selection available, and preserves the existing `templateSource=custom-frontend`/`frontendDesignTemplateId` persistence path for tokens, chrome, editable maps, assets, animations, bindings, custom CSS/JS, and canvas content.

**Newest verification:** Blog-create source guard, admin typecheck, compact custom-frontend control-plane gate, diff check, and repo-public hygiene are green for the blog starter intent/custom frontend parity slice.

**Newest custom frontend newsletter polish:** The checked and generated Next.js custom frontend starter now exposes public newsletter unsubscribe alongside signup. `src/lib/backy-client.ts` has `unsubscribeNewsletter(...)`, `/api/newsletter` supports `DELETE` with `email` plus optional `formId`/`source`/`signup_source`, and unknown subscribers are normalized into an idempotent success response at the separate website bridge to avoid email enumeration.

**Newest verification:** Starter source/type smoke with `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1`, source custom-frontend connection smoke, public typecheck, diff check, and repo-public hygiene are green for the newsletter unsubscribe starter slice.

**Newest Spark scout:** Spark sidecar `019e8943-fb2b-79f3-80ec-c4fc2a63ecc6` recommends the next larger custom-frontend parity slice: Dashboard custom-frontend content creation should expose all template-backed create entry points - page, blog post, form, product, collection, and reusable section - instead of only page/blog.

**Newest Dashboard create-parity polish:** Dashboard custom-frontend content creation now exposes all six template-backed create entry points in `backy.dashboard-custom-frontend-content-creation.v1` and the agent brief: page, blogPost, form, product, collection, and section. Page/blog routes keep `frontendDesignTemplateId` plus `templateSource=custom-frontend`; form/product/collection/reusable-section routes use `frontendTemplate`.

**Newest verification:** Dashboard source smoke, rendered Dashboard smoke, admin typecheck, diff check, and repo-public hygiene are green for the six-way custom-frontend create-parity slice.

**Newest Blog child-template polish:** Blog creation now follows the requested parent/child model: New Page remains the parent starter surface, while `/blog/new` has a route-addressable 33-template blog child library aligned to the page catalog. Each child starter maps to a concrete APIable article, investigation, audio transcript, newsletter, or case-study canvas flow, and Custom frontend mode auto-matches the selected child starter against captured blog-post templates while preserving explicit captured-template selection, chrome, tokens, editable maps, and serialized metadata.

**Newest verification:** Admin typecheck, Blog create source guard, Page create source guard, rendered Blog create smoke, rendered Page create smoke, diff check, and repo-public hygiene are green for the Blog child-template slice. The slice is committed and pushed as `c4e21631`.

**Newest deploy verification:** `c4e21631` is pushed. Fresh `backy-admin` and `backy-public` production deployments are Ready and aliased to `https://backy-admin.vercel.app` and `https://backy-public.vercel.app`. Production readiness passes 47 checks, hosted admin login shell is clean of demo/dev credentials, and the real-site custom frontend API contract passes 86 checks. Deployed custom frontend DOM proof was skipped because `BACKY_CUSTOM_FRONTEND_URL` was not supplied.

**Newest editor command polish:** The page editor command registry now has an explicit executor invariant. The command palette trigger/dialog and Inspector command-registry panel expose `unwiredCommandCount`/ids, future commands without an executor are disabled instead of advertised as ready, and the rendered command-palette smoke proves the current editor has zero registered-but-unwired commands while `zoom-fit` and blocked `undo` behavior still work.

**Newest verification:** Admin typecheck, editor smoke coverage source guard, rendered command-palette smoke, diff check, and repo-public hygiene are green for the editor command executor-guard slice. `41817be0` is pushed. Fresh `backy-admin` and `backy-public` production deployments are Ready on the stable aliases, production readiness passes 47 checks, hosted admin login shell is clean of demo/dev credentials, and the real-site custom frontend API contract passes 86 checks. Deployed custom frontend DOM proof was skipped because `BACKY_CUSTOM_FRONTEND_URL` was not supplied.

**Newest blog child-template handoff polish:** The public custom frontend agent handoff now exposes the full 33-item blog child starter catalog under `contentCreation.blogChildStarterTemplates` and `apiAlignment.blogChildStarterTemplates`, with `backy.blog-child-template-inheritance.v1` documenting `/pages/new` as the parent vocabulary and `/blog/new` as the child authoring surface. Each starter advertises route-safe `starterTemplate`, `templateSource`, optional `frontendDesignTemplateId`, Backy-canvas route, custom-frontend route, intent, and section hints for article, investigation, media/audio-transcript, newsletter issue, and case-study flows.

**Newest verification:** Core typecheck, frontend contract type generation, source custom-frontend connection smoke, SDK generated-types smoke, SDK typecheck, public typecheck, direct local public API manifest/agent-handoff assertion, and diff check are green for the blog child-template handoff slice. Full SDK smoke reaches protected admin login and stops on expected local MFA, after the public handoff assertions pass.

**Newest deploy verification:** `880314e3` is pushed. Fresh `backy-public` and `backy-admin` production deployments are Ready on the stable aliases, production readiness passes 47 checks, real-site custom frontend connection passes 94 checks, and hosted admin login shell remains clean of demo/dev credentials. Deployed custom frontend DOM proof was skipped because `BACKY_CUSTOM_FRONTEND_URL` was not supplied.

**Newest custom frontend starter probe polish:** The checked and generated Next.js custom frontend starter now exposes blog child-template discovery in `/api/backy-connection`: `blog-child-templates` and `blog-template-inheritance` read-order entries, pointers to `agent-handoff.contentCreation.blogChildStarterTemplates` and `agent-handoff.contentCreation.blogTemplateInheritance`, and a public count/reachability flag. The starter README and protected starter export runbook tell frontend agents to preserve `starterTemplate`, `templateSource`, and optional `frontendDesignTemplateId` for article, investigation, media/audio transcript, newsletter issue, and case-study blog creation.

**Newest verification:** Starter smoke, strict starter typecheck smoke, source custom-frontend connection smoke, public typecheck, and diff check are green for the custom frontend starter blog-template probe slice.

**Newest deploy verification:** `2b4d0401` is pushed. Fresh `backy-public` and `backy-admin` production deployments are Ready on the stable aliases, production readiness passes 47 checks, real-site custom frontend connection passes 94 checks, and hosted admin login shell remains clean of demo/dev credentials. Deployed separate frontend DOM proof is still pending until `BACKY_CUSTOM_FRONTEND_URL` points at the materialized custom website frontend.

**Newest protected verifier polish:** The protected Site Detail custom frontend verifier now requires the deployed `/api/backy-connection` probe to expose the current control-plane block, blog child-template read order, blog child-template/inheritance pointers, and at least 33 reported blog child starter templates. Source connection smoke, admin typecheck, public typecheck, and production API connection smoke are green.

**Newest deploy verification:** `1199c7cc` is pushed. Fresh `backy-public` and `backy-admin` production deployments are Ready on the stable aliases, production readiness passes 47 checks, real-site custom frontend connection passes 94 checks, and hosted admin login shell remains clean of demo/dev credentials. Deployed separate frontend DOM proof is still pending until `BACKY_CUSTOM_FRONTEND_URL` points at the materialized custom website frontend.

**Newest real-site custom frontend proof:** The separate custom frontend scaffold path has been proven against production Backy for `devanshvarshney.com`: `npm run custom-frontend:scaffold` resolved the canonical production site, the generated Next.js starter built successfully with only public Backy env, a local `next start` frontend exposed `/api/backy-connection`, and the full live connection gate with `BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1`, `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1`, and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1` passed 112 checks.

**Newest starter hygiene polish:** CLI scaffold and protected admin starter export now write generated `.env.example` plus `BACKY_FRONTEND_STARTER.md` with trailing newlines, and `npm run test:custom-frontend-starter` guards that copy-friendly behavior. Release doctor, public typecheck, scaffold newline proof, diff check, and repo-public hygiene are green.

**Newest deploy verification:** `ff7c6731` is pushed. Fresh `backy-public` and `backy-admin` production deployments are Ready, production readiness passes 47 checks, the real-site custom frontend API gate passes 94 checks, and the hosted admin login shell remains clean of demo/dev credentials. Deployed separate frontend DOM proof still requires `BACKY_CUSTOM_FRONTEND_URL`.

**Newest plan hygiene:** `docs/elves/backy-release-plan.md` now marks the already-guarded Batch 1 sidebar/site switcher, Pages dense rows, Users table wrapping, and Settings More actions layering rows as done, and records the current Batch 2 editor primitive coverage. The remaining editor work is command execution coverage plus real long-page/custom-frontend blog-template authoring polish, not the old top-left marquee/zoom/drag-preview primitives.

**Newest custom frontend route-alias polish:** Page and blog creation routes now preserve the canonical `frontendDesignTemplateId` plus `frontendTemplate` and legacy `designTemplate` aliases when custom frontend templates are selected or restored in admin. Source guards for page/blog creation prove the visible URLs stay aligned with the public handoff examples and `AGENTS.md`.

**Newest Dashboard launch-route polish:** Dashboard custom frontend content creation now emits page/blog create routes with `frontendDesignTemplateId`, `frontendTemplate`, and legacy `designTemplate` together, so dashboard buttons and copied agent briefs match the alias-preserving `/pages/new` and `/blog/new` route state. Dashboard source smoke, admin typecheck, diff check, and repo-public hygiene are green.

**Newest blog authoring polish:** Blog creation now syncs custom frontend template title/excerpt edits into the visible canvas before save via an explicit `CanvasEditor.externalElementsRevision` refresh signal. The update path preserves element identity when no bound content changed, and the blog-create source guard, admin typecheck, diff check, and repo-public hygiene are green.

**Newest page template authoring polish:** Page creation now rewrites captured custom frontend template `page.title` and `page.description` bindings into the actual canvas elements before save, and cancels pending autosave timers so successful page creation does not leave a stale `/pages/new` draft in localStorage. Source page-create guard, admin typecheck, rendered custom-frontend page-create smoke, diff check, and repo-public hygiene are green.

**Newest layer-map readability polish:** The editor Layers panel now keeps narrow-row layer names usable by giving the readable label a wrapping flex basis, full title/data metadata, and a single ARIA label containing name, semantic meta, responsive state, and selection context. The rendered Layers smoke proves row readability, tree semantics, selection/actions, nested collapse/search, nav child selection, rename, duplicate/delete, visibility/lock, and persistence.

**Single next action:** Continue highest-friction Backy UX/editor polish, especially rendered authoring behavior that affects real page/blog creation. Vercel GitHub App access for the private separate frontend repository is useful for automation but is not the current Backy backend release blocker.

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
- `apps/admin/src/components/editor/LayersPanel.tsx`
- `apps/admin/src/routes/pages.tsx`
- `apps/admin/src/routes/blog.tsx`
- `apps/admin/src/routes/help.tsx`
- `apps/admin/src/routes/sites.$siteId.tsx`
- route smoke scripts under `apps/admin/scripts/`
