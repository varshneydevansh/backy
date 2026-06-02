/**
 * BACKY CMS - DASHBOARD HOME
 */

import { type ElementType, useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  Globe,
  HardDrive,
  History,
  KeyRound,
  Layout,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Package,
  RefreshCw,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import {
  getSettings,
  getSiteReadiness,
  getUserPermissions,
  listAdminAuditLogs,
  listBlogPosts,
  listCollections,
  listCollectionRecords,
  listComments,
  listFormContacts,
  listForms,
  listPages,
  listSites,
  listUsers,
  validateSettingsInfrastructure,
  type AdminAuditLog,
  type AdminUserPermissionMatrix,
  type Collection,
  type CollectionRecord,
  type FormDefinition,
  getFormWithSubmissions,
  type SettingsInfrastructureDiagnostic,
  type SiteReadiness,
  type SiteSettingsInput,
} from '@/lib/adminContentApi';
import { getDefaultMediaSiteId, listMedia } from '@/lib/mediaApi';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore, type BlogPost, type Page, type Site, type User, type MediaAsset } from '@/stores/mockStore';
import { getSitePrimaryHost, siteMatchesIdentifier } from '@/lib/siteSelection';
import {
  buildDashboardCustomFrontendAgentBrief,
  buildDashboardCustomFrontendContentCreation,
  buildDashboardCustomFrontendControlReadiness,
  buildDashboardCustomFrontendLaunch,
} from '@/lib/customFrontendLaunch';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { siteId?: string } => ({
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
  component: Index,
});

type DashboardSource = 'backend' | 'fallback';
type DashboardRouteTarget =
  | '/sites'
  | '/pages'
  | '/blog'
  | '/media'
  | '/users'
  | '/settings'
  | '/collections'
  | '/forms'
  | '/comments'
  | '/products'
  | '/orders'
  | '/sites/new'
  | '/pages/new'
  | '/blog/new';
type DashboardWorkflowSearch = { quickCreate: 'product' } | { quickCreate: 'blank' };
type DashboardPageCreateTemplate = 'registration' | 'contact' | 'storefront' | 'blog-index';

interface DashboardData {
  sites: Site[];
  pages: Page[];
  posts: BlogPost[];
  users: User[];
  media: MediaAsset[];
  collections: Collection[];
  forms: FormDefinition[];
  contacts: number;
  comments: number;
  pendingComments: number;
  commerce: DashboardCommerceMetrics;
  moderation: DashboardModerationMetrics;
  settings?: SiteSettingsInput;
  auditLogs: AdminAuditLog[];
  readiness: SiteReadiness[];
  source: DashboardSource;
}

interface DashboardCommerceMetrics {
  productCount: number;
  loadedProductCount: number;
  lowStockProductCount: number;
  outOfStockProductCount: number;
  checkoutConfiguredProductCount: number;
  orderCount: number;
  openOrderCount: number;
  paidOrderCount: number;
  failedOrderCount: number;
  loadedOrderValue: number;
  currency: string;
}

interface DashboardModerationMetrics {
  formSubmissionCount: number;
  loadedFormSubmissionCount: number;
  pendingFormSubmissionCount: number;
  approvedFormSubmissionCount: number;
  rejectedFormSubmissionCount: number;
  spamFormSubmissionCount: number;
  manualReviewFormCount: number;
  spamGuardedFormCount: number;
  commentCount: number;
  loadedCommentCount: number;
  pendingCommentCount: number;
  approvedCommentCount: number;
  reportedCommentCount: number;
  spamCommentCount: number;
  blockedCommentCount: number;
  moderationAuditEvents: number;
  approvalThroughputCount: number;
  reviewQueueCount: number;
  safetyFlagCount: number;
}

interface DashboardDeploymentRun {
  id: string;
  siteId: string;
  siteName: string;
  createdAt: string;
  status: 'ready' | 'warning' | 'blocked';
  blocked: number;
  warnings: number;
  ready: number;
  targetUrl: string;
  requestId?: string;
}

interface DashboardIssue {
  id: string;
  label: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
  to: DashboardRouteTarget;
}

interface DashboardWorkflowAction {
  label: string;
  to: DashboardRouteTarget;
  icon: ElementType;
  detail: string;
  visible: boolean;
  search?: DashboardWorkflowSearch;
}

type DashboardPermissionKey =
  | 'dashboard.view'
  | 'sites.view'
  | 'sites.create'
  | 'pages.view'
  | 'pages.edit'
  | 'media.view'
  | 'collections.view'
  | 'forms.view'
  | 'forms.create'
  | 'comments.view'
  | 'commerce.view'
  | 'commerce.edit'
  | 'users.view'
  | 'settings.view'
  | 'settings.configure'
  | 'activity.export';

const DASHBOARD_PERMISSION_ROLE_DEFAULTS: Record<DashboardPermissionKey, User['role'][]> = {
  'dashboard.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.create': ['owner', 'admin'],
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.create': ['owner', 'admin', 'editor'],
  'comments.view': ['owner', 'admin', 'editor', 'viewer'],
  'commerce.view': ['owner', 'admin', 'editor', 'viewer'],
  'commerce.edit': ['owner', 'admin', 'editor'],
  'users.view': ['owner', 'admin'],
  'settings.view': ['owner', 'admin'],
  'settings.configure': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
};

const dashboardPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: DashboardPermissionKey,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key);

const isDashboardPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: Pick<User, 'role'> | null | undefined,
  key: DashboardPermissionKey,
) => {
  const matrixRule = dashboardPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.allowed;

  return currentAdmin ? DASHBOARD_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role) : false;
};

const dashboardPermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: Pick<User, 'role'> | null | undefined,
  key: DashboardPermissionKey,
) => {
  const matrixRule = dashboardPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.reason;
  if (!currentAdmin) return 'Sign in to load dashboard permissions.';
  if (!permissionMatrix) return 'Permission matrix unavailable. Reload permissions before using this capability.';

  return DASHBOARD_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Hidden until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Hidden by backend permissions and ${currentAdmin.role} role defaults.`;
};

const emptyCommerceMetrics = (): DashboardCommerceMetrics => ({
  productCount: 0,
  loadedProductCount: 0,
  lowStockProductCount: 0,
  outOfStockProductCount: 0,
  checkoutConfiguredProductCount: 0,
  orderCount: 0,
  openOrderCount: 0,
  paidOrderCount: 0,
  failedOrderCount: 0,
  loadedOrderValue: 0,
  currency: 'USD',
});

const emptyModerationMetrics = (): DashboardModerationMetrics => ({
  formSubmissionCount: 0,
  loadedFormSubmissionCount: 0,
  pendingFormSubmissionCount: 0,
  approvedFormSubmissionCount: 0,
  rejectedFormSubmissionCount: 0,
  spamFormSubmissionCount: 0,
  manualReviewFormCount: 0,
  spamGuardedFormCount: 0,
  commentCount: 0,
  loadedCommentCount: 0,
  pendingCommentCount: 0,
  approvedCommentCount: 0,
  reportedCommentCount: 0,
  spamCommentCount: 0,
  blockedCommentCount: 0,
  moderationAuditEvents: 0,
  approvalThroughputCount: 0,
  reviewQueueCount: 0,
  safetyFlagCount: 0,
});

const emptyDashboardData = (): DashboardData => ({
  sites: [],
  pages: [],
  posts: [],
  users: [],
  media: [],
  collections: [],
  forms: [],
  contacts: 0,
  comments: 0,
  pendingComments: 0,
  commerce: emptyCommerceMetrics(),
  moderation: emptyModerationMetrics(),
  auditLogs: [],
  readiness: [],
  source: 'backend',
});

const fallbackAuditLogs = (sites: Site[], pages: Page[], posts: BlogPost[]): AdminAuditLog[] => (
  [
    ...sites.map((site) => ({
      id: `fallback-site-${site.id}`,
      entity: 'site',
      entityId: site.id,
      action: 'updated',
      actorId: 'local',
      createdAt: site.lastUpdated,
      metadata: { title: site.name },
    })),
    ...pages.map((page) => ({
      id: `fallback-page-${page.id}`,
      entity: 'page',
      entityId: page.id,
      action: 'updated',
      actorId: 'local',
      createdAt: page.lastUpdated,
      metadata: { title: page.title },
    })),
    ...posts.map((post) => ({
      id: `fallback-post-${post.id}`,
      entity: 'post',
      entityId: post.id,
      action: 'updated',
      actorId: 'local',
      createdAt: post.publishedAt,
      metadata: { title: post.title },
    })),
  ] satisfies AdminAuditLog[]
).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

const titleFromAuditLog = (log: AdminAuditLog): string => {
  const title = log.metadata?.title;
  if (typeof title === 'string' && title.trim()) {
    return title;
  }

  if (log.entity === 'settings') return 'Platform settings';
  return log.entityId;
};

const actionLabel = (action: string): string => (
  action
    .replace(/^settings\./, '')
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
);

const issueTone = {
  error: 'border-destructive/25 bg-destructive/10 text-destructive',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  info: 'border-info/25 bg-info/10 text-info',
} satisfies Record<DashboardIssue['severity'], string>;

const frontendContracts = [
  { label: 'Manifest', key: 'manifest', detail: 'Routes, capability flags, schemas' },
  { label: 'Render home', key: 'render', detail: 'Page, post, collection payloads' },
  { label: 'Navigation', key: 'navigation', detail: 'Primary, footer, and reusable menus' },
  { label: 'Media', key: 'media', detail: 'Public assets, fonts, files' },
  { label: 'Collections', key: 'collections', detail: 'Structured records for custom UI' },
  { label: 'Commerce', key: 'products', detail: 'Normalized product catalog, facets, inventory, delivery, and checkout handoff' },
  { label: 'Order intake', key: 'orderIntake', detail: 'Public checkout cart capture into the private order queue' },
  { label: 'Forms', key: 'forms', detail: 'Definitions and submission endpoints' },
  { label: 'Comments', key: 'comments', detail: 'Moderation-ready public discussions' },
  { label: 'SEO', key: 'seo', detail: 'Sitemap, robots, metadata, route index' },
];

const DASHBOARD_CONTROL_AREAS = [
  {
    title: 'Live site scope',
    detail: 'Choose the active website that frontend contracts and handoff data reference.',
    href: '#dashboard-site-scope',
  },
  {
    title: 'System totals',
    detail: 'Open sites, pages, posts, forms, media, commerce, comments, and users.',
    href: '#dashboard-stats',
  },
  {
    title: 'Platform readiness',
    detail: 'Review backend API, keys, storage, database, Supabase, Vercel, and publish blockers.',
    href: '#dashboard-readiness',
  },
  {
    title: 'Launch onboarding',
    detail: 'Resume the setup checklist for site, content, media, data, forms, commerce, users, and APIs.',
    href: '#dashboard-onboarding',
  },
  {
    title: 'Creation workflows',
    detail: 'Start the core builder flows: site, page, post, files, collections, and API setup.',
    href: '#dashboard-workflows',
  },
  {
    title: 'Attention queue',
    detail: 'Resolve moderation, readiness, form, storage, and fallback-mode issues.',
    href: '#dashboard-attention',
  },
  {
    title: 'API handoff',
    detail: 'Copy or download the public/admin contract payload for a custom frontend.',
    href: '#dashboard-api',
  },
  {
    title: 'API consumers',
    detail: 'Check keys, service clients, endpoint coverage, and recent API access changes.',
    href: '#dashboard-api-consumers',
  },
  {
    title: 'Persistence',
    detail: 'Inspect database, Supabase, repository mode, storage bucket, and missing runtime env.',
    href: '#dashboard-persistence',
  },
] as const;

const DASHBOARD_MODULES = [
  {
    title: 'Sites and pages',
    status: 'Available',
    href: '/pages',
    detail: 'Visual page canvas, page settings, navigation-ready routes, and reusable sections.',
  },
  {
    title: 'Blog and editorial',
    status: 'Available',
    href: '/blog',
    detail: 'Posts, SEO readiness, taxonomy, revisions, previews, and public article design.',
  },
  {
    title: 'Media and files',
    status: 'Available',
    href: '/media',
    detail: 'Images, downloads, fonts, folders, signed URLs, transforms, and references.',
  },
  {
    title: 'Dynamic collections',
    status: 'Available',
    href: '/collections',
    detail: 'Reusable schemas, records, import/export, permissions, and public list/detail APIs.',
  },
  {
    title: 'Forms and contacts',
    status: 'Available',
    href: '/forms',
    detail: 'Contact, registration, lead capture, submission storage, and private contact pipelines.',
  },
  {
    title: 'Commerce',
    status: 'Available',
    href: '/products',
    detail: 'Products, order capture, fulfillment, refunds, checkout handoff, and CSV exports.',
  },
  {
    title: 'Users and roles',
    status: 'Available',
    href: '/users',
    detail: 'Collaborators, role scope, lifecycle controls, invite payloads, and access recovery.',
  },
  {
    title: 'Infrastructure',
    status: 'Available',
    href: '/settings',
    detail: 'Backy-owned settings with Supabase, Vercel, storage, keys, security, and delivery mode.',
  },
  {
    title: 'Memberships',
    status: 'Next',
    href: '/settings',
    detail: 'Frontend login, gated pages, customer profiles, subscription access, and account portals.',
  },
  {
    title: 'Automations',
    status: 'Next',
    href: '/settings',
    detail: 'Form triggers, order workflows, email notifications, webhooks, scheduled publishing, and jobs.',
  },
  {
    title: 'Theme system',
    status: 'Next',
    href: '/pages',
    detail: 'Global tokens, reusable headers/footers, animations, breakpoints, and per-site design presets.',
  },
  {
    title: 'Marketplace',
    status: 'Next',
    href: '/collections',
    detail: 'Plugins, templates, checkout providers, embeds, analytics adapters, and installable modules.',
  },
] as const;

const listContactCountForDashboard = async (siteId: string, formId: string): Promise<number> => {
  try {
    const result = await listFormContacts(siteId, formId, { limit: 1 });
    return result.count;
  } catch {
    return 0;
  }
};

const orderStatusValue = (record: CollectionRecord, key: string) => {
  const value = record.values[key];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const isOpenOrderRecord = (record: CollectionRecord) => {
  const orderStatus = orderStatusValue(record, 'orderstatus');
  const fulfillmentStatus = orderStatusValue(record, 'fulfillmentstatus');
  const closedStatuses = new Set(['completed', 'fulfilled', 'cancelled', 'canceled', 'refunded', 'archived']);

  return !closedStatuses.has(orderStatus) && !closedStatuses.has(fulfillmentStatus);
};

const orderRecordTotal = (record: CollectionRecord) => {
  const value = record.values.total;
  const total = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(total) ? total : 0;
};

const orderRecordCurrency = (record: CollectionRecord) => {
  const value = record.values.currency;
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : '';
};

const readProductRecordValue = (record: CollectionRecord, canonicalKey: string, legacyKey?: string) => {
  if (record.values[canonicalKey] !== undefined) return record.values[canonicalKey];
  if (legacyKey && record.values[legacyKey] !== undefined) return record.values[legacyKey];
  return undefined;
};

const productRecordNumber = (record: CollectionRecord, canonicalKey: string, legacyKey?: string, fallback = 0) => {
  const value = readProductRecordValue(record, canonicalKey, legacyKey);
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const productRecordString = (record: CollectionRecord, canonicalKey: string, legacyKey?: string) => {
  const value = readProductRecordValue(record, canonicalKey, legacyKey);
  return typeof value === 'string' ? value.trim() : '';
};

const productRecordStockState = (record: CollectionRecord) => {
  const productType = productRecordString(record, 'producttype', 'productType') || 'physical';
  const inventoryPolicy = productRecordString(record, 'inventorypolicy', 'inventoryPolicy') || 'deny';
  const inventory = productRecordNumber(record, 'inventory', undefined, 0);
  const lowStockThreshold = Math.max(0, productRecordNumber(record, 'lowstockthreshold', 'lowStockThreshold', 5) || 5);
  const isPhysical = productType === 'physical';
  const inStock = !isPhysical || inventory > 0 || inventoryPolicy !== 'deny';

  return {
    lowStock: isPhysical && inventory > 0 && inventory <= lowStockThreshold,
    outOfStock: !inStock,
    checkoutConfigured: productRecordString(record, 'checkouturl', 'checkoutUrl').length > 0,
  };
};

const loadCommerceMetricsForDashboard = async (
  collections: Collection[],
): Promise<DashboardCommerceMetrics> => {
  const productCollections = collections.filter((collection) => collection.slug === 'products');
  const orderCollections = collections.filter((collection) => collection.slug === 'orders');
  const productResults = await Promise.all(productCollections.map((collection) => (
    listCollectionRecords(collection.siteId, collection.id, { limit: 100 }).catch(() => null)
  )));
  const orderResults = await Promise.all(orderCollections.map((collection) => (
    listCollectionRecords(collection.siteId, collection.id, { limit: 100 }).catch(() => null)
  )));
  const productRecords = productResults.flatMap((result) => result?.records || []);
  const orderRecords = orderResults.flatMap((result) => result?.records || []);
  const currency = orderRecords.map(orderRecordCurrency).find(Boolean) || 'USD';
  const stockStates = productRecords.map(productRecordStockState);

  return {
    productCount: productResults.reduce((total, result) => total + (result?.pagination.total ?? 0), 0),
    loadedProductCount: productRecords.length,
    lowStockProductCount: stockStates.filter((state) => state.lowStock).length,
    outOfStockProductCount: stockStates.filter((state) => state.outOfStock).length,
    checkoutConfiguredProductCount: stockStates.filter((state) => state.checkoutConfigured).length,
    orderCount: orderResults.reduce((total, result) => total + (result?.pagination.total ?? 0), 0),
    openOrderCount: orderRecords.filter(isOpenOrderRecord).length,
    paidOrderCount: orderRecords.filter((record) => orderStatusValue(record, 'paymentstatus') === 'paid').length,
    failedOrderCount: orderRecords.filter((record) => orderStatusValue(record, 'paymentstatus') === 'failed').length,
    loadedOrderValue: orderRecords.reduce((total, record) => total + orderRecordTotal(record), 0),
    currency,
  };
};

type DashboardCommentListResult = Awaited<ReturnType<typeof listComments>> | null;

const hasFormSpamGuards = (form: FormDefinition) => (
  Boolean(form.enableHoneypot) ||
  Boolean(form.enableCaptcha) ||
  Boolean(form.spamSettings?.blockedTerms?.length) ||
  Boolean(form.spamSettings?.rateLimitMax)
);

const isDashboardReportedComment = (comment: Awaited<ReturnType<typeof listComments>>['comments'][number]) => (
  (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)
);

const isDashboardModerationAuditLog = (log: AdminAuditLog) => {
  const action = log.action.toLowerCase();
  const entity = log.entity.toLowerCase();

  return (
    entity === 'comment' ||
    entity === 'comments' ||
    entity === 'form' ||
    entity === 'forms' ||
    action.includes('moderate') ||
    action.includes('approve') ||
    action.includes('reject') ||
    action.includes('spam') ||
    action.includes('blocklist') ||
    action.includes('submission')
  );
};

const loadModerationMetricsForDashboard = async (
  forms: FormDefinition[],
  commentResults: DashboardCommentListResult[],
  auditLogs: AdminAuditLog[],
): Promise<DashboardModerationMetrics> => {
  const formResults = await Promise.all(forms.map((form) => (
    getFormWithSubmissions(form.siteId, form.id, { limit: 100 }).catch(() => null)
  )));
  const submissions = formResults.flatMap((result) => result?.submissions.data || []);
  const comments = commentResults.flatMap((result) => result?.comments || []);
  const pendingFormSubmissionCount = submissions.filter((submission) => submission.status === 'pending').length;
  const approvedFormSubmissionCount = submissions.filter((submission) => submission.status === 'approved').length;
  const spamFormSubmissionCount = submissions.filter((submission) => submission.status === 'spam').length;
  const pendingCommentCount = comments.filter((comment) => comment.status === 'pending').length;
  const approvedCommentCount = comments.filter((comment) => comment.status === 'approved').length;
  const reportedCommentCount = comments.filter(isDashboardReportedComment).length;
  const spamCommentCount = comments.filter((comment) => comment.status === 'spam').length;
  const blockedCommentCount = comments.filter((comment) => comment.status === 'blocked').length;

  return {
    formSubmissionCount: formResults.reduce((total, result) => (
      total + (result?.submissions.pagination?.total ?? result?.submissions.data.length ?? 0)
    ), 0),
    loadedFormSubmissionCount: submissions.length,
    pendingFormSubmissionCount,
    approvedFormSubmissionCount,
    rejectedFormSubmissionCount: submissions.filter((submission) => submission.status === 'rejected').length,
    spamFormSubmissionCount,
    manualReviewFormCount: forms.filter((form) => form.moderationMode !== 'auto-approve').length,
    spamGuardedFormCount: forms.filter(hasFormSpamGuards).length,
    commentCount: commentResults.reduce((total, result) => total + (result?.count ?? 0), 0),
    loadedCommentCount: comments.length,
    pendingCommentCount,
    approvedCommentCount,
    reportedCommentCount,
    spamCommentCount,
    blockedCommentCount,
    moderationAuditEvents: auditLogs.filter(isDashboardModerationAuditLog).length,
    approvalThroughputCount: approvedFormSubmissionCount + approvedCommentCount,
    reviewQueueCount: pendingFormSubmissionCount + pendingCommentCount,
    safetyFlagCount: spamFormSubmissionCount + reportedCommentCount + spamCommentCount + blockedCommentCount,
  };
};

const countDashboardStatuses = (items: Array<{ status?: string }>) => (
  items.reduce((counts, item) => {
    const status = item.status === 'published' || item.status === 'draft' || item.status === 'scheduled' || item.status === 'archived'
      ? item.status
      : 'other';
    counts[status] += 1;
    return counts;
  }, {
    published: 0,
    draft: 0,
    scheduled: 0,
    archived: 0,
    other: 0,
  })
);

function buildDashboardIssues(data: DashboardData, error: string | null): DashboardIssue[] {
  const readinessErrors = data.readiness.reduce((total, item) => total + item.summary.errors, 0);
  const readinessWarnings = data.readiness.reduce((total, item) => total + item.summary.warnings, 0);
  const storageConfigured = data.settings?.runtimeStorage?.configured;
  const issues: DashboardIssue[] = [];

  if (error) {
    issues.push({
      id: 'dashboard-load-error',
      label: 'Dashboard is using fallback data',
      detail: error,
      severity: 'warning',
      to: '/settings',
    });
  }

  if (readinessErrors > 0) {
    issues.push({
      id: 'readiness-errors',
      label: `${readinessErrors} publish blocker${readinessErrors === 1 ? '' : 's'}`,
      detail: 'Resolve site readiness errors before publishing or handing a route to a custom frontend.',
      severity: 'error',
      to: '/sites',
    });
  }

  if (readinessWarnings > 0) {
    issues.push({
      id: 'readiness-warnings',
      label: `${readinessWarnings} readiness warning${readinessWarnings === 1 ? '' : 's'}`,
      detail: 'Warnings do not block publishing, but they reduce quality for hosted and headless frontends.',
      severity: 'warning',
      to: '/sites',
    });
  }

  if (data.settings?.runtimeStorage && storageConfigured === false) {
    issues.push({
      id: 'storage-config',
      label: 'Media storage needs configuration',
      detail: `Missing ${data.settings.runtimeStorage.missing.join(', ') || 'provider configuration'}.`,
      severity: 'warning',
      to: '/settings',
    });
  }

  if (data.pendingComments > 0) {
    issues.push({
      id: 'pending-comments',
      label: `${data.pendingComments} comment${data.pendingComments === 1 ? '' : 's'} need moderation`,
      detail: 'Approve, reject, or archive visitor discussion before it appears on public frontends.',
      severity: 'warning',
      to: '/comments',
    });
  }

  if (data.commerce.openOrderCount > 0) {
    issues.push({
      id: 'open-orders',
      label: `${data.commerce.openOrderCount} open commerce order${data.commerce.openOrderCount === 1 ? '' : 's'}`,
      detail: 'Review payment, fulfillment, refund, or support state before storefront handoff.',
      severity: 'warning',
      to: '/orders',
    });
  }

  if (data.collections.some((collection) => collection.slug === 'products') && data.commerce.productCount === 0) {
    issues.push({
      id: 'empty-products',
      label: 'Product catalog has no records',
      detail: 'Add products so the public commerce catalog can return sellable items.',
      severity: 'info',
      to: '/products',
    });
  }

  if (data.forms.length === 0 && data.pages.length > 0) {
    issues.push({
      id: 'no-forms',
      label: 'No forms are connected',
      detail: 'Add reusable lead, registration, or contact forms so sites can capture visitor data.',
      severity: 'info',
      to: '/forms',
    });
  }

  if (data.sites.length === 0) {
    issues.push({
      id: 'no-sites',
      label: 'No sites yet',
      detail: 'Create a site before connecting a custom frontend to Backy content.',
      severity: 'info',
      to: '/sites',
    });
  }

  return issues.slice(0, 5);
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  to,
  search,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ElementType;
  to: '/sites' | '/pages' | '/blog' | '/media' | '/users' | '/collections' | '/forms' | '/comments' | '/products' | '/orders';
  search?: { siteId: string };
  tone: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className={cn('flex size-11 items-center justify-center rounded-lg', tone)}>
          <Icon className="size-5" />
        </span>
      </div>
    </Link>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-2">
      <div className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function AnalyticsBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value} · {percent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function DashboardOnboardingStep({
  index,
  label,
  detail,
  ready,
  to,
  search,
}: {
  index: number;
  label: string;
  detail: string;
  ready: boolean;
  to: '/sites' | '/sites/new' | '/pages' | '/pages/new' | '/media' | '/collections' | '/forms' | '/products' | '/users' | '/settings';
  search?: { siteId: string };
}) {
  const Icon = ready ? CheckCircle2 : ArrowRight;

  return (
    <Link
      to={to}
      search={search}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-lg border bg-background px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5',
        ready ? 'border-success/25' : 'border-border',
      )}
    >
      <span className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        ready ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
      )}>
        {ready ? <Icon className="size-4" /> : index}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {label}
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
          )}>
            {ready ? 'Done' : 'Next'}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

type DashboardReadinessRoute =
  | '/settings'
  | '/media'
  | '/sites'
  | '/collections'
  | '/forms'
  | '/products'
  | '/users';

function DashboardReadinessCheck({
  label,
  detail,
  ready,
  to,
  search,
}: {
  label: string;
  detail: string;
  ready: boolean;
  to: DashboardReadinessRoute;
  search?: { siteId: string };
}) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <Link
      to={to}
      search={search}
      className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:bg-accent"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-success' : 'text-warning')} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

function DashboardWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

const infrastructureStatusTone = {
  ready: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  blocked: 'border-destructive/25 bg-destructive/10 text-destructive',
} satisfies Record<SettingsInfrastructureDiagnostic['status'], string>;

function DashboardInfrastructureDiagnosticCard({ diagnostic }: { diagnostic: SettingsInfrastructureDiagnostic }) {
  const Icon = diagnostic.status === 'ready' ? CheckCircle2 : AlertTriangle;
  const requiredFailures = diagnostic.checks.filter((check) => check.required && !check.ready).length;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn('size-4 shrink-0', diagnostic.status === 'ready' ? 'text-success' : diagnostic.status === 'warning' ? 'text-warning' : 'text-destructive')} />
            <h3 className="text-sm font-semibold text-foreground">{diagnostic.label}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{diagnostic.summary}</p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold capitalize', infrastructureStatusTone[diagnostic.status])}>
          {diagnostic.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {diagnostic.checks.map((check) => (
          <div key={check.label} className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-2">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">{check.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{check.detail}</span>
            </span>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              check.ready ? 'bg-success/10 text-success' : check.required ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning',
            )}
            >
              {check.ready ? 'ready' : check.required ? 'required' : 'optional'}
            </span>
          </div>
        ))}
      </div>

      {diagnostic.missing.length > 0 && (
        <p className={cn('mt-3 rounded-md px-2.5 py-2 text-xs leading-5', requiredFailures > 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
          Missing: {diagnostic.missing.join(', ')}
        </p>
      )}
    </div>
  );
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminHost = () => {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const getAdminBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return `${getLocalBackendOrigin()}/api/admin`;
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin());
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

function Index() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = useAuthStore();
  const fallbackStore = useStore();
  const [dashboard, setDashboard] = useState<DashboardData>(() => ({
    ...emptyDashboardData(),
    sites: fallbackStore.sites,
    pages: fallbackStore.pages,
    posts: fallbackStore.posts,
    users: fallbackStore.users,
    media: fallbackStore.media,
    collections: [],
    forms: [],
    contacts: 0,
    comments: 0,
    pendingComments: 0,
    auditLogs: fallbackAuditLogs(fallbackStore.sites, fallbackStore.pages, fallbackStore.posts),
    source: 'fallback',
  }));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(search.siteId || '');
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [infrastructureDiagnostics, setInfrastructureDiagnostics] = useState<SettingsInfrastructureDiagnostic[]>([]);
  const [isCheckingInfrastructure, setIsCheckingInfrastructure] = useState(false);
  const [deploymentRuns, setDeploymentRuns] = useState<DashboardDeploymentRun[]>([]);
  const [isRunningDeployment, setIsRunningDeployment] = useState(false);
  const [isHydratingDashboard, setIsHydratingDashboard] = useState(false);
  const isDashboardBusy = isLoading || isHydratingDashboard || isCheckingInfrastructure || isRunningDeployment;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setIsHydratingDashboard(true);
    setError(null);

    try {
      const permissionsRequest = user?.id
        ? getUserPermissions(user.id).catch((permissionsError) => {
            setPermissionError(permissionsError instanceof Error ? permissionsError.message : 'Unable to load dashboard permissions.');
            return null;
          })
        : Promise.resolve(null);

      const canUseDashboardFromRole = isDashboardPermissionAllowed(null, user, 'dashboard.view');
      const canViewSitesFromRole = isDashboardPermissionAllowed(null, user, 'sites.view');

      if (!canUseDashboardFromRole) {
        throw new Error('Your account does not have dashboard.view permission.');
      }

      const sites = canViewSitesFromRole ? await listSites() : [];
      setDashboard((current) => ({
        ...emptyDashboardData(),
        sites,
        pages: current.source === 'backend' ? current.pages : [],
        posts: current.source === 'backend' ? current.posts : [],
        users: current.source === 'backend' ? current.users : [],
        media: current.source === 'backend' ? current.media : [],
        collections: current.source === 'backend' ? current.collections : [],
        forms: current.source === 'backend' ? current.forms : [],
        contacts: current.source === 'backend' ? current.contacts : 0,
        comments: current.source === 'backend' ? current.comments : 0,
        pendingComments: current.source === 'backend' ? current.pendingComments : 0,
        commerce: current.source === 'backend' ? current.commerce : emptyCommerceMetrics(),
        moderation: current.source === 'backend' ? current.moderation : emptyModerationMetrics(),
        settings: current.source === 'backend' ? current.settings : undefined,
        auditLogs: current.source === 'backend' ? current.auditLogs : [],
        readiness: current.source === 'backend' ? current.readiness : [],
        source: 'backend',
      }));

      const matrix = await permissionsRequest;
      setPermissionMatrix(matrix);
      if (matrix) {
        setPermissionError(null);
      }

      const canUseDashboard = isDashboardPermissionAllowed(matrix, user, 'dashboard.view');
      const canViewSites = isDashboardPermissionAllowed(matrix, user, 'sites.view');
      const canViewUsers = isDashboardPermissionAllowed(matrix, user, 'users.view');
      const canViewSettings = isDashboardPermissionAllowed(matrix, user, 'settings.view');
      const canExportActivity = isDashboardPermissionAllowed(matrix, user, 'activity.export');
      const canViewPages = isDashboardPermissionAllowed(matrix, user, 'pages.view');
      const canViewMedia = isDashboardPermissionAllowed(matrix, user, 'media.view');
      const canViewCollections = isDashboardPermissionAllowed(matrix, user, 'collections.view');
      const canViewForms = isDashboardPermissionAllowed(matrix, user, 'forms.view');
      const canViewComments = isDashboardPermissionAllowed(matrix, user, 'comments.view');
      const canViewCommerce = isDashboardPermissionAllowed(matrix, user, 'commerce.view');

      if (!canUseDashboard) {
        throw new Error('Your account does not have dashboard.view permission.');
      }

      const settings = canViewSettings ? await getSettings().catch(() => undefined) : undefined;
      setDashboard((current) => ({
        ...emptyDashboardData(),
        sites,
        pages: current.source === 'backend' ? current.pages : [],
        posts: current.source === 'backend' ? current.posts : [],
        users: current.source === 'backend' ? current.users : [],
        media: current.source === 'backend' ? current.media : [],
        collections: current.source === 'backend' ? current.collections : [],
        forms: current.source === 'backend' ? current.forms : [],
        contacts: current.source === 'backend' ? current.contacts : 0,
        comments: current.source === 'backend' ? current.comments : 0,
        pendingComments: current.source === 'backend' ? current.pendingComments : 0,
        commerce: current.source === 'backend' ? current.commerce : emptyCommerceMetrics(),
        moderation: current.source === 'backend' ? current.moderation : emptyModerationMetrics(),
        settings,
        auditLogs: current.source === 'backend' ? current.auditLogs : [],
        readiness: current.source === 'backend' ? current.readiness : [],
        source: 'backend',
      }));
      setIsLoading(false);
      const [users, auditResult] = await Promise.all([
        canViewUsers ? listUsers().catch(() => [] as User[]) : Promise.resolve([] as User[]),
        canExportActivity
          ? listAdminAuditLogs({ limit: 8 }).catch(() => ({ logs: [], pagination: { total: 0, limit: 8, offset: 0, hasMore: false } }))
          : Promise.resolve({ logs: [], pagination: { total: 0, limit: 8, offset: 0, hasMore: false } }),
      ]);
      setDashboard((current) => ({
        ...current,
        users,
        auditLogs: auditResult.logs,
        source: 'backend',
      }));
      const selectedSiteIdentifier = search.siteId || selectedSiteId || sites[0]?.publicSiteId || sites[0]?.id || '';
      const selectedSite = selectedSiteIdentifier
        ? sites.find((site) => siteMatchesIdentifier(site, selectedSiteIdentifier))
        : undefined;
      const detailSites = selectedSite ? [selectedSite] : sites.slice(0, 1);
      const [pagesBySite, postsBySite, readinessBySite, mediaBySite] = await Promise.all([
        canViewPages ? Promise.all(detailSites.map((site) => listPages(site.id).catch(() => [] as Page[]))) : Promise.resolve([] as Page[][]),
        canViewPages ? Promise.all(detailSites.map((site) => listBlogPosts(site.id).catch(() => [] as BlogPost[]))) : Promise.resolve([] as BlogPost[][]),
        canViewSites ? Promise.all(detailSites.map((site) => getSiteReadiness(site.id).catch(() => null))) : Promise.resolve([]),
        canViewMedia ? Promise.all(detailSites.map((site) => listMedia({ siteId: site.id, limit: 200 }).catch(() => [] as MediaAsset[]))) : Promise.resolve([] as MediaAsset[][]),
      ]);
      const [collectionsBySite, formsBySite, commentsBySite] = await Promise.all([
        canViewCollections ? Promise.all(detailSites.map((site) => listCollections(site.id).catch(() => [] as Collection[]))) : Promise.resolve([] as Collection[][]),
        canViewForms ? Promise.all(detailSites.map((site) => listForms(site.id).catch(() => [] as FormDefinition[]))) : Promise.resolve([] as FormDefinition[][]),
        canViewComments ? Promise.all(detailSites.map((site) => listComments(site.id, { limit: 100 }).catch(() => null))) : Promise.resolve([]),
      ]);
      const collections = collectionsBySite.flat();
      const forms = formsBySite.flat();
      const contactCounts = await Promise.all(
        canViewForms ? forms.map((form) => listContactCountForDashboard(form.siteId, form.id)) : [],
      );
      const commerce = canViewCommerce ? await loadCommerceMetricsForDashboard(collections) : emptyCommerceMetrics();
      const moderation = canViewForms || canViewComments
        ? await loadModerationMetricsForDashboard(canViewForms ? forms : [], commentsBySite, auditResult.logs)
        : emptyModerationMetrics();

      const media = mediaBySite.flat();
      const defaultMediaSiteId = getDefaultMediaSiteId();
      const defaultSiteAlreadyLoaded = sites.some((site) => site.id === defaultMediaSiteId);
      const defaultSiteMedia = canViewMedia && !defaultSiteAlreadyLoaded
        ? await listMedia({ siteId: defaultMediaSiteId, limit: 200 }).catch(() => [] as MediaAsset[])
        : [];

      setDashboard({
        sites,
        pages: pagesBySite.flat(),
        posts: postsBySite.flat(),
        users,
        media: [...media, ...defaultSiteMedia],
        collections,
        forms,
        contacts: contactCounts.reduce((total, count) => total + count, 0),
        comments: moderation.commentCount,
        pendingComments: moderation.pendingCommentCount,
        commerce,
        moderation,
        settings,
        auditLogs: auditResult.logs,
        readiness: readinessBySite.filter((item): item is SiteReadiness => Boolean(item)),
        source: 'backend',
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load backend dashboard data';
      setError(message);
      setDashboard({
        ...emptyDashboardData(),
        sites: fallbackStore.sites,
        pages: fallbackStore.pages,
        posts: fallbackStore.posts,
        users: fallbackStore.users,
        media: fallbackStore.media,
        collections: [],
        forms: [],
        contacts: 0,
        comments: 0,
        pendingComments: 0,
        commerce: emptyCommerceMetrics(),
        moderation: emptyModerationMetrics(),
        auditLogs: fallbackAuditLogs(fallbackStore.sites, fallbackStore.pages, fallbackStore.posts),
        source: 'fallback',
      });
    } finally {
      setIsLoading(false);
      setIsHydratingDashboard(false);
    }
  }, [fallbackStore.media, fallbackStore.pages, fallbackStore.posts, fallbackStore.sites, fallbackStore.users, user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const requestedSiteId = search.siteId || '';
    const requestedSite = requestedSiteId
      ? dashboard.sites.find((site) => siteMatchesIdentifier(site, requestedSiteId))
      : undefined;
    const nextSiteId = requestedSite?.publicSiteId || requestedSite?.id || requestedSiteId || dashboard.sites[0]?.publicSiteId || dashboard.sites[0]?.id || '';

    if (nextSiteId && nextSiteId !== selectedSiteId) {
      setSelectedSiteId(nextSiteId);
    }
  }, [dashboard.sites, search.siteId, selectedSiteId]);

  const issues = useMemo(() => buildDashboardIssues(dashboard, error), [dashboard, error]);
  const publishedSites = dashboard.sites.filter((site) => site.status === 'published').length;
  const draftPages = dashboard.pages.filter((page) => page.status !== 'published').length;
  const draftPosts = dashboard.posts.filter((post) => post.status !== 'published').length;
  const publishedCollections = dashboard.collections.filter((collection) => collection.status === 'published').length;
  const productsCollection = dashboard.collections.find((collection) => collection.slug === 'products');
  const ordersCollection = dashboard.collections.find((collection) => collection.slug === 'orders');
  const workflowFailureCount = dashboard.auditLogs.filter((log) => {
    const action = log.action.toLowerCase();
    const status = typeof log.metadata?.status === 'string' ? log.metadata.status.toLowerCase() : '';
    const outcome = typeof log.metadata?.outcome === 'string' ? log.metadata.outcome.toLowerCase() : '';
    return action.includes('fail') || action.includes('error') || status === 'failed' || outcome === 'failed';
  }).length;
  const readinessErrors = dashboard.readiness.reduce((total, item) => total + item.summary.errors, 0);
  const readinessWarnings = dashboard.readiness.reduce((total, item) => total + item.summary.warnings, 0);
  const backendHealthy = dashboard.source === 'backend' && !error;
  const storage = dashboard.settings?.runtimeStorage;
  const database = dashboard.settings?.runtimeDatabase;
  const supabase = dashboard.settings?.runtimeSupabase;
  const vercel = dashboard.settings?.runtimeVercel;
  const commerceRuntime = dashboard.settings?.runtimeCommerce;
  const apiKeysConfigured = Boolean(
    dashboard.settings?.apiKeys.publicApiKey && dashboard.settings?.apiKeys.adminApiKey
  );
  const canViewUsers = isDashboardPermissionAllowed(permissionMatrix, user, 'users.view');
  const canViewSites = isDashboardPermissionAllowed(permissionMatrix, user, 'sites.view');
  const canViewSettings = isDashboardPermissionAllowed(permissionMatrix, user, 'settings.view');
  const canConfigureSettings = isDashboardPermissionAllowed(permissionMatrix, user, 'settings.configure');
  const canExportActivity = isDashboardPermissionAllowed(permissionMatrix, user, 'activity.export');
  const canCreateSites = isDashboardPermissionAllowed(permissionMatrix, user, 'sites.create');
  const canEditPages = isDashboardPermissionAllowed(permissionMatrix, user, 'pages.edit');
  const canViewMedia = isDashboardPermissionAllowed(permissionMatrix, user, 'media.view');
  const canViewCollections = isDashboardPermissionAllowed(permissionMatrix, user, 'collections.view');
  const canViewForms = isDashboardPermissionAllowed(permissionMatrix, user, 'forms.view');
  const canCreateForms = isDashboardPermissionAllowed(permissionMatrix, user, 'forms.create');
  const canViewCommerce = isDashboardPermissionAllowed(permissionMatrix, user, 'commerce.view');
  const canEditCommerce = isDashboardPermissionAllowed(permissionMatrix, user, 'commerce.edit');
  const rbacSummary = {
    role: permissionMatrix?.role || user?.role || 'unknown',
    allowed: permissionMatrix?.summary.allowed ?? null,
    total: permissionMatrix?.summary.total ?? null,
    source: permissionMatrix ? 'permission matrix' : 'unavailable',
  };
  const activeSite = dashboard.sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || dashboard.sites[0] || fallbackStore.sites[0];
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = getPublicBaseUrl();
  const adminBaseUrl = getAdminBaseUrl();
  const frontendContractUrls = useMemo<Record<string, string>>(() => ({
    manifest: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/manifest`,
    render: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=/`,
    navigation: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/navigation`,
    media: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/media`,
    collections: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections`,
    products: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/catalog?limit=24&sortBy=title`,
    orderIntake: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`,
    forms: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms`,
    comments: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments`,
    seo: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/seo?format=sitemap`,
  }), [activeSiteId, publicBaseUrl]);
  const adminContractUrls = useMemo(() => ({
    sites: `${adminBaseUrl}/sites`,
    pages: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/pages`,
    blog: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/blog/posts`,
    media: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/media`,
    collections: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections`,
    forms: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms`,
    contacts: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/{formId}/contacts`,
    comments: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/comments`,
    products: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/products/records`,
    orders: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections/orders/records`,
    users: `${adminBaseUrl}/users`,
    settings: `${adminBaseUrl}/settings`,
  }), [activeSiteId, adminBaseUrl]);
  const adminContractUrlEntries = Object.entries(adminContractUrls).filter(([label]) => (
    label === 'users'
      ? canViewUsers
      : label === 'settings'
        ? canViewSettings
        : true
  ));
  const apiConsumerReadiness = useMemo(() => {
    const serviceKeys = dashboard.settings?.auth?.apiKeyServiceKeys || [];
    const activeServiceKeys = serviceKeys.filter((key) => key.status !== 'revoked' && !key.revokedAt).length;
    const revokedServiceKeys = serviceKeys.length - activeServiceKeys;
    const rotationEvents = dashboard.settings?.auth?.apiKeyRotationHistory?.length || 0;
    const revocationEvents = dashboard.settings?.auth?.apiKeyRevocationHistory?.length || 0;
    const apiAuditEvents = dashboard.auditLogs.filter((log) => {
      const action = log.action.toLowerCase();
      const entity = log.entity.toLowerCase();
      return entity === 'settings' && (
        action.includes('api') ||
        action.includes('key') ||
        action.includes('service') ||
        action.includes('auth')
      );
    }).length;

    return {
      publicEndpoints: Object.keys(frontendContractUrls).length,
      adminEndpoints: adminContractUrlEntries.length,
      apiKeysConfigured,
      activeServiceKeys,
      revokedServiceKeys,
      rotationEvents,
      revocationEvents,
      apiAuditEvents,
      deliveryMode: dashboard.settings?.deliveryMode || 'unknown',
    };
  }, [
    adminContractUrlEntries.length,
    apiKeysConfigured,
    dashboard.auditLogs,
    dashboard.settings?.auth?.apiKeyRevocationHistory,
    dashboard.settings?.auth?.apiKeyRotationHistory,
    dashboard.settings?.auth?.apiKeyServiceKeys,
    dashboard.settings?.deliveryMode,
    frontendContractUrls,
  ]);
  const persistenceReadiness = useMemo(() => {
    const missing = [
      ...(database?.missing || []),
      ...(supabase?.missing || []),
    ].filter(Boolean);
    const configuredChecks = [
      Boolean(database?.configured),
      Boolean(supabase?.configured),
      Boolean(supabase?.databaseUrlConfigured || database?.configured),
      Boolean(supabase?.serviceRoleConfigured),
      Boolean(supabase?.storageBucket || storage?.bucket),
    ];
    const readyCount = configuredChecks.filter(Boolean).length;

    return {
      score: Math.round((readyCount / configuredChecks.length) * 100),
      databaseMode: database?.mode || 'unknown',
      databaseProvider: database?.provider || 'unknown',
      databaseConfigured: Boolean(database?.configured),
      databaseTarget: database?.host || database?.path || database?.database || 'not configured',
      repositoryMode: database?.mode === 'database' && database?.configured ? 'database-backed' : 'demo/local fallback',
      supabaseConfigured: Boolean(supabase?.configured),
      supabaseProject: supabase?.projectRef || supabase?.projectUrl || 'not configured',
      supabaseDatabase: Boolean(supabase?.databaseUrlConfigured || database?.configured),
      supabaseAuth: Boolean(supabase?.anonKeyConfigured || supabase?.serviceRoleConfigured),
      serviceRole: Boolean(supabase?.serviceRoleConfigured),
      storageBucket: supabase?.storageBucket || storage?.bucket || 'not configured',
      missing: missing.slice(0, 6),
      note: database?.note || database?.error || '',
    };
  }, [database, storage?.bucket, supabase]);
  const dashboardWorkflowActions: DashboardWorkflowAction[] = [
    { label: 'New site', to: '/sites/new' as const, icon: Globe, detail: 'Website container', visible: canCreateSites },
    { label: 'New page', to: '/pages/new' as const, icon: Layout, detail: 'Visual canvas', visible: canEditPages },
    { label: 'New post', to: '/blog/new' as const, icon: FileText, detail: 'Blog article', visible: canEditPages },
    { label: 'New product', to: '/products' as const, icon: Package, detail: 'Catalog item', visible: canEditCommerce, search: { quickCreate: 'product' as const } },
    { label: 'New form', to: '/forms' as const, icon: ClipboardList, detail: 'Lead capture', visible: canCreateForms, search: { quickCreate: 'blank' as const } },
    { label: 'Media library', to: '/media' as const, icon: HardDrive, detail: 'Images, files, fonts', visible: canViewMedia },
    { label: 'Collections', to: '/collections' as const, icon: Database, detail: 'Structured data', visible: canViewCollections },
    { label: 'Custom frontend', to: '/sites' as const, icon: Code2, detail: 'API handoff', visible: canViewSites },
    { label: 'API setup', to: '/settings' as const, icon: Settings, detail: 'Frontend control', visible: canViewSettings },
  ].filter((action) => action.visible);
  const visibleDashboardModules = DASHBOARD_MODULES.filter((module) => (
    module.href === '/users'
      ? canViewUsers
      : module.href === '/settings'
        ? canViewSettings
        : true
  ));
  const activeUsers = dashboard.users.filter((item) => item.status === 'active');
  const activeOwnerUsers = activeUsers.filter((item) => item.role === 'owner');
  const activeAdminUsers = activeUsers.filter((item) => item.role === 'admin');
  const activePrivilegedUserCount = activeOwnerUsers.length + activeAdminUsers.length;
  const ownerAccessState = !canViewUsers
    ? 'hidden'
    : activeOwnerUsers.length === 0
      ? 'blocked'
      : activeOwnerUsers.length > 1
        ? 'review'
        : 'ready';
  const ownerAccessMessage = !canViewUsers
    ? 'Owner/admin counts are hidden for this role.'
    : activeOwnerUsers.length === 0
      ? 'No active owner is visible. Restore owner access before production changes.'
      : activeOwnerUsers.length > 1
        ? 'Multiple active owners. Review access if any setup account should be demoted or removed.'
        : 'One active owner is available for protected workspace changes.';
  const getDashboardRouteSearch = (
    to: DashboardRouteTarget,
  ) => {
    if (to === '/pages/new') {
      return { siteId: activeSiteId, templateSource: 'backy-canvas' as const, focus: 'canvas' as const };
    }
    if (to === '/blog/new') {
      return { siteId: activeSiteId, templateSource: 'backy-canvas' as const, focus: 'canvas' as const };
    }
    return ['/sites', '/pages', '/blog', '/media', '/collections', '/forms', '/comments', '/products', '/orders', '/users'].includes(to)
      ? { siteId: activeSiteId }
      : undefined;
  };
  const buildDashboardPageCreateRoute = useCallback((template?: DashboardPageCreateTemplate) => {
    const params = new URLSearchParams({
      siteId: activeSiteId,
      templateSource: 'backy-canvas',
      focus: 'canvas',
    });
    if (template) {
      params.set('template', template);
    }
    return `/pages/new?${params.toString()}`;
  }, [activeSiteId]);
  const getDashboardPageCreateSearch = (template?: DashboardPageCreateTemplate) => ({
    siteId: activeSiteId,
    templateSource: 'backy-canvas' as const,
    focus: 'canvas' as const,
    ...(template ? { template } : {}),
  });
  const getDashboardWorkflowActionSearch = (action: DashboardWorkflowAction) => {
    if (action.search?.quickCreate === 'product') {
      return { siteId: activeSiteId, quickCreate: 'product' as const };
    }
    if (action.search?.quickCreate === 'blank') {
      return { siteId: activeSiteId, quickCreate: 'blank' as const };
    }

    return getDashboardRouteSearch(action.to);
  };
  const selectDashboardSite = (nextSiteId: string) => {
    if (isCheckingInfrastructure || isRunningDeployment) return;

    setSelectedSiteId(nextSiteId);
    navigate({ to: '/', search: { siteId: nextSiteId }, replace: true });
  };
  const deploymentHealth = useMemo(() => {
    const vercelSettings = dashboard.settings?.integrations?.vercel;
    const persistedRuns = [...(vercelSettings?.deploymentHistory || [])].sort((first, second) => (
      new Date(second.checkedAt).getTime() - new Date(first.checkedAt).getTime()
    ));
    const lastPersistedRun = persistedRuns[0];
    const lastSessionRun = deploymentRuns[0];
    const lastRun = lastSessionRun
      ? {
        status: lastSessionRun.status,
        checkedAt: lastSessionRun.createdAt,
        requestId: lastSessionRun.requestId,
        targetUrl: lastSessionRun.targetUrl,
        blocked: lastSessionRun.blocked,
        warnings: lastSessionRun.warnings,
        ready: lastSessionRun.ready,
        source: 'session preflight',
      }
      : lastPersistedRun
        ? {
          status: lastPersistedRun.status,
          checkedAt: lastPersistedRun.checkedAt,
          requestId: lastPersistedRun.requestId,
          targetUrl: lastPersistedRun.productionDomain || vercel?.url || '',
          blocked: lastPersistedRun.blockedCount,
          warnings: lastPersistedRun.warningCount,
          ready: lastPersistedRun.readyCount,
          source: 'settings history',
        }
        : null;
    const targetDomain = vercel?.url || vercelSettings?.productionDomain || activeSite?.customDomain || (activeSite?.slug ? `${activeSite.slug}.backy.app` : '');
    const projectConfigured = Boolean(vercel?.configured || vercelSettings?.projectId);
    const deployTokenReady = !vercelSettings?.autoDeploy || Boolean(vercel?.tokenConfigured);
    const domainConfigured = Boolean(targetDomain);
    const deploymentEvents = dashboard.auditLogs.filter((log) => {
      const action = log.action.toLowerCase();
      const entity = log.entity.toLowerCase();
      return action.includes('deploy') || action.includes('rebuild') || action.includes('cache') || action.includes('invalidation') || entity.includes('deploy');
    }).length;
    const readyCount = [projectConfigured, deployTokenReady, domainConfigured, Boolean(lastRun)].filter(Boolean).length;

    return {
      score: Math.round((readyCount / 4) * 100),
      projectStatus: projectConfigured ? 'Configured' : 'Needs project metadata',
      projectId: vercelSettings?.projectId || vercel?.projectId || '',
      environment: vercel?.environment || 'unknown',
      autoDeploy: Boolean(vercelSettings?.autoDeploy),
      previewDeployments: vercelSettings?.previewDeployments !== false,
      deployTokenReady,
      targetDomain,
      domainStatus: domainConfigured ? 'Domain present' : 'Missing domain',
      lastRun,
      lastDeployLabel: lastRun ? `${lastRun.status} on ${formatDate(lastRun.checkedAt)}` : 'No deploy check recorded',
      cacheRebuildStatus: deploymentEvents > 0 || lastRun ? 'Audit/preflight recorded' : 'Not recorded',
      deploymentEvents,
      historyCount: persistedRuns.length + deploymentRuns.length,
    };
  }, [
    activeSite?.customDomain,
    activeSite?.slug,
    dashboard.auditLogs,
    dashboard.settings?.integrations?.vercel,
    deploymentRuns,
    vercel,
  ]);
  const customFrontendPublicHost = getSitePrimaryHost(activeSite, {
    requestedIdentifier: search.siteId || selectedSiteId,
    preferVerifiedAlias: true,
    fallbackSiteId: activeSiteId,
  });
  const customFrontendLaunch = useMemo(() => buildDashboardCustomFrontendLaunch({
    activeSiteId,
    activeSiteName: activeSite?.name || activeSiteId,
    customFrontendPublicHost,
    publicBaseUrl,
  }), [
    activeSite?.name,
    activeSiteId,
    customFrontendPublicHost,
    publicBaseUrl,
  ]);
  const customFrontendControlReadiness = useMemo(() => buildDashboardCustomFrontendControlReadiness({
    activeSiteId,
    frontendDesign: activeSite?.settings?.frontendDesign || null,
    publicApiBase: customFrontendLaunch.publicApiBase,
  }), [activeSite?.settings?.frontendDesign, activeSiteId, customFrontendLaunch.publicApiBase]);
  const customFrontendContentCreation = useMemo(() => buildDashboardCustomFrontendContentCreation({
    activeSiteId,
    frontendDesign: activeSite?.settings?.frontendDesign || null,
  }), [activeSite?.settings?.frontendDesign, activeSiteId]);
  const customFrontendAgentBrief = useMemo(() => buildDashboardCustomFrontendAgentBrief({
    launch: customFrontendLaunch,
    readiness: customFrontendControlReadiness,
    contentCreation: customFrontendContentCreation,
  }), [customFrontendContentCreation, customFrontendControlReadiness, customFrontendLaunch]);
  const customFrontendBrowserEnvText = useMemo(() => Object.entries(customFrontendLaunch.browserSafeEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'), [customFrontendLaunch.browserSafeEnv]);
  const customFrontendServerEnvText = useMemo(() => Object.entries(customFrontendLaunch.serverSideEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'), [customFrontendLaunch.serverSideEnv]);
  const customFrontendNextActionText = useMemo(
    () => JSON.stringify(customFrontendControlReadiness.nextAction, null, 2),
    [customFrontendControlReadiness.nextAction],
  );
  const customFrontendAgentBriefText = useMemo(
    () => JSON.stringify(customFrontendAgentBrief, null, 2),
    [customFrontendAgentBrief],
  );
  const frontendHandoff = useMemo(() => ({
    schemaVersion: 'backy.dashboard-handoff.v1',
    generatedAt: new Date().toISOString(),
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
      domain: activeSite?.customDomain || (activeSite?.slug ? `${activeSite.slug}.backy.app` : undefined),
    },
    deliveryMode: dashboard.settings?.deliveryMode || 'unknown',
    health: {
      source: dashboard.source,
      backend: backendHealthy ? 'reachable' : 'fallback',
      storage: storage ? { provider: storage.provider, configured: storage.configured, missing: storage.missing || [] } : null,
      database: database ? { provider: database.provider, configured: database.configured, missing: database.missing || [] } : null,
      supabase: supabase ? { configured: supabase.configured, missing: supabase.missing || [] } : null,
      vercel: vercel ? { configured: vercel.configured, missing: vercel.missing || [] } : null,
      readiness: { errors: readinessErrors, warnings: readinessWarnings },
    },
    attention: {
      issueCount: issues.length,
      issues: issues.map((issue) => ({
        id: issue.id,
        severity: issue.severity,
        label: issue.label,
        detail: issue.detail,
        route: issue.to,
      })),
    },
    publicEndpoints: frontendContractUrls,
    adminEndpoints: Object.fromEntries(adminContractUrlEntries),
    customFrontendLaunch,
    customFrontendControlReadiness,
    customFrontendContentCreation,
    customFrontendAgentBrief,
    apiConsumers: {
      publicEndpointCount: apiConsumerReadiness.publicEndpoints,
      adminEndpointCount: apiConsumerReadiness.adminEndpoints,
      apiKeysConfigured: apiConsumerReadiness.apiKeysConfigured,
      activeServiceKeys: apiConsumerReadiness.activeServiceKeys,
      revokedServiceKeys: apiConsumerReadiness.revokedServiceKeys,
      rotationEvents: apiConsumerReadiness.rotationEvents,
      revocationEvents: apiConsumerReadiness.revocationEvents,
      recentApiAuditEvents: apiConsumerReadiness.apiAuditEvents,
    },
    persistence: {
      score: persistenceReadiness.score,
      databaseMode: persistenceReadiness.databaseMode,
      databaseProvider: persistenceReadiness.databaseProvider,
      databaseConfigured: persistenceReadiness.databaseConfigured,
      repositoryMode: persistenceReadiness.repositoryMode,
      supabaseConfigured: persistenceReadiness.supabaseConfigured,
      supabaseDatabase: persistenceReadiness.supabaseDatabase,
      supabaseAuth: persistenceReadiness.supabaseAuth,
      serviceRoleConfigured: persistenceReadiness.serviceRole,
      storageBucket: persistenceReadiness.storageBucket,
      missing: persistenceReadiness.missing,
    },
    deployment: {
      score: deploymentHealth.score,
      projectStatus: deploymentHealth.projectStatus,
      projectId: deploymentHealth.projectId,
      environment: deploymentHealth.environment,
      autoDeploy: deploymentHealth.autoDeploy,
      previewDeployments: deploymentHealth.previewDeployments,
      deployTokenReady: deploymentHealth.deployTokenReady,
      targetDomain: deploymentHealth.targetDomain,
      domainStatus: deploymentHealth.domainStatus,
      lastDeployLabel: deploymentHealth.lastDeployLabel,
      cacheRebuildStatus: deploymentHealth.cacheRebuildStatus,
      deploymentEvents: deploymentHealth.deploymentEvents,
      historyCount: deploymentHealth.historyCount,
    },
    controlRoutes: {
      sites: '/sites',
      pages: `/pages?siteId=${encodeURIComponent(activeSiteId)}`,
      pageBuilder: buildDashboardPageCreateRoute(),
      contactPageTemplate: buildDashboardPageCreateRoute('contact'),
      registrationPageTemplate: buildDashboardPageCreateRoute('registration'),
      storefrontPageTemplate: buildDashboardPageCreateRoute('storefront'),
      blogIndexPageTemplate: buildDashboardPageCreateRoute('blog-index'),
      blog: `/blog?siteId=${encodeURIComponent(activeSiteId)}`,
      media: `/media?siteId=${encodeURIComponent(activeSiteId)}`,
      collections: `/collections?siteId=${encodeURIComponent(activeSiteId)}`,
      forms: `/forms?siteId=${encodeURIComponent(activeSiteId)}`,
      contacts: `/contacts?siteId=${encodeURIComponent(activeSiteId)}`,
      comments: `/comments?siteId=${encodeURIComponent(activeSiteId)}`,
      products: `/products?siteId=${encodeURIComponent(activeSiteId)}`,
      orders: `/orders?siteId=${encodeURIComponent(activeSiteId)}`,
      users: `/users?siteId=${encodeURIComponent(activeSiteId)}`,
      settings: '/settings',
    },
    commerce: {
      catalogEndpoint: frontendContractUrls.products,
      orderIntakeEndpoint: frontendContractUrls.orderIntake,
      productCount: dashboard.commerce.productCount,
      loadedProductCount: dashboard.commerce.loadedProductCount,
      lowStockProductCount: dashboard.commerce.lowStockProductCount,
      outOfStockProductCount: dashboard.commerce.outOfStockProductCount,
      checkoutConfiguredProductCount: dashboard.commerce.checkoutConfiguredProductCount,
      orderCount: dashboard.commerce.orderCount,
      openOrderCount: dashboard.commerce.openOrderCount,
      paidOrderCount: dashboard.commerce.paidOrderCount,
      failedOrderCount: dashboard.commerce.failedOrderCount,
      loadedOrderValue: dashboard.commerce.loadedOrderValue,
      currency: dashboard.commerce.currency,
      productsCollection: productsCollection
        ? { id: productsCollection.id, status: productsCollection.status, publicRead: productsCollection.permissions.publicRead }
        : null,
      ordersCollection: ordersCollection
        ? { id: ordersCollection.id, status: ordersCollection.status, publicRead: ordersCollection.permissions.publicRead }
        : null,
    },
    moderation: {
      formSubmissionCount: dashboard.moderation.formSubmissionCount,
      loadedFormSubmissionCount: dashboard.moderation.loadedFormSubmissionCount,
      pendingFormSubmissionCount: dashboard.moderation.pendingFormSubmissionCount,
      approvedFormSubmissionCount: dashboard.moderation.approvedFormSubmissionCount,
      rejectedFormSubmissionCount: dashboard.moderation.rejectedFormSubmissionCount,
      spamFormSubmissionCount: dashboard.moderation.spamFormSubmissionCount,
      manualReviewFormCount: dashboard.moderation.manualReviewFormCount,
      spamGuardedFormCount: dashboard.moderation.spamGuardedFormCount,
      commentCount: dashboard.moderation.commentCount,
      loadedCommentCount: dashboard.moderation.loadedCommentCount,
      pendingCommentCount: dashboard.moderation.pendingCommentCount,
      approvedCommentCount: dashboard.moderation.approvedCommentCount,
      reportedCommentCount: dashboard.moderation.reportedCommentCount,
      spamCommentCount: dashboard.moderation.spamCommentCount,
      blockedCommentCount: dashboard.moderation.blockedCommentCount,
      moderationAuditEvents: dashboard.moderation.moderationAuditEvents,
      approvalThroughputCount: dashboard.moderation.approvalThroughputCount,
      reviewQueueCount: dashboard.moderation.reviewQueueCount,
      safetyFlagCount: dashboard.moderation.safetyFlagCount,
    },
    modules: visibleDashboardModules.map((module) => ({
      title: module.title,
      status: module.status,
      adminPath: module.href,
      detail: module.detail,
    })),
    counts: {
      sites: dashboard.sites.length,
      pages: dashboard.pages.length,
      posts: dashboard.posts.length,
      collections: dashboard.collections.length,
      forms: dashboard.forms.length,
      media: dashboard.media.length,
      comments: dashboard.comments,
      pendingComments: dashboard.pendingComments,
      contacts: dashboard.contacts,
      formSubmissions: dashboard.moderation.formSubmissionCount,
      products: dashboard.commerce.productCount,
      orders: dashboard.commerce.orderCount,
    },
  }), [
    activeSite,
    activeSiteId,
    adminContractUrlEntries,
    apiConsumerReadiness,
    backendHealthy,
    buildDashboardPageCreateRoute,
    customFrontendAgentBrief,
    customFrontendContentCreation,
    customFrontendControlReadiness,
    customFrontendLaunch,
    dashboard.collections.length,
    dashboard.comments,
    dashboard.contacts,
    dashboard.commerce,
    deploymentHealth,
    dashboard.forms.length,
    dashboard.media.length,
    dashboard.moderation,
    dashboard.pages.length,
    dashboard.pendingComments,
    dashboard.posts.length,
    dashboard.settings?.deliveryMode,
    dashboard.sites.length,
    dashboard.source,
    database,
    frontendContractUrls,
    issues,
    ordersCollection,
    productsCollection,
    persistenceReadiness,
    readinessErrors,
    readinessWarnings,
    storage,
    supabase,
    vercel,
    visibleDashboardModules,
  ]);
  const frontendHandoffText = useMemo(() => JSON.stringify(frontendHandoff, null, 2), [frontendHandoff]);
  const infrastructureDiagnosticSummary = useMemo(() => {
    const ready = infrastructureDiagnostics.filter((item) => item.status === 'ready').length;
    const warning = infrastructureDiagnostics.filter((item) => item.status === 'warning').length;
    const blocked = infrastructureDiagnostics.filter((item) => item.status === 'blocked').length;

    return { ready, warning, blocked, total: infrastructureDiagnostics.length };
  }, [infrastructureDiagnostics]);
  const platformReadiness = useMemo(() => {
    const hasPublicContent = publishedSites > 0 && (
      dashboard.pages.some((page) => page.status === 'published') ||
      dashboard.posts.some((post) => post.status === 'published') ||
      publishedCollections > 0
    );
    const hasCommerce = Boolean(productsCollection && ordersCollection);
    const checks = [
      {
        label: 'Backend API',
        detail: backendHealthy ? 'Admin and public APIs are reachable.' : 'Dashboard is using fallback data.',
        ready: backendHealthy,
        to: '/settings' as const,
        visible: true,
      },
      {
        label: 'API keys',
        detail: apiKeysConfigured ? 'Public and admin API keys are configured.' : 'Configure API keys before external frontend handoff.',
        ready: apiKeysConfigured,
        to: '/settings' as const,
        visible: canViewSettings,
      },
      {
        label: 'Database',
        detail: database?.configured ? `${database.provider} is configured.` : 'Configure the runtime database or Supabase connection.',
        ready: Boolean(database?.configured || supabase?.configured),
        to: '/settings' as const,
        visible: canViewSettings,
      },
      {
        label: 'Storage',
        detail: storage?.configured ? `${storage.provider} storage is ready.` : 'Configure central file storage for media delivery.',
        ready: Boolean(storage?.configured),
        to: '/media' as const,
        visible: canViewSettings || canViewMedia,
      },
      {
        label: 'Vercel',
        detail: vercel?.configured ? 'Deployment integration is connected.' : 'Connect Vercel when hosted frontend deployment is required.',
        ready: Boolean(vercel?.configured),
        to: '/settings' as const,
        visible: canViewSettings,
      },
      {
        label: 'Sites and content',
        detail: hasPublicContent ? 'Published site content is available for rendering.' : 'Publish a site and at least one page, post, or collection.',
        ready: hasPublicContent,
        to: '/sites' as const,
        visible: true,
      },
      {
        label: 'Media library',
        detail: dashboard.media.length > 0 ? `${dashboard.media.length} assets available.` : 'Upload images, files, fonts, or downloads.',
        ready: dashboard.media.length > 0,
        to: '/media' as const,
        visible: canViewMedia,
      },
      {
        label: 'Dynamic data',
        detail: dashboard.collections.length > 0 ? `${dashboard.collections.length} collections loaded.` : 'Create collections for reusable frontend data.',
        ready: dashboard.collections.length > 0,
        to: '/collections' as const,
        visible: canViewCollections,
      },
      {
        label: 'Forms and leads',
        detail: dashboard.forms.length > 0 ? `${dashboard.forms.length} forms, ${dashboard.contacts} contacts.` : 'Add lead, registration, or contact forms.',
        ready: dashboard.forms.length > 0,
        to: '/forms' as const,
        visible: canViewForms,
      },
      {
        label: 'Commerce',
        detail: hasCommerce ? 'Products and orders schemas are present.' : 'Sync product and order schemas for selling workflows.',
        ready: hasCommerce,
        to: hasCommerce ? '/products' as const : '/collections' as const,
        visible: canViewCommerce,
      },
      {
        label: 'Team access',
        detail: activePrivilegedUserCount > 0
          ? `${activeUsers.length} active users · ${activeOwnerUsers.length} owner · ${activeAdminUsers.length} admin.`
          : 'Keep at least one active owner/admin.',
        ready: activePrivilegedUserCount > 0,
        to: '/users' as const,
        visible: canViewUsers,
      },
      {
        label: 'Readiness blockers',
        detail: readinessErrors === 0 ? `${readinessWarnings} readiness warnings.` : `${readinessErrors} errors block publish handoff.`,
        ready: readinessErrors === 0,
        to: '/sites' as const,
        visible: true,
      },
    ].filter((check) => check.visible);
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      readyCount,
      total: checks.length,
      checks,
      workflow: [
        { label: 'Configure', detail: 'Connect API keys, storage, database/Supabase, and Vercel.' },
        { label: 'Model', detail: 'Build sites, pages, media, collections, forms, products, and orders.' },
        { label: 'Publish', detail: 'Resolve readiness blockers and expose public contracts.' },
        { label: 'Handoff', detail: 'Copy or download the frontend manifest for any custom UI.' },
      ],
    };
  }, [
    apiKeysConfigured,
    backendHealthy,
    canViewCollections,
    canViewCommerce,
    canViewForms,
    canViewMedia,
    canViewSettings,
    canViewUsers,
    activeAdminUsers.length,
    activeOwnerUsers.length,
    activePrivilegedUserCount,
    activeUsers.length,
    dashboard.collections.length,
    dashboard.contacts,
    dashboard.forms.length,
    dashboard.media.length,
    dashboard.pages,
    dashboard.posts,
    dashboard.users,
    database,
    ordersCollection,
    productsCollection,
    publishedCollections,
    publishedSites,
    readinessErrors,
    readinessWarnings,
    storage,
    supabase,
    vercel,
  ]);

  const copyDashboardText = async (value: string, label: string) => {
    if (isDashboardBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const downloadFrontendHandoff = () => {
    if (isDashboardBusy) return;

    const blob = new Blob([frontendHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const runInfrastructureCheck = async () => {
    if (!dashboard.settings || isCheckingInfrastructure || !canConfigureSettings) return;

    setIsCheckingInfrastructure(true);
    setNotice(null);
    setError(null);

    try {
      const result = await validateSettingsInfrastructure({
        deliveryMode: dashboard.settings.deliveryMode,
        integrations: dashboard.settings.integrations,
      });
      setInfrastructureDiagnostics(result.diagnostics);
      const blocked = result.diagnostics.filter((item) => item.status === 'blocked').length;
      const warning = result.diagnostics.filter((item) => item.status === 'warning').length;
      setNotice(`Infrastructure check complete: ${blocked} blocked, ${warning} warning.`);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Unable to validate infrastructure settings.');
    } finally {
      setIsCheckingInfrastructure(false);
    }
  };

  const runDeploymentPreflight = async () => {
    if (!dashboard.settings || isRunningDeployment || !canConfigureSettings) return;

    setIsRunningDeployment(true);
    setNotice(null);
    setError(null);

    try {
      const result = await validateSettingsInfrastructure({
        deliveryMode: dashboard.settings.deliveryMode,
        integrations: dashboard.settings.integrations,
      });
      setInfrastructureDiagnostics(result.diagnostics);
      const blocked = result.diagnostics.filter((item) => item.status === 'blocked').length;
      const warnings = result.diagnostics.filter((item) => item.status === 'warning').length;
      const ready = result.diagnostics.filter((item) => item.status === 'ready').length;
      const status: DashboardDeploymentRun['status'] = blocked > 0 ? 'blocked' : warnings > 0 ? 'warning' : 'ready';
      const targetUrl = vercel?.url || dashboard.settings.integrations?.vercel?.productionDomain || activeSite?.customDomain || `${activeSite?.slug || activeSiteId}.backy.app`;
      const run: DashboardDeploymentRun = {
        id: `deploy_${Date.now().toString(36)}`,
        siteId: activeSiteId,
        siteName: activeSite?.name || activeSiteId,
        createdAt: result.generatedAt || new Date().toISOString(),
        status,
        blocked,
        warnings,
        ready,
        targetUrl,
        requestId: result.requestId,
      };
      setDeploymentRuns((current) => [run, ...current].slice(0, 6));
      setNotice(
        status === 'ready'
          ? 'Deployment preflight passed. The current target is ready for deploy handoff.'
          : `Deployment preflight complete: ${blocked} blocked, ${warnings} warning.`,
      );
    } catch (deployError) {
      setError(deployError instanceof Error ? deployError.message : 'Unable to run deployment preflight.');
    } finally {
      setIsRunningDeployment(false);
    }
  };

  const commerceValueLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: dashboard.commerce.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(dashboard.commerce.loadedOrderValue);
  const commerceHealth = useMemo(() => {
    const paymentProvider = commerceRuntime?.paymentProvider || 'none';
    const taxProvider = commerceRuntime?.taxProvider || 'manual';
    const shippingProvider = commerceRuntime?.shippingProvider || 'manual';
    const discountProvider = commerceRuntime?.discountProvider || 'manual';
    const paymentReady = paymentProvider === 'stripe'
      ? Boolean(commerceRuntime?.stripeSecretConfigured)
      : paymentProvider === 'manual';
    const taxReady = taxProvider === 'manual'
      || (taxProvider === 'http' && Boolean(dashboard.settings?.integrations?.commerce?.taxProviderUrl))
      || (taxProvider === 'stripe' && Boolean(commerceRuntime?.stripeSecretConfigured))
      || (taxProvider === 'taxjar' && Boolean(commerceRuntime?.taxJarApiKeyConfigured))
      || (taxProvider === 'avalara' && Boolean(
        commerceRuntime?.avalaraAccountConfigured &&
        commerceRuntime?.avalaraLicenseKeyConfigured &&
        commerceRuntime?.avalaraCompanyCodeConfigured
      ));
    const shippingReady = shippingProvider === 'manual'
      || (shippingProvider === 'http' && Boolean(dashboard.settings?.integrations?.commerce?.shippingProviderUrl))
      || (shippingProvider === 'easypost' && Boolean(commerceRuntime?.easyPostApiKeyConfigured))
      || (shippingProvider === 'shippo' && Boolean(commerceRuntime?.shippoApiKeyConfigured));
    const discountReady = discountProvider === 'manual'
      || (discountProvider === 'http' && Boolean(dashboard.settings?.integrations?.commerce?.discountProviderUrl))
      || (discountProvider === 'stripe' && Boolean(commerceRuntime?.stripeSecretConfigured));
    const checkoutSampleSize = dashboard.commerce.loadedProductCount || dashboard.commerce.productCount;
    const checkoutCoverage = checkoutSampleSize > 0
      ? Math.round((dashboard.commerce.checkoutConfiguredProductCount / checkoutSampleSize) * 100)
      : 0;
    const readyCount = [paymentReady, taxReady, shippingReady, discountReady].filter(Boolean).length;

    return {
      paymentProvider,
      taxProvider,
      shippingProvider,
      discountProvider,
      paymentReady,
      taxReady,
      shippingReady,
      discountReady,
      checkoutSampleSize,
      checkoutCoverage,
      setupScore: Math.round((readyCount / 4) * 100),
      inventoryWarnings: dashboard.commerce.lowStockProductCount + dashboard.commerce.outOfStockProductCount,
    };
  }, [
    commerceRuntime,
    dashboard.commerce.checkoutConfiguredProductCount,
    dashboard.commerce.loadedProductCount,
    dashboard.commerce.lowStockProductCount,
    dashboard.commerce.outOfStockProductCount,
    dashboard.commerce.productCount,
    dashboard.settings?.integrations?.commerce?.discountProviderUrl,
    dashboard.settings?.integrations?.commerce?.shippingProviderUrl,
    dashboard.settings?.integrations?.commerce?.taxProviderUrl,
  ]);
  const moderationHealth = useMemo(() => {
    const readinessChecks = [
      dashboard.moderation.reviewQueueCount === 0,
      dashboard.moderation.safetyFlagCount === 0,
      dashboard.forms.length === 0 || dashboard.moderation.spamGuardedFormCount > 0,
      dashboard.moderation.loadedFormSubmissionCount === dashboard.moderation.formSubmissionCount,
      dashboard.moderation.loadedCommentCount === dashboard.moderation.commentCount,
    ];
    const readyCount = readinessChecks.filter(Boolean).length;

    return {
      score: Math.round((readyCount / readinessChecks.length) * 100),
      pendingSubmissions: dashboard.moderation.pendingFormSubmissionCount,
      pendingComments: dashboard.moderation.pendingCommentCount,
      spamReports: dashboard.moderation.safetyFlagCount,
      approvalThroughput: dashboard.moderation.approvalThroughputCount,
      reviewQueue: dashboard.moderation.reviewQueueCount,
      sampleComplete: (
        dashboard.moderation.loadedFormSubmissionCount === dashboard.moderation.formSubmissionCount &&
        dashboard.moderation.loadedCommentCount === dashboard.moderation.commentCount
      ),
    };
  }, [
    dashboard.forms.length,
    dashboard.moderation,
  ]);
  const aggregateAnalytics = useMemo(() => {
    const pageStatusCounts = countDashboardStatuses(dashboard.pages);
    const postStatusCounts = countDashboardStatuses(dashboard.posts);
    const collectionStatusCounts = countDashboardStatuses(dashboard.collections);
    const contentTotal = dashboard.pages.length + dashboard.posts.length + dashboard.collections.length;
    const publishedContent = pageStatusCounts.published + postStatusCounts.published + collectionStatusCounts.published;
    const readinessAverage = dashboard.readiness.length > 0
      ? Math.round(dashboard.readiness.reduce((total, item) => total + item.score, 0) / dashboard.readiness.length)
      : 0;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentAuditLogs = dashboard.auditLogs.filter((log) => new Date(log.createdAt).getTime() >= sevenDaysAgo);
    const creates = recentAuditLogs.filter((log) => log.action.toLowerCase().includes('create')).length;
    const updates = recentAuditLogs.filter((log) => log.action.toLowerCase().includes('update')).length;
    const deletes = recentAuditLogs.filter((log) => log.action.toLowerCase().includes('delete')).length;

    return {
      contentTotal,
      publishedContent,
      draftContent: pageStatusCounts.draft + postStatusCounts.draft + collectionStatusCounts.draft,
      scheduledContent: pageStatusCounts.scheduled + postStatusCounts.scheduled + collectionStatusCounts.scheduled,
      archivedContent: pageStatusCounts.archived + postStatusCounts.archived + collectionStatusCounts.archived,
      readinessAverage,
      recentActivity: recentAuditLogs.length,
      creates,
      updates,
      deletes,
      contactsPerForm: dashboard.forms.length > 0 ? Math.round(dashboard.contacts / dashboard.forms.length) : 0,
      pendingCommentRate: dashboard.comments > 0 ? Math.round((dashboard.pendingComments / dashboard.comments) * 100) : 0,
    };
  }, [
    dashboard.auditLogs,
    dashboard.collections,
    dashboard.comments,
    dashboard.contacts,
    dashboard.forms.length,
    dashboard.pages,
    dashboard.pendingComments,
    dashboard.posts,
    dashboard.readiness,
  ]);
  const onboardingSteps = useMemo(() => ([
    {
      label: 'Create a workspace site',
      detail: dashboard.sites.length > 0
        ? `${dashboard.sites.length} site${dashboard.sites.length === 1 ? '' : 's'} available for Backy content.`
        : 'Create the first website container before adding pages or frontend contracts.',
      ready: dashboard.sites.length > 0,
      to: dashboard.sites.length > 0 ? '/sites' as const : '/sites/new' as const,
    },
    {
      label: 'Publish editable content',
      detail: aggregateAnalytics.publishedContent > 0
        ? `${aggregateAnalytics.publishedContent} published content objects are ready for hosted or headless delivery.`
        : 'Create and publish at least one page, blog post, or collection-backed route.',
      ready: aggregateAnalytics.publishedContent > 0,
      to: dashboard.pages.length > 0 ? '/pages' as const : '/pages/new' as const,
    },
    {
      label: 'Upload media assets',
      detail: dashboard.media.length > 0
        ? `${dashboard.media.length} media assets are available for pages, posts, products, and custom frontends.`
        : 'Upload images, fonts, downloads, or files to the central media library.',
      ready: dashboard.media.length > 0,
      to: '/media' as const,
    },
    {
      label: 'Model dynamic data',
      detail: dashboard.collections.length > 0
        ? `${dashboard.collections.length} collections are available for datasets and public APIs.`
        : 'Create collections for structured CMS records, repeaters, listings, and dynamic routes.',
      ready: dashboard.collections.length > 0,
      to: '/collections' as const,
    },
    {
      label: 'Capture leads and registrations',
      detail: dashboard.forms.length > 0
        ? `${dashboard.forms.length} forms and ${dashboard.contacts} contacts are connected.`
        : 'Add contact, lead, registration, or custom submission forms.',
      ready: dashboard.forms.length > 0,
      to: '/forms' as const,
    },
    {
      label: 'Prepare commerce',
      detail: productsCollection && ordersCollection
        ? `${dashboard.commerce.productCount} products and ${dashboard.commerce.orderCount} orders are represented in Backy commerce.`
        : 'Sync product and private order schemas before selling from a storefront.',
      ready: Boolean(productsCollection && ordersCollection),
      to: productsCollection ? '/products' as const : '/collections' as const,
    },
    {
      label: 'Invite admins',
      detail: dashboard.users.length > 0
        ? `${dashboard.users.length} admin user${dashboard.users.length === 1 ? '' : 's'} can access the workspace.`
        : 'Invite at least one owner or admin before production use.',
      ready: dashboard.users.length > 0,
      to: '/users' as const,
      visible: canViewUsers,
    },
    {
      label: 'Connect APIs and infrastructure',
      detail: apiKeysConfigured && (database?.configured || supabase?.configured) && storage?.configured
        ? 'API keys, persistence, and media storage are configured.'
        : 'Configure API keys, persistence, media storage, Supabase, and deployment integrations.',
      ready: Boolean(apiKeysConfigured && (database?.configured || supabase?.configured) && storage?.configured),
      to: '/settings' as const,
      visible: canViewSettings,
    },
  ].filter((step) => step.visible !== false)), [
    aggregateAnalytics.publishedContent,
    apiKeysConfigured,
    canViewSettings,
    canViewUsers,
    dashboard.collections.length,
    dashboard.commerce.orderCount,
    dashboard.commerce.productCount,
    dashboard.contacts,
    dashboard.forms.length,
    dashboard.media.length,
    dashboard.pages.length,
    dashboard.sites.length,
    dashboard.users.length,
    database?.configured,
    ordersCollection,
    productsCollection,
    storage?.configured,
    supabase?.configured,
  ]);
  const onboardingReadyCount = onboardingSteps.filter((step) => step.ready).length;
  const onboardingProgress = Math.round((onboardingReadyCount / onboardingSteps.length) * 100);
  const nextOnboardingStep = onboardingSteps.find((step) => !step.ready) || onboardingSteps[onboardingSteps.length - 1];

  const stats = [
    {
      label: 'Sites',
      value: dashboard.sites.length,
      detail: `${publishedSites} published`,
      icon: Globe,
      to: '/sites' as const,
      tone: 'bg-info/10 text-info',
    },
    {
      label: 'Pages',
      value: dashboard.pages.length,
      detail: `${draftPages} draft or scheduled`,
      icon: Layout,
      to: '/pages' as const,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: 'Blog posts',
      value: dashboard.posts.length,
      detail: `${draftPosts} draft or scheduled`,
      icon: FileText,
      to: '/blog' as const,
      tone: 'bg-warning/10 text-warning',
    },
    {
      label: 'Collections',
      value: dashboard.collections.length,
      detail: `${publishedCollections} public schemas`,
      icon: Database,
      to: '/collections' as const,
      tone: 'bg-success/10 text-success',
    },
    {
      label: 'Forms',
      value: dashboard.forms.length,
      detail: `${dashboard.contacts} contacts captured`,
      icon: ClipboardList,
      to: '/forms' as const,
      tone: 'bg-info/10 text-info',
    },
    {
      label: 'Media assets',
      value: dashboard.media.length,
      detail: storage ? `${storage.provider} storage` : 'Library files',
      icon: HardDrive,
      to: '/media' as const,
      tone: 'bg-success/10 text-success',
    },
    {
      label: 'Comments',
      value: dashboard.comments,
      detail: `${dashboard.pendingComments} pending moderation`,
      icon: MessageSquare,
      to: '/comments' as const,
      tone: 'bg-warning/10 text-warning',
    },
    {
      label: 'Commerce',
      value: dashboard.commerce.productCount,
      detail: `${dashboard.commerce.orderCount} orders · ${dashboard.commerce.openOrderCount} open`,
      icon: ShoppingCart,
      to: productsCollection ? '/products' as const : '/collections' as const,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: 'Team members',
      value: dashboard.users.length,
      detail: 'Admin users',
      icon: Users,
      to: '/users' as const,
      tone: 'bg-info/10 text-info',
    },
  ].filter((card) => (
    card.to === '/users'
      ? canViewUsers
      : card.to === '/media'
        ? canViewMedia
        : card.to === '/collections'
          ? canViewCollections
          : card.to === '/forms'
            ? canViewForms
            : card.to === '/comments'
              ? isDashboardPermissionAllowed(permissionMatrix, user, 'comments.view')
              : card.to === '/products'
                ? canViewCommerce
                : true
  ));
  const dashboardCommandActionStatusId = 'dashboard-command-actions-status';
  const dashboardCommandSecondaryActionStatusId = 'dashboard-command-secondary-action-status';
  const dashboardCommandDisabledReason = isDashboardBusy
    ? 'Dashboard data is refreshing.'
    : '';
  const dashboardCommandActionState = dashboardCommandDisabledReason ? 'busy' : 'ready';
  const dashboardCommandSecondaryActionState = dashboardCommandActionState;
  const dashboardPrimaryCommandActions = dashboardWorkflowActions.filter((action) => (
    action.label === 'New site' ||
    action.label === 'New page' ||
    action.label === 'New post' ||
    action.label === 'New product' ||
    action.label === 'New form'
  ));
  const dashboardPrimaryCommandActionStatus = dashboardPrimaryCommandActions.length > 0
    ? dashboardPrimaryCommandActions.map((action) => `${action.label} available.`).join(' ')
    : 'No workspace creation actions available for this role.';
  const dashboardRefreshActionStatus = dashboardCommandDisabledReason
    ? `Refresh data unavailable: ${dashboardCommandDisabledReason}`
    : 'Refresh data available.';
  const dashboardCopyHandoffActionStatus = dashboardCommandDisabledReason
    ? `Copy handoff unavailable: ${dashboardCommandDisabledReason}`
    : 'Copy handoff available.';
  const dashboardDownloadHandoffActionStatus = dashboardCommandDisabledReason
    ? `Download JSON unavailable: ${dashboardCommandDisabledReason}`
    : 'Download JSON available.';
  const dashboardCommandSecondaryActionStatus = [
    dashboardCopyHandoffActionStatus,
    dashboardDownloadHandoffActionStatus,
  ].join(' ');
  const dashboardCommandActionStatus = [
    dashboardPrimaryCommandActionStatus,
    dashboardRefreshActionStatus,
    dashboardCopyHandoffActionStatus,
    dashboardDownloadHandoffActionStatus,
  ].join(' ');

  return (
    <PageShell
      title="Dashboard"
      description={`Welcome back, ${user?.fullName || 'Admin'}. Control sites, content, APIs, and publishing readiness from one cockpit.`}
      action={
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={isDashboardBusy}
          aria-label="Refresh dashboard data"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium',
            'hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {isDashboardBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice}
          </div>
        )}

        <section className="rounded-lg border border-border bg-card shadow-sm" data-testid="dashboard-command-center">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Dashboard command center</h2>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  platformReadiness.score >= 80 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
                >
                  {platformReadiness.score}% ready
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  backendHealthy ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
                >
                  {backendHealthy ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {backendHealthy ? 'Backend live' : 'Fallback mode'}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Start builder workflows, inspect backend readiness, switch the active API site, and export the frontend handoff payload from one workspace.
              </p>
            </div>
            <div
              className="flex flex-col gap-2 lg:items-end"
              role="group"
              aria-label="Dashboard command actions"
              aria-describedby={dashboardCommandActionStatusId}
              data-testid="dashboard-command-actions"
              data-action-status={dashboardCommandActionStatus}
              data-action-state={dashboardCommandActionState}
            >
              <span
                id={dashboardCommandActionStatusId}
                className="sr-only"
                data-testid="dashboard-command-actions-status"
              >
                {dashboardCommandActionStatus}
              </span>
              <span
                id={dashboardCommandSecondaryActionStatusId}
                className="sr-only"
                data-testid="dashboard-command-secondary-action-status"
              >
                {dashboardCommandSecondaryActionStatus}
              </span>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end" data-testid="dashboard-primary-actions">
                {dashboardPrimaryCommandActions.map((action, index) => (
                  <Link
                    key={action.label}
                    to={action.to}
                    search={getDashboardWorkflowActionSearch(action)}
                    aria-describedby={dashboardCommandActionStatusId}
                    data-testid={`dashboard-command-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                    data-action-state="ready"
                    data-action-status={`${action.label} available.`}
                    data-command-priority={index === 0 ? 'primary' : 'secondary'}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                      index === 0
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border border-border bg-background text-foreground hover:bg-accent',
                    )}
                  >
                    <action.icon className="size-4" />
                    {action.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => void loadDashboard()}
                  disabled={isDashboardBusy}
                  aria-label="Refresh dashboard command center data"
                  aria-describedby={dashboardCommandActionStatusId}
                  data-testid="dashboard-command-refresh"
                  data-action-state={dashboardCommandActionState}
                  data-action-status={dashboardRefreshActionStatus}
                  data-disabled-reason={dashboardCommandDisabledReason || undefined}
                  title={dashboardCommandDisabledReason || 'Refresh dashboard data'}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDashboardBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Refresh
                </button>
              </div>
              <details
                className="self-start lg:self-end"
                aria-describedby={dashboardCommandSecondaryActionStatusId}
                data-action-state={dashboardCommandSecondaryActionState}
                data-action-status={dashboardCommandSecondaryActionStatus}
                data-target-site-id={activeSiteId}
                data-testid="dashboard-secondary-actions"
                data-default-collapsed="true"
              >
                <summary
                  className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60 focus-ring"
                  data-testid="dashboard-more-actions"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  More actions
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 shadow-sm" data-testid="dashboard-secondary-action-menu">
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(frontendHandoffText, 'Frontend handoff manifest')}
                    disabled={isDashboardBusy}
                    aria-label="Copy dashboard frontend handoff"
                    aria-describedby={dashboardCommandSecondaryActionStatusId}
                    data-testid="dashboard-command-copy-handoff"
                    data-action-state={dashboardCommandSecondaryActionState}
                    data-action-status={dashboardCopyHandoffActionStatus}
                    data-disabled-reason={dashboardCommandDisabledReason || undefined}
                    data-target-site-id={activeSiteId}
                    title={dashboardCommandDisabledReason || 'Copy frontend handoff manifest'}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy handoff
                  </button>
                  <button
                    type="button"
                    onClick={downloadFrontendHandoff}
                    disabled={isDashboardBusy}
                    aria-label="Download dashboard frontend handoff JSON"
                    aria-describedby={dashboardCommandSecondaryActionStatusId}
                    data-testid="dashboard-command-download-handoff"
                    data-action-state={dashboardCommandSecondaryActionState}
                    data-action-status={dashboardDownloadHandoffActionStatus}
                    data-disabled-reason={dashboardCommandDisabledReason || undefined}
                    data-target-site-id={activeSiteId}
                    title={dashboardCommandDisabledReason || 'Download frontend handoff JSON'}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="size-3.5" />
                    Download JSON
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="grid gap-3 border-t border-border bg-background/55 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Sites', value: dashboard.sites.length, detail: `${publishedSites} published` },
              { label: 'Pages', value: dashboard.pages.length, detail: `${draftPages} drafts` },
              { label: 'Posts', value: dashboard.posts.length, detail: `${draftPosts} drafts` },
              { label: 'Readiness', value: `${platformReadiness.score}%`, detail: `${platformReadiness.readyCount}/${platformReadiness.total} checks` },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <span className="font-mono text-xl font-semibold text-foreground">{metric.value}</span>
                  <span className="truncate text-xs text-muted-foreground">{metric.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-background p-4 lg:p-5" data-testid="dashboard-focus-lane">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Start here</h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Open the workflows people use every day; deeper readiness and API maps stay available below.
                </p>
              </div>
              <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {activeSite?.name || activeSiteId}
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {dashboardWorkflowActions.length > 0 ? dashboardWorkflowActions.map((action) => (
                <Link
                  key={action.label}
                  to={action.to}
                  search={getDashboardWorkflowActionSearch(action)}
                  className="group flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <action.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{action.detail}</span>
                  </span>
                </Link>
              )) : (
                <p className="rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground sm:col-span-2 xl:col-span-6">
                  Your current role has read-only dashboard access.
                </p>
              )}
            </div>
          </div>

          <details className="group border-t border-border" data-testid="dashboard-platform-details">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
              <span>Backend platform health and workflow</span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
              <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
            </summary>
            <div className="grid gap-3 border-t border-border p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] lg:p-5">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Backend platform health</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tracks the backend capabilities a Wix-style editor and custom frontend handoff need.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {platformReadiness.readyCount}/{platformReadiness.total} checks
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', platformReadiness.score >= 80 ? 'bg-success' : 'bg-warning')}
                    style={{ width: `${platformReadiness.score}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {platformReadiness.checks.slice(0, 6).map((check) => (
                    <DashboardReadinessCheck key={check.label} {...check} search={getDashboardRouteSearch(check.to)} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Code2 className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Operating workflow</h3>
                </div>
                <div className="mt-3 grid gap-2">
                  {platformReadiness.workflow.map((step, index) => (
                    <DashboardWorkflowStep key={step.label} index={index + 1} {...step} />
                  ))}
                </div>
              </div>
            </div>
          </details>

          <details className="group border-t border-border bg-background/55" data-testid="dashboard-control-map-details">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
              <span>Dashboard control map</span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show shortcuts</span>
              <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide shortcuts</span>
            </summary>
            <div className="border-t border-border p-4 lg:p-5">
              <p className="text-sm text-muted-foreground">Jump directly to the dashboard area you need.</p>
              <nav className="mt-3 flex flex-wrap gap-2" aria-label="Dashboard control map">
                {DASHBOARD_CONTROL_AREAS.map((area) => (
                  <a
                    key={area.title}
                    href={area.href}
                    aria-label={`${area.title}: ${area.detail}`}
                    aria-disabled={isDashboardBusy}
                    onClick={(event) => {
                      if (isDashboardBusy) event.preventDefault();
                    }}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5',
                      isDashboardBusy && 'pointer-events-none opacity-60',
                    )}
                  >
                    {area.title}
                  </a>
                ))}
              </nav>
            </div>
          </details>

          <details
            className="group border-t border-border bg-background"
            data-testid="dashboard-rbac-scope"
            data-dashboard-disclosure="workspace-context"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
              <span>Workspace access and RBAC</span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                  {rbacSummary.role} · {rbacSummary.source}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show access</span>
                <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide access</span>
              </span>
            </summary>
            <div className="border-t border-border p-4 lg:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Workspace RBAC scope</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dashboard data, creation actions, admin endpoints, settings, users, and activity panels are filtered by the signed-in account.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                {rbacSummary.role} · {rbacSummary.source}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Permissions</div>
                  <div className="mt-1 text-sm font-medium">
                    {rbacSummary.allowed === null ? 'Unavailable' : `${rbacSummary.allowed}/${rbacSummary.total} allowed`}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Users</div>
                  <div className={cn('mt-1 text-sm font-medium', canViewUsers ? 'text-success' : 'text-muted-foreground')}>
                    {canViewUsers ? 'Visible' : 'Hidden'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Settings</div>
                  <div className={cn('mt-1 text-sm font-medium', canViewSettings ? 'text-success' : 'text-muted-foreground')}>
                    {canViewSettings ? 'Visible' : 'Hidden'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Activity</div>
                  <div className={cn('mt-1 text-sm font-medium', canExportActivity ? 'text-success' : 'text-muted-foreground')}>
                    {canExportActivity ? 'Visible' : 'Hidden'}
                  </div>
                </div>
              </div>
              <div
                className="mt-4 rounded-lg border border-border bg-card/75 px-3 py-3"
                data-testid="dashboard-account-authority"
                data-owner-count={activeOwnerUsers.length}
                data-admin-count={activeAdminUsers.length}
                data-active-user-count={activeUsers.length}
                data-access-state={ownerAccessState}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">Account authority</div>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                      Signed-in session: {user?.email || 'unknown'} as {rbacSummary.role}. Backy gates Settings, Users, owner cleanup, and admin endpoints through this same permission matrix.
                    </p>
                  </div>
                  <span className={cn(
                    'w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                    ownerAccessState === 'ready'
                      ? 'bg-success/10 text-success'
                      : ownerAccessState === 'review'
                        ? 'bg-warning/10 text-warning'
                        : ownerAccessState === 'blocked'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground',
                  )}>
                    {ownerAccessState === 'review' ? 'Review owner access' : ownerAccessState}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SignalMetric label="Signed-in role" value={rbacSummary.role} />
                  <SignalMetric label="Active owners" value={canViewUsers ? String(activeOwnerUsers.length) : 'Hidden'} />
                  <SignalMetric label="Active admins" value={canViewUsers ? String(activeAdminUsers.length) : 'Hidden'} />
                  <SignalMetric label="Access source" value={rbacSummary.source} />
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted-foreground">{ownerAccessMessage}</p>
                  <div className="flex flex-wrap gap-2">
                    {canViewUsers && (
                      <Link
                        to="/users"
                        search={getDashboardRouteSearch('/users')}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                      >
                        Review users
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                    {canViewSettings && (
                      <Link
                        to="/settings"
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                      >
                        Review security
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              {permissionError && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Permission matrix unavailable; privileged dashboard shortcuts are disabled. {permissionError}
                </p>
              )}
            </div>
          </details>

          <details className="group border-t border-border" data-testid="dashboard-module-map-details">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
              <span>Backy module map</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {visibleDashboardModules.filter((module) => module.status === 'Available').length} available · {visibleDashboardModules.filter((module) => module.status === 'Next').length} next
              </span>
            </summary>
            <div className="border-t border-border p-4 lg:p-5">
              <p className="max-w-3xl text-sm text-muted-foreground">
                The dashboard names the control surfaces Backy already has and the parity areas still queued for Wix, Webflow, Squarespace, and WordPress-style coverage.
              </p>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {visibleDashboardModules.map((module) => (
                  <Link
                    key={module.title}
                    to={module.href}
                    search={getDashboardRouteSearch(module.href)}
                    className="group rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{module.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{module.detail}</div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold',
                          module.status === 'Available'
                            ? 'bg-success/10 text-success'
                            : 'bg-warning/10 text-warning',
                        )}
                      >
                        {module.status}
                      </span>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Open surface <ArrowRight className="size-3" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </details>
        </section>

        <section
          id="dashboard-onboarding"
          className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
          data-testid="dashboard-onboarding-state"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Launch onboarding</h2>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  onboardingProgress >= 80 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}>
                  {onboardingProgress}% complete
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Tracks the concrete setup state needed for a multi-site CMS, Canva-style page builder, media library, custom frontend APIs, forms, commerce, and team access.
              </p>
            </div>
            <Link
              to={nextOnboardingStep.to}
              search={getDashboardRouteSearch(nextOnboardingStep.to)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {nextOnboardingStep.ready ? 'Review setup' : `Continue: ${nextOnboardingStep.label}`}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', onboardingProgress >= 80 ? 'bg-success' : 'bg-warning')}
              style={{ width: `${onboardingProgress}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {onboardingSteps.map((step, index) => (
              <DashboardOnboardingStep
                key={step.label}
                index={index + 1}
                {...step}
                search={getDashboardRouteSearch(step.to)}
              />
            ))}
          </div>
        </section>

        <section
          id="dashboard-deployments"
          className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
          data-testid="dashboard-deployment-history"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                <h2 className="font-semibold">Deployment execution and history</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Run the deploy preflight Backy can execute today: it checks storage, database, Supabase, and Vercel readiness, then records the result in this session history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runDeploymentPreflight()}
              disabled={isDashboardBusy || !dashboard.settings || !canConfigureSettings}
              title={dashboardPermissionReason(permissionMatrix, user, 'settings.configure')}
              aria-label="Run dashboard deployment preflight"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningDeployment ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Run deployment preflight
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold text-foreground">Current target</div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Site</dt>
                  <dd className="font-medium">{activeSite?.name || activeSiteId}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Mode</dt>
                  <dd>{dashboard.settings?.deliveryMode || 'unknown'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Vercel</dt>
                  <dd className={vercel?.configured ? 'text-success' : 'text-warning'}>
                    {vercel?.configured ? 'Configured' : 'Needs metadata'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Deploy token</dt>
                  <dd className={vercel?.tokenConfigured ? 'text-success' : 'text-warning'}>
                    {vercel?.tokenConfigured ? 'Detected' : 'Not detected'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">Preflight history</div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {deploymentRuns.length} run{deploymentRuns.length === 1 ? '' : 's'}
                </span>
              </div>
              {deploymentRuns.length > 0 ? (
                <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {deploymentRuns.map((run) => (
                    <div key={run.id} className="grid gap-2 bg-card px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                            run.status === 'ready'
                              ? 'bg-success/10 text-success'
                              : run.status === 'warning'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-destructive/10 text-destructive',
                          )}>
                            {run.status}
                          </span>
                          <span className="font-medium">{run.siteName}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Target: {run.targetUrl}
                          {run.requestId ? ` · ${run.requestId}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-success/10 px-2 py-1 text-success">{run.ready} ready</span>
                        <span className="rounded-md bg-warning/10 px-2 py-1 text-warning">{run.warnings} warning</span>
                        <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">{run.blocked} blocked</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState
                    icon={ClipboardList}
                    title="No deployment preflight runs yet"
                    description="Run a deployment preflight to capture readiness, domain, cache, and frontend delivery evidence for this dashboard session."
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-testid="dashboard-deployment-health"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                <h2 className="font-semibold">Deployment health</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Vercel project status, last deploy check, domain verification, and cache or rebuild evidence for the active frontend target.
              </p>
            </div>
            <Link
              to="/settings"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Deployment settings
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Vercel project status</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Runtime project metadata, deploy token readiness, and deployment modes.
                  </p>
                </div>
                <Globe className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Project" value={deploymentHealth.projectStatus} />
                <SignalMetric label="Deploy token" value={deploymentHealth.deployTokenReady ? 'Ready' : 'Missing'} />
                <SignalMetric label="Environment" value={deploymentHealth.environment} />
                <SignalMetric label="Health score" value={`${deploymentHealth.score}%`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                deploymentHealth.score >= 75 ? 'border-success/25 bg-success/10 text-success' : 'border-warning/25 bg-warning/10 text-warning',
              )}>
                {deploymentHealth.projectId
                  ? `Project ${deploymentHealth.projectId} is visible to Backy without exposing secrets.`
                  : 'Add Vercel project metadata before enabling deploy orchestration.'}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Last deploy</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Latest persisted Settings deployment check or dashboard preflight run.
                  </p>
                </div>
                <History className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Last status" value={deploymentHealth.lastRun?.status || 'None'} />
                <SignalMetric label="Source" value={deploymentHealth.lastRun?.source || 'Not checked'} />
                <SignalMetric label="Warnings" value={`${deploymentHealth.lastRun?.warnings ?? 0}`} />
                <SignalMetric label="Blocked" value={`${deploymentHealth.lastRun?.blocked ?? 0}`} />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {deploymentHealth.lastDeployLabel}
                {deploymentHealth.lastRun?.requestId ? ` · ${deploymentHealth.lastRun.requestId}` : ''}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Domain and rebuild status</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Production domain presence plus cache invalidation or rebuild audit evidence.
                  </p>
                </div>
                <RefreshCw className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Domain" value={deploymentHealth.domainStatus} />
                <SignalMetric label="Auto deploy" value={deploymentHealth.autoDeploy ? 'Enabled' : 'Manual'} />
                <SignalMetric label="Preview" value={deploymentHealth.previewDeployments ? 'Enabled' : 'Off'} />
                <SignalMetric label="Cache/rebuild" value={deploymentHealth.cacheRebuildStatus} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                deploymentHealth.targetDomain ? 'border-success/25 bg-success/10 text-success' : 'border-warning/25 bg-warning/10 text-warning',
              )}>
                {deploymentHealth.targetDomain
                  ? `Target domain: ${deploymentHealth.targetDomain}`
                  : 'Set a production domain before custom frontend launch handoff.'}
              </div>
            </div>
          </div>
        </section>

        <div id="dashboard-site-scope" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm scroll-mt-24">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium',
              backendHealthy ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            )}
          >
            {backendHealthy ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {backendHealthy ? 'Backend live' : 'Fallback mode'}
          </span>
          <span className="text-muted-foreground">
            {dashboard.settings?.deliveryMode === 'custom-frontend'
              ? 'Custom frontend API mode is active.'
              : 'Managed Backy rendering is active.'}
          </span>
          <label className="ml-auto text-xs font-medium text-muted-foreground" htmlFor="dashboard-active-site">
            API site
          </label>
          <select
            id="dashboard-active-site"
            value={activeSiteId}
            onChange={(event) => selectDashboardSite(event.target.value)}
            disabled={isCheckingInfrastructure || isRunningDeployment}
            className="min-w-48 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dashboard.sites.length === 0 ? (
              <option value={activeSiteId}>{activeSite?.name || activeSiteId}</option>
            ) : dashboard.sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          {(isLoading || isHydratingDashboard) && (
            <span className="text-muted-foreground">
              {isLoading ? 'Updating dashboard data...' : 'Finishing dashboard data...'}
            </span>
          )}
        </div>

        <div id="dashboard-stats" className="grid grid-cols-1 gap-4 scroll-mt-24 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} search={getDashboardRouteSearch(stat.to)} />
          ))}
        </div>

        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-testid="dashboard-operations-signal-board"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-primary" />
                <h2 className="font-semibold">Operations signal board</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Live operational signals for commerce, moderation, and failed workflows from the same backend APIs used by the control pages.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {activeSite?.name || activeSiteId}
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Link
              to={productsCollection ? '/products' : '/collections'}
              search={getDashboardRouteSearch(productsCollection ? '/products' : '/collections')}
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Commerce catalog</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    Products, orders, open fulfillment, and loaded order value.
                  </div>
                </div>
                <ShoppingCart className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Products" value={`${dashboard.commerce.productCount}`} />
                <SignalMetric label="Orders" value={`${dashboard.commerce.orderCount}`} />
                <SignalMetric label="Open" value={`${dashboard.commerce.openOrderCount}`} />
                <SignalMetric label="Paid" value={`${dashboard.commerce.paidOrderCount}`} />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Loaded order value</span>
                <span className="ml-2 font-semibold text-foreground">{commerceValueLabel}</span>
              </div>
            </Link>

            <Link
              to="/comments"
              search={getDashboardRouteSearch('/comments')}
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Moderation queue</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    Visitor comments and forms that affect public trust and lead response.
                  </div>
                </div>
                <MessageSquare className="size-4 text-warning" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Comments" value={`${dashboard.comments}`} />
                <SignalMetric label="Pending" value={`${dashboard.pendingComments}`} />
                <SignalMetric label="Forms" value={`${dashboard.forms.length}`} />
                <SignalMetric label="Contacts" value={`${dashboard.contacts}`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                dashboard.pendingComments > 0 ? 'border-warning/25 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success',
              )}>
                {dashboard.pendingComments > 0
                  ? 'Moderation needs review before public display.'
                  : 'No pending comments in the loaded queue.'}
              </div>
            </Link>

            <Link
              to="/settings"
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Workflow alerts</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    Failed audit events and infrastructure blockers that can affect automations.
                  </div>
                </div>
                <AlertTriangle className="size-4 text-warning" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Failures" value={`${workflowFailureCount}`} />
                <SignalMetric label="Readiness errors" value={`${readinessErrors}`} />
                <SignalMetric label="Warnings" value={`${readinessWarnings}`} />
                <SignalMetric label="Infra blocked" value={`${infrastructureDiagnosticSummary.blocked}`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                workflowFailureCount || readinessErrors || infrastructureDiagnosticSummary.blocked
                  ? 'border-warning/25 bg-warning/10 text-warning'
                  : 'border-success/25 bg-success/10 text-success',
              )}>
                {workflowFailureCount || readinessErrors || infrastructureDiagnosticSummary.blocked
                  ? 'Review workflow failures, readiness blockers, or infrastructure diagnostics.'
                  : 'No failed workflow signals in loaded activity.'}
              </div>
            </Link>
          </div>
        </section>

        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-testid="dashboard-commerce-health"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <h2 className="font-semibold">Product commerce health</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Inventory warnings, checkout setup, provider readiness, and orders needing attention for the active storefront catalog.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/products"
                search={getDashboardRouteSearch('/products')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Products
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                to="/orders"
                search={getDashboardRouteSearch('/orders')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Orders
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                to="/settings"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Settings
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Inventory warnings</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Low-stock and out-of-stock counts from the loaded products collection sample.
                  </p>
                </div>
                <Package className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Product count" value={`${dashboard.commerce.productCount}`} />
                <SignalMetric label="Loaded sample" value={`${dashboard.commerce.loadedProductCount}`} />
                <SignalMetric label="Low stock" value={`${dashboard.commerce.lowStockProductCount}`} />
                <SignalMetric label="Out of stock" value={`${dashboard.commerce.outOfStockProductCount}`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                commerceHealth.inventoryWarnings > 0 ? 'border-warning/25 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success',
              )}>
                {commerceHealth.inventoryWarnings > 0
                  ? `${commerceHealth.inventoryWarnings} product inventory warning${commerceHealth.inventoryWarnings === 1 ? '' : 's'} need review.`
                  : 'No inventory warnings in the loaded product sample.'}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Checkout setup</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Per-product checkout URL coverage and runtime provider readiness.
                  </p>
                </div>
                <ShoppingCart className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Checkout URLs" value={`${dashboard.commerce.checkoutConfiguredProductCount}/${commerceHealth.checkoutSampleSize}`} />
                <SignalMetric label="Coverage" value={`${commerceHealth.checkoutCoverage}%`} />
                <SignalMetric label="Payment" value={commerceHealth.paymentProvider} />
                <SignalMetric label="Setup score" value={`${commerceHealth.setupScore}%`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                commerceHealth.paymentReady && commerceHealth.taxReady && commerceHealth.shippingReady && commerceHealth.discountReady
                  ? 'border-success/25 bg-success/10 text-success'
                  : 'border-warning/25 bg-warning/10 text-warning',
              )}>
                {commerceHealth.paymentReady && commerceHealth.taxReady && commerceHealth.shippingReady && commerceHealth.discountReady
                  ? `Payment, tax, shipping, and discount providers are ready for ${commerceHealth.paymentProvider} checkout.`
                  : `Review ${[
                    commerceHealth.paymentReady ? '' : 'payment',
                    commerceHealth.taxReady ? '' : 'tax',
                    commerceHealth.shippingReady ? '' : 'shipping',
                    commerceHealth.discountReady ? '' : 'discount',
                  ].filter(Boolean).join(', ')} setup before handoff.`}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Orders needing attention</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Open fulfillment, failed payments, paid orders, and loaded order value from order records.
                  </p>
                </div>
                <ClipboardList className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Open orders" value={`${dashboard.commerce.openOrderCount}`} />
                <SignalMetric label="Failed orders" value={`${dashboard.commerce.failedOrderCount}`} />
                <SignalMetric label="Paid orders" value={`${dashboard.commerce.paidOrderCount}`} />
                <SignalMetric label="Loaded value" value={commerceValueLabel} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                dashboard.commerce.openOrderCount || dashboard.commerce.failedOrderCount
                  ? 'border-warning/25 bg-warning/10 text-warning'
                  : 'border-success/25 bg-success/10 text-success',
              )}>
                {dashboard.commerce.openOrderCount || dashboard.commerce.failedOrderCount
                  ? 'Review open fulfillment and failed payment orders before launch.'
                  : 'No open or failed orders in the loaded order queue.'}
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-testid="dashboard-moderation-queue"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                <h2 className="font-semibold">Form and comment moderation queue</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Pending submissions, spam reports, approval throughput, and safety flags across public forms and comment threads.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/forms"
                search={getDashboardRouteSearch('/forms')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Forms
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                to="/comments"
                search={getDashboardRouteSearch('/comments')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Comments
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Pending submissions</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Form inbox items and comments waiting for manual review.
                  </p>
                </div>
                <ClipboardList className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Form pending" value={`${moderationHealth.pendingSubmissions}`} />
                <SignalMetric label="Comment pending" value={`${moderationHealth.pendingComments}`} />
                <SignalMetric label="Review queue" value={`${moderationHealth.reviewQueue}`} />
                <SignalMetric label="Readiness" value={`${moderationHealth.score}%`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                moderationHealth.reviewQueue > 0 ? 'border-warning/25 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success',
              )}>
                {moderationHealth.reviewQueue > 0
                  ? `${moderationHealth.reviewQueue} moderation item${moderationHealth.reviewQueue === 1 ? '' : 's'} need approval decisions.`
                  : 'No pending moderation decisions in the loaded queues.'}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Spam reports</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Form spam, reported comments, spam comments, and blocked authors.
                  </p>
                </div>
                <AlertTriangle className="size-4 text-warning" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Form spam" value={`${dashboard.moderation.spamFormSubmissionCount}`} />
                <SignalMetric label="Reported" value={`${dashboard.moderation.reportedCommentCount}`} />
                <SignalMetric label="Comment spam" value={`${dashboard.moderation.spamCommentCount}`} />
                <SignalMetric label="Blocked" value={`${dashboard.moderation.blockedCommentCount}`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                moderationHealth.spamReports > 0 ? 'border-warning/25 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success',
              )}>
                {moderationHealth.spamReports > 0
                  ? `${moderationHealth.spamReports} spam or safety flag${moderationHealth.spamReports === 1 ? '' : 's'} need cleanup.`
                  : 'No spam reports or blocked-comment flags in the loaded queues.'}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Approval throughput</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Approved submissions, approved comments, review-mode forms, and recent moderation audits.
                  </p>
                </div>
                <CheckCircle2 className="size-4 text-success" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Approved forms" value={`${dashboard.moderation.approvedFormSubmissionCount}`} />
                <SignalMetric label="Approved comments" value={`${dashboard.moderation.approvedCommentCount}`} />
                <SignalMetric label="Manual forms" value={`${dashboard.moderation.manualReviewFormCount}`} />
                <SignalMetric label="Audit events" value={`${dashboard.moderation.moderationAuditEvents}`} />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {moderationHealth.approvalThroughput} approved item{moderationHealth.approvalThroughput === 1 ? '' : 's'} in loaded queues; sample coverage is {moderationHealth.sampleComplete ? 'complete' : 'partial'}.
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-testid="dashboard-aggregate-analytics"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <h2 className="font-semibold">Aggregate analytics</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Backend-derived rollups across content publishing, activity velocity, moderation, leads, and commerce health.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {aggregateAnalytics.readinessAverage}% average site readiness
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold text-foreground">Publishing mix</div>
              <p className="mt-1 text-xs text-muted-foreground">Pages, posts, and collections grouped by delivery state.</p>
              <div className="mt-4 grid gap-3">
                <AnalyticsBar label="Published" value={aggregateAnalytics.publishedContent} total={aggregateAnalytics.contentTotal} />
                <AnalyticsBar label="Draft" value={aggregateAnalytics.draftContent} total={aggregateAnalytics.contentTotal} />
                <AnalyticsBar label="Scheduled" value={aggregateAnalytics.scheduledContent} total={aggregateAnalytics.contentTotal} />
                <AnalyticsBar label="Archived" value={aggregateAnalytics.archivedContent} total={aggregateAnalytics.contentTotal} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold text-foreground">Activity velocity</div>
              <p className="mt-1 text-xs text-muted-foreground">Recent audit-backed changes from the last seven days.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Recent events" value={`${aggregateAnalytics.recentActivity}`} />
                <SignalMetric label="Creates" value={`${aggregateAnalytics.creates}`} />
                <SignalMetric label="Updates" value={`${aggregateAnalytics.updates}`} />
                <SignalMetric label="Deletes" value={`${aggregateAnalytics.deletes}`} />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Activity is sourced from admin audit logs and keeps request IDs in the Recent backend activity feed.
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold text-foreground">Engagement and commerce</div>
              <p className="mt-1 text-xs text-muted-foreground">Lead capture, moderation pressure, and storefront order totals.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Contacts/form" value={`${aggregateAnalytics.contactsPerForm}`} />
                <SignalMetric label="Pending comments" value={`${aggregateAnalytics.pendingCommentRate}%`} />
                <SignalMetric label="Products" value={`${dashboard.commerce.productCount}`} />
                <SignalMetric label="Order value" value={commerceValueLabel} />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Uses loaded form contacts, comment counts, product records, and order totals from Backy APIs.
              </div>
            </div>
          </div>
        </section>

        <section
          id="dashboard-api-consumers"
          className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
          data-testid="dashboard-api-consumers"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                <h2 className="font-semibold">API consumer readiness</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Summarizes the keys, endpoint coverage, service clients, and recent access-control changes custom frontends need before handoff.
              </p>
            </div>
            <Link
              to="/settings"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Manage keys
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Contract coverage</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Public and admin URLs exported into the handoff manifest for custom clients.
                  </p>
                </div>
                <Code2 className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Public APIs" value={`${apiConsumerReadiness.publicEndpoints}`} />
                <SignalMetric label="Admin APIs" value={`${apiConsumerReadiness.adminEndpoints}`} />
                <SignalMetric label="Delivery" value={apiConsumerReadiness.deliveryMode} />
                <SignalMetric label="Site scope" value={activeSite?.slug || activeSiteId} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Credentials</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Handoff keys and named service clients are tracked without exposing raw secrets.
                  </p>
                </div>
                <KeyRound className="size-4 text-success" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="API keys" value={apiConsumerReadiness.apiKeysConfigured ? 'Configured' : 'Missing'} />
                <SignalMetric label="Service keys" value={`${apiConsumerReadiness.activeServiceKeys}`} />
                <SignalMetric label="Revoked clients" value={`${apiConsumerReadiness.revokedServiceKeys}`} />
                <SignalMetric label="Key rotations" value={`${apiConsumerReadiness.rotationEvents}`} />
              </div>
              <div className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                apiConsumerReadiness.apiKeysConfigured ? 'border-success/25 bg-success/10 text-success' : 'border-warning/25 bg-warning/10 text-warning',
              )}>
                {apiConsumerReadiness.apiKeysConfigured
                  ? 'Public/admin keys are configured for frontend handoff.'
                  : 'Configure public and admin keys before external clients depend on this workspace.'}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Access changes</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Rotation, revocation, and audit activity that affects existing API consumers.
                  </p>
                </div>
                <History className="size-4 text-warning" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Revocations" value={`${apiConsumerReadiness.revocationEvents}`} />
                <SignalMetric label="API audit" value={`${apiConsumerReadiness.apiAuditEvents}`} />
                <SignalMetric label="RBAC source" value={rbacSummary.source} />
                <SignalMetric label="Role" value={rbacSummary.role} />
              </div>
              <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Recent API access changes remain visible in Settings audit history and the handoff JSON includes non-secret consumer counts.
              </p>
            </div>
          </div>

          <div
            className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4"
            data-testid="dashboard-custom-frontend-launch"
            data-schema={customFrontendLaunch.schemaVersion}
            data-domain-owner={customFrontendLaunch.domainOwner}
            data-browser-env-keys={Object.keys(customFrontendLaunch.browserSafeEnv).join(',')}
            data-server-env-keys={Object.keys(customFrontendLaunch.serverSideEnv).join(',')}
            data-control-readiness-schema={customFrontendControlReadiness.schemaVersion}
            data-control-readiness-status={customFrontendControlReadiness.status}
            data-control-backy-ready={`${customFrontendControlReadiness.backyReadyCount}/${customFrontendControlReadiness.backyTotal}`}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Custom frontend launch</h3>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  Attach the public domain to the separate custom website Vercel project. Keep Backy as the CMS/API source and copy only browser-safe env into client bundles.
                </p>
              </div>
              <span className="w-fit rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-primary">
                Custom website Vercel project
              </span>
            </div>

            <div
              className="mt-4 rounded-lg border border-border bg-background p-3"
              data-testid="dashboard-custom-frontend-control-readiness"
              data-schema={customFrontendControlReadiness.schemaVersion}
              data-status={customFrontendControlReadiness.status}
              data-ready-count={customFrontendControlReadiness.readyCount}
              data-review-count={customFrontendControlReadiness.reviewCount}
              data-manual-count={customFrontendControlReadiness.manualCount}
              data-backy-ready-count={customFrontendControlReadiness.backyReadyCount}
              data-backy-total={customFrontendControlReadiness.backyTotal}
              data-expected-probe={customFrontendControlReadiness.expectedProbe}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Control readiness
                    </span>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      customFrontendControlReadiness.status === 'ready'
                        ? 'bg-success/10 text-success'
                        : customFrontendControlReadiness.status === 'backy-ready-manual-externals'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-warning/10 text-warning',
                    )}>
                      {customFrontendControlReadiness.backyReadyCount}/{customFrontendControlReadiness.backyTotal} Backy ready
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {customFrontendControlReadiness.manualCount} manual
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Dashboard-visible gate for the custom frontend control loop: design source, templates, deployed verifier, domain owner, and Git previews.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(customFrontendNextActionText, 'Custom frontend next action')}
                    disabled={isDashboardBusy}
                    data-testid="dashboard-copy-custom-frontend-next-action"
                    data-copy-schema={customFrontendControlReadiness.nextAction.schemaVersion}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy next action
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(customFrontendAgentBriefText, 'Custom frontend agent brief')}
                    disabled={isDashboardBusy}
                    data-testid="dashboard-copy-custom-frontend-agent-brief"
                    data-copy-schema={customFrontendAgentBrief.schemaVersion}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy agent brief
                  </button>
                  <Link
                    to="/sites/$siteId"
                    params={{ siteId: activeSiteId }}
                    hash="site-custom-frontend-verifier"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                    data-testid="dashboard-open-custom-frontend-verifier"
                  >
                    Open verifier
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {customFrontendControlReadiness.checks.map((check) => (
                  <div
                    key={check.id}
                    className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs"
                    data-testid={`dashboard-custom-frontend-control-check-${check.id}`}
                    data-check-status={check.status}
                    data-check-owner={check.owner}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{check.label}</span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 font-semibold',
                        check.status === 'ready'
                          ? 'bg-success/10 text-success'
                          : check.status === 'manual'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-warning/10 text-warning',
                      )}>
                        {check.owner === 'operator' ? 'manual' : check.status}
                      </span>
                    </div>
                    <p className="mt-1 leading-5 text-muted-foreground">{check.detail}</p>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                data-testid="dashboard-custom-frontend-next-action"
                data-next-action-schema={customFrontendControlReadiness.nextAction.schemaVersion}
                data-next-action-id={customFrontendControlReadiness.nextAction.id}
                data-next-action-owner={customFrontendControlReadiness.nextAction.owner}
                data-next-action-readiness={customFrontendControlReadiness.nextAction.readinessStatus}
                data-next-action-target={customFrontendControlReadiness.nextAction.target}
              >
                <div className="font-semibold text-foreground">
                  Next action: {customFrontendControlReadiness.nextAction.label}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {customFrontendControlReadiness.nextAction.detail}
                </p>
              </div>
              <div
                className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5"
                data-testid="dashboard-custom-frontend-agent-brief"
                data-agent-brief-schema={customFrontendAgentBrief.schemaVersion}
                data-agent-brief-source={customFrontendAgentBrief.source}
                data-agent-brief-content-creation-schema={customFrontendAgentBrief.contentCreation.schemaVersion}
                data-agent-brief-page-create-route={customFrontendAgentBrief.contentCreation.items.page.createRoute || ''}
                data-agent-brief-blog-create-route={customFrontendAgentBrief.contentCreation.items.blogPost.createRoute || ''}
                data-agent-brief-read-order-count={customFrontendAgentBrief.readOrder.length}
                data-agent-brief-manual-gates={customFrontendAgentBrief.readiness.manualGates.length}
                data-agent-brief-scaffold-command={customFrontendAgentBrief.commands.scaffold}
                data-agent-brief-verify-command={customFrontendAgentBrief.commands.verifyDeployed}
              >
                <div className="font-semibold text-foreground">Frontend agent brief ready</div>
                <p className="mt-1 text-muted-foreground">
                  Copy one bundle with read order, safe env, scaffold and verify commands, forbidden env names, and manual domain/Git gates.
                </p>
              </div>
              <div
                className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs"
                data-testid="dashboard-custom-frontend-content-creation"
                data-schema={customFrontendContentCreation.schemaVersion}
                data-status={customFrontendContentCreation.status}
                data-source={customFrontendContentCreation.source}
                data-page-template-id={customFrontendContentCreation.items.page.templateId || ''}
                data-page-create-route={customFrontendContentCreation.items.page.createRoute || ''}
                data-page-fallback-route={customFrontendContentCreation.items.page.fallbackRoute}
                data-blog-template-id={customFrontendContentCreation.items.blogPost.templateId || ''}
                data-blog-create-route={customFrontendContentCreation.items.blogPost.createRoute || ''}
                data-blog-fallback-route={customFrontendContentCreation.items.blogPost.fallbackRoute}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">Create from custom frontend design</div>
                    <p className="mt-1 leading-5 text-muted-foreground">
                      Start pages and blog posts from the synced template registry so Backy persists the same fonts, tokens, chrome, editable map, and frontendDesignTemplateId.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {customFrontendContentCreation.items.page.createRoute ? (
                      <Link
                        to="/pages/new"
                        search={{
                          siteId: activeSiteId,
                          templateSource: 'custom-frontend',
                          frontendDesignTemplateId: customFrontendContentCreation.items.page.templateId || undefined,
                          focus: 'canvas',
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                        data-testid="dashboard-create-custom-frontend-page"
                        data-template-source="custom-frontend"
                        data-template-id={customFrontendContentCreation.items.page.templateId || ''}
                        data-create-route={customFrontendContentCreation.items.page.createRoute}
                      >
                        New custom page
                        <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/sites/$siteId"
                        params={{ siteId: activeSiteId }}
                        hash="site-custom-frontend-verifier"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                        data-testid="dashboard-create-custom-frontend-page"
                        data-template-source="custom-frontend"
                        data-template-id=""
                        data-create-route=""
                      >
                        Sync page template
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                    {customFrontendContentCreation.items.blogPost.createRoute ? (
                      <Link
                        to="/blog/new"
                        search={{
                          siteId: activeSiteId,
                          templateSource: 'custom-frontend',
                          frontendDesignTemplateId: customFrontendContentCreation.items.blogPost.templateId || undefined,
                          focus: 'canvas',
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                        data-testid="dashboard-create-custom-frontend-post"
                        data-template-source="custom-frontend"
                        data-template-id={customFrontendContentCreation.items.blogPost.templateId || ''}
                        data-create-route={customFrontendContentCreation.items.blogPost.createRoute}
                      >
                        New custom post
                        <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/sites/$siteId"
                        params={{ siteId: activeSiteId }}
                        hash="site-custom-frontend-verifier"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                        data-testid="dashboard-create-custom-frontend-post"
                        data-template-source="custom-frontend"
                        data-template-id=""
                        data-create-route=""
                      >
                        Sync blog template
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {[customFrontendContentCreation.items.page, customFrontendContentCreation.items.blogPost].map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-border bg-background px-3 py-2"
                      data-testid={`dashboard-custom-frontend-content-item-${item.id}`}
                      data-status={item.status}
                      data-template-type={item.templateType}
                      data-template-id={item.templateId || ''}
                      data-create-route={item.createRoute || ''}
                      data-fallback-route={item.fallbackRoute}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{item.label}</span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 font-semibold',
                          item.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                        )}>
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.7fr)]">
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Browser-safe env</div>
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(customFrontendBrowserEnvText, 'Custom frontend browser env')}
                    disabled={isDashboardBusy}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </button>
                </div>
                <pre
                  className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[0.7rem] leading-5 text-foreground"
                  data-testid="dashboard-custom-frontend-browser-env"
                >{customFrontendBrowserEnvText}</pre>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Server loader env</div>
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(customFrontendServerEnvText, 'Custom frontend server env')}
                    disabled={isDashboardBusy}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </button>
                </div>
                <pre
                  className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[0.7rem] leading-5 text-foreground"
                  data-testid="dashboard-custom-frontend-server-env"
                >{customFrontendServerEnvText}</pre>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-xs">
                <dl className="grid gap-2">
                  <div>
                    <dt className="font-semibold text-muted-foreground">Public host</dt>
                    <dd className="mt-0.5 break-all font-mono text-foreground" data-testid="dashboard-custom-frontend-public-host">{customFrontendLaunch.site.publicHost}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Read first</dt>
                    <dd className="mt-0.5 break-all font-mono text-primary">{customFrontendLaunch.endpoints.agentHandoff}</dd>
                  </div>
                </dl>
                <Link
                  to="/sites"
                  search={{ siteId: activeSiteId }}
                  className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                >
                  Open Sites handoff
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          id="dashboard-persistence"
          className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
          data-testid="dashboard-persistence-readiness"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <h2 className="font-semibold">Persistence and Supabase readiness</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Shows the runtime persistence path Backy can actually see: database mode, Supabase keys, service role, storage bucket, and missing environment configuration.
              </p>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              persistenceReadiness.score >= 80 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}>
              {persistenceReadiness.score}% persistent
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Link
              to="/settings"
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Database runtime</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Repository mode and selected database provider used by admin/public APIs.
                  </p>
                </div>
                <Database className="size-4 text-primary" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Mode" value={persistenceReadiness.databaseMode} />
                <SignalMetric label="Provider" value={persistenceReadiness.databaseProvider} />
                <SignalMetric label="Configured" value={persistenceReadiness.databaseConfigured ? 'Yes' : 'No'} />
                <SignalMetric label="Repository" value={persistenceReadiness.repositoryMode} />
              </div>
              <p className="mt-3 break-all rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Target: {persistenceReadiness.databaseTarget}
              </p>
            </Link>

            <Link
              to="/settings"
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Supabase connection</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Project, database URL, auth key, and service-role readiness for Supabase-backed operation.
                  </p>
                </div>
                <KeyRound className="size-4 text-success" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Project" value={persistenceReadiness.supabaseConfigured ? 'Configured' : 'Missing'} />
                <SignalMetric label="Database URL" value={persistenceReadiness.supabaseDatabase ? 'Ready' : 'Missing'} />
                <SignalMetric label="Auth key" value={persistenceReadiness.supabaseAuth ? 'Ready' : 'Missing'} />
                <SignalMetric label="Service role" value={persistenceReadiness.serviceRole ? 'Ready' : 'Missing'} />
              </div>
              <p className="mt-3 break-all rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Project: {persistenceReadiness.supabaseProject}
              </p>
            </Link>

            <Link
              to="/settings"
              className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Storage and blockers</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Supabase storage bucket plus missing runtime values that block durable operation.
                  </p>
                </div>
                <HardDrive className="size-4 text-warning" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalMetric label="Bucket" value={persistenceReadiness.storageBucket} />
                <SignalMetric label="Missing" value={`${persistenceReadiness.missing.length}`} />
                <SignalMetric label="Migrations" value={persistenceReadiness.databaseConfigured ? 'External gate' : 'Not verified'} />
                <SignalMetric label="RLS/backup" value="Runbook gate" />
              </div>
              <p className={cn(
                'mt-3 rounded-md border px-3 py-2 text-xs',
                persistenceReadiness.missing.length > 0 ? 'border-warning/25 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success',
              )}>
                {persistenceReadiness.missing.length > 0
                  ? `Missing: ${persistenceReadiness.missing.join(', ')}`
                  : 'No missing persistence environment values reported by Settings runtime diagnostics.'}
              </p>
            </Link>
          </div>

          {persistenceReadiness.note && (
            <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {persistenceReadiness.note}
            </p>
          )}
        </section>

        <section id="dashboard-readiness" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <h2 className="font-semibold">Backy platform readiness</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                One view for the backend pieces a custom frontend needs: APIs, storage, database, Supabase, Vercel, content, media, forms, commerce, users, and publish checks.
              </p>
            </div>
            <div className="min-w-48 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">Overall</span>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  platformReadiness.score >= 80 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
                >
                  {platformReadiness.score}% ready
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className={cn('h-full rounded-full', platformReadiness.score >= 80 ? 'bg-success' : 'bg-warning')}
                  style={{ width: `${platformReadiness.score}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {platformReadiness.readyCount}/{platformReadiness.total} checks passing
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {platformReadiness.checks.map((check) => (
                <DashboardReadinessCheck key={check.label} {...check} search={getDashboardRouteSearch(check.to)} />
              ))}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Code2 className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Handoff workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {platformReadiness.workflow.map((step, index) => (
                  <DashboardWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4" data-testid="dashboard-infrastructure-diagnostics">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Infrastructure diagnostics</h3>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Run the same Settings validator from the dashboard to verify database, storage, Supabase, and Vercel wiring before frontend handoff.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {infrastructureDiagnosticSummary.total > 0 && (
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {infrastructureDiagnosticSummary.ready} ready · {infrastructureDiagnosticSummary.warning} warning · {infrastructureDiagnosticSummary.blocked} blocked
                  </span>
                )}
                <button
                  type="button"
                  onClick={runInfrastructureCheck}
                  disabled={isDashboardBusy || !dashboard.settings || !canConfigureSettings}
                  title={dashboardPermissionReason(permissionMatrix, user, 'settings.configure')}
                  aria-label="Run dashboard infrastructure check"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCheckingInfrastructure ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Run infrastructure check
                </button>
                {canViewSettings && (
                  <Link
                    to="/settings"
                    search={{ tab: 'infrastructure' }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Open infrastructure <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>

            {infrastructureDiagnostics.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Database}
                  title="No infrastructure diagnostics yet"
                  description="Run the infrastructure check to reveal missing runtime fields for Supabase, storage, database persistence, and Vercel deployment."
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {infrastructureDiagnostics.map((diagnostic) => (
                  <DashboardInfrastructureDiagnosticCard key={diagnostic.area} diagnostic={diagnostic} />
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex flex-col gap-6 xl:col-span-2">
            <section id="dashboard-workflows" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Build and manage</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start the workflows that control hosted pages and custom frontend data.
                  </p>
                </div>
                {canViewSettings && (
                  <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    API settings <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                {dashboardWorkflowActions.map((action) => (
                  <Link
                    key={action.label}
                    to={action.to}
                    search={getDashboardWorkflowActionSearch(action)}
                    className="group rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <action.icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.detail}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Launch-ready workflows</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Jump straight into the concrete Backy surfaces that create public pages, sellable objects, lead capture, and member access.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {activeSite?.name || activeSiteId}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {canEditPages && (
                    <>
                      <Link
                        to="/pages/new"
                        search={getDashboardPageCreateSearch('registration')}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Registration page</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Seed member/signup capture that hands off to Forms and Users.</div>
                      </Link>
                      <Link
                        to="/pages/new"
                        search={getDashboardPageCreateSearch('contact')}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Contact page</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Create an editable inquiry page connected to Backy form capture.</div>
                      </Link>
                      <Link
                        to="/pages/new"
                        search={getDashboardPageCreateSearch('storefront')}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Storefront page</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Start a public shop surface for products, cart handoff, and checkout intake.</div>
                      </Link>
                      <Link
                        to="/pages/new"
                        search={getDashboardPageCreateSearch('blog-index')}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Blog index page</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Seed a post list page with taxonomy, feeds, and article route handoff.</div>
                      </Link>
                    </>
                  )}
                  {canViewCommerce && (
                    <>
                      <Link
                        to="/products"
                        search={{ siteId: activeSiteId }}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Product catalog</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Manage pricing, inventory, product media, delivery, and storefront API data.</div>
                      </Link>
                      <Link
                        to="/orders"
                        search={{ siteId: activeSiteId }}
                        className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="text-sm font-semibold text-foreground">Order queue</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">Review checkout intake, payment state, fulfillment, refunds, and support notes.</div>
                      </Link>
                    </>
                  )}
                  {canViewForms && (
                    <Link
                      to="/forms"
                      search={{ siteId: activeSiteId }}
                      className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="text-sm font-semibold text-foreground">Form builder</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">Configure registration, contact, lead, and custom submission workflows.</div>
                    </Link>
                  )}
                  {canViewUsers && (
                    <Link
                      to="/users"
                      search={{ siteId: activeSiteId }}
                      className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="text-sm font-semibold text-foreground">Member access</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">Manage roles, invites, registration handoff, and auth/provider readiness.</div>
                    </Link>
                  )}
                </div>
              </div>
            </section>

            <section id="dashboard-activity" className="rounded-lg border border-border bg-card shadow-sm scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <div>
                  <h2 className="font-semibold">Recent backend activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Audit-backed changes are shown first, with request ids for debugging.
                  </p>
                </div>
                <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Audit setup <ArrowUpRight className="size-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-border">
                {dashboard.auditLogs.length > 0 ? (
                  dashboard.auditLogs.slice(0, 6).map((log) => (
                    <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <History className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            <span className="capitalize">{actionLabel(log.action)}</span>{' '}
                            <span className="text-muted-foreground">{log.entity}</span>{' '}
                            <span>{titleFromAuditLog(log)}</span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(log.createdAt)}
                            {log.actorId ? ` by ${log.actorId}` : ''}
                          </p>
                          {log.requestId && (
                            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                              {log.requestId}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-5">
                    <EmptyState
                      icon={History}
                      title="No backend activity yet"
                      description="Authenticated content, settings, media, and workflow changes will appear here with request ids for debugging."
                    />
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section id="dashboard-attention" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" />
                <h2 className="font-semibold">Needs attention</h2>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {issues.length > 0 ? (
                  issues.map((issue) => (
                    <Link
                      key={issue.id}
                      to={issue.to}
                      search={getDashboardRouteSearch(issue.to)}
                      className={cn('block rounded-lg border px-3 py-3 text-sm transition-colors hover:bg-accent/40', issueTone[issue.severity])}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{issue.label}</p>
                          <p className="mt-1 text-xs opacity-90">{issue.detail}</p>
                        </div>
                        <ArrowRight className="mt-0.5 size-4 flex-shrink-0" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <EmptyState
                    icon={CheckCircle2}
                    title="No publish blockers found"
                    description="Loaded readiness checks have no blocking issues for the selected workspace. Refresh the dashboard after major content, API, or deployment changes."
                  />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-foreground" />
                <h2 className="font-semibold">Backend health</h2>
              </div>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Admin API</dt>
                  <dd className={backendHealthy ? 'text-success' : 'text-warning'}>
                    {backendHealthy ? 'Reachable' : 'Fallback'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd>{dashboard.settings?.deliveryMode || 'unknown'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Storage</dt>
                  <dd className={storage?.configured ? 'text-success' : 'text-warning'}>
                    {storage ? `${storage.provider} ${storage.configured ? 'ready' : 'needs config'}` : 'unknown'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Database</dt>
                  <dd className={database?.configured ? 'text-success' : 'text-warning'}>
                    {database ? `${database.provider} ${database.configured ? 'ready' : 'needs config'}` : 'unknown'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Supabase</dt>
                  <dd className={supabase?.configured ? 'text-success' : 'text-warning'}>
                    {supabase ? (supabase.configured ? 'Connected' : 'Needs config') : 'unknown'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Vercel</dt>
                  <dd className={vercel?.configured ? 'text-success' : 'text-warning'}>
                    {vercel ? (vercel.configured ? 'Connected' : 'Needs config') : 'unknown'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Readiness</dt>
                  <dd>{readinessErrors} errors, {readinessWarnings} warnings</dd>
                </div>
              </dl>
            </section>

            <section id="dashboard-api" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Code2 className="size-4 text-primary" />
                  <h2 className="font-semibold">API control plane</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyDashboardText(frontendHandoffText, 'Frontend handoff manifest')}
                    disabled={isDashboardBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    onClick={downloadFrontendHandoff}
                    disabled={isDashboardBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="size-3.5" />
                    Download
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Custom frontends should be able to rebuild the public experience from Backy contracts without touching admin internals.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">Mode</p>
                  <p className="mt-1 text-sm font-medium">{dashboard.settings?.deliveryMode || 'unknown'}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">Keys</p>
                  <p className={cn('mt-1 text-sm font-medium', apiKeysConfigured ? 'text-success' : 'text-warning')}>
                    {apiKeysConfigured ? 'Configured' : 'Needs setup'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col divide-y divide-border rounded-lg border border-border">
                {frontendContracts.map((contract) => (
                  <div key={contract.key} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{contract.label}</p>
                      <button
                        type="button"
                        onClick={() => void copyDashboardText(frontendContractUrls[contract.key], `${contract.label} endpoint`)}
                        disabled={isDashboardBusy}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Copy ${contract.label} endpoint`}
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                    <p className="mt-1 break-all font-mono text-[0.7rem] text-primary">{frontendContractUrls[contract.key]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contract.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Admin API roots</p>
                  <KeyRound className="size-3.5 text-muted-foreground" />
                </div>
                <div className="mt-3 grid gap-2">
                  {adminContractUrlEntries.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => void copyDashboardText(value, `${label} admin endpoint`)}
                      disabled={isDashboardBusy}
                      className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="block text-xs font-medium capitalize text-muted-foreground">{label}</span>
                      <span className="mt-1 block truncate font-mono text-[0.68rem] text-foreground">{value}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {canViewSettings && (
                  <Link
                    to="/settings"
                    className="inline-flex min-h-11 items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Open API and delivery settings
                    <ArrowRight className="size-4" />
                  </Link>
                )}
                <Link
                  to="/collections"
                  search={{ siteId: activeSiteId }}
                  className="inline-flex min-h-11 items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Manage frontend datasets
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
