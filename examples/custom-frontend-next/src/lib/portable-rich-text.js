"use client";
// Generated from Backy shared/hosted renderer sources. Run scripts/generate-portable-rich-renderer.mjs.
"use client";

// packages/editor/src/RichTextContent.tsx
import React from "react";

// packages/core/src/content-migrations.ts
var BINDING_SOURCE_KINDS = /* @__PURE__ */ new Set([
  "collection",
  "page",
  "post",
  "site",
  "route",
  "query",
  "auth",
  "static"
]);
var BINDING_SLOT_SOURCE_KINDS = /* @__PURE__ */ new Set([
  ...Array.from(BINDING_SOURCE_KINDS),
  "blog",
  "taxonomy",
  "commerce"
]);
var RESERVED_DOCUMENT_FIELDS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "id",
  "kind",
  "title",
  "slug",
  "locale",
  "status",
  "version",
  "elements",
  "themeTokenRefs",
  "assets",
  "interactions",
  "seo",
  "dataBindings",
  "editableMap",
  "metadata"
]);
var RESERVED_CANVAS_PAYLOAD_FIELDS = /* @__PURE__ */ new Set([
  ...RESERVED_DOCUMENT_FIELDS,
  "contentDocument",
  "canvasSize",
  "customCSS",
  "customJS",
  "themeSchemaVersion",
  "animations"
]);

