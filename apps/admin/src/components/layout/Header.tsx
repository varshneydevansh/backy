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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { listComments, type AdminComment } from '@/lib/adminContentApi';

// ============================================
// TYPES
// ============================================

interface HeaderProps {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

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

  const activeSiteId = useMemo(
    () => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo',
    [sites],
  );

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

    try {
      const result = await listComments(activeSiteId, { status: 'pending', limit: 5, sort: 'newest' });
      setPendingComments(result.comments);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Unable to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
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
        <div className="hidden md:flex items-center relative">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className={cn(
              'pl-9 pr-4 py-2 rounded-lg bg-muted text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'w-48 lg:w-64 transition-all'
            )}
          />
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
            className="relative p-2 rounded-lg hover:bg-accent"
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
              <div className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">Notifications</div>
                    <div className="text-xs text-muted-foreground">Pending moderation across the active site.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Refresh
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {notificationsLoading ? (
                    <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : notificationsError ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {notificationsError}
                    </div>
                  ) : pendingComments.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                      No pending comments.
                    </div>
                  ) : (
                    pendingComments.map((comment) => (
                      <button
                        key={comment.id}
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate({ to: '/comments' });
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <MessageSquare className="size-4 text-muted-foreground" />
                          <span className="truncate">{comment.authorName || 'Anonymous'}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {comment.content}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate({ to: '/comments' });
                  }}
                  className="flex w-full items-center justify-center border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent"
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
