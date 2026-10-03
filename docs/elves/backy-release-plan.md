# Plan: Backy Release Parity Hardening

## Mission

Bring Backy from the current 41 Ready / 4 Partial audit state into a coherent, releaseable product experience for secure multi-site website backends, custom frontend handoff, and Canva/Wix-style page editing. The remaining audit partials are external live Settings/Commerce provider certification artifacts; product work during this run should focus on the admin UX, canvas editor reliability, custom frontend discoverability, and release verification around those known external gates.

## Backend continuation: 2026-10-03

The owner clarified that the current task is completing Backy. New frontend design and DNS cutover are deferred. The existing website repository is used to verify the integration and repair its publishing bridge, without designing new pages or inventing owner content.

Fresh evidence:

- A disposable production workspace imported a frontend design contract, exposed it in the template registry, created a page and blog post, reopened them, edited their titles, and published them. Two font tokens, element geometry, `responsive.mobile`, shared header chrome, custom CSS, bindings, editable fields, and canonical content documents survived. This proves API persistence; browser editor interaction remains a separate gate.
- Draft page/post previews showed new draft content while public render isolated it. Publishing updates became visible through the public API; withdrawal respected the API cache window. Backy's public cache can take roughly 30 seconds to expire. The separate Next.js bridge previously cached forever: a failing production-server behavior test now passes for page/post updates, blog archive updates, withdrawal, and 404 handling after using `no-store`.
- Live page/blog comment submissions previously bypassed manual moderation, exposed author email, and stored forged client user IDs. After production deployment, manual-review submissions stay pending, guest identity cannot be forged, public receipts/detail omit private fields, unauthorized moderation returns 401, and authenticated moderation retains author details. Six public-read routes, report receipts, and guest-disabled submissions are covered locally. Repository tests additionally deny moderation to accounts outside the site's team.
- The deployed comment publication boundary now hides draft, archived, and future scheduled targets across page/blog lists, nested detail, site-wide detail/feed, submissions, and reports. A near-future page/post schedule became visible after its due time. Public email searches return no matches, private request-id filters require authentication, pending comments cannot be reported publicly, and moderators retain withdrawn-content access. Local behavior tests first reproduced the private-search leak; a pre-deployment production test also reproduced the pending-report leak. Database repository tests cover visibility before pagination and published-site isolation. Comment regressions now run inside the standard public security gate.
- Backy public/admin and the existing separate website bridge were deployed successfully. The live website/API connection gate passed 113 checks, and the latest public deployment passed the required 47-check live production gate. Owner browser authentication remains explicitly outside these proofs.
- HTTP scanner tests reject missing or malformed verdicts even when HTTP returns 200 and fail-open is enabled. The provider suite covers 16 cases. Vercel local-storage diagnostics now report unconfigured instead of advertising usable upload storage.
- Production now uses persistent Supabase storage with a private bucket. A disposable provider object passed server byte readback, anonymous/public denial, and cleanup; this is storage transport evidence, not upload scanning evidence. Live Settings reports storage configured and the scanner unconfigured. Prepared image variants now use guarded Backy transform URLs rather than provider public URLs, with local regression coverage for byte delivery, private-asset denial, and cross-site path rejection. Production signing fails closed without a server secret; its development-key baseline failed before the repair and passes afterward. A dedicated server signing key is configured. Public build, focused media/security tests, and the required 47-check live readiness gate pass after deployment.
- An isolated local browser workspace created a reusable section from a registered frontend template and retained a visual font/size edit after save and full reload. The imported-style inspector initially showed defaults instead of the template's typography; it now reads styles with explicit editor props taking precedence. The inspector also collapsed its property viewport and expanded fields beyond the available width. A single embedded inspector scroll surface, explicit minimum widths, and viewport-aware section editor height now keep controls reachable on desktop, tablet, and phone. A saved font size of 22 survives full reload. Admin typecheck/build and source guards pass; this local evidence does not complete production owner authoring.
- Registering two versions of a frontend-owned figure exposed another concrete editor blocker: adding `interactiveFigure`, `codeBlock`, or `codeComponent` converted its camel-case type into plain text. The production normalizer now resolves normalized input back to the canonical type. The new behavior regression first failed for `interactiveFigure` and now passes 79 canonical/alias/fallback cases inside the standard editor gate. Local API and actual browser UI prove both figure versions are selectable, schema-driven text/number/select fields can be edited, and version/value changes survive save and full reload in a reusable section with responsive state intact. This proves frontend-owned component mapping and editor persistence; uploaded bundle execution remains separate.
- A local product created through the registered frontend template card retained its edited title and price after full browser reload. Authenticated record readback preserved the registered figure version and values, responsive overrides, frontend tokens, editable map, and data bindings after the catalog save. This is product-template creation and catalog editing evidence, not visual product-page authoring or paid settlement proof. Both inspector and element-type repairs have reached a Ready production admin deployment; owner browser authoring remains unverified.
- Reviewed uploaded JavaScript modules now execute through the registry sandbox instead of stopping at a fallback shell. The runtime verifies approval, server HMAC, site/key/version storage scope, provider, byte count and SHA256 before importing stored bytes; it never fetches an arbitrary bundle URL. Replacement upload resets approval. The machine-readable module contract documents mount/update/cleanup, and HTTP CSP enforces opaque isolation even if a frontend omits iframe flags. Executable responses are no-store. Local browser checks prove property updates, cleanup before remount, parent DOM/cookie/storage denial, and rejection of sibling/wrong-version messages. Production registration, private Supabase upload/readback, approval, and actual public-page browser interaction pass in the disposable workspace. The first live request exposed an untraced optional Supabase driver; a literal lazy import and explicit public dependency repair that packaging blocker while retaining the existing driver version. A separate public-renderer regression also preserves canonical interactive/figure/code types. Focused bundle checks cover 19 rejection/success cases; storage smoke, generated SDK types, public typecheck/build, production dependency security, hygiene and the 47-check live readiness gate pass. Production owner admin authoring remains separate.
- Live-required production readiness passes 47 checks. The starter passes 166 checks; frontend discovery, template registry, public-security regression, RBAC coverage, storage runtime checks, builds/typechecks, and repository hygiene pass. The existing bridge passes 32 contract checks and the production publishing behavior test.

