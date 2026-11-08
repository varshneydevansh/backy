import { createHash, randomUUID } from "node:crypto";
import {
  canvasContentPayloadToBackyContentDocument,
  serializeTemplateRevisionValue,
  FRONTEND_COMPOSITION_IMPORT_MAX_BYTES,
  FRONTEND_COMPOSITION_IMPORT_SCHEMA,
  type FrontendCompositionImportRequest,
  type FrontendCompositionReview,
  type FrontendCompositionIssue,
  type FrontendCompositionTarget,
  type FrontendCompositionApplyResult,
  type BackyRepositories,
  type Site,
} from "@backy-cms/core";
import { normalizeFrontendDesignContract } from "./frontendDesignContract";
import { EDITOR_MEDIA_REFERENCE_KEYS } from "./editorMediaReferences";
import {
  matchCollectionListRoute,
  matchCollectionItemRoute,
} from "./collectionRoutes";
import { collectCompleteCollectionInventory } from "./collectionInventory";
import {
  getAdminPageById,
  getPageSummary,
  getBlogPosts,
  getMediaList,
  listCollections,
  listInteractiveComponents,
  listFormsBySite,
  getSiteByIdOrSlug,
  commitDemoFrontendComposition,
} from "./backyStore";

export const compositionImportError = (
  status: number,
  code: string,
  message: string,
) => Object.assign(new Error(message), { status, code });
export const compositionFingerprint = (value: unknown) =>
  createHash("sha256")
    .update(serializeTemplateRevisionValue(value))
    .digest("hex");
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const credential =
  /^(?:password|passwd|secret|clientSecret|apiKey|serviceRoleKey|authorization|accessToken|refreshToken|privateKey|databaseUrl|connectionString|smtpPassword|providerKey|cookie|set-cookie|client_secret|api_key|service_role_key|access_token|refresh_token|private_key)$/i;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
