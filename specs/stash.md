# Stash Cutline Spec: Chronological Phase A/B/C Completion Record + Phase-B Fix Queue

**Generated**: 2026-02-28  
**Goal**: freeze current changes, document all A/B/C work done so far in order, then continue with one phase at a time through commits.

## 1) Scope & ordering model

### 1.1 Phase naming systems

- Numeric roadmap: `specs/backy-wix-canva-cms-v1-roadmap.md`
- Alpha roadmap: `specs/phase-docs/backy-phase-a-j-completion-spec.md`
- Numeric and alpha are independent labels with approximate mapping:
  - `0/1` → `A`
  - `2` → `B`
  - `3` → `C` (plus parts of `D/F` depending on slice)

### 1.2 Current sequencing decision

- For this checkpoint we complete **Phase B follow-up first**.
- A and C are known to be mostly landed but still have deferred follow-up items.
- We are not moving to broad A/C additions until this Phase B fix queue passes the acceptance matrix.

## 2) Chronological change log (A/B/C)

### 2026-02-24 (foundational phase framing)
- Baseline WYSIWYG/admin/public parity direction defined.
- Early handoff docs indicate primary gap ownership:
  - comment moderation and API parity,
  - editor interaction and action wiring,
  - persistence/auth hardening.
- Main baseline: `specs/backy-cms-completion-spec.md`, `specs/backy-wix-canva-cms-v1-roadmap.md`.

### 2026-02-26 (contract + moderation + phase planning)
- Contract and implementation plans expanded:
  - `specs/implementation-plans/phase-b-editor-action-wiring-plan.md`
  - `specs/implementation-plans/phase-c-form-engine-plan.md`
  - `specs/implementation-plans/phase-d-comment-moderation-plan.md`
  - `specs/phase-c-completion-plan.md`
- Initial hardening actions in:
  - `packages/core/src/types/index.ts`
  - public comment/form route paths.

### 2026-02-27 (major A/B/C checkpoint created)
- Broad pass landed that stabilized core admin routing, permissions, and comment moderation flows.
- New docs and progress tracking added:
  - `specs/backy-full-parity-roadmap-spec.md`
  - `specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md`
  - `specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md`
  - `specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md`
  - `specs/phase-docs/backy-phase-a-j-completion-spec.md`
- Handoff continuity updated in `BACKY_HANDOFF.md` and `NEXT_CHAT_HANDOFF.md`.

### 2026-02-28 (current checkpoint before next run)
- Editor behavior became regression-sensitive around text interaction and history.
- Text single/double-tap behavior and toolbar state synchronization remain the highest remaining risk for editor parity.
- Snapshot of tracked diff captured to `stash-diff-code.txt` for this checkpoint.

## 3) Current A/B/C evidence map (files touched so far)

### Phase A evidence
- `apps/admin/src/stores/authStore.ts`
- `apps/admin/src/routes/__root.tsx`
- `apps/admin/src/routes/sites.tsx`
- `apps/admin/src/routes/pages.tsx`
- `apps/admin/src/routes/blog.tsx`
- `apps/admin/src/routes/media.tsx`
- `apps/admin/src/routes/users.tsx`
- `apps/admin/src/routes/sites.$siteId.tsx`
- `apps/admin/src/routes/pages.new.tsx`
- `apps/admin/src/routes/sites.new.tsx`
- `apps/admin/src/routes/login.tsx`
- `apps/admin/src/routes/settings.tsx`
- `apps/admin/src/stores/mockStore.ts`
- `apps/admin/src/types/editor.ts`
- `apps/public/src/lib/backyAuthBridge.ts` (untracked, present as part of public auth bridge work)
- `apps/public/src/hooks/useBackyAuthBridge.ts` (untracked)

### Phase B evidence
- `apps/admin/src/components/editor/Canvas.tsx`
- `apps/admin/src/components/editor/CanvasEditor.tsx`
- `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- `apps/admin/src/components/editor/ComponentLibrary.tsx`
- `apps/admin/src/components/editor/PropertyPanel.tsx`
- `apps/admin/src/components/editor/RichTextFormatting.tsx`
- `apps/admin/src/components/editor/blocks/RichTextBlock.tsx`
- `apps/admin/src/components/editor/editorCatalog.ts`
- `apps/admin/src/components/layout/Header.tsx`
- `apps/admin/src/components/layout/Sidebar.tsx`
- `apps/admin/src/routes/pages.$pageId.edit.tsx`
- `apps/admin/src/routes/blog.$postId.tsx`
- `apps/admin/src/routes/blog.new.tsx`
- `apps/admin/src/routes/blog.tsx`
- `apps/admin/src/routes/users.$userId.tsx`
- `apps/admin/src/routes/users.new.tsx`
- `apps/admin/src/routes/users.tsx`

### Phase C evidence
- `apps/public/src/lib/backyStore.ts`
- `apps/public/src/app/api/sites/[siteId]/comments/route.ts`
- `apps/public/src/app/api/sites/[siteId]/comments/[commentId]/route.ts`
- `apps/public/src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts`
- `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts` (untracked)
- `apps/public/src/app/api/sites/[siteId]/comments/export/route.ts` (untracked)
- `apps/public/src/app/api/sites/[siteId]/comments/blocks/route.ts` (untracked)
- `apps/public/src/app/api/sites/[siteId]/comments/policy/route.ts` (untracked)
- `apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts`
- `apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts`
- `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- `apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts`
- `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts`
- `apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts`
- `apps/public/src/app/api/sites/[siteId]/events/route.ts`
- `apps/admin/src/routes/sites.$siteId.tsx`
- `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`
- `apps/public/src/components/PageRenderer.tsx`

