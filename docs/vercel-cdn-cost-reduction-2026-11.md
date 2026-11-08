# Vercel CDN cost reduction for backy-public (Nov 2026)

Context: the Hobby team hit its 4h/month Fluid Active CPU limit (Oct 9 – Nov 8,
2026). backy-public used 2h55m. Every visitor read of render/discovery JSON and
every photo was executed by a function (`public, no-cache, must-revalidate` and
`no-store` are never stored by Vercel's CDN, and `proxy.ts` ran first on every
`/api/*` request). Goal: Backy is for publishing; visitor reads should be served
by the CDN.

Base: this branch starts from the source of the live production deployment
`dpl_<redacted>` (Oct 21, 2026), not from `origin/main`,
which was ~930 files behind (see the snapshot commit).

## Changed headers

| Response | Header | Before | After | Why |
| --- | --- | --- | --- | --- |
| `render` scope, anonymous 200 | `Cache-Control` | `public, no-cache, must-revalidate` | unchanged | Custom frontends (e.g. devanshvarshney-frontend `runtime-render.ts`, `photography-source.ts`, `site-search-source.ts`, `public-discovery.ts`) reject any TTL here. |
| `render` scope, anonymous 200 | `Vercel-CDN-Cache-Control` | — | `max-age=60, stale-while-revalidate=600` | Vercel-only TTL. Vercel consumes it and does not forward it, so the frontend contract above is untouched. |
| `discovery` scope, anonymous 200 | `Cache-Control` | `public, max-age=60, stale-while-revalidate=300` | unchanged | Browser contract unchanged. |
| `discovery` scope, anonymous 200 | `Vercel-CDN-Cache-Control` | — | `max-age=300, stale-while-revalidate=3600` | Without `s-maxage`/a targeted header Vercel never stored these. |
| render/discovery anonymous 200 | `Vercel-Cache-Tag` | — | `backy-public,backy-site-<siteId>` | Lets admin mutations delete exactly this site's CDN entries. |
| render/discovery anonymous 200 | `Vary` | `Accept, Origin` | `Accept, Origin, Authorization, X-Backy-Admin-Key, X-Backy-Admin-Session, X-Api-Key` | Keeps the anonymous entry from being served to a caller presenting credentials (`Cookie` is not varied on, since Vercel refuses to cache `Vary: Cookie`; cookie requests are simply never stored). |
| Any ineligible render/discovery, and all `private`/`error` | `Vercel-CDN-Cache-Control` | — | `no-store` | Authorized, cookie, preview/signed-token, non-GET, non-200 and 304 responses are never stored by Vercel. |
| Media `/file`, public anonymous unconditional full 200 (≤10 MB, not attachment-only) | `Cache-Control`, `CDN-Cache-Control` | `no-store` | unchanged | The media ID is mutable (visibility, bytes, quarantine); browsers and other CDNs still revalidate every time. |
| same | `Vercel-CDN-Cache-Control` | `no-store` | `max-age=86400, stale-while-revalidate=3600` | Repeated photo views stop streaming the file through a function. |
| same | `Vercel-Cache-Tag` | — | `backy-public,backy-site-<siteId>,backy-media-<siteId>-<mediaId>` | Purge target. |
| Media private/signed, Range/206, HEAD, 304, 4xx/5xx | all three | `no-store` | unchanged | Same policy as before; tests still assert `no-store` on every layer. |

Not redirected to Supabase: the media bucket is private (a public object URL
returned 400 during the Oct 13 owner-upload proof), so a public storage
redirect is not available; a signed-URL redirect would still cost an invocation
per view.

## Purging (why the TTLs are safe)

`purgePublicCdnCache` calls `dangerouslyDeleteByTag` (`@vercel/functions`). That
is a delete, not an invalidate, so no stale copy is served after a withdrawal or
a private flip. It runs:

- in `recordSiteCacheInvalidation` (every repository mutation that records a cache revision);
- at the start of `deliverSiteWebhooks` for `site-created`, `site-updated`, `site-deleted`, `commerce-product`, `comment-status`, before any webhook is sent, so a frontend that refetches on `site-updated` never gets the pre-change CDN copy (media PATCH/replace/delete also go through this);
- in `notifyCommentDelivery` for `comment-status` (moderation).

Visitor-triggered kinds (`comment-submitted`, `comment-reported`, `form-submission`,
`contact-*`, `interactive-runtime`, `commerce-webhook`) never purge, so
anonymous traffic cannot force refills. A failed purge is logged, not thrown.
The TTLs bound the exposure if a purge is missed: 11 minutes for render,
~65 minutes for discovery, ~25 hours for media.

Known staleness that purge does not cover: time-based visibility (scheduled
publish/expiry) takes effect within the render TTL (≤ 60s + 600s SWR), and
auto-approved visitor comments appear within the same window.

## Proxy matcher

`proxy.ts` runs as a function before the CDN on every matched request. It now
matches `/api/admin/*`, the private comment delivery-attempt paths, `/uploads/*`,
`/sites/*`, and other `/api/*` only when an `Origin` header is present (CORS and
preflight). Credential-free server-side reads (the frontend's Data Cache
refetches) and plain image loads no longer invoke it.

## Side effects to know

- Media delivery analytics (`recordMediaDelivery`) only count CDN misses now.
- `x-backy-request-id` on a CDN hit is the id of the request that filled the cache.
- New tests: `npm run test:public-cdn-cache`. Updated: `test:media-delivery-cache-admission`, `test:media-file-streaming` (only the anonymous full public 200 assertion changed).
- Verify after the next deploy: `curl -sI` a render URL and a public `/file` URL twice and check `x-vercel-cache: MISS` then `HIT`; the browser-visible `cache-control` must be unchanged.
