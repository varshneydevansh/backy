# Execution Log

Newest entries go at the top. Keep reusable lessons in `docs/elves/learnings.md`.

## Run Digest

- **Last updated:** 2026-06-02 19:03 IST
- **Current phase:** In progress
- **Active batch:** Batch 5: Ongoing UX Scout And Polish
- **Last completed batch:** Batch 4: Release Certification And Vercel Readiness
- **Next exact batch:** Batch 5: Ongoing UX Scout And Polish
- **Active PR:** not created yet
- **Docs promoted this run:** `docs/elves/learnings.md`
- **Latest Elves Report:** not generated yet

## 2026-06-02 19:03 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Editor/custom frontend status:** Canvas media drops and template provenance hardened

**What changed:**
- Canvas file/URL drops now carry target-parent metadata, coordinate-space metadata, and root-canvas fallback coordinates.
- Dropping media onto an eligible nested layer inserts the generated image/video/audio/link element as a child of that target layer instead of always adding it as a root layer.
- Root canvas insertion still keeps long-page auto-growth and root-section flow behavior for page/blog documents with content below the first viewport.
- Public custom frontend provenance now projects `templateSource`, `templateSourceLabel`, and a machine-readable `backy.shared-chrome-bindings.v1` map for shared header/navigation/footer chrome.
- OpenAPI, generated SDK types, SDK source types, and contract smokes now expose that shared chrome provenance.
- Audio is now included in the manifest schema and SDK component-type contract guard as a first-class API-addressable media component with transcript-related props.

**Commands run:**
- `npm run test:frontend-contract --workspace @backy/public --silent` -> PASS.
- `npm run test:generated-types --workspace @backy/sdk-js --silent` -> PASS.
- `npm run test:admin-contract-source --workspace @backy/public --silent` -> PASS.
- `npm run test:editor-canvas-media-drop --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-canvas-media-drop-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `BACKY_ADMIN_MFA_CODE=backy-dev-mfa npm run test:smoke --workspace @backy/sdk-js --silent` -> PASS.
- `npm run test:frontend-contract-types --silent` -> PASS.
- `npm run test:custom-frontend-control-plane --silent` -> PASS with source-mode warnings for unset live/deployed URLs.
- `git diff --check` -> PASS.

**Notes:**
- `BACKY_ADMIN_MFA_CODE=backy-dev-mfa npm run test:admin-contract --workspace @backy/public --silent` reached runtime after MFA, then failed on an existing broad fixture mismatch: it expects public discovery for an unverified `.example.test` custom domain, while Backy's verified-domain policy correctly returns 404. The source guard for the OpenAPI/admin contract addition is green.

**Next:**
1. Run repo-public hygiene after doc updates.
2. Commit and push the nested canvas media/custom frontend provenance slice.
3. Continue the editor UX pass toward more Canva/Wix-like asset insertion, long document editing, and custom frontend blog/page template creation.

## 2026-06-02 14:45 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Compact control-plane halt gate available

**What changed:**
- Added root `npm run test:custom-frontend-control-plane`.
- The aggregate gate chains the checked custom frontend starter, `test:custom-frontend-connection`, `test:vercel-production-readiness`, and `test:repo-public-hygiene`.
- Extended `scripts/custom-frontend-connection-smoke.mjs` so the new gate is guarded by the existing custom frontend contract smoke.
- Updated `README.md`, `AGENTS.md`, and `specs/custom-frontend-agent-handoff.md` with the compact launch-critical gate and the explicit operator-owned gates that remain outside Backy code: private website repo Vercel Git access, branch/Preview env after Git connection, final DNS cutover, and live provider certification artifacts.

**Commands run:**
- `npm run test:custom-frontend-control-plane --silent` -> PASS.
- `node --check scripts/custom-frontend-connection-smoke.mjs` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit and push this handoff gate slice.
2. After push, re-read the survival guide and check whether Vercel redeployed the docs/script-only change.
3. The Backy-owned custom frontend control path remains green in source/no-secret mode; live deployed proof still uses the existing `BACKY_CUSTOM_FRONTEND_*` and `BACKY_VERCEL_*` env-backed gates.

## 2026-06-02 10:48 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Site Detail now exposes a copyable next control action

**What changed:**
- Added `backy.custom-frontend-next-action.v1` to the Site Detail Separate custom frontend project readiness payload.
- The next action is derived from the existing Backy-controlled and operator/manual readiness rows, so it points owners to the first actionable gap instead of making them infer it from the full checklist.
- Rendered a `Next control action` bar with owner status, target surface, action detail, and a copyable JSON payload.
- Included the next-action payload in the existing site workspace handoff through `customFrontendControlReadiness.nextAction`.
- Strengthened Site Detail source and rendered smoke assertions so the next-action schema, metadata attributes, and copy action stay present.

**Commands run:**
- `BACKY_SITE_DETAIL_SOURCE_ONLY=1 npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit and push the Site Detail next-action slice.
2. Continue Backy-owned UX/editor polish while external/manual gates remain Vercel GitHub App access and DNS cutover timing.

## 2026-06-02 10:23 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Site Detail can sync a verified custom frontend into the saved design-source contract

**What changed:**
- Added a guarded `Sync verified frontend` action to Site Detail's Separate custom frontend project verifier result.
- The action only enables after a Ready `backy.admin-custom-frontend-connection-check.v1` result, then persists the verified frontend URL as a `backy.frontend-design.v1` source with `status=synced`, `source.type=custom-frontend`, `source.capturedAt`, and an audit-friendly note.
- The sync path reuses the existing `/api/admin/sites/:siteId/frontend-design` save flow and preserves the current tokens, chrome, templates, and editable-map JSON so custom frontend style and Backy-created content stay connected.
- Added a Backy-controlled `Verified design-source sync` row to `backy.custom-frontend-control-readiness.v1`, making it visible when the frontend has been verified but not yet persisted as the design source.
- Strengthened Site Detail smoke source and rendered assertions so the sync button, schema, Ready-verifier gate, readiness row, and launch-panel copy cannot disappear silently.

**Commands run:**
- `BACKY_SITE_DETAIL_SOURCE_ONLY=1 npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS before doc updates.

**Next:**
1. Rerun repo-public hygiene after this doc update, then commit and push the Site Detail sync-control slice.
2. Continue highest-friction Backy UX/editor polish; the remaining custom frontend external step is still Vercel GitHub App access for branch previews and DNS cutover only when the public domain is ready to move.

## 2026-06-02 10:00 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Site Detail now shows an explicit custom-frontend control-readiness panel

**What changed:**
- Added `backy.custom-frontend-control-readiness.v1` to Site Detail so owners can see the custom frontend control path without reading the long handoff JSON.
- The panel separates Backy-controlled checks from operator/manual gates: public API contract, frontend design source, template registry, starter/export path, deployed frontend verifier, public-domain cutover, and Vercel Git branch previews.
- The same readiness payload is included in the copied/downloaded site workspace handoff under `customFrontendControlReadiness`.
- Updated the Site Detail smoke so source and rendered browser coverage require the readiness schema, `/api/backy-connection` probe pointer, manual operator rows, and Vercel Git preview gate copy.

**Commands run:**
- `npx --yes vercel@latest whoami` -> PASS, Vercel CLI auth active.
- `npx --yes vercel@latest ls backy-public` -> PASS, latest production deployment Ready.
- `npx --yes vercel@latest ls backy-admin` -> PASS, latest production deployment Ready.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=<canonical-site-id> BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=<custom-host> BACKY_CUSTOM_FRONTEND_URL=<separate-frontend-url> BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 npm run test:custom-frontend-connection --silent` -> PASS, 69 checks.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; optional admin-auth proof skipped by unset credentials.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9561 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; hosted admin shell still exposes no demo credentials or dev MFA phrase.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS before doc updates.

**Next:**
1. Commit and push this Site Detail control-readiness slice after rerunning repo-public hygiene.
2. Remaining custom frontend external/manual work: grant Vercel GitHub App access to the private separate frontend repo for branch previews, and attach/move the real public website domain only when DNS cutover is intended.
3. Continue highest-friction Backy UX/editor polish if more release time remains.

## 2026-06-02 09:34 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Synced frontend design now seeds reusable templates for new Backy content

**What changed:**
- Extended `npm run custom-frontend:ensure-site` so a synced deployed custom frontend also seeds versioned `frontendDesign.templates[]` entries through the existing Backy template contract.
- Added generated defaults for page, blog post, reusable section, form, product, and collection creation: `custom-frontend-page`, `custom-frontend-blog-post`, `custom-frontend-section`, `custom-frontend-form`, `custom-frontend-product`, and `custom-frontend-collection`.
- The generated templates include binding hints, editable-map entries, route patterns, source metadata, and `createThroughBackyCanvas=true` so new content still opens through the Backy canvas/editor APIs instead of becoming frontend-local JSON.
- Generated default templates now refresh when the deployed frontend source is resynced, while preserving non-generated captured templates with different ids.
- Resynced the real production site with the deployed frontend URL and branch only; the public manifest now reports six templates and no GitHub repository URL in the frontend-design contract.
- Strengthened `npm run test:custom-frontend-connection` so a live synced frontend design must expose page, blog-post, and reusable-section template entries in the public manifest.

**Commands run:**
- `node --check scripts/ensure-custom-frontend-site.mjs` -> PASS.
- `node --check scripts/custom-frontend-connection-smoke.mjs` -> PASS.
- `npm run test:custom-frontend-connection --silent` -> PASS, 22 source checks.
- `npm run custom-frontend:ensure-site -- --site-id devanshvarshney --name "Devansh Varshney" --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --frontend-url https://devanshvarshney-frontend.vercel.app --frontend-branch main --owner-email <owner-email> --skip-home-seed` with ignored production env and repository env overrides empty -> PASS, `siteAction=supabase-rest-updated-frontend-design`.
- Public manifest check -> PASS, `frontendDesign.status=synced`, source type `custom-frontend`, `templateCount=6`, repository URL absent, GitHub URL absent.
- Strict deployed custom frontend connection gate against the real site and deployed frontend -> PASS, 69 checks.
- `npm run test:custom-frontend-starter --silent` -> PASS, 93 checks.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; optional admin-auth proof skipped by unset credentials.

**Next:**
1. Use the template ids from the public manifest/admin template registry when creating new pages, posts, forms, products, collections, or reusable sections from the custom frontend style.
2. Grant Vercel GitHub App access to the private separate frontend repo when branch previews are needed; that remains the external linkage blocker.
3. Continue highest-friction Backy UI/editor polish after this custom-frontend creation path is committed and pushed.

## 2026-06-02 09:11 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Real production site now records the deployed frontend as its synced design source

**What changed:**
- Extended `npm run custom-frontend:ensure-site` with `--frontend-url`, `--frontend-repository`, and `--frontend-branch` so server-side operator runs can persist a connected `backy.frontend-design.v1` contract for an already-public site.
- The ensure-site update now preserves existing same-domain verification fields instead of blindly resetting domain readiness to pending.
- Added source-smoke coverage so future edits must keep the deployed-frontend design sync path, custom-frontend source type, synced status, and domain-state preservation.
- Ran the operator path against the real production `devanshvarshney` site with ignored server-side production env. The live manifest now exposes `frontendDesign.status = "synced"`, source type `custom-frontend`, source URL `https://devanshvarshney-frontend.vercel.app`, branch `main`, and 4 editable site-level bindings.
- Verified the separate frontend project remains connected to Backy through the strict deployed connection gate.
- Confirmed Vercel CLI is logged in, but `vercel git connect https://github.com/varshneydevansh/devanshvarshney-frontend.git` still fails because Vercel has not been granted access to the private repo. Preview env writes also fail until the project has a connected Git repository.

**Commands run:**
- `npx --yes vercel@latest whoami` -> PASS, logged in as `varshneydevansh`.
- `npx --yes vercel@latest git connect https://github.com/<github-user>/devanshvarshney-frontend.git --scope <vercel-team-id>` -> FAIL, private repo access not granted to Vercel.
- `npx --yes vercel@latest env add NEXT_PUBLIC_BACKY_API_BASE_URL preview ...` -> FAIL, Vercel requires a connected Git repository before Preview env can be set.
- `node --check scripts/ensure-custom-frontend-site.mjs && node --check scripts/custom-frontend-connection-smoke.mjs` -> PASS.
- `npm run custom-frontend:ensure-site -- --site-id devanshvarshney --name "Devansh Varshney" --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --frontend-url https://devanshvarshney-frontend.vercel.app --frontend-repository https://github.com/varshneydevansh/devanshvarshney-frontend.git --frontend-branch main --owner-email <owner-email> --skip-home-seed` with ignored production env -> PASS, `siteAction=supabase-rest-updated-frontend-design`.
- Public manifest check -> PASS, `frontendDesign.status=synced`, source type `custom-frontend`, 4 editable bindings.
- `npm run test:custom-frontend-connection --silent` -> PASS, 22 source checks.
- `npm run test:custom-frontend-starter --silent` -> PASS, 93 checks.
- Strict deployed custom frontend connection gate against `https://devanshvarshney-frontend.vercel.app` -> PASS, 65 checks.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; optional admin-auth proof skipped by unset credentials.

**Next:**
1. Grant the Vercel GitHub App access to the private `devanshvarshney-frontend` repo or connect it from Vercel Dashboard; this is the only current blocker for automatic branch previews.
2. After Git is connected, add Preview env or rerun the safe env add commands for the six public/read Backy frontend values.
3. Attach `devanshvarshney.com` to the separate frontend Vercel project only when DNS is ready to move from the current host.

## 2026-06-02 08:49 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Deployed separate frontend now exposes the Backy control-plane probe

**What changed:**
- Committed and pushed the separate private `devanshvarshney-frontend` repo update as `fa88c09 Expose Backy control-plane probe`.
- Redeployed the linked `devanshvarshney-frontend` Vercel production project.
- The deployed alias `https://devanshvarshney-frontend.vercel.app` now exposes `backy.custom-frontend-control-plane.v1` from `/api/backy-connection`.
- The live probe proves source of truth `backy-public`, safe read order, render reachability, editable-map presence, and no forbidden private env names.

**Commands run:**
- Separate frontend `git diff --check` -> PASS.
- Separate frontend `npm audit --audit-level=moderate` -> PASS, 0 vulnerabilities.
- Separate frontend `npm run typecheck` with safe Backy env -> PASS.
- Separate frontend `npm run build` with safe Backy env -> PASS.
- Local separate frontend `/api/backy-connection` probe on port 3037 -> PASS.
- Local separate frontend connection gate with production Backy + probe required -> PASS, 65 checks.
- Separate frontend `git push` -> PASS.
- `npx --yes vercel@latest deploy . --prod -y` from the separate frontend repo -> PASS, production deployment Ready and aliased.
- Deployed separate frontend `/api/backy-connection` probe -> PASS, control-plane schema present, render reachable, editable map present, no forbidden env, no secret values.
- Deployed separate frontend connection gate with production Backy + probe required -> PASS, 65 checks.
- Backy production readiness -> PASS, 47 checks; optional admin-auth proof skipped by unset credentials.

**Next:**
1. Vercel GitHub App access is still pending for the private separate frontend repo, so branch previews and Preview env remain blocked on that external linkage.
2. Attach `devanshvarshney.com` to the separate frontend Vercel project only when ready to move DNS away from the current host.
3. Continue highest-friction Backy UX/editor polish.

## 2026-06-02 08:38 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Starter typecheck now generates Next route types before TypeScript

**What changed:**
- Updated the checked Next.js custom frontend starter `typecheck` script to run `next typegen && tsc --noEmit`.
- Regenerated the protected starter file-list template so future admin downloads and CLI scaffolds inherit the route-type generation step.
- Updated the starter smoke to require the `next typegen` preflight and to run the starter's own typecheck script in the optional deep typecheck path.
- Updated the existing separate `devanshvarshney-frontend` repo locally with the richer `backy.custom-frontend-control-plane.v1` probe and the same typecheck script; that separate repo still needs its own commit/push/deploy in the next step.

**Commands run:**
- `node scripts/generate-custom-frontend-starter-template.mjs` -> PASS.
- `npm run test:custom-frontend-starter --silent` -> PASS, 93 checks.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 94 checks.
- Separate frontend `npm run typecheck` with safe Backy env -> PASS.
- Separate frontend `npm run build` with safe Backy env -> PASS.
- Local separate frontend `/api/backy-connection` probe on port 3037 -> PASS, exposes `backy.custom-frontend-control-plane.v1`, render reachability, editable-map proof, no forbidden env.
- Local separate frontend connection gate with production Backy + probe required -> PASS, 65 checks.

**Next:**
1. Run Backy diff/hygiene gates, commit and push the starter typecheck slice.
2. Commit/push the separate frontend repo update.
3. Redeploy the separate frontend and rerun the deployed 65-check connection gate.

## 2026-06-02 08:19 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Future scaffolds expose a richer self-probe control plane

**What changed:**
- Enriched the checked Next.js custom frontend starter `GET /api/backy-connection` probe with `backy.custom-frontend-control-plane.v1`.
- The probe now exposes the safe agent read order, site-scoped `agent-handoff`, `manifest`, `openapi`, `resolve`, and host-aware `render` endpoints, plus canonical component contract, property map, render elements, editable map, frontend design, and deployment topology pointers.
- The probe now also verifies Backy home render reachability and reports element/editable-map presence as booleans/counts without exposing content secrets.
- Kept the deployed-frontend connection smoke backwards-compatible: existing deployed frontends still pass, while new starter/source exports are required to include the richer control-plane block.
- Regenerated the protected starter file-list template so admin downloads and CLI scaffolds inherit the updated probe.

**Commands run:**
- `node scripts/generate-custom-frontend-starter-template.mjs` -> PASS.
- `npm run test:custom-frontend-starter --silent` -> PASS, 92 checks.
- `npm run test:custom-frontend-connection --silent` -> PASS, 22 source checks; live API/frontend URL skipped by unset env.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 93 checks.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit/push the custom frontend control-plane probe slice.
2. Re-read the survival guide after commit/push.
3. If time remains, run the production custom frontend connection gate again and continue UX/editor polish.

## 2026-06-02 08:05 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate frontend source repo exists; Vercel Git connection pending app access

**What changed:**
- Initialized the separate website frontend as its own local Git repository on `main`.
- Tightened its `.gitignore` before the first commit so `.next`, `node_modules`, local env files, TypeScript build info, and `.vercel` project metadata stay out of source control.
- Created and pushed a private GitHub repository for the separate website frontend.
- Attempted to connect the existing Vercel frontend project to that private GitHub repository through Vercel CLI.
- Vercel rejected the Git connection because the project still does not have access to the private repository. This is consistent with Vercel's GitHub App needing access to the newly created private repo before CLI/project linkage can complete.
- Preview env remains pending because Vercel requires a connected Git repository before branch-scoped Preview env can be saved.

**Commands run:**
- Separate frontend `git init -b main`, `git add .`, `git commit -m "Initial Backy custom frontend scaffold"` -> PASS.
- `GITHUB_TOKEN= gh repo create <separate-frontend-github-repo> --private --source=. --remote=origin --push` -> PASS.
- `npx --yes vercel@latest git connect <separate-frontend-github-repo-url> --yes` -> expected failure, Vercel cannot access/connect the private repo yet.
- `npx --yes vercel@latest env add <safe Backy env> preview main ...` -> expected failure, no connected Git repository yet.

**Next:**
1. Grant the Vercel GitHub App access to the private separate frontend repository or connect the repo from the Vercel dashboard.
2. Add branch-scoped Preview env after Vercel confirms the Git connection.
3. Attach the public website domain to the separate frontend project only when ready to move DNS away from the current host.
4. Continue Backy UX/editor polish while the external GitHub App access step is pending.

## 2026-06-02 07:53 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Deployed separate frontend verified against Backy

