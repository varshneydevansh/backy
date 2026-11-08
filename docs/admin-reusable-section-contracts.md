# Reusable section authoring API contracts

The site OpenAPI document describes thirteen existing methods across eight reusable section paths. These operations require fresh authenticated access; site ID/slug resolves to canonical identity and section ID/slug is looked up within that site.

| Path under `/api/admin/sites/{siteId}/reusable-sections` | Methods | Permission |
| --- | --- | --- |
| Root | GET, POST | `pages.view`, `pages.edit` |
| `/{sectionId}` | GET, PATCH, DELETE | `pages.view`, `pages.edit`, `pages.delete` |
| `/export` | GET | `pages.view` |
| `/import` | POST | `pages.edit` |
| `/{sectionId}/versions` | GET | `pages.view` |
| `/{sectionId}/versions/{version}/restore` | POST | `pages.edit` |
| `/{sectionId}/instances` | GET, POST | `pages.view`, `pages.edit` |
| `/{sectionId}/metadata` | GET, PATCH | `pages.view`, `pages.edit` |

Explicit product instance reads or writes additionally require both the corresponding `collections.*` and `commerce.*` permission. An `all` request omits products when those additional grants are absent, preserving existing page-only authoring access. This is reflected in the operation descriptions and tested against actual handlers.

## Content and library behavior

Section content remains JSON with nested components, registered component versions, responsive overrides, animation declarations, inert custom JavaScript, and unknown root extension fields. Explicit content create/update/import validates a nonempty top-level `elements` array; it does not prove every element is renderable. Section creation can be seeded from a saved frontend design template, so a template-only request can obtain its name/content from saved design state. Slugs normalize from explicit slug or name. Direct frontend design envelope aliases retain the normalizer's existing precedence.

List filters cover status/category/tag/search and pagination with normalized `limit` 1–100 and nonnegative `offset`. Both stores return pagination. Export completes the matching scoped inventory before filtering comma-separated IDs/slugs and returns the existing downloadable `backy.reusable-sections.export.v1` envelope. Export and instance inventory are bounded to 100000 records and 1000 pages; drift, duplicates, foreign records, missing pagination and read failures return `503 REUSABLE_SECTION_INVENTORY_INCOMPLETE`. Instance inventory failure starts no propagation writes.

Structured metadata updates patch the library, preserving unrelated section metadata. Precedence is `metadata.reusableSection.library`, `metadata.library`, metadata fields, then root fields. Text is trimmed and truncated by the source helper; null removes fields. Labels are case-insensitively deduplicated, capped at twenty and truncated to forty characters. Invalid preview paths or owner/design-system types fail validation. Library owner JSON is descriptive metadata, not authorization.

Version reads return the current snapshot plus retained history (at most twenty-five entries after normal updates). Historical metadata entries are authored JSON; the read endpoint does not validate each one as a complete normalized snapshot. The standard schema preserves this boundary rather than promoting historical objects to certified snapshots.

## SDK parity and verification

Existing SDK methods remain available for list/create/detail/update/delete, version list/restore, export/import, instance list/refresh and library metadata read/update. Response aliases directly retain generated standard envelopes. Generated request unions add template-only creation, import envelope aliases, numeric-string version expectations and the same declared nested JSON without removing existing convenience input types. The transport retains site overrides, encoded identities/version values, session headers, cookie credentials and request IDs. It never automatically retries a stale write.

`test:admin-reusable-sections` executes the actual saved route handlers, template normalizer, version/library/instance helpers and complete inventory helper with demo/repository storage adapters and authorization/delivery fixtures. It validates standard request and response schemas for all thirteen operations; early 401/403 denial without storage reads/writes; canonical site-scoped lookup; nested JSON; loaded-state 409; template-only creation; history/restore/library behavior; complete export tail and pagination; mandatory reviewed manifest; dry-run no-write; source/scope/new inventory and same-timestamp content drift; commit conflict no-write; sanitized post-commit partial outcomes; product permissions; synced child refresh and detached-instance preservation; incomplete-inventory no-write failure, mixed invalid import rejection, late known slug-conflict preflight, malformed history refusal, and missing source-root no-write propagation failure.

SDK `test:generated-types`, ESM/DTS build and `test:reusable-sections` cover generated aliases and all thirteen transports. These checks are separate from live PostgreSQL persistence/concurrency, browser authoring and deployed behavior. The operation inventory reports explicit path/method presence, not complete API or product readiness.

## Transaction boundaries

Detail, metadata and restore writes use optional client loaded-state expectations plus an internal full section read snapshot. PostgreSQL validates that snapshot under a row lock; demo checks and strict snapshot persistence apply in one process. Any invalid import entry fails before writes. The database imports a planned batch in one transaction with locked snapshot guards; demo builds a pending batch and persists once, rolling memory back on persistence failure. Cache invalidation, audit and webhook work occurs after content commit.

Restore rejects malformed history with 400 VALIDATION_ERROR and no write. Instance refresh validates every linked source root while building refresh plans; a missing sourceElementId returns 409 REUSABLE_SECTION_SOURCE_ROOT_MISSING before propagation writes. Legacy unlinked instances use the first root. POST with `dryRun:true` returns `reviewedPreview` using `backy.reusable-section-propagation-preview.v1`. Apply (dryRun omitted/false) requires the exact manifest and matching scope; old callers that directly applied without reviewing now receive 400 VALIDATION_ERROR. The SDK input type requires either explicit dry run or a reviewed manifest and has no unsafe empty-input default.

The manifest binds the full source snapshot, canonical site/section identity, scope and complete selected inventory (including documents without instances). SHA-256 fingerprints use stable JSON: page/post content, entire product values, and the sorted target manifest. Source, scope or inventory drift before apply returns 409 REUSABLE_SECTION_PREVIEW_CONFLICT. The transaction rechecks source and targets; a commit race returns 409 REUSABLE_SECTION_PROPAGATION_CONFLICT with no refresh content writes. Database apply uses a PostgreSQL serializable transaction with source/target locks, whole product values and page/post baseline revisions; unsupported adapters return 503 REUSABLE_SECTION_PROPAGATION_UNAVAILABLE. Demo commits in one process with strict persistence rollback. Empty selected inventory still produces a valid reviewed manifest and applies through the transaction boundary.

Dry run does not lock future content: apply must revalidate it. Success returns `outcome`, `completionWarnings`, `concurrencyBoundary` and the reviewed manifest. `partial` means content committed while derived media indexing, cache invalidation, audit or webhook delivery needs retry; warnings contain sanitized messages and retain HTTP 200. This is not a distributed side-effect transaction.

Repository concurrency/PostgreSQL proof is owned by the source implementation tests, separate from this schema/handler adapter suite. Demo isolation is single-process and does not establish cross-process locking.
