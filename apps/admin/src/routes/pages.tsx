/**
 * BACKY CMS - PAGES LIST
 * 
 * This route is a LAYOUT route - it renders different content:
 * - At /pages exactly: shows the pages list
 * - At /pages/new or /pages/:id/edit: renders child via <Outlet />
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Archive, CheckCircle2, Code2, Copy, Download, ExternalLink, Eye, Filter, Plus, Layout, Edit, Trash2, Home, RefreshCw, Sparkles, ShoppingBag, Newspaper, Mail, UserPlus } from 'lucide-react';
import {
  archivePage,
  createPagePreview,
  deletePage as deletePageFromApi,
  getPageReadiness,
  getPageRevisionSummary,
  getSiteReadiness,
  listCollections,
  listPages,
  publishPage,
  type Collection,
  type ContentRevisionSummary,
  type PageReadiness,
} from '@/lib/adminContentApi';
import { useStore, type Page } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

type PageStatusFilter = 'all' | Page['status'];

type PageLibraryFilter =
  | 'all'
  | 'ready'
  | 'needs-attention'
  | 'blocked'
  | 'route-conflicts'
  | 'homepage'
  | 'scheduled'
  | 'has-canvas'
  | 'empty-canvas'
  | 'not-checked';

type PageSortKey = keyof Pick<Page, 'title' | 'status' | 'lastUpdated'>;

interface PagesSearch {
  siteId?: string;
  q?: string;
  status?: PageStatusFilter;
  health?: PageLibraryFilter;
  page?: number;
  sortBy?: PageSortKey;
  sortDirection?: 'asc' | 'desc';
}

const PAGE_STATUS_FILTERS: PageStatusFilter[] = ['all', 'draft', 'published', 'scheduled', 'archived'];
const PAGE_HEALTH_FILTERS: PageLibraryFilter[] = [
  'all',
  'ready',
  'needs-attention',
  'blocked',
  'route-conflicts',
  'homepage',
  'scheduled',
  'has-canvas',
  'empty-canvas',
  'not-checked',
];
const PAGE_SORT_KEYS: PageSortKey[] = ['title', 'status', 'lastUpdated'];

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizedSearchPage = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
};

const isPageStatusFilter = (value: unknown): value is PageStatusFilter => (
  typeof value === 'string' && PAGE_STATUS_FILTERS.includes(value as PageStatusFilter)
);

const isPageLibraryFilter = (value: unknown): value is PageLibraryFilter => (
  typeof value === 'string' && PAGE_HEALTH_FILTERS.includes(value as PageLibraryFilter)
);

const isPageSortKey = (value: unknown): value is PageSortKey => (
  typeof value === 'string' && PAGE_SORT_KEYS.includes(value as PageSortKey)
);

const isSortDirection = (value: unknown): value is 'asc' | 'desc' => (
  value === 'asc' || value === 'desc'
);

export const Route = createFileRoute('/pages')({
  validateSearch: (search: Record<string, unknown>): PagesSearch => ({
    siteId: normalizedSearchString(search.siteId),
    q: normalizedSearchString(search.q),
    status: isPageStatusFilter(search.status) ? search.status : undefined,
    health: isPageLibraryFilter(search.health) ? search.health : undefined,
    page: normalizedSearchPage(search.page),
    sortBy: isPageSortKey(search.sortBy) ? search.sortBy : undefined,
    sortDirection: isSortDirection(search.sortDirection) ? search.sortDirection : undefined,
  }),
  component: PagesLayout,
});

const PAGES_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose which website page library is being managed.',
    href: '#pages-site',
  },
  {
    title: 'Page health',
    detail: 'Review totals, drafts, published pages, and publish blockers.',
    href: '#pages-health',
  },
  {
    title: 'Frontend API',
    detail: 'Copy public page, resolve, render, preview, and readiness endpoints.',
    href: '#pages-api',
  },
  {
    title: 'Library controls',
    detail: 'Search, filter, refresh, select, and bulk publish/archive/delete.',
    href: '#pages-filters',
  },
  {
    title: 'Page library',
    detail: 'Open the visual editor, preview, publish, archive, or delete pages.',
    href: '#pages-library',
  },
] as const;

const PAGE_BUILDER_SYSTEMS = [
  {
    key: 'canvas',
    title: 'Canvas and breakpoints',
    detail: 'Desktop, tablet, and mobile sizing, zoom, selection, grouping, rulers, and layout bounds.',
  },
  {
    key: 'sections',
    title: 'Reusable sections',
    detail: 'Headers, navigation, footers, hero sections, feature grids, forms, and saved blocks.',
  },
  {
    key: 'style',
    title: 'Design tokens',
    detail: 'Colors, typography, spacing, borders, shadows, animation timing, and component variants.',
  },
  {
    key: 'content',
    title: 'Content bindings',
    detail: 'Static copy, collection records, blog posts, products, media, forms, and user state.',
  },
  {
    key: 'publishing',
    title: 'Publishing controls',
    detail: 'Draft, scheduled, published, archived, preview URLs, readiness, rollback, and SEO checks.',
  },
  {
    key: 'frontend',
    title: 'Frontend delivery',
    detail: 'Resolve, render, manifest, navigation, route metadata, redirects, and custom frontend APIs.',
  },
] as const;

const PAGE_WORKFLOW_SURFACES = [
  {
    key: 'sites',
    title: 'Sites',
    detail: 'Control navigation, domains, redirects, SEO defaults, and site-wide page delivery settings.',
    route: '/sites',
  },
  {
    key: 'media',
    title: 'Media',
    detail: 'Use uploaded images, fonts, documents, videos, icons, and reusable assets inside the visual editor.',
    route: '/media',
  },
  {
    key: 'forms',
    title: 'Forms',
    detail: 'Bind contact, registration, survey, and custom form blocks to Backy submissions and contacts.',
    route: '/forms',
  },
  {
    key: 'products',
    title: 'Products',
    detail: 'Connect storefront sections, product cards, checkout buttons, and digital delivery blocks to commerce data.',
    route: '/products',
  },
  {
    key: 'blog',
    title: 'Blog',
    detail: 'Create blog index pages, article routes, editorial previews, taxonomy sections, and post feeds.',
    route: '/blog',
  },
  {
    key: 'settings',
    title: 'Settings',
    detail: 'Confirm API keys, Supabase/storage/runtime connectivity, auth policy, and deployment readiness.',
    route: '/settings',
  },
] as const;

const PAGE_EXPORT_COLUMNS = [
  'page_id',
  'site_id',
  'active_site_id',
  'title',
  'slug',
  'path',
  'status',
  'is_homepage',
  'route_status',
  'route_issue',
  'route_conflict_ids',
  'delivery_status',
  'preview_endpoint',
  'parent_id',
  'parent_title',
  'children_count',
  'navigation_placement',
  'navigation_label',
  'revision_count',
  'latest_revision_note',
  'latest_revision_at',
  'latest_revision_status',
  'scheduled_at',
  'last_updated',
  'readiness_score',
  'readiness_status',
  'element_count',
  'public_url',
  'admin_edit_url',
  'public_render_url',
  'public_resolve_url',
  'admin_detail_url',
  'admin_readiness_url',
  'builder_systems',
] as const;

type PageCreationTemplate = 'blank' | 'landing' | 'storefront' | 'blog-index' | 'contact' | 'registration';

type PageRouteDiagnostic = {
  path: string;
  status: 'available' | 'warning' | 'conflict';
  message: string;
  conflictIds: string[];
};

type PageDeliveryStatus = 'published' | 'preview-only' | 'scheduled' | 'archived' | 'blocked';

const PAGE_CREATION_SHORTCUTS: Array<{
  key: PageCreationTemplate;
  title: string;
  detail: string;
  badge: string;
  icon: typeof Layout;
}> = [
  {
    key: 'blank',
    title: 'Blank canvas',
    detail: 'Open a clean editor surface for custom layouts, reusable sections, and page chrome.',
    badge: 'Design freely',
    icon: Layout,
  },
  {
    key: 'landing',
    title: 'Landing page',
    detail: 'Seed a polished hero, proof section, feature area, and conversion path.',
    badge: 'Site starter',
    icon: Sparkles,
  },
  {
    key: 'storefront',
    title: 'Storefront',
    detail: 'Create editable product sections that can bind to Backy commerce data.',
    badge: 'Products',
    icon: ShoppingBag,
  },
  {
    key: 'blog-index',
    title: 'Blog index',
    detail: 'Build a public article hub connected to posts, categories, and editorial routes.',
    badge: 'Editorial',
    icon: Newspaper,
  },
  {
    key: 'contact',
    title: 'Contact form',
    detail: 'Start with a form page wired for submissions, contacts, and frontend API handoff.',
    badge: 'Forms',
    icon: Mail,
  },
  {
    key: 'registration',
    title: 'Registration',
    detail: 'Create the member signup surface before full auth and membership wiring lands.',
    badge: 'Members',
    icon: UserPlus,
  },
];

/**
 * Layout component that decides what to render based on current path:
 * - /pages -> shows PagesListView
 * - /pages/new, /pages/:id/edit -> renders <Outlet /> for child routes
 */
function PagesLayout() {
  const routerState = useRouterState();
  const isExactPagesRoute = routerState.location.pathname === '/pages';

  // If we're at exactly /pages, show the list. Otherwise, render child route.
  if (isExactPagesRoute) {
    return <PagesListView />;
  }

  return <Outlet />;
}

