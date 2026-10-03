import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
const cwd = process.cwd(),
  scratch = mkdtempSync(join(tmpdir(), "backy-reusable-products-"));
process.chdir(scratch);
process.env.BACKY_DATA_MODE = "demo";
process.env.NODE_ENV = "test";
process.env.BACKY_ADMIN_API_KEY = "reusable-product-test-key";
try {
  const storeModule = await import("../src/lib/backyStore.ts");
  const store = storeModule.default || storeModule;
  const section = store.createReusableSection("site-demo", {
    name: "Reusable product fixture",
    slug: "reusable-product-fixture",
    content: {
      elements: [
        {
          id: "source-heading",
          type: "heading",
          x: 0,
          y: 0,
          width: 840,
          height: 100,
          props: { content: "Updated source", fontFamily: "Georgia" },
          responsive: { mobile: { width: 320 } },
        },
      ],
    },
  });
  const collection = store.createAdminCollection("site-demo", {
    name: "Products",
    slug: "products",
    fields: [],
    status: "published",
  });
  const original = {
    title: "Catalog title",
    price: 29,
    inventory: 3,
    frontendDesignTokens: { fonts: { body: "monospace" } },
    frontendDesignChrome: { header: { id: "header" } },
    frontendDesignEditableMap: { title: "props.content" },
    frontendDesignDataBindings: { title: "product.title" },
    frontendDesignMetadata: { ownerMarker: "keep" },
    frontendDesignElements: [
      {
        id: "instance",
        type: "heading",
        x: 600,
        y: 710,
        width: 900,
        height: 100,
        zIndex: 3,
        props: {
          content: "Old source",
          reusableSection: {
            mode: "synced",
            sectionId: section.id,
            sourceUpdatedAt: "old",
          },
        },
      },
    ],
    frontendDesignContentDocument: {
      schemaVersion: "backy.content.v1",
      metadata: {
        canvasSize: { width: 1200, height: 1800 },
        customField: "keep",
      },
      elements: [],
    },
    frontendDesignCanvasSize: { width: 1200, height: 1800 },
  };
  const product = store.createAdminCollectionRecord(
    "site-demo",
    collection.id,
    {
      slug: "reusable-product",
      status: "archived",
      values: {
        ...original,
        design: {
          elements: structuredClone(original.frontendDesignElements),
          frontendDesignElements: structuredClone(
            original.frontendDesignElements,
          ),
          contentDocument: structuredClone(
            original.frontendDesignContentDocument,
          ),
          frontendDesignContentDocument: structuredClone(
            original.frontendDesignContentDocument,
          ),
          customEnvelopeField: "keep",
        },
      },
    },
  );
  assert(product);
  const routeModule =
    await import("../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts");
  const route = routeModule.default || routeModule;
  const params = {
    params: Promise.resolve({ siteId: "site-demo", sectionId: section.id }),
  };
  const url = `http://localhost/api/admin/sites/site-demo/reusable-sections/${section.id}/instances`;
  const request = (method = "GET", body?: unknown, auth = true) =>
    new NextRequest(url, {
      method,
      headers: {
        ...(auth ? { authorization: "Bearer reusable-product-test-key" } : {}),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await route.GET(request("GET", undefined, false), params)).status,
    401,
  );
  const sessionsModule = await import("../src/lib/admin-auth/sessionStore.ts");
  const sessions = sessionsModule.default || sessionsModule;
  const user = {
    id: "product-permissions-owner",
    email: "product-permissions@example.com",
    fullName: "Test owner",
    role: "owner" as const,
    status: "active" as const,
  };
  const session = sessions.createAdminSessionForExternalUser(
    user,
    "supabase",
    { sessionTimeoutMinutes: 120 },
    { persist: false },
  );
  const sessionRequest = (method = "GET", body?: unknown) =>
    new NextRequest(url + (method === "GET" ? "?targetType=product" : ""), {
      method,
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  for (const denied of ["collections.view", "commerce.view"]) {
    sessions.updateAdminSessionPermissionOverrides(user.id, [
      {
        userId: user.id,
        permissionKey: denied,
        value: "deny",
        updatedAt: new Date().toISOString(),
      },
    ]);
    assert.equal(
      (await route.GET(sessionRequest(), params)).status,
      403,
      `${denied} must protect product reads`,
    );
    const allRequest = new NextRequest(url, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const allResponse = await route.GET(allRequest, params);
    assert.equal(allResponse.status, 200);
    assert.equal(
      (await allResponse.json()).data.totals.instances,
      0,
      "Page readers cannot discover denied products through all",
    );
  }
  for (const denied of ["collections.edit", "commerce.edit"]) {
    sessions.updateAdminSessionPermissionOverrides(user.id, [
      {
        userId: user.id,
        permissionKey: denied,
        value: "deny",
        updatedAt: new Date().toISOString(),
      },
    ]);
    assert.equal(
      (
        await route.POST(
          sessionRequest("POST", { targetType: "product" }),
          params,
        )
      ).status,
      403,
      `${denied} must protect product refresh`,
    );
    const allResponse = await route.POST(sessionRequest("POST", {}), params);
    assert.equal(allResponse.status, 200);
    assert.equal(
      (await allResponse.json()).data.totals.instances,
      0,
      "All refresh cannot change denied products",
    );
  }
  sessions.revokeAdminSession(session.token, { persist: false });
  const listed = await route.GET(request(), params);
  assert.equal(listed.status, 200);
  const report = (await listed.json()).data;
  assert.equal(
    report.totals.instances,
    1,
    "Synced product instance must be discoverable",
  );
  assert.equal(report.targets[0].type, "product");
  assert.equal(report.totals.stale, 1);
  const dry = await route.POST(
    request("POST", {
      targetType: "product",
      targetId: product.id,
      dryRun: true,
    }),
    params,
  );
  assert.equal(dry.status, 200);
  assert.equal((await dry.json()).data.totals.instances, 1);
  assert.deepEqual(
    store.getCollectionRecordByIdOrSlug(
      "site-demo",
      collection.id,
      product.id,
      { includeUnpublished: true },
    )?.values,
    product.values,
    "Dry run cannot write",
  );
  const refresh = await route.POST(
    request("POST", { targetType: "product", targetId: product.id }),
    params,
  );
  assert.equal(refresh.status, 200);
  assert.equal((await refresh.json()).data.totals.instances, 1);
  const updated = store.getCollectionRecordByIdOrSlug(
    "site-demo",
    collection.id,
    product.id,
    { includeUnpublished: true },
  );
  assert(updated);
  assert.equal(updated.status, "archived");
  const values = updated.values as any;
  const heading = values.frontendDesignElements[0];
  assert.equal(heading.width, 840);
  assert.equal(
    values.design.elements[0].width,
    840,
    "Authoring envelope must agree with refreshed aliases",
  );
  assert.deepEqual(
    values.design.frontendDesignElements,
    values.design.elements,
  );
  assert.deepEqual(
    values.design.contentDocument.elements,
    values.design.elements,
  );
  assert.deepEqual(
    values.design.frontendDesignContentDocument.elements,
    values.design.elements,
  );
  assert.equal(values.design.customEnvelopeField, "keep");

  assert.equal(heading.x, 600);
  assert.equal(heading.y, 710);
  assert.equal(heading.id, "instance");
  assert.equal(heading.zIndex, 3);
  assert.equal(heading.props.fontFamily, "Georgia");
  assert.equal(heading.responsive.mobile.width, 320);
  assert.deepEqual(
    values.frontendDesignContentDocument.elements,
    values.frontendDesignElements,
  );
  assert.equal(
    values.frontendDesignContentDocument.metadata.customField,
    "keep",
  );
  for (const key of [
    "title",
    "price",
    "inventory",
    "frontendDesignTokens",
    "frontendDesignChrome",
    "frontendDesignEditableMap",
    "frontendDesignDataBindings",
    "frontendDesignMetadata",
    "frontendDesignCanvasSize",
  ])
    assert.deepEqual(
      values[key],
      product.values[key],
      `${key} must survive propagation`,
    );
  assert.equal(
    (await (await route.GET(request(), params)).json()).data.totals.stale,
    0,
  );
  const runtimeModule = await import("../src/lib/repositoryRuntime.ts");
  const runtime = runtimeModule.default || runtimeModule;
  const dbRecord = { ...product, values: structuredClone(product.values) };
  const detached = {
    ...product,
    id: "detached-product",
    values: {
      ...structuredClone(product.values),
      frontendDesignElements: [
        {
          ...original.frontendDesignElements[0],
          props: {
            ...original.frontendDesignElements[0].props,
            reusableSection: { mode: "detached", sectionId: section.id },
          },
        },
      ],
    },
  };
  // Detaching through the editor updates the authoritative design envelope too.
  (detached.values as any).design.elements[0].props.reusableSection.mode = "detached";
  (detached.values as any).design.frontendDesignElements[0].props.reusableSection.mode = "detached";
  let writes = 0,
    mediaReads = 0,
    invalidations = 0;
  const offsets: number[] = [];
  const site = store.getSiteByIdOrSlug("site-demo");
  assert(site);
  process.env.BACKY_DATA_MODE = "database";
  runtime.setPublicRepositoryRuntimeForTests({
    mode: "database",
    repositories: {
      sites: {
        getById: async (id: string) => (id === site.id ? site : null),
        getBySlug: async () => null,
      },
      reusableSections: {
        getById: async (siteId: string, id: string) =>
          siteId === site.id && id === section.id ? section : null,
        getBySlug: async () => null,
      },
      pages: { list: async () => ({ items: [] }) },
      posts: { list: async () => ({ items: [] }) },
      collections: {
        getBySlug: async (siteId: string, slug: string) => {
          assert.equal(siteId, site.id);
          assert.equal(slug, "products");
          return collection;
        },
        listRecords: async (input: {
          siteId: string;
          collectionId: string;
          offset: number;
        }) => {
          assert.equal(input.siteId, site.id);
          assert.equal(input.collectionId, collection.id);
          offsets.push(input.offset);
          return {
            items: input.offset === 0 ? [detached] : [dbRecord],
            pagination: { hasMore: input.offset === 0 },
          };
        },
        updateRecord: async (
          siteId: string,
          collectionId: string,
          id: string,
          input: { values: any },
        ) => {
          assert.equal(siteId, site.id);
          assert.equal(collectionId, collection.id);
          assert.equal(id, dbRecord.id);
          writes++;
          dbRecord.values = input.values;
          return { entity: dbRecord };
        },
      },
      media: {
        list: async () => {
          mediaReads++;
          return { items: [] };
        },
      },
      cacheInvalidations: {
        record: async (input: any) => {
          invalidations++;
          return { ...input, revision: 1, createdAt: new Date().toISOString() };
        },
      },
      auditLogs: {
        record: async (input: any) => ({
          ...input,
          id: "test-audit",
          createdAt: new Date().toISOString(),
        }),
      },
    } as never,
  });
  try {
    const listing = await route.GET(request(), params);
    assert.equal(listing.status, 200);
    assert.equal((await listing.json()).data.totals.instances, 1);
    assert.deepEqual(
      offsets,
      [0, 1],
      "Discovery must include later product pages and ignore detached instances",
    );
    const preview = await route.POST(
      request("POST", {
        targetType: "product",
        targetId: product.id,
        dryRun: true,
      }),
      params,
    );
    assert.equal(preview.status, 200);
    assert.equal(writes, 0);
    const result = await route.POST(
      request("POST", { targetType: "product", targetId: product.id }),
      params,
    );
    assert.equal(result.status, 200);
    assert.equal(writes, 1);
    assert.equal(mediaReads, 1);
    assert.equal(invalidations, 1);
    assert.equal((dbRecord.values as any).frontendDesignElements[0].width, 840);
    assert.equal(dbRecord.values.price, 29);
    assert.equal(dbRecord.status, "archived");
    const outside = await route.GET(
      new NextRequest(url.replace("/site-demo/", "/outside-site/"), {
        headers: { authorization: "Bearer reusable-product-test-key" },
      }),
      {
        params: Promise.resolve({
          siteId: "outside-site",
          sectionId: section.id,
        }),
      },
    );
    assert.equal(outside.status, 404);
  } finally {
    runtime.resetPublicRepositoryRuntimeForTests();
  }
  console.log(
    "Reusable product discovery, dry run, refresh, placement, design preservation and anonymous denial passed.",
  );
} finally {
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
