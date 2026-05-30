# READ THIS FILE FIRST AFTER ANY COMPACTION OR RESTART

This is the Elves survival guide for the Backy release parity run. Trust this file over chat memory after compaction. Read order: this file -> `.elves-session.json` -> `docs/elves/learnings.md` -> `docs/elves/backy-release-plan.md` -> `docs/elves/execution-log.md` -> `AGENTS.md` -> `DESIGN.md`.

## Mission

Continue completing Backy as a secure Wix/Webflow-like backend with WordPress-like ease and a Canva-like visual editor. The remaining audit partials are external live Settings/Commerce provider certification artifacts; local product work should now harden admin UX, canvas/editor fidelity, custom frontend handoff, newsletter/subscriber management, and release verification.

## Run Control

- **Run mode:** open-ended
- **Stop policy:** explicit-user-stop or genuine blocker only
- **User intent:** "please keep pursue it and complete the work" plus repeated instructions to keep going, use subagents/skills, commit logical slices, and prepare for release in about 3 days.
- **Checkpoint due by:** none
- **Checkpoint semantics:** delivery target only
- **May continue after checkpoint:** yes
- **Actual stop conditions:** stop only if the user explicitly stops/pauses, or a true blocker leaves no viable workaround.
- **Final-response policy:** disallowed while planned batches remain unless the user asks for status or handoff.
- **Batch completion rule:** Every completed batch ends with execution log update, survival guide update, commit, and push attempt when safe.
- **Re-read rule:** After every commit/push, re-read this file before choosing the next task.
- **Continuation rule:** If work remains and stop conditions are not met, continue without waiting for user acknowledgment.

## Session Budget

- **Started:** 2026-05-30 23:52 IST
- **User returns:** open-ended
- **Checkpoint expectation:** steadily close release UX/editor gaps, keep commits logical, and keep the release doctor green.
- **Time budget:** unlimited until user stop
- **Average batch time so far:** not enough data
- **Batches remaining:** 2 of 5

## Stop Gate

- **Planned batches remaining:** 2
- **Stop allowed right now:** no
- **Why:** The user asked to keep pursuing Backy completion and release certification/Vercel readiness remains.
- **Next required action:** Start Batch 4: Release Certification And Vercel Readiness.

## Effort Standard

- Work hard through implementation, validation, review, and documentation.
- Do not stop at a shallow pass when visible UI/editor defects remain.
- Prefer root-cause fixes, existing Backy primitives, and focused verified commits.
- When a batch completes, move to the next highest-value release gap.

## Forbidden Stop Reasons

- A commit succeeded.
- Tests are green for one slice.
- The four provider partials are external.
- A subagent result arrived.
- The user is silent.
- A summary would be useful.

## Memory Surfaces

- **Plan:** `docs/elves/backy-release-plan.md`
- **Survival guide:** `docs/elves/survival-guide.md`
- **Learnings:** `docs/elves/learnings.md`
- **Execution log:** `docs/elves/execution-log.md`
- **Repo standing rules:** `AGENTS.md`, `DESIGN.md`

## Non-Negotiables

- Never fake live provider certification evidence for the four remaining partials.
- Never expose provider secrets in public manifest/OpenAPI/handoff payloads.
- Preserve canvas/content design metadata and custom frontend editable maps.
- Do not revert unrelated user or prior-agent changes.
- Do not use destructive git commands.
- Do not weaken tests to pass.
- Never merge; the user controls release and merge.

## Launch Readiness

- [x] Plan cleaned and saved to disk
- [x] Survival guide updated from the current plan
- [x] Learnings file initialized
- [x] Execution log initialized with batch breakdown and preflight notes
- [x] Branch confirmed: `main` is currently the local release integration branch
- [ ] PR opened or existing PR recorded
- [x] Preflight run and critical failures checked
- [x] Run mode, return time, and non-negotiables recorded
- [x] Stop Gate initialized with `Stop allowed right now: no`
- [x] Launch prompt prepared in execution log

PR is not opened yet because this workspace is already carrying local release commits on `main`, while origin `main` is behind. Use a branch/PR once push strategy is confirmed or when converting the release stack into a PR is safer than direct main push.

## Current Phase

**Status:** In progress

**Active batch:** Batch 4: Release Certification And Vercel Readiness

**What was just finished:** Batch 3 completed: Help/Site/Newsletter/Editor handoff surfaces now make the canonical `/agent-handoff`, manifest, OpenAPI, component property contract, newsletter subscriber management, and provider-safe sync routes more directly copyable and site-scoped.

**Single next action:** Start release certification readiness by running the default release doctor, inspecting provider artifact admission docs/scripts, and checking secret/push-protection posture before any Vercel topology edits.

## Active Compute

No active paid or long-running compute recorded by this guide. Local dev servers may exist in the user's browser/session; inspect terminal/processes before starting duplicates.

## Next Exact Batch

**Batch:** 4: Release Certification And Vercel Readiness

**Scope:**
- Keep `npm run doctor:release-certification` green in default no-artifact mode.
- Keep provider artifact admission commands documented and machine-readable for Settings and Commerce.
- Confirm git history no longer contains the previously blocked Stripe sentinel commits and push protection stays clean.
- Keep Vercel protected deployment topology documented for Backy admin/public and custom frontend deployments.

**Acceptance criteria:**
- Release certification doctor passes.
- Secret scans/contract smokes avoid raw provider-looking keys.
- Vercel deployment docs identify backend/admin topology, frontend deployment separation, and domain/subdomain routing expectations.
- `npm run typecheck --workspace @backy-cms/admin` passes.
- `git diff --check` passes.

**Known files to inspect first:**
- `scripts/backy-release-certification-doctor*.mjs`
- `docs/release/`
- `specs/backy-api-contracts.md`
- `specs/page-completion-audit/backy-page-surface-audit.md`
- `apps/admin/src/routes/settings.tsx`
- `apps/admin/src/routes/products.tsx`
- Vercel/deployment docs or config files found by `rg -n "Vercel|deployment|protected|domain|subdomain|release certification|provider certification"`.
