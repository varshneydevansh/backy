/**
 * BACKY CMS - PAGES LIST
 * 
 * This route is a LAYOUT route - it renders different content:
 * - At /pages exactly: shows the pages list
 * - At /pages/new or /pages/:id/edit: renders child via <Outlet />
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Code2, Copy, ExternalLink, Eye, Filter, Plus, Layout, Edit, Trash2, Home } from 'lucide-react';
import {
  archivePage,
  createPagePreview,
  deletePage as deletePageFromApi,
  getSiteReadiness,
  listPages,
  publishPage,
  type PageReadiness,
} from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/pages')({
  component: PagesLayout,
});

/**
 * Layout component that decides what to render based on current path:
 * - /pages -> shows PagesListView
 * - /pages/new, /pages/:id/edit -> renders <Outlet /> for child routes
 */
function PagesLayout() {
  const routerState = useRouterState();
  const isExactPagesRoute = routerState.location.pathname === '/pages';

  // If we're at exactly /pages, show the list. Otherwise, render child route.
  if (isExactPagesRoute) {
    return <PagesListView />;
  }

  return <Outlet />;
}

function PagesListView() {
  const navigate = useNavigate();
  const { sites, pages, setPages, deletePage, updatePage } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [statusFilter, setStatusFilter] = useState<'all' | Page['status']>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'blocked'>('all');
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<'publish' | 'archive' | 'delete' | ''>('');
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [readinessMap, setReadinessMap] = useState<Record<string, PageReadiness>>({});
  const [previewingPageId, setPreviewingPageId] = useState<string | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<Page | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const visiblePages = useMemo(
    () => pages.filter((page) => {
      const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
      const matchesHealth = healthFilter === 'all' || readinessMap[page.id]?.statusLabel === healthFilter;

      return matchesStatus && matchesHealth;
    }),
    [healthFilter, pages, readinessMap, statusFilter],
  );
  const pageMetrics = useMemo(
    () => ({
      total: pages.length,
      published: pages.filter((page) => page.status === 'published').length,
      draft: pages.filter((page) => page.status === 'draft').length,
      scheduled: pages.filter((page) => page.status === 'scheduled').length,
      blocked: pages.filter((page) => readinessMap[page.id]?.statusLabel === 'blocked').length,
    }),
    [pages, readinessMap],
  );
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminBaseUrl = useMemo(() => getAdminBaseUrl(), []);
  const siteSlug = activeSite?.slug || activeSiteId;
  const selectedPages = useMemo(
    () => pages.filter((page) => selectedPageIds.has(page.id)),
    [pages, selectedPageIds],
  );
  const apiPage = selectedPages[0] || pages.find((page) => page.status === 'published') || pages[0] || null;
  const apiPageSegment = apiPage?.id ? encodeURIComponent(apiPage.id) : '{pageId}';
  const apiPageSlug = apiPage?.slug ? encodeURIComponent(apiPage.slug) : '{pageSlug}';
  const apiPagePath = apiPage ? pagePublicPath(apiPage) : '/{pageSlug}';
  const publicPagesUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/pages`;
  const publicPageBySlugUrl = `${publicPagesUrl}?slug=${apiPageSlug}`;
  const publicRenderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${apiPage ? encodeURIComponent(apiPagePath) : '/{pageSlug}'}`;
  const publicResolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${apiPage ? encodeURIComponent(apiPagePath) : '/{pageSlug}'}`;
  const adminPagesUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/pages`;
  const adminPageDetailUrl = `${adminPagesUrl}/${apiPageSegment}`;
  const adminPageReadinessUrl = `${adminPageDetailUrl}/readiness`;
  const adminPagePreviewUrl = `${adminPageDetailUrl}/preview`;

  const openCreatePage = () => {
    navigate({ to: '/pages/new', search: { siteId: activeSiteId } });
  };

  const setPageStatusFilter = (status: 'all' | Page['status']) => {
    setStatusFilter(status);
    setHealthFilter('all');
  };

  const showBlockedPages = () => {
    setStatusFilter('all');
    setHealthFilter('blocked');
  };

  const copyPageApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((current) => {
      const next = new Set(current);

      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

      return next;
    });
  };

  const setPageSelection = (targetPages: Page[], selected: boolean) => {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      targetPages.forEach((page) => {
        if (selected) {
          next.add(page.id);
        } else {
          next.delete(page.id);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === selectedSiteId)) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const refreshPages = useMemo(
    () => async (siteId: string) => {
      setIsLoading(true);
      setIsLoadingReadiness(true);
      setError(null);

      try {
        const [backendPages, readiness] = await Promise.all([
          listPages(siteId),
          getSiteReadiness(siteId).catch(() => null),
        ]);
        setPages(backendPages);
        setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
        setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load pages');
      } finally {
        setIsLoading(false);
        setIsLoadingReadiness(false);
      }
    },
    [setPages],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPages = async () => {
      setIsLoading(true);
      setIsLoadingReadiness(true);
      setError(null);

      try {
        const [backendPages, readiness] = await Promise.all([
          listPages(activeSiteId),
          getSiteReadiness(activeSiteId).catch(() => null),
        ]);
        if (!cancelled) {
          setPages(backendPages);
          setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
          setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load pages');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsLoadingReadiness(false);
        }
      }
    };

    void loadPages();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, setPages]);

  const publicPageUrl = (page: Page) => (
    `${publicBaseUrl}/sites/${encodeURIComponent(siteSlug)}${pagePublicPath(page)}`
  );

  const handlePreviewPage = async (page: Page) => {
    setPreviewingPageId(page.id);
    setError(null);

    try {
      const preview = await createPagePreview(page.siteId || activeSiteId, page.id);
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to create page preview');
    } finally {
      setPreviewingPageId(null);
    }
  };

  const handleDeletePage = async (page: Page) => {
    setError(null);

    try {
      await deletePageFromApi(page.siteId || activeSiteId, page.id);
      deletePage(page.id);
      setSelectedPageIds((current) => {
        const next = new Set(current);
        next.delete(page.id);
        return next;
      });
      setReadinessMap((current) => {
        const next = { ...current };
        delete next[page.id];
        return next;
      });
      setPendingDeletePage(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete page');
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedPages.length === 0) {
      return;
    }

    if (bulkAction === 'delete' && !pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }

    setIsBulkBusy(true);
    setError(null);

    try {
      if (bulkAction === 'publish') {
        const updatedPages = await Promise.all(
          selectedPages.map((page) => publishPage(page.siteId || activeSiteId, page.id)),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
      }

      if (bulkAction === 'archive') {
        const updatedPages = await Promise.all(
          selectedPages.map((page) => archivePage(page.siteId || activeSiteId, page.id)),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
      }

      if (bulkAction === 'delete') {
        await Promise.all(
          selectedPages.map((page) => deletePageFromApi(page.siteId || activeSiteId, page.id)),
        );
        selectedPages.forEach((page) => deletePage(page.id));
        setPendingBulkDelete(false);
      }

      setSelectedPageIds(new Set());
      setBulkAction('');
      await refreshPages(activeSiteId);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to apply bulk action');
    } finally {
      setIsBulkBusy(false);
    }
  };

  const columns: Column<Page>[] = [
    {
      key: 'id',
      label: 'Select',
      render: (page) => (
        <input
          type="checkbox"
          aria-label={`Select ${page.title}`}
          checked={selectedPageIds.has(page.id)}
          onChange={() => togglePageSelection(page.id)}
          className="size-4 rounded border-border text-primary focus:ring-ring"
        />
      )
    },
    {
      key: 'title',
      label: 'Page Title',
      sortable: true,
      render: (page) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {page.slug === 'home' || page.slug === '' ? (
              <Home className="w-5 h-5 text-primary" />
            ) : (
              <Layout className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <div className="font-medium text-foreground">{page.title}</div>
            <div className="text-xs text-muted-foreground">{pagePublicPath(page)}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (page) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={page.status} />
          {page.scheduledAt && (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {formatDate(page.scheduledAt)}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'meta',
      label: 'Health',
      render: (page) => {
        const readiness = readinessMap[page.id];
        const firstIssue = readiness?.checks.find((check) => check.status !== 'pass');
        return readiness ? (
          <div className="flex flex-col gap-1">
            <StatusBadge
              status={readiness.statusLabel}
              type={readiness.statusLabel === 'ready' ? 'success' : readiness.statusLabel === 'blocked' ? 'error' : 'warning'}
            />
            <span className="text-xs text-muted-foreground">{readiness.score}% ready · {readiness.elementCount} elements</span>
            {firstIssue && (
              <span className="max-w-64 truncate text-xs text-muted-foreground" title={firstIssue.message}>
                {firstIssue.message}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isLoadingReadiness ? 'Checking...' : 'Not checked'}
          </span>
        );
      }
    },
    {
      key: 'lastUpdated',
      label: 'Last Updated',
      sortable: true,
      render: (page) => <span className="text-muted-foreground">{formatDate(page.lastUpdated)}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (page) => (
        <div className="flex items-center justify-end gap-2">
          {page.status === 'published' && (
            <a
              href={publicPageUrl(page)}
              target="_blank"
              rel="noreferrer"
              title="Open published page"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => {
              void handlePreviewPage(page);
            }}
            disabled={previewingPageId === page.id}
            title="Preview page"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate({ to: '/pages/$pageId/edit', params: { pageId: page.id } })}
            title="Edit page"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setPendingDeletePage(page);
            }}
            title="Delete page"
            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
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
    totalItems
  } = useDataTable({
    data: visiblePages,
    columns,
    pageSize: 10
  });
  const hasPages = pages.length > 0;
  const selectedTablePages = data.filter((page) => selectedPageIds.has(page.id));

  return (
    <PageShell
      title="Pages"
      description="Manage the structure and content of your site."
      action={
        <button
          type="button"
          onClick={openCreatePage}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          aria-label="Create new page for active site"
          data-testid="pages-header-create"
        >
          <Plus className="w-4 h-4" />
          New Page
        </button>
      }
      className="w-full"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading pages from backend...
        </div>
      )}

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: 'All', value: pageMetrics.total, onSelect: () => setPageStatusFilter('all'), active: statusFilter === 'all' && healthFilter === 'all' },
            { label: 'Published', value: pageMetrics.published, onSelect: () => setPageStatusFilter('published'), active: statusFilter === 'published' && healthFilter === 'all' },
            { label: 'Draft', value: pageMetrics.draft, onSelect: () => setPageStatusFilter('draft'), active: statusFilter === 'draft' && healthFilter === 'all' },
            { label: 'Blocked', value: pageMetrics.blocked, onSelect: showBlockedPages, active: healthFilter === 'blocked' },
          ].map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={metric.onSelect}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted',
                metric.active && 'border-primary bg-primary/5',
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
              <div className="mt-1 font-mono text-2xl font-semibold">{metric.value}</div>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <label htmlFor="pages-active-site" className="text-xs font-medium text-muted-foreground">
            Active Site
          </label>
          <select
            id="pages-active-site"
            value={activeSiteId}
            onChange={(event) => {
              setSelectedSiteId(event.target.value);
              setStatusFilter('all');
              setHealthFilter('all');
            }}
            className="mt-2 w-full min-w-52 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Page API contract</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Public page, route, and render endpoints plus admin endpoints for editor saves, previews, readiness, and publishing workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyPageApiText(publicPagesUrl, 'Pages API URL')}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label="Copy pages API URL"
          >
            <Copy className="h-4 w-4" />
            Copy pages API
          </button>
        </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <PageApiStat label="Active site" value={activeSite?.name || activeSiteId} />
            <PageApiStat label="Public pages" value={`${pageMetrics.published}`} />
            <PageApiStat label="API page" value={apiPage?.title || 'No page'} />
            <PageApiStat label="Blocked" value={`${pageMetrics.blocked}`} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <PageApiSnippet label="Public pages" value={publicPagesUrl} />
            <PageApiSnippet label="Public page by slug" value={publicPageBySlugUrl} />
            <PageApiSnippet label="Render by path" value={publicRenderUrl} />
            <PageApiSnippet label="Resolve by path" value={publicResolveUrl} />
            <PageApiSnippet label="Admin pages" value={adminPagesUrl} />
            <PageApiSnippet label="Admin page detail" value={adminPageDetailUrl} />
            <PageApiSnippet label="Readiness check" value={adminPageReadinessUrl} />
            <PageApiSnippet label="Preview link" value={adminPagePreviewUrl} />
          </div>
        </div>
      </section>

      {hasPages && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">{selectedPageIds.size} selected</span>
          <button
            type="button"
            onClick={() => setPageSelection(data, selectedTablePages.length !== data.length)}
            disabled={data.length === 0}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedTablePages.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          <select
            value={bulkAction}
            onChange={(event) => setBulkAction(event.target.value as typeof bulkAction)}
            className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Bulk action...</option>
            <option value="publish">Publish selected</option>
            <option value="archive">Archive selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <button
            type="button"
            onClick={() => void handleBulkAction()}
            disabled={!bulkAction || selectedPages.length === 0 || isBulkBusy}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              bulkAction === 'delete'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isBulkBusy ? 'Applying...' : 'Apply'}
          </button>
          {selectedPages.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPageIds(new Set())}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Filter className="ml-2 size-4 text-muted-foreground" />
          {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setPageStatusFilter(status)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                statusFilter === status && healthFilter === 'all' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refreshPages(activeSiteId)}
          disabled={isLoading}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Refresh pages"
        >
          Refresh
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={data}
        sortConfig={sortConfig}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalItems}
        emptyState={
          <EmptyState
            icon={Layout}
            title={hasPages ? 'No matching pages' : 'No pages yet'}
            description={
              hasPages
                ? 'No pages match the current search or status filter.'
                : 'Create the first page for this site, then open it in the visual editor.'
            }
            action={
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {hasPages && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setHealthFilter('all');
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-accent"
                  >
                    Clear Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={openCreatePage}
                  data-testid="pages-empty-create"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  aria-label={hasPages ? 'Create page after clearing filters' : 'Create first page for active site'}
                >
                  <Plus className="w-4 h-4" />
                  {hasPages ? 'New Page' : 'Create First Page'}
                </button>
              </div>
            }
          />
        }
      />

      {pendingDeletePage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDeletePage.title}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the page from the backend and the public API. Archive it instead if you only want to hide it.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Route: <span className="font-medium text-foreground">{pagePublicPath(pendingDeletePage)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeletePage(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePage(pendingDeletePage)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Delete page
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Delete {selectedPages.length} selected page{selectedPages.length === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected pages will be removed from the site and from frontend API delivery.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isBulkBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Delete pages
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function PageApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
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

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const pagePublicPath = (page: Page): string => {
  const slug = (page.slug || '').replace(/^\/+|\/+$/g, '');
  if (page.isHomepage) {
    return '/';
  }
  return !slug || slug === 'home' ? '/' : `/${slug}`;
};
