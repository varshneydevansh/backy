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
  Code2,
  Database,
  FileText,
  Globe,
  HardDrive,
  History,
  KeyRound,
  Layout,
  Loader2,
  Package,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react';
import {
  getSettings,
  getSiteReadiness,
  listAdminAuditLogs,
  listBlogPosts,
  listPages,
  listSites,
  listUsers,
  type AdminAuditLog,
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
  to: '/sites' | '/pages' | '/settings' | '/media' | '/collections';
}

const emptyDashboardData = (): DashboardData => ({
  sites: [],
  pages: [],
  posts: [],
  users: [],
  media: [],
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
  { label: 'Manifest', path: '/api/sites/:siteId/manifest', detail: 'Routes, capability flags, schemas' },
  { label: 'Render', path: '/api/sites/:siteId/render', detail: 'Page, post, collection payloads' },
  { label: 'Media', path: '/api/sites/:siteId/media', detail: 'Public assets, fonts, files' },
  { label: 'Collections', path: '/api/sites/:siteId/collections', detail: 'Structured records for custom UI' },
];

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
  to: '/sites' | '/pages' | '/blog' | '/media' | '/users';
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
    auditLogs: fallbackAuditLogs(fallbackStore.sites, fallbackStore.pages, fallbackStore.posts),
    source: 'fallback',
  }));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const issues = useMemo(() => buildDashboardIssues(dashboard, error), [dashboard, error]);
  const publishedSites = dashboard.sites.filter((site) => site.status === 'published').length;
  const draftPages = dashboard.pages.filter((page) => page.status !== 'published').length;
  const draftPosts = dashboard.posts.filter((post) => post.status !== 'published').length;
  const readinessErrors = dashboard.readiness.reduce((total, item) => total + item.summary.errors, 0);
  const readinessWarnings = dashboard.readiness.reduce((total, item) => total + item.summary.warnings, 0);
  const backendHealthy = dashboard.source === 'backend' && !error;
  const storage = dashboard.settings?.runtimeStorage;
  const apiKeysConfigured = Boolean(
    dashboard.settings?.apiKeys.publicApiKey && dashboard.settings?.apiKeys.adminApiKey
  );

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
      label: 'Media assets',
      value: dashboard.media.length,
      detail: storage ? `${storage.provider} storage` : 'Library files',
      icon: HardDrive,
      to: '/media' as const,
      tone: 'bg-success/10 text-success',
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
                  <div key={contract.path} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{contract.label}</p>
                      <KeyRound className="size-3.5 text-muted-foreground" />
                    </div>
                    <p className="mt-1 break-all font-mono text-[0.7rem] text-primary">{contract.path}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contract.detail}</p>
                  </div>
                ))}
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