**What changed:**
- Ran the deployed custom frontend DOM/probe gate against the separate website Vercel deployment.
- The gate proves production Backy public site discovery, agent handoff, manifest, OpenAPI, resolve, render, deployment topology, component APIability, deployed DOM `data-backy-*` attributes, and the secret-free `/api/backy-connection` probe.
- Re-ran Backy production public readiness after the latest pushes.
- Re-ran the hosted admin login-shell smoke to confirm the production shell still exposes no seeded demo credentials and no dev MFA phrase.

**Commands run:**
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=<canonical-site-id> BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=devanshvarshney.com BACKY_CUSTOM_FRONTEND_URL=<separate-frontend-deployment> BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 npm run test:custom-frontend-connection --silent` -> PASS, 61 checks.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; optional live admin auth proof skipped by unset credentials.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9491 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS, hosted shell ready, no demo credentials/dev MFA.

**Next:**
1. Connect the separate website frontend project to its own Git repository.
2. Add Preview env after Git connection if branch previews are needed.
3. Attach the public website domain to the separate frontend project only when ready to move DNS away from the current host.
4. Continue the broader Backy UX/editor polish batch after the custom frontend release path remains green.

## 2026-06-02 07:44 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate website Vercel project created with safe env

**What changed:**
- Created and deployed the separate custom website frontend as its own Vercel project from the scaffolded Next.js starter.
- The deploy used only safe Backy public/read env values for the Backy API base, canonical site id, and public host.
- Persisted those same safe env names for the Vercel production and development targets on the separate frontend project.
- Preview branch env could not be persisted yet because the new frontend project has no connected Git repository; Vercel requires a connected repo before branch-scoped Preview env can be saved.
- No live website domain was moved. The public website domain should be attached to the separate frontend project only when ready to switch DNS away from the current host.

**Commands run:**
- `npx --yes vercel@latest deploy . -y ...` from the separate frontend project -> PASS, Vercel build Ready.
- `npx --yes vercel@latest env add <safe Backy env> production --value <public/read value> --yes --force --no-sensitive` -> PASS for six variables.
- `npx --yes vercel@latest env add <safe Backy env> development --value <public/read value> --yes --force --no-sensitive` -> PASS for six variables.
- `npx --yes vercel@latest env add <safe Backy env> preview main ...` -> expected Vercel failure, project has no connected Git repository.
- `npx --yes vercel@latest env list production` -> PASS, only the six safe Backy frontend env names are present.
- `npx --yes vercel@latest env list development` -> PASS, only the six safe Backy frontend env names are present.

**Next:**
1. Connect the separate frontend project to its own Git repository when ready.
2. Add Preview env after Git connection if branch previews are needed.
3. Run the deployed DOM/probe custom frontend gate against the deployed frontend URL.
4. Attach the public website domain to the separate frontend project only when ready to move DNS.

## 2026-06-02 07:29 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate website frontend is scaffolded and locally verified

**What changed:**
- Materialized the real `devanshvarshney.com` separate Next.js custom frontend from Backy's public scaffold path using the published production Backy site.
- The generated frontend uses only browser-safe `NEXT_PUBLIC_BACKY_*` env plus optional server-loader `BACKY_*` env. No Supabase, database, provider, admin, session, bootstrap, cron, or SMTP secrets are present in the scaffold.
- The starter dependency graph now overrides PostCSS to a patched range so future exports do not inherit the known vulnerable transitive range from the Next.js toolchain.
- `npm run test:custom-frontend-starter` now fails if the checked starter drops the PostCSS override.
- Regenerated the public starter file-list template so protected admin exports and no-browser scaffolds inherit the same hardened `package.json`.

**Commands run:**
- `npm run custom-frontend:scaffold -- --site-id devanshvarshney --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --out <separate-frontend-dir>` -> PASS, resolved the production Backy site and wrote the separate Next starter.
- Separate frontend `npm install` -> first audit found a Next/PostCSS transitive moderate advisory; after the Backy starter override, reinstall completed with zero audit findings.
- Separate frontend `npm audit --audit-level=moderate` -> PASS, 0 vulnerabilities.
- Separate frontend `npm run typecheck` with safe Backy env -> PASS.
- Separate frontend `npm run build` with safe Backy env -> PASS.
- Separate frontend `/api/backy-connection` probe on local dev server -> PASS, `success: true`, manifest reachable, no forbidden env values exposed.
- Local strict connection gate with `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1` and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1` -> PASS, 61 checks against production Backy and the local separate frontend.
- `npm run test:custom-frontend-starter --silent` -> PASS, 78 checks.

**Next:**
1. Deploy the separate website frontend as its own Vercel project.
2. Attach `devanshvarshney.com` to that separate frontend project, not to `backy-admin` or `backy-public`.
3. Run the deployed DOM/probe gate with `BACKY_CUSTOM_FRONTEND_URL=<frontend-domain>`, `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1`, and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.

## 2026-06-02 06:59 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Real production site is now published and scaffold-ready

**What changed:**
- Added `npm run custom-frontend:ensure-site` backed by `scripts/ensure-custom-frontend-site.mjs`.
- The command first verifies public site discovery, manifest, and home render. If the site is missing, it can create/update/publish through the protected admin API key boundary.
- When the admin API key is intentionally empty, the command can use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` as a server-side operator fallback. It rejects command-line admin/service-role keys so secrets are not saved in shell history.
- The operator command can seed a minimal published homepage, publish an existing homepage when requested, and print only safe custom frontend env plus the next scaffold/verification commands.
- Help now documents the admin-key path and the Supabase service-role fallback as server-side operator credentials, while preserving the custom frontend secret boundary.
- Production `devanshvarshney`/`devanshvarshney.com` was created/published through the server-side operator path, a homepage was seeded, and the current signed-in Gmail profile was activated as owner on the resolved team.
- The real production site now passes public discovery, manifest, home render, custom frontend connection checks, and no-browser starter scaffolding.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS, 77 checks.
- `npm run test:custom-frontend-connection --silent` -> PASS, 22 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- Production verify-only before creation -> expected failure, `SITE_NOT_FOUND`.
- Production Supabase REST count check -> PASS, one team available for deterministic operator fallback.
- Production ensure-site with server-side Supabase REST fallback -> PASS, site created/published and homepage created/published.
- Production verify-only after creation -> PASS.
- Production scaffold proof with `--site-id devanshvarshney --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --out <tmp>` -> PASS, materialized the separate Next frontend starter.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=<canonical-site-id> BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=devanshvarshney.com BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 50 checks; deployed custom frontend DOM proof skipped because the separate website frontend URL does not exist yet.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `node scripts/ensure-custom-frontend-site.mjs --help` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Use the scaffold command to create the separate `devanshvarshney.com` frontend repo/project.
2. Deploy that separate website frontend on Vercel and attach the public website domain there, not to `backy-admin` or `backy-public`.
3. Run the deployed frontend DOM/probe verification gate with `BACKY_CUSTOM_FRONTEND_URL=<frontend-domain>`, `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1`, and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.

**Post-push deploy verification:**
- Commit `7e651962` pushed to `main`.
- Latest `backy-public` production deployment is Ready.
- Latest `backy-admin` production deployment is Ready.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=<canonical-site-id> BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=devanshvarshney.com BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 50 checks; deployed custom frontend DOM proof skipped because the separate website frontend is not deployed yet.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; optional live admin-auth proof skipped by unset credentials.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9491 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; no demo credentials or dev MFA in hosted admin shell.
- Recent Vercel logs for the latest `backy-public` and `backy-admin` production deployments are empty.

## 2026-06-02 06:08 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Scaffold now refuses missing or unpublished public sites before writing files

**What changed:**
- Hardened `npm run custom-frontend:scaffold` so it verifies public site discovery, manifest, and home render through the configured `backy-public` API before creating a starter manifest or materializing a separate website repo.
- The scaffold command now canonicalizes the resolved public site id/name/slug into the starter export and records `publicSiteVerification` metadata for frontend agents.
- Added an explicit `--skip-site-verify` escape hatch for offline fixture manifests only; the Help and Site Detail copy call out that real launch scaffolds should be verified first.
- Production proof now shows `devanshvarshney` fails correctly with `SITE_NOT_FOUND`, which means the real Backy site must be created/published before the separate `devanshvarshney.com` frontend can be generated safely.
- Production proof against `site-demo` still verifies discovery/manifest/render and materializes the starter file list successfully.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS, 68 checks.
- Missing-site production scaffold proof with `--site-id devanshvarshney --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api` -> expected failure, `SITE_NOT_FOUND`, no starter created.
- Production scaffold proof with `--site-id site-demo --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --out <tmp>` -> PASS, verified resolved site id `69543f53-b4e6-4e2e-b614-96f96174febb` and wrote 15 starter files.
- `npm run test:custom-frontend-connection --silent` -> PASS, 20 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 69 checks.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 48 checks; deployed custom frontend DOM proof skipped because the separate website frontend URL does not exist yet.
- `git diff --check` -> PASS.

**Next:**
1. Run repo-public hygiene.
2. Commit/push this scaffold-readiness slice.
3. In Backy admin, create and publish the real `devanshvarshney` site record before running the scaffold command for `devanshvarshney.com`.

## 2026-06-02 05:48 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate frontend repos can now be scaffolded without a browser download

**What changed:**
- Added `npm run custom-frontend:scaffold` backed by `scripts/scaffold-custom-frontend-starter.mjs`.
- The scaffold command accepts safe public inputs (`--site-id`, `--public-host`, `--api-base`) and emits the same `backy.custom-frontend-starter-export.v1` / `backy.custom-frontend-starter-project.v1` file-list starter schema used by the protected admin download.
- The command can write a starter JSON with `--manifest`, materialize a separate frontend repo with `--out`, or do both; materialization still goes through the existing path-safe materializer and refuses non-empty targets unless `--force`.
- Site Detail now exposes a copyable scaffold command beside Download starter project, and the protected starter export/generated runbook include the matching local scaffold command.
- Help now documents the CLI scaffold path beside the admin starter export and materializer commands.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS, 64 checks.
- `npm run test:custom-frontend-connection --silent` -> PASS, 20 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 65 checks.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 48 checks; deployed custom frontend DOM proof skipped because the separate website frontend URL does not exist yet.
- `git diff --check` -> PASS.

**Next:**
1. Run repo-public hygiene.
2. Commit/push this scaffold slice.
3. After deploy, verify production readiness/logs again, then materialize the real `devanshvarshney.com` separate frontend project or continue only with launch-blocking UI/editor polish.

## 2026-06-02 05:24 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Downloaded starter bundles can now be materialized into a repo

**What changed:**
- Added `npm run custom-frontend:materialize` backed by `scripts/materialize-custom-frontend-starter.mjs`.
- The materializer reads the protected starter JSON, validates `backy.custom-frontend-starter-export.v1` plus `backy.custom-frontend-starter-project.v1`, rejects unsafe absolute/parent/drive paths, refuses non-empty target directories unless `--force`, writes every `files[].path`, and prints install/build/dev commands plus path-safety metadata.
- The protected starter export now includes `starterProject.materializerCommand` and a top-level `materializer` block with the command, target-directory policy, and path-safety policy.
- Help and Site Detail now point owners/frontend agents to the one-command materialization path instead of manual file copying.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> first run caught missing materializer path-safety summary, rerun PASS, 58 checks.
- `npm run test:custom-frontend-connection --silent` -> PASS, 18 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 59 checks.

**Next:**
1. Run `git diff --check` and repo-public hygiene.
2. Commit/push this materializer slice.
3. After deploy, verify live public/admin readiness again and use the materializer command for the real `devanshvarshney.com` separate frontend project.

## 2026-06-02 05:05 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Backy starter export is now a self-contained project bundle

**What changed:**
- Added `scripts/generate-custom-frontend-starter-template.mjs` and generated `apps/public/src/lib/customFrontendStarterProjectTemplate.ts` from the checked `examples/custom-frontend-next` starter.
- Protected `GET /api/admin/sites/:siteId/custom-frontend/starter` now returns `starterProject.schemaVersion=backy.custom-frontend-starter-project.v1`, `exportFormat=file-list`, install/build/dev commands, generated site files, copied starter files, and a complete `files[]` list that can reconstruct the separate Next/Vercel website frontend.
- Site Detail now labels the action as “Download starter project” and exposes `data-starter-project-schema` plus `data-starter-project-format=file-list`.
- Help now tells frontend agents to write every `files[].path` into the separate frontend repo before deploying, instead of assuming local access to the Backy monorepo example.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS, 53 checks.
- `npm run test:custom-frontend-connection --silent` -> first run caught one stale source assertion, rerun PASS, 17 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 54 checks.

**Next:**
1. Run `git diff --check` and repo-public hygiene.
2. Commit/push this self-contained starter project bundle.
3. After deploy, use Site Detail -> Separate custom frontend project -> Download starter project to create the real `devanshvarshney.com` frontend repo, attach the domain to that separate Vercel project, then verify from Backy.

## 2026-06-02 04:39 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Backy now exports a site-specific starter manifest

**What changed:**
- Added protected `GET /api/admin/sites/:siteId/custom-frontend/starter` on `backy-public` for signed-in Backy users with `sites.view`.
- The export returns `backy.custom-frontend-starter-export.v1` with the selected site id/slug/host, `examples/custom-frontend-next` source path, browser-safe `NEXT_PUBLIC_BACKY_*` env, optional server-loader `BACKY_*` env, forbidden private env names, generated `.env.example`, generated `BACKY_FRONTEND_STARTER.md`, preserve-file list, read order, and verifier command.
- Site Detail now has a “Download starter manifest” action inside the Separate custom frontend project panel, beside Copy frontend env and Copy launch JSON.
- Help now exposes the same starter export pointer so a frontend agent can start from the checked starter rather than guessing API shape or env boundaries.

**Commands run:**
- `npm run test:custom-frontend-connection --silent` -> PASS, 15 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> first run hit transient local `ECONNRESET` before assertions, rerun PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.

**Next:**
1. Run `git diff --check` and repo-public hygiene.
2. Commit/push this starter-export slice and verify Vercel production again.
3. Use Site Detail -> Separate custom frontend project -> Download starter manifest when creating the real `devanshvarshney.com` frontend project.

## 2026-06-02 04:10 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Backy admin can now verify a deployed separate frontend

**What changed:**
- Added protected `POST /api/admin/sites/:siteId/custom-frontend/connection` on `backy-public` for owner/admin use from Site Detail.
- The verifier validates a deployed frontend URL with public-host checks, DNS/private/reserved-address rejection, `/api/backy-connection` JSON proof, required `data-backy-*` DOM control attributes, expected Backy API/site/host values, and forbidden private env names without returning secret values.
- Site Detail now has a “Verify deployed frontend” panel inside the Separate custom frontend project handoff, with per-check pass/warning/fail output.
- Help now includes the same verifier in the separate-custom-frontend checklist and copyable agent handoff guidance, so owners and frontend agents do not rely only on shell commands.

**Commands run:**
- `npm run test:custom-frontend-connection --silent` -> PASS, 14 source checks; live API/frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 42 checks; deployed frontend DOM/probe proof skipped because the separate website frontend URL does not exist yet.
- `git diff --check` -> PASS.

**Next:**
1. Run final repo-public hygiene, commit/push this verifier slice, then re-read the survival guide.
2. Create/connect the real separate custom website frontend project for `devanshvarshney.com`.
3. Paste the deployed frontend URL into Site Detail -> Separate custom frontend project -> Verify deployed frontend, and also run `npm run test:custom-frontend-connection` with `BACKY_CUSTOM_FRONTEND_URL=<frontend-domain>`, `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1`, and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.

## 2026-06-02 03:39 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Custom frontend self-probe slice is production-deployed

**Verification:**
- `291c8b84 feat(examples): add custom frontend connection probe` is pushed to `main`.
- Latest `backy-public` production deployment is Ready.
- Latest `backy-admin` production deployment is Ready.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 39 checks; deployed custom frontend DOM/probe proof skipped because the separate website frontend URL does not exist yet.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; live admin auth proof skipped because credential env is intentionally unset.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9437 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; hosted login shell still has no demo credentials, seed passwords, or dev MFA phrase.
- Recent `backy-public` Vercel error logs -> PASS, no logs found.
- Recent `backy-admin` Vercel error logs -> PASS, no logs found.

**Next:**
1. Create/connect the real separate custom website frontend project for `devanshvarshney.com`.
2. Point that frontend at `https://backy-public.vercel.app/api` using only safe browser/server-loader env.
3. Attach the public website domain to that custom frontend project, not to `backy-admin` or `backy-public`.
4. Rerun `npm run test:custom-frontend-connection` with `BACKY_CUSTOM_FRONTEND_URL=<frontend-domain>`, `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1`, and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.

## 2026-06-02 03:29 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Starter now has a deployed self-probe for full Backy control verification

**What changed:**
- Added `examples/custom-frontend-next/src/app/api/backy-connection/route.ts`, a public, secret-free `backy.custom-frontend-connection.v1` endpoint for separate custom frontend deployments.
- The probe reports public Backy API base, site id, public host, manifest reachability, required DOM control attributes, and forbidden private env names present by name only. It never returns secret values.
- `npm run test:custom-frontend-connection` now checks the deployed frontend probe when a frontend URL is supplied and can require it with `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`.
- Starter docs, README, AGENTS, Help, and the custom frontend handoff spec now tell frontend agents to require both DOM attributes and the probe before handing a separate website to users.
- Kept Next 16's required starter `tsconfig` shape so the standalone custom frontend starter builds cleanly.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS, 43 checks.
- `npm run test:custom-frontend-connection --silent` -> PASS, 11 source checks; live API/frontend URL skipped by unset env.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS, 44 checks.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 39 checks.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `git diff --check` -> PASS.
- Initial `npm --prefix examples/custom-frontend-next run build --silent` without env failed as expected because the separate frontend requires a Backy public API base.
- `NEXT_PUBLIC_BACKY_API_BASE_URL=https://backy-public.vercel.app/api NEXT_PUBLIC_BACKY_SITE_ID=site-demo BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app/api BACKY_SITE_ID=site-demo npm --prefix examples/custom-frontend-next run build --silent` -> PASS; `/api/backy-connection` listed as dynamic.
- Local starter dev server on `127.0.0.1:4317` plus `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_URL=http://127.0.0.1:4317 BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 npm run test:custom-frontend-connection --silent` -> PASS, 49 checks.

**Next:**
1. Run final hygiene, commit/push this probe slice, then re-read the survival guide.
2. When the real website frontend exists, run the same 49-check class of proof against its deployed URL and public domain.

## 2026-06-02 03:03 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Custom frontend connection gate is production-verified

**Verification:**
- `7ea5c3aa feat(scripts): add custom frontend connection gate` is pushed to `main`.
- Latest `backy-public` production deployment is Ready.
- Latest `backy-admin` production deployment is Ready.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://backy-public.vercel.app/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 38 checks; deployed custom frontend DOM proof skipped because no separate frontend URL exists yet.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; live admin auth proof skipped because credential env is intentionally unset.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9550 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; hosted login shell still has no demo credentials or dev MFA phrase.
- Recent `backy-public` Vercel error logs -> PASS, no logs found.
- Recent `backy-admin` Vercel error logs -> PASS, no logs found.

**Next:**
1. Create/connect the real separate custom website frontend project, point its safe env at `https://backy-public.vercel.app/api`, and attach the public website domain to that frontend project.
2. After the frontend deploy exists, rerun `npm run test:custom-frontend-connection` with `BACKY_CUSTOM_FRONTEND_URL=<frontend-domain>` and `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1` so DOM control attributes are release-proven.
3. Keep the four remaining Partial audit rows as external Settings/Commerce provider certification artifacts; do not fake them.

## 2026-06-02 02:53 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate website connection is now a checked launch gate

**What changed:**
- Added `npm run test:custom-frontend-connection`, a non-secret smoke that proves Backy custom frontend readiness from source, optional live public API, and optional deployed frontend DOM checks.
- The gate validates public site discovery, agent handoff, manifest, OpenAPI, resolve, render, component APIability, deployment topology, and the required `data-backy-*` DOM control attributes for separate custom frontends.
- Help, README, AGENTS, the custom frontend handoff spec, OpenAPI, manifest schema, core handoff metadata, and generated SDK contract types now point frontend agents at this connection proof before a separate Vercel frontend is handed to users.

