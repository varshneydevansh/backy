/**
 * ============================================================================
 * BACKY CMS - SIDEBAR COMPONENT
 * ============================================================================
 *
 * The sidebar navigation component that provides access to all
 * sections of the admin dashboard.
 *
 * @module Sidebar
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  FileText,
  Image,
  Settings,
  Users,
  Globe,
  Newspaper,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface SidebarProps {
  /** Whether the sidebar is in collapsed state */
  collapsed: boolean;
  /** Callback when toggle button is clicked */
  onToggle: () => void;
}

interface NavItem {
  /** Display label */
  label: string;
  /** Route path */
  to: string;
  /** Icon component */
  icon: React.ElementType;
  /** Badge text (optional) */
  badge?: string;
}

// ============================================
// NAVIGATION ITEMS
// ============================================

/**
 * Main navigation items for the sidebar
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Sites', to: '/sites', icon: Globe },
  { label: 'Pages', to: '/pages', icon: FileText },
  { label: 'Blog', to: '/blog', icon: Newspaper },
  { label: 'Media', to: '/media', icon: Image },
  { label: 'Users', to: '/users', icon: Users },
  { label: 'Settings', to: '/settings', icon: Settings },
];

// ============================================
// COMPONENT
// ============================================

/**
 * Sidebar Component
 *
 * Renders the collapsible sidebar with navigation links.
 *
 * @param props - Component props
 * @returns Sidebar component
 */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        'bg-card border-r border-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-center border-b border-border px-4">
        <Link to="/" className="flex items-center gap-3">
          {/* Logo Icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">B</span>
          </div>

          {/* Logo Text (hidden when collapsed) */}
          {!collapsed && (
            <span className="font-bold text-lg truncate">
              Backy
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />

              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-center p-2 rounded-lg',
            'hover:bg-accent hover:text-accent-foreground transition-colors',
            'text-muted-foreground'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 mr-2" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
