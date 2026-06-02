import assert from "node:assert/strict";
import type { SiteSettings } from "@backy-cms/core";
import {
  buildSiteDefaultFrontendDesignContract,
  buildFrontendDesignContractFromContentTemplate,
  frontendDesignProvenanceFromMetadata,
  normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope,
  normalizeFrontendDesignContract,
  normalizeInputFromDirectFrontendDesignEnvelope,
  normalizeReusableSectionInputFromDirectFrontendDesignEnvelope,
  seedCollectionRecordInputFromFrontendDesignTemplate,
  seedCollectionInputFromFrontendDesignTemplate,
  seedFormInputFromFrontendDesignTemplate,
  seedInputFromFrontendDesignTemplate,
  seedSectionInputFromFrontendDesignTemplate,
} from "../src/lib/frontendDesignContract";
import { productRecordToCommerceProduct } from "../src/lib/commerceCatalog";
import { buildTemplateRegistry } from "../src/lib/templateRegistry";

const firstRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? first as Record<string, unknown>
    : undefined;
};

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
    customCSS: ".template-smoke { color: var(--brand-primary); }",
    motion: {
      duration: {
        fast: "120ms",
        normal: "240ms",
      },
      easing: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
      },
      preset: "balanced",
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
      version: 2,
      status: "active",
      updatedAt: "2026-05-17T00:00:00.000Z",
      canvasSize: { width: 1440, height: 1200 },
      content: {
        elements: [
          { id: "hero", type: "section" },
          { id: "cta", type: "button" },
        ],
        interactions: {
          timeline: [{ id: "hero-enter", animation: "fade-up" }],
          triggers: {
            hero: { action: "play", animationId: "hero-enter" },
          },
        },
        dataBindings: {
          datasets: [{ id: "current-page", source: "page" }],
          fields: {
            title: { source: "page.title", targetPath: "elements.hero.props.content" },
          },
        },
        metadata: {
          designState: {
            owner: "frontend-builder",
            revision: 1,
          },
        },
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

const partiallyPatchedFrontendDesign = normalizeFrontendDesignContract(
  {
    status: "synced",
    tokens: {
      colors: {
        accent: "#f97316",
      },
      motion: {
        duration: {
          slow: "420ms",
        },
      },
    },
    chrome: {
      header: {
        sticky: true,
      },
    },
    templates: [
      {
        id: "landing-page",
        name: "Landing Page Updated",
        content: {
          interactions: {
            triggers: {
              cta: { action: "openModal", target: "signup" },
            },
          },
          dataBindings: {
            fields: {
              subtitle: { source: "page.subtitle", targetPath: "elements.hero.props.subtitle" },
            },
          },
          metadata: {
            designState: {
              editedFrom: "site-settings-partial-patch",
            },
          },
        },
      },
    ],
  },
  {
    fallback: {
      ...frontendDesign,
      chrome: {
        header: {
          variant: "split",
        },
      },
    },
    updatedAt: "2026-05-22T00:00:00.000Z",
    mergeFallback: true,
  },
);
const partiallyPatchedTemplate = partiallyPatchedFrontendDesign.templates.find(
  (template) => template.id === "landing-page",
);
assert.equal(partiallyPatchedFrontendDesign.status, "synced");
assert.equal(partiallyPatchedFrontendDesign.source.label, "Template smoke frontend");
assert.equal(partiallyPatchedFrontendDesign.tokens.colors?.primary, "#0f766e");
assert.equal(partiallyPatchedFrontendDesign.tokens.colors?.accent, "#f97316");
assert.equal(partiallyPatchedFrontendDesign.tokens.customCss, ".template-smoke { color: var(--brand-primary); }");
assert.equal(partiallyPatchedFrontendDesign.tokens.motion?.duration?.fast, "120ms");
assert.equal(partiallyPatchedFrontendDesign.tokens.motion?.duration?.normal, "240ms");
assert.equal(partiallyPatchedFrontendDesign.tokens.motion?.duration?.slow, "420ms");
assert.equal(partiallyPatchedFrontendDesign.tokens.motion?.easing?.standard, "cubic-bezier(0.2, 0, 0, 1)");
assert.equal(partiallyPatchedFrontendDesign.tokens.motion?.preset, "balanced");
assert.equal(partiallyPatchedFrontendDesign.chrome.header?.variant, "split");
assert.equal(partiallyPatchedFrontendDesign.chrome.header?.sticky, true);
assert.equal(partiallyPatchedFrontendDesign.templates.length, 3);
assert(partiallyPatchedTemplate, "Partial frontend-design patch should retain the patched template");
const partiallyPatchedTemplateContent = partiallyPatchedTemplate.content as Record<string, unknown>;
const partiallyPatchedTemplateElements = partiallyPatchedTemplateContent.elements as Array<Record<string, unknown>>;
const partiallyPatchedTemplateInteractions = partiallyPatchedTemplateContent.interactions as Record<string, unknown>;
const partiallyPatchedTemplateTriggers = partiallyPatchedTemplateInteractions.triggers as Record<string, unknown>;
const partiallyPatchedTemplateDataBindings = partiallyPatchedTemplateContent.dataBindings as Record<string, unknown>;
const partiallyPatchedTemplateDatasets = partiallyPatchedTemplateDataBindings.datasets as Array<Record<string, unknown>>;
const partiallyPatchedTemplateFields = partiallyPatchedTemplateDataBindings.fields as Record<string, unknown>;
const partiallyPatchedTemplateMetadata = partiallyPatchedTemplateContent.metadata as Record<string, unknown>;
const partiallyPatchedTemplateDesignState = partiallyPatchedTemplateMetadata.designState as Record<string, unknown>;
assert.equal(partiallyPatchedTemplate.name, "Landing Page Updated");
assert.equal(partiallyPatchedTemplate.routePattern, "/");
assert.equal(partiallyPatchedTemplate.version, 2);
assert.equal(partiallyPatchedTemplate.status, "active");
assert.equal(
  partiallyPatchedTemplateElements[0]?.id,
  "hero",
);
assert.equal(
  (partiallyPatchedTemplateInteractions.timeline as Array<Record<string, unknown>>)[0]?.id,
  "hero-enter",
  "Partial frontend-design patch should retain fallback interaction timelines",
);
assert.equal(
  (partiallyPatchedTemplateTriggers.hero as Record<string, unknown>).animationId,
  "hero-enter",
  "Partial frontend-design patch should retain fallback interaction triggers",
);
assert.equal(
  (partiallyPatchedTemplateTriggers.cta as Record<string, unknown>).target,
  "signup",
  "Partial frontend-design patch should merge newly patched interaction triggers",
);
assert.equal(
  partiallyPatchedTemplateDatasets[0]?.id,
  "current-page",
  "Partial frontend-design patch should retain fallback data-binding datasets",
);
assert.equal(
  (partiallyPatchedTemplateFields.title as Record<string, unknown>).source,
  "page.title",
  "Partial frontend-design patch should retain fallback data-binding fields",
);
assert.equal(
  (partiallyPatchedTemplateFields.subtitle as Record<string, unknown>).source,
  "page.subtitle",
  "Partial frontend-design patch should merge newly patched data-binding fields",
);
assert.equal(
  partiallyPatchedTemplateDesignState.owner,
  "frontend-builder",
  "Partial frontend-design patch should retain fallback nested template design state",
);
assert.equal(
  partiallyPatchedTemplateDesignState.editedFrom,
  "site-settings-partial-patch",
  "Partial frontend-design patch should merge newly patched nested template design state",
);

const fullyReplacedFrontendDesign = normalizeFrontendDesignContract(
  {
    schemaVersion: "backy.frontend-design.v1",
    status: "synced",
    source: {
      type: "custom-frontend",
      label: "Replacement frontend",
      url: "https://replacement.example",
    },
    tokens: {
      colors: {
        primary: "#111827",
      },
    },
    chrome: {
      footer: {
        variant: "minimal",
      },
    },
    templates: [
      {
        id: "replacement-page",
        type: "page",
        name: "Replacement Page",
        content: {
          elements: [{ id: "replacement-hero", type: "section" }],
        },
      },
    ],
    editableMap: [
      {
        elementId: "replacement-hero",
        targetPath: "elements.replacement-hero.props.title",
        label: "Replacement hero title",
      },
    ],
  },
  {
    fallback: {
      ...frontendDesign,
      chrome: {
        header: {
          variant: "legacy",
        },
      },
    },
    mergeFallback: true,
  },
);
assert.equal(fullyReplacedFrontendDesign.source.label, "Replacement frontend");
assert.equal(fullyReplacedFrontendDesign.tokens.colors?.primary, "#111827");
assert.equal(fullyReplacedFrontendDesign.tokens.colors?.accent, undefined);
assert.equal(fullyReplacedFrontendDesign.tokens.motion, undefined);
assert.equal(fullyReplacedFrontendDesign.chrome.header, undefined);
assert.equal(fullyReplacedFrontendDesign.chrome.footer?.variant, "minimal");
assert.deepEqual(
  fullyReplacedFrontendDesign.templates.map((template) => template.id),
  ["replacement-page"],
  "Complete frontend-design contracts must replace stale fallback templates",
);
assert.deepEqual(
  fullyReplacedFrontendDesign.editableMap.map((entry) => entry.elementId),
  ["replacement-hero"],
  "Complete frontend-design contracts must replace stale fallback editable maps",
);

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
assert.equal(page.versioning.schemaVersion, "backy.template-version.v1");
assert.equal(page.versioning.ready, true);
assert.equal(page.versioning.version, "2");
assert.deepEqual(page.clone.body, {
  frontendDesignTemplateId: "landing-page",
  title: "Landing Page",
});

const form = registry.byType.form[0];
assert.equal(form.id, "signup-form");
assert.equal(form.contentSummary.fieldCount, 2);
assert.equal(form.versioning.ready, false);
assert.deepEqual(form.versioning.issues, ["missing-version", "missing-updated-at"]);
assert.deepEqual(form.clone.body, {
  frontendDesignTemplateId: "signup-form",
  name: "Signup Form",
  title: "Signup Form",
});

const product = registry.byType.product[0];
assert.equal(product.id, "product-detail");
assert.equal(product.version, "3");
assert.equal(product.versioning.ready, false);
assert.equal(product.clone.endpoint, registry.cloneTargets.product);
assert.deepEqual(product.clone.body, {
  frontendDesignTemplateId: "product-detail",
  values: {
    title: "Product Detail",
  },
});

assert.equal(registry.versionSummary.schemaVersion, "backy.template-version-readiness.v1");
assert.equal(registry.versionSummary.ready, false);
assert.equal(registry.versionSummary.readyCount, 1);
assert.equal(registry.versionSummary.missingVersionCount, 1);
assert.equal(registry.versionSummary.missingUpdatedAtCount, 2);
assert.equal(registry.actionPlan.schemaVersion, "backy.template-registry-action-plan.v1");
assert.equal(registry.actionPlan.status, "needs-version-metadata");
assert(registry.actionPlan.steps.some((step) => step.includes("updatedAt")), "Action plan should name missing updatedAt metadata");

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

const defaultFrontendDesign = buildSiteDefaultFrontendDesignContract({
  site: {
    name: "Versioned Site",
    slug: "versioned-site",
  },
  pageTemplates: [
    { id: "default-home", title: "Home", slug: "home" },
    { id: "default-blog", title: "Blog article", slug: "blog/{slug}", type: "blogPost" },
  ],
  updatedAt: "2026-05-18T00:00:00.000Z",
});
const defaultRegistry = buildTemplateRegistry("site-template-smoke", defaultFrontendDesign);
assert.equal(defaultRegistry.versionSummary.ready, true);
assert.equal(defaultRegistry.versionSummary.readyCount, 2);
assert.equal(defaultRegistry.versionSummary.missingVersionCount, 0);
assert.equal(defaultRegistry.versionSummary.missingUpdatedAtCount, 0);
assert.equal(defaultRegistry.actionPlan.status, "ready");
assert(defaultRegistry.templates.every((template) => template.versioning.ready), "Default captured site templates should be version-ready");

const capturedDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign,
  resource: {
    id: "captured-roundtrip-page",
    type: "page",
    title: "Captured Roundtrip Page",
    slug: "captured-roundtrip",
    description: "Template capture should preserve editable design-state arrays.",
    content: {
      elements: [
        {
          id: "roundtrip-hero",
          type: "section",
          props: {
            binding: "page.hero",
          },
        },
        {
          id: "roundtrip-cta",
          type: "button",
          props: {
            label: "Start building",
            backgroundColor: "#0f766e",
            downloadMediaIds: ["media_download"],
            fileSignedUrlRequired: true,
          },
          styles: {
            color: "#ffffff",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.22)",
          },
          responsive: {
            mobile: {
              props: {
                backgroundColor: "#134e4a",
              },
              styles: {
                boxShadow: "none",
              },
            },
          },
          animation: {
            type: "custom",
            from: { opacity: 0, y: 12 },
            to: { opacity: 1, y: 0 },
            scrollTrigger: { start: "top 80%", scrub: true },
          },
          actions: [{ id: "roundtrip-cta-action", type: "customEvent" }],
          dataBindings: [
            {
              id: "roundtrip-cta-label-binding",
              targetPath: "props.label",
              source: { kind: "page", field: "title" },
            },
          ],
        },
      ],
      canvasSize: { width: 1280, height: 720 },
      customCSS: ".roundtrip-hero { color: var(--brand-primary); }",
      customJS: "window.__backyRoundtripTemplate = true;",
      assets: [
        {
          id: "roundtrip-hero-image",
          mediaId: "media_hero",
          role: "hero.background",
        },
      ],
      animations: [
        {
          id: "roundtrip-hero-intro",
          timeline: "hero-intro",
          tokenRefs: {
            duration: "motion.duration.slow",
            easing: "motion.easing.standard",
          },
        },
      ],
      interactions: [
        {
          id: "roundtrip-hero-hover",
          trigger: "hover",
          action: "playAnimation",
          animationId: "roundtrip-hero-intro",
        },
      ],
      dataBindings: {
        heroTitle: {
          source: "page.title",
          targetPath: "elements.roundtrip-hero.props.content",
        },
      },
      editableMap: {
        "page.hero": {
          elementId: "roundtrip-hero",
          path: "props.content",
        },
      },
      seo: {
        title: "Captured Roundtrip Page",
      },
    },
  },
  templateId: "captured-roundtrip-template",
  templateName: "Captured Roundtrip Template",
  routePattern: "/captured-roundtrip/{slug}",
});

