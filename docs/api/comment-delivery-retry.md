# Comment delivery admission and protected history

Authenticated `comments.view` clients read `GET /api/sites/{siteId}/comments/delivery-attempts` with limit (positive safe integer, capped100), offset and optional commentId. Counts cover the complete scoped journal. The SDK exposes `listCommentDeliveryAttempts`. This private API contains delivery targets and must never be fetched with public frontend credentials.

`POST /api/sites/{siteId}/comments/{commentId}/delivery-retry` requires `comments.manage` and eventId. The existing SDK `retryCommentDelivery` preserves aliases and exposes observed status, durableState, attemptId and completionWarnings. One failed source admits one next attempt before contacting the provider. A subsequently rejected attempt can be explicitly retried under its own ID. Pending, uncertain, consumed or unverified legacy sources refuse409 without sending. Legacy audit failures need explicit provider rejection evidence because earlier code could misclassify a successful send.

Observed success with durableState pending means the provider responded successfully but outcome persistence was not confirmed. `COMMENT_DELIVERY_OUTCOME_PENDING` requires investigation, never automatic retry. Secondary activity/admin audit failures produce warnings without returning a misleading failed result or500. Provider exceptions stay uncertain. An HTTP200 retry response reports completion of an attempt; it does not certify email arrival or exactly-once external delivery.

The OpenAPI supplies exact history/retry envelopes and permission/error boundaries. Actual handler acceptance validates these success envelopes against the published schemas; SDK transport/type checks separately verify encoded scoped paths, pagination, warning retention and409 without replay. Local browser and isolated PostgreSQL evidence is recorded in the readiness tracker. These handler and SDK fixture checks do not certify real outbound provider delivery.

The private journal is operational authority. Whole-site recovery excludes it explicitly and never executes copied notifications. Site deletion refuses409 while any attempt evidence remains; there is no purge API; owner investigations retain the original outcome and do not authorize resend.

## Owner investigation without resend

`POST /api/sites/{siteId}/comments/{commentId}/delivery-attempts/{attemptId}/reconciliation` requires `comments.manage`, selected-site access and an active **owner session**. An API key or a non-owner with delegated manage permission cannot review. Ambient-cookie requests retain the normal trusted-Origin gate. The SDK method is `reconcileCommentDelivery`.

Send exactly this snapshot and fixed classification:

```json
{
  "expectedUpdatedAt": "2026-10-08T00:00:00.000Z",
  "expectedState": "uncertain",
  "expectedReviewVersion": 0,
  "evidence": "outcome-unavailable",
  "disposition": "retain-without-resend"
}
```

The evidence alternatives are `provider-console-reviewed` and `recipient-report-reviewed`. They record what the owner investigated, never assert delivery success. Arbitrary notes, URLs, provider payloads, actor identifiers and outcome replacements are rejected. The server supplies actor, request identity and timestamp. Only pending/uncertain attempts can be reviewed; exact `updatedAt`, state and review version must still match. Conflicts return409 and require history reload. No provider is called and the attempt state, retry admission and original outcome timestamp are retained.

Protected history includes `updatedAt`, sanitized optional `providerEvidence`, `reconciliationVersion` and append-only `reconciliations`. Evidence may show a provider enum, observation timestamp, bounded status code or safe provider message identifier; local-outbox evidence explicitly remains outbox-only. It does not prove recipient arrival. The200 response is `data: { attempt, reconciliation, completionWarnings }`; `attempt` uses the protected history event shape. A committed review followed by an audit failure returns200 with `DELIVERY_RECONCILIATION_AUDIT_PENDING`. Reload to confirm the saved review; never automatically repeat it. Responses are private, no-store. Investigations remain operational journal evidence under the existing backup/deletion rules.
