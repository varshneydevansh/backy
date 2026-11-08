# Private whole-site recovery API

All four routes require an owner/admin operator with canonical selected-site `sites.configure`. Restore preview and apply also require `sites.create`. Public discovery describes contracts only; it never includes archive values, private submissions, file bytes or job paths. Responses are private/no-store.

| Route | Operation | Success |
|---|---|---|
| GET `/api/admin/sites/:siteId/backup` | `exportAdminSiteBackup` | 200 archive, limits, private:true |
| POST `/api/admin/sites/:siteId/backup/restore` | `previewOrApplyAdminSiteBackup` | 200 preview or 201 fresh draft |
| GET `/api/admin/sites/:siteId/backup/restore-jobs` | `listAdminSiteBackupJobs` | 200 sanitized scoped summaries |
| POST `/api/admin/sites/:siteId/backup/restore-jobs/:jobId/retry` | `retryAdminSiteBackupJob` | 200 settled or pending cleanup |

Export contains `backy.site-backup.v1`: canonical site, all nineteen supported graph tables, managed original/variant/history/private attachment bytes with SHA-256 and explicit external links/exclusions. Bounds are 50,000 rows, 10,000 files, 32MiB binary and 64MiB archive JSON. Complete private bytes are required; external links retain their URL without fetching remote bytes.

Preview submits `{action:"preview",archive,name,slug}`. Its reviewedPreview includes package fingerprint, canonical source/team, destination identity, complete counts, bytes, exclusions, safety resets and concurrency boundary. It writes nothing.

Apply resubmits the identical package and identity plus the exact reviewedPreview, `confirmPrivateData:true` and `confirmSafetyResets:true`. It creates a new draft site, retains the source and remaps content/file identities. Site/content publication, form intake, visitor access, verified domains, delivery/provider bindings and registered component execution are disabled. Global operator profiles/team grants/credentials, visitor provider sessions and operational queues are excluded. These are explicit safety resets in preview, not restored capabilities.

PostgreSQL export uses bounded snapshot/table admission and restore commits the graph and job together. Demo persistence is single-process. Staging files move through planned/writing/stored states; uncertain outcomes retain pending jobs/quota. Apply can return201 with `cleanupPending` and safe completionWarnings; that does not mean content should be created again. Failure503 may include `error.jobId`. Inspect jobs before another apply. Retry accepts `{}` only, uses server-controlled paths and protects committed target files. A retry may remain pending while storage completion is uncertain.

The SDK exposes `exportAdminSiteBackup`, `previewAdminSiteBackup`, `applyAdminSiteBackup`, `listAdminSiteBackupJobs` and `retryAdminSiteBackupJob`. Apply requires both literal true acknowledgements and generated preview data. `BackyApiError.jobId` retains a safe staging identity on uncertain errors. Neither uncertain503 nor stale409 is automatically replayed.

Local handler/schema, SQL, browser and real provider/deployment acceptance are separate gates. This API is bounded recovery to a fresh draft, not live restoration of DNS, billing, login sessions or external mailboxes.
