/**
 * BACKY CMS - SITES PAGE
 * 
 * Layout route that shows list at /sites, renders child routes otherwise.
 */

import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Plus, Globe, MoreVertical, Edit, Trash2, ExternalLink, Copy } from 'lucide-react';
import { useStore, type Site } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

export const Route = createFileRoute('/sites')({
  component: SitesLayout,
});

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
  const { sites, deleteSite } = useStore();

  // Define columns
  const columns: Column<Site>[] = [
    {
      key: 'name',
      label: 'Site Name',
      sortable: true,
      render: (site) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">{site.name}</div>
            <div className="text-xs text-muted-foreground">{site.customDomain || `${site.slug}.backy.app`}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (site) => <StatusBadge status={site.status} />
    },
    {
      key: 'pageCount',
      label: 'Pages',
      sortable: true,
      render: (site) => <span className="text-muted-foreground">{site.pageCount} pages</span>
    },
    {
      key: 'lastUpdated',
      label: 'Last Updated',
      sortable: true,
      render: (site) => <span className="text-muted-foreground">{formatDate(site.lastUpdated)}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (site) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => navigate({ to: '/sites/$siteId', params: { siteId: site.id } })}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Edit Site"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this site?')) {
                deleteSite(site.id);
              }
            }}
            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete Site"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  // Use shared hook
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
    data: sites,
    columns,
    pageSize: 8
  });

  return (
    <PageShell
      title="Sites"
      description="Manage your websites and their settings."
      action={
        <Link
          to="/sites/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Site
        </Link>
      }
    >
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Data Grid */}
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
            icon={Globe}
            title="No sites found"
            description="Get started by creating your first website."
            action={
              <Link
                to="/sites/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 mt-4"
              >
                <Plus className="w-4 h-4" />
                Create Site
              </Link>
            }
          />
        }
      />
    </PageShell>
  );
}