- Visual product-template authoring now uses the existing canvas in the product workspace. Isolated desktop browser verification saved a registered figure caption/sample count and catalog price through both canvas Save and Save Product, then retained them after full reload. API readback retained template identity, tokens/fonts, chrome, bindings, editable maps and responsive geometry. The design codec additionally covers canonical-document-only inputs, assets, animations, custom CSS/JS, opaque extensions, version metadata and empty canvases. Reusing a template previously failed SKU uniqueness; each new instance now has a unique SKU/slug suffix, with two successful browser creations. The post-create shortcut opens that product's canvas. Admin typecheck/build, codec behavior tests, editor source/coverage guards, commerce source guards and hygiene pass. The admin deployment reached Ready, and the live product/canvas bundles contain the new panel, product labels, shortcut and unique instance generation. Subsequent local browser checks used measured phone (390 by 844) and tablet (768 by 1024) viewports: component properties saved and survived full reload, with no document horizontal overflow. These checks used keyboard selection/edit/save because pointer coordinates under browser emulation were unreliable. Production owner authoring remains a separate gate.
- The checked starter and existing separate website bridge now render reviewed uploaded code components through the configured Backy sandbox endpoint, rather than an empty paragraph. Saved arbitrary sandbox URLs are ignored; iframe source, protocol, component key and version are checked, and unknown trusted components retain their fallback until the frontend supplies a React mapping. Actual local browser checks on the separate Next.js bridge prove initial mount, a counter interaction, public property updates, parent DOM/cookie/storage denial, and readable failure fallback. The check exposed a hydration timing race that could hide an already responding widget; scoped resize replies now establish readiness too. A production Next build running locally additionally passes initial hydration, interaction and isolation through the normal published route. The temporary verification route was removed. Behavior regression, starter export, public/bridge typechecks, public build, bridge production publishing behavior and repository hygiene pass. Backy public and the existing website bridge were deployed to their production aliases; the required live connection gate passes 113 checks and required live production readiness passes 47 checks, explicitly skipping owner authentication. The live sandbox contract permits the existing frontend origin. Local embedding and deployed-code proofs do not establish production owner authoring or a production widget on the owner's website.

