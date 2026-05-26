# Backy Frontend Design Skills

Portable design-agent skills for Backy, a Wix-like website builder and editor with custom frontend integration.

These skills compress the Open Design catalog into a small Backy-specific skill set instead of exposing 132 separate skills. Each grouped skill keeps its source catalog entries under `references/source/`, so agents can load only the relevant design logic for the task.

## Skills

| Skill | Source skills | Use for |
| --- | ---: | --- |
| `backy-frontend-desing-director` | 132 | Route broad UI/UX work to the right grouped skill. |
| `backy-frontend-desing-design-system` | 36 | Taste, UI systems, critique, platform rules, Figma handoff, copy, and conversion. |
| `backy-frontend-desing-prototype` | 32 | Landing pages, dashboards, documents, HTML prototypes, social cards, and app screens. |
| `backy-frontend-desing-image` | 24 | Posters, screenshots, image generation/editing, mockups, restoration, and vision workflows. |
| `backy-frontend-desing-video` | 17 | Motion frames, HyperFrames, Remotion/video editing, logo outros, and clips. |
| `backy-frontend-desing-deck` | 9 | Web decks, keynote-style slides, PPTX, and executive presentations. |
| `backy-frontend-desing-template` | 9 | Opinionated reusable visual templates for reports, decks, videos, and cinematic layouts. |
| `backy-frontend-desing-audio` | 4 | Speech, music, voiceover, jingles, and brand sound workflows. |
| `backy-frontend-desing-utility` | 1 | Specialized deck export fidelity validation. |

The `desing` spelling is intentional for compatibility with the originally requested Backy skill namespace.

## Install

Copy the folders in `skills/` into the target agent's skills directory, then restart that agent.

For Codex:

```bash
cp -R frontend-design-skills/skills/backy-frontend-desing-* ~/.codex/skills/
```

For Antigravity/Gemini-style skill paths:

```bash
cp -R frontend-design-skills/skills/backy-frontend-desing-* ~/.gemini/config/skills/
cp -R frontend-design-skills/skills/backy-frontend-desing-* ~/.gemini/antigravity-ide/skills/
```

## Usage

Start with `backy-frontend-desing-director` for broad work. For focused Backy product work, common pairings are:

- `backy-frontend-desing-design-system` plus `backy-frontend-desing-prototype` for editor/admin/public UI.
- `backy-frontend-desing-design-system` plus `backy-frontend-desing-image` for visual asset systems and preview cards.
- `backy-frontend-desing-deck` or `backy-frontend-desing-template` for launch decks, reports, and sales/marketing artifacts.

These skills should improve Backy surfaces without replacing the product model: keep Backy's editor architecture, content contracts, custom frontend integration, and API-first website-builder goals intact.

## Source

The grouped source entries were generated from the Open Design skills catalog:

- Catalog: https://open-design.ai/skills/
- Source repo: https://github.com/nexu-io/open-design/tree/main/skills

