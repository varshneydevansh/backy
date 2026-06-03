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

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSiteSelectionFromSearch, getSiteSwitchTarget, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getSitePrimaryHost, getSiteSecondaryHost } from '@/lib/siteSelection';
import { useAuthStore } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import {
  canAccessAdminNavigationArea,
  useCurrentAdminPermissionMatrix,
  type AdminNavigationArea,
} from '@/lib/adminNavigationAccess';
import { isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import {
  DEFAULT_OPEN_SECTION_IDS,
  isNavRouteActive,
  NAV_SECTIONS,
  readSidebarSectionState,
  SIDEBAR_QUICK_CREATE_ACTIONS,
  SIDEBAR_QUICK_CREATE_PERMISSION_ROLE_DEFAULTS,
  SIDEBAR_SECTION_STORAGE_VERSION,
  SITE_SCOPED_NAV_ROUTES,
  writeSidebarSectionState,
  type NavItem,
  type SidebarSectionStateSource,
} from './sidebarModel';

// ============================================
// TYPES
// ============================================

interface SidebarProps {
  /** Whether the sidebar is in collapsed state */
  collapsed: boolean;
  /** Whether the current workspace forces compact navigation */
  collapseLocked?: boolean;
  /** Unique navigation landmark id for aria-controls */
  navigationId?: string;
  /** Prefix for stable test hooks when multiple sidebars are mounted */
  testIdPrefix?: string;
  /** Callback when toggle button is clicked */
  onToggle: () => void;
  /** Optional callback after a navigation item is selected */
  onNavigate?: () => void;
}

interface SidebarRailTooltip {
  label: string;
  route: string;
  area: AdminNavigationArea;
  top: number;
}

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
export function Sidebar({
  collapsed,
  collapseLocked = false,
  navigationId = 'admin-sidebar-navigation',
  testIdPrefix = 'admin-sidebar',
  onToggle,
  onNavigate,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const sites = useStore((state) => state.sites);
  const {
    permissionMatrix,
    isLoading: permissionsLoading,
    permissionSyncError,
    refreshPermissions,
  } = useCurrentAdminPermissionMatrix(currentUser);
  const selectedSiteId = getSiteSelectionFromSearch(sites);
  const [initialSidebarSectionState] = useState(() => readSidebarSectionState());
  const [expandedSectionIds, setExpandedSectionIds] = useState(initialSidebarSectionState.sectionIds);
  const [sectionStateSource, setSectionStateSource] = useState<SidebarSectionStateSource>(initialSidebarSectionState.source);
  const [legacySectionStateCount, setLegacySectionStateCount] = useState(initialSidebarSectionState.legacySectionCount);
  const sectionStateHydrated = true;
  const [navFilter, setNavFilter] = useState('');
  const [railTooltip, setRailTooltip] = useState<SidebarRailTooltip | null>(null);
  const deferredNavFilter = useDeferredValue(navFilter);
  const normalizedNavFilter = deferredNavFilter.trim().toLowerCase();
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteName = activeSite?.name || activeSiteId;
  const activeSitePrimaryHost = getSitePrimaryHost(activeSite, { fallbackSiteId: activeSiteId });
  const activeSiteAliasHost = getSiteSecondaryHost(activeSite);
  const activeSiteMeta = activeSiteAliasHost ? `${activeSitePrimaryHost} + ${activeSiteAliasHost}` : activeSitePrimaryHost;
  const activeSiteStatus = activeSite?.status || 'draft';
  const activeSiteRouteId = useMemo(
    () => activeSite?.id || activeSiteId,
    [activeSite?.id, activeSiteId],
  );
  const activeSiteDetailHref = `/sites/${encodeURIComponent(activeSiteRouteId)}`;
  const activeSiteDomainState = activeSite?.customDomain ? 'custom-domain' : activeSiteAliasHost ? 'alias-domain' : 'managed-host';
  const activeSiteDomainLabel = activeSite?.customDomain
    ? `Custom domain: ${activeSitePrimaryHost}${activeSiteAliasHost ? `. Alias: ${activeSiteAliasHost}` : ''}`
    : activeSiteAliasHost
      ? `Domain alias: ${activeSitePrimaryHost}. Additional alias: ${activeSiteAliasHost}`
      : `Managed Backy host: ${activeSitePrimaryHost}`;
  const activeSiteSearch = useMemo(() => (
    { siteId: activeSiteId }
  ), [activeSiteId]);
  const getQuickCreateSearch = useMemo(() => (
    (action: (typeof SIDEBAR_QUICK_CREATE_ACTIONS)[number]) => ({
      ...activeSiteSearch,
      ...(action.search || {}),
    })
  ), [activeSiteSearch]);
  const getNavSearch = useMemo(() => (
    (to: string) => (
      activeSiteSearch && SITE_SCOPED_NAV_ROUTES.has(to) ? activeSiteSearch : undefined
    )
  ), [activeSiteSearch]);
  const visibleSections = useMemo(() => (
    NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canAccessAdminNavigationArea(permissionMatrix, currentUser, item.area)),
      }))
      .filter((section) => section.items.length > 0)
  ), [currentUser, permissionMatrix]);
  const quickCreateActions = useMemo(() => (
    SIDEBAR_QUICK_CREATE_ACTIONS.filter((action) => (
      canAccessAdminNavigationArea(permissionMatrix, currentUser, action.area) &&
      isAdminPermissionAllowed(
        permissionMatrix,
        currentUser,
        action.permissionKey,
        SIDEBAR_QUICK_CREATE_PERMISSION_ROLE_DEFAULTS,
      )
    ))
  ), [currentUser, permissionMatrix]);
  const renderedSections = useMemo(() => {
    if (!normalizedNavFilter) return visibleSections;

    return visibleSections
      .map((section) => {
        const sectionMatches = section.label.toLowerCase().includes(normalizedNavFilter);
        const items = sectionMatches
          ? section.items
          : section.items.filter((item) => (
            item.label.toLowerCase().includes(normalizedNavFilter) ||
            item.to.toLowerCase().includes(normalizedNavFilter)
          ));
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [normalizedNavFilter, visibleSections]);
  const visibleItemCount = useMemo(() => (
    visibleSections.reduce((count, section) => count + section.items.length, 0)
  ), [visibleSections]);
  const totalNavItemCount = useMemo(() => (
    NAV_SECTIONS.reduce((count, section) => count + section.items.length, 0)
  ), []);
  const totalQuickCreateActionCount = SIDEBAR_QUICK_CREATE_ACTIONS.length;
  const hiddenNavItemCount = Math.max(totalNavItemCount - visibleItemCount, 0);
  const hiddenQuickCreateCount = Math.max(totalQuickCreateActionCount - quickCreateActions.length, 0);
  const renderedItemCount = useMemo(() => (
    renderedSections.reduce((count, section) => count + section.items.length, 0)
  ), [renderedSections]);
  const navigationUsable = Boolean(currentUser) && visibleItemCount > 0;
  const sidebarReady = navigationUsable && sectionStateHydrated;
  const permissionSource = permissionMatrix ? 'matrix' : currentUser ? 'role-defaults' : 'anonymous';
  const permissionSyncState = !currentUser
    ? 'anonymous'
    : permissionMatrix
      ? 'synced'
      : permissionsLoading
        ? 'syncing-role-defaults'
        : permissionSyncError
          ? 'role-defaults-error'
          : 'role-defaults';
  const activeSectionId = useMemo(() => (
    visibleSections.find((section) => (
      section.items.some((item) => isNavRouteActive(location.pathname, item.to))
    ))?.id
  ), [location.pathname, visibleSections]);
  const visibleExpandedSectionIds = useMemo(() => {
    const next = new Set(expandedSectionIds);
    if (normalizedNavFilter) {
      renderedSections.forEach((section) => next.add(section.id));
      return next;
    }
    if (!collapsed && activeSectionId) {
      next.add(activeSectionId);
    }
    return next;
  }, [activeSectionId, collapsed, expandedSectionIds, normalizedNavFilter, renderedSections]);
  const expandedSectionCount = useMemo(() => (
    collapsed
      ? renderedSections.length
      : renderedSections.filter((section) => visibleExpandedSectionIds.has(section.id)).length
  ), [collapsed, renderedSections, visibleExpandedSectionIds]);
  const collapsedSectionCount = collapsed ? 0 : Math.max(renderedSections.length - expandedSectionCount, 0);
  const toggleLabel = collapseLocked
    ? 'Sidebar stays compact while editing'
    : collapsed
      ? 'Expand sidebar'
      : 'Collapse sidebar';
  const sidebarActionStatusId = `${navigationId}-action-status`;
  const permissionSyncStatusId = `${navigationId}-permission-sync-status`;
  const sidebarNavigationMode = collapsed ? 'compact-rail' : 'expanded-panel';
  const permissionSyncStatus = !currentUser
    ? 'Sign in to load admin navigation.'
    : permissionMatrix
      ? `Detailed backend permissions synced for ${currentUser.email}.`
      : permissionsLoading
        ? 'Syncing detailed admin permissions; role-default navigation is active.'
        : permissionSyncError
          ? `${permissionSyncError} Retry permission sync available.`
          : 'Role-default navigation active until detailed admin permissions sync.';
  const sidebarFilterSummary = normalizedNavFilter
    ? collapsed
      ? `${renderedItemCount} of ${visibleItemCount} navigation tools shown in compact rail for "${normalizedNavFilter}".`
      : `${renderedItemCount} of ${visibleItemCount} navigation tools shown for "${normalizedNavFilter}".`
    : collapsed
      ? `${visibleItemCount} navigation tools across ${visibleSections.length} groups in compact rail. Labels show on hover or focus.`
      : `${visibleItemCount} navigation tools across ${visibleSections.length} groups. ${expandedSectionCount} groups expanded.`;
  const sidebarControlStatus = collapsed
    ? 'Filter navigation and group density controls are available when expanded.'
    : 'Filter navigation available. Show active group available. Show all groups available.';
  const sidebarRoleFilterStatus = hiddenNavItemCount > 0 || hiddenQuickCreateCount > 0
    ? `Role filters hide ${hiddenNavItemCount} navigation tool${hiddenNavItemCount === 1 ? '' : 's'} and ${hiddenQuickCreateCount} create shortcut${hiddenQuickCreateCount === 1 ? '' : 's'}.`
    : 'Role filters hide no navigation tools or create shortcuts.';
  const sidebarCollapseStatus = collapseLocked
    ? 'Sidebar collapse unavailable: Sidebar stays compact while editing.'
    : collapsed
      ? 'Expand sidebar available.'
      : 'Collapse sidebar available.';
  const sidebarActionStatus = `${permissionSyncStatus} ${sidebarFilterSummary} ${sidebarRoleFilterStatus} ${sidebarControlStatus} ${sidebarCollapseStatus}`;
  const quickCreateStatusId = `${navigationId}-quick-create-status`;
  const railTooltipId = `${navigationId}-rail-tooltip`;
  const quickCreateActionStatus = `${quickCreateActions.length} create shortcut${quickCreateActions.length === 1 ? '' : 's'} available for ${activeSiteName}. ${hiddenQuickCreateCount} hidden by role or permissions.`;
  const activeSiteManageStatus = `Manage ${activeSiteName} site workspace without signing out.`;
  const activeSiteSwitchStatus = `Switch active site without signing out. Currently ${activeSiteName}.`;
  const activeSiteDomainStatus = `Open domain and subdomain setup for ${activeSiteName}. ${activeSiteDomainLabel}.`;
  const getQuickCreateIntent = (action: (typeof SIDEBAR_QUICK_CREATE_ACTIONS)[number]) => action.search?.quickCreate || action.id;
  const getRailDescribedBy = (baseId: string) => (
    collapsed ? `${baseId} ${railTooltipId}` : baseId
  );
  const collapseInactiveSections = () => {
    const next = new Set<string>();
    if (activeSectionId) {
      next.add(activeSectionId);
    } else {
      DEFAULT_OPEN_SECTION_IDS.forEach((sectionId) => {
        if (visibleSections.some((section) => section.id === sectionId)) {
          next.add(sectionId);
        }
      });
      if (next.size === 0 && visibleSections[0]) {
        next.add(visibleSections[0].id);
      }
    }
    writeSidebarSectionState(next);
    setSectionStateSource('stored');
    setLegacySectionStateCount(0);
    setExpandedSectionIds(next);
  };
  const expandAllSections = () => {
    const next = new Set(visibleSections.map((section) => section.id));
    writeSidebarSectionState(next);
    setSectionStateSource('stored');
    setLegacySectionStateCount(0);
    setExpandedSectionIds(next);
  };
  const toggleSection = (sectionId: string) => {
    setExpandedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        if (sectionId === activeSectionId) return current;
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      writeSidebarSectionState(next);
      setSectionStateSource('stored');
      setLegacySectionStateCount(0);
      return next;
    });
  };
  const showRailTooltip = (item: Pick<NavItem, 'label' | 'to' | 'area'>, target: HTMLElement) => {
    if (!collapsed) return;

    const rect = target.getBoundingClientRect();
    setRailTooltip({
      label: item.label,
      route: item.to,
      area: item.area,
      top: Math.round(rect.top + rect.height / 2),
    });
  };
  const hideRailTooltip = () => setRailTooltip(null);
  const switchActiveSite = (nextSiteId: string) => {
    const target = getSiteSwitchTarget({
      pathname: location.pathname,
      search: location.search as Record<string, unknown>,
      requestedSiteId: nextSiteId,
      sites,
    });

    onNavigate?.();

    switch (target.type) {
      case 'siteDetail':
        navigate({ to: '/sites/$siteId', params: { siteId: target.siteId } });
        return;
      case 'sites':
        navigate({ to: '/sites', search: { siteId: target.siteId } });
        return;
      case 'pagesNew':
        navigate({ to: '/pages/new', search: { siteId: target.siteId } });
        return;
      case 'pages':
        navigate({ to: '/pages', search: { siteId: target.siteId } });
        return;
      case 'blogNew':
        navigate({ to: '/blog/new', search: { siteId: target.siteId } });
        return;
      case 'blog':
        navigate({ to: '/blog', search: { siteId: target.siteId } });
        return;
      case 'media':
        navigate({ to: '/media', search: { siteId: target.siteId } });
        return;
      case 'collections':
        navigate({ to: '/collections', search: { siteId: target.siteId } });
        return;
      case 'reusableSections':
        navigate({ to: '/reusable-sections', search: { siteId: target.siteId } });
        return;
      case 'products':
        navigate({ to: '/products', search: { siteId: target.siteId } });
        return;
      case 'orders':
        navigate({ to: '/orders', search: { siteId: target.siteId } });
        return;
      case 'forms':
        navigate({ to: '/forms', search: { siteId: target.siteId } });
        return;
      case 'newsletter':
        navigate({ to: '/newsletter', search: { siteId: target.siteId } });
        return;
      case 'contacts':
        navigate({ to: '/contacts', search: { siteId: target.siteId } });
        return;
      case 'comments':
        navigate({ to: '/comments', search: { siteId: target.siteId } });
        return;
      case 'teams':
        navigate({ to: '/teams', search: { siteId: target.siteId } });
        return;
      case 'users':
        navigate({ to: '/users', search: { siteId: target.siteId } });
        return;
      case 'help':
        navigate({ to: '/help', search: { siteId: target.siteId } });
        return;
      case 'settings':
        navigate({
          to: '/settings',
          search: {
            siteId: target.siteId,
            ...(target.tab ? { tab: target.tab } : {}),
          },
        });
        return;
      case 'dashboard':
        navigate({ to: '/', search: { siteId: target.siteId } });
        return;
      default:
        return;
    }
  };

  useEffect(() => {
    if (collapsed || !activeSectionId) return;

    setExpandedSectionIds((current) => {
      if (current.has(activeSectionId)) return current;
      const next = new Set(current);
      next.add(activeSectionId);
      writeSidebarSectionState(next);
      setSectionStateSource('stored');
      setLegacySectionStateCount(0);
      return next;
    });
  }, [activeSectionId, collapsed]);

  return (
    <aside
      id={navigationId}
      data-testid={testIdPrefix}
      data-collapsed={String(collapsed)}
      data-permissions-loading={String(permissionsLoading)}
      data-permission-source={permissionSource}
      data-permission-sync-state={permissionSyncState}
      data-permission-sync-status={permissionSyncStatus}
      data-permission-sync-error={permissionSyncError || undefined}
      data-nav-ready={String(sidebarReady)}
      data-section-state-hydrated={String(sectionStateHydrated)}
      data-nav-section-count={visibleSections.length}
      data-rendered-nav-section-count={renderedSections.length}
      data-expanded-section-count={expandedSectionCount}
      data-collapsed-section-count={collapsedSectionCount}
      data-active-nav-section={activeSectionId || ''}
      data-nav-item-count={visibleItemCount}
      data-total-nav-item-count={totalNavItemCount}
      data-hidden-nav-item-count={hiddenNavItemCount}
      data-rendered-nav-item-count={renderedItemCount}
      data-nav-filtered={String(Boolean(normalizedNavFilter))}
      data-nav-mode={sidebarNavigationMode}
      data-quick-create-count={quickCreateActions.length}
      data-total-quick-create-count={totalQuickCreateActionCount}
      data-hidden-quick-create-count={hiddenQuickCreateCount}
      data-section-state-version={SIDEBAR_SECTION_STORAGE_VERSION}
      data-section-state-source={sectionStateSource}
      data-legacy-section-state-count={legacySectionStateCount}
      data-scroll-contract="viewport-bounded-sidebar"
      data-scroll-scope="sidebar-nav"
      data-scroll-container-testid={`${testIdPrefix}-nav`}
      aria-busy={(permissionsLoading && !navigationUsable) || !sectionStateHydrated}
      aria-describedby={sidebarActionStatusId}
      className={cn(
        'flex h-full max-h-dvh min-h-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <span id={sidebarActionStatusId} className="sr-only" data-testid={`${testIdPrefix}-action-status`}>
        {sidebarActionStatus}
      </span>
      <span
        id={permissionSyncStatusId}
        className="sr-only"
        role={permissionsLoading || permissionSyncError ? 'status' : undefined}
        data-testid={`${testIdPrefix}-permission-sync-status`}
      >
        {permissionSyncStatus}
      </span>
      {/* Logo Area */}
      <div
        className={cn(
          'flex shrink-0 border-b border-border px-3',
          collapsed ? 'h-16 items-center justify-center' : 'min-h-[136px] items-start justify-start py-3',
        )}
        data-testid={`${testIdPrefix}-brand-header`}
        data-brand-header-layout={collapsed ? 'compact-brand' : 'expanded-site-controls'}
        data-brand-header-min-height={collapsed ? '64' : '136'}
      >
        <div
          className={cn(
            'flex min-w-0 gap-3 rounded-md',
            collapsed ? 'items-center justify-center' : 'w-full items-start',
          )}
          title={collapsed ? `Backy - ${activeSiteName}` : undefined}
          data-testid={`${testIdPrefix}-site-switcher-shell`}
          data-active-site-id={activeSiteId}
          data-active-site-name={activeSiteName}
          data-active-site-meta={activeSiteMeta}
          data-active-site-primary-host={activeSitePrimaryHost}
          data-active-site-alias-host={activeSiteAliasHost}
          data-active-site-domain-state={activeSiteDomainState}
          data-active-site-domain-label={activeSiteDomainLabel}
          data-site-switcher-mode={collapsed ? 'brand-link-only' : 'inline-select'}
          data-expanded-site-switcher-layout={collapsed ? 'compact-brand' : 'stacked-site-controls'}
        >
          {/* Logo Icon */}
          <Link
            to="/"
            search={getNavSearch('/')}
            onClick={onNavigate}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary focus-ring"
            aria-label={`Open ${activeSiteName} dashboard`}
          >
            <span className="text-white font-bold text-sm">B</span>
          </Link>

          {/* Logo Text (hidden when collapsed) */}
          {!collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-h-6 min-w-0 items-center justify-between gap-2">
                <Link
                  to="/"
                  search={getNavSearch('/')}
                  onClick={onNavigate}
                  className="block min-w-0 truncate text-[15px] font-semibold leading-5 text-foreground focus-ring"
                >
                  Backy
                </Link>
                <Link
                  to="/sites/$siteId"
                  params={{ siteId: activeSiteRouteId }}
                  onClick={onNavigate}
                  aria-label={activeSiteManageStatus}
                  title={activeSiteManageStatus}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10 focus-ring"
                  data-testid={`${testIdPrefix}-active-site-manage`}
                  data-target-site-id={activeSiteRouteId}
                  data-active-site-id={activeSiteId}
                  data-action-state="ready"
                  data-action-status={activeSiteManageStatus}
                >
                  Manage
                </Link>
              </div>
              <div
                className="mt-2 flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs leading-4 text-muted-foreground"
                data-testid={`${testIdPrefix}-active-site`}
                data-site-switcher-discovery="visible-site-select-no-signout"
                data-active-site-domain-state={activeSiteDomainState}
                data-active-site-domain-label={activeSiteDomainLabel}
                data-action-status={`${activeSiteSwitchStatus} ${activeSiteManageStatus} ${activeSiteDomainStatus}`}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    activeSiteStatus === 'published' ? 'bg-success' : 'bg-muted-foreground/50',
                  )}
                  aria-hidden="true"
                />
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground/80"
                  data-testid={`${testIdPrefix}-site-switcher-label`}
                  aria-hidden="true"
                >
                  Site
                </span>
                <span className="sr-only">{activeSiteSwitchStatus}</span>
                <select
                  value={activeSiteId}
                  onChange={(event) => switchActiveSite(event.target.value)}
                  className="h-7 min-w-0 flex-1 appearance-none bg-transparent text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus:text-foreground"
                  data-testid={`${testIdPrefix}-site-switcher`}
                  aria-label={activeSiteSwitchStatus}
                  title={activeSiteSwitchStatus}
                >
                  {sites.map((site) => {
                    const optionSiteId = site.publicSiteId || site.id;
                    const optionMeta = getSitePrimaryHost(site, { fallbackSiteId: optionSiteId });
                    const optionAlias = getSiteSecondaryHost(site);

                    return (
                      <option key={site.id} value={optionSiteId}>
                        {site.name} / {optionAlias ? `${optionMeta} + ${optionAlias}` : optionMeta}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              </div>
              <div
                className="mt-2 flex min-w-0 items-center justify-between gap-2 px-1 text-[11px] leading-4 text-muted-foreground"
                data-testid={`${testIdPrefix}-active-site-discovery-links`}
                data-active-site-domain-state={activeSiteDomainState}
                data-active-site-domain-label={activeSiteDomainLabel}
              >
                <a
                  href={`${activeSiteDetailHref}#site-domain`}
                  aria-label={activeSiteDomainStatus}
                  title={activeSiteDomainStatus}
                  className="truncate rounded px-1 font-medium text-primary hover:bg-primary/10 focus-ring"
                  data-testid={`${testIdPrefix}-active-site-domains`}
                  data-target-site-id={activeSiteRouteId}
                  data-active-site-id={activeSiteId}
                  data-active-site-domain-state={activeSiteDomainState}
                  data-action-state="ready"
                  data-action-status={activeSiteDomainStatus}
                >
                  Domains
                </a>
                <Link
                  to="/help"
                  search={activeSiteSearch}
                  onClick={onNavigate}
                  aria-label={`Open Help for site switching, domains, and subdomains for ${activeSiteName}`}
                  className="shrink-0 rounded px-1 font-medium hover:bg-accent focus-ring"
                  data-testid={`${testIdPrefix}-active-site-help`}
                  data-target-site-id={activeSiteId}
                  data-action-state="ready"
                  data-action-status={`Help available for site switching, domains, and subdomains for ${activeSiteName}.`}
                >
                  Help
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {quickCreateActions.length > 0 && (
        <div
          className={cn(
            'shrink-0 border-b border-border px-2 py-2',
            collapsed ? 'space-y-1' : 'bg-card/95',
          )}
          role="group"
          aria-label="Create content"
          aria-describedby={quickCreateStatusId}
          data-testid={`${testIdPrefix}-quick-create`}
          data-collapsed={String(collapsed)}
          data-action-state="ready"
          data-action-status={quickCreateActionStatus}
          data-target-site-id={activeSiteId}
          data-target-site-name={activeSiteName}
          data-target-site-status={activeSiteStatus}
          data-permission-source={permissionSource}
          data-permission-sync-state={permissionSyncState}
          data-quick-create-count={quickCreateActions.length}
          data-total-quick-create-count={totalQuickCreateActionCount}
          data-hidden-quick-create-count={hiddenQuickCreateCount}
        >
          <span id={quickCreateStatusId} className="sr-only" data-testid={`${testIdPrefix}-quick-create-status`}>
            {quickCreateActionStatus}
          </span>
          <div className={cn(collapsed ? 'space-y-1' : 'grid grid-cols-2 gap-1')}>
            {quickCreateActions.map((action) => {
              const Icon = action.icon;
              const isActive = isNavRouteActive(location.pathname, action.to);
              const actionStatus = `${action.label} available for ${activeSiteName}.`;
              const quickCreateSearch = getQuickCreateSearch(action);
              const quickCreateSearchValue = new URLSearchParams(quickCreateSearch).toString();
              const quickCreateIntent = getQuickCreateIntent(action);

              return (
                <Link
                  key={action.id}
                  to={action.to}
                  search={quickCreateSearch}
                  onClick={onNavigate}
                  onMouseOver={(event) => showRailTooltip(action, event.currentTarget)}
                  onMouseEnter={(event) => showRailTooltip(action, event.currentTarget)}
                  onMouseMove={(event) => showRailTooltip(action, event.currentTarget)}
                  onMouseLeave={hideRailTooltip}
                  onFocus={(event) => showRailTooltip(action, event.currentTarget)}
                  onBlur={hideRailTooltip}
                  aria-current={isActive ? 'page' : undefined}
                  aria-describedby={getRailDescribedBy(quickCreateStatusId)}
                  aria-label={action.label}
                  title={collapsed ? action.label : undefined}
                  className={cn(
                    'group relative flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                    'hover:bg-accent hover:text-accent-foreground focus-ring active:translate-y-px',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]'
                      : 'text-muted-foreground',
                    collapsed
                      ? 'justify-center px-2'
                      : cn(
                        'justify-center border px-2 text-xs',
                        isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-background text-foreground',
                      ),
                  )}
                  data-testid={`${testIdPrefix}-quick-create-${action.id}`}
                  data-quick-create-action={action.id}
                  data-nav-area={action.area}
                  data-nav-route={action.to}
                  data-nav-active={String(isActive)}
                  data-target-route={action.to}
                  data-target-search={quickCreateSearchValue}
                  data-target-site-id={activeSiteId}
                  data-target-site-status={activeSiteStatus}
                  data-create-intent={quickCreateIntent}
                  data-required-permission={action.permissionKey}
                  data-action-state="ready"
                  data-action-status={actionStatus}
                >
                  {isActive && collapsed && (
                    <span
                      className="absolute left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-3.5 w-3.5')} aria-hidden="true" />
                  {!collapsed && <span className="truncate">{action.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!collapsed && visibleSections.length > 1 && (
        <div
          className="shrink-0 border-b border-border px-2 py-2"
          data-testid={`${testIdPrefix}-density-controls`}
          data-expanded-section-count={expandedSectionCount}
          data-section-count={visibleSections.length}
          data-rendered-section-count={renderedSections.length}
          data-rendered-item-count={renderedItemCount}
          data-filtered={String(Boolean(normalizedNavFilter))}
          data-active-section={activeSectionId || ''}
          data-action-status={sidebarActionStatus}
          aria-describedby={sidebarActionStatusId}
        >
          <div className="mb-2 flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label htmlFor={`${navigationId}-filter`} className="sr-only">Filter admin navigation</label>
            <input
              id={`${navigationId}-filter`}
              type="search"
              value={navFilter}
              onChange={(event) => setNavFilter(event.target.value)}
              placeholder="Filter navigation"
              className="min-h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              data-testid={`${testIdPrefix}-filter-input`}
              aria-controls={navigationId}
              aria-describedby={sidebarActionStatusId}
              data-action-state="ready"
              data-action-status={sidebarActionStatus}
            />
            {navFilter && (
              <button
                type="button"
                onClick={() => setNavFilter('')}
                className="flex min-h-7 min-w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
                data-testid={`${testIdPrefix}-filter-clear`}
                aria-label="Clear navigation filter"
                aria-describedby={sidebarActionStatusId}
                data-action-state="ready"
                data-action-status={sidebarActionStatus}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded-lg bg-muted/60 p-1 text-xs">
            <span className="min-w-0 truncate px-2 font-medium text-muted-foreground">
              {normalizedNavFilter
                ? `${renderedItemCount}/${visibleItemCount} tools`
                : `${expandedSectionCount}/${visibleSections.length} groups`}
            </span>
            <button
              type="button"
              onClick={collapseInactiveSections}
              className="min-h-8 rounded-md px-2.5 font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-ring"
              data-testid={`${testIdPrefix}-collapse-inactive-sections`}
              aria-describedby={sidebarActionStatusId}
              data-action-state="ready"
              data-action-status={sidebarActionStatus}
              title="Show active group"
            >
              Active
            </button>
            <button
              type="button"
              onClick={expandAllSections}
              className="min-h-8 rounded-md px-2.5 font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-ring"
              data-testid={`${testIdPrefix}-expand-all-sections`}
              aria-describedby={sidebarActionStatusId}
              data-action-state="ready"
              data-action-status={sidebarActionStatus}
              title="Show all groups"
            >
              All
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]"
        aria-label="Primary admin navigation"
        data-testid={`${testIdPrefix}-nav`}
        data-scroll-role="primary-navigation"
        data-scroll-axis="y"
        data-scroll-owned-by={testIdPrefix}
        data-scroll-contained="true"
        onScroll={hideRailTooltip}
      >
        <div className="space-y-2 pb-2">
          {renderedSections.map((section, sectionIndex) => {
            const sectionHasActiveItem = section.items.some((item) => isNavRouteActive(location.pathname, item.to));
            const sectionExpanded = collapsed || visibleExpandedSectionIds.has(section.id);
            const itemGroupId = `${navigationId}-${section.id}-items`;
            const sectionActionStatus = `${section.label} group ${sectionExpanded ? 'expanded' : 'collapsed'} with ${section.items.length} navigation item${section.items.length === 1 ? '' : 's'}.`;

            return (
              <div
                key={section.id}
                aria-label={collapsed ? section.label : undefined}
                className={cn(
                  'space-y-1',
                  collapsed && sectionIndex > 0 && 'mt-2 border-t border-border/70 pt-2'
                )}
                data-nav-section={section.id}
                data-nav-section-expanded={String(sectionExpanded)}
                data-nav-section-active={String(sectionHasActiveItem)}
                data-nav-section-item-count={section.items.length}
              >
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-controls={itemGroupId}
                    aria-expanded={sectionExpanded}
                    aria-describedby={sidebarActionStatusId}
                    className={cn(
                      'group flex min-h-8 w-full items-center gap-2 rounded-md px-3 py-1 text-left',
                      'text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors focus-ring',
                      sectionHasActiveItem
                        ? 'bg-primary/5 text-primary'
                        : 'text-muted-foreground/80 hover:bg-accent hover:text-accent-foreground',
                    )}
                    data-testid={`${testIdPrefix}-section-toggle-${section.id}`}
                    data-action-state="ready"
                    data-action-status={sectionActionStatus}
                    data-section-status={sectionActionStatus}
                  >
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                        sectionHasActiveItem ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                      aria-label={`${section.items.length} navigation items`}
                    >
                      {section.items.length}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-transform',
                        !sectionExpanded && '-rotate-90',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                )}
                {(sectionExpanded || collapsed) && (
                  <div id={itemGroupId} className="space-y-1" role={collapsed ? undefined : 'group'}>
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isNavRouteActive(location.pathname, item.to);

                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          search={getNavSearch(item.to)}
                          onClick={onNavigate}
                          onMouseOver={(event) => showRailTooltip(item, event.currentTarget)}
                          onMouseEnter={(event) => showRailTooltip(item, event.currentTarget)}
                          onMouseMove={(event) => showRailTooltip(item, event.currentTarget)}
                          onMouseLeave={hideRailTooltip}
                          onFocus={(event) => showRailTooltip(item, event.currentTarget)}
                          onBlur={hideRailTooltip}
                          aria-current={isActive ? 'page' : undefined}
                          aria-describedby={getRailDescribedBy(sidebarActionStatusId)}
                          className={cn(
                            'group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:min-h-9 lg:py-1.5',
                            'hover:bg-accent hover:text-accent-foreground focus-ring active:translate-y-px',
                            isActive
                              ? 'bg-primary/10 font-semibold text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]'
                              : 'text-muted-foreground',
                            collapsed && 'justify-center px-2'
                          )}
                          title={collapsed ? item.label : undefined}
                          aria-label={item.label}
                          data-nav-active={String(isActive)}
                          data-testid={`${testIdPrefix}-link-${item.id}`}
                          data-nav-area={item.area}
                          data-nav-route={item.to}
                          data-action-state="ready"
                          data-action-status={`${item.label} navigation available.`}
                        >
                          {isActive && collapsed && (
                            <span
                              className="absolute left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-primary"
                              aria-hidden="true"
                            />
                          )}
                          <Icon className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />

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
                )}
              </div>
            );
          })}
          {!collapsed && normalizedNavFilter && renderedSections.length === 0 && (
            <div
              className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
              role="status"
              data-testid={`${testIdPrefix}-filter-empty`}
              data-empty-filter={normalizedNavFilter}
            >
              <div className="font-medium text-foreground">No navigation matches "{normalizedNavFilter}"</div>
              <button
                type="button"
                onClick={() => setNavFilter('')}
                className="mt-3 inline-flex min-h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-ring"
                data-testid={`${testIdPrefix}-filter-empty-clear`}
                aria-describedby={sidebarActionStatusId}
                data-action-state="ready"
                data-action-status={sidebarActionStatus}
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      </nav>

      {collapsed && railTooltip && (
        <div
          id={railTooltipId}
          role="tooltip"
          className="pointer-events-none fixed left-[4.75rem] z-50 max-w-56 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg"
          style={{ top: railTooltip.top }}
          data-testid={`${testIdPrefix}-rail-tooltip`}
          data-tooltip-item={railTooltip.label.toLowerCase()}
          data-tooltip-area={railTooltip.area}
          data-tooltip-route={railTooltip.route}
        >
          <span className="block font-semibold leading-4">{railTooltip.label}</span>
          <span className="mt-0.5 block text-[10px] leading-3 text-muted-foreground">
            {railTooltip.route}
          </span>
        </div>
      )}

      {permissionSyncError && navigationUsable && (
        <div
          className={cn(
            'shrink-0 border-t border-border px-2 py-2',
            collapsed ? 'flex justify-center' : 'bg-card',
          )}
          role="status"
          data-testid={`${testIdPrefix}-permission-sync-recovery`}
          data-permission-sync-state={permissionSyncState}
          data-action-status={permissionSyncStatus}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={refreshPermissions}
              disabled={permissionsLoading}
              aria-label="Retry permission sync"
              aria-describedby={permissionSyncStatusId}
              title="Retry permission sync"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${testIdPrefix}-permission-sync-retry`}
              data-action-state={permissionsLoading ? 'loading' : 'ready'}
              data-action-status={permissionSyncStatus}
            >
              <RefreshCw className={cn('size-4', permissionsLoading && 'animate-spin')} aria-hidden="true" />
            </button>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1">
                  Permission sync failed. Role defaults stay active.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshPermissions}
                disabled={permissionsLoading}
                aria-describedby={permissionSyncStatusId}
                className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`${testIdPrefix}-permission-sync-retry`}
                data-action-state={permissionsLoading ? 'loading' : 'ready'}
                data-action-status={permissionSyncStatus}
              >
                <RefreshCw className={cn('size-3.5', permissionsLoading && 'animate-spin')} aria-hidden="true" />
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={collapseLocked}
          aria-controls={navigationId}
          aria-expanded={!collapsed}
          aria-describedby={sidebarActionStatusId}
          aria-label={toggleLabel}
          data-testid={`${testIdPrefix}-toggle`}
          data-action-state={collapseLocked ? 'blocked' : 'ready'}
          data-action-status={sidebarActionStatus}
          data-disabled-reason={collapseLocked ? 'Sidebar stays compact while editing.' : undefined}
          className={cn(
            'flex min-h-11 w-full items-center justify-center rounded-lg p-2',
            'hover:bg-accent hover:text-accent-foreground transition-colors',
            'text-muted-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
          )}
          title={toggleLabel}
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
