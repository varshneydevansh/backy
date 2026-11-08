# Bounded newsletter campaign lifecycle

The `/newsletter` workspace includes persisted campaign drafts, a frozen consent-checked audience, queue/schedule/cancel controls, a delivery journal and operator feedback. Migration `030_newsletter_campaign_lifecycle.sql` creates the PostgreSQL campaign, delivery, suppression, event and dispatch-budget tables. Demo mode does not send campaigns. Existing issue-draft handoffs and subscriber capture remain separate workflows.

Campaigns reuse the existing verified-TLS SMTP transport only after explicit site marketing opt-in. This is a bounded Backy queue, not an unrestricted bulk-email service. The campaign budget is at most 40 attempted recipients per UTC day across every site in this deployment, paced at one attempt every five seconds. Claims, including uncertain attempts, consume the budget. Other transactional email usage is **not counted by this campaign ledger**; an operator must reserve headroom within the provider mailbox limit and verify that opt-in newsletters are permitted. A 100/day mailbox allowance is not a guaranteed total enforced by this feature.

No credential, deployment, provider activation, DNS change or real email was performed while implementing and testing this source. Configuration booleans do not establish provider approval, delivery/arrival or scheduler operation.

## Server configuration

Set server-only configuration on the existing backend; none belongs in admin/custom-frontend browser env. Do not copy actual addresses or keys into the repository.

- Configure the existing SMTP provider, host, verified TLS (`465` implicit TLS or `587` STARTTLS), user and password. The resolved site sender must be the same plain mailbox address as its SMTP user. Campaigns reject local outbox, generic HTTP, Hostinger Mail API and Resend fallback selection; this patch supplies only the SMTP adapter.
- `BACKY_NEWSLETTER_SITE_POLICY` is a JSON object keyed by canonical site UUID. Each site's entry needs `enabled: true`, `providerApproved: true`, `oneClickDkimVerified: true`, a nonempty `postalAddress`, an HTTPS origin `publicBaseUrl` with no path/query/credentials, and integer `maxRecipients` from 1 to 100. An omitted entry is disabled. `providerApproved` is an operator assertion after checking provider terms, not an API certification. `oneClickDkimVerified` records the operator’s verification that the actual provider signs both unsubscribe headers with DKIM; this source does not verify provider signing. [RFC 8058](https://www.rfc-editor.org/info/rfc8058/) requires that coverage for one-click unsubscribe.
- `BACKY_NEWSLETTER_DAILY_LIMIT` is required, integer 1–40, deployment-wide. A conservative limit below 40 can reserve more transactional headroom. A queued campaign above the daily limit continues on later days; the maximum campaign size is 100.
- `BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET` must have at least 32 characters. Preserve it to keep already-sent links usable. During rotation, `BACKY_NEWSLETTER_UNSUBSCRIBE_PREVIOUS_SECRET` can retain one previous key. Removing both applicable keys invalidates older links.
- `BACKY_NEWSLETTER_WORKER_SECRET` must have at least 32 characters if using the internal worker. Provision an external scheduler to `POST /api/internal/newsletter/process` with `Authorization: Bearer <worker-secret>`. Each call scans at most ten due campaigns and admits at most one recipient. The repository does not install a cron job or subscribe to a paid scheduler. An operator can instead explicitly run **Process one recipient** in the workspace. Scheduling requires an actual invoker to make progress.

## Audience and delivery rules

Saving a draft does not contact SMTP or select recipients. Queueing needs both `forms.manage` and `forms.export`, current site/team scope, configured SMTP policy and an optimistic campaign version. It snapshots eligible contacts, normalizes/deduplicates addresses, and refuses oversized audiences rather than silently truncating. An optional signup-form filter narrows the audience.

Eligibility requires explicit canonical `newsletterSubscriptionStatus: subscribed`, an active contact, `newsletterConsent: true`, a subscription timestamp and nonempty consent text. Legacy inferred subscription status without that evidence is held. A negative subscription or explicit refusal on any duplicate contact in the same site excludes that address, including duplicates outside the selected form. A durable site/email suppression always wins. Eligibility and current suppression are rechecked under durable claim admission before each SMTP attempt. The actual SMTP invocation also requires the repository’s contact privacy fence, held until the invocation completes. A contributor tombstone/exclusive erasure prevents the callback and records `failed` with `VISITOR_PRIVACY_FENCED`, consuming the claimed campaign budget without sending. A change or cancellation after admission cannot recall an in-flight network request.

Campaign content and recipient rows become immutable once queued. New subscriber changes do not extend the snapshot. Cancel marks pending recipients cancelled; already accepted and in-flight deliveries retain their outcomes. A `250` SMTP reply is recorded as **accepted**, distinct from arrival. A thrown transport error, non-250 response, interrupted worker or uncertain database settlement is held; it is never automatically resent. A processing claim interrupted for ten minutes becomes uncertain on the next invocation for that campaign. There is no claim of exactly-once external SMTP delivery, automatic retry, open/click tracking or provider-native broadcast management.

