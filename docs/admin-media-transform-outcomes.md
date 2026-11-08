# Media transform completion outcomes

`POST /api/admin/sites/{siteId}/media/{mediaId}/transforms` retains its existing HTTP 200 response after replacement metadata is committed. Standard `AdminMediaTransformsEnvelope` and the SDK response include optional `data.storageCleanup` and `data.completionWarnings`, so responses from older servers remain usable.

`storageCleanup` is a sanitized summary with `status: complete | pending | blocked`, nonnegative `deletedFiles` and `remainingFiles`. `pending` means provider deletion has not completed; `blocked` means the cleanup manifest could not be trusted for that site/media scope. These counts describe the requested cleanup, not an exhaustive provider inventory. They contain no provider paths or credentials.

Warnings currently include `MEDIA_STORAGE_CLEANUP_PENDING`, `MEDIA_STORAGE_CLEANUP_BLOCKED`, `MEDIA_AUDIT_PENDING`, `MEDIA_CACHE_INVALIDATION_PENDING` and `MEDIA_WEBHOOK_DELIVERY_PENDING`. New warning strings may be added. Failed cache recording may omit `cacheInvalidation`. Clients should show a committed result with pending follow-up work and reload before retrying; they should not automatically regenerate or upload duplicate variants merely because a warning is present. The SDK returns those fields without automatic retries.

Ordinary media PATCH rejects changed storage-owned metadata (`storagePath`, `storageProvider`, `binaryFingerprint`, `safetyScan`, `generatedTransforms`, `replacementVersions`) and changed binary URL/size/MIME/type with HTTP 400 `INVALID_MEDIA_METADATA`. Identical round-trip fields remain accepted, and arbitrary custom JSON plus the existing manual `mediaSecurity` state remain editable. Binary changes use upload/replacement/transform operations.

Replacement metadata is persisted before deleting old variants. A definitive metadata save failure retains the previous variants and returns an error. Generation aborts clean known completed uploads with canonical site/media scope; generation error details can contain a sanitized cleanup summary. An uncertain failing upload's provider-side bytes, exhaustive orphan inventory/recovery and quota accounting of those objects remain separate open concerns. Success with warnings does not certify provider cleanup, deployed load behavior, or recovery completion.

Verification:

- `npm run test:admin-media-storage-contract --workspace @backy/public` checks the actual shared admission helper plus the actual transform handler against standard schemas with fixture persistence/provider effects. It covers complete/pending/blocked HTTP 200, warning codes, omission of failed cache results, canonical cleanup scope, optional legacy fields and failed metadata saves.
- `npm run test:propagation-media-types --workspace @backy/sdk-js` checks generated cleanup-field parity and known status types.
- `npm run test:media-transform-outcomes --workspace @backy/sdk-js` checks encoded transport/auth, exact summaries and no automatic regeneration or error retry.

Separate root-owned tests cover actual Sharp generation failures and scoped deletion trust; isolated PostgreSQL admission proof and production/provider proof are distinct gates.
