# Authenticated product lifecycle contracts

Four existing methods now have standard OpenAPI operations:

| Path under `/api/admin/sites/{siteId}/commerce/products/{productId}` | Method | Operation | Permission |
| --- | --- | --- | --- |
| `/provider-sync` | GET | `getAdminCommerceProductProviderSync` | `commerce.view` |
| `/provider-sync` | POST | `syncAdminCommerceProductProvider` | `commerce.edit` |
| `/subscriptions` | GET | `getAdminCommerceProductSubscriptions` | `commerce.view` |
| `/subscriptions/{orderId}/action` | POST | `runAdminCommerceProductSubscriptionAction` | `commerce.edit` |

Each operation requires an admin session or service credential, retains central selected-site/module authorization, resolves canonical site identity and scopes records to the site's product/order collections. Responses are private, no-store; private orders and original record values belong only to authenticated callers. Slug and ID lookup work in both adapters. Subscription action additionally checks commerce access to the private orders collection and verifies that the order contains the selected product.

Provider sync reads the most recent saved result or null and includes declared provider readiness and a storefront handoff. POST defaults to `auto`, supports the documented aliases, and saves `handoff`, `synced` or `failed`. Missing credentials can produce HTTP200 `handoff`; configured provider rejection can produce HTTP200 `failed`. The schema's certification `syncSchemaVersion` now matches the actual route's `backy.commerce-product-sync.v1`. Readiness/configuration metadata is not evidence of live provider execution.

Subscription GET classifies selected-site orders using product identity/item metadata, payment references and saved event notes. Its aggregate summary uses a complete validated order inventory in both adapters. Returned rows are intentionally limited to25 and are not a paginated membership export or provider subscription fetch. Invalid/incomplete inventory returns503 `ORDER_INVENTORY_INCOMPLETE` with no-store instead of a partial summary.

Subscription action accepts `pause`, `resume` or `cancel`, optional reason/provider/reference and native provider target aliases. Missing execution configuration records HTTP200 `requires_action` with `executionMode: handoff`; it does not execute an external provider. The existing implementation nevertheless applies local cancel/resume state for `requires_action`, as well as succeeded actions, and appends history/notes. Provider rejection may return HTTP200 `failed` while preserving an action-history record. Callers must inspect action status and executionMode. Provider execution and record mutation are not one transaction; writes may be followed by audit/cache/webhook errors that return500 after content changed. No replay-safe automatic retry, reviewed preview or caller CAS token is promised for these operations.

SDK response aliases exactly follow generated envelopes, including required collection/certification/handoff fields. Existing input extension compatibility remains; generated request types expose the canonical provider aliases and accepted native subscription target fields. SDK requests preserve session headers/cookies, encode site/product/order identity, separate request correlation from body and do not retry provider writes or incomplete inventory reads.

Verification:

- `npm run test:admin-product-lifecycle --workspace @backy/public`: actual four methods plus AJV request/response checks; isolated demo persistence and a repository adapter backed by that store;401/403 before reads, foreign-site404, ID/slug handling, invalid requests, unconfigured no-fetch and synthetic HTTP success/failure, nested authored JSON preservation.
- `npm run test:commerce-product-inventory --workspace @backy/public`: focused complete205-order summary and fail-closed inventory/auth checks, maintained by the handler owner.
- `npm run test:product-lifecycle --workspace @backy/sdk-js`: four existing transport methods and outcome/error propagation with mocked fetch.
- `npm run test:product-lifecycle-types --workspace @backy/sdk-js`: exact generated response parity and request/status typing.

These fixtures do not establish real provider, PostgreSQL, browser or deployed behavior. They do not cover the remaining missing order/comment standard operations or establish whole API coverage.
