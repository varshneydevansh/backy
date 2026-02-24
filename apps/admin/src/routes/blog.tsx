/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Plus, FileText, Edit, Trash2 } from 'lucide-react';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  const routerState = useRouterState();
  const isExactBlogRoute = routerState.location.pathname === '/blog';

  if (isExactBlogRoute) {
    return <BlogListView />;
  }

  return <Outlet />;
}

function BlogListView() {
  const navigate = useNavigate();
  const { posts, deletePost } = useStore();

  const columns: Column<BlogPost>[] = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (post) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">{post.title}</div>
            <div className="text-xs text-muted-foreground">/blog/{post.slug}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (post) => <StatusBadge status={post.status} />
    },
    {
      key: 'author',
      label: 'Author',
      sortable: true,
    },
    {
      key: 'publishedAt',
      label: 'Date',
      sortable: true,
      render: (post) => <span className="text-muted-foreground">{formatDate(post.publishedAt)}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (post) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => navigate({ to: '/blog/$postId', params: { postId: post.id } })}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this post?')) deletePost(post.id);
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
    data: posts,
    columns,
    pageSize: 10
  });

  return (
    <PageShell
      title="Blog Posts"
      description="Manage your blog articles and news."
      action={
        <Link
          to="/blog/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Post
        </Link>
      }
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search posts..."
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
            icon={FileText}
            title="No posts yet"
            description="Write your first blog post to get started."
            action={
              <Link
                to="/blog/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 mt-4"
              >
                <Plus className="w-4 h-4" />
                Create Post
              </Link>
            }
          />
        }
      />
    </PageShell>
  );
}
