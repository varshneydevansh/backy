# Project Learnings

Durable reusable lessons for the Backy Elves run. Do not use this file for one-off debugging notes; put those in `docs/elves/execution-log.md`.

## Repo Conventions

- [2026-05-30] Backy admin UI should follow `DESIGN.md`: dense operational control-room UI, shared primitives first, no marketing-dashboard drift.
- [2026-05-30] Custom frontend agents must start from `AGENTS.md` read order: public agent handoff, manifest, OpenAPI, frontend design contract, templates, newsletter, and render verification.
- [2026-05-30] The four remaining audit partials are external live Settings/Commerce provider certification artifacts, not missing local editor/content-model work.

## Validation and Tooling

- [2026-05-30] Focused admin/editor gates are preferred before broad builds: admin typecheck, editor source/zoom smokes, pages/users/settings smokes, help/handoff smoke, release doctor, and `git diff --check`.
- [2026-05-30] `gh auth status` reports a stale invalid `GITHUB_TOKEN`, but a keyring login for `varshneydevansh` exists. Avoid relying on the bad environment token; use keychain auth or unset the token for GitHub CLI operations.

## Review Heuristics

- [2026-05-30] For shared `DataGrid` changes, avoid global overflow or containment changes unless every dense table consumer is verified. Prefer opt-in visible overflow or route-local restructuring.
- [2026-05-30] For editor changes, preserve public renderer parity and the custom frontend contract whenever canvas element props, navigation source/binding, or layer structure changes.
- [2026-05-31] Marquee selection must store the original client pointer and reproject it against the current canvas rect during moves. Storing only the pointer-down canvas coordinate lets the visual origin drift when zoom/scroll settling changes the canvas rect.
- [2026-05-31] Component-library drag previews should clear sticky preview state and stage the custom drag image as a rendered behind-page element before `setDragImage`; offscreen-only drag images can let Chrome fall back to rail screenshots.

## Product and Domain Invariants

- [2026-05-30] Backy owns newsletter subscriber management and provider-safe handoff, but actual outbound email delivery/mailbox hosting remains provider-backed for now.
- [2026-05-30] Every page/blog/product/form/custom frontend path must preserve design tokens, fonts, colors, media assets, animations, interactions, responsive overrides, editable maps, and API-visible properties.

## Known Traps

- [2026-05-30] Previously blocked Stripe-looking secret sentinel commits are not valid names in the current local history, but push protection should still be treated as a release gate.
- [2026-05-30] `DataGrid` paint/layout containment can prevent page-level overflow while clipping inline `<details>` disclosures, focus rings, and dense row controls.

## Retired Learnings

- None yet.