**Commands run:**
- `npm run test:custom-frontend-connection --silent` -> PASS, 10 source checks; live API/frontend URL skipped by unset env.
- `BACKY_CUSTOM_FRONTEND_API_BASE_URL=http://127.0.0.1:3001/api BACKY_CUSTOM_FRONTEND_SITE_ID=site-demo BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection --silent` -> PASS, 38 live local public API checks; deployed frontend URL skipped by unset env.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:help-rendered --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `npm run test:frontend-contract-types --silent` -> PASS.
- `npm run test:custom-frontend-starter --silent` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Run final repo-public hygiene, commit/push this connection gate slice, then re-read the survival guide.
2. After deploy, run the same gate against `https://backy-public.vercel.app/api`; require `BACKY_CUSTOM_FRONTEND_URL` only after the separate custom website project is deployed.
3. If limits force a pause, resume only with production custom frontend/domain connection proof and owner-controlled site setup before broad UI polish.

## 2026-06-02 02:25 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Starter now preserves richer per-element APIability metadata for generated frontends

**What changed:**
- Extended the self-contained Next.js starter's local Backy element type to include parent ids, responsive overrides, token refs, animation metadata, actions, data bindings, binding slots, accessibility, asset ids, and metadata.
- Updated `examples/custom-frontend-next/src/lib/render.tsx` so every rendered Backy element keeps DOM-readable component contract pointers, prop/style key lists, responsive breakpoint names, token ref keys, asset ids, action/binding counts, animation type, accessibility label, editable-map count, and the canonical editable-map pointer.
- Updated the starter README and smoke guard so future frontend/design-system rewrites keep Backy ids, element types, API contract pointers, responsive/style metadata, token refs, binding/motion/asset metadata, editable-map pointers, and form/newsletter boundaries intact.

**Commands run:**
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit/push this richer custom frontend DOM contract slice after final hygiene.
2. Continue only with launch-critical custom frontend/site-control/backend gaps before broader UI polish.

## 2026-06-02 02:14 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Starter is now installable as a separate Vercel project without a published SDK package

**What changed:**
- Confirmed `npm view @backy/sdk-js version --json` currently returns `E404`, so a fresh custom frontend project would fail install if the starter depended on the unpublished SDK package.
- Replaced the starter's runtime SDK dependency with `examples/custom-frontend-next/src/lib/backy-client.ts`, a tiny public client that preserves the same `createBackyCustomFrontendClient({ env: process.env })` bootstrap shape, strips `/api` from public API bases, passes public host context as `domain`, and exposes render, manifest, newsletter signup, form definition, and form submission calls.
- Updated the starter package, docs, and smoke script so a separate Vercel project can install immediately with only Next/React dependencies while the full `@backy/sdk-js` remains the monorepo SDK path for generated/internal clients and later package-registry publication.

**Commands run:**
- `npm view @backy/sdk-js version --json` -> expected `E404`, package not published.
- `npm pack --workspace @backy/sdk-js --dry-run --json` -> PASS, local SDK package remains packable.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Run final hygiene after docs update, commit/push this installability hardening slice, then re-read the survival guide.
2. If continuing, prioritize live custom frontend setup proof or verified-domain/site-control defects before broad UI polish.

## 2026-06-02 02:02 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Separate Next.js website starter is now checked and smoke-tested

**What changed:**
- Added `examples/custom-frontend-next`, a minimal separate custom website frontend that boots from safe Backy env, uses `createBackyCustomFrontendClient({ env: process.env })`, renders Backy public `render()` payloads with host context, and preserves `data-backy-element-id` / `data-backy-element-type` on rendered elements.
- The starter includes a catch-all route, lightweight element renderer, newsletter signup route, and public form submission route. It does not call admin APIs or require database, provider, SMTP, cron, bootstrap, or service-role env.
- Added `scripts/custom-frontend-starter-smoke.mjs` and root `npm run test:custom-frontend-starter` so the starter stays aligned with safe env, SDK bootstrap, public route rendering, element APIability attributes, newsletter signup, and public form submission.
- Updated `.env.example`, `AGENTS.md`, `packages/sdk-js/README.md`, and `specs/custom-frontend-agent-handoff.md` to point frontend agents at the checked starter and the browser-safe custom frontend env block.

**Commands run:**
- `npm run test:custom-frontend-starter --silent` -> PASS.
- `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Run final hygiene after docs update, commit/push this custom frontend starter slice, then re-read the survival guide.
2. If continuing before halt, prioritize only launch-blocking custom frontend production setup or verified-domain/site-control defects.

## 2026-06-02 01:46 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Custom frontend SDK bootstrap slice is production-verified

**Verification:**
- `8e6fd479 feat(sdk): bootstrap custom frontends from safe env` is pushed to `main`.
- Latest `backy-admin` production deployment is Ready.
- Latest `backy-public` production deployment is Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; live admin auth proof skipped because credential env is intentionally unset.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9549 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; hosted login shell still has no demo credentials or dev MFA phrase.
- Direct `https://backy-public.vercel.app/api/sites/site-demo/agent-handoff` assertion -> PASS; deployed `handoff.sdk.helpers` includes `createBackyCustomFrontendClient`, `createBackyCustomFrontendClientFromEnv`, and `resolveBackyCustomFrontendConfig`.
- Recent `backy-admin` Vercel error logs -> PASS, no logs found.
- Recent `backy-public` Vercel error logs -> PASS, no logs found.

**Next:**
1. Continue Batch 5 only with release-critical backend/custom-frontend gaps if work continues before halt.
2. Do not spend remaining limits on broad UI polish unless it blocks creating/controlling a custom frontend-backed site.

## 2026-06-02 01:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** SDK bootstrap now matches the browser-safe env handoff

**What changed:**
- `@backy/sdk-js` now accepts `apiBaseUrl` or browser-safe `NEXT_PUBLIC_BACKY_API_BASE_URL` values ending in `/api`, normalizes them to the Backy public origin for internal calls, and exposes `getApiBaseUrl()`.
- `BackyClient` now carries `sitePublicHost` and sends it as `domain` for `resolve()`, `render()`, and `renderCached()` by default, with per-call `domain`/`host` overrides for subdomains.
- New SDK helpers `resolveBackyCustomFrontendConfig`, `createBackyCustomFrontendClient`, and `createBackyCustomFrontendClientFromEnv` let a separate custom website project bootstrap from the safe `NEXT_PUBLIC_BACKY_*` or server-loader `BACKY_*` env block without hand-rolled URL glue.
- Public `/agent-handoff`/manifest handoff metadata, `AGENTS.md`, `specs/custom-frontend-agent-handoff.md`, and in-app Help now advertise the helper path and keep forbidden database/Supabase/provider/admin/session/bootstrap/cron/SMTP secrets out of custom frontends.

**Commands run:**
- `npm run typecheck --workspace @backy-cms/core --silent` -> PASS.
- `npm run typecheck --workspace @backy/sdk-js --silent` -> PASS.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run build --workspace @backy-cms/core --silent` -> PASS.
- `npm run build --workspace @backy/sdk-js --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_SDK_SKIP_WRITE_SMOKE=1 BACKY_SDK_MFA_CODE=backy-dev-mfa npm run test:smoke --workspace @backy/sdk-js --silent` -> PASS.
- `BACKY_HELP_RENDERED_SMOKE=1 npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Run final hygiene, commit/push this SDK bootstrap slice, then re-read the survival guide.
2. If continuing before halt, prioritize only launch-blocking backend/custom-frontend issues. The four remaining Partial rows are still external Settings/Commerce provider evidence gates.

## 2026-06-02 01:09 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Custom frontend Help checklist slice is production-verified

**Verification:**
- `a9778ab7 feat(admin): document custom frontend connection checklist` is pushed to `main`.
- Latest `backy-admin` production deployment is Ready, created 2026-06-02 01:01 IST.
- Latest `backy-public` production deployment is Ready, created 2026-06-02 01:01 IST.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks; live admin auth proof skipped because credential env is intentionally unset.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9548 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS; hosted login shell still has no demo credentials or dev MFA phrase.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs found.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs found.

**Next:**
1. Continue Batch 5 only with release-critical custom frontend/backend gaps first; defer broad design polish unless it blocks launch use.

## 2026-06-02 00:59 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Help now has a guarded separate-frontend connection checklist

**What changed:**
- `apps/admin/src/routes/help.tsx` now has a dedicated "Connect a separate custom frontend" topic and checklist.
- The checklist tells owners/frontend agents to attach the production domain to the separate custom frontend Vercel project, keep `backy-admin` protected, keep `backy-public` as API/render origin, configure only browser-safe `NEXT_PUBLIC_BACKY_*` env in the frontend bundle, and keep Supabase/database/provider/admin/session/bootstrap/cron secrets out of the frontend.
- It exposes copyable browser env, optional server-loader env, host-aware read endpoints, and forbidden-secret boundaries for the active `siteId`.
- `apps/admin/scripts/help-smoke.mjs` now source-guards and rendered-smoke-guards the checklist, copy controls, host-aware resolve/render URLs, and secret boundary text.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_HELP_RENDERED_SMOKE=1 npm run test:help --workspace @backy-cms/admin --silent` -> PASS.

**Next:**
1. Run repo public hygiene, commit/push this Help handoff slice, then continue only with release-critical custom frontend/backend gaps.

## 2026-06-02 00:49 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Blog verification status:** Rendered Blog list smoke is stable again

**What changed:**
- `apps/admin/scripts/blog-list-smoke.mjs` now retries only idempotent GET API requests on short network failures.
- POST/PUT/PATCH/DELETE smoke mutations remain single-attempt, so the harness does not duplicate created posts, categories, tags, or destructive cleanup operations.

**Commands run:**
- `npm run test:blog-list --workspace @backy-cms/admin --silent` -> PASS before the patch, proving the earlier `ECONNRESET` was transient.
- `BACKY_BLOG_LIST_SOURCE_ONLY=1 npm run test:blog-list --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:blog-list --workspace @backy-cms/admin --silent` -> PASS after the patch.

**Notes:**
- This closes the previous verification note from the custom-frontend alias handoff slice. Blog list, taxonomy management, command-create navigation, focused blog canvas entry, preview URL generation, and visual table containment all passed in the rendered smoke.

**Next:**
1. Run diff/hygiene gates, commit, push, and continue Batch 5 with the next visible editor/admin friction point.

## 2026-06-02 00:33 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Same-site domains and subdomains now feed site selection and handoff surfaces

**What changed:**
- `apps/admin/src/lib/siteSelection.ts` now normalizes host identifiers and matches sites by `customDomain`, `settings.domainVerification.domain`, `settings.domainAliases[].host`, and managed `{slug}.backy.app` hosts in addition to internal ids.
- Header, Sidebar, Dashboard, and Sites now use the same primary-host/alias helpers, so site switching, Dashboard custom frontend launch env, Sites API handoff, exports, and visible domain labels stay aligned for `devanshvarshney.com` plus aliases such as `blog.devanshvarshney.com`.
- `useDataTable` now supports route-specific searchable text, and Sites uses it so custom domains and alias hosts are searchable/exportable without leaking secrets.

**Commands run:**
- `BACKY_SITES_SOURCE_ONLY=1 npm run test:sites --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_DASHBOARD_SOURCE_ONLY=1 npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:newsletter --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_BLOG_LIST_SOURCE_ONLY=1 npm run test:blog-list --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `git push` -> PASS, `dd5a9ef5 feat(admin): honor site domain aliases in handoff` pushed to `main`.
- Latest `backy-admin` production deployment -> Ready.
- Latest `backy-public` production deployment -> Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9547 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.

**Notes:**
- A full rendered `npm run test:blog-list --workspace @backy-cms/admin --silent` attempt hit `fetch failed` / `ECONNRESET` from the local API while waiting for taxonomy. The source guard passed; no product code was changed for blog taxonomy.
- This is the critical pre-halt custom frontend path: the public website domain belongs on the separate custom frontend Vercel project, while Backy stores site/content/design state and serves the API/render contracts through `backy-public`.

**Next:**
1. Continue Batch 5 with the next visible editor/admin friction point when limits allow.

## 2026-06-01 23:49 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Dashboard custom frontend launch slice is production-verified

**Verification:**
- `331ebd18 feat(admin): surface custom frontend launch on dashboard` is pushed to `main`.
- Latest `backy-public` and `backy-admin` production deployments are Ready on Vercel.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS, 47 checks.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9546 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs found.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs found.

**Notes:**
- The production admin shell remains protected: no demo credentials, no seeded admin/editor copy, and no dev MFA phrase.
- The public production readiness gate still warns when live admin credentials are not provided for the optional admin auth proof; the shell and public contract checks are green.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 23:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Dashboard status:** Custom frontend launch is now visible from the main cockpit

**What changed:**
- `apps/admin/src/routes/index.tsx` now adds `backy.dashboard-custom-frontend-launch.v1` to the dashboard handoff payload.
- Dashboard API consumer readiness now includes a visible Custom frontend launch panel with browser-safe `NEXT_PUBLIC_BACKY_*` env, server-loader `BACKY_*` env, public host, agent-handoff read start, and a Sites handoff shortcut.
- `apps/admin/scripts/dashboard-smoke.mjs` now source- and render-checks the launch card schema, domain owner, browser-safe env keys, and visible custom frontend handoff copy.

**Commands run:**
- `BACKY_DASHBOARD_SOURCE_ONLY=1 npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.

**Notes:**
- This reduces the gap between "Backy has the custom frontend contract" and "an owner can find the exact launch env from the first dashboard screen."
- The panel still respects the security boundary: custom website projects receive public/read env only, while Supabase, database, provider, cron, admin, bootstrap, and session secrets remain forbidden.

**Next:**
1. Run repo-public hygiene, commit and push this Dashboard launch-handoff slice, then verify production deployments.

## 2026-06-01 23:04 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Sites and New Site now show the same browser-safe env split as Site Detail and public handoff

**What changed:**
- `apps/admin/src/routes/sites.tsx` now adds `NEXT_PUBLIC_BACKY_*`, `browserSafeEnv`, `serverSideEnv`, and `domainOwner` metadata to the selected-site frontend contract.
- The Sites API panel now separates browser-safe website frontend env from server-side loader env so frontend agents do not copy `BACKY_*` names into client bundles by mistake.
- `apps/admin/src/routes/sites.new.tsx` now previews the same browser-safe/server-side env split before a site is created.
- `apps/admin/scripts/sites-smoke.mjs` guards the source and rendered UI labels so Site List and New Site stay aligned with `/agent-handoff`, Help, and Site Detail.

**Commands run:**
- `BACKY_SITES_SOURCE_ONLY=1 npm run test:sites --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:sites --workspace @backy-cms/admin --silent` -> PASS.

**Notes:**
- This is the UI side of the custom frontend deployment flow for domains such as `devanshvarshney.com`: Backy remains the backend/API source of truth, `backy-public` is the public API/render origin, and the separate custom website Vercel project owns the public domain.
- The handoff deliberately exposes only endpoint/env names and browser-safe values. Supabase, database, provider, admin, bootstrap, and session secrets remain forbidden from the custom frontend project.

**Next:**
1. Run final hygiene, commit and push this Sites/New Site handoff alignment slice, then verify production deployments.

## 2026-06-01 22:35 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Public handoff now advertises the browser-safe env boundary for separate website projects

**What changed:**
- `packages/core/src/custom-frontend-agent-handoff.ts` now exposes browser-safe `NEXT_PUBLIC_BACKY_*` env, server-side `BACKY_*` equivalents, custom frontend project domain ownership, API origin policy, and forbidden-secret boundaries in both routing handoff and deployment topology.
- The frontend manifest schema, generated SDK contract types, SDK smoke, and public frontend-contract smoke now guard those fields so `/agent-handoff`, manifest, OpenAPI mirrors, and generated clients stay aligned.
- Help, `AGENTS.md`, and custom frontend specs now tell frontend agents to attach the public website domain to the separate website Vercel project, use `backy-public` as the API/render origin, and keep Supabase/database/provider/admin secrets out of frontend bundles.

**Commands run:**
- `npm run test:frontend-contract-types --silent` -> PASS.
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_ADMIN_MFA_CODE=backy-dev-mfa node packages/sdk-js/scripts/smoke.mjs` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- This makes the custom website deployment flow machine-readable for AI/frontend agents: Backy remains the source of truth, `backy-admin` stays protected, `backy-public` serves API/render contracts, and a third Vercel project owns the public website domain.
- The contract deliberately exposes env variable names and endpoint roles only; no secret values, provider tokens, database URLs, or admin/session material are included.

**Next:**
1. Commit and push this public handoff/env-boundary slice, then verify the production deployments.

## 2026-06-01 22:01 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Custom frontend status:** Site Detail now gives owners a copyable separate-frontend launch plan

**What changed:**
- `apps/admin/src/routes/sites.$siteId.tsx` now adds `backy.custom-frontend-project-launch.v1` to the site workspace handoff so a site owner or frontend agent can distinguish protected `backy-admin`, public `backy-public`, and the separate public website frontend project.
- Site Detail's Frontend handoff now includes a visible "Separate custom frontend project" block with browser-safe `NEXT_PUBLIC_BACKY_*` env, server-side equivalents, the primary host context, the Backy public API origin, and explicit forbidden-secret boundaries.
- `apps/admin/scripts/site-detail-smoke.mjs` now source- and render-checks the launch block, copy buttons, schema/model metadata, env values, and no-secret warning.

**Commands run:**
- `npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- This turns the `devanshvarshney.com` custom-frontend answer into an in-product workflow: attach the domain to the custom website frontend Vercel project, keep Backy as CMS/API/runtime, and copy only public/read env to the frontend.
- The launch plan intentionally contains env names and endpoint templates only; it does not expose Supabase, database, provider, admin-session, mail, commerce, or bootstrap secrets.

**Next:**
1. Commit and push this Site Detail launch-handoff slice, then continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 21:33 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Editor status:** Compact editor viewports no longer squeeze the canvas with fixed side rails

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx` now detects compact editor shell widths (`max-width: 1023px`) and auto-collapses Components/Inspector/Layers rails into overlay panels instead of docking both rails beside the canvas.
- Compact Components and Layers/Inspector overlays expose responsive mode metadata, close via a backdrop, and preserve the canvas viewport width while open.
- `ComponentLibrary` and `LayersPanel` now allow `min-w-0` compact widths and keep their larger docked width contracts on `lg` and wider screens.
- `apps/admin/scripts/editor-drag-smoke.mjs` now proves compact shell auto-collapse, overlay open/close behavior, unchanged canvas width while overlays are open, and desktop docked-panel restoration.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-responsive --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-responsive --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-preview-scroll --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- This follows the subagent finding that the editor route is a separate canvas surface from ordinary admin pages: the route shell was contained, but compact editor widths still needed panel behavior that gives canvas work the primary space.
- The user asked how to connect `devanshvarshney.com` as a separate custom frontend; answer after this commit should describe Backy as API/backend, `backy-admin` as protected editor, `backy-public` as public API/runtime, and the actual site as a third Vercel frontend project.

**Next:**
1. Commit and push this editor compact-shell slice, then answer the custom frontend/domain wiring question clearly.

## 2026-06-01 20:28 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Admin shell status:** Global route-containment smoke now covers ordinary admin routes broadly

**What changed:**
- `apps/admin/scripts/login-smoke.mjs` now verifies the ordinary admin route frame across Dashboard, Sites, Site Detail, New Site, Pages, New Page, Blog, Media, Collections, Reusable Sections, Forms, Contacts, Comments, Newsletter, Products, Orders, Users, New User, User Detail, Teams, Settings, and Help.
- The account-menu close assertion now uses a real pointer path so it follows the rendered header/backdrop behavior instead of calling the button handler directly.

