---
name: backy-frontend-desing-image
description: Backy frontend design image super-skill. Use for static visual asset generation, screenshots, posters, image editing, mockups, restoration, and vision workflows. Routes across 24 Open Design image capabilities without installing them as 24 separate top-level skills.
---

# Backy Frontend Desing: Image

Use this when the user asks for static visual asset generation, screenshots, posters, image editing, mockups, restoration, and vision workflows.

This is a compact router over 24 Open Design image capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `algorithmic-art` -> `references/source/algorithmic-art.md`
- `canvas-design` -> `references/source/canvas-design.md`
- `fal-3d` -> `references/source/fal-3d.md`
- `fal-generate` -> `references/source/fal-generate.md`
- `fal-image-edit` -> `references/source/fal-image-edit.md`
- `fal-realtime` -> `references/source/fal-realtime.md`
- `fal-restore` -> `references/source/fal-restore.md`
- `fal-train` -> `references/source/fal-train.md`
- `fal-tryon` -> `references/source/fal-tryon.md`
- `fal-upscale` -> `references/source/fal-upscale.md`
- `fal-vision` -> `references/source/fal-vision.md`
- `full-page-screenshot` -> `references/source/full-page-screenshot.md`
- `gif-sticker-maker` -> `references/source/gif-sticker-maker.md`
- `hatch-pet` -> `references/source/hatch-pet.md`
- `image-enhancer` -> `references/source/image-enhancer.md`
- `imagegen` -> `references/source/imagegen.md`
- `imagen` -> `references/source/imagen.md`
- `pixelbin-media` -> `references/source/pixelbin-media.md`
- `replicate` -> `references/source/replicate.md`
- `screenshot` -> `references/source/screenshot.md`
- `screenshots-marketing` -> `references/source/screenshots-marketing.md`
- `slack-gif-creator` -> `references/source/slack-gif-creator.md`
- `venice-image-edit` -> `references/source/venice-image-edit.md`
- `venice-image-generate` -> `references/source/venice-image-generate.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
