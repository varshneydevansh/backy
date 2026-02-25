# Backy Continuation Handoff  
**Date:** 2026-02-24  
**Path:** `/Users/devanshvarshney/Downloads/Scythian /backy`  

## 1) Current objective
Continue implementation toward **Wix/WordPress/Canva-like CMS parity**, with strict priority on:
1. Form submission flow
2. Contact/share flow
3. Comment moderation flow

Everything else is secondary until this is stable.

## 2) Reference docs (read first every session)
- `specs/backy-cms-completion-spec.md`
- `specs/backy-wix-canva-cms-v1-roadmap.md`

## 3) Current known breakages to stabilize first
- Text elements and nested element selection became unreliable after recent editor changes.
- Right property panel showed duplicated/conflicting formatting UX.
- Some interactions lost (drag/editing behavior in canvas).
- User reported inability to edit text, open color picker, use emoji/formatting UX consistently.
- Existing reported parser warning:
  - `apps/admin/src/components/editor/Canvas.tsx` Unicode-escape parse issue around `placeholder` strings.

If these are not fully resolved, **stop all feature additions** and fix editor interaction first.

## 4) Scope for future sessions
### Phase A (required block before anything else)
- Restore stable text editing in canvas:
  - click-to-select should reliably target clicked element
  - rich text should support inline edits
  - styling/format controls should be usable and not duplicated
  - drag/move/resize should still work after text edits
- Keep responsive preview sanity in desktop/tablet/mobile.

### Phase B (current roadmap)
- Form block + submission: connect backend + validation + spam/duplicates + submit behaviors + admin submission view
- Comment block + moderation: moderation state transitions, block/report actions, search/filter/export
- Contact-share hooks: requestId correlation + telemetry + webhook/email pipeline

### Phase C (next backlog)
- Consolidate repeated editor logic and avoid duplicate state paths.
- Improve UX quality of right panel and block palettes.
- Keep continuing with the parity roadmap.

## 5) Critical developer constraints (do not violate)
- Use `apply_patch` for edits (no broad, destructive shell edits for this workflow).
- Do **not** revert unrelated changes.
- Do **not** perform large exploratory code reads.
- Keep fixes minimal and non-repetitive.
- Do not use tutorials as implementation content; apply product logic only.
- Avoid running tests/builds unless explicitly requested.
- One file read/edit pass policy applies: keep each file pass minimal and targeted.

## 6) Active working files likely to be touched next
- `apps/admin/src/components/editor/Canvas.tsx`
- `apps/admin/src/components/editor/PropertyPanel.tsx`
- `apps/admin/src/components/editor/blocks/RichTextBlock.tsx`
- `apps/admin/src/components/editor/CanvasEditor.tsx`
- `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- `apps/public/src/lib/...` form/comment/contact related services

## 7) Minimum acceptance before moving to next work
- I can click and edit text without corruption.
- Inline formatting controls apply predictably to selected text.
- Right panel no longer shows repeated or conflicting formatting controls.
- Drag/resize remains functional for text containers and nested elements.
- Form and comment backend flows function end-to-end with admin/admin-review actions.

## 8) Commit rule
This is a continuity repo. Each meaningful fix should be committed with a message in this pattern:
- `fix(editor): ...`
- `feat(forms-comments): ...`

Use this handoff file as the canonical context when deciding whether a change is in scope.
