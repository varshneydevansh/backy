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
  const isEditorWorkspace = useMemo(() => (
    pathname === '/blog/new' ||
    /^\/blog\/[^/]+$/.test(pathname) ||
    /^\/pages\/[^/]+\/edit$/.test(pathname)
  ), [pathname]);

  /** Whether the sidebar is collapsed */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isEditorWorkspace);

  useEffect(() => {
    if (isEditorWorkspace) {
      setSidebarCollapsed(true);
    }
  }, [isEditorWorkspace]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar Navigation */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <Header
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Page Content */}
        <main className={cn('flex-1 overflow-auto', isEditorWorkspace ? 'bg-muted/40 p-3 lg:p-4' : 'p-5 lg:p-6')}>
          <div className={cn(isEditorWorkspace ? 'w-full min-w-0' : 'mx-auto w-full max-w-[1680px]')}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