**Commands run:**
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:login --workspace @backy-cms/admin --silent` -> PASS, with all expanded ordinary route containment states green.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- This responds to the user's clarification that the layout issue is global, not only visible on `/sites/new`.
- Editor routes keep their separate `editor-route-unframed` canvas contract; this smoke covers ordinary management pages where the blank body scroll/overlap issue belongs.

**Next:**
1. Commit and push this verification hardening slice, then continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 20:05 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Global route-containment slice pushed and verified on production

**What changed:**
- Pushed `2cca0970 fix(admin): contain ordinary route layouts` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9538 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 19:56 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Admin shell status:** Ordinary admin pages now share one route-containment contract

**What changed:**
- `apps/admin/src/components/layout/MainLayout.tsx` now marks the main pane as the route-scroll owner, adds a stable scrollbar gutter, and wraps non-editor routes in a clipped `admin-content-frame`.
- `apps/admin/src/components/layout/PageShell.tsx` now exposes a contained page-shell contract and clips route content overflow.
- `apps/admin/src/components/ui/Panel.tsx` now wraps header/action text inside the available width instead of letting actions force page overflow.
- `apps/admin/src/components/ui/DataGrid.tsx` now respects the parent shell width with `maxInlineSize: '100%'` instead of using a viewport subtraction guess.
- `apps/admin/scripts/login-smoke.mjs` now verifies Dashboard, Pages, Users, Settings, and New Site all keep browser scroll pinned, body/root locked, route content inside the shell, and horizontal document overflow at zero.
- `apps/admin/scripts/pages-list-smoke.mjs` was aligned with the new shared `DataGrid` containment rule.

**Commands run:**
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:pages-list --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:users --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:sites --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:settings --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- The user clarified the blank-space/overlap issue was global. This slice fixes it in shared layout primitives rather than chasing individual routes.
- Users and Sites smokes intentionally mutate `user-admin` role for RBAC checks; they were rerun sequentially and `user-admin` was restored to `owner/active` after the Sites smoke.
- A stale local Next dev server on `3001` was accepting connections but hanging; it was restarted with `BACKY_ADMIN_MFA_CODE=backy-dev-mfa` before rendered smokes.

**Next:**
1. Commit and push this global route-containment slice, then verify production deployment.

## 2026-06-01 18:39 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Admin shell scroll-lock slice pushed and verified on production

**What changed:**
- Pushed `d32950b7 fix(admin): lock authenticated shell scrolling` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready after an initial Building wait.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9534 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 18:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Admin shell status:** Authenticated route scrolling is now owned by the shell, not the browser document

**What changed:**
- `apps/admin/src/components/layout/MainLayout.tsx` now locks `html`, `body`, and `#root` while authenticated admin routes are mounted, resets leaked document scroll on route changes, and renders a shared operational footer inside ordinary main-scroll routes.
- `apps/admin/src/index.css` adds the corresponding admin-shell document scroll lock.
- `apps/admin/src/components/layout/Header.tsx` now refreshes the latest global-search load key on every new site-aware search request so active-site changes cannot leave search stuck in `loading`.
- `apps/admin/scripts/login-smoke.mjs` guards the shell lock/footer and global-search stale-load behavior.
- `apps/admin/scripts/sites-smoke.mjs` now validates `/sites/new` specifically: browser `window` scroll remains pinned, the main pane owns overflow, the create form is reachable, and the shared footer terminates the route.

**Commands run:**
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:sites --workspace @backy-cms/admin --silent` -> PASS after one transient local backend `ECONNRESET` retry.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Notes:**
- This fixes the cross-route blank-body scroll issue the user saw on `/sites/new`; the change is shell-level so it applies to all non-editor admin pages.
- Editor routes still keep their specialized canvas workspace layout and are not given the new ordinary-route footer.

**Next:**
1. Commit and push this shell polish slice, then verify production deployment.

## 2026-06-01 17:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Newsletter audience-controls slice pushed and verified on production

**What changed:**
- Pushed `73a8edaf fix(admin): add newsletter audience controls` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9530 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Push this deployment record and continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 17:24 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Newsletter subscriber status:** Newsletter workspace now has operator-grade audience views

**What changed:**
- `apps/admin/src/routes/newsletter.tsx`: added subscriber audience filters for All, Send-ready, Held, and Unsubscribed, with counts derived from the canonical send-ready/subscribed logic.
- Added subscriber search across email, name, lifecycle status, newsletter status, topic, source, form id/name/title, and visible-count metadata on the subscriber list.
- CSV export now follows the visible audience view and tells operators when a filtered view has no exportable subscribers.
- `apps/admin/scripts/newsletter-smoke.mjs`: source coverage now guards the audience filters, search affordance, visible-count metadata, accessible pressed state, and filtered export semantics.

**Commands run:**
- `npm run test:newsletter --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit, push, and verify production deployment readiness.

## 2026-06-01 17:03 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Users owner-continuity slice pushed and verified on production

**What changed:**
- Pushed `2b8486c0 fix(admin): surface users owner continuity` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9528 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 16:52 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Users authority status:** Users page now surfaces active owner/admin safety before account mutations

**What changed:**
- `apps/admin/src/routes/users.tsx`: added a **Workspace authority** panel to the Users command center with signed-in role/status, active owner/admin/user counts, invited owner count, authority state, and direct filters for active owners/admin authority.
- The Users readiness model now distinguishes owner continuity from broader admin continuity, so workspaces can see whether they have an active owner before changing roles, domains, Settings, or protected admin controls.
- The users handoff manifest now includes non-PII owner/admin authority counts and state for frontend/admin agents.
- `apps/admin/scripts/users-smoke.mjs`: source and rendered smoke coverage now proves the authority panel, counts, review filters, provider boundary, and final owner/admin guardrail copy remain visible.

**Commands run:**
- `BACKY_USERS_SOURCE_ONLY=1 npm run test:users --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_USERS_CDP_PORT=9527 npm run test:users --workspace @backy-cms/admin --silent` -> PASS.

**Next:**
1. Run diff hygiene and public repo hygiene.
2. Commit, push, and verify production deployments.

## 2026-06-01 16:19 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Dashboard account-authority slice pushed and verified on production

**What changed:**
- Pushed `8819f704 fix(admin): surface dashboard owner authority` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9525 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible editor/admin friction point.

## 2026-06-01 16:04 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Dashboard access status:** Dashboard now surfaces owner/admin authority and role-gated access state

**What changed:**
- `apps/admin/src/routes/index.tsx`: the Dashboard RBAC section now exposes an **Account authority** panel with signed-in role/source, active owner/admin/user counts, access state, and direct Users/Settings review actions when the current role permits them.
- The Team access readiness signal now distinguishes active owners from active admins instead of collapsing both into one admin count.
- `apps/admin/scripts/dashboard-smoke.mjs`: source and rendered smoke coverage now proves the authority panel, role copy, owner count, and review actions remain visible in the Dashboard RBAC disclosure.

**Commands run:**
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_DASHBOARD_SOURCE_ONLY=1 npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.

**Operational answer:**
- Backy is production-reachable and role-aware. Supabase/Auth proves identity first; Backy profile role/status controls Settings, Users, shortcuts, and admin actions. This Dashboard slice makes that separation visible so owner cleanup and editor/admin differences are understandable without leaving Backy.

**Next:**
1. Run public repo hygiene, commit, push, and verify Vercel production deployments.
2. Continue Batch 5 with the next visible editor/admin friction point.

## 2026-06-01 15:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Selected-component API Inspector handoff slice pushed and verified on production

**What changed:**
- Pushed `732a7ed1 feat(editor): expose selected component API contract` to `origin/main`.
- Vercel deployed both `backy-public` and `backy-admin` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9517 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Commit and push this deploy-verification record.
2. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 15:11 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Editor handoff status:** Selected canvas layers now expose copyable component API contracts in Inspector

**What changed:**
- `apps/admin/src/components/editor/PropertyPanel.tsx`: added an Inspector **Element API** disclosure for the selected layer with machine-readable schema/source metadata, selected element id/type, prop/responsive/binding counts, the canonical component-contract pointer, the public render pointer, and a copyable JSON contract.
- `apps/admin/scripts/editor-drag-smoke.mjs`: added source and rendered Inspector smoke coverage that proves the selected layer API card and copy action are present for a real canvas selection.

**Commands run:**
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_EDITOR_INSPECTOR_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit and push the selected-component API Inspector handoff slice.
2. Verify Vercel production deployments after the push, then continue Batch 5.

## 2026-06-01 14:34 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Domain/subdomain alias slice pushed and verified on production

**What changed:**
- Pushed `20ba4a8b feat(sites): expose same-site domain aliases` to `origin/main`.
- Vercel deployed both `backy-public` and `backy-admin` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9510 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 14:21 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Domain/subdomain status:** Same-site aliases are now first-class in Backy settings, routing, and handoff payloads

**What changed:**
- `site.settings.domainAliases` now persists multiple same-site verified hosts/subdomains through admin site update APIs, local/demo store normalization, and Supabase repository normalization.
- Public host matching now treats verified aliases as routable hosts while leaving unverified aliases blocked unless an explicit development override is used.
- Manifest, OpenAPI, SDK contract types, and `/agent-handoff` now expose aliases in delivery/routing metadata so custom frontend agents can distinguish same-site aliases from independent subdomain sites.
- Site Detail now has a domain aliases/subdomains textarea, saved alias status cards, copy action, manual DNS preparation/verification controls, and handoff copy that explains when to use one Backy site versus separate sites.

**Commands run:**
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_SITE_DETAIL_SOURCE_ONLY=1 npm run test:site-detail --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:localized-routes --workspace @backy/public --silent` -> PASS.
- `npm run test:frontend-contract --workspace @backy/public --silent` -> PASS.
- `npm run test:public-security --workspace @backy/public --silent` -> PASS.
- `npm run test:frontend-contract-types --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Next:**
1. Commit and push this domain/subdomain alias slice.
2. Re-read survival guide and continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 12:38 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Header role-control polish pushed and verified on production

**What changed:**
- Pushed `8ac88c33 fix(admin): surface role-aware account controls` to `origin/main`.
- Vercel deployed both `backy-admin` and `backy-public` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9504 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 12:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Header UX status:** Account menu now exposes and respects the active role

**What changed:**
- `apps/admin/src/components/layout/Header.tsx`: the account toggle and menu now show the active Backy role plus permission source, so owners/admins/editors/viewers can see why controls differ.
- The account Settings action now uses the same role/permission matrix gate as the rest of navigation. Users without `settings.view` see a blocked Settings action with a precise reason instead of clicking through to an unavailable page.
- `apps/admin/scripts/login-smoke.mjs`: rendered header/account-menu smoke now checks the role badge, permission source, and Settings action state.

**Commands run:**
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_LOGIN_CDP_PORT=9503 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest pushed deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest pushed deployment Ready.

**Next:**
1. Run public repo hygiene, commit, push, then continue Batch 5.

## 2026-06-01 12:04 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Help UX status:** Role-aware admin controls are now searchable in Help

**What changed:**
- `apps/admin/src/routes/help.tsx`: the workspace access topic now explains that Backy gates navigation, quick-create buttons, dashboard shortcuts, Settings panels, and Users controls from the signed-in Backy profile role plus the backend permission matrix.
- The same topic now distinguishes hosted identity-provider login from Backy profile role/status/invite state and explains why provider-created identities start invited/inactive until activated.
- `apps/admin/scripts/help-smoke.mjs`: added source guards so the role-aware UI, permission-matrix fallback, and provider identity activation copy cannot regress silently.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.

**Operational answer:**
- Yes. Backy UI is role-aware: owner/admin/editor/viewer profiles see different navigation, shortcuts, settings/users access, and privileged actions according to the backend permission matrix. Hosted login proves identity first; Backy profile role/status decides what the signed-in user can operate.

**Next:**
1. Commit and push the Help role-access clarity slice.
2. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 11:52 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Auth-trigger hardening pushed and verified on production

**What changed:**
- Pushed `efe19571 fix(auth): default provider identities to invited` to `origin/main`.
- Vercel deployed both `backy-public` and `backy-admin` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9498 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- Production Supabase function verification query -> PASS (`t`).
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 11:37 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Auth hardening status:** Provider-created identities now start inactive until Backy activates them

**What changed:**
- `supabase/migrations/014_invite_only_auth_profile_defaults.sql`: hardened `public.handle_new_user()` so Supabase/Auth-created identities default to `viewer` and are inserted as `status='invited'`, `is_active=false`; existing Backy role/status records are not overwritten on auth metadata changes.
- `apps/public/scripts/admin-owner-bootstrap-smoke.mjs`: added a source guard requiring that provider-only identities stay invited/inactive while owner bootstrap and Backy Users workflows remain the activation path.

**Commands run:**
- `npm run test:admin-owner-bootstrap --workspace @backy/public --silent` -> PASS.
- `npm run test:admin-auth-supabase --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- Production Supabase `psql ... -f supabase/migrations/014_invite_only_auth_profile_defaults.sql` -> PASS.
- Production Supabase function verification query -> PASS (`t`).
- `npm run test:admin-auth-production-policy --workspace @backy/public --silent` -> PASS.

**Operational note:**
- New Supabase Auth users created outside Backy now require Backy-side activation before hosted admin login can succeed. Existing active owners/admins are unchanged.

**Next:**
1. Run diff hygiene, commit, push, and verify Vercel source/deploy state.

## 2026-06-01 11:23 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Sidebar/auth clarity slice pushed and verified on Vercel

**What changed:**
- Pushed `7071d8de fix(admin): clarify hosted access and sidebar site switcher` to `origin/main`.
- Vercel deployed both `backy-public` and `backy-admin` production from the pushed commit.

**Commands run:**
- `git push` -> PASS.
- `npx vercel@latest ls backy-admin --no-color` -> latest production deployment Ready.
- `npx vercel@latest ls backy-public --no-color` -> latest production deployment Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9497 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Next:**
1. Continue Batch 5 with the next admin/editor friction point.

## 2026-06-01 11:14 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Shell UX status:** Sidebar site switcher no longer clips the expanded workspace identity

**What changed:**
- `apps/admin/src/components/layout/Sidebar.tsx`: the expanded Backy/site switcher header now reserves 120px and aligns the stacked Backy, Manage, Site selector, Domains, and Help controls from the top instead of forcing them into the collapsed 64px brand height.
- `apps/admin/scripts/dashboard-smoke.mjs`: dashboard smoke now source-checks the expanded site-switcher layout contract and rendered-checks that the site switcher stays inside the brand header without overlapping quick-create controls.

**Commands run:**
- `BACKY_DASHBOARD_SOURCE_ONLY=1 npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_USERS_SOURCE_ONLY=1 npm run test:users --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `BACKY_DASHBOARD_CDP_PORT=9496 npm run test:dashboard --workspace @backy-cms/admin --silent` -> PASS.

**Operational note:**
- The hosted UI remains role-aware. Refreshing or signing out/in after promoting the production owner profile should unlock Settings and owner-only navigation.

**Next:**
1. Commit and push the Users identity-boundary plus sidebar clipping polish slice.
2. Re-read the survival guide and continue Batch 5.

## 2026-06-01 10:52 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Auth UX status:** Users now exposes the hosted identity-provider boundary

**What changed:**
- `apps/admin/src/routes/users.tsx`: added a production identity boundary note in the Users command center explaining that hosted login validates the configured identity provider first, while Backy stores roles, status, permissions, and invite state; it explicitly warns not to add `admin_user_credentials` rows for hosted access.
- `apps/admin/scripts/users-smoke.mjs`: added a source guard so the provider-backed production login note cannot regress silently.

**Commands run:**
- `BACKY_USERS_SOURCE_ONLY=1 npm run test:users --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.

**Operational note:**
- The correct immediate access path is Supabase project -> Authentication -> Users -> selected owner -> Supabase password recovery or Auth Admin password update. The Supabase dashboard account settings page and Backy `admin_user_credentials` table are not the hosted Backy login path.

**Next:**
1. Commit and push the Users identity-boundary slice.
2. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 10:30 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Auth/deploy status:** Forgot Password now states the no-email provider boundary clearly

**What changed:**
- `apps/public/src/app/api/admin/auth/password-recovery/route.ts`: local-outbox recovery now says no recovery email was sent while keeping the same neutral accepted envelope for every address.
- `apps/admin/src/routes/forgot-password.tsx`: hosted admin recovery delivery status now tells operators to configure delivery or use an owner-assisted reset.
- `README.md`: added the production access runbook for no transactional email provider: reset the owner credential in Supabase Authentication -> Users, then sign in through `backy-admin`; configure Resend/SMTP/HTTP delivery before relying on emailed recovery or invites.
- `apps/admin/scripts/login-smoke.mjs` and `apps/public/scripts/admin-auth-smoke.mjs`: updated guards for the clearer recovery boundary copy.

**Commands run:**
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:public-security --workspace @backy/public --silent` -> PASS.
- Live `POST https://backy-public.vercel.app/api/admin/auth/password-recovery` spot check -> returned `deliveryConfigured:false`, `provider:"local-outbox"`, `status:"not_configured"`, confirming no production email provider is active.
- `git push` -> PASS; pushed `d8f56617` and `a188a7b6` to `main`.
- Vercel production deployment inspection for `backy-public` -> Ready.
- Vercel production deployment inspection for `backy-admin` -> Ready.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9494 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- Live recovery endpoint after deploy -> returned the clearer `No recovery email was sent... owner-assisted reset` message with `local-outbox`/`not_configured`.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.
- `npx vercel@latest logs backy-admin.vercel.app --level error --since 10m --expand --no-color --no-follow` -> PASS, no logs.

**Operational answer:**
- The real owner account is the production access path. Because email delivery is not configured, the immediate safe reset path is Supabase Authentication -> Users -> owner email -> set password, then login at `backy-admin`.
- Once logged in, account creation/invites live under Users, domains/sites under Sites, and custom frontends should consume `backy-public` agent-handoff/manifest/OpenAPI/render APIs.

**Next:**
1. Re-read the survival guide and continue Batch 5 with the next visible editor/admin friction point.

## 2026-06-01 10:17 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Auth/deploy status:** Hosted admin login shell now has a no-demo-leak smoke

**What changed:**
- `apps/admin/scripts/login-smoke.mjs`: added `BACKY_LOGIN_PRODUCTION_SHELL_SMOKE=1`, a rendered smoke that opens the configured admin login shell, verifies credential-manager fields and forgot-password affordance, and fails if hosted production exposes `Demo access`, seeded account text, or the dev MFA phrase.
- `apps/admin/package.json`: added `npm run test:login-production-shell --workspace @backy-cms/admin` as the reusable command for this proof.

**Commands run:**
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_LOGIN_PRODUCTION_SHELL_SMOKE=1 BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9492 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_ADMIN_BASE_URL=https://backy-admin.vercel.app BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app BACKY_LOGIN_CDP_PORT=9493 npm run test:login-production-shell --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- After the previous push's Vercel production builds reached Ready, `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `vercel logs --cwd apps/public --environment production --since 20m --level error --expand --no-follow` -> PASS, no logs.
- `vercel logs --cwd apps/admin --environment production --since 20m --level error --expand --no-follow` -> PASS, no logs.

**Account note:**
- Hosted production should be accessed with the real owner account created through the one-time bootstrap path. Seeded `admin@backy.io` demo credentials stay local/dev-only and are intentionally hidden from hosted `backy-admin`.

**Next:**
1. Commit and push this hosted-login-shell smoke slice.
2. Continue Batch 5 with the next editor/admin friction point after re-reading the survival guide.

## 2026-06-01 09:58 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Deploy status:** Production readiness now proves public site discovery

**What changed:**
- `scripts/vercel-production-readiness-smoke.mjs`: live production proof now checks `GET /api/sites?identifier=<site>` and `GET /api/sites?limit=1` before the site-scoped handoff/manifest/OpenAPI/render checks.
- `README.md`: production promotion gate now documents those site-discovery probes and clarifies that the final public domain must expose a published database-backed site, not only direct site-scoped endpoints.