### Cross-phase evidence (shared boundary)
- `specs/backy-cms-completion-spec.md`
- `specs/backy-wix-canva-cms-v1-roadmap.md`
- `specs/backy-full-parity-roadmap-spec.md`
- `specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md`
- `specs/phase-docs/backy-phase-a-j-completion-spec.md`
- `specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md`
- `specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md`
- `specs/implementation-plans/phase-a-contract-persistence-auth-plan.md`
- `specs/implementation-plans/phase-b-editor-action-wiring-plan.md`
- `specs/implementation-plans/phase-c-form-engine-plan.md`
- `specs/implementation-plans/phase-d-comment-moderation-plan.md`
- `specs/implementation-plans/phase-e-core-cms-composition-plan.md`
- `specs/implementation-plans/phase-f-public-api-first-plan.md`
- `specs/implementation-plans/phase-g-versioning-deploy-plan.md`
- `specs/implementation-plans/phase-h-media-seo-localization-plan.md`
- `specs/implementation-plans/phase-i-analytics-audit-governance-plan.md`
- `specs/implementation-plans/phase-j-extensibility-platform-plan.md`
- `specs/implementation-plans/four-day-fast-track-execution-plan.md`

## 4) Acceptance status at checkpoint

- Phase A: **partial**
  - Role/session/action guards are in place in admin surfaces.
  - Persistence adapters and middleware RBAC are not fully finished.

- Phase B: **partial/incomplete**
  - Core action wiring, save/reload, duplicate behavior are in place.
  - Text single-tap/double-tap parity and full undo/redo stack behavior still unresolved.

- Phase C: **complete-for-use + hardening follow-up**
  - Moderation, export/report, anti-abuse and queue endpoints are present.
  - Scale/retention/operator-ergonomics follow-up remains open.

## 5) Why Phase B is first in this pass

Current highest-impact risks are:

1. Text single-click vs double-click behavior not deterministic.
2. Toolbar toggles do not always reflect active state.
3. Undo/redo appears tied to selection churn.
4. Autosave and in-flight updates can reset selection/history.

Target parity model:
- single tap = select + style target.
- double tap = inline edit entry.
- undo/redo = deterministic for real mutations across text + layout + add/remove actions.

## 6) Planned work order (single-phase pass)

### Phase B Pass 1: text interaction contract
- Scope:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/blocks/RichTextBlock.tsx`
- Goal: deterministic single-click vs double-click behavior, no selection churn on property updates.

### Phase B Pass 2: toolbar state consistency
- Scope:
  - `apps/admin/src/components/editor/PropertyPanel.tsx`
  - `apps/admin/src/components/editor/RichTextFormatting.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- Goal: bold/italic/underline/list/align states always mirror active target and can un-toggle reliably.

### Phase B Pass 3: history + autosave decoupling
- Scope:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/types/editor.ts`
  - `apps/admin/src/routes/pages.$pageId.edit.tsx` (if needed)
- Goal: undo/redo tracks mutation-only changes; autosave does not clear stack.

### Phase B Pass 4: regression lock
- Scope: all editor paths from selection -> property -> undo/redo -> reload.
- Goal: no runtime fatal (`Cannot access ... before initialization`, maximum update depth) and no lost selection.

## 7) Stash file handling

- Kept out of stash:
  - `specs/stash.md`
  - `stash-diff-code.txt`
  - `specs/implementation-plans/phase-b-text-interaction-and-undo-redo-plan.md`
  - `BACKY_HANDOFF.md`
  - `NEXT_CHAT_HANDOFF.md`
  - `specs/**`
- Stash target:
  - all other changed files.

Suggested command:

```bash
git add specs/stash.md stash-diff-code.txt specs/implementation-plans/phase-b-text-interaction-and-undo-redo-plan.md specs/phase-docs/backy-phase-a-j-completion-spec.md specs/backy-cms-completion-spec.md specs/backy-wix-canva-cms-v1-roadmap.md BACKY_HANDOFF.md NEXT_CHAT_HANDOFF.md
git stash push -u -- . ':!specs/' ':!BACKY_HANDOFF.md' ':!NEXT_CHAT_HANDOFF.md' ':!stash-diff-code.txt' ':!specs/stash.md'
```

## 8) Post-stash continuation

- Do not start A/C work expansion until this Phase B pass passes matrix.
- Update this file before declaring any phase move.
