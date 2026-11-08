# Durable form notification attempts

`GET /api/admin/sites/:siteId/forms/:formId/delivery-attempts` requires `forms.view`, accepts limit1–100, offset and optional submissionId, and returns canonical site/form, events, full count and pagination. Private no-store history excludes submission values and provider response payloads. SDK: `listFormDeliveryAttempts`.

Existing POST submission `webhook-retry` / `email-retry` requires `forms.manage`. Optional `eventId` selects exact scoped failed evidence; omission resolves the latest authoritative attempt for the current channel and configured target. No source means refusal, not a blind send. Rejected/spam, changed targets, pending, uncertain or consumed sources refuse409; journal unavailability refuses503 before I/O.

Admission commits before outbound execution.200 returns `data.delivery`, original `data.submission` and `data.completionWarnings`; top-level aliases remain. Delivery includes observed succeeded/failed/uncertain, attemptId, durableState and completionWarnings. Observed success with durable pending is unverified persistence and must not be replayed. Audit failure does not overwrite provider outcome. Old audit-only failures need explicit HTTP rejection evidence; ambiguous failures remain uncertain.

Initial public accepted201 submissions preserve success with notification/activity/outcome warnings if follow-up fails. Operational journals are excluded from archives/restores and never cloned/replayed. Retained evidence blocks site deletion. There is no purge feature. Owner investigations retain pending/uncertain outcomes and never resend.

Actual handler/schema, isolated PostgreSQL and served one-request/reopen/denial evidence are recorded in the readiness tracker. Production migrations, provider idempotency/arrival and deployed owner acceptance remain separate.

## Owner investigation without resend

`POST /api/admin/sites/{siteId}/forms/{formId}/submissions/{submissionId}/delivery-attempts/{attemptId}/reconciliation` requires `forms.manage`, selected-site access and an active **owner session**. An API key or a non-owner with delegated manage permission cannot review. Ambient-cookie requests retain the normal trusted-Origin gate. The SDK method is `reconcileFormDelivery`.

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
