/**
 * BACKY CMS - DASHBOARD HOME
 */

import { type ElementType, useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Database,
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
  listComments,
  listFormContacts,
  listForms,
  listPages,
  listSites,
  listUsers,
  type AdminAuditLog,
  type Collection,
  type FormDefinition,
  type SiteReadiness,
  type SiteSettingsInput,
} from '@/lib/adminContentApi';
import { getDefaultMediaSiteId, listMedia } from '@/lib/mediaApi';
import { PageShell } from '@/components/layout/PageShell';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore, type BlogPost, type Page, type Site, type User, type MediaAsset } from '@/stores/mockStore';

export const Route = createFileRoute('/')({
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
  settings?: SiteSettingsInput;
  auditLogs: AdminAuditLog[];
  readiness: SiteReadiness[];
  source: DashboardSource;
}

interface DashboardIssue {
  id: string;
  label: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
  to: '/sites' | '/pages' | '/settings' | '/media' | '/collections' | '/comments' | '/forms';
}

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
  { label: 'Media', key: 'media', detail: 'Public assets, fonts, files' },
  { label: 'Collections', key: 'collections', detail: 'Structured records for custom UI' },
  { label: 'Forms', key: 'forms', detail: 'Definitions and submission endpoints' },
  { label: 'Comments', key: 'comments', detail: 'Moderation-ready public discussions' },
];

const listContactCountForDashboard = async (siteId: string, formId: string): Promise<number> => {
  try {
    const result = await listFormContacts(siteId, formId, { limit: 1 });
    return result.count;
  } catch {
    return 0;
  }
};

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
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ElementType;
  to: '/sites' | '/pages' | '/blog' | '/media' | '/users' | '/collections' | '/forms' | '/comments' | '/products' | '/orders';
  tone: string;
}) {
  return (
    <Link
      to={to}
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

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
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

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

function Index() {
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
  const [selectedSiteId, setSelectedSiteId] = useState('');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sites, users, settings, auditResult] = await Promise.all([
        listSites(),
        listUsers(),
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
      const forms = formsBySite.flat();
      const contactCounts = await Promise.all(
        forms.map((form) => listContactCountForDashboard(form.siteId, form.id)),
      );

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
        collections: collectionsBySite.flat(),
        forms,
        contacts: contactCounts.reduce((total, count) => total + count, 0),
        comments: commentsBySite.reduce((total, result) => total + (result?.count ?? 0), 0),
        pendingComments: commentsBySite.reduce((total, result) => (
          total + (result?.comments.filter((comment) => comment.status === 'pending').length ?? 0)
        ), 0),
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
        auditLogs: fallbackAuditLogs(fallbackStore.sites, fallbackStore.pages, fallbackStore.posts),
        source: 'fallback',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fallbackStore.media, fallbackStore.pages, fallbackStore.posts, fallbackStore.sites, fallbackStore.users]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedSiteId && dashboard.sites[0]) {
      setSelectedSiteId(dashboard.sites[0].publicSiteId || dashboard.sites[0].id);
    }
  }, [dashboard.sites, selectedSiteId]);

  const issues = useMemo(() => buildDashboardIssues(dashboard, error), [dashboard, error]);
  const publishedSites = dashboard.sites.filter((site) => site.status === 'published').length;
  const draftPages = dashboard.pages.filter((page) => page.status !== 'published').length;
  const draftPosts = dashboard.posts.filter((post) => post.status !== 'published').length;
  const publishedCollections = dashboard.collections.filter((collection) => collection.status === 'published').length;
  const productsCollection = dashboard.collections.find((collection) => collection.slug === 'products');
  const ordersCollection = dashboard.collections.find((collection) => collection.slug === 'orders');
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
    media: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/media`,
    collections: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections`,
    forms: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms`,
    comments: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments`,
  };
  const adminContractUrls = {
    sites: `${adminBaseUrl}/sites`,
    pages: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/pages`,
    collections: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/collections`,
    settings: `${adminBaseUrl}/settings`,
  };

  const copyDashboardText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

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
      value: [productsCollection, ordersCollection].filter(Boolean).length,
      detail: `${productsCollection ? 'Products' : 'No products'} · ${ordersCollection ? 'Orders' : 'No orders'}`,
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
          disabled={isLoading}
          aria-label="Refresh dashboard data"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium',
            'hover:bg-accent transition-colors disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
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
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="min-w-48 rounded-lg border bg-background px-3 py-2 text-sm"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex flex-col gap-6 xl:col-span-2">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
            </section>

            <section className="rounded-lg border border-border bg-card shadow-sm">
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
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
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

            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Code2 className="size-4 text-primary" />
                <h2 className="font-semibold">API control plane</h2>
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
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                      className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-left transition-colors hover:bg-accent"
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
