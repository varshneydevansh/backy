import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { assertMigrationContract } from "./component-migration-contract.mts";
const require = createRequire(import.meta.url),
  cwd = process.cwd(),
  scratch = mkdtempSync(join(tmpdir(), "backy-migration-props-"));
process.chdir(scratch);
let checks = 0;
try {
  const sm: any = await import("../src/lib/backyStore.ts"),
    store = sm.default || sm;
  const pm: any = await import("../src/lib/componentMigrationProps.ts"),
    props = pm.default || pm;
  const im: any = await import("../src/lib/interactiveComponentInventory.ts"),
    inventory = im.default || im;
  for (const demo of [true, false]) {
    const site = store.createAdminSite({
      name: "Props admission",
      slug: "props-" + demo,
    });
    const schema = {
      type: "object",
      properties: {
        count: { type: "integer", minimum: 0 },
        flags: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
        },
      },
      required: ["count"],
      additionalProperties: false,
    };
    store.createInteractiveComponent(site.id, {
      componentKey: "fixture.props",
      version: "2.0.0",
      displayName: "Props target",
      status: "active",
      reviewStatus: "approved",
      type: "interactiveFigure",
      source: "registry",
      renderMode: "static-fallback",
      dependencyMetadata: { propsSchema: schema },
    });
    const rich = (count: any) => ({
      elements: [
        {
          id: "rich",
          type: "paragraph",
          props: {
            content: [
              {
                type: "interactive_component",
                componentKey: "fixture.props",
                version: "1.0.0",
                props: { count, flags: { enabled: false } },
                propsSchema: { properties: { count: { type: "string" } } },
                fallback: { text: "Private content must not leak" },
                children: [{ text: "" }],
              },
            ],
          },
        },
      ],
    });
    const canvas = {
      elements: [
        {
          id: "canvas",
          type: "interactiveFigure",
          props: {
            componentKey: "fixture.props",
            version: "1.0.0",
            count: 0,
            flags: { enabled: false },
            title: "Canvas title",
            fallback: { text: "Keep fallback" },
            controls: [
              {
                key: "count",
                type: "text",
                value: 0,
                unknownControl: { keep: [false, 0] },
              },
            ],
            propsSchema: { properties: { count: { type: "string" } } },
          },
        },
      ],
    };
    const page = store.createAdminPage(site.id, {
      title: "Valid page",
      slug: "valid-page",
      content: canvas,
    });
    const post = store.createAdminBlogPost(site.id, {
      title: "Invalid post",
      slug: "invalid-post",
      content: rich("PRIVATE_OLD_STRING"),
    });
    let writes = 0,
      reads = 0,
      deny = 0;
    const list = (items: any[], p: any) => ({
      items: items.slice(p.offset, p.offset + p.limit),
      pagination: {
        total: items.length,
        offset: p.offset,
        limit: p.limit,
        hasMore: p.offset + p.limit < items.length,
      },
    });
    const repos: any = {
      sites: {
        getById: async () => {
          reads++;
          return store.getSiteByIdOrSlug(site.id);
        },
        getBySlug: async () => store.getSiteByIdOrSlug(site.id),
      },
      interactiveComponents: {
        getByKeyVersion: async (s: any, k: any, v: any) =>
          store.getInteractiveComponent(s, k, v),
      },
      pages: {
        list: async (p: any) =>
          list(store.listAdminPages(site.id, { includeUnpublished: true }), p),
        update: async (s: any, id: any, p: any) => {
          writes++;
          return { item: store.updateAdminPage(s, id, p) };
        },
      },
      posts: {
        list: async (p: any) => {
          const d = store.getBlogPosts(site.id, {
            includeUnpublished: true,
            limit: p.limit,
            offset: p.offset,
          });
          return { items: d.posts, pagination: d.pagination };
        },
        update: async (s: any, id: any, p: any) => {
          writes++;
          return { item: store.updateAdminBlogPost(s, id, p) };
        },
      },
      auditLogs: { record: async () => {} },
      cacheInvalidations: { record: async () => ({}) },
    };
    const mocks: any = {
      "next/server": { NextResponse },
      "@/lib/componentMigrationProps": props,
      "@/lib/interactiveComponentInventory": inventory,
      "@/lib/backyStore": {
        ...store,
        updateAdminPage: (...args: any[]) => {
          writes++;
          return store.updateAdminPage(...args);
        },
        updateAdminBlogPost: (...args: any[]) => {
          writes++;
          return store.updateAdminBlogPost(...args);
        },
      },
      "@/lib/repositoryRuntime": {
        shouldUseDemoStoreFallback: () => demo,
        getRequiredDatabaseRepositories: async () => repos,
      },
      "@/lib/adminAccess": {
        requireAdminAccess: async (_request: any, requestId: string) =>
          deny
            ? NextResponse.json(
                {
                  success: false,
                  requestId,
                  error: { code: "FORBIDDEN", message: "Fixture denied" },
                },
                { status: deny },
              )
            : { session: { user: { id: "fixture" } } },
      },
      "@/lib/siteWebhookDelivery": { deliverSiteWebhooks: async () => [] },
    };
    const file = fileURLToPath(
        new URL(
          "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/migrate/route.ts",
          import.meta.url,
        ),
      ),
      module = { exports: {} as any };
    vm.runInNewContext(
      ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        Request,
        Response,
        Headers,
        URL,
        Buffer,
        console: { error() {} },
        require: (id: string) => (id in mocks ? mocks[id] : require(id)),
      },
    );
    async function call(body: any, status: number) {
      const response = await module.exports.POST(
        new Request(
          "http://fixture.invalid/api/admin/sites/" +
            site.id +
            "/interactive-components/fixture.props/1.0.0/migrate",
          {
            method: "POST",
            body: JSON.stringify({ targetVersion: "2.0.0", ...body }),
          },
        ),
        {
          params: Promise.resolve({
            siteId: site.id,
            componentKey: "fixture.props",
            version: "1.0.0",
          }),
        },
      );
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      assertMigrationContract(status, result);
      checks++;
      return result;
    }
    for (const policy of [
      { status: "disabled", reviewStatus: "approved" },
      { status: "active", reviewStatus: "draft" },
      { status: "active", reviewStatus: "rejected" },
    ]) {
      store.updateInteractiveComponent(
        site.id,
        "fixture.props",
        "2.0.0",
        policy,
      );
      const refused = await call({ dryRun: false }, 422);
      assert.equal(refused.error.code, "TARGET_COMPONENT_NOT_READY");
      assert.equal(writes, 0);
      checks += 2;
    }
    store.updateInteractiveComponent(site.id, "fixture.props", "2.0.0", {
      status: "active",
      reviewStatus: "approved",
    });
    for (const dryRun of [true, false]) {
      const denied = await call({ dryRun }, 422);
      assert.equal(denied.error.code, "MIGRATION_PROPS_INCOMPATIBLE");
      assert.equal(writes, 0);
      assert.equal(
        store.getAdminPageById(site.id, page.id).content.elements[0].props
          .version,
        "1.0.0",
      );
      assert(
        denied.error.details.findings.some(
          (f: any) =>
            f.targetType === "post" &&
            f.targetId === post.id &&
            f.elementPath.includes("props.content[0]") &&
            f.instancePath === "/count" &&
            f.keyword === "type",
        ),
      );
      assert(!JSON.stringify(denied).includes("PRIVATE_OLD_STRING"));
      checks += 4;
    }
    store.updateAdminBlogPost(site.id, post.id, { content: rich(2) });
    const preview = await call({ dryRun: true }, 200);
    assert.equal(writes, 0);
    assert.equal(preview.data.summary.targets, 2);
    checks += 2;
    store.updateInteractiveComponent(site.id, "fixture.props", "2.0.0", {
      dependencyMetadata: {
        propsSchema: {
          ...schema,
          properties: {
            ...schema.properties,
            count: { type: "integer", maximum: 1 },
          },
        },
      },
    });
    const stale = await call(
      { dryRun: false, reviewedPreview: preview.data.reviewedPreview },
      409,
    );
    assert.equal(stale.error.code, "MIGRATION_PREVIEW_CONFLICT");
    assert.equal(writes, 0);
    checks += 2;
    await call({ dryRun: false }, 422);
    assert.equal(writes, 0);
    checks++;
    store.updateInteractiveComponent(site.id, "fixture.props", "2.0.0", {
      dependencyMetadata: { propsSchema: schema },
    });
    const fresh = await call({ dryRun: true }, 200);
    await call(
      { dryRun: false, reviewedPreview: fresh.data.reviewedPreview },
      200,
    );
    assert.equal(writes, 2);
    const persisted = store.getAdminBlogPostById(site.id, post.id).content
      .elements[0].props.content[0];
    assert.equal(persisted.version, "2.0.0");
    assert.equal(persisted.props.count, 2);
    assert.equal(persisted.props.flags.enabled, false);
    checks += 4;
    assert.deepEqual(persisted.propsSchema, schema);
    const canvasProps = store.getAdminPageById(site.id, page.id).content
      .elements[0].props;
    assert.deepEqual(canvasProps.propsSchema, schema);
    assert.equal(canvasProps.count, 0);
    assert.equal(canvasProps.flags.enabled, false);
    assert.deepEqual(canvasProps.fallback, { text: "Keep fallback" });
    assert.equal(canvasProps.title, "Canvas title");
    const countControl = canvasProps.controls.find(
      (control: any) => control.key === "count",
    );
    assert.equal(countControl.type, "number");
    assert.equal(countControl.min, 0);
    assert.equal(countControl.step, 1);
    assert.equal(countControl.value, 0);
    assert.deepEqual(countControl.unknownControl, { keep: [false, 0] });
    checks += 11;
    for (const status of [401, 403]) {
      deny = status;
      const previous = reads;
      await call({ dryRun: true }, status);
      assert.equal(reads, previous);
      assert.equal(writes, 2);
      checks += 2;
    }
    const invalid = props.componentMigrationPropsFindings(
      [{ type: "page", id: "page", content: rich(1) }],
      "fixture.props",
      "1.0.0",
      {
        dependencyMetadata: {
          propsSchema: { $ref: "https://private.example.test/schema" },
        },
      },
    );
    assert.equal(invalid[0].keyword, "unsupported-target-schema");
    assert(!JSON.stringify(invalid).includes("private.example"));
    checks += 2;
    const bounded = props.componentMigrationPropsFindings(
      [
        {
          type: "page",
          id: "many",
          content: {
            elements: Array.from(
              { length: 1000 },
              () => rich("value").elements[0],
            ),
          },
        },
      ],
      "fixture.props",
      "1.0.0",
      { dependencyMetadata: { propsSchema: schema } },
    );
    assert.equal(bounded.length, 64);
    checks++;
  }
  console.log(
    `Component target-schema actual-handler/AJV admission passed ${checks} checks: both stores, canvas/rich nested props, no coercion or partial writes, safe precise findings, invalid schema, bounded reports, authoritative metadata drift409, valid exact apply and early auth denials. Repository adapter fixture; no provider.`,
  );
} finally {
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