// packages/core/src/code-highlight.ts
var BACKY_CODE_HIGHLIGHT_THEMES = {
  dark: {
    plain: "#e2e8f0",
    comment: "#94a3b8",
    string: "#86efac",
    keyword: "#93c5fd",
    number: "#fbbf24",
    boolean: "#fbbf24",
    null: "#fbbf24",
    function: "#c4b5fd",
    property: "#67e8f9",
    operator: "#cbd5e1",
    punctuation: "#cbd5e1",
    tag: "#fda4af",
    attribute: "#fcd34d",
    variable: "#e2e8f0"
  },
  light: {
    plain: "#1e293b",
    comment: "#64748b",
    string: "#15803d",
    keyword: "#1d4ed8",
    number: "#b45309",
    boolean: "#b45309",
    null: "#b45309",
    function: "#7e22ce",
    property: "#0e7490",
    operator: "#334155",
    punctuation: "#475569",
    tag: "#be123c",
    attribute: "#a16207",
    variable: "#1e293b"
  }
};
var LANGUAGE_ALIASES = {
  bash: "shell",
  cjs: "javascript",
  console: "shell",
  css3: "css",
  html5: "html",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  sh: "shell",
  shellscript: "shell",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "shell"
};
var C_LIKE_KEYWORDS = /* @__PURE__ */ new Set([
  "abstract",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "switch",
  "this",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);
var PYTHON_KEYWORDS = /* @__PURE__ */ new Set([
  "and",
  "as",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
]);
var SHELL_KEYWORDS = /* @__PURE__ */ new Set([
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "export",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "local",
  "then",
  "while"
]);
var normalizeBackyCodeLanguage = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9#+.-]/g, "") : "";
  return LANGUAGE_ALIASES[normalized] || normalized || "text";
};
var isShellLanguage = (language) => language === "shell" || language === "yaml" || language === "markdown";
var isHtmlLanguage = (language) => language === "html" || language === "xml" || language === "svg";
var isCssLanguage = (language) => language === "css" || language === "scss" || language === "sass";
var keywordSetForLanguage = (language) => {
  if (language === "python" || language === "ruby") return PYTHON_KEYWORDS;
  if (isShellLanguage(language)) return SHELL_KEYWORDS;
  return C_LIKE_KEYWORDS;
};
var classifyIdentifier = (value, language, source, startIndex) => {
  if (value === "true" || value === "false" || value === "True" || value === "False") return "boolean";
  if (value === "null" || value === "undefined" || value === "None" || value === "nil") return "null";
  if (keywordSetForLanguage(language).has(value)) return "keyword";
  if (isHtmlLanguage(language) && source[startIndex - 1] === "<") return "tag";
  if (isHtmlLanguage(language) && /^\s*=/.test(source.slice(startIndex + value.length))) return "attribute";
  if (isCssLanguage(language) && /^\s*:/.test(source.slice(startIndex + value.length))) return "property";
  if (/^\s*\(/.test(source.slice(startIndex + value.length))) return "function";
  if (source[startIndex - 1] === ".") return "property";
  if (isShellLanguage(language) && value.startsWith("$")) return "variable";
  return "plain";
};
var tokenTypeForMatch = (text, language, source, startIndex) => {
  if (/^\s+$/.test(text)) return "plain";
  if (text.startsWith("//") || text.startsWith("/*") || text.startsWith("<!--")) return "comment";
  if (isShellLanguage(language) && text.startsWith("#")) return "comment";
  if (/^["'`]/.test(text)) return "string";
  if (/^-?\d/.test(text)) return "number";
  if (/^[{}[\]().,:;<>]$/.test(text)) return "punctuation";
  if (/^[=+*/%!&|?-]+$/.test(text)) return "operator";
  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(text)) {
    return classifyIdentifier(text, language, source, startIndex);
  }
  return "plain";
};
var tokenizeBackyCodeLine = (line, languageValue) => {
  if (!line) {
    return [{ text: "", type: "plain" }];
  }
  const language = normalizeBackyCodeLanguage(languageValue);
  const shellComment = isShellLanguage(language) ? String.raw`|#[^\n]*` : "";
  const pattern = new RegExp(
    String.raw`<!--.*?-->|/\*.*?\*/|//[^\n]*${shellComment}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|` + "`(?:\\\\.|[^`\\\\])*`|-?\\d+(?:\\.\\d+)?(?:[a-zA-Z%]+)?|[A-Za-z_$][A-Za-z0-9_$-]*|[{}\\[\\]().,:;<>]|[=+*/%!&|?-]+|\\s+|.",
    "g"
  );
  return Array.from(line.matchAll(pattern), (match) => {
    const text = match[0];
    return {
      text,
      type: tokenTypeForMatch(text, language, line, match.index || 0)
    };
  });
};

// packages/core/src/video-source.ts
function resolveBackyVideoSource(value, playback = {}) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return { kind: "empty", src: "", message: "Add a video URL or select a video from the media library." };
  const invalid = () => ({ kind: "invalid", src: "", message: "Use a direct video URL or a supported YouTube, Vimeo or Google Drive video link." });
  if (/[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith("//")) return invalid();
  if (/^\/(?!\/)/.test(source) || /^\.\.?\//.test(source)) return { kind: "native", src: source };
  let url;
  try {
    url = new URL(source);
  } catch {
    return invalid();
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return invalid();
  const host = url.hostname.toLowerCase();
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be"].includes(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = host.endsWith("youtu.be") ? segments[0] : url.pathname === "/watch" ? url.searchParams.get("v") : ["embed", "shorts", "live"].includes(segments[0]) ? segments[1] : "";
    if (!id || !/^[a-z0-9_-]{11}$/i.test(id)) return invalid();
    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    const flags = { controls: playback.controls !== false, autoplay: playback.autoplay === true, mute: playback.muted === true, loop: playback.loop === true, playsinline: playback.playsInline !== false };
    Object.entries(flags).forEach(([key, enabled]) => embed.searchParams.set(key, enabled ? "1" : "0"));
    if (playback.loop) embed.searchParams.set("playlist", id);
    const start = url.searchParams.get("start") || url.searchParams.get("t");
    if (start && /^\d+s?$/.test(start)) embed.searchParams.set("start", String(Number.parseInt(start, 10)));
    return { kind: "youtube", src: embed.toString() };
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = host === "player.vimeo.com" && segments[0] === "video" ? segments[1] : segments[0];
    if (!id || !/^\d+$/.test(id)) return invalid();
    const embed = new URL(`https://player.vimeo.com/video/${id}`);
    const unlisted = url.searchParams.get("h") || (host === "player.vimeo.com" ? "" : segments[1]);
    if (unlisted && /^[a-f0-9]{6,32}$/i.test(unlisted)) embed.searchParams.set("h", unlisted);
    if (playback.autoplay) embed.searchParams.set("autoplay", "1");
    if (playback.muted) embed.searchParams.set("muted", "1");
    if (playback.loop) embed.searchParams.set("loop", "1");
    return { kind: "vimeo", src: embed.toString() };
  }
  if (host === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([a-z0-9_-]+)\/(?:view|preview)$/i);
    const id = match?.[1] || (["/open", "/uc"].includes(url.pathname) ? url.searchParams.get("id") : "");
    if (!id || !/^[a-z0-9_-]{8,}$/i.test(id)) return invalid();
    return { kind: "drive", src: `https://drive.google.com/file/d/${id}/preview` };
  }
  return { kind: "native", src: source };
}

// packages/core/src/custom-frontend-agent-handoff.ts
var COMMON_COMPONENT_STYLE_PATHS = [
  "styles.*",
  "tokenRefs.*",
  "responsive.*.styles.*",
  "responsive.*.tokenRefs.*"
];
var COMMON_COMPONENT_RESPONSIVE_PATHS = [
  "responsive.desktop",
  "responsive.tablet",
  "responsive.mobile",
  "responsive.*.x",
  "responsive.*.y",
  "responsive.*.width",
  "responsive.*.height",
  "responsive.*.props.*",
  "responsive.*.styles.*"
];
var COMMON_COMPONENT_BINDING_PATHS = [
  "bindingSlots[]",
  "dataBindings[]",
  "content.editableMap.*",
  "meta.frontendDesignEditableMap.*"
];
var COMPONENT_DEFAULT_SIZE_BY_TYPE = {
  heading: { width: 560, height: 88 },
  text: { width: 520, height: 72 },
  paragraph: { width: 640, height: 120 },
  quote: { width: 620, height: 140 },
  list: { width: 480, height: 160 },
  collapsible: { width: 620, height: 240 },
  button: { width: 180, height: 52 },
  link: { width: 220, height: 40 },
  image: { width: 420, height: 280 },
  video: { width: 520, height: 292 },
  audio: { width: 420, height: 104 },
  icon: { width: 64, height: 64 },
  map: { width: 560, height: 320 },
  container: { width: 720, height: 360 },
  section: { width: 1200, height: 420 },
  header: { width: 1200, height: 96 },
  footer: { width: 1200, height: 260 },
  box: { width: 360, height: 220 },
  columns: { width: 900, height: 320 },
  spacer: { width: 1200, height: 64 },
  divider: { width: 640, height: 16 },
  nav: { width: 430, height: 52 },
  form: { width: 520, height: 520 },
  input: { width: 360, height: 72 },
  textarea: { width: 420, height: 140 },
  select: { width: 360, height: 72 },
  checkbox: { width: 360, height: 96 },
  radio: { width: 360, height: 120 },
  repeater: { width: 960, height: 420 },
  comment: { width: 560, height: 380 },
  embed: { width: 560, height: 320 },
  html: { width: 560, height: 320 },
  table: { width: 720, height: 360 },
  interactiveFigure: { width: 640, height: 420 },
  codeBlock: { width: 640, height: 300 },
  codeComponent: { width: 640, height: 420 }
};
var COMPONENT_DEFAULT_PROPS_BY_TYPE = {
  heading: { content: "Heading text", level: 2, fontSize: 56, fontWeight: 700, color: "#111827", lineHeight: 1.1 },
  text: { content: "Text block", fontSize: 18, fontWeight: 400, color: "#334155", lineHeight: 1.55, textAlign: "left" },
  paragraph: { content: "Paragraph text", fontSize: 18, color: "#334155", lineHeight: 1.65, textAlign: "left" },
  quote: { content: "Quote text", cite: "", fontSize: 24, color: "#111827", lineHeight: 1.45, fontStyle: "italic" },
  list: { items: ["List item"], content: "", listType: "unordered", fontSize: 18, color: "#334155", gap: 8 },
  collapsible: { title: "Details", defaultOpen: false, content: [{ type: "p", children: [{ text: "Add supporting details here." }] }] },
  button: { content: "Button", label: "Button", href: "/", target: "_self", rel: "", variant: "primary", action: "navigate", fileMediaId: "", backgroundColor: "#111827", color: "#ffffff", borderRadius: 8, fontSize: 16, fontWeight: 700 },
  link: { content: "Link", href: "/", target: "_self", rel: "", download: false, fileMediaId: "", color: "#2563eb", fontSize: 16, underline: true },
  image: { src: "", mediaId: "", alt: "", objectFit: "cover", focalPoint: { x: 0.5, y: 0.5 }, caption: "" },
  video: { src: "", mediaId: "", poster: "", posterMediaId: "", controls: true, autoplay: false, loop: false, objectFit: "cover" },
  audio: { src: "", mediaId: "", caption: "", transcript: "", controls: true, autoplay: false, loop: false },
  icon: { icon: "sparkles", name: "Icon", color: "#111827", size: 32, strokeWidth: 2 },
  map: { address: "", src: "", zoom: 12, markerLabel: "", latitude: null, longitude: null },
  container: { layout: "vertical", gap: 24, padding: 32, backgroundColor: "transparent" },
  section: { contentRole: "section", layout: "vertical", backgroundColor: "#ffffff", borderRadius: 0, padding: 64, anchorId: "" },
  header: { chromeRole: "site-header", position: "top", width: "full", showBrand: true, navigationBinding: "site.navigation.primary", backgroundColor: "#ffffff", borderColor: "#e5e7eb", padding: 16 },
  footer: { chromeRole: "site-footer", width: "full", showSocial: true, newsletterBinding: "site.newsletter", backgroundColor: "#111827", color: "#ffffff", padding: 24 },
  box: { backgroundColor: "#ffffff", borderRadius: 8, borderColor: "#d9e2ec", borderStyle: "solid", borderWidth: 1, shadow: "none", boxShadow: "none", contentRole: "box" },
  columns: { columns: 2, gap: 32, stackOnMobile: true, columnWidths: ["1fr", "1fr"] },
  spacer: { size: 64, axis: "vertical" },
  divider: { orientation: "horizontal", color: "#d9e2ec", borderColor: "#d9e2ec", thickness: 1, style: "solid", margin: "16px" },
  nav: {
    items: [
      { label: "Home", href: "/" },
      { label: "Blog", href: "/blog" }
    ],
    navItems: ["Home", "Blog"],
    navigationSource: "site",
    navigationBinding: "site.navigation.primary",
    chromeRole: "site.header.navigation",
    backgroundColor: "transparent",
    color: "#111827",
    padding: 16,
    direction: "horizontal",
    gap: 24,
    ariaLabel: "Primary navigation"
  },
  form: {
    formId: "",
    formTitle: "Contact form",
    formName: "contact-form",
    formDescription: "",
    formActive: true,
    formAudience: "public",
    actionUrl: "",
    schema: {},
    fields: [{ name: "email", label: "Email", type: "email", required: true }],
    submitLabel: "Submit",
    successMessage: "Thanks, your submission was received.",
    newsletterTopicIds: [],
    moderationMode: "manual",
    enableHoneypot: true,
    enableCaptcha: false,
    contactShareEnabled: false,
    contactShareNameField: "",
    contactShareEmailField: "email",
    contactSharePhoneField: "",
    contactShareNotesField: "",
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 18
  },
  input: { name: "field", label: "Field", type: "text", inputType: "text", placeholder: "", required: false, value: "", borderColor: "#d1d5db", borderRadius: 4 },
  textarea: { name: "message", label: "Message", placeholder: "", required: false, rows: 4, value: "", borderColor: "#d1d5db", borderRadius: 4 },
  select: { name: "option", label: "Option", options: ["Option 1"], placeholder: "Choose an option", required: false, value: "", borderColor: "#d1d5db", borderRadius: 4 },
  checkbox: { name: "choices", label: "Choices", options: ["Option 1"], required: false, value: [] },
  radio: { name: "choice", label: "Choice", options: ["Option 1"], required: false, value: "" },
  repeater: { collectionId: "", datasetId: "", limit: 6, columns: 3, gap: 16, titleField: "title", imageField: "image", descriptionField: "description", emptyMessage: "No records yet." },
  comment: { resourceType: "page", resourceId: "", moderationMode: "review", allowReplies: true, requireName: true, requireEmail: true, commentTitle: "Comments", commentAllowGuests: true, commentRequireName: true, commentRequireEmail: false, commentAllowReplies: true, commentModerationMode: "manual", commentSortOrder: "newest" },
  embed: { src: "", html: "", allowedHosts: [], allow: "", sandbox: "allow-scripts allow-same-origin", loading: "lazy", borderRadius: 8 },
  html: { html: "<div>Custom HTML</div>", title: "Custom HTML preview", sandbox: "allow-scripts", allowedHosts: [], backgroundColor: "#ffffff", borderRadius: 8 },
  table: { html: "", title: "Table preview", rows: [["Header", "Value"]], columns: ["Header", "Value"], caption: "", backgroundColor: "#ffffff", borderRadius: 8 },
  interactiveFigure: { registryId: "", runtimeUrl: "", config: {}, datasetId: "", sandbox: "allow-scripts allow-same-origin", componentKey: "backy.figure.custom", version: "1.0.0", title: "Interactive figure", fallbackText: "Static fallback for this interactive figure.", fallback: {}, controls: [], renderCapabilities: {}, series: [], steps: [] },
  codeBlock: { code: "", language: "text", filename: "", caption: "", showLineNumbers: true, wrapLines: false, copyEnabled: true, highlightTheme: "dark", backgroundColor: "#0f172a", color: "#e2e8f0" },
  codeComponent: { code: "", html: "", css: "", js: "", sandbox: "allow-scripts", allowedHosts: [], config: {}, componentKey: "backy.custom.sandboxed", version: "1.0.0", title: "Sandboxed component", sandboxUrl: "", fallbackText: "This custom component needs a configured sandbox runtime to hydrate.", fallback: {}, controls: [], renderCapabilities: {} }
};
var fallbackComponentPropValue = (propName) => {
  if (/(items|fields|options|newsletterTopicIds|allowedHosts|rows|columns|columnWidths)$/u.test(propName)) return [];
  if (/(config|schema|focalPoint)$/u.test(propName)) return {};
  if (/(required|controls|autoplay|loop|download|stackOnMobile|showBrand|showSocial|allowReplies|requireName|requireEmail)$/u.test(propName)) return false;
  if (/(fontSize|fontWeight|lineHeight|gap|padding|zoom|size|strokeWidth|thickness|limit)$/u.test(propName)) return 0;
  if (/(latitude|longitude)$/u.test(propName)) return null;
  return "";
};
var buildComponentPropsTemplate = (propPaths, defaultProps) => propPaths.reduce((template, path) => {
  const propName = path.match(/^props\.([^.[\]]+)/u)?.[1];
  if (!propName) return template;
  template[propName] = Object.prototype.hasOwnProperty.call(defaultProps, propName) ? defaultProps[propName] : fallbackComponentPropValue(propName);
  return template;
}, {});
var buildComponentCreationHints = (type, label, propPaths, options = {}) => {
  const defaultSize = COMPONENT_DEFAULT_SIZE_BY_TYPE[type] || (options.flowParticipation === "root-section-flow" ? { width: 1200, height: 320 } : { width: 320, height: 160 });
  const defaultProps = COMPONENT_DEFAULT_PROPS_BY_TYPE[type] || {};
  const propsTemplate = buildComponentPropsTemplate(propPaths, defaultProps);
  const requiredFields = ["id", "type", "x", "y", "width", "height", "props", "styles", "responsive"];
  const minimalElement = {
    id: `${type}-element`,
    type,
    name: label,
    x: 0,
    y: 0,
    width: defaultSize.width,
    height: defaultSize.height,
    rotation: 0,
    zIndex: 1,
    visible: true,
    locked: false,
    props: propsTemplate,
    styles: {},
    responsive: {},
    tokenRefs: {},
    assetIds: [],
    dataBindings: [],
    bindingSlots: [],
    accessibility: {},
    metadata: {}
  };
  if (options.supportsChildren) {
    minimalElement.children = [];
    requiredFields.push("children");
  }
  return {
    defaultSize,
    defaultProps,
    propsTemplate,
    minimalElement,
    requiredFields,
    writeRule: "Create with minimalElement, then only mutate fields advertised by propPaths, stylePaths, responsivePaths, bindingPaths, and stable element fields."
  };
};
var componentTypeContract = (type, family, label, propPaths, options = {}) => ({
  type,
  family,
  label,
  apiReadable: true,
  apiWritable: true,
  propPaths,
  stylePaths: COMMON_COMPONENT_STYLE_PATHS,
  responsivePaths: COMMON_COMPONENT_RESPONSIVE_PATHS,
  bindingPaths: options.bindingPaths || COMMON_COMPONENT_BINDING_PATHS,
  supportsChildren: Boolean(options.supportsChildren),
  supportsMediaAssets: Boolean(options.supportsMediaAssets),
  supportsDataBinding: options.supportsDataBinding !== false,
  supportsCustomCode: Boolean(options.supportsCustomCode),
  flowParticipation: options.flowParticipation || "absolute-layer",
  sharedSiteChrome: Boolean(options.sharedSiteChrome),
  sharedChromeBindings: options.sharedChromeBindings || [],
  creationHints: buildComponentCreationHints(type, label, propPaths, {
    supportsChildren: options.supportsChildren,
    flowParticipation: options.flowParticipation
  })
});
var CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS = [
  componentTypeContract("heading", "typography", "Heading", ["props.content", "props.level", "props.fontSize", "props.fontWeight", "props.color", "props.lineHeight"]),
  componentTypeContract("text", "typography", "Text", ["props.content", "props.fontSize", "props.fontWeight", "props.color", "props.lineHeight", "props.textAlign"]),
  componentTypeContract("paragraph", "typography", "Paragraph", ["props.content", "props.fontSize", "props.color", "props.lineHeight", "props.textAlign"]),
  componentTypeContract("quote", "typography", "Quote", ["props.content", "props.cite", "props.fontSize", "props.color", "props.lineHeight", "props.fontStyle"]),
  componentTypeContract("list", "typography", "List", ["props.items", "props.content", "props.listType", "props.fontSize", "props.color", "props.gap"]),
  componentTypeContract("collapsible", "typography", "Collapsible section", ["props.title", "props.defaultOpen", "props.content", "props.fontSize", "props.color", "props.lineHeight"]),
  componentTypeContract("button", "typography", "Button", ["props.content", "props.label", "props.href", "props.target", "props.rel", "props.variant", "props.action", "props.fileMediaId", "props.backgroundColor", "props.color", "props.borderRadius", "props.fontSize", "props.fontWeight"]),
  componentTypeContract("link", "typography", "Link", ["props.content", "props.href", "props.target", "props.rel", "props.download", "props.fileMediaId", "props.color", "props.fontSize", "props.underline"]),
  componentTypeContract("image", "media", "Image", ["props.src", "props.mediaId", "props.alt", "props.objectFit", "props.focalPoint", "props.caption"], { supportsMediaAssets: true }),
  componentTypeContract("video", "media", "Video", ["props.src", "props.mediaId", "props.poster", "props.posterMediaId", "props.controls", "props.autoplay", "props.muted", "props.loop", "props.playsInline", "props.objectFit"], { supportsMediaAssets: true }),
  componentTypeContract("audio", "media", "Audio", ["props.src", "props.mediaId", "props.caption", "props.transcript", "props.controls", "props.autoplay", "props.loop"], { supportsMediaAssets: true }),
  componentTypeContract("icon", "media", "Icon", ["props.icon", "props.name", "props.color", "props.size", "props.strokeWidth"]),
  componentTypeContract("map", "media", "Map", ["props.address", "props.src", "props.zoom", "props.markerLabel", "props.latitude", "props.longitude"]),
  componentTypeContract("container", "layout", "Container", ["props.layout", "props.gap", "props.padding", "props.backgroundColor"], { supportsChildren: true }),
  componentTypeContract("section", "layout", "Section", ["props.contentRole", "props.layout", "props.backgroundColor", "props.borderRadius", "props.padding", "props.anchorId"], { supportsChildren: true, flowParticipation: "root-section-flow" }),
  componentTypeContract("header", "layout", "Header", ["props.chromeRole", "props.position", "props.width", "props.showBrand", "props.navigationBinding", "props.backgroundColor", "props.borderColor", "props.padding"], { supportsChildren: true, flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.chromeRole", "props.navigationBinding", "site.navigation.primary"] }),
  componentTypeContract("footer", "layout", "Footer", ["props.chromeRole", "props.width", "props.showSocial", "props.newsletterBinding", "props.backgroundColor", "props.color", "props.padding"], { supportsChildren: true, flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.chromeRole", "props.newsletterBinding", "site.footer", "site.newsletter"] }),
  componentTypeContract("box", "layout", "Box", ["props.backgroundColor", "props.borderRadius", "props.borderColor", "props.borderStyle", "props.borderWidth", "props.shadow", "props.boxShadow", "props.contentRole"], { supportsChildren: true }),
  componentTypeContract("columns", "layout", "Columns", ["props.columns", "props.gap", "props.stackOnMobile", "props.columnWidths"], { supportsChildren: true }),
  componentTypeContract("spacer", "layout", "Spacer", ["props.size", "props.axis"]),
  componentTypeContract("divider", "layout", "Divider", ["props.orientation", "props.color", "props.borderColor", "props.thickness", "props.style", "props.margin"]),
  componentTypeContract("nav", "navigation", "Navigation", ["props.items", "props.navItems", "props.navigationSource", "props.navigationBinding", "props.chromeRole", "props.backgroundColor", "props.color", "props.padding", "props.direction", "props.gap", "props.ariaLabel"], { supportsChildren: true, flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.items", "props.navItems", "props.navigationSource", "props.navigationBinding", "props.chromeRole", "site.navigation.primary", "site.navigation.footer"] }),
  componentTypeContract("form", "forms", "Form", ["props.formId", "props.formTitle", "props.formName", "props.formDescription", "props.formActive", "props.formAudience", "props.actionUrl", "props.schema", "props.fields", "props.submitLabel", "props.successMessage", "props.newsletterTopicIds", "props.moderationMode", "props.enableHoneypot", "props.enableCaptcha", "props.contactShareEnabled", "props.contactShareNameField", "props.contactShareEmailField", "props.contactSharePhoneField", "props.contactShareNotesField", "props.backgroundColor", "props.borderColor", "props.borderRadius", "props.padding"], { supportsChildren: true }),
  componentTypeContract("input", "forms", "Input field", ["props.name", "props.label", "props.type", "props.inputType", "props.placeholder", "props.required", "props.value", "props.borderColor", "props.borderRadius"]),
  componentTypeContract("textarea", "forms", "Textarea field", ["props.name", "props.label", "props.placeholder", "props.required", "props.rows", "props.value", "props.borderColor", "props.borderRadius"]),
  componentTypeContract("select", "forms", "Select field", ["props.name", "props.label", "props.options", "props.placeholder", "props.required", "props.value", "props.borderColor", "props.borderRadius"]),
  componentTypeContract("checkbox", "forms", "Checkbox field", ["props.name", "props.label", "props.options", "props.required", "props.value"]),
  componentTypeContract("radio", "forms", "Radio field", ["props.name", "props.label", "props.options", "props.required", "props.value"]),
  componentTypeContract("repeater", "collections", "Repeater", ["props.collectionId", "props.datasetId", "props.limit", "props.columns", "props.gap", "props.titleField", "props.imageField", "props.descriptionField", "props.emptyMessage"], { supportsChildren: true }),
  componentTypeContract("comment", "comments", "Comment block", ["props.resourceType", "props.resourceId", "props.moderationMode", "props.allowReplies", "props.requireName", "props.requireEmail", "props.commentTitle", "props.commentAllowGuests", "props.commentRequireName", "props.commentRequireEmail", "props.commentAllowReplies", "props.commentModerationMode", "props.commentSortOrder"]),
  componentTypeContract("embed", "embeds", "Embed", ["props.src", "props.html", "props.allowedHosts", "props.allow", "props.sandbox", "props.loading", "props.borderRadius"]),
  componentTypeContract("html", "custom-code", "HTML block", ["props.html", "props.title", "props.sandbox", "props.allowedHosts", "props.backgroundColor", "props.borderRadius"], { supportsCustomCode: true }),
  componentTypeContract("table", "custom-code", "Table", ["props.html", "props.title", "props.rows", "props.columns", "props.caption", "props.backgroundColor", "props.borderRadius"]),
  componentTypeContract("interactiveFigure", "interactive-components", "Interactive figure", ["props.registryId", "props.runtimeUrl", "props.config", "props.datasetId", "props.sandbox", "props.componentKey", "props.version", "props.title", "props.records", "props.source", "props.xField", "props.yFields", "props.columns", "props.fallbackText", "props.fallback", "props.controls", "props.renderCapabilities", "props.series", "props.steps"], { supportsCustomCode: true }),
  componentTypeContract("codeBlock", "custom-code", "Code snippet", ["props.code", "props.language", "props.filename", "props.caption", "props.showLineNumbers", "props.wrapLines", "props.copyEnabled", "props.highlightTheme", "props.backgroundColor", "props.color"]),
  componentTypeContract("codeComponent", "custom-code", "Code component", ["props.code", "props.html", "props.css", "props.js", "props.sandbox", "props.allowedHosts", "props.config", "props.componentKey", "props.version", "props.title", "props.sandboxUrl", "props.fallbackText", "props.fallback", "props.controls", "props.renderCapabilities"], { supportsCustomCode: true })
];

// packages/core/src/site-backup.ts
var SITE_BACKUP_LIMITS = { maxRows: 5e4, maxFiles: 1e4, maxBinaryBytes: 32 * 1024 * 1024, maxArchiveBytes: 64 * 1024 * 1024, maxDepth: 100 };

// packages/core/src/data-figures.ts
var BACKY_DATA_FIGURE_KEYS = ["backy.chart.line", "backy.chart.bar", "backy.table.data"];
var isBackyDataFigureKey = (value) => BACKY_DATA_FIGURE_KEYS.includes(value);
var getBackyDataFigureRequestedFields = (config) => {
  const keys = config.componentKey === "backy.table.data" ? Array.isArray(config.columns) ? config.columns.map((column) => column?.key) : [] : Array.isArray(config.yFields) && config.yFields.length ? [config.xField, ...config.yFields] : [];
  if (!keys.length || keys.some((key) => typeof key !== "string" || !key.trim() || ["__proto__", "constructor", "prototype"].includes(key))) return null;
  return Array.from(new Set(keys));
};
var getBackyDataFigureError = (error) => {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const known = [
    "Published collection data could not be loaded. Try again.",
    "Published collection data returned an invalid response.",
    "This collection is unavailable for public article figures.",
    "Published collection pagination is invalid. Try again.",
    "The collection returned a record unavailable for public article figures.",
    "The collection changed while loading. Try again.",
    "Published collection pagination did not advance. Try again.",
    "This collection is private.",
    "This data source is unavailable.",
    "Data must be an array of rows.",
    "This figure supports at most 5,000 published records. Choose a smaller collection.",
    "The collection returned a record unavailable for public figures.",
    "The collection changed or returned incomplete data. Reload to try again.",
    "Published collection data could not be loaded.",
    "This collection is unavailable for public figures.",
    "Choose a published collection for this figure.",
    "Published collection data is unavailable.",
    "Choose explicit fields for this collection figure.",
    "A selected field is undeclared or unavailable for public figures."
  ];
  return known.includes(message) || /^This figure supports collections with at most [\d,]+ published records\. Choose a smaller collection\.$/.test(message) ? message : "Could not load this data. Check the source and try again.";
};
var getBackyDataValue = (row, key) => Object.prototype.hasOwnProperty.call(row, key) ? row[key] : void 0;
var formatBackyDataValue = (value) => {
  if (value === null || value === void 0) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Invalid number";
  if (typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "Unsupported value";
  } catch {
    return "Unsupported value";
  }
};
var parseBackyDataNumber = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inspectBackyDataRecords = (input) => {
  if (!Array.isArray(input)) return { rows: [], invalidRows: 0, error: "Data must be an array of rows." };
  const rows = input.filter((row) => row !== null && typeof row === "object" && !Array.isArray(row));
  return { rows, invalidRows: input.length - rows.length, error: "" };
};
var getBackyDataFields = (rows) => Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
var resolveBackyDataColumns = (config, rows) => {
  const columns = Array.isArray(config.columns) ? config.columns.filter((column) => column && typeof column.key === "string" && column.key.trim()).map((column) => ({ ...column, label: typeof column.label === "string" && column.label.trim() ? column.label : column.key })) : [];
  return Array.isArray(config.columns) ? columns : config.source?.type === "collection" ? [] : getBackyDataFields(rows).map((key) => ({ key, label: key }));
};
var queryBackyDataTable = (rows, columns, options) => {
  const query = (options.query || "").trim().toLocaleLowerCase();
  const filtered = rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || columns.some(({ key }) => formatBackyDataValue(getBackyDataValue(row, key)).toLocaleLowerCase().includes(query)));
  if (options.sortKey) filtered.sort((left, right) => {
    const a = getBackyDataValue(left.row, options.sortKey);
    const b = getBackyDataValue(right.row, options.sortKey);
    const aNumber = parseBackyDataNumber(a), bNumber = parseBackyDataNumber(b);
    const comparison = aNumber !== null && bNumber !== null ? aNumber - bNumber : formatBackyDataValue(a).localeCompare(formatBackyDataValue(b), void 0, { numeric: true });
    return (options.sortDirection === "desc" ? -comparison : comparison) || left.index - right.index;
  });
  const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, Math.min(100, Math.floor(options.pageSize))) : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Number.isFinite(options.page) ? Math.max(0, Math.min(pageCount - 1, Math.floor(options.page))) : 0;
  return { rows: filtered.slice(page * pageSize, (page + 1) * pageSize).map(({ row }) => row), total: filtered.length, page, pageCount, pageSize };
};
var buildBackyDataChart = (rows, config) => {
  const fields = getBackyDataFields(rows);
  const xField = typeof config.xField === "string" && config.xField ? config.xField : config.source?.type === "collection" ? "" : fields[0] || "";
  const yFields = Array.isArray(config.yFields) ? Array.from(new Set(config.yFields.filter((field) => typeof field === "string" && field))) : config.source?.type === "collection" ? [] : fields.filter((field) => field !== xField && rows.some((row) => parseBackyDataNumber(getBackyDataValue(row, field)) !== null));
  const labels = rows.map((row, index) => formatBackyDataValue(getBackyDataValue(row, xField)) || `Row ${index + 1}`);
  const series = yFields.map((key) => ({ key, values: rows.map((row) => parseBackyDataNumber(getBackyDataValue(row, key))) }));
  const numbers = series.flatMap((item) => item.values.filter((value) => value !== null));
  let minimum = 0, maximum = 0;
  for (const value of numbers) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!numbers.length || minimum === maximum) {
    minimum = 0;
    maximum = 1;
  }
  return { xField, labels, series, minimum, maximum, invalidValues: series.reduce((total, item) => total + item.values.filter((value) => value === null).length, 0), hasValues: numbers.length > 0 && Boolean(xField) };
};

// packages/core/src/data-figure-source.ts
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var MAX_ROWS = 5e3;
var PAGE_SIZE = 100;
var SCALAR_FIELDS = /* @__PURE__ */ new Set(["text", "number", "boolean", "date", "datetime", "select", "url", "email", "phone", "slug"]);
var publicCollection = (value, siteId) => object(value) && typeof value.id === "string" && !!value.id && value.siteId === siteId && value.status === "published" && object(value.permissions) && value.permissions.publicRead === true;
async function readPublicData(url, signal, request) {
  signal.throwIfAborted();
  const response = await request(url, { method: "GET", credentials: "omit", signal, headers: { accept: "application/json" } });
  signal.throwIfAborted();
  if (!response.ok) throw new Error("Published collection data could not be loaded. Try again.");
  const payload = await response.json();
  signal.throwIfAborted();
  if (!object(payload) || payload.success !== true || !object(payload.data)) throw new Error("Published collection data returned an invalid response.");
  return payload.data;
}
async function loadBackyPublicDataFigureRecords({ apiBaseUrl, siteId, collectionId, signal, requestedFields, fetch: request = globalThis.fetch }) {
  const apiBase = apiBaseUrl.replace(/\/$/, "");
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  let offset = 0;
  let previousTotal;
  let selectedFields;
  for (; ; ) {
    const data = await readPublicData(`${apiBase}/sites/${encodeURIComponent(siteId)}/collections/${encodeURIComponent(collectionId)}/records?limit=${PAGE_SIZE}&offset=${offset}`, signal, request);
    if (!publicCollection(data.collection, siteId) || data.collection.id !== collectionId || !Array.isArray(data.records) || !object(data.pagination)) throw new Error("This collection is unavailable for public article figures.");
    const { limit, offset: returnedOffset, total, hasMore } = data.pagination;
    if (returnedOffset !== offset || !Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE || !Number.isInteger(total) || total < 0 || typeof hasMore !== "boolean" || data.records.length > limit || previousTotal !== void 0 && previousTotal !== total) throw new Error("Published collection pagination is invalid. Try again.");
    if (total > MAX_ROWS || rows.length + data.records.length > MAX_ROWS) throw new Error(`This figure supports collections with at most ${MAX_ROWS.toLocaleString()} published records. Choose a smaller collection.`);
    if (hasMore ? data.records.length !== limit || offset + data.records.length >= total : offset + data.records.length !== total) throw new Error("Published collection pagination is invalid. Try again.");
    const fields = Array.isArray(data.collection.fields) ? data.collection.fields.filter(object) : [];
    const validKey = (key) => typeof key === "string" && !!key && !["__proto__", "constructor", "prototype"].includes(key);
    const scalarKey = (key) => {
      const matches = fields.filter((field) => field.key === key);
      return matches.length === 1 && SCALAR_FIELDS.has(String(matches[0].type));
    };
    const selected = selectedFields ?? (requestedFields === void 0 ? fields.map((field) => field.key).filter(validKey).filter(scalarKey) : [...new Set(requestedFields)]);
    if (selected.some((key) => !validKey(key) || !scalarKey(key)) || requestedFields !== void 0 && !selected.length) throw new Error("A selected field is undeclared or unavailable for public figures.");
    selectedFields = selected;
    previousTotal = total;
    for (const record2 of data.records) {
      if (!object(record2) || record2.siteId !== siteId || record2.collectionId !== collectionId || record2.status !== "published" || typeof record2.id !== "string" || !record2.id || !object(record2.values)) throw new Error("The collection returned a record unavailable for public article figures.");
      if (seen.has(record2.id)) throw new Error("The collection changed while loading. Try again.");
      seen.add(record2.id);
      const values = record2.values;
      rows.push(Object.fromEntries(selected.map((key) => {
        const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        return [key, typeof value === "string" || typeof value === "boolean" || value === null || typeof value === "number" && Number.isFinite(value) ? value : null];
      })));
    }
    if (!hasMore) {
      if (rows.length !== total) throw new Error("The collection changed while loading. Try again.");
      return rows;
    }
    if (!data.records.length || rows.length >= total) throw new Error("Published collection pagination did not advance. Try again.");
    offset += limit;
  }
}

// packages/core/src/form-submission-examples.ts
var BACKY_FORM_SUBMISSION_FILE_LIMITS = { maxFiles: 5, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 };

// packages/core/src/index.ts
var MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,
  // 10MB
  video: 100 * 1024 * 1024,
  // 100MB
  audio: 50 * 1024 * 1024,
  // 50MB
  document: 20 * 1024 * 1024,
  // 20MB
  other: 10 * 1024 * 1024
  // 10MB
};

// packages/editor/src/RichTextContent.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var record = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
var string = (value) => typeof value === "string" ? value : "";
var safeUrl = (value, media = false) => {
  const source = string(value).trim();
  if (!source || /[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith("//")) return void 0;
  if (/^(?:\/(?!\/)|\.\.?\/|#)/.test(source)) return source;
  try {
    const url = new URL(source);
    return ["http:", "https:"].includes(url.protocol) || !media && ["mailto:", "tel:"].includes(url.protocol) ? source : void 0;
  } catch {
    return void 0;
  }
};
var color = (value) => {
  const source = string(value);
  return /^(?:#[a-f0-9]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/i.test(source) ? source : void 0;
};
var length = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 512) return value;
  const source = string(value);
  return /^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(source) && Number.parseFloat(source) <= 512 ? source : void 0;
};
var styleFor = (node) => ({
  color: color(node.color),
  backgroundColor: color(node.backgroundColor),
  fontSize: length(node.fontSize),
  fontFamily: /^[a-z0-9 ,'"-]+$/i.test(string(node.fontFamily)) ? string(node.fontFamily) : void 0,
  textAlign: ["left", "right", "center", "justify", "start", "end"].includes(string(node.align)) ? node.align : void 0,
  ...typeof node.indent === "number" && node.indent > 0 && node.indent <= 20 ? { marginLeft: node.indent * 24 } : {}
});
var plainText = (value, depth = 0) => {
  if (depth > 40) return "";
  if (Array.isArray(value)) return value.map((child) => plainText(child, depth + 1)).join("");
  if (!record(value)) return string(value);
  return typeof value.text === "string" ? value.text : plainText(value.children, depth + 1);
};
function BackyRichTextContent({ value, inline = false, renderInteractive, renderDataFigure }) {
  let remainingNodes = 1e4;
  const render = (value2, key, depth = 0) => {
    if (depth > 40 || --remainingNodes < 0) return null;
    if (Array.isArray(value2)) return value2.map((child, index) => /* @__PURE__ */ jsx(React.Fragment, { children: render(child, `${key}-${index}`, depth + 1) }, `${key}-${index}`));
    if (!record(value2)) return string(value2);
    if (typeof value2.text === "string") {
      let text = value2.text;
      if (value2.code === true) text = /* @__PURE__ */ jsx("code", { children: text });
      if (value2.bold === true) text = /* @__PURE__ */ jsx("strong", { children: text });
      if (value2.italic === true || value2.fontStyle === "italic") text = /* @__PURE__ */ jsx("em", { children: text });
      if (value2.underline === true) text = /* @__PURE__ */ jsx("u", { children: text });
      if (value2.strikethrough === true) text = /* @__PURE__ */ jsx("s", { children: text });
      return /* @__PURE__ */ jsx("span", { style: styleFor(value2), children: text });
    }
    const type = string(value2.type) || "p";
    const children = () => render(value2.children, `${key}-children`, depth + 1);
    if (type === "a" || type === "link") {
      const href = safeUrl(value2.url ?? value2.href);
      return href ? /* @__PURE__ */ jsx("a", { href, target: value2.target === "_blank" ? "_blank" : void 0, rel: value2.target === "_blank" ? "noopener noreferrer" : void 0, style: styleFor(value2), children: children() }) : /* @__PURE__ */ jsx(Fragment, { children: children() });
    }
    if (inline) return /* @__PURE__ */ jsx(Fragment, { children: children() });
    if (type === "interactive_component") return renderInteractive ? renderInteractive(value2) : /* @__PURE__ */ jsx("p", { role: "status", "data-backy-unsupported-rich-node": type, children: "Registered component renderer is unavailable." });
    if (type === "data_figure" && isBackyDataFigureKey(value2.componentKey)) return renderDataFigure ? renderDataFigure(value2) : /* @__PURE__ */ jsx("p", { role: "status", "data-backy-unsupported-rich-node": type, children: "Data figure renderer is unavailable." });
    if (type === "collapsible") return /* @__PURE__ */ jsxs("details", { open: value2.defaultOpen === true, style: { border: "1px solid #cbd5e1", borderRadius: 6, padding: 12, margin: "1em 0" }, children: [
      /* @__PURE__ */ jsx("summary", { children: string(value2.title) || "Details" }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 8 }, children: children() })
    ] });
    if (type === "img" || type === "image") {
      const src = safeUrl(value2.url ?? value2.src, true);
      if (!src) return null;
      const caption = plainText(value2.caption);
      return /* @__PURE__ */ jsxs("figure", { style: { margin: "1em 0" }, children: [
        /* @__PURE__ */ jsx("img", { src, alt: string(value2.alt), loading: "lazy", style: { maxWidth: "100%", height: "auto" } }),
        caption ? /* @__PURE__ */ jsx("figcaption", { children: caption }) : null
      ] });
    }
    if (["media_embed", "mediaEmbed", "video", "audio"].includes(type)) {
      const source = resolveBackyVideoSource(value2.url ?? value2.src, { controls: true });
      const embed = ["youtube", "vimeo", "drive"].includes(source.kind) ? source.src : void 0;
      const src = safeUrl(value2.url ?? value2.src, true);
      const caption = plainText(value2.caption);
      let media = null;
      if (embed) media = /* @__PURE__ */ jsx("iframe", { src: embed, title: string(value2.title) || "Embedded video", loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-presentation", referrerPolicy: "strict-origin-when-cross-origin", allowFullScreen: true, style: { width: "100%", aspectRatio: "16 / 9", border: 0 } });
      else if (src && type === "audio") media = /* @__PURE__ */ jsx("audio", { src, controls: true, preload: "metadata" });
      else if (source.kind === "native" && type !== "audio") media = /* @__PURE__ */ jsx("video", { src: source.src, controls: true, preload: "metadata", style: { maxWidth: "100%" } });
      return media ? /* @__PURE__ */ jsxs("figure", { style: { margin: "1em 0" }, children: [
        media,
        caption ? /* @__PURE__ */ jsx("figcaption", { children: caption }) : null
      ] }) : null;
    }
    if (["code_block", "codeBlock", "pre"].includes(type)) {
      const lines = Array.isArray(value2.children) ? value2.children.map((child) => plainText(child)).join("\n") : plainText(value2.children);
      const language = normalizeBackyCodeLanguage(value2.lang ?? value2.language ?? "text");
      return /* @__PURE__ */ jsx("pre", { style: { overflowX: "auto", whiteSpace: "pre", background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 6 }, children: /* @__PURE__ */ jsx("code", { "data-language": language, children: lines.split("\n").map((line, lineIndex) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
        lineIndex > 0 ? "\n" : "",
        tokenizeBackyCodeLine(line, language).map((token, index) => /* @__PURE__ */ jsx("span", { "data-backy-code-token": token.type, style: token.type === "plain" ? void 0 : { color: BACKY_CODE_HIGHLIGHT_THEMES.dark[token.type] }, children: token.text }, `${key}-token-${lineIndex}-${index}`))
      ] }, `${key}-line-${lineIndex}`)) }) });
    }
    if (type === "table") {
      const hasSections = Array.isArray(value2.children) && value2.children.some((child) => record(child) && ["thead", "tbody", "tfoot"].includes(string(child.type)));
      return /* @__PURE__ */ jsx("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [
        plainText(value2.caption) ? /* @__PURE__ */ jsx("caption", { children: plainText(value2.caption) }) : null,
        hasSections ? children() : /* @__PURE__ */ jsx("tbody", { children: children() })
      ] }) });
    }
    if (type === "td" || type === "th") {
      const span = (input) => typeof input === "number" && Number.isInteger(input) && input > 0 && input <= 100 ? input : void 0;
      return React.createElement(type, { colSpan: span(value2.colSpan ?? value2.colspan), rowSpan: span(value2.rowSpan ?? value2.rowspan), style: { ...styleFor(value2), border: "1px solid #cbd5e1", padding: 8 } }, children());
    }
    const tags = { p: "p", paragraph: "p", h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6", ul: "ul", ol: "ol", li: "li", item: "li", blockquote: "blockquote", quote: "blockquote", tr: "tr", thead: "thead", tbody: "tbody", tfoot: "tfoot", code_line: "div", code: "code" };
    return React.createElement(tags[type] || "div", { style: styleFor(value2) }, children());
  };
  return /* @__PURE__ */ jsx(Fragment, { children: render(value, "rich") });
}

// apps/public/src/components/BackyDataFigure.tsx
import { useCallback } from "react";

// packages/editor/src/DataFigure.tsx
import { useEffect, useId, useMemo, useRef, useState } from "react";

// packages/editor/src/dataFigureLoading.ts
function createDataFigureLoadSession() {
  let controller;
  let generation = 0;
  const cancel = () => {
    generation += 1;
    controller?.abort();
    controller = void 0;
  };
  const start = async (identity, epoch, collectionId, loader, publish, requestedFields) => {
    cancel();
    const current = generation;
    const request = new AbortController();
    controller = request;
    publish({ identity, epoch, status: "loading", records: [], error: "" });
    try {
      let records = await loader(collectionId, { signal: request.signal, requestedFields });
      if (inspectBackyDataRecords(records).error) throw new Error("Data must be an array of rows.");
      if (requestedFields) {
        const inspection = inspectBackyDataRecords(records);
        if (inspection.invalidRows) throw new Error("Data must be an array of rows.");
        records = inspection.rows.map((row) => Object.fromEntries(requestedFields.map((key) => {
          const value = Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
          if (value !== null && value !== void 0 && typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) throw new Error("A selected field is undeclared or unavailable for public figures.");
          return [key, value ?? null];
        })));
      }
      if (current === generation && !request.signal.aborted) publish({ identity, epoch, status: "ready", records, error: "" });
    } catch (error) {
      if (current === generation && !request.signal.aborted) publish({ identity, epoch, status: "error", records: [], error: getBackyDataFigureError(error) });
    }
  };
  return { start, cancel };
}
function resolveDataFigureView(config, editable, loader, identity, epoch, loaded) {
  const source = config.source;
  if (source !== void 0 && (!source || typeof source !== "object" || !["inline", "collection"].includes(source.type))) return { status: "error", records: [], error: "Choose a valid data source in the figure settings." };
  if (source?.type !== "collection") return { status: "ready", records: config.records ?? [], error: "" };
  if (!source.collectionId || typeof source.collectionId !== "string") return { status: "error", records: [], error: "Choose a collection to show its data." };
  if (!editable && epoch === 0 && config.dataStatus === "error") return { status: "error", records: [], error: getBackyDataFigureError(config.dataError) };
  if (!editable && !getBackyDataFigureRequestedFields(config)) return { status: "error", records: [], error: "Choose explicit fields for this collection figure." };
  if (!editable && epoch === 0) {
    if (config.dataStatus === "ready" && Array.isArray(config.records)) return { status: "ready", records: config.records, error: "" };
  }
  if (!loader) return { status: "error", records: [], error: "This data source is unavailable here." };
  return loaded?.identity === identity && loaded.epoch === epoch ? loaded : { status: "loading", records: [], error: "" };
}

// packages/editor/src/inputEvents.ts
function handleBackyFigureControlKeyDown(event) {
  const target = event.target;
  if (!target?.closest?.("input, select, textarea, button, summary")) return;
  event.stopPropagation();
  if (event.key === "Enter" && target.tagName === "INPUT" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) event.preventDefault();
}

// packages/editor/src/DataFigure.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var inputStyle = { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 12px", font: "inherit", color: "#334155", background: "#fff", boxSizing: "border-box", maxWidth: "100%" };
var buttonStyle = { ...inputStyle, cursor: "pointer" };
var COLORS = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c", "#475569"];
var kindName = (key) => key === "backy.table.data" ? "Table" : key === "backy.chart.bar" ? "Bar chart" : "Line chart";
var jsonDraft = (value) => {
  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return "";
  }
};
var ownSource = (config) => config.source && typeof config.source === "object" ? config.source : { type: "inline" };
function resolveBackyDataPlotLayout(measuredWidth = 720, labelCount = 0, isBar = false) {
  const width = Number.isFinite(measuredWidth) && measuredWidth > 0 ? Math.max(240, Math.min(4096, Math.round(measuredWidth))) : 720;
  const left = 72, top = 20, plottingHeight = 224, height = 304;
  const plottingWidth = width - left - 28;
  const tickCount = Math.min(labelCount, Math.max(2, Math.min(7, Math.floor(plottingWidth / 80) + 1)));
  const tickIndices = Array.from({ length: tickCount }, (_, index) => tickCount === 1 ? 0 : Math.round(index * (labelCount - 1) / (tickCount - 1)));
  const labelSpan = plottingWidth * (isBar && labelCount > 1 ? (labelCount - 1) / labelCount : 1);
  const labelCharacters = Math.max(4, Math.min(16, Math.floor(labelSpan / Math.max(1, tickCount) / 7)));
  return { width, height, left, top, plottingWidth, plottingHeight, tickIndices, labelCharacters, fontSize: 12 };
}
function watchBackyDataPlotWidth(element, onWidth) {
  let active = true;
  const publishWidth = (width) => {
    if (!active) return;
    if (Number.isFinite(width) && width > 0) onWidth(resolveBackyDataPlotLayout(width).width);
  };
  const measure = () => publishWidth(element.clientWidth);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => publishWidth(entries[0]?.contentRect.width ?? element.clientWidth));
  observer?.observe(element);
  if (typeof window !== "undefined") window.addEventListener("resize", measure);
  measure();
  return () => {
    active = false;
    observer?.disconnect();
    if (typeof window !== "undefined") window.removeEventListener("resize", measure);
  };
}
function DataFigure({ config, editable = false, onChange, loadRecords, collections = [], pageSize = 10, className }) {
  const invalidConfig = !config || typeof config !== "object" || Array.isArray(config) || !isBackyDataFigureKey(config.componentKey);
  config = config && typeof config === "object" && !Array.isArray(config) ? config : { componentKey: "backy.chart.line" };
  const id = useId();
  const source = ownSource(config);
  const collectionId = source.type === "collection" && typeof source.collectionId === "string" ? source.collectionId : "";
  const collectionSource = source.type === "collection";
  const requestedFields = collectionSource ? getBackyDataFigureRequestedFields(config) : null;
  const requestedFieldKey = editable ? "authoring-fields" : JSON.stringify(requestedFields);
  const hydrated = config.dataStatus === "ready" && Array.isArray(config.records);
  const identity = useMemo(() => ({}), [collectionSource, collectionId, loadRecords, editable, config.records, config.dataStatus, config.dataError, requestedFieldKey]);
  const [reload, setReload] = useState(null);
  const epoch = reload?.identity === identity ? reload.epoch : 0;
  const [loaded, setLoaded] = useState(null);
  const session = useMemo(createDataFigureLoadSession, []);
  const reloadData = () => {
    session.cancel();
    setReload({ identity, epoch: epoch + 1 });
  };
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [hiddenSeries, setHiddenSeries] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [recordsDraft, setRecordsDraft] = useState(() => jsonDraft(config.records));
  const [draftError, setDraftError] = useState("");
  const serializedRecords = jsonDraft(config.records);
  useEffect(() => {
    setRecordsDraft(serializedRecords);
    setDraftError("");
  }, [serializedRecords]);
  useEffect(() => {
    setPage(0);
    setQuery("");
    setSort({ key: "", direction: "asc" });
    setHiddenSeries([]);
    setHovered(null);
  }, [collectionId, config.componentKey]);
  useEffect(() => {
    if (!collectionSource || !collectionId || !loadRecords || !editable && !requestedFields || !editable && epoch === 0 && (hydrated || config.dataStatus === "error")) return;
    void session.start(identity, epoch, collectionId, loadRecords, setLoaded, editable ? void 0 : requestedFields);
    return session.cancel;
  }, [collectionSource, collectionId, loadRecords, identity, epoch, hydrated, editable, config.dataStatus, session]);
  const view = resolveDataFigureView(config, editable, loadRecords, identity, epoch, loaded);
  const status = invalidConfig ? "error" : view.status;
  const sourceError = invalidConfig ? "Choose a valid figure display in the figure settings." : view.error;
  const records = view.records;
  const inspection = useMemo(() => inspectBackyDataRecords(records), [records]);
  const rows = inspection.rows;
  const fields = useMemo(() => getBackyDataFields(rows), [rows]);
  const columns = useMemo(() => resolveBackyDataColumns(config, rows), [config, rows]);
  const result = useMemo(() => queryBackyDataTable(rows, columns, { query, page, pageSize, sortKey: sort.key, sortDirection: sort.direction }), [rows, columns, query, page, pageSize, sort]);
  const chart = useMemo(() => buildBackyDataChart(rows, config), [rows, config]);
  const plotRef = useRef(null);
  const [plotWidth, setPlotWidth] = useState(720);
  useEffect(() => {
    const element = plotRef.current;
    if (element) return watchBackyDataPlotWidth(element, setPlotWidth);
  }, [status, config.componentKey, chart.hasValues]);
  const visibleSeries = chart.series.filter((series) => !hiddenSeries.includes(series.key));
  const kind = isBackyDataFigureKey(config.componentKey) ? config.componentKey : "backy.chart.line";
  const missingFields = (kind === "backy.table.data" ? columns.map((column) => column.key) : [chart.xField, ...chart.series.map((series) => series.key)]).filter((field) => field && !fields.includes(field));
  const missingLabels = kind === "backy.table.data" ? 0 : rows.filter((row) => !formatBackyDataValue(getBackyDataValue(row, chart.xField))).length;
  const canEdit = editable && Boolean(onChange);
  const title = typeof config.title === "string" && config.title.trim() ? config.title : kindName(kind);
  const patch = (value) => onChange?.(value);
  const applyRecords = () => {
    try {
      const parsed = JSON.parse(recordsDraft);
      const inspected = inspectBackyDataRecords(parsed);
      if (inspected.error || inspected.invalidRows) {
        setDraftError("Use an array of row objects. Each row must contain named fields.");
        return;
      }
      patch({ records: parsed });
      setDraftError("");
      setPage(0);
    } catch {
      setDraftError("The data is not valid JSON. Check commas, quotes and brackets.");
    }
  };
  const plot = resolveBackyDataPlotLayout(plotWidth, chart.labels.length, kind === "backy.chart.bar");
  const { plottingWidth, plottingHeight, left, top } = plot;
  const truncateLabel = (label, characters) => label.length > characters ? `${label.slice(0, characters - 1)}\u2026` : label;
  const x = (index) => left + (kind === "backy.chart.bar" ? (index + 0.5) * plottingWidth / Math.max(1, chart.labels.length) : chart.labels.length <= 1 ? plottingWidth / 2 : index * plottingWidth / (chart.labels.length - 1));
  const domainScale = Math.max(Math.abs(chart.minimum), Math.abs(chart.maximum), 1);
  const y = (value) => top + plottingHeight - (value / domainScale - chart.minimum / domainScale) / (chart.maximum / domainScale - chart.minimum / domainScale) * plottingHeight;
  const showValue = (series, index, value) => setHovered({ series, label: chart.labels[index], value });
  return /* @__PURE__ */ jsxs2("figure", { onKeyDown: handleBackyFigureControlKeyDown, "aria-busy": status === "loading", className, "data-backy-data-figure": kind, style: { margin: "1.25em 0", minWidth: 0, maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, background: "#fff", color: "#334155", fontSize: 14, lineHeight: 1.5 }, children: [
    /* @__PURE__ */ jsx2("figcaption", { id: `${id}-title`, style: { fontSize: 18, fontWeight: 600, color: "#0f172a", marginBottom: 16 }, children: title }),
    collectionSource && collectionId && loadRecords && (editable || requestedFields) && !invalidConfig && /* @__PURE__ */ jsx2("button", { type: "button", disabled: status === "loading", onClick: reloadData, style: { ...buttonStyle, marginBottom: 12 }, children: status === "error" ? "Retry data" : status === "loading" ? "Loading data\u2026" : "Refresh data" }),
    status === "loading" && /* @__PURE__ */ jsx2("p", { role: "status", children: "Loading data\u2026" }),
    status === "error" && /* @__PURE__ */ jsx2("p", { role: "alert", children: sourceError }),
    status === "ready" && inspection.error && /* @__PURE__ */ jsx2("p", { role: "alert", children: inspection.error }),
    status === "ready" && inspection.invalidRows > 0 && /* @__PURE__ */ jsxs2("p", { role: "status", children: [
      inspection.invalidRows,
      " invalid ",
      inspection.invalidRows === 1 ? "row is" : "rows are",
      " excluded from this view. Saved data is unchanged."
    ] }),
    status === "ready" && rows.length > 0 && missingFields.length > 0 && /* @__PURE__ */ jsxs2("p", { role: "status", children: [
      "Selected fields are missing from this data: ",
      Array.from(new Set(missingFields)).join(", "),
      "."
    ] }),
    status === "ready" && chart.xField && missingLabels > 0 && /* @__PURE__ */ jsxs2("p", { role: "status", children: [
      missingLabels,
      " missing horizontal ",
      missingLabels === 1 ? "label is" : "labels are",
      " shown as row numbers."
    ] }),
    status === "ready" && !inspection.error && !rows.length && /* @__PURE__ */ jsxs2("p", { role: "status", children: [
      "No data yet. ",
      canEdit ? "Add your rows in the figure settings." : ""
    ] }),
    status === "ready" && rows.length > 0 && kind === "backy.table.data" && !columns.length && /* @__PURE__ */ jsx2("p", { role: "status", children: "Choose columns in the figure settings to show this table." }),
    status === "ready" && rows.length > 0 && kind === "backy.table.data" && columns.length > 0 && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("label", { htmlFor: `${id}-search`, style: { display: "block", marginBottom: 12 }, children: [
        "Search table ",
        /* @__PURE__ */ jsx2("input", { id: `${id}-search`, type: "search", "aria-label": "Search table", value: query, onChange: (event) => {
          setQuery(event.target.value);
          setPage(0);
        }, style: { ...inputStyle, marginLeft: 8, width: "min(100%, 260px)" } })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { overflowX: "auto", maxWidth: "100%" }, children: /* @__PURE__ */ jsxs2("table", { "aria-labelledby": `${id}-title`, style: { width: "100%", borderCollapse: "collapse", textAlign: "left" }, children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { children: columns.map((column, index) => /* @__PURE__ */ jsx2("th", { scope: "col", "aria-sort": sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none", style: { borderBottom: "2px solid #cbd5e1" }, children: /* @__PURE__ */ jsxs2("button", { type: "button", "aria-label": `Sort by ${column.label}`, onClick: () => {
          setSort({ key: column.key, direction: sort.key === column.key && sort.direction === "asc" ? "desc" : "asc" });
          setPage(0);
        }, style: { ...buttonStyle, textAlign: "left", fontWeight: 600, border: 0, whiteSpace: "nowrap" }, children: [
          column.label,
          sort.key === column.key ? sort.direction === "asc" ? " \u2191" : " \u2193" : ""
        ] }) }, `${column.key}-${index}`)) }) }),
        /* @__PURE__ */ jsx2("tbody", { children: result.rows.map((row, rowIndex) => /* @__PURE__ */ jsx2("tr", { children: columns.map((column, index) => /* @__PURE__ */ jsx2("td", { style: { padding: "12px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top", overflowWrap: "anywhere", maxWidth: 280 }, children: formatBackyDataValue(getBackyDataValue(row, column.key)) }, `${column.key}-${index}`)) }, rowIndex)) })
      ] }) }),
      !result.total && /* @__PURE__ */ jsx2("p", { role: "status", children: "No rows match your search." }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 12 }, children: [
        /* @__PURE__ */ jsxs2("span", { role: "status", children: [
          result.total,
          " ",
          result.total === 1 ? "row" : "rows",
          " \xB7 Page ",
          result.page + 1,
          " of ",
          result.pageCount
        ] }),
        /* @__PURE__ */ jsx2("button", { type: "button", disabled: result.page === 0, onClick: () => setPage(result.page - 1), style: buttonStyle, children: "Previous" }),
        /* @__PURE__ */ jsx2("button", { type: "button", disabled: result.page + 1 >= result.pageCount, onClick: () => setPage(result.page + 1), style: buttonStyle, children: "Next" })
      ] })
    ] }),
    status === "ready" && rows.length > 0 && kind !== "backy.table.data" && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      chart.invalidValues > 0 && /* @__PURE__ */ jsxs2("p", { role: "status", children: [
        chart.invalidValues,
        " missing or invalid numeric ",
        chart.invalidValues === 1 ? "value is" : "values are",
        " shown as gaps."
      ] }),
      !chart.hasValues && /* @__PURE__ */ jsx2("p", { role: "status", children: "Choose numeric value fields to draw this chart." }),
      chart.hasValues && /* @__PURE__ */ jsxs2(Fragment2, { children: [
        /* @__PURE__ */ jsx2("div", { role: "group", "aria-label": "Chart series", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }, children: chart.series.map((series, index) => /* @__PURE__ */ jsxs2("button", { type: "button", "aria-pressed": !hiddenSeries.includes(series.key), onClick: () => {
          setHiddenSeries((hidden) => hidden.includes(series.key) ? hidden.filter((key) => key !== series.key) : [...hidden, series.key]);
          setHovered(null);
        }, style: { ...buttonStyle, display: "inline-flex", alignItems: "center", gap: 8, opacity: hiddenSeries.includes(series.key) ? 0.5 : 1 }, children: [
          /* @__PURE__ */ jsx2("span", { "aria-hidden": "true", style: { width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] } }),
          series.key
        ] }, series.key)) }),
        /* @__PURE__ */ jsxs2("svg", { ref: plotRef, role: "img", "aria-labelledby": `${id}-title ${id}-description`, viewBox: `0 0 ${plot.width} ${plot.height}`, style: { display: "block", width: "100%", height: "auto", minWidth: 0 }, children: [
          /* @__PURE__ */ jsx2("desc", { id: `${id}-description`, children: `${kindName(kind)}. Horizontal axis: ${chart.xField}. Series: ${visibleSeries.map((series) => series.key).join(", ")}. Focus a data point to read its value.` }),
          [0, 1, 2, 3, 4].map((tick) => {
            const value = chart.minimum * (1 - tick / 4) + chart.maximum * (tick / 4);
            return /* @__PURE__ */ jsxs2("g", { children: [
              /* @__PURE__ */ jsx2("line", { x1: left, x2: left + plottingWidth, y1: y(value), y2: y(value), stroke: "#e2e8f0" }),
              /* @__PURE__ */ jsx2("text", { x: left - 8, y: y(value) + 4, textAnchor: "end", fontSize: plot.fontSize, fill: "#64748b", children: Number.isFinite(Number(value.toPrecision(4))) ? Number(value.toPrecision(4)) : value.toExponential(3) })
            ] }, tick);
          }),
          /* @__PURE__ */ jsx2("line", { x1: left, x2: left + plottingWidth, y1: y(0), y2: y(0), stroke: "#94a3b8" }),
          plot.tickIndices.map((index, tick) => /* @__PURE__ */ jsx2("text", { x: x(index), y: top + plottingHeight + 24, textAnchor: plot.tickIndices.length === 1 ? "middle" : tick === 0 ? "start" : tick === plot.tickIndices.length - 1 ? "end" : "middle", fontSize: plot.fontSize, fill: "#64748b", "aria-label": chart.labels[index], children: truncateLabel(chart.labels[index], plot.labelCharacters) }, index)),
          /* @__PURE__ */ jsx2("text", { x: left + plottingWidth / 2, y: 294, textAnchor: "middle", fontSize: plot.fontSize, fill: "#64748b", children: truncateLabel(chart.xField, Math.max(4, Math.floor(plottingWidth / 7))) }),
          visibleSeries.map((series, seriesIndex) => {
            const color2 = COLORS[chart.series.findIndex((item) => item.key === series.key) % COLORS.length];
            let activePath = false;
            const path = series.values.map((value, index) => {
              if (value === null) {
                activePath = false;
                return "";
              }
              const command = activePath ? "L" : "M";
              activePath = true;
              return `${command}${x(index)},${y(value)}`;
            }).join(" ");
            const groupWidth = plottingWidth / Math.max(1, chart.labels.length);
            const barWidth = groupWidth * 0.72 / Math.max(1, visibleSeries.length);
            return /* @__PURE__ */ jsxs2("g", { children: [
              kind === "backy.chart.line" && /* @__PURE__ */ jsx2("path", { d: path, fill: "none", stroke: color2, strokeWidth: "2" }),
              series.values.map((value, index) => value === null ? null : kind === "backy.chart.line" ? /* @__PURE__ */ jsx2("circle", { cx: x(index), cy: y(value), r: hovered?.series === series.key && hovered.label === chart.labels[index] ? 5 : 3, fill: color2, tabIndex: 0, "aria-label": `${series.key}, ${chart.labels[index]}: ${value}`, onMouseEnter: () => showValue(series.key, index, value), onMouseLeave: () => setHovered(null), onFocus: () => showValue(series.key, index, value), onBlur: () => setHovered(null), children: /* @__PURE__ */ jsx2("title", { children: `${series.key}: ${chart.labels[index]} \xB7 ${value}` }) }, index) : /* @__PURE__ */ jsx2("rect", { x: left + index * groupWidth + groupWidth * 0.14 + seriesIndex * barWidth, y: Math.min(y(value), y(0)), width: Math.max(0.5, barWidth - 2), height: Math.max(1, Math.abs(y(value) - y(0))), fill: color2, tabIndex: 0, "aria-label": `${series.key}, ${chart.labels[index]}: ${value}`, onMouseEnter: () => showValue(series.key, index, value), onMouseLeave: () => setHovered(null), onFocus: () => showValue(series.key, index, value), onBlur: () => setHovered(null), children: /* @__PURE__ */ jsx2("title", { children: `${series.key}: ${chart.labels[index]} \xB7 ${value}` }) }, index))
            ] }, series.key);
          })
        ] }),
        /* @__PURE__ */ jsx2("output", { "aria-live": "polite", style: { display: "block", minHeight: 24, color: "#475569" }, children: hovered ? `${hovered.label} \xB7 ${hovered.series}: ${hovered.value}` : visibleSeries.length ? "Hover or focus a point to read its value." : "Choose a series to show it." })
      ] })
    ] }),
    canEdit && /* @__PURE__ */ jsxs2("details", { style: { borderTop: "1px solid #e2e8f0", marginTop: 16, paddingTop: 4 }, children: [
      /* @__PURE__ */ jsx2("summary", { style: { minHeight: 44, padding: "10px 0", cursor: "pointer", fontWeight: 600 }, children: "Figure settings" }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }, children: [
        /* @__PURE__ */ jsxs2("label", { children: [
          "Title",
          /* @__PURE__ */ jsx2("input", { "aria-label": "Figure title", value: typeof config.title === "string" ? config.title : "", onChange: (event) => patch({ title: event.target.value }), style: { ...inputStyle, display: "block", width: "100%" } })
        ] }),
        /* @__PURE__ */ jsxs2("label", { children: [
          "Display",
          /* @__PURE__ */ jsxs2("select", { "aria-label": "Figure display", value: kind, onChange: (event) => patch({ componentKey: event.target.value }), style: { ...inputStyle, display: "block", width: "100%" }, children: [
            /* @__PURE__ */ jsx2("option", { value: "backy.chart.line", children: "Line chart" }),
            /* @__PURE__ */ jsx2("option", { value: "backy.chart.bar", children: "Bar chart" }),
            /* @__PURE__ */ jsx2("option", { value: "backy.table.data", children: "Table" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("label", { children: [
          "Data source",
          /* @__PURE__ */ jsxs2("select", { "aria-label": "Figure data source", value: collectionSource ? "collection" : "inline", onChange: (event) => patch({ source: event.target.value === "inline" ? { ...source, type: "inline" } : { ...source, type: "collection", collectionId: collections[0]?.id || "" }, ...event.target.value === "collection" ? { xField: "", yFields: [], columns: [] } : {}, dataStatus: void 0, dataError: void 0 }), style: { ...inputStyle, display: "block", width: "100%" }, children: [
            /* @__PURE__ */ jsx2("option", { value: "inline", children: "Article data" }),
            (collections.length > 0 || collectionSource) && /* @__PURE__ */ jsx2("option", { value: "collection", children: "Collection" })
          ] })
        ] }),
        collectionSource && /* @__PURE__ */ jsxs2("label", { children: [
          "Collection",
          /* @__PURE__ */ jsxs2("select", { "aria-label": "Figure collection", value: collectionId, onChange: (event) => patch({ source: { ...source, type: "collection", collectionId: event.target.value }, xField: "", yFields: [], columns: [], dataStatus: void 0, dataError: void 0 }), style: { ...inputStyle, display: "block", width: "100%" }, children: [
            /* @__PURE__ */ jsx2("option", { value: "", children: "Choose a collection" }),
            collections.map((collection) => /* @__PURE__ */ jsx2("option", { value: collection.id, children: collection.name }, collection.id)),
            collectionId && !collections.some((collection) => collection.id === collectionId) && /* @__PURE__ */ jsx2("option", { value: collectionId, children: collectionId })
          ] })
        ] }),
        kind !== "backy.table.data" && /* @__PURE__ */ jsxs2("label", { children: [
          "Horizontal field",
          /* @__PURE__ */ jsxs2("select", { "aria-label": "Chart horizontal field", value: chart.xField, onChange: (event) => patch({ xField: event.target.value }), style: { ...inputStyle, display: "block", width: "100%" }, children: [
            /* @__PURE__ */ jsx2("option", { value: "", children: "Choose a field" }),
            fields.map((field) => /* @__PURE__ */ jsx2("option", { value: field, children: field }, field)),
            chart.xField && !fields.includes(chart.xField) && /* @__PURE__ */ jsxs2("option", { value: chart.xField, children: [
              chart.xField,
              " (missing)"
            ] })
          ] })
        ] })
      ] }),
      kind !== "backy.table.data" && /* @__PURE__ */ jsxs2("fieldset", { style: { border: 0, padding: "12px 0", margin: 0 }, children: [
        /* @__PURE__ */ jsx2("legend", { children: "Value fields" }),
        Array.from(/* @__PURE__ */ new Set([...fields, ...chart.series.map((series) => series.key)])).filter((field) => field !== chart.xField).map((field) => /* @__PURE__ */ jsxs2("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, marginRight: 16 }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: chart.series.some((series) => series.key === field), onChange: (event) => patch({ yFields: event.target.checked ? [...chart.series.map((series) => series.key), field] : chart.series.map((series) => series.key).filter((key) => key !== field) }) }),
          field
        ] }, field))
      ] }),
      kind === "backy.table.data" && /* @__PURE__ */ jsxs2("fieldset", { style: { border: 0, padding: "12px 0", margin: 0 }, children: [
        /* @__PURE__ */ jsx2("legend", { children: "Columns" }),
        /* @__PURE__ */ jsx2("div", { children: Array.from(/* @__PURE__ */ new Set([...fields, ...columns.map((column) => column.key)])).map((field) => /* @__PURE__ */ jsxs2("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, marginRight: 16 }, children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: columns.some((column) => column.key === field), onChange: (event) => patch({ columns: event.target.checked ? [...columns, { key: field, label: field }] : columns.filter((column) => column.key !== field) }) }),
          field
        ] }, field)) }),
        columns.map((column, index) => /* @__PURE__ */ jsxs2("label", { style: { display: "inline-block", margin: "4px 8px 4px 0" }, children: [
          column.key,
          /* @__PURE__ */ jsx2("input", { "aria-label": `Column label for ${column.key}`, value: column.label, onChange: (event) => patch({ columns: columns.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }), style: { ...inputStyle, display: "block", width: 180 } })
        ] }, `${column.key}-${index}`))
      ] }),
      !collectionSource && /* @__PURE__ */ jsxs2("div", { style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsxs2("label", { htmlFor: `${id}-rows`, style: { display: "block", fontWeight: 500 }, children: [
          "Rows ",
          /* @__PURE__ */ jsx2("span", { style: { fontWeight: 400, color: "#64748b" }, children: "\u2014 edit named fields in JSON" })
        ] }),
        /* @__PURE__ */ jsx2("textarea", { id: `${id}-rows`, "aria-label": "Figure rows", rows: 8, value: recordsDraft, onChange: (event) => {
          setRecordsDraft(event.target.value);
          setDraftError("");
        }, style: { ...inputStyle, width: "100%", display: "block", fontFamily: "monospace", fontSize: 13, resize: "vertical", marginTop: 6 } }),
        /* @__PURE__ */ jsx2("button", { type: "button", onClick: applyRecords, style: { ...buttonStyle, marginTop: 8, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }, children: "Apply rows" }),
        draftError && /* @__PURE__ */ jsx2("p", { role: "alert", children: draftError })
      ] })
    ] })
  ] });
}