**Commands run:**
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `npm run test:vercel-release-config --silent` -> PASS.
- `BACKY_VERCEL_REQUIRE_REMOTE_ENV=1 npm run test:vercel-preview-readiness --silent` -> PASS with operator warnings for the local root Vercel link and old CLI project-list inspection.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `git diff --check` -> PASS.

**Review notes:**
- Strict code-quality review caught one false-negative risk: a `limit=1` list check must not require the readiness site to be the first published site. The final check only proves public list discovery is alive; the identifier check proves the requested readiness site.
- Live endpoint spot checks showed production public discovery returns one published `site-demo` even if Supabase's table UI shows stale estimated row counts.

**Next:**
1. Commit and push this production-discovery readiness slice.
2. Re-read the survival guide and continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 09:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Auth/deploy status:** Password recovery no longer claims local outbox delivery is queued

**What changed:**
- `apps/public/src/lib/formEmailDelivery.ts`: added `isExternalEmailDeliveryConfigured` so recovery UI can distinguish a real transactional provider from local/manual outbox behavior.
- `apps/public/src/app/api/admin/auth/password-recovery/route.ts`: neutral recovery responses now report `local-outbox` as `not_configured`, keep known/unknown envelopes identical, and skip reset-token creation unless external email delivery is configured or local recovery-token exposure is explicitly enabled.
- `apps/admin/src/routes/forgot-password.tsx`: production/admin UI now renders the not-configured state as a recovery-provider boundary instead of saying a reset email was queued.
- `apps/public/scripts/admin-auth-smoke.mjs`, `apps/public/scripts/public-security-regression-smoke.mjs`, and `apps/admin/scripts/login-smoke.mjs`: updated coverage for the neutral not-configured recovery envelope and UI copy.

**Commands run:**
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- Direct local recovery endpoint proof against the active `127.0.0.1:3001` server -> PASS; known and unknown accounts returned the same envelope, `local-outbox`, `not_configured`, `attempted: false`, and no `localRecovery`.
- `npm run test:public-security --workspace @backy/public --silent` -> PASS.
- `npm run test:frontend-contract-types --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected repo-root relink warning.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run build:vercel:public --silent` -> PASS.
- `npm run build:vercel:admin --silent` -> PASS.
- `git diff --check` -> PASS.

**Notes:**
- The already-running local public dev server owned `.next/dev/lock`, so a separate full `test:admin-auth` server could not be started without disrupting the user's browser session. The unauthenticated recovery endpoint was validated directly against the active hot-reload server instead.

**Next:**
1. Commit and push this production password-recovery hardening slice.
2. Inspect Vercel deploys/logs after push, then continue Batch 5 with the next admin/editor friction point.

## 2026-06-01 08:57 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Live OpenAPI host-context proof now handles canonical database site ids

**What changed:**
- `scripts/vercel-production-readiness-smoke.mjs`: live OpenAPI validation now finds resolve/render operations by path suffix when the requested identifier is an alias and the generated OpenAPI document uses the canonical database site id in path keys.

**Commands run:**
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push the readiness-smoke canonical-path fix.
2. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 08:41 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** OpenAPI now documents host/domain context on resolve and render operations

**What changed:**
- `apps/public/src/app/api/sites/[siteId]/openapi/route.ts`: public `resolve` and `render` operations now explicitly document optional `domain`, `host`, and `x-forwarded-host` parameters, matching the route handlers and the existing custom frontend handoff extension.
- `scripts/vercel-production-readiness-smoke.mjs`: production readiness now source-checks and live-checks that final production OpenAPI exposes those host/domain parameters.

**Commands run:**
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push the host-aware OpenAPI contract slice.
2. After production deploys, rerun the live production readiness gate so the new OpenAPI parameter checks prove against the final domain.

## 2026-06-01 08:24 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production readiness can now prove live admin auth without exposing credentials

**What changed:**
- `scripts/vercel-production-readiness-smoke.mjs`: added an optional live admin auth proof gated by `BACKY_VERCEL_ADMIN_EMAIL`, `BACKY_VERCEL_ADMIN_PASSWORD`, optional MFA env, and `BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH=1`. The smoke logs in through `backy-public`, restores `/api/admin/auth/session`, and logs out without printing credential values, session tokens, or cookies.
- `packages/core/src/custom-frontend-agent-handoff.ts`, OpenAPI, manifest schema, SDK generated contract types, `AGENTS.md`, README, and the custom frontend spec now advertise the admin-auth proof boundary beside the existing public-domain contract proof.
- Production Supabase state was checked directly through the ignored Vercel-pulled production env: the requested Gmail owner exists as active `owner`, has owner team membership, and the one-time bootstrap token is absent from pulled production env.

**Commands run:**
- `npx vercel@latest env pull .env.production.local --environment=production --yes --cwd apps/public --no-color` -> PASS; confirmed the owner bootstrap token is absent from pulled production env.
- Production Supabase row-count/owner checks through `psql "$POSTGRES_URL_NON_POOLING"` -> PASS; owner/profile/team/site/platform rows exist.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `npm run test:frontend-contract-types --silent` -> PASS and regenerated SDK contract types.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/core --silent` -> PASS.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS with expected admin-auth-credentials-not-set warning.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected repo-root relink warning.
- `npm run build:vercel:public --silent` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this deployment/auth-hardening slice.
2. After Vercel deploys the commit, inspect production deployments/logs and continue Batch 5 with the next admin/editor friction point.

## 2026-06-01 07:39 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Page create failures now preserve backend quota codes and the create smoke is quota-deterministic

**What changed:**
- `apps/admin/src/lib/adminContentApi.ts`: page creation now throws the structured Backy admin API error so backend codes such as `BILLING_PAGE_LIMIT` are not flattened into plain `Error` messages.
- `apps/admin/src/routes/pages.new.tsx`: `/pages/new` now shows quota blockers as an alert with a direct recovery path to Sites billing/quota controls instead of making a working button look broken.
- `apps/admin/scripts/page-create-smoke.mjs`: the full page-create smoke now temporarily raises the local demo site's page quota with a cushion and restores the original settings during cleanup, so seeded fixture growth does not turn create-button validation into a false failure.

**Why:**
- The reported "New page" failure was not a click-handler regression. The create POST reached the backend and was rejected with `402 BILLING_PAGE_LIMIT` because local demo data had reached the free-site page limit.
- The product fix is to make that blocker explicit in the authoring UI, and the test fix is to keep smoke fixtures independent from accumulated local demo page count.

**Commands run:**
- `npm run test:page-create --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:blog-list --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS.

**Next:**
1. Commit and push this page-create quota/readiness slice.
2. Continue Batch 5 with the next visible admin/editor friction point.

## 2026-06-01 06:41 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Canvas marquee selection anchor no longer clamps to top-left during layout/scroll shifts

**What changed:**
- `apps/admin/src/components/editor/Canvas.tsx`: `getCanvasPoint` now supports unclamped coordinate conversion for marquee anchor reprojection while preserving clamped coordinates for active/current pointer positions.
- `apps/admin/src/components/editor/Canvas.tsx`: marquee overlays now expose `data-marquee-anchor-clamp="unclamped"` so the anti-top-left behavior is testable.
- `apps/admin/scripts/editor-drag-smoke.mjs`: source guard now requires unclamped marquee anchor reprojection alongside transformed DOM scale math.

**Why:**
- The editor already stored the original client pointer and reprojected it during drag so zoom/scroll settling does not visually move the rectangle. That reprojection was using the clamped canvas-point path, so a layout shift that put the original client point outside the current canvas rect could reset the selection start to `0,0`.
- The fix keeps scroll/zoom-stable visual anchoring but prevents the anchor from collapsing to the canvas origin.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 node apps/admin/scripts/editor-drag-smoke.mjs` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-marquee-origin --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent` -> PASS.

**Next:**
1. Run final hygiene, commit, and push this canvas marquee fix.
2. Continue Batch 5 with the next visible editor/admin friction point.

## 2026-06-01 06:18 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Code snippet blocks now render highlighted safe text across editor, public renderer, and custom frontend metadata; pushed and production-verified

**What changed:**
- `packages/core/src/code-highlight.ts`: added a shared no-dependency Backy code highlighter with normalized language aliases, dark/light token themes, and token metadata types.
- `apps/admin/src/components/editor/Canvas.tsx` and `apps/public/src/components/PageRenderer.tsx`: `codeBlock` elements now render tokenized spans with `data-backy-code-token`, preserve line-number/copy/wrap metadata, and expose `data-backy-code-highlight-theme`.
- `apps/admin/src/components/editor/PropertyPanel.tsx`: code blocks now have a persisted Syntax theme control so authors can choose dark or light highlighting.
- `apps/admin/scripts/editor-drag-smoke.mjs`: the code-block behavior smoke now verifies the theme control, persisted `props.highlightTheme`, public/editor metadata, and rendered keyword/string/function token spans.
- `packages/core/package.json` and `packages/core/src/index.ts`: exported the shared highlighting helpers for admin, public render, and custom frontend consumers.

**Commands run:**
- `npm run build --workspace @backy-cms/core --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent` -> PASS.
- `BACKY_EDITOR_COMPONENT_SMOKE=codeBlock node apps/admin/scripts/editor-drag-smoke.mjs` -> PASS.
- `npm run test:editor-responsive --workspace @backy-cms/admin --silent` -> PASS.
- `npm run build:vercel:public --silent` -> PASS.
- `npm run build:vercel:admin --silent` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `git diff --check` -> PASS.
- `git push` -> PASS; pushed `65ac645b` to `main`.
- Vercel production deployment inspection for `backy-public` -> Ready and aliased to `https://backy-public.vercel.app`.
- Vercel production deployment inspection for `backy-admin` -> Ready and aliased to `https://backy-admin.vercel.app`.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS; source/live checks passed.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color` -> no logs found.

**Notes:**
- The Browser in-app runtime was unavailable with `Browser is not available: iab`; rendered verification used Backy's existing CDP/editor smoke harness instead.
- A stale local Next dev process briefly kept serving a parser error from an already-fixed transient syntax typo; restarting the local public dev server cleared it before the responsive smoke passed.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point rather than the external provider-certification partials.

## 2026-06-01 05:19 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production admin auth verified live after DB-session persistence deploy

**Live production verification:**
- Latest `backy-public` production deployment is Ready and aliased to `https://backy-public.vercel.app`.
- Latest `backy-admin` production deployment is Ready and aliased to `https://backy-admin.vercel.app`.
- Production owner login against `https://backy-public.vercel.app/api/admin/auth/login` returns `200`, role `owner`, and `authMode=supabase`.
- Production session restore against `/api/admin/auth/session` returns `200` using the issued admin session cookie.
- Production logout against `/api/admin/auth/logout` returns `200` and revokes the session.
- Live production handoff/manifest/OpenAPI/render gate passes against `https://backy-public.vercel.app`.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color` reports no errors; the previous immutable `/var/task/apps/public/data/backy` write failure is not recurring.

**Commands run:**
- `git push` -> PASS, pushed `f13b1977` to `main`.
- `npx vercel@latest inspect <latest backy-public production deployment> --no-color` -> Ready.
- `npx vercel@latest inspect <latest backy-admin production deployment> --no-color` -> Ready.
- Production owner login/session/logout smoke -> PASS without printing password or session token.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 10m --expand --no-color` -> no logs found.

**Next:**
1. Continue Batch 5 with the next visible admin/editor friction point.
2. Prefer an admin-editor UI issue over external provider certification artifacts, since production auth/deploy is now stable.

## 2026-06-01 05:05 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production admin session persistence hardened for database-backed Vercel runtime

**What changed:**
- `apps/public/src/lib/admin-auth/sessionStore.ts`: split admin session record persistence into pure auth-setting transforms so database-mode routes can upsert/revoke/prune `adminSessions` through Supabase-backed `platform_settings.auth` without touching the local file-backed `backyStore` writer.
- `apps/public/src/app/api/admin/auth/login/route.ts`: Supabase/local-persistent successful login now creates the in-memory session without local persistence in repository mode, then commits the session record through `repositories.settings.update({ auth })` only after MFA passes.
- `apps/public/src/app/api/admin/auth/session/route.ts`, `logout/route.ts`, `adminAccess.ts`, and public manifest admin discovery: DB-mode session restore/rotate/logout paths now pass repository `authSettings` plus update callbacks so cold starts and stale-session cleanup read/write the same database source of truth.
- `scripts/vercel-production-readiness-smoke.mjs`: added source guards that fail if production admin login/session/logout/access regress toward local file-backed session persistence.

**Commands run:**
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run test:admin-auth-supabase --workspace @backy/public --silent` -> PASS.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected no-live-production-URL warning.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected repo-root relink warning.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run build:vercel:public --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run test:admin-auth-supabase-route --workspace @backy/public --silent` -> BLOCKED by the user's active `next dev -p 3001` holding `apps/public/.next/dev/lock`; the local browser session was left running.
- A separate `next start` admin-auth smoke was attempted on an isolated port, but local demo state rejected the smoke-created `example.test` user before cleanup-sensitive auth assertions; not used as release evidence.

**Review findings:**
- [High] Vercel production logs showed `POST /api/admin/auth/login` succeeding far enough to persist a session, then trying to `mkdir /var/task/apps/public/data/backy`. Fixed by preventing repository-mode login/session/logout from writing local admin-content files.
- [Medium] Subagent review caught stale/invalid DB-backed sessions could still fall through to local cleanup when callers supplied external auth settings without an update callback. Fixed by adding DB update callbacks at callsites and suppressing local cleanup when external auth settings are supplied.

**Next:**
1. Commit and push this production DB-session persistence hardening slice.
2. Wait for `backy-public` production deployment, then run live admin login/session and Vercel error-log checks.
3. Continue Batch 5 with the next visible admin/editor friction point after production login is stable.

## 2026-06-01 04:08 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production owner bootstrap completed and live public contract gate is green

**What changed:**
- `supabase/migrations/013_harden_auth_profile_trigger.sql`: hardens `public.handle_new_user()` with an explicit trusted `search_path`, `public.user_role` casts, guarded metadata role parsing, and idempotent profile upsert behavior so Supabase Auth Admin user creation works from its runtime context.
- `apps/public/src/app/api/admin/auth/bootstrap-owner/route.ts`: first-owner Auth metadata no longer tries to assign the owner role through Supabase user metadata; Backy keeps the owner role in its own profile/workspace records.
- `apps/public/next.config.js` plus Vercel readiness smokes: removed the redundant optional-driver externalization assertion now that optional database providers are already lazy inside `@backy/db`.
- `scripts/vercel-production-readiness-smoke.mjs`: live render verification now checks the negotiated `x-backy-schema-version: backy.content-payload.v1` contract header and the embedded `backy.content.v1` document instead of an obsolete body-level render schema field.
- `README.md`: added the post-bootstrap operator step to remove `BACKY_OWNER_BOOTSTRAP_TOKEN` from `backy-public` production env and redeploy.

**Live production actions:**
- Applied migration `013` to the production Supabase database.
- Verified Supabase Auth Admin API can create/delete a smoke user after the trigger hardening.
- Created the real first owner through `POST /api/admin/auth/bootstrap-owner` and verified production login returns an owner Supabase-backed admin session.
- Removed `BACKY_OWNER_BOOTSTRAP_TOKEN` from `backy-public` production env and deleted the ignored local bootstrap-token file.
- Created a small published `site-demo` database site plus published homepage through the authenticated admin API so production handoff, manifest, OpenAPI, and render endpoints have real database content to prove against.

**Commands run:**
- `psql "$POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 -f supabase/migrations/013_harden_auth_profile_trigger.sql` -> PASS.
- Supabase Auth Admin create/delete smoke against production -> PASS.
- Production owner bootstrap request -> PASS; returned owner role through Supabase auth.
- Production admin login smoke -> PASS; returned an owner Supabase-backed session.
- `npx vercel@latest env rm BACKY_OWNER_BOOTSTRAP_TOKEN production --cwd apps/public --yes --no-color` -> PASS.
- `npx vercel@latest env ls --cwd apps/public --no-color | rg 'BACKY_(OWNER|ADMIN)_BOOTSTRAP_TOKEN'` -> no bootstrap token present.
- `npm run test:admin-owner-bootstrap --workspace @backy/public --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with the expected repo-root link warning.
- `npm run test:vercel-production-readiness --silent` -> PASS with the expected no-live-production-URL warning.
- `BACKY_VERCEL_PRODUCTION_URL=https://backy-public.vercel.app BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness --silent` -> PASS.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run build:vercel:public --silent` -> PASS.

**Review findings:**
- [High] Supabase Auth user creation failed because the profile trigger relied on caller `search_path` and an unqualified `user_role` enum cast. Fixed with a hardened trigger migration.
- [High] The bootstrap route should not make Supabase user metadata authoritative for Backy owner role assignment. Fixed by letting Backy profile/workspace upserts own role assignment.
- [Medium] The production readiness live render check asserted an outdated body schema. Fixed to verify the actual negotiated render schema header and content-document schema.

**Next:**
1. Commit and push this production owner/bootstrap hardening slice.
2. Wait for the new production deployment so the removed bootstrap token and route cleanup are both reflected in the active runtime.
3. Continue Batch 5 with the next highest-friction admin/editor surface after confirming production deploy health.

## 2026-06-01 03:14 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** `backy-public` production bundle fixed for database-backed Vercel functions

**What changed:**
- `apps/public/next.config.js`: Next now bundles Backy workspace packages (`@backy-cms/core`, `@backy/db`, `@backy/storage`) into Vercel functions instead of externalizing `@backy/db`; only unused optional MySQL/SQLite native drivers remain external/lazy.
- `apps/public/src/lib/repositoryRuntime.ts`: database adapters/repositories are imported with Vercel-traceable dynamic imports so serverless functions include the Backy DB package.
- `apps/public/package.json` and `package-lock.json`: `postgres` is now a `backy-public` runtime dependency, not only a root dev dependency.
- `packages/db/src/adapters/index.ts`: optional MySQL/SQLite provider imports are lazy runtime imports, preserving Postgres production builds without requiring irrelevant optional drivers.
- `scripts/vercel-preview-readiness-smoke.mjs` and `scripts/vercel-production-readiness-smoke.mjs`: added guards for traceable workspace bundling and against hiding `@backy/db` from Vercel tracing.

**Commands run:**
- `npm run typecheck --workspace @backy/db --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with the expected root-link warning.
- `npm run test:vercel-production-readiness --silent` -> PASS with the expected no-live-production-URL warning.
- `npm run build:vercel:public --silent` -> PASS after the optional-provider lazy import fix.
- `git diff --check` -> PASS.

**Review findings:**
- [High] Hosted `backy-public` API routes crashed because Vercel could not find the local `@backy/db` package inside serverless functions. Fixed by bundling workspace packages and making repository imports traceable.
- [High] Once `@backy/db` was bundled, Turbopack tried to resolve optional MySQL/SQLite drivers that production does not use. Fixed by lazily importing only those optional provider packages while keeping Postgres traceable and installed for production.

**Next:**
1. Commit and push this Vercel runtime packaging fix.
2. Wait for `backy-public` production to rebuild, then run the live production contract gate against `https://backy-public.vercel.app`.
3. If production DB has no initial site yet, create the real owner and seed/create the first site through the secured admin path instead of enabling production demo mode.

## 2026-06-01 01:24 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production Supabase resource provisioned, migrated, and owner bootstrap hardened

**What changed:**
- Provisioned the existing Vercel Supabase Marketplace installation into `backy-public` as `backy-production` on the free plan, connected it to Production, and confirmed injected `POSTGRES_*`/`SUPABASE_*` env names without printing values.
- Applied `supabase/migrations/001` through `012` to the new production Supabase database with `psql` against the provider URL from ignored production env.
- `packages/db/src/runtime-config.ts`, `packages/db/drizzle.config.ts`, and production env guard scripts now accept Vercel Marketplace `POSTGRES_URL`/`POSTGRES_PRISMA_URL` aliases in addition to `BACKY_DATABASE_URL`/`DATABASE_URL`.
- `apps/admin/src/routes/login.tsx`: demo account buttons and the seeded dev MFA phrase are hidden from production builds unless `VITE_BACKY_SHOW_DEMO_ACCESS=1` is explicitly set.
- `apps/public/src/app/api/admin/auth/bootstrap-owner/route.ts`: added a server-token protected, one-time first-owner bootstrap endpoint that creates the Supabase Auth user, Backy owner profile, and initial workspace membership, then refuses a second active owner.
- `apps/public/src/app/api/admin/sites/route.ts`: database mode site creation can infer the single bootstrapped team when no site exists yet.
- `README.md` and `.env.example`: documented `POSTGRES_URL` aliases and the first-owner bootstrap boundary.

