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

## Files

- `src/lib/backy-client.ts`: tiny public client for Backy render, manifest, newsletter, and form APIs.
- `src/lib/backy.ts`: Backy client bootstrap from safe env.
- `src/lib/render.tsx`: small renderer that keeps `data-backy-element-id` and `data-backy-element-type` on every element.
- `src/app/[[...path]]/page.tsx`: catch-all public page renderer backed by `render(path)`.
- `src/app/api/newsletter/route.ts`: public newsletter signup bridge.
- `src/app/api/backy-form/route.ts`: public form-submission bridge.

Replace the visual renderer with your own design system as needed, but keep the Backy element ids, element types, responsive/style metadata, and form/newsletter submit boundaries intact.

When `@backy/sdk-js` is published to your package registry, you can replace the local client with the full SDK helper. Until then, this starter remains self-contained for production frontend deployment.
