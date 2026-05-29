# Backy custom frontend agent handoff

This is the short entry point for AI agents or external teams building a custom frontend on top of Backy. Treat Backy as the source of truth for content, media, routes, forms, commerce data, and editable design state. Do not fork the content model into a separate frontend-only schema.

Repository-level quickstart for coding agents: `AGENTS.md`.

## Read these contracts first

AI agents should treat this file plus `GET /api/sites/:siteId/agent-handoff` as the start point. The endpoint is the machine-readable version of this document; use it before generating UI, routes, API clients, templates, or editable content.

1. `GET /api/sites`
   - Discover available public sites and the canonical `siteId`.

2. `GET /api/sites/:siteId/agent-handoff`
   - Start here when another AI/frontend agent needs a compact machine-readable brief before generating a website.
   - Returns `backy.custom-frontend-agent-handoff-response.v1` with the canonical `handoff`, `readStart`, `apiAlignment`, `canvasFirst`, `contentCreation`, and `designState` blocks.
   - The same handoff remains mirrored inside manifest/OpenAPI so generated clients can use the same contract.

3. `GET /api/sites/:siteId/manifest`
   - Bootstrap the custom frontend. This is the primary machine-readable contract for routes, modules, media/font policy, site frontend design, template registry, live-management capability, launch readiness, and completion status.
   - Schema source: `specs/ai-frontend-contract/frontend-manifest.schema.json`.
   - Agent shortcut: `data.contract.customFrontendAgentHandoff` (`backy.custom-frontend-agent-handoff.v1`) lists the canonical docs, endpoint templates, API alignment rules, SDK helpers, template clone fields, and design-state round-trip fields for AI/frontend builders.
   - Read-order shortcut: `data.contract.customFrontendAgentHandoff.readOrder` tells agents the sequence to follow: direct agent handoff, manifest, OpenAPI, authenticated frontend-design management, template registry, then render verification.

4. `GET /api/sites/:siteId/openapi`
   - Generate typed clients from the site-scoped OpenAPI document. This mirrors the manifest and exposes the endpoint/component names custom agents should use instead of guessing URL shapes.
   - The same handoff is mirrored as `x-backy-custom-frontend-agent-handoff`.

5. `GET /api/sites/:siteId/render?path=/...`
   - Render a page/blog/product/collection route using Backy's normalized payload. Use this when building the live website renderer.

6. `packages/sdk-js`
   - Prefer SDK helpers when writing agents. The generated types in `packages/sdk-js/src/generated-contract-types.ts` are produced from the public schemas/OpenAPI and should stay aligned with the manifest.

Long-form details live in `specs/backy-api-contracts.md` and `specs/editor_complete_spec.md`.

## Admin handoff surface

The same contract is visible inside the site detail workspace under **Frontend handoff** as an **Agent handoff** block. It exposes:

- `backy.custom-frontend-agent-handoff.v1`
- `specs/custom-frontend-agent-handoff.md`
- the direct `GET /api/sites/:siteId/agent-handoff` start URL
- site-specific manifest, OpenAPI, render, frontend-design, and admin template endpoints
- copyable admin entry points for page, blog, product, form, collection, and reusable-section creation from either Backy-canvas starters or captured custom-frontend templates
- a canvas-first creation rule: every new page, post, product, form, collection, and reusable section must be created through Backy routes/APIs so it reopens in the canvas editor with the site's fonts, colors, chrome, element geometry, bindings, and editable metadata intact

This is the human-facing place to copy into another AI/frontend agent before it builds or edits a website on top of Backy.

The canvas editor also exposes the same contract from the inspector's **Composition handoff** panel. Use **Copy handoff** there when the agent is already working inside a page, post, or reusable-section canvas and needs the direct `/agent-handoff` endpoint, `apiAlignment`, canvas-first creation routes, and design-state preservation fields without copying the larger editor composition plan.

## Editable design state rule

When an agent creates or updates pages, blog posts, products, forms, collections, or reusable sections, it must preserve the full Backy design envelope. In practice that means keeping these fields when present:

- `content.contentDocument`
- `content.elements`
- `content.canvas`
- `content.customCSS`
- `content.customJS`
- `content.themeTokenRefs`
- `content.assets`
- `content.animations`
- `content.interactions`
- `content.dataBindings`
- `content.editableMap`
- `content.seo`
- `content.metadata`
- `meta.frontendDesign*`

Do not flatten a Backy canvas page into plain HTML/text unless the target is a throwaway static export. Backy must be able to reopen the result in the canvas editor with layer geometry, responsive overrides, media/font identity, animations, bindings, and editable fields intact.

## API alignment rule