const capturedRoundtripTemplate = capturedDesignState.templates.find(
  (template) => template.id === "captured-roundtrip-template",
);
assert(capturedRoundtripTemplate, "Captured frontend template should be added to the design contract");
assert.equal(capturedRoundtripTemplate.status, "active");
assert.equal(capturedRoundtripTemplate.version, "1");
assert.equal(capturedRoundtripTemplate.createdAt, capturedDesignState.updatedAt);
assert.equal(capturedRoundtripTemplate.updatedAt, capturedDesignState.updatedAt);
const capturedRoundtripRegistry = buildTemplateRegistry("site-template-smoke", capturedDesignState, {
  search: "captured-roundtrip-template",
});
assert.equal(capturedRoundtripRegistry.versionSummary.ready, true);
assert.equal(capturedRoundtripRegistry.versionSummary.readyCount, 1);
assert.equal(capturedRoundtripRegistry.actionPlan.status, "ready");
const capturedRoundtripEditableTargets = new Map(
  capturedDesignState.editableMap.map((entry) => [`${entry.elementId || ""}:${entry.targetPath || ""}`, entry]),
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:props.backgroundColor")?.valueType,
  "color",
  "Captured button editable map should expose color controls",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:props.downloadMediaIds")?.valueType,
  "file",
  "Captured button editable map should expose downloadable file controls",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:props.fileSignedUrlRequired")?.valueType,
  "boolean",
  "Captured button editable map should expose private-file toggles",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:responsive.mobile.props.backgroundColor")?.valueType,
  "color",
  "Captured button editable map should expose responsive color controls",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:animation.from")?.valueType,
  "json",
  "Captured button editable map should expose animation JSON controls",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:actions")?.valueType,
  "json",
  "Captured button editable map should expose action controls",
);
assert.equal(
  capturedRoundtripEditableTargets.get("roundtrip-cta:props.label")?.sourceField,
  "title",
  "Captured data bindings should map source fields back to editable target paths",
);
const capturedRoundtripContent = capturedRoundtripTemplate.content as Record<string, unknown>;
assert(Array.isArray(capturedRoundtripContent.assets), "Captured template should preserve asset manifest arrays");
assert(Array.isArray(capturedRoundtripContent.animations), "Captured template should preserve animation timeline arrays");
assert(Array.isArray(capturedRoundtripContent.interactions), "Captured template should preserve interaction arrays");
assert.equal((capturedRoundtripContent.assets as Array<Record<string, unknown>>)[0]?.mediaId, "media_hero");
assert.equal((capturedRoundtripContent.animations as Array<Record<string, unknown>>)[0]?.timeline, "hero-intro");
assert.equal((capturedRoundtripContent.interactions as Array<Record<string, unknown>>)[0]?.animationId, "roundtrip-hero-intro");
const capturedRoundtripContentEditableMap = capturedRoundtripContent.editableMap as Record<string, Record<string, unknown>>;
assert.equal(
  Object.values(capturedRoundtripContentEditableMap).find((entry) => entry.elementId === "roundtrip-cta" && entry.targetPath === "props.backgroundColor")?.valueType,
  "color",
  "Captured template content should persist inferred button color controls",
);
assert.equal(
  Object.values(capturedRoundtripContentEditableMap).find((entry) => entry.elementId === "roundtrip-cta" && entry.targetPath === "animation.from")?.valueType,
  "json",
  "Captured template content should persist inferred animation controls",
);

