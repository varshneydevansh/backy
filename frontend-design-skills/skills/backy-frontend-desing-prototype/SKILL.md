---
name: backy-frontend-desing-prototype
description: Backy frontend design prototype super-skill. Use for single-screen HTML prototypes, landing pages, dashboards, documents, motion UI, social cards, and interactive demos. Routes across 32 Open Design prototype capabilities without installing them as 32 separate top-level skills.
---

# Backy Frontend Desing: Prototype

Use this when the user asks for single-screen HTML prototypes, landing pages, dashboards, documents, motion UI, social cards, and interactive demos.

This is a compact router over 32 Open Design prototype capabilities. Keep the top-level context small: start with the catalog, then load only the exact source reference files needed for the request.

## Workflow

1. Read `references/catalog.md` to pick one primary capability and, if useful, one support capability.
2. Read only the matching file(s) from `references/source/`. Do not bulk-load every source file.
3. Apply the source skill's constraints, but keep the repo's existing architecture and design system unless the user explicitly asks for a new direction.
4. For UI work, verify real rendered output when a local app or HTML artifact exists. Use screenshots or browser checks for responsive and visual claims.
5. If the requested work crosses modes, combine this with the relevant sibling skill, for example `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype`.

## Capability Map

- `agent-browser` -> `references/source/agent-browser.md`
- `article-magazine` -> `references/source/article-magazine.md`
- `artifacts-builder` -> `references/source/artifacts-builder.md`
- `card-twitter` -> `references/source/card-twitter.md`
- `card-xiaohongshu` -> `references/source/card-xiaohongshu.md`
- `d3-visualization` -> `references/source/d3-visualization.md`
- `data-report` -> `references/source/data-report.md`
- `doc` -> `references/source/doc.md`
- `doc-kami-parchment` -> `references/source/doc-kami-parchment.md`
- `docx` -> `references/source/docx.md`
- `faq-page` -> `references/source/faq-page.md`
- `flutter-animating-apps` -> `references/source/flutter-animating-apps.md`
- `frontend-dev` -> `references/source/frontend-dev.md`
- `gsap-core` -> `references/source/gsap-core.md`
- `gsap-react` -> `references/source/gsap-react.md`
- `gsap-scrolltrigger` -> `references/source/gsap-scrolltrigger.md`
- `gsap-timeline` -> `references/source/gsap-timeline.md`
- `hand-drawn-diagrams` -> `references/source/hand-drawn-diagrams.md`
- `login-flow` -> `references/source/login-flow.md`
- `minimax-docx` -> `references/source/minimax-docx.md`
- `minimax-pdf` -> `references/source/minimax-pdf.md`
- `mockup-device-3d` -> `references/source/mockup-device-3d.md`
- `pdf` -> `references/source/pdf.md`
- `poster-hero` -> `references/source/poster-hero.md`
- `release-notes-one-pager` -> `references/source/release-notes-one-pager.md`
- `resume-modern` -> `references/source/resume-modern.md`
- `shader-dev` -> `references/source/shader-dev.md`
- `social-reddit-card` -> `references/source/social-reddit-card.md`
- `social-spotify-card` -> `references/source/social-spotify-card.md`
- `social-x-post-card` -> `references/source/social-x-post-card.md`
- `threejs` -> `references/source/threejs.md`
- `web-artifacts-builder` -> `references/source/web-artifacts-builder.md`

## Backy Defaults

- Prefer distinctive, production-grade UI over generic AI template structure.
- Use real content and data from the user or project. Do not invent metrics, logos, testimonials, or product claims.
- Keep typography, spacing, interaction states, and responsive behavior as first-class acceptance criteria.
- When source skills conflict, choose the stricter visual QA rule and the simpler implementation.
- For existing products, improve the current surface instead of replacing product structure wholesale.
