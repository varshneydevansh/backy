import assert from "node:assert/strict";
import { createBackyPrivateFileStorageClient } from "../src/private-file-storage";
const requests: Array<{ url: string; init: RequestInit }> = [];
let denied = false;
const client = createBackyPrivateFileStorageClient({
  baseUrl: "https://fixture.invalid/api/admin/",
  siteId: "site/a",
  fetch: async (input: any, init: any) => {
    requests.push({ url: String(input), init });
    return denied
      ? new Response(
          JSON.stringify({
            success: false,
            error: { message: "Protected version" },
          }),
          { status: 409 },
        )
      : new Response(
          JSON.stringify({
            success: true,
            data: {
              schemaVersion: init.method
                ? "backy.private-file-recovery.v1"
                : "backy.private-file-storage.v1",
              files: [],
              fileId: "file/a",
              state: "removed",
              removedBytes: 3,
            },
          }),
        );
  },
});
await client.list({ limit: 25, offset: 50 });
assert.equal(
  requests[0].url,
  "https://fixture.invalid/api/admin/sites/site%2Fa/commerce/private-files?limit=25&offset=50",
);
assert.equal(requests[0].init.cache, "no-store");
assert.equal((await client.recover("file/a")).removedBytes, 3);
assert.equal(requests[1].init.method, "POST");
assert.equal(JSON.parse(String(requests[1].init.body)).action, "recover");
assert(requests[1].url.endsWith("/file%2Fa/lifecycle"));
await client.retire("file/a");
assert.equal(JSON.parse(String(requests[2].init.body)).action, "retire");
denied = true;
await assert.rejects(client.retire("protected"), /Protected version/);
console.log(
  JSON.stringify({
    suite: "private-file-storage-sdk",
    checks: 8,
    providerRequests: 0,
  }),
);
