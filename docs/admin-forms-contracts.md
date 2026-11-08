# Administrative form contracts

The standard site OpenAPI now declares 28 previously missing form operations. The existing private attachment download, form deletion/cleanup and cleanup-job discovery contracts are preserved. Use authenticated `/api/admin/sites/{siteId}/forms` operations for private authoring and review; public visitor submission endpoints remain a separate contract.

## Identity, authorization and caching

Each operation resolves the requested site ID or slug to its canonical site ID before scoped repository access. Form IDs are not globally unique: two sites may deliberately have the same form ID. Submission/contact row identity must be checked against both the selected site and form. Demo inventory helpers now accept a trusted `siteId`; an omitted scope can infer only a single form owner and fails closed when ownership is ambiguous. Authentication/permission denial precedes content reads in the actual-handler fixtures.

| Operation group | Required permission |
| --- | --- |
| Definition/list, analytics, saved-list reads, submission/contact reads | `forms.view` |
| Create or clone a definition | `forms.create` |
| Edit definition or create reusable embed block | `forms.edit` |
| Review, retry notifications, consent retention, contact CRUD/import/sync, saved-list writes | `forms.manage` |
| Promote qualified contact to operator user | `forms.manage` **and** `users.create` |
| Promote qualified contact to private customer collection record | `forms.manage` **and** `collections.edit` |
| Existing form deletion / cleanup-job discovery | `forms.delete` |

Sessions and service credentials remain subject to central site/module restrictions and owner-management rules. Operator promotion accepts only viewer/editor for newly created users; existing owner user protection remains authoritative. It creates operator users, not visitor memberships.

The admin proxy applies `Cache-Control: private, no-store`. Ordinary leaf responses rely on that served boundary; private attachment and incomplete-inventory errors also set explicit no-store headers. Do not claim a direct unit handler response independently applies every proxy header. Private values, IP/request provenance, contacts and invitation tokens belong in server/admin storage, not visitor bundles or browser public configuration.

## Original submissions, review and consent

`AdminFormSubmission` describes original `values`, selected site/form identity, status, review metadata, collection conversion outcome and optional verified visitor identity. Listing returns **`data.submissions.data` plus `data.submissions.pagination`**, not a flat array or top-level pagination. Limits default to20, support1–100, and offsets are non-negative. `requestId` query filtering is distinct from the request-correlation header; SDK exposes `submissionRequestId` and `contactRequestId` for filters.

PATCH submission and POST its `/review` alias accept the same typed classification request. They preserve original values and can create a contact or draft CMS record when approval/configuration requires it. `reviewedBy` is currently caller-supplied review metadata; it must not be treated as independently verified actor identity. These handlers do not accept a content revision/CAS token or promise atomic review/contact/collection/audit writes.

Consent retention defaults to `dryRun:true`; `dryRun:false` sequentially anonymizes due, discovered consent fields and selected IP/user-agent provenance. It retains unrelated original values, contact profile fields and file references; it is not whole-submission deletion or private-byte cleanup. Preview requests do not bind a later apply to reviewed fingerprints. Site-wide results omit per-form `dryRun` and per-form policy `now`; top-level policy contains the timestamp. The generated DTO reflects that distinction rather than inventing fields. Contact retention returns consent evidence projections, not full contact records.

## Inventory and outcomes

Definition inventory, analytics, contact segments and saved-list membership use complete paginated, canonical scoped reads. Invalid pagination, duplicates, foreign rows, drift or read failure produce `503 FORMS_INVENTORY_INCOMPLETE` with private,no-store rather than a partial successful summary. Saved-list POST inventories before changing definitions; that503 makes no saved-list writes. Saved-list settings/audit writes are not an optimistic concurrency transaction; an audit failure after commit can still return500.

Notification retries return409 when no eligible configured destination exists or status is spam/rejected. An attempted delivery can return200 with `data.delivery.status:'failed'`; HTTP200 is not external-delivery certification. Contact sync explicitly sends1–50 selected private contacts to the supplied HTTP(S) destination, optionally with source values. Failure returns **502 with a success-shaped delivery payload**. SDK rejects it as `BackyFormContactSyncDeliveryError`, exposing its typed `response.data.delivery`, and never automatically resends it.

Contact CSV import is intentionally row partial:200 reports `created`, `updated`, `skipped` and row errors. Optional email upsert can return200 for existing contacts versus201 for newly created ones. Contact edits change contact `sourceValues`/newsletter evidence, not the original submission. Promotion and consent actions are sequential; an error does not promise all earlier writes rolled back. Form/seat billing overage blocking can return402; errors retain the standard envelope.

## Verification boundary

`npm run test:admin-forms --workspace @backy/public` runs the actual 28 new handlers/alias with AJV request/response validation, auth denials, canonical/wrong-site identities, actual isolated demo persistence and repository adapters, nested settings, original-value review, consent anonymization, CSV outcomes, promotion, reusable embed generation and mocked notification/sync delivery. Repository adapter mocks do not certify SQL transactions or external providers.

The root-owned `test:forms-inventory` fixture covers205 forms,10005 submissions/contacts, tail-form discovery, complete saved-list membership, malformed/duplicate/foreign/drifting inventory and pre-write denial. The distinct `forms-tenant-collision-smoke.mts` fixture uses two sites with the same form ID and distinct private rows. Source repair/extended tenant mutation proof is coordinated separately by the handler owner.

SDK `test:forms`, `test:form-types` and `test:generated-types` exercise all28 helper transports, cookies/session/request IDs, encoded identities, query/body separation, CSV bytes, generated response parity, original-submission types and the typed502 error. None of these fixtures is deployed, browser, SMTP, webhook or production database evidence.