// apps/public/src/components/BackyDataFigure.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function BackyDataFigure({ config, siteId, apiBaseUrl = "/api" }) {
  const loadRecords = useCallback((collectionId, { signal, requestedFields }) => {
    if (!siteId) return Promise.reject(new Error("This data source is unavailable here."));
    return loadBackyPublicDataFigureRecords({ apiBaseUrl, siteId, collectionId, signal, requestedFields });
  }, [apiBaseUrl, siteId]);
  return /* @__PURE__ */ jsx3(DataFigure, { config, loadRecords: siteId ? loadRecords : void 0 });
}

// apps/public/src/components/RegisteredRichInteractiveComponent.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";

// apps/public/src/components/InteractiveComponentContent.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useMemo as useMemo2, useRef as useRef2, useState as useState2 } from "react";

// apps/public/src/lib/publicInteractiveComponentMetadata.ts
var object2 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var privateKey = (key) => {
  const name = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return /secret|password|apikey|privatekey|credential|authorization|cookie|servicerole|databaseurl|connectionstring|smtp/.test(name) || /^(?:(?:access|refresh|id|api|auth|bearer|csrf|xsrf|oauth|github|gitlab|provider|personalaccess|jwt)?token|session(?:id|key|token)?)$/.test(name) || /^(?:auth|admin|provider)(?:$|settings|config|api|envelope|data)/.test(name) || ["__proto__", "constructor", "prototype"].includes(key);
};
var privateValue = (value) => /^(?:Bearer\s+|(?:sk|rk)_(?:live|test)_|sk-(?:proj-|[a-zA-Z0-9]{16})|postgres(?:ql)?:\/\/|eyJ[a-zA-Z0-9_-]+\.)/i.test(value.trimStart());
function sanitizePublicInteractiveComponentMetadata(value) {
  const ancestors = /* @__PURE__ */ new WeakSet();
  let budget = 2e3;
  let exceeded = false;
  const visit = (value2, depth, key = "") => {
    if (depth > 20 || --budget < 0) {
      exceeded = true;
      return void 0;
    }
    if (typeof value2 === "string") return privateValue(value2) || ["required", "propertyNames"].includes(key) && privateKey(value2) ? void 0 : value2;
    if (value2 === null || typeof value2 === "boolean" || typeof value2 === "number" && Number.isFinite(value2)) return value2;
    if (!value2 || typeof value2 !== "object" || ancestors.has(value2)) return void 0;
    ancestors.add(value2);
    const result2 = Array.isArray(value2) ? value2.map((child) => visit(child, depth + 1, key)).filter((child) => child !== void 0) : Object.fromEntries(Object.entries(value2).filter(([name]) => !privateKey(name)).map(([name, child]) => [name, visit(child, depth + 1, name)]).filter(([, child]) => child !== void 0));
    ancestors.delete(value2);
    return result2;
  };
  const result = visit(value, 0);
  return !exceeded && object2(result) ? result : void 0;
}

