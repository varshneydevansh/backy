# Backy Custom Frontend Next Starter

This is the minimal launch shape for a separate public website project that uses Backy as the backend.

Use this when a frontend agent or developer is building `www.example.com`, `blog.example.com`, or another public site while Backy remains split into:

- protected `backy-admin`: editor and operations UI
- public `backy-public`: API/render runtime
- separate custom frontend: this website project

## Environment

Set only these browser-safe variables in the public website project:

```env
NEXT_PUBLIC_BACKY_API_BASE_URL=https://backy-public.example.com/api
NEXT_PUBLIC_BACKY_SITE_ID=site_example
NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=www.example.com
```

Server components and route handlers may use the matching non-public aliases:

```env
BACKY_PUBLIC_API_BASE_URL=https://backy-public.example.com/api
BACKY_SITE_ID=site_example
BACKY_SITE_PUBLIC_HOST=www.example.com
```

The website domain belongs on this custom frontend project, not on `backy-admin`. Keep admin, database, provider, SMTP, cron, bootstrap, and service-role variables in `backy-public` or private deployment tooling only.

## Read Order

Before generating routes or UI, read:

1. `GET /api/sites/:siteId/agent-handoff`
2. `GET /api/sites/:siteId/manifest`
3. `GET /api/sites/:siteId/openapi`
4. `GET /api/sites/:siteId/render?path=/`

The starter vendors a tiny public Backy client in `src/lib/backy-client.ts` so it can be copied into a new Vercel project without waiting for a package-registry publish. It uses the same `createBackyCustomFrontendClient({ env: process.env })` shape as `@backy/sdk-js`, so `/api` suffixes, site ids, and host-aware `domain=` route context stay aligned with Backy's public contract.

## Deployed Connection Probe

The starter exposes `GET /api/backy-connection` with schema `backy.custom-frontend-connection.v1`.

It returns only public configuration and booleans: the Backy public API base, site id, public host, Backy manifest reachability, required DOM control attributes, and whether forbidden private env names are present in the frontend deployment. It never returns secret values.

It also exposes a `backy.custom-frontend-control-plane.v1` block with the agent read order, site-scoped Backy endpoints, and the exact component contract, property map, render elements, editable map, frontend design, and deployment topology pointers a frontend agent must preserve while redesigning the site.

After deploying a separate website frontend, run the Backy repo smoke with the probe required:

```bash
BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://<backy-public-domain>/api \
BACKY_CUSTOM_FRONTEND_SITE_ID=<site-id-or-slug> \
BACKY_CUSTOM_FRONTEND_URL=https://<frontend-domain> \
BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 \
BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 \
npm run test:custom-frontend-connection
```

## Files

- `src/lib/backy-client.ts`: tiny public client for Backy render, manifest, newsletter, and form APIs.
- `src/lib/backy.ts`: Backy client bootstrap from safe env.
- `src/lib/render.tsx`: small renderer that keeps `data-backy-element-id`, `data-backy-element-type`, component-contract pointers, prop/style keys, responsive breakpoints, token refs, asset ids, action/binding counts, animation metadata, and editable-map pointers on every element. It also generates tablet/mobile media-query CSS from Backy responsive layout/style overrides so the starter does not silently render every breakpoint from desktop geometry.
- `src/app/[[...path]]/page.tsx`: catch-all public page renderer backed by `render(path)`.
- `src/app/api/backy-connection/route.ts`: public, secret-free connection probe for deployed frontend verification.
- `src/app/api/newsletter/route.ts`: public newsletter signup and unsubscribe bridge. Use `POST` with `email` and `consent` to subscribe, or `DELETE` with `email` plus optional `formId`, `source`, or `signup_source` to unsubscribe without exposing admin credentials.
- `src/app/api/backy-form/route.ts`: public form-submission bridge.

Replace the visual renderer with your own design system as needed, but keep the Backy element ids, element types, component-contract pointers, responsive/style metadata, generated responsive CSS or equivalent breakpoint behavior, token refs, binding/motion/asset metadata, editable-map pointers, and form/newsletter submit boundaries intact. Those attributes let Backy, analytics, and frontend agents map every visible component back to the stored API contract.

When `@backy/sdk-js` is published to your package registry, you can replace the local client with the full SDK helper. Until then, this starter remains self-contained for production frontend deployment.
