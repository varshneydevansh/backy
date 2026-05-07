/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Plus, FileText, Edit, Trash2 } from 'lucide-react';
import {
  deleteBlogPost,
  listBlogAuthors,
  listBlogCategories,
  listBlogPosts,
  listBlogTags,
  type BlogAuthor,
  type BlogCategory,
  type BlogTag,
} from '@/lib/adminContentApi';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

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
  const { sites, posts, setPosts, deletePost } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const activeSiteId = useMemo(
    () => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo',
    [sites],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [backendPosts, backendCategories, backendTags, backendAuthors] = await Promise.all([
          listBlogPosts(activeSiteId, {
            categoryId: selectedCategoryId || undefined,
            tagId: selectedTagId || undefined,
            authorId: selectedAuthorId || undefined,
          }),
          listBlogCategories(activeSiteId),
          listBlogTags(activeSiteId),
          listBlogAuthors(activeSiteId),
        ]);
        if (!cancelled) {
          setPosts(backendPosts);
          setCategories(backendCategories);
          setTags(backendTags);
          setAuthors(backendAuthors);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, selectedAuthorId, selectedCategoryId, selectedTagId, setPosts]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );
  const authorById = useMemo(
    () => new Map(authors.map((author) => [author.id, author])),
    [authors],
  );

  const handleDeletePost = async (post: BlogPost) => {
    if (!confirm('Delete this post?')) {
      return;
    }

    setError(null);

    try {
      await deleteBlogPost(activeSiteId, post.id);
      deletePost(post.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete post');
    }
  };

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
      render: (post) => authorById.get(post.author)?.name || post.author,
    },
    {
      key: 'categoryIds',
      label: 'Taxonomy',
      render: (post) => (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            {(post.categoryIds || []).map((id) => categoryById.get(id)?.name).filter(Boolean).join(', ') || 'Uncategorized'}
          </div>
          <div>
            {(post.tagIds || []).map((id) => tagById.get(id)?.name).filter(Boolean).join(', ') || 'No tags'}
          </div>
        </div>
      )
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
            onClick={() => void handleDeletePost(post)}
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
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading blog posts from backend...
        </div>
      )}

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
        <select
          value={selectedCategoryId}
          onChange={(event) => {
            setSelectedCategoryId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-48 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={selectedTagId}
          onChange={(event) => {
            setSelectedTagId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          value={selectedAuthorId}
          onChange={(event) => {
            setSelectedAuthorId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All authors</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
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
