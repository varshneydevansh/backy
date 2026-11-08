import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateInstancesPanel, templateInstanceEditorHref } from "../src/components/sites/TemplateInstancesPanel";
import { reviewOrUpgradeTemplateInstances } from "../src/lib/templateInstancesClient";
import { loadProductDesignVersions, restoreProductDesignVersion } from "../src/lib/productDesignVersionsClient";
import { ProductDesignHistoryPanel } from "../src/components/products/ProductDesignHistoryPanel";
import type {
  BackyTemplateInstanceOutcome,
  BackyTemplateRevision,
} from "@backy-cms/core";
async function main() {
  const selection = [{ type: "page" as const, id: "page/a" }],
    signal = new AbortController().signal;
  const data: BackyTemplateInstanceOutcome = {
    action: "review",
    siteId: "site/a",
    templateId: "template/a",
    targetRevisionId: "revision",
    targetFingerprint: "a".repeat(64),
    reviewVersion: "template-instances-v1:" + "b".repeat(64),
    targets: [
      {
        type: "page",
        id: "page/a",
        title: "Saved page",
        status: "draft",
        pinnedFingerprint: "c".repeat(64),
        contentFingerprint: "d".repeat(64),
        changedPaths: ["/elements/@hero/width"],
        conflicts: [],
        state: "ready",
      },
    ],
    canApply: true,
    scanned: { pages: 205, posts: 2 },
    appliedTargets: [],
    failedTargets: [],
    completionWarnings: [],
    outcome: "complete",
    concurrencyBoundary: "database-per-document-row-lock",
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const response = (value: unknown) =>
    Response.json({ success: true, requestId: "fixture", data: value });
  const preview = await reviewOrUpgradeTemplateInstances(
    "site/a",
    "template/a",
    { action: "review", targetRevisionId: "revision", selection },
    signal,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return response(data);
    },
  );
  assert.equal(preview.scanned.pages, 205);
  assert(
    calls[0].url.includes("/sites/site%2Fa/templates/template%2Fa/instances"),
  );
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[0].init?.signal, signal);
  assert.deepEqual(
    JSON.parse(String(calls[0].init?.body)).selection,
    selection,
  );
  let unreviewedCalls = 0;
  await assert.rejects(
    reviewOrUpgradeTemplateInstances(
      "site/a",
      "template/a",
      { action: "apply", targetRevisionId: "revision", selection },
      signal,
      async () => {
        unreviewedCalls++;
        return response(data);
      },
    ),
    /Review this selection/,
  );
  assert.equal(unreviewedCalls, 0);
  const applied: BackyTemplateInstanceOutcome = {
    ...data,
    action: "apply",
    canApply: false,
    appliedTargets: selection,
    completionWarnings: ["TEMPLATE_INSTANCE_AUDIT_PENDING"],
    outcome: "partial",
  };
  assert.equal(
    (
      await reviewOrUpgradeTemplateInstances(
        "site/a",
        "template/a",
        {
          action: "apply",
          targetRevisionId: "revision",
          selection,
          reviewVersion: data.reviewVersion,
        },
        signal,
        async (_url, init) => {
          assert.equal(
            JSON.parse(String(init?.body)).reviewVersion,
            data.reviewVersion,
          );
          return response(applied);
        },
      )
    ).outcome,
    "partial",
  );
  for (const mutate of [
    (value: any) => {
      value.siteId = "foreign";
    },
    (value: any) => {
      value.targetRevisionId = "changed";
    },
    (value: any) => {
      value.targets.push(value.targets[0]);
    },
    (value: any) => {
      value.targets[0].state = "blocked";
      value.targets[0].conflicts = [{ path: "/width", code: "VALUE_CONFLICT" }];
    },
    (value: any) => {
      value.targets = [];
    },
    (value: any) => {
      value.targets[0].contentFingerprint = "invalid";
    },
    (value: any) => {
      value.appliedTargets = [{ type: "page", id: "foreign" }];
    },
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid);
    await assert.rejects(
      reviewOrUpgradeTemplateInstances(
        "site/a",
        "template/a",
        { action: "review", targetRevisionId: "revision", selection },
        signal,
        async () => response(invalid),
      ),
    );
  }
  await assert.rejects(
    reviewOrUpgradeTemplateInstances(
      "site/a",
      "template/a",
      {
        action: "apply",
        targetRevisionId: "revision",
        selection,
        reviewVersion: data.reviewVersion,
      },
      signal,
      async () =>
        Response.json(
          {
            success: false,
            error: {
              code: "TEMPLATE_INSTANCE_REVIEW_STALE",
              message: "Review current instances again.",
            },
          },
          { status: 409 },
        ),
    ),
    /Review current instances again/,
  );
  const revision = {
    id: "revision",
    templateId: "template/a",
    snapshot: { type: "page", name: "Template" },
  } as BackyTemplateRevision;
  const html = renderToStaticMarkup(
    <TemplateInstancesPanel
      siteId="site/a"
      revision={revision}
      canEdit={false}
    />,
  );
  for (const label of [
    "Review existing instances",
    "Inspect template impact",
    "Older instances without a recorded baseline",
    "Page edit permission",
  ])
    assert(html.includes(label));
  assert.equal(
    (html.match(/<button/g) || []).length,
    (html.match(/type="button"/g) || []).length,
  );
  const sectionSelection = [{ type: "section" as const, id: "section/a" }];
  const sectionData = {
    ...data,
    scanned: { pages: 0, posts: 0, sections: 1 },
    targets: [{ ...data.targets[0], type: "section" as const, id: "section/a", title: "Saved section" }],
  };
  const sectionReview = await reviewOrUpgradeTemplateInstances(
    "site/a", "template/a", { action: "review", targetRevisionId: "revision", selection: sectionSelection }, signal,
    async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)).selection, sectionSelection);
      return response(sectionData);
    },
  );
  assert.equal(sectionReview.targets[0].type, "section");
  assert.equal(sectionReview.scanned.sections, 1);
  await assert.rejects(reviewOrUpgradeTemplateInstances(
    "site/a", "template/a", { action: "review", targetRevisionId: "revision", selection: sectionSelection }, signal,
    async () => response({ ...sectionData, scanned: { ...sectionData.scanned, sections: -1 } }),
  ), /incompatible/);
  const sectionHtml = renderToStaticMarkup(<TemplateInstancesPanel
    siteId="site/a" revision={{ ...revision, snapshot: { ...revision.snapshot, type: "section" } }} canEdit={false}
  />);
  assert(sectionHtml.includes("Inspect template impact"));
  assert(sectionHtml.includes("reusable sections"));
  assert(sectionHtml.includes("Review propagation separately"));
  assert.equal(templateInstanceEditorHref("site/a", sectionSelection[0]), "/reusable-sections?siteId=site%2Fa&sectionId=section%2Fa#reusable-sections-editor");
  assert.equal(templateInstanceEditorHref("site/a", selection[0]), "/pages/page%2Fa/edit?siteId=site%2Fa&focus=canvas");
  assert.equal(templateInstanceEditorHref("site/a", { type: "post", id: "post/a" }), "/blog/post%2Fa?siteId=site%2Fa&focus=canvas");
  const productSelection = [{ type: "product" as const, id: "product/a", collectionId: "catalog/a" }];
  const productData = {
    ...data,
    scanned: { pages: 0, posts: 0, products: 1 },
    targets: [{ ...data.targets[0], type: "product" as const, id: "product/a", collectionId: "catalog/a", title: "Saved product" }],
  };
  const productBody = { action: "review" as const, targetType: "product" as const, targetRevisionId: "revision", selection: productSelection };
  const productReview = await reviewOrUpgradeTemplateInstances("site/a", "template/a", productBody, signal,
    async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), productBody);
      return response(productData);
    });
  assert.equal(productReview.targets[0].type, "product");
  assert.equal(productReview.scanned.products, 1);
  for (const mutate of [
    (value: any) => { delete value.scanned.products; },
    (value: any) => { value.scanned.products = -1; },
    (value: any) => { delete value.targets[0].collectionId; },
    (value: any) => { value.targets[0].type = "page"; },
  ]) {
    const invalid = structuredClone(productData); mutate(invalid);
    await assert.rejects(reviewOrUpgradeTemplateInstances("site/a", "template/a", productBody, signal, async () => response(invalid)));
  }
  await assert.rejects(reviewOrUpgradeTemplateInstances("site/a", "template/a",
    { ...productBody, targetType: undefined }, signal, async () => response(productData)));
  const productHtml = renderToStaticMarkup(<TemplateInstancesPanel siteId="site/a"
    revision={{ ...revision, snapshot: { ...revision.snapshot, type: "product" } }} canView={false} canEdit={false} />);
  assert(productHtml.includes("Price, inventory, status"));
  assert(productHtml.includes("Collections view and commerce view"));
  assert(productHtml.includes("Collections edit and commerce edit"));
  assert(productHtml.includes('disabled=""'));
  assert.equal(templateInstanceEditorHref("site/a", productSelection[0]), "/products?siteId=site%2Fa&productId=product%2Fa#products-design");
  const recordVersion = 'record-v1:' + 'e'.repeat(64);
  const historyData = { siteId: 'site/a', productId: 'product/a', collectionId: 'catalog/a', currentVersion: recordVersion,
    pagination: { offset: 0, limit: 100, hasMore: false, nextOffset: null },
    revisions: [{ id: 'revision/a', createdAt: '2026-10-08T00:00:00Z', operation: 'template-upgrade', templateId: 'template/a', targetRevisionId: 'revision', hasPinnedBaseline: true }] };
  const history = await loadProductDesignVersions('site/a', 'product/a', 'catalog/a', signal, async (url, init) => {
    assert(String(url).endsWith('/sites/site%2Fa/commerce/products/product%2Fa/design-versions?offset=0&limit=100'));
    assert.equal(init?.method, 'GET'); assert.equal(init?.credentials, 'include'); assert.equal(init?.signal, signal);
    return response(historyData);
  });
  assert.equal(history.currentVersion, recordVersion);
  for (const mutate of [
    (value: any) => { value.collectionId = 'foreign'; },
    (value: any) => { value.revisions.push(value.revisions[0]); },
    (value: any) => { value.currentVersion = 'invalid'; },
    (value: any) => { value.pagination.hasMore = true; value.pagination.nextOffset = 100; },
  ]) {
    const invalid = structuredClone(historyData); mutate(invalid);
    await assert.rejects(loadProductDesignVersions('site/a', 'product/a', 'catalog/a', signal, async () => response(invalid)));
  }
  const restoredData = { siteId: 'site/a', productId: 'product/a', collectionId: 'catalog/a', restoredFromRevisionId: 'revision/a',
    record: { id: 'product/a', siteId: 'site/a', collectionId: 'catalog/a', version: recordVersion, values: { price: 42 } }, completionWarnings: ['PRODUCT_DESIGN_AUDIT_PENDING'] };
  const restored = await restoreProductDesignVersion('site/a', 'product/a', 'catalog/a', 'revision/a', recordVersion, signal, async (url, init) => {
    assert(String(url).endsWith('/product%2Fa/design-versions/revision%2Fa/restore'));
    assert.deepEqual(JSON.parse(String(init?.body)), { expectedVersion: recordVersion });
    assert.equal(init?.credentials, 'include'); return response(restoredData);
  });
  assert.equal(restored.record.values.price, 42);
  assert.deepEqual(restored.completionWarnings, ['PRODUCT_DESIGN_AUDIT_PENDING']);
  let restoreCalls = 0;
  await assert.rejects(restoreProductDesignVersion('site/a', 'product/a', 'catalog/a', 'revision/a', 'invalid', signal, async () => { restoreCalls++; return response(restoredData); }));
  assert.equal(restoreCalls, 0);
  await assert.rejects(restoreProductDesignVersion('site/a', 'product/a', 'catalog/a', 'revision/a', recordVersion, signal, async () => {
    restoreCalls++; return Response.json({ success: false, error: { message: 'Reload current product before restoring.' } }, { status: 409 });
  }), /Reload current product/);
  assert.equal(restoreCalls, 1, 'A stale restoration is never replayed');
  const historyHtml = renderToStaticMarkup(<ProductDesignHistoryPanel siteId="site/a" productId="product/a" collectionId="catalog/a"
    canView={false} canEdit={false} hasUnsavedChanges={true} onRestored={() => { throw Error('SSR cannot write'); }} />);
  assert(historyHtml.includes('Collections view and commerce view'));
  assert(historyHtml.includes('Save your current product and design edits'));
  assert(historyHtml.includes('disabled=""'));
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    reviewOrUpgradeTemplateInstances(
      "site/a",
      "template/a",
      { action: "review", targetRevisionId: "revision", selection },
      aborted.signal,
    ),
  );
  console.log(
    "Template instance admin transport/SSR PASS: exact selected review/apply, stale and forged-response refusal, cancellation, permission and explicit parent-form-safe controls. Browser proof separate.",
  );
}
void main();
