# Guarded media byte delivery

`GET /api/sites/:siteId/media/:mediaId/file` now returns a `ReadableStream`, emitting at most 64 KiB per pull. This lets the current 50 MiB resumable upload path deliver its admitted originals through the guarded route. Vercel documents a 4.5 MB function response limit and recommends streaming functions for responses that exceed it: [Vercel response-size guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions). Hosted acceptance remains required; the local tests do not certify Vercel deployment behavior.

The current implementation calls the existing storage adapter's `read` method before constructing the response. The entire original remains buffered in server memory for GET, HEAD and range requests. It is response streaming, not native provider streaming or constant-memory delivery. A declared size above 50 MiB returns 413 before reading storage; an actual buffer above 50 MiB returns 413 after the read. Older larger originals therefore require a future adapter streaming path. The cap does not prevent an adapter from allocating an unexpectedly oversized object before its returned buffer can be checked.

Each request rechecks site publication, exact site/media scope, media existence, quarantine, attachment-only policy and private signed URL validity before reading storage or returning 304. No provider URL redirects are introduced. Success, partial content, conditional responses and errors retain browser and CDN no-store controls. The Next image optimizer continues to reject mutable local media URLs; its separate guarded transform path remains in place.

## HTTP behavior

- GET returns 200 for the whole representation, with Content-Length, Content-Type, Content-Disposition, ETag and Accept-Ranges: bytes.
- A single byte Range returns 206 with exact Content-Range and Content-Length. Closed, open-ended and suffix ranges are supported; ends beyond the representation are clamped.
- Malformed, multiple or unsatisfiable byte ranges return 416 with `Content-Range: bytes */<size>` and an empty body. Unknown range units are ignored and receive the whole 200 representation.
- If-Range supports the current strong ETag. A stale tag, weak tag or date validator receives the whole 200 representation. No Last-Modified date validator is advertised. These semantics follow [RFC 9110 range requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-14).
- HEAD executes the same admission checks and returns headers without a body, including for errors. Range is ignored for HEAD. An admitted ordinary HEAD currently reads storage to determine the actual Content-Length.
- Existing If-None-Match behavior remains after admission and before storage access. A matching validator returns 304 without reading bytes.
- Delivery accounting records the selected GET byte count, rather than the whole original for each range. HEAD, 304 and 416 do not add delivery accounting. The recorded count describes the response offered; it does not confirm that the client consumed all bytes.
- Request cancellation releases the response stream and stops further chunk enqueueing. It does not undo the adapter read or existing delivery accounting.

## Validator stability

Managed media validators use the persisted binary fingerprint plus representation and admission fields: site/media identity, filename, MIME type, size, storage path/provider, visibility, quarantine status and delivery variant/disposition. Delivery accounting updates `updatedAt`; that operational timestamp is excluded when a binary fingerprint is present. Repeated range requests can therefore use the ETag from the initial response after actual accounting writes. Prepared image transform identity is included for transformed representations, so regenerating a variant invalidates that transform without invalidating unchanged original bytes.

Legacy media without a binary fingerprint retains conservative timestamp invalidation. Accounting may change its validator and cause an If-Range request to fall back to a full 200 response; this avoids asserting byte identity that the older record does not provide. Current managed uploads persist a binary fingerprint.

`npm run test:media-delivery-validator:postgres --workspace @backy/db` exercises the actual file route, native media repository, PostgreSQL updated-at trigger and delivery analytics in an owned socket-only cluster. It reproduces the accounting-induced validator drift before the fix and verifies repeated 206/304 behavior after real writes, same-size/same-path replacement by changed fingerprint, and private/quarantined admission before conditional responses. The existing cache/admission suite now executes real analytics with timestamp-mutating repository fixtures rather than a no-op analytics stub. This source evidence does not replace hosted verification after deploying the fix.

## Owned acceptance

Run `npm run test:media-file-streaming --workspace @backy/public` for actual route/stream/signature/policy tests using synthetic mutable repositories and a generated 6 MiB PCM audio buffer. Run `npm run test:media-delivery-cache-admission --workspace @backy/public` for the existing optimizer/cache/withdrawal checks.

For HTTP and browser acceptance, run `npm run test:media-file-streaming:browser --workspace @backy/public`, then open its loopback URL and press **Load and seek native audio**. The server tests exact bytes above 4.5 MiB, full/range/suffix/open-ended HTTP delivery, HEAD and 416 before exposing the fixture. The button exercises the browser's actual audio decoder and seeking against the actual guarded file handler. The current proof decoded 35.66585 seconds and sought to 12 seconds; Chrome requested `bytes=0-` and `bytes=2097152-`, receiving 206 responses. Fixtures never use configured databases, real provider objects, credentials or owner content. Stop the owned fixture with `POST http://127.0.0.1:5244/fixture/stop`.

The loopback bridge verifies source and browser behavior. A release must separately verify an admitted response above 4.5 MiB and seeking on the hosted function with its configured persistent storage, access controls, CORS headers and deployment runtime.
