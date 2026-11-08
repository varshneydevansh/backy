# Connect upload scanning and existing email

These connections belong to the Backy backend deployment, not the custom frontend. Set their environment variables on the public backend's production project, then redeploy that backend. Keep credentials out of browser variables, frontend projects, copied AI handoffs and source control.

## Upload scanner

Backy supports HTTP scanning and ClamAV INSTREAM. By default it requires a clean verdict before storing a production upload or replacement. Storage credentials alone do not enable uploads.

For a personal website where only the owner uploads files, a deployment can explicitly enable basic checks for selected canonical site IDs:

```dotenv
BACKY_OWNER_STATIC_MEDIA_SITE_IDS=site-example
BACKY_MEDIA_SCAN_PROVIDER=none
BACKY_MEDIA_SCAN_FAIL_OPEN=false
```

This exception requires an authenticated active owner session and the selected site's canonical ID in the server allowlist. It covers ordinary admin Media uploads and replacements, including the shared editor picker. Editors and API/service keys do not qualify, even when a request also carries an owner cookie. Public form attachments and database backup restores remain scanner-gated. Do not enable the legacy deployment-wide `BACKY_ALLOW_PRODUCTION_MEDIA_SCAN_DISABLED` override for this workflow.

Storage, upload type/size/quota policies, static SVG restrictions and controlled delivery still apply. File metadata records the authenticated owner, website and `malwareScanned: false`; basic checks do not establish that a file is malware-free. Readiness and the admin upload controls display that distinction. A configured HTTP/ClamAV scanner is still used; its rejection or outage does not trigger an owner exception. Real upload/readback and editor save/reopen/publish must still be verified after deployment.

For an existing HTTP scanner:

```dotenv
BACKY_MEDIA_SCAN_PROVIDER=http
BACKY_MEDIA_SCAN_ENDPOINT=https://scanner.example.com/scan
BACKY_MEDIA_SCAN_API_KEY=<server-only scanner token, if required>
BACKY_MEDIA_SCAN_FAIL_OPEN=false
```

The endpoint receives a POST containing the raw file bytes, with the file MIME type as `Content-Type`. Metadata headers are `x-backy-media-filename` (URI-encoded), `x-backy-media-type` and `x-backy-media-size`. When configured, the token is sent as a Bearer authorization header. A successful scan must return a successful HTTP status and JSON such as `{"status":"clean","scanner":"your-scanner"}`. Rejected files, missing verdicts and availability failures block uploads with fail-open disabled. An endpoint that always says clean does not supply malware scanning.

For an existing reachable ClamAV service:

```dotenv
BACKY_MEDIA_SCAN_PROVIDER=clamav
BACKY_MEDIA_SCAN_HOST=<scanner host reachable from the backend>
BACKY_MEDIA_SCAN_PORT=3310
BACKY_MEDIA_SCAN_FAIL_OPEN=false
```

The backend uses clamd's INSTREAM protocol. A local address refers to the backend's own runtime; a scanner running only on a developer's laptop does not provide a production service. Connect the scanner through the service's permitted network path.

After deployment, open Media for the intended site. Confirm the scanner configuration and upload a small clean file through the ordinary upload controls. Verify save/reopen and delivered bytes; then test multiple-file partial failure, rejected input, private delivery and each enabled format, including fonts. The configuration check alone does not certify those workflows.

## Existing mailbox

Resend is optional. Backy can send through an existing mailbox's SMTP service or its Hostinger Mail API adapter. Obtain the exact mailbox/server settings from the mailbox provider; this integration does not create a mailbox.

For SMTP with implicit TLS:

```dotenv
BACKY_EMAIL_PROVIDER=smtp
BACKY_EMAIL_FROM=notifications@example.com
BACKY_SMTP_HOST=<provider SMTP server>
BACKY_SMTP_PORT=465
BACKY_SMTP_SECURE=true
BACKY_SMTP_USER=<authorized mailbox login>
BACKY_SMTP_PASSWORD=<server-only mailbox credential>
```

For the provider's STARTTLS service, use its server and port (commonly 587) with `BACKY_SMTP_SECURE=false`. The transport must establish and validate TLS before authentication or sending a message; it refuses a server that cannot complete the upgrade.