const directDesignEnvelopeInput = normalizeInputFromDirectFrontendDesignEnvelope({
  title: "Direct API Design",
  design: {
    templateId: "direct-api-template",
    customCss: ".direct-api-cta { color: var(--backy-color-primary); }",
    contentDocument: {
      schemaVersion: "backy.content.v1",
      editableMap: {
        "direct.hero": {
          elementId: "direct-api-hero",
          targetPath: "props.content",
        },
      },
      elements: [
        {
          id: "direct-api-hero",
          type: "heading",
          props: { content: "Direct API Hero" },
        },
        {
          id: "direct-api-cta",
          type: "button",
          props: {
            label: "Download guide",
            fileMediaIds: ["direct-api-file"],
            fileSignedUrlRequired: true,
          },
          responsive: {
            mobile: {
              props: {
                fileSignedUrlRequired: false,
              },
            },
          },
          animation: {
            type: "custom",
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          actions: [{ id: "direct-api-action", type: "download" }],
        },
      ],
    },
  },
});
const directDesignContent = directDesignEnvelopeInput.content as Record<string, unknown>;
const directDesignMeta = directDesignEnvelopeInput.meta as Record<string, unknown>;
const directContentEditableMap = directDesignContent.editableMap as Record<string, Record<string, unknown>>;
const directMetaEditableMap = directDesignMeta.frontendDesignEditableMap as Record<string, Record<string, unknown>>;
assert.equal(
  directContentEditableMap["direct.hero"]?.targetPath,
  "props.content",
  "Direct design envelope content should preserve explicit editable maps from contentDocument",
);
assert.equal(
  Object.values(directContentEditableMap).find((entry) => entry.elementId === "direct-api-cta" && entry.targetPath === "props.fileMediaIds")?.valueType,
  "file",
  "Direct design envelope content should infer file controls",
);
assert.equal(
  Object.values(directMetaEditableMap).find((entry) => entry.elementId === "direct-api-cta" && entry.targetPath === "responsive.mobile.props.fileSignedUrlRequired")?.valueType,
  "boolean",
  "Direct design envelope metadata should retain inferred responsive toggles",
);
assert.equal(
  Object.values(directMetaEditableMap).find((entry) => entry.elementId === "direct-api-cta" && entry.targetPath === "animation.from")?.valueType,
  "json",
  "Direct design envelope metadata should retain inferred animation controls",
);

const directNoTemplateDesignInput = normalizeInputFromDirectFrontendDesignEnvelope({
  slug: "imported-direct-design",
  title: "Imported Direct Design",
  design: {
    contentDocument: {
      id: "raw-imported-direct-design",
      schemaVersion: "backy.content.v1",
      elements: [
        {
          id: "raw-imported-direct-hero",
          type: "heading",
          props: { content: "Imported without a template id" },
        },
      ],
    },
  },
});
const directNoTemplateMeta = directNoTemplateDesignInput.meta as Record<string, unknown>;
const directNoTemplateProvenance = frontendDesignProvenanceFromMetadata(directNoTemplateMeta);
assert.equal(
  directNoTemplateMeta.frontendDesignTemplateId,
  "content-raw-imported-direct-design",
  "Direct design envelopes without template ids should receive stable frontend-design provenance ids",
);
assert.equal(
  directNoTemplateProvenance?.templateId,
  "content-raw-imported-direct-design",
  "Frontend-design provenance should remain public-readable for direct designs without explicit template ids",
);

const directRecordDesignInput = normalizeInputFromDirectFrontendDesignEnvelope({
  title: "Imported record-shaped design",
  design: {
    contentDocument: {
      id: "raw-imported-record-shaped-design",
      elements: [{ id: "record-shaped-hero", type: "section" }],
    },
    animations: {
      intro: { timeline: "record-shaped-intro", targetId: "record-shaped-hero" },
    },
    assets: {
      hero: { mediaId: "record_shape_media" },
    },
    interactions: {
      reveal: { action: "revealRecordShape" },
    },
  },
});
const directRecordDesignContent = directRecordDesignInput.content as Record<string, unknown>;
const directRecordDesignMeta = directRecordDesignInput.meta as Record<string, unknown>;
const directRecordDesignProvenance = frontendDesignProvenanceFromMetadata(directRecordDesignMeta);
assert.equal(
  ((directRecordDesignContent.animations as Record<string, Record<string, unknown>>).intro)?.timeline,
  "record-shaped-intro",
  "Direct design content should retain record-shaped animation maps",
);
assert.equal(
  ((directRecordDesignMeta.frontendDesignAnimations as Record<string, Record<string, unknown>>).intro)?.timeline,
  "record-shaped-intro",
  "Direct design metadata should retain record-shaped animation maps",
);
assert.equal(
  ((directRecordDesignProvenance?.animations as Record<string, Record<string, unknown>> | undefined)?.intro)?.timeline,
  "record-shaped-intro",
  "Frontend-design provenance should expose record-shaped animation maps",
);

const directReusableSectionInput = normalizeReusableSectionInputFromDirectFrontendDesignEnvelope({
  name: "Direct API Section",
  design: {
    templateId: "direct-api-section-template",
    animations: {
      intro: { timeline: "section-record-intro", targetId: "direct-api-section-cta" },
    },
    elements: [
      {
        id: "direct-api-section-cta",
        type: "button",
        props: {
          label: "Save section",
          downloadMediaIds: ["direct-api-section-file"],
        },
      },
    ],
  },
});
const directReusableMetadata = directReusableSectionInput.metadata as Record<string, unknown>;
const directReusableContent = directReusableSectionInput.content as Record<string, unknown>;
const directReusableEditableMap = directReusableMetadata.frontendDesignEditableMap as Record<string, Record<string, unknown>>;
assert.equal(
  ((directReusableContent.animations as Record<string, Record<string, unknown>>).intro)?.timeline,
  "section-record-intro",
  "Direct reusable-section design content should retain record-shaped animations",
);
assert.equal(
  ((directReusableMetadata.frontendDesignAnimations as Record<string, Record<string, unknown>>).intro)?.timeline,
  "section-record-intro",
  "Direct reusable-section metadata should retain record-shaped animations",
);
assert.equal(
  Object.values(directReusableEditableMap).find((entry) => entry.elementId === "direct-api-section-cta" && entry.targetPath === "props.downloadMediaIds")?.valueType,
  "file",
  "Direct reusable-section design envelope should infer downloadable file controls",
);

const directCollectionRecordInput = normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope({
  values: {
    title: "Direct API Record",
  },
  design: {
    templateId: "direct-api-record-template",
    elements: [
      {
        id: "direct-api-record-card",
        type: "button",
        props: {
          label: "Record CTA",
          backgroundColor: "#0f766e",
        },
        dataBindings: [
          {
            source: { collectionId: "articles", field: "title" },
            targetPath: "props.label",
          },
        ],
      },
    ],
  },
});
const directRecordDesign = (directCollectionRecordInput.values as Record<string, unknown>).design as Record<string, unknown>;
const directRecordEditableMap = directRecordDesign.frontendDesignEditableMap as Record<string, Record<string, unknown>>;
assert.equal(
  Object.values(directRecordEditableMap).find((entry) => entry.elementId === "direct-api-record-card" && entry.targetPath === "props.backgroundColor")?.valueType,
  "color",
  "Direct collection-record design envelope should infer color controls",
);
assert.equal(
  Object.values(directRecordEditableMap).find((entry) => (
    entry.elementId === "direct-api-record-card" &&
    entry.targetPath === "props.label" &&
    entry.sourceField === "title"
  ))?.sourceField,
  "title",
  "Direct collection-record design envelope should infer data-binding controls",
);

const seededFromCapturedTemplate = seedInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-template",
    title: "Seeded Roundtrip Page",
  },
  templateType: "page",
  kind: "page",
  title: "Seeded Roundtrip Page",
  description: "Seeded from a captured custom frontend template.",
});
assert.equal(seededFromCapturedTemplate.ok, true, "Captured template should seed a page input");
if (seededFromCapturedTemplate.ok) {
  const seededContent = seededFromCapturedTemplate.body.content as Record<string, unknown>;
  const seededMeta = seededFromCapturedTemplate.body.meta as Record<string, unknown>;
  assert(Array.isArray(seededContent.assets), "Seeded page content should retain asset manifest arrays");
  assert(Array.isArray(seededContent.animations), "Seeded page content should retain animation timeline arrays");
  assert(Array.isArray(seededContent.interactions), "Seeded page content should retain interaction arrays");
  assert.equal((seededContent.animations as Array<Record<string, unknown>>)[0]?.timeline, "hero-intro");
  assert(Array.isArray(seededMeta.frontendDesignAssets), "Seeded page meta should retain frontendDesignAssets");
  assert(Array.isArray(seededMeta.frontendDesignAnimations), "Seeded page meta should retain frontendDesignAnimations");
  assert(Array.isArray(seededMeta.frontendDesignInteractions), "Seeded page meta should retain frontendDesignInteractions");
  const seededContentEditableMap = seededContent.editableMap as Record<string, Record<string, unknown>>;
  const seededMetaEditableMap = seededMeta.frontendDesignEditableMap as Record<string, Record<string, unknown>>;
  assert.equal(
    Object.values(seededContentEditableMap).find((entry) => entry.elementId === "roundtrip-cta" && entry.targetPath === "props.backgroundColor")?.valueType,
    "color",
    "Seeded page content should retain inferred editable color controls",
  );
  assert.equal(
    Object.values(seededMetaEditableMap).find((entry) => entry.elementId === "roundtrip-cta" && entry.targetPath === "animation.from")?.valueType,
    "json",
    "Seeded page metadata should retain inferred editable animation controls",
  );
}