**Commands run:**
- `npx vercel@latest integration add supabase --installation-id ... --environment production --name backy-production --cwd apps/public --no-color` -> PASS.
- `npx vercel@latest env pull .env.production.local --environment=production --yes --cwd apps/public --no-color` -> PASS; file is ignored.
- `psql "$POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 -q -f supabase/migrations/*.sql` -> PASS across migrations 001-012.
- `npm run test:runtime --workspace @backy/db --silent` -> PASS.
- `npm run test:admin-owner-bootstrap --workspace @backy/public --silent` -> PASS.
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:vercel-public-production-env-guard --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run build:vercel:admin --silent` -> PASS; default production admin build emitted no `.map` files and no seeded demo passwords/MFA phrase in built assets.
- `npm run test:vercel-release-config --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with the expected root-link warning.
- `npm run test:vercel-production-readiness --silent` -> PASS with the expected no-live-production-URL warning.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `git diff --check` -> PASS.

**Review findings:**
- [High] Hosted production login exposed local demo credentials even though production local auth is blocked. Fixed by hiding demo access in production unless explicitly enabled.
- [High] Admin production source maps could expose local/demo source constants even when UI panels are hidden. Fixed by disabling Vite source maps by default unless `BACKY_ADMIN_ENABLE_SOURCEMAPS=1`.
- [High] Fresh production had no safe first-owner path. Fixed with a one-time server-token bootstrap route backed by Supabase service-role env and active-owner lockout.
- [Medium] Vercel Supabase injects `POSTGRES_URL`/`POSTGRES_PRISMA_URL`, not Backy-prefixed aliases. Fixed runtime/guard/migration config to accept provider-standard names directly.

**Next:**
1. Commit and push this production bootstrap/security slice.
2. Redeploy `backy-public` and `backy-admin` production from the pushed source.
3. Use the ignored bootstrap token plus a user-chosen email/password to create the real owner, then remove `BACKY_OWNER_BOOTSTRAP_TOKEN` from Vercel production.

## 2026-06-01 00:44 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Live Vercel public/admin failure diagnosed and source fix prepared

**What changed:**
- `apps/public/next.config.js`: excluded `*.vercel.app` project/deployment hosts from the tenant subdomain rewrite so `backy-public.vercel.app/` can render the public runtime home instead of being treated as `/sites/backy-public/`.
- `scripts/vercel-release-config-smoke.mjs`: added a guard for the Vercel-domain rewrite exclusion.
- `apps/admin/src/lib/adminAuthApi.ts`: made network errors environment-aware; Vercel admin shells now point operators at `VITE_BACKY_ADMIN_API_BASE_URL`/`VITE_BACKY_PUBLIC_API_BASE_URL` and `backy-public` health instead of only saying to start localhost port 3001.
- `apps/admin/scripts/login-smoke.mjs`: added source coverage for the environment-aware auth troubleshooting copy.
- `apps/public/src/lib/admin-auth/productionPolicy.ts` and `apps/public/scripts/admin-auth-production-policy-smoke.ts`: changed production local-auth failure copy to direct operators to provider-backed auth/database-backed sessions and explicitly not to enable the release-blocked local-auth flag.

**Live evidence:**
- `curl https://backy-admin.vercel.app/login` returned the Vite shell; its built asset has `VITE_BACKY_ADMIN_API_BASE_URL=https://backy-public.vercel.app/api/admin` and `VITE_BACKY_PUBLIC_API_BASE_URL=https://backy-public.vercel.app/api`.
- `curl https://backy-public.vercel.app/` returned HTTP 500 with `x-nextjs-rewritten-path: /sites/backy-public/`, proving the Vercel project-domain host was caught by tenant subdomain routing.
- `curl https://backy-public.vercel.app/api/sites/site-demo/agent-handoff` returned normalized HTTP 500 JSON.
- `npx vercel@latest logs backy-public.vercel.app --level error --since 30m --expand` showed `Database mode requires BACKY_DATABASE_URL or DATABASE_URL` for `/`, `/api/sites/site-demo/agent-handoff`, and `/api/admin/auth/session`.
- `npx vercel@latest env ls --cwd apps/public` showed only preview demo env; production `backy-public` database/admin/cron/CORS env remains missing.
- `npx vercel@latest env ls --cwd apps/admin` showed production `VITE_BACKY_ADMIN_API_BASE_URL` and `VITE_BACKY_PUBLIC_API_BASE_URL` are present.

**Commands run:**
- `npm run test:vercel-release-config --silent` -> PASS.
- `npm run test:admin-auth-production-policy --workspace @backy/public --silent` -> PASS.
- `BACKY_LOGIN_SOURCE_ONLY=1 npm run test:login --workspace @backy-cms/admin --silent` -> PASS.
- `npm run typecheck --workspace @backy/public --silent` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected warnings for root link state and missing production `backy-public` database/admin/cron/CORS env.
- `npm run test:vercel-public-production-env-guard --silent` -> PASS.
- `git diff --check` -> PASS.

**Review findings:**
- [High] `backy-public.vercel.app` was being rewritten as a tenant hosted-site subdomain. Fixed in source by excluding Vercel project/deployment hosts from subdomain routing.
- [High] `backy-public` production has no database runtime env, so public APIs and admin auth endpoints crash at runtime. Left unresolved because setting fake demo production env would violate the release boundary; real database/admin/cron/CORS env is required.
- [Medium] Admin login network copy incorrectly blamed local port 3001 on deployed Vercel. Fixed with environment-aware copy.

**Next:**
1. Commit and push this Vercel host/admin-auth troubleshooting slice.
2. Expect `backy-admin` production to rebuild cleanly, while `backy-public` production should keep failing new builds until real production env is configured.
3. Configure real production env on `backy-public`, then redeploy and run the live production contract gate.

## 2026-06-01 00:11 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Public root now explains the `backy-public`/`backy-admin` security boundary

**What changed:**
- `apps/public/src/app/page.tsx`: clarified that localhost/public production root is `backy-public`, the public API/render runtime, while the visual editor is the separate protected `backy-admin` shell.
- `apps/public/src/app/globals.css`: added responsive runtime-boundary and admin-security sections without changing the existing public root app structure.
- `README.md`: added a secure admin account setup runbook covering provider-backed auth, Backy role records, MFA, server-only env placement, demo-auth production rejection, and Vercel Deployment Protection.
- `scripts/vercel-release-config-smoke.mjs` and `scripts/vercel-preview-readiness-smoke.mjs`: added source guards so the public root and release docs keep the admin-security boundary visible.

**Commands run:**
- `BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin --silent` -> PASS.
- `npm run test:vercel-release-config --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected warnings for root link state and missing production `backy-public` database/admin/cron/CORS env.
- Previously in this slice: editor smoke coverage, help rendered smoke, public/admin typechecks, repo hygiene, public production env guard, production readiness source checks, public build, root curl/source checks, and `git diff --check` -> PASS.

**Review findings:**
- [Medium] `localhost:3001` looked like a new private Backy frontend even though it is the public runtime. Resolved by labeling it in the hero and adding a dedicated runtime-boundary section.
- [High] Admin account setup guidance needed to make the secret boundary explicit before production deploys. Resolved by documenting provider-backed auth, MFA, and the rule that server-only admin/database/provider secrets belong on `backy-public`, never on `backy-admin` or custom frontend env.

**Next:**
1. Commit and push this public-root/admin-security clarity slice.
2. Continue Batch 5 with the next highest-friction admin/editor surface while production `backy-public` env remains operator-deferred.

## 2026-05-31 23:08 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Public production builds now fail early when required production env is missing

**What changed:**
- Added `scripts/vercel-public-production-env-guard.mjs`, a value-redacted guard that runs only on Vercel production builds or when explicitly forced by `BACKY_REQUIRE_PUBLIC_PRODUCTION_ENV=1`.
- Wired the guard into `build:vercel:public` before workspace package builds and the Next.js build.
- Added `scripts/vercel-public-production-env-guard-smoke.mjs` and `npm run test:vercel-public-production-env-guard` to verify skip, fail, reject-demo-flag, pass, and no-secret-output cases.
- Updated Vercel release/readiness smokes and README so the production guard is part of the release contract.

**Commands run:**
- `npm run test:vercel-public-production-env-guard --silent` -> PASS.
- `npm run test:vercel-release-config --silent` -> PASS.
- `npm run test:vercel-preview-readiness --silent` -> PASS with expected warnings for root link state and missing production `backy-public` env.
- `npm run test:vercel-production-readiness --silent` -> PASS with expected warning that no live production URL is set.
- `npm run test:repo-public-hygiene --silent` -> PASS.
- `git diff --check` -> PASS.
- `npm run build:vercel:public --silent` -> PASS; guard skipped outside Vercel production and the Next build listed the expected API routes.

**Review findings:**
- [High] `backy-public` production could previously deploy as Ready while missing database/admin/cron/CORS env and then crash at runtime. Resolved by failing Vercel production builds before release output is produced.
- [Medium] Production demo/local-auth allow flags were preview-only escape hatches but could be accidentally carried into production env. Resolved by making the public production build guard reject them.

**Next:**
1. Commit and push this guard slice.
2. After push, expect `backy-public` automatic production deployment to fail until real production env is configured; that is intentional and safer than a false-ready runtime crash.
3. Continue Batch 5 with the next visible editor/admin friction point while production env remains operator-deferred.

## 2026-05-31 22:43 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Admin production shell no longer bakes localhost API URLs; public production still needs real runtime env

**What changed:**
- Added persistent production `VITE_BACKY_PUBLIC_API_BASE_URL` and `VITE_BACKY_ADMIN_API_BASE_URL` env names to the `backy-admin` Vercel project using the public Backy API origin.
- Redeployed `backy-admin` production so the aliased admin shell picks up those non-secret API base URLs.
- Verified `backy-public` production still returns `Internal server error` for public contract routes because real database/admin/cron/CORS env is not configured.

**Commands run:**
- `npx vercel@latest env add VITE_BACKY_PUBLIC_API_BASE_URL production --value <public-api-origin> --yes --force --no-sensitive --cwd apps/admin --no-color` -> PASS.
- `npx vercel@latest env add VITE_BACKY_ADMIN_API_BASE_URL production --value <public-admin-api-origin> --yes --force --no-sensitive --cwd apps/admin --no-color` -> PASS.
- `npx vercel@latest deploy --prod --yes --logs --no-color` for `backy-admin` -> PASS, READY and aliased to the admin project domain.
- `npx vercel@latest curl <admin-production-url>/login` -> PASS; returned the Vite admin shell.
- `npx vercel@latest curl <admin-production-asset>` -> PASS; verified the built asset includes the public Backy API origin and admin API origin.
- `npx vercel@latest curl <public-production-url>/api/sites/site-demo/agent-handoff` -> PASS transport, returned `success: false` / `Internal server error`.
- `npx vercel@latest logs <public-production-url> --level error --since 10m --expand` -> PASS; showed `Database mode requires BACKY_DATABASE_URL or DATABASE_URL`.
- `npm run test:vercel-preview-readiness` -> PASS with warnings only for root link state and missing production `backy-public` env.

**Review findings:**
- [Medium] The admin production shell was build-ready but still had localhost fallback code paths. Resolved by setting persistent production Vite env and redeploying the admin project.
- [High] The public production deployment cannot be called release-ready until real `backy-public` database/admin/cron/CORS env is configured. Left unresolved intentionally rather than enabling demo mode in production.

**Next:**
1. Configure `backy-public` production with real `BACKY_DATA_MODE=database`, `BACKY_DATABASE_URL` or `DATABASE_URL`, `BACKY_ADMIN_API_KEY`, `BACKY_ADMIN_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_BACKY_ADMIN_APP_URL`, and `BACKY_CORS_ALLOWED_ORIGINS`.
2. Redeploy `backy-public`, run strict remote-env readiness, then run the live production contract gate against the final public domain.

## 2026-05-31 22:16 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Vercel preview deployment failure diagnosed and protected previews verified

**What changed:**
- Identified two stale deploy failures as pre-fix Vercel project configuration issues: one used the wrong root/source package context, and one ran the app build without first building workspace packages.
- Identified the current public preview runtime failure as missing `backy-public` env: without `BACKY_DATA_MODE`, the runtime defaults to database mode and returns 500 until `BACKY_DATABASE_URL` or demo-mode preview env exists.
- Configured preview-only `backy-public` env names for demo-mode verification, leaving production env untouched.
- Redeployed `backy-public` and `backy-admin` previews from repo-root source. The admin preview was built with one-deploy `VITE_BACKY_*` API base URLs pointing to the healthy public preview.

**Current Vercel state observed:**
- `backy-public`: preview env now includes `BACKY_DATA_MODE`, `BACKY_ALLOW_PRODUCTION_DEMO_MODE`, and `BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH`; production database/admin/cron/CORS env is still intentionally missing.
- `backy-admin`: no persistent project env yet; the verified preview used build-time `VITE_BACKY_PUBLIC_API_BASE_URL` and `VITE_BACKY_ADMIN_API_BASE_URL`, so automatic Git previews still need those env names configured.
- Preview URLs and deployment ids are verified locally but intentionally not recorded in tracked docs.

**Commands run:**
- `npm run build:vercel:public` -> PASS.
- `npm run build:vercel:admin` -> PASS with the existing non-blocking large editor chunk warning.
- `npx vercel@latest deploy --target=preview --yes --logs` for `backy-public` before preview env -> READY build, runtime 500.
- `npx vercel@latest logs <backy-public-preview-url> --level error --since 15m --expand` -> PASS; showed `Database mode requires BACKY_DATABASE_URL or DATABASE_URL`.
- `npx vercel@latest env add BACKY_DATA_MODE preview` -> PASS, all Preview branches.
- `npx vercel@latest env add BACKY_ALLOW_PRODUCTION_DEMO_MODE preview` -> PASS, all Preview branches.
- `npx vercel@latest env add BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH preview` -> PASS, all Preview branches.
- `npx vercel@latest deploy --target=preview --yes --logs` for `backy-public` after preview env -> PASS, READY.
- `npx vercel@latest deploy --target=preview --yes --logs --build-env VITE_BACKY_PUBLIC_API_BASE_URL=<public-preview-api> --build-env VITE_BACKY_ADMIN_API_BASE_URL=<public-preview-admin-api>` for `backy-admin` -> PASS, READY.
- `npx vercel@latest curl <backy-admin-preview-url>/login` -> PASS; returned the Vite admin shell.
- `npx vercel@latest curl <backy-public-preview-url>/api/sites/site-demo/agent-handoff` -> PASS; returned `success: true` with component API, design-state, routing, newsletter, and deployment-topology contract fields.
- `npx vercel@latest curl <backy-public-preview-url>/api/sites/site-demo/manifest` -> PASS; returned `backy.frontend-manifest.v1` with frontend design and handoff mirrors.
- `npx vercel@latest curl <backy-public-preview-url>/api/sites/site-demo/openapi` -> PASS; returned OpenAPI `3.1.0` with deployment topology in the Backy handoff extension.
- `npx vercel@latest curl <backy-public-preview-url>/api/sites/site-demo/render?path=/` -> PASS; returned successful render JSON for `/`.
- `npm run test:vercel-preview-readiness` -> PASS with warnings for root link state, missing production `backy-public` env, and missing persistent `backy-admin` API URL env.
- `BACKY_VERCEL_REQUIRE_CLI=1 BACKY_VERCEL_REQUIRE_PROJECT_LINKS=1 BACKY_VERCEL_REQUIRE_REMOTE_PROJECTS=1 BACKY_VERCEL_REQUIRE_REMOTE_ENV=1 npm run test:vercel-preview-readiness` -> FAIL as expected because production-grade public env and persistent admin env are not fully configured yet.

**Review findings:**
- [High] A Ready Vercel build was not enough evidence because the public runtime defaulted to database mode and 500ed without database env. Resolved for previews with preview-only demo env and recorded as a strict production boundary.
- [High] Manual admin deploy build env does not configure automatic Git previews. Left as an explicit readiness warning until the two persistent `VITE_BACKY_*` env names are configured on `backy-admin`.

**Next:**
1. Configure production `backy-public` with real database/admin/session/cron/CORS/provider env and remove any temptation to promote demo previews.
2. Configure persistent `backy-admin` `VITE_BACKY_PUBLIC_API_BASE_URL` and `VITE_BACKY_ADMIN_API_BASE_URL` for Git previews.
3. Rerun strict remote-env readiness, then only promote production after the live public-domain contract gate passes.

## 2026-05-31 21:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Vercel projects are GitHub-connected, but remote env is now explicitly gated before release

**What changed:**
- `scripts/vercel-preview-readiness-smoke.mjs`: now verifies each linked Vercel project is connected to the GitHub `backy` repository instead of only checking local project links and remote build settings.
- `scripts/vercel-preview-readiness-smoke.mjs`: now lists Vercel env names for `backy-public` and `backy-admin`, warns when required project env is missing, and hard-fails if forbidden server/admin/provider secrets are configured on the Vite admin shell.
- Added strict remote-env mode through `BACKY_VERCEL_REQUIRE_REMOTE_ENV=1` so operator certification can fail missing runtime env after the Vercel projects are linked.
- README and AGENTS now document the strict env-boundary gate beside the existing `backy-public` / `backy-admin` deployment split.

**Current Vercel state observed:**
- `backy-public`: connected to the GitHub `backy` repository, root `apps/public`, Next.js, build command `npm --prefix=../.. run build:vercel:public`, Node 24.x, SSO protection enabled, but no Vercel env vars are configured yet.
- `backy-admin`: connected to the GitHub `backy` repository, root `apps/admin`, Vite, output `dist`, build command `npm --prefix=../.. run build:vercel:admin`, Node 24.x, SSO protection enabled, but no Vercel env vars are configured yet.

**Commands run:**
- `npx vercel@latest git connect https://github.com/<github-owner>/backy --cwd apps/public --no-color --non-interactive` -> PASS, already connected.
- `npx vercel@latest git connect https://github.com/<github-owner>/backy --cwd apps/admin --no-color --non-interactive` -> PASS, already connected.
- `npx vercel@latest project inspect backy-public --no-color` -> PASS.
- `npx vercel@latest project inspect backy-admin --no-color` -> PASS.
- `npx vercel@latest env ls --cwd apps/public --no-color` -> PASS, no env vars configured.
- `npx vercel@latest env ls --cwd apps/admin --no-color` -> PASS, no env vars configured.
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings for root link state and missing Vercel env.
- `BACKY_VERCEL_REQUIRE_CLI=1 BACKY_VERCEL_REQUIRE_PROJECT_LINKS=1 BACKY_VERCEL_REQUIRE_REMOTE_PROJECTS=1 BACKY_VERCEL_REQUIRE_REMOTE_ENV=1 npm run test:vercel-preview-readiness` -> FAIL as expected because required env is not configured on either Vercel project yet.
- `npm run test:vercel-production-readiness` -> PASS with expected warning that no live production URL is set.
- `npm run test:repo-public-hygiene` -> PASS.
- `git diff --check` -> PASS.

**Review findings:**
- [High] The two Vercel projects are connected correctly, but automatic Git deploys will still be unsafe/incomplete until env is configured. Resolved by making missing env explicit in default readiness output and strict-failable with `BACKY_VERCEL_REQUIRE_REMOTE_ENV=1`.
- [High] `backy-admin` must never receive server-only env. Resolved by checking remote env names for forbidden database/admin/provider/Stripe/S3/Supabase secret variables and failing if any appear on the Vite shell project.

