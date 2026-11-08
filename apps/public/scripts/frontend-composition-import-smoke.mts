import assert from "node:assert/strict";
import Ajv from "ajv";
const compositionContractModule: any = await import("../src/lib/frontendCompositionOpenApi.ts");
const { frontendCompositionSchemas } = compositionContractModule.default || compositionContractModule;
const contractAjv = new Ajv({ strict: false });
contractAjv.addSchema({ components: { schemas: frontendCompositionSchemas } }, 'composition-contract');
const reviewContract = contractAjv.compile({ $ref: 'composition-contract#/components/schemas/FrontendCompositionReviewEnvelope' });
const applyContract = contractAjv.compile({ $ref: 'composition-contract#/components/schemas/FrontendCompositionApplyEnvelope' });
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { fixture } from "./admin-access-test-fixtures.mts";
import { load } from "./collection-import-postgres-handlers.mjs";
const scratch = mkdtempSync(join(tmpdir(), "backy-composition-test-")),
  cwd = process.cwd();
process.chdir(scratch);
const imported: any = await import("../src/lib/backyStore.ts"),
  store = imported.default || imported;
const helperModule: any =
    await import("../src/lib/frontendCompositionImport.ts"),
  helper = helperModule.default || helperModule;
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const site = store.createAdminSite({
  slug: "composition-proof",
  name: "Composition proof",
});
const tree = {
  elements: [
    {
      id: "hero",
      type: "section",
      x: 0,
      y: 0,
      width: 1200,
      height: 400,
      props: { layoutMode: "flow" },
      children: [
        {
          id: "title",
          type: "text",
          x: 12,
          y: 20,
          width: 500,
          height: 80,
          props: {
            content: "Concrete imported title",
            schema: { unknown: { retain: [false, 0] } },
          },
          responsive: { mobile: { x: 0, width: 375 } },
          children: [],
        },
      ],
      extension: { nested: { retain: true } },
    },
  ],
  canvasSize: { width: 1200, height: 600 },
  editableMap: {
    title: { elementId: "title", path: "props.content", type: "text" },
  },
  frontendRevision: { schemaVersion: "external.v3", revision: 7 },
};
const composition = {
  schemaVersion: "backy.frontend-composition-import.v1",
  siteId: site.id,
  unknownPackage: { retain: true },
  frontendDesign: {
    schemaVersion: "backy.frontend-design.v1",
    status: "imported",
    source: { type: "manual", extension: { retain: true } },
    tokens: { colors: { primary: "#0f766e" }, extension: { retain: true } },
    chrome: {},
    extension: { nested: [false, 0] },
    templates: [
      {
        id: "guided-proof-template",
        name: "Proof template",
        type: "page",
        version: "2.0",
        content: tree,
        unknownTemplate: { retain: true },
      },
    ],
  },
  routes: [
    {
      id: "parent",
      type: "page",
      title: "Proof parent",
      path: "/proof",
      content: tree,
      templateId: "guided-proof-template",
      unknownRoute: { retain: true },
    },
    {
      id: "child",
      type: "page",
      title: "Proof child",
      path: "/proof/child",
      content: {
        ...tree,
        elements: [
          {
            id: "child-text",
            type: "text",
            props: { content: "Nested child" },
            children: [],
          },
        ],
        editableMap: {},
      },
    },
    {
      id: "article",
      type: "blogPost",
      title: "Proof article",
      path: "/blog/proof-post",
      content: tree,
      meta: { extension: { nested: { retain: true } } },
    },
  ],
};
const selection = [
  "design",
  "template:guided-proof-template",
  "route:parent",
  "route:child",
  "route:article",
];
let denied = 0,
  checks = 0;
