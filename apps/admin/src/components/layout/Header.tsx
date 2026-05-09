/**
 * ============================================================================
 * BACKY CMS - HEADER COMPONENT
 * ============================================================================
 *
 * The top header bar with search, notifications, and user menu.
 *
 * @module Header
 * @author Backy CMS Team
 * @license MIT
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Search,
  Bell,
  Menu,
  User,
  Settings,
  LogOut,
  ChevronDown,
  MessageSquare,
  CheckCircle2,
  CircleSlash,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { cn, getRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import {
  getSettings,
  listBlogPosts,
  listComments,
  listFormContacts,
  listForms,
  listPages,
  listSites,
  updateComments,
  type AdminComment,
  type SiteSettingsInput,
} from '@/lib/adminContentApi';

// ============================================
// TYPES
// ============================================

interface HeaderProps {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

type SearchResult =
  | { id: string; type: 'Site'; title: string; detail: string; action: { route: 'site'; siteId: string } }
  | { id: string; type: 'Page'; title: string; detail: string; action: { route: 'page'; pageId: string } }
  | { id: string; type: 'Blog'; title: string; detail: string; action: { route: 'blog'; postId: string } }
  | { id: string; type: 'Form'; title: string; detail: string; action: { route: 'forms' } }
  | { id: string; type: 'Comment'; title: string; detail: string; action: { route: 'comments' } }
  | { id: string; type: 'Contact'; title: string; detail: string; action: { route: 'contacts' } }
  | { id: string; type: 'Tool'; title: string; detail: string; action: { route: 'static'; to: '/media' | '/products' | '/orders' | '/collections' | '/settings' } };

const commentsNotificationsEnabled = (settings?: SiteSettingsInput): boolean => (
  settings?.integrations?.notifications?.inApp?.comments !== false
);

// ============================================
// COMPONENT
// ============================================

export function Header({ onSidebarToggle }: HeaderProps) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { user, signOut } = useAuthStore();
  const sites = useStore((state) => state.sites);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingComments, setPendingComments] = useState<AdminComment[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationsNotice, setNotificationsNotice] = useState<string | null>(null);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [updatingCommentIds, setUpdatingCommentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoadedForSiteId, setSearchLoadedForSiteId] = useState<string | null>(null);

  const activeSiteId = useMemo(
    () => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo',
    [sites],
  );
  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery.length < 2) return searchIndex.slice(0, 6);

    return searchIndex
      .filter((item) => [
        item.title,
        item.detail,
        item.type,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)))
      .slice(0, 8);
  }, [searchIndex, searchQuery]);

  // Get page title from route
  const getPageTitle = () => {
    const path = routerState.location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/sites')) return 'Sites';
    if (path.startsWith('/pages')) return 'Pages';
    if (path.startsWith('/blog')) return 'Blog';
    if (path.startsWith('/media')) return 'Media';
    if (path.startsWith('/products')) return 'Products';
    if (path.startsWith('/orders')) return 'Orders';
    if (path.startsWith('/comments')) return 'Comments';
    if (path.startsWith('/contacts')) return 'Contacts';
    if (path.startsWith('/users')) return 'Users';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Dashboard';
  };

  const handleSignOut = () => {
    signOut();
    setUserMenuOpen(false);
    navigate({ to: '/login' });
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    setNotificationsNotice(null);

    try {
      const settings = await getSettings().catch(() => undefined);
      if (!commentsNotificationsEnabled(settings)) {
        setPendingComments([]);
        setNotificationsDisabled(true);
        return;
      }

      setNotificationsDisabled(false);
      const result = await listComments(activeSiteId, { status: 'pending', limit: 5, sort: 'newest' });
      setPendingComments(result.comments);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Unable to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const moderateNotificationComment = async (
    comment: AdminComment,
    status: 'approved' | 'spam',
  ) => {
    setUpdatingCommentIds((current) => [...current, comment.id]);
    setNotificationsError(null);
    setNotificationsNotice(null);

    try {
      await updateComments(activeSiteId, {
        commentIds: [comment.id],
        status,
        reviewedBy: user?.id || 'admin',
        actor: user?.id || 'admin',
        ...(status === 'spam' ? { rejectionReason: 'Marked as spam from notifications.' } : {}),
      });
      setPendingComments((current) => current.filter((item) => item.id !== comment.id));
      setNotificationsNotice(status === 'approved' ? 'Comment approved.' : 'Comment marked as spam.');
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Unable to update comment');
    } finally {
      setUpdatingCommentIds((current) => current.filter((id) => id !== comment.id));
    }
  };

  const loadGlobalSearch = async () => {
    if (searchLoading || searchLoadedForSiteId === activeSiteId) return;
    setSearchLoading(true);
    setSearchError(null);

    try {
      const [loadedSites, pages, posts, forms, comments] = await Promise.all([
        listSites().catch(() => []),
        listPages(activeSiteId).catch(() => []),
        listBlogPosts(activeSiteId).catch(() => []),
        listForms(activeSiteId).catch(() => []),
        listComments(activeSiteId, { status: 'all', limit: 20, sort: 'newest' }).then((result) => result.comments).catch(() => []),
      ]);
      const contactGroups = await Promise.all(
        forms.map((form) => listFormContacts(activeSiteId, form.id, { limit: 20 }).then((result) => result.contacts).catch(() => [])),
      );

      setSearchIndex([
        ...loadedSites.map((site) => ({
          id: `site:${site.id}`,
          type: 'Site' as const,
          title: site.name || site.slug || site.id,
          detail: site.slug ? `/${site.slug}` : 'Site settings',
          action: { route: 'site' as const, siteId: site.id },
        })),
        ...pages.map((page) => ({
          id: `page:${page.id}`,
          type: 'Page' as const,
          title: page.title || page.slug || page.id,
          detail: page.slug ? `/${page.slug}` : 'Page editor',
          action: { route: 'page' as const, pageId: page.id },
        })),
        ...posts.map((post) => ({
          id: `blog:${post.id}`,
          type: 'Blog' as const,
          title: post.title || post.slug || post.id,
          detail: post.slug ? `/blog/${post.slug}` : 'Blog editor',
          action: { route: 'blog' as const, postId: post.id },
        })),
        ...forms.map((form) => ({
          id: `form:${form.id}`,
          type: 'Form' as const,
          title: form.title || form.name || form.id,
          detail: `${form.fields.length} fields`,
          action: { route: 'forms' as const },
        })),
        ...comments.map((comment) => ({
          id: `comment:${comment.id}`,
          type: 'Comment' as const,
          title: comment.authorName || 'Anonymous comment',
          detail: comment.content,
          action: { route: 'comments' as const },
        })),
        ...contactGroups.flat().map((contact) => ({
          id: `contact:${contact.id}`,
          type: 'Contact' as const,
          title: contact.name || contact.email || 'Unnamed contact',
          detail: contact.email || contact.notes || contact.status,
          action: { route: 'contacts' as const },
        })),
        { id: 'tool:media', type: 'Tool' as const, title: 'Media Library', detail: 'Files, folders, images, fonts', action: { route: 'static' as const, to: '/media' as const } },
        { id: 'tool:products', type: 'Tool' as const, title: 'Products', detail: 'Catalog and sellable items', action: { route: 'static' as const, to: '/products' as const } },
        { id: 'tool:orders', type: 'Tool' as const, title: 'Orders', detail: 'Sales and fulfillment queue', action: { route: 'static' as const, to: '/orders' as const } },
        { id: 'tool:collections', type: 'Tool' as const, title: 'Collections', detail: 'Schemas, records, dynamic data', action: { route: 'static' as const, to: '/collections' as const } },
        { id: 'tool:settings', type: 'Tool' as const, title: 'Settings', detail: 'API keys, infrastructure, delivery mode', action: { route: 'static' as const, to: '/settings' as const } },
      ]);
      setSearchLoadedForSiteId(activeSiteId);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Unable to load search');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchResult = (result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery('');

    if (result.action.route === 'site') {
      navigate({ to: '/sites/$siteId', params: { siteId: result.action.siteId } });
      return;
    }
    if (result.action.route === 'page') {
      navigate({ to: '/pages/$pageId/edit', params: { pageId: result.action.pageId } });
      return;
    }
    if (result.action.route === 'blog') {
      navigate({ to: '/blog/$postId', params: { postId: result.action.postId } });
      return;
    }
    if (result.action.route === 'forms') {
      navigate({ to: '/forms' });
      return;
    }
    if (result.action.route === 'comments') {
      navigate({ to: '/comments' });
      return;
    }
    if (result.action.route === 'contacts') {
      navigate({ to: '/contacts' });
      return;
    }
    navigate({ to: result.action.to });
  };

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={onSidebarToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-accent"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-lg font-semibold hidden sm:block">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onFocus={() => {
              setSearchOpen(true);
              void loadGlobalSearch();
            }}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
              void loadGlobalSearch();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchOpen(false);
                return;
              }
              if (event.key === 'Enter' && searchResults[0]) {
                event.preventDefault();
                handleSearchResult(searchResults[0]);
              }
            }}
            className={cn(
              'pl-9 pr-4 py-2 rounded-lg bg-muted text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'w-48 lg:w-64 transition-all'
            )}
          />
          {searchOpen && (
            <div className="absolute left-0 top-full z-30 mt-2 w-[22rem] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">Search Backy</div>
                <div className="text-xs text-muted-foreground">Sites, pages, posts, forms, contacts, and tools.</div>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {searchLoading ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : searchError ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {searchError}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    No matching results.
                  </div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSearchResult(result)}
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{result.title}</span>
                        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {result.type}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{result.detail}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            aria-label={`${pendingComments.length} pending notifications`}
            onClick={() => {
              setNotificationsOpen((open) => !open);
              if (!notificationsOpen) void loadNotifications();
            }}
            className={cn(
              'relative rounded-lg p-2 transition-colors hover:bg-accent focus-ring',
              notificationsOpen && 'bg-accent text-accent-foreground',
            )}
          >
            <Bell className="w-5 h-5" />
            {pendingComments.length > 0 && (
              <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {Math.min(9, pendingComments.length)}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      Moderation center
                      {pendingComments.length > 0 && (
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                          {pendingComments.length} pending
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Comments that need a decision on this site.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-ring"
                  >
                    <RefreshCw className={cn('size-3', notificationsLoading && 'animate-spin')} />
                    Refresh
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {notificationsLoading ? (
                    <div className="space-y-2 p-2">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="rounded-lg border border-border p-3">
                          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                          <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  ) : notificationsError ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {notificationsError}
                    </div>
                  ) : notificationsDisabled ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                      <ShieldAlert className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium">In-app comment alerts are off</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Turn them on in Settings to use this moderation center.
                      </p>
                    </div>
                  ) : pendingComments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                      <CheckCircle2 className="mx-auto size-5 text-success" />
                      <p className="mt-2 text-sm font-medium">No pending comments</p>
                      <p className="mt-1 text-xs text-muted-foreground">New moderation tasks will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notificationsNotice && (
                        <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                          {notificationsNotice}
                        </div>
                      )}
                      {pendingComments.map((comment) => {
                        const isUpdating = updatingCommentIds.includes(comment.id);
                        return (
                          <article key={comment.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{comment.authorName || 'Anonymous'}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="capitalize">{comment.targetType}</span>
                                  <span>{getRelativeTime(comment.createdAt)}</span>
                                  {(comment.reportCount || 0) > 0 && (
                                    <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                                      {comment.reportCount} reports
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  navigate({ to: '/comments' });
                                }}
                                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-ring"
                              >
                                Review
                              </button>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                              {comment.content}
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void moderateNotificationComment(comment, 'approved')}
                                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2 text-xs font-medium text-success transition hover:bg-success/15 disabled:opacity-60"
                              >
                                <CheckCircle2 className="size-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void moderateNotificationComment(comment, 'spam')}
                                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2 text-xs font-medium text-destructive transition hover:bg-destructive/15 disabled:opacity-60"
                              >
                                <CircleSlash className="size-3.5" />
                                Spam
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate({ to: '/comments' });
                  }}
                  className="flex w-full items-center justify-center border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent focus-ring"
                >
                  Open moderation queue
                </button>
              </div>
            </>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="hidden sm:block text-sm font-medium">
              {user?.fullName || 'Guest'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent w-full text-left"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent w-full text-left"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-1 border-border" />
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
