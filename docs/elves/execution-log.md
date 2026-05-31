# Execution Log

Newest entries go at the top. Keep reusable lessons in `docs/elves/learnings.md`.

## Run Digest

- **Last updated:** 2026-06-01 00:44 IST
- **Current phase:** In progress
- **Active batch:** Batch 5: Ongoing UX Scout And Polish
- **Last completed batch:** Batch 4: Release Certification And Vercel Readiness
- **Next exact batch:** Batch 5: Ongoing UX Scout And Polish
- **Active PR:** not created yet
- **Docs promoted this run:** `docs/elves/learnings.md`
- **Latest Elves Report:** not generated yet

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
