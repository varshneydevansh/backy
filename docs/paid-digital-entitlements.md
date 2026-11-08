# Private paid files and presented-order history

This source capability requires canonical PostgreSQL migrations 034–035 and verified private storage. Raw admin product uploads are capped at 3MiB to remain below the serverless request ceiling. They accept one file up to 3MiB, expiry 1–365 days and 1–100 download admissions. Save a digital product first, then use its **Private paid file** panel. A new upload becomes the version captured by future server checkout orders; existing order snapshots retain their original file identity. Catalog deletion retains private file versions needed by existing orders. Ordinary media visibility, download URLs and email addresses do not establish paid-file ownership.

Checkout captures `digitalFileId` from Backy's authoritative product file repository. Entitlements are issued on first authenticated order access only when the persisted order is paid. Provider request/acceptance annotations alone grant nothing. Existing owner-controlled payment changes and verified provider settlement remain the authoritative payment boundary; this source work does not certify provider configuration or actual payments. Razorpay acceptance remains deferred.

Buyers present the checkout status token in `X-Backy-Order-Status-Token` or Bearer authorization to `GET /api/sites/{siteId}/commerce/orders/{orderId}/entitlements`. Tokens are site-bound, hashed at rest and checked against an explicit finite expiry. Responses expose safe file metadata and the latest 100 access events for that exact order. Account-wide customer history requires separate durable visitor/order linking and is not implemented by email matching.

`POST /api/sites/{siteId}/commerce/orders/{orderId}/entitlements/{entitlementId}/download` returns attachment bytes. Every admission checks current payment/refund/cancellation state, revocation, expiry and allowance. An order row lock serializes download admission with order updates/refunds and explicit revocation. The lock remains held through a SHA256 and size verified storage read bounded to 15 seconds. A later refund cannot recall bytes already admitted; a client transport failure after committed admission can consume one allowance. Storage read failures roll back the count. Expiry starts at checkout creation, so unusually late settlement can produce an already expired entitlement.

The Orders **Paid file access** panel reads safe access history and revokes entitlements with `commerce.edit`; reads require `commerce.view`. Admin operations can prepare a draft site. Buyer operations require a published site. Demo and unsupported adapters refuse paid fulfilment rather than issuing provisional grants.

Local commerce bytes use `BACKY_COMMERCE_PRIVATE_DIR` or `.backy-private/commerce`, outside the public directory. Remote storage may set `BACKY_COMMERCE_PRIVATE_BUCKET`; otherwise the configured media bucket is reused only after explicit privacy verification. Supabase must report `public=false`. S3 must supply complete public-access-block and non-public policy evidence. No signed URLs or storage paths are returned. Existing scanner admission runs before upload. Planned bytes and the exact private storage identity are persisted before upload. Registration and its journal outcome commit together. A lost registration response reads the durable outcome before considering cleanup; registered files are retained. Failed or interrupted uploads retain their byte reservation until explicit recovery proves removal at the matching private destination.

The Products **Private file storage** panel lists safe version metadata and reserved/retained bytes. `GET /api/admin/sites/{siteId}/commerce/private-files` supports pages of 1–100 entries. `POST /api/admin/sites/{siteId}/commerce/private-files/{fileId}/lifecycle` accepts `recover` or `retire`. Recovery verifies exact provider/destination, size and SHA256 before deleting unreferenced bytes, then verifies absence before releasing quota. Unavailable, changed or corrupt storage retains the file and journal. Explicit retirement prevents new checkout selection; it never falls back to an older version automatically. Checkout snapshot validation and durable claims close the read/retire/create race and retain protection even after an order is deleted. Pending checkout claims and all entitlements are protected conservatively. Purchased versions cannot be removed by this bounded UI.

All private planned, uncertain and retained bytes count against the shared website media quota and billing cap under the same site storage lock as ordinary media. Site deletion refuses while private files or unresolved journals remain; a database trigger prevents a direct metadata cascade from bypassing that boundary. Fully verified removal retains safe tombstone/history evidence until the site itself is deleted. This workflow provides bounded upload/outcome/cleanup recovery; it does not provide resumable uploads or portability of purchased files in whole-site backup packages.

Authenticated admin integrations can import `createBackyPrivateFileStorageClient` from `@backy/sdk-js` with an explicitly authenticated fetch for inventory, recovery and retirement.

Custom frontends can import `createBackyBuyerDownloadsClient` from `@backy/sdk-js`:

```ts
const buyer = createBackyBuyerDownloadsClient({
  baseUrl: backyApiBase,
  siteId,
  orderId,
  statusToken: checkoutProofFromPrivateCustomerSession,
});
const order = await buyer.order();
const bytes = await buyer.download(order.entitlements[0].id);
```

Keep proofs in a private customer session. Do not put them in URLs, public environment variables, analytics or logs. The standalone `BuyerDownloads` component in the custom frontend example demonstrates explicit loading, status display and file download with this same contract; it does not add a paid storefront or account portal.

Source verification: `npx tsx --tsconfig packages/db/tsconfig.visitor-smoke.json packages/db/scripts/commerce-entitlements-postgres-isolated.mts` creates its own socket-only PostgreSQL cluster, applies actual canonical migrations, exercises actual handlers and competing transactions, then removes its owned cluster. It reads no configured database URL and performs no real provider requests.