const permissions: string[] = [];
const mocks: any = {
  "next/server": { NextResponse },
  "@/lib/frontendCompositionImport": helper,
  "@/lib/backyStore": store,
  "@/lib/adminAudit": { recordAdminAudit: async () => ({}) },
  "@/lib/adminAccess": {
    requireAdminAccess: async (_r: any, _id: any, options: any) => {
      permissions.push(options.permission);
      return denied
        ? NextResponse.json({ success: false }, { status: denied })
        : { session: { user: { id: "synthetic-owner" } } };
    },
  },
  "@/lib/repositoryRuntime": { shouldUseDemoStoreFallback: () => true },
};
const route = load(
  "../src/app/api/admin/sites/[siteId]/frontend-design/composition-import/route.ts",
  mocks,
);
async function call(body: any) {
  const response = await route.POST(
    new NextRequest(
      `http://fixture.invalid/api/admin/sites/${site.slug}/frontend-design/composition-import`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ siteId: site.slug }) },
  );
  const payload = await response.json();
  if (response.status === 200 || response.status === 201) {
    const validate = response.status === 200 ? reviewContract : applyContract;
    assert.equal(validate(payload), true, JSON.stringify(validate.errors));
  }
  return {
    status: response.status,
    body: payload,
    cache: response.headers.get("cache-control"),
  };
}
const body = {
  action: "review",
  composition,
  selection,
  acknowledgeUnverified: false,
};
try {
  const before = store.getPageSummary(site.id, {
      includeUnpublished: true,
    }).length,
    designBefore = clone(
      store.getSiteByIdOrSlug(site.id).settings.frontendDesign,
    );
  const review = await call(body);
  assert.equal(review.status, 200, JSON.stringify(review.body));
  assert.equal(
    review.body.data.canApply,
    true,
    JSON.stringify(review.body.data.issues),
  );
  assert.equal(review.cache, "private, no-store");
  assert.equal(
    store.getPageSummary(site.id, { includeUnpublished: true }).length,
    before,
  );
  assert.deepEqual(
    store.getSiteByIdOrSlug(site.id).settings.frontendDesign,
    designBefore,
  );
  assert.deepEqual(permissions, ["sites.view"]);
  checks += 6;
  const token = review.body.data.reviewVersion;
  const changed = await call({
    ...body,
    action: "apply",
    selection: selection.slice(1),
    reviewVersion: token,
  });
  assert.equal(changed.status, 409);
  assert.equal(
    store.getPageSummary(site.id, { includeUnpublished: true }).length,
    before,
  );
  checks += 2;
  const applied = await call({
    ...body,
    action: "apply",
    reviewVersion: token,
  });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  assert.equal(applied.body.data.drafts.length, 3);
  assert.equal(applied.body.data.siteId, site.id);
  assert.equal(applied.body.data.publication, "draft-only");
  checks += 4;
  const [parent, child, article] = applied.body.data.drafts;
  const p = store.getAdminPageById(site.id, parent.id),
    c = store.getAdminPageById(site.id, child.id),
    post = store.getAdminBlogPostById(site.id, article.id);
  assert.equal(c.parentId, parent.id);
  assert.equal(p.status, "draft");
  assert.equal(post.status, "draft");
  assert.equal(p.content.contentDocument.id, parent.id);
  assert.deepEqual(p.content.elements[0].extension, tree.elements[0].extension);
  assert.deepEqual(
    p.content.contentDocument.frontendRevision,
    tree.frontendRevision,
  );
  assert.deepEqual(p.meta.frontendCompositionImport.routeExtensions, {
    unknownRoute: { retain: true },
  });
  assert.deepEqual(post.meta.extension, { nested: { retain: true } });
  checks += 8;
  const design = store.getSiteByIdOrSlug(site.id).settings.frontendDesign;
  assert.deepEqual(design.extension, composition.frontendDesign.extension);
  assert.deepEqual(design.tokens.extension, { retain: true });
  assert.deepEqual(
    design.templates.find((t: any) => t.id === "guided-proof-template")
      .unknownTemplate,
    { retain: true },
  );
  assert(
    store.listTemplateRevisions(site.id, "guided-proof-template").items.length >
      0,
  );
  checks += 4;
  const persisted = JSON.parse(
    readFileSync(join(scratch, "data/backy/admin-content.json"), "utf8"),
  );
  assert(
    persisted.pages.some(
      (page: any) =>
        page.id === parent.id &&
        page.content.elements[0].children[0].responsive.mobile.width === 375,
    ),
  );
  assert(
    persisted.blogPosts.some(
      (post: any) => post.id === article.id && post.status === "draft",
    ),
  );
  checks += 2;
  assert.equal(
    (await call({ ...body, action: "apply", reviewVersion: token })).status,
    409,
  );
  checks++;
  for (const status of [401, 403]) {
    denied = status;
    assert.equal((await call(body)).status, status);
    checks++;
  }
  denied = 0;

  for (const bad of [
    {
      ...body,
      composition: {
        ...composition,
        routes: Array(49).fill(composition.routes[0]),
      },
    },
    {
      ...body,
      composition: {
        ...composition,
        frontendDesign: {
          ...composition.frontendDesign,
          templates: [
            {
              ...composition.frontendDesign.templates[0],
              type: "silently-coerced",
            },
          ],
        },
      },
    },
  ]) {
    assert.equal((await call(bad)).status, 400);
    checks++;
  }
  const blocked = helper.parseFrontendCompositionRequest({
    ...body,
    selection: ["route:parent"],
    composition: {
      ...composition,
      routes: [
        {
          ...composition.routes[0],
          path: "/blocked",
          content: { ...tree, customJS: "alert(1)" },
        },
      ],
    },
  });
  const blockedReview = helper.reviewFrontendComposition(
    blocked.request,
    helper.readDemoCompositionInventory(site.id),
  );
  assert.equal(
    (
      await call({
        ...blocked.request,
        action: "apply",
        reviewVersion: blockedReview.reviewVersion,
      })
    ).status,
    422,
  );
  checks++;
  const reserved = helper.parseFrontendCompositionRequest(
    clone({
      ...body,
      composition: {
        ...composition,
        routes: [
          {
            ...composition.routes[0],
            path: "/sites/proof",
            templateId: undefined,
          },
        ],
      },
      selection: ["route:parent"],
    }),
  );
  const reservedReview = helper.reviewFrontendComposition(
    reserved.request,
    helper.readDemoCompositionInventory(site.id),
  );
  assert(
    reservedReview.issues.some((issue: any) => issue.code === "route.reserved"),
  );
  assert.equal(reservedReview.canApply, false);
  checks += 2;
  const inv = helper.readDemoCompositionInventory(site.id);
  for (const mutate of [
    (p: any) => {
      p.siteId = "foreign";
    },
    (p: any) => {
      p.routes[0].content.elements[0].children[0].id = "hero";
    },
    (p: any) => {
      p.routes[0].content.customJS = 'fetch("secret")';
    },
    (p: any) => {
      p.routes[0].content.elements[0].props.mediaId = "foreign";
    },
    (p: any) => {
      p.routes[0].content.editableMap.title.elementId = "missing";
    },
    (p: any) => {
      p.routes[0].content.elements[0].children[0].props = {
        componentKey: "missing",
        version: "1",
      };
    },
  ]) {
    const pkg = clone(composition);
    pkg.routes[0].path = "/new-proof";
    mutate(pkg);
    const parsed = helper.parseFrontendCompositionRequest({
      ...body,
      composition: pkg,
      selection: ["route:parent"],
    });
    assert.equal(
      helper.reviewFrontendComposition(parsed.request, inv, parsed.issues)
        .canApply,
      false,
    );
    checks++;
  }
  for (const key of ["fontMediaId", "posterMediaId", "fileMediaId"]) {
    const pkg = clone(composition);
    pkg.routes[0].path = "/new-proof";
    pkg.routes[0].content.elements[0].children[0].props[key] = "foreign-reference";
    const parsed = helper.parseFrontendCompositionRequest({ ...body, composition: pkg, selection: ["route:parent"] });
    const reviewed = helper.reviewFrontendComposition(parsed.request, inv, parsed.issues);
    assert.equal(reviewed.canApply, false);
    assert(reviewed.issues.some((issue: any) => issue.code === "media.unresolved" && issue.path.endsWith("/" + key)));
    checks += 2;
    const own = clone(inv);
    own.media.push({ id: "own-media", siteId: site.id });
    pkg.routes[0].content.elements[0].children[0].props[key] = "own-media";
    const allowed = helper.parseFrontendCompositionRequest({ ...body, composition: pkg, selection: ["route:parent"] });
    const ownReview = helper.reviewFrontendComposition(allowed.request, own, allowed.issues);
    assert.equal(ownReview.canApply, true, JSON.stringify(ownReview.issues));
    assert.equal(allowed.request.composition.routes[0].content.elements[0].children[0].props[key], "own-media");
    checks += 2;
  }
  const secret = clone(composition);
  secret.routes[0].path = "/redacted-proof";
  secret.routes[0].content.apiKey = "NEVER-ECHO-THIS";
  secret.routes[0].content.tokenCount = 12;
  const redacted = helper.parseFrontendCompositionRequest({
    ...body,
    composition: secret,
    selection: ["route:parent"],
    acknowledgeUnverified: true,
  });
  assert(!JSON.stringify(redacted).includes("NEVER-ECHO-THIS"));
  assert.equal(redacted.request.composition.routes[0].content.tokenCount, 12);
  checks += 2;
  const urlSecret = clone(composition);
  urlSecret.sourceUrl =
    "https://user:secret@example.invalid/source?access_token=never-store&safe=1";
  const safeUrl = helper.parseFrontendCompositionRequest({
    ...body,
    composition: urlSecret,
  });
  assert(!JSON.stringify(safeUrl).includes("never-store"));
  assert(!JSON.stringify(safeUrl).includes("user:secret"));
  checks += 2;
  assert.throws(() =>
    helper.parseFrontendCompositionRequest({
      ...body,
      composition: JSON.parse(
        '{"schemaVersion":"backy.frontend-composition-import.v1","routes":[],"__proto__":{}}',
      ),
    }),
  );
  checks++;
  // Genuine strict disk failure after preparation rolls back design, revisions and every draft in memory.
  const prior = store
      .getPageSummary(site.id, { includeUnpublished: true })
      .map((p: any) => p.id),
    revCount = store.listTemplateRevisions(site.id, undefined).pagination.total;
  const prepare = () => ({
    drafts: [
      {
        type: "page",
        input: { title: "Never commit", slug: "rollback-proof", content: tree },
      },
    ],
  });
  const file = join(scratch, "data/backy/admin-content.json");
  const { renameSync, mkdirSync } = await import("node:fs");
  renameSync(file, file + ".saved");
  mkdirSync(file);
  const priorConsole = console.error;
  console.error = () => {};
  try {
    assert.throws(() => store.commitDemoFrontendComposition(site.id, prepare));
    assert.deepEqual(
      store
        .getPageSummary(site.id, { includeUnpublished: true })
        .map((p: any) => p.id),
      prior,
    );
    assert.equal(
      store.listTemplateRevisions(site.id, undefined).pagination.total,
      revCount,
    );
    checks += 3;
  } finally {
    console.error = priorConsole;
  }
  rmSync(file, { recursive: true });
  renameSync(file + ".saved", file);
  // Actual permission evaluator: viewer can inspect this site's draft design but cannot apply; foreign scoped operators deny review.
  for (const status of [false, true]) {
    const auth = fixture({ actorRole: "viewer", demo: status });
    const request = new NextRequest(
      `http://fixture.invalid/api/admin/sites/${auth.site.id}/frontend-design/composition-import`,
      { method: "POST", body: "{}" },
    );
    const read = await auth.access.requireAdminAccess(request, "proof", {
      permission: "sites.view",
    });
    assert(!(read instanceof NextResponse));
    const write = await auth.access.requireAdminAccess(request, "proof", {
      permission: "sites.configure",
    });
    assert(write instanceof NextResponse);
    assert.equal(write.status, 403);
    checks += 3;
  }
  // Actual apply handler preserves bounded media admission errors and hides provider/SQL diagnostics.
  const privateDiagnostic = 'Never expose private media SQL/provider details';
  for (const code of ['MEDIA_STORAGE_MUTATION_BUSY', 'MEDIA_STORAGE_LOCK_UNAVAILABLE', 'INVALID_EDITOR_MEDIA_REFERENCE']) {
    const failingRoute = load('../src/app/api/admin/sites/[siteId]/frontend-design/composition-import/route.ts', {
      ...mocks,
      '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => ({ sites: { getById: async () => ({ id: site.id }), getBySlug: async () => null } }) },
      '@/lib/frontendCompositionImport': { ...helper, applyRepositoryFrontendComposition: async () => { throw Object.assign(new Error(privateDiagnostic), { code, mediaId: 'submitted-id', path: '/content/elements/0/props/assetId', query: privateDiagnostic, providerKey: privateDiagnostic }); } },
    });
    const failed = await failingRoute.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/frontend-design/composition-import`, { method: 'POST', body: JSON.stringify({ ...body, action: 'apply', reviewVersion: token }) }), { params: Promise.resolve({ siteId: site.id }) });
    assert.equal(failed.status, code === 'INVALID_EDITOR_MEDIA_REFERENCE' ? 400 : 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.equal(failed.headers.get('retry-after'), code === 'MEDIA_STORAGE_MUTATION_BUSY' ? '1' : null);
    const failedBody = await failed.json();
    assert.equal(failedBody.error.code, code);
    assert.equal(JSON.stringify(failedBody).includes(privateDiagnostic), false);
    assert.deepEqual(failedBody.error.details, code === 'INVALID_EDITOR_MEDIA_REFERENCE' ? { mediaId: 'submitted-id', path: '/content/elements/0/props/assetId' } : undefined);
    checks += 6;
  }
  console.log(
    `Composition review/import passed ${checks} checks. Actual handler, safe normalizer, demo disk persistence/rollback, nested draft identity/history and actual permission evaluator; sessions/providers synthetic, PostgreSQL separate.`,
  );
} finally {
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