Unsubscribe links contain a signed delivery identifier rather than an address. `GET /api/sites/:canonicalSiteId/newsletter/unsubscribe?token=...` displays confirmation only, so ordinary link scanners do not unsubscribe readers. A confirmation-form POST or RFC 8058 one-click POST suppresses the normalized address across this site's future campaigns and updates duplicate contacts. Suppressions persist even if a contact is deleted/recreated. This feature intentionally provides no automatic resubscribe or suppression-clear control. Existing unsigned subscriber APIs are separate capture paths; the campaign eligibility check still holds their current negative contact states.

Historical campaign recipient/delivery snapshots (address, source contact pointer and outcomes) are retained private evidence in the current visitor privacy subset; they are not erased by that subset. Contacts without provenance are ownership unknown and are not linked to visitors by matching email. Fencing blocks future sends for linked erased contributions; it does not promise removal of already-held provider copies or recall of sent messages.

## Feedback and evidence

SMTP itself does not emit authenticated delivery/bounce/complaint events. The workspace can record **operator evidence** after checking an actual mailbox receipt or provider record. It stores the evidence and actor with the outcome. Bounce/complaint feedback creates durable suppression. Late delivered events cannot overwrite a bounced/complained outcome, and unsubscribe cannot lower a complaint suppression.

For a trusted feedback bridge, configure server-only `BACKY_NEWSLETTER_FEEDBACK_SECRET` (at least 32 characters), then POST at most 4 KB to `/api/sites/:canonicalSiteId/newsletter/feedback`:

```json
{"siteId":"<canonical-site-uuid>","deliveryId":"<delivery-uuid>","eventId":"<unique-provider-event>","state":"bounced"}
```

The bridge must authenticate its upstream evidence and correlate it with the stored delivery identifier. This is an explicit Backy bridge protocol, not a built-in Hostinger/Resend webhook adapter. `state` supports `delivered`, `bounced`, `complained`. Send `x-backy-feedback-timestamp` as Unix seconds and `x-backy-feedback-signature` as `sha256=` followed by the hex HMAC-SHA256 of `<timestamp>.<exact-raw-body>`. The secret is the HMAC key. Signatures outside five minutes are rejected. Per-site event IDs are idempotent, with conflicts rejected. An event must refer to an attempted delivery in that site; arbitrary recipient addresses are not accepted.

## API and verification

Admin API prefix: `/api/admin/sites/:siteId/newsletter/campaigns`.

| Operation | Method/path | Permission |
| --- | --- | --- |
| Paginated inventory and safe blockers | GET prefix | `forms.view` |
| Create draft with `Idempotency-Key` | POST prefix | `forms.manage` |
| Delivery detail | GET `/:campaignId` | `forms.view` |
| Update draft with version | PATCH `/:campaignId` | `forms.manage` |
| Freeze and queue audience | POST `/:campaignId/send` | `forms.manage`, `forms.export` |
| Freeze and schedule audience | POST `/:campaignId/schedule` | `forms.manage`, `forms.export` |
| Cancel pending delivery | POST `/:campaignId/cancel` | `forms.manage` |
| Admit one due recipient | POST `/:campaignId/process` | `forms.manage`, `forms.export` |
| Record operator evidence | POST `/:campaignId/feedback` | `forms.manage` |

SDK methods mirror these operations. Creation uses an 8–120 character idempotency key; conflicting reuse fails. Update/queue/schedule/cancel require the current version. Input is bounded to 40 KB per JSON request, a subject up to 200 characters and text up to 30000 characters. Schedule is an ISO date-time within the next 30 days. Private responses use `Cache-Control: no-store`; browser roles cannot directly access campaign tables.

Run the source/handler/PostgreSQL fixture with `npx tsx --tsconfig packages/db/tsconfig.visitor-smoke.json packages/db/scripts/newsletter-campaign-postgres-isolated.mts`. It creates and removes its own socket-only cluster, applies actual migrations, never reads configured database URLs, and replaces SMTP with synthetic outcomes. It covers consent/duplicate filtering, cross-site denial, idempotency, concurrent claims, budgets, schedule/cancel, unsubscribe, signed bridge replay, uncertainty and schema parity.

Run `npx tsx apps/admin/scripts/newsletter-campaign-browser-fixture.mts`, open its local URL and click **Run mounted checks** for actual React desk/client acceptance with synthetic deferred responses. Proof is written to `/tmp/backy-newsletter-campaign-mounted-proof.json`. This is separate from the real PostgreSQL/handler fixture and does not certify a deployed admin, provider delivery or external scheduler.

For the joined browser → actual handlers → owned PostgreSQL → synthetic SMTP flow, run `npx tsx --tsconfig packages/db/tsconfig.visitor-smoke.json apps/admin/scripts/newsletter-campaign-http-browser-fixture.mts`. Its local workspace supports actual draft/queue/process/feedback and reopen tests. The admin identity and SMTP outcome are synthetic; route/repository/data mutations are real inside its owned temporary cluster. HTTP/provider-boundary proof is written to `/tmp/backy-newsletter-campaign-http-proof.json`. Use **Stop owned fixture** or POST to its loopback `/fixture/stop` endpoint to close the server and remove its owned cluster cleanly.
