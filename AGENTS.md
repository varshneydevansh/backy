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

5. Template registry
   - Templates: `/api/admin/sites/:siteId/templates`

6. Newsletter workspace and subscriber handoff
   - Admin workspace: `/newsletter?siteId=:siteId`
   - Public subscribers: `/api/sites/:siteId/newsletter/subscribers`
   - Admin subscribers: `/api/admin/sites/:siteId/newsletter/subscribers`
   - Use this for signup forms, consent evidence, issue handoff, and provider-safe email-sync routes.

7. Render verification
   - Render: `/api/sites/:siteId/render?path=/...`

8. Deployment topology
   - Machine-readable pointer: `data.handoff.deploymentTopology` or `manifest.data.contract.customFrontendAgentHandoff.deploymentTopology`.
   - Deploy Backy as protected `backy-admin` plus public `backy-public`; deploy each custom website as a separate frontend that only receives public Backy API/site env.
   - `backy-admin` receives `VITE_BACKY_PUBLIC_API_BASE_URL` and `VITE_BACKY_ADMIN_API_BASE_URL` only. `backy-public` receives server-only database/admin/cron/provider env. Custom frontend browser bundles receive `NEXT_PUBLIC_BACKY_API_BASE_URL`, `NEXT_PUBLIC_BACKY_SITE_ID`, and `NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST`; server-side loaders may use `BACKY_PUBLIC_API_BASE_URL`, `BACKY_SITE_ID`, and `BACKY_SITE_PUBLIC_HOST`.
   - Before preview deploy, run `npm run test:vercel-release-config` and `npm run test:vercel-preview-readiness`. When the Vercel projects are linked and env is configured, add `BACKY_VERCEL_REQUIRE_REMOTE_ENV=1` to make missing or misplaced project env a hard failure.
   - Before production promotion, set `BACKY_DATA_MODE=database`, configure real database/storage/provider/admin/cron/CORS env on `backy-public`, then run `BACKY_VERCEL_PRODUCTION_URL=https://<public-domain> BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness`.
   - To prove production admin auth too, run the same command with `BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH=1`, `BACKY_VERCEL_ADMIN_EMAIL`, `BACKY_VERCEL_ADMIN_PASSWORD`, and optional `BACKY_VERCEL_ADMIN_MFA_CODE` supplied from local shell or CI secrets only. The smoke logs in, restores the session, and logs out without printing credentials or tokens.
   - Public repo hygiene matters: do not commit local paths, personal email addresses, generated Vercel deployment URLs, Vercel deployment/project/team ids, or user-specific domains. Run `npm run test:repo-public-hygiene` before publishing.

Long-form contract: [specs/custom-frontend-agent-handoff.md](specs/custom-frontend-agent-handoff.md).

Use `apiAlignment` before generating frontend code. It names the direct read start, manifest/OpenAPI mirrors, SDK/generated-type source, public discovery endpoints, authenticated write boundary, canvas-first creation routes, preserve-field list, and render/resolve verification endpoints.

In the admin app, the same contract is visible from the selected site workspace under **Frontend handoff** -> **Agent handoff**, and from the canvas editor **Composition handoff** panel as **Copy handoff**. Use those copyable blocks when handing Backy context to another AI/frontend agent.

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
- Backy starter blog posts: `/blog/new?siteId=:siteId&templateSource=backy-canvas&focus=canvas`
- Custom frontend blog posts: `/blog/new?siteId=:siteId&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`

Use `focus=canvas` for page and blog creation entry points that should land authors in the focused visual editor after creation. Use the handoff's `contentCreation.adminEntryPoints` for products, forms, collections, and reusable sections. Preserve `templateSource`, `frontendDesignTemplateId`, `designTemplateId`, and `frontendTemplate` aliases where advertised by the manifest/OpenAPI.

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
