import type { ElementType } from 'react';
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
  Mail,
  ShoppingBag,
  Receipt,
  MessageSquare,
  Contact,
  Layers3,
  Building2,
  LifeBuoy,
} from 'lucide-react';
import type { AdminNavigationArea } from '@/lib/adminNavigationAccess';
import type { User } from '@/stores/authStore';

export interface NavItem {
  /** Stable navigation identifier */
  id: string;
  /** Display label */
  label: string;
  /** Route path */
  to: string;
  /** Icon component */
  icon: ElementType;
  /** Badge text (optional) */
  badge?: string;
  /** Permission area required to show this item */
  area: AdminNavigationArea;
}

export interface NavSection {
  /** Stable section identifier for persisted expansion state */
  id: string;
  /** Display label */
  label: string;
  /** Navigation items in the section */
  items: NavItem[];
}

export type SidebarQuickCreatePermission = 'pages.edit' | 'commerce.edit' | 'forms.create';

interface SidebarQuickCreateAction {
  /** Stable quick-create identifier */
  id: string;
  /** Display label */
  label: string;
  /** Route path */
  to: string;
  /** Additional route search params for intent-driven create flows */
  search?: Record<string, string>;
  /** Icon component */
  icon: ElementType;
  /** Navigation area required to expose the action */
  area: AdminNavigationArea;
  /** Permission required to start the create flow */
  permissionKey: SidebarQuickCreatePermission;
}