Agents should treat `customFrontendAgentHandoff.apiAlignment` as the machine-readable instruction sheet before writing frontend code. It identifies the direct read-start endpoint, the manifest/OpenAPI mirrors, SDK/generated-type sources, public discovery endpoints, authenticated admin write boundary, creation routes, fields that must be preserved, and render/resolve verification endpoints. If a generated frontend needs to create or edit Backy content, it should use those advertised contracts instead of frontend-local JSON or guessed route shapes.

## Creating new content

Backy supports both Backy-canvas templates and captured custom-frontend templates. New content should use the same template source contract instead of inventing a parallel creation path.

- Pages/blog posts: use the admin create APIs with `frontendDesignTemplateId`, `designTemplateId`, or the Backy canvas starter template fields advertised by the manifest/OpenAPI. Admin routes are exposed under `contentCreation.adminEntryPoints.page*` and `contentCreation.adminEntryPoints.blog*`.
- Page and blog admin entry points that should open directly into the focused visual editor should include `focus=canvas` with the template source query, for example `/pages/new?siteId=:siteId&templateSource=backy-canvas&focus=canvas`, `/pages/new?siteId=:siteId&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`, `/blog/new?siteId=:siteId&templateSource=backy-canvas&focus=canvas`, or `/blog/new?siteId=:siteId&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`.
- Forms/collections/products/sections: use the captured frontend design template registry exposed from the site frontend-design contract when available. Admin routes are exposed under `contentCreation.adminEntryPoints.product*`, `form*`, `collection*`, and `reusableSection*`.
- After creation, persist editable content through the Backy APIs, not through a frontend-local JSON file.

The expected behavior is Wix-like: every created page or post should open in the Backy canvas editor, retain the selected site's fonts/colors/chrome, and allow precise element-level edits.

## Site design contract

The site-level frontend design contract is the shared bridge between custom frontend work and Backy's canvas editor.

- Public read: `manifest.data.site.frontendDesign`
- Authenticated management: `/api/admin/sites/:siteId/frontend-design`
- Template registry: exposed through the frontend design contract and manifest/OpenAPI
- Agent-read style sources: `customFrontendAgentHandoff.designState.siteStyleSources` names the required design inputs, including frontend design tokens for colors, fonts, spacing, motion, custom CSS, chrome, templates, and editable maps.

Use it for chrome, navigation, footer, fonts, colors, spacing, motion tokens, template provenance, editable maps, and reusable page/blog/form/product/collection templates.

## Live editing and management

Custom frontends should read live-management discovery from the manifest/OpenAPI before exposing editing controls. The discovery data tells agents which resources are editable, which fields are safe, which endpoints require admin auth, and which payloads intentionally exclude private data.

Important principle: public discovery can describe capabilities, but admin-only APIs perform writes.

## Newsletter and subscribers

Newsletter signup is a Backy-native audience workflow, but outbound mailbox delivery remains a provider boundary.

- Use `/newsletter?siteId=:siteId` in the admin when a site needs subscriber capture, consent evidence, CSV export, topic segments, and an email-sync handoff.
- The Newsletter workspace creates normal Backy Forms with `settings.backyIntent: "newsletter"` plus email, name, topic, consent, and signup-source fields. Public frontends submit through `POST /api/sites/:siteId/forms/:formId/submissions` using the same form contract as any other Backy form.
- Subscribers are stored as private Contacts records. Admin/custom tools read and update them through `/api/admin/sites/:siteId/forms/:formId/contacts`, contact segments, contact lists, sync, and consent-retention APIs.
- Copy the workspace handoff (`backy.newsletter-management-handoff.v1`) when an AI/frontend agent or email-sync worker needs the form definition URLs, submit URLs, private management endpoints, canvas routes, and no-secret delivery boundary.
- Do not put delivery-provider API keys, SMTP credentials, bounce webhooks, or unsubscribe signing secrets in page props, public manifests, canvas JSON, or custom frontend repositories. Delivery systems such as Buttondown, Mailchimp, Resend, SES, or similar providers belong behind Settings/server-side environment wiring.

## Release readiness note

The current local product audit remains `41 Ready / 4 Partial / 0 Prototype / 0 Missing` until fresh redacted Settings and Commerce live-provider certification artifacts pass the default combined admission command:

```sh
npm run ci:provider-artifact-admission
```

The same verifier can admit one artifact family at a time when the release evidence is produced separately:

```sh
BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission
BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission
```

Settings admission maps to `/settings` and Settings admin APIs; Commerce admission maps to `/products` and `/orders`. The full audit only becomes the artifact-backed `45 Ready / 0 Partial / 0 Prototype / 0 Missing` view after both families pass. Those four partial rows are external provider evidence gates, not canvas/editor data-model gaps.
