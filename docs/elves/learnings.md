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

## Review Heuristics

- [2026-05-30] For shared `DataGrid` changes, avoid global overflow or containment changes unless every dense table consumer is verified. Prefer opt-in visible overflow or route-local restructuring.
- [2026-05-30] For editor changes, preserve public renderer parity and the custom frontend contract whenever canvas element props, navigation source/binding, or layer structure changes.
- [2026-05-31] Marquee selection must store the original client pointer and reproject it against the current canvas rect during moves. Storing only the pointer-down canvas coordinate lets the visual origin drift when zoom/scroll settling changes the canvas rect.
- [2026-05-31] Component-library drag previews should clear sticky preview state and stage the custom drag image as a rendered behind-page element before `setDragImage`; offscreen-only drag images can let Chrome fall back to rail screenshots.
- [2026-05-31] Dense route tables should be fixed with route-local width and wrapping contracts before changing shared `DataGrid`; Pages and Users need different operational copy budgets.
- [2026-05-31] Navigation layers need visible child-link metadata in the layer map. Showing only `nav` or a generated id makes users think menu items are not separately selectable even when child link layers exist.
- [2026-05-31] Editor preview mode must share the same canvas-scoped zoom interception as edit mode; otherwise Mac pinch/Cmd-scroll falls through to browser page zoom and makes preview feel detached from the canvas.

## Product and Domain Invariants

- [2026-05-30] Backy owns newsletter subscriber management and provider-safe handoff, but actual outbound email delivery/mailbox hosting remains provider-backed for now.
- [2026-05-31] Newsletter handoff should make provider-safe sync URLs visible beside capture URLs: `audience=sendable` and contact-sync route templates are operator-facing workflow surfaces, not just hidden payload fields.
- [2026-05-30] Every page/blog/product/form/custom frontend path must preserve design tokens, fonts, colors, media assets, animations, interactions, responsive overrides, editable maps, and API-visible properties.
- [2026-05-31] Production Vercel runbooks must keep `backy-admin` as a protected Vite shell with only public/admin API base URLs; server-only admin keys, database URLs, provider secrets, and cron secrets belong on `backy-public`, never in `VITE_*` env.
- [2026-05-31] Public custom-domain and locale-domain discovery must require `site.settings.domainVerification.status === "verified"` for the exact host. A saved domain string alone is configuration intent, not routing permission.
- [2026-05-31] Help content should mirror deploy behavior immediately after hardening changes; otherwise users and frontend agents keep following the old, looser mental model.

## Known Traps

- [2026-05-30] Previously blocked Stripe-looking secret sentinel commits are not valid names in the current local history, but push protection should still be treated as a release gate.
- [2026-05-31] Provider certification artifact admission should reject broad token-shaped leaks such as bearer tokens, GitHub tokens, Vercel tokens, and JWT-looking strings in addition to payment-provider keys and forbidden sensitive field names.
- [2026-05-30] `DataGrid` paint/layout containment can prevent page-level overflow while clipping inline `<details>` disclosures, focus rings, and dense row controls.

## Retired Learnings

- None yet.
