/**
 * ============================================================================
 * BACKY CMS - MAIN LAYOUT COMPONENT
 * ============================================================================
 *
 * The main layout that includes the sidebar navigation and header.
 * This wraps all authenticated routes.
 *
 * @module MainLayout
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface MainLayoutProps {
  /** Child components to render in the main content area */
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'backy:admin-sidebar-collapsed';
const SIDEBAR_DENSE_COLLAPSED_STORAGE_KEY = 'backy:admin-sidebar-dense-collapsed';
const SIDEBAR_DEFAULT_COLLAPSED_ROUTES = [
  /^\/pages(?:\/|$)/,
  /^\/blog(?:\/|$)/,
  /^\/media(?:\/|$)/,
  /^\/collections(?:\/|$)/,
  /^\/reusable-sections(?:\/|$)/,
  /^\/products(?:\/|$)/,
  /^\/orders(?:\/|$)/,
  /^\/forms(?:\/|$)/,
  /^\/contacts(?:\/|$)/,
  /^\/comments(?:\/|$)/,
  /^\/teams(?:\/|$)/,
  /^\/users(?:\/|$)/,
  /^\/settings(?:\/|$)/,
];

const getStoredBoolean = (key: string) => {
  if (typeof window === 'undefined') return null;

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === 'true') return true;
  if (storedValue === 'false') return false;
  return null;
};

const getStoredSidebarCollapsed = () => getStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY);
const getStoredDenseSidebarCollapsed = () => getStoredBoolean(SIDEBAR_DENSE_COLLAPSED_STORAGE_KEY);

const getDefaultSidebarCollapsed = (pathname: string) => (
  SIDEBAR_DEFAULT_COLLAPSED_ROUTES.some((pattern) => pattern.test(pathname))
);

// ============================================
// COMPONENT
// ============================================

/**
 * Main Layout Component
 *
 * Provides the standard admin dashboard layout with:
 * - Collapsible sidebar navigation
 * - Top header with user actions
 * - Main content area
 *
 * @param props - Component props
 * @returns Layout component
 */
export function MainLayout({ children }: MainLayoutProps) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const routeSearch = routerState.location.search as Record<string, unknown>;
  const isEditorWorkspace = useMemo(() => (
    pathname === '/blog/new' ||
    /^\/blog\/[^/]+$/.test(pathname) ||
    /^\/pages\/[^/]+\/edit$/.test(pathname)
  ), [pathname]);
  const isFocusedEditorWorkspace = isEditorWorkspace && routeSearch.focus === 'canvas';
  const isDenseAdminSurface = getDefaultSidebarCollapsed(pathname);

  /** Whether the user prefers the standard admin sidebar collapsed */
  const [standardSidebarCollapsed, setStandardSidebarCollapsed] = useState(() => getStoredSidebarCollapsed() ?? false);
  const [hasStoredSidebarPreference, setHasStoredSidebarPreference] = useState(() => getStoredSidebarCollapsed() !== null);
  /** Dense management screens default compact so the shell does not dominate the work surface. */
  const [denseSidebarCollapsed, setDenseSidebarCollapsed] = useState(() => getStoredDenseSidebarCollapsed() ?? true);
  const [hasStoredDenseSidebarPreference, setHasStoredDenseSidebarPreference] = useState(() => getStoredDenseSidebarCollapsed() !== null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarCollapsed = isDenseAdminSurface ? denseSidebarCollapsed : standardSidebarCollapsed;
  const effectiveSidebarCollapsed = isEditorWorkspace || sidebarCollapsed;

  useEffect(() => {
    if (!hasStoredSidebarPreference && !isDenseAdminSurface) {
      setStandardSidebarCollapsed(false);
    }
    if (!hasStoredDenseSidebarPreference && isDenseAdminSurface) {
      setDenseSidebarCollapsed(true);
    }
  }, [hasStoredDenseSidebarPreference, hasStoredSidebarPreference, isDenseAdminSurface]);

  useEffect(() => {
    if (!hasStoredSidebarPreference || typeof window === 'undefined') return;

    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(standardSidebarCollapsed));
  }, [hasStoredSidebarPreference, standardSidebarCollapsed]);

  useEffect(() => {
    if (!hasStoredDenseSidebarPreference || typeof window === 'undefined') return;

    window.localStorage.setItem(SIDEBAR_DENSE_COLLAPSED_STORAGE_KEY, String(denseSidebarCollapsed));
  }, [denseSidebarCollapsed, hasStoredDenseSidebarPreference]);

  const handleSidebarToggle = () => {
    if (isEditorWorkspace) return;

    if (isDenseAdminSurface) {
      setHasStoredDenseSidebarPreference(true);
      setDenseSidebarCollapsed((current) => !current);
      return;
    }

    setHasStoredSidebarPreference(true);
    setStandardSidebarCollapsed((current) => !current);
  };

  return (
    <div className="flex h-dvh min-h-0 min-w-0 overflow-hidden bg-background">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Sidebar Navigation */}
      {!isFocusedEditorWorkspace && (
        <div
          className="hidden h-dvh shrink-0 lg:flex"
          data-testid="admin-sidebar-shell"
          data-collapsed={String(effectiveSidebarCollapsed)}
          data-dense-surface={String(isDenseAdminSurface)}
        >
          <Sidebar
            collapsed={effectiveSidebarCollapsed}
            collapseLocked={isEditorWorkspace}
            onToggle={handleSidebarToggle}
          />
        </div>
      )}

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-mobile-sidebar-title"
          aria-describedby="admin-mobile-sidebar-description"
          data-testid="admin-mobile-sidebar-dialog"
          data-mobile-navigation-open="true"
        >
          <h2 id="admin-mobile-sidebar-title" className="sr-only">Admin navigation</h2>
          <p id="admin-mobile-sidebar-description" className="sr-only">
            Mobile admin navigation for switching Backy workspaces, content, commerce, audience, and platform tools.
          </p>
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close navigation"
            data-testid="admin-mobile-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative flex h-dvh shadow-xl">
            <Sidebar
              collapsed={false}
              navigationId="admin-mobile-sidebar-navigation"
              testIdPrefix="admin-mobile-sidebar"
              onToggle={() => setMobileSidebarOpen(false)}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        {!isFocusedEditorWorkspace && (
          <div className="shrink-0" data-testid="admin-header-shell">
            <Header
              sidebarCollapsed={sidebarCollapsed}
              mobileSidebarOpen={mobileSidebarOpen}
              onSidebarToggle={() => setMobileSidebarOpen(true)}
            />
          </div>
        )}

        {/* Page Content */}
        <main className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
          isFocusedEditorWorkspace
            ? 'bg-muted/40 p-2 lg:p-3'
            : isEditorWorkspace
              ? 'bg-muted/40 p-3 lg:p-4'
              : 'p-5 lg:p-6',
        )}
          id="admin-main-content"
          tabIndex={-1}
          data-testid="admin-main-content"
        >
          <div className={cn(isEditorWorkspace ? 'w-full min-w-0' : 'mx-auto w-full max-w-[1680px]')}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