**Next:**
1. Configure real `backy-public` database/admin/session/cron/CORS/provider env and only the two `VITE_BACKY_*_API_BASE_URL` values on `backy-admin`.
2. Rerun strict remote-env readiness, then deploy/promote only after the live production contract gate passes.
3. Continue Batch 5 with the next visible admin/editor release friction point if env remains operator-deferred.

## 2026-05-31 21:09 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Production promotion now has a hard live-contract gate and public repo hygiene guard

**What changed:**
- Added `npm run test:vercel-production-readiness`, a source and optional live-domain gate that requires production Backy public URLs to serve JSON for agent-handoff, manifest, OpenAPI, and render before they can be treated as production proof.
- Added `npm run test:repo-public-hygiene`, which scans tracked files for local absolute paths, personal email addresses, actual Vercel deployment URLs/ids, project/team ids, and optional operator-supplied private markers.
- Updated README, AGENTS, Help, handoff, manifest schema, OpenAPI schema, and generated SDK contract fixtures so deploy/frontend agents see the production gate and public-repo hygiene boundary from the same machine-readable surfaces as preview readiness.
- Removed stale root handoff/diff artifacts from tracking and ignored them for future local-only use.
- Sanitized tracked docs/examples away from user-specific domains, local paths, account aliases, and unrelated project names.
- Removed the stale Backy public production aliases and the leftover Backy admin preview alias from Vercel; current Backy production aliases no longer point at broken public URLs.

**Commands run:**
- `npm run test:repo-public-hygiene` -> PASS.
- `BACKY_REPO_HYGIENE_PRIVATE_MARKERS=<local-private-markers> npm run test:repo-public-hygiene` -> PASS.
- `npm run test:vercel-production-readiness` -> PASS with expected warning that no live production URL is set.
- `BACKY_VERCEL_PRODUCTION_URL=<old-public-alias> BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 node scripts/vercel-production-readiness-smoke.mjs` -> FAIL as expected before alias removal because all required public contracts returned 404.
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:vercel-preview-readiness` -> PASS with the expected root-link warning.
- `npm run test:frontend-contract-types` -> PASS.
- `npm --workspace @backy/public run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run test:help` -> PASS.
- `npm --workspace @backy-cms/admin run test:sites` -> PASS.
- `git diff --check` -> PASS.

**Review findings:**
- [High] A Vercel production alias can be Ready while serving no Backy API routes. Resolved by adding a live-domain gate and removing stale Backy aliases until a database-mode production deployment is intentionally promoted.
- [Medium] Public tracked files had local handoff artifacts and user-specific examples. Resolved by deleting local-only artifacts, replacing examples with neutral domains/placeholders, and adding a hygiene smoke with optional private markers.

**Next:**
1. Do not promote production until `backy-public` has real database/storage/provider/admin/cron/CORS env and the live `BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1` gate passes on the final public domain.
2. Continue Batch 5 with the next visible admin/editor release friction point.

## 2026-05-31 20:28 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Vercel monorepo source previews are now deployable and verified

**What changed:**
- `package.json`: added `build:vercel:public` and `build:vercel:admin` scripts that build local workspace packages before the Next/Vite app build.
- `scripts/vercel-preview-readiness-smoke.mjs`: now verifies monorepo packaging ignores, Vercel CLI version, root/app Vercel ignore coverage, Vercel-specific build scripts, remote project settings, and source-files-outside-root support.
- `README.md`: replaced the stale prebuilt preview guidance with the proven root-source deploy flow and documented that current prebuilt public output is not valid release proof for API routes.
- `.vercelignore`, `apps/public/.vercelignore`, `apps/admin/.vercelignore`, `apps/public/.gitignore`, `apps/admin/.gitignore`: keep local Vercel links, Next/Vite build output, workspace `dist`, caches, and `node_modules` out of source uploads and commits.
- Vercel projects now exist and are configured:
  - `backy-public`: `rootDirectory=apps/public`, framework Next.js, build command `npm --prefix=../.. run build:vercel:public`, source files outside root enabled.
  - `backy-admin`: `rootDirectory=apps/admin`, framework Vite, output `dist`, build command `npm --prefix=../.. run build:vercel:admin`, source files outside root enabled.

**Preview deployments verified:**
- `backy-public` preview: `<backy-public-preview-url>`, deployment `<vercel-deployment-id>`, status READY.
- `backy-admin` preview: `<backy-admin-preview-url>`, deployment `<vercel-deployment-id>`, status READY.
- Public preview serves real Next API routes; `vercel curl` confirmed successful JSON for `/api/sites/site-demo/agent-handoff`, `/manifest`, `/openapi`, `/render`, and `/api/admin/auth/password-policy`.
- Admin preview is protected by Vercel auth from unauthenticated fetches, serves `/login` through authenticated Vercel curl, and its built entry references the public preview API/admin base URLs.
- `backy-admin.vercel.app/login` currently returns Vercel `DEPLOYMENT_NOT_FOUND`, so the old public admin alias remains removed.

**Commands run:**
- `npx vercel@latest api /v10/projects/<backy-public> -X PATCH ...` -> PASS; remote build/root settings updated.
- `npx vercel@latest api /v10/projects/<backy-admin> -X PATCH ...` -> PASS; remote build/root/output settings updated.
- `npm run build:vercel:public` -> PASS; local build lists all public/admin API routes.
- `npm run build:vercel:admin` -> PASS; Vite large editor chunk warning remains non-blocking.
- `npx vercel@latest deploy --target=preview --yes --logs` for `backy-public` -> PASS with randomized demo preview credentials.
- `npx vercel@latest deploy --target=preview --yes --logs` for `backy-admin` -> PASS with build-time API base URLs pointing at the public preview.
- `npm run test:vercel-release-config` -> PASS.
- `BACKY_VERCEL_REQUIRE_CLI=1 BACKY_VERCEL_REQUIRE_PROJECT_LINKS=1 BACKY_VERCEL_REQUIRE_REMOTE_PROJECTS=1 npm run test:vercel-preview-readiness` -> PASS with the expected root-link warning.
- `npm --workspace @backy/public run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `git diff --check` -> PASS before docs.

**Review findings:**
- [High] The previous prebuilt public deployment produced static output without Backy API routes. Resolved by switching the documented and verified release path to root source deploy with workspace package build scripts.
- [Medium] App-directory source deploy failed because Vercel applied `rootDirectory` again (`apps/public/apps/public`). Resolved by documenting and verifying repo-root deploys after linking the root to the intended project.
- [Medium] Remote Vercel builds failed to resolve local workspace package `dist` outputs. Resolved by building `@backy-cms/core`, `@backy/db`, and `@backy/storage` before app builds.
- [Medium] Preview deployment URLs are protected by Vercel auth. This is acceptable for previews; production/custom-domain public API deployment still needs explicit database-mode env and promotion.

**Next:**
1. Do not call this production-live yet. Promote only after setting real database/provider/storage env on `backy-public`, using only public/admin API base URLs in `backy-admin`, and intentionally promoting a verified source deployment.
2. Remove or replace the old broken `backy-public.vercel.app` production alias/deployment before sharing a public URL.
3. Continue Batch 5 with production database/provider env hardening or the next visible admin/editor release friction point.

## 2026-05-31 18:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Admin Vercel build now uses route-level code splitting

**What changed:**
- `apps/admin/vite.config.ts`: enabled TanStack Router `autoCodeSplitting` so admin routes are no longer all pulled into the initial Vite entry bundle.
- The production admin build now emits route chunks plus an isolated editor chunk. The previous single ~6.5 MB minified entry is now split into a ~0.87 MB main entry and a lazy ~2.18 MB editor chunk, with other admin routes split by route.

**Commands run:**
- `vercel whoami && vercel project ls` -> PASS as `<github-or-vercel-user>`; only `<existing-unrelated-project>` currently exists, so `backy-public` and `backy-admin` are still not created/linked.
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings that `apps/public/.vercel/project.json`, `apps/admin/.vercel/project.json`, and remote projects `backy-public`/`backy-admin` are not created/linked yet.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run build` -> PASS; route splitting is active, though Vite still warns because the editor chunk remains larger than 500 kB.
- `npm --workspace @backy-cms/admin run test:login` -> PASS.
- `npm --workspace @backy-cms/admin run test:pages-list` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-layers` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this Vercel-readiness bundle-splitting slice.
2. For actual Vercel preview deployment, create/link `backy-public` and `backy-admin`, set required protected env, and deploy previews.
3. Continue Batch 5 with the next visible editor/admin polish target if Vercel project linkage remains deferred.

## 2026-05-31 18:16 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Layers now expose breakpoint override/inheritance state

**What changed:**
- `apps/admin/src/components/editor/LayersPanel.tsx`: added a responsive Overrides scope, responsive layer counts, per-layer breakpoint state, and compact badges that distinguish desktop source, tablet/mobile local overrides, and inherited desktop state.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: passes the active editor breakpoint into the layer map so desktop/tablet/mobile summaries match the current canvas.
- `apps/admin/scripts/editor-drag-smoke.mjs`: expanded source/rendered coverage so layer-map smokes verify responsive scope filtering, desktop variant counts, mobile local layout overrides, inherited unchanged layers, and return-to-desktop behavior after breakpoint probes.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 node apps/admin/scripts/editor-drag-smoke.mjs` -> PASS.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-layers` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-responsive` -> PASS; slow because it exercises public mobile/tablet render geometry across many element types.
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings that `apps/public/.vercel/project.json`, `apps/admin/.vercel/project.json`, and remote projects `backy-public`/`backy-admin` are not created/linked yet.
- `npm run test:vercel-release-config` -> PASS.
- `npm --workspace @backy-cms/admin run build` -> PASS with the existing large Vite bundle warning.
- `npm --workspace @backy/public run build` -> PASS.
- `vercel whoami` -> PASS as `<github-or-vercel-user>`.
- `vercel project ls` -> PASS; only `<existing-unrelated-project>` exists under `<vercel-team-slug>`, so Backy project linkage is still pending.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this responsive layer-state slice.
2. If proceeding with Vercel mutation, create/link `backy-public` and `backy-admin`, set required protected env, then deploy previews.
3. Continue Batch 5 with the next visible editor/admin polish target if Vercel project linkage is deferred.

## 2026-05-31 17:22 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Inspector purpose is now explicit in editor chrome and status metadata

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: added a shared Inspector purpose label/key so the main toolbar, floating context bar, and Inspector panel all explain that Inspector covers selected-layer properties, the layer tree, and quick actions.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: wired the same purpose into action-status metadata so command/status tooling does not reduce Inspector to a vague toggle.
- `apps/admin/scripts/editor-drag-smoke.mjs`: expanded source and rendered shortcut coverage to verify the Inspector purpose label, panel purpose key, aside semantics, and status metadata.

**Commands run:**
- `BACKY_EDITOR_SOURCE_ONLY=1 node apps/admin/scripts/editor-drag-smoke.mjs` -> PASS.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-shortcuts` -> PASS.
- `npm run test:vercel-release-config` -> PASS.
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings that `apps/public/.vercel/project.json`, `apps/admin/.vercel/project.json`, and remote projects `backy-public`/`backy-admin` are not created/linked yet.
- `npm --workspace @backy-cms/admin run build` -> PASS.
- `npm --workspace @backy/public run build` -> PASS.
- `vercel whoami` -> PASS as `<github-or-vercel-user>`.
- `vercel project ls` -> PASS; only `<existing-unrelated-project>` exists under `<vercel-team-slug>`, so Backy project linkage is still pending.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this Inspector purpose clarity slice.
2. If the user wants an actual Vercel preview deploy, create/link `backy-public` and `backy-admin`, configure required env/protection, then deploy previews from `apps/public` and `apps/admin`.
3. Otherwise continue Batch 5 with the next visible editor/admin friction point.

## 2026-05-31 16:59 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** component-library section templates are now first-class editor starters

**What changed:**
- `apps/admin/src/components/editor/ComponentLibrary.tsx`: added a persistent Page sections starter shelf above the category rail, with a direct browse action plus quick-add buttons for Hero section, Feature grid, and Latest posts section.
- `apps/admin/src/components/editor/ComponentLibrary.tsx`: the starter shelf uses the normal component add path, recent tracking, action-status metadata, and selected-state metadata instead of a separate insertion path.
- `apps/admin/scripts/editor-drag-smoke.mjs`: expanded source and rendered component-library coverage to verify the shelf, section counts, action-status wiring, section selected state, and Hero quick-add behavior.

**Commands run:**
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `BACKY_EDITOR_SOURCE_ONLY=1 node apps/admin/scripts/editor-drag-smoke.mjs` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-library` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this component-library sections discoverability slice.
2. Continue Batch 5 with the next visible editor/admin friction point, or Vercel project linkage if explicitly requested.

## 2026-05-31 16:36 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** custom frontend handoff and component API contracts are now discoverable from global search

**What changed:**
- `apps/admin/src/components/layout/Header.tsx`: global search now includes first-class Tool results for Custom frontend handoff and Component API contract, both routing through the site-scoped Help surface.
- `apps/admin/scripts/login-smoke.mjs`: expanded rendered global-search coverage to query `handoff` and `component api`, proving both results expose ready action status and the exact handoff/API detail text.

**Commands run:**
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run test:login` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this global-search API handoff discoverability slice.
2. Continue Batch 5 with the next visible admin/editor friction point, or Vercel project linkage if explicitly requested.

## 2026-05-31 16:26 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** active-site switching now visibly leads to domain/subdomain setup without logout

**What changed:**
- `apps/admin/src/components/layout/Sidebar.tsx`: the active-site selector now exposes domain state metadata, a visible Domains link to the active site domain panel, and a site-scoped Help link beside the no-signout switcher.
- `apps/admin/src/components/layout/Header.tsx`: the desktop header site selector now includes a Domains shortcut with custom-domain/managed-host state metadata.
- `apps/admin/src/routes/help.tsx`: the switch-sites Help topic now names the sidebar and header Domains shortcuts as the path for custom-domain and subdomain DNS setup.
- `apps/admin/scripts/login-smoke.mjs` and `apps/admin/scripts/help-smoke.mjs`: expanded source/rendered coverage to prove the new controls are present, site-scoped, and describe domain/subdomain setup.

**Commands run:**
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `npm --workspace @backy-cms/admin run test:help` -> PASS.
- `npm --workspace @backy-cms/admin run test:help-rendered` -> PASS.
- `npm --workspace @backy-cms/admin run test:sites` -> PASS.
- `npm --workspace @backy-cms/admin run test:site-detail` -> PASS.
- `npm --workspace @backy-cms/admin run test:login` -> PASS on rerun; first attempt hit an early local `fetch failed`/`ECONNRESET` before chrome assertions.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this site switcher/domain discoverability slice.
2. Continue Batch 5 with the next visible admin/editor friction point, or Vercel project linkage if explicitly requested.

## 2026-05-31 16:00 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** editor Layers/Inspector mixed-selection scope is clearer and smoke-covered

**What changed:**
- `apps/admin/src/components/editor/CanvasEditor.tsx`: the Inspector now exposes sibling, mixed-parent, stale, and single-layer selection scope state as visible status text plus machine-readable data attributes.
- `apps/admin/src/components/editor/CanvasEditor.tsx`: same-parent bulk commands now reuse the exact mixed-scope reason when group, ungroup, copy, cut, duplicate, z-order, align, distribute, or delete actions are unavailable.
- `apps/admin/src/components/editor/LayersPanel.tsx`: the layer map now summarizes whether selected layers are visible in the current map/filter and row action status now explains whether a row is part of the current multi-selection.
- `apps/admin/package.json` and editor smoke guards: exposed previously unreachable keyboard-nudge, preview-scroll, and trace smoke modes; coverage now treats trace as a debug-only workflow exclusion and asserts the new rendered selection-scope metadata.

**Commands run:**
- `npm --workspace @backy-cms/admin run test:editor-smoke-coverage` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-layers` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-inspector` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-inspector-actions` -> PASS.
- `npm --workspace @backy-cms/admin run test:editor-multiselect` -> PASS.
- `npm --workspace @backy-cms/admin run typecheck` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this editor selection-scope clarity slice.
2. Continue Batch 5 with the remaining scout target: site switcher/domain/subdomain discoverability, or Vercel project linkage if explicitly requested.

## 2026-05-31 15:11 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** Vercel env examples now match the protected-admin/public-api/custom-frontend topology

**What changed:**
- `.env.example`: added separate commented env templates for the `backy-public` Next.js project, protected `backy-admin` Vite shell, and custom website frontend projects.
- `.env.example`: clarified that `VITE_BACKY_ADMIN_API_KEY` is local/demo-only and must not be configured for the production protected admin shell.
- `scripts/vercel-preview-readiness-smoke.mjs`: now guards the `.env.example` deployment env boundary so README/Help/handoff and env templates cannot drift.

**Commands run:**
- `npm run test:vercel-preview-readiness` -> PASS with expected warnings that Vercel projects/links are not yet created.
- `npm run test:vercel-release-config` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this Vercel env template alignment slice.
2. Continue Batch 5 on the next release-facing editor/admin UX issue or actual Vercel project linkage if explicitly requested.

## 2026-05-31 15:03 IST

**Batch:** 5: Ongoing UX Scout And Polish
**Contract status:** in-app Help now mirrors the Vercel preview readiness/deployment topology gate

**What changed:**
- `apps/admin/src/routes/help.tsx`: updated the Deploy Backy and custom frontends topic to name `npm run test:vercel-release-config`, `npm run test:vercel-preview-readiness`, strict project-link readiness, and optional Vercel Agent Code Review setup from Project Settings -> AI.
- `apps/admin/src/routes/help.tsx`: added a copyable Deploy topology starter so frontend/deploy agents can copy `agent-handoff.deploymentTopology.verification.previewReadinessSmoke = npm run test:vercel-preview-readiness` from Help beside manifest/OpenAPI/render/component contract starters.
- `apps/admin/scripts/help-smoke.mjs`: expanded source and rendered smoke coverage to verify the deployment topology starter renders, copies, and remains site-scoped with the rest of the frontend agent handoff.

**Commands run:**
- `npm run test:help --workspace @backy-cms/admin` -> PASS.
- `npm run typecheck --workspace @backy-cms/admin` -> PASS.
- `BACKY_HELP_RENDERED_SMOKE=1 BACKY_ADMIN_BASE_URL=http://127.0.0.1:5173 npm run test:help-rendered --workspace @backy-cms/admin` -> PASS.
- `git diff --check` -> PASS.

**Next:**
1. Commit and push this Help deployment-readiness alignment slice.
2. Continue Batch 5 with either non-mutating deploy readiness/handoff polish or the next visible admin/editor UX issue.

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
- Vercel MCP token is expired, but local Vercel CLI is authenticated as `<github-or-vercel-user>`.
- Vercel team visible: `<vercel-team-slug>`.
- Existing Vercel projects visible from CLI: only `<existing-unrelated-project>`; Backy is not yet linked as `backy-public` or `backy-admin`.
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
- `apps/admin/src/routes/sites.tsx`: the Site frontend API panel now surfaces `Agent handoff`, host-aware resolve/render URLs using `domain={host}`, and frontend env guidance for `BACKY_PUBLIC_API_BASE_URL`, `BACKY_SITE_ID`, and `BACKY_SITE_PUBLIC_HOST`. The copied `backy.site.frontend.v1` contract now includes domain verification status, public host, environment variables, and a routing block with subdomain examples such as `studio.example.com`.
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
- Git remote: PASS, origin points to `https://github.com/<github-or-vercel-user>/backy.git`.
- GitHub CLI: WARN, stale invalid `GITHUB_TOKEN` exists but keyring login for `<github-or-vercel-user>` is present.
- Secret-history check: PASS for the previously reported blocked commit ids; they are not valid commits in current local history.
- Validation gate dry run: deferred to Batch 1 focused gates because this setup is documentation/process-only.
- Environment/sleep/notification checks: WARN/N/A, no Slack webhook or sleep-prevention process recorded.

