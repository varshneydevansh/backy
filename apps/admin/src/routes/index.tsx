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
  Package,
  RefreshCw,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import {
  getSettings,
  getSiteReadiness,
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
  type Collection,
  type CollectionRecord,
  type FormDefinition,
  type SettingsInfrastructureDiagnostic,
  type SiteReadiness,
  type SiteSettingsInput,
} from '@/lib/adminContentApi';
import { getDefaultMediaSiteId, listMedia } from '@/lib/mediaApi';
import { PageShell } from '@/components/layout/PageShell';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore, type BlogPost, type Page, type Site, type User, type MediaAsset } from '@/stores/mockStore';
import { siteMatchesIdentifier } from '@/lib/siteSelection';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { siteId?: string } => ({
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
  component: Index,
});

type DashboardSource = 'backend' | 'fallback';

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
  settings?: SiteSettingsInput;
  auditLogs: AdminAuditLog[];
  readiness: SiteReadiness[];
  source: DashboardSource;
}

interface DashboardCommerceMetrics {
  productCount: number;
  orderCount: number;
  openOrderCount: number;
  paidOrderCount: number;
  loadedOrderValue: number;
  currency: string;
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
  to: '/sites' | '/pages' | '/settings' | '/media' | '/collections' | '/comments' | '/forms' | '/products' | '/orders';
}

