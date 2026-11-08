# Site configuration API contracts

The standard site OpenAPI document now describes seven existing authenticated site configuration operations. The SDK retains its existing methods and binds their request/response types to generated schemas. Site ID/slug inputs resolve to canonical identity; existing request-time authorization and site boundaries remain authoritative.

| Operation | Required permission | Behavior |
| --- | --- | --- |
| Navigation GET | `sites.view` | Saved settings plus resolved navigation from the complete canonical page inventory. |
| Navigation PATCH | `sites.configure` | Root or nested `navigation` input; validates nested page references and merges layout controls. |
| SEO GET | `pages.view` | Saved SEO plus bounded route samples. |
| SEO PATCH | `pages.edit` | Root or nested `seo` input; merges declared policy, replaces supplied arrays, validates templates/JSON-LD/frequency and normalizes priorities. |
| Redirects GET | `sites.view` | Saved rules with advisory route conflict warnings. |
| Redirects POST | `sites.configure` | Read-only preview (`persisted: false`); no audit or settings mutation. |
| Redirects PATCH | `sites.configure` | Replace rules after complete route inventory preflight; `persisted: true`. |

Navigation stores draft references but omits them from public resolved navigation. Repository inventory uses complete pagination rather than a single capped page; inconsistent, foreign, duplicate or failed inventory returns `503 NAVIGATION_INVENTORY_INCOMPLETE`, and PATCH performs no settings/audit write. Existing public navigation GET and render GET document the same sanitized `ErrorEnvelope` failure with `Cache-Control: no-store`. Public collection reads remain published-only.

SEO preview includes at most the first six listed collections and their first record, with at most twelve route samples. This is a preview sample, not an exhaustive sitemap or custom frontend observation. Nullable text clears to empty strings; priorities accept numeric strings and normalize into 0–1; supplied keywords accept comma-separated strings or arrays. Legacy optional response fields remain optional in the schema.

Redirect rules accept `redirectRules`, `rules`, or nested `redirects.rules`, preserving the handler's precedence when multiple aliases are supplied. Empty arrays clear rules. The SDK retains its array convenience input by wrapping it in `redirectRules`. Existing `destination`, permanent redirects, string status codes and destination-free `410` rules remain supported. GET/POST/PATCH fail with `503 REDIRECT_INVENTORY_INCOMPLETE` if the complete page/post/collection-schema inventory cannot be verified. PATCH performs inventory preflight before committing. Conflict warnings remain advisory: dynamic collection route patterns do not establish that every candidate record exists. Supplied external destinations are declarations and are never fetched by these handlers.

SDK methods are `adminNavigation`, `updateAdminNavigation`, `adminSeo`, `updateAdminSeo`, `adminRedirects`, `previewAdminRedirects` and `updateAdminRedirects`. Response aliases directly retain their generated envelopes; request types model the existing nested/root variants. Session cookies, site overrides and request IDs retain their existing transport behavior. The SDK reports a 503 error without automatically retrying a write.

## Optional DOM evidence

`FrontendObservation` additionally describes optional `domCapture` and per-element `dom` evidence. The capture is bounded by the source normalizer: schema/source identity, timestamp, viewport dimensions, counts, exact limitation codes, rectangles, visibility, positioning and transformed state. Legacy observations without these fields remain valid. The runtime checks cross-field counts and revision/completeness rules that JSON Schema alone cannot express. The API accepts the observation object; the download wrapper is not an API payload.

DOM evidence establishes geometry and public identity markers. It never certifies interactions or animation execution, and compatibility reports retain `observations.dom.scope.unverified`. Limitations or mismatched counts/revisions force incomplete evidence rather than promoting an unverified capture to a successful live review.

## Verification scope

`test:admin-site-configuration` executes actual handlers, normalizers and pagination helpers against demo/repository adapters and validates requests/responses against the standard schemas. It covers all seven operations, early 401/403 denials, canonical identity, nested draft navigation, 205-page tail resolution, SEO validation/merge/sampling, redirect read-only preview and replacement, incomplete-inventory no-write failures, and the actual public navigation 503/cache envelope. The render operation's 503 contract is checked against that shared envelope; this harness does not execute the entire render route.

`test:frontend-dom-observation-contract` validates standard DOM schemas against the actual source normalizer/report behavior, including legacy compatibility and conservative scope. SDK `test:generated-types`, build and `test:site-configuration` cover generated aliases and transport compatibility. These checks are separate from live PostgreSQL authorization/persistence, deployed browser behavior and complete API coverage.