const mergedExistingContent = seedInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-template",
    content: {
      elements: [
        {
          id: "existing-body",
          type: "paragraph",
          props: {
            content: "Author-created body",
          },
        },
      ],
    },
  },
  templateType: "page",
  kind: "page",
  title: "Existing Content Roundtrip Page",
});
assert.equal(mergedExistingContent.ok, true, "Captured template should merge into existing page content");
if (mergedExistingContent.ok) {
  const mergedContent = mergedExistingContent.body.content as Record<string, unknown>;
  assert(Array.isArray(mergedContent.assets), "Merged page content should retain captured asset arrays");
  assert(Array.isArray(mergedContent.animations), "Merged page content should retain captured animation arrays");
  assert(Array.isArray(mergedContent.interactions), "Merged page content should retain captured interaction arrays");
  assert.equal((mergedContent.elements as Array<Record<string, unknown>>)[0]?.id, "existing-body");
}

const capturedBlogDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign: capturedDesignState,
  resource: {
    id: "captured-roundtrip-post",
    type: "blogPost",
    title: "Captured Roundtrip Post",
    slug: "captured-roundtrip-post",
    description: "Captured blog template should preserve the same design-state arrays.",
    content: {
      elements: [
        {
          id: "roundtrip-post-hero",
          type: "section",
          props: {
            binding: "post.title",
          },
        },
      ],
      canvasSize: { width: 1180, height: 860 },
      customCSS: ".roundtrip-post { color: var(--blog-primary); }",
      customJS: "window.__backyRoundtripBlogTemplate = true;",
      assets: [
        {
          id: "roundtrip-post-cover",
          mediaId: "media_blog_cover",
          role: "post.cover",
        },
      ],
      animations: [
        {
          id: "roundtrip-post-reveal",
          timeline: "post-reveal",
          tokenRefs: {
            duration: "motion.duration.medium",
          },
        },
      ],
      interactions: [
        {
          id: "roundtrip-post-share",
          trigger: "click",
          action: "openShareSheet",
        },
      ],
      dataBindings: {
        postTitle: {
          source: "post.title",
          targetPath: "elements.roundtrip-post-hero.props.content",
        },
      },
      editableMap: {
        "post.title": {
          elementId: "roundtrip-post-hero",
          path: "props.content",
        },
      },
      seo: {
        title: "Captured Roundtrip Post",
      },
    },
  },
  templateId: "captured-roundtrip-blog-template",
  templateName: "Captured Roundtrip Blog Template",
  routePattern: "/journal/captured/{slug}",
});