**Launch readiness:** READY with PR/push strategy warning.

**Launch prompt:**
> Continue the open-ended Backy Elves run from `docs/elves/survival-guide.md`. Do not stop unless explicitly stopped or genuinely blocked. Work batch by batch, validate, commit logical slices, and keep release UX/editor/custom-frontend readiness moving.

## Checkpoint: 2026-06-02 11:25 IST - Editor Responsive Next Action

**Scope:** Batch 5 UX/editor polish, focused on responsive editor clarity for custom frontend control.

**Changed:**
- Added a typed `backy.editor-responsive-next-action.v1` contract to `CanvasEditor`.
- Derived the next responsive action from active breakpoint, selected layer, hidden/locked state, active override groups, and total breakpoint override counts.
- Surfaced the action in viewport metadata, the wide toolbar, selected-layer Inspector breakpoint controls, and the empty Inspector state.
- Made the action copyable so owners/frontend agents can inspect whether they should switch breakpoints, select a layer, create a local override, continue/reset overrides, or unblock a selected layer.
- Added source guard coverage in `editor-smoke-script-coverage.mjs`.

**Validation:**
- PASS: `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`
- INCONCLUSIVE: `npm run test:editor-responsive --workspace @backy-cms/admin --silent` was stopped after several silent minutes; the process stayed alive with no output and no reliable pass/fail signal.

**Next:**
- Commit this focused contract slice.
- Re-run a traced or bounded rendered responsive smoke in a later pass if the editor responsive UI changes beyond source/contract metadata.
- Continue the release path from the survival guide: Vercel GitHub App access/Preview env for the separate frontend repo, public domain cutover only when ready, and remaining high-friction admin/editor polish.

## Checkpoint: 2026-06-02 11:56 IST - Responsive Next Action Rendered Smoke

**Scope:** Batch 5 UX/editor polish, focused on keeping custom frontend responsive control metadata browser-verifiable without rerunning the long full responsive matrix.

**Changed:**
- Added `test:editor-responsive-next-action` as a bounded editor smoke.
- Wired it into `test:editor-workflows` and `editor-smoke-script-coverage.mjs`.
- The rendered smoke now proves `backy.editor-responsive-next-action.v1` through real DOM controls across desktop, mobile empty Inspector, inherited selected layer, and local mobile override states.
- The smoke uses an inherited `smoke-image` layer and the existing property-panel layout edit path to create a local mobile override deterministically.

**Validation:**
- PASS: `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-responsive-next-action --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Next:**
- Commit and push the bounded smoke slice.
- Keep custom frontend connection work prioritized: the Backy production site and custom frontend contract are green, while Vercel GitHub App access for the private separate frontend repo and eventual DNS cutover remain operator/manual gates.

## Checkpoint: 2026-06-02 12:19 IST - Custom Frontend Responsive Starter Rendering

**Scope:** Batch 5 custom-frontend control polish, focused on making separate website frontends apply Backy responsive design metadata instead of only preserving it as passive attributes.

**Changed:**
- Updated the checked Next.js starter renderer to generate tablet/mobile media-query CSS from Backy responsive layout/style overrides.
- Kept hidden-by-default elements renderable when a breakpoint override can reveal them, while preserving base hidden state otherwise.
- Added generated responsive CSS control pointers and metadata attributes so frontend agents can trace rendered behavior back to `render.generatedResponsiveCss`.
- Sanitized generated CSS declaration values so unsafe text is skipped instead of interpolated into the starter `<style>` block.
- Regenerated the protected starter file-list template used by the admin starter export and no-browser scaffold flow.
- Strengthened the starter smoke so the generated bundle proves responsive CSS generation, pointer metadata, and clean source typechecking without leaving transient `next-env.d.ts` output in the repo.

**Validation:**
- PASS: `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent`
- PASS: `npm run test:custom-frontend-connection --silent`
- PASS: `npm run typecheck --workspace @backy/public --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Next:**
- Commit and push this focused custom-frontend starter slice.
- The remaining external/manual launch gates are still Vercel GitHub App access for the private separate frontend repo, Preview env after Git connection, and public-domain DNS cutover only when ready.

## Checkpoint: 2026-06-02 12:48 IST - Responsive Custom Frontend Connection Gate

**Scope:** Batch 5 custom-frontend control polish, focused on making responsive rendering part of the required deployed frontend contract instead of a starter-only implementation detail.

**Changed:**
- Added `data-backy-responsive-css` and `data-backy-responsive-style-pointer` to the required custom frontend DOM contract used by the starter probe, protected admin verifier, protected starter export, no-browser scaffold manifest, Help copy, and `npm run test:custom-frontend-connection`.
- Added `render.generatedResponsiveCss` to the public `/api/backy-connection` control-plane pointers so frontend agents know where responsive CSS generation is traced.
- Regenerated the protected starter project file list after updating the checked starter probe.
- Synced the separate `devanshvarshney-frontend` repo with the latest responsive renderer and probe, committed it as `c0c4998`, and deployed it to Vercel production.

**Validation:**
- PASS: `npm run test:custom-frontend-connection --silent`
- PASS: `BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK=1 npm run test:custom-frontend-starter --silent`
- PASS: `npm run test:help --workspace @backy-cms/admin --silent`
- PASS: `npm run test:help-rendered --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy/public --silent`
- PASS: separate frontend `npm run typecheck --silent`
- PASS: separate frontend production build with safe Backy public/server-loader env
- PASS: strict local custom frontend gate against `http://127.0.0.1:3037` with `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1` and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1`
- PASS: strict deployed custom frontend gate against `https://devanshvarshney-frontend.vercel.app` with `BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1` and `BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1` -> 69 checks
- PASS: deployed `/api/backy-connection` probe reports responsive required attributes, `responsiveStylePointer=render.generatedResponsiveCss`, no forbidden private env, and `includesSecretValues=false`

**Next:**
- Commit and push the Backy verifier/source slice.
- After Backy Vercel redeploys, rerun production readiness, hosted admin login shell, and the strict deployed custom frontend gate so the production Backy verifier source and separate frontend deployment are proven together.

## Checkpoint: 2026-06-02 13:12 IST - Dashboard Custom Frontend Control Readiness

**Scope:** Batch 5 custom-frontend launch polish, focused on making the first admin screen show the same control state as the deeper Site Detail handoff.

**Changed:**
- Added `backy.dashboard-custom-frontend-control-readiness.v1` to the Dashboard custom frontend launch panel and downloadable dashboard handoff.
- Derived Backy-owned checks for public API contract, frontend design source, template registry, and deployed frontend verifier from the active site state.
- Kept operator-owned gates explicit for public-domain ownership and Vercel Git previews.
- Added copyable `backy.dashboard-custom-frontend-next-action.v1` so owners/frontend agents can act from Dashboard without reading the whole Site Detail checklist.
- Extended the dashboard source/render smoke to guard the readiness schema, check rows, operator/manual status, verifier link, and next-action copy affordance.

**Validation:**
- PASS: `npm run test:dashboard --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Next:**
- Commit and push this focused dashboard control-readiness slice.
- Continue the release path from the survival guide: Vercel GitHub App access remains external/manual for the private separate frontend repo, and public-domain DNS cutover should wait until the operator is ready.

## Checkpoint: 2026-06-02 13:48 IST - Dashboard Custom Frontend Agent Brief

**Scope:** Batch 5 custom-frontend launch polish, focused on making the Dashboard copyable enough for another frontend agent to continue without chat history.

**Changed:**
- Extracted Dashboard custom-frontend launch/readiness/agent-brief construction into a typed `customFrontendLaunch` helper instead of growing the already-large Dashboard route file.
- Added `backy.dashboard-custom-frontend-agent-brief.v1` with the active site, read order, browser-safe env, server-loader env, forbidden env names, scaffold command, deployed verification command, readiness summary, next action, and manual domain/Git gates.
- Added a visible Dashboard “Frontend agent brief ready” strip plus “Copy agent brief” action beside the custom frontend next action.
- Included the agent brief in the downloadable Dashboard handoff JSON.
- Extended Dashboard smoke coverage to guard the agent-brief schema, source, read-order count, manual-gate count, scaffold command, deployed verification command, and copy action.

**Validation:**
- PASS: `npm run test:dashboard --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`

**Next:**
- Run repo public hygiene, commit, push, and re-check production deployment.
- Remaining non-code launch gates are still Vercel GitHub App access for the private separate frontend repo, Preview env after Git connection, and public DNS cutover only when ready.

## Checkpoint: 2026-06-02 14:10 IST - Dashboard Custom Frontend Content Creation

**Scope:** Batch 5 custom-frontend control polish, focused on making Backy-authored pages and blog posts start from the synced custom frontend template registry instead of requiring owners or frontend agents to guess create-route query params.

**Changed:**
- Added `backy.dashboard-custom-frontend-content-creation.v1` to the Dashboard custom-frontend helper.
- The contract derives the preferred active page and blogPost templates from `frontendDesign.templates[]`, emits custom-frontend create routes with `templateSource=custom-frontend`, `frontendDesignTemplateId`, and `focus=canvas`, and also keeps explicit Backy-canvas fallback routes.
- Dashboard now shows “Create from custom frontend design” with New custom page/post actions, or Sync template actions when the registry is not ready.
- The copyable `backy.dashboard-custom-frontend-agent-brief.v1` now includes the same content-creation contract so a separate frontend agent can keep Backy in control of new pages/posts.
- Dashboard smoke now guards the schema, visible actions, template source metadata, fallback routes, and create-route attributes.

**Validation:**
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `npm run test:dashboard --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Next:**
- Pushed as `2f18beb9`.
- Fresh `backy-admin` and `backy-public` production deployments are Ready.
- Hosted verification after push is green: production readiness passes 47 checks, hosted admin login shell has no demo credentials/dev MFA, strict deployed custom frontend connection passes 69 checks, and fresh Vercel error logs are empty.
- Remaining non-code launch gates are still Vercel GitHub App access for the private separate frontend repo, Preview env after Git connection, and public DNS cutover only when ready.

## Checkpoint: 2026-06-02 16:35 IST - Creator Contract And Dynamic Content Gates

**Scope:** Batch 5 custom-frontend/content-creation hardening, focused on proving that new pages, blog posts, forms, products, and collections can stay aligned with the synced custom frontend contract without silently losing design/template metadata.

**Changed:**
- Fixed full `backy.frontend-design.v1` replacement semantics so a complete synced custom frontend contract replaces stale fallback source/tokens/chrome/templates/editable-map data, while partial patches still merge.
- Added a template-registry regression proving complete frontend-design replacement drops stale fallback templates and editable maps.
- Hardened page-create, forms, and collections smoke quota fixtures so local billing limits are raised/restored deterministically against the full current collection count.
- Fixed the Collections smoke draft-schema path to target stable field inputs, wait for custom key/label persistence before save, assert the actual `POST /collections` request, and verify billing quota changes through a fresh site read.
- Made the Forms smoke refresh helper wait for the refresh action to leave its transient disabled/loading state instead of failing on the first disabled frame.
- Added a products source/catalog contract alias that does not masquerade as the full signed-webhook commerce provider gate.
- Stored a custom CSS marker in the blog-create frontend template smoke so blog post template persistence covers CSS, JS, responsive overrides, editable maps, and frontend-design metadata together.

**Validation:**
- PASS: `npm run test:collections --workspace @backy-cms/admin --silent`
- PASS: `npm run test:blog-create --workspace @backy-cms/admin --silent`
- PASS: `npm run test:page-create --workspace @backy-cms/admin --silent`
- PASS: `npm run test:forms --workspace @backy-cms/admin --silent`
- PASS: `npm run test:products --workspace @backy-cms/admin --silent`
- PASS: `npm run test:template-registry --workspace @backy/public --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy/public --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Notes:**
- Full `npm run test:commerce --workspace @backy-cms/admin` still requires the running public app to be started with the matching commerce webhook secret and live/mock provider env. That remains separate from the local product/catalog source gate and does not close the external commerce provider certification partial.
- Audio media support is already present in the media/upload boundary; automatic transcription generation remains a future provider-backed feature, while transcript text can be stored as normal blog/page content or metadata.

**Next:**
- Commit and push this creator/dynamic-content contract slice.
- Continue highest-friction editor work next: direct canvas asset insertion/drop behavior, long-page auto-height/flow editing, and Canva-like media insertion ergonomics.

## Checkpoint: 2026-06-02 17:24 IST - Canvas Audio And Direct Media Drops

**Scope:** Batch 5 editor/media polish, focused on making audio/transcripts and Canva-like direct asset insertion part of the same Backy canvas/custom-frontend contract instead of a media-library-only path.

**Changed:**
- Added `audio` as a first-class canvas/API element type across admin editor types, API types, component catalog, component library icons, media picker target fields, Inspector controls, public page renderer, custom frontend starter renderer, and custom frontend component handoff.
- Added selected-layer Inspector controls for audio URL, media-library selection, upload, caption, transcript, controls, autoplay, loop, and muted state.
- Added direct canvas drop support for local files and URL-like media dragged from other tabs. Dropped files upload through the existing media API, keep `assetIds`, media ids, scope/folder metadata, signed-url metadata, and `backy.canvas-asset-drop.v1` provenance; dropped media URLs create image/video/audio/link elements at the pointer.
- Added an in-canvas drop target overlay that distinguishes upload-and-place, place-url, and normal component placement without stealing ordinary component drags.
- Split canvas width and height clamps: width stays capped at 3840px for device/breakpoint control, while authored page height can grow to 24000px so long pages and posts are not artificially stuck at hero-section height.
- Added `test:editor-canvas-media-drop` source smoke and wired it into `test:editor-workflows` so audio, transcript, media-drop, public render, starter render, handoff, and long-page-height contracts stay guarded.

**Validation:**
- PASS: `npm run test:editor-canvas-media-drop --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy/public --silent`
- PASS: `npm run typecheck --workspace @backy/sdk-js --silent`
- PASS: `npm run test:generated-types --workspace @backy/sdk-js --silent`
- PASS: `npm run test:custom-frontend-starter --silent`
- PASS: `npm run test:custom-frontend-connection --silent` (source mode; live API/frontend env not set)
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Notes:**
- This stores and renders transcript text but does not generate automatic transcripts. Auto-transcription remains a future provider/job integration and should not be faked without a configured provider and secret boundary.
- Direct file drops use the existing upload/media API path, so storage/provider behavior remains consistent with the media library.

**Next:**
- Pushed as `3c9edc18`.
- Fresh `backy-admin` and `backy-public` production deployments are Ready.
- Hosted verification after push is green: production readiness passes 47 checks, hosted admin login shell exposes no demo credentials/dev MFA, and the strict deployed real-site custom frontend connection passes 69 checks when run with the canonical production site id resolved by public discovery.
- The first strict custom frontend gate run with the slug `devanshvarshney` passed 68 checks and failed only the probe site-id equality check because the deployed frontend is configured with the canonical database site id. Public discovery resolves the slug to that canonical id.
- Recent Vercel error-log filtering was not recorded because this local Vercel CLI rejected the documented log filter flags (`--project`, `--environment`, `--level`) despite showing them in help.
- Continue the remaining editor polish around custom-frontend template creation ergonomics, flow-aware section insertion/resizing, and rendered browser verification for the new drop/long-page behaviors when a live dev session is available.

## Checkpoint: 2026-06-02 18:20 IST - Rendered Canvas Media Drop Proof

**Scope:** Batch 5 editor/media verification polish, focused on proving the new direct-drop/audio/long-page canvas behavior through the real browser editor instead of source contracts only.

**Changed:**
- Added `BACKY_EDITOR_CANVAS_MEDIA_DROP_RENDERED_SMOKE=1` plus `test:editor-canvas-media-drop-rendered` and wired it into `test:editor-workflows`.
- The rendered smoke creates a disposable editor page, dispatches external image/video/audio URL drops, dispatches a local audio-file drop, selects the uploaded audio layer, edits caption and transcript in Inspector, saves, and verifies persisted media provenance plus canvas height growth.
- Tightened URL-kind detection for MIME-style data URLs so `data:image/*`, `data:video/*`, and `data:audio/*` drops resolve to media elements instead of generic links.
- Fixed `PropertyPanel` element normalization so selected `audio` layers actually render the audio URL, media-library/upload, caption, transcript, and playback controls.
- Updated editor source guards for the split canvas width/height limits and added a regression guard that `audio` remains in the PropertyPanel canonical element-type list.

**Validation:**
- PASS: `npm run test:editor-canvas-media-drop-rendered --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-canvas-media-drop --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-smoke-coverage --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`
- PASS: `npm run test:repo-public-hygiene --silent`

**Notes:**
- Rendered proof persisted an uploaded audio element with `mediaInsertedVia=canvas-file-drop`, `mediaType=audio`, `assetIds`, caption, transcript, and a grown canvas height above the original viewport. This covers the user concern that pages/posts must continue vertically while width remains the desktop/tablet/mobile viewport concern.
- Automatic transcription generation is still a future provider/job integration; this slice proves authored or pasted transcripts are editable, renderable, and persisted.

**Next:**
- Commit and push this rendered verification slice.
- Continue highest-friction editor work around custom-frontend template chrome, flow-aware section insertion/resizing, and Canva-like component/media insertion ergonomics.

## Checkpoint: 2026-06-02 20:05 IST - Custom Frontend Starters And Nested Canvas Drops

**Scope:** Batch 5 editor/page-creation polish, focused on the user's custom frontend template expectation: new pages should keep the Backy starter intent surface while matching captured custom frontend design contracts, and canvas media drops should behave like a real nested editor surface.

**Changed:**
- Page creation now keeps the 33 starter templates visible in both Backy canvas and Custom frontend modes. In custom frontend mode, each starter exposes whether it is matched to a captured frontend template, missing a captured template, or intentionally blank/from-scratch.
- Custom frontend page creation auto-matches the selected starter intent to captured `frontendDesign.templates[]` using deterministic route/name/alias scoring, preserves `templateSource=custom-frontend`, stores frontend template metadata, and keeps Blank as an explicit from-scratch custom page.
- Frontend template fallback seeding now wraps non-blank custom frontend pages with shared header/navigation/footer chrome when the captured template has no concrete element tree yet, so users do not start from a naked section.
- Canvas nested file/URL drops now infer the eligible parent layer from the actual drop event target even when the root canvas receives the event, clamp inserted child coordinates to the parent bounds, and expose `data-parent-id` for rendered verification.
- The rendered media-drop smoke now drops an external URL onto `smoke-box`, verifies the inserted link is a child of `smoke-box`, saves, and asserts persisted tree integrity plus exact external URL/href provenance.

**Validation:**
- PASS: `npm run test:editor-canvas-media-drop --workspace @backy-cms/admin --silent`
- PASS: `npm run typecheck --workspace @backy-cms/admin --silent`
- PASS: `BACKY_PAGE_CREATE_SOURCE_ONLY=1 npm run test:page-create --workspace @backy-cms/admin --silent`
- PASS: `BACKY_PAGE_CREATE_FRONTEND_TEMPLATE_ONLY=1 BACKY_PAGE_CREATE_CONTROL_WAIT_ATTEMPTS=80 npm run test:page-create --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-nested-group --workspace @backy-cms/admin --silent`
- PASS: `npm run test:editor-canvas-media-drop-rendered --workspace @backy-cms/admin --silent`
- PASS: `git diff --check`

**Notes:**
- The full unfiltered `npm run test:page-create --workspace @backy-cms/admin --silent` was stopped as inconclusive after several silent minutes; the source guard and focused custom-frontend browser path passed and cover the changed page-create behavior.
- Spark subagents reviewed both the custom-frontend starter matching and the nested media-drop proof. Their findings were incorporated: starter library visibility in custom mode, source-aware starter matching, nested target scoping, parent-bound clamping, and persisted child-tree validation.

**Next:**
- Run repo public hygiene, commit, push, re-read the survival guide, then continue the next highest-friction Backy UX/editor gap.
