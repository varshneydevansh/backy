# Project Learnings

Durable reusable lessons for the Backy Elves run. Do not use this file for one-off debugging notes; put those in `docs/elves/execution-log.md`.

## Repo Conventions

- [2026-05-30] Backy admin UI should follow `DESIGN.md`: dense operational control-room UI, shared primitives first, no marketing-dashboard drift.
- [2026-05-30] Custom frontend agents must start from `AGENTS.md` read order: public agent handoff, manifest, OpenAPI, frontend design contract, templates, newsletter, and render verification.
- [2026-05-30] The four remaining audit partials are external live Settings/Commerce provider certification artifacts, not missing local editor/content-model work.
- [2026-05-31] Copyable handoff UI should show the canonical agent read path and property-map pointer visibly, not only inside JSON: `/agent-handoff`, manifest, OpenAPI, and `componentApiContract.componentTypeContracts` are the fastest way for frontend agents to align with Backy.

## Validation and Tooling

- [2026-05-30] Focused admin/editor gates are preferred before broad builds: admin typecheck, editor source/zoom smokes, pages/users/settings smokes, help/handoff smoke, release doctor, and `git diff --check`.
- [2026-05-30] `gh auth status` reports a stale invalid `GITHUB_TOKEN`, but a keyring login for `varshneydevansh` exists. Avoid relying on the bad environment token; use keychain auth or unset the token for GitHub CLI operations.
- [2026-05-31] Sites rendered smokes that exercise create plus duplicate must temporarily relax blocked workspace site quotas with a cushion, because the admin-visible sites list is role/team scoped while create/duplicate billing enforcement counts the whole workspace.

## Review Heuristics

- [2026-05-30] For shared `DataGrid` changes, avoid global overflow or containment changes unless every dense table consumer is verified. Prefer opt-in visible overflow or route-local restructuring.
- [2026-05-30] For editor changes, preserve public renderer parity and the custom frontend contract whenever canvas element props, navigation source/binding, or layer structure changes.
- [2026-05-31] Marquee selection must store the original client pointer and reproject it against the current canvas rect during moves. Storing only the pointer-down canvas coordinate lets the visual origin drift when zoom/scroll settling changes the canvas rect.
- [2026-05-31] Component-library drag previews should clear sticky preview state and stage the custom drag image as a rendered behind-page element before `setDragImage`; offscreen-only drag images can let Chrome fall back to rail screenshots.
- [2026-05-31] Component-library hover previews should be docked in the rail flow instead of absolutely overlaying the scroll list. Overlay previews need reserved padding hacks and can feel clipped/pushed into the canvas rail.
- [2026-05-31] Dense route tables should be fixed with route-local width and wrapping contracts before changing shared `DataGrid`; Pages and Users need different operational copy budgets.
- [2026-05-31] Navigation layers need visible child-link metadata in the layer map. Showing only `nav` or a generated id makes users think menu items are not separately selectable even when child link layers exist.
- [2026-05-31] Editor preview mode must share the same canvas-scoped zoom interception as edit mode; otherwise Mac pinch/Cmd-scroll falls through to browser page zoom and makes preview feel detached from the canvas.
- [2026-05-31] Root section flow must run for both direct canvas drags/resizes and Inspector/property-panel numeric edits. Users expect a typed section height change to push following sections the same way a drag resize does.
- [2026-05-31] Root section flow must handle multi-change resize frames by identifying one driver section and normalizing derived sibling shifts from the previous baseline. Otherwise a resize plus already-shifted following section can look like unrelated multi-edit state and skip reflow.
- [2026-05-31] Custom frontend Help must expose `agent-handoff.componentApiContract.componentTypeContracts` and `componentApiContract.propertyMap` as copyable first-class pointers. “Read agent-handoff” is not specific enough for frontend AI agents.
- [2026-05-31] The Blog editor should expose a provider-safe newsletter issue handoff directly on each report/post, not only inside the separate Newsletter workspace. The authoring workflow needs a visible path from report -> send-ready subscriber sync -> external mail provider boundary.
- [2026-05-31] Navigation layer rows must distinguish selectable child link layers from props-only `navItems`. A nav row that only says “links” without edit mode, href labels, and an expand/select hint makes users think menu items are unavailable or broken.
- [2026-05-31] The active-site switcher must look like a control, not passive workspace metadata. Keep a visible “Site” label and no-signout copy near the sidebar selector because users naturally look there before trying account/logout flows.
- [2026-05-31] Responsive editor controls need visible inheritance state. Tablet/mobile canvases should tell users whether they inherit desktop or have local override layers, and the same state should be exposed as smoke-testable metadata.
- [2026-05-31] The first Sites/New Site handoff users copy must be as complete as Site Detail and Help. Include `/agent-handoff`, host-aware resolve/render, `BACKY_SITE_PUBLIC_HOST`, and subdomain examples anywhere a frontend AI agent may start.
- [2026-05-31] Root section insertion must snap to the bottom of any containing root flow section before shifting later sections. A drop/add inside an existing band should create a new band after it, and rendered smokes should verify editor, persisted, and public-render geometry together.
- [2026-05-31] Header action menus near sticky workbars should be absolute overlays with explicit stacking checks. In-flow details menus can pass source review but still disappear behind sticky active-section banners in real Chrome viewports.
- [2026-05-31] Dense Pages-table fixes should prefer route-local column budgets before shared grid changes. Keep delivery/action cells clipped or in-flow, but reduce the total table width so the surface feels operational instead of horizontally hostile.
- [2026-05-31] Nested keyboard nudge tests must account for parent/canvas movement bounds. A child near the right edge may correctly move less than the nudge step on X while still moving a full step on Y, and authored geometry data attrs are more reliable than computed CSS for this assertion.
- [2026-05-31] Avoid unbounded `requestAnimationFrame` waits inside long CDP `Runtime.evaluate` smoke steps. In backgrounded or heavily exercised Chrome tabs, rAF can stall; use bounded timer settles and include the current smoke step in timeout errors.