/** Preserve JSON extensions; refuse executable/accessor/prototype input and remove credential fields before review/storage. */
export function parseFrontendCompositionRequest(raw: unknown): {
  request: FrontendCompositionImportRequest;
  issues: FrontendCompositionIssue[];
} {
  const issues: FrontendCompositionIssue[] = [];
  let nodes = 0;
  const clone = (value: any, path: string, depth: number): any => {
    if (++nodes > 60000 || depth > 64)
      throw compositionImportError(
        413,
        "COMPOSITION_LIMIT",
        "Composition exceeds the 60,000-value / 64-level review budget. Split the package.",
      );
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw compositionImportError(
          400,
          "INVALID_COMPOSITION",
          "Use a valid absolute URL or retain a relative asset path.",
        );
      }
      let removed = !!(url.username || url.password);
      url.username = "";
      url.password = "";
      for (const key of [...url.searchParams.keys()])
        if (credential.test(key) || /^(token|signature|sig)$/i.test(key)) {
          url.searchParams.delete(key);
          removed = true;
        }
      if (removed) {
        issues.push({
          code: "credential.redacted",
          severity: "unverified",
          path,
          message: "URL credentials removed from accepted data.",
        });
        return url.href;
      }
    }
    if (value === null || ["string", "boolean"].includes(typeof value))
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value))
      return value.map((item, index) =>
        clone(item, `${path}/${index}`, depth + 1),
      );
    const prototype = object(value) ? Object.getPrototypeOf(value) : undefined;
    const plain =
      prototype === null ||
      prototype === Object.prototype ||
      (prototype &&
        Object.getPrototypeOf(prototype) === null &&
        typeof Object.getOwnPropertyDescriptor(prototype, "constructor")
          ?.value === "function" &&
        Function.prototype.toString.call(
          Object.getOwnPropertyDescriptor(prototype, "constructor")!.value,
        ) === Function.prototype.toString.call(Object));
    if (!object(value) || !plain)
      throw compositionImportError(
        400,
        "INVALID_COMPOSITION",
        "Use plain JSON values.",
      );
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || forbidden.has(key))
        throw compositionImportError(
          400,
          "INVALID_COMPOSITION",
          "Unsafe object keys or accessors are not accepted.",
        );
      if (credential.test(key)) {
        issues.push({
          code: "credential.redacted",
          severity: "unverified",
          path: `${path}/${key}`,
          message: "Credential field removed from review and accepted content.",
        });
        continue;
      }
      result[key] = clone(descriptor.value, `${path}/${key}`, depth + 1);
    }
    return result;
  };
  const body = clone(raw, "", 0);
  if (
    !object(body) ||
    !["review", "apply"].includes(body.action) ||
    !object(body.composition)
  )
    throw compositionImportError(
      400,
      "INVALID_COMPOSITION",
      "Choose review or apply and supply a composition object.",
    );
  const composition = body.composition;
  if (
    composition.schemaVersion !== FRONTEND_COMPOSITION_IMPORT_SCHEMA ||
    !Array.isArray(composition.routes) ||
    composition.routes.length > 48
  )
    throw compositionImportError(
      400,
      "INVALID_COMPOSITION",
      "Use backy.frontend-composition-import.v1 with at most 48 routes.",
    );
  if (
    composition.frontendDesign !== undefined &&
    (!object(composition.frontendDesign) ||
      !Array.isArray(composition.frontendDesign.templates) ||
      composition.frontendDesign.templates.length > 48)
  )
    throw compositionImportError(
      400,
      "INVALID_COMPOSITION",
      "frontendDesign needs a templates array with at most 48 entries.",
    );
  if (
    !Array.isArray(body.selection) ||
    body.selection.length > 97 ||
    body.selection.some((id: any) => typeof id !== "string") ||
    new Set(body.selection).size !== body.selection.length ||
    typeof body.acknowledgeUnverified !== "boolean"
  )
    throw compositionImportError(
      400,
      "INVALID_SELECTION",
      "Supply unique selected target IDs and an explicit acknowledgeUnverified boolean.",
    );
  const ids = new Set<string>();
  for (const route of composition.routes) {
    if (
      !object(route) ||
      typeof route.id !== "string" ||
      !route.id ||
      route.id.length > 128 ||
      ids.has(route.id) ||
      !["page", "blogPost"].includes(route.type) ||
      typeof route.title !== "string" ||
      !route.title.trim() ||
      route.title.length > 300 ||
      typeof route.path !== "string" ||
      route.path.length > 500 ||
      !object(route.content)
    )
      throw compositionImportError(
        400,
        "INVALID_COMPOSITION",
        "Each route needs a unique id, page/blogPost type, canonical path, title and concrete content.",
      );
    ids.add(route.id);
  }
  if (composition.frontendDesign) {
    const templateIds = new Set<string>();
    for (const template of composition.frontendDesign.templates) {
      if (
        !object(template) ||
        typeof template.id !== "string" ||
        !template.id ||
        template.id.length > 128 ||
        templateIds.has(template.id) ||
        typeof template.name !== "string" ||
        !template.name.trim() ||
        template.name.length > 300 ||
        ![
          "page",
          "blogPost",
          "form",
          "product",
          "collection",
          "section",
        ].includes(template.type) ||
        !object(template.content)
      )
        throw compositionImportError(
          400,
          "INVALID_COMPOSITION",
          "Every template needs a unique explicit ID and concrete content.",
        );
      templateIds.add(template.id);
    }
  }
  if (
    body.reviewVersion !== undefined &&
    !/^composition-v1:[a-f0-9]{64}$/.test(body.reviewVersion)
  )
    throw compositionImportError(
      400,
      "INVALID_REVIEW_VERSION",
      "Use the version returned by review.",
    );
  if (
    Buffer.byteLength(JSON.stringify(body)) >
    FRONTEND_COMPOSITION_IMPORT_MAX_BYTES
  )
    throw compositionImportError(
      413,
      "COMPOSITION_LIMIT",
      "Composition exceeds 2 MiB.",
    );
  return { request: body as FrontendCompositionImportRequest, issues };
}
export interface CompositionInventory {
  site: Site;
  pages: any[];
  posts: any[];
  collections: any[];
  media: any[];
  components: any[];
  forms: any[];
}
const complete = async <T extends { id: string; siteId?: string }>(
  siteId: string,
  read: any,
): Promise<T[]> => {
  try {
    return await collectCompleteCollectionInventory(
      async (input) => {
        const page = await read(input);
        if (page?.pagination?.total > 20000)
          throw compositionImportError(
            503,
            "COMPOSITION_INVENTORY_INCOMPLETE",
            "Site inventory exceeds the 20,000-item review budget.",
          );
        return page;
      },
      (item) => item.siteId === siteId,
    );
  } catch {
    throw compositionImportError(
      503,
      "COMPOSITION_INVENTORY_INCOMPLETE",
      "Complete site inventory unavailable or changed. Retry review.",
    );
  }
};
export async function readCompositionInventory(
  site: Site,
  repositories: BackyRepositories,
): Promise<CompositionInventory> {
  const siteId = site.id;
  const [pages, posts, collections, media, components, forms] =
    await Promise.all([
      complete(siteId, (page: any) =>
        repositories.pages.list({ siteId, includeUnpublished: true, ...page }),
      ),
      complete(siteId, (page: any) =>
        repositories.posts.list({ siteId, includeUnpublished: true, ...page }),
      ),
      complete(siteId, (page: any) =>
        repositories.collections.list({
          siteId,
          includeUnpublished: true,
          ...page,
        }),
      ),
      complete(siteId, (page: any) =>
        repositories.media.list({ siteId, ...page }),
      ),
      complete(siteId, (page: any) =>
        repositories.interactiveComponents.list({
          siteId,
          status: "all",
          reviewStatus: "all",
          ...page,
        }),
      ),
      complete(siteId, (page: any) =>
        repositories.forms.list({ siteId, ...page }),
      ),
    ]);
  return { site, pages, posts, collections, media, components, forms };
}
export function readDemoCompositionInventory(
  siteId: string,
): CompositionInventory {
  const site = getSiteByIdOrSlug(siteId);
  if (!site)
    throw compositionImportError(404, "SITE_NOT_FOUND", "Site not found.");
  const gather = (
    read: (offset: number) => { items: any[]; pagination?: any },
  ) => {
    const items: any[] = [];
    let offset = 0,
      total: number | undefined;
    const ids = new Set<string>();
    for (;;) {
      const page = read(offset),
        p = page.pagination;
      if (
        !p ||
        !Number.isSafeInteger(p.total) ||
        p.total > 20000 ||
        p.offset !== offset ||
        !Number.isSafeInteger(p.limit) ||
        p.limit < 1 ||
        p.limit > 100 ||
        (total !== undefined && total !== p.total) ||
        page.items.length !== Math.min(p.limit, p.total - offset) ||
        p.hasMore !== offset + page.items.length < p.total
      )
        throw compositionImportError(
          503,
          "COMPOSITION_INVENTORY_INCOMPLETE",
          "Complete site inventory unavailable. Retry review.",
        );
      total = p.total;
      for (const item of page.items) {
        if (item.siteId !== site.id || ids.has(item.id))
          throw compositionImportError(
            503,
            "COMPOSITION_INVENTORY_INCOMPLETE",
            "Site inventory changed or returned a foreign item.",
          );
        ids.add(item.id);
        items.push(item);
      }
      if (!p.hasMore) return items;
      offset += page.items.length;
    }
  };
  const pages = getPageSummary(site.id, { includeUnpublished: true }).map(
    (page) => getAdminPageById(site.id, page.id),
  );
  const posts = gather((offset) => {
    const p = getBlogPosts(site.id, {
      includeUnpublished: true,
      limit: 100,
      offset,
    });
    return { items: p.posts, pagination: p.pagination };
  });
  const media = gather((offset) => {
    const p = getMediaList(site.id, { limit: 100, offset });
    return { items: p.media, pagination: p.pagination };
  });
  const collections = listCollections(site.id, { includeUnpublished: true }),
    components = listInteractiveComponents(site.id),
    forms = listFormsBySite(site.id);
  if (
    [pages, collections, components, forms].some(
      (items) =>
        items.length > 20000 ||
        items.some((item) => !item || item.siteId !== site.id) ||
        new Set(items.map((item) => item?.id)).size !== items.length,
    )
  )
    throw compositionImportError(
      503,
      "COMPOSITION_INVENTORY_INCOMPLETE",
      "Site inventory exceeds the review budget.",
    );
  return {
    site: site as unknown as Site,
    pages,
    posts,
    collections,
    media,
    components,
    forms,
  };
}
export function compositionPagePath(
  page: any,
  pages: any[],
  seen = new Set<string>(),
): string {
  if (seen.has(page.id))
    throw compositionImportError(
      503,
      "COMPOSITION_INVENTORY_INCOMPLETE",
      "Existing page hierarchy contains a cycle.",
    );
  seen.add(page.id);
  if (page.isHomepage || page.slug === "index") return "/";
  const parent = page.parentId
    ? pages.find((item) => item.id === page.parentId)
    : null;
  if (page.parentId && !parent)
    throw compositionImportError(
      503,
      "COMPOSITION_INVENTORY_INCOMPLETE",
      "Existing page parent is unavailable.",
    );
  return `${parent ? compositionPagePath(parent, pages, seen).replace(/\/$/, "") : ""}/${page.slug}`;
}
const patternMatches = (pattern: string, path: string) => {
  const a = pattern.split("/"),
    b = path.split("/");
  return (
    a.length === b.length &&
    a.every(
      (part, index) =>
        part.startsWith(":") || part === "*" || part === b[index],
    )
  );
};
const native = new Set([
  "text",
  "heading",
  "image",
  "audio",
  "video",
  "button",
  "link",
  "section",
  "header",
  "footer",
  "box",
  "columns",
  "column",
  "divider",
  "quote",
  "list",
  "navigation",
  "navItem",
  "blogPostCard",
  "repeater",
  "form",
  "input",
  "textarea",
  "select",
  "checkbox",
  "submitButton",
  "interactiveComponent",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code_block",
  "code_line",
  "img",
  "media_embed",
  "table",
  "tr",
  "td",
  "th",
  "data_figure",
  "collapsible",
  "interactive_component",
  "ul",
  "ol",
  "li",
]);
export function reviewFrontendComposition(
  request: FrontendCompositionImportRequest,
  inventory: CompositionInventory,
  redactions: FrontendCompositionIssue[] = [],
): FrontendCompositionReview {
  const { composition, selection } = request,
    selected = new Set(selection),
    issues = [...redactions],
    targets: FrontendCompositionTarget[] = [];
  const issue = (
    code: string,
    severity: "blocking" | "unverified",
    path: string,
    message: string,
    targetId?: string,
  ) => issues.push({ code, severity, path, message, targetId });
  if (composition.siteId && composition.siteId !== inventory.site.id)
    issue(
      "site.mismatch",
      "blocking",
      "/siteId",
      "Package belongs to another canonical site.",
    );
  const pagePaths = new Map(
    inventory.pages.map((page) => [
      compositionPagePath(page, inventory.pages),
      page,
    ]),
  );
  const occupied = new Map<string, any>([
    ...pagePaths,
    ...inventory.posts.map(
      (post) => [`/blog/${post.slug}`, post] as [string, any],
    ),
  ]);
  const importedPaths = new Set<string>();
  const inspect = (
    content: Record<string, any>,
    id: string,
    pointer: string,
  ) => {
    const ids = new Set<string>();
    let count = 0;
    const elements = Array.isArray(content.elements)
      ? content.elements
      : object(content.contentDocument) &&
          Array.isArray(content.contentDocument.elements)
        ? content.contentDocument.elements
        : [];
    if (!elements.length)
      issue(
        "content.empty",
        "blocking",
        pointer,
        "Provide concrete editable canvas elements.",
        id,
      );
    const walk = (value: any, path: string) => {
      if (++count > 10000)
        throw compositionImportError(
          413,
          "COMPOSITION_LIMIT",
          "A target exceeds 10,000 elements/values.",
        );
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}/${i}`));
        return;
      }
      if (!object(value)) return;
      if (
        typeof value.type === "string" &&
        (Array.isArray(value.children) || object(value.props) || "x" in value)
      ) {
        if (value.id !== undefined) {
          if (typeof value.id !== "string" || !value.id || ids.has(value.id))
            issue(
              "element.identity",
              "blocking",
              path + "/id",
              "Element IDs must be unique stable strings.",
              id,
            );
          else ids.add(value.id);
        } else if ("props" in value || "x" in value)
          issue(
            "element.identity",
            "blocking",
            path,
            "Canvas elements need explicit stable IDs.",
            id,
          );
        if (!native.has(value.type))
          issue(
            "element.unmapped",
            "unverified",
            path + "/type",
            `Unknown ${value.type} stays opaque; this review does not certify rendering.`,
            id,
          );
      }
      if (typeof value.customJS === "string" && value.customJS.trim())
        issue(
          "code.execution",
          "blocking",
          path + "/customJS",
          "Remove executable customJS. Imported code is never executed by review.",
          id,
        );
      const props = object(value.props) ? value.props : value;
      for (const [key, url] of Object.entries(value))
        if (
          typeof url === "string" &&
          /^(?:src|href|url|sourceUrl)$/i.test(key) &&
          /^(?:javascript|vbscript|data:text\/html):/i.test(url.trim())
        )
          issue(
            "code.execution",
            "blocking",
            path + "/" + key,
            "Executable URL schemes are not accepted.",
            id,
          );
      const componentKey = props.componentKey || value.componentKey;
      if (typeof componentKey === "string") {
        const version = String(props.version || value.version || "");
        const entry = inventory.components.find(
          (c) =>
            c.componentKey === componentKey && String(c.version) === version,
        );
        if (!entry)
          issue(
            "component.unresolved",
            "blocking",
            path,
            "Register the exact component key/version in this site first.",
            id,
          );
        else
          issue(
            "component.opaque",
            "unverified",
            path,
            `Registered ${componentKey}@${version}; runtime approval and renderer mapping remain separate.`,
            id,
          );
      }
      if (
        [
          "interactiveComponent",
          "interactive_component",
          "codeComponent",
        ].includes(value.type) &&
        typeof componentKey !== "string"
      )
        issue(
          "component.identity",
          "blocking",
          path,
          "Interactive widgets require an explicit registered component key and version.",
          id,
        );
      const bindingSource = object(value.source) ? value.source : value;
      if (typeof bindingSource.collectionId === "string") {
        const collection = inventory.collections.find(
          (c) => c.id === bindingSource.collectionId,
        );
        if (collection) {
          const requested = [
            bindingSource.fieldKey,
            value.fieldKey,
            value.xField,
            ...(Array.isArray(value.yFields) ? value.yFields : []),
          ].filter((field) => typeof field === "string");
          for (const field of requested)
            if (
              ![
                "id",
                "slug",
                "status",
                "createdAt",
                "updatedAt",
                "publishedAt",
              ].includes(field) &&
              !collection.fields?.some(
                (declared: any) => declared.key === field,
              )
            )
              issue(
                "binding.field",
                "blocking",
                path,
                "Binding references an undeclared collection field.",
                id,
              );
        }
      }
      for (const key of EDITOR_MEDIA_REFERENCE_KEYS)
        if (
          typeof value[key] === "string" &&
          value[key] &&
          !inventory.media.some(
            (media) =>
              media.id === value[key] && media.siteId === inventory.site.id,
          )
        )
          issue(
            "media.unresolved",
            "blocking",
            path + "/" + key,
            "Media ID is unavailable in this canonical site. Upload or remap it first.",
            id,
          );
      if (
        typeof value.mediaSiteId === "string" &&
        value.mediaSiteId !== inventory.site.id
      )
        issue(
          "media.site",
          "blocking",
          path + "/mediaSiteId",
          "Media reference belongs to another canonical site.",
          id,
        );
      if (
        typeof value.formId === "string" &&
        !inventory.forms.some((form) => form.id === value.formId)
      )
        issue(
          "form.unresolved",
          "blocking",
          path + "/formId",
          "Register the same-site form before importing this reference.",
          id,
        );
      if (
        typeof value.collectionId === "string" &&
        !inventory.collections.some((c) => c.id === value.collectionId)
      )
        issue(
          "binding.unresolved",
          "blocking",
          path + "/collectionId",
          "Collection ID is unavailable in this site.",
          id,
        );
      for (const [key, item] of Object.entries(value))
        if (key !== "contentDocument") walk(item, `${path}/${key}`);
    };
    walk(elements, pointer + "/elements");
    if (typeof content.customJS === "string" && content.customJS.trim())
      issue(
        "code.execution",
        "blocking",
        pointer + "/customJS",
        "Remove executable customJS before importing.",
        id,
      );
    if (
      (content.assets && !object(content.assets)) ||
      (object(content.assets) &&
        ((content.assets.media !== undefined &&
          !Array.isArray(content.assets.media)) ||
          (content.assets.fonts !== undefined &&
            !Array.isArray(content.assets.fonts))))
    )
      issue(
        "assets.invalid",
        "blocking",
        pointer + "/assets",
        "Assets need explicit media/fonts reference arrays.",
        id,
      );
    if (content.customCSS || content.customCss)
      issue(
        "styles.unverified",
        "unverified",
        pointer,
        "Custom CSS is retained as data; review does not execute it.",
        id,
      );
    const references = (value: any, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => references(v, `${path}/${i}`));
        return;
      }
      if (!object(value)) return;
      if (typeof value.elementId === "string" && !ids.has(value.elementId))
        issue(
          "editableMap.unresolved",
          "blocking",
          path + "/elementId",
          "Editable map points outside this target tree.",
          id,
        );
      for (const [key, item] of Object.entries(value))
        references(item, `${path}/${key}`);
    };
    references(
      content.editableMap || content.contentDocument?.editableMap,
      pointer + "/editableMap",
    );
    for (const ref of Array.isArray(content.assets?.media)
      ? content.assets.media
      : Array.isArray(content.contentDocument?.assets?.media)
        ? content.contentDocument.assets.media
        : [])
      if (
        !object(ref) ||
        (ref.siteId && ref.siteId !== inventory.site.id) ||
        !inventory.media.some((media) => media.id === ref.id)
      )
        issue(
          "media.unresolved",
          "blocking",
          pointer + "/assets/media",
          "Asset media ID is unavailable in this site.",
          id,
        );
    for (const ref of Array.isArray(content.assets?.fonts)
      ? content.assets.fonts
      : Array.isArray(content.contentDocument?.assets?.fonts)
        ? content.contentDocument.assets.fonts
        : [])
      if (
        !object(ref) ||
        !inventory.media.some(
          (media) => media.id === ref.id && media.type === "font",
        )
      )
        issue(
          "font.unresolved",
          "blocking",
          pointer + "/assets/fonts",
          "Font asset ID must refer to an owned registered font.",
          id,
        );
    if (
      content.animations ||
      content.interactions ||
      JSON.stringify(elements).includes('"animation"')
    )
      issue(
        "motion.unverified",
        "unverified",
        pointer,
        "Motion and interaction data are retained; verify behavior in the installed frontend.",
        id,
      );
    return ids.size;
  };
  composition.routes.forEach((route, index) => {
    const id = `route:${route.id}`,
      pointer = `/routes/${index}`;
    if (
      !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/.test(
        route.path,
      ) ||
      (route.type === "blogPost" &&
        !/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.path))
    )
      issue(
        "route.invalid",
        "blocking",
        pointer + "/path",
        "Use canonical lowercase literal paths; blog posts use /blog/:slug.",
        id,
      );
    if (importedPaths.has(route.path))
      issue(
        "route.duplicate",
        "blocking",
        pointer + "/path",
        "Each imported route needs a unique path.",
        id,
      );
    importedPaths.add(route.path);
    if (
      route.type === "page" &&
      (inventory.pages.some(
        (page) => page.slug === route.path.split("/").at(-1),
      ) ||
        composition.routes.some(
          (other) =>
            other !== route &&
            other.type === "page" &&
            other.path.split("/").at(-1) === route.path.split("/").at(-1) &&
            selected.has(`route:${other.id}`),
        ))
    )
      issue(
        "route.slugConflict",
        "blocking",
        pointer + "/path",
        "The current page repository requires unique leaf slugs per site. Rename this leaf slug.",
        id,
      );
    const existing = occupied.get(route.path);
    if (existing)
      issue(
        "route.owned",
        "blocking",
        pointer + "/path",
        "An existing page/post owns this path. Rename the imported route or exclude it; owned content is never overwritten.",
        id,
      );
    if (
      route.type === "page" &&
      /^\/(?:api|sites|admin|auth|account|checkout|blog)(?:\/|$)/.test(
        route.path,
      )
    )
      issue(
        "route.reserved",
        "blocking",
        pointer + "/path",
        "This route is reserved by a Backy module.",
        id,
      );
    if (
      matchCollectionListRoute(route.path, inventory.collections) ||
      matchCollectionItemRoute(route.path, inventory.collections)
    )
      issue(
        "route.collection",
        "blocking",
        pointer + "/path",
        "A collection route pattern already owns this path.",
        id,
      );
    if (
      inventory.site.settings.redirectRules?.some(
        (rule) =>
          rule.enabled !== false && patternMatches(rule.from, route.path),
      )
    )
      issue(
        "route.redirect",
        "blocking",
        pointer + "/path",
        "A redirect/retired route already owns this path.",
        id,
      );
    const parentPath = route.path.slice(0, route.path.lastIndexOf("/")) || "/";
    if (
      route.type === "page" &&
      parentPath !== "/" &&
      !pagePaths.has(parentPath) &&
      !composition.routes.some(
        (other) =>
          other.type === "page" &&
          other.path === parentPath &&
          selected.has(`route:${other.id}`),
      )
    )
      issue(
        "route.parent",
        "blocking",
        pointer + "/path",
        "Nested page paths need an existing or selected concrete parent page.",
        id,
      );
    if (
      route.templateId &&
      !inventory.site.settings.frontendDesign?.templates.some(
        (t) => t.id === route.templateId,
      ) &&
      !composition.frontendDesign?.templates.some(
        (t) => t.id === route.templateId && selected.has(`template:${t.id}`),
      )
    )
      issue(
        "template.unresolved",
        "blocking",
        pointer + "/templateId",
        "Select the referenced imported template or register it first.",
        id,
      );
    targets.push({
      id,
      type: route.type,
      title: route.title,
      path: route.path,
      selected: selected.has(id),
      elementCount: inspect(route.content, id, pointer + "/content"),
      content: route.content,
      existingId: existing?.id,
    });
  });
  if (composition.frontendDesign) {
    const design = composition.frontendDesign;
    if (design.tokens?.customCss || (design.tokens as any)?.customCSS)
      issue(
        "styles.unverified",
        "unverified",
        "/frontendDesign/tokens/customCss",
        "CSS stays declared data; connected frontend behavior requires verification.",
        "design",
      );
    try {
      normalizeFrontendDesignContract(design);
    } catch {
      issue(
        "design.invalid",
        "blocking",
        "/frontendDesign",
        "Frontend design declaration is invalid.",
      );
    }
    targets.push({
      id: "design",
      type: "frontendDesign",
      title: "Site tokens, chrome and design metadata",
      path: "Site design",
      selected: selected.has("design"),
      elementCount: 0,
      content: design as unknown as any,
    });
    for (const [index, template] of design.templates.entries()) {
      const id = `template:${template.id}`;
      if (
        template.isDefault &&
        (inventory.site.settings.frontendDesign?.templates.some(
          (t) => t.type === template.type && t.isDefault,
        ) ||
          design.templates.some(
            (t) =>
              t.id !== template.id &&
              t.type === template.type &&
              t.isDefault &&
              selected.has(`template:${t.id}`),
          ))
      )
        issue(
          "template.defaultConflict",
          "blocking",
          `/frontendDesign/templates/${index}/isDefault`,
          "Only one default template per type may be selected; existing defaults remain unchanged.",
          id,
        );
      if (
        inventory.site.settings.frontendDesign?.templates.some(
          (item) => item.id === template.id,
        )
      )
        issue(
          "template.owned",
          "blocking",
          `/frontendDesign/templates/${index}/id`,
          "An existing template owns this ID. Rename or exclude it; this import never replaces it.",
          id,
        );
      targets.push({
        id,
        type: "template",
        title: template.name,
        path: template.routePattern || "No live route",
        selected: selected.has(id),
        elementCount: inspect(
          template.content || {},
          id,
          `/frontendDesign/templates/${index}/content`,
        ),
        content: (template.content || {}) as any,
      });
    }
  }
  for (const id of selection)
    if (!targets.some((target) => target.id === id))
      issue(
        "selection.invalid",
        "blocking",
        "/selection",
        `Unknown selected target ${id}.`,
      );
  const actionable = issues.filter(
    (item) => !item.targetId || selected.has(item.targetId),
  );
  const reviewVersion =
    "composition-v1:" +
    compositionFingerprint({
      composition,
      selection: [...selection].sort(),
      acknowledgeUnverified: request.acknowledgeUnverified,
      inventory,
    });
  return {
    schemaVersion: "backy.frontend-composition-review.v1",
    siteId: inventory.site.id,
    reviewVersion,
    selection,
    acknowledgeUnverified: request.acknowledgeUnverified,
    targets,
    issues,
    canApply:
      selection.length > 0 &&
      !actionable.some((item) => item.severity === "blocking") &&
      (request.acknowledgeUnverified ||
        !actionable.some((item) => item.severity === "unverified")),
    boundary:
      "Data and geometry review only. No source URL fetching, React/JS execution, remote assets, animation or interaction certification. Apply creates authored drafts and retained templates, not published live routes.",
  };
}

/** Merge only explicitly selected site declarations and new templates. Preserve safe unknown JSON at every declaration level. */
function selectedDesign(
  request: FrontendCompositionImportRequest,
  inventory: CompositionInventory,
) {
  const imported = request.composition.frontendDesign,
    current = inventory.site.settings.frontendDesign;
  if (
    !imported ||
    !request.selection.some(
      (id) => id === "design" || id.startsWith("template:"),
    )
  )
    return undefined;
  const normalized = normalizeFrontendDesignContract(imported),
    includeDesign = request.selection.includes("design");
  const base = current || normalizeFrontendDesignContract({ templates: [] });
  const incoming = includeDesign
    ? {
        ...imported,
        ...normalized,
        source: { ...imported.source, ...normalized.source },
        tokens: { ...imported.tokens, ...normalized.tokens },
        chrome: { ...imported.chrome, ...normalized.chrome },
      }
    : base;
  const templates = [
    ...(current?.templates || []),
    ...normalized.templates.filter((template) =>
      request.selection.includes(`template:${template.id}`),
    ),
  ];
  return {
    ...base,
    ...incoming,
    templates,
    updatedAt: new Date().toISOString(),
  };
}
const selectedRoutes = (request: FrontendCompositionImportRequest) =>
  request.composition.routes
    .filter((route) => request.selection.includes(`route:${route.id}`))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
const assertReviewed = (
  request: FrontendCompositionImportRequest,
  inventory: CompositionInventory,
  redactions: FrontendCompositionIssue[],
) => {
  const review = reviewFrontendComposition(request, inventory, redactions);
  if (!request.reviewVersion || request.reviewVersion !== review.reviewVersion)
    throw compositionImportError(
      409,
      "COMPOSITION_REVIEW_STALE",
      "The package, selection or site changed. Review again before applying.",
    );
  if (!review.canApply)
    throw compositionImportError(
      422,
      "COMPOSITION_REVIEW_BLOCKED",
      "Resolve selected target issues and acknowledge unverified mappings before applying.",
    );
  return review;
};
function draftInput(
  route: FrontendCompositionImportRequest["composition"]["routes"][number],
  siteId: string,
  id: string,
  parentId: string | null,
  request: FrontendCompositionImportRequest,
) {
  const slug = route.path === "/" ? "index" : route.path.split("/").at(-1)!;
  const content = canvasContentPayloadToBackyContentDocument({
    id,
    kind: route.type === "page" ? "page" : "post",
    title: route.title,
    slug,
    status: "draft",
    rawContent: route.content,
  });
  content.id = id;
  content.status = "draft";
  content.title = route.title;
  content.slug = slug;
  const routeExtensions = Object.fromEntries(
    Object.entries(route).filter(
      ([key]) =>
        ![
          "id",
          "type",
          "path",
          "title",
          "content",
          "meta",
          "templateId",
        ].includes(key),
    ),
  );
  const importExtensions = Object.fromEntries(
    Object.entries(request.composition).filter(
      ([key]) =>
        !["schemaVersion", "siteId", "frontendDesign", "routes"].includes(key),
    ),
  );
  const meta = {
    ...route.meta,
    title: route.title,
    canonical: route.path,
    noIndex: true,
    frontendCompositionImport: {
      schemaVersion: FRONTEND_COMPOSITION_IMPORT_SCHEMA,
      reviewVersion: request.reviewVersion!,
      importId: route.id,
      routeExtensions,
      importExtensions,
    },
    ...(route.templateId ? { frontendDesignTemplateId: route.templateId } : {}),
  };
  return {
    id,
    siteId,
    title: route.title,
    slug,
    status: "draft" as const,
    parentId,
    isHomepage: route.path === "/",
    content,
    meta,
  };
}
const resultFor = (
  siteId: string,
  request: FrontendCompositionImportRequest,
  drafts: FrontendCompositionApplyResult["drafts"],
  designSaved: boolean,
): FrontendCompositionApplyResult => ({
  schemaVersion: "backy.frontend-composition-applied.v1",
  siteId,
  reviewVersion: request.reviewVersion!,
  drafts,
  templateIds: request.selection
    .filter((id) => id.startsWith("template:"))
    .map((id) => id.slice(9)),
  designSaved,
  publication: "draft-only",
});
export function applyDemoFrontendComposition(
  request: FrontendCompositionImportRequest,
  siteId: string,
  context: { actorId: string | null; requestId: string },
  redactions: FrontendCompositionIssue[] = [],
): FrontendCompositionApplyResult {
  let result: FrontendCompositionApplyResult | undefined;
  commitDemoFrontendComposition(siteId, () => {
    const inventory = readDemoCompositionInventory(siteId);
    assertReviewed(request, inventory, redactions);
    const paths = new Map(
      inventory.pages.map((page) => [
        compositionPagePath(page, inventory.pages),
        page.id,
      ]),
    );
    const drafts: FrontendCompositionApplyResult["drafts"] = [],
      prepared = [];
    for (const route of selectedRoutes(request)) {
      const id = `${route.type === "page" ? "page" : "post"}_${randomUUID()}`,
        parentPath = route.path.slice(0, route.path.lastIndexOf("/")) || "/";
      const input = draftInput(
        route,
        siteId,
        id,
        parentPath === "/" ? null : paths.get(parentPath) || null,
        request,
      );
      prepared.push({ type: route.type, input });
      if (route.type === "page") paths.set(route.path, id);
      drafts.push({
        importId: route.id,
        id,
        type: route.type,
        path: route.path,
        editUrl:
          route.type === "page"
            ? `/pages/${id}/edit?siteId=${encodeURIComponent(siteId)}`
            : `/blog/${id}/edit?siteId=${encodeURIComponent(siteId)}`,
      });
    }
    const design = selectedDesign(request, inventory);
    result = resultFor(siteId, request, drafts, !!design);
    return {
      drafts: prepared,
      design: design
        ? {
            siteId,
            expectedDesignFingerprint: compositionFingerprint(
              inventory.site.settings.frontendDesign ?? null,
            ),
            frontendDesign: design,
            source: "frontendDesign.compositionImport",
            actorId: context.actorId,
            requestId: context.requestId,
          }
        : undefined,
    };
  });
  return result!;
}
export async function applyRepositoryFrontendComposition(
  request: FrontendCompositionImportRequest,
  siteId: string,
  repositories: BackyRepositories,
  context: { actorId: string | null; requestId: string },
  redactions: FrontendCompositionIssue[] = [],
): Promise<FrontendCompositionApplyResult> {
  if (!repositories.templateRevisions.withCompositionImportLock)
    throw compositionImportError(
      503,
      "COMPOSITION_IMPORT_UNAVAILABLE",
      "Atomic composition import is unavailable on this repository.",
    );
  return repositories.templateRevisions.withCompositionImportLock(
    siteId,
    async (tx) => {
      const site = await tx.sites.getById(siteId);
      if (!site)
        throw compositionImportError(404, "SITE_NOT_FOUND", "Site not found.");
      const inventory = await readCompositionInventory(site, tx);
      assertReviewed(request, inventory, redactions);
      const design = selectedDesign(request, inventory);
      if (design)
        await tx.templateRevisions.commitDesign({
          siteId,
          expectedDesignFingerprint: compositionFingerprint(
            site.settings.frontendDesign ?? null,
          ),
          frontendDesign: design,
          source: "frontendDesign.compositionImport",
          actorId: context.actorId,
          requestId: context.requestId,
        });
      const paths = new Map(
          inventory.pages.map((page) => [
            compositionPagePath(page, inventory.pages),
            page.id,
          ]),
        ),
        drafts: FrontendCompositionApplyResult["drafts"] = [];
      for (const route of selectedRoutes(request)) {
        const parentPath =
            route.path.slice(0, route.path.lastIndexOf("/")) || "/",
          input = draftInput(
            route,
            siteId,
            randomUUID(),
            parentPath === "/" ? null : paths.get(parentPath) || null,
            request,
          );
        const created =
          route.type === "page"
            ? await tx.pages.create(input)
            : await tx.posts.create(input);
        // Canonical document identity must match the repository-generated row ID. Both writes stay inside the outer transaction.
        if (created.item.content.id !== created.item.id) {
          const content = { ...created.item.content, id: created.item.id };
          if (route.type === "page")
            await tx.pages.update(siteId, created.item.id, { content });
          else await tx.posts.update(siteId, created.item.id, { content });
        }
        const id = created.item.id;
        if (route.type === "page") paths.set(route.path, id);
        drafts.push({
          importId: route.id,
          id,
          type: route.type,
          path: route.path,
          editUrl:
            route.type === "page"
              ? `/pages/${id}/edit?siteId=${encodeURIComponent(siteId)}`
              : `/blog/${id}/edit?siteId=${encodeURIComponent(siteId)}`,
        });
      }
      await tx.auditLogs.record({
        siteId,
        actorId: context.actorId,
        entity: "site",
        entityId: siteId,
        action: "update",
        requestId: context.requestId,
        metadata: {
          operation: "frontendDesign.compositionImport",
          reviewVersion: request.reviewVersion!,
          draftIds: drafts.map((draft) => draft.id),
          templateIds: request.selection.filter((id) =>
            id.startsWith("template:"),
          ),
        },
      });
      return resultFor(siteId, request, drafts, !!design);
    },
  );
}
