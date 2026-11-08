import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./collection-import-postgres-handlers.mjs";
const require = createRequire(import.meta.url),
  { NextResponse } = require("next/server");
export async function verifyTemplateInstancesPostgres({
  repositories,
  competing,
  sql,
  site,
}) {
  let deny = "",
    mode = "",
    injected = false,
    checks = 0;
  const actualPages = repositories.pages,
    actualPosts = repositories.posts;
  const mocks = {
    "next/server": { NextResponse },
    "@/lib/backyStore": {},
    "@/lib/adminAccess": {
      requireAdminAccess: async (_request, requestId, options) =>
        (deny === options.permission || options.permissions?.includes(deny))
          ? NextResponse.json(
              {
                success: false,
                requestId,
                error: { code: "FORBIDDEN", message: "Fixture denial" },
              },
              {
                status: 403,
                headers: { "cache-control": "private, no-store" },
              },
            )
          : { session: { user: { id: "synthetic-owner" } } },
    },
    "@/lib/repositoryRuntime": {
      shouldUseDemoStoreFallback: () => false,
      getRequiredDatabaseRepositories: async () => repositories,
    },
    "@/lib/adminAudit": { recordAdminAudit: async () => {} },
    "@/lib/siteWebhookDelivery": {deliverSiteWebhooks:async()=>[]},
    "@/lib/cacheInvalidation": {
      recordSiteCacheInvalidation: async () => ({}),
    },
  };
  mocks["./repositoryRuntime"] = mocks["@/lib/repositoryRuntime"];
  mocks["./backyStore"] = mocks["@/lib/backyStore"];
  const design = load("../src/lib/frontendDesignContract.ts", mocks),
    pin = load("../src/lib/templateInstanceProvenance.ts", mocks);
  const handler = load(
    "../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts",
    mocks,
  );
  for (const type of ["page", "post"]) {
    const template = {
      id: "pg-" + type,
      type: type === "page" ? "page" : "blogPost",
      name: "SQL pinned template",
      version: 1,
      content: {
        elements: [
          {
            id: "hero",
            type: "section",
            width: 1000,
            height: 600,
            props: { layoutMode: "flow" },
            children: [
              {
                id: "copy",
                type: "text",
                props: { content: "Original", color: "teal" },
                width: 500,
                height: 80,
              },
            ],
          },
        ],
        extension: { keep: [false, 0] },
      },
    };
    const first = design.normalizeFrontendDesignContract({
      status: "captured",
      source: { type: "manual" },
      templates: [template],
    });
    let currentSite = await repositories.sites.getById(site.id);
    await repositories.templateRevisions.commitDesign({
      siteId: site.id,
      expectedDesignFingerprint: pin.templateInstanceFingerprint(
        currentSite.settings.frontendDesign ?? null,
      ),
      frontendDesign: first,
      source: "fixture",
    });
    currentSite = await repositories.sites.getById(site.id);
    const source = currentSite.settings.frontendDesign.templates[0];
    const seed = design.seedInputFromFrontendDesignTemplate({
      siteSettings: currentSite.settings,
      body: {
        frontendDesignTemplateId: source.id,
        meta: { extension: { keep: true } },
      },
      templateType: source.type,
      kind: type,
      title: "SQL authored identity",
    });
    assert(seed.ok);
    const repo = type === "page" ? actualPages : actualPosts,
      other = type === "page" ? competing.pages : competing.posts;
    const content = pin.canonicalTemplateInstanceContent(
      seed.body.content,
      type,
    );
    content.elements[0].children[0].props.content = "Author retained";
    content.unknownAuthor = { keep: [false, 0] };
    const create = async (slug) =>
      (
        await repo.create({
          siteId: site.id,
          title: "SQL authored identity",
          slug: type + "-" + slug,
          status: "draft",
          content,
          meta: seed.body.meta,
        })
      ).item;
    const good = await create("good"),
      stale = await create("stale"),
      failing = await create("failing");
    const target = structuredClone(source);
    target.version = 2;
    target.content.elements[0].width = 1100;
    target.content.elements[0].children[0].props.color = "amber";
    await repositories.templateRevisions.commitDesign({
      siteId: site.id,
      expectedDesignFingerprint: pin.templateInstanceFingerprint(first),
      frontendDesign: { ...first, templates: [target] },
      source: "fixture",
    });
    const history = await repositories.templateRevisions.list({
      siteId: site.id,
      templateId: source.id,
      limit: 100,
    });
    const revision = history.items.find(
      (item) => item.fingerprint === pin.templateInstanceFingerprint(target),
    );
    assert(revision);
    const wrapped = {
      ...repo,
      update: async (s, id, input) => {
        if (mode === "author-race" && !injected) {
          injected = true;
          const latest = await other.getById(s, id);
          await other.update(s, id, {
            content: { ...latest.content, currentAuthorWins: [false, 0] },
          });
        }
        return repo.update(s, id, input);
      },
    };
    if (type === "page") repositories.pages = wrapped;
    else repositories.posts = wrapped;
    const selection = (ids) => ids.map((id) => ({ type, id }));
    const call = async (action, ids, token) => {
      const response = await handler.POST(
        new Request(
          `http://fixture.invalid/api/admin/sites/${site.id}/templates/${source.id}/instances`,
          {
            method: "POST",
            body: JSON.stringify({
              action,
              targetRevisionId: revision.id,
              selection: selection(ids),
              ...(token ? { reviewVersion: token } : {}),
            }),
          },
        ),
        { params: Promise.resolve({ siteId: site.id, templateId: source.id }) },
      );
      const payload = await response.json();
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      checks++;
      return { status: response.status, payload };
    };
    let preview = await call("review", [good.id]);
    assert.equal(preview.status, 200, JSON.stringify(preview.payload));
    assert(preview.payload.data.canApply);
    checks += 2;
    const applied = await call(
      "apply",
      [good.id],
      preview.payload.data.reviewVersion,
    );
    assert.equal(applied.status, 200);
    assert.equal(applied.payload.data.appliedTargets.length, 1);
    checks += 2;
    const saved = await repo.getById(site.id, good.id);
    assert.equal(saved.content.elements[0].width, 1100);
    assert.equal(
      saved.content.elements[0].children[0].props.content,
      "Author retained",
    );
    assert.equal(saved.content.elements[0].children[0].props.color, "amber");
    assert.deepEqual(saved.content.unknownAuthor, { keep: [false, 0] });
    assert.deepEqual(saved.meta.extension, { keep: true });
    assert.equal(
      saved.meta.frontendTemplateInstance.templateFingerprint,
      revision.fingerprint,
    );
    checks += 6;
    const revisions = await repositories.contentWorkflows.listRevisions({
      siteId: site.id,
      targetType: type,
      targetId: good.id,
    });
    assert.equal(revisions.items.length, 1);
    assert.equal(
      revisions.items[0].snapshot.meta.frontendTemplateInstance
        .templateFingerprint,
      pin.templateInstanceFingerprint(source),
    );
    checks += 2;
    preview = await call("review", [stale.id]);
    mode = "author-race";
    injected = false;
    const conflict = await call(
      "apply",
      [stale.id],
      preview.payload.data.reviewVersion,
    );
    mode = "";
    assert.equal(conflict.status, 200);
    assert.equal(conflict.payload.data.appliedTargets.length, 0);
    assert.equal(
      conflict.payload.data.failedTargets[0].code,
      "CONTENT_CONFLICT",
    );
    assert.deepEqual(
      (await repo.getById(site.id, stale.id)).content.currentAuthorWins,
      [false, 0],
    );
    assert.equal(
      (
        await repositories.contentWorkflows.listRevisions({
          siteId: site.id,
          targetType: type,
          targetId: stale.id,
        })
      ).items.length,
      0,
    );
    checks += 5;
    const table = type === "page" ? "pages" : "blog_posts";
    await sql.unsafe(
      `CREATE FUNCTION fixture_reject_template_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${failing.id}'::uuid THEN RAISE EXCEPTION 'PRIVATE_TEMPLATE_WRITE'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_template_upgrade BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_reject_template_upgrade()`,
    );
    preview = await call("review", [failing.id]);
    const failed = await call(
      "apply",
      [failing.id],
      preview.payload.data.reviewVersion,
    );
    assert.equal(failed.status, 200);
    assert.equal(failed.payload.data.failedTargets[0].code, "WRITE_FAILED");
    assert.equal(
      (await repo.getById(site.id, failing.id)).meta.frontendTemplateInstance
        .templateFingerprint,
      pin.templateInstanceFingerprint(source),
    );
    assert.equal(
      (
        await repositories.contentWorkflows.listRevisions({
          siteId: site.id,
          targetType: type,
          targetId: failing.id,
        })
      ).items.length,
      0,
    );
    assert(!JSON.stringify(failed.payload).includes("PRIVATE_TEMPLATE_WRITE"));
    checks += 5;
    await sql.unsafe(
      `DROP TRIGGER fixture_reject_template_upgrade ON ${table}; DROP FUNCTION fixture_reject_template_upgrade()`,
    );
    deny = "pages.edit";
    const denied = await call(
      "apply",
      [failing.id],
      preview.payload.data.reviewVersion,
    );
    assert.equal(denied.status, 403);
    checks++;
    deny = "";
    if (type === "page") repositories.pages = actualPages;
    else repositories.posts = actualPosts;
  }
  return checks;
}
