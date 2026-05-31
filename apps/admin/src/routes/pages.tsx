/**
 * BACKY CMS - PAGES LIST
 * 
 * This route is a LAYOUT route - it renders different content:
 * - At /pages exactly: shows the pages list
 * - At /pages/new or /pages/:id/edit: renders child via <Outlet />
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Archive, CheckCircle2, Code2, Copy, Download, ExternalLink, Eye, EyeOff, Filter, Plus, Layout, Edit, Trash2, Home, RefreshCw, Sparkles, ShoppingBag, Newspaper, Mail, UserPlus, History, LogIn, MoreHorizontal } from 'lucide-react';
import {
  archivePage,
  createPagePreview,
  deletePage as deletePageFromApi,
  getUserPermissions,
  getPageReadiness,
  getPageRevisionSummary,
  getSiteReadiness,
  listCollections,
  listPages,
  publishPage,
  unpublishPage,
  type AdminUserPermissionMatrix,
  type Collection,
  type ContentRevisionSummary,
  type PageReadiness,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { useStore, type Page } from '@/stores/mockStore';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
import { cn, formatDate } from '@/lib/utils';

type PageStatusFilter = 'all' | Page['status'];
type PageBulkAction = 'publish' | 'unpublish' | 'archive' | 'delete' | '';

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
type PagePermissionKey = 'pages.view' | 'pages.edit' | 'pages.publish' | 'pages.delete' | 'collections.view' | 'sites.view';

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
const PAGE_REVISION_SUMMARY_TIMEOUT_MS = 10000;
const PAGE_REVISION_SUMMARY_MAX_ATTEMPTS = 2;
const PAGE_REVISION_SUMMARY_RETRY_DELAY_MS = 500;
const PAGE_READINESS_PREFLIGHT_TIMEOUT_MS = 10000;

const PAGE_PERMISSION_ROLE_DEFAULTS: Record<PagePermissionKey, Array<AuthUser['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
  'pages.delete': ['owner', 'admin'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.view': ['owner', 'admin', 'editor', 'viewer'],
};

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
    key: 'collections',
    title: 'Collections',
    detail: 'Bind custom datasets into repeaters, detail pages, filters, and reusable cards.',
    route: '/collections',
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

const PAGE_BINDING_TARGETS = [
  {
    key: 'collections',
    title: 'Collection repeaters',
    detail: 'Bind collection records into lists, detail pages, filters, and reusable cards.',
  },
  {
    key: 'blog',
    title: 'Blog feeds',
    detail: 'Render article lists, post detail links, taxonomy sections, and editorial previews.',
  },
  {
    key: 'products',
    title: 'Commerce sections',
    detail: 'Bind product cards, price, inventory, checkout URLs, and digital delivery calls to action.',
  },
  {
    key: 'forms',
    title: 'Form blocks',
    detail: 'Connect contact, registration, survey, and file-intake blocks to Backy form APIs.',
  },
  {
    key: 'media',
    title: 'Media fields',
    detail: 'Use central images, files, fonts, downloads, and galleries inside page components.',
  },
  {
    key: 'users',
    title: 'User and member state',
    detail: 'Prepare protected account, registration, login, and member-only surfaces while auth policies mature.',
  },
] as const;

const PAGE_EXPORT_COLUMNS = [
  'page_id',
  'site_id',
  'active_site_id',
  'title',
  'slug',
  'path',
  'template_source',
  'template_label',
  'frontend_design_template_id',
  'frontend_design_template_name',
  'collection_dataset_mode',
  'collection_dataset_slug',
  'status',
  'is_homepage',
  'route_status',
  'route_issue',
  'route_conflict_ids',
  'delivery_status',
  'delivery_health',
  'delivery_health_message',
  'delivery_health_history',
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

type PageCreationTemplate = 'blank' | 'landing' | 'storefront' | 'product-detail' | 'pricing' | 'services' | 'booking' | 'portfolio' | 'gallery' | 'events' | 'privacy' | 'terms' | 'cookie-policy' | 'accessibility-statement' | 'refund-policy' | 'shipping-policy' | 'cart' | 'checkout' | 'order-confirmation' | 'help-center' | 'faq' | 'testimonials' | 'blog-index' | 'blog-post' | 'team' | 'careers' | 'about' | 'contact' | 'newsletter' | 'survey' | 'registration' | 'member-login' | 'member-account';

type PageRouteDiagnostic = {
  path: string;
  status: 'available' | 'warning' | 'conflict';
  message: string;
  conflictIds: string[];
};

type PageDeliveryStatus = 'published' | 'preview-only' | 'scheduled' | 'archived' | 'blocked';

type PageDeliveryHealth = {
  status: 'checking' | 'healthy' | 'warning' | 'error';
  message: string;
  checkedAt?: string;
  publicStatus?: number | null;
  renderStatus?: number | null;
  resolveStatus?: number | null;
};

type PageDeliveryHealthHistory = Record<string, PageDeliveryHealth[]>;

const isStringIdentifier = (value: string | null | undefined): value is string => Boolean(value);

type PageCreationShortcut = {
  key: PageCreationTemplate;
  title: string;
  detail: string;
  badge: string;
  icon: typeof Layout;
};

const PAGE_CREATION_SHORTCUTS: PageCreationShortcut[] = [
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
    key: 'product-detail',
    title: 'Product detail',
    detail: 'Create a buy-ready product page with media, options, checkout, and related items.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'pricing',
    title: 'Pricing',
    detail: 'Create plan cards, feature comparison, subscription CTAs, and billing interval controls.',
    badge: 'Plans',
    icon: ShoppingBag,
  },
  {
    key: 'services',
    title: 'Services',
    detail: 'Create service cards, booking CTAs, format filters, process steps, and inquiry handoff.',
    badge: 'Bookings',
    icon: Sparkles,
  },
  {
    key: 'booking',
    title: 'Booking',
    detail: 'Create appointment cards, availability, intake fields, and scheduling-provider handoff.',
    badge: 'Bookings',
    icon: Sparkles,
  },
  {
    key: 'portfolio',
    title: 'Portfolio',
    detail: 'Create a media-backed project gallery with filters, case-study cards, and inquiry CTA.',
    badge: 'Media',
    icon: Layout,
  },
  {
    key: 'gallery',
    title: 'Gallery',
    detail: 'Create media folders, asset-type filters, image/video/file cards, and lightbox handoff.',
    badge: 'Media',
    icon: Layout,
  },
  {
    key: 'events',
    title: 'Events',
    detail: 'Create event cards, schedule metadata, format filters, agenda steps, and RSVP actions.',
    badge: 'Events',
    icon: Sparkles,
  },
  {
    key: 'privacy',
    title: 'Privacy policy',
    detail: 'Create a legal policy page with data-use sections, rights, retention, and contact actions.',
    badge: 'Legal',
    icon: EyeOff,
  },
  {
    key: 'terms',
    title: 'Terms',
    detail: 'Create terms and conditions sections for service rules, commerce policies, acceptable use, and contact actions.',
    badge: 'Legal',
    icon: Archive,
  },
  {
    key: 'cookie-policy',
    title: 'Cookie policy',
    detail: 'Create cookie categories, consent controls, retention notes, processors, and preference actions.',
    badge: 'Legal',
    icon: EyeOff,
  },
  {
    key: 'accessibility-statement',
    title: 'Accessibility',
    detail: 'Create accessibility standards, supported features, known limitations, review notes, and feedback actions.',
    badge: 'Compliance',
    icon: Eye,
  },
  {
    key: 'refund-policy',
    title: 'Refund policy',
    detail: 'Create return windows, refund rules, exchange options, ineligible items, and support actions.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'shipping-policy',
    title: 'Shipping policy',
    detail: 'Create delivery timelines, shipping methods, rates, tracking, pickup, and international rules.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'cart',
    title: 'Cart',
    detail: 'Create a cart review page with item rows, quantity controls, totals, and checkout handoff.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'checkout',
    title: 'Checkout',
    detail: 'Create an order summary, customer details, shipping choice, and payment-provider handoff page.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'order-confirmation',
    title: 'Order confirmation',
    detail: 'Create a receipt, fulfillment status, account handoff, and support next-steps page.',
    badge: 'Commerce',
    icon: ShoppingBag,
  },
  {
    key: 'help-center',
    title: 'Help center',
    detail: 'Create a searchable support page with categories, FAQs, and escalation handoff.',
    badge: 'Support',
    icon: Mail,
  },
  {
    key: 'faq',
    title: 'FAQ',
    detail: 'Create searchable questions, category filters, accordion answers, and support escalation.',
    badge: 'Support',
    icon: Mail,
  },
  {
    key: 'testimonials',
    title: 'Testimonials',
    detail: 'Create review cards, ratings, source filters, customer proof, and inquiry actions.',
    badge: 'Proof',
    icon: Sparkles,
  },
  {
    key: 'blog-index',
    title: 'Blog index',
    detail: 'Build a public article hub connected to posts, categories, and editorial routes.',
    badge: 'Editorial',
    icon: Newspaper,
  },
  {
    key: 'blog-post',
    title: 'Blog post',
    detail: 'Create an article detail page with post body, author, taxonomy, and related-post bindings.',
    badge: 'Editorial',
    icon: Newspaper,
  },
  {
    key: 'team',
    title: 'Team',
    detail: 'Create people profiles with roles, departments, profile links, culture notes, and hiring actions.',
    badge: 'People',
    icon: UserPlus,
  },
  {
    key: 'careers',
    title: 'Careers',
    detail: 'Create open roles, job filters, benefits, hiring process notes, and application actions.',
    badge: 'Hiring',
    icon: UserPlus,
  },
  {
    key: 'about',
    title: 'About',
    detail: 'Create a story, values, trust proof, and team handoff page with editable site chrome.',
    badge: 'Brand',
    icon: Sparkles,
  },
  {
    key: 'contact',
    title: 'Contact form',
    detail: 'Start with a form page wired for submissions, contacts, and frontend API handoff.',
    badge: 'Forms',
    icon: Mail,
  },
  {
    key: 'newsletter',
    title: 'Newsletter',
    detail: 'Create an email signup page with topic preferences, consent, and contact sharing.',
    badge: 'Forms',
    icon: Mail,
  },
  {
    key: 'survey',
    title: 'Survey',
    detail: 'Create rating, topic, feedback, optional contact, and consent fields for response capture.',
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
  {
    key: 'member-login',
    title: 'Member login',
    detail: 'Create an email-only member access page that avoids password form capture.',
    badge: 'Access',
    icon: LogIn,
  },
  {
    key: 'member-account',
    title: 'Member account',
    detail: 'Create a profile and preferences page for authenticated member areas.',
    badge: 'Account',
    icon: Home,
  },
];

const PAGE_STARTER_GROUPS: Array<{
  id: string;
  title: string;
  detail: string;
  badges: string[];
}> = [
  {
    id: 'build',
    title: 'Build the site',
    detail: 'Core pages for launching the main website surface.',
    badges: ['Design freely', 'Site starter', 'Brand', 'Media', 'Events', 'Proof', 'People', 'Hiring'],
  },
  {
    id: 'commerce',
    title: 'Sell and fulfill',
    detail: 'Storefront, checkout, policies, and order flows.',
    badges: ['Products', 'Commerce', 'Plans'],
  },
  {
    id: 'content',
    title: 'Publish content',
    detail: 'Editorial, help, and support surfaces.',
    badges: ['Editorial', 'Support'],
  },
  {
    id: 'capture',
    title: 'Capture leads',
    detail: 'Forms, newsletter, booking, and member entry points.',
    badges: ['Forms', 'Bookings', 'Members', 'Access', 'Account'],
  },
  {
    id: 'trust',
    title: 'Trust and compliance',
    detail: 'Legal and compliance pages expected on real sites.',
    badges: ['Legal', 'Compliance'],
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
  const bulkSelectionStatusId = useId();
  const bulkActionStatusId = useId();
  const routeSearch = Route.useSearch();
  const currentAdmin = useAuthStore((state) => state.user);
  const { sites, pages, setPages, setPagesForSite, deletePage, updatePage } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [statusFilter, setStatusFilter] = useState<PageStatusFilter>(routeSearch.status || 'all');
  const [healthFilter, setHealthFilter] = useState<PageLibraryFilter>(routeSearch.health || 'all');
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<PageBulkAction>('');
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [readinessMap, setReadinessMap] = useState<Record<string, PageReadiness>>({});
  const [revisionSummaryMap, setRevisionSummaryMap] = useState<Record<string, ContentRevisionSummary>>({});
  const [deliveryHealthMap, setDeliveryHealthMap] = useState<Record<string, PageDeliveryHealth>>({});
  const [deliveryHealthHistoryMap, setDeliveryHealthHistoryMap] = useState<PageDeliveryHealthHistory>({});
  const [refreshingDeliveryPageIds, setRefreshingDeliveryPageIds] = useState<Set<string>>(() => new Set());
  const [isRefreshingAllDeliveryHealth, setIsRefreshingAllDeliveryHealth] = useState(false);
  const [routeCollections, setRouteCollections] = useState<Collection[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [loadedPageSiteIds, setLoadedPageSiteIds] = useState<Set<string>>(() => new Set());
  const [previewingPageId, setPreviewingPageId] = useState<string | null>(null);
  const [mutatingPageId, setMutatingPageId] = useState<string | null>(null);
  const [pendingPublishPage, setPendingPublishPage] = useState<Page | null>(null);
  const [pendingUnpublishPage, setPendingUnpublishPage] = useState<Page | null>(null);
  const [pendingArchivePage, setPendingArchivePage] = useState<Page | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<Page | null>(null);
  const [pendingBulkPublish, setPendingBulkPublish] = useState(false);
  const [pendingBulkUnpublish, setPendingBulkUnpublish] = useState(false);
  const [pendingBulkArchive, setPendingBulkArchive] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const canViewPages = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', PAGE_PERMISSION_ROLE_DEFAULTS);
  const canEditPages = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', PAGE_PERMISSION_ROLE_DEFAULTS);
  const canPublishPages = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', PAGE_PERMISSION_ROLE_DEFAULTS);
  const canDeletePages = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', PAGE_PERMISSION_ROLE_DEFAULTS);
  const canViewCollections = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', PAGE_PERMISSION_ROLE_DEFAULTS);
  const canViewSites = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'sites.view', PAGE_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', PAGE_PERMISSION_ROLE_DEFAULTS);
  const editPermissionTitle = canEditPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', PAGE_PERMISSION_ROLE_DEFAULTS);
  const publishPermissionTitle = canPublishPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.publish', PAGE_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeletePages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.delete', PAGE_PERMISSION_ROLE_DEFAULTS);
  const isPageMutationBusy = isBulkBusy || mutatingPageId !== null || previewingPageId !== null;
  const isPageRowMutationBusy = isBulkBusy || mutatingPageId !== null;
  const isPagePreviewBusy = previewingPageId !== null;
  const canRunAnyBulkAction = canPublishPages || canEditPages || canDeletePages;
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const activeSiteIdentifiers = useMemo(
    () => Array.from(new Set([activeSiteId, activeSite?.id, activeSite?.publicSiteId].filter(isStringIdentifier))),
    [activeSite?.id, activeSite?.publicSiteId, activeSiteId],
  );
  const pagesForActiveSite = useCallback(
    (siteId: string) => Array.from(new Set([siteId, ...activeSiteIdentifiers].filter(isStringIdentifier))),
    [activeSiteIdentifiers],
  );
  const markPagesLoadedForSite = useCallback((siteIdentifiers: string[]) => {
    setLoadedPageSiteIds((current) => {
      const next = new Set(current);
      siteIdentifiers.forEach((siteId) => next.add(siteId));
      return next;
    });
  }, []);
  const activeSitePages = useMemo(() => {
    const siteIdentifiers = new Set(activeSiteIdentifiers);

    return pages.filter((page) => siteIdentifiers.has(page.siteId));
  }, [activeSiteIdentifiers, pages]);
  const hasLoadedActiveSitePages = activeSiteIdentifiers.some((siteId) => loadedPageSiteIds.has(siteId));
  const isInitialPageLoad = isLoading && activeSitePages.length === 0 && !hasLoadedActiveSitePages;
  const isBlockingInitialPageLoad = isInitialPageLoad && !canEditPages;
  const isPageLibraryBusy = isBlockingInitialPageLoad;
  const isPageBulkControlsBusy = isBlockingInitialPageLoad || isBulkBusy;
  const isPageRefreshBusy = isLoading;
  const createPageLinkDisabled = !canEditPages;
  const createPageActionStatusId = 'pages-create-action-status';
  const createPageActionDisabledReason = createPageLinkDisabled
    ? editPermissionTitle || 'Your account needs pages.edit to create pages.'
    : '';
  const createPageActionStatus = createPageActionDisabledReason
    ? `New page unavailable: ${createPageActionDisabledReason}`
    : `New page available for ${activeSiteId}.`;
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
  const deliveryProbeTargets = useMemo(
    () => activeSitePages
      .filter((page) => (
        page.status === 'published'
        && getPageDeliveryStatus(page, readinessMap[page.id], pageRouteDiagnostics[page.id]) === 'published'
      ))
      .slice(0, 24),
    [activeSitePages, pageRouteDiagnostics, readinessMap],
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
        (healthFilter === 'homepage' && (page.isHomepage || page.slug === 'index' || page.slug === 'home' || page.slug === '')) ||
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
  const createPageSearch = useMemo(() => ({
    siteId: activeSiteId,
    templateSource: 'backy-canvas' as const,
    focus: 'canvas' as const,
  }), [activeSiteId]);
  const buildBackyCanvasPageCreateRoute = useCallback((template: PageCreationTemplate = 'blank') => {
    const params = new URLSearchParams({
      siteId: activeSiteId,
      templateSource: 'backy-canvas',
      focus: 'canvas',
    });
    if (template !== 'blank') {
      params.set('template', template);
    }
    return `/pages/new?${params.toString()}`;
  }, [activeSiteId]);
  const getCreatePageSearch = (template: PageCreationTemplate = 'blank') => (
    template === 'blank' ? createPageSearch : { ...createPageSearch, template }
  );
  const pageStarterGroups = useMemo(() => {
    const assignedKeys = new Set<PageCreationTemplate>();
    const groups = PAGE_STARTER_GROUPS.map((group) => {
      const shortcuts = PAGE_CREATION_SHORTCUTS.filter((shortcut) => {
        if (!group.badges.includes(shortcut.badge) || assignedKeys.has(shortcut.key)) return false;
        assignedKeys.add(shortcut.key);
        return true;
      });

      return { ...group, shortcuts };
    }).filter((group) => group.shortcuts.length > 0);

    const remainingShortcuts = PAGE_CREATION_SHORTCUTS.filter((shortcut) => !assignedKeys.has(shortcut.key));
    return remainingShortcuts.length > 0
      ? [
          ...groups,
          {
            id: 'more',
            title: 'More starters',
            detail: 'Additional starter surfaces for specialized site flows.',
            badges: [],
            shortcuts: remainingShortcuts,
          },
        ]
      : groups;
  }, []);
  const pageDesignReadiness = useMemo(() => {
    const checkedPages = activeSitePages.filter((page) => readinessMap[page.id]);
    const readyPages = activeSitePages.filter((page) => readinessMap[page.id]?.statusLabel === 'ready');
    const totalElements = checkedPages.reduce((total, page) => total + (readinessMap[page.id]?.elementCount || 0), 0);
    const hasHomepage = activeSitePages.some((page) => page.isHomepage || page.slug === 'index' || page.slug === 'home' || page.slug === '');
    const hasPublishedPage = activeSitePages.some((page) => page.status === 'published');
    const hasCanvasContent = totalElements > 0;
    const checks = [
      {
        label: 'Page library',
        detail: activeSitePages.length > 0
          ? `${activeSitePages.length} page${activeSitePages.length === 1 ? '' : 's'} in this site`
          : 'Create a page for this site.',
        ready: activeSitePages.length > 0,
      },
      {
        label: 'Homepage route',
        detail: hasHomepage ? 'A homepage route exists.' : 'Mark one page as homepage or create the / route.',
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
        { label: 'Create', detail: 'Start from New Page for the active site.' },
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
    if (!canViewPages) {
      setNotice(viewPermissionTitle || 'Your account cannot copy page data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const recordDeliveryHealthHistory = (entries: Array<readonly [string, PageDeliveryHealth]>) => {
    if (entries.length === 0) return;

    setDeliveryHealthHistoryMap((current) => {
      const next = { ...current };
      entries.forEach(([pageId, health]) => {
        if (!health.checkedAt || health.status === 'checking') return;
        const currentHistory = next[pageId] || [];
        const deduped = currentHistory.filter((entry) => entry.checkedAt !== health.checkedAt);
        next[pageId] = [health, ...deduped].slice(0, 5);
      });
      return next;
    });
  };

  const downloadPagesCsv = () => {
    if (isPageLibraryBusy) return;
    if (!canViewPages) {
      setNotice(viewPermissionTitle || 'Your account cannot export pages.');
      return;
    }

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
      const deliveryHealth = deliveryHealthMap[page.id];
      const deliveryHistory = deliveryHealthHistoryMap[page.id] || [];
      const templateInfo = pageTemplateInfo(page);

      return [
        page.id,
        page.siteId || '',
        activeSiteId,
        page.title,
        page.slug,
        pagePath,
        templateInfo.source,
        templateInfo.label,
        pageMetaString(page, 'frontendDesignTemplateId'),
        pageMetaString(page, 'frontendDesignTemplateName'),
        templateInfo.datasetMode || '',
        templateInfo.datasetSlug || '',
        page.status,
        Boolean(page.isHomepage),
        pageRouteDiagnostics[page.id]?.status || 'available',
        pageRouteDiagnostics[page.id]?.message || '',
        pageRouteDiagnostics[page.id]?.conflictIds.join('; ') || '',
        deliveryStatus,
        deliveryHealth?.status || '',
        deliveryHealth?.message || '',
        deliveryHistory.map((entry) => `${entry.checkedAt || 'unknown'}:${entry.status}:${entry.publicStatus ?? 'n/a'}/${entry.renderStatus ?? 'n/a'}/${entry.resolveStatus ?? 'n/a'}`).join('; '),
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
    if (isPageBulkControlsBusy || !canRunAnyBulkAction) return;

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
    if (isPageBulkControlsBusy || !canRunAnyBulkAction) return;

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

  const loadPagePermissions = useCallback(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((permissionLoadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(permissionLoadError instanceof Error ? permissionLoadError.message : 'Unable to load page permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  useEffect(() => loadPagePermissions(), [loadPagePermissions]);

  const refreshPages = useMemo(
    () => async (siteId: string) => {
      if (isPageLibraryBusy) return;
      if (!canViewPages) {
        setPages([]);
        setRouteCollections([]);
        setReadinessMap({});
        setRevisionSummaryMap({});
        setNotice(viewPermissionTitle || 'Your account cannot view pages.');
        setError(null);
        return;
      }

      setIsLoading(true);
      setIsLoadingReadiness(true);
      setIsLoadingRevisions(true);
      setError(null);

      try {
        const backendPages = await listPages(siteId);
        const sitePageIdentifiers = pagesForActiveSite(siteId);
        setPagesForSite(sitePageIdentifiers, backendPages);
        markPagesLoadedForSite(sitePageIdentifiers);
        setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
        setDeliveryHealthHistoryMap((current) => {
          const nextIds = new Set(backendPages.map((page) => page.id));
          return Object.fromEntries(
            Object.entries(current).filter(([pageId]) => nextIds.has(pageId)),
          ) as PageDeliveryHealthHistory;
        });
        setIsLoading(false);

        const [readiness, collections] = await Promise.all([
          canViewSites ? getSiteReadiness(siteId).catch(() => null) : Promise.resolve(null),
          canViewCollections ? listCollections(siteId).catch(() => []) : Promise.resolve([]),
        ]);
        setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
        setRouteCollections(collections);
        setRevisionSummaryMap((current) => {
          const nextIds = new Set(backendPages.map((page) => page.id));
          return Object.fromEntries(
            Object.entries(current).filter(([pageId]) => nextIds.has(pageId)),
          ) as Record<string, ContentRevisionSummary>;
        });
      } catch (loadError) {
        if (isAdminPermissionDeniedError(loadError)) {
          setPages([]);
          setRouteCollections([]);
          setNotice(loadError instanceof Error ? loadError.message : viewPermissionTitle || 'Your account cannot view pages.');
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load pages');
      } finally {
        setIsLoading(false);
        setIsLoadingReadiness(false);
        setIsLoadingRevisions(false);
      }
    },
    [canViewCollections, canViewPages, canViewSites, isPageLibraryBusy, markPagesLoadedForSite, pagesForActiveSite, setPages, setPagesForSite, viewPermissionTitle],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPages = async () => {
      if (!canViewPages) {
        setPages([]);
        setRouteCollections([]);
        setReadinessMap({});
        setRevisionSummaryMap({});
        setSelectedPageIds(new Set());
        setNotice(viewPermissionTitle || 'Your account cannot view pages.');
        setIsLoading(false);
        setIsLoadingReadiness(false);
        setIsLoadingRevisions(false);
        return;
      }

      setIsLoading(true);
      setIsLoadingReadiness(true);
      setIsLoadingRevisions(true);
      setError(null);

      try {
        const backendPages = await listPages(activeSiteId);
        if (!cancelled) {
          const sitePageIdentifiers = pagesForActiveSite(activeSiteId);
          setPagesForSite(sitePageIdentifiers, backendPages);
          markPagesLoadedForSite(sitePageIdentifiers);
          setSelectedPageIds((current) => new Set(backendPages.filter((page) => current.has(page.id)).map((page) => page.id)));
          setDeliveryHealthHistoryMap((current) => {
            const nextIds = new Set(backendPages.map((page) => page.id));
            return Object.fromEntries(
              Object.entries(current).filter(([pageId]) => nextIds.has(pageId)),
            ) as PageDeliveryHealthHistory;
          });
          setIsLoading(false);
        }

        const [readiness, collections] = await Promise.all([
          canViewSites ? getSiteReadiness(activeSiteId).catch(() => null) : Promise.resolve(null),
          canViewCollections ? listCollections(activeSiteId).catch(() => []) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setReadinessMap(Object.fromEntries((readiness?.pages || []).map((page) => [page.id, page])));
          setRouteCollections(collections);
          setRevisionSummaryMap((current) => {
            const nextIds = new Set(backendPages.map((page) => page.id));
            return Object.fromEntries(
              Object.entries(current).filter(([pageId]) => nextIds.has(pageId)),
            ) as Record<string, ContentRevisionSummary>;
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          if (isAdminPermissionDeniedError(loadError)) {
            setPages([]);
            setRouteCollections([]);
            setNotice(loadError instanceof Error ? loadError.message : viewPermissionTitle || 'Your account cannot view pages.');
            return;
          }

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
  }, [activeSiteId, canViewCollections, canViewPages, canViewSites, markPagesLoadedForSite, pagesForActiveSite, setPages, setPagesForSite, viewPermissionTitle]);

  const publicPageUrl = (page: Page) => (
    `${publicBaseUrl}/sites/${encodeURIComponent(siteSlug)}${pagePublicPath(page)}`
  );

  useEffect(() => {
    let cancelled = false;
    const probeTargets = deliveryProbeTargets;

    if (probeTargets.length === 0) {
      setDeliveryHealthMap({});
      setDeliveryHealthHistoryMap({});
      return () => {
        cancelled = true;
      };
    }

    setDeliveryHealthMap((current) => {
      const targetIds = new Set(probeTargets.map((page) => page.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([pageId]) => targetIds.has(pageId)),
      ) as Record<string, PageDeliveryHealth>;

      probeTargets.forEach((page) => {
        next[page.id] = next[page.id] || {
          status: 'checking',
          message: 'Checking public, render, and resolve endpoints.',
        };
      });

      return next;
    });

    void Promise.allSettled(probeTargets.map(async (page) => {
      const pageSiteId = page.siteId || activeSiteId;
      const pagePath = pagePublicPath(page);
      const encodedSiteId = encodeURIComponent(pageSiteId);
      const encodedPath = encodeURIComponent(pagePath);

      return [
        page.id,
        await probePageDeliveryHealth({
          publicUrl: publicPageUrl(page),
          renderUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`,
          resolveUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`,
        }),
      ] as const;
    })).then((results) => {
      if (cancelled) return;

      const fulfilledEntries = results
        .filter((result): result is PromiseFulfilledResult<readonly [string, PageDeliveryHealth]> => result.status === 'fulfilled')
        .map((result) => result.value);

      setDeliveryHealthMap((current) => ({
        ...current,
        ...Object.fromEntries(fulfilledEntries),
      }));
      recordDeliveryHealthHistory(fulfilledEntries);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, deliveryProbeTargets, publicBaseUrl, siteSlug]);

  const handleRefreshDeliveryHealth = async (targetPages = deliveryProbeTargets) => {
    if (isLoading || targetPages.length === 0 || isRefreshingAllDeliveryHealth) {
      return;
    }
    if (!canViewPages) {
      setNotice(viewPermissionTitle || 'Your account cannot view page delivery health.');
      return;
    }

    const probeTargets = targetPages.filter((page) => (
      page.status === 'published'
      && getPageDeliveryStatus(page, readinessMap[page.id], pageRouteDiagnostics[page.id]) === 'published'
    ));

    if (probeTargets.length === 0) {
      setNotice('No published pages are ready for delivery health checks.');
      return;
    }

    const targetIds = probeTargets.map((page) => page.id);
    setIsRefreshingAllDeliveryHealth(targetPages.length !== 1);
    setRefreshingDeliveryPageIds((current) => new Set([...current, ...targetIds]));
    setError(null);
    setNotice(null);
    setDeliveryHealthMap((current) => {
      const next = { ...current };
      probeTargets.forEach((page) => {
        next[page.id] = {
          status: 'checking',
          message: 'Refreshing public, render, and resolve endpoint health.',
        };
      });
      return next;
    });

    try {
      const results = await Promise.allSettled(probeTargets.map(async (page) => {
        const pageSiteId = page.siteId || activeSiteId;
        const pagePath = pagePublicPath(page);
        const encodedSiteId = encodeURIComponent(pageSiteId);
        const encodedPath = encodeURIComponent(pagePath);

        return [
          page.id,
          await probePageDeliveryHealth({
            publicUrl: publicPageUrl(page),
            renderUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`,
            resolveUrl: `${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`,
          }),
        ] as const;
      }));

      const nextHealth = Object.fromEntries(
        results
          .filter((result): result is PromiseFulfilledResult<readonly [string, PageDeliveryHealth]> => result.status === 'fulfilled')
          .map((result) => result.value),
      );

      setDeliveryHealthMap((current) => ({
        ...current,
        ...nextHealth,
      }));
      recordDeliveryHealthHistory(
        results
          .filter((result): result is PromiseFulfilledResult<readonly [string, PageDeliveryHealth]> => result.status === 'fulfilled')
          .map((result) => result.value),
      );
      setNotice(`Delivery health refreshed for ${Object.keys(nextHealth).length} published page${Object.keys(nextHealth).length === 1 ? '' : 's'}.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh delivery health.');
    } finally {
      setRefreshingDeliveryPageIds((current) => {
        const next = new Set(current);
        targetIds.forEach((pageId) => next.delete(pageId));
        return next;
      });
      setIsRefreshingAllDeliveryHealth(false);
    }
  };

  const handlePreviewPage = async (page: Page) => {
    if (isPageLibraryBusy || isPagePreviewBusy) return;
    if (!canPublishPages) {
      setNotice(publishPermissionTitle || 'Your account cannot create page preview links.');
      return;
    }

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
    if (isPageLibraryBusy || isPageRowMutationBusy) return;
    if (!canPublishPages) {
      setNotice(publishPermissionTitle || 'Your account cannot publish pages.');
      setPendingPublishPage(null);
      return;
    }

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      const routeDiagnostic = pageRouteDiagnostics[page.id];
      if (routeDiagnostic?.status === 'conflict') {
        setError(`${page.title} is blocked: ${routeDiagnostic.message}`);
        return;
      }

      const readiness = await getPageReadinessPreflight(page.siteId || activeSiteId, page.id);
      if (readiness) {
        setReadinessMap((current) => ({ ...current, [page.id]: readiness }));
        const blocker = getPublishBlocker(readiness);

        if (blocker) {
          setError(`${page.title} is blocked: ${blocker}`);
          return;
        }
      }

      const updated = await publishPage(page.siteId || activeSiteId, page.id, {
        expectedUpdatedAt: page.lastUpdated,
      });
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
    if (isPageLibraryBusy || isPageRowMutationBusy) return;
    if (!canEditPages) {
      setNotice(editPermissionTitle || 'Your account cannot archive pages.');
      return;
    }

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await archivePage(page.siteId || activeSiteId, page.id, {
        expectedUpdatedAt: page.lastUpdated,
      });
      updatePage(page.id, updated);
      void refreshPageRevisionSummary(page.siteId || activeSiteId, page.id, setRevisionSummaryMap);
      setPendingArchivePage(null);
      setNotice(`${updated.title || page.title} archived.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Unable to archive page');
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleUnpublishPage = async (page: Page) => {
    if (isPageLibraryBusy || isPageRowMutationBusy) return;
    if (!canEditPages) {
      setNotice(editPermissionTitle || 'Your account cannot unpublish pages.');
      return;
    }
    if (!canPublishPages) {
      setNotice(publishPermissionTitle || 'Your account cannot unpublish pages.');
      return;
    }

    setMutatingPageId(page.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await unpublishPage(page.siteId || activeSiteId, page.id, {
        expectedUpdatedAt: page.lastUpdated,
      });
      updatePage(page.id, updated);
      void refreshPageRevisionSummary(page.siteId || activeSiteId, page.id, setRevisionSummaryMap);
      setPendingUnpublishPage(null);
      setNotice(`${updated.title || page.title} unpublished.`);
    } catch (unpublishError) {
      setError(unpublishError instanceof Error ? unpublishError.message : 'Unable to unpublish page');
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleDeletePage = async (page: Page) => {
    if (isPageLibraryBusy || isPageRowMutationBusy) return;
    if (!canDeletePages) {
      setNotice(deletePermissionTitle || 'Your account cannot delete pages.');
      setPendingDeletePage(null);
      return;
    }

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

  useEffect(() => {
    if (!pendingPublishPage) return;

    const handlePagePublishDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || mutatingPageId === pendingPublishPage.id) return;
      event.preventDefault();
      setPendingPublishPage(null);
    };

    document.addEventListener('keydown', handlePagePublishDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePagePublishDialogKeyDown, true);
  }, [mutatingPageId, pendingPublishPage]);

  useEffect(() => {
    if (!pendingUnpublishPage) return;

    const handlePageUnpublishDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || mutatingPageId === pendingUnpublishPage.id) return;
      event.preventDefault();
      setPendingUnpublishPage(null);
    };

    document.addEventListener('keydown', handlePageUnpublishDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePageUnpublishDialogKeyDown, true);
  }, [mutatingPageId, pendingUnpublishPage]);

  useEffect(() => {
    if (!pendingArchivePage) return;

    const handlePageArchiveDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || mutatingPageId === pendingArchivePage.id) return;
      event.preventDefault();
      setPendingArchivePage(null);
    };

    document.addEventListener('keydown', handlePageArchiveDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePageArchiveDialogKeyDown, true);
  }, [mutatingPageId, pendingArchivePage]);

  useEffect(() => {
    if (!pendingDeletePage) return;

    const handlePageDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || mutatingPageId === pendingDeletePage.id) return;
      event.preventDefault();
      setPendingDeletePage(null);
    };

    document.addEventListener('keydown', handlePageDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePageDeleteDialogKeyDown, true);
  }, [mutatingPageId, pendingDeletePage]);

  useEffect(() => {
    if (!pendingBulkDelete) return;

    const handlePagesBulkDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBulkBusy) return;
      event.preventDefault();
      setPendingBulkDelete(false);
    };

    document.addEventListener('keydown', handlePagesBulkDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePagesBulkDeleteDialogKeyDown, true);
  }, [isBulkBusy, pendingBulkDelete]);

  useEffect(() => {
    if (!pendingBulkPublish) return;

    const handlePagesBulkPublishDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBulkBusy) return;
      event.preventDefault();
      setPendingBulkPublish(false);
    };

    document.addEventListener('keydown', handlePagesBulkPublishDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePagesBulkPublishDialogKeyDown, true);
  }, [isBulkBusy, pendingBulkPublish]);

  useEffect(() => {
    if (!pendingBulkUnpublish) return;

    const handlePagesBulkUnpublishDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBulkBusy) return;
      event.preventDefault();
      setPendingBulkUnpublish(false);
    };

    document.addEventListener('keydown', handlePagesBulkUnpublishDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePagesBulkUnpublishDialogKeyDown, true);
  }, [isBulkBusy, pendingBulkUnpublish]);

  useEffect(() => {
    if (!pendingBulkArchive) return;

    const handlePagesBulkArchiveDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBulkBusy) return;
      event.preventDefault();
      setPendingBulkArchive(false);
    };

    document.addEventListener('keydown', handlePagesBulkArchiveDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePagesBulkArchiveDialogKeyDown, true);
  }, [isBulkBusy, pendingBulkArchive]);

  const handleBulkAction = async () => {
    if (isPageLibraryBusy || isPageMutationBusy) {
      return;
    }

    if (!bulkAction || selectedPages.length === 0) {
      return;
    }

    if (bulkAction === 'publish' && !canPublishPages) {
      setNotice(publishPermissionTitle || 'Your account cannot publish pages.');
      return;
    }

    if (bulkAction === 'unpublish' && (!canEditPages || !canPublishPages)) {
      setNotice(!canEditPages
        ? editPermissionTitle || 'Your account cannot unpublish pages.'
        : publishPermissionTitle || 'Your account cannot unpublish pages.');
      return;
    }

    if (bulkAction === 'archive' && !canEditPages) {
      setNotice(editPermissionTitle || 'Your account cannot archive pages.');
      return;
    }

    if (bulkAction === 'delete' && !canDeletePages) {
      setNotice(deletePermissionTitle || 'Your account cannot delete pages.');
      return;
    }

    if (bulkAction === 'publish' && !pendingBulkPublish) {
      setPendingBulkPublish(true);
      return;
    }

    if (bulkAction === 'unpublish' && !pendingBulkUnpublish) {
      const pagesToUnpublish = selectedPages.filter((page) => page.status === 'published' || page.status === 'scheduled');
      if (pagesToUnpublish.length === 0) {
        setNotice('Select at least one published or scheduled page to unpublish.');
        return;
      }
      setPendingBulkUnpublish(true);
      return;
    }

    if (bulkAction === 'archive' && !pendingBulkArchive) {
      const pagesToArchive = selectedPages.filter((page) => page.status !== 'archived');
      if (pagesToArchive.length === 0) {
        setNotice('Select at least one active page to archive.');
        return;
      }
      setPendingBulkArchive(true);
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
            readiness: await getPageReadinessPreflight(page.siteId || activeSiteId, page.id),
          })),
        );
        setReadinessMap((current) => ({
          ...current,
          ...Object.fromEntries(
            readinessResults
              .filter((result): result is { page: Page; readiness: PageReadiness } => Boolean(result.readiness))
              .map(({ page, readiness }) => [page.id, readiness]),
          ),
        }));

        const blockedPages = readinessResults
          .filter((result): result is { page: Page; readiness: PageReadiness } => Boolean(result.readiness))
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
          selectedPages.map((page) => publishPage(page.siteId || activeSiteId, page.id, {
            expectedUpdatedAt: page.lastUpdated,
          })),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
        setPendingBulkPublish(false);
        setNotice(`${updatedPages.length} page${updatedPages.length === 1 ? '' : 's'} published.`);
      }

      if (bulkAction === 'archive') {
        const pagesToArchive = selectedPages.filter((page) => page.status !== 'archived');
        if (pagesToArchive.length === 0) {
          setPendingBulkArchive(false);
          setNotice('Select at least one active page to archive.');
          return;
        }
        const updatedPages = await Promise.all(
          pagesToArchive.map((page) => archivePage(page.siteId || activeSiteId, page.id, {
            expectedUpdatedAt: page.lastUpdated,
          })),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
        setPendingBulkArchive(false);
        setNotice(`${updatedPages.length} page${updatedPages.length === 1 ? '' : 's'} archived.`);
      }

      if (bulkAction === 'unpublish') {
        const pagesToUnpublish = selectedPages.filter((page) => page.status === 'published' || page.status === 'scheduled');
        if (pagesToUnpublish.length === 0) {
          setPendingBulkUnpublish(false);
          setNotice('Select at least one published or scheduled page to unpublish.');
          return;
        }
        const updatedPages = await Promise.all(
          pagesToUnpublish.map((page) => unpublishPage(page.siteId || activeSiteId, page.id, {
            expectedUpdatedAt: page.lastUpdated,
          })),
        );
        updatedPages.forEach((page) => updatePage(page.id, page));
        setPendingBulkUnpublish(false);
        setNotice(`${updatedPages.length} page${updatedPages.length === 1 ? '' : 's'} unpublished.`);
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
      setPendingBulkUnpublish(false);
      setPendingBulkArchive(false);
      void refreshPages(activeSiteId);
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
      width: '64px',
      render: (page) => (
        <input
          type="checkbox"
          aria-label={`Select ${page.title}`}
          data-testid={`pages-select-${page.id}`}
          checked={selectedPageIds.has(page.id)}
          disabled={isPageBulkControlsBusy || !canRunAnyBulkAction}
          title={!canRunAnyBulkAction ? publishPermissionTitle || editPermissionTitle || deletePermissionTitle : undefined}
          onChange={() => togglePageSelection(page.id)}
          className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )
    },
    {
      key: 'title',
      label: 'Page Title',
      sortable: true,
      width: '260px',
      render: (page) => (
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            {page.isHomepage || page.slug === 'index' || page.slug === 'home' || page.slug === '' ? (
              <Home className="w-5 h-5 text-primary" />
            ) : (
              <Layout className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 max-w-full">
            <div className="break-words font-medium leading-5 text-foreground [overflow-wrap:anywhere]" title={page.title}>{page.title}</div>
            <div className="mt-0.5 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={pagePublicPath(page)}>{pagePublicPath(page)}</div>
          </div>
        </div>
      )
    },
    {
      key: 'slug',
      label: 'Route',
      width: '200px',
      render: (page) => (
        <PageRouteCell
          page={page}
          diagnostic={pageRouteDiagnostics[page.id]}
        />
      )
    },
    {
      key: 'template',
      label: 'Template',
      width: '190px',
      render: (page) => <PageTemplateCell page={page} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '125px',
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
      width: '190px',
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
      width: '160px',
      render: (page) => {
        const readiness = readinessMap[page.id];
        const firstIssue = readiness?.checks.find((check) => check.status !== 'pass');
        return readiness ? (
          <div className="flex flex-col gap-1">
            <StatusBadge
              status={readiness.statusLabel}
              type={readiness.statusLabel === 'ready' ? 'success' : readiness.statusLabel === 'blocked' ? 'error' : 'warning'}
            />
            <span className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{readiness.score}% ready · {readiness.elementCount} elements</span>
            {firstIssue && (
              <span className="max-w-full break-words text-xs text-muted-foreground [overflow-wrap:anywhere]" title={firstIssue.message}>
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
      width: '210px',
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
      width: '360px',
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
            health={deliveryHealthMap[page.id]}
            healthHistory={deliveryHealthHistoryMap[page.id] || []}
            isRefreshingHealth={refreshingDeliveryPageIds.has(page.id)}
            onRefreshHealth={() => void handleRefreshDeliveryHealth([page])}
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
      width: '145px',
      render: (page) => <span className="block min-w-0 break-words leading-5 text-muted-foreground [overflow-wrap:anywhere]">{formatDate(page.lastUpdated)}</span>
    },
    {
      key: 'actions',
      label: '',
      width: '220px',
      overflowMode: 'visible',
      render: (page) => {
        const readiness = readinessMap[page.id];
        const publishBlocker = readiness ? getPublishBlocker(readiness) : null;
        const routeBlocker = pageRouteDiagnostics[page.id]?.status === 'conflict'
          ? pageRouteDiagnostics[page.id]?.message
          : null;
        const rowActionStatusId = `pages-actions-status-${page.id}`;
        const rowMutationReason = isPageLibraryBusy || isPageRowMutationBusy
          ? 'Page actions are temporarily unavailable while Backy updates pages.'
          : null;
        const publishDisabledReason = !canPublishPages
          ? publishPermissionTitle || 'Your account cannot publish pages.'
          : routeBlocker
            ? `Resolve route before publishing: ${routeBlocker}`
            : publishBlocker
              ? `Resolve before publishing: ${publishBlocker}`
              : rowMutationReason;
        const unpublishDisabledReason = !canEditPages
          ? editPermissionTitle || 'Your account cannot edit pages.'
          : !canPublishPages
            ? publishPermissionTitle || 'Your account cannot publish pages.'
            : rowMutationReason;
        const archiveDisabledReason = !canEditPages
          ? editPermissionTitle || 'Your account cannot edit pages.'
          : rowMutationReason;
        const previewDisabledReason = !canPublishPages
          ? publishPermissionTitle || 'Your account cannot preview pages.'
          : isPageLibraryBusy || isPagePreviewBusy
            ? 'Page preview is temporarily unavailable while Backy updates pages.'
            : null;
        const editDisabledReason = !canEditPages
          ? editPermissionTitle || 'Your account cannot edit pages.'
          : isPageLibraryBusy || isPageBulkControlsBusy || mutatingPageId === page.id
            ? 'Page editing is temporarily unavailable while Backy updates pages.'
            : null;
        const deleteDisabledReason = !canDeletePages
          ? deletePermissionTitle || 'Your account cannot delete pages.'
          : rowMutationReason;
        const rowActionStatus = [
          page.status !== 'published'
            ? publishDisabledReason
              ? `Publish unavailable: ${publishDisabledReason}`
              : 'Publish available.'
            : null,
          page.status === 'published'
            ? unpublishDisabledReason
              ? `Unpublish unavailable: ${unpublishDisabledReason}`
              : 'Unpublish available.'
            : null,
          page.status !== 'archived'
            ? archiveDisabledReason
              ? `Archive unavailable: ${archiveDisabledReason}`
              : 'Archive available.'
            : null,
          page.status === 'published' ? 'Open published page available.' : null,
          previewDisabledReason ? `Preview unavailable: ${previewDisabledReason}` : 'Preview available.',
          editDisabledReason ? `Edit unavailable: ${editDisabledReason}` : 'Edit available.',
          deleteDisabledReason ? `Delete unavailable: ${deleteDisabledReason}` : 'Delete available.',
        ].filter(Boolean).join(' ');

        return (
          <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-1.5"
            role="group"
            aria-label={`Actions for ${page.title}`}
            aria-describedby={rowActionStatusId}
            data-testid={`pages-actions-${page.id}`}
            data-action-status={rowActionStatus}
          >
            <span
              id={rowActionStatusId}
              className="sr-only"
              data-testid={`pages-actions-status-${page.id}`}
            >
              {rowActionStatus}
            </span>
            {page.status !== 'published' && (
              <button
                onClick={() => {
                  if (publishDisabledReason) return;
                  setPendingPublishPage(page);
                }}
                disabled={Boolean(publishDisabledReason)}
                aria-disabled={Boolean(publishDisabledReason)}
                aria-describedby={rowActionStatusId}
                data-action-state={publishDisabledReason ? 'blocked' : 'ready'}
                data-disabled-reason={publishDisabledReason || undefined}
                title={publishDisabledReason || 'Publish page'}
                aria-label={`Publish ${page.title}`}
                data-testid={`pages-publish-${page.id}`}
                className="p-2 text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            {page.status === 'published' && (
              <button
                onClick={() => {
                  if (unpublishDisabledReason) return;
                  setPendingUnpublishPage(page);
                }}
                disabled={Boolean(unpublishDisabledReason)}
                aria-disabled={Boolean(unpublishDisabledReason)}
                aria-describedby={rowActionStatusId}
                data-action-state={unpublishDisabledReason ? 'blocked' : 'ready'}
                data-disabled-reason={unpublishDisabledReason || undefined}
                title={unpublishDisabledReason || 'Unpublish page'}
                aria-label={`Unpublish ${page.title}`}
                data-testid={`pages-unpublish-${page.id}`}
                className="p-2 text-muted-foreground hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}
            {page.status !== 'archived' && (
              <button
                onClick={() => {
                  if (archiveDisabledReason) return;
                  setPendingArchivePage(page);
                }}
                disabled={Boolean(archiveDisabledReason)}
                aria-disabled={Boolean(archiveDisabledReason)}
                aria-describedby={rowActionStatusId}
                data-action-state={archiveDisabledReason ? 'blocked' : 'ready'}
                data-disabled-reason={archiveDisabledReason || undefined}
                title={archiveDisabledReason || 'Archive page'}
                aria-label={`Archive ${page.title}`}
                data-testid={`pages-archive-${page.id}`}
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
                aria-label={`Open published page ${page.title}`}
                aria-describedby={rowActionStatusId}
                data-action-state="ready"
                data-testid={`pages-open-${page.id}`}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => {
                if (previewDisabledReason) return;
                void handlePreviewPage(page);
              }}
              disabled={Boolean(previewDisabledReason)}
              aria-disabled={Boolean(previewDisabledReason)}
              aria-describedby={rowActionStatusId}
              data-action-state={previewDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={previewDisabledReason || undefined}
              title={previewDisabledReason || 'Preview page'}
              aria-label={`Preview ${page.title}`}
              data-testid={`pages-preview-${page.id}`}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (editDisabledReason) return;
                navigate({ to: '/pages/$pageId/edit', params: { pageId: page.id }, search: { siteId: activeSiteId, focus: 'canvas' } });
              }}
              disabled={Boolean(editDisabledReason)}
              aria-disabled={Boolean(editDisabledReason)}
              aria-describedby={rowActionStatusId}
              data-action-state={editDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={editDisabledReason || undefined}
              title={editDisabledReason || 'Edit page'}
              aria-label={`Edit ${page.title}`}
              data-testid={`pages-edit-${page.id}`}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (deleteDisabledReason) return;
                setPendingDeletePage(page);
              }}
              disabled={Boolean(deleteDisabledReason)}
              aria-disabled={Boolean(deleteDisabledReason)}
              aria-describedby={rowActionStatusId}
              data-action-state={deleteDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={deleteDisabledReason || undefined}
              aria-label={`Delete ${page.title}`}
              title={deleteDisabledReason || 'Delete page'}
              data-testid={`pages-delete-${page.id}`}
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
  const visibleRevisionSummaryKey = useMemo(
    () => data.map((page) => page.id).join('|'),
    [data],
  );
  const visibleRevisionSummaryTargets = useMemo(
    () => data.map((page) => ({
      id: page.id,
      siteId: page.siteId || activeSiteId,
    })),
    [activeSiteId, visibleRevisionSummaryKey],
  );
  useEffect(() => {
    if (!canViewPages || visibleRevisionSummaryTargets.length === 0) return;

    const missingPages = visibleRevisionSummaryTargets.filter((page) => !revisionSummaryMap[page.id]);
    if (missingPages.length === 0) return;

    setIsLoadingRevisions(true);

    loadPageRevisionSummariesWithRetry(activeSiteId, missingPages)
      .then((summaries) => {
        if (Object.keys(summaries).length > 0) {
          setRevisionSummaryMap((current) => ({ ...current, ...summaries }));
        }
      })
      .finally(() => {
        setIsLoadingRevisions(false);
      });
  }, [activeSiteId, canViewPages, revisionSummaryMap, visibleRevisionSummaryTargets]);
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
  const hasPageFilters = searchQuery.trim().length > 0 || statusFilter !== 'all' || healthFilter !== 'all';
  const selectedTablePages = data.filter((page) => selectedPageIds.has(page.id));
  const selectedFilteredPages = filteredPages.filter((page) => selectedPageIds.has(page.id));
  const visiblePageIdSet = useMemo(() => new Set(data.map((page) => page.id)), [data]);
  const hiddenSelectedCount = Math.max(0, selectedPages.length - selectedTablePages.length);
  const filteredSelectionMode = filteredPages.length > data.length ? 'all-filtered' : 'visible-page';
  const allFilteredPagesSelected = filteredPages.length > 0 && selectedFilteredPages.length === filteredPages.length;
  const visibleSelectedCount = selectedTablePages.length;
  const bulkSelectionStatus = selectedPages.length === 0
    ? `No pages selected. ${data.length} visible page${data.length === 1 ? '' : 's'} on this table page.`
    : `${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'} selected. ${visibleSelectedCount} visible, ${hiddenSelectedCount} not visible, ${selectedFilteredPages.length} of ${filteredPages.length} filtered page${filteredPages.length === 1 ? '' : 's'} selected.`;
  const selectedUnpublishablePages = selectedPages.filter((page) => page.status === 'published' || page.status === 'scheduled');
  const selectedArchivablePages = selectedPages.filter((page) => page.status !== 'archived');
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
  const bulkActionLabel = getBulkActionLabel(bulkAction, selectedPages.length, pendingBulkDelete, pendingBulkPublish, pendingBulkUnpublish, pendingBulkArchive);
  const bulkBusyLabel = getBulkBusyLabel(bulkAction);
  const bulkPermissionTitle = bulkAction === 'publish'
    ? publishPermissionTitle
    : bulkAction === 'unpublish'
      ? editPermissionTitle || publishPermissionTitle
    : bulkAction === 'archive'
      ? editPermissionTitle
      : bulkAction === 'delete'
        ? deletePermissionTitle
        : !canRunAnyBulkAction
          ? publishPermissionTitle || editPermissionTitle || deletePermissionTitle
          : undefined;
  const selectedBulkActionAllowed = bulkAction === 'publish'
    ? canPublishPages
    : bulkAction === 'unpublish'
      ? canEditPages && canPublishPages
    : bulkAction === 'archive'
      ? canEditPages
    : bulkAction === 'delete'
      ? canDeletePages
      : true;
  const bulkActionReady = Boolean(
    bulkAction &&
    selectedPages.length > 0 &&
    !isPageMutationBusy &&
    selectedBulkActionAllowed &&
    !(bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0),
  );
  const bulkActionStatus = selectedPages.length === 0
    ? 'Select one or more pages to enable bulk actions.'
    : !bulkAction
      ? `Choose a bulk action for ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}.`
      : isPageMutationBusy
        ? 'Bulk actions are temporarily unavailable while Backy updates pages.'
        : !selectedBulkActionAllowed
          ? bulkPermissionTitle || 'Your account cannot run this bulk action.'
          : bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0
            ? `Resolve ${selectedKnownPublishBlockers.length} selected publish blocker${selectedKnownPublishBlockers.length === 1 ? '' : 's'} before publishing.`
            : `Ready to ${bulkActionLabel.toLowerCase()}.`;
  const bulkControlsBusyReason = isPageBulkControlsBusy
    ? 'Bulk page controls are temporarily unavailable while Backy loads or updates pages.'
    : '';
  const bulkSelectionPermissionReason = !canRunAnyBulkAction
    ? bulkPermissionTitle || 'Your account cannot run page bulk actions.'
    : '';
  const selectVisibleDisabledReason = data.length === 0
    ? 'No visible pages are available to select.'
    : bulkControlsBusyReason || bulkSelectionPermissionReason;
  const selectFilteredDisabledReason = filteredPages.length === 0
    ? 'No filtered pages are available to select.'
    : bulkControlsBusyReason || bulkSelectionPermissionReason;
  const bulkActionSelectDisabledReason = bulkControlsBusyReason || bulkSelectionPermissionReason;
  const bulkActionApplyDisabledReason = selectedPages.length === 0
    ? 'Select one or more pages before applying this bulk action.'
    : !bulkAction
      ? 'Choose a bulk action before applying it.'
      : isPageMutationBusy
        ? 'Bulk page actions are temporarily unavailable while Backy updates pages.'
        : !selectedBulkActionAllowed
          ? bulkPermissionTitle || 'Your account cannot run this bulk action.'
          : bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0
            ? `Resolve ${selectedKnownPublishBlockers.length} selected publish blocker${selectedKnownPublishBlockers.length === 1 ? '' : 's'} before publishing.`
            : '';
  const clearSelectionDisabledReason = isPageBulkControlsBusy
    ? 'Selection cannot be cleared while Backy is loading or updating pages.'
    : '';
  const bulkGroupActionStatus = `${bulkSelectionStatus} ${bulkActionStatus}`;
  const selectedPageLaunchHandoff = useMemo(() => {
    const generatedAt = new Date().toISOString();
    const site = {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: siteSlug,
    };

    if (!apiPage) {
      return {
        schema: 'backy.page-launch-readiness.v1',
        generatedAt,
        site,
        selectedPage: null,
        route: null,
        readiness: null,
        delivery: null,
        revisions: null,
        frontendContract: {
          state: 'empty-page-library',
          pageApi: publicPagesUrl,
          createRoute: buildBackyCanvasPageCreateRoute(),
        },
        nextSteps: [
          'Create a page for this site.',
          'Run readiness before handing the page to a hosted or custom frontend.',
        ],
      };
    }

    const pageSiteId = apiPage.siteId || activeSiteId;
    const pagePath = pagePublicPath(apiPage);
    const encodedSiteId = encodeURIComponent(pageSiteId);
    const encodedPageId = encodeURIComponent(apiPage.id);
    const encodedPath = encodeURIComponent(pagePath);
    const encodedSlug = encodeURIComponent(apiPage.slug || pagePath.replace(/^\/+/, '') || 'home');
    const templateInfo = pageTemplateInfo(apiPage);
    const routeDiagnostic = pageRouteDiagnostics[apiPage.id] || {
      path: pagePath,
      status: 'available' as const,
      message: 'Route is available.',
      conflictIds: [],
    };
    const readiness = readinessMap[apiPage.id];
    const deliveryStatus = getPageDeliveryStatus(apiPage, readiness, routeDiagnostic);
    const revisionSummary = revisionSummaryMap[apiPage.id];
    const latestRevision = revisionSummary?.latest || null;
    const deliveryHealth = deliveryHealthMap[apiPage.id] || null;
    const deliveryHealthHistory = deliveryHealthHistoryMap[apiPage.id] || [];
    const pageBySlugUrl = `${publicBaseUrl}/api/sites/${encodedSiteId}/pages?slug=${encodedSlug}`;
    const renderUrl = `${publicBaseUrl}/api/sites/${encodedSiteId}/render?path=${encodedPath}`;
    const resolveUrl = `${publicBaseUrl}/api/sites/${encodedSiteId}/resolve?path=${encodedPath}`;
    const adminDetailUrl = `${adminBaseUrl}/sites/${encodedSiteId}/pages/${encodedPageId}`;
    const adminReadinessUrl = `${adminDetailUrl}/readiness`;
    const previewEndpoint = `${adminDetailUrl}/preview`;
    const adminEditRoute = `/pages/${encodedPageId}/edit?siteId=${encodedSiteId}`;
    const readinessBlocker = readiness ? getPublishBlocker(readiness) : null;
    const routeBlocker = routeDiagnostic.status === 'conflict' ? routeDiagnostic.message : null;
    const publishBlockers = [routeBlocker, readinessBlocker].filter((blocker): blocker is string => Boolean(blocker));

    return {
      schema: 'backy.page-launch-readiness.v1',
      generatedAt,
      site,
      selectedPage: {
        id: apiPage.id,
        title: apiPage.title,
        slug: apiPage.slug,
        path: pagePath,
        status: apiPage.status,
        isHomepage: Boolean(apiPage.isHomepage),
        parentId: apiPage.parentId || null,
        parentTitle: getParentPageTitle(apiPage, activeSitePageMap) || null,
        template: templateInfo,
        navigation: {
          placement: pageMetaString(apiPage, 'navigationPlacement') || null,
          label: pageMetaString(apiPage, 'navigationLabel') || null,
        },
        editorRoute: adminEditRoute,
      },
      route: {
        path: routeDiagnostic.path,
        status: routeDiagnostic.status,
        message: routeDiagnostic.message,
        conflictIds: routeDiagnostic.conflictIds,
      },
      readiness: readiness
        ? {
            score: readiness.score,
            statusLabel: readiness.statusLabel,
            elementCount: readiness.elementCount,
            checks: readiness.checks.map((check) => ({
              label: check.label,
              status: check.status,
              severity: check.severity,
              message: check.message,
            })),
            publishBlocker: readinessBlocker,
          }
        : {
            score: null,
            statusLabel: 'not-checked',
            elementCount: null,
            checks: [],
            publishBlocker: 'Run readiness before publishing or handing this page to a custom frontend.',
          },
      delivery: {
        status: deliveryStatus,
        publicUrl: apiPage.status === 'published' && deliveryStatus !== 'blocked' ? publicPageUrl(apiPage) : null,
        pageBySlugUrl,
        renderUrl,
        resolveUrl,
        previewEndpoint,
        adminDetailUrl,
        adminReadinessUrl,
        health: deliveryHealth,
        healthHistory: deliveryHealthHistory,
      },
      revisions: {
        count: revisionSummary?.count ?? 0,
        historyRoute: `${adminEditRoute}#page-editor-revisions`,
        latest: latestRevision
          ? {
              id: latestRevision.id,
              note: latestRevision.note,
              createdAt: latestRevision.createdAt,
              status: latestRevision.snapshotStatus,
            }
          : null,
      },
      frontendContract: {
        state: publishBlockers.length === 0 ? 'launchable' : 'blocked',
        selectedPageSource: selectedPages.length > 0 ? 'bulk-selection' : apiPage.status === 'published' ? 'first-published-page' : 'first-site-page',
        pageApi: pageBySlugUrl,
        renderApi: renderUrl,
        resolveApi: resolveUrl,
        previewApi: previewEndpoint,
        readinessApi: adminReadinessUrl,
        publicDeliveryRequires: 'published status, available route, passing readiness, and healthy public/render/resolve probes',
      },
      publishBlockers,
      nextSteps: publishBlockers.length === 0
        ? [
            'Open the visual editor for final content or layout edits.',
            'Use render or resolve APIs from custom frontends.',
            'Refresh delivery health after publish or domain changes.',
          ]
        : [
            'Resolve the listed route or readiness blockers.',
            'Run readiness again before publish.',
            'Copy this handoff after the selected page is launchable.',
          ],
    };
  }, [
    activeSite?.name,
    activeSiteId,
    activeSitePageMap,
    adminBaseUrl,
    apiPage,
    buildBackyCanvasPageCreateRoute,
    deliveryHealthHistoryMap,
    deliveryHealthMap,
    pageRouteDiagnostics,
    publicBaseUrl,
    publicPagesUrl,
    readinessMap,
    revisionSummaryMap,
    selectedPages.length,
    siteSlug,
  ]);
  const selectedPageLaunchHandoffText = useMemo(
    () => JSON.stringify(selectedPageLaunchHandoff, null, 2),
    [selectedPageLaunchHandoff],
  );
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
      collections: '/collections',
      media: '/media',
      forms: '/forms',
      products: '/products',
      blog: '/blog',
      settings: '/settings',
      blankPageTemplate: buildBackyCanvasPageCreateRoute(),
      landingPageTemplate: buildBackyCanvasPageCreateRoute('landing'),
      contactPageTemplate: buildBackyCanvasPageCreateRoute('contact'),
      newsletterPageTemplate: buildBackyCanvasPageCreateRoute('newsletter'),
      surveyPageTemplate: buildBackyCanvasPageCreateRoute('survey'),
      registrationPageTemplate: buildBackyCanvasPageCreateRoute('registration'),
      memberLoginPageTemplate: buildBackyCanvasPageCreateRoute('member-login'),
      memberAccountPageTemplate: buildBackyCanvasPageCreateRoute('member-account'),
      storefrontPageTemplate: buildBackyCanvasPageCreateRoute('storefront'),
      productDetailPageTemplate: buildBackyCanvasPageCreateRoute('product-detail'),
      pricingPageTemplate: buildBackyCanvasPageCreateRoute('pricing'),
      servicesPageTemplate: buildBackyCanvasPageCreateRoute('services'),
      bookingPageTemplate: buildBackyCanvasPageCreateRoute('booking'),
      portfolioPageTemplate: buildBackyCanvasPageCreateRoute('portfolio'),
      galleryPageTemplate: buildBackyCanvasPageCreateRoute('gallery'),
      eventsPageTemplate: buildBackyCanvasPageCreateRoute('events'),
      privacyPageTemplate: buildBackyCanvasPageCreateRoute('privacy'),
      termsPageTemplate: buildBackyCanvasPageCreateRoute('terms'),
      cookiePolicyPageTemplate: buildBackyCanvasPageCreateRoute('cookie-policy'),
      accessibilityStatementPageTemplate: buildBackyCanvasPageCreateRoute('accessibility-statement'),
      refundPolicyPageTemplate: buildBackyCanvasPageCreateRoute('refund-policy'),
      shippingPolicyPageTemplate: buildBackyCanvasPageCreateRoute('shipping-policy'),
      cartPageTemplate: buildBackyCanvasPageCreateRoute('cart'),
      checkoutPageTemplate: buildBackyCanvasPageCreateRoute('checkout'),
      orderConfirmationPageTemplate: buildBackyCanvasPageCreateRoute('order-confirmation'),
      helpCenterPageTemplate: buildBackyCanvasPageCreateRoute('help-center'),
      faqPageTemplate: buildBackyCanvasPageCreateRoute('faq'),
      testimonialsPageTemplate: buildBackyCanvasPageCreateRoute('testimonials'),
      blogIndexPageTemplate: buildBackyCanvasPageCreateRoute('blog-index'),
      blogPostPageTemplate: buildBackyCanvasPageCreateRoute('blog-post'),
      teamPageTemplate: buildBackyCanvasPageCreateRoute('team'),
      careersPageTemplate: buildBackyCanvasPageCreateRoute('careers'),
      aboutPageTemplate: buildBackyCanvasPageCreateRoute('about'),
    },
    export: {
      format: 'csv',
      columns: PAGE_EXPORT_COLUMNS,
      filteredRows: filteredPages.length,
    },
    builderSystems: PAGE_BUILDER_SYSTEMS,
    bindingContract: {
      model: 'Pages are the composition layer for static sections, custom collections, blog posts, products, forms, media, and user state.',
      targets: PAGE_BINDING_TARGETS,
      activeSite: {
        id: activeSiteId,
        name: activeSite?.name || activeSiteId,
        slug: siteSlug,
      },
      createRoutes: {
        blank: buildBackyCanvasPageCreateRoute(),
        landing: buildBackyCanvasPageCreateRoute('landing'),
        contact: buildBackyCanvasPageCreateRoute('contact'),
        newsletter: buildBackyCanvasPageCreateRoute('newsletter'),
        survey: buildBackyCanvasPageCreateRoute('survey'),
        registration: buildBackyCanvasPageCreateRoute('registration'),
        memberLogin: buildBackyCanvasPageCreateRoute('member-login'),
        memberAccount: buildBackyCanvasPageCreateRoute('member-account'),
        storefront: buildBackyCanvasPageCreateRoute('storefront'),
        productDetail: buildBackyCanvasPageCreateRoute('product-detail'),
        pricing: buildBackyCanvasPageCreateRoute('pricing'),
        services: buildBackyCanvasPageCreateRoute('services'),
        booking: buildBackyCanvasPageCreateRoute('booking'),
        portfolio: buildBackyCanvasPageCreateRoute('portfolio'),
        gallery: buildBackyCanvasPageCreateRoute('gallery'),
        events: buildBackyCanvasPageCreateRoute('events'),
        privacy: buildBackyCanvasPageCreateRoute('privacy'),
        terms: buildBackyCanvasPageCreateRoute('terms'),
        cookiePolicy: buildBackyCanvasPageCreateRoute('cookie-policy'),
        accessibilityStatement: buildBackyCanvasPageCreateRoute('accessibility-statement'),
        refundPolicy: buildBackyCanvasPageCreateRoute('refund-policy'),
        shippingPolicy: buildBackyCanvasPageCreateRoute('shipping-policy'),
        cart: buildBackyCanvasPageCreateRoute('cart'),
        checkout: buildBackyCanvasPageCreateRoute('checkout'),
        orderConfirmation: buildBackyCanvasPageCreateRoute('order-confirmation'),
        helpCenter: buildBackyCanvasPageCreateRoute('help-center'),
        faq: buildBackyCanvasPageCreateRoute('faq'),
        testimonials: buildBackyCanvasPageCreateRoute('testimonials'),
        blogIndex: buildBackyCanvasPageCreateRoute('blog-index'),
        blogPost: buildBackyCanvasPageCreateRoute('blog-post'),
        team: buildBackyCanvasPageCreateRoute('team'),
        careers: buildBackyCanvasPageCreateRoute('careers'),
        about: buildBackyCanvasPageCreateRoute('about'),
      },
    },
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
      const templateInfo = pageTemplateInfo(page);

      return {
        id: page.id,
        title: page.title,
        slug: page.slug,
        path: pagePath,
        template: templateInfo,
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
          health: deliveryHealthMap[page.id] || null,
          healthHistory: deliveryHealthHistoryMap[page.id] || [],
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
    selectedPageLaunchReadiness: selectedPageLaunchHandoff,
    workflows: pageDesignReadiness.workflow,
    guardrails: [
      'Use the visual editor for canvas, section, grouping, media, and publish changes.',
      'Run readiness before handing a page to a custom frontend.',
      'Archive a page instead of deleting when URL history, SEO, or ownership matters.',
      'The create entry points all route to /pages/new with siteId, templateSource=backy-canvas, and focus=canvas.',
    ],
  }), [
    activeSite?.name,
    activeSiteId,
    adminPageDetailUrl,
    adminPagePreviewUrl,
    adminPageReadinessUrl,
    adminPagesUrl,
    apiPage,
    buildBackyCanvasPageCreateRoute,
    currentPage,
    data,
    healthFilter,
    pageDesignReadiness.checks,
    pageDesignReadiness.score,
    pageDesignReadiness.workflow,
    pageMetrics,
    pageChildCountMap,
    pageRouteDiagnostics,
    deliveryHealthMap,
    deliveryHealthHistoryMap,
    refreshingDeliveryPageIds,
    filteredPages,
    publicPageBySlugUrl,
    publicPagesUrl,
    publicRenderUrl,
    publicResolveUrl,
    readinessMap,
    revisionSummaryMap,
    searchQuery,
    selectedPages.length,
    selectedPageLaunchHandoff,
    siteSlug,
    statusFilter,
    activeSitePageMap,
    totalItems,
    totalPages,
  ]);
  const pageHandoffText = useMemo(() => JSON.stringify(pageHandoff, null, 2), [pageHandoff]);
  const pagesCommandSecondaryActionStatusId = 'pages-command-secondary-action-status';
  const pagesCommandBusyDisabledReason = isPageLibraryBusy
    ? 'Pages command actions are temporarily unavailable while Backy loads pages.'
    : '';
  const pagesCommandViewDisabledReason = !canViewPages
    ? viewPermissionTitle || 'Your account needs pages.view to use page handoff actions.'
    : '';
  const pagesCommandCopyDisabledReason = pagesCommandBusyDisabledReason || pagesCommandViewDisabledReason;
  const pagesCommandDownloadDisabledReason = pagesCommandBusyDisabledReason || pagesCommandViewDisabledReason;
  const pagesCommandExportDisabledReason = pagesCommandBusyDisabledReason ||
    pagesCommandViewDisabledReason ||
    (filteredPages.length === 0 ? 'No filtered pages are available to export.' : '');
  const pagesCommandCopyActionStatus = pagesCommandCopyDisabledReason
    ? `Copy handoff blocked: ${pagesCommandCopyDisabledReason}`
    : `Copy handoff available for ${activeSiteId}.`;
  const pagesCommandDownloadActionStatus = pagesCommandDownloadDisabledReason
    ? `Download JSON blocked: ${pagesCommandDownloadDisabledReason}`
    : `Download JSON available for ${activeSiteId}.`;
  const pagesCommandExportActionStatus = pagesCommandExportDisabledReason
    ? `Export CSV blocked: ${pagesCommandExportDisabledReason}`
    : `Export CSV available for ${filteredPages.length} filtered page${filteredPages.length === 1 ? '' : 's'}.`;
  const pagesCommandSecondaryActionStatus = [
    pagesCommandCopyActionStatus,
    pagesCommandDownloadActionStatus,
    pagesCommandExportActionStatus,
  ].join(' ');
  const pagesCommandSecondaryActionState = pagesCommandCopyDisabledReason &&
    pagesCommandDownloadDisabledReason &&
    pagesCommandExportDisabledReason
    ? 'blocked'
    : 'ready';

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
    if (!canViewPages) {
      setNotice(viewPermissionTitle || 'Your account cannot export pages.');
      return;
    }

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

  if (!isPermissionsLoading && !canViewPages) {
    return (
      <PageShell
        title="Pages unavailable"
        description={viewPermissionTitle || 'Your account cannot view pages.'}
      >
        <div
          role="alert"
          data-testid="pages-permission-state"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Page permissions could not be verified</p>
                <p className="mt-1 leading-6">
                  {permissionError || viewPermissionTitle || 'Ask an owner or admin to grant pages.view access.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadPagePermissions}
                disabled={isPermissionsLoading}
                aria-label="Retry loading page permissions"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry permissions
              </button>
              <Link
                to="/users"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
              >
                Review users
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Pages"
      description="Manage the structure and content of your site."
      action={
        <Link
          to="/pages/new"
          search={createPageSearch}
          aria-disabled={createPageLinkDisabled}
          aria-describedby={createPageActionStatusId}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors',
            createPageLinkDisabled && 'pointer-events-none opacity-60',
          )}
          title={createPageActionDisabledReason || undefined}
          aria-label="Create new page for active site"
          data-action-state={createPageActionDisabledReason ? 'blocked' : 'ready'}
          data-action-status={createPageActionStatus}
          data-disabled-reason={createPageActionDisabledReason || undefined}
          data-target-site-id={activeSiteId}
          data-testid="pages-header-create"
        >
          <Plus className="w-4 h-4" />
          New Page
        </Link>
      }
      className="w-full"
    >
      {error && (
        <div
          role="alert"
          data-testid="pages-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Pages workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasPageFilters && (
                <button
                  type="button"
                  onClick={clearPageFilters}
                  disabled={isPageLibraryBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              )}
                <button
                  type="button"
                  onClick={() => void refreshPages(activeSiteId)}
                  disabled={isPageRefreshBusy || !canViewPages}
                  title={!canViewPages ? viewPermissionTitle : undefined}
                  aria-label="Retry loading pages"
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                Retry load
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin text-sky-700" />
          <span>
            {isBlockingInitialPageLoad ? 'Loading pages from backend...' : 'Refreshing pages in the background. Current rows stay usable while Backy syncs. Create actions stay usable too.'}
          </span>
        </div>
      )}
      <span id={createPageActionStatusId} className="sr-only" data-testid="pages-create-action-status" aria-live="polite">
        {createPageActionStatus}
      </span>
      <span id={pagesCommandSecondaryActionStatusId} className="sr-only" data-testid="pages-command-secondary-action-status" aria-live="polite">
        {pagesCommandSecondaryActionStatus}
      </span>

      <section className="mb-5 rounded-lg border border-border bg-card shadow-sm" data-testid="pages-command-center">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-5">
          <div className="min-w-0">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            <Link
              to="/pages/new"
              search={createPageSearch}
              aria-disabled={createPageLinkDisabled}
              aria-describedby={createPageActionStatusId}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
                createPageLinkDisabled && 'pointer-events-none opacity-60',
              )}
              title={createPageActionDisabledReason || undefined}
              data-action-state={createPageActionDisabledReason ? 'blocked' : 'ready'}
              data-action-status={createPageActionStatus}
              data-disabled-reason={createPageActionDisabledReason || undefined}
              data-target-site-id={activeSiteId}
              data-testid="pages-command-create"
            >
              <Plus className="size-4" />
              New Page
            </Link>
            <button
              type="button"
              onClick={() => void refreshPages(activeSiteId)}
              disabled={isPageRefreshBusy || !canViewPages}
              title={!canViewPages ? viewPermissionTitle : undefined}
              aria-label="Refresh page library"
              data-testid="pages-command-refresh"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
              Refresh pages
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshDeliveryHealth()}
              disabled={isLoading || isRefreshingAllDeliveryHealth || deliveryProbeTargets.length === 0 || !canViewPages}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="pages-refresh-delivery-health"
              title={!canViewPages ? viewPermissionTitle : deliveryProbeTargets.length === 0 ? 'No published pages are ready for delivery health checks' : 'Refresh published page delivery health'}
              aria-label="Refresh delivery health for published pages"
            >
              <RefreshCw className={cn('size-4', isRefreshingAllDeliveryHealth && 'animate-spin')} />
              Refresh delivery
            </button>
            <details
              className="group relative"
              aria-describedby={pagesCommandSecondaryActionStatusId}
              data-action-state={pagesCommandSecondaryActionState}
              data-action-status={pagesCommandSecondaryActionStatus}
              data-testid="pages-command-secondary-actions"
            >
              <summary
                aria-label="Show page export and handoff actions"
                className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
              >
                <MoreHorizontal className="size-4" />
                More actions
              </summary>
              <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-48">
                <button
                  type="button"
                  onClick={() => void copyPageApiText(pageHandoffText, 'Pages handoff manifest')}
                  disabled={Boolean(pagesCommandCopyDisabledReason)}
                  title={pagesCommandCopyDisabledReason || 'Copy pages handoff manifest'}
                  aria-label="Copy pages handoff manifest"
                  aria-describedby={pagesCommandSecondaryActionStatusId}
                  data-action-state={pagesCommandCopyDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={pagesCommandCopyActionStatus}
                  data-disabled-reason={pagesCommandCopyDisabledReason || undefined}
                  data-testid="pages-command-copy-handoff"
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy className="size-4" />
                  Copy handoff
                </button>
                <button
                  type="button"
                  onClick={downloadPageHandoff}
                  disabled={Boolean(pagesCommandDownloadDisabledReason)}
                  title={pagesCommandDownloadDisabledReason || 'Download pages handoff JSON'}
                  aria-label="Download pages handoff JSON"
                  aria-describedby={pagesCommandSecondaryActionStatusId}
                  data-action-state={pagesCommandDownloadDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={pagesCommandDownloadActionStatus}
                  data-disabled-reason={pagesCommandDownloadDisabledReason || undefined}
                  data-testid="pages-command-download-handoff"
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="size-4" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={downloadPagesCsv}
                  disabled={Boolean(pagesCommandExportDisabledReason)}
                  title={pagesCommandExportDisabledReason || 'Export filtered pages CSV'}
                  aria-label="Export filtered pages CSV"
                  aria-describedby={pagesCommandSecondaryActionStatusId}
                  data-action-state={pagesCommandExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={pagesCommandExportActionStatus}
                  data-disabled-reason={pagesCommandExportDisabledReason || undefined}
                  data-testid="pages-command-export-csv"
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="size-4" />
                  Export CSV
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border bg-background/55 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Pages', value: pageMetrics.total, detail: `${pageMetrics.draft} drafts` },
            { label: 'Published', value: pageMetrics.published, detail: 'Live routes' },
            { label: 'Blocked', value: pageMetrics.blocked, detail: 'Needs attention' },
            { label: 'Readiness', value: `${pageDesignReadiness.score}%`, detail: `${pageDesignReadiness.readyCount}/${pageDesignReadiness.total} checks` },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <span className="font-mono text-xl font-semibold text-foreground">{metric.value}</span>
                <span className="truncate text-xs text-muted-foreground">{metric.detail}</span>
              </div>
            </div>
          ))}
        </div>

        <details className="group border-t border-border" data-testid="pages-readiness-details">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
            <span>Page library readiness and workflow</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="grid gap-3 border-t border-border p-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:p-5">
            <div className="rounded-lg bg-background p-4 ring-1 ring-border/70">
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

            <div className="rounded-lg bg-background p-4 ring-1 ring-border/70">
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
        </details>

      </section>

      <details
        className="group mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        data-testid="pages-starter-library"
        data-disclosure="advanced-page-workflows"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">Create a page for this site</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                Starters, connected workflows, and handoff shortcuts stay here when needed.
              </span>
            </span>
          </span>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">
            Show advanced
          </span>
          <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">
            Hide advanced
          </span>
        </summary>

        <div className="space-y-4 border-t border-border p-4 lg:p-5">
        <div className="rounded-lg bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Pages control map</h3>
            <p className="text-sm text-muted-foreground">Jump directly to the operational area you need.</p>
          </div>
          <nav className="mt-3 flex flex-wrap gap-2" aria-label="Pages control map">
            {PAGES_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                aria-label={`${area.title}: ${area.detail}`}
                aria-disabled={isPageLibraryBusy}
                onClick={(event) => {
                  if (isPageLibraryBusy) event.preventDefault();
                }}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5',
                  isPageLibraryBusy && 'pointer-events-none opacity-60',
                )}
              >
                {area.title}
              </a>
            ))}
          </nav>
        </div>

        <details className="mt-4 rounded-lg border border-border bg-muted/30 p-4" data-testid="pages-starter-drawer">
          <summary className="cursor-pointer list-none rounded-md outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Create a page for this site</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    Open the starter catalog only when you need a guided scaffold; the primary New Page action starts a clean editable page.
                  </span>
                </span>
              </span>
              <span className="rounded-md bg-card px-2 py-1 text-xs font-semibold text-muted-foreground">
                Show {PAGE_CREATION_SHORTCUTS.length} starters
              </span>
            </span>
          </summary>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(220px,0.32fr)_minmax(0,1fr)]">
            <div className="rounded-lg bg-card p-4">
              <div className="text-sm font-semibold">Starter groups</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Pick the closest starter, then refine it in the same visual editor. Nothing here is a separate builder mode.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 xl:flex-col">
                {pageStarterGroups.map((group) => (
                  <a
                    key={group.id}
                    href={`#pages-starter-${group.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span>{group.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{group.shortcuts.length}</span>
                  </a>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {PAGE_CREATION_SHORTCUTS.length} starters · {activeSite?.name || activeSiteId}
              </div>
            </div>

            <div className="rounded-lg bg-card p-2">
              <div className="max-h-[34rem] space-y-3 overflow-y-auto overscroll-contain pr-1" data-testid="pages-starter-scroll-region">
                {pageStarterGroups.map((group) => (
                  <section
                    key={group.id}
                    id={`pages-starter-${group.id}`}
                    className="scroll-mt-24 rounded-lg bg-background p-3 ring-1 ring-border/70"
                  >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{group.detail}</p>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {group.shortcuts.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                    {group.shortcuts.map((shortcut) => {
                      const ShortcutIcon = shortcut.icon;

                      return (
                        <Link
                          key={shortcut.key}
                          to="/pages/new"
                          search={getCreatePageSearch(shortcut.key)}
                          aria-disabled={createPageLinkDisabled}
                          aria-describedby={createPageActionStatusId}
                          className={cn(
                            'group flex min-h-16 items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring active:scale-[0.99]',
                            createPageLinkDisabled && 'pointer-events-none opacity-60',
                          )}
                          title={createPageActionDisabledReason || undefined}
                          data-action-state={createPageActionDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={createPageActionStatus}
                          data-disabled-reason={createPageActionDisabledReason || undefined}
                          data-target-site-id={activeSiteId}
                          data-testid={`pages-create-${shortcut.key}`}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                            <ShortcutIcon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{shortcut.title}</span>
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {shortcut.badge}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{shortcut.detail}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </details>

        <div className="rounded-lg bg-muted/30 p-4">
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
          <div className="mt-4 flex flex-wrap gap-2">
            {PAGE_WORKFLOW_SURFACES.map((surface) => (
              <Link
                key={surface.key}
                to={surface.route}
                search={surface.route === '/settings' ? undefined : { siteId: activeSiteId }}
                aria-disabled={isPageLibraryBusy}
                aria-label={`${surface.title}: ${surface.detail}`}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5',
                  isPageLibraryBusy && 'pointer-events-none opacity-60',
                )}
              >
                {surface.title}
              </Link>
            ))}
          </div>
        </div>
        </div>
      </details>

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div id="pages-health" className="grid gap-3 scroll-mt-24 md:grid-cols-5">
          {[
            { key: 'all', label: 'All', value: pageMetrics.total, ariaLabel: `Show all ${pageMetrics.total} pages`, onSelect: () => setPageStatusFilter('all'), active: statusFilter === 'all' && healthFilter === 'all' },
            { key: 'published', label: 'Published', value: pageMetrics.published, ariaLabel: `Show ${pageMetrics.published} published pages`, onSelect: () => setPageStatusFilter('published'), active: statusFilter === 'published' && healthFilter === 'all' },
            { key: 'draft', label: 'Draft', value: pageMetrics.draft, ariaLabel: `Show ${pageMetrics.draft} draft pages`, onSelect: () => setPageStatusFilter('draft'), active: statusFilter === 'draft' && healthFilter === 'all' },
            { key: 'blocked', label: 'Blocked', value: pageMetrics.blocked, ariaLabel: `Show ${pageMetrics.blocked} blocked pages`, onSelect: showBlockedPages, active: healthFilter === 'blocked' },
            { key: 'routes', label: 'Routes', value: pageMetrics.routeConflicts, ariaLabel: `Show ${pageMetrics.routeConflicts} route conflict pages`, onSelect: showRouteConflicts, active: healthFilter === 'route-conflicts' },
          ].map((metric) => (
            <button
              key={metric.key}
              type="button"
              onClick={metric.onSelect}
              disabled={isPageLibraryBusy}
              aria-pressed={metric.active}
              aria-label={metric.ariaLabel}
              data-testid={`pages-metric-filter-${metric.key}`}
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

      <details
        id="pages-api"
        className="group mb-6 overflow-hidden rounded-lg border border-border bg-card scroll-mt-24"
        data-testid="pages-api-contract"
        data-disclosure="page-api-contract"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Code2 className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">Page API contract</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                Public render, resolve, preview, readiness, and frontend handoff details.
              </span>
            </span>
          </span>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">
            Show details
          </span>
          <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">
            Hide details
          </span>
        </summary>

        <div className="border-t border-border">
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
	              disabled={isPageLibraryBusy || !canViewPages}
	              title={!canViewPages ? viewPermissionTitle : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Copy pages API URL"
            >
              <Copy className="h-4 w-4" />
              Copy pages API
            </button>
            <button
              type="button"
	              onClick={() => void copyPageApiText(pageHandoffText, 'Pages handoff manifest')}
	              disabled={isPageLibraryBusy || !canViewPages}
	              title={!canViewPages ? viewPermissionTitle : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Copy pages handoff manifest"
            >
              <Copy className="h-4 w-4" />
              Copy handoff
            </button>
            <button
              type="button"
	              onClick={downloadPagesCsv}
	              disabled={filteredPages.length === 0 || isPageLibraryBusy || !canViewPages}
	              title={!canViewPages ? viewPermissionTitle : undefined}
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

          <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="pages-api-details">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span>API, readiness, and frontend handoff details</span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
              <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
            </summary>
            <div className="border-t border-border p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
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

          <div
            data-testid="pages-selected-launch-handoff"
            data-schema={selectedPageLaunchHandoff.schema}
            data-selected-page-id={selectedPageLaunchHandoff.selectedPage?.id || ''}
            data-delivery-status={selectedPageLaunchHandoff.delivery?.status || 'empty'}
            className="mt-4 rounded-lg border border-border bg-background p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Selected page launch handoff</h3>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Copy the page-level route, readiness, preview, revision, and delivery contract for the current selection or API page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyPageApiText(selectedPageLaunchHandoffText, 'Selected page launch readiness handoff')}
                disabled={isPageLibraryBusy || !canViewPages}
                title={!canViewPages ? viewPermissionTitle : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Copy selected page launch readiness handoff"
              >
                <Copy className="h-4 w-4" />
                Copy launch JSON
              </button>
            </div>

            {selectedPageLaunchHandoff.selectedPage && selectedPageLaunchHandoff.route && selectedPageLaunchHandoff.readiness && selectedPageLaunchHandoff.delivery ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <PageApiStat label="Selected page" value={selectedPageLaunchHandoff.selectedPage.title} />
                  <PageApiStat label="Route" value={selectedPageLaunchHandoff.route.path} />
                  <PageApiStat label="Template" value={selectedPageLaunchHandoff.selectedPage.template.label} />
                  <PageApiStat label="Revision count" value={`${selectedPageLaunchHandoff.revisions?.count ?? 0}`} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground">Readiness</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={selectedPageLaunchHandoff.readiness.statusLabel}
                        type={selectedPageLaunchHandoff.readiness.statusLabel === 'ready'
                          ? 'success'
                          : selectedPageLaunchHandoff.readiness.statusLabel === 'blocked'
                            ? 'error'
                            : 'warning'}
                      />
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {selectedPageLaunchHandoff.readiness.score === null ? 'pending' : `${selectedPageLaunchHandoff.readiness.score}%`}
                      </span>
                      {selectedPageLaunchHandoff.readiness.elementCount !== null && (
                        <span className="text-xs text-muted-foreground">
                          {selectedPageLaunchHandoff.readiness.elementCount} elements
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedPageLaunchHandoff.readiness.publishBlocker || 'No readiness blocker recorded.'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground">Route and publish state</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={selectedPageLaunchHandoff.route.status}
                        type={selectedPageLaunchHandoff.route.status === 'conflict'
                          ? 'error'
                          : selectedPageLaunchHandoff.route.status === 'warning'
                            ? 'warning'
                            : 'success'}
                      />
                      <StatusBadge
                        status={selectedPageLaunchHandoff.delivery.status}
                        type={selectedPageLaunchHandoff.delivery.status === 'published'
                          ? 'success'
                          : selectedPageLaunchHandoff.delivery.status === 'blocked'
                            ? 'error'
                            : 'warning'}
                      />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedPageLaunchHandoff.route.message}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground">Delivery health</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={selectedPageLaunchHandoff.delivery.health?.status || 'not probed'}
                        type={selectedPageLaunchHandoff.delivery.health?.status === 'healthy'
                          ? 'success'
                          : selectedPageLaunchHandoff.delivery.health?.status === 'error'
                            ? 'error'
                            : selectedPageLaunchHandoff.delivery.health?.status === 'warning'
                              ? 'warning'
                              : 'info'}
                      />
                      <span className="text-xs text-muted-foreground">
                        {selectedPageLaunchHandoff.delivery.healthHistory.length} recent probe{selectedPageLaunchHandoff.delivery.healthHistory.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedPageLaunchHandoff.delivery.health?.message || 'Publish and refresh delivery to probe public, render, and resolve endpoints.'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <PageApiSnippet label="Selected page API" value={selectedPageLaunchHandoff.delivery.pageBySlugUrl} />
                  <PageApiSnippet label="Render selected page" value={selectedPageLaunchHandoff.delivery.renderUrl} />
                  <PageApiSnippet label="Resolve selected page" value={selectedPageLaunchHandoff.delivery.resolveUrl} />
                  <PageApiSnippet label="Selected readiness API" value={selectedPageLaunchHandoff.delivery.adminReadinessUrl} />
                  <PageApiSnippet label="Preview selected page" value={selectedPageLaunchHandoff.delivery.previewEndpoint} />
                  <PageApiSnippet label="Editor route" value={selectedPageLaunchHandoff.selectedPage.editorRoute} />
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                Create a page for this site to generate a launch handoff.
              </div>
            )}
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

          <div data-testid="pages-binding-contract" className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Page data-binding contract</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Backy pages should let users design freely while binding sections to collections, blog, commerce, forms, media, and member state.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {PAGE_BINDING_TARGETS.length} targets
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {PAGE_BINDING_TARGETS.map((target) => (
                <div key={target.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{target.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{target.detail}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {target.key}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
            </div>
          </details>
        </div>
        </div>
      </details>

      {hasPages && (
        <div
          className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          role="group"
          aria-label="Bulk page actions"
          aria-describedby={`${bulkSelectionStatusId} ${bulkActionStatusId}`}
          data-testid="pages-bulk-toolbar"
          data-action-state={bulkActionReady ? 'ready' : 'blocked'}
          data-action-status={bulkGroupActionStatus}
          data-selected-count={selectedPages.length}
          data-visible-selected-count={visibleSelectedCount}
          data-hidden-selected-count={hiddenSelectedCount}
          data-filtered-selected-count={selectedFilteredPages.length}
          data-filtered-total-count={filteredPages.length}
          data-bulk-action={bulkAction || 'none'}
          data-bulk-action-ready={bulkActionReady ? 'true' : 'false'}
        >
          <span
            id={bulkSelectionStatusId}
            className="text-sm font-medium"
            aria-live="polite"
            data-testid="pages-bulk-selection-status"
          >
            {bulkSelectionStatus}
          </span>
          <button
            type="button"
            onClick={() => setPageSelection(data, selectedTablePages.length !== data.length)}
            disabled={Boolean(selectVisibleDisabledReason)}
            title={selectVisibleDisabledReason || undefined}
            aria-label={selectedTablePages.length === data.length && data.length > 0 ? 'Clear visible page selection' : 'Select visible pages'}
            aria-describedby={bulkActionStatusId}
            data-action-state={selectVisibleDisabledReason ? 'blocked' : 'ready'}
            data-action-status={selectVisibleDisabledReason || bulkSelectionStatus}
            data-disabled-reason={selectVisibleDisabledReason || undefined}
            data-testid="pages-bulk-select-visible"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedTablePages.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          {filteredPages.length > data.length && (
            <button
              type="button"
              onClick={() => setPageSelection(filteredPages, !allFilteredPagesSelected)}
              disabled={Boolean(selectFilteredDisabledReason)}
              title={selectFilteredDisabledReason || 'Select every page matching the current search, status, and readiness filters'}
              aria-label={allFilteredPagesSelected ? `Clear all ${filteredPages.length} filtered page selections` : `Select all ${filteredPages.length} filtered pages`}
              aria-describedby={bulkActionStatusId}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-action-state={selectFilteredDisabledReason ? 'blocked' : 'ready'}
              data-action-status={selectFilteredDisabledReason || bulkSelectionStatus}
              data-disabled-reason={selectFilteredDisabledReason || undefined}
              data-testid="pages-bulk-select-filtered"
              data-selection-mode={filteredSelectionMode}
            >
              {allFilteredPagesSelected ? 'Clear filtered' : `Select all filtered (${filteredPages.length})`}
            </button>
          )}
          <select
            data-testid="pages-bulk-action-select"
            value={bulkAction}
            disabled={Boolean(bulkActionSelectDisabledReason)}
            title={bulkActionSelectDisabledReason || undefined}
            aria-label="Choose bulk page action"
            aria-describedby={bulkActionStatusId}
            data-action-state={bulkActionSelectDisabledReason ? 'blocked' : 'ready'}
            data-action-status={bulkActionSelectDisabledReason || bulkActionStatus}
            data-disabled-reason={bulkActionSelectDisabledReason || undefined}
            onChange={(event) => {
              if (isPageBulkControlsBusy) return;
              setBulkAction(event.target.value as typeof bulkAction);
              setPendingBulkPublish(false);
              setPendingBulkUnpublish(false);
              setPendingBulkArchive(false);
              setPendingBulkDelete(false);
            }}
            className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Bulk action...</option>
            <option value="publish">Publish selected</option>
            <option value="unpublish">Unpublish selected</option>
            <option value="archive">Archive selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <button
            type="button"
            data-testid="pages-bulk-action-apply"
            onClick={() => void handleBulkAction()}
            disabled={Boolean(bulkActionApplyDisabledReason)}
            aria-disabled={Boolean(bulkActionApplyDisabledReason)}
            data-bulk-action-ready={bulkActionReady ? 'true' : 'false'}
            data-bulk-action-status={bulkActionStatus}
            data-action-state={bulkActionApplyDisabledReason ? 'blocked' : 'ready'}
            data-action-status={bulkActionStatus}
            data-disabled-reason={bulkActionApplyDisabledReason || undefined}
            title={!selectedBulkActionAllowed
              ? bulkPermissionTitle
              : bulkAction === 'publish' && selectedKnownPublishBlockers.length > 0
              ? 'Resolve selected page blockers before publishing.'
              : 'Apply selected bulk action'}
            aria-label={bulkAction ? `Apply bulk action: ${bulkActionLabel}` : 'Apply selected bulk action'}
            aria-describedby={bulkActionStatusId}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              bulkAction === 'delete'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isBulkBusy ? bulkBusyLabel : bulkActionLabel}
          </button>
          <span
            id={bulkActionStatusId}
            className="min-w-48 text-xs font-medium leading-5 text-muted-foreground"
            aria-live="polite"
            data-testid="pages-bulk-action-status"
          >
            {bulkActionStatus}
          </span>
          {selectedPages.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPageIds(new Set())}
              disabled={Boolean(clearSelectionDisabledReason)}
              aria-label={`Clear selection for ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}`}
              aria-describedby={bulkActionStatusId}
              data-action-state={clearSelectionDisabledReason ? 'blocked' : 'ready'}
              data-action-status={clearSelectionDisabledReason || bulkSelectionStatus}
              data-disabled-reason={clearSelectionDisabledReason || undefined}
              data-testid="pages-bulk-clear-selection"
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
                disabled={Boolean(clearSelectionDisabledReason)}
                aria-label={`Clear ${hiddenSelectedCount} non-visible selected page${hiddenSelectedCount === 1 ? '' : 's'}`}
                aria-describedby={bulkActionStatusId}
                data-action-state={clearSelectionDisabledReason ? 'blocked' : 'ready'}
                data-action-status={clearSelectionDisabledReason || bulkSelectionStatus}
                data-disabled-reason={clearSelectionDisabledReason || undefined}
                data-testid="pages-bulk-clear-non-visible"
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
            aria-label="Search pages by title, slug, route, or template"
            data-testid="pages-search-input"
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
              aria-pressed={statusFilter === status && healthFilter === 'all'}
              aria-label={`Filter pages by ${status === 'all' ? 'all statuses' : `${status} status`}`}
              data-testid={`pages-status-filter-${status}`}
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
          data-testid="pages-health-filter-select"
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
	          disabled={isPageRefreshBusy || !canViewPages}
	          title={!canViewPages ? viewPermissionTitle : undefined}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Refresh page table"
          data-testid="pages-filter-refresh"
        >
          Refresh
        </button>
        {hasPageFilters && (
          <button
            type="button"
            onClick={clearPageFilters}
            disabled={isPageLibraryBusy}
            aria-label="Clear page search and filters"
            data-testid="pages-clear-filters"
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
          tableMinWidth="2140px"
          stickyActionColumn={false}
          loading={isBlockingInitialPageLoad}
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
                  : 'Create a page for this site, then open it in the visual editor.'
              }
              action={
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {hasPages && (
                    <button
                      type="button"
                      onClick={clearPageFilters}
                      disabled={isPageLibraryBusy}
                      aria-label="Clear page search and filters from empty state"
                      data-testid="pages-empty-clear-filters"
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear Filters
                    </button>
                  )}
                  <Link
                    to="/pages/new"
                    search={createPageSearch}
                    aria-disabled={createPageLinkDisabled}
                    aria-describedby={createPageActionStatusId}
                    data-testid="pages-empty-create"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90',
                      createPageLinkDisabled && 'pointer-events-none opacity-60',
                    )}
                    title={createPageActionDisabledReason || undefined}
                    data-action-state={createPageActionDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={createPageActionStatus}
                    data-disabled-reason={createPageActionDisabledReason || undefined}
                    data-target-site-id={activeSiteId}
                    aria-label={hasPages ? 'Create page after clearing filters' : 'Create page for active site'}
                  >
                    <Plus className="w-4 h-4" />
                    New Page
                  </Link>
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pages-publish-confirm-title"
            aria-describedby="pages-publish-confirm-description pages-publish-confirm-impact"
            data-testid="pages-publish-modal"
          >
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="pages-publish-confirm-title" className="text-lg font-semibold text-foreground">Publish {pendingPublishPage.title}?</h2>
                  <p id="pages-publish-confirm-description" className="mt-1 text-sm text-muted-foreground">
                    Review the route, readiness, and frontend delivery endpoints before this page becomes public.
                  </p>
                </div>
              </div>

              <div id="pages-publish-confirm-impact">
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
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
	                  onClick={() => {
	                    void handlePreviewPage(pendingPublishPage);
	                  }}
	                  disabled={isPageLibraryBusy || !canPublishPages}
	                  title={!canPublishPages ? publishPermissionTitle : undefined}
                  aria-label={`Preview ${pendingPublishPage.title} before publishing`}
                  data-testid="pages-publish-preview-button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Preview first
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPublishPage(null)}
                  disabled={isPageLibraryBusy || mutatingPageId === pendingPublishPage.id}
                  aria-label={`Cancel publishing ${pendingPublishPage.title}`}
                  data-testid="pages-publish-cancel"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
	                  onClick={() => void handlePublishPage(pendingPublishPage)}
	                  disabled={isPageLibraryBusy || mutatingPageId === pendingPublishPage.id || !canPublishPages || deliveryStatus === 'blocked'}
	                  title={!canPublishPages ? publishPermissionTitle : undefined}
                  aria-label={`Confirm publishing ${pendingPublishPage.title}`}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pages-bulk-publish-confirm-title"
          aria-describedby="pages-bulk-publish-confirm-description pages-bulk-publish-confirm-impact"
          data-testid="pages-bulk-publish-modal"
        >
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="pages-bulk-publish-confirm-title" className="text-lg font-semibold text-foreground">
                  Publish {selectedPages.length} selected page{selectedPages.length === 1 ? '' : 's'}?
                </h2>
                <p id="pages-bulk-publish-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  Backy will run readiness again before publishing and skip the publish if a selected page becomes blocked.
                </p>
              </div>
            </div>

            <div id="pages-bulk-publish-confirm-impact" className="mt-4 max-h-72 space-y-2 overflow-auto rounded-lg border border-border bg-background p-3">
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
                disabled={isPageLibraryBusy || isBulkBusy}
                aria-label={`Cancel publishing ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-publish-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
	                onClick={() => void handleBulkAction()}
	                disabled={isPageLibraryBusy || isBulkBusy || !canPublishPages}
	                title={!canPublishPages ? publishPermissionTitle : undefined}
                aria-label={`Confirm publishing ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-publish-confirm-button"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Publishing...' : `Publish ${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkUnpublish && selectedPages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pages-bulk-unpublish-confirm-title"
          aria-describedby="pages-bulk-unpublish-confirm-description pages-bulk-unpublish-confirm-impact"
          data-testid="pages-bulk-unpublish-modal"
        >
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
                <EyeOff className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="pages-bulk-unpublish-confirm-title" className="text-lg font-semibold text-foreground">
                  Unpublish {selectedUnpublishablePages.length} selected page{selectedUnpublishablePages.length === 1 ? '' : 's'}?
                </h2>
                <p id="pages-bulk-unpublish-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  Backy will remove these pages from public delivery while keeping their editor content and revisions available.
                </p>
              </div>
            </div>

            <div id="pages-bulk-unpublish-confirm-impact" className="mt-4 max-h-72 space-y-2 overflow-auto rounded-lg border border-border bg-background p-3">
              {selectedUnpublishablePages.slice(0, 8).map((page) => (
                <div key={page.id} className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{page.title}</div>
                    <div className="font-mono text-xs text-muted-foreground">{pagePublicPath(page)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={page.status} />
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                      Public delivery disabled after confirm
                    </span>
                  </div>
                </div>
              ))}
              {selectedUnpublishablePages.length > 8 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {selectedUnpublishablePages.length - 8} more selected page{selectedUnpublishablePages.length - 8 === 1 ? '' : 's'} will be included.
                </div>
              )}
              {selectedUnpublishablePages.length < selectedPages.length && (
                <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {selectedPages.length - selectedUnpublishablePages.length} selected draft or archived page{selectedPages.length - selectedUnpublishablePages.length === 1 ? '' : 's'} will be skipped.
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkUnpublish(false)}
                disabled={isPageLibraryBusy || isBulkBusy}
                aria-label={`Cancel unpublishing ${selectedUnpublishablePages.length} selected page${selectedUnpublishablePages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-unpublish-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isPageLibraryBusy || isBulkBusy || !canEditPages || !canPublishPages || selectedUnpublishablePages.length === 0}
                title={!canEditPages ? editPermissionTitle : !canPublishPages ? publishPermissionTitle : undefined}
                aria-label={`Confirm unpublishing ${selectedUnpublishablePages.length} selected page${selectedUnpublishablePages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-unpublish-confirm-button"
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Unpublishing...' : `Unpublish ${selectedUnpublishablePages.length} page${selectedUnpublishablePages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkArchive && selectedPages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pages-bulk-archive-confirm-title"
          aria-describedby="pages-bulk-archive-confirm-description pages-bulk-archive-confirm-impact"
          data-testid="pages-bulk-archive-modal"
        >
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <Archive className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="pages-bulk-archive-confirm-title" className="text-lg font-semibold text-foreground">
                  Archive {selectedArchivablePages.length} selected page{selectedArchivablePages.length === 1 ? '' : 's'}?
                </h2>
                <p id="pages-bulk-archive-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  Backy will move these pages out of active authoring and public delivery while keeping editor content and revisions available.
                </p>
              </div>
            </div>

            <div id="pages-bulk-archive-confirm-impact" className="mt-4 max-h-72 space-y-2 overflow-auto rounded-lg border border-border bg-background p-3">
              {selectedArchivablePages.slice(0, 8).map((page) => (
                <div key={page.id} className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{page.title}</div>
                    <div className="font-mono text-xs text-muted-foreground">{pagePublicPath(page)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={page.status} />
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                      Moved to archive after confirm
                    </span>
                  </div>
                </div>
              ))}
              {selectedArchivablePages.length > 8 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {selectedArchivablePages.length - 8} more selected page{selectedArchivablePages.length - 8 === 1 ? '' : 's'} will be included.
                </div>
              )}
              {selectedArchivablePages.length < selectedPages.length && (
                <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {selectedPages.length - selectedArchivablePages.length} selected archived page{selectedPages.length - selectedArchivablePages.length === 1 ? '' : 's'} will be skipped.
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkArchive(false)}
                disabled={isPageLibraryBusy || isBulkBusy}
                aria-label={`Cancel archiving ${selectedArchivablePages.length} selected page${selectedArchivablePages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-archive-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isPageLibraryBusy || isBulkBusy || !canEditPages || selectedArchivablePages.length === 0}
                title={!canEditPages ? editPermissionTitle : undefined}
                aria-label={`Confirm archiving ${selectedArchivablePages.length} selected page${selectedArchivablePages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-archive-confirm-button"
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Archiving...' : `Archive ${selectedArchivablePages.length} page${selectedArchivablePages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUnpublishPage && (() => {
        const pagePath = pagePublicPath(pendingUnpublishPage);
        const pageSiteId = pendingUnpublishPage.siteId || activeSiteId;
        const encodedSiteId = encodeURIComponent(pageSiteId);
        const encodedPath = encodeURIComponent(pagePath);
        const encodedPageId = encodeURIComponent(pendingUnpublishPage.id);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pages-unpublish-confirm-title"
            aria-describedby="pages-unpublish-confirm-description pages-unpublish-confirm-impact"
            data-testid="pages-unpublish-modal"
          >
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
                  <EyeOff className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="pages-unpublish-confirm-title" className="text-lg font-semibold text-foreground">Unpublish {pendingUnpublishPage.title}?</h2>
                  <p id="pages-unpublish-confirm-description" className="mt-1 text-sm text-muted-foreground">
                    This removes the page from public delivery while keeping it editable in Backy.
                  </p>
                </div>
              </div>

              <div id="pages-unpublish-confirm-impact" className="mt-4 grid gap-2 rounded-lg border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-mono text-xs text-foreground">{pagePath}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Public page</span>
                  <span className="truncate font-mono text-xs text-foreground">{publicPageUrl(pendingUnpublishPage)}</span>
                </div>
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Custom frontends using the public page, render, resolve, or preview handoff should treat this page as draft after unpublish.
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <span className="min-w-0 break-all">Render API: {publicBaseUrl}/api/sites/{encodedSiteId}/render?path={encodedPath}</span>
                  <span className="min-w-0 break-all">Resolve API: {publicBaseUrl}/api/sites/{encodedSiteId}/resolve?path={encodedPath}</span>
                  <span className="min-w-0 break-all">Preview: {adminBaseUrl}/sites/{encodedSiteId}/pages/{encodedPageId}/preview</span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handlePreviewPage(pendingUnpublishPage);
                  }}
                  disabled={isPageLibraryBusy || !canPublishPages}
                  title={!canPublishPages ? publishPermissionTitle : undefined}
                  aria-label={`Preview ${pendingUnpublishPage.title} before unpublishing`}
                  data-testid="pages-unpublish-preview-button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Preview first
                </button>
                <button
                  type="button"
                  onClick={() => setPendingUnpublishPage(null)}
                  disabled={isPageLibraryBusy || mutatingPageId === pendingUnpublishPage.id}
                  aria-label={`Cancel unpublishing ${pendingUnpublishPage.title}`}
                  data-testid="pages-unpublish-cancel"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleUnpublishPage(pendingUnpublishPage)}
                  disabled={isPageLibraryBusy || mutatingPageId === pendingUnpublishPage.id || !canEditPages || !canPublishPages}
                  title={!canEditPages ? editPermissionTitle : !canPublishPages ? publishPermissionTitle : undefined}
                  aria-label={`Confirm unpublishing ${pendingUnpublishPage.title}`}
                  data-testid="pages-unpublish-confirm"
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutatingPageId === pendingUnpublishPage.id ? 'Unpublishing...' : 'Unpublish page'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingArchivePage && (() => {
        const pagePath = pagePublicPath(pendingArchivePage);
        const wasPublished = pendingArchivePage.status === 'published';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pages-archive-confirm-title"
            aria-describedby="pages-archive-confirm-description pages-archive-confirm-impact"
            data-testid="pages-archive-modal"
          >
            <div className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <Archive className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="pages-archive-confirm-title" className="text-lg font-semibold text-foreground">Archive {pendingArchivePage.title}?</h2>
                  <p id="pages-archive-confirm-description" className="mt-1 text-sm text-muted-foreground">
                    Archive keeps the page in Backy for later editing, but removes it from active authoring and public delivery workflows.
                  </p>
                </div>
              </div>

              <div id="pages-archive-confirm-impact" className="mt-4 grid gap-2 rounded-lg border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-mono text-xs text-foreground">{pagePath}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Current status</span>
                  <StatusBadge status={pendingArchivePage.status} />
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {wasPublished
                    ? 'Published delivery, navigation, render, and resolve consumers should treat this page as archived after confirmation.'
                    : 'Draft/scheduled delivery stays private, and the page moves out of the active authoring set after confirmation.'}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handlePreviewPage(pendingArchivePage);
                  }}
                  disabled={isPageLibraryBusy || !canPublishPages}
                  title={!canPublishPages ? publishPermissionTitle : undefined}
                  aria-label={`Preview ${pendingArchivePage.title} before archiving`}
                  data-testid="pages-archive-preview-button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Preview first
                </button>
                <button
                  type="button"
                  onClick={() => setPendingArchivePage(null)}
                  disabled={isPageLibraryBusy || mutatingPageId === pendingArchivePage.id}
                  aria-label={`Cancel archiving ${pendingArchivePage.title}`}
                  data-testid="pages-archive-cancel"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleArchivePage(pendingArchivePage)}
                  disabled={isPageLibraryBusy || mutatingPageId === pendingArchivePage.id || !canEditPages}
                  title={!canEditPages ? editPermissionTitle : undefined}
                  aria-label={`Confirm archiving ${pendingArchivePage.title}`}
                  data-testid="pages-archive-confirm"
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutatingPageId === pendingArchivePage.id ? 'Archiving...' : 'Archive page'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingDeletePage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pages-delete-confirm-title"
          aria-describedby="pages-delete-confirm-description pages-delete-confirm-impact"
          data-testid="pages-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="pages-delete-confirm-title" className="text-lg font-semibold text-foreground">Delete {pendingDeletePage.title}?</h2>
                <p id="pages-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  This removes the page from the backend and the public API. Archive it instead if you only want to hide it.
                </p>
              </div>
            </div>
            <div id="pages-delete-confirm-impact" className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Route: <span className="font-medium text-foreground">{pagePublicPath(pendingDeletePage)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeletePage(null)}
                disabled={isPageLibraryBusy || mutatingPageId === pendingDeletePage.id}
                aria-label={`Cancel deleting ${pendingDeletePage.title}`}
                data-testid="pages-delete-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
	                onClick={() => void handleDeletePage(pendingDeletePage)}
	                disabled={isPageLibraryBusy || mutatingPageId === pendingDeletePage.id || !canDeletePages}
	                title={!canDeletePages ? deletePermissionTitle : undefined}
                aria-label={`Confirm deleting ${pendingDeletePage.title}`}
                data-testid="pages-delete-confirm-button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutatingPageId === pendingDeletePage.id ? 'Deleting...' : 'Delete page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pages-bulk-delete-confirm-title"
          aria-describedby="pages-bulk-delete-confirm-description pages-bulk-delete-confirm-impact"
          data-testid="pages-bulk-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="pages-bulk-delete-confirm-title" className="text-lg font-semibold text-foreground">
                  Delete {selectedPages.length} selected page{selectedPages.length === 1 ? '' : 's'}?
                </h2>
                <p id="pages-bulk-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  Selected pages will be removed from the site and from frontend API delivery.
                </p>
              </div>
            </div>
            <div id="pages-bulk-delete-confirm-impact" className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedPages.length}</span>
              {hiddenSelectedCount > 0 ? (
                <span> · {hiddenSelectedCount} not visible in the current table filter</span>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                disabled={isPageLibraryBusy || isBulkBusy}
                aria-label={`Cancel deleting ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-delete-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
	                onClick={() => void handleBulkAction()}
	                disabled={isPageLibraryBusy || isBulkBusy || !canDeletePages}
	                title={!canDeletePages ? deletePermissionTitle : undefined}
                aria-label={`Confirm deleting ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}`}
                data-testid="pages-bulk-delete-confirm-button"
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
    <div className="min-w-0 max-w-full space-y-1" data-testid={`pages-hierarchy-${page.id}`}>
      {parentPage ? (
        <div>
          <div className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">Nested under {parentPage.title}</div>
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
            <span className="max-w-full break-words rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={navigationLabel}>
              {navigationLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PageTemplateCell({ page }: { page: Page }) {
  const template = pageTemplateInfo(page);
  const badgeClass = template.source === 'frontend-design'
    ? 'bg-teal-50 text-teal-700'
    : template.source === 'collection-dataset'
      ? 'bg-sky-50 text-sky-700'
      : template.source === 'starter-template'
        ? 'bg-primary/10 text-primary'
        : 'bg-muted text-muted-foreground';

  return (
    <div className="min-w-0 max-w-full space-y-1" data-testid={`pages-template-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', badgeClass)}>
          {template.badge}
        </span>
        <span className="min-w-0 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{template.label}</span>
      </div>
      <p className="max-w-full break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={template.detail}>
        {template.detail}
      </p>
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
    <div className="min-w-0 max-w-full space-y-1" data-testid={`pages-route-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="inline-block max-w-full whitespace-normal break-all rounded-md bg-muted px-2 py-1 font-mono text-xs leading-5 text-foreground">
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
    return (
      <div className="min-w-0 max-w-full space-y-1 text-xs text-muted-foreground" data-testid={`pages-revisions-${page.id}`}>
        Checking revisions...
      </div>
    );
  }

  const count = summary?.count ?? 0;
  const latest = summary?.latest ?? null;

  return (
    <div className="min-w-0 max-w-full space-y-1" data-testid={`pages-revisions-${page.id}`}>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className={cn(
          'inline-flex max-w-full rounded-full px-2 py-0.5 text-xs font-semibold',
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
          className="inline-flex max-w-full rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:border-primary/20 hover:bg-primary/5"
        >
          Open history
        </Link>
      </div>
      {latest ? (
        <div className="text-xs leading-5 text-muted-foreground">
          <span className="block max-w-full break-words [overflow-wrap:anywhere]" title={latest.note || 'Revision snapshot'}>
            {latest.note || 'Revision snapshot'}
          </span>
          <span className="block break-words [overflow-wrap:anywhere]">{formatDate(latest.createdAt)} · {latest.snapshotStatus}</span>
        </div>
      ) : (
        <div className="flex max-w-full items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
          <History className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="font-medium text-foreground">No saved snapshots yet</div>
            <div className="mt-0.5 break-words leading-4 [overflow-wrap:anywhere]">
              Save this page in the editor to capture a rollback-ready revision.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageDeliveryCell({
  page,
  status,
  health,
  healthHistory,
  isRefreshingHealth,
  onRefreshHealth,
  routeDiagnostic,
  publicUrl,
  renderUrl,
  resolveUrl,
  previewEndpoint,
}: {
  page: Page;
  status: PageDeliveryStatus;
  health: PageDeliveryHealth | undefined;
  healthHistory: PageDeliveryHealth[];
  isRefreshingHealth: boolean;
  onRefreshHealth: () => void;
  routeDiagnostic: PageRouteDiagnostic | undefined;
  publicUrl: string;
  renderUrl: string;
  resolveUrl: string;
  previewEndpoint: string;
}) {
  const labelByStatus: Record<PageDeliveryStatus, string> = {
    published: 'Published',
    'preview-only': 'Preview Only',
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
    <div className="min-w-0 max-w-full space-y-2" data-testid={`pages-delivery-${page.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={labelByStatus[status]} type={badgeType} />
      </div>
      <div className={cn(
        'break-words text-xs leading-5 [overflow-wrap:anywhere]',
        status === 'blocked' ? 'text-destructive' : 'text-muted-foreground',
      )}
      >
        {detailByStatus[status]}
      </div>
      {status === 'published' && (
        <PageDeliveryHealthSummary
          health={health}
          history={healthHistory}
          isRefreshing={isRefreshingHealth}
          onRefresh={onRefreshHealth}
          pageId={page.id}
          pageTitle={page.title}
        />
      )}
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
        <code className="max-w-full whitespace-normal break-all rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground" title={previewEndpoint}>
          preview POST
        </code>
      </div>
    </div>
  );
}

function PageDeliveryHealthSummary({
  health,
  history,
  isRefreshing,
  onRefresh,
  pageId,
  pageTitle,
}: {
  health: PageDeliveryHealth | undefined;
  history: PageDeliveryHealth[];
  isRefreshing: boolean;
  onRefresh: () => void;
  pageId: string;
  pageTitle: string;
}) {
  const effectiveHealth = health || {
    status: 'checking' as const,
    message: 'Health probe pending for public delivery endpoints.',
  };
  const healthType = effectiveHealth.status === 'healthy'
    ? 'success'
    : effectiveHealth.status === 'error'
      ? 'error'
      : effectiveHealth.status === 'warning'
        ? 'warning'
        : 'info';

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-5 [overflow-wrap:anywhere]" data-testid="pages-delivery-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={effectiveHealth.status} type={healthType} />
          {effectiveHealth.checkedAt && (
            <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">{formatDate(effectiveHealth.checkedAt)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`pages-delivery-refresh-${pageId}`}
          aria-label={`Refresh delivery health for ${pageTitle}`}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>
      <details
        className="mt-2 border-t border-border pt-2"
        data-testid={`pages-delivery-health-details-${pageId}`}
        data-default-collapsed="true"
      >
        <summary className="cursor-pointer list-none font-medium text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
          Health details
        </summary>
        <div className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">{effectiveHealth.message}</div>
        {(effectiveHealth.publicStatus || effectiveHealth.renderStatus || effectiveHealth.resolveStatus) && (
          <div className="mt-1 whitespace-normal break-words font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
            public {effectiveHealth.publicStatus ?? 'n/a'} · render {effectiveHealth.renderStatus ?? 'n/a'} · resolve {effectiveHealth.resolveStatus ?? 'n/a'}
          </div>
        )}
        {history.length > 0 && (
          <div
            className="mt-2 border-t border-border pt-2"
            data-testid={`pages-delivery-history-${pageId}`}
          >
            <div className="font-medium text-foreground">Recent probes</div>
            <div className="mt-1 space-y-1">
              {history.slice(0, 3).map((entry, index) => (
                <div key={`${entry.checkedAt || 'pending'}-${index}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="min-w-0">{entry.checkedAt ? formatDate(entry.checkedAt) : 'Unknown time'}</span>
                  <span className="font-medium capitalize text-foreground">{entry.status}</span>
                  <span className="min-w-0 break-words font-mono text-[11px] [overflow-wrap:anywhere]">
                    public {entry.publicStatus ?? 'n/a'} · render {entry.renderStatus ?? 'n/a'} · resolve {entry.resolveStatus ?? 'n/a'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </details>
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
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-card/80 px-3 py-2 ring-1 ring-border/70">
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
    <div className="flex items-start gap-3 rounded-lg bg-card/80 px-3 py-2 ring-1 ring-border/70">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">
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
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
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
    return `${getLocalBackendOrigin()}/api/admin`;
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin());
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const RESERVED_PAGE_ROUTE_PREFIXES = new Set(['api', 'sites', 'blog']);

const pagePublicPath = (page: Page): string => {
  const slug = (page.slug || '').replace(/^\/+|\/+$/g, '');
  if (page.isHomepage) {
    return '/';
  }
  return !slug || slug === 'index' || slug === 'home' ? '/' : `/${slug}`;
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
  if (!slug || slug === 'index' || slug === 'home') return true;

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

const pageMetaRecord = (page: Page, key: string): Record<string, unknown> | null => {
  const value = page.meta?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
};

const pageTemplateLabel = (value: string): string => (
  value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
);

const pageTemplateInfo = (page: Page): {
  source: 'starter-template' | 'frontend-design' | 'collection-dataset' | 'custom-canvas';
  badge: string;
  label: string;
  detail: string;
  datasetMode?: string;
  datasetSlug?: string;
} => {
  const frontendTemplateId = pageMetaString(page, 'frontendDesignTemplateId');
  const frontendTemplateName = pageMetaString(page, 'frontendDesignTemplateName');
  if (frontendTemplateId || frontendTemplateName) {
    return {
      source: 'frontend-design',
      badge: 'Frontend',
      label: frontendTemplateName || frontendTemplateId,
      detail: pageMetaString(page, 'frontendDesignRoutePattern') || 'Captured frontend design contract',
    };
  }

  const dataset = pageMetaRecord(page, 'collectionDataset');
  const datasetMode = typeof dataset?.mode === 'string' ? dataset.mode : '';
  const datasetSlug = typeof dataset?.collectionSlug === 'string' ? dataset.collectionSlug : '';
  if (dataset) {
    return {
      source: 'collection-dataset',
      badge: 'Dataset',
      label: `${typeof dataset.collectionName === 'string' ? dataset.collectionName : datasetSlug || 'Collection'} ${datasetMode === 'item' ? 'detail' : 'list'}`.trim(),
      detail: typeof dataset.routePattern === 'string' ? dataset.routePattern : 'Collection-backed page template',
      datasetMode,
      datasetSlug,
    };
  }

  const starterTemplate = pageMetaString(page, 'template') || page.template || '';
  if (starterTemplate) {
    return {
      source: 'starter-template',
      badge: 'Starter',
      label: pageTemplateLabel(starterTemplate),
      detail: starterTemplate === 'blank' ? 'Blank canvas starter' : 'Backy editable page starter',
    };
  }

  return {
    source: 'custom-canvas',
    badge: 'Custom',
    label: 'Custom canvas',
    detail: 'No starter, dataset, or frontend-template provenance recorded',
  };
};

const getParentPageTitle = (page: Page, pageMap: Map<string, Page>): string => (
  page.parentId ? pageMap.get(page.parentId)?.title || pageMetaString(page, 'parentPageTitle') : ''
);

const isAbortError = (error: unknown): boolean => (
  error instanceof Error && error.name === 'AbortError'
);

const getPageRevisionSummaryWithTimeout = async (
  siteId: string,
  pageId: string,
): Promise<ContentRevisionSummary> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, PAGE_REVISION_SUMMARY_TIMEOUT_MS);
    return await getPageRevisionSummary(siteId, pageId, { signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Revision summary request timed out after ${PAGE_REVISION_SUMMARY_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const loadPageRevisionSummaries = async (
  siteId: string,
  targetPages: Array<Pick<Page, 'id' | 'siteId'>>,
): Promise<Record<string, ContentRevisionSummary>> => {
  const results = await Promise.allSettled(
    targetPages.map(async (page) => {
      const summary = await getPageRevisionSummaryWithTimeout(page.siteId || siteId, page.id);
      return [page.id, summary] as const;
    }),
  );

  return Object.fromEntries(
    results
      .filter((result): result is PromiseFulfilledResult<readonly [string, ContentRevisionSummary]> => result.status === 'fulfilled')
      .map((result) => result.value),
  );
};

const sleep = (durationMs: number) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});

const getPageReadinessPreflight = async (siteId: string, pageId: string): Promise<PageReadiness | null> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, PAGE_READINESS_PREFLIGHT_TIMEOUT_MS);
    return await getPageReadiness(siteId, pageId, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const loadPageRevisionSummariesWithRetry = async (
  siteId: string,
  targetPages: Array<Pick<Page, 'id' | 'siteId'>>,
): Promise<Record<string, ContentRevisionSummary>> => {
  let pendingPages = targetPages;
  const summaries: Record<string, ContentRevisionSummary> = {};

  for (let attempt = 0; attempt < PAGE_REVISION_SUMMARY_MAX_ATTEMPTS && pendingPages.length > 0; attempt += 1) {
    const attemptSummaries = await loadPageRevisionSummaries(siteId, pendingPages);
    Object.assign(summaries, attemptSummaries);

    const resolvedPageIds = new Set(Object.keys(attemptSummaries));
    pendingPages = pendingPages.filter((page) => !resolvedPageIds.has(page.id));

    if (pendingPages.length > 0 && attempt < PAGE_REVISION_SUMMARY_MAX_ATTEMPTS - 1) {
      await sleep(PAGE_REVISION_SUMMARY_RETRY_DELAY_MS);
    }
  }

  return summaries;
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

const fetchDeliveryStatus = async (url: string): Promise<number | null> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      },
    });

    return response.status;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const canProbeUrlFromBrowser = (url: string): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

const isHealthyStatus = (status: number | null | undefined): boolean => (
  typeof status === 'number' && status >= 200 && status < 300
);

const probePageDeliveryHealth = async ({
  publicUrl,
  renderUrl,
  resolveUrl,
}: {
  publicUrl: string;
  renderUrl: string;
  resolveUrl: string;
}): Promise<PageDeliveryHealth> => {
  const canProbePublicUrl = canProbeUrlFromBrowser(publicUrl);
  const [publicStatus, renderStatus, resolveStatus] = await Promise.all([
    canProbePublicUrl ? fetchDeliveryStatus(publicUrl) : Promise.resolve(null),
    fetchDeliveryStatus(renderUrl),
    fetchDeliveryStatus(resolveUrl),
  ]);
  const renderHealthy = isHealthyStatus(renderStatus);
  const resolveHealthy = isHealthyStatus(resolveStatus);
  const publicHealthy = isHealthyStatus(publicStatus);
  const checkedAt = new Date().toISOString();

  if (publicHealthy && renderHealthy && resolveHealthy) {
    return {
      status: 'healthy',
      message: 'Published page, render API, and resolve API responded successfully.',
      checkedAt,
      publicStatus,
      renderStatus,
      resolveStatus,
    };
  }

  if (renderHealthy && resolveHealthy) {
    return {
      status: 'warning',
      message: canProbePublicUrl
        ? 'Render and resolve APIs responded, but the hosted public page did not return a 2xx response.'
        : 'Render and resolve APIs responded. Hosted public URL health is not browser-verifiable from this admin origin.',
      checkedAt,
      publicStatus,
      renderStatus,
      resolveStatus,
    };
  }

  return {
    status: 'error',
    message: 'One or more public delivery endpoints failed the latest probe.',
    checkedAt,
    publicStatus,
    renderStatus,
    resolveStatus,
  };
};

const getBulkActionLabel = (
  action: PageBulkAction,
  count: number,
  isConfirmingDelete: boolean,
  isConfirmingPublish: boolean,
  isConfirmingUnpublish: boolean,
  isConfirmingArchive: boolean,
): string => {
  const pageLabel = `${count} page${count === 1 ? '' : 's'}`;

  if (action === 'publish') {
    if (isConfirmingPublish) {
      return count > 0 ? `Publish ${pageLabel}` : 'Publish selected';
    }

    return count > 0 ? `Review publish for ${pageLabel}` : 'Publish selected';
  }

  if (action === 'unpublish') {
    if (isConfirmingUnpublish) {
      return count > 0 ? `Unpublish ${pageLabel}` : 'Unpublish selected';
    }

    return count > 0 ? `Review unpublish for ${pageLabel}` : 'Unpublish selected';
  }

  if (action === 'archive') {
    if (isConfirmingArchive) {
      return count > 0 ? `Archive ${pageLabel}` : 'Archive selected';
    }

    return count > 0 ? `Review archive for ${pageLabel}` : 'Archive selected';
  }

  if (action === 'delete') {
    if (isConfirmingDelete) {
      return count > 0 ? `Delete ${pageLabel}` : 'Delete selected';
    }

    return count > 0 ? `Review delete for ${pageLabel}` : 'Delete selected';
  }

  return 'Choose action';
};

const getBulkBusyLabel = (action: PageBulkAction): string => {
  if (action === 'publish') return 'Publishing...';
  if (action === 'unpublish') return 'Unpublishing...';
  if (action === 'archive') return 'Archiving...';
  if (action === 'delete') return 'Deleting...';
  return 'Applying...';
};
