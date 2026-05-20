import type { SiteSettings } from "@backy-cms/core";

type FrontendDesignContract = NonNullable<SiteSettings["frontendDesign"]>;
type FrontendDesignTemplate = FrontendDesignContract["templates"][number];
type FrontendDesignTemplateType = FrontendDesignTemplate["type"];

const TEMPLATE_TYPES: FrontendDesignTemplateType[] = [
  "page",
  "blogPost",
  "form",
  "product",
  "collection",
  "section",
];

const isTemplateType = (value: string): value is FrontendDesignTemplateType =>
  TEMPLATE_TYPES.includes(value as FrontendDesignTemplateType);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const versionValue = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return stringValue(value);
};

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

const templateContent = (
  template: FrontendDesignTemplate,
): Record<string, unknown> => recordValue(template.content) || {};

const templateElementCount = (template: FrontendDesignTemplate): number => {
  const content = templateContent(template);
  if (Array.isArray(content.elements)) return content.elements.length;
  if (Array.isArray(content.fields)) return content.fields.length;
  if (Array.isArray(content.blocks)) return content.blocks.length;
  return 0;
};

const templateVersioning = (template: FrontendDesignTemplate) => {
  const templateRecord = template as Record<string, unknown>;
  const content = templateContent(template);
  const updatedAt =
    stringValue(templateRecord.updatedAt) || stringValue(content.updatedAt);
  const createdAt =
    stringValue(templateRecord.createdAt) || stringValue(content.createdAt);
  const version =
    versionValue(templateRecord.version) || versionValue(content.version) || null;
  const status = stringValue(templateRecord.status) || "active";
  const issues = [
    ...(version ? [] : ["missing-version"]),
    ...(updatedAt ? [] : ["missing-updated-at"]),
    ...(status ? [] : ["missing-status"]),
  ];

  return {
    schemaVersion: "backy.template-version.v1",
    ready: issues.length === 0,
    status,
    version,
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    issues,
    recommendation:
      issues.length === 0
        ? "Template is ready for version-aware cloning and custom frontend handoff."
        : "Add version, status, and updatedAt metadata before treating this template as production-managed.",
  };
};

const cloneEndpointForTemplate = (
  siteId: string,
  template: FrontendDesignTemplate,
) => {
  switch (template.type) {
    case "page":
      return `/api/admin/sites/${siteId}/pages`;
    case "blogPost":
      return `/api/admin/sites/${siteId}/blog`;
    case "form":
      return `/api/admin/sites/${siteId}/forms`;
    case "section":
      return `/api/admin/sites/${siteId}/reusable-sections`;
    case "collection":
      return `/api/admin/sites/${siteId}/collections`;
    case "product":
      return `/api/admin/sites/${siteId}/collections/products/records`;
    default:
      return `/api/admin/sites/${siteId}/frontend-design`;
  }
};

const cloneBodyForTemplate = (template: FrontendDesignTemplate) => {
  const base = {
    frontendDesignTemplateId: template.id,
  };

  switch (template.type) {
    case "form":
      return {
        ...base,
        name: template.name,
        title: template.name,
      };
    case "section":
      return {
        ...base,
        name: template.name,
      };
    case "collection":
      return {
        ...base,
        name: template.name,
      };
    case "product":
      return {
        ...base,
        values: {
          title: template.name,
        },
      };
    case "blogPost":
    case "page":
    default:
      return {
        ...base,
        title: template.name,
      };
  }
};

export type BackyTemplateRegistryEntry = ReturnType<typeof templateRegistryEntry>;

const templateRegistryEntry = (
  siteId: string,
  template: FrontendDesignTemplate,
) => {
  const templateRecord = template as Record<string, unknown>;
  const content = templateContent(template);
  const versioning = templateVersioning(template);

  return {
    id: template.id,
    type: template.type,
    name: template.name,
    description: stringValue(template.description) || null,
    routePattern: stringValue(template.routePattern) || null,
    status: versioning.status,
    source: "frontend-design",
    version:
      typeof templateRecord.version === "number" ||
      typeof templateRecord.version === "string"
        ? templateRecord.version
        : versioning.version,
    createdAt: versioning.createdAt,
    updatedAt: versioning.updatedAt,
    versioning,
    contentSummary: {
      hasContent: Object.keys(content).length > 0,
      elementCount: templateElementCount(template),
      fieldCount: arrayLength(content.fields),
      bindingHintCount: arrayLength(template.bindingHints),
      hasCanvas: Boolean(recordValue(template.canvasSize) || recordValue(content.canvasSize)),
      canvasSize: recordValue(template.canvasSize) || recordValue(content.canvasSize) || null,
    },
    clone: {
      method: "POST",
      endpoint: cloneEndpointForTemplate(siteId, template),
      body: cloneBodyForTemplate(template),
    },
  };
};

