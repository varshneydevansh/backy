# Fast-Track Execution Plan: 2–4 Day Delivery (Phases A–J in Sequence)

**Target duration:** 2–4 days (compressed execution)  
**Strategy:** Small, atomic commits for each task cluster to avoid drift and ease rollback.

## Principles for this track
- Deliver in narrow slices with working state after each commit.
- Keep DB/auth boundary and editor stabilization separate.
- Prefer contract-safe refactors only after compatibility adapters exist.
- Every commit should:
  - compile in touched scope (at least in practice by route-level smoke),
  - preserve backward compatibility for existing pages,
  - include rollback note.

## Day 0 (prep + safety setup) — ~2–3 hours

- Commit: `chore(specs): add implementation tracks`  
  - Files:
    - `specs/backy-full-parity-roadmap-spec.md`
    - `specs/implementation-plans/*`
    - `BACKY_HANDOFF.md`
    - `NEXT_CHAT_HANDOFF.md`

### Outcomes
- Single source-of-truth phase map.
- Explicit acceptance checkpoints per phase.
- No code behavior changes in this commit.

## Day 1: Phase A + editor stabilization foundation (critical path)

### Commit A1: Contract boundary scaffolding
- Files:
  - `packages/core/src/types/index.ts`
  - `apps/admin/src/lib/*` (adapter exports)
  - `apps/public/src/lib/backyStore.ts` (adapter shape)

### Commit A2: DB-backed read/write boundaries
- Files:
  - `packages/database/src/queries/*`
  - `packages/database/src/client.ts`
  - `apps/admin/src/routes/*` (site/page/blog/edit routes)
  - `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`

### Commit A3: Route auth/session + RBAC baseline
- Files:
  - `apps/admin/src/routes/__root.tsx`
  - `packages/auth/src/index.ts`
  - `apps/admin/src/stores/authStore.ts`

### Commit A4: Public resolve + unpublished guard
- Files:
  - `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`
  - `apps/public/src/app/api/sites/[siteId]/pages/route.ts`

## Day 2: Phase B + Phase C critical parity

### Commit B1: Selection/interaction + undo/redo command stack
- Files:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
  - `apps/admin/src/components/editor/RichTextBlock.tsx`

### Commit B2: Copy/duplicate/delete + history-safe state
- Files:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/types/editor.ts`

### Commit B3: Save/publish/reload stabilization
- Files:
  - `apps/admin/src/routes/pages.$pageId.edit.tsx`
  - `apps/admin/src/routes/sites.$siteId.tsx`

### Commit C1: Form validation hardening + parser compatibility
- Files:
  - `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
  - `apps/public/src/lib/backyStore.ts`
  - `apps/admin/src/components/editor/editorCatalog.ts`
  - `apps/admin/src/components/editor/PropertyPanel.tsx`

### Commit C2: Form moderation queue + status transitions
- Files:
  - `apps/admin/src/routes/sites.$siteId.tsx`
  - `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`

## Day 3: Comments, composition blocks, and public API hardening

### Commit D1: Comment default visibility + moderation queue actions
- Files:
  - `apps/public/src/app/api/sites/[siteId]/comments/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts`
  - `apps/admin/src/routes/sites.$siteId.tsx`

### Commit D2: Comment analytics + reporting pipeline
- Files:
  - `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`
  - `apps/public/src/lib/backyStore.ts`
  - `apps/admin/src/routes/sites.$siteId.tsx`

### Commit E1: Composition primitives (phase E bootstrap)
- Files:
  - `apps/admin/src/components/editor/editorCatalog.ts`
  - `apps/public/src/components/PageRenderer.tsx`
  - `apps/admin/src/components/editor/PropertyPanel.tsx`

### Commit F1: Public API envelope normalization
- Files:
  - `apps/public/src/app/api/sites/[siteId]/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/pages/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/media/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/comments/route.ts`

## Day 4: Versioning/operations + API-first platform finish

### Commit G1: Publication/version rollback baseline
- Files:
  - `apps/admin/src/routes/pages.$pageId.edit.tsx`
  - `apps/admin/src/routes/blog.$postId.tsx`
  - `apps/public/src/app/api/sites/[siteId]/pages/route.ts`

### Commit H1: Media + theme + SEO baseline pass
- Files:
  - `apps/public/src/app/api/sites/[siteId]/media/route.ts`
  - `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`
  - `apps/public/src/components/PageRenderer.tsx`
  - `apps/admin/src/routes/settings.tsx`

### Commit I1: Audit/events + exports
- Files:
  - `apps/public/src/lib/backyStore.ts`
  - `apps/admin/src/routes/sites.$siteId.tsx`

### Commit J1: Headless onboarding + plugin/doc completion
- Files:
  - `README.md`
  - `specs/backy-api-contracts.md`
  - any example folder you create for public integration demo

## Commit safety pattern

- Keep each commit to 1–2 logical files per route/group of tightly coupled files when possible.
- If a commit touches both admin and public contract surfaces, ensure payload compatibility is confirmed before moving on.
- If a regression appears:
  1) revert only last commit,
  2) preserve adapter layer,
  3) replay from previous commit.

## Acceptance by end of Day 4

- Save/edit/publish/reload works for pages with undo/redo, duplicate/delete stability.
- Form submissions validate and moderate with status transitions.
- Comments default to approved-only on public reads with queue controls.
- Public API delivers a predictable envelope and stable path behavior.
- Composition blocks render in admin + public through shared props.
- Custom frontend can be built against public APIs without admin internals.

## Stretch option (4th day + 1 afternoon)
- If blockers hit:
  - defer deeper media transforms, some SEO corners, and advanced block presets;
  - keep core parity on editor action, forms, comments, contracts, and API-first behavior as non-negotiables.
