/**
 * ============================================================================
 * SCYTHIAN CMS - MAIN LAYOUT COMPONENT
 * ============================================================================
 *
 * The main layout that includes the sidebar navigation and header.
 * This wraps all authenticated routes.
 *
 * @module MainLayout
 * @author Scythian CMS Team (Built by Kimi 2.5)
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

  /** Whether the sidebar is collapsed */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isEditorWorkspace);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (isEditorWorkspace) {
      setSidebarCollapsed(true);
    }
  }, [isEditorWorkspace]);

  return (
    <div className="min-h-screen bg-background flex min-w-0">
      {/* Sidebar Navigation */}
      {!isFocusedEditorWorkspace && (
        <div className="hidden shrink-0 lg:flex" data-testid="admin-sidebar-shell">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
      )}

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative flex h-full shadow-xl">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileSidebarOpen(false)}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        {!isFocusedEditorWorkspace && (
          <div data-testid="admin-header-shell">
            <Header
              sidebarCollapsed={sidebarCollapsed}
              onSidebarToggle={() => setMobileSidebarOpen(true)}
            />
          </div>
        )}

        {/* Page Content */}
        <main className={cn(
          'flex-1 overflow-auto',
          isFocusedEditorWorkspace
            ? 'bg-muted/40 p-2 lg:p-3'
            : isEditorWorkspace
              ? 'bg-muted/40 p-3 lg:p-4'
              : 'p-5 lg:p-6',
        )}
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
