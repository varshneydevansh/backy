# Plan: Phase J — Developer Platform, Plugins, and Custom-Frontend Enablement

**Generated**: 2026-02-26  
**Estimated Complexity**: Medium to High

## Overview
Enable `backy` to be consumed as a headless CMS core by any frontend while preserving admin-first authoring. This phase focuses on docs, SDKs, extension hooks, and deployment patterns.

## Prerequisites
- Public API contract normalization and versioned endpoints from Phase F.
- Stable schema contracts and auth boundary from Phases A/F.

## Sprint 1: External consumption package
**Goal**: Reduce custom frontend onboarding friction.

### Task 1.1: API contract publication
- **Location**: `specs/backy-api-contracts.md`, `README.md`
- **Description**:
  - Publish endpoint matrix with request/response samples for every public route.
  - Add changelog/deprecation policy for contract changes.
- **Complexity**: 6
- **Dependencies**: Phase F
- **Acceptance Criteria**:
  - Third-party engineer can implement client calls from docs.
- **Validation**:
  - Documentation smoke by implementing quick integration notes.

### Task 1.2: Example headless clients
- **Location**: `README.md`, sample frontend directory (create if missing)
- **Description**:
  - Add reference examples (React + vanilla JS) for page fetch + form submit + comments.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Example runs against local `backy-public`.
- **Validation**:
  - End-to-end render and submit flow demonstration.

### Task 1.3: Extension hooks and integration points
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `packages/core/src/types/index.ts`
- **Description**:
  - Add configurable webhook hooks and pluggable form/comment processors with signature contract.
- **Complexity**: 8
- **Dependencies**: Phase C/D
- **Acceptance Criteria**:
  - Webhook processor receives normalized payload and returns explicit status.
- **Validation**:
  - Trigger mocked webhook and inspect outbound payload.

### Task 1.4: Partner SDK and quick-start
- **Location**: `package.json`, `apps/public/package.json`, `README.md`
- **Description**:
  - Add typed client snippets and installable package guidance.
- **Complexity**: 5
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - A published helper package path exists in docs.
- **Validation**:
  - SDK snippet compiles against sample TS project.

## Sprint 2: Ecosystem hardening
**Goal**: Make platform migration and extension easy for teams.

### Task 2.1: Plugin architecture baseline
- **Location**: `packages/core/src/types/index.ts`, `apps/admin/src/routes/settings.tsx`
- **Description**:
  - Add registration model for plugin processors and custom field widgets.
- **Complexity**: 8
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Third-party plugin can register without touching core source.
- **Validation**:
  - Sample plugin receives expected events.

### Task 2.2: Release and upgrade path
- **Location**: `README.md`, `CHANGELOG.md`, repo scripts
- **Description**:
  - Versioning strategy and migration guides for breaking API changes.
- **Complexity**: 5
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Clear major/minor deprecation cadence documented.
- **Validation**:
  - One migration recipe tested from local previous commit.

## Sprint 3: Interactive figures and custom code components
**Goal**: Let pages and blog posts host rich interactive animations, diagrams, simulations, calculators, visualizations, and fully bespoke interactive designs without adding unsafe free-form script boxes.

### Task 3.1: Interactive block content model
- **Status**: Done for current platform scope; page/blog content, render payload schemas, SDK element typing, migrations, sizing, fallbacks, controls, data bindings, and render capability metadata are wired.
- **Location**: `packages/core/src/types/index.ts`, page/post schema contracts, render payload schemas
- **Description**:
  - Add first-class `interactiveFigure` and `codeComponent` block models with `componentKey`, `version`, `props`, `controls`, `dataBindings`, sizing, fallback content, render capabilities, and accessibility metadata.
- **Complexity**: 8
- **Dependencies**: Phase F render contract normalization
- **Acceptance Criteria**:
  - Page and blog documents can persist interactive blocks through admin APIs and expose deterministic static fallback content in public render payloads.
- **Validation**:
  - Schema/unit tests for persisted props, controls, bindings, fallbacks, and backwards-compatible unknown-component handling.

### Task 3.2: Safe component registry
- **Status**: Done for current platform scope; public registry discovery, demo/file-backed admin registry APIs, production repository/schema adapters, review/approval, disable/delete, rollback, audit, signed uploaded bundle storage, integrity metadata, dependency metadata, and DB repository smoke coverage are wired.
- **Location**: new registry repository/module, admin Settings or Developer Platform surface
- **Description**:
  - Add signed/versioned component bundle records with owner, review status, dependency metadata, allowed data scopes, permission requirements, changelog, rollback state, and audit events.
- **Complexity**: 13
- **Dependencies**: Task 2.1, Task 3.1
- **Acceptance Criteria**:
  - Admins can register, review, enable, disable, version, and roll back components without editing core source.
