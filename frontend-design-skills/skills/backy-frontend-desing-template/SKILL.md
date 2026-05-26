---
name: backy-frontend-desing-template
description: Backy frontend design template super-skill. Use for opinionated reusable visual templates for reports, quarterly reviews, editorial decks, research videos, and cinematic layouts. Routes across 9 Open Design template capabilities without installing them as 9 separate top-level skills.
---

# Backy Frontend Desing: Template

Use this when the user asks for opinionated reusable visual templates for reports, quarterly reviews, editorial decks, research videos, and cinematic layouts.

This is a compact router over 9 Open Design template capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `8-bit-orbit-video-template` -> `references/source/8-bit-orbit-video-template.md`
- `after-hours-editorial-template` -> `references/source/after-hours-editorial-template.md`
- `digits-fintech-swiss-template` -> `references/source/digits-fintech-swiss-template.md`
- `editorial-burgundy-principles-template` -> `references/source/editorial-burgundy-principles-template.md`
- `field-notes-editorial-template` -> `references/source/field-notes-editorial-template.md`
- `html-ppt-retro-quarterly-review` -> `references/source/html-ppt-retro-quarterly-review.md`
- `swiss-creative-mode-template` -> `references/source/swiss-creative-mode-template.md`
- `swiss-user-research-video-template` -> `references/source/swiss-user-research-video-template.md`
- `weread-year-in-review-video-template` -> `references/source/weread-year-in-review-video-template.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