const emptyCommerceMetrics = (): DashboardCommerceMetrics => ({
  productCount: 0,
  orderCount: 0,
  openOrderCount: 0,
  paidOrderCount: 0,
  loadedOrderValue: 0,
  currency: 'USD',
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

const loadCommerceMetricsForDashboard = async (
  collections: Collection[],
): Promise<DashboardCommerceMetrics> => {
  const productCollections = collections.filter((collection) => collection.slug === 'products');
  const orderCollections = collections.filter((collection) => collection.slug === 'orders');
  const productResults = await Promise.all(productCollections.map((collection) => (
    listCollectionRecords(collection.siteId, collection.id, { limit: 1 }).catch(() => null)
  )));
  const orderResults = await Promise.all(orderCollections.map((collection) => (
    listCollectionRecords(collection.siteId, collection.id, { limit: 100 }).catch(() => null)
  )));
  const orderRecords = orderResults.flatMap((result) => result?.records || []);
  const currency = orderRecords.map(orderRecordCurrency).find(Boolean) || 'USD';

  return {
    productCount: productResults.reduce((total, result) => total + (result?.pagination.total ?? 0), 0),
    orderCount: orderResults.reduce((total, result) => total + (result?.pagination.total ?? 0), 0),
    openOrderCount: orderRecords.filter(isOpenOrderRecord).length,
    paidOrderCount: orderRecords.filter((record) => orderStatusValue(record, 'paymentstatus') === 'paid').length,
    loadedOrderValue: orderRecords.reduce((total, record) => total + orderRecordTotal(record), 0),
    currency,
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
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
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
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
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
  const [infrastructureDiagnostics, setInfrastructureDiagnostics] = useState<SettingsInfrastructureDiagnostic[]>([]);
  const [isCheckingInfrastructure, setIsCheckingInfrastructure] = useState(false);
  const [deploymentRuns, setDeploymentRuns] = useState<DashboardDeploymentRun[]>([]);
  const [isRunningDeployment, setIsRunningDeployment] = useState(false);
  const isDashboardBusy = isLoading || isCheckingInfrastructure || isRunningDeployment;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sites, users, settings, auditResult] = await Promise.all([
        listSites(),
        listUsers().catch(() => [] as User[]),
        getSettings(),
        listAdminAuditLogs({ limit: 8 }),
      ]);
      const [pagesBySite, postsBySite, readinessBySite, mediaBySite] = await Promise.all([
        Promise.all(sites.map((site) => listPages(site.id).catch(() => [] as Page[]))),
        Promise.all(sites.map((site) => listBlogPosts(site.id).catch(() => [] as BlogPost[]))),
        Promise.all(sites.map((site) => getSiteReadiness(site.id).catch(() => null))),
        Promise.all(sites.map((site) => listMedia({ siteId: site.id, limit: 200 }).catch(() => [] as MediaAsset[]))),
      ]);
      const [collectionsBySite, formsBySite, commentsBySite] = await Promise.all([
        Promise.all(sites.map((site) => listCollections(site.id).catch(() => [] as Collection[]))),
        Promise.all(sites.map((site) => listForms(site.id).catch(() => [] as FormDefinition[]))),
        Promise.all(sites.map((site) => listComments(site.id, { limit: 100 }).catch(() => null))),
      ]);
      const collections = collectionsBySite.flat();
      const forms = formsBySite.flat();
      const contactCounts = await Promise.all(
        forms.map((form) => listContactCountForDashboard(form.siteId, form.id)),
      );
      const commerce = await loadCommerceMetricsForDashboard(collections);

      const media = mediaBySite.flat();
      const defaultMediaSiteId = getDefaultMediaSiteId();
      const defaultSiteAlreadyLoaded = sites.some((site) => site.id === defaultMediaSiteId);
      const defaultSiteMedia = defaultSiteAlreadyLoaded
        ? []
        : await listMedia({ siteId: defaultMediaSiteId, limit: 200 }).catch(() => [] as MediaAsset[]);

      setDashboard({
        sites,
        pages: pagesBySite.flat(),
        posts: postsBySite.flat(),
        users,
        media: [...media, ...defaultSiteMedia],
        collections,
        forms,
        contacts: contactCounts.reduce((total, count) => total + count, 0),
        comments: commentsBySite.reduce((total, result) => total + (result?.count ?? 0), 0),
        pendingComments: commentsBySite.reduce((total, result) => (
          total + (result?.comments.filter((comment) => comment.status === 'pending').length ?? 0)
        ), 0),
        commerce,
        settings,
        auditLogs: auditResult.logs,
        readiness: readinessBySite.filter((item): item is SiteReadiness => Boolean(item)),
        source: 'backend',
      });
      setInfrastructureDiagnostics([]);
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
        auditLogs: fallbackAuditLogs(fallbackStore.sites, fallbackStore.pages, fallbackStore.posts),
        source: 'fallback',
      });
      setInfrastructureDiagnostics([]);
    } finally {
      setIsLoading(false);
    }
  }, [fallbackStore.media, fallbackStore.pages, fallbackStore.posts, fallbackStore.sites, fallbackStore.users]);

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
  const apiKeysConfigured = Boolean(
    dashboard.settings?.apiKeys.publicApiKey && dashboard.settings?.apiKeys.adminApiKey
  );
  const activeSite = dashboard.sites.find((site) => (
    site.id === selectedSiteId || site.publicSiteId === selectedSiteId
  )) || dashboard.sites[0] || fallbackStore.sites[0];
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = getPublicBaseUrl();
  const adminBaseUrl = getAdminBaseUrl();
  const frontendContractUrls: Record<string, string> = {
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
  };
  const adminContractUrls = {
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
  };
  const getDashboardRouteSearch = (
    to: '/sites' | '/pages' | '/blog' | '/media' | '/users' | '/settings' | '/collections' | '/forms' | '/comments' | '/products' | '/orders' | '/sites/new' | '/pages/new' | '/blog/new',
  ) => (
    ['/pages', '/blog', '/media', '/collections', '/forms', '/comments', '/products', '/orders', '/users', '/pages/new', '/blog/new'].includes(to)
      ? { siteId: activeSiteId }
      : undefined
  );
  const selectDashboardSite = (nextSiteId: string) => {
    if (isDashboardBusy) return;

    setSelectedSiteId(nextSiteId);
    navigate({ to: '/', search: { siteId: nextSiteId }, replace: true });
  };
  const frontendHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
      domain: activeSite?.customDomain || (activeSite?.slug ? `${activeSite.slug}.backy.app` : undefined),
    },
    deliveryMode: dashboard.settings?.deliveryMode || 'unknown',
    health: {
      backend: backendHealthy ? 'reachable' : 'fallback',
      storage: storage ? { provider: storage.provider, configured: storage.configured, missing: storage.missing || [] } : null,
      database: database ? { provider: database.provider, configured: database.configured, missing: database.missing || [] } : null,
      supabase: supabase ? { configured: supabase.configured, missing: supabase.missing || [] } : null,
      vercel: vercel ? { configured: vercel.configured, missing: vercel.missing || [] } : null,
      readiness: { errors: readinessErrors, warnings: readinessWarnings },
    },
    publicEndpoints: frontendContractUrls,
    adminEndpoints: adminContractUrls,
    controlRoutes: {
      sites: '/sites',
      pages: `/pages?siteId=${encodeURIComponent(activeSiteId)}`,
      pageBuilder: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}`,
      contactPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=contact`,
      registrationPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=registration`,
      storefrontPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=storefront`,
      blogIndexPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=blog-index`,
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
      orderCount: dashboard.commerce.orderCount,
      openOrderCount: dashboard.commerce.openOrderCount,
      paidOrderCount: dashboard.commerce.paidOrderCount,
      loadedOrderValue: dashboard.commerce.loadedOrderValue,
      currency: dashboard.commerce.currency,
      productsCollection: productsCollection
        ? { id: productsCollection.id, status: productsCollection.status, publicRead: productsCollection.permissions.publicRead }
        : null,
      ordersCollection: ordersCollection
        ? { id: ordersCollection.id, status: ordersCollection.status, publicRead: ordersCollection.permissions.publicRead }
        : null,
    },
    modules: DASHBOARD_MODULES.map((module) => ({
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
      products: dashboard.commerce.productCount,
      orders: dashboard.commerce.orderCount,
    },
  }), [
    activeSite,
    activeSiteId,
    adminContractUrls,
    backendHealthy,
    dashboard.collections.length,
    dashboard.comments,
    dashboard.contacts,
    dashboard.commerce,
    dashboard.forms.length,
    dashboard.media.length,
    dashboard.pages.length,
    dashboard.pendingComments,
    dashboard.posts.length,
    dashboard.settings?.deliveryMode,
    dashboard.sites.length,
    database,
    frontendContractUrls,
    ordersCollection,
    productsCollection,
    readinessErrors,
    readinessWarnings,
    storage,
    supabase,
    vercel,
  ]);
  const frontendHandoffText = useMemo(() => JSON.stringify(frontendHandoff, null, 2), [frontendHandoff]);
  const infrastructureDiagnosticSummary = useMemo(() => {
    const ready = infrastructureDiagnostics.filter((item) => item.status === 'ready').length;
    const warning = infrastructureDiagnostics.filter((item) => item.status === 'warning').length;
    const blocked = infrastructureDiagnostics.filter((item) => item.status === 'blocked').length;

    return { ready, warning, blocked, total: infrastructureDiagnostics.length };
  }, [infrastructureDiagnostics]);
  const platformReadiness = useMemo(() => {
    const activeUsers = dashboard.users.filter((item) => item.status === 'active').length;
    const activeAdmins = dashboard.users.filter((item) => (
      item.status === 'active' && (item.role === 'owner' || item.role === 'admin')
    )).length;
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
      },
      {
        label: 'API keys',
        detail: apiKeysConfigured ? 'Public and admin API keys are configured.' : 'Configure API keys before external frontend handoff.',
        ready: apiKeysConfigured,
        to: '/settings' as const,
      },
      {
        label: 'Database',
        detail: database?.configured ? `${database.provider} is configured.` : 'Configure the runtime database or Supabase connection.',
        ready: Boolean(database?.configured || supabase?.configured),
        to: '/settings' as const,
      },
      {
        label: 'Storage',
        detail: storage?.configured ? `${storage.provider} storage is ready.` : 'Configure central file storage for media delivery.',
        ready: Boolean(storage?.configured),
        to: '/media' as const,
      },
      {
        label: 'Vercel',
        detail: vercel?.configured ? 'Deployment integration is connected.' : 'Connect Vercel when hosted frontend deployment is required.',
        ready: Boolean(vercel?.configured),
        to: '/settings' as const,
      },
      {
        label: 'Sites and content',
        detail: hasPublicContent ? 'Published site content is available for rendering.' : 'Publish a site and at least one page, post, or collection.',
        ready: hasPublicContent,
        to: '/sites' as const,
      },
      {
        label: 'Media library',
        detail: dashboard.media.length > 0 ? `${dashboard.media.length} assets available.` : 'Upload images, files, fonts, or downloads.',
        ready: dashboard.media.length > 0,
        to: '/media' as const,
      },
      {
        label: 'Dynamic data',
        detail: dashboard.collections.length > 0 ? `${dashboard.collections.length} collections loaded.` : 'Create collections for reusable frontend data.',
        ready: dashboard.collections.length > 0,
        to: '/collections' as const,
      },
      {
        label: 'Forms and leads',
        detail: dashboard.forms.length > 0 ? `${dashboard.forms.length} forms, ${dashboard.contacts} contacts.` : 'Add lead, registration, or contact forms.',
        ready: dashboard.forms.length > 0,
        to: '/forms' as const,
      },
      {
        label: 'Commerce',
        detail: hasCommerce ? 'Products and orders schemas are present.' : 'Sync product and order schemas for selling workflows.',
        ready: hasCommerce,
        to: hasCommerce ? '/products' as const : '/collections' as const,
      },
      {
        label: 'Team access',
        detail: activeAdmins > 0 ? `${activeUsers} active users, ${activeAdmins} active admins.` : 'Keep at least one active owner/admin.',
        ready: activeAdmins > 0,
        to: '/users' as const,
      },
      {
        label: 'Readiness blockers',
        detail: readinessErrors === 0 ? `${readinessWarnings} readiness warnings.` : `${readinessErrors} errors block publish handoff.`,
        ready: readinessErrors === 0,
        to: '/sites' as const,
      },
    ];
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
    if (!dashboard.settings || isCheckingInfrastructure) return;

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
    if (!dashboard.settings || isRunningDeployment) return;

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
    },
    {
      label: 'Connect APIs and infrastructure',
      detail: apiKeysConfigured && (database?.configured || supabase?.configured) && storage?.configured
        ? 'API keys, persistence, and media storage are configured.'
        : 'Configure API keys, persistence, media storage, Supabase, and deployment integrations.',
      ready: Boolean(apiKeysConfigured && (database?.configured || supabase?.configured) && storage?.configured),
      to: '/settings' as const,
    },
  ]), [
    aggregateAnalytics.publishedContent,
    apiKeysConfigured,
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
  ];

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

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="dashboard-command-center">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadDashboard()}
                disabled={isDashboardBusy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDashboardBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Refresh data
              </button>
              <button
                type="button"
                onClick={() => void copyDashboardText(frontendHandoffText, 'Frontend handoff manifest')}
                disabled={isDashboardBusy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="size-4" />
                Copy handoff
              </button>
              <button
                type="button"
                onClick={downloadFrontendHandoff}
                disabled={isDashboardBusy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="size-4" />
                Download JSON
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
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

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Dashboard control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">Jump to the live site scope, totals, readiness, creation workflows, attention queue, and API handoff.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
              {DASHBOARD_CONTROL_AREAS.map((area) => (
                <a
                  key={area.title}
                  href={area.href}
                  aria-disabled={isDashboardBusy}
                  onClick={(event) => {
                    if (isDashboardBusy) event.preventDefault();
                  }}
                  className={cn(
                    'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                    isDashboardBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  <div className="text-sm font-semibold text-foreground">{area.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Backy module map</h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  The dashboard now names the control surfaces Backy already has and the parity areas still queued for Wix, Webflow, Squarespace, and WordPress-style coverage.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {DASHBOARD_MODULES.filter((module) => module.status === 'Available').length} available · {DASHBOARD_MODULES.filter((module) => module.status === 'Next').length} next
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {DASHBOARD_MODULES.map((module) => (
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
              disabled={isDashboardBusy || !dashboard.settings}
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
                <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  No deployment preflight has run in this dashboard session.
                </div>
              )}
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
            disabled={isDashboardBusy}
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
          {isLoading && <span className="text-muted-foreground">Updating dashboard data...</span>}
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
                  disabled={isDashboardBusy || !dashboard.settings}
                  aria-label="Run dashboard infrastructure check"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCheckingInfrastructure ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Run infrastructure check
                </button>
                <Link
                  to="/settings"
                  search={{ tab: 'infrastructure' }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Open infrastructure <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>

            {infrastructureDiagnostics.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground">
                No dashboard infrastructure check has run in this session. Use the check to reveal exact missing runtime fields for Supabase, storage, database persistence, and Vercel deployment.
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
                <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  API settings <ArrowUpRight className="size-3.5" />
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  { label: 'New site', to: '/sites/new' as const, icon: Globe, detail: 'Website container' },
                  { label: 'New page', to: '/pages/new' as const, icon: Layout, detail: 'Visual canvas' },
                  { label: 'New post', to: '/blog/new' as const, icon: FileText, detail: 'Blog article' },
                  { label: 'Media library', to: '/media' as const, icon: HardDrive, detail: 'Images, files, fonts' },
                  { label: 'Collections', to: '/collections' as const, icon: Database, detail: 'Structured data' },
                  { label: 'API setup', to: '/settings' as const, icon: Settings, detail: 'Frontend control' },
                ].map((action) => (
                  <Link
                    key={action.label}
                    to={action.to}
                    search={getDashboardRouteSearch(action.to)}
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
                  <Link
                    to="/pages/new"
                    search={{ siteId: activeSiteId, template: 'registration' }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Registration page</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Seed member/signup capture that hands off to Forms and Users.</div>
                  </Link>
                  <Link
                    to="/pages/new"
                    search={{ siteId: activeSiteId, template: 'contact' }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Contact page</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Create an editable inquiry page connected to Backy form capture.</div>
                  </Link>
                  <Link
                    to="/pages/new"
                    search={{ siteId: activeSiteId, template: 'storefront' }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Storefront page</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Start a public shop surface for products, cart handoff, and checkout intake.</div>
                  </Link>
                  <Link
                    to="/pages/new"
                    search={{ siteId: activeSiteId, template: 'blog-index' }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Blog index page</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Seed a post list page with taxonomy, feeds, and article route handoff.</div>
                  </Link>
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
                  <Link
                    to="/forms"
                    search={{ siteId: activeSiteId }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Form builder</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Configure registration, contact, lead, and custom submission workflows.</div>
                  </Link>
                  <Link
                    to="/users"
                    search={{ siteId: activeSiteId }}
                    className="rounded-lg border border-border bg-card px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">Member access</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">Manage roles, invites, registration handoff, and auth/provider readiness.</div>
                  </Link>
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
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No activity has been recorded yet.
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
                  <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-3 text-sm text-success">
                    No publish blockers found in loaded readiness checks.
                  </div>
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
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Copy ${contract.label} endpoint`}
                      >
                        <Copy className="size-3.5" />
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
                  {Object.entries(adminContractUrls).map(([label, value]) => (
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
                <Link
                  to="/settings"
                  className="inline-flex min-h-11 items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Open API and delivery settings
                  <ArrowRight className="size-4" />
                </Link>
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