- **Validation**:
  - Admin contract smoke covering create/list/detail/duplicate rejection/review approval/rollback/public exposure/delete/audit readback and signed bundle upload metadata.
  - Repository smoke covers DB-backed registry create/list/detail/update/rollback/delete with approved sandbox runtime metadata, signed integrity fields, Supabase-style storage metadata, and dependency bundle metadata.

### Task 3.3: Sandboxed iframe runtime
- **Status**: Done for current platform scope; Settings/manifest expose runtime readiness, the registry advertises site-scoped sandbox runtime URLs, the public sandbox route serves a constrained HTML runtime shell with strict CSP/security headers, public/admin renderers mount constrained iframes, lifecycle failures can be recorded as `interactive-runtime` events, uploaded bundle bytes remain storage-only, and hostile-bundle browser security smoke coverage exists.
- **Location**: public renderer, component runtime package, CSP configuration
- **Description**:
  - Render fully custom code in constrained iframes with strict CSP, sandbox flags, allowlist permissions, postMessage protocol, resize events, lifecycle messages, error reporting, and static crawler fallbacks.
- **Complexity**: 13
- **Dependencies**: Task 3.1, Task 3.2
- **Acceptance Criteria**:
  - Custom bundles can draw interactive frontend animations while being unable to read parent DOM, cookies, admin sessions, secrets, or unauthorized Backy APIs.
- **Validation**:
  - Base contract/source smoke covering sandbox CSP, no-store errors, security headers, lifecycle bootstrap, and obvious parent/cookie/storage/API access hazards.
  - Browser-level hostile fixture smoke covers denied parent DOM/location/cookie/localStorage access, top-navigation escape, popup escape attempts, and server-side rejection of dangerous sandbox/permission settings.

### Task 3.4: Editor authoring controls
- **Status**: Done for current platform scope; page editor and blog editor insertion, registry picker, fallback editing, hydration mode, sandbox URL controls, interactive-specific data binding target paths, publish readiness gates, and live sandbox preview support exist for interactive figures and code components.
- **Location**: page editor, blog editor, component property panel
- **Description**:
  - Add block insertion, trusted component picker, custom component picker, prop controls, data-source binding, live preview, fallback editing, sizing controls, and publish readiness checks.
- **Complexity**: 13
- **Dependencies**: Task 3.1, Task 3.2, Task 3.3
- **Acceptance Criteria**:
  - Authors can add an interactive blog/page figure like a self-correction communication-round animation, bind it to content/data, preview it, and publish with a fallback.
  - Fully custom code components are selected from Backy's registry or uploaded as reviewed/signed component bundles, then executed only through the constrained frontend sandbox runtime with explicit data bindings.
  - Publishing and scheduling are blocked when interactive blocks lack a component key, pinned version, hydration mode, crawlable fallback, or safe relative sandbox URL.
  - Code component preview mode hydrates the saved sandbox runtime in a constrained iframe and falls back to static warnings for unsafe or missing URLs.
- **Validation**:
  - Admin smoke covering insert/edit/preview/publish/readback on both a page and blog post.

### Task 3.5: Public API, manifest, and SDK contract
- **Status**: Done for current platform scope; manifest, OpenAPI, public registry endpoint, SDK types/helpers, schema docs, sandbox runtime route checks, and smoke assertions cover the discovery/runtime contract path.
- **Location**: public render API, manifest/OpenAPI, SDK package
- **Description**:
  - Extend render payloads, frontend manifest, OpenAPI schemas, and SDK types so custom frontends know whether to hydrate a trusted component, mount a sandbox iframe, or show fallback content.
- **Complexity**: 8
- **Dependencies**: Task 3.1, Task 3.3
- **Acceptance Criteria**:
  - External frontends can render registered interactive blocks without importing admin internals.
- **Validation**:
  - SDK/OpenAPI smoke for typed interactive block rendering, fallback-only mode, and unknown version handling.

### Task 3.6: Lifecycle, import/export, and governance
- **Status**: Done for current platform scope; usage inventory, publish/review blocking, import/export metadata, audit events, component-version migration, rollback, and signed bundle metadata are implemented.
- **Location**: registry APIs, admin audit logs, export/import workflows
- **Description**:
  - Add component version history, moderation/review state, deprecation warnings, import/export package metadata, publish compatibility checks, and usage analytics.
- **Complexity**: 8
- **Dependencies**: Task 3.2, Task 3.4, Task 3.5
- **Acceptance Criteria**:
  - Backy can identify which pages/posts use a component version, block unsafe publishes, and migrate or roll back interactive blocks.
- **Validation**:
  - Governance smoke for dependency usage, blocked unsafe publish, export/import metadata, and audit trail rendering.