function PagesListView() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const { sites, pages, setPages, deletePage, updatePage } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [statusFilter, setStatusFilter] = useState<PageStatusFilter>(routeSearch.status || 'all');
  const [healthFilter, setHealthFilter] = useState<PageLibraryFilter>(routeSearch.health || 'all');
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<'publish' | 'archive' | 'delete' | ''>('');
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [readinessMap, setReadinessMap] = useState<Record<string, PageReadiness>>({});
  const [revisionSummaryMap, setRevisionSummaryMap] = useState<Record<string, ContentRevisionSummary>>({});
  const [routeCollections, setRouteCollections] = useState<Collection[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [previewingPageId, setPreviewingPageId] = useState<string | null>(null);
  const [mutatingPageId, setMutatingPageId] = useState<string | null>(null);
  const [pendingPublishPage, setPendingPublishPage] = useState<Page | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<Page | null>(null);
  const [pendingBulkPublish, setPendingBulkPublish] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isPageMutationBusy = isBulkBusy || mutatingPageId !== null || previewingPageId !== null;
  const isPageLibraryBusy = isLoading || isLoadingReadiness || isPageMutationBusy;
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const activeSitePages = useMemo(() => {
    const siteIdentifiers = new Set(
      [activeSiteId, activeSite?.id, activeSite?.publicSiteId].filter(Boolean),
    );

    return pages.filter((page) => siteIdentifiers.has(page.siteId));
  }, [activeSite?.id, activeSite?.publicSiteId, activeSiteId, pages]);
  const activeSitePageMap = useMemo(
    () => new Map(activeSitePages.map((page) => [page.id, page])),
    [activeSitePages],
  );
  const activeSiteCollections = useMemo(() => (
    routeCollections.filter((collection) => (
      collection.siteId === activeSiteId
      || collection.siteId === activeSite?.id
      || collection.siteId === activeSite?.publicSiteId
    ))
  ), [activeSite?.id, activeSite?.publicSiteId, activeSiteId, routeCollections]);
  const pageRouteDiagnostics = useMemo(
    () => buildPageRouteDiagnostics(activeSitePages, activeSiteCollections),
    [activeSiteCollections, activeSitePages],
  );
  const pageChildCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    activeSitePages.forEach((page) => {
      if (!page.parentId) return;
      counts.set(page.parentId, (counts.get(page.parentId) || 0) + 1);
    });
    return counts;
  }, [activeSitePages]);
  const visiblePages = useMemo(
    () => activeSitePages.filter((page) => {
      const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
      const readiness = readinessMap[page.id];
      const elementCount = readiness?.elementCount || 0;
      const matchesHealth = (
        healthFilter === 'all' ||
        (healthFilter === 'ready' && readiness?.statusLabel === 'ready') ||
        (healthFilter === 'needs-attention' && readiness?.statusLabel === 'needs-attention') ||
        (healthFilter === 'blocked' && readiness?.statusLabel === 'blocked') ||
        (healthFilter === 'route-conflicts' && pageRouteDiagnostics[page.id]?.status === 'conflict') ||
        (healthFilter === 'homepage' && (page.isHomepage || page.slug === 'home' || page.slug === '')) ||
        (healthFilter === 'scheduled' && (page.status === 'scheduled' || Boolean(page.scheduledAt))) ||
        (healthFilter === 'has-canvas' && elementCount > 0) ||
        (healthFilter === 'empty-canvas' && Boolean(readiness) && elementCount === 0) ||
        (healthFilter === 'not-checked' && !readiness)
      );

      return matchesStatus && matchesHealth;
    }),
    [activeSitePages, healthFilter, pageRouteDiagnostics, readinessMap, statusFilter],
  );
  const pageMetrics = useMemo(
    () => ({
      total: activeSitePages.length,
      published: activeSitePages.filter((page) => page.status === 'published').length,
      draft: activeSitePages.filter((page) => page.status === 'draft').length,
      scheduled: activeSitePages.filter((page) => page.status === 'scheduled').length,
      ready: activeSitePages.filter((page) => readinessMap[page.id]?.statusLabel === 'ready').length,
      needsAttention: activeSitePages.filter((page) => readinessMap[page.id]?.statusLabel === 'needs-attention').length,
      blocked: activeSitePages.filter((page) => readinessMap[page.id]?.statusLabel === 'blocked').length,
      routeConflicts: activeSitePages.filter((page) => pageRouteDiagnostics[page.id]?.status === 'conflict').length,
      emptyCanvas: activeSitePages.filter((page) => readinessMap[page.id] && (readinessMap[page.id]?.elementCount || 0) === 0).length,
      unchecked: activeSitePages.filter((page) => !readinessMap[page.id]).length,
    }),
    [activeSitePages, pageRouteDiagnostics, readinessMap],
  );
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminBaseUrl = useMemo(() => getAdminBaseUrl(), []);
  const siteSlug = activeSite?.slug || activeSiteId;
  const selectedPages = useMemo(
    () => activeSitePages.filter((page) => selectedPageIds.has(page.id)),
    [activeSitePages, selectedPageIds],
  );
  const apiPage = selectedPages[0] || activeSitePages.find((page) => page.status === 'published') || activeSitePages[0] || null;
  const apiPageSegment = apiPage?.id ? encodeURIComponent(apiPage.id) : '{pageId}';
  const apiPageSlug = apiPage?.slug ? encodeURIComponent(apiPage.slug) : '{pageSlug}';
  const apiPagePath = apiPage ? pagePublicPath(apiPage) : '/{pageSlug}';
  const publicPagesUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/pages`;
  const publicPageBySlugUrl = `${publicPagesUrl}?slug=${apiPageSlug}`;
  const publicRenderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${apiPage ? encodeURIComponent(apiPagePath) : '/{pageSlug}'}`;
  const publicResolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${apiPage ? encodeURIComponent(apiPagePath) : '/{pageSlug}'}`;
  const adminPagesUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/pages`;
  const adminPageDetailUrl = `${adminPagesUrl}/${apiPageSegment}`;
  const adminPageReadinessUrl = `${adminPageDetailUrl}/readiness`;
  const adminPagePreviewUrl = `${adminPageDetailUrl}/preview`;
  const createPageSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const getCreatePageSearch = (template: PageCreationTemplate = 'blank') => (
    template === 'blank' ? createPageSearch : { ...createPageSearch, template }
  );
  const pageDesignReadiness = useMemo(() => {
    const checkedPages = activeSitePages.filter((page) => readinessMap[page.id]);
    const readyPages = activeSitePages.filter((page) => readinessMap[page.id]?.statusLabel === 'ready');
    const totalElements = checkedPages.reduce((total, page) => total + (readinessMap[page.id]?.elementCount || 0), 0);
    const hasHomepage = activeSitePages.some((page) => page.isHomepage || page.slug === 'home' || page.slug === '');
    const hasPublishedPage = activeSitePages.some((page) => page.status === 'published');
    const hasCanvasContent = totalElements > 0;
    const checks = [
      {
        label: 'Page library',
        detail: activeSitePages.length > 0
          ? `${activeSitePages.length} page${activeSitePages.length === 1 ? '' : 's'} in this site`
          : 'Create the first page for this site.',
        ready: activeSitePages.length > 0,
      },
      {
        label: 'Homepage route',
        detail: hasHomepage ? 'A homepage route exists.' : 'Mark one page as homepage or create /home.',
        ready: hasHomepage,
      },
      {
        label: 'Visual canvas',
        detail: hasCanvasContent
          ? `${totalElements} editor element${totalElements === 1 ? '' : 's'} detected`
          : 'Add canvas elements before publishing a real frontend.',
        ready: hasCanvasContent,
      },
      {
        label: 'Public delivery',
        detail: hasPublishedPage
          ? `${pageMetrics.published} published page${pageMetrics.published === 1 ? '' : 's'}`
          : 'Publish at least one page for public render APIs.',
        ready: hasPublishedPage,
      },
      {
        label: 'Readiness checks',
        detail: checkedPages.length === activeSitePages.length && activeSitePages.length > 0
          ? `${readyPages.length}/${activeSitePages.length} pages are ready`
          : `${checkedPages.length}/${activeSitePages.length} pages checked`,
        ready: activeSitePages.length > 0 && checkedPages.length === activeSitePages.length,
      },
      {
        label: 'Publish blockers',
        detail: pageMetrics.blocked === 0
          ? 'No blocked pages in the current readiness result.'
          : `${pageMetrics.blocked} page${pageMetrics.blocked === 1 ? '' : 's'} blocked`,
        ready: pageMetrics.blocked === 0,
      },
      {
        label: 'Route conflicts',
        detail: pageMetrics.routeConflicts === 0
          ? 'No duplicate, invalid, reserved, or collection-shadowed page routes found.'
          : `${pageMetrics.routeConflicts} page${pageMetrics.routeConflicts === 1 ? '' : 's'} need page or collection route cleanup before publishing.`,
        ready: pageMetrics.routeConflicts === 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      readyCount,
      total: checks.length,
      checks,
      workflow: [
        { label: 'Create', detail: 'Start from New Page or the empty-state action for the active site.' },
        { label: 'Design', detail: 'Open the visual editor and build reusable sections, headers, footers, and page content.' },
        { label: 'Check', detail: 'Run readiness to catch missing SEO, empty canvas, route, or publishing issues.' },
        { label: 'Deliver', detail: 'Use public page, resolve, and render APIs for any custom frontend.' },
      ],
    };
  }, [activeSitePages, pageMetrics.blocked, pageMetrics.published, pageMetrics.routeConflicts, readinessMap]);

  const setPageStatusFilter = (status: PageStatusFilter) => {
    if (isPageLibraryBusy) return;

    setStatusFilter(status);
    setHealthFilter('all');
    setCurrentPage(1);
    updatePagesRouteSearch({ status, health: 'all', page: undefined });
  };

  const showBlockedPages = () => {
    if (isPageLibraryBusy) return;

    setStatusFilter('all');
    setHealthFilter('blocked');
    setCurrentPage(1);
    updatePagesRouteSearch({ status: 'all', health: 'blocked', page: undefined });
  };

  const showRouteConflicts = () => {
    if (isPageLibraryBusy) return;

    setStatusFilter('all');
    setHealthFilter('route-conflicts');
    setCurrentPage(1);
    updatePagesRouteSearch({ status: 'all', health: 'route-conflicts', page: undefined });
  };

  const copyPageApiText = async (value: string, label: string) => {
    if (isPageLibraryBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const downloadPagesCsv = () => {
    if (isPageLibraryBusy) return;

    if (filteredPages.length === 0) {
      setError('No pages are available to export with the current controls.');
      setNotice(null);
      return;
    }

    const rows = filteredPages.map((page) => {
      const pageSiteId = page.siteId || activeSiteId;
      const pagePath = pagePublicPath(page);
      const encodedSiteId = encodeURIComponent(pageSiteId);
      const encodedPageId = encodeURIComponent(page.id);
      const readiness = readinessMap[page.id];
      const routeDiagnostic = pageRouteDiagnostics[page.id];
      const deliveryStatus = getPageDeliveryStatus(page, readiness, routeDiagnostic);

      return [
        page.id,
        page.siteId || '',
        activeSiteId,
        page.title,
        page.slug,
        pagePath,
        page.status,
        Boolean(page.isHomepage),
        pageRouteDiagnostics[page.id]?.status || 'available',
        pageRouteDiagnostics[page.id]?.message || '',
        pageRouteDiagnostics[page.id]?.conflictIds.join('; ') || '',
        deliveryStatus,
        `${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}/preview`,
        page.parentId || '',
        getParentPageTitle(page, activeSitePageMap),
        pageChildCountMap.get(page.id) || 0,
        pageMetaString(page, 'navigationPlacement'),
        pageMetaString(page, 'navigationLabel'),
        revisionSummaryMap[page.id]?.count ?? 0,
        revisionSummaryMap[page.id]?.latest?.note || '',
        revisionSummaryMap[page.id]?.latest?.createdAt || '',
        revisionSummaryMap[page.id]?.latest?.snapshotStatus || '',
        page.scheduledAt || '',
        page.lastUpdated || '',
        readiness?.score ?? '',
        readiness?.statusLabel ?? '',
        readiness?.elementCount ?? '',
        page.status === 'published' ? publicPageUrl(page) : '',
        `${typeof window !== 'undefined' ? window.location.origin : ''}/pages/${page.id}/edit`,
        `${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodeURIComponent(pagePath)}`,
        `${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodeURIComponent(pagePath)}`,
        `${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}`,
        `${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}/readiness`,
        PAGE_BUILDER_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
      ];
    });
    const csv = [PAGE_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteSlug || activeSiteId}-backy-pages.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Pages CSV exported.');
  };

  const togglePageSelection = (pageId: string) => {
    if (isPageLibraryBusy) return;

    setSelectedPageIds((current) => {
      const next = new Set(current);

      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

      return next;
    });
  };

  const setPageSelection = (targetPages: Page[], selected: boolean) => {
    if (isPageLibraryBusy) return;

    setSelectedPageIds((current) => {
      const next = new Set(current);
      targetPages.forEach((page) => {
        if (selected) {
          next.add(page.id);
        } else {
          next.delete(page.id);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const refreshPages = useMemo(
    () => async (siteId: string) => {
      if (isPageLibraryBusy) return;

      setIsLoading(true);
      setIsLoadingReadiness(true);
      setIsLoadingRevisions(true);
      setError(null);

      try {
        const [backendPages, readiness] = await Promise.all([
          listPages(siteId),
          getSiteReadiness(siteId).catch(() => null),
        ]);
        const collections = await listCollections(siteId).catch(() => []);
        const revisionSummaries = await loadPageRevisionSummaries(siteId, backendPages);
        setPages(backendPages);
        setRouteCollections(collections);
        setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
        setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
        setRevisionSummaryMap(revisionSummaries);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load pages');
      } finally {
        setIsLoading(false);
        setIsLoadingReadiness(false);
        setIsLoadingRevisions(false);
      }
    },
    [isPageLibraryBusy, setPages],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPages = async () => {
      setIsLoading(true);
      setIsLoadingReadiness(true);
      setIsLoadingRevisions(true);
      setError(null);

      try {
        const [backendPages, readiness] = await Promise.all([
          listPages(activeSiteId),
          getSiteReadiness(activeSiteId).catch(() => null),
        ]);
        const collections = await listCollections(activeSiteId).catch(() => []);
        const revisionSummaries = await loadPageRevisionSummaries(activeSiteId, backendPages);
        if (!cancelled) {
          setPages(backendPages);
          setRouteCollections(collections);
          setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
          setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
          setRevisionSummaryMap(revisionSummaries);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load pages');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsLoadingReadiness(false);
          setIsLoadingRevisions(false);
        }
      }
    };

    void loadPages();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, setPages]);

  const publicPageUrl = (page: Page) => (
    `${publicBaseUrl}/sites/${encodeURIComponent(siteSlug)}${pagePublicPath(page)}`
  );

  const handlePreviewPage = async (page: Page) => {
    if (isPageLibraryBusy) return;

    setPreviewingPageId(page.id);
    setError(null);

    try {
      const preview = await createPagePreview(page.siteId || activeSiteId, page.id);
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to create page preview');
    } finally {
      setPreviewingPageId(null);
    }
  };

  const handlePublishPage = async (page: Page) => {
    if (isPageLibraryBusy) return;

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      const routeDiagnostic = pageRouteDiagnostics[page.id];
      if (routeDiagnostic?.status === 'conflict') {
        setError(`${page.title} is blocked: ${routeDiagnostic.message}`);
        return;
      }

      const readiness = await getPageReadiness(page.siteId || activeSiteId, page.id);
      setReadinessMap((current) => ({ ...current, [page.id]: readiness }));
      const blocker = getPublishBlocker(readiness);

      if (blocker) {
        setError(`${page.title} is blocked: ${blocker}`);
        return;
      }

      const updated = await publishPage(page.siteId || activeSiteId, page.id);
      updatePage(page.id, updated);
      void refreshPageRevisionSummary(page.siteId || activeSiteId, page.id, setRevisionSummaryMap);
      setPendingPublishPage(null);
      setNotice(`${updated.title || page.title} published.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish page');
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleArchivePage = async (page: Page) => {
    if (isPageLibraryBusy) return;

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await archivePage(page.siteId || activeSiteId, page.id);
      updatePage(page.id, updated);
      void refreshPageRevisionSummary(page.siteId || activeSiteId, page.id, setRevisionSummaryMap);
      setNotice(`${updated.title || page.title} archived.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Unable to archive page');
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleDeletePage = async (page: Page) => {
    if (isPageLibraryBusy) return;

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      await deletePageFromApi(page.siteId || activeSiteId, page.id);
      deletePage(page.id);
      setSelectedPageIds((current) => {
        const next = new Set(current);
        next.delete(page.id);
        return next;
      });
      setReadinessMap((current) => {
        const next = { ...current };
        delete next[page.id];
        return next;
      });
      setRevisionSummaryMap((current) => {
        const next = { ...current };
        delete next[page.id];
        return next;
      });
      setPendingDeletePage(null);
      setNotice(`${page.title} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete page');
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleBulkAction = async () => {
    if (isPageLibraryBusy) {
      return;
    }

    if (!bulkAction || selectedPages.length === 0) {
      return;
    }

    if (bulkAction === 'publish' && !pendingBulkPublish) {
      setPendingBulkPublish(true);
      return;
    }

    if (bulkAction === 'delete' && !pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }

    setIsBulkBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (bulkAction === 'publish') {
        const routeBlockedPages = selectedPages
          .map((page) => ({ page, route: pageRouteDiagnostics[page.id] }))
          .filter((result): result is { page: Page; route: PageRouteDiagnostic } => result.route?.status === 'conflict');

        if (routeBlockedPages.length > 0) {
          setPendingBulkPublish(false);
          setError(`${routeBlockedPages.length} selected page${routeBlockedPages.length === 1 ? ' is' : 's are'} route-blocked: ${routeBlockedPages
            .slice(0, 3)
            .map(({ page, route }) => `${page.title} - ${route.message}`)
            .join('; ')}${routeBlockedPages.length > 3 ? '; ...' : ''}`);
          return;
        }

        const readinessResults = await Promise.all(
          selectedPages.map(async (page) => ({
            page,
            readiness: await getPageReadiness(page.siteId || activeSiteId, page.id),
          })),
        );
        setReadinessMap((current) => ({
          ...current,
          ...Object.fromEntries(readinessResults.map(({ page, readiness }) => [page.id, readiness])),
        }));

        const blockedPages = readinessResults
          .map(({ page, readiness }) => ({ page, blocker: getPublishBlocker(readiness) }))
          .filter((result): result is { page: Page; blocker: string } => Boolean(result.blocker));

        if (blockedPages.length > 0) {
          setPendingBulkPublish(false);
          setError(`${blockedPages.length} selected page${blockedPages.length === 1 ? ' is' : 's are'} blocked: ${blockedPages
            .slice(0, 3)
            .map(({ page, blocker }) => `${page.title} - ${blocker}`)
            .join('; ')}${blockedPages.length > 3 ? '; ...' : ''}`);
          return;
        }

        const updatedPages = await Promise.all(
          selectedPages.map((page) => publishPage(page.siteId || activeSiteId, page.id)),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
        setPendingBulkPublish(false);
        setNotice(`${updatedPages.length} page${updatedPages.length === 1 ? '' : 's'} published.`);
      }

      if (bulkAction === 'archive') {
        const updatedPages = await Promise.all(
          selectedPages.map((page) => archivePage(page.siteId || activeSiteId, page.id)),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
        setNotice(`${updatedPages.length} page${updatedPages.length === 1 ? '' : 's'} archived.`);
      }

      if (bulkAction === 'delete') {
        await Promise.all(
          selectedPages.map((page) => deletePageFromApi(page.siteId || activeSiteId, page.id)),
        );
        const deletedCount = selectedPages.length;
        selectedPages.forEach((page) => deletePage(page.id));
        setPendingBulkDelete(false);
        setNotice(`${deletedCount} page${deletedCount === 1 ? '' : 's'} deleted.`);
      }

      setSelectedPageIds(new Set());
      setBulkAction('');
      setPendingBulkPublish(false);
      await refreshPages(activeSiteId);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to apply bulk action');
    } finally {
      setIsBulkBusy(false);
    }
  };

  const columns: Column<Page>[] = [
    {
      key: 'id',
      label: 'Select',
      render: (page) => (
        <input
          type="checkbox"
          aria-label={`Select ${page.title}`}
          checked={selectedPageIds.has(page.id)}
          disabled={isPageLibraryBusy}
          onChange={() => togglePageSelection(page.id)}
          className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )
    },
    {
      key: 'title',
      label: 'Page Title',
      sortable: true,
      render: (page) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {page.slug === 'home' || page.slug === '' ? (
              <Home className="w-5 h-5 text-primary" />
            ) : (
              <Layout className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <div className="font-medium text-foreground">{page.title}</div>
            <div className="text-xs text-muted-foreground">{pagePublicPath(page)}</div>
          </div>
        </div>
      )
    },
    {
      key: 'slug',
      label: 'Route',
      render: (page) => (
        <PageRouteCell
          page={page}
          diagnostic={pageRouteDiagnostics[page.id]}
        />
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (page) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={page.status} />
          {page.scheduledAt && (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {formatDate(page.scheduledAt)}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'parentId',
      label: 'Hierarchy',
      render: (page) => (
        <PageHierarchyCell
          page={page}
          parentPage={page.parentId ? activeSitePageMap.get(page.parentId) || null : null}
          childCount={pageChildCountMap.get(page.id) || 0}
        />
      )
    },
    {
      key: 'meta',
      label: 'Health',
      render: (page) => {
        const readiness = readinessMap[page.id];
        const firstIssue = readiness?.checks.find((check) => check.status !== 'pass');
        return readiness ? (
          <div className="flex flex-col gap-1">
            <StatusBadge
              status={readiness.statusLabel}
              type={readiness.statusLabel === 'ready' ? 'success' : readiness.statusLabel === 'blocked' ? 'error' : 'warning'}
            />
            <span className="text-xs text-muted-foreground">{readiness.score}% ready · {readiness.elementCount} elements</span>
            {firstIssue && (
              <span className="max-w-64 truncate text-xs text-muted-foreground" title={firstIssue.message}>
                {firstIssue.message}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isLoadingReadiness ? 'Checking...' : 'Not checked'}
          </span>
        );
      }
    },
    {
      key: 'content',
      label: 'Revisions',
      render: (page) => (
        <PageRevisionCell
          page={page}
          summary={revisionSummaryMap[page.id]}
          isLoading={isLoadingRevisions}
          activeSiteId={activeSiteId}
        />
      )
    },
    {
      key: 'siteId',
      label: 'Delivery',
      render: (page) => {
        const pageSiteId = page.siteId || activeSiteId;
        const pagePath = pagePublicPath(page);
        const encodedSiteId = encodeURIComponent(pageSiteId);
        const encodedPath = encodeURIComponent(pagePath);
        const encodedPageId = encodeURIComponent(page.id);

        return (
          <PageDeliveryCell
            page={page}
            status={getPageDeliveryStatus(page, readinessMap[page.id], pageRouteDiagnostics[page.id])}
            routeDiagnostic={pageRouteDiagnostics[page.id]}
            publicUrl={publicPageUrl(page)}
            renderUrl={`${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`}
            resolveUrl={`${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`}
            previewEndpoint={`${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}/preview`}
          />
        );
      }
    },
    {
      key: 'lastUpdated',
      label: 'Last Updated',
      sortable: true,
      render: (page) => <span className="text-muted-foreground">{formatDate(page.lastUpdated)}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (page) => {
        const readiness = readinessMap[page.id];
        const publishBlocker = readiness ? getPublishBlocker(readiness) : null;
        const routeBlocker = pageRouteDiagnostics[page.id]?.status === 'conflict'
          ? pageRouteDiagnostics[page.id]?.message
          : null;

        return (
          <div className="flex items-center justify-end gap-2">
            {page.status !== 'published' && (
              <button
                onClick={() => {
                  if (isPageLibraryBusy) return;
                  setPendingPublishPage(page);
                }}
                disabled={isPageLibraryBusy || Boolean(routeBlocker || publishBlocker)}
                title={routeBlocker ? `Resolve route before publishing: ${routeBlocker}` : publishBlocker ? `Resolve before publishing: ${publishBlocker}` : 'Publish page'}
                data-testid={`pages-publish-${page.id}`}
                className="p-2 text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            {page.status !== 'archived' && (
              <button
                onClick={() => {
                  void handleArchivePage(page);
                }}
                disabled={isPageLibraryBusy}
                title="Archive page"
                className="p-2 text-muted-foreground hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}
            {page.status === 'published' && (
              <a
                href={publicPageUrl(page)}
                target="_blank"
                rel="noreferrer"
                title="Open published page"
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => {
                void handlePreviewPage(page);
              }}
              disabled={isPageLibraryBusy}
              title="Preview page"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate({ to: '/pages/$pageId/edit', params: { pageId: page.id }, search: { siteId: activeSiteId } })}
              disabled={isPageMutationBusy}
              title="Edit page"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (isPageLibraryBusy) return;
                setPendingDeletePage(page);
              }}
              disabled={isPageLibraryBusy}
              title="Delete page"
              className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    }
  ];

  const {
    data,
    searchQuery,
    setSearchQuery,
    sortConfig,
    setSortConfig,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    filteredData: filteredPages,
  } = useDataTable({
    data: visiblePages,
    columns,
    initialSearch: routeSearch.q || '',
    initialPage: routeSearch.page || 1,
    initialSort: {
      key: routeSearch.sortBy || 'lastUpdated',
      direction: routeSearch.sortDirection || 'desc',
    },
    pageSize: 10
  });
  const pagesRouteSearch = useMemo<PagesSearch>(() => ({
    siteId: activeSiteId,
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(healthFilter !== 'all' ? { health: healthFilter } : {}),
    ...(currentPage > 1 ? { page: currentPage } : {}),
    ...(sortConfig.key !== 'lastUpdated' ? { sortBy: sortConfig.key as PageSortKey } : {}),
    ...(sortConfig.direction !== 'desc' ? { sortDirection: sortConfig.direction } : {}),
  }), [activeSiteId, currentPage, healthFilter, searchQuery, sortConfig.direction, sortConfig.key, statusFilter]);
  const updatePagesRouteSearch = (next: PagesSearch) => {
    const merged: PagesSearch = {
      ...pagesRouteSearch,
      ...next,
    };
    const normalized: PagesSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
      ...(merged.status && merged.status !== 'all' ? { status: merged.status } : {}),
      ...(merged.health && merged.health !== 'all' ? { health: merged.health } : {}),
      ...(merged.page && merged.page > 1 ? { page: merged.page } : {}),
      ...(merged.sortBy && merged.sortBy !== 'lastUpdated' ? { sortBy: merged.sortBy } : {}),
      ...(merged.sortDirection && merged.sortDirection !== 'desc' ? { sortDirection: merged.sortDirection } : {}),
    };

    navigate({ to: '/pages', search: normalized, replace: true });
  };
  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
      setSelectedPageIds(new Set());
    }

    setStatusFilter(routeSearch.status || 'all');
    setHealthFilter(routeSearch.health || 'all');
    setSearchQuery(routeSearch.q || '');
    setCurrentPage(routeSearch.page || 1);
    setSortConfig({
      key: routeSearch.sortBy || 'lastUpdated',
      direction: routeSearch.sortDirection || 'desc',
    });
  }, [
    routeSearch.health,
    routeSearch.page,
    routeSearch.q,
    routeSearch.siteId,
    routeSearch.sortBy,
    routeSearch.sortDirection,
    routeSearch.status,
    selectedSiteId,
    setCurrentPage,
    setSearchQuery,
    setSortConfig,
    sites,
  ]);
  const hasPages = activeSitePages.length > 0;
  const selectedTablePages = data.filter((page) => selectedPageIds.has(page.id));
  const visiblePageIdSet = useMemo(() => new Set(data.map((page) => page.id)), [data]);
  const hiddenSelectedCount = Math.max(0, selectedPages.length - selectedTablePages.length);
  const selectedKnownPublishBlockers = useMemo(
    () => selectedPages
      .map((page) => {
        const routeDiagnostic = pageRouteDiagnostics[page.id];
        if (routeDiagnostic?.status === 'conflict') {
          return { page, blocker: routeDiagnostic.message };
        }

        const readiness = readinessMap[page.id];
        return readiness ? { page, blocker: getPublishBlocker(readiness) } : null;
      })
      .filter((result): result is { page: Page; blocker: string } => Boolean(result?.blocker)),
    [pageRouteDiagnostics, readinessMap, selectedPages],
  );
  const bulkActionLabel = getBulkActionLabel(bulkAction, selectedPages.length, pendingBulkDelete, pendingBulkPublish);
  const bulkBusyLabel = getBulkBusyLabel(bulkAction);
  const pageHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: siteSlug,
    },
    endpoints: {
      publicPages: publicPagesUrl,
      publicPageBySlug: publicPageBySlugUrl,
      publicRenderByPath: publicRenderUrl,
      publicResolveByPath: publicResolveUrl,
      adminPages: adminPagesUrl,
      adminPageDetail: adminPageDetailUrl,
      adminPageReadiness: adminPageReadinessUrl,
      adminPagePreview: adminPagePreviewUrl,
    },
    controlRoutes: {
      sites: '/sites',
      media: '/media',
      forms: '/forms',
      products: '/products',
      blog: '/blog',
      settings: '/settings',
      blankPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}`,
      contactPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=contact`,
      registrationPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=registration`,
      storefrontPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=storefront`,
      blogIndexPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=blog-index`,
    },
    export: {
      format: 'csv',
      columns: PAGE_EXPORT_COLUMNS,
      filteredRows: filteredPages.length,
    },
    builderSystems: PAGE_BUILDER_SYSTEMS,
    readiness: {
      score: pageDesignReadiness.score,
      checks: pageDesignReadiness.checks,
    },
    metrics: pageMetrics,
    filters: {
      search: searchQuery,
      status: statusFilter,
      library: healthFilter,
      selected: selectedPages.length,
      visible: data.length,
      currentPage,
      totalPages,
      totalItems,
    },
    pages: filteredPages.map((page) => {
      const revisionSummary = revisionSummaryMap[page.id];
      const latestRevision = revisionSummary?.latest || null;
      const routeDiagnostic = pageRouteDiagnostics[page.id];
      const pageSiteId = page.siteId || activeSiteId;
      const pagePath = pagePublicPath(page);
      const encodedSiteId = encodeURIComponent(pageSiteId);
      const encodedPath = encodeURIComponent(pagePath);
      const encodedPageId = encodeURIComponent(page.id);

      return {
        id: page.id,
        title: page.title,
        slug: page.slug,
        path: pagePath,
        status: page.status,
        isHomepage: Boolean(page.isHomepage),
        route: {
          path: routeDiagnostic?.path || pagePath,
          status: routeDiagnostic?.status || 'available',
          message: routeDiagnostic?.message || 'Route is available.',
          conflictIds: routeDiagnostic?.conflictIds || [],
        },
        delivery: {
          status: getPageDeliveryStatus(page, readinessMap[page.id], routeDiagnostic),
          publicUrl: page.status === 'published' ? publicPageUrl(page) : null,
          renderUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`,
          resolveUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`,
          previewEndpoint: `${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}/preview`,
        },
        hierarchy: {
          parentId: page.parentId || null,
          parentTitle: getParentPageTitle(page, activeSitePageMap) || null,
          childCount: pageChildCountMap.get(page.id) || 0,
        },
        navigation: {
          placement: pageMetaString(page, 'navigationPlacement') || null,
          label: pageMetaString(page, 'navigationLabel') || null,
        },
        revisions: {
          count: revisionSummary?.count ?? 0,
          latest: latestRevision
            ? {
                id: latestRevision.id,
                note: latestRevision.note,
                createdAt: latestRevision.createdAt,
                status: latestRevision.snapshotStatus,
              }
            : null,
        },
        health: readinessMap[page.id]
          ? {
              score: readinessMap[page.id].score,
              statusLabel: readinessMap[page.id].statusLabel,
              elementCount: readinessMap[page.id].elementCount,
            }
          : null,
        publicUrl: page.status === 'published' ? publicPageUrl(page) : null,
      };
    }),
    selectedPage: apiPage
      ? {
          id: apiPage.id,
          title: apiPage.title,
          slug: apiPage.slug,
          path: pagePublicPath(apiPage),
          status: apiPage.status,
        }
      : null,
    workflows: pageDesignReadiness.workflow,
    guardrails: [
      'Use the visual editor for canvas, section, grouping, media, and publish changes.',
      'Run readiness before handing a page to a custom frontend.',
      'Archive a page instead of deleting when URL history, SEO, or ownership matters.',
      'The create entry points all route to /pages/new with the active siteId search parameter.',
    ],
  }), [
    activeSite?.name,
    activeSiteId,
    adminPageDetailUrl,
    adminPagePreviewUrl,
    adminPageReadinessUrl,
    adminPagesUrl,
    apiPage,
    currentPage,
    data,
    healthFilter,
    pageDesignReadiness.checks,
    pageDesignReadiness.score,
    pageDesignReadiness.workflow,
    pageMetrics,
    pageChildCountMap,
    pageRouteDiagnostics,
    filteredPages,
    publicPageBySlugUrl,
    publicPagesUrl,
    publicRenderUrl,
    publicResolveUrl,
    readinessMap,
    revisionSummaryMap,
    searchQuery,
    selectedPages.length,
    siteSlug,
    statusFilter,
    activeSitePageMap,
    totalItems,
    totalPages,
  ]);
  const pageHandoffText = useMemo(() => JSON.stringify(pageHandoff, null, 2), [pageHandoff]);

  const clearPageFilters = () => {
    if (isPageLibraryBusy) return;

    setSearchQuery('');
    setStatusFilter('all');
    setHealthFilter('all');
    setCurrentPage(1);
    updatePagesRouteSearch({ q: undefined, status: 'all', health: 'all', page: undefined });
  };

  const downloadPageHandoff = () => {
    if (isPageLibraryBusy) return;

    const blob = new Blob([pageHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteSlug || activeSiteId}-backy-pages-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Pages handoff manifest downloaded.');
  };
  return (
    <PageShell
      title="Pages"
      description="Manage the structure and content of your site."
      action={
        <Link
          to="/pages/new"
          search={createPageSearch}
          aria-disabled={isPageLibraryBusy}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors',
            isPageLibraryBusy && 'pointer-events-none opacity-60',
          )}
          aria-label="Create new page for active site"
          data-testid="pages-header-create"
        >
          <Plus className="w-4 h-4" />
          New Page
        </Link>
      }
      className="w-full"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading pages from backend...
        </div>
      )}

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="pages-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Pages command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                pageDesignReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {pageDesignReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control the site page library, visual editor entry points, publish readiness, public render APIs, preview links, and bulk page operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyPageApiText(pageHandoffText, 'Pages handoff manifest')}
              disabled={isPageLibraryBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="size-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadPageHandoff}
              disabled={isPageLibraryBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={downloadPagesCsv}
              disabled={filteredPages.length === 0 || isPageLibraryBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void refreshPages(activeSiteId)}
              disabled={isPageLibraryBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
              Refresh pages
            </button>
            <Link
              to="/pages/new"
              search={createPageSearch}
              aria-disabled={isPageLibraryBusy}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
                isPageLibraryBusy && 'pointer-events-none opacity-60',
              )}
              data-testid="pages-command-create"
            >
              <Plus className="size-4" />
              New Page
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Page library readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks page presence, homepage route, canvas content, public delivery, readiness coverage, and publish blockers.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', pageDesignReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${pageDesignReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pageDesignReadiness.checks.map((check) => (
                <PageReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Layout className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Page workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {pageDesignReadiness.workflow.map((step, index) => (
                <PageWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Pages control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, page health, frontend APIs, library controls, and page records.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {PAGES_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                aria-disabled={isPageLibraryBusy}
                onClick={(event) => {
                  if (isPageLibraryBusy) event.preventDefault();
                }}
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                  isPageLibraryBusy && 'pointer-events-none opacity-60',
                )}
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Create a page for this site</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Every starter opens the same visual editor, keeps the active site context, and seeds the canvas only when that helps the user move faster.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {activeSite?.name || activeSiteId}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {PAGE_CREATION_SHORTCUTS.map((shortcut) => {
              const ShortcutIcon = shortcut.icon;

              return (
                <Link
                  key={shortcut.key}
                  to="/pages/new"
                  search={getCreatePageSearch(shortcut.key)}
                  aria-disabled={isPageLibraryBusy}
                  className={cn(
                    'group min-h-32 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring',
                    isPageLibraryBusy && 'pointer-events-none opacity-60',
                  )}
                  data-testid={`pages-create-${shortcut.key}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <ShortcutIcon className="size-4" />
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {shortcut.badge}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">{shortcut.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{shortcut.detail}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Layout className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Connected page workflows</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Page design is the shared surface where site navigation, media, forms, commerce, blog feeds, runtime settings, and public APIs meet.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {PAGE_WORKFLOW_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            {PAGE_WORKFLOW_SURFACES.map((surface) => (
              <Link
                key={surface.key}
                to={surface.route}
                search={surface.route === '/settings' ? undefined : { siteId: activeSiteId }}
                aria-disabled={isPageLibraryBusy}
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                  isPageLibraryBusy && 'pointer-events-none opacity-60',
                )}
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div id="pages-health" className="grid gap-3 scroll-mt-24 md:grid-cols-5">
          {[
            { label: 'All', value: pageMetrics.total, onSelect: () => setPageStatusFilter('all'), active: statusFilter === 'all' && healthFilter === 'all' },
            { label: 'Published', value: pageMetrics.published, onSelect: () => setPageStatusFilter('published'), active: statusFilter === 'published' && healthFilter === 'all' },
            { label: 'Draft', value: pageMetrics.draft, onSelect: () => setPageStatusFilter('draft'), active: statusFilter === 'draft' && healthFilter === 'all' },
            { label: 'Blocked', value: pageMetrics.blocked, onSelect: showBlockedPages, active: healthFilter === 'blocked' },
            { label: 'Routes', value: pageMetrics.routeConflicts, onSelect: showRouteConflicts, active: healthFilter === 'route-conflicts' },
          ].map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={metric.onSelect}
              disabled={isPageLibraryBusy}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
                metric.active && 'border-primary bg-primary/5',
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
              <div className="mt-1 font-mono text-2xl font-semibold">{metric.value}</div>
            </button>
          ))}
        </div>
        <div id="pages-site" className="rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
          <label htmlFor="pages-active-site" className="text-xs font-medium text-muted-foreground">
            Active Site
          </label>
          <select
            id="pages-active-site"
            value={activeSiteId}
            disabled={isPageLibraryBusy}
            onChange={(event) => {
              if (isPageLibraryBusy) return;
              const nextSiteId = event.target.value;
              setSelectedSiteId(nextSiteId);
              setStatusFilter('all');
              setHealthFilter('all');
              setSearchQuery('');
              setCurrentPage(1);
              setSelectedPageIds(new Set());
              navigate({ to: '/pages', search: { siteId: nextSiteId }, replace: true });
            }}
            className="mt-2 w-full min-w-52 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section id="pages-api" className="mb-6 rounded-lg border border-border bg-card scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Page API contract</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Public page, route, and render endpoints plus admin endpoints for editor saves, previews, readiness, and publishing workflows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyPageApiText(publicPagesUrl, 'Pages API URL')}
              disabled={isPageLibraryBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Copy pages API URL"
            >
              <Copy className="h-4 w-4" />
              Copy pages API
            </button>
            <button
              type="button"
              onClick={() => void copyPageApiText(pageHandoffText, 'Pages handoff manifest')}
              disabled={isPageLibraryBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Copy pages handoff manifest"
            >
              <Copy className="h-4 w-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadPagesCsv}
              disabled={filteredPages.length === 0 || isPageLibraryBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Export filtered pages CSV"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <PageApiStat label="Active site" value={activeSite?.name || activeSiteId} />
            <PageApiStat label="Public pages" value={`${pageMetrics.published}`} />
            <PageApiStat label="API page" value={apiPage?.title || 'No page'} />
            <PageApiStat label="Blocked" value={`${pageMetrics.blocked}`} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Page design readiness</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Checks whether this site has pages, a homepage, visual canvas content, public delivery, readiness coverage, and no publish blockers.
                  </p>
                </div>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  pageDesignReadiness.score >= 80
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700',
                )}
                >
                  {pageDesignReadiness.score}% ready
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    pageDesignReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                  style={{ width: `${pageDesignReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {pageDesignReadiness.checks.map((check) => (
                  <PageReadinessCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Editor to frontend workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {pageDesignReadiness.workflow.map((step, index) => (
                  <PageWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <PageApiSnippet label="Public pages" value={publicPagesUrl} />
            <PageApiSnippet label="Public page by slug" value={publicPageBySlugUrl} />
            <PageApiSnippet label="Render by path" value={publicRenderUrl} />
            <PageApiSnippet label="Resolve by path" value={publicResolveUrl} />
            <PageApiSnippet label="Admin pages" value={adminPagesUrl} />
            <PageApiSnippet label="Admin page detail" value={adminPageDetailUrl} />
            <PageApiSnippet label="Readiness check" value={adminPageReadinessUrl} />
            <PageApiSnippet label="Preview link" value={adminPagePreviewUrl} />
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Visual builder control contract</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Backy pages need these controls to support Wix-style design freedom while still shipping clean APIs to any frontend.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {PAGE_BUILDER_SYSTEMS.length} systems
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {PAGE_BUILDER_SYSTEMS.map((system) => (
                <div key={system.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{system.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {system.key}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {hasPages && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">
            {selectedPages.length} selected{hiddenSelectedCount > 0 ? `, ${hiddenSelectedCount} not visible` : ''}
          </span>
          <button
            type="button"
            onClick={() => setPageSelection(data, selectedTablePages.length !== data.length)}
            disabled={data.length === 0 || isPageLibraryBusy}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedTablePages.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          <select
            value={bulkAction}
            disabled={isPageLibraryBusy}
            onChange={(event) => {
              if (isPageLibraryBusy) return;
              setBulkAction(event.target.value as typeof bulkAction);
              setPendingBulkPublish(false);
              setPendingBulkDelete(false);
            }}
            className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Bulk action...</option>
            <option value="publish">Publish selected</option>
            <option value="archive">Archive selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <button
            type="button"
            onClick={() => void handleBulkAction()}
            disabled={!bulkAction || selectedPages.length === 0 || isPageLibraryBusy || (bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0)}
            title={bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0
              ? 'Resolve selected page blockers before publishing.'
              : 'Apply selected bulk action'}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              bulkAction === 'delete'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isBulkBusy ? bulkBusyLabel : bulkActionLabel}
          </button>
          {selectedPages.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPageIds(new Set())}
              disabled={isPageLibraryBusy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear selection
            </button>
          )}
          {hiddenSelectedCount > 0 && (
            <div className="flex min-w-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                Bulk actions will include {hiddenSelectedCount} selected page{hiddenSelectedCount === 1 ? '' : 's'} outside the current table view.
              </span>
              <button
                type="button"
                onClick={() => setSelectedPageIds((current) => new Set([...current].filter((pageId) => visiblePageIdSet.has(pageId))))}
                disabled={isPageLibraryBusy}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear non-visible
              </button>
            </div>
          )}
          {bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0 && (
            <div className="flex min-w-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                {selectedKnownPublishBlockers.length} selected page{selectedKnownPublishBlockers.length === 1 ? ' is' : 's are'} blocked. {selectedKnownPublishBlockers
                  .slice(0, 2)
                  .map(({ page, blocker }) => `${page.title}: ${blocker}`)
                  .join('; ')}
                {selectedKnownPublishBlockers.length > 2 ? '; ...' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <div id="pages-filters" className="flex flex-wrap items-center gap-3 mb-6 scroll-mt-24">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            disabled={isPageLibraryBusy}
            onChange={(event) => {
              if (isPageLibraryBusy) return;
              const q = event.target.value;
              setSearchQuery(q);
              setCurrentPage(1);
              updatePagesRouteSearch({ q: q || undefined, page: undefined });
            }}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Filter className="ml-2 size-4 text-muted-foreground" />
          {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setPageStatusFilter(status)}
              disabled={isPageLibraryBusy}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                statusFilter === status && healthFilter === 'all' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter pages by library readiness"
          value={healthFilter}
          disabled={isPageLibraryBusy}
          onChange={(event) => {
            if (isPageLibraryBusy) return;
            const health = event.target.value as PageLibraryFilter;
            setHealthFilter(health);
            setCurrentPage(1);
            updatePagesRouteSearch({ health, page: undefined });
          }}
          className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="all">All library states</option>
          <option value="ready">Ready pages</option>
          <option value="needs-attention">Needs attention</option>
          <option value="blocked">Blocked pages</option>
          <option value="route-conflicts">Route conflicts</option>
          <option value="homepage">Homepage route</option>
          <option value="scheduled">Scheduled pages</option>
          <option value="has-canvas">Has canvas content</option>
          <option value="empty-canvas">Empty canvas</option>
          <option value="not-checked">Not checked</option>
        </select>
        <button
          type="button"
          onClick={() => void refreshPages(activeSiteId)}
          disabled={isPageLibraryBusy}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Refresh pages"
        >
          Refresh
        </button>
        {(searchQuery || statusFilter !== 'all' || healthFilter !== 'all') && (
          <button
            type="button"
            onClick={clearPageFilters}
            disabled={isPageLibraryBusy}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear filters
          </button>
        )}
      </div>

      <div id="pages-library" className="scroll-mt-24">
        <DataGrid
          columns={columns}
          data={data}
          loading={isLoading}
          interactionDisabled={isPageLibraryBusy}
          sortConfig={sortConfig}
          onSort={(key) => {
            if (isPageLibraryBusy) return;
            const sortBy = key as PageSortKey;
            const sortDirection = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
            handleSort(key);
            setCurrentPage(1);
            updatePagesRouteSearch({ sortBy, sortDirection, page: undefined });
          }}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={10}
          onPageChange={(page) => {
            if (isPageLibraryBusy) return;
            setCurrentPage(page);
            updatePagesRouteSearch({ page });
          }}
          totalItems={totalItems}
          emptyState={
            <EmptyState
              icon={Layout}
              title={hasPages ? 'No matching pages' : 'No pages yet'}
              description={
                hasPages
                  ? 'No pages match the current search or status filter.'
                  : 'Create the first page for this site, then open it in the visual editor.'
              }
              action={
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {hasPages && (
                    <button
                      type="button"
                      onClick={clearPageFilters}
                      disabled={isPageLibraryBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear Filters
                    </button>
                  )}
                  <Link
                    to="/pages/new"
                    search={createPageSearch}
                    aria-disabled={isPageLibraryBusy}
                    data-testid="pages-empty-create"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90',
                      isPageLibraryBusy && 'pointer-events-none opacity-60',
                    )}
                    aria-label={hasPages ? 'Create page after clearing filters' : 'Create first page for active site'}
                  >
                    <Plus className="w-4 h-4" />
                    {hasPages ? 'New Page' : 'Create First Page'}
                  </Link>
                  {!hasPages && (
                    <div className="mt-3 grid w-full max-w-3xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {PAGE_CREATION_SHORTCUTS.map((shortcut) => {
                        const ShortcutIcon = shortcut.icon;

                        return (
                          <Link
                            key={shortcut.key}
                            to="/pages/new"
                            search={getCreatePageSearch(shortcut.key)}
                            aria-disabled={isPageLibraryBusy}
                            className={cn(
                              'rounded-lg border border-border bg-background px-3 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring',
                              isPageLibraryBusy && 'pointer-events-none opacity-60',
                            )}
                            data-testid={`pages-empty-create-${shortcut.key}`}
                            aria-label={`Create ${shortcut.title.toLowerCase()} for active site`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <ShortcutIcon className="size-4" />
                              </span>
                              <span className="text-sm font-semibold text-foreground">{shortcut.title}</span>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-muted-foreground">{shortcut.detail}</div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
            />
          }
        />
      </div>

      {pendingPublishPage && (() => {
        const pageSiteId = pendingPublishPage.siteId || activeSiteId;
        const pagePath = pagePublicPath(pendingPublishPage);
        const encodedSiteId = encodeURIComponent(pageSiteId);
        const encodedPath = encodeURIComponent(pagePath);
        const encodedPageId = encodeURIComponent(pendingPublishPage.id);
        const routeDiagnostic = pageRouteDiagnostics[pendingPublishPage.id];
        const readiness = readinessMap[pendingPublishPage.id];
        const deliveryStatus = getPagePublishDeliveryStatus(pendingPublishPage, readiness, routeDiagnostic);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="pages-publish-modal">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">Publish {pendingPublishPage.title}?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review the route, readiness, and frontend delivery endpoints before this page becomes public.
                  </p>
                </div>
              </div>

              <PagePublishReviewDetails
                page={pendingPublishPage}
                readiness={readiness}
                routeDiagnostic={routeDiagnostic}
                deliveryStatus={deliveryStatus}
                publicUrl={publicPageUrl(pendingPublishPage)}
                renderUrl={`${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`}
                resolveUrl={`${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`}
                previewEndpoint={`${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}/preview`}
              />

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handlePreviewPage(pendingPublishPage);
                  }}
                  disabled={isPageLibraryBusy}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Preview first
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPublishPage(null)}
                  disabled={isPageLibraryBusy}
                  data-testid="pages-publish-cancel"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublishPage(pendingPublishPage)}
                  disabled={isPageLibraryBusy || deliveryStatus === 'blocked'}
                  data-testid="pages-publish-confirm"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutatingPageId === pendingPublishPage.id ? 'Publishing...' : 'Publish page'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingBulkPublish && selectedPages.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="pages-bulk-publish-modal">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  Publish {selectedPages.length} selected page{selectedPages.length === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Backy will run readiness again before publishing and skip the publish if a selected page becomes blocked.
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-auto rounded-lg border border-border bg-background p-3">
              {selectedPages.slice(0, 8).map((page) => {
                const routeDiagnostic = pageRouteDiagnostics[page.id];
                const readiness = readinessMap[page.id];
                const deliveryStatus = getPagePublishDeliveryStatus(page, readiness, routeDiagnostic);

                return (
                  <div key={page.id} className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{page.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">{pagePublicPath(page)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={deliveryStatus} type={deliveryStatus === 'blocked' ? 'error' : deliveryStatus === 'published' ? 'success' : 'warning'} />
                      {readiness && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {readiness.score}% ready
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedPages.length > 8 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {selectedPages.length - 8} more selected page{selectedPages.length - 8 === 1 ? '' : 's'} will be included.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkPublish(false)}
                disabled={isPageLibraryBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isPageLibraryBusy}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Publishing...' : `Publish ${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDeletePage.title}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the page from the backend and the public API. Archive it instead if you only want to hide it.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Route: <span className="font-medium text-foreground">{pagePublicPath(pendingDeletePage)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeletePage(null)}
                disabled={isPageLibraryBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePage(pendingDeletePage)}
                disabled={isPageLibraryBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutatingPageId === pendingDeletePage.id ? 'Deleting...' : 'Delete page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Delete {selectedPages.length} selected page{selectedPages.length === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected pages will be removed from the site and from frontend API delivery.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                disabled={isPageLibraryBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isPageLibraryBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Deleting...' : 'Delete pages'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageHierarchyCell({ page, parentPage, childCount }: { page: Page; parentPage: Page | null; childCount: number }) {
  const navigationPlacement = pageMetaString(page, 'navigationPlacement');
  const navigationLabel = pageMetaString(page, 'navigationLabel');

  return (
    <div className="min-w-48 space-y-1" data-testid={`pages-hierarchy-${page.id}`}>
      {parentPage ? (
        <div>
          <div className="text-sm font-medium text-foreground">Nested under {parentPage.title}</div>
          <div className="text-xs text-muted-foreground">{pagePublicPath(parentPage)} parent route</div>
        </div>
      ) : page.parentId ? (
        <div>
          <div className="text-sm font-medium text-amber-800">Parent not loaded</div>
          <div className="font-mono text-xs text-muted-foreground">{page.parentId}</div>
        </div>
      ) : (
        <div>
          <div className="text-sm font-medium text-foreground">Top-level page</div>
          <div className="text-xs text-muted-foreground">
            {childCount === 0 ? 'No child pages' : `${childCount} child page${childCount === 1 ? '' : 's'}`}
          </div>
        </div>
      )}

      {(navigationPlacement || navigationLabel) && (
        <div className="flex flex-wrap items-center gap-1">
          {navigationPlacement && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
              {navigationPlacement} menu
            </span>
          )}
          {navigationLabel && (
            <span className="max-w-40 truncate rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground" title={navigationLabel}>
              {navigationLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PageRouteCell({ page, diagnostic }: { page: Page; diagnostic: PageRouteDiagnostic | undefined }) {
  const route = diagnostic || {
    path: pagePublicPath(page),
    status: 'available' as const,
    message: 'Route is available.',
    conflictIds: [],
  };
  const statusType = route.status === 'conflict' ? 'error' : route.status === 'warning' ? 'warning' : 'success';

  return (
    <div className="min-w-52 space-y-1" data-testid={`pages-route-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
          {route.path}
        </code>
        <StatusBadge
          status={route.status === 'available' ? 'available' : route.status === 'warning' ? 'review' : 'conflict'}
          type={statusType}
        />
      </div>
      <div className={cn(
        'text-xs leading-5',
        route.status === 'conflict' ? 'text-destructive' : 'text-muted-foreground',
      )}
      >
        {route.message}
      </div>
    </div>
  );
}

function PageRevisionCell({
  page,
  summary,
  isLoading,
  activeSiteId,
}: {
  page: Page;
  summary: ContentRevisionSummary | undefined;
  isLoading: boolean;
  activeSiteId: string;
}) {
  if (isLoading && !summary) {
    return <span className="text-xs text-muted-foreground">Checking revisions...</span>;
  }

  const count = summary?.count ?? 0;
  const latest = summary?.latest ?? null;

  return (
    <div className="min-w-48 space-y-1" data-testid={`pages-revisions-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-semibold',
          count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
        >
          {count} revision{count === 1 ? '' : 's'}
        </span>
        <Link
          to="/pages/$pageId/edit"
          params={{ pageId: page.id }}
          search={{ siteId: activeSiteId }}
          hash="page-editor-revisions"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open history
        </Link>
      </div>
      {latest ? (
        <div className="text-xs leading-5 text-muted-foreground">
          <span className="block max-w-56 truncate" title={latest.note || 'Revision snapshot'}>
            {latest.note || 'Revision snapshot'}
          </span>
          <span>{formatDate(latest.createdAt)} · {latest.snapshotStatus}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No saved snapshots yet.</div>
      )}
    </div>
  );
}

function PageDeliveryCell({
  page,
  status,
  routeDiagnostic,
  publicUrl,
  renderUrl,
  resolveUrl,
  previewEndpoint,
}: {
  page: Page;
  status: PageDeliveryStatus;
  routeDiagnostic: PageRouteDiagnostic | undefined;
  publicUrl: string;
  renderUrl: string;
  resolveUrl: string;
  previewEndpoint: string;
}) {
  const labelByStatus: Record<PageDeliveryStatus, string> = {
    published: 'Published URL live',
    'preview-only': 'Preview only',
    scheduled: 'Scheduled',
    archived: 'Archived',
    blocked: 'Blocked',
  };
  const detailByStatus: Record<PageDeliveryStatus, string> = {
    published: 'Hosted page, render API, and resolve API are ready.',
    'preview-only': 'Use preview tokens until this page is published.',
    scheduled: page.scheduledAt ? `Public after ${formatDate(page.scheduledAt)}.` : 'Publish date is required.',
    archived: 'Hidden from public delivery until restored.',
    blocked: routeDiagnostic?.message || 'Resolve blockers before delivery.',
  };
  const badgeType = status === 'published'
    ? 'success'
    : status === 'blocked'
      ? 'error'
      : status === 'archived'
        ? 'neutral'
        : 'warning';

  return (
    <div className="min-w-60 space-y-2" data-testid={`pages-delivery-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={labelByStatus[status]} type={badgeType} />
      </div>
      <div className={cn(
        'text-xs leading-5',
        status === 'blocked' ? 'text-destructive' : 'text-muted-foreground',
      )}
      >
        {detailByStatus[status]}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {page.status === 'published' && status !== 'blocked' && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            Public
          </a>
        )}
        <a href={renderUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Render
        </a>
        <a href={resolveUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Resolve
        </a>
        <code className="max-w-48 truncate rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground" title={previewEndpoint}>
          preview POST
        </code>
      </div>
    </div>
  );
}

function PagePublishReviewDetails({
  page,
  readiness,
  routeDiagnostic,
  deliveryStatus,
  publicUrl,
  renderUrl,
  resolveUrl,
  previewEndpoint,
}: {
  page: Page;
  readiness: PageReadiness | undefined;
  routeDiagnostic: PageRouteDiagnostic | undefined;
  deliveryStatus: PageDeliveryStatus;
  publicUrl: string;
  renderUrl: string;
  resolveUrl: string;
  previewEndpoint: string;
}) {
  const routeStatus = routeDiagnostic?.status || 'available';
  const routeMessage = routeDiagnostic?.message || 'Route is available.';

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs font-medium text-muted-foreground">Public route</div>
        <div className="mt-1 font-mono text-sm font-semibold text-foreground">{pagePublicPath(page)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={routeStatus} type={routeStatus === 'conflict' ? 'error' : routeStatus === 'warning' ? 'warning' : 'success'} />
          <span className="text-xs text-muted-foreground">{routeMessage}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs font-medium text-muted-foreground">Readiness</div>
        {readiness ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={readiness.statusLabel}
                type={readiness.statusLabel === 'ready' ? 'success' : readiness.statusLabel === 'blocked' ? 'error' : 'warning'}
              />
              <span className="font-mono text-sm font-semibold text-foreground">{readiness.score}%</span>
              <span className="text-xs text-muted-foreground">{readiness.elementCount} elements</span>
            </div>
            {readiness.checks.find((check) => check.status !== 'pass') && (
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {readiness.checks.find((check) => check.status !== 'pass')?.message}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-sm text-muted-foreground">Readiness will run again before publish.</div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-3 md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Delivery after publish</div>
            <div className="mt-1 text-sm text-foreground">
              {deliveryStatus === 'blocked'
                ? 'Publishing is blocked until route/readiness issues are fixed.'
                : 'This page will be available through hosted, render, and resolve delivery paths.'}
            </div>
          </div>
          <StatusBadge status={deliveryStatus} type={deliveryStatus === 'blocked' ? 'error' : deliveryStatus === 'published' ? 'success' : 'warning'} />
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <PageApiSnippet label="Published URL" value={publicUrl} />
          <PageApiSnippet label="Render API" value={renderUrl} />
          <PageApiSnippet label="Resolve API" value={resolveUrl} />
          <PageApiSnippet label="Preview endpoint" value={previewEndpoint} />
        </div>
      </div>
    </div>
  );
}

function PageApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function PageReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function PageWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function PageApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const getAdminBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const RESERVED_PAGE_ROUTE_PREFIXES = new Set(['api', 'sites', 'blog']);

const pagePublicPath = (page: Page): string => {
  const slug = (page.slug || '').replace(/^\/+|\/+$/g, '');
  if (page.isHomepage) {
    return '/';
  }
  return !slug || slug === 'home' ? '/' : `/${slug}`;
};

const firstPagePathSegment = (path: string): string => (
  path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || ''
);

const compactRoutePattern = (value: string): string => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
};

const normalizeCollectionListPattern = (collection: Collection): string => {
  const raw = collection.listRoutePattern?.trim() || '';
  if (!raw) return `/${collection.slug}`;

  const compact = compactRoutePattern(raw);
  return compact !== '/' && !compact.split('/').includes(':recordSlug') ? compact : `/${collection.slug}`;
};

const normalizeCollectionItemPattern = (collection: Collection): string => {
  const raw = collection.routePattern?.trim() || '';
  if (!raw) return `/${collection.slug}/:recordSlug`;

  const compact = compactRoutePattern(raw);
  return compact.split('/').includes(':recordSlug') ? compact : `/${collection.slug}/:recordSlug`;
};

const matchCollectionPattern = (path: string, pattern: string, collection: Collection): boolean => {
  const pathSegments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const patternSegments = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (pathSegments.length !== patternSegments.length) return false;

  return patternSegments.every((segment, index) => {
    const pathSegment = decodeURIComponent(pathSegments[index] || '');

    if (segment === ':collectionSlug') return pathSegment === collection.slug;
    if (segment.startsWith(':')) return pathSegment.length > 0;
    return pathSegment === segment;
  });
};

const pageSlugIsValid = (page: Page): boolean => {
  if (page.isHomepage) return true;

  const slug = (page.slug || '').replace(/^\/+|\/+$/g, '');
  if (!slug || slug === 'home') return true;

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
};

const findCollectionRouteMatch = (path: string, collections: Collection[]): { collection: Collection; kind: 'list' | 'item' } | null => {
  for (const collection of collections) {
    if (matchCollectionPattern(path, normalizeCollectionListPattern(collection), collection)) {
      return { collection, kind: 'list' };
    }

    if (matchCollectionPattern(path, normalizeCollectionItemPattern(collection), collection)) {
      return { collection, kind: 'item' };
    }
  }

  return null;
};

const buildPageRouteDiagnostics = (pages: Page[], collections: Collection[]): Record<string, PageRouteDiagnostic> => {
  const pagesByPath = new Map<string, Page[]>();
  pages.forEach((page) => {
    const path = pagePublicPath(page);
    pagesByPath.set(path, [...(pagesByPath.get(path) || []), page]);
  });

  return Object.fromEntries(pages.map((page) => {
    const path = pagePublicPath(page);
    const siblingPages = (pagesByPath.get(path) || []).filter((candidate) => candidate.id !== page.id);
    const firstSegment = firstPagePathSegment(path);

    if (!pageSlugIsValid(page)) {
      return [page.id, {
        path,
        status: 'conflict',
        message: 'Use lowercase letters, numbers, and hyphens for this page route.',
        conflictIds: [],
      }];
    }

    if (path !== '/' && RESERVED_PAGE_ROUTE_PREFIXES.has(firstSegment)) {
      return [page.id, {
        path,
        status: 'conflict',
        message: `The /${firstSegment} prefix is reserved by Backy routing.`,
        conflictIds: [],
      }];
    }

    if (siblingPages.length > 0) {
      return [page.id, {
        path,
        status: 'conflict',
        message: `Route also used by ${siblingPages.map((candidate) => candidate.title || candidate.slug).join(', ')}.`,
        conflictIds: siblingPages.map((candidate) => candidate.id),
      }];
    }

    const collectionMatch = findCollectionRouteMatch(path, collections);
    if (collectionMatch) {
      return [page.id, {
        path,
        status: 'conflict',
        message: `Conflicts with "${collectionMatch.collection.name || collectionMatch.collection.slug}" collection ${collectionMatch.kind} route.`,
        conflictIds: [collectionMatch.collection.id],
      }];
    }

    return [page.id, {
      path,
      status: 'available',
      message: 'Route is available.',
      conflictIds: [],
    }];
  }));
};

const pageMetaString = (page: Page, key: string): string => {
  const value = page.meta?.[key];
  return typeof value === 'string' ? value : '';
};

const getParentPageTitle = (page: Page, pageMap: Map<string, Page>): string => (
  page.parentId ? pageMap.get(page.parentId)?.title || pageMetaString(page, 'parentPageTitle') : ''
);

const loadPageRevisionSummaries = async (siteId: string, targetPages: Page[]): Promise<Record<string, ContentRevisionSummary>> => {
  const results = await Promise.allSettled(
    targetPages.map(async (page) => {
      const summary = await getPageRevisionSummary(page.siteId || siteId, page.id);
      return [page.id, summary] as const;
    }),
  );

  return Object.fromEntries(
    results
      .filter((result): result is PromiseFulfilledResult<readonly [string, ContentRevisionSummary]> => result.status === 'fulfilled')
      .map((result) => result.value),
  );
};

const refreshPageRevisionSummary = async (
  siteId: string,
  pageId: string,
  setRevisionSummaryMap: (updater: (current: Record<string, ContentRevisionSummary>) => Record<string, ContentRevisionSummary>) => void,
) => {
  try {
    const summary = await getPageRevisionSummary(siteId, pageId);
    setRevisionSummaryMap((current) => ({ ...current, [pageId]: summary }));
  } catch {
    // Revision summaries are supportive context; page mutations already report their own failures.
  }
};

const getPublishBlocker = (readiness: PageReadiness): string | null => {
  if (readiness.statusLabel !== 'blocked') {
    return null;
  }

  const firstBlockingCheck = readiness.checks.find((check) => check.severity === 'error' && check.status !== 'pass')
    || readiness.checks.find((check) => check.status !== 'pass');

  return firstBlockingCheck?.message || 'Resolve page readiness errors before publishing.';
};

const getPageDeliveryStatus = (
  page: Page,
  readiness: PageReadiness | undefined,
  routeDiagnostic: PageRouteDiagnostic | undefined,
): PageDeliveryStatus => {
  if (routeDiagnostic?.status === 'conflict' || readiness?.statusLabel === 'blocked') {
    return 'blocked';
  }

  if (page.status === 'published') {
    return 'published';
  }

  if (page.status === 'scheduled') {
    return 'scheduled';
  }

  if (page.status === 'archived') {
    return 'archived';
  }

  return 'preview-only';
};

const getPagePublishDeliveryStatus = (
  page: Page,
  readiness: PageReadiness | undefined,
  routeDiagnostic: PageRouteDiagnostic | undefined,
): PageDeliveryStatus => {
  if (routeDiagnostic?.status === 'conflict' || readiness?.statusLabel === 'blocked') {
    return 'blocked';
  }

  if (page.status === 'archived') {
    return 'archived';
  }

  return 'published';
};

const getBulkActionLabel = (
  action: 'publish' | 'archive' | 'delete' | '',
  count: number,
  isConfirmingDelete: boolean,
  isConfirmingPublish: boolean,
): string => {
  const pageLabel = `${count} page${count === 1 ? '' : 's'}`;

  if (action === 'publish') {
    if (isConfirmingPublish) {
      return count > 0 ? `Publish ${pageLabel}` : 'Publish selected';
    }

    return count > 0 ? `Review publish for ${pageLabel}` : 'Publish selected';
  }

  if (action === 'archive') {
    return count > 0 ? `Archive ${pageLabel}` : 'Archive selected';
  }

  if (action === 'delete') {
    if (isConfirmingDelete) {
      return count > 0 ? `Delete ${pageLabel}` : 'Delete selected';
    }

    return count > 0 ? `Review delete for ${pageLabel}` : 'Delete selected';
  }

  return 'Choose action';
};

const getBulkBusyLabel = (action: 'publish' | 'archive' | 'delete' | ''): string => {
  if (action === 'publish') return 'Publishing...';
  if (action === 'archive') return 'Archiving...';
  if (action === 'delete') return 'Deleting...';
  return 'Applying...';
};
