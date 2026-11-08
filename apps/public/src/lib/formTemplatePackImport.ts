import { createHash } from "node:crypto";
import {
  DEFAULT_SITE_SETTINGS,
  CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS,
  serializeTemplateRevisionValue,
  FORM_TEMPLATE_PACK_SCHEMA,
  type FormTemplatePackImportRequest,
  type FormTemplatePackReview,
  type FormTemplatePackIssue,
  type FormTemplatePackTarget,
  type FormTemplatePackApplied,
  type FormTemplateReferenceKind,
  type BackyRepositories,
  type FormDefinition,
} from "@backy-cms/core";
import { collectCompleteFormsInventory } from "./formsInventory";
import { EDITOR_MEDIA_REFERENCE_KEYS } from "./editorMediaReferences";
import { validateAdminFormCollectionTarget } from "./adminFormCollectionTargetPolicy";
import {
  getSiteByIdOrSlug,
  listFormsBySite,
  getAdminSettings,
  getAdminPageById,
  getAdminBlogPostById,
  getMediaById,
  getCollectionByIdOrSlug,
  listInteractiveComponents,
  commitDemoFormTemplatePack,
} from "./backyStore";
export const formPackError = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, code });
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const kinds: FormTemplateReferenceKind[] = [
  "collections",
  "pages",
  "posts",
  "media",
  "components",
];
const secret =
  /^(password|passwd|secret|clientSecret|apiKey|serviceRoleKey|authorization|accessToken|refreshToken|privateKey|databaseUrl|connectionString|smtpPassword|providerKey|cookie|set-cookie|client_secret|api_key|service_role_key|access_token|refresh_token|private_key)$/i;
