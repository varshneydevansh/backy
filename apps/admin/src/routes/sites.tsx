/**
 * BACKY CMS - SITES PAGE
 *
 * Workspace hub for website ownership, publishing state, and site operations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  Code2,
  Copy,
  Download,
  Edit,
  Eye,
  Filter,
  Globe,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  deleteSite as deleteSiteFromApi,
  listSites,
  updateSite as updateSiteFromApi,
} from '@/lib/adminContentApi';
import { useStore, type Site } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { DataGrid } from '@/components/ui/DataGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/sites')({
  component: SitesLayout,
});

type SiteStatusFilter = 'all' | Site['status'];

const STATUS_OPTIONS: Array<{ value: Site['status']; label: string }> = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

const getDisplayDomain = (site: Site) => site.customDomain || `${site.slug}.backy.app`;

const getPublicPreviewHref = (site: Site) => {
  const domain = getDisplayDomain(site);
  if (site.customDomain) {
    return `https://${domain}`;
  }

  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `http://localhost:3001/sites/${site.slug}`;
  }

  return `/sites/${site.slug}`;
};

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getApiBaseUrl = (kind: 'public' | 'admin'): string => {
  const envBase = (
    kind === 'admin'
      ? getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
        getEnvValue('VITE_ADMIN_API_URL') ||
        getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
        getEnvValue('VITE_PUBLIC_API_URL') ||
        getEnvValue('VITE_API_BASE_URL')
      : getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
        getEnvValue('VITE_PUBLIC_API_URL') ||
        getEnvValue('VITE_API_BASE_URL')
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return kind === 'admin' ? 'http://localhost:3001/api/admin' : 'http://localhost:3001/api';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api${kind === 'admin' ? '/admin' : ''}`;
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

function SitesLayout() {
  const routerState = useRouterState();
  const isExactSitesRoute = routerState.location.pathname === '/sites';

  if (isExactSitesRoute) {
    return <SitesListView />;
  }

  return <Outlet />;
}

function SitesListView() {
  const navigate = useNavigate();
  const { sites, setSites, deleteSite } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [updatingSiteId, setUpdatingSiteId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);
  const publicApiBase = useMemo(() => getApiBaseUrl('public'), []);
  const adminApiBase = useMemo(() => getApiBaseUrl('admin'), []);

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const backendSites = await listSites();
      setSites(backendSites);
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'Unable to load sites');
    } finally {
      setIsLoading(false);
    }
  }, [setSites]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const metrics = useMemo(() => {
    const published = sites.filter((site) => site.status === 'published').length;
    const draft = sites.filter((site) => site.status === 'draft').length;
    const archived = sites.filter((site) => site.status === 'archived').length;
    const pages = sites.reduce((total, site) => total + (site.pageCount || 0), 0);

    return [
      { label: 'Sites', value: sites.length, detail: `${published} public`, icon: Globe },
      { label: 'Pages controlled', value: pages, detail: 'Across all workspaces', icon: Layers3 },
      { label: 'Draft sites', value: draft, detail: 'Private until published', icon: Edit },
      { label: 'Archived', value: archived, detail: 'Hidden from active work', icon: AlertTriangle },
    ];
  }, [sites]);

  const filteredSites = useMemo(() => (
    statusFilter === 'all' ? sites : sites.filter((site) => site.status === statusFilter)
  ), [sites, statusFilter]);
  const selectedApiSite = useMemo(() => filteredSites[0] || sites[0] || null, [filteredSites, sites]);
  const selectedApiSiteId = selectedApiSite?.publicSiteId || selectedApiSite?.id || '{siteId}';
  const adminSitesUrl = `${adminApiBase}/sites`;
  const adminSiteDetailUrl = `${adminApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}`;
  const publicManifestUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/manifest`;
  const publicOpenApiUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/openapi`;
  const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/render?path=/`;

  const handleStatusChange = async (site: Site, status: Site['status']) => {
    setUpdatingSiteId(site.id);
    setNotice(null);

    try {
      const saved = await updateSiteFromApi(site.publicSiteId || site.id, { status });
      setSites(sites.map((item) => (item.id === site.id ? saved : item)));
      setNotice(`${saved.name} is now ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update site status');
    } finally {
      setUpdatingSiteId(null);
    }
  };

  const handleDeleteSite = async () => {
    if (!pendingDelete) return;

    setUpdatingSiteId(pendingDelete.id);
    setNotice(null);

    try {
      await deleteSiteFromApi(pendingDelete.publicSiteId || pendingDelete.id);
      deleteSite(pendingDelete.id);
      setPendingDelete(null);
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : 'Unable to delete site');
    } finally {
      setUpdatingSiteId(null);
    }
  };

  const copySiteApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const columns: Column<Site>[] = [
    {
      key: 'name',
      label: 'Site',
      sortable: true,
      render: (site) => (
        <button
          type="button"
          onClick={() => navigate({ to: '/sites/$siteId', params: { siteId: site.id } })}
          className="group flex min-w-[260px] items-center gap-3 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Globe className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground group-hover:text-primary">{site.name}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{getDisplayDomain(site)}</span>
          </span>
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (site) => (
        <div className="space-y-2">
          <StatusBadge status={site.status} />
          <select
            value={site.status}
            disabled={updatingSiteId === site.id}
            onChange={(event) => void handleStatusChange(site, event.target.value as Site['status'])}
            className="block w-36 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={`Change status for ${site.name}`}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
      ),
    },
    {
      key: 'pageCount',
      label: 'Pages',
      sortable: true,
      render: (site) => <span className="text-sm text-muted-foreground">{site.pageCount} pages</span>,
    },
    {
      key: 'lastUpdated',
      label: 'Updated',
      sortable: true,
      render: (site) => <span className="text-sm text-muted-foreground">{formatDate(site.lastUpdated)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (site) => (
        <div className="flex items-center justify-end gap-2">
          <a
            href={getPublicPreviewHref(site)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`Preview ${site.name}`}
            title="Preview site"
          >
            <Eye className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => navigate({ to: '/sites/$siteId', params: { siteId: site.id } })}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`Manage ${site.name}`}
            title="Manage site"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(site)}
            disabled={updatingSiteId === site.id}
            className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50"
            aria-label={`Delete ${site.name}`}
            title="Delete site"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const {
    data,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
  } = useDataTable({
    data: filteredSites,
    columns,
    initialSort: { key: 'lastUpdated', direction: 'desc' },
    pageSize: 8,
  });

  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== 'all';

  const handleExportSites = () => {
    if (data.length === 0) return;

    const header = [
      'site_id',
      'public_site_id',
      'name',
      'slug',
      'custom_domain',
      'status',
      'page_count',
      'last_updated',
      'preview_url',
    ];
    const rows = data.map((site) => [
      site.id,
      site.publicSiteId || '',
      site.name,
      site.slug,
      site.customDomain || '',
      site.status,
      site.pageCount || 0,
      site.lastUpdated || '',
      getPublicPreviewHref(site),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-sites.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="Sites"
      description="Create, publish, preview, and manage every frontend workspace Backy controls."
      action={
        <Link
          to="/sites/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Plus className="h-4 w-4" />
          New site
        </Link>
      }
      className="mx-auto max-w-7xl"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <metric.icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Site frontend API"
          description="Discovery, rendering, and admin management endpoints for custom frontends connected to this workspace."
          icon={<Code2 className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={data.length === 0}
                onClick={handleExportSites}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copySiteApiText(publicManifestUrl, 'Site manifest URL')}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-4">
            <SiteApiStat label="Selected site" value={selectedApiSite?.name || 'No site'} />
            <SiteApiStat label="Published" value={`${sites.filter((site) => site.status === 'published').length}`} />
            <SiteApiStat label="Draft" value={`${sites.filter((site) => site.status === 'draft').length}`} />
            <SiteApiStat label="Custom domains" value={`${sites.filter((site) => site.customDomain).length}`} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <SiteApiSnippet label="Frontend manifest" value={publicManifestUrl} />
            <SiteApiSnippet label="OpenAPI schema" value={publicOpenApiUrl} />
            <SiteApiSnippet label="Render by path" value={publicRenderUrl} />
            <SiteApiSnippet label="Admin sites" value={adminSitesUrl} />
            <SiteApiSnippet label="Admin site detail" value={adminSiteDetailUrl} />
          </div>
        </PanelContent>
      </Panel>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search sites, slugs, domains, or status..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              aria-label="Search sites"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as SiteStatusFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                aria-label="Filter sites by status"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadSites()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              aria-label="Refresh sites"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {notice && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </div>
        )}
      </div>

      <DataGrid
        columns={columns}
        data={data}
        loading={isLoading}
        sortConfig={sortConfig}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalItems}
        emptyState={
          <EmptyState
            icon={hasActiveFilters ? Search : Globe}
            title={hasActiveFilters ? 'No sites match those controls' : 'No sites found'}
            description={hasActiveFilters ? 'Clear the search or filters to return to the full workspace list.' : 'Create the first site before adding pages, navigation, media, products, or forms.'}
            action={
              hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCurrentPage(1);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/sites/new"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Create site
                </Link>
              )
            }
          />
        }
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDelete.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the site workspace and its managed content from the admin backend. Use archive when you only want to hide it.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Public address: <span className="font-medium text-foreground">{getDisplayDomain(pendingDelete)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSite()}
                disabled={updatingSiteId === pendingDelete.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                Delete site
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SiteApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function SiteApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}
