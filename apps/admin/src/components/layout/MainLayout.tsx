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

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

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
  /** Whether the sidebar is collapsed */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