For Hostinger Mail API delivery:

```dotenv
BACKY_EMAIL_PROVIDER=hostinger
BACKY_EMAIL_FROM=notifications@example.com
BACKY_HOSTINGER_MAIL_API_TOKEN=<server-only mailbox-scoped token>
BACKY_HOSTINGER_MAILBOX_ID=<optional existing mailbox resource ID>
```

Use Settings' connection check for the API adapter, then verify one explicitly requested notification reaches the chosen mailbox. Provider acceptance and inbox arrival are separate observations. Test a confirmed failed attempt and its deliberate retry; do not replay pending or uncertain attempts.

Several sites can use different existing authorized senders through `BACKY_EMAIL_SITE_SENDERS`, a JSON object mapping canonical site IDs to plain mailbox addresses. This selects senders; it does not provision mailboxes, grant provider permission or implement a mail inbox/campaign suite. Keep existing mail DNS when the website domain is connected to a separate frontend.

## Site mailbox inventory and reading

The mailbox workspace uses Hostinger Mail API credentials, even when outbound notifications use SMTP. Register each existing mailbox explicitly on the backend:

```dotenv
BACKY_HOSTINGER_MAIL_API_TOKEN=<server-only provider token>
BACKY_HOSTINGER_MAILBOX_BINDINGS=[{"id":"editorial","siteId":"site-example","mailboxId":"provider-mailbox-id","address":"hello@example.com"}]
```

Use the canonical Backy site ID, an opaque binding ID and the exact mailbox resource ID/address authorized by Hostinger. Several bindings can belong to one site. The provider token must be authorized for each bound mailbox. An outbound sender, SMTP account or global mailbox ID does not grant inbox access. Do not configure real bindings until the mailbox owner has authorized that access.

The selected site's Settings workspace lists its registered mailbox addresses, paginated folders and message metadata. Reading a message is an explicit **Open and mark read** action: Hostinger's text endpoint marks the message Seen. Backy returns plain text and discards HTML; it does not load remote email resources. These routes require an Owner cookie session and both `sites.view` and `settings.view`. Service keys cannot read mail. The binding descriptors do not reveal provider resource IDs or tokens, and public discovery describes contracts without mailbox data.

Attachment support is a separate explicit flow. `GET /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/messages/{uid}/attachments?folder=...` returns at most 100 private descriptors with opaque attachment IDs, sanitized filenames, MIME metadata, sizes and inline flags. It does not return content IDs, bytes or provider URLs. `POST` to the same path followed by `/{attachmentId}/download` accepts only `{"folder":"..."}` and verifies the exact website, binding, folder, message and attachment before retrieving bytes. Both routes require the current Owner cookie and both permissions; the download also requires the trusted admin Origin. Existing plain-text read responses remain unchanged.

Downloads return at most 8 MiB of bytes with `application/octet-stream`, an attachment disposition, a sanitized filename, private `no-store`, `nosniff`, a sandbox policy and no referrer. Empty files are supported. Metadata may list a larger attachment, whose download receives `MAILBOX_ATTACHMENT_TOO_LARGE`; missing or foreign attachments are refused. No public URL, automatic preview or automatic retry is created. This endpoint does not promise a message Seen-state change. The SDK provides `adminSiteMailboxAttachments()` and `downloadAdminSiteMailboxAttachment()` through isolated Owner-cookie transport; the latter returns bounded bytes and a safe filename for a caller's explicit save action.

After configuring an authorized mailbox, separately verify two sites cannot see each other's bindings, folder/message pagination works, opening a known disposable message returns the expected text and marks it read, downloading an explicitly chosen disposable attachment returns the exact original bytes, and returning to another site clears old details. Synthetic adapter/UI tests and configuration presence do not establish provider compatibility. Compose/reply, aliases, mailbox provisioning and campaigns remain separate unfinished capabilities.

Provider behavior: [Hostinger message text](https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/MessagesApi.md#getmessagetext), [message attachment metadata](https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/MessagesApi.md#getmessage) and [decoded attachment download](https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/MessagesApi.md#getmessageattachment).
