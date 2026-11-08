# Resumable owner and operator media uploads

The admin library and shared editor uploader stage files larger than 3 MiB through persisted, uploader-bound sessions. Each request carries at most 1 MiB. Completed bytes are SHA256-checked before entering the existing media quota, file-type, scanner, storage, recovery-journal and audit pipeline. This avoids sending a large multipart body through Vercel. Small files keep the existing upload path.

This implementation requires PostgreSQL migration031. Staging uses private database chunks and is capped at **50 MiB**, also subject to the configured file limit and website quota. It is not an unlimited video streaming service. A separate streaming/direct-provider path is needed above this cap. No local Vercel filesystem is used for staging.

Select the exact same file with the same options to resume after interruption. The browser remembers only a non-bearer session ID under a file/options digest. The backend binds that ID to the current operator and exact website. The returned binding fingerprint prevents different visibility or metadata from being substituted during resumption. No provider key or upload token enters browser storage.

The Media workspace's **Unfinished transfers** panel explicitly loads only the signed-in uploader's records. **Discard staging** removes unpublished bytes. It cannot remove committed media. A completion interrupted after media persistence recovers the saved media result without another write; retained complete receipts survive staging expiry. A completion with no proven media result cannot automatically resend. Discarding it first acquires the same durable website lock as finalization and leaves any storage cleanup journal intact. Manage committed media through the normal library controls.

Unfinished staging expires after24 hours. New session creation prunes expired uploading/failed staging. Complete receipts and uncertain completion records are retained; no quota is silently released for an uncertain writer. Outstanding staging prevents website deletion. Files saved in the media library do not expire because a staging session expires.

The API is documented in the selected site's OpenAPI document:

- `GET/POST /api/admin/sites/:siteId/media/uploads`: list current uploader transfers or begin a session with filename, MIME type, exact size, SHA256 and ordinary string metadata fields.
- `GET /media/uploads/:uploadId`: current durable state, byte offset and binding fingerprint.
- `PATCH /media/uploads/:uploadId`: `application/offset+octet-stream` with exact `Upload-Offset`; duplicate or concurrent offsets return409.
- `POST /media/uploads/:uploadId`: `{action:"complete"}`; bytes remain private until normal media admission succeeds.
- `DELETE /media/uploads/:uploadId`: explicit unpublished-staging discard; storage recovery evidence remains.

`createBackyMediaUploadSessionsClient` supplies typed, cookie-only SDK methods with no automatic retries. Service keys cannot acquire this uploader session or the Owner static-check exception. The server's optional Owner-only scanner policy retains its exact site allowlist; other operators still require the configured scanner.

Source/native database/client/browser tests are distinct from production migration and release acceptance. This document does not certify deployed resumption or a real large-file provider transfer.
