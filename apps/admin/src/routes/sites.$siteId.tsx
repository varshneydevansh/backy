import { type DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  MinusCircle,
  CircleSlash,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  AlertTriangle,
  History,
  Link2,
  LayoutTemplate,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useStore } from "@/stores/mockStore";
import { PageShell } from "@/components/layout/PageShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import {
  deleteSite as deleteSiteFromApi,
  getAdminSite,
  getSiteFrontendDesign,
  getSiteNavigation,
  getSiteRedirects,
  getSiteReadiness,
  getSiteSeoSettings,
  getAdminApiBase,
  getUserPermissions,
  getFormWithSubmissions,
  listAdminAuditLogs,
  listPages,
  listForms as listFormsFromApi,
  createForm,
  updateForm,
  deleteForm as deleteFormFromApi,
  listFormContacts,
  previewSiteRedirects,
  updateSiteRedirects,
  updateSiteNavigation,
  updateSiteSeoSettings,
  updateContact,
  updateFormSubmission,
  updateSiteFrontendDesign,
  updateSite as updateSiteFromApi,
  captureSiteFrontendDesignDefaults,
  adminFetch,
  type AdminAuditLog,
  type AdminUserPermissionMatrix,
  type ApiSite,
} from "@/lib/adminContentApi";
import type {
  AdminFrontendDesignResponse,
  AdminSiteRedirectConflict,
  AdminSiteSeoPreview,
  AdminSiteSeoPreviewRoute,
  AdminSiteSeoSettings,
  AdminContact,
  FormDefinition,
  FormFieldDefinition,
  FormSubmission,
  SiteReadiness,
} from "@/lib/adminContentApi";
import type { Page, Site } from "@/stores/mockStore";
import { useAuthStore, type User } from "@/stores/authStore";
import { siteMatchesIdentifier } from "@/lib/siteSelection";
import type {
  Comment,
  CommentReportReason,
  SiteNavigationConfig,
  SiteNavigationConfigItem,
  SiteNavigationLayoutConfig,
  SiteCommentPolicy,
  SiteSettings,
  SiteWebhookEventKind,
  SiteRedirectRule,
  ThemeConfig,
} from "@backy-cms/core";

type Contact = AdminContact;

interface SiteFormManagementState {
  forms: FormDefinition[];
  submissions: FormSubmission[];
  contacts: Contact[];
  comments: Comment[];
  submissionCount: number;
  contactCount: number;
  commentCount: number;
  submissionLoading: boolean;
  contactLoading: boolean;
  commentsLoading: boolean;
  workflowLoading: boolean;
  errorMessage: string | null;
  selectedFormId: string;
  selectedCommentIds: string[];
  commentReportReasons: CommentReportReason[];
}

type SubmissionStatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "spam";
type ContactStatusFilter =
  | "all"
  | "new"
  | "contacted"
  | "qualified"
  | "archived";
type CommentStatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "spam"
  | "blocked";
type SiteStatusFilter = "published" | "draft" | "archived";
type CommentTargetFilter = "all" | "page" | "post";
type NavigationMenuKey = "primary" | "footer";
type SiteFrontendDesignContract = NonNullable<SiteSettings["frontendDesign"]>;
type SiteThemeDraft = {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  spacing: {
    unit: number;
    scale: number;
  };
  customCSS: string;
};
type SiteDetailPermissionKey =
  | "sites.view"
  | "sites.configure"
  | "sites.delete"
  | "forms.view"
  | "forms.create"
  | "forms.edit"
  | "forms.manage"
  | "forms.delete"
  | "forms.export"
  | "comments.view"
  | "comments.manage"
  | "comments.configure"
  | "activity.export";

const SITE_DETAIL_PERMISSION_ROLE_DEFAULTS: Record<
  SiteDetailPermissionKey,
  Array<User["role"]>
> = {
  "sites.view": ["owner", "admin", "editor", "viewer"],
  "sites.configure": ["owner", "admin"],
  "sites.delete": ["owner"],
  "forms.view": ["owner", "admin", "editor", "viewer"],
  "forms.create": ["owner", "admin", "editor"],
  "forms.edit": ["owner", "admin", "editor"],
  "forms.manage": ["owner", "admin", "editor"],
  "forms.delete": ["owner", "admin"],
  "forms.export": ["owner", "admin"],
  "comments.view": ["owner", "admin", "editor", "viewer"],
  "comments.manage": ["owner", "admin", "editor"],
  "comments.configure": ["owner", "admin"],
  "activity.export": ["owner", "admin"],
};

const siteDetailPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: SiteDetailPermissionKey,
) =>
  permissionMatrix?.groups
    .flatMap((group) => group.permissions)
    .find((permission) => permission.key === key) || null;

const isSiteDetailPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  _currentAdmin: User | null,
  key: SiteDetailPermissionKey,
): boolean => {
  const matrixRule = siteDetailPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.allowed;

  return false;
};

const siteDetailPermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: SiteDetailPermissionKey,
): string => {
  const matrixRule = siteDetailPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.reason;
  if (!currentAdmin)
    return "Sign in with an admin account to use this capability.";
  if (!permissionMatrix)
    return "Permission matrix unavailable. Reload permissions before using this capability.";

  return SITE_DETAIL_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Blocked until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Blocked by backend permissions and ${currentAdmin.role} role defaults.`;
};

const SITE_WORKSPACE_AREAS = [
  {
    title: "Publish readiness",
    detail:
      "Readiness score, blockers, warnings, public pages, posts, media, collections, and reusable sections.",
    href: "#site-readiness",
  },
  {
    title: "Navigation",
    detail:
      "Primary and footer menus exposed to hosted pages, manifests, and custom frontends.",
    href: "#site-navigation",
  },
  {
    title: "Domain",
    detail:
      "Custom-domain DNS ownership, TXT/CNAME handoff, and verification status.",
    href: "#site-domain",
  },
  {
    title: "Theme & publish",
    detail:
      "Site-level brand tokens, typography, spacing, CSS, and public delivery state.",
    href: "#site-theme-publish",
  },
  {
    title: "Frontend design",
    detail:
      "Capture custom frontend tokens, chrome, templates, and editable bindings for generated pages.",
    href: "#site-frontend-design",
  },
  {
    title: "Redirects",
    detail:
      "Route moves, 301/302/307/308 rules, 410 retired pages, and conflict previews.",
    href: "#site-redirects",
  },
  {
    title: "SEO defaults",
    detail:
      "Title templates, descriptions, social images, sitemap, robots, JSON-LD, and route previews.",
    href: "#site-seo",
  },
  {
    title: "Webhooks",
    detail:
      "Site-level integration endpoints, event subscriptions, secrets, headers, and delivery toggles.",
    href: "#site-webhooks",
  },
  {
    title: "Site settings",
    detail:
      "Name, slug, custom domain, description, visibility, and destructive workspace actions.",
    href: "#site-settings",
  },
  {
    title: "Automation queues",
    detail:
      "Forms, submissions, lead sharing, comments, moderation, exports, and request tracing.",
    href: "#site-automation",
  },
  {
    title: "Activity",
    detail:
      "Request-id audit trail for site settings, navigation, redirects, SEO, webhooks, and frontend contracts.",
    href: "#site-activity",
  },
  {
    title: "Frontend handoff",
    detail:
      "Copy admin/public endpoints, navigation, redirects, SEO, readiness, and automation contract.",
    href: "#site-handoff",
  },
] as const;

interface SiteNavigationEditorState {
  navigation: SiteNavigationConfig;
  pages: Page[];
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  notice: string | null;
}

interface SiteRedirectEditorState {
  rules: SiteRedirectRule[];
  conflicts: AdminSiteRedirectConflict[];
  loading: boolean;
  saving: boolean;
  previewing: boolean;
  errorMessage: string | null;
  notice: string | null;
}

interface SiteSeoEditorState {
  seo: AdminSiteSeoSettings;
  jsonLdText: string;
  preview: AdminSiteSeoPreview;
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  notice: string | null;
}

type SiteWebhookEndpointDraft = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  eventKinds: SiteWebhookEventKind[];
  secretId: string;
  headersText: string;
};

interface SiteWebhookEditorState {
  enabled: boolean;
  endpoints: SiteWebhookEndpointDraft[];
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  notice: string | null;
}

interface SiteFrontendDesignEditorState {
  frontendDesign: SiteFrontendDesignContract;
  endpoints: AdminFrontendDesignResponse["endpoints"];
  templateRegistry: AdminFrontendDesignResponse["templateRegistry"] | null;
  tokensJson: string;
  chromeJson: string;
  templatesJson: string;
  editableMapJson: string;
  loading: boolean;
  saving: boolean;
  capturing: boolean;
  errorMessage: string | null;
  notice: string | null;
}

interface SiteAuditPanelState {
  logs: AdminAuditLog[];
  loading: boolean;
  errorMessage: string | null;
}

const DEFAULT_COMMENT_REPORT_REASONS: CommentReportReason[] = [
  "spam",
  "harassment",
  "abuse",
  "hate-speech",
  "off-topic",
  "copyright",
  "privacy",
  "other",
];

type SiteCommentPolicyDraft = Required<
  Omit<SiteCommentPolicy, "blockedTerms">
> & {
  blockedTerms: string[];
};

const DEFAULT_SITE_COMMENT_POLICY: SiteCommentPolicyDraft = {
  enabled: true,
  moderationMode: "manual",
  allowGuests: true,
  requireName: true,
  requireEmail: false,
  allowReplies: true,
  enableReports: true,
  enableCaptcha: false,
  captchaProvider: "mock",
  captchaSiteKey: "",
  blockedTerms: [],
  closedMessage: "Comments are closed for this site.",
  sort: "newest",
};

const DEFAULT_SITE_THEME_DRAFT: SiteThemeDraft = {
  colors: {
    primary: "#2563eb",
    secondary: "#7c3aed",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    textMuted: "#64748b",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  spacing: {
    unit: 4,
    scale: 1,
  },
  customCSS: "",
};

const SITE_THEME_COLOR_CONTROLS = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
] as const;

const SITE_THEME_FONT_CONTROLS = [
  { key: "heading", label: "Heading font" },
  { key: "body", label: "Body font" },
  { key: "mono", label: "Mono font" },
] as const;

type SiteDomainVerification = NonNullable<
  NonNullable<Site["settings"]>["domainVerification"]
>;

const domainVerificationStatusClass: Record<
  SiteDomainVerification["status"],
  string
> = {
  not_started: "bg-muted text-muted-foreground",
  pending: "bg-amber-50 text-amber-700",
  verified: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const domainVerificationStatusLabel: Record<
  SiteDomainVerification["status"],
  string
> = {
  not_started: "Not started",
  pending: "Pending DNS",
  verified: "Verified",
  failed: "Needs attention",
};

const buildDomainVerificationToken = (site: Site): string => {
  const rawId = (site.publicSiteId || site.id)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  return `backy-${site.slug}-${rawId}`;
};

const domainForSite = (
  site: Site,
  customDomain?: string,
  slug?: string,
): string =>
  customDomain || site.customDomain || `${slug || site.slug}.backy.app`;

const getDomainVerification = (
  site: Site,
  customDomain?: string,
  slug?: string,
): SiteDomainVerification => {
  const current = site.settings?.domainVerification;
  const domain = domainForSite(site, customDomain, slug);
  const token = current?.token || buildDomainVerificationToken(site);

  return {
    status:
      customDomain || site.customDomain
        ? current?.status || "not_started"
        : "verified",
    method: "dns-txt",
    domain: current?.domain || domain,
    token,
    txtHost: current?.txtHost || `_backy.${domain}`,
    txtValue: current?.txtValue || `backy-site-verification=${token}`,
    cnameTarget: current?.cnameTarget || `${slug || site.slug}.backy.app`,
    requestedAt: current?.requestedAt || null,
    checkedAt: current?.checkedAt || null,
    verifiedAt: current?.verifiedAt || null,
    lastError: current?.lastError || null,
  };
};

const normalizeSiteThemeDraft = (
  theme?: Partial<ThemeConfig> | null,
): SiteThemeDraft => ({
  colors: {
    ...DEFAULT_SITE_THEME_DRAFT.colors,
    ...(theme?.colors || {}),
  },
  fonts: {
    ...DEFAULT_SITE_THEME_DRAFT.fonts,
    heading: theme?.fonts?.heading || DEFAULT_SITE_THEME_DRAFT.fonts.heading,
    body: theme?.fonts?.body || DEFAULT_SITE_THEME_DRAFT.fonts.body,
    mono: theme?.fonts?.mono || DEFAULT_SITE_THEME_DRAFT.fonts.mono,
  },
  spacing: {
    unit:
      typeof theme?.spacing?.unit === "number"
        ? theme.spacing.unit
        : DEFAULT_SITE_THEME_DRAFT.spacing.unit,
    scale:
      typeof theme?.spacing?.scale === "number"
        ? theme.spacing.scale
        : DEFAULT_SITE_THEME_DRAFT.spacing.scale,
  },
  customCSS: theme?.customCSS || "",
});

const siteThemeDraftToTheme = (draft: SiteThemeDraft): ThemeConfig => ({
  colors: {
    primary:
      draft.colors.primary.trim() || DEFAULT_SITE_THEME_DRAFT.colors.primary,
    secondary:
      draft.colors.secondary.trim() ||
      DEFAULT_SITE_THEME_DRAFT.colors.secondary,
    background:
      draft.colors.background.trim() ||
      DEFAULT_SITE_THEME_DRAFT.colors.background,
    surface:
      draft.colors.surface.trim() || DEFAULT_SITE_THEME_DRAFT.colors.surface,
    text: draft.colors.text.trim() || DEFAULT_SITE_THEME_DRAFT.colors.text,
    textMuted:
      draft.colors.textMuted.trim() ||
      DEFAULT_SITE_THEME_DRAFT.colors.textMuted,
  },
  fonts: {
    heading:
      draft.fonts.heading.trim() || DEFAULT_SITE_THEME_DRAFT.fonts.heading,
    body: draft.fonts.body.trim() || DEFAULT_SITE_THEME_DRAFT.fonts.body,
    mono: draft.fonts.mono.trim() || DEFAULT_SITE_THEME_DRAFT.fonts.mono,
  },
  spacing: {
    unit: Number.isFinite(draft.spacing.unit)
      ? Math.max(1, Math.round(draft.spacing.unit))
      : DEFAULT_SITE_THEME_DRAFT.spacing.unit,
    scale: Number.isFinite(draft.spacing.scale)
      ? Math.max(0.5, Number(draft.spacing.scale.toFixed(2)))
      : DEFAULT_SITE_THEME_DRAFT.spacing.scale,
  },
  customCSS: draft.customCSS,
});

const normalizeSiteCommentPolicyDraft = (
  policy?: SiteCommentPolicy | null,
): SiteCommentPolicyDraft => ({
  ...DEFAULT_SITE_COMMENT_POLICY,
  ...(policy || {}),
  blockedTerms: Array.isArray(policy?.blockedTerms)
    ? policy.blockedTerms.filter(Boolean)
    : [],
  moderationMode:
    policy?.moderationMode === "auto-approve" ? "auto-approve" : "manual",
  sort: policy?.sort === "oldest" ? "oldest" : "newest",
  captchaProvider:
    policy?.captchaProvider &&
    ["turnstile", "hcaptcha", "recaptcha", "mock"].includes(
      policy.captchaProvider,
    )
      ? policy.captchaProvider
      : DEFAULT_SITE_COMMENT_POLICY.captchaProvider,
  captchaSiteKey: policy?.captchaSiteKey?.trim() || "",
  closedMessage:
    policy?.closedMessage?.trim() || DEFAULT_SITE_COMMENT_POLICY.closedMessage,
});

const EMPTY_NAVIGATION: SiteNavigationConfig = {
  primary: [],
  footer: [],
  layout: {
    header: {
      variant: "minimal",
      position: "sticky",
      width: "contained",
      showBrand: true,
      showSearch: false,
      showAccount: false,
      showCart: false,
    },
    footer: {
      variant: "columns",
      width: "contained",
      showSocial: true,
      showNewsletter: false,
    },
  },
};

const NAVIGATION_HEADER_VARIANTS = [
  {
    value: "minimal",
    label: "Minimal",
    detail: "Brand, links, and optional CTA in a clean row.",
  },
  {
    value: "centered",
    label: "Centered",
    detail: "Balanced nav with centered brand for editorial sites.",
  },
  {
    value: "split",
    label: "Split",
    detail: "Left and right menu groups around brand placement.",
  },
  {
    value: "commerce",
    label: "Commerce",
    detail: "Store-ready header with account, search, and cart slots.",
  },
] as const;

const NAVIGATION_HEADER_POSITIONS = [
  { value: "static", label: "Static" },
  { value: "sticky", label: "Sticky" },
  { value: "transparent", label: "Transparent" },
] as const;

const NAVIGATION_WIDTH_OPTIONS = [
  { value: "contained", label: "Contained" },
  { value: "full", label: "Full width" },
] as const;

const NAVIGATION_FOOTER_VARIANTS = [
  {
    value: "simple",
    label: "Simple",
    detail: "Compact footer for small sites.",
  },
  {
    value: "columns",
    label: "Columns",
    detail: "Structured footer with grouped links.",
  },
  {
    value: "mega",
    label: "Mega",
    detail: "Large footer with newsletter and multi-column content.",
  },
] as const;

const normalizeNavigationLayoutState = (
  layout?: SiteNavigationLayoutConfig,
): SiteNavigationLayoutConfig => ({
  header: {
    ...EMPTY_NAVIGATION.layout?.header,
    ...layout?.header,
  },
  footer: {
    ...EMPTY_NAVIGATION.layout?.footer,
    ...layout?.footer,
  },
});

const EMPTY_SEO_SETTINGS: AdminSiteSeoSettings = {
  titleTemplate: "%s | {siteName}",
  defaultDescription: "",
  defaultOgImage: "",
  favicon: "",
  jsonLd: [],
  sitemap: {
    enabled: true,
    defaultChangeFrequency: "weekly",
    defaultPriority: 0.7,
    includeDynamicRoutes: true,
  },
  robots: {
    index: true,
    follow: true,
    extraRules: "",
  },
  routeOverrides: [],
};

const EMPTY_SEO_PREVIEW: AdminSiteSeoPreview = {
  supportedVariables: [],
  routes: [],
};

const SITE_WEBHOOK_EVENT_OPTIONS: Array<{
  value: SiteWebhookEventKind;
  label: string;
}> = [
  { value: "site-created", label: "Site created" },
  { value: "site-updated", label: "Site settings updated" },
  { value: "site-deleted", label: "Site deleted" },
  { value: "form-submission", label: "Form submitted" },
  { value: "contact-shared", label: "Lead shared" },
  { value: "contact-sync", label: "Contact synced" },
  { value: "contact-status", label: "Contact status changed" },
  { value: "commerce-order", label: "Commerce order created" },
  { value: "commerce-product", label: "Commerce product alert" },
  { value: "commerce-webhook", label: "Commerce webhook received" },
  { value: "comment-submitted", label: "Comment submitted" },
  { value: "comment-status", label: "Comment status changed" },
  { value: "comment-reported", label: "Comment reported" },
  { value: "interactive-runtime", label: "Interactive runtime error" },
];

const DEFAULT_SITE_WEBHOOK_EVENTS: SiteWebhookEventKind[] = [
  "form-submission",
  "contact-shared",
  "comment-submitted",
  "comment-reported",
];

const SITE_FORM_FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "tel",
  "number",
  "select",
  "checkbox",
  "radio",
  "date",
] as const;

const EMPTY_FRONTEND_DESIGN: SiteFrontendDesignContract = {
  schemaVersion: "backy.frontend-design.v1",
  status: "unconfigured",
  source: {
    type: "manual",
    label: "No custom frontend connected",
  },
  tokens: {},
  chrome: {},
  templates: [],
  editableMap: [],
  notes:
    "Connect or import a frontend design contract so Backy can preserve site chrome, tokens, templates, and editable bindings for new content.",
};

const formatContractJson = (value: unknown): string =>
  JSON.stringify(value ?? {}, null, 2);

const parseObjectJson = (
  value: string,
  label: string,
): Record<string, unknown> => {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
};

const formatHeadersJson = (
  value: Record<string, string> | undefined,
): string =>
  value && Object.keys(value).length > 0
    ? JSON.stringify(value, null, 2)
    : "{}";

const parseStringRecordJson = (
  value: string,
  label: string,
): Record<string, string> => {
  const parsed = parseObjectJson(value || "{}", label);
  return Object.entries(parsed).reduce<Record<string, string>>(
    (acc, [key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`${label} value for ${key} must be a string.`);
      }
      if (key.trim() && entry.trim()) {
        acc[key.trim()] = entry.trim();
      }
      return acc;
    },
    {},
  );
};

const parseArrayJson = (
  value: string,
  label: string,
): Array<Record<string, unknown>> => {
  const parsed = JSON.parse(value || "[]") as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  parsed.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${label} entry ${index + 1} must be an object.`);
    }
  });
  return parsed as Array<Record<string, unknown>>;
};

const createFrontendDesignState = (
  frontendDesign: SiteFrontendDesignContract = EMPTY_FRONTEND_DESIGN,
  response?: Pick<AdminFrontendDesignResponse, "endpoints" | "templateRegistry">,
): SiteFrontendDesignEditorState => ({
  frontendDesign,
  endpoints: response?.endpoints || {
    admin: "",
    templates: "",
    publicManifest: "",
  },
  templateRegistry: response?.templateRegistry || null,
  tokensJson: formatContractJson(frontendDesign.tokens || {}),
  chromeJson: formatContractJson(frontendDesign.chrome || {}),
  templatesJson: JSON.stringify(frontendDesign.templates || [], null, 2),
  editableMapJson: JSON.stringify(frontendDesign.editableMap || [], null, 2),
  loading: false,
  saving: false,
  capturing: false,
  errorMessage: null,
  notice: null,
});

const FRONTEND_TEMPLATE_TYPE_LABELS: Record<
  SiteFrontendDesignContract["templates"][number]["type"],
  string
> = {
  page: "Page",
  blogPost: "Blog post",
  form: "Form",
  product: "Product",
  collection: "Collection",
  section: "Section",
};

const frontendTemplateCloneTarget = (
  templateType: SiteFrontendDesignContract["templates"][number]["type"],
  cloneTargets: Record<string, string> | undefined,
) => {
  if (!cloneTargets) return "";
  return cloneTargets[templateType] || "";
};

const FRONTEND_TEMPLATE_WORKSPACE_ACTIONS: Record<
  SiteFrontendDesignContract["templates"][number]["type"],
  { label: string; title: string }
> = {
  page: {
    label: "Create page",
    title: "Open the page creator with this frontend template selected.",
  },
  blogPost: {
    label: "Create post",
    title: "Open the blog creator with this frontend template selected.",
  },
  form: {
    label: "Open forms",
    title: "Open the forms workspace to create from captured form templates.",
  },
  product: {
    label: "Open products",
    title: "Open the products workspace to create from captured product templates.",
  },
  collection: {
    label: "Open collections",
    title: "Open the collections workspace for captured collection templates.",
  },
  section: {
    label: "Open sections",
    title: "Open reusable sections to create from captured section templates.",
  },
};

const formatJsonLd = (jsonLd: AdminSiteSeoSettings["jsonLd"]): string =>
  Array.isArray(jsonLd) && jsonLd.length > 0
    ? JSON.stringify(jsonLd, null, 2)
    : "[]";

const parseJsonLd = (value: string): Array<Record<string, unknown>> => {
  const parsed = JSON.parse(value || "[]") as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("JSON-LD must be a JSON array.");
  }

  parsed.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`JSON-LD entry ${index + 1} must be an object.`);
    }
  });

  return parsed as Array<Record<string, unknown>>;
};

type SiteSeoRouteOverride = NonNullable<
  AdminSiteSeoSettings["routeOverrides"]
>[number];

const parseSeoKeywordsText = (value: string): string[] | undefined => {
  const keywords = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return keywords.length > 0 ? keywords : undefined;
};

const makeSeoRouteOverride = (
  index: number,
  route?: AdminSiteSeoPreviewRoute,
): SiteSeoRouteOverride => ({
  id: `route_override_${Date.now().toString(36)}_${index}`,
  label: route
    ? `${route.sourceTitle || route.title} SEO override`
    : `Route override ${index}`,
  match: route?.canonical || "/",
  title: route?.title || "",
  description: route?.description || "",
  canonical: route?.canonical || "",
  ogImage: "",
  keywords: [],
  priority: route?.type === "dynamicItem" ? 0.6 : 0.7,
  changeFrequency: "weekly",
  robots: {
    index: true,
    follow: true,
  },
  enabled: true,
});

function makeRedirectRule(): SiteRedirectRule {
  return {
    id: `redirect_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    from: "/old-path",
    to: "/new-path",
    statusCode: 301,
    enabled: true,
  };
}

function makeSiteWebhookEndpoint(): SiteWebhookEndpointDraft {
  return {
    id: `webhook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: "Site automation webhook",
    url: "",
    enabled: true,
    eventKinds: [...DEFAULT_SITE_WEBHOOK_EVENTS],
    secretId: "",
    headersText: "{}",
  };
}

