---
name: backy-frontend-desing-video
description: Backy frontend design video super-skill. Use for motion frames, HyperFrames, Remotion/video editing, logo outros, data-chart clips, download/clip workflows, and text/video generation. Routes across 17 Open Design video capabilities without installing them as 17 separate top-level skills.
---

# Backy Frontend Desing: Video

Use this when the user asks for motion frames, HyperFrames, Remotion/video editing, logo outros, data-chart clips, download/clip workflows, and text/video generation.

This is a compact router over 17 Open Design video capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `fal-kling-o3` -> `references/source/fal-kling-o3.md`
- `fal-lip-sync` -> `references/source/fal-lip-sync.md`
- `fal-video-edit` -> `references/source/fal-video-edit.md`
- `frame-data-chart-nyt` -> `references/source/frame-data-chart-nyt.md`
- `frame-flowchart-sticky` -> `references/source/frame-flowchart-sticky.md`
- `frame-glitch-title` -> `references/source/frame-glitch-title.md`
- `frame-light-leak-cinema` -> `references/source/frame-light-leak-cinema.md`
- `frame-liquid-bg-hero` -> `references/source/frame-liquid-bg-hero.md`
- `frame-logo-outro` -> `references/source/frame-logo-outro.md`
- `frame-macos-notification` -> `references/source/frame-macos-notification.md`
- `remotion` -> `references/source/remotion.md`
- `sora` -> `references/source/sora.md`
- `venice-video` -> `references/source/venice-video.md`
- `vfx-text-cursor` -> `references/source/vfx-text-cursor.md`
- `video-downloader` -> `references/source/video-downloader.md`
- `video-hyperframes` -> `references/source/video-hyperframes.md`
- `youtube-clipper` -> `references/source/youtube-clipper.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
