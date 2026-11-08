# Authenticated order operations contracts

Sixteen existing site-scoped methods now have standard OpenAPI operations, generated bindings and SDK transport/type checks:

| Path under `/api/admin/sites/{siteId}/commerce` | Methods | Permission |
| --- | --- | --- |
| `/orders/analytics` | GET | `commerce.view` |
| `/orders/{orderId}/status-handoff` | GET | `commerce.view` |
| `/orders/{orderId}/quote` | GET, POST | read `commerce.view`; mutation `commerce.edit` |
| `/orders/{orderId}/tracking` | GET, POST | read `commerce.view`; mutation `commerce.edit` |
| `/orders/{orderId}/provider-refund` | GET, POST, PATCH | read `commerce.view`; mutation `commerce.edit` |
| `/orders/{orderId}/fulfillment` | GET, POST | read `commerce.view`; mutation `commerce.edit` |
| `/orders/{orderId}/shipping-label` | GET, POST, DELETE | read `commerce.view`; mutation `commerce.edit` |
| `/reconcile` | GET, POST | `commerce.configure` for both |

Sessions and service credentials retain the central per-site/module policy. Private original order values, customer/tracking/refund data and provenance are authenticated administrative data, returned with no-store. Record lookups use canonical site plus the private orders collection, and support exact ID or slug. Private-order methods also apply the commerce collection access guard. The admin status-handoff response includes site, collection and statusHandoff; it has a separate schema from public status-access lookup, whose required access projection is different.

Read or operation outcomes are explicit, not a promise of real provider execution:

- Quotes are calculated from saved items and configured adapters. An estimate or saved quote is not tax/shipping provider certification.
- Tracking can be saved/refreshed using an explicit or stored tracking reference. Manual handoff requires operator work.
- Refund request/refresh can return HTTP200 requested, requires_action or failed. Missing saved refund on PATCH is400 PROVIDER_REFUND_NOT_FOUND.
- Fulfillment rejects unpaid or closed orders with409 ORDER_NOT_PAID/ORDER_FULFILLMENT_CLOSED. It supports deliberate manual status/provider authoring and configured HTTP dispatch. A failed dispatch is a saved HTTP200 outcome.
- Shipping label without configured purchase retains a draft and a local label handoff URL. Draft does not prove purchased carrier postage. Missing label on DELETE is404 SHIPPING_LABEL_NOT_FOUND; local void or provider response must be interpreted using execution metadata.

Order analytics now uses a complete validated canonical order inventory in both adapters. `analytics.inventoryComplete` is true on success; legacy `recordLimit` remains numeric but now equals the complete record count rather than a fictional truncation ceiling. Invalid/read-failed inventory returns503 ORDER_INVENTORY_INCOMPLETE, no-store.

Reconciliation selects a bounded saved webhook event window and matches it against complete canonical orders. Query `limit` defaults100 and is clamped1..500; paging honors the selected window despite repository caps. Demo sources merge/deduplicate newest events and then slice that window. The route uses the newest matching selected event per order. POST body dryRun/runMode override query values; GET forces scheduled mode and uses optional x-backy-actor as an audit label. **GET mutates by default**: dryRun defaults false and both methods require commerce.configure. Set dryRun true explicitly when evaluating. This is a read-only evaluation, not a reviewed/bound commit preview.

Invalid complete order or selected event-window inventory returns503 before replay writes. Application remains sequential: an order update, inventory restoration or later audit can fail after prior work commits. Provider execution and order persistence are not one transaction. Tracking POST now guards the full record loaded by this request: a concurrent edit returns409 ORDER_RECORD_CONFLICT with details.reloadRequired:true and retains newer notes. This is an internal read-to-write guard, not a caller token covering a long-opened UI. After tracking commits, cache/audit/webhook task exceptions retain200 with safe data.completionWarnings entries (CACHE_INVALIDATION_PENDING, AUDIT_PENDING, WEBHOOK_DELIVERY_PENDING); all applicable tasks are attempted independently. Successful cacheInvalidation remains, and failed cache work omits that field. No durable task queue or automatic replay is claimed. Other operation and reconciliation commit boundaries remain separate; no whole-run atomicity is promised.

SDK aliases follow generated adapter/analytics/reconciliation envelopes exactly, including the separate admin status-handoff envelope and nullable absent refund amount. Typed known inputs cover quote addresses/tax/discount/carrier fields, tracking reference, refund amount/reason, manual fulfillment status and label inputs. Existing safe extension typing remains for caller compatibility; arbitrary request fields are not a persistence guarantee. Helpers encode IDs, forward session/cookies, preserve request correlation, put replaylimit in query and do not auto-retry writes or incomplete reads.

Verification:

- `npm run test:admin-order-operations --workspace @backy/public`: actual16 handler methods plus AJV; isolated demo persistence and a store-backed repository adapter; early auth denial, canonical scope, ID/slug lookup, original nested values, manual outcomes and synthetic HTTP fulfillment success/failure. Inventory restoration is mocked.
- `npx tsx apps/public/scripts/commerce-order-inventory-contract-smoke.mts`: handler-owner fixture for205-order tail analytics/reconciliation, incomplete inventory failures and bounded selected event windows.
- `npm run test:order-operations --workspace @backy/sdk-js`:16 helper transports, encoded identity, session/cookies, query/body separation and explicit outcomes with mocked fetch.
- `npm run test:order-operation-types --workspace @backy/sdk-js`: eight exact response aliases plus current request/status/complete-inventory and optional tracking warning typing.
- The ordinary handler fixture includes repaired tracking409 admission in the repository branch and a demo provider-await race, plus cache/audit/webhook failures separately and together. It verifies saved200, exact warning codes, retained notes/nested values, independent attempts and secret-free responses. Historical diagnostic flags are no longer required.

No real provider, PostgreSQL, browser or deployed runtime proof is established by this batch. These standard operations do not certify complete commerce processing, recovery or moderation.
