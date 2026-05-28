# Backy custom frontend agent handoff

This is the short entry point for AI agents or external teams building a custom frontend on top of Backy. Treat Backy as the source of truth for content, media, routes, forms, commerce data, and editable design state. Do not fork the content model into a separate frontend-only schema.

## Read these contracts first

1. `GET /api/sites`
   - Discover available public sites and the canonical `siteId`.

2. `GET /api/sites/:siteId/manifest`
   - Bootstrap the custom frontend. This is the primary machine-readable contract for routes, modules, media/font policy, site frontend design, template registry, live-management capability, launch readiness, and completion status.
   - Schema source: `specs/ai-frontend-contract/frontend-manifest.schema.json`.
   - Agent shortcut: `data.contract.customFrontendAgentHandoff` (`backy.custom-frontend-agent-handoff.v1`) lists the canonical docs, endpoint templates, SDK helpers, template clone fields, and design-state round-trip fields for AI/frontend builders.

3. `GET /api/sites/:siteId/openapi`
   - Generate typed clients from the site-scoped OpenAPI document. This mirrors the manifest and exposes the endpoint/component names custom agents should use instead of guessing URL shapes.
   - The same handoff is mirrored as `x-backy-custom-frontend-agent-handoff`.

4. `GET /api/sites/:siteId/render?path=/...`
   - Render a page/blog/product/collection route using Backy's normalized payload. Use this when building the live website renderer.

5. `packages/sdk-js`
   - Prefer SDK helpers when writing agents. The generated types in `packages/sdk-js/src/generated-contract-types.ts` are produced from the public schemas/OpenAPI and should stay aligned with the manifest.

Long-form details live in `specs/backy-api-contracts.md` and `specs/editor_complete_spec.md`.

## Admin handoff surface

The same contract is visible inside the site detail workspace under **Frontend handoff** as an **Agent handoff** block. It exposes:

- `backy.custom-frontend-agent-handoff.v1`
- `specs/custom-frontend-agent-handoff.md`
- site-specific manifest, OpenAPI, render, frontend-design, and admin template endpoints
- copyable admin entry points for page, blog, product, form, collection, and reusable-section creation from either Backy-canvas starters or captured custom-frontend templates

This is the human-facing place to copy into another AI/frontend agent before it builds or edits a website on top of Backy.

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

## Creating new content

Backy supports both Backy-canvas templates and captured custom-frontend templates. New content should use the same template source contract instead of inventing a parallel creation path.

- Pages/blog posts: use the admin create APIs with `frontendDesignTemplateId`, `designTemplateId`, or the Backy canvas starter template fields advertised by the manifest/OpenAPI. Admin routes are exposed under `contentCreation.adminEntryPoints.page*` and `contentCreation.adminEntryPoints.blog*`.
- Forms/collections/products/sections: use the captured frontend design template registry exposed from the site frontend-design contract when available. Admin routes are exposed under `contentCreation.adminEntryPoints.product*`, `form*`, `collection*`, and `reusableSection*`.
- After creation, persist editable content through the Backy APIs, not through a frontend-local JSON file.

The expected behavior is Wix-like: every created page or post should open in the Backy canvas editor, retain the selected site's fonts/colors/chrome, and allow precise element-level edits.

## Site design contract

The site-level frontend design contract is the shared bridge between custom frontend work and Backy's canvas editor.

- Public read: `manifest.data.site.frontendDesign`
- Authenticated management: `/api/admin/sites/:siteId/frontend-design`
- Template registry: exposed through the frontend design contract and manifest/OpenAPI

Use it for chrome, navigation, footer, fonts, colors, spacing, motion tokens, template provenance, editable maps, and reusable page/blog/form/product/collection templates.

## Live editing and management

Custom frontends should read live-management discovery from the manifest/OpenAPI before exposing editing controls. The discovery data tells agents which resources are editable, which fields are safe, which endpoints require admin auth, and which payloads intentionally exclude private data.

Important principle: public discovery can describe capabilities, but admin-only APIs perform writes.

## Release readiness note

The current local product audit remains `41 Ready / 4 Partial / 0 Prototype / 0 Missing` until fresh redacted Settings and Commerce live-provider certification artifacts pass:

```sh
npm run ci:provider-artifact-admission
```

Those four partial rows are external provider evidence gates, not canvas/editor data-model gaps.
