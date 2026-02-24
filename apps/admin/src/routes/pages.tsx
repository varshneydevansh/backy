/**
 * BACKY CMS - PAGES LIST
 * 
 * This route is a LAYOUT route - it renders different content:
 * - At /pages exactly: shows the pages list
 * - At /pages/new or /pages/:id/edit: renders child via <Outlet />
 */

import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Plus, Layout, Edit, Trash2, Home, File } from 'lucide-react';
import { useStore, type Page } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

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
  const { pages, deletePage } = useStore();

  const columns: Column<Page>[] = [
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
            <div className="text-xs text-muted-foreground">/{page.slug}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (page) => <StatusBadge status={page.status} />
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
          <button
            onClick={() => navigate({ to: '/pages/$pageId/edit', params: { pageId: page.id } })}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete page?')) deletePage(page.id);
            }}
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
    data: pages,
    columns,
    pageSize: 10
  });

  return (
    <PageShell
      title="Pages"
      description="Manage the structure and content of your site."
      action={
        <Link
          to="/pages/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Page
        </Link>
      }
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
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
            title="No pages found"
            description="Create your first page to start building."
            action={
              <Link
                to="/pages/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 mt-4"
              >
                <Plus className="w-4 h-4" />
                Create Page
              </Link>
            }
          />
        }
      />
    </PageShell>
  );
}