function createWebhookEditorState(
  settings?: SiteSettings["webhooks"],
): SiteWebhookEditorState {
  const endpoints = (settings?.endpoints || []).map<SiteWebhookEndpointDraft>(
    (endpoint) => ({
      id:
        endpoint.id ||
        `webhook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: endpoint.name || "Site automation webhook",
      url: endpoint.url || "",
      enabled: endpoint.enabled !== false,
      eventKinds: endpoint.eventKinds?.length
        ? endpoint.eventKinds
        : [...DEFAULT_SITE_WEBHOOK_EVENTS],
      secretId: endpoint.secretId || "",
      headersText: formatHeadersJson(endpoint.headers),
    }),
  );

  return {
    enabled:
      settings?.enabled === true ||
      endpoints.some((endpoint) => endpoint.enabled),
    endpoints,
    loading: false,
    saving: false,
    errorMessage: null,
    notice: null,
  };
}

function siteWebhookDraftToSettings(
  state: SiteWebhookEditorState,
): NonNullable<SiteSettings["webhooks"]> {
  return {
    enabled: state.enabled,
    endpoints: state.endpoints
      .map((endpoint) => {
        const headers = parseStringRecordJson(
          endpoint.headersText,
          "Webhook headers",
        );
        return {
          id: endpoint.id,
          name: endpoint.name.trim() || "Site automation webhook",
          url: endpoint.url.trim(),
          enabled: endpoint.enabled,
          eventKinds: endpoint.eventKinds,
          secretId: endpoint.secretId.trim(),
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      })
      .filter((endpoint) => endpoint.url),
  };
}

const cloneSiteFormDefinition = (form: FormDefinition): FormDefinition =>
  JSON.parse(JSON.stringify(form)) as FormDefinition;

const normalizeFormFieldKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const parseFormOptionsText = (value: string): string[] | undefined => {
  const options = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return options.length > 0 ? options : undefined;
};

const normalizeFormOptionalText = (
  value: string | null | undefined,
): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};

const makeSiteFormField = (index: number): FormFieldDefinition => ({
  key: `field_${index}`,
  label: `Field ${index}`,
  type: "text",
  required: false,
});

const siteFormDraftToPayload = (form: FormDefinition) => ({
  name: form.name.trim(),
  title: normalizeFormOptionalText(form.title),
  description: normalizeFormOptionalText(form.description),
  audience: form.audience,
  isActive: form.isActive,
  fields: form.fields.map((field, index) => ({
    key: normalizeFormFieldKey(field.key) || `field_${index + 1}`,
    label: field.label.trim() || `Field ${index + 1}`,
    type: field.type || "text",
    required: Boolean(field.required),
    ...(normalizeFormOptionalText(field.placeholder)
      ? {
          placeholder:
            normalizeFormOptionalText(field.placeholder) || undefined,
        }
      : {}),
    ...(normalizeFormOptionalText(field.helpText)
      ? { helpText: normalizeFormOptionalText(field.helpText) || undefined }
      : {}),
    ...(field.options && field.options.length > 0
      ? {
          options: field.options.map((option) => option.trim()).filter(Boolean),
        }
      : {}),
  })),
  notificationEmail: normalizeFormOptionalText(form.notificationEmail),
  notificationWebhook: normalizeFormOptionalText(form.notificationWebhook),
  successRedirectUrl: normalizeFormOptionalText(form.successRedirectUrl),
  successMessage: normalizeFormOptionalText(form.successMessage),
  enableHoneypot: form.enableHoneypot !== false,
  enableCaptcha: form.enableCaptcha === true,
  moderationMode: form.moderationMode || "manual",
  contactShare: form.contactShare?.enabled
    ? form.contactShare
    : { enabled: false },
  collectionTarget: form.collectionTarget?.enabled
    ? form.collectionTarget
    : {
        enabled: false,
        collectionId: form.collectionTarget?.collectionId || "",
        fieldMap: form.collectionTarget?.fieldMap || {},
      },
  settings: {
    ...(form.settings || {}),
    source: form.settings?.source || "site-detail-builder",
  },
});

function normalizeRedirectEditorRule(rule: SiteRedirectRule): SiteRedirectRule {
  return {
    ...rule,
    from: rule.from?.trim() || "/",
    to: rule.statusCode === 410 ? undefined : rule.to?.trim() || "/",
    statusCode: rule.statusCode || 302,
    enabled: rule.enabled !== false,
  };
}

function makeNavigationItem(
  type: SiteNavigationConfigItem["type"],
  pages: Page[],
): SiteNavigationConfigItem {
  const firstPublishedPage =
    pages.find((page) => page.status === "published") || pages[0];
  const id = `nav_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  if (type === "page") {
    return {
      id,
      type,
      label: firstPublishedPage?.title || "Page link",
      pageId: firstPublishedPage?.id || "",
      target: "_self",
      visible: true,
      children: [],
    };
  }

  if (type === "url") {
    return {
      id,
      type,
      label: "External link",
      href: "https://",
      target: "_blank",
      visible: true,
      children: [],
    };
  }

  return {
    id,
    type,
    label: "Internal route",
    path: "/",
    target: "_self",
    visible: true,
    children: [],
  };
}

function updateNavigationItems(
  items: SiteNavigationConfigItem[],
  itemId: string,
  updater: (item: SiteNavigationConfigItem) => SiteNavigationConfigItem,
): SiteNavigationConfigItem[] {
  return items.map((item) => {
    if (item.id === itemId || (!item.id && item.label === itemId)) {
      return updater(item);
    }

    return {
      ...item,
      children: item.children
        ? updateNavigationItems(item.children, itemId, updater)
        : item.children,
    };
  });
}

function removeNavigationItem(
  items: SiteNavigationConfigItem[],
  itemId: string,
): SiteNavigationConfigItem[] {
  return items
    .filter(
      (item) => !(item.id === itemId || (!item.id && item.label === itemId)),
    )
    .map((item) => ({
      ...item,
      children: item.children
        ? removeNavigationItem(item.children, itemId)
        : item.children,
    }));
}

function addNavigationChild(
  items: SiteNavigationConfigItem[],
  parentId: string,
  child: SiteNavigationConfigItem,
): SiteNavigationConfigItem[] {
  return items.map((item) => {
    if (item.id === parentId || (!item.id && item.label === parentId)) {
      return {
        ...item,
        children: [...(item.children || []), child],
      };
    }

    return {
      ...item,
      children: item.children
        ? addNavigationChild(item.children, parentId, child)
        : item.children,
    };
  });
}

function moveNavigationRootItem(
  items: SiteNavigationConfigItem[],
  itemId: string,
  direction: -1 | 1,
): SiteNavigationConfigItem[] {
  const index = items.findIndex(
    (item) => item.id === itemId || (!item.id && item.label === itemId),
  );
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function moveNavigationSiblingItem(
  items: SiteNavigationConfigItem[],
  itemId: string,
  direction: -1 | 1,
): { items: SiteNavigationConfigItem[]; moved: boolean } {
  const index = items.findIndex(
    (item) => item.id === itemId || (!item.id && item.label === itemId),
  );
  if (index >= 0) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) {
      return { items, moved: false };
    }
    return {
      items: moveNavigationRootItem(items, itemId, direction),
      moved: true,
    };
  }

  let moved = false;
  const nextItems = items.map((item) => {
    if (!item.children || moved) {
      return item;
    }
    const childResult = moveNavigationSiblingItem(
      item.children,
      itemId,
      direction,
    );
    if (!childResult.moved) {
      return item;
    }
    moved = true;
    return { ...item, children: childResult.items };
  });

  return { items: nextItems, moved };
}

function findNavigationItem(
  items: SiteNavigationConfigItem[],
  itemId: string,
): SiteNavigationConfigItem | null {
  for (const item of items) {
    if (item.id === itemId || (!item.id && item.label === itemId)) {
      return item;
    }
    const childMatch = item.children
      ? findNavigationItem(item.children, itemId)
      : null;
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
}

function navigationItemContains(
  item: SiteNavigationConfigItem,
  itemId: string,
): boolean {
  return Boolean(
    item.children?.some(
      (child) =>
        child.id === itemId ||
        (!child.id && child.label === itemId) ||
        navigationItemContains(child, itemId),
    ),
  );
}

function removeNavigationItemWithResult(
  items: SiteNavigationConfigItem[],
  itemId: string,
): {
  items: SiteNavigationConfigItem[];
  removed: SiteNavigationConfigItem | null;
} {
  let removed: SiteNavigationConfigItem | null = null;
  const nextItems: SiteNavigationConfigItem[] = [];

  for (const item of items) {
    if (item.id === itemId || (!item.id && item.label === itemId)) {
      removed = item;
      continue;
    }

    if (item.children && item.children.length > 0) {
      const childResult = removeNavigationItemWithResult(item.children, itemId);
      if (childResult.removed) {
        removed = childResult.removed;
        nextItems.push({ ...item, children: childResult.items });
        continue;
      }
    }

    nextItems.push(item);
  }

  return { items: nextItems, removed };
}

function insertNavigationItemRelative(
  items: SiteNavigationConfigItem[],
  targetId: string,
  draggedItem: SiteNavigationConfigItem,
  placement: "before" | "after",
): { items: SiteNavigationConfigItem[]; inserted: boolean } {
  const targetIndex = items.findIndex(
    (item) => item.id === targetId || (!item.id && item.label === targetId),
  );
  if (targetIndex >= 0) {
    const nextItems = [...items];
    nextItems.splice(
      placement === "before" ? targetIndex : targetIndex + 1,
      0,
      draggedItem,
    );
    return { items: nextItems, inserted: true };
  }

  let inserted = false;
  const nextItems = items.map((item) => {
    if (!item.children || inserted) {
      return item;
    }
    const childResult = insertNavigationItemRelative(
      item.children,
      targetId,
      draggedItem,
      placement,
    );
    if (!childResult.inserted) {
      return item;
    }
    inserted = true;
    return { ...item, children: childResult.items };
  });

  return { items: nextItems, inserted };
}

function moveNavigationItemByDrop(
  items: SiteNavigationConfigItem[],
  draggedId: string,
  targetId: string,
  placement: "before" | "after",
): SiteNavigationConfigItem[] {
  if (draggedId === targetId) {
    return items;
  }

  const draggedItem = findNavigationItem(items, draggedId);
  if (!draggedItem || navigationItemContains(draggedItem, targetId)) {
    return items;
  }

  const removal = removeNavigationItemWithResult(items, draggedId);
  if (!removal.removed) {
    return items;
  }

  const insertion = insertNavigationItemRelative(
    removal.items,
    targetId,
    removal.removed,
    placement,
  );
  return insertion.inserted ? insertion.items : items;
}

const apiBase = (() => {
  const env =
    (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env ?? {};
  const envBase = (
    env.VITE_BACKY_PUBLIC_API_BASE_URL ||
    env.VITE_PUBLIC_API_URL ||
    env.VITE_API_BASE_URL ||
    ""
  ).trim();
  if (
    !envBase &&
    typeof window !== "undefined" &&
    window.location.port === "5173"
  ) {
    return "http://localhost:3001";
  }
  return envBase
    ? envBase
        .replace(/\/api\/admin$/, "")
        .replace(/\/api$/, "")
        .replace(/\/$/, "")
    : "";
})();

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalizedPath}`;
}

function readPayloadData(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  return record.data && typeof record.data === "object"
    ? (record.data as Record<string, unknown>)
    : record;
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

function buildCollectionRecordShortcut(
  record: NonNullable<FormSubmission["collectionRecord"]>,
): string {
  const params = new URLSearchParams({
    siteId: record.siteId,
    collectionId: record.collectionId,
    recordId: record.recordId,
  });
  return `/collections?${params.toString()}`;
}

function normalizeRequestIdInput(value: string): string {
  return value.trim();
}

function csvEscape(value: unknown): string {
  const raw = safeText(value).replace(/\r?\n/g, "\\n");
  return `"${raw.replace(/"/g, '""')}"`;
}

function makeCsvBlob(rows: unknown[][]): Blob {
  const csv = rows.map((line) => line.map(csvEscape).join(",")).join("\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readinessStatusLabel(value?: SiteReadiness["statusLabel"]): string {
  if (value === "ready") return "Ready";
  if (value === "blocked") return "Blocked";
  return "Needs attention";
}

function readinessStatusClass(value?: SiteReadiness["statusLabel"]): string {
  if (value === "ready")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "blocked") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function apiSiteToStoreSite(site: ApiSite): Site {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    description: site.description || "",
    customDomain: site.customDomain || null,
    status:
      site.status === "archived"
        ? "archived"
        : site.status === "published" || site.isPublished
          ? "published"
          : "draft",
    theme: site.theme,
    settings: site.settings,
    publicSiteId: site.id,
    pageCount: 0,
    lastUpdated: site.updatedAt || site.createdAt || new Date().toISOString(),
  };
}

export const Route = createFileRoute("/sites/$siteId")({
  component: EditSitePage,
});