const capturedBlogRoundtripTemplate = capturedBlogDesignState.templates.find(
  (template) => template.id === "captured-roundtrip-blog-template",
);
assert(capturedBlogRoundtripTemplate, "Captured blog template should be added to the design contract");
assert.equal(capturedBlogRoundtripTemplate.type, "blogPost");
const capturedBlogRoundtripContent = capturedBlogRoundtripTemplate.content as Record<string, unknown>;
assert(Array.isArray(capturedBlogRoundtripContent.assets), "Captured blog template should preserve asset arrays");
assert(Array.isArray(capturedBlogRoundtripContent.animations), "Captured blog template should preserve animation arrays");
assert(Array.isArray(capturedBlogRoundtripContent.interactions), "Captured blog template should preserve interaction arrays");
assert.equal((capturedBlogRoundtripContent.assets as Array<Record<string, unknown>>)[0]?.mediaId, "media_blog_cover");
assert.equal((capturedBlogRoundtripContent.animations as Array<Record<string, unknown>>)[0]?.timeline, "post-reveal");

const seededBlogFromCapturedTemplate = seedInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedBlogDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-blog-template",
    title: "Seeded Roundtrip Post",
  },
  templateType: "blogPost",
  kind: "post",
  title: "Seeded Roundtrip Post",
  excerpt: "Seeded from a captured custom frontend blog template.",
});
assert.equal(seededBlogFromCapturedTemplate.ok, true, "Captured blog template should seed a post input");
if (seededBlogFromCapturedTemplate.ok) {
  const seededBlogContent = seededBlogFromCapturedTemplate.body.content as Record<string, unknown>;
  const seededBlogMeta = seededBlogFromCapturedTemplate.body.meta as Record<string, unknown>;
  assert(Array.isArray(seededBlogContent.assets), "Seeded blog content should retain asset arrays");
  assert(Array.isArray(seededBlogContent.animations), "Seeded blog content should retain animation arrays");
  assert(Array.isArray(seededBlogContent.interactions), "Seeded blog content should retain interaction arrays");
  assert.equal((seededBlogContent.animations as Array<Record<string, unknown>>)[0]?.timeline, "post-reveal");
  assert(Array.isArray(seededBlogMeta.frontendDesignAssets), "Seeded blog meta should retain frontendDesignAssets");
  assert(Array.isArray(seededBlogMeta.frontendDesignAnimations), "Seeded blog meta should retain frontendDesignAnimations");
  assert(Array.isArray(seededBlogMeta.frontendDesignInteractions), "Seeded blog meta should retain frontendDesignInteractions");
}

