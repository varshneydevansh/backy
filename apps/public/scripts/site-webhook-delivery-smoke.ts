import { createServer } from "node:http";
import assert from "node:assert/strict";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@backy-cms/core";
import { deliverSiteWebhooks } from "../src/lib/siteWebhookDelivery";

const requests: Array<{
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}> = [];

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  requests.push({
    url: request.url || "/",
    headers: request.headers,
    body: text ? JSON.parse(text) : {},
  });

  response.statusCode = request.url === "/fail" ? 500 : 204;
  response.end();
});

const listen = () =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Webhook smoke server did not bind to a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });

const close = () =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const main = async () => {
  let didListen = false;

  try {
    const port = await listen();
    didListen = true;
    const records: Array<{
      siteId?: string | null;
      actorId?: string | null;
      entity?: string;
      entityId?: string;
      action?: string;
      metadata?: Record<string, unknown>;
      requestId?: string;
    }> = [];
    const repositories = {
      auditLogs: {
        record: async (entry: (typeof records)[number]) => {
          records.push(entry);
        },
      },
    };

    const result = await deliverSiteWebhooks({
      repositories: repositories as never,
      site: {
        id: "site-webhook-smoke",
        name: "Site Webhook Smoke",
        slug: "site-webhook-smoke",
        status: "published",
        customDomain: "webhook-smoke.example.com",
        settings: {
          ...(DEFAULT_SITE_SETTINGS as unknown as SiteSettings),
          webhooks: {
            enabled: true,
            endpoints: [
              {
                id: "endpoint-created",
                name: "Created endpoint",
                url: `http://127.0.0.1:${port}/created`,
                enabled: true,
                eventKinds: ["site-created"],
              },
              {
                id: "endpoint-ok",
                name: "OK endpoint",
                url: `http://127.0.0.1:${port}/ok`,
                enabled: true,
                eventKinds: ["site-updated"],
                headers: { "x-backy-smoke": "ok" },
              },
              {
                id: "endpoint-fail",
                name: "Fail endpoint",
                url: `http://127.0.0.1:${port}/fail`,
                enabled: true,
                eventKinds: ["site-updated"],
              },
              {
                id: "endpoint-deleted",
                name: "Deleted endpoint",
                url: `http://127.0.0.1:${port}/deleted`,
                enabled: true,
                eventKinds: ["site-deleted"],
              },
              {
                id: "endpoint-disabled",
                name: "Disabled endpoint",
                url: `http://127.0.0.1:${port}/disabled`,
                enabled: false,
                eventKinds: ["site-updated"],
              },
              {
                id: "endpoint-other-event",
                name: "Other event endpoint",
                url: `http://127.0.0.1:${port}/other-event`,
                enabled: true,
                eventKinds: ["comment-submitted"],
              },
            ],
          },
        },
      },
      kind: "site-updated",
      requestId: "site-webhook-smoke-request",
      actor: "admin-smoke",
      reason: "site.webhooks.updated",
      data: {
        changedSections: ["webhooks"],
      },
      metadata: {
        smoke: true,
      },
    });

    assert.equal(
      result.length,
      2,
      "Only enabled endpoints subscribed to site-updated should be delivered",
    );
    assert.equal(
      requests.length,
      2,
      "Only two webhook HTTP requests should be sent",
    );
    assert.equal(
      result.find((item) => item.endpointId === "endpoint-ok")?.status,
      "succeeded",
    );
    assert.equal(
      result.find((item) => item.endpointId === "endpoint-fail")?.status,
      "failed",
    );
    assert.equal(
      result.find((item) => item.endpointId === "endpoint-fail")?.statusCode,
      500,
    );

    const okRequest = requests.find((item) => item.url === "/ok");
    assert.ok(okRequest, "Expected OK endpoint request");
    assert.equal(okRequest.headers["x-backy-site-id"], "site-webhook-smoke");
    assert.equal(
      okRequest.headers["x-backy-site-webhook-event"],
      "site-updated",
    );
    assert.equal(
      okRequest.headers["x-backy-request-id"],
      "site-webhook-smoke-request",
    );
    assert.equal(
      okRequest.headers["x-backy-webhook-endpoint-id"],
      "endpoint-ok",
    );
    assert.equal(okRequest.headers["x-backy-smoke"], "ok");
    assert.equal(okRequest.body.schemaVersion, "backy.site-webhook.v1");
    assert.equal(okRequest.body.kind, "site-updated");
    assert.equal(okRequest.body.siteId, "site-webhook-smoke");
    assert.equal(okRequest.body.requestId, "site-webhook-smoke-request");
    assert.equal(okRequest.body.reason, "site.webhooks.updated");
    assert.deepEqual(okRequest.body.data, { changedSections: ["webhooks"] });

    assert.equal(
      records.length,
      4,
      "Each attempted endpoint should record queued and final delivery events",
    );
    assert.deepEqual(
      records.map((record) => record.action),
      ["site-updated", "site-updated", "site-updated", "site-updated"],
    );
    assert.deepEqual(records.map((record) => record.metadata?.status).sort(), [
      "failed",
      "queued",
      "queued",
      "succeeded",
    ]);
    assert.deepEqual(
      records.map((record) => record.metadata?.channel),
      ["site-webhook", "site-webhook", "site-webhook", "site-webhook"],
    );
    assert.equal(records[0]?.siteId, "site-webhook-smoke");
    assert.equal(records[0]?.actorId, "admin-smoke");
    assert.equal(records[0]?.requestId, "site-webhook-smoke-request");
    const succeededRecord = records.find(
      (record) => record.metadata?.status === "succeeded",
    );
    const failedRecord = records.find(
      (record) => record.metadata?.status === "failed",
    );
    assert.equal(succeededRecord?.metadata?.statusCode, 204);
    assert.equal(failedRecord?.metadata?.statusCode, 500);
    assert.equal(failedRecord?.metadata?.error, "Webhook returned 500");

    const frontendDesignResult = await deliverSiteWebhooks({
      repositories: repositories as never,
      site: {
        id: "site-webhook-smoke",
        name: "Site Webhook Smoke",
        slug: "site-webhook-smoke",
        status: "published",
        customDomain: "webhook-smoke.example.com",
        settings: {
          ...(DEFAULT_SITE_SETTINGS as unknown as SiteSettings),
          webhooks: {
            enabled: true,
            endpoints: [
              {
                id: "endpoint-frontend-design",
                name: "Frontend design endpoint",
                url: `http://127.0.0.1:${port}/frontend-design`,
                enabled: true,
                eventKinds: ["site-updated"],
              },
            ],
          },
        },
      },
      kind: "site-updated",
      requestId: "site-webhook-smoke-frontend-design-request",
      actor: "admin-smoke",
      reason: "frontendDesign.update",
      data: {
        before: {
          status: "draft",
          templates: [],
        },
        after: {
          status: "connected",
          templates: [{ id: "homepage", type: "page" }],
        },
      },
      metadata: {
        action: "frontendDesign.update",
        changedKeys: ["frontendDesign"],
        source: "admin-site-frontend-design-api",
        templateCount: 1,
        editableBindingCount: 3,
      },
    });

    assert.equal(frontendDesignResult.length, 1);
    assert.equal(frontendDesignResult[0]?.status, "succeeded");
    const frontendDesignRequest = requests.find(
      (item) => item.url === "/frontend-design",
    );
    assert.ok(
      frontendDesignRequest,
      "Expected frontend-design site-updated webhook delivery",
    );
    assert.equal(frontendDesignRequest.body.reason, "frontendDesign.update");
    assert.equal(
      frontendDesignRequest.headers["x-backy-site-webhook-event"],
      "site-updated",
    );
    assert.deepEqual(frontendDesignRequest.body.data, {
      before: {
        status: "draft",
        templates: [],
      },
      after: {
        status: "connected",
        templates: [{ id: "homepage", type: "page" }],
      },
    });

    const createdResult = await deliverSiteWebhooks({
      repositories: repositories as never,
      site: {
        id: "site-webhook-smoke",
        name: "Site Webhook Smoke",
        slug: "site-webhook-smoke",
        status: "published",
        customDomain: "webhook-smoke.example.com",
        settings: {
          ...(DEFAULT_SITE_SETTINGS as unknown as SiteSettings),
          webhooks: {
            enabled: true,
            endpoints: [
              {
                id: "endpoint-created",
                name: "Created endpoint",
                url: `http://127.0.0.1:${port}/created`,
                enabled: true,
                eventKinds: ["site-created"],
              },
            ],
          },
        },
      },
      kind: "site-created",
      requestId: "site-webhook-smoke-created-request",
      actor: "admin-smoke",
      reason: "site.created",
      data: {
        after: { id: "site-webhook-smoke" },
      },
      metadata: {
        lifecycle: "created",
      },
    });
    const deletedResult = await deliverSiteWebhooks({
      repositories: repositories as never,
      site: {
        id: "site-webhook-smoke",
        name: "Site Webhook Smoke",
        slug: "site-webhook-smoke",
        status: "published",
        customDomain: "webhook-smoke.example.com",
        settings: {
          ...(DEFAULT_SITE_SETTINGS as unknown as SiteSettings),
          webhooks: {
            enabled: true,
            endpoints: [
              {
                id: "endpoint-deleted",
                name: "Deleted endpoint",
                url: `http://127.0.0.1:${port}/deleted`,
                enabled: true,
                eventKinds: ["site-deleted"],
              },
            ],
          },
        },
      },
      kind: "site-deleted",
      requestId: "site-webhook-smoke-deleted-request",
      actor: "admin-smoke",
      reason: "site.deleted",
      data: {
        before: { id: "site-webhook-smoke" },
      },
      metadata: {
        lifecycle: "deleted",
      },
    });

    assert.equal(createdResult.length, 1);
    assert.equal(createdResult[0]?.status, "succeeded");
    assert.equal(deletedResult.length, 1);
    assert.equal(deletedResult[0]?.status, "succeeded");
    assert.ok(
      requests.some(
        (item) =>
          item.url === "/created" &&
          item.headers["x-backy-site-webhook-event"] === "site-created" &&
          item.body.reason === "site.created",
      ),
      "Expected site-created lifecycle webhook delivery",
    );
    assert.ok(
      requests.some(
        (item) =>
          item.url === "/deleted" &&
          item.headers["x-backy-site-webhook-event"] === "site-deleted" &&
          item.body.reason === "site.deleted",
      ),
      "Expected site-deleted lifecycle webhook delivery",
    );

    console.log(
      JSON.stringify({
        ok: true,
        contract: "backy.site-webhook.v1",
        delivered: result.map((item) => ({
          endpointId: item.endpointId,
          status: item.status,
        })),
        lifecycle: [
          ...createdResult.map((item) => ({
            endpointId: item.endpointId,
            status: item.status,
          })),
          ...deletedResult.map((item) => ({
            endpointId: item.endpointId,
            status: item.status,
          })),
        ],
        frontendDesign: frontendDesignResult.map((item) => ({
          endpointId: item.endpointId,
          status: item.status,
        })),
        recordedEvents: records.length,
      }),
    );
  } finally {
    if (didListen) {
      await close();
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