export const buildTemplateRegistry = (
  siteId: string,
  frontendDesign: FrontendDesignContract,
  options: {
    type?: string | null;
    search?: string | null;
  } = {},
) => {
  const typeFilter =
    options.type && isTemplateType(options.type) ? options.type : undefined;
  const search = options.search?.trim().toLowerCase() || "";
  const templates = frontendDesign.templates
    .filter((template) => !typeFilter || template.type === typeFilter)
    .filter((template) => {
      if (!search) return true;
      return [template.id, template.name, template.description, template.routePattern]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(search));
    })
    .map((template) => templateRegistryEntry(siteId, template));

  const versionReadyCount = templates.filter((template) => template.versioning.ready).length;
  const missingVersionCount = templates.filter((template) =>
    template.versioning.issues.includes("missing-version"),
  ).length;
  const missingUpdatedAtCount = templates.filter((template) =>
    template.versioning.issues.includes("missing-updated-at"),
  ).length;
  const inactiveCount = templates.filter((template) =>
    !["active", "published"].includes(template.versioning.status),
  ).length;
  const latestUpdatedAt = templates
    .map((template) => template.versioning.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;
  const versionSummary = {
    schemaVersion: "backy.template-version-readiness.v1",
    ready: templates.length > 0 && versionReadyCount === templates.length,
    readyCount: versionReadyCount,
    templateCount: templates.length,
    missingVersionCount,
    missingUpdatedAtCount,
    inactiveCount,
    latestUpdatedAt,
  };

  const byType = TEMPLATE_TYPES.reduce(
    (groups, type) => ({
      ...groups,
      [type]: templates.filter((template) => template.type === type),
    }),
    {} as Record<FrontendDesignTemplateType, typeof templates>,
  );

  return {
    schemaVersion: "backy.template-registry.v1",
    status: frontendDesign.status,
    source: frontendDesign.source,
    templateCount: templates.length,
    totalTemplateCount: frontendDesign.templates.length,
    supportedTypes: TEMPLATE_TYPES,
    cloneField: "frontendDesignTemplateId",
    versionSummary,
    actionPlan: {
      schemaVersion: "backy.template-registry-action-plan.v1",
      status:
        templates.length === 0
          ? "empty"
          : versionSummary.ready
            ? "ready"
            : "needs-version-metadata",
      recommendedNextAction:
        templates.length === 0
          ? "Capture or import frontend templates before cloning content."
          : versionSummary.ready
            ? "Use clone targets to create version-aware pages, posts, forms, products, collections, and sections."
            : "Prepare template version metadata, then save the frontend design contract before production handoff.",
      steps: [
        ...(missingVersionCount > 0
          ? [`Add version metadata to ${missingVersionCount} template${missingVersionCount === 1 ? "" : "s"}.`]
          : []),
        ...(missingUpdatedAtCount > 0
          ? [`Add updatedAt metadata to ${missingUpdatedAtCount} template${missingUpdatedAtCount === 1 ? "" : "s"}.`]
          : []),
        ...(inactiveCount > 0
          ? [`Review ${inactiveCount} inactive template${inactiveCount === 1 ? "" : "s"} before exposing clone actions.`]
          : []),
        "Use frontendDesignTemplateId in clone bodies so custom frontends can preserve template provenance.",
      ],
    },
    cloneTargets: {
      page: `/api/admin/sites/${siteId}/pages`,
      blogPost: `/api/admin/sites/${siteId}/blog`,
      form: `/api/admin/sites/${siteId}/forms`,
      section: `/api/admin/sites/${siteId}/reusable-sections`,
      collection: `/api/admin/sites/${siteId}/collections`,
      product: `/api/admin/sites/${siteId}/collections/products/records`,
    },
    templates,
    byType,
  };
};
