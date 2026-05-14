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
  Database,
  ClipboardList,
  ShoppingBag,
  Receipt,
  MessageSquare,
  Contact,
  Layers3,
  Building2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  canAccessAdminNavigationArea,
  useCurrentAdminPermissionMatrix,
  type AdminNavigationArea,
} from '@/lib/adminNavigationAccess';

// ============================================
// TYPES
// ============================================

interface SidebarProps {
  /** Whether the sidebar is in collapsed state */
  collapsed: boolean;
  /** Callback when toggle button is clicked */
  onToggle: () => void;
  /** Optional callback after a navigation item is selected */
  onNavigate?: () => void;
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
  /** Permission area required to show this item */
  area: AdminNavigationArea;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// ============================================
// NAVIGATION ITEMS
// ============================================

/**
 * Main navigation items for the sidebar
 */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, area: 'dashboard' },
      { label: 'Sites', to: '/sites', icon: Globe, area: 'sites' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Pages', to: '/pages', icon: FileText, area: 'pages' },
      { label: 'Blog', to: '/blog', icon: Newspaper, area: 'blog' },
      { label: 'Media', to: '/media', icon: Image, area: 'media' },
      { label: 'Collections', to: '/collections', icon: Database, area: 'collections' },
      { label: 'Sections', to: '/reusable-sections', icon: Layers3, area: 'sections' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Products', to: '/products', icon: ShoppingBag, area: 'commerce' },
      { label: 'Orders', to: '/orders', icon: Receipt, area: 'commerce' },
    ],
  },
  {
    label: 'Audience',
    items: [
      { label: 'Forms', to: '/forms', icon: ClipboardList, area: 'forms' },
      { label: 'Contacts', to: '/contacts', icon: Contact, area: 'contacts' },
      { label: 'Comments', to: '/comments', icon: MessageSquare, area: 'comments' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Teams', to: '/teams', icon: Building2, area: 'teams' },
      { label: 'Users', to: '/users', icon: Users, area: 'users' },
      { label: 'Settings', to: '/settings', icon: Settings, area: 'settings' },
    ],
  },
];

const SITE_SCOPED_NAV_ROUTES = new Set([
  '/',
  '/pages',
  '/blog',
  '/media',
  '/collections',
  '/reusable-sections',
  '/products',
  '/orders',
  '/forms',
  '/contacts',
  '/comments',
  '/teams',
  '/users',
]);

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
export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const { permissionMatrix } = useCurrentAdminPermissionMatrix(currentUser);
  const currentSearch = typeof window === 'undefined' ? '' : window.location.search;
  const activeSiteId = new URLSearchParams(currentSearch).get('siteId')?.trim();
  const activeSiteSearch = activeSiteId ? { siteId: activeSiteId } : undefined;
  const getNavSearch = (to: string) => (
    activeSiteSearch && SITE_SCOPED_NAV_ROUTES.has(to) ? activeSiteSearch : undefined
  );
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessAdminNavigationArea(permissionMatrix, currentUser, item.area)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        'bg-card border-r border-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-center border-b border-border px-4">
        <Link to="/" search={getNavSearch('/')} className="flex items-center gap-3">
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
      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Primary">
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <div key={section.label} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to ||
                  (item.to !== '/' && location.pathname.startsWith(`${item.to}/`));

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    search={getNavSearch(item.to)}
                    onClick={onNavigate}
                    className={cn(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground',
                      collapsed && 'justify-center px-2'
                    )}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />

                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
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