const mergedExistingBlogContent = seedInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedBlogDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-blog-template",
    content: {
      elements: [
        {
          id: "existing-post-body",
          type: "paragraph",
          props: {
            content: "Author-created post body",
          },
        },
      ],
    },
  },
  templateType: "blogPost",
  kind: "post",
  title: "Existing Content Roundtrip Post",
});
assert.equal(mergedExistingBlogContent.ok, true, "Captured blog template should merge into existing post content");
if (mergedExistingBlogContent.ok) {
  const mergedBlogContent = mergedExistingBlogContent.body.content as Record<string, unknown>;
  assert(Array.isArray(mergedBlogContent.assets), "Merged blog content should retain captured asset arrays");
  assert(Array.isArray(mergedBlogContent.animations), "Merged blog content should retain captured animation arrays");
  assert(Array.isArray(mergedBlogContent.interactions), "Merged blog content should retain captured interaction arrays");
  assert.equal((mergedBlogContent.elements as Array<Record<string, unknown>>)[0]?.id, "existing-post-body");
}

const capturedSectionDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign: capturedBlogDesignState,
  resource: {
    id: "captured-roundtrip-section",
    type: "section",
    title: "Captured Roundtrip Section",
    slug: "captured-roundtrip-section",
    description: "Captured reusable section template should preserve design-state arrays.",
    content: {
      elements: [
        {
          id: "roundtrip-section-root",
          type: "section",
          props: {
            binding: "section.heading",
          },
        },
      ],
      canvasSize: { width: 960, height: 420 },
      customCSS: ".roundtrip-section { color: var(--section-primary); }",
      customJS: "window.__backyRoundtripSectionTemplate = true;",
      assets: [
        {
          id: "roundtrip-section-pattern",
          mediaId: "media_section_pattern",
          role: "section.background",
        },
      ],
      animations: [
        {
          id: "roundtrip-section-enter",
          timeline: "section-enter",
        },
      ],
      interactions: [
        {
          id: "roundtrip-section-expand",
          trigger: "click",
          action: "toggleSection",
        },
      ],
      dataBindings: {
        sectionHeading: {
          source: "section.heading",
          targetPath: "elements.roundtrip-section-root.props.content",
        },
      },
      editableMap: {
        "section.heading": {
          elementId: "roundtrip-section-root",
          path: "props.content",
        },
      },
    },
  },
  templateId: "captured-roundtrip-section-template",
  templateName: "Captured Roundtrip Section Template",
  routePattern: "/sections/captured-roundtrip",
});

const seededSectionFromCapturedTemplate = seedSectionInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedSectionDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-section-template",
    name: "Seeded Roundtrip Section",
    slug: "seeded-roundtrip-section",
  },
});
assert.equal(seededSectionFromCapturedTemplate.ok, true, "Captured section template should seed a section input");
if (seededSectionFromCapturedTemplate.ok) {
  const seededSectionContent = seededSectionFromCapturedTemplate.body.content as Record<string, unknown>;
  const seededSectionMetadata = seededSectionFromCapturedTemplate.body.metadata as Record<string, unknown>;
  assert(Array.isArray(seededSectionContent.assets), "Seeded section content should retain asset arrays");
  assert(Array.isArray(seededSectionContent.animations), "Seeded section content should retain animation arrays");
  assert(Array.isArray(seededSectionContent.interactions), "Seeded section content should retain interaction arrays");
  assert.equal((seededSectionContent.animations as Array<Record<string, unknown>>)[0]?.timeline, "section-enter");
  assert(Array.isArray(seededSectionMetadata.frontendDesignAssets), "Seeded section metadata should retain frontendDesignAssets");
  assert(Array.isArray(seededSectionMetadata.frontendDesignAnimations), "Seeded section metadata should retain frontendDesignAnimations");
  assert(Array.isArray(seededSectionMetadata.frontendDesignInteractions), "Seeded section metadata should retain frontendDesignInteractions");
}

const mergedExistingSectionContent = seedSectionInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedSectionDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-section-template",
    name: "Existing Content Roundtrip Section",
    slug: "existing-content-roundtrip-section",
    content: {
      elements: [
        {
          id: "existing-section-body",
          type: "paragraph",
          props: {
            content: "Author-created reusable section body",
          },
        },
      ],
    },
  },
});
assert.equal(mergedExistingSectionContent.ok, true, "Captured section template should merge into existing section content");
if (mergedExistingSectionContent.ok) {
  const mergedSectionContent = mergedExistingSectionContent.body.content as Record<string, unknown>;
  assert(Array.isArray(mergedSectionContent.assets), "Merged section content should retain captured asset arrays");
  assert(Array.isArray(mergedSectionContent.animations), "Merged section content should retain captured animation arrays");
  assert(Array.isArray(mergedSectionContent.interactions), "Merged section content should retain captured interaction arrays");
  assert.equal((mergedSectionContent.elements as Array<Record<string, unknown>>)[0]?.id, "existing-section-body");
}

const nestedSectionTemplateDesignState = {
  ...capturedSectionDesignState,
  templates: [
    ...capturedSectionDesignState.templates,
    {
      id: "nested-section-template",
      type: "section",
      name: "Nested Section Template",
      routePattern: "/sections/nested-section",
      content: {
        section: {
          elements: [
            {
              id: "nested-section-root",
              type: "section",
              props: { content: "Nested reusable section" },
            },
          ],
          canvasSize: { width: 1000, height: 360 },
          customCSS: ".nested-section { color: var(--nested-section); }",
        },
        customJS: "window.__backyNestedSectionTemplate = true;",
        contentDocument: {
          schemaVersion: "backy.content.v1",
          id: "nested-section-document",
          kind: "template",
          version: "1",
          elements: [],
          editableMap: {},
          metadata: {
            canvasSize: { width: 1000, height: 360 },
          },
        },
        assets: [
          {
            id: "nested-section-asset",
            mediaId: "media_nested_section",
            role: "section.background",
          },
        ],
        animations: [
          {
            id: "nested-section-enter",
            timeline: "nested-section-enter",
          },
        ],
        interactions: [
          {
            id: "nested-section-hover",
            trigger: "hover",
            action: "playAnimation",
          },
        ],
        dataBindings: {
          nestedHeading: {
            source: "section.nestedHeading",
            targetPath: "elements.nested-section-root.props.content",
          },
        },
        editableMap: {
          "section.nestedHeading": {
            elementId: "nested-section-root",
            path: "props.content",
          },
        },
        seo: {
          title: "Nested reusable section",
        },
        metadata: {
          templateKind: "nested-section",
        },
      },
      bindingHints: [{ role: "section.nestedHeading", binding: "section.nestedHeading" }],
    },
  ],
} as typeof capturedSectionDesignState;