## Product and Domain Invariants

- [2026-05-30] Backy owns newsletter subscriber management and provider-safe handoff, but actual outbound email delivery/mailbox hosting remains provider-backed for now.
- [2026-05-31] Newsletter handoff should make provider-safe sync URLs visible beside capture URLs: `audience=sendable` and contact-sync route templates are operator-facing workflow surfaces, not just hidden payload fields.
- [2026-05-31] Newsletter authoring needs an executable provider-safe draft step between “blog post exists” and “external provider sends.” The draft can include post URLs, content summary, recipient ids, and counts, but must not include raw subscriber emails or provider secrets.
- [2026-05-30] Every page/blog/product/form/custom frontend path must preserve design tokens, fonts, colors, media assets, animations, interactions, responsive overrides, editable maps, and API-visible properties.
- [2026-05-31] Production Vercel runbooks must keep `backy-admin` as a protected Vite shell with only public/admin API base URLs; server-only admin keys, database URLs, provider secrets, and cron secrets belong on `backy-public`, never in `VITE_*` env.
- [2026-05-31] Help should expose the same protected deployment topology as the README: protected `backy-admin`, public `backy-public`, and separate custom frontend projects with only `BACKY_PUBLIC_API_BASE_URL`, `BACKY_SITE_ID`, and optional `BACKY_SITE_PUBLIC_HOST` in frontend env.
- [2026-05-31] Public custom-domain and locale-domain discovery must require `site.settings.domainVerification.status === "verified"` for the exact host. A saved domain string alone is configuration intent, not routing permission.
- [2026-05-31] Help content should mirror deploy behavior immediately after hardening changes; otherwise users and frontend agents keep following the old, looser mental model.

## Known Traps

- [2026-05-30] Previously blocked Stripe-looking secret sentinel commits are not valid names in the current local history, but push protection should still be treated as a release gate.
- [2026-05-31] Provider certification artifact admission should reject broad token-shaped leaks such as bearer tokens, GitHub tokens, Vercel tokens, and JWT-looking strings in addition to payment-provider keys and forbidden sensitive field names.
- [2026-05-30] `DataGrid` paint/layout containment can prevent page-level overflow while clipping inline `<details>` disclosures, focus rings, and dense row controls.

## Retired Learnings

- None yet.
