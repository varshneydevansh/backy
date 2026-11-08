import assert from "node:assert/strict";
import { createBackyBuyerDownloadsClient } from "../src/buyer-downloads";
const requests: Array<{
  url: string;
  method: string;
  headers: Headers;
  init: RequestInit;
}> = [];
let deny = false;
const client = createBackyBuyerDownloadsClient({
  baseUrl: "https://fixture.invalid/api/",
  siteId: "site/a",
  orderId: "order/a",
  statusToken: "private-checkout-proof",
  fetch: async (input: any, init: any) => {
    requests.push({
      url: String(input),
      method: init.method || "GET",
      headers: new Headers(init.headers),
      init,
    });
    return deny
      ? new Response(
          JSON.stringify({
            success: false,
            error: { message: "Proof expired" },
          }),
          { status: 403 },
        )
      : init.method === "POST"
        ? new Response("ABC", {
            headers: { "Content-Type": "application/octet-stream" },
          })
        : new Response(
            JSON.stringify({
              success: true,
              data: { orderId: "order/a", entitlements: [] },
            }),
          );
  },
});
assert.equal((await client.order()).orderId, "order/a");
assert.equal(
  requests[0].url,
  "https://fixture.invalid/api/sites/site%2Fa/commerce/orders/order%2Fa/entitlements",
);
assert.equal(
  requests[0].headers.get("Authorization"),
  "Bearer private-checkout-proof",
);
assert(!requests[0].url.includes("private-checkout-proof"));
assert.equal(requests[0].init.cache, "no-store");
assert.equal(requests[0].init.credentials, "omit");
assert.equal(await (await client.download("entitlement/a")).text(), "ABC");
assert.equal(requests[1].method, "POST");
assert(requests[1].url.endsWith("/entitlement%2Fa/download"));
deny = true;
await assert.rejects(client.order(), /Proof expired/);
await assert.rejects(client.download("x"), /Proof expired/);
console.log(
  JSON.stringify({
    suite: "buyer-downloads-sdk",
    checks: 11,
    providerRequests: 0,
  }),
);