Remaining backend gates:

- Configure an actual HTTP or ClamAV scanner, then prove clean/rejected upload behavior and image/video/font readback through Backy on the configured persistent private storage. Do not bypass scanning to pass this gate.
- Complete owner browser login, template creation, canvas edit/reopen, preview and publish verification. Active database owner roles and operator-key API tests do not substitute for that UI evidence.
- Real paid settlement and outbound newsletter delivery remain the existing external provider certification gates.

The earlier product-wide counts below are historical audit counts, not proof that these launch gates are complete.

## Canonical Launch-Critical Status

Last refreshed: 2026-10-03 IST. The dated backend continuation below supersedes historical readiness claims for the paths it covers. The page-surface audit remains canonical for the separate `41 Ready / 4 Partial` product count.

| Launch capability | Current state | Evidence / remaining gate |
| --- | --- | --- |
| Protected Backy admin | Ready | `https://backy-admin.vercel.app/login` is live; the production login-shell smoke exposes no demo credentials or development MFA phrase. Production Forgot Password now queues recovery through Supabase Auth, accepts the provider recovery fragment on the Backy reset screen, removes it from browser history, and requires a fresh sign-in after the password changes. |
| Backy public/API runtime | Ready | `https://backy-public.vercel.app` is live on Supabase/Postgres-backed database mode; production readiness passes 47 checks for discovery, handoff, manifest, OpenAPI, and render. Exact production CORS origins are configured for Backy admin, the deployed custom frontend, and the apex/`www` website hosts. |
| Production owner access | Database role verified; browser proof pending | The intended owner account was freshly confirmed active with an owner profile and owner team membership. This is role evidence, not a successful browser login or canvas-authoring session. |
| Real website site record | Ready for authoring | `devanshvarshney` / `devanshvarshney.com` exists as a published Backy site with a published homepage. DNS/domain status remains pending until the live domain is moved and verified. |
| Separate custom frontend | Ready on Vercel | `https://devanshvarshney-frontend.vercel.app` is deployed separately. The strict production connection gate passes 113 checks using canonical site id `f766b8f8-6480-40bb-abec-775b75e09c07`, including public API, DOM control attributes, `/api/backy-connection`, editable-map, responsive, template registry, blog inheritance, and frontend-design pointers. The deployed runtime also renders hydrated blog/catalog repeaters, schema-driven forms, audio/video/code blocks, newsletter unsubscribe, and `/checkout`, `/checkout/success`, and `/checkout/cancel`. Its checkout bridge rejects raw card data and URL-carried status tokens, keeps order status tokens in an HttpOnly same-site cookie, and returns no-store responses. |
| Pages and blog publishing | Ready for use | Backy page/blog creation, templates, canvas persistence, public render, long-page growth, audio/transcript starter, custom-frontend template inheritance, and publish APIs are implemented and smoke-guarded. The separate frontend now serves a searchable `/blog` archive from the public blog API even before an authored index page exists; future published posts populate it automatically, while an authored Backy `/blog` page takes precedence. Real authored content still needs to be entered by the owner. |
| Media, files, fonts, forms, newsletter | Persistent private storage configured; uploads await scanner | Live Settings reports Supabase storage configured. Private provider transport/readback and anonymous denial pass; prepared image variants use Backy's guarded delivery routes. Local signing/security, storage, scanner and upload-contract checks pass. A real scanner and clean/rejected Backy upload/readback remain required. Form/newsletter capture and outbound delivery retain their separate existing gates. |
| Products and orders | Buyer checkout ready; paid settlement externally gated | Production has a published public Products schema with 40 commerce fields and a published private Orders schema with 60 operational fields. The order API enforces exact checkout origins, required idempotency keys, deterministic duplicate replay, protected status lookup, and provider-safe return paths. Public catalog and checkout discovery return `200`; the empty catalog is ready for owner-authored products. Taking and settling real card payments still requires configured provider credentials and fresh Commerce certification evidence. |
| Dependency security | 0 high / 0 critical in production audit | Fresh production dependency gate passes after Next `16.3.8`, Sharp `0.35.5`, PostCSS `8.5.28`, and compatible vulnerable transitive-package updates. One low esbuild advisory remains. Public build and public/admin typechecks pass. The existing frontend bridge also passes its audit with zero findings. |
| Release audit | 41 Ready / 4 Partial | `/settings`, Settings admin APIs, `/products`, and `/orders` remain Partial only because fresh live Settings/Commerce provider artifacts are not present. Artifact-accepted mode is `45 Ready / 0 Partial`. |

