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
  const updatedAt =
    stringValue(templateRecord.updatedAt) || stringValue(content.updatedAt);
  const createdAt =
    stringValue(templateRecord.createdAt) || stringValue(content.createdAt);
  const version =
    typeof templateRecord.version === "number" ||
    typeof templateRecord.version === "string"
      ? templateRecord.version
      : stringValue(content.version) || null;

  return {
    id: template.id,
    type: template.type,
    name: template.name,
    description: stringValue(template.description) || null,
    routePattern: stringValue(template.routePattern) || null,
    status: stringValue(templateRecord.status) || "active",
    source: "frontend-design",
    version,
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
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
