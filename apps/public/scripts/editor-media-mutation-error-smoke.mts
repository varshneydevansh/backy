import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { editorMediaMutationErrorResponse } = require("../src/lib/editorMediaMutationError");

const privateCause = { message: "private SQL and provider diagnostic", siteId: "foreign-site", providerKey: "secret", query: "private query" };
let checks = 0;
for (const code of ["MEDIA_STORAGE_MUTATION_BUSY", "MEDIA_STORAGE_LOCK_UNAVAILABLE", "INVALID_EDITOR_MEDIA_REFERENCE"]) {
  const response = editorMediaMutationErrorResponse(Object.assign(new Error(privateCause.message), {
    ...privateCause, code, details: { mediaId: "submitted-id", path: "/content/elements/0/props/assetId", ...privateCause },
  }), "synthetic-request");
  assert.ok(response);
  assert.equal(response.status, code === "INVALID_EDITOR_MEDIA_REFERENCE" ? 400 : 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), code === "MEDIA_STORAGE_MUTATION_BUSY" ? "1" : null);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.requestId, "synthetic-request");
  assert.equal(body.error.code, code);
  const encoded = JSON.stringify(body);
  for (const value of Object.values(privateCause)) assert.ok(!encoded.includes(value));
  if (code === "INVALID_EDITOR_MEDIA_REFERENCE") assert.deepEqual(body.error.details, { mediaId: "submitted-id", path: "/content/elements/0/props/assetId" });
  else assert.equal(body.error.details, undefined);
  checks += 12;
}
for (const cause of [null, undefined, 42, "MEDIA_STORAGE_MUTATION_BUSY", new Error("private diagnostic"), { code: "UNRELATED", details: privateCause }]) {
  assert.equal(editorMediaMutationErrorResponse(cause, "request"), null);
  checks++;
}
for (const details of [{ mediaId: "id" }, { path: "/content" }, { mediaId: {}, path: 42 }]) {
  const response = editorMediaMutationErrorResponse({ code: "INVALID_EDITOR_MEDIA_REFERENCE", details }, "request");
  assert.ok(response);
  assert.equal((await response.json()).error.details, undefined);
  checks += 2;
}
console.log(`Document/media error privacy acceptance: ${checks} checks passed.`);