// apps/public/src/components/InteractiveComponentContent.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var getNameClass = (value) => typeof value === "string" ? value : "";
var sanitizeText = (value) => getNameClass(value).trim();
var normalizeIframeLoading = (value) => value === "eager" ? "eager" : "lazy";
var sanitizeHtmlMarkup = (value) => {
  const source = sanitizeText(value);
  if (!source) return "";
  return source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<\/?(?:script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, "").replace(/(?:\s|\/)+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(
    /\s+(href|src|xlink:href|formaction|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, attribute, rawValue) => {
      const valueWithoutQuotes = rawValue.replace(/^['"]|['"]$/g, "");
      const decoded = valueWithoutQuotes.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_match, number) => {
        const code = number.toLowerCase().startsWith("x") ? Number.parseInt(number.slice(1), 16) : Number(number);
        return code <= 1114111 ? String.fromCodePoint(code) : "";
      }).replace(/&colon;?/gi, ":").replace(/&(?:tab|newline);?/gi, "");
      const normalizedValue = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
      const isDangerousUrl = normalizedValue.startsWith("javascript:") || normalizedValue.startsWith("vbscript:") || normalizedValue.startsWith("data:text/html") || normalizedValue.startsWith("data:image/svg+xml");
      return isDangerousUrl ? ` ${attribute}="#"` : match;
    }
  ).replace(
    /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, rawValue) => {
      const normalizedValue = rawValue.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
      return normalizedValue.includes("javascript:") || normalizedValue.includes("expression(") || normalizedValue.includes("data:text/html") ? "" : match;
    }
  ).replace(/<\/?([a-z][\w:-]*)\b[^>]*>/gi, (tag, name) => /^(?:p|span|div|strong|em|b|i|u|s|br|ul|ol|li|a|table|thead|tbody|tr|th|td|caption|figure|figcaption|img|code|pre|h[1-6]|blockquote|details|summary)$/.test(name.toLowerCase()) ? tag : "");
};
var fallbackImageUrl = (value) => {
  const url = sanitizeText(value);
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url) || url.startsWith("//")) return "";
  if (/^\/(?!\/)/.test(url)) return url;
  try {
    return ["https:", "http:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
};
var INTERACTIVE_IFRAME_SANDBOX_DEFAULT = "allow-scripts allow-forms";
var INTERACTIVE_IFRAME_SANDBOX_TOKENS = /* @__PURE__ */ new Set([
  "allow-downloads",
  "allow-forms",
  "allow-pointer-lock",
  "allow-presentation",
  "allow-scripts"
]);
var INTERACTIVE_IFRAME_PERMISSION_TOKENS = /* @__PURE__ */ new Set([
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "clipboard-read",
  "clipboard-write",
  "display-capture",
  "encrypted-media",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "midi",
  "payment",
  "picture-in-picture",
  "screen-wake-lock",
  "serial",
  "usb",
  "web-share",
  "xr-spatial-tracking"
]);
var parseTokenList = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTokenList(item));
  }
  return sanitizeText(value).split(/[\s,;]+/).map((token) => token.trim().toLowerCase()).filter(Boolean);
};
var normalizeInteractiveIframeSandbox = (value) => {
  const tokens = parseTokenList(value).filter((token) => INTERACTIVE_IFRAME_SANDBOX_TOKENS.has(token));
  if (tokens.length === 0) {
    return INTERACTIVE_IFRAME_SANDBOX_DEFAULT;
  }
  return Array.from(new Set(tokens)).join(" ");
};
var interactiveIframeUsesOpaqueOrigin = (sandbox) => !sandbox.split(/\s+/).includes("allow-same-origin");
var normalizeInteractiveIframeAllow = (value) => {
  const tokens = parseTokenList(value).filter((token) => INTERACTIVE_IFRAME_PERMISSION_TOKENS.has(token));
  return tokens.length > 0 ? Array.from(new Set(tokens)).join("; ") : void 0;
};
var normalizeInteractiveSandboxUrl = (value) => {
  const raw = sanitizeText(value);
  if (!raw) {
    return "";
  }
  if (/^(javascript|data|blob|file|vbscript):/i.test(raw)) {
    return "";
  }
  if (raw.startsWith("/")) {
    return raw.startsWith("//") ? "" : raw;
  }
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.origin === window.location.origin && (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed.href : "";
  } catch {
    return "";
  }
};
var clampInteractiveNumber = (value, fallback, min, max) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number.parseFloat(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};
var interactiveControlValue = (controls, key) => controls?.find((control) => getNameClass(control.key) === key)?.value ?? controls?.find((control) => getNameClass(control.key) === key)?.defaultValue;
function CommunicationRoundsFigure({
  element,
  fallback,
  componentKey,
  version
}) {
  const { props, styles } = element;
  const controls = Array.isArray(element.controls) ? element.controls : Array.isArray(props.controls) ? props.controls : void 0;
  const roundCount = clampInteractiveNumber(
    props.rounds ?? interactiveControlValue(controls, "rounds"),
    4,
    1,
    12
  );
  const speed = getNameClass(props.speed ?? interactiveControlValue(controls, "speed")) || "normal";
  const intervalMs = speed === "fast" ? 1100 : speed === "slow" ? 2600 : 1700;
  const [activeRound, setActiveRound] = useState2(1);
  useEffect2(() => {
    setActiveRound((current) => Math.min(current, roundCount));
  }, [roundCount]);
  useEffect2(() => {
    if (speed === "paused") {
      return void 0;
    }
    const interval = window.setInterval(() => {
      setActiveRound((current) => current >= roundCount ? 1 : current + 1);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs, roundCount, speed]);
  const title = getNameClass(fallback.title) || getNameClass(props.title) || "Self-correction at work";
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || "Outputs improve as feedback is exchanged across communication rounds.";
  const rounds = Array.from({ length: roundCount }, (_, index) => {
    const round = index + 1;
    const progress = round / roundCount;
    return {
      round,
      label: `Round ${round}`,
      quality: Math.round(42 + progress * 52),
      active: round === activeRound,
      completed: round <= activeRound
    };
  });
  return /* @__PURE__ */ jsxs3(
    "figure",
    {
      style: {
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 14,
        minHeight: "100%",
        margin: 0,
        padding: 18,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        background: "#f8fafc",
        color: "#111827",
        overflow: "hidden",
        ...styles
      },
      role: "group",
      "aria-label": getNameClass(fallback.ariaLabel) || title,
      "data-backy-interactive-component": componentKey,
      "data-backy-interactive-version": version,
      "data-backy-hydration-mode": "trusted-component",
      children: [
        /* @__PURE__ */ jsxs3("figcaption", { style: { display: "grid", gap: 4 }, children: [
          /* @__PURE__ */ jsx4("strong", { style: { fontSize: 18, lineHeight: 1.2 }, children: title }),
          /* @__PURE__ */ jsx4("span", { style: { fontSize: 13, lineHeight: 1.45, color: "#475569" }, children: text })
        ] }),
        /* @__PURE__ */ jsxs3(
          "div",
          {
            style: {
              display: "grid",
              alignItems: "center",
              gap: 12,
              minHeight: 0
            },
            children: [
              /* @__PURE__ */ jsx4(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: `repeat(${roundCount}, minmax(0, 1fr))`,
                    gap: 8,
                    alignItems: "end"
                  },
                  "aria-label": "Communication round progression",
                  children: rounds.map((round) => /* @__PURE__ */ jsxs3(
                    "button",
                    {
                      type: "button",
                      onClick: () => setActiveRound(round.round),
                      style: {
                        minWidth: 0,
                        height: Math.max(42, 54 + round.quality * 0.9),
                        border: `1px solid ${round.active ? "#0f766e" : "#cbd5e1"}`,
                        borderRadius: 6,
                        background: round.completed ? "#ccfbf1" : "#ffffff",
                        color: "#0f172a",
                        padding: "8px 4px",
                        display: "grid",
                        alignContent: "end",
                        gap: 6,
                        cursor: "pointer",
                        transition: "height 220ms ease, background 220ms ease, border-color 220ms ease, transform 220ms ease",
                        transform: round.active ? "translateY(-4px)" : "translateY(0)"
                      },
                      "aria-pressed": round.active,
                      "aria-label": `${round.label}, quality ${round.quality} percent`,
                      children: [
                        /* @__PURE__ */ jsxs3("span", { style: { fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: [
                          "R",
                          round.round
                        ] }),
                        /* @__PURE__ */ jsxs3("span", { style: { fontSize: 11, color: "#0f766e" }, children: [
                          round.quality,
                          "%"
                        ] })
                      ]
                    },
                    round.round
                  ))
                }
              ),
              /* @__PURE__ */ jsxs3(
                "div",
                {
                  style: {
                    minHeight: 72,
                    borderRadius: 8,
                    border: "1px solid #dbeafe",
                    background: "#eff6ff",
                    padding: 12,
                    display: "grid",
                    gap: 6
                  },
                  children: [
                    /* @__PURE__ */ jsxs3("span", { style: { fontSize: 12, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase" }, children: [
                      "Active round ",
                      activeRound
                    ] }),
                    /* @__PURE__ */ jsx4("span", { style: { fontSize: 14, lineHeight: 1.45, color: "#1e293b" }, children: activeRound === 1 ? "The first response establishes a baseline." : activeRound === roundCount ? "The final response integrates the accumulated corrections." : "Feedback is incorporated and the next response becomes more aligned." })
                  ]
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsxs3("span", { style: { fontSize: 11, color: "#64748b" }, children: [
            componentKey,
            " ",
            version
          ] }),
          /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6 }, children: [
            /* @__PURE__ */ jsx4("button", { type: "button", onClick: () => setActiveRound((current) => Math.max(1, current - 1)), style: { border: "1px solid #cbd5e1", borderRadius: 6, background: "#ffffff", padding: "4px 8px", fontSize: 12 }, children: "Previous" }),
            /* @__PURE__ */ jsx4("button", { type: "button", onClick: () => setActiveRound((current) => current >= roundCount ? 1 : current + 1), style: { border: "1px solid #0f766e", borderRadius: 6, background: "#0f766e", color: "#ffffff", padding: "4px 8px", fontSize: 12 }, children: "Next" })
          ] })
        ] })
      ]
    }
  );
}
var buildInteractiveSandboxPayload = (element, componentKey, version, fallback, siteId) => {
  const props = sanitizePublicInteractiveComponentMetadata(element.props) || {};
  delete props.sandboxUrl;
  delete props.iframeUrl;
  delete props.url;
  delete props.src;
  delete props.fallback;
  delete props.renderCapabilities;
  const publicContext = sanitizePublicInteractiveComponentMetadata({
    controls: Array.isArray(element.controls) ? element.controls : props.controls,
    dataBindings: Array.isArray(element.dataBindings) ? element.dataBindings : props.dataBindings
  }) || {};
  const publicFallback = sanitizePublicInteractiveComponentMetadata(fallback) || {};
  if ("html" in publicFallback) publicFallback.html = sanitizeHtmlMarkup(publicFallback.html);
  if ("imageUrl" in publicFallback) publicFallback.imageUrl = fallbackImageUrl(publicFallback.imageUrl);
  return {
    type: "backy.interactive-component.init",
    protocol: "backy.interactive-component.v1",
    componentKey,
    version,
    props,
    controls: publicContext.controls,
    propsSchema: sanitizePublicInteractiveComponentMetadata(element.propsSchema),
    dataBindings: publicContext.dataBindings,
    readOnly: true,
    siteId,
    fallback: publicFallback
  };
};
function SandboxedCodeComponentFrame({
  element,
  fallback,
  componentKey,
  version,
  src,
  renderCapabilities,
  siteId,
  pageId,
  postId,
  apiBaseUrl = "/api"
}) {
  const { props, styles } = element;
  const frameRef = useRef2(null);
  const title = getNameClass(fallback.title) || getNameClass(props.title) || "Sandboxed component";
  const iframeSandbox = normalizeInteractiveIframeSandbox(props.sandbox ?? renderCapabilities.sandbox);
  const [frameHeight, setFrameHeight] = useState2(null);
  const [runtimeError, setRuntimeError] = useState2("");
  const payload = useMemo2(
    () => buildInteractiveSandboxPayload(element, componentKey, version, fallback, siteId),
    [componentKey, element, fallback, siteId, version]
  );
  const reportRuntimeError = useCallback2((message, messageType) => {
    if (!siteId || typeof window === "undefined") {
      return;
    }
    const body = {
      type: messageType,
      componentKey,
      version,
      elementId: element.id,
      pageId,
      postId,
      message
    };
    window.fetch(`${apiBaseUrl.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/interactive-components/runtime-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {
    });
  }, [apiBaseUrl, componentKey, element.id, pageId, postId, siteId, version]);
  const postInitPayload = useCallback2(() => {
    if (typeof window === "undefined") {
      return;
    }
    const frame = frameRef.current;
    if (!frame?.contentWindow) {
      return;
    }
    const targetOrigin = interactiveIframeUsesOpaqueOrigin(iframeSandbox) ? "*" : new URL(src, window.location.origin).origin;
    frame.contentWindow.postMessage(payload, targetOrigin);
  }, [iframeSandbox, payload, src]);
  useEffect2(() => {
    if (typeof window === "undefined") {
      return void 0;
    }
    const timeout = window.setTimeout(postInitPayload, 0);
    return () => window.clearTimeout(timeout);
  }, [postInitPayload]);
  useEffect2(() => {
    if (typeof window === "undefined") {
      return void 0;
    }
    const handleMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow || !isRecord(event.data)) {
        return;
      }
      const protocol = getNameClass(event.data.protocol);
      if (protocol !== "backy.interactive-component.v1") {
        return;
      }
      const messageComponentKey = getNameClass(event.data.componentKey);
      const messageVersion = getNameClass(event.data.version);
      if (messageComponentKey && messageComponentKey !== componentKey) {
        return;
      }
      if (messageVersion && messageVersion !== version) {
        return;
      }
      const messageType = getNameClass(event.data.type);
      if (messageType === "backy.interactive-component.ready") {
        postInitPayload();
      }
      if (messageType === "backy.interactive-component.rendered" && messageComponentKey === componentKey && messageVersion === version) {
        setRuntimeError("");
      }
      if (messageType === "backy.interactive-component.resize") {
        const nextHeight = typeof event.data.height === "number" ? event.data.height : typeof event.data.height === "string" ? Number.parseFloat(event.data.height) : null;
        if (nextHeight !== null && Number.isFinite(nextHeight)) {
          setFrameHeight(Math.max(120, Math.min(2400, Math.round(nextHeight))));
        }
      }
      if (messageType === "backy.interactive-component.error") {
        const message = getNameClass(event.data.message) || "Interactive component failed to load.";
        setRuntimeError(message);
        reportRuntimeError(message, messageType);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [componentKey, postInitPayload, reportRuntimeError, version]);
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      style: {
        display: "grid",
        gap: runtimeError ? 8 : 0,
        width: "100%",
        height: "100%",
        minHeight: "100%"
      },
      "data-backy-interactive-component": componentKey,
      "data-backy-interactive-version": version,
      "data-backy-hydration-mode": "sandbox-iframe",
      "data-backy-sandboxed-code-component": "true",
      "data-backy-sandbox-runtime-error": runtimeError || void 0,
      children: [
        /* @__PURE__ */ jsx4(
          "iframe",
          {
            ref: frameRef,
            title,
            src,
            sandbox: iframeSandbox,
            allow: normalizeInteractiveIframeAllow(props.allow ?? renderCapabilities.allowedPermissions),
            loading: normalizeIframeLoading(props.loading),
            referrerPolicy: "no-referrer",
            onLoad: postInitPayload,
            style: {
              width: "100%",
              height: frameHeight ? `${frameHeight}px` : "100%",
              minHeight: "100%",
              border: "1px solid #374151",
              borderRadius: 8,
              background: "#111827",
              color: "#f9fafb",
              ...styles
            },
            "aria-label": getNameClass(fallback.ariaLabel) || title
          }
        ),
        runtimeError && /* @__PURE__ */ jsx4("p", { style: { margin: 0, color: "#b91c1c", fontSize: 13, lineHeight: 1.4 }, children: runtimeError })
      ]
    }
  );
}
function InteractiveComponentElement({ element, siteId, pageId, postId, apiBaseUrl = "/api" }) {
  const { props, styles } = element;
  const rawFallback = element.fallback ?? props.fallback;
  const fallback = typeof rawFallback === "string" ? { text: rawFallback } : isRecord(rawFallback) ? rawFallback : {};
  const title = getNameClass(fallback.title) || getNameClass(props.title) || getNameClass(props.componentKey) || element.componentKey || "Interactive component";
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || "Interactive content is available in supported frontends.";
  const html = sanitizeHtmlMarkup(fallback.html);
  const imageUrl = fallbackImageUrl(fallback.imageUrl);
  const alt = getNameClass(fallback.alt) || title;
  const componentKey = element.componentKey || getNameClass(props.componentKey);
  const version = element.version || getNameClass(props.version);
  const renderCapabilities = isRecord(element.renderCapabilities) ? element.renderCapabilities : isRecord(props.renderCapabilities) ? props.renderCapabilities : {};
  const hydrationMode = getNameClass(renderCapabilities.hydrationMode);
  if (element.type === "interactiveFigure" && isBackyDataFigureKey(componentKey) && (Array.isArray(props.records) || props.source)) {
    return /* @__PURE__ */ jsx4(BackyDataFigure, { config: { ...props, componentKey }, siteId, apiBaseUrl });
  }
  if (element.type === "interactiveFigure" && componentKey === "backy.figure.rounds") {
    return /* @__PURE__ */ jsx4(
      CommunicationRoundsFigure,
      {
        element,
        fallback,
        componentKey,
        version: version || "1.0.0"
      }
    );
  }
  const sandboxSrc = normalizeInteractiveSandboxUrl(props.sandboxUrl ?? props.iframeUrl ?? props.url ?? props.src);
  if (element.type === "codeComponent" && hydrationMode === "sandbox-iframe" && sandboxSrc) {
    return /* @__PURE__ */ jsx4(
      SandboxedCodeComponentFrame,
      {
        element,
        fallback,
        componentKey: componentKey || "backy.custom.sandboxed",
        version: version || "1.0.0",
        src: sandboxSrc,
        renderCapabilities,
        siteId,
        pageId,
        postId,
        apiBaseUrl
      }
    );
  }
  return /* @__PURE__ */ jsxs3(
    "figure",
    {
      style: {
        display: "grid",
        alignContent: "center",
        minHeight: "100%",
        margin: 0,
        padding: "16px",
        border: "1px solid #d1d5db",
        background: "#f9fafb",
        color: "#111827",
        ...styles
      },
      role: "group",
      "aria-label": getNameClass(fallback.ariaLabel) || title,
      "data-backy-interactive-component": componentKey || void 0,
      "data-backy-interactive-version": version || void 0,
      "data-backy-hydration-mode": "static-fallback",
      children: [
        imageUrl && /* @__PURE__ */ jsx4(
          "img",
          {
            src: imageUrl,
            alt,
            style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
            loading: "lazy"
          }
        ),
        /* @__PURE__ */ jsxs3("figcaption", { children: [
          /* @__PURE__ */ jsx4("strong", { children: title }),
          html ? /* @__PURE__ */ jsx4("span", { dangerouslySetInnerHTML: { __html: html } }) : /* @__PURE__ */ jsx4("span", { children: text })
        ] })
      ]
    }
  );
}

// apps/public/src/components/RegisteredRichInteractiveComponent.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var object3 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var string2 = (value) => typeof value === "string" ? value : "";
var FAILURE = "This registered component is unavailable for this site or version.";
function resolveRichInteractiveRegistryEntry(siteId, node, payload) {
  if (!siteId || !string2(node.componentKey) || !string2(node.version) || node.siteId !== void 0 && node.siteId !== siteId || !["interactiveFigure", "codeComponent"].includes(string2(node.elementType))) throw new Error(FAILURE);
  if (!object3(payload) || payload.success !== true || !object3(payload.data) || payload.data.siteId !== siteId || !Array.isArray(payload.data.components)) throw new Error(FAILURE);
  const entry = payload.data.components.find((entry2) => object3(entry2) && entry2.componentKey === node.componentKey && entry2.version === node.version);
  if (!object3(entry) || entry.status !== "active" || entry.type !== node.elementType || entry.siteId !== void 0 && entry.siteId !== siteId) throw new Error(FAILURE);
  if (entry.reviewStatus !== void 0 && entry.reviewStatus !== "approved") throw new Error(FAILURE);
  const trustedBuiltin = entry.source === "built-in" && entry.type === "interactiveFigure" && entry.renderMode === "trusted-component";
  const sandbox = entry.type === "codeComponent" && entry.renderMode === "sandbox-iframe" && object3(entry.integrity) && entry.integrity.signed === true && entry.integrity.signatureRequiredForCustomCode === true && object3(payload.data.contract) && object3(payload.data.contract.sandbox) && payload.data.contract.sandbox.enabled === true;
  if (!trustedBuiltin && !sandbox) throw new Error(FAILURE);
  return entry;
}
async function loadRichInteractiveRegistryEntry(siteId, node, signal, request = globalThis.fetch, apiBaseUrl = "/api") {
  signal.throwIfAborted();
  const response = await request(`${apiBaseUrl.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(string2(node.componentKey))}/${encodeURIComponent(string2(node.version))}`, { method: "GET", cache: "no-store", credentials: "omit", signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(FAILURE);
  const payload = await response.json();
  signal.throwIfAborted();
  return resolveRichInteractiveRegistryEntry(siteId, node, payload);
}
function richInteractiveRuntimeElement(siteId, node, entry, apiBaseUrl = "/api") {
  const props = { ...object3(entry?.defaultProps) ? entry.defaultProps : {}, ...object3(node.props) ? node.props : {} };
  for (const key of ["sandboxUrl", "iframeUrl", "url", "src", "runtimeUrl", "sandbox", "allow", "renderCapabilities"]) delete props[key];
  const componentKey = string2(node.componentKey), version = string2(node.version);
  const sandbox = entry?.renderMode === "sandbox-iframe";
  if (sandbox) props.sandboxUrl = `${apiBaseUrl.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/sandbox`;
  const runnable = entry && (sandbox || componentKey === "backy.figure.rounds" || isBackyDataFigureKey(componentKey));
  return {
    id: string2(node.id) || `rich-component-${componentKey}-${version}`,
    type: runnable ? string2(entry.type) : "registeredFallback",
    componentKey,
    version,
    props,
    controls: Array.isArray(node.controls) ? node.controls.filter(object3) : Array.isArray(entry?.controls) ? entry.controls.filter(object3) : [],
    propsSchema: object3(node.propsSchema) ? node.propsSchema : object3(entry?.propsSchema) ? entry.propsSchema : void 0,
    fallback: typeof node.fallback === "string" ? node.fallback : object3(node.fallback) ? node.fallback : void 0,
    renderCapabilities: { hydrationMode: sandbox ? "sandbox-iframe" : entry ? "trusted-component" : "static-fallback", sandbox: "allow-scripts allow-forms", allowedPermissions: [] },
    dataBindings: Array.isArray(node.dataBindings) ? node.dataBindings.filter(object3) : void 0,
    styles: { minHeight: sandbox ? 300 : void 0 }
  };
}
function RegisteredRichInteractiveComponent({ node, siteId, apiBaseUrl = "/api" }) {
  const [resolution, setResolution] = useState3();
  const identity = JSON.stringify([apiBaseUrl, siteId || "", node.componentKey, node.version, node.elementType, typeof node.siteId === "string" ? node.siteId : node.siteId === void 0 ? null : false]);
  useEffect3(() => {
    const controller = new AbortController();
    if (!siteId) {
      setResolution({ identity, error: FAILURE });
      return () => controller.abort();
    }
    loadRichInteractiveRegistryEntry(siteId, node, controller.signal, globalThis.fetch, apiBaseUrl).then((entry) => {
      if (!controller.signal.aborted) setResolution({ identity, entry });
    }).catch(() => {
      if (!controller.signal.aborted) setResolution({ identity, error: FAILURE });
    });
    return () => controller.abort();
  }, [apiBaseUrl, identity, node.siteId, siteId]);
  const current = resolution?.identity === identity ? resolution : void 0;
  return /* @__PURE__ */ jsxs4("div", { "data-backy-rich-interactive-component": string2(node.componentKey), "data-backy-rich-interactive-status": current?.entry ? "ready" : current?.error ? "error" : "pending", children: [
    /* @__PURE__ */ jsx5(InteractiveComponentElement, { element: richInteractiveRuntimeElement(siteId || "", node, current?.entry, apiBaseUrl), siteId, apiBaseUrl }),
    current?.error ? /* @__PURE__ */ jsx5("p", { role: "status", children: current.error }) : null
  ] });
}

// apps/public/src/components/PortableRichTextContent.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function BackyPortableRichText({ value, inline = false, siteId, apiBaseUrl }) {
  let base = "";
  try {
    const url = new URL(apiBaseUrl);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash)
      base = url.href.replace(/\/+$/, "");
  } catch {
  }
  return /* @__PURE__ */ jsx6(
    BackyRichTextContent,
    {
      value,
      inline,
      renderInteractive: base ? (node) => /* @__PURE__ */ jsx6(RegisteredRichInteractiveComponent, { node, siteId, apiBaseUrl: base }) : void 0,
      renderDataFigure: base ? (config) => /* @__PURE__ */ jsx6(BackyDataFigure, { config, siteId, apiBaseUrl: base }) : void 0
    }
  );
}
export {
  BackyPortableRichText
};
/**
 * ============================================================================
 * BACKY CMS - CORE TYPES
 * ============================================================================
 *
 * This module contains all the core type definitions used throughout the CMS.
 * These types represent the data models for users, sites, pages, media, etc.
 *
 * @module CoreTypes
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */
/**
 * ============================================================================
 * BACKY CMS - CORE PACKAGE
 * ============================================================================
 *
 * This package contains shared types, constants, and utilities used across
 * all Backy CMS applications and packages.
 *
 * @package @backy-cms/core
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */
