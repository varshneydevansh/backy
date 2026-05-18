import assert from "node:assert/strict";
import type { SiteSettings } from "@backy-cms/core";
import { buildTemplateRegistry } from "../src/lib/templateRegistry";

const frontendDesign = {
  schemaVersion: "backy.frontend-design.v1",
  status: "captured",
  source: {
    type: "custom-frontend",
    label: "Template smoke frontend",
    url: "https://example.com",
  },
  tokens: {
    colors: {
      primary: "#0f766e",
    },
  },
  chrome: {},
  templates: [
    {
      id: "landing-page",
      type: "page",
      name: "Landing Page",
      description: "Marketing landing page",
      routePattern: "/",
      canvasSize: { width: 1440, height: 1200 },
      content: {
        elements: [
          { id: "hero", type: "section" },
          { id: "cta", type: "button" },
        ],
      },
      bindingHints: [{ binding: "page.title" }],
    },
    {
      id: "signup-form",
      type: "form",
      name: "Signup Form",
      content: {
        fields: [
          { key: "email", type: "email" },
          { key: "name", type: "text" },
        ],
      },
    },
    {
      id: "product-detail",
      type: "product",
      name: "Product Detail",
      routePattern: "/products/:slug",
      content: {
        version: "3",
        blocks: [
          { id: "product-title", role: "product.title" },
          { id: "product-price", role: "product.price" },
        ],
      },
    },
  ],
  editableMap: [],
  updatedAt: "2026-05-18T00:00:00.000Z",
} satisfies NonNullable<SiteSettings["frontendDesign"]>;

const registry = buildTemplateRegistry("site-template-smoke", frontendDesign);

assert.equal(registry.schemaVersion, "backy.template-registry.v1");
assert.equal(registry.templateCount, 3);
assert.equal(registry.totalTemplateCount, 3);
assert.equal(registry.cloneField, "frontendDesignTemplateId");
assert.equal(
  registry.cloneTargets.product,
  "/api/admin/sites/site-template-smoke/collections/products/records",
);

const page = registry.templates.find((template) => template.id === "landing-page");
assert(page, "Registry should include the page template");
assert.equal(page.type, "page");
assert.equal(page.contentSummary.elementCount, 2);
assert.equal(page.contentSummary.bindingHintCount, 1);
assert.equal(page.contentSummary.hasCanvas, true);
assert.deepEqual(page.clone.body, {
  frontendDesignTemplateId: "landing-page",
  title: "Landing Page",
});

const form = registry.byType.form[0];
assert.equal(form.id, "signup-form");
assert.equal(form.contentSummary.fieldCount, 2);
assert.deepEqual(form.clone.body, {
  frontendDesignTemplateId: "signup-form",
  name: "Signup Form",
  title: "Signup Form",
});

const product = registry.byType.product[0];
assert.equal(product.id, "product-detail");
assert.equal(product.version, "3");
assert.equal(product.clone.endpoint, registry.cloneTargets.product);
assert.deepEqual(product.clone.body, {
  frontendDesignTemplateId: "product-detail",
  values: {
    title: "Product Detail",
  },
});

const productOnly = buildTemplateRegistry("site-template-smoke", frontendDesign, {
  type: "product",
});
assert.equal(productOnly.templateCount, 1);
assert.equal(productOnly.templates[0]?.id, "product-detail");
assert.equal(productOnly.byType.page.length, 0);

const searched = buildTemplateRegistry("site-template-smoke", frontendDesign, {
  search: "signup",
});
assert.equal(searched.templateCount, 1);
assert.equal(searched.templates[0]?.id, "signup-form");

console.log(JSON.stringify({
  ok: true,
  contract: "backy.template-registry.v1",
}, null, 2));