const unsafe = new Set(["__proto__", "constructor", "prototype"]);
const capturedElementTypes = new Set(
  CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS.map((contract) => contract.type),
);
const fieldTypes = new Set([
  "text",
  "email",
  "number",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "date",
  "tel",
  "url",
  "file",
]);
export function safeFormPackJson(raw: unknown) {
  let nodes = 0;
  function copy(v: any, depth: number): any {
    if (++nodes > 60000 || depth > 64)
      throw formPackError(
        413,
        "FORM_TEMPLATE_LIMIT",
        "Use at most 60,000 JSON values and 64 levels.",
      );
    if (v === null || typeof v === "boolean" || typeof v === "string") {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) {
        let u: URL;
        try {
          u = new URL(v);
        } catch {
          throw formPackError(
            400,
            "INVALID_FORM_TEMPLATE_PACK",
            "Invalid URL.",
          );
        }
        if (u.username || u.password)
          throw formPackError(
            400,
            "INVALID_FORM_TEMPLATE_PACK",
            "Remove URL credentials before importing.",
          );
      }
      return v;
    }
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (Array.isArray(v)) return v.map((x) => copy(x, depth + 1));
    if (
      !object(v) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    )
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Use plain JSON values.",
      );
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (
        unsafe.has(key) ||
        secret.test(key) ||
        !descriptor ||
        !("value" in descriptor)
      )
        throw formPackError(
          400,
          "INVALID_FORM_TEMPLATE_PACK",
          "Remove unsafe keys or credential fields before importing.",
        );
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  }
  return copy(raw, 0);
}
export function parseFormTemplatePackRequest(
  raw: unknown,
): FormTemplatePackImportRequest {
  const v = safeFormPackJson(raw);
  if (
    !object(v) ||
    !["review", "apply"].includes(v.action) ||
    !object(v.pack) ||
    v.pack.schemaVersion !== FORM_TEMPLATE_PACK_SCHEMA
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_PACK",
      "Use a version 1 Backy form template pack and review or apply action.",
    );
  if (
    !Array.isArray(v.pack.builtInTemplates || []) ||
    !Array.isArray(v.pack.frontendTemplates || [])
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_PACK",
      "Template catalogs must be arrays.",
    );
  const entries = [
    ...(v.pack.builtInTemplates || []),
    ...(v.pack.frontendTemplates || []),
  ];
  if (entries.length > 64 || entries.some((x) => !object(x)))
    throw formPackError(
      413,
      "FORM_TEMPLATE_LIMIT",
      "Use at most 64 form templates.",
    );
  if (
    !Array.isArray(v.selection) ||
    v.selection.length > 64 ||
    v.selection.some((x: any) => typeof x !== "string" || x.length > 256) ||
    new Set(v.selection).size !== v.selection.length
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_SELECTION",
      "Choose distinct template IDs.",
    );
  if (
    (v.names !== undefined && !object(v.names)) ||
    (v.references !== undefined && !object(v.references)) ||
    (v.acknowledgeUnverified !== undefined &&
      typeof v.acknowledgeUnverified !== "boolean")
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_SELECTION",
      "Invalid names, references, or acknowledgment.",
    );
  for (const [k, map] of Object.entries(v.references || {})) {
    if (
      !kinds.includes(k as any) ||
      !object(map) ||
      Object.keys(map).length > 512 ||
      Object.keys(map).some((x) => x.length > 2048) ||
      Object.values(map).some(
        (x) => typeof x !== "string" || x.length > 256 || !x.trim(),
      )
    )
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_SELECTION",
        "Use explicit canonical reference mappings.",
      );
  }
  if (
    Object.keys(v.names || {}).length > 64 ||
    Object.values(v.names || {}).some(
      (x) => typeof x !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(x),
    )
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_SELECTION",
      "Form names must use 1–128 lowercase letters, digits, underscores or hyphens.",
    );
  if (
    v.action === "apply" &&
    !/^form-pack-v1:[a-f0-9]{64}$/.test(v.reviewVersion || "")
  )
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_REVIEW",
      "Apply requires the exact reviewed version.",
    );
  return {
    ...v,
    names: v.names || {},
    references: v.references || {},
    acknowledgeUnverified: v.acknowledgeUnverified === true,
  } as FormTemplatePackImportRequest;
}
const refKeys: Record<string, FormTemplateReferenceKind> = {
  collectionId: "collections",
  pageId: "pages",
  postId: "posts",
  ...Object.fromEntries(
    EDITOR_MEDIA_REFERENCE_KEYS.map((key) => [key, "media" as const]),
  ),
};
function walk(
  v: any,
  visit: (record: Record<string, any>, path: string) => void,
  path = "$",
) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, visit, `${path}[${i}]`));
  else if (object(v)) {
    visit(v, path);
    for (const [k, x] of Object.entries(v)) walk(x, visit, `${path}.${k}`);
  }
}
export function formPackRequiredResources(
  input: FormTemplatePackImportRequest,
): Set<FormTemplateReferenceKind> {
  const used = new Set<FormTemplateReferenceKind>();
  const selected = [
    ...(input.pack.builtInTemplates || []).filter((x: any) =>
      input.selection.includes(`builtin:${x.id}`),
    ),
    ...(input.pack.frontendTemplates || []).filter((x: any) =>
      input.selection.includes(`frontend:${x.template?.id}`),
    ),
  ];
  walk(selected, (r) => {
    for (const [key, kind] of Object.entries(refKeys))
      if (typeof r[key] === "string" && r[key]) used.add(kind);
    if (typeof r.componentKey === "string") used.add("components");
    if (
      (typeof r.url === "string" && r.url.startsWith("/uploads/")) ||
      (typeof r.src === "string" && r.src.startsWith("/uploads/"))
    )
      used.add("media");
  });
  for (const kind of kinds)
    if (Object.keys(input.references[kind] || {}).length) used.add(kind);
  return used;
}
type Inventory = {
  site: any;
  billing: { overageMode: string; formLimit: number };
  forms: FormDefinition[];
  resources: Record<string, any>;
  boundary: FormTemplatePackReview["concurrencyBoundary"];
};
const resourceKey = (kind: string, id: string) => `${kind}:${id}`;
function billing(site: any, workspace: any) {
  const raw = Number(site.settings?.billingQuota?.limits?.forms);
  return {
    overageMode: workspace?.integrations?.commerce?.overageMode || "warn",
    formLimit:
      Number.isFinite(raw) && raw >= 0
        ? Math.round(raw)
        : DEFAULT_SITE_SETTINGS.billingQuota.limits.forms,
  };
}