function EditSitePage() {
  const navigate = useNavigate();
  const { siteId } = Route.useParams();
  const { sites, updateSite, deleteSite } = useStore();
  const currentAdmin = useAuthStore((store) => store.user);

  const storeSite = sites.find((s) => siteMatchesIdentifier(s, siteId));
  const [fetchedSite, setFetchedSite] = useState<Site | null>(null);
  const [isSiteDetailLoading, setIsSiteDetailLoading] = useState(false);
  const [siteDetailError, setSiteDetailError] = useState<string | null>(null);
  const site =
    storeSite ||
    (fetchedSite && siteMatchesIdentifier(fetchedSite, siteId)
      ? fetchedSite
      : null);
  const storeSiteId = site?.id || siteId;
  const siteApiId = site?.publicSiteId || site?.slug || site?.id;

  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    customDomain: string;
    description: string;
    status: SiteStatusFilter;
  }>({
    name: "",
    slug: "",
    customDomain: "",
    description: "",
    status: "draft",
  });

  const [state, setState] = useState<SiteFormManagementState>({
    forms: [],
    submissions: [],
    contacts: [],
    comments: [],
    submissionCount: 0,
    contactCount: 0,
    commentCount: 0,
    submissionLoading: false,
    contactLoading: false,
    commentsLoading: false,
    workflowLoading: false,
    errorMessage: null,
    selectedFormId: "",
    selectedCommentIds: [],
    commentReportReasons: [...DEFAULT_COMMENT_REPORT_REASONS],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [siteSettingsError, setSiteSettingsError] = useState<string | null>(
    null,
  );
  const [siteSettingsNotice, setSiteSettingsNotice] = useState<string | null>(
    null,
  );
  const [siteWorkspaceNotice, setSiteWorkspaceNotice] = useState<string | null>(
    null,
  );
  const [readiness, setReadiness] = useState<SiteReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [navigationState, setNavigationState] =
    useState<SiteNavigationEditorState>({
      navigation: EMPTY_NAVIGATION,
      pages: [],
      loading: false,
      saving: false,
      errorMessage: null,
      notice: null,
    });
  const [redirectState, setRedirectState] = useState<SiteRedirectEditorState>({
    rules: [],
    conflicts: [],
    loading: false,
    saving: false,
    previewing: false,
    errorMessage: null,
    notice: null,
  });
  const [seoState, setSeoState] = useState<SiteSeoEditorState>({
    seo: EMPTY_SEO_SETTINGS,
    jsonLdText: formatJsonLd(EMPTY_SEO_SETTINGS.jsonLd),
    preview: EMPTY_SEO_PREVIEW,
    loading: false,
    saving: false,
    errorMessage: null,
    notice: null,
  });
  const [webhookState, setWebhookState] = useState<SiteWebhookEditorState>(() =>
    createWebhookEditorState(),
  );
  const [frontendDesignState, setFrontendDesignState] =
    useState<SiteFrontendDesignEditorState>(() => createFrontendDesignState());
  const [themeDraft, setThemeDraft] = useState<SiteThemeDraft>(() =>
    normalizeSiteThemeDraft(),
  );
  const [auditState, setAuditState] = useState<SiteAuditPanelState>({
    logs: [],
    loading: false,
    errorMessage: null,
  });
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatusFilter>("pending");
  const [contactStatus, setContactStatus] =
    useState<ContactStatusFilter>("all");
  const [commentStatus, setCommentStatus] =
    useState<CommentStatusFilter>("pending");
  const [commentSearch, setCommentSearch] = useState("");
  const [commentRequestId, setCommentRequestId] = useState("");
  const [commentTargetType, setCommentTargetType] =
    useState<CommentTargetFilter>("all");
  const [commentTargetId, setCommentTargetId] = useState("");
  const [commentBlockReason, setCommentBlockReason] =
    useState<CommentReportReason>(DEFAULT_COMMENT_REPORT_REASONS[0]);
  const [commentPolicyDraft, setCommentPolicyDraft] =
    useState<SiteCommentPolicyDraft>(DEFAULT_SITE_COMMENT_POLICY);
  const [savedCommentPolicy, setSavedCommentPolicy] =
    useState<SiteCommentPolicyDraft>(DEFAULT_SITE_COMMENT_POLICY);
  const [commentPolicyLoading, setCommentPolicyLoading] = useState(false);
  const [commentPolicySaving, setCommentPolicySaving] = useState(false);
  const [formBuilderDraft, setFormBuilderDraft] =
    useState<FormDefinition | null>(null);
  const [formBuilderSaving, setFormBuilderSaving] = useState(false);
  const [formBuilderCreating, setFormBuilderCreating] = useState(false);
  const [formBuilderDeleting, setFormBuilderDeleting] = useState(false);
  const [formBuilderNotice, setFormBuilderNotice] = useState<string | null>(
    null,
  );
  const [contactNoteDrafts, setContactNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [permissionMatrix, setPermissionMatrix] =
    useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewSite =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(permissionMatrix, currentAdmin, "sites.view");
  const canConfigureSite =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "sites.configure",
    );
  const canDeleteSite =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "sites.delete",
    );
  const canViewForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(permissionMatrix, currentAdmin, "forms.view");
  const canCreateForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "forms.create",
    );
  const canEditForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(permissionMatrix, currentAdmin, "forms.edit");
  const canManageForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "forms.manage",
    );
  const canDeleteForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "forms.delete",
    );
  const canExportForms =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "forms.export",
    );
  const canViewComments =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "comments.view",
    );
  const canManageComments =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "comments.manage",
    );
  const canConfigureComments =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "comments.configure",
    );
  const canExportActivity =
    !isPermissionMatrixPending &&
    isSiteDetailPermissionAllowed(
      permissionMatrix,
      currentAdmin,
      "activity.export",
    );
  const viewSitePermissionTitle = canViewSite
    ? undefined
    : siteDetailPermissionReason(permissionMatrix, currentAdmin, "sites.view");
  const configureSitePermissionTitle = canConfigureSite
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "sites.configure",
      );
  const deleteSitePermissionTitle = canDeleteSite
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "sites.delete",
      );
  const formsViewPermissionTitle = canViewForms
    ? undefined
    : siteDetailPermissionReason(permissionMatrix, currentAdmin, "forms.view");
  const formsCreatePermissionTitle = canCreateForms
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "forms.create",
      );
  const formsEditPermissionTitle = canEditForms
    ? undefined
    : siteDetailPermissionReason(permissionMatrix, currentAdmin, "forms.edit");
  const formsManagePermissionTitle = canManageForms
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "forms.manage",
      );
  const formsDeletePermissionTitle = canDeleteForms
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "forms.delete",
      );
  const formsExportPermissionTitle = canExportForms
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "forms.export",
      );
  const commentsViewPermissionTitle = canViewComments
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "comments.view",
      );
  const commentsManagePermissionTitle = canManageComments
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "comments.manage",
      );
  const commentsConfigurePermissionTitle = canConfigureComments
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "comments.configure",
      );
  const activityExportPermissionTitle = canExportActivity
    ? undefined
    : siteDetailPermissionReason(
        permissionMatrix,
        currentAdmin,
        "activity.export",
      );
  const siteConfigureDeniedMessage = `Your account needs sites.configure to change this site. ${configureSitePermissionTitle}`;
  const siteDeleteDeniedMessage = `Your account needs sites.delete to delete this site. ${deleteSitePermissionTitle}`;
  const formsManageDeniedMessage = `Your account needs forms.manage to update submissions or contacts. ${formsManagePermissionTitle}`;
  const commentsManageDeniedMessage = `Your account needs comments.manage to moderate comments. ${commentsManagePermissionTitle}`;
  const commentsConfigureDeniedMessage = `Your account needs comments.configure to change comment policy. ${commentsConfigurePermissionTitle}`;
  const isSiteSettingsBusy =
    isLoading || commentPolicySaving || isPermissionMatrixPending;
  const isSiteConfigurationDisabled = isSiteSettingsBusy || !canConfigureSite;
  const isWebhookConfigurationDisabled =
    webhookState.loading || webhookState.saving || !canConfigureSite;
  const isSiteDeletionDisabled = isSiteSettingsBusy || !canDeleteSite;
  const areRedirectEditsDisabled =
    redirectState.loading ||
    redirectState.saving ||
    redirectState.previewing ||
    !canConfigureSite;
  const areSeoEditsDisabled =
    seoState.loading || seoState.saving || !canConfigureSite;
  const isWorkflowRefreshDisabled =
    state.workflowLoading || (!canViewForms && !canViewComments);
  const isFormViewDisabled = state.workflowLoading || !canViewForms;
  const isFormManagementDisabled = state.workflowLoading || !canManageForms;
  const isFormBuilderBusy =
    formBuilderSaving ||
    formBuilderCreating ||
    formBuilderDeleting ||
    state.workflowLoading;
  const isFormBuilderDisabled = isFormBuilderBusy || !canEditForms;
  const isCommentPolicyDisabled =
    commentPolicyLoading || commentPolicySaving || !canConfigureComments;
  const isCommentViewDisabled = state.commentsLoading || !canViewComments;

  useEffect(() => {
    let cancelled = false;

    if (storeSite) {
      setFetchedSite(null);
      setSiteDetailError(null);
      setIsSiteDetailLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsSiteDetailLoading(true);
    setSiteDetailError(null);
    getAdminSite(siteId)
      .then((siteDetail) => {
        if (!cancelled) {
          setFetchedSite(apiSiteToStoreSite(siteDetail));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFetchedSite(null);
          setSiteDetailError(
            error instanceof Error ? error.message : "Unable to load site.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSiteDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, storeSite]);

  useEffect(() => {
    if (site) {
      setFormData({
        name: site.name,
        slug: site.slug,
        customDomain: site.customDomain || "",
        description: site.description,
        status: site.status as SiteStatusFilter,
      });
      setThemeDraft(normalizeSiteThemeDraft(site.theme));
    }
  }, [site]);

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError(
        "Sign in with an admin account to load site permissions.",
      );
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    setPermissionError(null);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(
            error instanceof Error
              ? error.message
              : "Unable to load site permissions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  const setWorkflowLoading = (value: boolean) =>
    setState((prev) => ({ ...prev, workflowLoading: value }));

  const setWorkflowError = (message: string | null) =>
    setState((prev) => ({ ...prev, errorMessage: message }));

  const loadReadiness = async () => {
    if (!siteApiId) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const nextReadiness = await getSiteReadiness(siteApiId);
      setReadiness(nextReadiness);
    } catch (error) {
      setReadiness(null);
      setReadinessError(
        error instanceof Error
          ? error.message
          : "Unable to load site readiness.",
      );
    } finally {
      setReadinessLoading(false);
    }
  };

  const loadSiteAuditEvents = async () => {
    if (!siteApiId) return;
    if (!canExportActivity) {
      setAuditState((prev) => ({
        ...prev,
        loading: false,
        errorMessage: siteDetailPermissionReason(
          permissionMatrix,
          currentAdmin,
          "activity.export",
        ),
      }));
      return;
    }

    setAuditState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    try {
      const result = await listAdminAuditLogs({
        siteId: siteApiId,
        limit: 12,
        offset: 0,
      });
      setAuditState({
        logs: result.logs,
        loading: false,
        errorMessage: null,
      });
    } catch (error) {
      setAuditState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load site audit activity.",
      }));
    }
  };

  const loadNavigationEditor = async () => {
    if (!siteApiId) return;
    if (!canViewSite) {
      setNavigationState((prev) => ({
        ...prev,
        errorMessage: siteDetailPermissionReason(
          permissionMatrix,
          currentAdmin,
          "sites.view",
        ),
      }));
      return;
    }
    setNavigationState((prev) => ({
      ...prev,
      loading: true,
      errorMessage: null,
    }));

    try {
      const [siteNavigation, pages] = await Promise.all([
        getSiteNavigation(siteApiId),
        listPages(siteApiId),
      ]);

      setNavigationState((prev) => ({
        ...prev,
        navigation: {
          primary: siteNavigation.settings.primary || [],
          footer: siteNavigation.settings.footer || [],
          layout: normalizeNavigationLayoutState(
            siteNavigation.settings.layout || siteNavigation.resolved.layout,
          ),
        },
        pages,
        loading: false,
        notice: null,
      }));
    } catch (error) {
      setNavigationState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load site navigation.",
      }));
    }
  };

  const updateNavigationMenu = (
    menu: NavigationMenuKey,
    updater: (items: SiteNavigationConfigItem[]) => SiteNavigationConfigItem[],
  ) => {
    if (!canConfigureSite) return;
    setNavigationState((prev) => ({
      ...prev,
      notice: null,
      navigation: {
        ...prev.navigation,
        [menu]: updater(prev.navigation[menu] || []),
      },
    }));
  };

  const updateNavigationLayout = (
    section: keyof SiteNavigationLayoutConfig,
    updates: Partial<NonNullable<SiteNavigationLayoutConfig[typeof section]>>,
  ) => {
    if (!canConfigureSite) return;
    setNavigationState((prev) => ({
      ...prev,
      notice: null,
      navigation: {
        ...prev.navigation,
        layout: {
          ...normalizeNavigationLayoutState(prev.navigation.layout),
          [section]: {
            ...(section === "header"
              ? normalizeNavigationLayoutState(prev.navigation.layout).header
              : normalizeNavigationLayoutState(prev.navigation.layout).footer),
            ...updates,
          },
        },
      },
    }));
  };

  const handleAddNavigationItem = (
    menu: NavigationMenuKey,
    type: SiteNavigationConfigItem["type"],
  ) => {
    updateNavigationMenu(menu, (items) => [
      ...items,
      makeNavigationItem(type, navigationState.pages),
    ]);
  };

  const handleAddNavigationChild = (
    menu: NavigationMenuKey,
    parentId: string,
    type: SiteNavigationConfigItem["type"],
  ) => {
    updateNavigationMenu(menu, (items) =>
      addNavigationChild(
        items,
        parentId,
        makeNavigationItem(type, navigationState.pages),
      ),
    );
  };

  const handleUpdateNavigationItem = (
    menu: NavigationMenuKey,
    itemId: string,
    updates: Partial<SiteNavigationConfigItem>,
  ) => {
    updateNavigationMenu(menu, (items) =>
      updateNavigationItems(items, itemId, (item) => ({
        ...item,
        ...updates,
        label:
          updates.pageId && item.type === "page"
            ? navigationState.pages.find((page) => page.id === updates.pageId)
                ?.title || item.label
            : (updates.label ?? item.label),
      })),
    );
  };

  const handleRemoveNavigationItem = (
    menu: NavigationMenuKey,
    itemId: string,
  ) => {
    updateNavigationMenu(menu, (items) => removeNavigationItem(items, itemId));
  };

  const handleMoveNavigationItem = (
    menu: NavigationMenuKey,
    itemId: string,
    direction: -1 | 1,
  ) => {
    updateNavigationMenu(
      menu,
      (items) => moveNavigationSiblingItem(items, itemId, direction).items,
    );
  };

  const handleDropNavigationItem = (
    menu: NavigationMenuKey,
    draggedId: string,
    targetId: string,
    placement: "before" | "after",
  ) => {
    updateNavigationMenu(menu, (items) =>
      moveNavigationItemByDrop(items, draggedId, targetId, placement),
    );
  };

  const handleSaveNavigation = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setNavigationState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setNavigationState((prev) => ({
      ...prev,
      saving: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const siteNavigation = await updateSiteNavigation(
        siteApiId,
        navigationState.navigation,
      );
      setNavigationState((prev) => ({
        ...prev,
        navigation: {
          primary: siteNavigation.settings.primary || [],
          footer: siteNavigation.settings.footer || [],
          layout: normalizeNavigationLayoutState(
            siteNavigation.settings.layout || siteNavigation.resolved.layout,
          ),
        },
        saving: false,
        notice: "Navigation saved and available to public/front-end contracts.",
      }));
      void loadReadiness();
      void loadSiteAuditEvents();
    } catch (error) {
      setNavigationState((prev) => ({
        ...prev,
        saving: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to save site navigation.",
      }));
    }
  };

  const loadRedirectEditor = async () => {
    if (!siteApiId) return;
    setRedirectState((prev) => ({
      ...prev,
      loading: true,
      errorMessage: null,
    }));

    try {
      const redirects = await getSiteRedirects(siteApiId);
      setRedirectState((prev) => ({
        ...prev,
        rules: redirects.rules || [],
        conflicts: redirects.conflicts || [],
        loading: false,
        notice: null,
      }));
    } catch (error) {
      setRedirectState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load site redirects.",
      }));
    }
  };

  const handleAddRedirectRule = () => {
    if (!canConfigureSite) {
      setRedirectState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setRedirectState((prev) => ({
      ...prev,
      notice: null,
      conflicts: [],
      rules: [...prev.rules, makeRedirectRule()],
    }));
  };

  const handleUpdateRedirectRule = (
    ruleId: string,
    updates: Partial<SiteRedirectRule>,
  ) => {
    if (!canConfigureSite) return;
    setRedirectState((prev) => ({
      ...prev,
      notice: null,
      conflicts: [],
      rules: prev.rules.map((rule) =>
        (rule.id || rule.from) === ruleId
          ? normalizeRedirectEditorRule({ ...rule, ...updates })
          : rule,
      ),
    }));
  };

  const handleRemoveRedirectRule = (ruleId: string) => {
    if (!canConfigureSite) return;
    setRedirectState((prev) => ({
      ...prev,
      notice: null,
      conflicts: [],
      rules: prev.rules.filter((rule) => (rule.id || rule.from) !== ruleId),
    }));
  };

  const handlePreviewRedirects = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setRedirectState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setRedirectState((prev) => ({
      ...prev,
      previewing: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const redirects = await previewSiteRedirects(
        siteApiId,
        redirectState.rules.map(normalizeRedirectEditorRule),
      );
      setRedirectState((prev) => ({
        ...prev,
        conflicts: redirects.conflicts || [],
        previewing: false,
        notice:
          (redirects.conflicts || []).length > 0
            ? "Preview found route warnings. Review them before saving."
            : "Preview found no route conflicts.",
      }));
    } catch (error) {
      setRedirectState((prev) => ({
        ...prev,
        previewing: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to preview site redirects.",
      }));
    }
  };

  const handleSaveRedirects = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setRedirectState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setRedirectState((prev) => ({
      ...prev,
      saving: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const redirects = await updateSiteRedirects(
        siteApiId,
        redirectState.rules.map(normalizeRedirectEditorRule),
      );
      setRedirectState((prev) => ({
        ...prev,
        rules: redirects.rules || [],
        conflicts: redirects.conflicts || [],
        saving: false,
        notice:
          (redirects.conflicts || []).length > 0
            ? "Redirect rules saved with route warnings. Review conflict previews below."
            : "Redirect rules saved and available to hosted sites and custom frontends.",
      }));
      void loadReadiness();
      void loadSiteAuditEvents();
    } catch (error) {
      setRedirectState((prev) => ({
        ...prev,
        saving: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to save site redirects.",
      }));
    }
  };

  const loadSeoEditor = async () => {
    if (!siteApiId) return;
    if (!canViewSite) {
      setSeoState((prev) => ({
        ...prev,
        errorMessage: siteDetailPermissionReason(
          permissionMatrix,
          currentAdmin,
          "sites.view",
        ),
      }));
      return;
    }
    setSeoState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    try {
      const result = await getSiteSeoSettings(siteApiId);
      const seo = result.seo;
      const nextSeo = { ...EMPTY_SEO_SETTINGS, ...seo };
      setSeoState((prev) => ({
        ...prev,
        seo: nextSeo,
        jsonLdText: formatJsonLd(nextSeo.jsonLd),
        preview: result.preview,
        loading: false,
        notice: null,
      }));
    } catch (error) {
      setSeoState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load site SEO settings.",
      }));
    }
  };

  const applyFrontendDesignResponse = (
    response: AdminFrontendDesignResponse,
    notice: string | null = null,
  ) => {
    setFrontendDesignState({
      ...createFrontendDesignState(response.frontendDesign, response),
      notice,
    });
  };

  const loadFrontendDesignEditor = async () => {
    if (!siteApiId) return;
    if (!canViewSite) {
      setFrontendDesignState((prev) => ({
        ...prev,
        errorMessage: siteDetailPermissionReason(
          permissionMatrix,
          currentAdmin,
          "sites.view",
        ),
      }));
      return;
    }
    setFrontendDesignState((prev) => ({
      ...prev,
      loading: true,
      errorMessage: null,
    }));

    try {
      const response = await getSiteFrontendDesign(siteApiId);
      applyFrontendDesignResponse(response);
    } catch (error) {
      setFrontendDesignState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load frontend design contract.",
      }));
    }
  };

  const patchFrontendDesign = (
    updates: Partial<SiteFrontendDesignContract>,
  ) => {
    if (!canConfigureSite) return;
    setFrontendDesignState((prev) => ({
      ...prev,
      notice: null,
      errorMessage: null,
      frontendDesign: {
        ...prev.frontendDesign,
        ...updates,
      },
    }));
  };

  const patchFrontendDesignSource = (
    updates: Partial<SiteFrontendDesignContract["source"]>,
  ) => {
    if (!canConfigureSite) return;
    setFrontendDesignState((prev) => ({
      ...prev,
      notice: null,
      errorMessage: null,
      frontendDesign: {
        ...prev.frontendDesign,
        source: {
          ...prev.frontendDesign.source,
          ...updates,
        },
      },
    }));
  };

  const handleSaveFrontendDesign = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setFrontendDesignState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setFrontendDesignState((prev) => ({
      ...prev,
      saving: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const nextContract: SiteFrontendDesignContract = {
        ...frontendDesignState.frontendDesign,
        tokens: parseObjectJson(
          frontendDesignState.tokensJson,
          "Tokens",
        ) as SiteFrontendDesignContract["tokens"],
        chrome: parseObjectJson(
          frontendDesignState.chromeJson,
          "Chrome",
        ) as SiteFrontendDesignContract["chrome"],
        templates: parseArrayJson(
          frontendDesignState.templatesJson,
          "Templates",
        ) as SiteFrontendDesignContract["templates"],
        editableMap: parseArrayJson(
          frontendDesignState.editableMapJson,
          "Editable map",
        ) as SiteFrontendDesignContract["editableMap"],
      };
      const response = await updateSiteFrontendDesign(siteApiId, nextContract);
      applyFrontendDesignResponse(
        response,
        "Frontend design contract saved and exposed in the public manifest.",
      );
      void loadSiteAuditEvents();
    } catch (error) {
      setFrontendDesignState((prev) => ({
        ...prev,
        saving: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to save frontend design contract.",
      }));
    }
  };

  const handleCaptureFrontendDesignDefaults = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setFrontendDesignState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setFrontendDesignState((prev) => ({
      ...prev,
      capturing: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const response = await captureSiteFrontendDesignDefaults(siteApiId);
      applyFrontendDesignResponse(
        response,
        "Captured current Backy theme, navigation, and page templates as the site design contract.",
      );
      void loadSiteAuditEvents();
    } catch (error) {
      setFrontendDesignState((prev) => ({
        ...prev,
        capturing: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to capture current Backy design defaults.",
      }));
    }
  };

  const loadSiteCommentPolicy = async () => {
    if (!siteApiId) return;
    setCommentPolicyLoading(true);
    try {
      const siteDetail = await getAdminSite(siteApiId);
      const normalized = normalizeSiteCommentPolicyDraft(
        siteDetail.settings?.commentPolicy,
      );
      setCommentPolicyDraft(normalized);
      setSavedCommentPolicy(normalized);
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to load site comment policy.",
      );
    } finally {
      setCommentPolicyLoading(false);
    }
  };

  const loadWebhookEditor = async () => {
    if (!siteApiId) return;
    if (!canViewSite) {
      setWebhookState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          viewSitePermissionTitle ||
          "Your account needs sites.view to load site webhooks.",
      }));
      return;
    }

    setWebhookState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    try {
      const siteDetail = await getAdminSite(siteApiId);
      setWebhookState({
        ...createWebhookEditorState(siteDetail.settings?.webhooks),
        loading: false,
      });
    } catch (error) {
      setWebhookState((prev) => ({
        ...prev,
        loading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to load site webhooks.",
      }));
    }
  };

  const patchWebhookEndpoint = (
    endpointId: string,
    updates: Partial<SiteWebhookEndpointDraft>,
  ) => {
    if (!canConfigureSite) return;
    setWebhookState((prev) => ({
      ...prev,
      notice: null,
      endpoints: prev.endpoints.map((endpoint) =>
        endpoint.id === endpointId ? { ...endpoint, ...updates } : endpoint,
      ),
    }));
    setSiteWorkspaceNotice(null);
  };

  const toggleWebhookEvent = (
    endpointId: string,
    eventKind: SiteWebhookEventKind,
    checked: boolean,
  ) => {
    setWebhookState((prev) => ({
      ...prev,
      notice: null,
      endpoints: prev.endpoints.map((endpoint) => {
        if (endpoint.id !== endpointId) return endpoint;
        const nextEvents = checked
          ? Array.from(new Set([...endpoint.eventKinds, eventKind]))
          : endpoint.eventKinds.filter((item) => item !== eventKind);
        return { ...endpoint, eventKinds: nextEvents };
      }),
    }));
    setSiteWorkspaceNotice(null);
  };

  const addWebhookEndpoint = () => {
    if (!canConfigureSite) return;
    setWebhookState((prev) => ({
      ...prev,
      enabled: true,
      notice: null,
      endpoints: [...prev.endpoints, makeSiteWebhookEndpoint()],
    }));
    setSiteWorkspaceNotice(null);
  };

  const removeWebhookEndpoint = (endpointId: string) => {
    if (!canConfigureSite) return;
    setWebhookState((prev) => ({
      ...prev,
      notice: null,
      endpoints: prev.endpoints.filter(
        (endpoint) => endpoint.id !== endpointId,
      ),
    }));
    setSiteWorkspaceNotice(null);
  };

  const saveSiteWebhooks = async () => {
    if (!siteApiId || webhookState.saving) return;
    if (!canConfigureSite) {
      setWebhookState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }

    setWebhookState((prev) => ({
      ...prev,
      saving: true,
      errorMessage: null,
      notice: null,
    }));
    setSiteWorkspaceNotice(null);

    try {
      const webhooks = siteWebhookDraftToSettings(webhookState);
      const savedSite = await updateSiteFromApi(siteApiId, {
        settings: {
          webhooks,
        },
      });
      updateSite(storeSiteId, savedSite);
      setFetchedSite(savedSite);
      setWebhookState({
        ...createWebhookEditorState(savedSite.settings?.webhooks),
        saving: false,
        notice: "Webhook configuration saved.",
      });
      setSiteWorkspaceNotice("Site webhook configuration saved.");
      void loadSiteAuditEvents();
    } catch (error) {
      setWebhookState((prev) => ({
        ...prev,
        saving: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to save site webhooks.",
      }));
    }
  };

  const patchCommentPolicyDraft = (
    updates: Partial<SiteCommentPolicyDraft>,
  ) => {
    if (!canConfigureComments) return;
    setCommentPolicyDraft((current) => ({
      ...current,
      ...updates,
    }));
    setSiteWorkspaceNotice(null);
  };

  const updateCommentPolicyBlockedTerms = (value: string) => {
    patchCommentPolicyDraft({
      blockedTerms: value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  const saveSiteCommentPolicy = async () => {
    if (!siteApiId || commentPolicySaving) return;
    if (!canConfigureComments) {
      setSiteSettingsError(commentsConfigureDeniedMessage);
      return;
    }
    setCommentPolicySaving(true);
    setSiteSettingsError(null);
    setSiteWorkspaceNotice(null);

    try {
      const savedSite = await updateSiteFromApi(siteApiId, {
        settings: {
          commentPolicy: commentPolicyDraft,
        },
      });
      updateSite(storeSiteId, savedSite);
      const siteDetail = await getAdminSite(siteApiId);
      const normalized = normalizeSiteCommentPolicyDraft(
        siteDetail.settings?.commentPolicy,
      );
      setCommentPolicyDraft(normalized);
      setSavedCommentPolicy(normalized);
      setSiteWorkspaceNotice("Site comment policy saved.");
      void loadComments();
      void loadSiteAuditEvents();
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to save site comment policy.",
      );
    } finally {
      setCommentPolicySaving(false);
    }
  };

  const handleDomainVerificationChange = async (
    status: SiteDomainVerification["status"],
  ) => {
    if (!siteApiId || !site || !domainVerification) return;
    if (!canConfigureSite) {
      setSiteSettingsError(siteConfigureDeniedMessage);
      return;
    }
    if (!hasCustomDomain) {
      setSiteSettingsError(
        "Add a custom domain before preparing DNS verification.",
      );
      return;
    }

    const now = new Date().toISOString();
    const nextVerification: SiteDomainVerification = {
      ...domainVerification,
      status,
      requestedAt: domainVerification.requestedAt || now,
      checkedAt:
        status === "verified" || status === "failed"
          ? now
          : domainVerification.checkedAt || null,
      verifiedAt:
        status === "verified"
          ? now
          : status === "pending"
            ? null
            : domainVerification.verifiedAt || null,
      lastError:
        status === "failed"
          ? "Manual DNS confirmation failed in the local workspace."
          : null,
    };

    setIsLoading(true);
    setSiteSettingsError(null);
    setSiteWorkspaceNotice(null);

    try {
      const savedSite = await updateSiteFromApi(siteApiId, {
        settings: {
          ...(site.settings || {}),
          domainVerification: nextVerification,
        },
      });
      updateSite(storeSiteId, savedSite);
      setFetchedSite(savedSite);
      setSiteWorkspaceNotice(
        status === "verified"
          ? `${savedSite.name} domain verification marked verified.`
          : `${savedSite.name} DNS verification record is ready.`,
      );
      void loadReadiness();
      void loadSiteAuditEvents();
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to update domain verification.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const patchThemeColor = (
    key: keyof SiteThemeDraft["colors"],
    value: string,
  ) => {
    if (!canConfigureSite) return;
    setThemeDraft((current) => ({
      ...current,
      colors: {
        ...current.colors,
        [key]: value,
      },
    }));
    setSiteWorkspaceNotice(null);
  };

  const patchThemeFont = (
    key: keyof SiteThemeDraft["fonts"],
    value: string,
  ) => {
    if (!canConfigureSite) return;
    setThemeDraft((current) => ({
      ...current,
      fonts: {
        ...current.fonts,
        [key]: value,
      },
    }));
    setSiteWorkspaceNotice(null);
  };

  const patchThemeSpacing = (
    key: keyof SiteThemeDraft["spacing"],
    value: number,
  ) => {
    if (!canConfigureSite) return;
    setThemeDraft((current) => ({
      ...current,
      spacing: {
        ...current.spacing,
        [key]: value,
      },
    }));
    setSiteWorkspaceNotice(null);
  };

  const saveThemePublishSettings = async () => {
    if (!siteApiId || !site) return;
    if (!canConfigureSite) {
      setSiteSettingsError(siteConfigureDeniedMessage);
      return;
    }

    setIsLoading(true);
    setSiteSettingsError(null);
    setSiteWorkspaceNotice(null);

    try {
      const savedSite = await updateSiteFromApi(siteApiId, {
        status: formData.status,
        theme: siteThemeDraftToTheme(themeDraft),
        settings: {
          siteStatus: formData.status,
        },
      });
      updateSite(storeSiteId, savedSite);
      setFetchedSite(savedSite);
      setThemeDraft(normalizeSiteThemeDraft(savedSite.theme));
      setSiteWorkspaceNotice(
        `${savedSite.name} theme and publish settings saved.`,
      );
      void loadReadiness();
      void loadFrontendDesignEditor();
      void loadSiteAuditEvents();
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to save theme and publish settings.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSeo = (updates: Partial<AdminSiteSeoSettings>) => {
    if (!canConfigureSite) return;
    setSeoState((prev) => ({
      ...prev,
      notice: null,
      seo: {
        ...prev.seo,
        ...updates,
      },
    }));
  };

  const handleUpdateJsonLdText = (value: string) => {
    if (!canConfigureSite) return;
    setSeoState((prev) => ({
      ...prev,
      jsonLdText: value,
      notice: null,
      errorMessage: null,
    }));
  };

  const handleAddSeoRouteOverride = (route?: AdminSiteSeoPreviewRoute) => {
    if (!canConfigureSite) return;
    setSeoState((prev) => ({
      ...prev,
      notice: null,
      seo: {
        ...prev.seo,
        routeOverrides: [
          ...(prev.seo.routeOverrides || []),
          makeSeoRouteOverride(
            (prev.seo.routeOverrides?.length || 0) + 1,
            route,
          ),
        ],
      },
    }));
  };

  const handleUpdateSeoRouteOverride = (
    index: number,
    patch: Partial<SiteSeoRouteOverride>,
  ) => {
    if (!canConfigureSite) return;
    setSeoState((prev) => ({
      ...prev,
      notice: null,
      seo: {
        ...prev.seo,
        routeOverrides: (prev.seo.routeOverrides || []).map(
          (override, currentIndex) =>
            currentIndex === index ? { ...override, ...patch } : override,
        ),
      },
    }));
  };

  const handleRemoveSeoRouteOverride = (index: number) => {
    if (!canConfigureSite) return;
    setSeoState((prev) => ({
      ...prev,
      notice: null,
      seo: {
        ...prev.seo,
        routeOverrides: (prev.seo.routeOverrides || []).filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      },
    }));
  };

  const handleSaveSeo = async () => {
    if (!siteApiId) return;
    if (!canConfigureSite) {
      setSeoState((prev) => ({
        ...prev,
        errorMessage: siteConfigureDeniedMessage,
      }));
      return;
    }
    setSeoState((prev) => ({
      ...prev,
      saving: true,
      errorMessage: null,
      notice: null,
    }));

    try {
      const jsonLd = parseJsonLd(seoState.jsonLdText);
      const result = await updateSiteSeoSettings(siteApiId, {
        ...seoState.seo,
        jsonLd,
      });
      const seo = result.seo;
      const nextSeo = { ...EMPTY_SEO_SETTINGS, ...seo };
      setSeoState((prev) => ({
        ...prev,
        seo: nextSeo,
        jsonLdText: formatJsonLd(nextSeo.jsonLd),
        preview: result.preview,
        saving: false,
        notice: "SEO defaults saved and reflected in public SEO discovery.",
      }));
      void loadReadiness();
      void loadSiteAuditEvents();
    } catch (error) {
      setSeoState((prev) => ({
        ...prev,
        saving: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to save site SEO settings.",
      }));
    }
  };

  const loadForms = async () => {
    if (!site || !siteApiId) return;
    if (!canViewForms) {
      setWorkflowError(
        formsViewPermissionTitle || "Your account cannot view site forms.",
      );
      return;
    }
    setState((prev) => ({
      ...prev,
      workflowLoading: true,
      errorMessage: null,
    }));
    try {
      const forms = await listFormsFromApi(siteApiId);
      const firstFormId = forms[0]?.id || "";
      setState((prev) => ({
        ...prev,
        forms,
        selectedFormId: forms.some((f) => f.id === prev.selectedFormId)
          ? prev.selectedFormId
          : firstFormId,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load forms.";
      setWorkflowError(message);
      setState((prev) => ({ ...prev, forms: [], selectedFormId: "" }));
    } finally {
      setState((prev) => ({ ...prev, workflowLoading: false }));
    }
  };

  const loadSubmissions = async (formId: string) => {
    if (!siteApiId || !formId) return;
    if (!canViewForms) {
      setWorkflowError(
        formsViewPermissionTitle ||
          "Your account cannot view form submissions.",
      );
      return;
    }
    setState((prev) => ({
      ...prev,
      submissionLoading: true,
      errorMessage: null,
    }));
    try {
      const requestId = normalizeRequestIdInput(commentRequestId);
      const detail = await getFormWithSubmissions(siteApiId, formId, {
        ...(submissionStatus !== "all" ? { status: submissionStatus } : {}),
        ...(requestId ? { requestId } : {}),
      });
      const submissions = detail.submissions.data || [];
      const submissionCount =
        typeof detail.submissions.pagination?.total === "number"
          ? detail.submissions.pagination.total
          : submissions.length;

      setState((prev) => ({
        ...prev,
        submissions,
        submissionCount,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load form submissions.";
      setState((prev) => ({ ...prev, submissions: [], submissionCount: 0 }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, submissionLoading: false }));
    }
  };

  const loadContacts = async (formId: string) => {
    if (!siteApiId || !formId) return;
    if (!canViewForms) {
      setWorkflowError(
        formsViewPermissionTitle || "Your account cannot view form contacts.",
      );
      return;
    }
    setState((prev) => ({ ...prev, contactLoading: true, errorMessage: null }));
    try {
      const requestId = normalizeRequestIdInput(commentRequestId);
      const result = await listFormContacts(siteApiId, formId, {
        ...(contactStatus !== "all" ? { status: contactStatus } : {}),
        ...(requestId ? { requestId } : {}),
      });
      const contacts = result.contacts;
      const contactCount = result.count;

      setState((prev) => ({
        ...prev,
        contacts,
        contactCount,
      }));
      setContactNoteDrafts((current) =>
        Object.fromEntries(
          contacts.map((contact) => [
            contact.id,
            current[contact.id] ?? contact.notes ?? "",
          ]),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load contacts.";
      setState((prev) => ({ ...prev, contacts: [], contactCount: 0 }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, contactLoading: false }));
    }
  };

  const loadComments = async () => {
    if (!siteApiId) return;
    if (!canViewComments) {
      setWorkflowError(
        commentsViewPermissionTitle || "Your account cannot view comments.",
      );
      return;
    }
    setState((prev) => ({
      ...prev,
      commentsLoading: true,
      errorMessage: null,
    }));
    try {
      const query = buildCommentFilterQuery();
      const response = await adminFetch(
        buildApiUrl(`/api/sites/${siteApiId}/comments?${query}`),
      );
      if (!response.ok) {
        throw new Error("Unable to load comments.");
      }

      const payload = await response.json();
      const data = readPayloadData(payload);
      const comments = Array.isArray(data.comments)
        ? (data.comments as Comment[])
        : [];
      const commentCount =
        typeof data.count === "number" ? data.count : comments.length;

      setState((prev) => ({
        ...prev,
        comments,
        commentCount,
        selectedCommentIds: [],
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load comments.";
      setState((prev) => ({
        ...prev,
        comments: [],
        commentCount: 0,
        selectedCommentIds: [],
      }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, commentsLoading: false }));
    }
  };

  const buildCommentFilterQuery = () => {
    const searchParams = new URLSearchParams();
    if (commentTargetType !== "all") {
      searchParams.set("targetType", commentTargetType);
    } else {
      searchParams.set("targetType", "all");
    }

    if (commentStatus !== "all") {
      searchParams.set("status", commentStatus);
    }

    const q = commentSearch.trim();
    if (q) searchParams.set("q", q);
    if (commentRequestId.trim())
      searchParams.set("requestId", commentRequestId.trim());
    if (commentTargetId.trim())
      searchParams.set("targetId", commentTargetId.trim());

    return searchParams.toString();
  };

  const loadCommentReportReasons = async () => {
    if (!siteApiId) return;
    try {
      const response = await fetch(
        buildApiUrl(`/api/sites/${siteApiId}/comments/report-reasons`),
      );
      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null);
      const data = readPayloadData(payload);
      const reasons: unknown[] = Array.isArray(data.reasons)
        ? data.reasons
        : [];
      const fallback = new Set(DEFAULT_COMMENT_REPORT_REASONS);
      const parsed = reasons
        .map((value: unknown) =>
          typeof value === "string" ? value.trim() : "",
        )
        .filter(
          (value: string): value is CommentReportReason =>
            value.length > 0 && fallback.has(value as CommentReportReason),
        );

      if (parsed.length === 0) {
        return;
      }

      setState((prev) => ({ ...prev, commentReportReasons: parsed }));
    } catch {
      // keep defaults
    }
  };

  const refreshWorkflow = async (formId?: string) => {
    if (!site || !siteApiId) return;
    if (!canViewForms && !canViewComments) {
      setWorkflowError(
        "Your account cannot view forms or comments for this site.",
      );
      return;
    }
    const activeFormId = formId || state.selectedFormId;
    setWorkflowLoading(true);

    try {
      await loadForms();
      if (activeFormId) {
        await Promise.all([
          loadSubmissions(activeFormId),
          loadContacts(activeFormId),
        ]);
      }
      await loadComments();
    } finally {
      setWorkflowLoading(false);
    }
  };

  const createSiteDetailForm = async () => {
    if (!siteApiId || formBuilderCreating) return;
    if (!canCreateForms) {
      setWorkflowError(
        formsCreatePermissionTitle || "Your account cannot create site forms.",
      );
      return;
    }

    const suffix = Date.now().toString(36);
    setFormBuilderCreating(true);
    setWorkflowError(null);
    setFormBuilderNotice(null);

    try {
      const created = await createForm(siteApiId, {
        name: `site-form-${suffix}`,
        title: "New site form",
        description: "Standalone form managed from the site workspace.",
        audience: "public",
        isActive: true,
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          {
            key: "message",
            label: "Message",
            type: "textarea",
            required: false,
          },
        ],
        successMessage: "Submission received.",
        enableHoneypot: true,
        enableCaptcha: false,
        moderationMode: "manual",
        contactShare: {
          enabled: true,
          nameField: "name",
          emailField: "email",
          notesField: "message",
          dedupeByEmail: true,
        },
        collectionTarget: { enabled: false, collectionId: "", fieldMap: {} },
        settings: { source: "site-detail-builder" },
      });
      setState((prev) => ({
        ...prev,
        forms: [
          created,
          ...prev.forms.filter((form) => form.id !== created.id),
        ],
        selectedFormId: created.id,
      }));
      setFormBuilderDraft(cloneSiteFormDefinition(created));
      setFormBuilderNotice("Standalone site form created.");
      void loadSiteAuditEvents();
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Unable to create site form.",
      );
    } finally {
      setFormBuilderCreating(false);
    }
  };

  const patchFormBuilderDraft = (patch: Partial<FormDefinition>) => {
    if (!canEditForms) return;
    setFormBuilderDraft((current) =>
      current ? { ...current, ...patch } : current,
    );
    setFormBuilderNotice(null);
  };

  const patchFormBuilderField = (
    fieldIndex: number,
    patch: Partial<FormFieldDefinition>,
  ) => {
    if (!canEditForms) return;
    setFormBuilderDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: current.fields.map((field, index) =>
          index === fieldIndex ? { ...field, ...patch } : field,
        ),
      };
    });
    setFormBuilderNotice(null);
  };

  const addFormBuilderField = () => {
    if (!canEditForms) return;
    setFormBuilderDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: [
          ...current.fields,
          makeSiteFormField(current.fields.length + 1),
        ],
      };
    });
    setFormBuilderNotice(null);
  };

  const removeFormBuilderField = (fieldIndex: number) => {
    if (!canEditForms) return;
    setFormBuilderDraft((current) => {
      if (!current || current.fields.length <= 1) return current;
      return {
        ...current,
        fields: current.fields.filter((_, index) => index !== fieldIndex),
      };
    });
    setFormBuilderNotice(null);
  };

  const moveFormBuilderField = (fieldIndex: number, direction: -1 | 1) => {
    if (!canEditForms) return;
    setFormBuilderDraft((current) => {
      if (!current) return current;
      const nextIndex = fieldIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      const [field] = fields.splice(fieldIndex, 1);
      fields.splice(nextIndex, 0, field);
      return { ...current, fields };
    });
    setFormBuilderNotice(null);
  };

  const saveFormBuilderDraft = async () => {
    if (
      !siteApiId ||
      !state.selectedFormId ||
      !formBuilderDraft ||
      formBuilderSaving
    )
      return;
    if (!canEditForms) {
      setWorkflowError(
        formsEditPermissionTitle || "Your account cannot edit site forms.",
      );
      return;
    }

    const payload = siteFormDraftToPayload(formBuilderDraft);
    if (!payload.name) {
      setWorkflowError("Form machine name is required.");
      return;
    }
    if (!payload.fields.length) {
      setWorkflowError("At least one form field is required.");
      return;
    }
    if (payload.fields.some((field) => !field.key || !field.label)) {
      setWorkflowError("Every form field needs a key and label.");
      return;
    }

    setFormBuilderSaving(true);
    setWorkflowError(null);
    setFormBuilderNotice(null);

    try {
      const updated = await updateForm(
        siteApiId,
        state.selectedFormId,
        payload,
      );
      setState((prev) => ({
        ...prev,
        forms: prev.forms.map((form) =>
          form.id === updated.id ? updated : form,
        ),
      }));
      setFormBuilderDraft(cloneSiteFormDefinition(updated));
      setFormBuilderNotice("Site form builder changes saved.");
      await Promise.all([
        loadSubmissions(updated.id),
        loadContacts(updated.id),
      ]);
      void loadSiteAuditEvents();
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Unable to save site form.",
      );
    } finally {
      setFormBuilderSaving(false);
    }
  };

  const deleteSelectedSiteForm = async () => {
    if (!siteApiId || !state.selectedFormId || formBuilderDeleting) return;
    if (!canDeleteForms) {
      setWorkflowError(
        formsDeletePermissionTitle || "Your account cannot delete site forms.",
      );
      return;
    }

    const formId = state.selectedFormId;
    setFormBuilderDeleting(true);
    setWorkflowError(null);
    setFormBuilderNotice(null);

    try {
      await deleteFormFromApi(siteApiId, formId);
      setState((prev) => {
        const forms = prev.forms.filter((form) => form.id !== formId);
        return {
          ...prev,
          forms,
          selectedFormId: forms[0]?.id || "",
          submissions: [],
          submissionCount: 0,
          contacts: [],
          contactCount: 0,
        };
      });
      setFormBuilderDraft(null);
      setFormBuilderNotice("Site form deleted.");
      void loadSiteAuditEvents();
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Unable to delete site form.",
      );
    } finally {
      setFormBuilderDeleting(false);
    }
  };

  const updateSubmissionStatus = async (
    submission: FormSubmission,
    status: FormSubmission["status"],
  ) => {
    if (!siteApiId || !state.selectedFormId) return;
    if (!canManageForms) {
      setWorkflowError(formsManageDeniedMessage);
      return;
    }
    setActionBusyId(submission.id);
    try {
      await updateFormSubmission(
        siteApiId,
        state.selectedFormId,
        submission.id,
        {
          status,
          reviewedBy: "admin",
          adminNotes: `Updated to ${status} from admin console`,
        },
      );
      await Promise.all([
        loadSubmissions(state.selectedFormId),
        loadContacts(state.selectedFormId),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update submission status.";
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const updateContactStatus = async (
    contact: Contact,
    status: Contact["status"],
  ) => {
    if (!siteApiId || !state.selectedFormId) return;
    if (!canManageForms) {
      setWorkflowError(formsManageDeniedMessage);
      return;
    }
    setActionBusyId(contact.id);
    try {
      await updateContact(siteApiId, state.selectedFormId, contact.id, {
        status,
      });
      await loadContacts(state.selectedFormId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update contact status.";
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const updateContactNotes = async (contact: Contact) => {
    if (!siteApiId || !state.selectedFormId) return;
    if (!canManageForms) {
      setWorkflowError(formsManageDeniedMessage);
      return;
    }
    const notes = contactNoteDrafts[contact.id] ?? "";
    setActionBusyId(`contact-notes:${contact.id}`);
    try {
      await updateContact(siteApiId, state.selectedFormId, contact.id, {
        notes: notes.trim() || null,
      });
      await loadContacts(state.selectedFormId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save contact notes.";
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const toggleCommentSelection = (commentId: string, checked: boolean) => {
    setState((prev) => ({
      ...prev,
      selectedCommentIds: checked
        ? Array.from(new Set([...prev.selectedCommentIds, commentId]))
        : prev.selectedCommentIds.filter((id) => id !== commentId),
    }));
  };

  const clearCommentSelection = () => {
    setState((prev) => ({ ...prev, selectedCommentIds: [] }));
  };

  const updateCommentStatus = async (
    comment: Comment,
    status: Comment["status"],
    blockReason?: string,
    requestId?: string,
  ) => {
    if (!siteApiId) return;
    if (!canManageComments) {
      setWorkflowError(commentsManageDeniedMessage);
      return;
    }
    setActionBusyId(comment.id);
    try {
      const effectiveRequestId =
        requestId?.trim() || comment.requestId || undefined;

      const response = await adminFetch(
        buildApiUrl(`/api/sites/${siteApiId}/comments/${comment.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            reviewedBy: "admin",
            actor: "admin",
            blockReason: blockReason,
            requestId: effectiveRequestId,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to update comment status.");
      }
      await loadComments();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update comment status.";
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const exportSubmissions = async () => {
    if (!state.selectedFormId || !siteApiId) return;
    if (!canExportForms) {
      setWorkflowError(
        formsExportPermissionTitle ||
          "Your account cannot export form submissions.",
      );
      return;
    }

    const allSubmissions: FormSubmission[] = [];
    const limit = 200;
    const requestId = normalizeRequestIdInput(commentRequestId);
    let offset = 0;

    try {
      let hasMore = true;
      while (hasMore) {
        const detail = await getFormWithSubmissions(
          siteApiId,
          state.selectedFormId,
          {
            limit,
            offset,
            ...(submissionStatus !== "all" ? { status: submissionStatus } : {}),
            ...(requestId ? { requestId } : {}),
          },
        );
        const submissions = detail.submissions.data || [];
        const count =
          typeof detail.submissions.pagination?.total === "number"
            ? detail.submissions.pagination.total
            : submissions.length;

        allSubmissions.push(...submissions);
        hasMore = offset + submissions.length < count;
        offset += limit;

        if (submissions.length === 0) {
          break;
        }
      }

      if (!allSubmissions.length) return;

      const rows = [
        [
          "id",
          "status",
          "submittedAt",
          "reviewedBy",
          "adminNotes",
          "pageId",
          "postId",
          "requestId",
          "values",
        ],
        ...allSubmissions.map((submission) => [
          submission.id,
          submission.status,
          submission.submittedAt,
          submission.reviewedBy || "",
          submission.adminNotes || "",
          submission.pageId || "",
          submission.postId || "",
          submission.requestId || "",
          safeText(submission.values),
        ]),
      ];
      const fileLabel = `submissions-${submissionStatus}-${requestId || "all"}`;

      const blob = makeCsvBlob(rows);
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to export form submissions.";
      setWorkflowError(message);
    }
  };

  const exportContacts = async () => {
    if (!state.selectedFormId || !siteApiId) return;
    if (!canExportForms) {
      setWorkflowError(
        formsExportPermissionTitle || "Your account cannot export contacts.",
      );
      return;
    }

    const allContacts: Contact[] = [];
    const limit = 200;
    const requestId = normalizeRequestIdInput(commentRequestId);
    let offset = 0;

    try {
      let hasMore = true;
      while (hasMore) {
        const result = await listFormContacts(siteApiId, state.selectedFormId, {
          limit,
          offset,
          ...(contactStatus !== "all" ? { status: contactStatus } : {}),
          ...(requestId ? { requestId } : {}),
        });
        const contacts = result.contacts;
        const count = result.count;

        allContacts.push(...contacts);
        hasMore = offset + contacts.length < count;
        offset += limit;

        if (contacts.length === 0) {
          break;
        }
      }

      if (!allContacts.length) return;

      const rows = [
        [
          "id",
          "status",
          "name",
          "email",
          "phone",
          "requestId",
          "sourceSubmissionId",
          "notes",
          "createdAt",
          "updatedAt",
        ],
        ...allContacts.map((contact) => [
          contact.id,
          contact.status,
          contact.name || "",
          contact.email || "",
          contact.phone || "",
          contact.requestId || "",
          contact.sourceSubmissionId || "",
          contact.notes || "",
          contact.createdAt,
          contact.updatedAt,
        ]),
      ];
      const fileLabel = `contacts-${contactStatus}-${requestId || "all"}`;

      const blob = makeCsvBlob(rows);
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to export contacts.";
      setWorkflowError(message);
    }
  };

  const exportComments = async () => {
    if (!siteApiId) return;
    if (!canExportActivity) {
      setWorkflowError(
        activityExportPermissionTitle ||
          "Your account cannot export comment activity.",
      );
      return;
    }
    const allComments: Comment[] = [];
    const limit = 200;
    let offset = 0;

    try {
      const baseQuery = buildCommentFilterQuery();
      let hasMore = true;

      while (hasMore) {
        const query = new URLSearchParams(baseQuery);
        query.set("limit", `${limit}`);
        query.set("offset", `${offset}`);

        const response = await adminFetch(
          buildApiUrl(`/api/sites/${siteApiId}/comments?${query.toString()}`),
        );
        if (!response.ok) {
          throw new Error("Unable to load comments for export.");
        }

        const payload = await response.json();
        const data = readPayloadData(payload);
        const comments = Array.isArray(data.comments)
          ? (data.comments as Comment[])
          : [];
        const count =
          typeof data.count === "number" ? data.count : comments.length;
        allComments.push(...comments);
        hasMore = offset + comments.length < count;
        offset += limit;

        if (comments.length === 0) {
          break;
        }
      }

      if (!allComments.length) return;

      const rows = [
        [
          "id",
          "status",
          "targetType",
          "targetId",
          "parentId",
          "requestId",
          "authorName",
          "authorEmail",
          "authorWebsite",
          "reportCount",
          "reportReasons",
          "reviewedBy",
          "blockReason",
          "rejectionReason",
          "createdAt",
        ],
        ...allComments.map((comment) => [
          comment.id,
          comment.status,
          comment.targetType,
          comment.targetId,
          comment.parentId || "",
          comment.requestId || "",
          comment.authorName || "",
          comment.authorEmail || "",
          comment.authorWebsite || "",
          typeof comment.reportCount === "number"
            ? String(comment.reportCount)
            : "0",
          Array.isArray(comment.reportReasons)
            ? comment.reportReasons.join(";")
            : "",
          comment.reviewedBy || "",
          comment.blockReason || "",
          comment.rejectionReason || "",
          comment.createdAt,
        ]),
      ];
      const blob = makeCsvBlob(rows);
      const fileLabel =
        commentStatus === "all" && !commentRequestId
          ? "comments"
          : `${commentStatus}-${commentRequestId || "all"}`;
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to export comments.";
      setWorkflowError(message);
    }
  };

  const applyBulkCommentAction = async (status: Comment["status"]) => {
    if (!siteApiId || state.selectedCommentIds.length === 0) return;
    if (!canManageComments) {
      setWorkflowError(commentsManageDeniedMessage);
      return;
    }
    setActionBusyId("bulk-comment");
    try {
      const response = await adminFetch(
        buildApiUrl(`/api/sites/${siteApiId}/comments`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentIds: state.selectedCommentIds,
            status,
            reviewedBy: "admin",
            actor: "admin",
            blockReason: status === "blocked" ? commentBlockReason : undefined,
            requestId: commentRequestId || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Unable to apply bulk comment moderation.");
      }

      await loadComments();
      clearCommentSelection();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to apply bulk comment moderation.";
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const exportCommentEvents = async () => {
    if (!siteApiId || !commentRequestId) return;
    if (!canExportActivity) {
      setWorkflowError(
        activityExportPermissionTitle ||
          "Your account cannot export activity events.",
      );
      return;
    }
    try {
      const requestId = commentRequestId.trim();
      const allEvents: Array<{
        id: string;
        kind: string;
        status: string;
        target?: string;
        requestId?: string;
        formId?: string;
        submissionId?: string;
        commentId?: string;
        contactId?: string;
        reason?: string;
        actor?: string;
        statusCode?: number;
        error?: string;
        createdAt?: string;
      }> = [];
      const limit = 200;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          buildApiUrl(
            `/api/sites/${siteApiId}/events?${new URLSearchParams({
              requestId,
              limit: `${limit}`,
              offset: `${offset}`,
            }).toString()}`,
          ),
        );
        if (!response.ok) {
          throw new Error("Unable to load audit events.");
        }

        const payload = await response.json();
        const data = readPayloadData(payload);
        const events = Array.isArray(data.events) ? data.events : [];
        const count =
          typeof data.count === "number" ? data.count : events.length;
        allEvents.push(...events);
        hasMore = offset + events.length < count;
        offset += limit;

        if (events.length === 0) {
          break;
        }
      }

      if (!allEvents.length) return;

      const rows = [
        [
          "id",
          "kind",
          "status",
          "target",
          "requestId",
          "formId",
          "submissionId",
          "commentId",
          "contactId",
          "statusCode",
          "reason",
          "actor",
          "error",
          "createdAt",
        ],
        ...allEvents.map((event) => [
          event.id,
          event.kind,
          event.status,
          event.target,
          event.requestId || "",
          event.formId || "",
          event.submissionId || "",
          event.commentId || "",
          event.contactId || "",
          typeof event.statusCode === "number" ? String(event.statusCode) : "",
          event.reason || "",
          event.actor || "",
          event.error || "",
          event.createdAt || "",
        ]),
      ];
      const blob = makeCsvBlob(rows);
      downloadBlob(`events-${commentRequestId}.csv`, blob);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to export events.";
      setWorkflowError(message);
    }
  };

  useEffect(() => {
    if (siteApiId) {
      void refreshWorkflow();
      void loadCommentReportReasons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    siteApiId,
    submissionStatus,
    commentStatus,
    contactStatus,
    commentSearch,
    commentRequestId,
    commentTargetType,
    commentTargetId,
  ]);

  useEffect(() => {
    if (siteApiId) {
      void loadReadiness();
      void loadNavigationEditor();
      void loadFrontendDesignEditor();
      void loadRedirectEditor();
      void loadSeoEditor();
      void loadWebhookEditor();
      void loadSiteCommentPolicy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteApiId]);

  useEffect(() => {
    if (siteApiId && !isPermissionMatrixPending) {
      void loadSiteAuditEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteApiId, isPermissionMatrixPending, canExportActivity]);

  useEffect(() => {
    if (state.selectedFormId && siteApiId) {
      void loadSubmissions(state.selectedFormId);
      void loadContacts(state.selectedFormId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedFormId]);

  useEffect(() => {
    const selected =
      state.forms.find((form) => form.id === state.selectedFormId) || null;
    setFormBuilderDraft(selected ? cloneSiteFormDefinition(selected) : null);
  }, [state.forms, state.selectedFormId]);

  useEffect(() => {
    if (!state.commentReportReasons.length) {
      return;
    }

    if (!state.commentReportReasons.includes(commentBlockReason)) {
      setCommentBlockReason(state.commentReportReasons[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.commentReportReasons, commentBlockReason]);

  const activeForm = state.forms.find(
    (form) => form.id === state.selectedFormId,
  );
  const formBuilderDirty = Boolean(
    activeForm &&
    formBuilderDraft &&
    JSON.stringify(activeForm) !== JSON.stringify(formBuilderDraft),
  );
  const commentPolicyDirty =
    JSON.stringify(commentPolicyDraft) !== JSON.stringify(savedCommentPolicy);
  const commentPolicyBlockedTermsText =
    commentPolicyDraft.blockedTerms.join("\n");
  const readinessFindings =
    readiness?.checks.filter((check) => check.status !== "pass").slice(0, 5) ||
    [];
  const readinessContentItems = [
    ...(readiness?.pages.map((page) => ({
      id: page.id,
      type: "Page",
      title: page.title,
      path: page.path,
      status: page.status,
      contentMetric: `${page.canvasSize.width}x${page.canvasSize.height}`,
      score: page.score,
      statusLabel: page.statusLabel,
    })) || []),
    ...(readiness?.posts.map((post) => ({
      id: post.id,
      type: "Post",
      title: post.title,
      path: post.path,
      status: post.status,
      contentMetric: post.canvasSize
        ? `${post.canvasSize.width}x${post.canvasSize.height}`
        : post.hasLegacyContent
          ? "Legacy"
          : "Empty",
      score: post.score,
      statusLabel: post.statusLabel,
    })) || []),
  ];
  const readinessSummary = readiness?.summary;
  const savedCustomDomain = site?.customDomain || "";
  const domainVerification = site
    ? getDomainVerification(
        site,
        savedCustomDomain || undefined,
        formData.slug || site.slug,
      )
    : null;
  const hasCustomDomain = Boolean(savedCustomDomain);
  const siteWorkspaceReadiness = useMemo(() => {
    const navigationItems = [
      ...(navigationState.navigation.primary || []),
      ...(navigationState.navigation.footer || []),
    ];
    const navigationLayout = normalizeNavigationLayoutState(
      navigationState.navigation.layout,
    );
    const readyByBackend = readiness?.statusLabel === "ready";
    const hasNavigation = navigationItems.length > 0;
    const hasGlobalLayout = Boolean(
      navigationLayout.header?.variant && navigationLayout.footer?.variant,
    );
    const redirectsClean = redirectState.conflicts.length === 0;
    const hasThemeTokens = Boolean(
      themeDraft.colors.primary &&
      themeDraft.colors.background &&
      themeDraft.fonts.heading &&
      themeDraft.fonts.body,
    );
    const hasSeoDefaults = Boolean(
      seoState.seo.titleTemplate ||
      seoState.seo.defaultDescription ||
      seoState.seo.defaultOgImage ||
      seoState.seo.favicon ||
      seoState.seo.jsonLd?.length ||
      seoState.seo.routeOverrides?.length,
    );
    const enabledWebhookEndpoints = webhookState.endpoints.filter(
      (endpoint) => endpoint.enabled && endpoint.url.trim(),
    );
    const hasFrontendDesign =
      frontendDesignState.frontendDesign.status !== "unconfigured";
    const hasAutomation =
      state.forms.length > 0 ||
      state.submissionCount > 0 ||
      state.contactCount > 0 ||
      state.commentCount > 0 ||
      commentPolicyDraft.enabled;
    const hasDomain = Boolean(
      formData.customDomain || site?.customDomain || site?.slug,
    );
    const domainReady =
      !hasCustomDomain || domainVerification?.status === "verified";
    const checks = [
      {
        label: "Publish state",
        detail: readyByBackend
          ? `Backend readiness is ${readiness?.score ?? 0}%.`
          : readiness
            ? `${readinessSummary?.errors ?? 0} errors and ${readinessSummary?.warnings ?? 0} warnings need review.`
            : "Run readiness to validate public delivery.",
        ready: readyByBackend,
      },
      {
        label: "Navigation model",
        detail: hasNavigation
          ? `${navigationItems.length} menu item${navigationItems.length === 1 ? "" : "s"} configured`
          : "Add primary or footer menu links for frontend navigation.",
        ready: hasNavigation,
      },
      {
        label: "Global layout chrome",
        detail: hasGlobalLayout
          ? `${navigationLayout.header?.variant} header and ${navigationLayout.footer?.variant} footer controls are exposed.`
          : "Choose header and footer behavior for site-wide frontend chrome.",
        ready: hasGlobalLayout,
      },
      {
        label: "Route hygiene",
        detail: redirectsClean
          ? `${redirectState.rules.length} redirect/gone rule${redirectState.rules.length === 1 ? "" : "s"} without conflicts`
          : `${redirectState.conflicts.length} redirect conflict${redirectState.conflicts.length === 1 ? "" : "s"} found`,
        ready: redirectsClean,
      },
      {
        label: "Theme tokens",
        detail: hasThemeTokens
          ? `${themeDraft.colors.primary} brand, ${themeDraft.fonts.heading}/${themeDraft.fonts.body} fonts, ${themeDraft.spacing.unit}px spacing unit`
          : "Set brand colors, fonts, and spacing for public render tokens.",
        ready: hasThemeTokens,
      },
      {
        label: "SEO defaults",
        detail: hasSeoDefaults
          ? `${seoState.seo.routeOverrides?.length || 0} route override${(seoState.seo.routeOverrides?.length || 0) === 1 ? "" : "s"} plus site defaults are available to hosted and custom frontend routes.`
          : "Add default SEO metadata before relying on public discovery.",
        ready: hasSeoDefaults,
      },
      {
        label: "Integration webhooks",
        detail: webhookState.enabled
          ? `${enabledWebhookEndpoints.length} enabled endpoint${enabledWebhookEndpoints.length === 1 ? "" : "s"} configured for site events.`
          : "Site webhook delivery is disabled until an integration endpoint is added.",
        ready: !webhookState.enabled || enabledWebhookEndpoints.length > 0,
      },
      {
        label: "Frontend design contract",
        detail: hasFrontendDesign
          ? `${frontendDesignState.frontendDesign.source.type} design with ${frontendDesignState.frontendDesign.templates.length} templates and ${frontendDesignState.frontendDesign.editableMap.length} editable bindings.`
          : "Capture or import a frontend design contract before generating custom-designed pages.",
        ready: hasFrontendDesign,
      },
      {
        label: "Public address",
        detail: hasDomain
          ? hasCustomDomain
            ? `${savedCustomDomain} (${domainVerificationStatusLabel[domainVerification?.status || "not_started"]})`
            : `${formData.slug || site?.slug}.backy.app`
          : "Set a slug or custom domain for previews and frontend routing.",
        ready: hasDomain && domainReady,
      },
      {
        label: "Automation queues",
        detail: hasAutomation
          ? `${state.forms.length} forms, ${state.contactCount} leads, ${state.commentCount} comments, ${commentPolicyDraft.moderationMode} comments policy`
          : "Connect forms, leads, or comments to complete the site workflow.",
        ready: hasAutomation,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        {
          label: "Structure",
          detail: "Set site identity, routes, menus, and redirect behavior.",
        },
        {
          label: "Optimize",
          detail:
            "Tune SEO, crawler rules, social previews, and readiness blockers.",
        },
        {
          label: "Operate",
          detail:
            "Review submissions, leads, comments, exports, and request-level events.",
        },
        {
          label: "Publish",
          detail:
            "Use this site as a managed frontend or a clean API contract for custom builds.",
        },
      ],
    };
  }, [
    formData.customDomain,
    formData.slug,
    formData.status,
    domainVerification?.status,
    hasCustomDomain,
    savedCustomDomain,
    commentPolicyDraft.enabled,
    commentPolicyDraft.moderationMode,
    frontendDesignState.frontendDesign.editableMap.length,
    frontendDesignState.frontendDesign.source.type,
    frontendDesignState.frontendDesign.status,
    frontendDesignState.frontendDesign.templates.length,
    navigationState.navigation.footer,
    navigationState.navigation.layout,
    navigationState.navigation.primary,
    readiness,
    readinessSummary?.errors,
    readinessSummary?.warnings,
    redirectState.conflicts.length,
    redirectState.rules.length,
    seoState.seo.defaultDescription,
    seoState.seo.defaultOgImage,
    seoState.seo.favicon,
    seoState.seo.jsonLd?.length,
    seoState.seo.routeOverrides?.length,
    seoState.seo.titleTemplate,
    site?.customDomain,
    site?.slug,
    state.commentCount,
    state.contactCount,
    state.forms.length,
    state.submissionCount,
    themeDraft.colors.background,
    themeDraft.colors.primary,
    themeDraft.fonts.body,
    themeDraft.fonts.heading,
    themeDraft.spacing.unit,
    webhookState.enabled,
    webhookState.endpoints,
  ]);

  const publicSiteUrl = `https://${formData.customDomain || site?.customDomain || `${formData.slug || site?.slug || siteId}.backy.app`}`;
  const adminSiteUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(siteApiId || siteId)}`;
  const publicApiBase = buildApiUrl("/api");
  const publicSiteApiUrl = `${publicApiBase}/sites/${encodeURIComponent(siteApiId || siteId)}`;
  const domainActionDisabled =
    isSiteSettingsBusy || !canConfigureSite || !hasCustomDomain;
  const domainActionTitle = !hasCustomDomain
    ? "Save a custom domain before preparing DNS verification."
    : canConfigureSite
      ? undefined
      : configureSitePermissionTitle;
  const siteWorkspaceHandoff = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      site: {
        id: site?.id || siteId,
        apiId: siteApiId || siteId,
        name: formData.name || site?.name || "Untitled site",
        slug: formData.slug || site?.slug || siteId,
        customDomain: formData.customDomain || site?.customDomain || null,
        status: formData.status,
        publicUrl: publicSiteUrl,
      },
      domainVerification: domainVerification
        ? {
            ...domainVerification,
            hasCustomDomain,
            ready: !hasCustomDomain || domainVerification.status === "verified",
          }
        : null,
      endpoints: {
        adminSite: adminSiteUrl,
        readiness: `${adminSiteUrl}/readiness`,
        navigation: `${adminSiteUrl}/navigation`,
        redirects: `${adminSiteUrl}/redirects`,
        seo: `${adminSiteUrl}/seo`,
        webhooks: adminSiteUrl,
        pages: `${adminSiteUrl}/pages`,
        forms: `${publicSiteApiUrl}/forms`,
        comments: `${publicSiteApiUrl}/comments`,
        events: `${publicSiteApiUrl}/events`,
        publicResolve: `${publicSiteApiUrl}/resolve?path=/`,
        publicRender: `${publicSiteApiUrl}/render?path=/`,
        publicOpenApi: `${publicSiteApiUrl}/openapi`,
        frontendDesign: `${adminSiteUrl}/frontend-design`,
      },
      frontendDesign: {
        status: frontendDesignState.frontendDesign.status,
        source: frontendDesignState.frontendDesign.source,
        tokenKeys: Object.keys(frontendDesignState.frontendDesign.tokens || {}),
        chromeKeys: Object.keys(
          frontendDesignState.frontendDesign.chrome || {},
        ),
        templates: frontendDesignState.frontendDesign.templates.map(
          (template) => ({
            id: template.id,
            type: template.type,
            name: template.name,
            routePattern: template.routePattern,
          }),
        ),
        editableBindings: frontendDesignState.frontendDesign.editableMap,
        notes: frontendDesignState.frontendDesign.notes || "",
      },
      theme: siteThemeDraftToTheme(themeDraft),
      navigation: {
        primaryItems: navigationState.navigation.primary.length,
        footerItems: navigationState.navigation.footer?.length || 0,
        primary: navigationState.navigation.primary,
        footer: navigationState.navigation.footer || [],
        layout: normalizeNavigationLayoutState(
          navigationState.navigation.layout,
        ),
      },
      redirects: {
        ruleCount: redirectState.rules.length,
        conflicts: redirectState.conflicts.map((conflict) => ({
          from: conflict.from,
          kind: conflict.kind,
          message: conflict.message,
        })),
      },
      seo: {
        titleTemplate: seoState.seo.titleTemplate,
        defaultDescription: seoState.seo.defaultDescription,
        sitemap: seoState.seo.sitemap,
        robots: seoState.seo.robots,
        routeOverrides: seoState.seo.routeOverrides || [],
        jsonLdCount: seoState.seo.jsonLd?.length || 0,
      },
      webhooks: {
        enabled: webhookState.enabled,
        endpointCount: webhookState.endpoints.length,
        endpoints: webhookState.endpoints.map((endpoint) => ({
          id: endpoint.id,
          name: endpoint.name,
          url: endpoint.url,
          enabled: endpoint.enabled,
          eventKinds: endpoint.eventKinds,
          hasSecretReference: Boolean(endpoint.secretId),
        })),
      },
      readiness: {
        score: siteWorkspaceReadiness.score,
        checks: siteWorkspaceReadiness.checks,
        backend: readiness
          ? {
              score: readiness.score,
              statusLabel: readiness.statusLabel,
              summary: readiness.summary,
            }
          : null,
      },
      automation: {
        forms: state.forms.length,
        formBuilder: activeForm
          ? {
              formId: activeForm.id,
              title: activeForm.title || activeForm.name,
              fields:
                formBuilderDraft?.fields.length || activeForm.fields.length,
              active: formBuilderDraft?.isActive ?? activeForm.isActive,
              dirty: formBuilderDirty,
            }
          : null,
        submissions: state.submissionCount,
        contacts: state.contactCount,
        comments: state.commentCount,
        commentPolicy: {
          ...commentPolicyDraft,
          dirty: commentPolicyDirty,
        },
        selectedFormId: state.selectedFormId || null,
        filters: {
          submissions: submissionStatus,
          contacts: contactStatus,
          comments: commentStatus,
          commentSearch,
          commentRequestId,
          commentTargetType,
          commentTargetId,
        },
      },
      guardrails: [
        "Admin endpoints require authenticated Backy access.",
        "Public frontends should use resolve/render/OpenAPI endpoints and public interaction endpoints.",
        "Navigation, redirects, SEO, and readiness must be refreshed before publishing major route changes.",
        "Forms, contacts, comments, and request events are site-scoped automation queues.",
      ],
    }),
    [
      adminSiteUrl,
      activeForm,
      commentPolicyDirty,
      commentPolicyDraft,
      commentRequestId,
      commentSearch,
      commentStatus,
      commentTargetId,
      commentTargetType,
      contactStatus,
      formData.customDomain,
      formData.name,
      formData.slug,
      formData.status,
      formBuilderDirty,
      formBuilderDraft?.fields.length,
      formBuilderDraft?.isActive,
      frontendDesignState.frontendDesign,
      domainVerification,
      hasCustomDomain,
      navigationState.navigation.footer,
      navigationState.navigation.primary,
      publicSiteApiUrl,
      publicSiteUrl,
      readiness,
      redirectState.conflicts,
      redirectState.rules.length,
      seoState.seo.defaultDescription,
      seoState.seo.jsonLd?.length,
      seoState.seo.robots,
      seoState.seo.routeOverrides,
      seoState.seo.sitemap,
      seoState.seo.titleTemplate,
      site?.customDomain,
      site?.id,
      site?.name,
      site?.slug,
      siteApiId,
      siteId,
      siteWorkspaceReadiness.checks,
      siteWorkspaceReadiness.score,
      state.commentCount,
      state.contactCount,
      state.forms.length,
      state.selectedFormId,
      state.submissionCount,
      submissionStatus,
      themeDraft,
      webhookState.enabled,
      webhookState.endpoints,
    ],
  );
  const siteWorkspaceHandoffText = useMemo(
    () => JSON.stringify(siteWorkspaceHandoff, null, 2),
    [siteWorkspaceHandoff],
  );

  const copySiteHandoffText = async (value: string, label: string) => {
    if (isSiteSettingsBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setSiteSettingsError(null);
      setSiteWorkspaceNotice(`${label} copied.`);
    } catch {
      setSiteWorkspaceNotice(null);
      setSiteSettingsError(value);
    }
  };

  const downloadSiteHandoff = () => {
    if (isSiteSettingsBusy) return;

    downloadBlob(
      `${formData.slug || site?.slug || siteId}-backy-site-workspace-handoff.json`,
      new Blob([siteWorkspaceHandoffText], {
        type: "application/json;charset=utf-8",
      }),
    );
    setSiteSettingsError(null);
    setSiteWorkspaceNotice("Site workspace handoff manifest downloaded.");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isSiteSettingsBusy) return;
    if (!canConfigureSite) {
      setSiteSettingsError(siteConfigureDeniedMessage);
      return;
    }

    setIsLoading(true);
    setSiteSettingsError(null);
    setSiteSettingsNotice(null);

    const nextSite = {
      name: formData.name,
      slug: formData.slug,
      customDomain: formData.customDomain || null,
      description: formData.description,
      status: formData.status,
    };

    try {
      const savedSite = await updateSiteFromApi(siteApiId || siteId, nextSite);
      updateSite(storeSiteId, savedSite);
      setFetchedSite(savedSite);
      if (siteApiId) {
        void loadReadiness();
      }
      void loadSiteAuditEvents();
      setSiteSettingsNotice(`${savedSite.name} settings saved.`);
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error
          ? `${error.message}. Changes were not persisted.`
          : "Backend save failed. Changes were not persisted.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isSiteSettingsBusy) return;
    if (!canDeleteSite) {
      setSiteSettingsError(siteDeleteDeniedMessage);
      setShowDeleteConfirm(false);
      return;
    }

    setIsLoading(true);
    setSiteSettingsError(null);

    try {
      await deleteSiteFromApi(siteApiId || siteId);
    } catch (error) {
      setSiteSettingsError(
        error instanceof Error ? error.message : "Unable to delete site",
      );
      setIsLoading(false);
      return;
    }

    deleteSite(storeSiteId);
    navigate({ to: "/sites" });
  };

  const openFrontendTemplateWorkspace = (
    template: SiteFrontendDesignContract["templates"][number],
  ) => {
    const targetSiteId = siteApiId || siteId;

    switch (template.type) {
      case "page":
        void navigate({
          to: "/pages/new",
          search: {
            siteId: targetSiteId,
            frontendDesignTemplateId: template.id,
          },
        });
        return;
      case "blogPost":
        void navigate({
          to: "/blog/new",
          search: {
            siteId: targetSiteId,
            frontendDesignTemplateId: template.id,
          },
        });
        return;
      case "form":
        void navigate({
          to: "/forms",
          search: { siteId: targetSiteId, frontendTemplate: template.id },
        });
        return;
      case "product":
        void navigate({
          to: "/products",
          search: { siteId: targetSiteId, frontendTemplate: template.id },
        });
        return;
      case "collection":
        void navigate({
          to: "/collections",
          search: {
            siteId: targetSiteId,
            draft: "new",
            frontendTemplate: template.id,
          },
        });
        return;
      case "section":
        void navigate({
          to: "/reusable-sections",
          search: { siteId: targetSiteId, frontendTemplate: template.id },
        });
        return;
      default:
        return;
    }
  };

  if (!site) {
    if (isSiteDetailLoading) {
      return (
        <PageShell
          title="Loading Site"
          description="Loading the site workspace from Backy."
        >
          <button
            onClick={() => navigate({ to: "/sites" })}
            className="text-primary hover:underline"
          >
            &larr; Back to Sites
          </button>
        </PageShell>
      );
    }

    return (
      <PageShell
        title="Site Not Found"
        description={
          siteDetailError || "The site you requested does not exist."
        }
      >
        <button
          onClick={() => navigate({ to: "/sites" })}
          className="text-primary hover:underline"
        >
          &larr; Back to Sites
        </button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Edit ${site.name}`}
      description="Manage site settings and connected workflow."
      action={
        <button
          type="button"
          onClick={() => {
            if (!isSiteSettingsBusy) {
              void navigate({ to: "/sites" });
            }
          }}
          disabled={isSiteSettingsBusy}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      }
      className="w-full"
    >
      <div className="w-full space-y-8">
        {permissionError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {permissionError}
          </div>
        )}
        {isPermissionMatrixPending && (
          <div className="rounded-lg border border-info/25 bg-info/10 px-4 py-3 text-sm text-info">
            Loading site permissions before enabling workspace actions.
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{site.name}</h3>
                <StatusBadge status={site.status} />
              </div>
              <a
                href={publicSiteUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={isSiteSettingsBusy}
                onClick={(event) => {
                  if (isSiteSettingsBusy) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  "text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1",
                  isSiteSettingsBusy && "pointer-events-none opacity-60",
                )}
              >
                {formData.customDomain ||
                  site.customDomain ||
                  `${formData.slug || site.slug}.backy.app`}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <a
            href={publicSiteUrl}
            target="_blank"
            rel="noreferrer"
            aria-disabled={isSiteSettingsBusy}
            onClick={(event) => {
              if (isSiteSettingsBusy) {
                event.preventDefault();
              }
            }}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 font-medium text-sm",
              isSiteSettingsBusy && "pointer-events-none opacity-60",
            )}
          >
            <ExternalLink className="w-4 h-4" />
            Visit Site
          </a>
        </div>

        <section
          className="bg-card border border-border rounded-xl p-6 shadow-sm"
          data-testid="site-workspace-command-center"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">Site command center</h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    siteWorkspaceReadiness.score >= 80
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700",
                  )}
                >
                  {siteWorkspaceReadiness.score}% ready
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Control this website as a full workspace: public readiness,
                menus, redirects, SEO, publishing, forms, leads, comments, and
                frontend contracts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void copySiteHandoffText(
                    siteWorkspaceHandoffText,
                    "Site workspace handoff manifest",
                  )
                }
                disabled={isSiteSettingsBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy handoff
              </button>
              <button
                type="button"
                onClick={downloadSiteHandoff}
                disabled={isSiteSettingsBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download JSON
              </button>
              <a
                href="#site-settings"
                aria-disabled={isSiteSettingsBusy}
                onClick={(event) => {
                  if (isSiteSettingsBusy) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent",
                  isSiteSettingsBusy && "pointer-events-none opacity-60",
                )}
              >
                <Save className="h-4 w-4" />
                Site settings
              </a>
              <a
                href={publicSiteUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={isSiteSettingsBusy}
                onClick={(event) => {
                  if (isSiteSettingsBusy) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
                  isSiteSettingsBusy && "pointer-events-none opacity-60",
                )}
              >
                <ExternalLink className="h-4 w-4" />
                Open public site
              </a>
            </div>
          </div>

          {siteWorkspaceNotice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {siteWorkspaceNotice}
            </div>
          )}

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Workspace operating state
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Checks whether the pieces this site needs for managed
                    hosting and custom frontend delivery are present.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {formData.status}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    siteWorkspaceReadiness.score >= 80
                      ? "bg-emerald-500"
                      : "bg-amber-500",
                  )}
                  style={{ width: `${siteWorkspaceReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {siteWorkspaceReadiness.checks.map((check) => (
                  <SiteWorkspaceCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Site workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {siteWorkspaceReadiness.workflow.map((step, index) => (
                  <SiteWorkflowStep
                    key={step.label}
                    index={index + 1}
                    {...step}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Workspace control map</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Jump to the exact controls that define this site’s frontend
                  behavior and backend operations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadReadiness()}
                disabled={!siteApiId || readinessLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-4 w-4", readinessLoading && "animate-spin")}
                />
                Refresh readiness
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
              {SITE_WORKSPACE_AREAS.map((area) => (
                <a
                  key={area.title}
                  href={area.href}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {area.title}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {area.detail}
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div
            id="site-handoff"
            className="mt-4 rounded-lg border border-border bg-background p-4 scroll-mt-24"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Frontend handoff</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Site-scoped admin and public endpoints plus navigation,
                  redirect, SEO, readiness, and automation context.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copySiteHandoffText(adminSiteUrl, "Site admin API URL")
                  }
                  disabled={isSiteSettingsBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy API URL
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copySiteHandoffText(
                      siteWorkspaceHandoffText,
                      "Site workspace handoff manifest",
                    )
                  }
                  disabled={isSiteSettingsBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy handoff
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <SiteHandoffEndpoint label="Admin site" value={adminSiteUrl} />
              <SiteHandoffEndpoint
                label="Public render"
                value={`${publicSiteApiUrl}/render?path=/`}
              />
              <SiteHandoffEndpoint
                label="Navigation"
                value={`${adminSiteUrl}/navigation`}
              />
              <SiteHandoffEndpoint
                label="OpenAPI"
                value={`${publicSiteApiUrl}/openapi`}
              />
            </div>
          </div>
        </section>

        {domainVerification && (
          <section
            id="site-domain"
            className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
            data-testid="site-domain-verification-panel"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Domain verification</h2>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      domainVerificationStatusClass[domainVerification.status],
                    )}
                  >
                    {domainVerificationStatusLabel[domainVerification.status]}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Prepare the DNS ownership record for the saved custom domain
                  and mark it verified after TXT/CNAME records are visible.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copySiteHandoffText(
                      domainVerification.txtValue || "",
                      "Domain TXT value",
                    )
                  }
                  disabled={isSiteSettingsBusy}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy TXT value
                </button>
                <button
                  type="button"
                  onClick={() => void handleDomainVerificationChange("pending")}
                  disabled={domainActionDisabled}
                  title={domainActionTitle}
                  aria-label={`Prepare domain verification for ${site.name}`}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", isLoading && "animate-spin")}
                  />
                  Prepare DNS record
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleDomainVerificationChange("verified")
                  }
                  disabled={domainActionDisabled}
                  title={domainActionTitle}
                  aria-label={`Mark domain verification verified for ${site.name}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark verified
                </button>
              </div>
            </div>

            {!hasCustomDomain ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Save a custom domain in Site settings before preparing DNS
                verification.
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SiteDomainVerificationValue
                label="Domain"
                value={domainVerification.domain || savedCustomDomain}
              />
              <SiteDomainVerificationValue
                label="TXT host"
                value={domainVerification.txtHost || ""}
              />
              <SiteDomainVerificationValue
                label="TXT value"
                value={domainVerification.txtValue || ""}
              />
              <SiteDomainVerificationValue
                label="CNAME target"
                value={domainVerification.cnameTarget || ""}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SiteDomainVerificationValue
                label="Token"
                value={domainVerification.token || ""}
              />
              <SiteDomainVerificationValue
                label="Requested"
                value={formatTime(domainVerification.requestedAt || undefined)}
              />
              <SiteDomainVerificationValue
                label="Last checked"
                value={formatTime(domainVerification.checkedAt || undefined)}
              />
              <SiteDomainVerificationValue
                label="Verified"
                value={formatTime(domainVerification.verifiedAt || undefined)}
              />
            </div>

            {domainVerification.lastError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {domainVerification.lastError}
              </div>
            ) : null}
          </section>
        )}

        <section
          id="site-theme-publish"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-theme-publish-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">
                  Theme and publish settings
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    formData.status === "published"
                      ? "bg-emerald-50 text-emerald-700"
                      : formData.status === "archived"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-50 text-amber-700",
                  )}
                >
                  {formData.status}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Site-level brand tokens and delivery state used by hosted pages,
                render payloads, readiness checks, and custom frontend handoff.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setThemeDraft(normalizeSiteThemeDraft(site.theme))
                }
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset theme
              </button>
              <button
                type="button"
                onClick={() => void saveThemePublishSettings()}
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isLoading ? "Saving..." : "Save theme & publish"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Publish state</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Draft keeps the site private, published opens public
                      delivery, archived removes it from active workspaces.
                    </p>
                  </div>
                  <select
                    value={formData.status}
                    disabled={isSiteConfigurationDisabled}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        status: event.target.value as SiteStatusFilter,
                      })
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Site publish state"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Brand colors</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {SITE_THEME_COLOR_CONTROLS.map((control) => (
                    <label key={control.key} className="space-y-1 text-sm">
                      <span className="font-medium">{control.label}</span>
                      <span className="flex items-center gap-2">
                        <input
                          type="color"
                          value={themeDraft.colors[control.key]}
                          onChange={(event) =>
                            patchThemeColor(control.key, event.target.value)
                          }
                          disabled={isSiteConfigurationDisabled}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="h-10 w-12 rounded-md border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Theme ${control.label.toLowerCase()} color swatch`}
                        />
                        <input
                          value={themeDraft.colors[control.key]}
                          onChange={(event) =>
                            patchThemeColor(control.key, event.target.value)
                          }
                          disabled={isSiteConfigurationDisabled}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Theme ${control.label.toLowerCase()} color`}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">
                  Typography and spacing
                </h3>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {SITE_THEME_FONT_CONTROLS.map((control) => (
                    <label key={control.key} className="space-y-1 text-sm">
                      <span className="font-medium">{control.label}</span>
                      <input
                        value={themeDraft.fonts[control.key]}
                        onChange={(event) =>
                          patchThemeFont(control.key, event.target.value)
                        }
                        disabled={isSiteConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Theme ${control.label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Spacing unit</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={themeDraft.spacing.unit}
                      onChange={(event) =>
                        patchThemeSpacing("unit", Number(event.target.value))
                      }
                      disabled={isSiteConfigurationDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Theme spacing unit"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Spacing scale</span>
                    <input
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={themeDraft.spacing.scale}
                      onChange={(event) =>
                        patchThemeSpacing("scale", Number(event.target.value))
                      }
                      disabled={isSiteConfigurationDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Theme spacing scale"
                    />
                  </label>
                </div>
              </div>

              <label className="block rounded-lg border border-border bg-background p-4 text-sm">
                <span className="font-semibold">Custom CSS</span>
                <textarea
                  value={themeDraft.customCSS}
                  onChange={(event) => {
                    if (!canConfigureSite) return;
                    setThemeDraft((current) => ({
                      ...current,
                      customCSS: event.target.value,
                    }));
                    setSiteWorkspaceNotice(null);
                  }}
                  disabled={isSiteConfigurationDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={6}
                  spellCheck={false}
                  className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder=":root { --brand-radius: 12px; }"
                  aria-label="Theme custom CSS"
                />
              </label>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Public token preview</h3>
              <div
                className="mt-3 rounded-lg border p-4"
                style={{
                  backgroundColor: themeDraft.colors.background,
                  color: themeDraft.colors.text,
                  borderColor: themeDraft.colors.surface,
                  fontFamily: themeDraft.fonts.body,
                }}
              >
                <div
                  className="rounded-md px-3 py-2"
                  style={{ backgroundColor: themeDraft.colors.surface }}
                >
                  <div
                    style={{ fontFamily: themeDraft.fonts.heading }}
                    className="text-lg font-semibold"
                  >
                    {formData.name || site.name}
                  </div>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: themeDraft.colors.textMuted }}
                  >
                    Render payloads receive these tokens for custom frontend
                    theming.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: themeDraft.colors.primary }}
                    >
                      Primary action
                    </span>
                    <span
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: themeDraft.colors.secondary }}
                    >
                      Secondary
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <SiteDomainVerificationValue
                    label="Spacing unit"
                    value={`${themeDraft.spacing.unit}px`}
                  />
                  <SiteDomainVerificationValue
                    label="Spacing scale"
                    value={`${themeDraft.spacing.scale}x`}
                  />
                  <SiteDomainVerificationValue
                    label="Heading"
                    value={themeDraft.fonts.heading}
                  />
                  <SiteDomainVerificationValue
                    label="Body"
                    value={themeDraft.fonts.body}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="site-webhooks"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-webhooks-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Webhooks</h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    webhookState.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {webhookState.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Configure site-level integration endpoints for forms, contacts,
                commerce, and comments without exposing signing secrets in the
                UI.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addWebhookEndpoint}
                disabled={isWebhookConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add endpoint
              </button>
              <button
                type="button"
                onClick={() => void saveSiteWebhooks()}
                disabled={isWebhookConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {webhookState.saving ? "Saving..." : "Save webhooks"}
              </button>
            </div>
          </div>

          {webhookState.errorMessage ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {webhookState.errorMessage}
            </div>
          ) : null}
          {webhookState.notice ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {webhookState.notice}
            </div>
          ) : null}

          <div className="mt-5 rounded-lg border border-border bg-background p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={webhookState.enabled}
                onChange={(event) => {
                  if (!canConfigureSite) return;
                  setWebhookState((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                    notice: null,
                  }));
                  setSiteWorkspaceNotice(null);
                }}
                disabled={isWebhookConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="mt-1 h-4 w-4 rounded border-border"
                aria-label="Enable site webhooks"
              />
              <span>
                <span className="font-semibold">Enable webhook delivery</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Backy stores endpoint URLs, event allowlists, header
                  templates, and secret references. Secret values stay in the
                  deployment environment.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4 space-y-4">
            {webhookState.loading ? (
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                Loading webhooks...
              </div>
            ) : webhookState.endpoints.length === 0 ? (
              <EmptyState
                icon={Send}
                title="No webhook endpoints configured"
                description="Add an endpoint to deliver site lifecycle, navigation, SEO, and form events to downstream systems."
              />
            ) : (
              webhookState.endpoints.map((endpoint, index) => (
                <div
                  key={endpoint.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Endpoint {index + 1}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Subscribe this endpoint to the exact site events a
                        downstream integration expects.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={endpoint.enabled}
                          onChange={(event) =>
                            patchWebhookEndpoint(endpoint.id, {
                              enabled: event.target.checked,
                            })
                          }
                          disabled={isWebhookConfigurationDisabled}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="h-4 w-4 rounded border-border"
                          aria-label="Enable site webhook endpoint"
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() => removeWebhookEndpoint(endpoint.id)}
                        disabled={isWebhookConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Name</span>
                      <input
                        value={endpoint.name}
                        onChange={(event) =>
                          patchWebhookEndpoint(endpoint.id, {
                            name: event.target.value,
                          })
                        }
                        disabled={isWebhookConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Site webhook endpoint name"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Endpoint URL</span>
                      <input
                        value={endpoint.url}
                        onChange={(event) =>
                          patchWebhookEndpoint(endpoint.id, {
                            url: event.target.value,
                          })
                        }
                        disabled={isWebhookConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="https://hooks.example.com/backy"
                        aria-label="Site webhook endpoint URL"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">
                        Signing secret reference
                      </span>
                      <input
                        value={endpoint.secretId}
                        onChange={(event) =>
                          patchWebhookEndpoint(endpoint.id, {
                            secretId: event.target.value,
                          })
                        }
                        disabled={isWebhookConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="env:BACKY_WEBHOOK_SECRET"
                        aria-label="Site webhook signing secret reference"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Headers JSON</span>
                      <textarea
                        value={endpoint.headersText}
                        onChange={(event) =>
                          patchWebhookEndpoint(endpoint.id, {
                            headersText: event.target.value,
                          })
                        }
                        disabled={isWebhookConfigurationDisabled}
                        title={
                          canConfigureSite
                            ? undefined
                            : configureSitePermissionTitle
                        }
                        rows={3}
                        spellCheck={false}
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Site webhook headers JSON"
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-medium">Events</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {SITE_WEBHOOK_EVENT_OPTIONS.map((eventOption) => (
                        <label
                          key={eventOption.value}
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={endpoint.eventKinds.includes(
                              eventOption.value,
                            )}
                            onChange={(event) =>
                              toggleWebhookEvent(
                                endpoint.id,
                                eventOption.value,
                                event.target.checked,
                              )
                            }
                            disabled={isWebhookConfigurationDisabled}
                            title={
                              canConfigureSite
                                ? undefined
                                : configureSitePermissionTitle
                            }
                            className="h-4 w-4 rounded border-border"
                            aria-label={`Site webhook event ${eventOption.value}`}
                          />
                          <span>{eventOption.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section
          id="site-readiness"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-readiness-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Publish readiness</h2>
                <span
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-semibold",
                    readinessStatusClass(readiness?.statusLabel),
                  )}
                >
                  {readinessLoading
                    ? "Checking..."
                    : readinessStatusLabel(readiness?.statusLabel)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Backend validation for public delivery, custom frontends, and
                editor-created pages.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadReadiness()}
              disabled={!siteApiId || readinessLoading}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", readinessLoading && "animate-spin")}
              />
              Refresh
            </button>
          </div>

          {readinessError ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {readinessError}
            </div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-9">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Score
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readiness ? `${readiness.score}%` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Errors
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-red-600">
                    {readinessSummary?.errors ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Warnings
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
                    {readinessSummary?.warnings ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Pages
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.pages ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Posts
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.posts ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Published
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.publishedPages ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Media
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.media ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Collections
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.collections ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Sections
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {readinessSummary?.reusableSections ?? "—"}
                  </div>
                </div>
              </div>

              {readinessFindings.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {readinessFindings.map((check) => (
                    <div
                      key={check.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2 text-sm",
                        check.severity === "error"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : check.severity === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-slate-200 bg-slate-50 text-slate-700",
                      )}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold">{check.label}</div>
                        <div className="text-xs opacity-90">
                          {check.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : readiness ? (
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  No readiness blockers or warnings.
                </div>
              ) : null}

              {readinessContentItems.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-lg border border-border">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[minmax(0,1fr)_80px_120px_110px_90px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      <span>Content</span>
                      <span>Type</span>
                      <span>Status</span>
                      <span>Canvas</span>
                      <span>Score</span>
                    </div>
                    <div className="divide-y divide-border">
                      {readinessContentItems.slice(0, 10).map((item) => (
                        <div
                          key={`${item.type}:${item.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_80px_120px_110px_90px] items-center gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {item.title}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {item.path}
                            </div>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.type}
                          </span>
                          <StatusBadge status={item.status} />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {item.contentMetric}
                          </span>
                          <span
                            className={cn(
                              "rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                              item.statusLabel === "ready"
                                ? "bg-emerald-100 text-emerald-700"
                                : item.statusLabel === "blocked"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {item.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section
          id="site-navigation"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-navigation-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Menu className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Site navigation</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Primary and footer menus used by hosted pages, custom frontends,
                manifest discovery, and render payloads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadNavigationEditor()}
                disabled={
                  !siteApiId ||
                  navigationState.loading ||
                  navigationState.saving
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    navigationState.loading && "animate-spin",
                  )}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleSaveNavigation()}
                disabled={
                  !siteApiId ||
                  !canConfigureSite ||
                  navigationState.loading ||
                  navigationState.saving
                }
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {navigationState.saving ? "Saving..." : "Save navigation"}
              </button>
            </div>
          </div>

          {navigationState.errorMessage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {navigationState.errorMessage}
            </div>
          )}
          {navigationState.notice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {navigationState.notice}
            </div>
          )}

          <div className="mt-5">
            <NavigationLayoutEditor
              layout={normalizeNavigationLayoutState(
                navigationState.navigation.layout,
              )}
              loading={navigationState.loading || !canConfigureSite}
              onUpdate={updateNavigationLayout}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <NavigationMenuEditor
              title="Primary menu"
              description="Header navigation and the default menu for generated/custom frontends."
              menu="primary"
              items={navigationState.navigation.primary}
              pages={navigationState.pages}
              loading={navigationState.loading || !canConfigureSite}
              onAddItem={handleAddNavigationItem}
              onAddChild={handleAddNavigationChild}
              onUpdateItem={handleUpdateNavigationItem}
              onRemoveItem={handleRemoveNavigationItem}
              onMoveItem={handleMoveNavigationItem}
              onDropItem={handleDropNavigationItem}
            />
            <NavigationMenuEditor
              title="Footer menu"
              description="Secondary links for policies, support, and lower-priority routes."
              menu="footer"
              items={navigationState.navigation.footer || []}
              pages={navigationState.pages}
              loading={navigationState.loading || !canConfigureSite}
              onAddItem={handleAddNavigationItem}
              onAddChild={handleAddNavigationChild}
              onUpdateItem={handleUpdateNavigationItem}
              onRemoveItem={handleRemoveNavigationItem}
              onMoveItem={handleMoveNavigationItem}
              onDropItem={handleDropNavigationItem}
            />
          </div>
        </section>

        <section
          id="site-frontend-design"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-frontend-design-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">
                  Frontend design contract
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Preserve custom frontend tokens, header/navigation/footer
                chrome, templates, and editable bindings for new Backy pages,
                posts, forms, and products.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadFrontendDesignEditor()}
                disabled={
                  !siteApiId ||
                  frontendDesignState.loading ||
                  frontendDesignState.saving ||
                  frontendDesignState.capturing
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    frontendDesignState.loading && "animate-spin",
                  )}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleCaptureFrontendDesignDefaults()}
                disabled={
                  !siteApiId ||
                  !canConfigureSite ||
                  frontendDesignState.loading ||
                  frontendDesignState.saving ||
                  frontendDesignState.capturing
                }
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {frontendDesignState.capturing
                  ? "Capturing..."
                  : "Capture current design"}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveFrontendDesign()}
                disabled={
                  !siteApiId ||
                  !canConfigureSite ||
                  frontendDesignState.loading ||
                  frontendDesignState.saving ||
                  frontendDesignState.capturing
                }
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {frontendDesignState.saving ? "Saving..." : "Save contract"}
              </button>
            </div>
          </div>

          {frontendDesignState.errorMessage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {frontendDesignState.errorMessage}
            </div>
          )}
          {frontendDesignState.notice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {frontendDesignState.notice}
            </div>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              {
                label: "Status",
                value: frontendDesignState.frontendDesign.status,
              },
              {
                label: "Source",
                value: frontendDesignState.frontendDesign.source.type,
              },
              {
                label: "Templates",
                value:
                  frontendDesignState.frontendDesign.templates.length.toString(),
              },
              {
                label: "Editable bindings",
                value:
                  frontendDesignState.frontendDesign.editableMap.length.toString(),
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border bg-muted/30 px-3 py-2"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-1 truncate text-sm font-semibold">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-5 rounded-lg border bg-muted/20 p-4"
            data-testid="site-template-registry-summary"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Template registry</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clone-ready page, blog, form, product, collection, and
                  section templates from this design contract.
                </p>
              </div>
              <code className="break-all rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
                {frontendDesignState.endpoints.templates ||
                  `/api/admin/sites/${siteApiId || ":siteId"}/templates`}
              </code>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Schema
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {frontendDesignState.templateRegistry?.schemaVersion ||
                    "backy.template-registry.v1"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Clone field
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {frontendDesignState.templateRegistry?.cloneField ||
                    "frontendDesignTemplateId"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Clone targets
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {Object.keys(
                    frontendDesignState.templateRegistry?.cloneTargets || {},
                  ).length || 6}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                frontendDesignState.templateRegistry?.supportedTypes || [
                  "page",
                  "blogPost",
                  "form",
                  "product",
                  "collection",
                  "section",
                ]
              ).map((type) => (
                <span
                  key={type}
                  className="rounded-full border bg-background px-2 py-1 text-xs font-medium"
                >
                  {type}
                </span>
              ))}
            </div>
            <div
              className="mt-4 space-y-2"
              data-testid="site-template-registry-template-list"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Captured templates
              </div>
              {frontendDesignState.frontendDesign.templates.length > 0 ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {frontendDesignState.frontendDesign.templates
                    .slice(0, 8)
                    .map((template) => {
                      const cloneTarget = frontendTemplateCloneTarget(
                        template.type,
                        frontendDesignState.templateRegistry?.cloneTargets,
                      );
                      const workspaceAction =
                        FRONTEND_TEMPLATE_WORKSPACE_ACTIONS[template.type];
                      return (
                        <div
                          key={`${template.type}:${template.id}`}
                          className="rounded-lg border bg-background px-3 py-2"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                  {FRONTEND_TEMPLATE_TYPE_LABELS[template.type]}
                                </span>
                                <span className="min-w-0 truncate text-sm font-semibold">
                                  {template.name}
                                </span>
                              </div>
                              <div className="mt-1 break-all text-xs text-muted-foreground">
                                {cloneTarget || "Clone target available after refresh"}
                              </div>
                              {template.routePattern && (
                                <div className="mt-1 break-all text-xs text-muted-foreground">
                                  {template.routePattern}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => openFrontendTemplateWorkspace(template)}
                              title={workspaceAction.title}
                              aria-label={`${workspaceAction.label} from ${template.name}`}
                              data-testid={`site-template-registry-action-${template.type}-${template.id}`}
                              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                            >
                              <ExternalLink className="size-3.5" />
                              {workspaceAction.label}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <EmptyState
                  icon={LayoutTemplate}
                  title="No frontend templates captured yet"
                  description="Save a frontend design contract with page, blog, form, product, collection, or section templates to populate this registry."
                />
              )}
              {frontendDesignState.frontendDesign.templates.length > 8 && (
                <div className="text-xs text-muted-foreground">
                  +{frontendDesignState.frontendDesign.templates.length - 8} more
                  templates in the registry endpoint.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    value={frontendDesignState.frontendDesign.status}
                    onChange={(event) =>
                      patchFrontendDesign({
                        status: event.target
                          .value as SiteFrontendDesignContract["status"],
                      })
                    }
                    disabled={frontendDesignState.loading || !canConfigureSite}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="unconfigured">Unconfigured</option>
                    <option value="captured">Captured</option>
                    <option value="synced">Synced</option>
                    <option value="stale">Stale</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Source type</span>
                  <select
                    value={frontendDesignState.frontendDesign.source.type}
                    onChange={(event) =>
                      patchFrontendDesignSource({
                        type: event.target
                          .value as SiteFrontendDesignContract["source"]["type"],
                      })
                    }
                    disabled={frontendDesignState.loading || !canConfigureSite}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="manual">Manual import</option>
                    <option value="managed-site">Backy managed site</option>
                    <option value="custom-frontend">Custom frontend</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Source label</span>
                <input
                  value={frontendDesignState.frontendDesign.source.label || ""}
                  onChange={(event) =>
                    patchFrontendDesignSource({ label: event.target.value })
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  placeholder="Marketing frontend, storefront, portfolio..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Frontend URL</span>
                  <input
                    value={frontendDesignState.frontendDesign.source.url || ""}
                    onChange={(event) =>
                      patchFrontendDesignSource({ url: event.target.value })
                    }
                    disabled={frontendDesignState.loading || !canConfigureSite}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    placeholder="https://example.com"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Branch</span>
                  <input
                    value={
                      frontendDesignState.frontendDesign.source.branch || ""
                    }
                    onChange={(event) =>
                      patchFrontendDesignSource({ branch: event.target.value })
                    }
                    disabled={frontendDesignState.loading || !canConfigureSite}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    placeholder="main"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Repository</span>
                <input
                  value={
                    frontendDesignState.frontendDesign.source.repository || ""
                  }
                  onChange={(event) =>
                    patchFrontendDesignSource({
                      repository: event.target.value,
                    })
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  placeholder="owner/frontend"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Notes</span>
                <textarea
                  value={frontendDesignState.frontendDesign.notes || ""}
                  onChange={(event) =>
                    patchFrontendDesign({ notes: event.target.value })
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={4}
                  placeholder="Extraction notes, manual setup decisions, unsupported components..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Tokens JSON</span>
                <textarea
                  value={frontendDesignState.tokensJson}
                  onChange={(event) =>
                    setFrontendDesignState((prev) => ({
                      ...prev,
                      tokensJson: event.target.value,
                      notice: null,
                      errorMessage: null,
                    }))
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={9}
                  spellCheck={false}
                  className="min-h-[220px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Chrome JSON</span>
                <textarea
                  value={frontendDesignState.chromeJson}
                  onChange={(event) =>
                    setFrontendDesignState((prev) => ({
                      ...prev,
                      chromeJson: event.target.value,
                      notice: null,
                      errorMessage: null,
                    }))
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={9}
                  spellCheck={false}
                  className="min-h-[220px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Templates JSON</span>
                <textarea
                  value={frontendDesignState.templatesJson}
                  onChange={(event) =>
                    setFrontendDesignState((prev) => ({
                      ...prev,
                      templatesJson: event.target.value,
                      notice: null,
                      errorMessage: null,
                    }))
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={9}
                  spellCheck={false}
                  className="min-h-[220px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Editable map JSON</span>
                <textarea
                  value={frontendDesignState.editableMapJson}
                  onChange={(event) =>
                    setFrontendDesignState((prev) => ({
                      ...prev,
                      editableMapJson: event.target.value,
                      notice: null,
                      errorMessage: null,
                    }))
                  }
                  disabled={frontendDesignState.loading || !canConfigureSite}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={9}
                  spellCheck={false}
                  className="min-h-[220px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
          </div>
        </section>

        <section
          id="site-redirects"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-redirects-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">
                  Redirects and retired routes
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage exact route redirects and 410 gone rules used by hosted
                pages, route resolution, manifest/OpenAPI, and SDK clients.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadRedirectEditor()}
                disabled={
                  !siteApiId ||
                  !canViewSite ||
                  redirectState.loading ||
                  redirectState.saving ||
                  redirectState.previewing
                }
                title={canViewSite ? undefined : viewSitePermissionTitle}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    redirectState.loading && "animate-spin",
                  )}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleAddRedirectRule}
                disabled={areRedirectEditsDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add rule
              </button>
              <button
                type="button"
                onClick={() => void handlePreviewRedirects()}
                disabled={!siteApiId || areRedirectEditsDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                {redirectState.previewing
                  ? "Previewing..."
                  : "Preview conflicts"}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveRedirects()}
                disabled={!siteApiId || areRedirectEditsDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {redirectState.saving ? "Saving..." : "Save redirects"}
              </button>
            </div>
          </div>

          {redirectState.errorMessage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {redirectState.errorMessage}
            </div>
          )}
          {redirectState.notice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {redirectState.notice}
            </div>
          )}
          {redirectState.conflicts.length > 0 && (
            <div
              className="mt-4 space-y-2"
              data-testid="site-redirect-conflicts"
            >
              {redirectState.conflicts.map((conflict) => (
                <div
                  key={`${conflict.kind}-${conflict.index}-${conflict.ruleId || conflict.from}`}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold">
                        Rule {conflict.index + 1}:{" "}
                        {conflict.kind === "source-route-conflict"
                          ? "Source shadows an existing route"
                          : "Destination does not resolve"}
                      </div>
                      <div className="mt-1 text-xs leading-5">
                        {conflict.message}
                      </div>
                      {conflict.route && (
                        <div className="mt-1 text-xs opacity-80">
                          Existing route: {conflict.route.type} ·{" "}
                          {conflict.route.title} · {conflict.route.path}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <div className="grid min-w-[860px] grid-cols-[minmax(140px,1fr)_minmax(160px,1.2fr)_120px_90px_52px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Source</span>
              <span>Destination</span>
              <span>Status</span>
              <span>Enabled</span>
              <span />
            </div>
            <div className="overflow-x-auto">
              {redirectState.loading ? (
                <div className="min-w-[860px] px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading redirect rules...
                </div>
              ) : redirectState.rules.length === 0 ? (
                <div className="min-w-[860px] p-4">
                  <EmptyState
                    icon={CornerDownRight}
                    title="No redirect or 410 rules configured"
                    description="Add a redirect rule to preserve old URLs, point traffic to new content, or mark retired paths as gone."
                  />
                </div>
              ) : (
                <div className="min-w-[860px] divide-y divide-border">
                  {redirectState.rules.map((rule, index) => {
                    const ruleId = rule.id || rule.from || `redirect-${index}`;
                    const isGone = rule.statusCode === 410;

                    return (
                      <div
                        key={ruleId}
                        className="grid grid-cols-[minmax(140px,1fr)_minmax(160px,1.2fr)_120px_90px_52px] items-center gap-3 px-3 py-3"
                      >
                        <input
                          value={rule.from || ""}
                          onChange={(event) =>
                            handleUpdateRedirectRule(ruleId, {
                              from: event.target.value,
                            })
                          }
                          disabled={!canConfigureSite}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          placeholder="/old-path"
                        />
                        <input
                          value={isGone ? "" : rule.to || ""}
                          onChange={(event) =>
                            handleUpdateRedirectRule(ruleId, {
                              to: event.target.value,
                            })
                          }
                          disabled={isGone || !canConfigureSite}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          placeholder={
                            isGone
                              ? "Not needed for 410"
                              : "/new-path or https://..."
                          }
                        />
                        <select
                          value={rule.statusCode || 302}
                          onChange={(event) =>
                            handleUpdateRedirectRule(ruleId, {
                              statusCode: Number(
                                event.target.value,
                              ) as SiteRedirectRule["statusCode"],
                            })
                          }
                          disabled={!canConfigureSite}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                        >
                          <option value={301}>301 permanent</option>
                          <option value={302}>302 temporary</option>
                          <option value={307}>307 temporary</option>
                          <option value={308}>308 permanent</option>
                          <option value={410}>410 gone</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRedirectRule(ruleId, {
                              enabled: rule.enabled === false ? true : false,
                            })
                          }
                          disabled={!canConfigureSite}
                          title={
                            canConfigureSite
                              ? undefined
                              : configureSitePermissionTitle
                          }
                          className={cn(
                            "inline-flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60",
                            rule.enabled === false
                              ? "text-muted-foreground hover:bg-accent"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {rule.enabled === false ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          {rule.enabled === false ? "Off" : "On"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRedirectRule(ruleId)}
                          disabled={!canConfigureSite}
                          className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                          title={
                            canConfigureSite
                              ? "Remove redirect rule"
                              : configureSitePermissionTitle
                          }
                          aria-label="Remove redirect rule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="site-seo"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-seo-panel"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">SEO defaults</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Site-wide title, description, Open Graph image, structured data,
                and crawler defaults for hosted pages and custom frontend SEO
                discovery.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadSeoEditor()}
                disabled={
                  !siteApiId ||
                  !canViewSite ||
                  seoState.loading ||
                  seoState.saving
                }
                title={canViewSite ? undefined : viewSitePermissionTitle}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-4 w-4", seoState.loading && "animate-spin")}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSeo()}
                disabled={!siteApiId || areSeoEditsDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {seoState.saving ? "Saving..." : "Save SEO"}
              </button>
            </div>
          </div>

          {seoState.errorMessage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {seoState.errorMessage}
            </div>
          )}
          {seoState.notice && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {seoState.notice}
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Title template
                </label>
                <input
                  value={seoState.seo.titleTemplate || ""}
                  onChange={(event) =>
                    handleUpdateSeo({ titleTemplate: event.target.value })
                  }
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="%s | {siteName}"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use %s or {"{title}"} for the page title and {"{siteName}"}{" "}
                  for the site name.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default description
                </label>
                <textarea
                  value={seoState.seo.defaultDescription || ""}
                  onChange={(event) =>
                    handleUpdateSeo({ defaultDescription: event.target.value })
                  }
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Used when a page, post, or dynamic record does not provide its own description."
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Open Graph image
                </label>
                <input
                  value={seoState.seo.defaultOgImage || ""}
                  onChange={(event) =>
                    handleUpdateSeo({ defaultOgImage: event.target.value })
                  }
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="/uploads/sites/site-id/social-card.jpg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Favicon URL
                </label>
                <input
                  value={seoState.seo.favicon || ""}
                  onChange={(event) =>
                    handleUpdateSeo({ favicon: event.target.value })
                  }
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="/favicon.ico"
                />
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <div className="text-sm font-semibold">Sitemap</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={seoState.seo.sitemap?.enabled !== false}
                      onChange={(event) =>
                        handleUpdateSeo({
                          sitemap: {
                            ...seoState.seo.sitemap,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      disabled={areSeoEditsDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                    />
                    Emit sitemap routes
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        seoState.seo.sitemap?.includeDynamicRoutes !== false
                      }
                      onChange={(event) =>
                        handleUpdateSeo({
                          sitemap: {
                            ...seoState.seo.sitemap,
                            includeDynamicRoutes: event.target.checked,
                          },
                        })
                      }
                      disabled={areSeoEditsDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                    />
                    Include dynamic routes
                  </label>
                  <select
                    value={
                      seoState.seo.sitemap?.defaultChangeFrequency || "weekly"
                    }
                    onChange={(event) =>
                      handleUpdateSeo({
                        sitemap: {
                          ...seoState.seo.sitemap,
                          defaultChangeFrequency: event.target
                            .value as NonNullable<
                            AdminSiteSeoSettings["sitemap"]
                          >["defaultChangeFrequency"],
                        },
                      })
                    }
                    disabled={areSeoEditsDisabled}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={seoState.seo.sitemap?.defaultPriority ?? 0.7}
                    onChange={(event) =>
                      handleUpdateSeo({
                        sitemap: {
                          ...seoState.seo.sitemap,
                          defaultPriority: Number(event.target.value),
                        },
                      })
                    }
                    disabled={areSeoEditsDisabled}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    aria-label="Default sitemap priority"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <div className="text-sm font-semibold">Robots</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={seoState.seo.robots?.index !== false}
                      onChange={(event) =>
                        handleUpdateSeo({
                          robots: {
                            ...seoState.seo.robots,
                            index: event.target.checked,
                          },
                        })
                      }
                      disabled={areSeoEditsDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                    />
                    Allow indexing
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={seoState.seo.robots?.follow !== false}
                      onChange={(event) =>
                        handleUpdateSeo({
                          robots: {
                            ...seoState.seo.robots,
                            follow: event.target.checked,
                          },
                        })
                      }
                      disabled={areSeoEditsDisabled}
                      title={
                        canConfigureSite
                          ? undefined
                          : configureSitePermissionTitle
                      }
                    />
                    Allow following
                  </label>
                </div>
                <textarea
                  value={seoState.seo.robots?.extraRules || ""}
                  onChange={(event) =>
                    handleUpdateSeo({
                      robots: {
                        ...seoState.seo.robots,
                        extraRules: event.target.value,
                      },
                    })
                  }
                  rows={3}
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Disallow: /private"
                />
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <label
                  className="block text-sm font-semibold"
                  htmlFor="site-json-ld"
                >
                  JSON-LD defaults
                </label>
                <textarea
                  id="site-json-ld"
                  value={seoState.jsonLdText}
                  onChange={(event) =>
                    handleUpdateJsonLdText(event.target.value)
                  }
                  disabled={areSeoEditsDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  rows={7}
                  className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-ring resize-y disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder='[{"@context":"https://schema.org","@type":"Organization","name":"Example"}]'
                />
              </div>
              <div
                className="rounded-lg border border-border bg-background px-4 py-3"
                data-testid="site-seo-route-overrides-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      Route SEO overrides
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Override exact canonical paths or route ids after site
                      defaults are applied.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddSeoRouteOverride()}
                    disabled={areSeoEditsDisabled}
                    title={
                      canConfigureSite
                        ? undefined
                        : configureSitePermissionTitle
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add route override
                  </button>
                </div>
                {(seoState.seo.routeOverrides || []).length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      icon={Link2}
                      title="No route-level SEO overrides"
                      description="Add route overrides for custom canonical paths, campaign landing pages, and dynamic collection route SEO."
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {(seoState.seo.routeOverrides || []).map(
                      (override, overrideIndex) => (
                        <div
                          key={override.id || overrideIndex}
                          className="rounded-md border border-border bg-card p-3"
                        >
                          <div className="grid gap-3 lg:grid-cols-2">
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Label
                              <input
                                value={override.label || ""}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    label: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} label`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Match
                              <input
                                value={override.match}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    match: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 font-mono text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="/pricing or page:page-id"
                                aria-label={`SEO route override ${overrideIndex + 1} match`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Title
                              <input
                                value={override.title || ""}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    title: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} title`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Canonical
                              <input
                                value={override.canonical || ""}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    canonical: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 font-mono text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="/canonical-path"
                                aria-label={`SEO route override ${overrideIndex + 1} canonical`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground lg:col-span-2">
                              Description
                              <textarea
                                value={override.description || ""}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    description: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                rows={2}
                                className="min-h-16 resize-y rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} description`}
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(160px,1fr)_110px_140px_110px_110px_auto]">
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Open Graph image
                              <input
                                value={override.ogImage || ""}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    ogImage: event.target.value,
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} Open Graph image`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Priority
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={override.priority ?? 0.7}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    priority: Number(event.target.value),
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} priority`}
                              />
                            </label>
                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                              Frequency
                              <select
                                value={override.changeFrequency || "weekly"}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    changeFrequency: event.target
                                      .value as SiteSeoRouteOverride["changeFrequency"],
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`SEO route override ${overrideIndex + 1} frequency`}
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            </label>
                            <label className="flex min-h-10 items-end gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={override.robots?.index !== false}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    robots: {
                                      ...override.robots,
                                      index: event.target.checked,
                                    },
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                aria-label={`SEO route override ${overrideIndex + 1} index`}
                              />
                              Index
                            </label>
                            <label className="flex min-h-10 items-end gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={override.robots?.follow !== false}
                                onChange={(event) =>
                                  handleUpdateSeoRouteOverride(overrideIndex, {
                                    robots: {
                                      ...override.robots,
                                      follow: event.target.checked,
                                    },
                                  })
                                }
                                disabled={areSeoEditsDisabled}
                                title={
                                  canConfigureSite
                                    ? undefined
                                    : configureSitePermissionTitle
                                }
                                aria-label={`SEO route override ${overrideIndex + 1} follow`}
                              />
                              Follow
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveSeoRouteOverride(overrideIndex)
                              }
                              disabled={areSeoEditsDisabled}
                              title={
                                canConfigureSite
                                  ? "Remove route override"
                                  : configureSitePermissionTitle
                              }
                              className="self-end rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                          <label className="mt-3 grid gap-1.5 text-xs font-semibold text-muted-foreground">
                            Keywords
                            <input
                              value={(override.keywords || []).join(", ")}
                              onChange={(event) =>
                                handleUpdateSeoRouteOverride(overrideIndex, {
                                  keywords: parseSeoKeywordsText(
                                    event.target.value,
                                  ),
                                })
                              }
                              disabled={areSeoEditsDisabled}
                              title={
                                canConfigureSite
                                  ? undefined
                                  : configureSitePermissionTitle
                              }
                              className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                              placeholder="landing, pricing, launch"
                              aria-label={`SEO route override ${overrideIndex + 1} keywords`}
                            />
                          </label>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Preview
                </div>
                <div className="mt-2 font-semibold">
                  {(seoState.seo.titleTemplate || "%s | {siteName}")
                    .replace(/%s/g, formData.name || site.name)
                    .replace(/\{title\}/g, formData.name || site.name)
                    .replace(/\{siteName\}/g, formData.name || site.name)}
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {seoState.seo.defaultDescription ||
                    formData.description ||
                    "No default description set."}
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Dynamic route previews
                  </div>
                  {seoState.preview.supportedVariables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {seoState.preview.supportedVariables.map((variable) => (
                        <span
                          key={variable}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {variable}
                        </span>
                      ))}
                    </div>
                  )}
                  {seoState.preview.routes.length > 0 ? (
                    <div
                      className="mt-3 space-y-2"
                      data-testid="site-seo-dynamic-previews"
                    >
                      {seoState.preview.routes.slice(0, 6).map((route) => (
                        <div
                          key={`${route.type}-${route.canonical}-${route.sourceTitle}`}
                          className="rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {route.type === "dynamicItem" ? "Item" : "List"}
                            </span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                              {route.canonical}
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-1 text-sm font-semibold">
                            {route.title}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {route.description ||
                              "No description after defaults."}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Create a collection with records to preview dynamic list
                      and item SEO titles.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <form
          id="site-settings"
          onSubmit={handleSubmit}
          className="space-y-6 scroll-mt-24"
        >
          {siteSettingsError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {siteSettingsError}
            </div>
          )}
          {siteSettingsNotice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {siteSettingsNotice}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
            <div>
              <label className="block text-sm font-medium mb-2">
                Site Name
              </label>
              <input
                type="text"
                value={formData.name}
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                onChange={(e) => {
                  if (isSiteConfigurationDisabled) return;

                  setFormData({ ...formData, name: e.target.value });
                }}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  disabled={isSiteConfigurationDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  onChange={(e) => {
                    if (isSiteConfigurationDisabled) return;

                    setFormData({ ...formData, slug: e.target.value });
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Custom Domain
                </label>
                <input
                  type="text"
                  value={formData.customDomain}
                  disabled={isSiteConfigurationDisabled}
                  title={
                    canConfigureSite ? undefined : configureSitePermissionTitle
                  }
                  onChange={(e) => {
                    if (isSiteConfigurationDisabled) return;

                    setFormData({ ...formData, customDomain: e.target.value });
                  }}
                  placeholder="e.g. mysite.com"
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                onChange={(e) => {
                  if (isSiteConfigurationDisabled) return;

                  setFormData({ ...formData, description: e.target.value });
                }}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Visibility
              </label>
              <select
                value={formData.status}
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                onChange={(e) => {
                  if (isSiteConfigurationDisabled) return;

                  setFormData({
                    ...formData,
                    status: e.target.value as SiteStatusFilter,
                  });
                }}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="draft">Draft (Private)</option>
                <option value="published">Published (Public)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => {
                if (!isSiteDeletionDisabled) {
                  setShowDeleteConfirm(true);
                }
              }}
              disabled={isSiteDeletionDisabled}
              title={canDeleteSite ? undefined : deleteSitePermissionTitle}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete Site
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isSiteSettingsBusy) {
                    void navigate({ to: "/sites" });
                  }
                }}
                disabled={isSiteSettingsBusy}
                className="px-6 py-2.5 rounded-lg border hover:bg-accent font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSiteConfigurationDisabled}
                title={
                  canConfigureSite ? undefined : configureSitePermissionTitle
                }
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-lg",
                  "bg-primary text-primary-foreground font-medium",
                  "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-md hover:shadow-lg",
                )}
              >
                <Save className="w-4 h-4" />
                {isLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>

        <section
          id="site-activity"
          className="bg-card border border-border rounded-xl p-6 shadow-sm scroll-mt-24"
          data-testid="site-audit-panel"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Site activity</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Audit trail for site settings, navigation, redirects, SEO,
                comment policy, and frontend contract changes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSiteAuditEvents()}
              disabled={auditState.loading || !canExportActivity}
              title={
                canExportActivity ? undefined : activityExportPermissionTitle
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", auditState.loading && "animate-spin")}
              />
              Refresh activity
            </button>
          </div>

          {auditState.errorMessage ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {auditState.errorMessage}
            </div>
          ) : null}

          {auditState.loading ? (
            <div className="mt-4 text-sm text-muted-foreground">
              Loading site audit activity...
            </div>
          ) : auditState.logs.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={History}
                title="No site audit events yet"
                description="Save navigation, redirects, SEO, frontend design, or site settings to create request-id activity for this site."
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Entity</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Request ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium">When</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Metadata
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {auditState.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-2 font-medium">{log.action}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.entity}:{log.entityId}
                      </td>
                      <td className="px-3 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {log.requestId || "none"}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.metadata && Object.keys(log.metadata).length > 0
                          ? safeText(log.metadata)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="site-automation" className="space-y-4 scroll-mt-24">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Site automation queues</h2>
              <p className="text-muted-foreground">
                Form submissions, contact capture, and comment moderation for
                this site.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  siteApiId
                    ? void refreshWorkflow(state.selectedFormId)
                    : undefined
                }
                className="px-3 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isWorkflowRefreshDisabled}
                title={
                  !canViewForms && !canViewComments
                    ? "Your account needs forms.view or comments.view to refresh site queues."
                    : undefined
                }
              >
                <RefreshCw className="w-4 h-4" />
                {state.workflowLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {!siteApiId ? (
            <p className="text-sm text-amber-600">
              No public API id is mapped for this site. Add `publicSiteId` in
              mock site to enable workflow management.
            </p>
          ) : (
            <>
              {state.errorMessage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3">
                  {state.errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Forms</h3>
                    <StatusBadge
                      status={state.forms.length ? "success" : "warning"}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {state.workflowLoading
                      ? "Loading..."
                      : `${state.forms.length} form(s) found`}
                  </p>
                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-2">
                      Active Form
                    </label>
                    <select
                      value={state.selectedFormId}
                      onChange={(e) => {
                        setState((prev) => ({
                          ...prev,
                          selectedFormId: e.target.value,
                        }));
                      }}
                      disabled={isFormViewDisabled}
                      title={
                        canViewForms ? undefined : formsViewPermissionTitle
                      }
                      className="w-full px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {state.forms.length === 0 ? (
                        <option value="">No forms available</option>
                      ) : (
                        state.forms.map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.title || form.name} ({form.id})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-xs text-muted-foreground mt-2">
                      {activeForm?.moderationMode
                        ? `Moderation mode: ${activeForm.moderationMode}`
                        : "No moderation settings"}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Auto-Share Leads
                    </span>
                    <StatusBadge
                      status={
                        activeForm?.contactShare?.enabled
                          ? "success"
                          : "neutral"
                      }
                      type={
                        activeForm?.contactShare?.enabled
                          ? "success"
                          : "neutral"
                      }
                    />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Submission Queue</h3>
                    <StatusBadge status={submissionStatus} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-sm">
                      <span className="text-muted-foreground mr-2">Status</span>
                      <select
                        value={submissionStatus}
                        onChange={(e) =>
                          setSubmissionStatus(
                            e.target.value as SubmissionStatusFilter,
                          )
                        }
                        disabled={!canViewForms}
                        title={
                          canViewForms ? undefined : formsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="spam">Spam</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Showing {state.submissions.length} /{" "}
                      {state.submissionCount}
                    </span>
                    <button
                      onClick={exportSubmissions}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!state.submissions.length || !canExportForms}
                      title={
                        canExportForms ? undefined : formsExportPermissionTitle
                      }
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Contact Share Queue</h3>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3">
                    <label className="text-sm text-muted-foreground">
                      <span>Status</span>
                      <select
                        value={contactStatus}
                        onChange={(e) =>
                          setContactStatus(
                            e.target.value as ContactStatusFilter,
                          )
                        }
                        disabled={!canViewForms}
                        title={
                          canViewForms ? undefined : formsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="all">All</option>
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {state.contactCount} leads
                    </span>
                    <button
                      onClick={exportContacts}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!state.contacts.length || !canExportForms}
                      title={
                        canExportForms ? undefined : formsExportPermissionTitle
                      }
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>

              <section
                className="bg-card border border-border rounded-xl p-4 shadow-sm"
                data-testid="site-form-builder-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Site form builder</h3>
                      {formBuilderDirty ? (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Unsaved
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                      Create and maintain standalone form contracts for this
                      site without leaving the workspace. Canvas-owned page
                      forms should still be edited from their source canvas.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void createSiteDetailForm()}
                      disabled={isFormBuilderBusy || !canCreateForms}
                      title={
                        canCreateForms ? undefined : formsCreatePermissionTitle
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      {formBuilderCreating ? "Creating..." : "New form"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        activeForm &&
                        setFormBuilderDraft(cloneSiteFormDefinition(activeForm))
                      }
                      disabled={isFormBuilderBusy || !formBuilderDirty}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveFormBuilderDraft()}
                      disabled={
                        isFormBuilderDisabled ||
                        !formBuilderDraft ||
                        !formBuilderDirty
                      }
                      title={
                        canEditForms ? undefined : formsEditPermissionTitle
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {formBuilderSaving ? "Saving..." : "Save form"}
                    </button>
                  </div>
                </div>

                {formBuilderNotice ? (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {formBuilderNotice}
                  </div>
                ) : null}

                {!formBuilderDraft ? (
                  <div className="mt-4">
                    <EmptyState
                      icon={Users}
                      title="No form selected"
                      description="Create a standalone form or choose an existing form from the Active Form selector to edit its fields and delivery settings."
                    />
                  </div>
                ) : (
                  <fieldset
                    disabled={isFormBuilderDisabled}
                    title={canEditForms ? undefined : formsEditPermissionTitle}
                    className="mt-4 grid gap-4 disabled:opacity-60"
                  >
                    {formBuilderDraft.pageId || formBuilderDraft.postId ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        This form belongs to a page or blog canvas. Use the
                        source editor for field changes so the rendered page and
                        public definition stay synchronized.
                      </div>
                    ) : null}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium">
                        Form title
                        <input
                          value={formBuilderDraft.title || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({ title: event.target.value })
                          }
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form title"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Machine name
                        <input
                          value={formBuilderDraft.name}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              name: normalizeFormFieldKey(event.target.value),
                            })
                          }
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form machine name"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium lg:col-span-2">
                        Description
                        <textarea
                          value={formBuilderDraft.description || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              description: event.target.value,
                            })
                          }
                          rows={2}
                          className="min-h-20 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form description"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-1.5 text-sm font-medium">
                        Audience
                        <select
                          value={formBuilderDraft.audience}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              audience: event.target
                                .value as FormDefinition["audience"],
                            })
                          }
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                          aria-label="Site form audience"
                        >
                          <option value="public">Public</option>
                          <option value="authenticated">Authenticated</option>
                          <option value="adminOnly">Admin only</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Moderation
                        <select
                          value={formBuilderDraft.moderationMode || "manual"}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              moderationMode: event.target
                                .value as FormDefinition["moderationMode"],
                            })
                          }
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                          aria-label="Site form moderation"
                        >
                          <option value="manual">Manual review</option>
                          <option value="auto-approve">Auto approve</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Success message
                        <input
                          value={formBuilderDraft.successMessage || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              successMessage: event.target.value,
                            })
                          }
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form success message"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Redirect URL
                        <input
                          value={formBuilderDraft.successRedirectUrl || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              successRedirectUrl: event.target.value,
                            })
                          }
                          placeholder="/thanks"
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form redirect URL"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Notification email
                        <input
                          type="email"
                          value={formBuilderDraft.notificationEmail || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              notificationEmail: event.target.value,
                            })
                          }
                          placeholder="leads@example.com"
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form notification email"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Webhook URL
                        <input
                          type="url"
                          value={formBuilderDraft.notificationWebhook || ""}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              notificationWebhook: event.target.value,
                            })
                          }
                          placeholder="https://example.com/backy/forms"
                          className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Site form notification webhook"
                        />
                      </label>
                      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={formBuilderDraft.isActive}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              isActive: event.target.checked,
                            })
                          }
                          aria-label="Site form active"
                        />
                        Active
                      </label>
                      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            formBuilderDraft.contactShare?.enabled,
                          )}
                          onChange={(event) =>
                            patchFormBuilderDraft({
                              contactShare: {
                                enabled: event.target.checked,
                                nameField:
                                  formBuilderDraft.contactShare?.nameField ||
                                  formBuilderDraft.fields.find((field) =>
                                    field.key.includes("name"),
                                  )?.key,
                                emailField:
                                  formBuilderDraft.contactShare?.emailField ||
                                  formBuilderDraft.fields.find(
                                    (field) => field.type === "email",
                                  )?.key,
                                notesField:
                                  formBuilderDraft.contactShare?.notesField ||
                                  formBuilderDraft.fields.find(
                                    (field) => field.type === "textarea",
                                  )?.key,
                                dedupeByEmail:
                                  formBuilderDraft.contactShare
                                    ?.dedupeByEmail !== false,
                              },
                            })
                          }
                          aria-label="Site form contact share"
                        />
                        Contact share
                      </label>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold">Fields</h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Field keys are the public API payload contract.
                            Reorder and edit carefully after launch.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addFormBuilderField}
                          disabled={isFormBuilderDisabled}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          Add field
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {formBuilderDraft.fields.map((field, fieldIndex) => (
                          <div
                            key={`site-form-field-${fieldIndex}`}
                            className="rounded-lg border border-border bg-card p-3"
                          >
                            <div className="grid gap-3 xl:grid-cols-[minmax(120px,0.75fr)_minmax(140px,1fr)_130px_110px_auto]">
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Key
                                <input
                                  value={field.key}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      key: normalizeFormFieldKey(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                  aria-label={`Site form field ${fieldIndex + 1} key`}
                                />
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Label
                                <input
                                  value={field.label}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      label: event.target.value,
                                    })
                                  }
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                  aria-label={`Site form field ${fieldIndex + 1} label`}
                                />
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Type
                                <select
                                  value={field.type}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      type: event.target.value,
                                    })
                                  }
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                                  aria-label={`Site form field ${fieldIndex + 1} type`}
                                >
                                  {SITE_FORM_FIELD_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex min-h-10 items-end gap-2 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.required)}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      required: event.target.checked,
                                    })
                                  }
                                  aria-label={`Site form field ${fieldIndex + 1} required`}
                                />
                                Required
                              </label>
                              <div className="flex items-end gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveFormBuilderField(fieldIndex, -1)
                                  }
                                  disabled={fieldIndex === 0}
                                  className="rounded-md border px-2 py-2 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveFormBuilderField(fieldIndex, 1)
                                  }
                                  disabled={
                                    fieldIndex ===
                                    formBuilderDraft.fields.length - 1
                                  }
                                  className="rounded-md border px-2 py-2 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeFormBuilderField(fieldIndex)
                                  }
                                  disabled={formBuilderDraft.fields.length <= 1}
                                  className="rounded-md border border-red-200 px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`Remove site form field ${fieldIndex + 1}`}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Placeholder
                                <input
                                  value={field.placeholder || ""}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      placeholder: event.target.value,
                                    })
                                  }
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                  aria-label={`Site form field ${fieldIndex + 1} placeholder`}
                                />
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Help text
                                <input
                                  value={field.helpText || ""}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      helpText: event.target.value,
                                    })
                                  }
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                  aria-label={`Site form field ${fieldIndex + 1} help text`}
                                />
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Options
                                <input
                                  value={(field.options || []).join(", ")}
                                  onChange={(event) =>
                                    patchFormBuilderField(fieldIndex, {
                                      options: parseFormOptionsText(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                  placeholder="Option one, Option two"
                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                  aria-label={`Site form field ${fieldIndex + 1} options`}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        {formBuilderDraft.fields.length} field
                        {formBuilderDraft.fields.length === 1 ? "" : "s"} in
                        this public form contract.
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteSelectedSiteForm()}
                        disabled={isFormBuilderBusy || !canDeleteForms}
                        title={
                          canDeleteForms
                            ? undefined
                            : formsDeletePermissionTitle
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {formBuilderDeleting ? "Deleting..." : "Delete form"}
                      </button>
                    </div>
                  </fieldset>
                )}
              </section>

              <section
                className="bg-card border border-border rounded-xl p-4 shadow-sm"
                data-testid="site-comment-policy-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Site comment policy</h3>
                      <span
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-semibold",
                          commentPolicyDraft.enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {commentPolicyDraft.enabled ? "Open" : "Closed"}
                      </span>
                      {commentPolicyDirty && (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Unsaved
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                      Site-level defaults for page and blog comment blocks.
                      Custom frontends receive this policy through the public
                      manifest and public comment APIs enforce it.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCommentPolicyDraft(savedCommentPolicy)}
                      disabled={isCommentPolicyDisabled || !commentPolicyDirty}
                      title={
                        canConfigureComments
                          ? undefined
                          : commentsConfigurePermissionTitle
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={saveSiteCommentPolicy}
                      disabled={isCommentPolicyDisabled || !commentPolicyDirty}
                      title={
                        canConfigureComments
                          ? undefined
                          : commentsConfigurePermissionTitle
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {commentPolicySaving
                        ? "Saving..."
                        : "Save comment policy"}
                    </button>
                  </div>
                </div>

                {commentPolicyLoading ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground">
                    Loading comment policy...
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Accept public comments", "enabled"],
                        ["Allow guests", "allowGuests"],
                        ["Require name", "requireName"],
                        ["Require email", "requireEmail"],
                        ["Allow replies", "allowReplies"],
                        ["Enable reports", "enableReports"],
                        ["Require captcha", "enableCaptcha"],
                      ].map(([label, key]) => (
                        <label
                          key={key}
                          className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(
                              commentPolicyDraft[
                                key as keyof SiteCommentPolicyDraft
                              ],
                            )}
                            onChange={(event) =>
                              patchCommentPolicyDraft({
                                [key]: event.target.checked,
                              } as Partial<SiteCommentPolicyDraft>)
                            }
                            disabled={isCommentPolicyDisabled}
                            title={
                              canConfigureComments
                                ? undefined
                                : commentsConfigurePermissionTitle
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block font-medium text-foreground">
                              {label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                              {key === "enabled"
                                ? "Controls whether new public comments are accepted."
                                : key === "enableReports"
                                  ? "Allows visitors to report published comments."
                                  : key === "enableCaptcha"
                                    ? "Requires provider-token verification before public comment persistence."
                                    : "Applied before page or blog comment block overrides."}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium">
                          <span className="mb-1 block">Default moderation</span>
                          <select
                            value={commentPolicyDraft.moderationMode}
                            onChange={(event) =>
                              patchCommentPolicyDraft({
                                moderationMode: event.target
                                  .value as SiteCommentPolicyDraft["moderationMode"],
                              })
                            }
                            aria-label="Site default comment moderation"
                            disabled={isCommentPolicyDisabled}
                            title={
                              canConfigureComments
                                ? undefined
                                : commentsConfigurePermissionTitle
                            }
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="manual">Manual review</option>
                            <option value="auto-approve">Auto approve</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium">
                          <span className="mb-1 block">Public sort</span>
                          <select
                            value={commentPolicyDraft.sort}
                            onChange={(event) =>
                              patchCommentPolicyDraft({
                                sort: event.target
                                  .value as SiteCommentPolicyDraft["sort"],
                              })
                            }
                            aria-label="Site default comment sort"
                            disabled={isCommentPolicyDisabled}
                            title={
                              canConfigureComments
                                ? undefined
                                : commentsConfigurePermissionTitle
                            }
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium">
                          <span className="mb-1 block">Captcha provider</span>
                          <select
                            value={commentPolicyDraft.captchaProvider}
                            onChange={(event) =>
                              patchCommentPolicyDraft({
                                captchaProvider: event.target
                                  .value as SiteCommentPolicyDraft["captchaProvider"],
                              })
                            }
                            aria-label="Site comment captcha provider"
                            disabled={
                              !commentPolicyDraft.enableCaptcha ||
                              isCommentPolicyDisabled
                            }
                            title={
                              canConfigureComments
                                ? undefined
                                : commentsConfigurePermissionTitle
                            }
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="mock">Mock</option>
                            <option value="turnstile">Turnstile</option>
                            <option value="hcaptcha">hCaptcha</option>
                            <option value="recaptcha">reCAPTCHA</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium">
                          <span className="mb-1 block">Captcha site key</span>
                          <input
                            value={commentPolicyDraft.captchaSiteKey}
                            onChange={(event) =>
                              patchCommentPolicyDraft({
                                captchaSiteKey: event.target.value,
                              })
                            }
                            aria-label="Site comment captcha site key"
                            disabled={
                              !commentPolicyDraft.enableCaptcha ||
                              isCommentPolicyDisabled
                            }
                            title={
                              canConfigureComments
                                ? undefined
                                : commentsConfigurePermissionTitle
                            }
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="Public site key"
                          />
                        </label>
                      </div>
                      <label className="text-sm font-medium">
                        <span className="mb-1 block">Closed message</span>
                        <input
                          value={commentPolicyDraft.closedMessage}
                          onChange={(event) =>
                            patchCommentPolicyDraft({
                              closedMessage: event.target.value,
                            })
                          }
                          aria-label="Site comment closed message"
                          disabled={isCommentPolicyDisabled}
                          title={
                            canConfigureComments
                              ? undefined
                              : commentsConfigurePermissionTitle
                          }
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <label className="text-sm font-medium">
                        <span className="mb-1 block">Blocked terms</span>
                        <textarea
                          value={commentPolicyBlockedTermsText}
                          onChange={(event) =>
                            updateCommentPolicyBlockedTerms(event.target.value)
                          }
                          aria-label="Site comment blocked terms"
                          rows={4}
                          disabled={isCommentPolicyDisabled}
                          title={
                            canConfigureComments
                              ? undefined
                              : commentsConfigurePermissionTitle
                          }
                          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="One term per line or comma separated"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 gap-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Form Submissions</h3>
                    <button
                      type="button"
                      onClick={() =>
                        state.selectedFormId &&
                        loadSubmissions(state.selectedFormId)
                      }
                      disabled={!state.selectedFormId || !canViewForms}
                      title={
                        canViewForms ? undefined : formsViewPermissionTitle
                      }
                      className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Reload
                    </button>
                  </div>
                  {state.submissionLoading ? (
                    <div className="text-sm text-muted-foreground py-4">
                      Loading submissions...
                    </div>
                  ) : state.submissions.length === 0 ? (
                    <EmptyState
                      icon={Send}
                      title="No submissions in the selected state"
                      description="Submissions that match the active form and status filter will appear here after visitors complete the form."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Time</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Target</th>
                            <th className="text-left px-3 py-2">Request ID</th>
                            <th className="text-left px-3 py-2">Content</th>
                            <th className="text-left px-3 py-2">Values</th>
                            <th className="text-left px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {state.submissions.map((submission) => {
                            const collectionRecord =
                              submission.collectionRecord || null;
                            const collectionErrors =
                              submission.collectionRecordErrors || [];
                            return (
                              <tr key={submission.id} className="border-t">
                                <td className="px-3 py-2">
                                  {formatTime(submission.submittedAt)}
                                </td>
                                <td className="px-3 py-2">
                                  <StatusBadge status={submission.status} />
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {submission.pageId ||
                                    submission.postId ||
                                    "site"}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {submission.requestId || "—"}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {collectionRecord ? (
                                    <a
                                      href={buildCollectionRecordShortcut(
                                        collectionRecord,
                                      )}
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                      {collectionRecord.collectionSlug}/
                                      {collectionRecord.recordSlug}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : collectionErrors.length > 0 ? (
                                    <span className="text-amber-700">
                                      {collectionErrors[0]?.message ||
                                        "Collection write failed"}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs max-w-sm truncate">
                                  {safeText(submission.values)}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() =>
                                        updateSubmissionStatus(
                                          submission,
                                          "approved",
                                        )
                                      }
                                      disabled={
                                        actionBusyId === submission.id ||
                                        isFormManagementDisabled
                                      }
                                      title={
                                        canManageForms
                                          ? undefined
                                          : formsManagePermissionTitle
                                      }
                                      className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Approve
                                    </button>
                                    <button
                                      onClick={() =>
                                        updateSubmissionStatus(
                                          submission,
                                          "rejected",
                                        )
                                      }
                                      disabled={
                                        actionBusyId === submission.id ||
                                        isFormManagementDisabled
                                      }
                                      title={
                                        canManageForms
                                          ? undefined
                                          : formsManagePermissionTitle
                                      }
                                      className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <MinusCircle className="w-3.5 h-3.5" />
                                      Reject
                                    </button>
                                    <button
                                      onClick={() =>
                                        updateSubmissionStatus(
                                          submission,
                                          "spam",
                                        )
                                      }
                                      disabled={
                                        actionBusyId === submission.id ||
                                        isFormManagementDisabled
                                      }
                                      title={
                                        canManageForms
                                          ? undefined
                                          : formsManagePermissionTitle
                                      }
                                      className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <CircleSlash className="w-3.5 h-3.5" />
                                      Mark spam
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Contacts (Lead Share)</h3>
                    <button
                      type="button"
                      onClick={() =>
                        state.selectedFormId &&
                        loadContacts(state.selectedFormId)
                      }
                      disabled={!state.selectedFormId || !canViewForms}
                      title={
                        canViewForms ? undefined : formsViewPermissionTitle
                      }
                      className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Reload
                    </button>
                  </div>
                  {state.contactLoading ? (
                    <div className="text-sm text-muted-foreground py-4">
                      Loading contacts...
                    </div>
                  ) : state.contacts.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No contacts in the selected state"
                      description="Lead-share contacts that match the active form and status filter will appear here."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Email</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Notes</th>
                            <th className="text-left px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {state.contacts.map((contact) => (
                            <tr key={contact.id} className="border-t">
                              <td className="px-3 py-2">
                                {contact.name || contact.phone || "Unnamed"}
                              </td>
                              <td className="px-3 py-2">
                                {contact.email || "—"}
                              </td>
                              <td className="px-3 py-2">
                                <StatusBadge
                                  status={contact.status}
                                  type={
                                    contact.status === "qualified"
                                      ? "success"
                                      : contact.status === "archived"
                                        ? "neutral"
                                        : "warning"
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 min-w-[260px]">
                                <textarea
                                  value={
                                    contactNoteDrafts[contact.id] ??
                                    contact.notes ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    setContactNoteDrafts((current) => ({
                                      ...current,
                                      [contact.id]: event.target.value,
                                    }))
                                  }
                                  disabled={!canManageForms}
                                  title={
                                    canManageForms
                                      ? undefined
                                      : formsManagePermissionTitle
                                  }
                                  rows={2}
                                  className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                  placeholder="Internal follow-up notes"
                                  aria-label={`Notes for ${contact.name || contact.email || contact.id}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => updateContactNotes(contact)}
                                    disabled={
                                      actionBusyId ===
                                        `contact-notes:${contact.id}` ||
                                      !canManageForms ||
                                      (
                                        contactNoteDrafts[contact.id] ??
                                        contact.notes ??
                                        ""
                                      ).trim() === (contact.notes || "").trim()
                                    }
                                    title={
                                      canManageForms
                                        ? undefined
                                        : formsManagePermissionTitle
                                    }
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    Save notes
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateContactStatus(contact, "contacted")
                                    }
                                    disabled={
                                      actionBusyId === contact.id ||
                                      isFormManagementDisabled
                                    }
                                    title={
                                      canManageForms
                                        ? undefined
                                        : formsManagePermissionTitle
                                    }
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Mark contacted
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateContactStatus(contact, "qualified")
                                    }
                                    disabled={
                                      actionBusyId === contact.id ||
                                      isFormManagementDisabled
                                    }
                                    title={
                                      canManageForms
                                        ? undefined
                                        : formsManagePermissionTitle
                                    }
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Mark qualified
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateContactStatus(contact, "archived")
                                    }
                                    disabled={
                                      actionBusyId === contact.id ||
                                      isFormManagementDisabled
                                    }
                                    title={
                                      canManageForms
                                        ? undefined
                                        : formsManagePermissionTitle
                                    }
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Archive
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Comments moderation</h3>
                    <div className="flex items-center gap-2">
                      {state.selectedCommentIds.length > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {state.selectedCommentIds.length} selected
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void exportComments()}
                        className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!state.comments.length || !canExportActivity}
                        title={
                          canExportActivity
                            ? undefined
                            : activityExportPermissionTitle
                        }
                      >
                        <Download className="w-3 h-3" />
                        Export comments (filtered)
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportCommentEvents()}
                        className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!commentRequestId || !canExportActivity}
                        title={
                          canExportActivity
                            ? undefined
                            : activityExportPermissionTitle
                        }
                      >
                        <Download className="w-3 h-3" />
                        Export events (requestId)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <label className="text-sm text-muted-foreground">
                      <span>Status</span>
                      <select
                        value={commentStatus}
                        onChange={(e) =>
                          setCommentStatus(
                            e.target.value as CommentStatusFilter,
                          )
                        }
                        disabled={isCommentViewDisabled}
                        title={
                          canViewComments
                            ? undefined
                            : commentsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="spam">Spam</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Target</span>
                      <select
                        value={commentTargetType}
                        onChange={(e) =>
                          setCommentTargetType(
                            e.target.value as CommentTargetFilter,
                          )
                        }
                        disabled={isCommentViewDisabled}
                        title={
                          canViewComments
                            ? undefined
                            : commentsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="all">All</option>
                        <option value="page">Page</option>
                        <option value="post">Post</option>
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Target ID</span>
                      <input
                        value={commentTargetId}
                        onChange={(event) =>
                          setCommentTargetId(event.target.value)
                        }
                        placeholder="pageId / postId"
                        disabled={isCommentViewDisabled}
                        title={
                          canViewComments
                            ? undefined
                            : commentsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Request ID</span>
                      <input
                        value={commentRequestId}
                        onChange={(event) =>
                          setCommentRequestId(event.target.value)
                        }
                        placeholder="req_..."
                        disabled={isCommentViewDisabled}
                        title={
                          canViewComments
                            ? undefined
                            : commentsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Block reason</span>
                      <select
                        value={commentBlockReason}
                        onChange={(event) =>
                          setCommentBlockReason(
                            event.target.value as CommentReportReason,
                          )
                        }
                        disabled={!canManageComments}
                        title={
                          canManageComments
                            ? undefined
                            : commentsManagePermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {state.commentReportReasons.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Search</span>
                      <input
                        value={commentSearch}
                        onChange={(event) =>
                          setCommentSearch(event.target.value)
                        }
                        placeholder="author, email, text..."
                        disabled={isCommentViewDisabled}
                        title={
                          canViewComments
                            ? undefined
                            : commentsViewPermissionTitle
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction("approved")}
                      disabled={
                        !state.selectedCommentIds.length ||
                        actionBusyId === "bulk-comment" ||
                        !canManageComments
                      }
                      title={
                        canManageComments
                          ? undefined
                          : commentsManagePermissionTitle
                      }
                      className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction("rejected")}
                      disabled={
                        !state.selectedCommentIds.length ||
                        actionBusyId === "bulk-comment" ||
                        !canManageComments
                      }
                      title={
                        canManageComments
                          ? undefined
                          : commentsManagePermissionTitle
                      }
                      className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      Reject selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction("spam")}
                      disabled={
                        !state.selectedCommentIds.length ||
                        actionBusyId === "bulk-comment" ||
                        !canManageComments
                      }
                      title={
                        canManageComments
                          ? undefined
                          : commentsManagePermissionTitle
                      }
                      className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CircleSlash className="w-3.5 h-3.5" />
                      Mark spam selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction("blocked")}
                      disabled={
                        !state.selectedCommentIds.length ||
                        actionBusyId === "bulk-comment" ||
                        !canManageComments
                      }
                      title={
                        canManageComments
                          ? undefined
                          : commentsManagePermissionTitle
                      }
                      className="text-xs px-2 py-1 rounded-md border hover:bg-red-50 hover:text-red-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CircleSlash className="w-3.5 h-3.5" />
                      Block selected
                    </button>
                    <button
                      type="button"
                      onClick={clearCommentSelection}
                      disabled={!state.selectedCommentIds.length}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-slate-50"
                    >
                      Clear selection
                    </button>
                  </div>
                  {state.commentsLoading ? (
                    <div className="text-sm text-muted-foreground py-4">
                      Loading comments...
                    </div>
                  ) : state.comments.length === 0 ? (
                    <EmptyState
                      icon={CircleSlash}
                      title="No comments in the selected state"
                      description="Comments that match the active moderation status will appear here for review and bulk actions."
                    />
                  ) : (
                    <div className="space-y-3">
                      {state.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className="border border-border rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={state.selectedCommentIds.includes(
                                  comment.id,
                                )}
                                onChange={(event) =>
                                  toggleCommentSelection(
                                    comment.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={!canManageComments}
                                title={
                                  canManageComments
                                    ? undefined
                                    : commentsManagePermissionTitle
                                }
                              />
                              <StatusBadge status={comment.status} />
                            </label>
                            <div>
                              <p className="text-sm">
                                <strong>{comment.authorName || "Guest"}</strong>{" "}
                                on {comment.targetType}/{comment.targetId}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatTime(comment.createdAt)} •{" "}
                                {comment.authorEmail ||
                                  comment.authorWebsite ||
                                  "No contact"}{" "}
                                • {comment.requestId || "No requestId"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Reports: {comment.reportCount || 0} • reasons:{" "}
                                {(comment.reportReasons?.length
                                  ? comment.reportReasons
                                  : []
                                ).join(", ") || "—"}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm mt-2">{comment.content}</p>
                          {comment.blockReason ||
                          comment.blockedBy ||
                          comment.blockedAt ? (
                            <p className="text-xs text-amber-600 mt-1">
                              Blocked: {comment.blockReason || "manual-block"}
                              {comment.blockedBy
                                ? ` by ${comment.blockedBy}`
                                : ""}
                              {comment.blockedAt
                                ? ` at ${formatTime(comment.blockedAt)}`
                                : ""}
                            </p>
                          ) : null}
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  "approved",
                                  undefined,
                                  commentRequestId || undefined,
                                )
                              }
                              disabled={
                                actionBusyId === comment.id ||
                                !canManageComments
                              }
                              title={
                                canManageComments
                                  ? undefined
                                  : commentsManagePermissionTitle
                              }
                              className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  "rejected",
                                  undefined,
                                  commentRequestId || undefined,
                                )
                              }
                              disabled={
                                actionBusyId === comment.id ||
                                !canManageComments
                              }
                              title={
                                canManageComments
                                  ? undefined
                                  : commentsManagePermissionTitle
                              }
                              className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MinusCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  "spam",
                                  undefined,
                                  commentRequestId || undefined,
                                )
                              }
                              disabled={
                                actionBusyId === comment.id ||
                                !canManageComments
                              }
                              title={
                                canManageComments
                                  ? undefined
                                  : commentsManagePermissionTitle
                              }
                              className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CircleSlash className="w-3.5 h-3.5" />
                              Mark spam
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  "blocked",
                                  commentBlockReason,
                                  commentRequestId || undefined,
                                )
                              }
                              disabled={
                                actionBusyId === comment.id ||
                                !canManageComments
                              }
                              title={
                                canManageComments
                                  ? undefined
                                  : commentsManagePermissionTitle
                              }
                              className="text-xs px-2 py-1 rounded-md border hover:bg-red-50 hover:text-red-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CircleSlash className="w-3.5 h-3.5" />
                              Block
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  "pending",
                                  undefined,
                                  commentRequestId || undefined,
                                )
                              }
                              disabled={
                                actionBusyId === comment.id ||
                                !canManageComments
                              }
                              title={
                                canManageComments
                                  ? undefined
                                  : commentsManagePermissionTitle
                              }
                              className="text-xs px-2 py-1 rounded-md border hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reset to pending
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Delete {site.name}?
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This removes the site workspace and its managed content from
                    Backy. Archive the site if you only want to hide it.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Public address:{" "}
                <span className="font-medium text-foreground">
                  {site.customDomain || `${site.slug}.backy.app`}
                </span>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSiteSettingsBusy) {
                      setShowDeleteConfirm(false);
                    }
                  }}
                  disabled={isSiteSettingsBusy}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSiteDeletionDisabled}
                  title={canDeleteSite ? undefined : deleteSitePermissionTitle}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSiteSettingsBusy ? "Deleting..." : "Delete site"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function SiteWorkspaceCheck({
  label,
  detail,
  ready,
}: {
  label: string;
  detail: string;
  ready: boolean;
}) {
  const Icon = ready ? CheckCircle : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          ready ? "text-emerald-600" : "text-amber-600",
        )}
      />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {detail}
        </div>
      </div>
    </div>
  );
}

function SiteWorkflowStep({
  index,
  label,
  detail,
}: {
  index: number;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {detail}
        </div>
      </div>
    </div>
  );
}

function SiteHandoffEndpoint({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function SiteDomainVerificationValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="mt-1 block min-w-0 overflow-x-auto font-mono text-xs text-foreground">
        {value || "—"}
      </code>
    </div>
  );
}

interface NavigationMenuEditorProps {
  title: string;
  description: string;
  menu: NavigationMenuKey;
  items: SiteNavigationConfigItem[];
  pages: Page[];
  loading: boolean;
  onAddItem: (
    menu: NavigationMenuKey,
    type: SiteNavigationConfigItem["type"],
  ) => void;
  onAddChild: (
    menu: NavigationMenuKey,
    parentId: string,
    type: SiteNavigationConfigItem["type"],
  ) => void;
  onUpdateItem: (
    menu: NavigationMenuKey,
    itemId: string,
    updates: Partial<SiteNavigationConfigItem>,
  ) => void;
  onRemoveItem: (menu: NavigationMenuKey, itemId: string) => void;
  onMoveItem: (
    menu: NavigationMenuKey,
    itemId: string,
    direction: -1 | 1,
  ) => void;
  onDropItem: (
    menu: NavigationMenuKey,
    draggedId: string,
    targetId: string,
    placement: "before" | "after",
  ) => void;
}

interface NavigationLayoutEditorProps {
  layout: SiteNavigationLayoutConfig;
  loading: boolean;
  onUpdate: (
    section: keyof SiteNavigationLayoutConfig,
    updates: Partial<
      NonNullable<SiteNavigationLayoutConfig[keyof SiteNavigationLayoutConfig]>
    >,
  ) => void;
}

function NavigationLayoutEditor({
  layout,
  loading,
  onUpdate,
}: NavigationLayoutEditorProps) {
  const header = layout.header || EMPTY_NAVIGATION.layout?.header || {};
  const footer = layout.footer || EMPTY_NAVIGATION.layout?.footer || {};

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            Global header and footer controls
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Defines the reusable site chrome that hosted pages and custom
            frontends can render around every page, blog post, product, and
            form.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Public contract:{" "}
          <span className="font-medium text-foreground">navigation.layout</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Menu className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Header</h4>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-muted-foreground">
                Variant
                <select
                  value={header.variant || "minimal"}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("header", {
                      variant: event.target.value as NonNullable<
                        typeof header.variant
                      >,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {NAVIGATION_HEADER_VARIANTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Position
                <select
                  value={header.position || "sticky"}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("header", {
                      position: event.target.value as NonNullable<
                        typeof header.position
                      >,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {NAVIGATION_HEADER_POSITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Width
                <select
                  value={header.width || "contained"}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("header", {
                      width: event.target.value as NonNullable<
                        typeof header.width
                      >,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {NAVIGATION_WIDTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <NavigationToggle
                label="Brand slot"
                checked={header.showBrand !== false}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("header", { showBrand: checked })
                }
              />
              <NavigationToggle
                label="Search"
                checked={Boolean(header.showSearch)}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("header", { showSearch: checked })
                }
              />
              <NavigationToggle
                label="Account"
                checked={Boolean(header.showAccount)}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("header", { showAccount: checked })
                }
              />
              <NavigationToggle
                label="Cart"
                checked={Boolean(header.showCart)}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("header", { showCart: checked })
                }
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">
                CTA label
                <input
                  value={header.ctaLabel || ""}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("header", { ctaLabel: event.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  placeholder="Start project"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                CTA href
                <input
                  value={header.ctaHref || ""}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("header", { ctaHref: event.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  placeholder="/contact"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Footer</h4>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">
                Variant
                <select
                  value={footer.variant || "columns"}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("footer", {
                      variant: event.target.value as NonNullable<
                        typeof footer.variant
                      >,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {NAVIGATION_FOOTER_VARIANTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Width
                <select
                  value={footer.width || "contained"}
                  disabled={loading}
                  onChange={(event) =>
                    onUpdate("footer", {
                      width: event.target.value as NonNullable<
                        typeof footer.width
                      >,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {NAVIGATION_WIDTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <NavigationToggle
                label="Social links"
                checked={footer.showSocial !== false}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("footer", { showSocial: checked })
                }
              />
              <NavigationToggle
                label="Newsletter"
                checked={Boolean(footer.showNewsletter)}
                disabled={loading}
                onChange={(checked) =>
                  onUpdate("footer", { showNewsletter: checked })
                }
              />
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              Footer note
              <textarea
                value={footer.note || ""}
                disabled={loading}
                onChange={(event) =>
                  onUpdate("footer", { note: event.target.value })
                }
                rows={3}
                className="mt-1 w-full resize-none rounded-md border bg-background px-2 py-2 text-sm text-foreground"
                placeholder="Short brand, legal, or support note."
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="text-sm font-semibold">Frontend chrome preview</h4>
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <div
              className={cn(
                "rounded-md border px-3 py-2",
                header.width === "full"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  {header.showBrand === false ? "No brand" : "Brand"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {header.variant || "minimal"} / {header.position || "sticky"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Search", "Account", "Cart"].map((label) => {
                  const enabled =
                    label === "Search"
                      ? header.showSearch
                      : label === "Account"
                        ? header.showAccount
                        : header.showCart;
                  return enabled ? (
                    <span
                      key={label}
                      className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {label}
                    </span>
                  ) : null;
                })}
                {header.ctaLabel ? (
                  <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                    {header.ctaLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="my-3 h-24 rounded-md border border-dashed border-border bg-muted/30" />
            <div
              className={cn(
                "rounded-md border px-3 py-2",
                footer.width === "full"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Footer</span>
                <span className="text-xs text-muted-foreground">
                  {footer.variant || "columns"}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {footer.note ||
                  "Footer menu, social links, newsletter, and support links render here."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
      />
    </label>
  );
}

function NavigationMenuEditor({
  title,
  description,
  menu,
  items,
  pages,
  loading,
  onAddItem,
  onAddChild,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onDropItem,
}: NavigationMenuEditorProps) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAddItem(menu, "page")}
            disabled={loading || pages.length === 0}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Page
          </button>
          <button
            type="button"
            onClick={() => onAddItem(menu, "route")}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Route
          </button>
          <button
            type="button"
            onClick={() => onAddItem(menu, "url")}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            URL
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {loading ? (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Loading navigation...
          </div>
        ) : items.length === 0 ? (
          <div>
            <EmptyState
              icon={Menu}
              title="No navigation links yet"
              description="Add route or URL links to build this menu for custom frontend navigation."
            />
          </div>
        ) : (
          items.map((item, index) => (
            <NavigationItemEditor
              key={item.id || `${menu}-${index}`}
              menu={menu}
              item={item}
              pages={pages}
              depth={0}
              rootIndex={index}
              rootCount={items.length}
              onAddChild={onAddChild}
              onUpdateItem={onUpdateItem}
              onRemoveItem={onRemoveItem}
              onMoveItem={onMoveItem}
              onDropItem={onDropItem}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface NavigationItemEditorProps {
  menu: NavigationMenuKey;
  item: SiteNavigationConfigItem;
  pages: Page[];
  depth: number;
  rootIndex: number;
  rootCount: number;
  onAddChild: (
    menu: NavigationMenuKey,
    parentId: string,
    type: SiteNavigationConfigItem["type"],
  ) => void;
  onUpdateItem: (
    menu: NavigationMenuKey,
    itemId: string,
    updates: Partial<SiteNavigationConfigItem>,
  ) => void;
  onRemoveItem: (menu: NavigationMenuKey, itemId: string) => void;
  onMoveItem: (
    menu: NavigationMenuKey,
    itemId: string,
    direction: -1 | 1,
  ) => void;
  onDropItem: (
    menu: NavigationMenuKey,
    draggedId: string,
    targetId: string,
    placement: "before" | "after",
  ) => void;
}

function NavigationItemEditor({
  menu,
  item,
  pages,
  depth,
  rootIndex,
  rootCount,
  onAddChild,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onDropItem,
}: NavigationItemEditorProps) {
  const itemId = item.id || item.label;
  const canNest = depth < 2 && Boolean(item.id);
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-backy-navigation-item", itemId);
    event.dataTransfer.setData("text/plain", itemId);
  };
  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    placement: "before" | "after",
  ) => {
    event.preventDefault();
    const draggedId =
      event.dataTransfer.getData("application/x-backy-navigation-item") ||
      event.dataTransfer.getData("text/plain");
    if (draggedId) {
      onDropItem(menu, draggedId, itemId, placement);
    }
  };

  return (
    <div
      className={cn("rounded-lg border bg-card shadow-sm", depth > 0 && "ml-5")}
      data-navigation-item-id={itemId}
      data-navigation-item-label={item.label}
    >
      <div
        className="h-2 rounded-t-lg border-b border-dashed border-transparent transition-colors hover:border-primary hover:bg-primary/10"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleDrop(event, "before")}
        aria-label={`Drop before ${item.label}`}
      />
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
          draggable
          onDragStart={handleDragStart}
          title="Drag to reorder"
          aria-label={`Drag ${item.label}`}
        >
          {depth > 0 ? (
            <CornerDownRight className="h-4 w-4 shrink-0" />
          ) : (
            <Menu className="h-4 w-4 shrink-0" />
          )}
        </span>
        <select
          value={item.type}
          onChange={(event) =>
            onUpdateItem(menu, itemId, {
              type: event.target.value as SiteNavigationConfigItem["type"],
              pageId:
                event.target.value === "page" ? pages[0]?.id || "" : undefined,
              path:
                event.target.value === "route" ? item.path || "/" : undefined,
              href:
                event.target.value === "url"
                  ? item.href || "https://"
                  : undefined,
            })
          }
          className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
        >
          <option value="page">Page</option>
          <option value="route">Route</option>
          <option value="url">URL</option>
        </select>
        <input
          value={item.label}
          onChange={(event) =>
            onUpdateItem(menu, itemId, { label: event.target.value })
          }
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          placeholder="Label"
        />
        <button
          type="button"
          onClick={() =>
            onUpdateItem(menu, itemId, {
              visible: item.visible === false ? true : false,
            })
          }
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={item.visible === false ? "Show item" : "Hide item"}
          aria-label={item.visible === false ? "Show item" : "Hide item"}
        >
          {item.visible === false ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onMoveItem(menu, itemId, -1)}
          disabled={rootIndex === 0}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Move up"
          aria-label="Move up"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMoveItem(menu, itemId, 1)}
          disabled={rootIndex >= rootCount - 1}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Move down"
          aria-label="Move down"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onRemoveItem(menu, itemId)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          title="Remove item"
          aria-label="Remove item"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <div>
          {item.type === "page" ? (
            <select
              value={item.pageId || ""}
              onChange={(event) =>
                onUpdateItem(menu, itemId, { pageId: event.target.value })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select page</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title} ({page.status})
                </option>
              ))}
            </select>
          ) : (
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={item.type === "url" ? item.href || "" : item.path || ""}
                onChange={(event) =>
                  onUpdateItem(
                    menu,
                    itemId,
                    item.type === "url"
                      ? { href: event.target.value }
                      : { path: event.target.value },
                  )
                }
                className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
                placeholder={
                  item.type === "url" ? "https://example.com" : "/about"
                }
              />
            </div>
          )}
        </div>

        <select
          value={item.target || "_self"}
          onChange={(event) =>
            onUpdateItem(menu, itemId, {
              target: event.target.value as SiteNavigationConfigItem["target"],
            })
          }
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="_self">Same tab</option>
          <option value="_blank">New tab</option>
        </select>
      </div>

      {canNest && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => onAddChild(menu, itemId, "page")}
            disabled={pages.length === 0}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Child page
          </button>
          <button
            type="button"
            onClick={() => onAddChild(menu, itemId, "route")}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Child route
          </button>
          <button
            type="button"
            onClick={() => onAddChild(menu, itemId, "url")}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Child URL
          </button>
        </div>
      )}

      {item.children && item.children.length > 0 && (
        <div className="space-y-3 border-t border-border p-3">
          {item.children.map((child, childIndex) => (
            <NavigationItemEditor
              key={child.id || `${itemId}-${childIndex}`}
              menu={menu}
              item={child}
              pages={pages}
              depth={depth + 1}
              rootIndex={childIndex}
              rootCount={item.children?.length || 0}
              onAddChild={onAddChild}
              onUpdateItem={onUpdateItem}
              onRemoveItem={onRemoveItem}
              onMoveItem={onMoveItem}
              onDropItem={onDropItem}
            />
          ))}
        </div>
      )}
      <div
        className="h-2 rounded-b-lg border-t border-dashed border-transparent transition-colors hover:border-primary hover:bg-primary/10"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleDrop(event, "after")}
        aria-label={`Drop after ${item.label}`}
      />
    </div>
  );
}
