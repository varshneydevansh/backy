# Admin collection contracts

The standard site OpenAPI document includes 16 authenticated operations across nine paths: collection list/create; collection detail/edit/delete; JSON backup export/import; record list/create and detail/edit/delete; record bulk mutation and CSV import; and collection binding preset read/replace. The 43 `AdminCollection*` / `AdminCollections*` schemas produce public SDK DTO exports. Existing SDK convenience methods remain available; response envelopes now follow generated wire fields while generic record value types remain specific to the caller.

Admin session or admin key authorization precedes resource reads. Collection reads use `collections.view`, writes `collections.edit`, deletion `collections.delete`, and backup export `collections.export`. Record GET with `format=csv` (or the legacy `export=csv` alias) uses `collections.export`; bulk `action=delete` uses `collections.delete`. Presets use `pages.view` / `pages.edit`. Commerce collections additionally require their commerce permissions. A canonical site ID is used after site ID/slug lookup; collection and record IDs/slugs remain site scoped.

## Editable content and dynamic routes

Record `values` accepts JSON, including `frontendDesignElements`, `frontendDesignDocument`, tokens, nested registered component versions/controls, responsive properties, animations, bindings and safe JSON extensions. PATCH values are validated, normalized and merged with existing values; omitted authored values survive. Optional `expectedUpdatedAt` rejects invalid timestamps with HTTP 400 and stale snapshots with HTTP 409 `COLLECTION_RECORD_CONFLICT` / `details.reloadRequired:true`. Authenticated normal record list/detail/create/edit responses also return an opaque `version` token (`record-v1:` plus 64 lowercase SHA-256 characters); pass it unchanged as optional `expectedVersion` to protect long-open edits when timestamps are unchanged. Clients must send the loaded version to protect the user open-to-save window; legacy requests without it receive only server read-to-write snapshot admission. This token covers canonical identity/status/slug/whole nested values/timestamps and excludes only itself; it is not persisted or added to public/backup records. Invalid tokens return HTTP 400; stale tokens use the same HTTP 409 reload result. Database PATCH also rechecks the full server-read record snapshot at row-lock admission, even without the optional client timestamp, preventing same-timestamp author changes from being overwritten. This preservation is not proof arbitrary custom React code executes, or that every imported component is editor compatible. Schema fields have known field types and validated normalized keys. Fields can be declared with a key, slug, label or name; the handler generates missing IDs/default labels. Dynamic `routePattern` and `listRoutePattern` are validated against a complete page inventory before schema writes. Template-only collection creation and record template/direct frontend-design seeds are supported.

```ts
const schema = await client.createAdminCollection({
  name: 'Projects', slug: 'projects',
  fields: [{ key: 'title', type: 'text', required: true }],
  routePattern: '/projects/:recordSlug', listRoutePattern: '/projects',
}, adminOptions);
const created = await client.createAdminCollectionRecord(schema.data.collection.id, {
  slug: 'sample', values: { title: 'Sample', frontendDesignElements: authoredElements },
}, adminOptions);
await client.updateAdminCollectionRecord(schema.data.collection.id, created.data.record.id, {
  values: { title: 'Retitled' },
}, adminOptions);
```

## Inventory and import boundaries

Collections JSON defaults to 100 items, records JSON to 50; normalized limits are 1–100 with nonnegative offsets. Both stores return pagination. CSV record export reads **all matching records**, ignoring limit/offset used by JSON. Structured field cells are JSON encoded. CSV projects declared schema columns; use JSON backup for full unknown values and metadata. JSON backups include `backy.collections.backup.v1` metadata, schemas and optional records; `records=false` omits records. Filters accept comma-separated `collectionIds` or `ids`. Complete inventories are bounded to 100000 entries / 1000 pages per inventory; drift, duplicates, missing progress, foreign IDs or read failures fail rather than return a truncated backup. Incomplete backup/CSV export is 409 `COLLECTION_EXPORT_INCOMPLETE`; required mutation inventory failure is 503 `COLLECTION_INVENTORY_INCOMPLETE` before content writes.

JSON import accepts `{collections:[...]}`, `{data:{collections:[...]}}`, or `{collection:{...}}`, including the exported envelope. `upsert=true` permits updates. It validates the complete final schema/record batch, routes, uniqueness, references and media before content mutation. Source IDs are provenance; target site/collection IDs are assigned locally. A database transaction uses server-prepared semantic schema plus complete record snapshots; concurrent changes cause 409 `COLLECTION_IMPORT_CONFLICT`, rolling back imported content. Demo persistence has a synchronous single-process snapshot boundary and strict persistence rollback. Post-commit media indexing, audit, cache or webhook failures are separate: an error can follow committed content, so clients must reload before retrying. The API exposes no client-supplied import expectation parameter.

Normal record uniqueness checks remain read-before-write until the separate atomic record-write repair; complete inventory preflight is not an atomic concurrent uniqueness guarantee. Route admission checks do not lock page revisions across preflight/import. The public collection catalog also declares its fail-closed 503 inventory response.

CSV import uses a `text/csv` body with header and data rows. It is intentionally row partial: HTTP 200 returns `created`, `updated`, `skipped`, `errors` and successfully imported records. Invalid rows and existing slugs without `upsert=true` are skipped. Required complete uniqueness preflight occurs before the first write; this does not make all rows one transaction. Bulk record mutation is sequential and reports unmatched IDs as skipped; it does not claim whole-batch atomicity.

Presets PATCH replaces only `editor.collectionBindingPresets` and preserves unrelated settings. It rejects more than 48 entries, malformed entries, duplicate explicit IDs, foreign/noncanonical collection IDs, undeclared fields, and prototype paths. Reserved record fields are permitted. GET preserves historical arrays above 48. Safe JSON extensions remain available, and actor metadata is server authored. This read/merge endpoint has no optimistic concurrency parameter.

## Verification scope

- `npm run test:admin-collections --workspace @backy/public`: actual 16 handlers and actual validation/normalization helpers, isolated demo persistence plus repository adapters, AJV request/response parity, auth denials, canonical IDs, nested content preservation, dynamic route metadata, backup/CSV/bulk/preset outcomes.
- `npm run test:collection-types --workspace @backy/sdk-js`: generated exports, response alias parity, invalid known DTO shapes and caller-specific record values.
- `npm run test:collections --workspace @backy/sdk-js`: all 16 SDK operations plus CSV representation, encoded identities, session cookies/request IDs, structured JSON transport, and no automatic conflict/incomplete-write retries.

Repository adapters in the schema test do not certify PostgreSQL transaction behavior. The separate backend collection acceptance uses isolated PostgreSQL repository and HTTP tests. These source/fixture gates do not certify a deployed database, browser authoring journey, or provider side effects.
