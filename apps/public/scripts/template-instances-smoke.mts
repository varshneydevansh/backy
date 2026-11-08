import { assertTemplateInstanceContract } from "./template-instances-contract.mts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { load } from "./collection-import-postgres-handlers.mjs";
import * as coreModule from "@backy-cms/core";
const core: any = (coreModule as any).default || coreModule;
const scratch = mkdtempSync(join(tmpdir(), "backy-template-instances-")),
  cwd = process.cwd();
process.chdir(scratch);
const sm: any = await import("../src/lib/backyStore.ts"),
  store = sm.default || sm;
const dm: any = await import("../src/lib/frontendDesignContract.ts"),
  design = dm.default || dm;
const pm: any = await import("../src/lib/templateInstanceProvenance.ts"),
  provenance = pm.default || pm;
let checks = 0;
try {
  for (const demo of [true, false])
    for (const type of ["page", "post"] as const) {
      const site = store.createAdminSite({
        name: "Template instances",
        slug: "instances-" + demo + "-" + type,
      });
      const template: any = {
        id: "instance-template",
        name: "Instance template",
        type: type === "page" ? "page" : "blogPost",
        version: 1,
        content: {
          elements: [
            {
              id: "hero",
              type: "section",
              width: 1000,
              height: 500,
              props: { layoutMode: "flow" },
              children: [
                {
                  id: "copy",
                  type: "text",
                  width: 500,
                  height: 80,
                  props: { content: "Default copy", color: "teal" },
                  responsive: { mobile: { width: 300 } },
                },
              ],
            },
          ],
          customCSS: ".hero{padding:12px}",
          extension: { retained: [false, 0] },
        },
      };
      const frontendDesign = design.normalizeFrontendDesignContract({
        status: "captured",
        source: { type: "manual" },
        templates: [template],
      });
      store.commitDemoFrontendDesign({
        siteId: site.id,
        expectedDesignFingerprint: provenance.templateInstanceFingerprint(
          site.settings.frontendDesign ?? null,
        ),
        frontendDesign,
        source: "fixture",
      });
      const canonicalSite = store.getSiteByIdOrSlug(site.id);
      const source = canonicalSite.settings.frontendDesign.templates[0];
      const seed = design.seedInputFromFrontendDesignTemplate({
        siteSettings: canonicalSite.settings,
        body: {
          frontendDesignTemplateId: source.id,
          meta: { unknown: { retained: 0 } },
        },
        templateType: source.type,
        kind: type,
        title: "Authored identity",
      });
      assert(seed.ok);
      assert.equal(
        seed.body.meta.frontendTemplateInstance.templateFingerprint,
        provenance.templateInstanceFingerprint(source),
      );
      checks += 2;
      const create =
        type === "page" ? store.createAdminPage : store.createAdminBlogPost;
      const get =
        type === "page" ? store.getAdminPageById : store.getAdminBlogPostById;
      const update =
        type === "page" ? store.updateAdminPage : store.updateAdminBlogPost;
      const doc = create(site.id, {
        title: "Authored identity",
        slug: "authored",
        content: seed.body.content,
        meta: seed.body.meta,
      });
      const authored = structuredClone(doc.content);
      authored.elements[0].children[0].props.content = "Author edited copy";
      authored.authorExtension = { retained: [false, 0] };
      update(site.id, doc.id, { content: authored });
      const legacy = create(site.id, {
        title: "Legacy instance",
        slug: "legacy",
        content: seed.body.content,
        meta: { frontendDesignTemplateId: source.id },
      });
      const conflicting = create(site.id, {
        title: "Conflicting instance",
        slug: "conflicting",
        content: seed.body.content,
        meta: seed.body.meta,
      });
      const conflictContent = structuredClone(conflicting.content);
      conflictContent.elements[0].width = 900;
      update(site.id, conflicting.id, { content: conflictContent });
      const target = structuredClone(source);
      target.version = 2;
      target.content.elements[0].width = 1100;
      target.content.elements[0].children[0].props.color = "amber";
      store.commitDemoFrontendDesign({
        siteId: site.id,
        expectedDesignFingerprint: provenance.templateInstanceFingerprint(
          canonicalSite.settings.frontendDesign,
        ),
        frontendDesign: {
          ...canonicalSite.settings.frontendDesign,
          templates: [target],
        },
        source: "fixture",
      });
      const revision: any = store
        .listTemplateRevisions(site.id, source.id, { limit: 100, offset: 0 })
        .items.find(
          (item: any) =>
            item.fingerprint === provenance.templateInstanceFingerprint(target),
        );
      let denial = "",
        writes = 0,
        malformed = false,
        race = false,
        failAudit = false,
        webhookMode = "success",
        reads = 0;
      const webhookCalls: any[] = [];
      const list = (items: any[], p: any) => ({
        items: items.slice(p.offset, p.offset + p.limit),
        pagination: {
          total: items.length,
          limit: p.limit,
          offset: p.offset,
          hasMore: p.offset + p.limit < items.length,
        },
      });
      const pages = () =>
        store.listAdminPages(site.id, { includeUnpublished: true });
      const posts = () =>
        store.getBlogPosts(site.id, {
          includeUnpublished: true,
          limit: 100,
          offset: 0,
        }).posts;
      const write = (kind: string) => async (_s: any, id: any, input: any) => {
        writes++;
        if (race) {
          race = false;
          const old = get(site.id, id);
          update(site.id, id, {
            content: { ...old.content, concurrentAuthor: "keep" },
          });
        }
        return {
          item: (kind === "page"
            ? store.updateAdminPage
            : store.updateAdminBlogPost)(site.id, id, input),
        };
      };
      const repos: any = {
        sites: {
          getById: async () => {
            reads++;
            return store.getSiteByIdOrSlug(site.id);
          },
          getBySlug: async () => null,
        },
        pages: {
          list: async (p: any) =>
            malformed
              ? {
                  items: [],
                  pagination: {
                    total: 1,
                    limit: 100,
                    offset: 0,
                    hasMore: false,
                  },
                }
              : list(pages(), p),
          getById: async (_s: any, id: any) =>
            store.getAdminPageById(site.id, id),
          update: write("page"),
        },
        posts: {
          list: async (p: any) => list(posts(), p),
          getById: async (_s: any, id: any) =>
            store.getAdminBlogPostById(site.id, id),
          update: write("post"),
        },
      };
      const route = load(
        "../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts",
        {
          "next/server": { NextResponse },
          "@/lib/backyStore": {
            ...store,
            updateAdminPage: (...args: any[]) => {
              writes++;
              if (race) {
                race = false;
                const current = get(site.id, args[1]);
                update(site.id, args[1], {
                  content: { ...current.content, concurrentAuthor: "keep" },
                });
              }
              return store.updateAdminPage(...args);
            },
            updateAdminBlogPost: (...args: any[]) => {
              writes++;
              if (race) {
                race = false;
                const current = get(site.id, args[1]);
                update(site.id, args[1], {
                  content: { ...current.content, concurrentAuthor: "keep" },
                });
              }
              return store.updateAdminBlogPost(...args);
            },
          },
          "@/lib/repositoryRuntime": {
            shouldUseDemoStoreFallback: () => demo,
            getRequiredDatabaseRepositories: async () => repos,
          },
          "@/lib/templateHistory": {
            getRetainedTemplateRevision: async (s: any, t: any, id: any) =>
              s === site.id && t === source.id && id === revision.id
                ? revision
                : null,
          },
          "@/lib/adminAccess": {
            requireAdminAccess: async (_r: any, requestId: any, p: any) =>
              [...(p.permission ? [p.permission] : []), ...(p.permissions || [])].includes(denial) || denial === "401"
                ? NextResponse.json(
                    {
                      success: false,
                      requestId,
                      error: { code: "DENIED", message: "Fixture denied" },
                    },
                    {
                      status: denial === "401" ? 401 : 403,
                      headers: { "cache-control": "private, no-store" },
                    },
                  )
                : { session: { user: { id: "fixture" } } },
          },
          "@/lib/adminAudit": {
            recordAdminAudit: async () => {
              if (failAudit) throw Error("PRIVATE_AUDIT");
            },
          },
          "@/lib/siteWebhookDelivery": {
            deliverSiteWebhooks: async (input: any) => {
              webhookCalls.push(input);
              if (webhookMode === "throw") throw Error("PRIVATE_WEBHOOK_PROVIDER");
              return webhookMode === "failed" ? [{status:"failed",error:"PRIVATE_WEBHOOK_PROVIDER",target:"https://private.invalid"}] : webhookMode === "succeeded" ? [{status:"succeeded"}] : [];
            },
          },
          "@/lib/cacheInvalidation": {
            recordSiteCacheInvalidation: async () => ({}),
          },
        },
      );
      const selection = [{ type, id: doc.id }];
      async function call(body: any, expected: number) {
        const beforeWebhooks = webhookCalls.length;
        const response = await route.POST(
          new Request(
            `http://fixture.invalid/api/admin/sites/${site.id}/templates/${source.id}/instances`,
            {
              method: "POST",
              body: JSON.stringify({
                targetRevisionId: revision.id,
                selection,
                ...body,
              }),
            },
          ),
          {
            params: Promise.resolve({ siteId: site.id, templateId: source.id }),
          },
        );
        const payload = await response.json();
        assertTemplateInstanceContract(expected, payload);
        assert.equal(response.status, expected, JSON.stringify(payload));
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
        checks += 2;
        const expectedDispatch = expected === 200 && body.action === "apply" && payload.data.appliedTargets.length > 0 ? 1 : 0;
        assert.equal(webhookCalls.length - beforeWebhooks, expectedDispatch, "Only confirmed apply commits dispatch, once per request");checks++;
        if (expectedDispatch) {
          const sent = webhookCalls.at(-1);
          assert.equal(sent.site.id,site.id);assert.equal(sent.kind,"site-updated");
          assert.deepEqual(JSON.parse(JSON.stringify(sent.data.appliedTargets)),Array.from(payload.data.appliedTargets));
          assert.equal(sent.data.summary.appliedTargets,payload.data.appliedTargets.length);
          assert.equal(sent.data.summary.failedTargets,payload.data.failedTargets.length);
          assert(!JSON.stringify(sent.data).includes("baseContent"));checks+=6;
        }
        assert(!JSON.stringify(payload).includes("PRIVATE_WEBHOOK_PROVIDER"));checks++;
        return payload.data;
      }
      const reviewed = await call({ action: "review" }, 200);
      assert.equal(writes, 0);
      assert(reviewed.canApply);
      assert.equal(
        reviewed.targets.find((r: any) => r.id === legacy.id).conflicts[0].code,
        "UNPINNED_INSTANCE",
      );
      assert.equal(
        reviewed.targets.find((r: any) => r.id === conflicting.id).state,
        "blocked",
      );
      checks += 4;
      await call(
        {
          action: "apply",
          selection: [{ type, id: legacy.id }],
          reviewVersion: reviewed.reviewVersion,
        },
        409,
      );
      const blocked = await call(
        { action: "review", selection: [{ type, id: conflicting.id }] },
        200,
      );
      await call(
        {
          action: "apply",
          selection: [{ type, id: conflicting.id }],
          reviewVersion: blocked.reviewVersion,
        },
        422,
      );
      assert.equal(writes, 0);
      checks++;
      const changed = structuredClone(get(site.id, doc.id).content);
      changed.concurrent = false;
      update(site.id, doc.id, { content: changed });
      await call(
        { action: "apply", reviewVersion: reviewed.reviewVersion },
        409,
      );
      assert.equal(writes, 0);
      checks++;
      const fresh = await call({ action: "review" }, 200);
      failAudit = true;
      const applied = await call(
        { action: "apply", reviewVersion: fresh.reviewVersion },
        200,
      );
      assert.equal(applied.appliedTargets.length, 1);
      assert.equal(applied.outcome, "partial");
      assert.deepEqual(Array.from(applied.completionWarnings), [
        "TEMPLATE_INSTANCE_AUDIT_PENDING",
      ]);
      assert.equal(writes, 1);
      checks += 4;
      const saved = get(site.id, doc.id),
        content = provenance.canonicalTemplateInstanceContent(
          saved.content,
          type,
        );
      assert.equal(content.elements[0].width, 1100);
      assert.equal(
        content.elements[0].children[0].props.content,
        "Author edited copy",
      );
      assert.equal(content.elements[0].children[0].props.color, "amber");
      assert.deepEqual(content.authorExtension, { retained: [false, 0] });
      assert.equal(content.concurrent, false);
      assert.equal(
        saved.meta.frontendTemplateInstance.templateFingerprint,
        revision.fingerprint,
      );
      assert.deepEqual(saved.meta.unknown, { retained: 0 });
      assert.equal(saved.title, "Authored identity");
      assert.deepEqual(content.extension, { retained: [false, 0] });
      checks += 9;
      await call({ action: "apply", reviewVersion: fresh.reviewVersion }, 409);
      const after = await call({ action: "review" }, 200);
      assert.equal(
        after.targets.find((r: any) => r.id === doc.id).state,
        "current",
      );
      checks++;
      const raceDoc = create(site.id, {
        title: "Race instance",
        slug: "race-instance",
        content: seed.body.content,
        meta: seed.body.meta,
      });
      const raceSelection = [{ type, id: raceDoc.id }];
      const raceReview = await call(
        { action: "review", selection: raceSelection },
        200,
      );
      race = true;
      const deniedRace = await call(
        {
          action: "apply",
          selection: raceSelection,
          reviewVersion: raceReview.reviewVersion,
        },
        200,
      );
      assert.equal(deniedRace.appliedTargets.length, 0);
      assert.equal(deniedRace.failedTargets[0].code, "CONTENT_CONFLICT");
      assert.equal(get(site.id, raceDoc.id).content.concurrentAuthor, "keep");
      assert.equal(
        get(site.id, raceDoc.id).meta.frontendTemplateInstance
          .templateFingerprint,
        provenance.templateInstanceFingerprint(source),
      );
      checks += 4;
      failAudit = false;
      for (const mode of ["success", "succeeded", "failed", "throw"]) {
        webhookMode = mode;
        const next = create(site.id, {title:"Webhook "+mode,slug:"webhook-"+mode,content:seed.body.content,meta:seed.body.meta});
        const chosen = [{type,id:next.id}];
        const preview = await call({action:"review",selection:chosen},200);
        const committed = await call({action:"apply",selection:chosen,reviewVersion:preview.reviewVersion},200);
        assert.deepEqual(Array.from(committed.appliedTargets),chosen);
        assert.deepEqual(Array.from(committed.completionWarnings),["failed","throw"].includes(mode)?["TEMPLATE_INSTANCE_WEBHOOK_PENDING"]:[]);
        assert.equal(committed.outcome,["failed","throw"].includes(mode)?"partial":"complete");
        assert.equal(get(site.id,next.id).meta.frontendTemplateInstance.templateFingerprint,revision.fingerprint);checks+=4;
      }
      webhookMode = "succeeded";
      const partialRows = ["first","second"].map(label=>create(site.id,{title:"Partial "+label,slug:"partial-"+label,content:seed.body.content,meta:seed.body.meta}));
      const partialSelection = partialRows.map(row=>({type,id:row.id}));
      const partialReview = await call({action:"review",selection:partialSelection},200);
      race = true;
      const partialApply = await call({action:"apply",selection:partialSelection,reviewVersion:partialReview.reviewVersion},200);
      assert.equal(partialApply.outcome,"partial");
      assert.equal(partialApply.appliedTargets.length,1);assert.equal(partialApply.failedTargets.length,1);
      const failedId = partialApply.failedTargets[0].id;
      assert(partialRows.some(row=>row.id===failedId));
      assert.notEqual(partialApply.appliedTargets[0].id,failedId);
      assert.deepEqual(JSON.parse(JSON.stringify(webhookCalls.at(-1).data.appliedTargets)),partialApply.appliedTargets);checks+=5;
      const retryReview = await call({action:"review",selection:partialSelection},200);
      const retryApply = await call({action:"apply",selection:partialSelection,reviewVersion:retryReview.reviewVersion},200);
      assert.deepEqual(Array.from(retryApply.appliedTargets),[{type,id:failedId}]);
      assert.deepEqual(JSON.parse(JSON.stringify(webhookCalls.at(-1).data.appliedTargets)),[{type,id:failedId}]);checks+=2;
      const currentReview = await call({action:"review",selection:partialSelection},200);
      const currentApply = await call({action:"apply",selection:partialSelection,reviewVersion:currentReview.reviewVersion},200);
      assert.equal(currentApply.appliedTargets.length,0);checks++;
      if (!demo) {
        malformed = true;
        await call({ action: "review" }, 503);
        malformed = false;
      }
      for (const deny of ["401", "pages.view", "pages.edit"]) {
        denial = deny;
        const before = reads;
        await call(
          {
            action: deny === "pages.edit" ? "apply" : "review",
            reviewVersion: after.reviewVersion,
          },
          deny === "401" ? 401 : 403,
        );
        assert.equal(reads, before);
        checks++;
      }
      denial = "";
      const disk = JSON.parse(
        readFileSync(join(scratch, "data/backy/admin-content.json"), "utf8"),
      );
      assert(
        (type === "page" ? disk.pages : disk.blogPosts).some(
          (row: any) =>
            row.id === doc.id &&
            row.meta.frontendTemplateInstance.templateFingerprint ===
              revision.fingerprint,
        ),
      );
      checks++;
    }
  const safe = { id: "safe", type: "page", version: 1 };
  assert(
    provenance.pinTemplateInstance(
      safe,
      {
        elements: [],
        themeTokenRefs: { fontFamily: "fontToken.body" },
        fontToken: "body",
      },
      "page",
    ).baseContent,
  );
  assert.throws(
    () =>
      provenance.pinTemplateInstance(
        safe,
        { elements: [], metadata: { apiKey: "PRIVATE_SERVER_KEY" } },
        "page",
      ),
    /TEMPLATE_INSTANCE_UNSAFE/,
  );
  assert.throws(
    () =>
      provenance.pinTemplateInstance(
        safe,
        { elements: [], extension: "x".repeat(2 * 1024 * 1024) },
        "page",
      ),
    /TEMPLATE_INSTANCE_LIMIT/,
  );
  checks += 3;
  const base = {
    elements: [
      { id: "a", props: { value: 1 } },
      { id: "b", props: {} },
      { id: "c", props: {} },
    ],
  };
  const current = structuredClone(base),
    target = structuredClone(base);
  current.elements = [base.elements[1], base.elements[0], base.elements[2]];
  target.elements = [base.elements[0], base.elements[2], base.elements[1]];
  assert(
    core
      .mergeBackyTemplateInstance(base, current, target)
      .conflicts.some((issue: any) => issue.code === "ORDER_CONFLICT"),
  );
  checks++;
  console.log(
    `Template instance actual-handler/demo acceptance passed ${checks} checks: pinned clone, readonly impact, authored/unknown retention, exact overlap/legacy refusal, stale review, guarded writes, precise outcomes, persisted reopen, early auth, committed-only webhook dispatch, partial retry without repeat dispatch and safe returned/thrown delivery warnings. Repository adapter is a fixture; PostgreSQL/browser separate.`,
  );
} finally {
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