### Task 3.7: Broad interactive design readiness
- **Status**: Done for current hardening scope; the secure registry/sandbox foundation exists, editor/blog authoring can select registry-backed blocks and sandboxed code components, the inspector now pins component versions from the registry selector instead of key-only selection, registry runtime capability badges and generic control schemas render in the inspector, editor publish readiness enforces Backy's owned sandbox route pattern, server-side registry validation requires custom-code sandbox URLs to use the Backy-owned `/api/sites/:siteId/interactive-components/:componentKey/:version/sandbox` runtime route for the same resolved component identity, the editor/public registry now include communication-round/self-correction, timeline, parameter simulation, data explorer, and sandboxed canvas animation presets, registry entries now expose dependency policy presets, compatibility metadata, and data-binding preset pickers through the authoring inspector and public/OpenAPI/SDK contracts, the sandbox security smoke now includes a representative animated canvas runtime fixture that receives Backy's init payload, emits ready/resize lifecycle messages, and proves changing frame output, server-side validation now enforces dependency policy presets, bounded Backy runtime compatibility, render-target compatibility with the selected render mode, static fallback compatibility, and registry-declared binding preset schema before create/update/review/bundle mutation paths can publish custom code, and the authoring inspector now renders a compact registry-driven visual preview for rounds, stepper, chart, timeline, simulation, data explorer, and sandboxed canvas/custom component families.
- **Location**: editor component library, registry metadata, sandbox verification fixtures
- **Description**:
  - Continue expanding the component-template library beyond the current communication-round/self-correction, timeline, simulation, data-exploration, and sandboxed canvas presets into scroll-driven, charting, and WebGL-style blocks.
  - Add visual prop/control schema previews so authors can configure registered components without reading component internals.
  - Add bundle dependency policy presets and compatibility metadata for common animation libraries.
  - Enforce dependency policy and compatibility metadata before custom-code review approval.
  - Extend browser regression fixtures with representative custom animation runtimes.
- **Acceptance Criteria**:
  - Authors can select or upload a wide class of interactive animation designs while Backy keeps ownership of registry selection, content data, controls, bindings, publish checks, audit, versioning, and the public API contract.
  - Registry selection must persist both `componentKey` and `version` so page/blog blocks remain pinned to a reviewed component release even when multiple versions share the same key.
  - Registry runtime capability metadata must be visible before publish so authors can see status, render mode, signature, sandbox route readiness, permissions, and admin API denial.
  - Registry dependency policy, animation-library compatibility metadata, and declared binding presets must be visible before publish and available in the public contract so custom frontends understand how a component can hydrate safely.
  - Server-side create/update/review/bundle validation must reject unsafe dependency policies, unbounded runtime compatibility, render-target mismatches, missing static fallback compatibility, and malformed binding presets.
  - Registry-declared control schemas must render in the inspector and persist edited values back into the canvas element for trusted and sandboxed runtimes.
  - The inspector must render a compact registry-driven visual preview so authors can identify the selected interactive family, mode, version, and active control state before publishing.
  - Custom-code sandbox execution and editor publish readiness must use Backy-owned `/api/sites/:siteId/interactive-components/:componentKey/:version/sandbox` URLs for the same resolved site, component key, and version; remote runtime URLs remain bundle/storage metadata or explicit provider handoffs, not executable iframe origins.
  - Communication-round/self-correction, timeline, simulation, data-explorer, and sandboxed canvas templates must be selectable from the editor catalog and discoverable through the public registry contract with declared controls, data scopes, fallback content, and sandbox metadata.
  - Fully custom code continues to execute only in the constrained frontend sandbox/runtime.
- **Validation**:
  - Editor smoke/source guards for template selection/configuration, version pinning, dependency/compatibility metadata, and binding preset pickers, plus browser sandbox smoke for representative animation runtimes.

## Testing Strategy
- External frontend smoke from docs.
- plugin registration + webhook + SDK path validation.
- interactive component sandbox contract/source smoke for CSP, headers, lifecycle bootstrap, and parent-access guardrails.
- interactive component sandbox security smoke with hostile bundle browser fixtures.
- public render/API smoke proving trusted components and sandboxed components expose stable fallbacks and data bindings.

## Risks & Gotchas
- API surface bloating if extension points are too generic.
- **Mitigation**: versioned plugin contracts.
- Custom-code blocks can become an XSS or data-exfiltration path if treated as raw script injection.
- **Mitigation**: signed registry bundles for trusted components, iframe sandboxing for untrusted/custom bundles, strict CSP, postMessage-only communication, permission scopes, and no direct access to parent DOM, cookies, secrets, or admin APIs.

## Rollback
- Keep extension hooks additive and behind config; disable specific plugins without core rollback.
