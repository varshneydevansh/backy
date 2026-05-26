---
name: backy-frontend-desing-design-system
description: Backy frontend design design-system super-skill. Use for UI/UX taste, visual systems, critique, platform rules, Figma handoff, copy, conversion, and product design direction. Routes across 36 Open Design design-system capabilities without installing them as 36 separate top-level skills.
---

# Backy Frontend Desing: Design System

Use this when the user asks for UI/UX taste, visual systems, critique, platform rules, Figma handoff, copy, conversion, and product design direction.

This is a compact router over 36 Open Design design-system capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `ad-creative` -> `references/source/ad-creative.md`
- `apple-hig` -> `references/source/apple-hig.md`
- `brainstorming` -> `references/source/brainstorming.md`
- `brand-guidelines` -> `references/source/brand-guidelines.md`
- `color-expert` -> `references/source/color-expert.md`
- `competitive-ads-extractor` -> `references/source/competitive-ads-extractor.md`
- `copywriting` -> `references/source/copywriting.md`
- `creative-director` -> `references/source/creative-director.md`
- `design-brief` -> `references/source/design-brief.md`
- `design-consultation` -> `references/source/design-consultation.md`
- `design-md` -> `references/source/design-md.md`
- `design-review` -> `references/source/design-review.md`
- `domain-name-brainstormer` -> `references/source/domain-name-brainstormer.md`
- `enhance-prompt` -> `references/source/enhance-prompt.md`
- `figma-code-connect-components` -> `references/source/figma-code-connect-components.md`
- `figma-create-design-system-rules` -> `references/source/figma-create-design-system-rules.md`
- `figma-create-new-file` -> `references/source/figma-create-new-file.md`
- `figma-generate-design` -> `references/source/figma-generate-design.md`
- `figma-generate-library` -> `references/source/figma-generate-library.md`
- `figma-implement-design` -> `references/source/figma-implement-design.md`
- `figma-use` -> `references/source/figma-use.md`
- `frontend-design` -> `references/source/frontend-design.md`
- `frontend-skill` -> `references/source/frontend-skill.md`
- `marketing-psychology` -> `references/source/marketing-psychology.md`
- `paywall-upgrade-cro` -> `references/source/paywall-upgrade-cro.md`
- `plan-design-review` -> `references/source/plan-design-review.md`
- `platform-design` -> `references/source/platform-design.md`
- `shadcn-ui` -> `references/source/shadcn-ui.md`
- `stitch-loop` -> `references/source/stitch-loop.md`
- `swiftui-design` -> `references/source/swiftui-design.md`
- `taste-skill` -> `references/source/taste-skill.md`
- `theme-factory` -> `references/source/theme-factory.md`
- `ui-skills` -> `references/source/ui-skills.md`
- `ui-ux-pro-max` -> `references/source/ui-ux-pro-max.md`
- `web-design-guidelines` -> `references/source/web-design-guidelines.md`
- `wpds` -> `references/source/wpds.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
