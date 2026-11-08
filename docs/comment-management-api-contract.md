# Comment submission and moderation outcomes

Current page/blog comment POST, site-wide detail/bulk PATCH, and comment report POST responses always expose `data.completionWarnings: string[]`, including an empty array. The content operation has committed when these success responses arrive. `COMMENT_ACTIVITY_PENDING`, `COMMENT_DELIVERY_PENDING`, and `COMMENT_AUDIT_PENDING` identify safe follow-up failures; applicable codes vary by operation. A configured channel returning failure is handled the same as a thrown delivery failure. Responses preserve success status and authored content, omit raw provider errors, and use no-store. The warning does not promise a durable queue, automatic replay, provider delivery, or deployed certification.

OpenAPI uses separate `CommentSubmissionEnvelope` and `CommentMutationEnvelope` schemas. GET `CommentEnvelope` and the older page/blog detail PATCH operations keep their existing shapes. `CommentBulkUpdateEnvelope` includes canonical site ID, updated rows/count, missing IDs and warnings. `CommentReportEnvelope` includes the sanitized public comment, report reason/optional actor/details and warnings. Existing top-level compatibility mirrors remain server behavior; clients consume `data`.

An official reply uses the existing exact `moderationMode: "auto-approve"` field together with active operator credentials. The server admits `comments.manage` against the canonical selected site before immediate publication. Anonymous and website-account hints keep the site policy; they cannot weaken manual moderation or acquire operator identity. Caller `userId` is not identity authority. Verified visitor attribution stays separate from operator publication permission. Invalid or out-of-site operator credentials return 401/403 before creating the comment. Public comment policy, captcha, target publication and parent validation still apply.

```ts
const result = await backy.submitPageComment(pageId, {
  content: "Official reply",
  parentId,
  moderationMode: "auto-approve",
}, {
  siteId,
  credentials: "include", // existing operator cookie on the protected origin
});
// Show the saved reply first, then any safe follow-up notice.
const followupCodes = result.data.completionWarnings;
```

The optional final SDK options argument on page/blog submission, site moderation, bulk moderation, clearing reports and reporting supports the existing live-management credential/header boundary and selected site. Credentials are separate from the JSON body. Existing two-argument calls and legacy target moderation methods remain callable. A denied creation is never automatically replayed. `BackyCommentSubmissionResponse`, `BackyCommentMutationResponse`, `BackyCommentReportResponse`, and `BackyCommentBulkUpdateResponse` alias generated schemas. Site moderation accepts status or nullable parent/thread updates through the distinct `CommentModerationRequest`; the target-specific legacy request still requires status.

Verification commands:

- `npm run test:comment-management-contract --workspace=@backy/public`: 299 actual handler/schema checks with explicit repository/demo/auth/delivery adapters; actual privacy/policy helpers verify public projection and visitor attribution.
- `npm run test:comment-management --workspace=@backy/sdk-js`: 44 mocked transport checks for encoded scope, explicit credentials, intent, warnings, denied write no replay and legacy signatures.
- `npm run test:comment-management-types --workspace=@backy/sdk-js`: exact generated response alias and method parity, required warnings, nullable thread requests.
- `npm run test:comment-moderation-outcomes --workspace=@backy/public`: independently owned actual notifier/handler follow-up regression, including a local HTTP failing webhook.

These contract and adapter checks do not substitute for independent shared-auth, PostgreSQL atomic lifecycle, served admin authoring, deployed cache or live mail/provider tests. They do not change handler or admin UI behavior.

Atomic report admission and its new 409/503 outcomes are documented in [comment-report-admission.md](comment-report-admission.md). The success response and legacy report SDK signature remain compatible.