/**
 * Main navigation items for the sidebar
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, area: 'dashboard' },
      { id: 'sites', label: 'Sites', to: '/sites', icon: Globe, area: 'sites' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { id: 'pages', label: 'Pages', to: '/pages', icon: FileText, area: 'pages' },
      { id: 'blog', label: 'Blog', to: '/blog', icon: Newspaper, area: 'blog' },
      { id: 'media', label: 'Media', to: '/media', icon: Image, area: 'media' },
      { id: 'collections', label: 'Collections', to: '/collections', icon: Database, area: 'collections' },
      { id: 'sections', label: 'Sections', to: '/reusable-sections', icon: Layers3, area: 'sections' },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { id: 'products', label: 'Products', to: '/products', icon: ShoppingBag, area: 'commerce' },
      { id: 'orders', label: 'Orders', to: '/orders', icon: Receipt, area: 'commerce' },
    ],
  },
  {
    id: 'audience',
    label: 'Audience',
    items: [
      { id: 'forms', label: 'Forms', to: '/forms', icon: ClipboardList, area: 'forms' },
      { id: 'newsletter', label: 'Newsletter', to: '/newsletter', icon: Mail, area: 'contacts' },
      { id: 'contacts', label: 'Contacts', to: '/contacts', icon: Contact, area: 'contacts' },
      { id: 'comments', label: 'Comments', to: '/comments', icon: MessageSquare, area: 'comments' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { id: 'teams', label: 'Teams', to: '/teams', icon: Building2, area: 'teams' },
      { id: 'users', label: 'Users', to: '/users', icon: Users, area: 'users' },
      { id: 'help', label: 'Help', to: '/help', icon: LifeBuoy, area: 'help' },
      { id: 'settings', label: 'Settings', to: '/settings', icon: Settings, area: 'settings' },
    ],
  },
];

export const SIDEBAR_QUICK_CREATE_ACTIONS: SidebarQuickCreateAction[] = [
  { id: 'new-page', label: 'New page', to: '/pages/new', search: { templateSource: 'backy-canvas', focus: 'canvas' }, icon: FileText, area: 'pages', permissionKey: 'pages.edit' },
  { id: 'new-post', label: 'New post', to: '/blog/new', search: { templateSource: 'backy-canvas', focus: 'canvas' }, icon: Newspaper, area: 'blog', permissionKey: 'pages.edit' },
  { id: 'new-product', label: 'New product', to: '/products', search: { quickCreate: 'product' }, icon: ShoppingBag, area: 'commerce', permissionKey: 'commerce.edit' },
  { id: 'new-form', label: 'New form', to: '/forms', search: { quickCreate: 'blank' }, icon: ClipboardList, area: 'forms', permissionKey: 'forms.create' },
];

export const SIDEBAR_QUICK_CREATE_PERMISSION_ROLE_DEFAULTS: Record<SidebarQuickCreatePermission, User['role'][]> = {
  'pages.edit': ['owner', 'admin', 'editor'],
  'commerce.edit': ['owner', 'admin', 'editor'],
  'forms.create': ['owner', 'admin', 'editor'],
};

export const SIDEBAR_SECTION_STORAGE_KEY = 'backy:admin-sidebar-section-state';
export const SIDEBAR_SECTION_STORAGE_VERSION = 2;
export const DEFAULT_OPEN_SECTION_IDS = ['workspace'];
export type SidebarSectionStateSource = 'default' | 'stored' | 'legacy-migrated';

export interface SidebarSectionStateSnapshot {
  sectionIds: Set<string>;
  source: SidebarSectionStateSource;
  legacySectionCount: number;
}

export const SITE_SCOPED_NAV_ROUTES = new Set([
  '/',
  '/pages',
  '/pages/new',
  '/blog',
  '/blog/new',
  '/media',
  '/collections',
  '/reusable-sections',
  '/products',
  '/orders',
  '/forms',
  '/newsletter',
  '/contacts',
  '/comments',
  '/teams',
  '/users',
  '/help',
]);

export const isNavRouteActive = (pathname: string, route: string) => (
  pathname === route || (route !== '/' && pathname.startsWith(`${route}/`))
);

const validSidebarSectionIds = new Set(NAV_SECTIONS.map((section) => section.id));

export const normalizeSidebarSectionIds = (sectionIds: unknown) => {
  if (!Array.isArray(sectionIds)) {
    return new Set<string>();
  }

  return new Set(
    sectionIds.filter((sectionId): sectionId is string => (
      typeof sectionId === 'string' && validSidebarSectionIds.has(sectionId)
    )),
  );
};

export const createDefaultSidebarSectionState = (
  source: SidebarSectionStateSource = 'default',
): SidebarSectionStateSnapshot => ({
  sectionIds: new Set(DEFAULT_OPEN_SECTION_IDS),
  source,
  legacySectionCount: 0,
});

export const readSidebarSectionState = (): SidebarSectionStateSnapshot => {
  if (typeof window === 'undefined') {
    return createDefaultSidebarSectionState();
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_SECTION_STORAGE_KEY);
    if (!stored) {
      return createDefaultSidebarSectionState();
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const legacySectionIds = normalizeSidebarSectionIds(parsed);
      const migratedSectionIds = legacySectionIds.size > 1
        ? new Set(DEFAULT_OPEN_SECTION_IDS)
        : legacySectionIds.size > 0
          ? legacySectionIds
          : new Set(DEFAULT_OPEN_SECTION_IDS);
      writeSidebarSectionState(migratedSectionIds, legacySectionIds.size);
      return {
        sectionIds: migratedSectionIds,
        source: 'legacy-migrated',
        legacySectionCount: legacySectionIds.size,
      };
    }
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SIDEBAR_SECTION_STORAGE_VERSION) {
      return createDefaultSidebarSectionState();
    }
    const storedSectionIds = normalizeSidebarSectionIds(parsed.sectionIds);
    const migratedFromLegacyCount = typeof parsed.migratedFromLegacyCount === 'number'
      ? Math.max(0, parsed.migratedFromLegacyCount)
      : 0;
    return {
      sectionIds: storedSectionIds.size > 0 ? storedSectionIds : new Set(DEFAULT_OPEN_SECTION_IDS),
      source: migratedFromLegacyCount > 0 ? 'legacy-migrated' : 'stored',
      legacySectionCount: migratedFromLegacyCount,
    };
  } catch {
    return createDefaultSidebarSectionState();
  }
};

export const writeSidebarSectionState = (sectionIds: Set<string>, migratedFromLegacyCount = 0) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SIDEBAR_SECTION_STORAGE_KEY, JSON.stringify({
      version: SIDEBAR_SECTION_STORAGE_VERSION,
      sectionIds: Array.from(sectionIds).filter((sectionId) => validSidebarSectionIds.has(sectionId)),
      migratedFromLegacyCount,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore private-mode or quota failures; navigation remains usable in memory.
  }
};
