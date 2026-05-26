---
name: backy-frontend-desing-deck
description: Backy frontend design deck super-skill. Use for slide decks, web presentations, keynote-style pages, PPTX generation, and executive presentation workflows. Routes across 9 Open Design deck capabilities without installing them as 9 separate top-level skills.
---

# Backy Frontend Desing: Deck

Use this when the user asks for slide decks, web presentations, keynote-style pages, PPTX generation, and executive presentation workflows.

This is a compact router over 9 Open Design deck capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `deck-guizang-editorial` -> `references/source/deck-guizang-editorial.md`
- `deck-open-slide-canvas` -> `references/source/deck-open-slide-canvas.md`
- `deck-swiss-international` -> `references/source/deck-swiss-international.md`
- `frontend-slides` -> `references/source/frontend-slides.md`
- `nanobanana-ppt` -> `references/source/nanobanana-ppt.md`
- `ppt-keynote` -> `references/source/ppt-keynote.md`
- `pptx` -> `references/source/pptx.md`
- `pptx-generator` -> `references/source/pptx-generator.md`
- `slides` -> `references/source/slides.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