const seededNestedSection = seedSectionInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: nestedSectionTemplateDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "nested-section-template",
    name: "Seeded Nested Section",
    slug: "seeded-nested-section",
  },
});
assert.equal(seededNestedSection.ok, true, "Nested section template should seed a section input");
if (seededNestedSection.ok) {
  const seededNestedContent = seededNestedSection.body.content as Record<string, unknown>;
  assert.equal((seededNestedContent.elements as Array<Record<string, unknown>>)[0]?.id, "nested-section-root");
  assert((seededNestedContent.contentDocument as Record<string, unknown>)?.schemaVersion === "backy.content.v1", "Nested section content should retain contentDocument");
  assert(Array.isArray(seededNestedContent.assets), "Nested section content should retain root asset arrays");
  assert(Array.isArray(seededNestedContent.animations), "Nested section content should retain root animation arrays");
  assert(Array.isArray(seededNestedContent.interactions), "Nested section content should retain root interaction arrays");
  assert((seededNestedContent.dataBindings as Record<string, unknown>)?.nestedHeading, "Nested section content should retain root data bindings");
  assert((seededNestedContent.editableMap as Record<string, unknown>)?.["section.nestedHeading"], "Nested section content should retain root editable map");
  assert((seededNestedContent.seo as Record<string, unknown>)?.title === "Nested reusable section", "Nested section content should retain SEO state");
  assert((seededNestedContent.metadata as Record<string, unknown>)?.templateKind === "nested-section", "Nested section content should retain template metadata");
}

const capturedProductDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign: capturedSectionDesignState,
  resource: {
    id: "captured-roundtrip-product",
    type: "product",
    title: "Captured Roundtrip Product",
    slug: "captured-roundtrip-product",
    description: "Captured product template should seed storefront design metadata.",
    content: {
      slug: "captured-roundtrip-product",
      status: "published",
      values: {
        title: "Captured Roundtrip Product",
        price: 79,
        sku: "CAPTURED-ROUNDTRIP",
      },
      assets: [
        {
          id: "roundtrip-product-gallery",
          mediaId: "media_product_gallery",
          role: "product.gallery",
        },
      ],
      animations: [
        {
          id: "roundtrip-product-card",
          timeline: "product-card",
        },
      ],
      interactions: [
        {
          id: "roundtrip-product-quick-view",
          trigger: "click",
          action: "openProductQuickView",
        },
      ],
      editableMap: {
        "product.title": {
          binding: "product.title",
          fields: ["title"],
        },
      },
    },
  },
  templateId: "captured-roundtrip-product-template",
  templateName: "Captured Roundtrip Product Template",
  routePattern: "/products/captured-roundtrip-product",
});

const seededProductFromCapturedTemplate = seedCollectionRecordInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedProductDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-product-template",
    slug: "seeded-roundtrip-product",
    status: "published",
    values: {
      sku: "SEEDED-ROUNDTRIP",
    },
  },
  templateType: "product",
});
assert.equal(seededProductFromCapturedTemplate.ok, true, "Captured product template should seed a product record input");
if (seededProductFromCapturedTemplate.ok) {
  const seededProductValues = seededProductFromCapturedTemplate.body.values as Record<string, unknown>;
  assert.equal(seededProductValues.title, "Captured Roundtrip Product");
  assert.equal(seededProductValues.price, 79);
  assert.equal(seededProductValues.sku, "SEEDED-ROUNDTRIP");
  assert(Array.isArray(seededProductValues.frontendDesignAssets), "Seeded product values should retain frontendDesignAssets");
  assert(Array.isArray(seededProductValues.frontendDesignAnimations), "Seeded product values should retain frontendDesignAnimations");
  assert(Array.isArray(seededProductValues.frontendDesignInteractions), "Seeded product values should retain frontendDesignInteractions");
  assert.equal((seededProductValues.frontendDesignAnimations as Array<Record<string, unknown>>)[0]?.timeline, "product-card");
}

const capturedFormDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign: capturedProductDesignState,
  resource: {
    id: "captured-roundtrip-form",
    type: "form",
    title: "Captured Roundtrip Form",
    slug: "captured-roundtrip-form",
    description: "Captured form template should seed settings provenance.",
    content: {
      name: "captured-roundtrip-form",
      title: "Captured Roundtrip Form",
      fields: [
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
        },
      ],
      assets: [
        {
          id: "roundtrip-form-icon",
          mediaId: "media_form_icon",
          role: "form.icon",
        },
      ],
      animations: [
        {
          id: "roundtrip-form-focus",
          timeline: "form-focus",
        },
      ],
      interactions: [
        {
          id: "roundtrip-form-submit",
          trigger: "submit",
          action: "trackConversion",
        },
      ],
      editableMap: {
        "form.email": {
          binding: "form.fields.email",
          fields: ["label", "placeholder", "required"],
        },
      },
    },
  },
  templateId: "captured-roundtrip-form-template",
  templateName: "Captured Roundtrip Form Template",
  routePattern: "/forms/captured-roundtrip",
});

const seededFormFromCapturedTemplate = seedFormInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedFormDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-form-template",
    name: "seeded-roundtrip-form",
    title: "Seeded Roundtrip Form",
  },
});
assert.equal(seededFormFromCapturedTemplate.ok, true, "Captured form template should seed a form input");
if (seededFormFromCapturedTemplate.ok) {
  const seededFormSettings = seededFormFromCapturedTemplate.body.settings as Record<string, unknown>;
  assert(Array.isArray(seededFormFromCapturedTemplate.body.fields), "Seeded form should retain template fields");
  assert(Array.isArray(seededFormSettings.frontendDesignAssets), "Seeded form settings should retain frontendDesignAssets");
  assert(Array.isArray(seededFormSettings.frontendDesignAnimations), "Seeded form settings should retain frontendDesignAnimations");
  assert(Array.isArray(seededFormSettings.frontendDesignInteractions), "Seeded form settings should retain frontendDesignInteractions");
  assert.equal((seededFormSettings.frontendDesignAnimations as Array<Record<string, unknown>>)[0]?.timeline, "form-focus");
  const publicFormDesign = frontendDesignProvenanceFromMetadata(seededFormSettings);
  assert.equal(publicFormDesign?.templateId, "captured-roundtrip-form-template");
  assert.equal(firstRecord(publicFormDesign?.animations)?.timeline, "form-focus");
  assert.equal(firstRecord(publicFormDesign?.assets)?.mediaId, "media_form_icon");
  assert.equal(firstRecord(publicFormDesign?.interactions)?.action, "trackConversion");
}