### Remaining launch actions

- [ ] Sign in with one of the active owner accounts and author the first real pages, posts, media, newsletter form, products, and policies.
- [x] Configure exact `BACKY_CORS_ALLOWED_ORIGINS` entries for Backy admin, the deployed custom frontend, and the future apex/`www` website hosts; redeploy `backy-public` and rerun the 47-check production and 113-check custom-frontend gates.
- [x] Deploy the custom frontend catalog/order client and safe checkout bridge; initialize the public Products and private Orders schemas without creating fake products or orders.
- [x] Deploy the secure buyer checkout flow with success/cancel recovery, server-enforced idempotency, HttpOnly status state, raw-payment rejection, and live production route/security proof.
- [x] Connect production admin password recovery to Supabase Auth and route both exact reset callbacks and Supabase root fallbacks into Backy's protected reset screen.
- [ ] Attach `devanshvarshney.com` to the separate frontend Vercel project, update DNS, and verify the Backy domain mapping without interrupting the current Hostinger site.
- [ ] Select and configure the payment provider used for real checkout, then run Commerce provider certification and save the redacted artifact.
- [ ] Before unrelated customer sites share one `backy-public` instance, replace the global checkout-origin allowlist with site-scoped allowed origins. The current exact allowlist is sufficient for the single `devanshvarshney.com` launch but is not the final multi-tenant policy.
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

Latest production proof on 2026-07-10: both production deployments reached Vercel `Ready`; the storefront checkout, success, and cancel routes returned `200`; the bridge contract returned `200` with `Cache-Control: no-store`; URL-carried status tokens and raw card-shaped payloads returned `400`; production password recovery returned Supabase `queued` with status `200`; the protected login shell, 47-check production-readiness gate, and 113-check custom-frontend gate passed. No fake production product or order was created.

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
- The strict deployed custom frontend gate passes 113 checks for the real production site and separate Vercel frontend, including component properties, editable maps, responsive metadata, template reuse, blog inheritance, the secret-free connection probe, and the deployed buyer checkout routes.
- Help, Site Detail, Newsletter, manifest, OpenAPI, SDK, and starter source contracts are covered by the custom frontend control-plane gate and focused admin/public smokes.
- Public-repo hygiene and frontend forbidden-env checks keep database, Supabase service-role, admin, bootstrap, cron, SMTP, and payment secrets out of the custom frontend contract.
- Checkout security has behavioral coverage for return-path normalization, exact origin admission, raw-payment rejection, URL-token rejection, protected status lookup, and duplicate-order replay. The canonical starter, SDK, OpenAPI, manifest, and generated frontend source share the same contract.

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
- **Production dependency gate:** `npm run test:dependency-security`
- **Diff hygiene:** `git diff --check`

## Notes

- `AGENTS.md` is the standing Backy-specific source of truth for custom frontend agents, design preservation, canvas-first creation, and safety boundaries.
- Current audit baseline is 41 Ready / 4 Partial / 0 Prototype / 0 Missing. The four partials are external live Settings/Commerce provider certification artifacts.
- Recent subagent audits identified `DataGrid`, `/pages`, `/users`, `/settings`, `Canvas`, `CanvasEditor`, `PropertyPanel`, `LayersPanel`, and `PageRenderer` as the main release-hardening targets.