async function readResource(
  siteId: string,
  kind: FormTemplateReferenceKind,
  id: string,
  repos?: BackyRepositories,
) {
  if (repos) {
    switch (kind) {
      case "collections":
        return repos.collections.getById(siteId, id);
      case "pages":
        return repos.pages.getById(siteId, id);
      case "posts":
        return repos.posts.getById(siteId, id);
      case "media":
        return repos.media.getById(siteId, id);
      case "components":
        return repos.interactiveComponents.getById(siteId, id);
    }
  }
  switch (kind) {
    case "collections":
      return getCollectionByIdOrSlug(siteId, id, { includeUnpublished: true });
    case "pages":
      return getAdminPageById(siteId, id);
    case "posts":
      return getAdminBlogPostById(siteId, id);
    case "media":
      return getMediaById(siteId, id);
    case "components":
      return listInteractiveComponents(siteId).find((x) => x.id === id);
  }
}
export async function readFormPackInventory(
  siteId: string,
  input: FormTemplatePackImportRequest,
  repos?: BackyRepositories,
): Promise<Inventory> {
  try {
    const site = repos
      ? await repos.sites.getById(siteId)
      : getSiteByIdOrSlug(siteId);
    if (!site) throw formPackError(404, "SITE_NOT_FOUND", "Site not found.");
    const forms = repos
      ? await collectCompleteFormsInventory(siteId, async (p) => {
          const page = await repos.forms.list({ siteId, ...p });
          if (page.pagination.total > 20000) throw new Error();
          return page;
        })
      : listFormsBySite(siteId);
    if (
      forms.length > 20000 ||
      forms.some((f) => f.siteId !== siteId) ||
      new Set(forms.map((f) => f.id)).size !== forms.length
    )
      throw new Error();
    const resources: Record<string, any> = {};
    for (const kind of kinds)
      for (const id of new Set(Object.values(input.references[kind] || {})))
        resources[resourceKey(kind, id)] =
          (await readResource(siteId, kind, id, repos)) || null;
    return {
      site,
      billing: billing(
        site,
        repos ? await repos.settings.get() : getAdminSettings(),
      ),
      forms,
      resources,
      boundary: repos
        ? "database-serializable-transaction"
        : "demo-single-process",
    };
  } catch (e) {
    if ((e as any).code === "SITE_NOT_FOUND") throw e;
    throw formPackError(
      503,
      "FORM_TEMPLATE_INVENTORY_INCOMPLETE",
      "Complete current site inventory is unavailable. Retry review.",
    );
  }
}
function demoInventory(
  siteId: string,
  input: FormTemplatePackImportRequest,
): Inventory {
  const site = getSiteByIdOrSlug(siteId);
  if (!site) throw formPackError(404, "SITE_NOT_FOUND", "Site not found.");
  const forms = listFormsBySite(siteId),
    resources: Record<string, any> = {};
  for (const kind of kinds)
    for (const id of new Set(Object.values(input.references[kind] || {}))) {
      const value =
        kind === "collections"
          ? getCollectionByIdOrSlug(siteId, id, { includeUnpublished: true })
          : kind === "pages"
            ? getAdminPageById(siteId, id)
            : kind === "posts"
              ? getAdminBlogPostById(siteId, id)
              : kind === "media"
                ? getMediaById(siteId, id)
                : listInteractiveComponents(siteId).find((x) => x.id === id);
      resources[resourceKey(kind, id)] = value || null;
    }
  if (
    forms.length > 20000 ||
    forms.some((f) => f.siteId !== siteId) ||
    new Set(forms.map((f) => f.id)).size !== forms.length
  )
    throw formPackError(
      503,
      "FORM_TEMPLATE_INVENTORY_INCOMPLETE",
      "Complete form inventory unavailable.",
    );
  return {
    site,
    billing: billing(site, getAdminSettings()),
    forms,
    resources,
    boundary: "demo-single-process",
  };
}
export function reviewFormTemplatePack(
  input: FormTemplatePackImportRequest,
  inventory: Inventory,
): FormTemplatePackReview {
  const issues: FormTemplatePackIssue[] = [],
    targets: FormTemplatePackTarget[] = [],
    ids = new Set<string>();
  const add = (
    targetId: string,
    path: string,
    code: string,
    message: string,
    severity: "blocking" | "unverified" = "blocking",
  ) => issues.push({ targetId, path, code, message, severity });
  const candidates = [
    ...(input.pack.builtInTemplates || []).map((form: any) => ({
      source: "builtin" as const,
      form,
      template: form,
      settings: form.settings || {},
    })),
    ...(input.pack.frontendTemplates || []).map((x: any) => ({
      source: "frontend" as const,
      form: x.form,
      template: x.template,
      settings: x.settings || {},
    })),
  ];
  for (const candidate of candidates) {
    const { source } = candidate,
      raw = candidate.form,
      template = candidate.template;
    if (
      !object(raw) ||
      !object(template) ||
      raw.schemaVersion !== "backy.form-template.v1" ||
      typeof template.id !== "string" ||
      !template.id ||
      template.id.length > 128
    )
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Every template needs a valid manifest and stable ID.",
      );
    const id = `${source}:${template.id}`;
    if (ids.has(id))
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Duplicate template ID.",
      );
    ids.add(id);
    const selected = input.selection.includes(id),
      name =
        input.names[id] ||
        String(raw.id || template.id)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-");
    if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(name))
      add(id, "name", "INVALID_NAME", "Choose a valid destination form name.");
    if (inventory.forms.some((f) => f.name === name))
      add(
        id,
        "name",
        "FORM_NAME_CONFLICT",
        "A current destination form already uses this name. Choose another name.",
      );
    if (!Array.isArray(raw.fields) || raw.fields.length > 128)
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Use an array of at most 128 fields.",
      );
    const keys = new Set<string>();
    raw.fields.forEach((f: any, i: number) => {
      if (
        !object(f) ||
        typeof f.key !== "string" ||
        !/^[a-z][a-z0-9_]{0,127}$/.test(f.key) ||
        keys.has(f.key) ||
        !fieldTypes.has(f.type) ||
        typeof f.label !== "string" ||
        !f.label.trim()
      )
        add(
          id,
          `fields[${i}]`,
          "INVALID_FIELD",
          "Fields need unique safe keys, labels and supported types.",
        );
      keys.add(f?.key);
      if (
        f?.validation !== undefined &&
        (!Array.isArray(f.validation) ||
          f.validation.some(
            (r: any) =>
              !object(r) ||
              ![
                "required",
                "minLength",
                "maxLength",
                "pattern",
                "min",
                "max",
              ].includes(r.type) ||
              typeof r.message !== "string",
          ))
      )
        add(
          id,
          `fields[${i}].validation`,
          "INVALID_FIELD_VALIDATION",
          "Unsupported validation rule.",
        );
      if (
        f?.options !== undefined &&
        (!Array.isArray(f.options) ||
          f.options.some((x: any) => typeof x !== "string"))
      )
        add(
          id,
          `fields[${i}].options`,
          "INVALID_FIELD_OPTIONS",
          "Options must be strings.",
        );
    });
    if (!object(candidate.settings))
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Template settings must be a JSON object.",
      );
    for (const key of [
      "title",
      "description",
      "notificationEmail",
      "notificationWebhook",
      "successRedirectUrl",
      "successMessage",
    ])
      if (
        raw[key] !== undefined &&
        raw[key] !== null &&
        typeof raw[key] !== "string"
      )
        add(
          id,
          key,
          "INVALID_FORM_CONFIGURATION",
          "Declared text configuration must be a string or null.",
        );
    for (const key of ["isActive", "enableHoneypot", "enableCaptcha"])
      if (raw[key] !== undefined && typeof raw[key] !== "boolean")
        add(
          id,
          key,
          "INVALID_FORM_CONFIGURATION",
          "Declared boolean configuration must be boolean.",
        );
    for (const key of [
      "spamSettings",
      "consentSettings",
      "contactShare",
      "collectionTarget",
    ])
      if (raw[key] !== undefined && !object(raw[key]))
        add(
          id,
          key,
          "INVALID_FORM_CONFIGURATION",
          "Declared policy settings must remain a JSON object.",
        );
    for (const key of ["contactShare", "collectionTarget"])
      if (
        object(raw[key]) &&
        raw[key].enabled !== undefined &&
        typeof raw[key].enabled !== "boolean"
      )
        add(
          id,
          `${key}.enabled`,
          "INVALID_FORM_CONFIGURATION",
          "Mapping activation must be boolean.",
        );
    if (
      object(raw.collectionTarget) &&
      raw.collectionTarget.fieldMap !== undefined &&
      (!object(raw.collectionTarget.fieldMap) ||
        Object.values(raw.collectionTarget.fieldMap).some(
          (x) => typeof x !== "string",
        ))
    )
      add(
        id,
        "collectionTarget.fieldMap",
        "INVALID_COLLECTION_FIELD_MAP",
        "Collection field mappings must map strings to strings.",
      );
    raw.fields.forEach((field: any, i: number) => {
      if (!object(field)) return;
      if (field.required !== undefined && typeof field.required !== "boolean")
        add(
          id,
          `fields[${i}].required`,
          "INVALID_FIELD",
          "Required must be boolean.",
        );
      for (const key of ["placeholder", "helpText", "defaultValue"])
        if (field[key] !== undefined && typeof field[key] !== "string")
          add(
            id,
            `fields[${i}].${key}`,
            "INVALID_FIELD",
            "Declared field text must be a string.",
          );
    });
    const settings = structuredClone(candidate.settings),
      fields = structuredClone(raw.fields),
      live = {
        settings,
        fields,
        collectionTarget: structuredClone(
          raw.collectionTarget ||
            settings.collectionTarget || {
              enabled: false,
              collectionId: "",
              fieldMap: {},
            },
        ),
      };
    walk(live, (r, path) => {
      for (const [key, kind] of Object.entries(refKeys))
        if (typeof r[key] === "string" && r[key]) {
          const old = r[key],
            mapped = input.references[kind]?.[old],
            current = mapped
              ? inventory.resources[resourceKey(kind, mapped)]
              : null;
          if (
            !mapped ||
            !current ||
            current.siteId !== inventory.site.id ||
            current.id !== mapped
          )
            add(
              id,
              `${path}.${key}`,
              "REFERENCE_MAPPING_REQUIRED",
              `Map ${kind} reference to an existing canonical destination ID.`,
            );
          else r[key] = mapped;
        }
      if (typeof r.componentKey === "string") {
        const identity = `${r.componentKey}@${r.version || "unknown"}`,
          mapped = input.references.components?.[identity],
          current = mapped
            ? inventory.resources[resourceKey("components", mapped)]
            : null;
        if (
          !current ||
          current.siteId !== inventory.site.id ||
          current.id !== mapped ||
          current.status !== "active" ||
          current.reviewStatus !== "approved"
        )
          add(
            id,
            `${path}.componentKey`,
            "COMPONENT_COMPATIBILITY_REQUIRED",
            "Map exact component identity/version to an active reviewed destination component.",
          );
        else {
          r.componentKey = current.componentKey;
          r.version = current.version;
          add(
            id,
            path,
            "COMPONENT_RUNTIME_UNVERIFIED",
            "Registry identity is verified; imported runtime behavior needs frontend testing.",
            "unverified",
          );
        }
      }
      if (
        path.includes("Assets") &&
        typeof r.id === "string" &&
        ["image", "video", "audio", "font", "document", "file"].includes(r.type)
      ) {
        const mapped = input.references.media?.[r.id],
          current = mapped
            ? inventory.resources[resourceKey("media", mapped)]
            : null;
        if (!current || current.siteId !== inventory.site.id)
          add(
            id,
            `${path}.id`,
            "MEDIA_ASSET_MAPPING_REQUIRED",
            "Map declared source asset to current destination media.",
          );
        else {
          r.id = current.id;
          if (r.url) r.url = current.url;
        }
      }
      for (const urlKey of ["url", "src"])
        if (
          typeof r[urlKey] === "string" &&
          r[urlKey].startsWith("/uploads/")
        ) {
          const mapped = input.references.media?.[r[urlKey]],
            current = mapped
              ? inventory.resources[resourceKey("media", mapped)]
              : null;
          if (!current || current.siteId !== inventory.site.id)
            add(
              id,
              `${path}.${urlKey}`,
              "MEDIA_URL_MAPPING_REQUIRED",
              "Map source managed URL to a current destination media ID.",
            );
          else r[urlKey] = current.url;
        }
      if (typeof r.siteId === "string") r.siteId = inventory.site.id;
    });
    const layoutTrees = [
      ["settings.frontendDesignElements", settings.frontendDesignElements],
      [
        "settings.frontendDesignContentDocument.elements",
        settings.frontendDesignContentDocument?.elements,
      ],
    ] as const;
    for (const [treePath, tree] of layoutTrees)
      if (tree !== undefined) {
        if (!Array.isArray(tree)) {
          add(
            id,
            treePath,
            "INVALID_CAPTURED_LAYOUT",
            "Captured layout needs an editable element array.",
          );
          continue;
        }
        const elementIds = new Set<string>();
        let elementCount = 0;
        const validateTree = (nodes: any[], path: string) =>
          nodes.forEach((node, index) => {
            const p = `${path}[${index}]`;
            if (
              ++elementCount > 10000 ||
              !object(node) ||
              typeof node.id !== "string" ||
              !node.id ||
              elementIds.has(node.id) ||
              typeof node.type !== "string"
            ) {
              add(
                id,
                p,
                "INVALID_CAPTURED_LAYOUT",
                "Captured elements need unique IDs and declared types.",
              );
              return;
            }
            elementIds.add(node.id);
            if (node.props !== undefined && !object(node.props))
              add(
                id,
                `${p}.props`,
                "INVALID_CAPTURED_LAYOUT",
                "Captured element properties must remain an editable JSON object.",
              );
            if (!capturedElementTypes.has(node.type))
              add(
                id,
                `${p}.type`,
                "CAPTURED_ELEMENT_RUNTIME_UNVERIFIED",
                "This element type has no shared editor contract. Its original JSON is preserved; verify frontend rendering and editing before activation.",
                "unverified",
              );
            if (
              ["interactiveFigure", "codeComponent"].includes(node.type) &&
              (!object(node.props) ||
                typeof node.props.componentKey !== "string" ||
                !node.props.componentKey ||
                typeof node.props.version !== "string" ||
                !node.props.version)
            )
              add(
                id,
                `${p}.props.componentKey`,
                "COMPONENT_IDENTITY_REQUIRED",
                "Captured registered components need an explicit component identity and version for destination compatibility review.",
              );
            if (node.children !== undefined) {
              if (!Array.isArray(node.children))
                add(
                  id,
                  `${p}.children`,
                  "INVALID_CAPTURED_LAYOUT",
                  "Children must remain a nested editable array.",
                );
              else validateTree(node.children, `${p}.children`);
            }
          });
        validateTree(tree, treePath);
      }
    if (
      settings.frontendDesignContentDocument &&
      !Array.isArray(settings.frontendDesignContentDocument.elements)
    )
      add(
        id,
        "settings.frontendDesignContentDocument",
        "INVALID_CAPTURED_LAYOUT",
        "Captured canonical document must contain its complete editable tree.",
      );
    if (
      source === "frontend" &&
      template.content &&
      !settings.frontendDesignElements &&
      !settings.frontendDesignContentDocument
    )
      add(
        id,
        "settings",
        "CAPTURED_LAYOUT_MISSING",
        "The frontend template has content without a standalone settings copy. Export its complete captured layout before importing.",
      );
    if (raw.pageId || raw.postId)
      add(
        id,
        "pageId/postId",
        "ATTACHED_FORM_UNSUPPORTED",
        "This portable template imports as standalone; remove source page/post attachment after reviewing the package.",
      );
    for (const key of [
      "customCss",
      "customJs",
      "frontendDesignCustomCss",
      "frontendDesignCustomJs",
    ])
      if (settings[key])
        add(
          id,
          `settings.${key}`,
          "CUSTOM_RUNTIME_UNVERIFIED",
          "Captured custom styling or code is preserved without execution in review. Test it before activation.",
          "unverified",
        );
    if (
      !["public", "authenticated", "adminOnly"].includes(
        raw.audience || "public",
      ) ||
      !["manual", "auto-approve"].includes(raw.moderationMode || "manual")
    )
      add(
        id,
        "audience/moderationMode",
        "INVALID_POLICY",
        "Unsupported audience or moderation policy.",
      );
    if (live.collectionTarget.enabled === true) {
      const c =
        inventory.resources[
          resourceKey("collections", live.collectionTarget.collectionId)
        ];
      if (!c || c.status !== "published" || c.publicCreate !== true)
        add(
          id,
          "collectionTarget",
          "COLLECTION_TARGET_UNAVAILABLE",
          "Collection writes require a published writable destination collection.",
        );
      else {
        const targetKeys = new Set((c.fields || []).map((f: any) => f.key));
        for (const [from, to] of Object.entries(
          live.collectionTarget.fieldMap || {},
        ))
          if (!keys.has(from) || !targetKeys.has(to))
            add(
              id,
              `collectionTarget.fieldMap.${from}`,
              "INVALID_COLLECTION_FIELD_MAP",
              "Map declared form and destination collection fields.",
            );
      }
    }
    if (raw.editorFormBlockProps)
      settings.editorFormBlockProps = structuredClone(raw.editorFormBlockProps);
    settings.formTemplateImport = {
      schemaVersion: FORM_TEMPLATE_PACK_SCHEMA,
      sourceSite: input.pack.site || null,
      source: source,
      template: structuredClone(template),
      manifest: structuredClone(raw),
    };
    const form: FormTemplatePackTarget["form"] = {
      ...raw,
      siteId: inventory.site.id,
      pageId: null,
      postId: null,
      name,
      title: typeof raw.title === "string" && raw.title ? raw.title : name,
      fields: live.fields,
      settings: live.settings,
      audience: raw.audience || "public",
      isActive: false,
      moderationMode: raw.moderationMode || "manual",
      enableHoneypot: raw.enableHoneypot ?? raw.spamGuards?.honeypot ?? true,
      enableCaptcha: raw.enableCaptcha ?? raw.spamGuards?.captcha ?? false,
      collectionTarget: live.collectionTarget,
    };
    delete (form as any).id;
    delete (form as any).createdAt;
    delete (form as any).updatedAt;
    targets.push({
      id,
      title: typeof form.title === "string" && form.title ? form.title : name,
      name,
      source,
      selected,
      form,
      fieldCount: fields.length,
      hasCapturedLayout: !!(
        settings.frontendDesignContentDocument ||
        settings.frontendDesignElements
      ),
    });
  }
  if (Object.keys(input.names).some((id) => !ids.has(id)))
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_SELECTION",
      "Unknown destination-name template ID.",
    );
  if (input.selection.some((id) => !ids.has(id)))
    throw formPackError(
      400,
      "INVALID_FORM_TEMPLATE_SELECTION",
      "Unknown selected template.",
    );
  const chosen = targets.filter((t) => t.selected);
  if (
    inventory.billing.overageMode === "block" &&
    inventory.forms.length + chosen.length > inventory.billing.formLimit
  )
    issues.push({
      code: "BILLING_FORM_LIMIT",
      path: "selection",
      message: "The selected forms exceed the current destination form quota.",
      severity: "blocking",
    });
  if (new Set(chosen.map((t) => t.name)).size !== chosen.length)
    issues.push({
      code: "FORM_NAME_CONFLICT",
      path: "selection",
      message: "Selected forms need distinct destination names.",
      severity: "blocking",
    });
  const relevant = issues.filter(
    (i) => !i.targetId || input.selection.includes(i.targetId),
  );
  const reviewVersion = `form-pack-v1:${createHash("sha256")
    .update(
      serializeTemplateRevisionValue({
        pack: input.pack,
        selection: input.selection,
        names: input.names,
        references: input.references,
        ack: input.acknowledgeUnverified,
        inventory,
      }),
    )
    .digest("hex")}`;
  return {
    schemaVersion: "backy.form-template-pack-review.v1",
    siteId: inventory.site.id,
    reviewVersion,
    selection: input.selection,
    targets,
    issues,
    canApply:
      chosen.length > 0 &&
      !relevant.some((i) => i.severity === "blocking") &&
      (input.acknowledgeUnverified ||
        !relevant.some((i) => i.severity === "unverified")),
    publication: "inactive-standalone",
    concurrencyBoundary: inventory.boundary,
  };
}
export function bindImportedFormLayout(form: FormDefinition): FormDefinition {
  const next = structuredClone(form);
  const settings = next.settings || {};
  for (const key of [
    "frontendDesignContentDocument",
    "frontendDesignElements",
    "editorFormBlockProps",
  ])
    if (settings[key])
      walk(settings[key], (r) => {
        if (r.type === "form" && object(r.props)) {
          r.props.formId = next.id;
          r.props.formName = next.name;
          r.props.formActive = false;
        } else if (typeof r.formId === "string") {
          r.formId = next.id;
          r.formName = next.name;
          r.formActive = false;
        }
      });
  next.settings = settings;
  return next;
}
function checked(input: FormTemplatePackImportRequest, inventory: Inventory) {
  const review = reviewFormTemplatePack(input, inventory);
  if (input.reviewVersion !== review.reviewVersion)
    throw formPackError(
      409,
      "FORM_TEMPLATE_REVIEW_STALE",
      "Package, selection or destination changed. Review again.",
    );
  if (!review.canApply)
    throw formPackError(
      422,
      "FORM_TEMPLATE_REVIEW_BLOCKED",
      "Resolve blocking findings and explicitly acknowledge unverified runtime behavior.",
    );
  return review;
}
export async function applyFormTemplatePack(
  input: FormTemplatePackImportRequest,
  siteId: string,
  actorId: string | null,
  repos?: BackyRepositories,
): Promise<FormTemplatePackApplied> {
  let review!: FormTemplatePackReview, forms: FormDefinition[];
  if (repos) {
    if (!repos.forms.withTemplatePackImportLock)
      throw formPackError(
        503,
        "FORM_TEMPLATE_IMPORT_UNAVAILABLE",
        "Atomic form import is unavailable.",
      );
    forms = await repos.forms
      .withTemplatePackImportLock(siteId, async (tx) => {
        review = checked(input, await readFormPackInventory(siteId, input, tx));
        const result: FormDefinition[] = [];
        for (const target of review.targets.filter((t) => t.selected)) {
          const validation = await validateAdminFormCollectionTarget({
            siteId,
            formFields: target.form.fields,
            collectionTarget: target.form.collectionTarget,
            repositories: tx,
          });
          if (!validation.ok)
            throw formPackError(
              422,
              "FORM_TEMPLATE_REVIEW_BLOCKED",
              "Destination collection mapping is invalid.",
            );
          const created = (
            await tx.forms.create({
              ...target.form,
              createdBy: actorId,
              updatedBy: actorId,
            })
          ).item;
          const bound = bindImportedFormLayout(created);
          result.push(
            (
              await tx.forms.update(siteId, created.id, {
                settings: bound.settings,
              })
            ).item,
          );
        }
        return result;
      })
      .catch((error) => {
        let current: any = error;
        for (
          let depth = 0;
          depth < 8 && current;
          depth++, current = current.cause
        )
          if (["40001", "40P01", "23505"].includes(current.code))
            throw formPackError(
              409,
              "FORM_TEMPLATE_REVIEW_STALE",
              "Current destination changed. Review again.",
            );
        throw error;
      });
  } else
    forms = commitDemoFormTemplatePack(
      siteId,
      () => {
        review = checked(input, demoInventory(siteId, input));
        return review.targets
          .filter((t) => t.selected)
          .map((t) => ({ ...t.form, createdBy: actorId, updatedBy: actorId }));
      },
      bindImportedFormLayout,
    );
  return {
    schemaVersion: "backy.form-template-pack-applied.v1",
    siteId,
    reviewVersion: review.reviewVersion,
    forms: forms.map((form, i) => ({
      importId: review.targets.filter((t) => t.selected)[i].id,
      form,
      editUrl: `/forms?siteId=${encodeURIComponent(siteId)}&formId=${encodeURIComponent(form.id)}`,
    })),
    publication: "inactive-standalone",
    completionWarnings: [],
    concurrencyBoundary: review.concurrencyBoundary,
  };
}