const capturedCollectionDesignState = buildFrontendDesignContractFromContentTemplate({
  frontendDesign: capturedFormDesignState,
  resource: {
    id: "captured-roundtrip-collection",
    type: "collection",
    title: "Captured Roundtrip Collection",
    slug: "captured-roundtrip-collection",
    description: "Captured collection template should seed schema metadata.",
    content: {
      name: "Captured Roundtrip Collection",
      slug: "captured-roundtrip-collection",
      routePattern: "/roundtrip/:recordSlug",
      listRoutePattern: "/roundtrip",
      fields: [
        {
          key: "title",
          label: "Title",
          type: "text",
          required: true,
        },
      ],
      permissions: {
        publicRead: true,
        publicCreate: false,
      },
      assets: [
        {
          id: "roundtrip-collection-card",
          mediaId: "media_collection_card",
          role: "collection.card",
        },
      ],
      animations: [
        {
          id: "roundtrip-collection-list",
          timeline: "collection-list",
        },
      ],
      interactions: [
        {
          id: "roundtrip-collection-filter",
          trigger: "change",
          action: "filterRecords",
        },
      ],
      editableMap: {
        "collection.title": {
          binding: "collection.fields.title",
          fields: ["label", "required"],
        },
      },
    },
  },
  templateId: "captured-roundtrip-collection-template",
  templateName: "Captured Roundtrip Collection Template",
  routePattern: "/roundtrip/:recordSlug",
});

const seededCollectionFromCapturedTemplate = seedCollectionInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedCollectionDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-collection-template",
    name: "Seeded Roundtrip Collection",
    slug: "seeded-roundtrip-collection",
  },
});
assert.equal(seededCollectionFromCapturedTemplate.ok, true, "Captured collection template should seed a collection input");
if (seededCollectionFromCapturedTemplate.ok) {
  const seededCollectionMetadata = seededCollectionFromCapturedTemplate.body.metadata as Record<string, unknown>;
  assert(Array.isArray(seededCollectionFromCapturedTemplate.body.fields), "Seeded collection should retain template fields");
  assert(Array.isArray(seededCollectionMetadata.frontendDesignAssets), "Seeded collection metadata should retain frontendDesignAssets");
  assert(Array.isArray(seededCollectionMetadata.frontendDesignAnimations), "Seeded collection metadata should retain frontendDesignAnimations");
  assert(Array.isArray(seededCollectionMetadata.frontendDesignInteractions), "Seeded collection metadata should retain frontendDesignInteractions");
  assert.equal((seededCollectionMetadata.frontendDesignAnimations as Array<Record<string, unknown>>)[0]?.timeline, "collection-list");
  const publicCollectionDesign = frontendDesignProvenanceFromMetadata(seededCollectionMetadata);
  assert.equal(publicCollectionDesign?.templateId, "captured-roundtrip-collection-template");
  assert.equal(firstRecord(publicCollectionDesign?.animations)?.timeline, "collection-list");
  assert.equal(firstRecord(publicCollectionDesign?.assets)?.mediaId, "media_collection_card");
  assert.equal(firstRecord(publicCollectionDesign?.interactions)?.action, "filterRecords");
}

const seededCollectionRecordFromCapturedTemplate = seedCollectionRecordInputFromFrontendDesignTemplate({
  siteSettings: { frontendDesign: capturedCollectionDesignState } as SiteSettings,
  body: {
    frontendDesignTemplateId: "captured-roundtrip-collection-template",
    slug: "seeded-roundtrip-record",
    status: "published",
    values: {
      title: "Seeded Roundtrip Record",
    },
  },
  templateType: "collection",
});
assert.equal(seededCollectionRecordFromCapturedTemplate.ok, true, "Captured collection template should seed a collection record input");
if (seededCollectionRecordFromCapturedTemplate.ok) {
  const seededCollectionRecordValues = seededCollectionRecordFromCapturedTemplate.body.values as Record<string, unknown>;
  assert.equal(seededCollectionRecordValues.title, "Seeded Roundtrip Record");
  assert(Array.isArray(seededCollectionRecordValues.frontendDesignAssets), "Seeded collection record values should retain frontendDesignAssets");
  assert(Array.isArray(seededCollectionRecordValues.frontendDesignAnimations), "Seeded collection record values should retain frontendDesignAnimations");
  assert(Array.isArray(seededCollectionRecordValues.frontendDesignInteractions), "Seeded collection record values should retain frontendDesignInteractions");
  assert.equal((seededCollectionRecordValues.frontendDesignAnimations as Array<Record<string, unknown>>)[0]?.timeline, "collection-list");
  const publicCollectionRecordDesign = frontendDesignProvenanceFromMetadata(seededCollectionRecordValues);
  assert.equal(publicCollectionRecordDesign?.templateId, "captured-roundtrip-collection-template");
  assert.equal(firstRecord(publicCollectionRecordDesign?.animations)?.timeline, "collection-list");
  assert.equal(firstRecord(publicCollectionRecordDesign?.assets)?.mediaId, "media_collection_card");
}

if (seededProductFromCapturedTemplate.ok) {
  const publicProduct = productRecordToCommerceProduct({
    id: "record_seeded_roundtrip_product",
    slug: "seeded-roundtrip-product",
    status: "published",
    values: seededProductFromCapturedTemplate.body.values as Record<string, unknown>,
    updatedAt: "2026-05-22T00:00:00.000Z",
    publishedAt: "2026-05-22T00:00:00.000Z",
  });
  const productDesign = publicProduct.design;
  assert(productDesign, "Seeded public product should expose design metadata");
  assert.equal(productDesign.templateId, "captured-roundtrip-product-template");
  assert(Array.isArray(productDesign.animations), "Seeded public product design should expose array animations");
  assert(Array.isArray(productDesign.assets), "Seeded public product design should expose array assets");
  assert(Array.isArray(productDesign.interactions), "Seeded public product design should expose array interactions");
  assert.equal((productDesign.animations[0] as Record<string, unknown> | undefined)?.timeline, "product-card");
  assert.equal((productDesign.assets[0] as Record<string, unknown> | undefined)?.mediaId, "media_product_gallery");
  assert.equal((productDesign.interactions[0] as Record<string, unknown> | undefined)?.action, "openProductQuickView");
}

console.log(JSON.stringify({
  ok: true,
  contract: "backy.template-registry.v1",
}, null, 2));
