# Backy Agent Instructions

Backy is a secure Wix/Webflow-like backend with WordPress-like content ease and a Canva-like canvas editor. Treat Backy as the source of truth for sites, routes, content, media, forms, commerce records, frontend design metadata, and editable canvas state.

Use [DESIGN.md](DESIGN.md) for admin UI taste and density rules. Do not replace Backy's operational control-room UI with a marketing-dashboard pattern.

## Custom Frontend Agents

When building or editing any custom frontend on top of Backy, start from the machine-readable handoff. Do not guess API shapes or fork the content model into frontend-local JSON.

Read order:

1. `GET /api/sites/:siteId/agent-handoff`
   - Local demo: `http://127.0.0.1:3001/api/sites/site-demo/agent-handoff`
   - Contract: `backy.custom-frontend-agent-handoff-response.v1`
   - Canonical payload: `backy.custom-frontend-agent-handoff.v1`
   - API alignment: `data.apiAlignment` and `data.handoff.apiAlignment`

2. `GET /api/sites/:siteId/manifest`
   - Site identity, routes, modules, frontend design state, template registry, media/font policy, live-management capability, launch readiness, and completion status.
   - The same handoff is mirrored at `data.contract.customFrontendAgentHandoff`.

3. `GET /api/sites/:siteId/openapi`
   - Generate typed clients and use operation/component names instead of hand-written URL guesses.
   - The same handoff is mirrored as `x-backy-custom-frontend-agent-handoff`.

4. Frontend design contract
   - Public read: `manifest.data.site.frontendDesign`
   - Authenticated management: `/api/admin/sites/:siteId/frontend-design`
   - Use this for tokens, fonts, colors, spacing, motion, chrome, editable maps, and captured templates.

5. Template registry and render verification
   - Templates: `/api/admin/sites/:siteId/templates`
   - Render: `/api/sites/:siteId/render?path=/...`

Long-form contract: [specs/custom-frontend-agent-handoff.md](specs/custom-frontend-agent-handoff.md).

Use `apiAlignment` before generating frontend code. It names the direct read start, manifest/OpenAPI mirrors, SDK/generated-type source, public discovery endpoints, authenticated write boundary, canvas-first creation routes, preserve-field list, and render/resolve verification endpoints.

## Design State Preservation

Every created or updated page, blog post, product, form, collection item, or reusable section must reopen in the Backy canvas editor with site fonts, colors, chrome, element geometry, responsive overrides, bindings, media/font identities, animations, and editable fields intact.

Preserve these fields whenever present:

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

Do not flatten editable Backy canvas content into plain HTML/text unless the target is explicitly a throwaway static export.

## Canvas-First Creation

New content must use Backy routes/APIs so the editor can own it later.

- Backy starter pages: `/pages/new?siteId=:siteId&templateSource=backy-canvas&focus=canvas`
- Custom frontend pages: `/pages/new?siteId=:siteId&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`
- Backy starter blog posts: `/blog/new?siteId=:siteId&templateSource=backy-canvas`
- Custom frontend blog posts: `/blog/new?siteId=:siteId&templateSource=custom-frontend&frontendDesignTemplateId=:templateId`

Use `focus=canvas` for page creation entry points that should land authors in the focused visual editor after creation. Blog creation keeps title, slug, taxonomy, and SEO panels visible by default, then opens the saved post in the editor. Use the handoff's `contentCreation.adminEntryPoints` for products, forms, collections, and reusable sections. Preserve `templateSource`, `frontendDesignTemplateId`, `designTemplateId`, and `frontendTemplate` aliases where advertised by the manifest/OpenAPI.

## Safety Boundary

Public discovery can describe endpoints and field names, but admin-only APIs perform writes. Handoff, manifest, and OpenAPI responses must not expose provider keys, database URLs, admin sessions, order payloads, submission values, or raw secrets.

The four remaining audit partials are external live Settings/Commerce provider certification artifacts. They are not a reason to fork or weaken the canvas/editor data model.

## Useful Verification

Use focused checks that match the area touched. Common gates:

```sh
npm run typecheck --workspace @backy-cms/admin
BACKY_EDITOR_SOURCE_ONLY=1 npm run test:editor-drag --workspace @backy-cms/admin
npm run test:editor-smoke-coverage --workspace @backy-cms/admin
BACKY_EDITOR_ZOOM_SMOKE=1 npm run test:editor-zoom --workspace @backy-cms/admin
npm run doctor:release-certification
```

Before claiming a custom frontend or editor path is complete, verify both the API contract and the rendered/admin UI path that exposes it.
