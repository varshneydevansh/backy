import assert from "node:assert/strict";
import {
  isUploadAllowedByFileType,
  type MediaUploadPolicy,
} from "../src/lib/mediaUploadPolicy";

const policy = (allowedFileTypes: string): MediaUploadPolicy => ({
  maxUploadBytes: 50 * 1024 * 1024,
  quotaBytes: 500 * 1024 * 1024,
  warningThresholdPercent: 80,
  allowedFileTypes: allowedFileTypes
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
});

const allowed = (
  allowedFileTypes: string,
  filename: string,
  mimeType: string,
) => isUploadAllowedByFileType(policy(allowedFileTypes), {
  filename,
  mimeType,
});

assert.equal(
  allowed("document/*", "launch-plan.pdf", "application/pdf"),
  true,
  "document/* should allow PDF uploads by MIME type",
);
assert.equal(
  allowed("document/*", "content-brief.docx", "application/octet-stream"),
  true,
  "document/* should allow Office documents by extension when browsers omit the MIME type",
);
assert.equal(
  allowed("document", "notes.txt", "text/plain"),
  true,
  "document category should allow text documents",
);
assert.equal(
  allowed("file/*", "archive.zip", "application/zip"),
  true,
  "file/* should allow generic downloadable files",
);
assert.equal(
  allowed("file", "private-download.bin", "application/octet-stream"),
  true,
  "file category should allow octet-stream downloads",
);
assert.equal(
  allowed("file/*", "hero.png", "image/png"),
  false,
  "file/* should not widen into image picker uploads",
);
assert.equal(
  allowed("other/*", "dataset.bin", "application/octet-stream"),
  true,
  "other/* should allow unknown generic files",
);
assert.equal(
  allowed("font/*", "brand.woff2", "application/octet-stream"),
  true,
  "font/* should allow known font extensions even when browser MIME is generic",
);
assert.equal(
  allowed("image/*", "hero.webp", "application/octet-stream"),
  true,
  "image/* should keep extension-based image allowance",
);
assert.equal(
  allowed("*/*", "anything.custom", "application/x-custom"),
  true,
  "*/* should remain an explicit allow-all rule",
);

console.log(JSON.stringify({
  ok: true,
  contract: "backy.media-upload-policy.v1",
}, null, 2));
