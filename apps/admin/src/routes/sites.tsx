/**
 * BACKY CMS - SITES PAGE
 *
 * Workspace hub for website ownership, publishing state, and site operations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Edit,
  Eye,
  Filter,
  Globe,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from 'lucide-react';
import {
  createSite as createSiteFromApi,
  deleteSite as deleteSiteFromApi,
  listPages,
  listSites,
  updateSite as updateSiteFromApi,
} from '@/lib/adminContentApi';
import { useStore, type Site } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { DataGrid } from '@/components/ui/DataGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteRouteSearch } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/sites')({
  component: SitesLayout,
});

type SiteStatusFilter = 'all' | Site['status'];
type SiteDomainFilter = 'all' | 'custom' | 'backy';
type SitePageCoverageFilter = 'all' | 'with-pages' | 'empty';

const STATUS_OPTIONS: Array<{ value: Site['status']; label: string }> = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

const SITE_CONTROL_AREAS = [
  {
    title: 'Pages and navigation',
    detail: 'Build routes, reusable headers, footers, and page sections.',
    route: '/pages',
  },
  {
    title: 'Blog and editorial',
    detail: 'Publish posts, taxonomy, SEO, revisions, and public article pages.',
    route: '/blog',
  },
  {
    title: 'Products and orders',
    detail: 'Prepare sellable objects, catalog data, order flow, and frontend listings.',
    route: '/products',
  },
  {
    title: 'Forms and leads',
    detail: 'Capture registrations, contact requests, submissions, and CRM pipeline data.',
    route: '/forms',
  },
  {
    title: 'Media and files',
    detail: 'Host public or private files for pages, products, downloads, and APIs.',
    route: '/media',
  },
  {
    title: 'Delivery settings',
    detail: 'Control API keys, Supabase/Vercel readiness, security, and hosting mode.',
    route: '/settings',
  },
] as const;

const SITE_LIST_CONTROL_AREAS = [
  {
    title: 'Workspace health',
    detail: 'Review site totals, public state, page coverage, and domain setup.',
    href: '#sites-health',
  },
  {
    title: 'Frontend API',
    detail: 'Copy manifest, OpenAPI, render, and admin site management URLs.',
    href: '#sites-api',
  },
  {
    title: 'Feature systems',
    detail: 'Jump into pages, blog, commerce, forms, files, and delivery setup.',
    href: '#sites-workflows',
  },
  {
    title: 'Library controls',
    detail: 'Search, filter, refresh, export, change status, preview, and manage sites.',
    href: '#sites-controls',
  },
  {
    title: 'Site library',
    detail: 'Open each workspace, preview its public route, or archive old projects.',
    href: '#sites-library',
  },
] as const;

const SITE_FEATURE_SYSTEMS = [
  {
    key: 'pages',
    title: 'Pages and navigation',
    adminPath: '/pages',
    publicSurface: 'Routes, layouts, reusable headers, footers, and navigation menus.',
    endpoint: '/sites/{siteId}/manifest',
    readiness: 'Needs at least one page and a homepage route.',
  },
  {
    key: 'blog',
    title: 'Blog and editorial',
    adminPath: '/blog',
    publicSurface: 'Posts, categories, tags, SEO previews, and public article templates.',
    endpoint: '/sites/{siteId}/blog/posts',
    readiness: 'Needs publishable posts, taxonomy, and article page design.',
  },
  {
    key: 'commerce',
    title: 'Products and orders',
    adminPath: '/products',
    publicSurface: 'Catalog listings, product detail data, checkout, orders, refunds, and fulfillment.',
    endpoint: '/sites/{siteId}/commerce/catalog',
    readiness: 'Needs sellable products, pricing, checkout provider, and order tracking.',
  },
  {
    key: 'forms',
    title: 'Forms and leads',
    adminPath: '/forms',
    publicSurface: 'Registration, contact, newsletter, quote, event, and custom form submissions.',
    endpoint: '/sites/{siteId}/forms',
    readiness: 'Needs form definitions, validation, storage, and spam controls.',
  },
  {
    key: 'media',
    title: 'Media and files',
    adminPath: '/media',
    publicSurface: 'Images, documents, downloads, fonts, video metadata, and private file rules.',
    endpoint: '/sites/{siteId}/media',
    readiness: 'Needs asset visibility, transforms, alt text, and storage provider setup.',
  },
  {
    key: 'collections',
    title: 'Collections and custom data',
    adminPath: '/collections',
    publicSurface: 'Reusable structured records for directories, portfolios, events, FAQs, and teams.',
    endpoint: '/sites/{siteId}/collections',
    readiness: 'Needs schemas, records, list/detail routes, and filtering contracts.',
  },
  {
    key: 'users',
    title: 'Users and auth',
    adminPath: '/users',
    publicSurface: 'Members, staff roles, invites, protected routes, and registration workflows.',
    endpoint: '/sites/{siteId}/auth',
    readiness: 'Needs auth provider mode, roles, invitation policy, and protected content rules.',
  },
  {
    key: 'delivery',
    title: 'Delivery and integrations',
    adminPath: '/settings',
    publicSurface: 'Supabase, Vercel, API keys, domains, redirects, SEO defaults, and preview delivery.',
    endpoint: '/sites/{siteId}/openapi',
    readiness: 'Needs environment variables, hosting mode, domain routing, and API contracts.',
  },
] as const;

const SITE_EXPORT_COLUMNS = [
  'site_id',
  'public_site_id',
  'name',
  'slug',
  'description',
  'custom_domain',
  'status',
  'page_count',
  'last_updated',
  'preview_url',
  'frontend_manifest_url',
  'openapi_url',
  'render_home_url',
  'admin_site_detail_url',
  'admin_edit_url',
  'delivery_mode',
  'feature_systems',
  'public_surfaces',
  'required_next_controls',
] as const;

const getDisplayDomain = (site: Site) => site.customDomain || `${site.slug}.backy.app`;

const getPublicPreviewHref = (site: Site) => {
  const domain = getDisplayDomain(site);
  if (site.customDomain) {
    return `https://${domain}`;
  }

  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `http://localhost:3001/sites/${site.slug}`;
  }

  return `/sites/${site.slug}`;
};

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getApiBaseUrl = (kind: 'public' | 'admin'): string => {
  const envBase = (
    kind === 'admin'
      ? getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
        getEnvValue('VITE_ADMIN_API_URL') ||
        getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
        getEnvValue('VITE_PUBLIC_API_URL') ||
        getEnvValue('VITE_API_BASE_URL')
      : getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
        getEnvValue('VITE_PUBLIC_API_URL') ||
        getEnvValue('VITE_API_BASE_URL')
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return kind === 'admin' ? 'http://localhost:3001/api/admin' : 'http://localhost:3001/api';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api${kind === 'admin' ? '/admin' : ''}`;
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

const getSiteApiId = (site: Site) => site.publicSiteId || site.id;

const getSiteEndpointMap = (site: Site, publicApiBase: string, adminApiBase: string) => {
  const siteApiId = encodeURIComponent(getSiteApiId(site));

  return {
    public: {
      manifest: `${publicApiBase}/sites/${siteApiId}/manifest`,
      openApi: `${publicApiBase}/sites/${siteApiId}/openapi`,
      renderHome: `${publicApiBase}/sites/${siteApiId}/render?path=/`,
      renderPath: `${publicApiBase}/sites/${siteApiId}/render?path={path}`,
      navigation: `${publicApiBase}/sites/${siteApiId}/navigation`,
      redirects: `${publicApiBase}/sites/${siteApiId}/redirects`,
      seo: `${publicApiBase}/sites/${siteApiId}/seo`,
    },
    admin: {
      sites: `${adminApiBase}/sites`,
      detail: `${adminApiBase}/sites/${siteApiId}`,
      navigation: `${adminApiBase}/sites/${siteApiId}/navigation`,
      redirects: `${adminApiBase}/sites/${siteApiId}/redirects`,
      seo: `${adminApiBase}/sites/${siteApiId}/seo`,
    },
  };
};

const buildSiteFrontendContract = (site: Site, publicApiBase: string, adminApiBase: string) => {
  const endpoints = getSiteEndpointMap(site, publicApiBase, adminApiBase);

  return {
    contract: 'backy.site.frontend.v1',
    site: {
      id: site.id,
      publicSiteId: site.publicSiteId || null,
      name: site.name,
      slug: site.slug,
      description: site.description,
      customDomain: site.customDomain,
      status: site.status,
      pageCount: site.pageCount || 0,
      lastUpdated: site.lastUpdated,
      previewUrl: getPublicPreviewHref(site),
    },
    endpoints,
    delivery: {
      hosting: 'Vercel-ready custom frontend or Backy managed preview',
      database: 'Backy-owned content APIs with Supabase connectivity planned in Settings',
      storage: 'Backy media library, public/private visibility, responsive transforms, and file exports',
      ownership: 'Backy remains the backend control plane; the frontend consumes published contracts.',
    },
    featureSystems: SITE_FEATURE_SYSTEMS.map((system) => ({
      key: system.key,
      title: system.title,
      adminPath: system.adminPath,
      publicSurface: system.publicSurface,
      endpoint: `${publicApiBase}${system.endpoint.replace('{siteId}', encodeURIComponent(getSiteApiId(site)))}`,
      readiness: system.readiness,
    })),
    requiredNextControls: [
      'Per-site theme tokens, animations, and component variants',
      'Domain verification and Vercel deploy orchestration',
      'Supabase auth/database adapter settings',
      'Commerce checkout provider and tax/shipping rules',
      'Public registration and member account flows',
    ],
  };
};

function SitesLayout() {
  const routerState = useRouterState();
  const isExactSitesRoute = routerState.location.pathname === '/sites';

  if (isExactSitesRoute) {
    return <SitesListView />;
  }

  return <Outlet />;
}

function SitesListView() {
  const navigate = useNavigate();
  const { sites, setSites, deleteSite } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [domainFilter, setDomainFilter] = useState<SiteDomainFilter>('all');
  const [pageCoverageFilter, setPageCoverageFilter] = useState<SitePageCoverageFilter>('all');
  const [updatingSiteId, setUpdatingSiteId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const isSiteMutationBusy = updatingSiteId !== null;
  const isSitesBusy = isLoading || isSiteMutationBusy;
  const publicApiBase = useMemo(() => getApiBaseUrl('public'), []);
  const adminApiBase = useMemo(() => getApiBaseUrl('admin'), []);

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const backendSites = await listSites();
      const sitesWithPageCounts = await Promise.all(
        backendSites.map(async (site) => {
          try {
            const pages = await listPages(site.publicSiteId || site.id);
            return { ...site, pageCount: pages.length };
          } catch {
            return site;
          }
        }),
      );
      setSites(sitesWithPageCounts);
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'Unable to load sites');
    } finally {
      setIsLoading(false);
    }
  }, [setSites]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const metrics = useMemo(() => {
    const published = sites.filter((site) => site.status === 'published').length;
    const draft = sites.filter((site) => site.status === 'draft').length;
    const archived = sites.filter((site) => site.status === 'archived').length;
    const pages = sites.reduce((total, site) => total + (site.pageCount || 0), 0);
    const customDomains = sites.filter((site) => site.customDomain).length;

    return [
      { label: 'Sites', value: sites.length, detail: `${published} public`, icon: Globe },
      { label: 'Pages controlled', value: pages, detail: 'Across all workspaces', icon: Layers3 },
      { label: 'Draft sites', value: draft, detail: 'Private until published', icon: Edit },
      { label: 'Custom domains', value: customDomains, detail: 'Domain-owned workspaces', icon: Server },
      { label: 'Archived', value: archived, detail: 'Hidden from active work', icon: Archive },
    ];
  }, [sites]);

  const filteredSites = useMemo(() => (
    sites.filter((site) => {
      if (statusFilter !== 'all' && site.status !== statusFilter) return false;
      if (domainFilter === 'custom' && !site.customDomain) return false;
      if (domainFilter === 'backy' && site.customDomain) return false;
      if (pageCoverageFilter === 'with-pages' && (site.pageCount || 0) <= 0) return false;
      if (pageCoverageFilter === 'empty' && (site.pageCount || 0) > 0) return false;
      return true;
    })
  ), [domainFilter, pageCoverageFilter, sites, statusFilter]);
  const selectedApiSite = useMemo(() => filteredSites[0] || sites[0] || null, [filteredSites, sites]);
  const selectedApiSiteId = selectedApiSite?.publicSiteId || selectedApiSite?.id || '{siteId}';
  const adminSitesUrl = `${adminApiBase}/sites`;
  const adminSiteDetailUrl = `${adminApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}`;
  const publicManifestUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/manifest`;
  const publicOpenApiUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/openapi`;
  const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(selectedApiSiteId)}/render?path=/`;
  const selectedFrontendContract = useMemo(() => (
    selectedApiSite ? buildSiteFrontendContract(selectedApiSite, publicApiBase, adminApiBase) : null
  ), [adminApiBase, publicApiBase, selectedApiSite]);
  const selectedSiteRouteSearch = useMemo(() => getSiteRouteSearch(selectedApiSite), [selectedApiSite]);
  const siteLaunchReadiness = useMemo(() => {
    const published = sites.filter((site) => site.status === 'published').length;
    const draft = sites.filter((site) => site.status === 'draft').length;
    const archived = sites.filter((site) => site.status === 'archived').length;
    const pageTotal = sites.reduce((total, site) => total + (site.pageCount || 0), 0);
    const customDomains = sites.filter((site) => site.customDomain).length;
    const checks = [
      {
        label: 'Workspace inventory',
        detail: sites.length > 0 ? `${sites.length} site${sites.length === 1 ? '' : 's'} under management` : 'Create a site before adding content.',
        ready: sites.length > 0,
      },
      {
        label: 'Published frontend',
        detail: published > 0 ? `${published} public site${published === 1 ? '' : 's'}` : 'Publish at least one site for public delivery.',
        ready: published > 0,
      },
      {
        label: 'Page foundation',
        detail: pageTotal > 0 ? `${pageTotal} page${pageTotal === 1 ? '' : 's'} connected to sites` : 'Add pages so each frontend has routes to render.',
        ready: pageTotal > 0,
      },
      {
        label: 'Domain routing',
        detail: customDomains > 0 ? `${customDomains} custom domain${customDomains === 1 ? '' : 's'} configured` : 'Backy preview domains are available until custom domains are added.',
        ready: sites.length > 0,
      },
      {
        label: 'API handoff',
        detail: selectedApiSite ? `Manifest, OpenAPI, and render URLs are scoped to ${selectedApiSite.name}.` : 'Create a site to generate frontend API URLs.',
        ready: Boolean(selectedApiSite),
      },
      {
        label: 'Publishing hygiene',
        detail: archived > 0 || draft > 0
          ? `${draft} draft, ${archived} archived, ${published} published`
          : 'Every site has an explicit public state.',
        ready: sites.length > 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Create the site shell', detail: 'Name, slug, description, status, and preview domain.' },
        { label: 'Attach content systems', detail: 'Pages, blog, products, forms, contacts, media, and collections.' },
        { label: 'Configure delivery', detail: 'Domains, API base URLs, Supabase, Vercel, keys, SEO, and security.' },
        { label: 'Publish and iterate', detail: 'Preview, export contracts, ship public APIs, then refine per-site design.' },
      ],
    };
  }, [selectedApiSite, sites]);

  const handleStatusChange = async (site: Site, status: Site['status']) => {
    if (isSitesBusy) return;

    setUpdatingSiteId(site.id);
    setNotice(null);

    try {
      const saved = await updateSiteFromApi(site.publicSiteId || site.id, { status });
      setSites(sites.map((item) => (item.id === site.id ? saved : item)));
      setNotice(`${saved.name} is now ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update site status');
    } finally {
      setUpdatingSiteId(null);
    }
  };

  const handleDuplicateSite = async (site: Site) => {
    if (isSitesBusy) return;

    setUpdatingSiteId(site.id);
    setNotice(null);

    try {
      const suffix = Date.now().toString(36).slice(-6);
      const duplicated = await createSiteFromApi({
        name: `${site.name} Copy`,
        slug: `${site.slug}-copy-${suffix}`,
        description: site.description
          ? `${site.description}\n\nDuplicated from ${site.name}.`
          : `Duplicated from ${site.name}.`,
        customDomain: null,
        status: 'draft',
      });
      setSites([duplicated, ...sites]);
      setStatusFilter('all');
      setDomainFilter('all');
      setPageCoverageFilter('all');
      setNotice(`${site.name} duplicated as ${duplicated.name}. Add domains, pages, and publish settings before going live.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to duplicate site');
    } finally {
      setUpdatingSiteId(null);
    }
  };

  const handleArchiveSite = async (site: Site) => {
    if (isSitesBusy) return;

    await handleStatusChange(site, 'archived');
  };

  const handleDeleteSite = async () => {
    if (!pendingDelete || isSiteMutationBusy) return;
    if (deleteConfirmationText.trim() !== pendingDelete.name) return;

    setUpdatingSiteId(pendingDelete.id);
    setNotice(null);

    try {
      await deleteSiteFromApi(pendingDelete.publicSiteId || pendingDelete.id);
      deleteSite(pendingDelete.id);
      setPendingDelete(null);
      setDeleteConfirmationText('');
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : 'Unable to delete site');
    } finally {
      setUpdatingSiteId(null);
    }
  };

  const copySiteApiText = async (value: string, label: string) => {
    if (isSitesBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const copySelectedFrontendContract = async () => {
    if (isSitesBusy) return;

    if (!selectedFrontendContract) {
      setNotice('Create a site before copying a frontend contract.');
      return;
    }

    await copySiteApiText(JSON.stringify(selectedFrontendContract, null, 2), 'Frontend contract');
  };

  const columns: Column<Site>[] = [
    {
      key: 'name',
      label: 'Site',
      sortable: true,
      render: (site) => (
        <button
          type="button"
          onClick={() => {
            if (!isSitesBusy) {
              void navigate({ to: '/sites/$siteId', params: { siteId: site.id } });
            }
          }}
          disabled={isSitesBusy}
          className="group flex min-w-[260px] items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Globe className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground group-hover:text-primary">{site.name}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{getDisplayDomain(site)}</span>
          </span>
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (site) => (
        <div className="space-y-2">
          <StatusBadge status={site.status} />
          <select
            value={site.status}
            disabled={isSitesBusy}
            onChange={(event) => void handleStatusChange(site, event.target.value as Site['status'])}
            className="block w-36 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={`Change status for ${site.name}`}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
      ),
    },
    {
      key: 'pageCount',
      label: 'Pages',
      sortable: true,
      render: (site) => <span className="text-sm text-muted-foreground">{site.pageCount} pages</span>,
    },
    {
      key: 'lastUpdated',
      label: 'Updated',
      sortable: true,
      render: (site) => <span className="text-sm text-muted-foreground">{formatDate(site.lastUpdated)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (site) => (
        <div className="flex items-center justify-end gap-2">
          <a
            href={getPublicPreviewHref(site)}
            target="_blank"
            rel="noreferrer"
            aria-disabled={isSitesBusy}
            onClick={(event) => {
              if (isSitesBusy) {
                event.preventDefault();
              }
            }}
            className={cn(
              'rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
              isSitesBusy && 'pointer-events-none cursor-not-allowed opacity-50',
            )}
            aria-label={`Preview ${site.name}`}
            title="Preview site"
          >
            <Eye className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => {
              if (!isSitesBusy) {
                void navigate({ to: '/sites/$siteId', params: { siteId: site.id } });
              }
            }}
            disabled={isSitesBusy}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Manage ${site.name}`}
            title="Manage site"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicateSite(site)}
            disabled={isSitesBusy}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Duplicate ${site.name}`}
            title="Duplicate site"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleArchiveSite(site)}
            disabled={isSitesBusy || site.status === 'archived'}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Archive ${site.name}`}
            title="Archive site"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isSitesBusy) {
                setDeleteConfirmationText('');
                setPendingDelete(site);
              }
            }}
            disabled={isSitesBusy}
            className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Delete ${site.name}`}
            title="Delete site"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const {
    data,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
  } = useDataTable({
    data: filteredSites,
    columns,
    initialSort: { key: 'lastUpdated', direction: 'desc' },
    pageSize: 8,
  });

  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== 'all' || domainFilter !== 'all' || pageCoverageFilter !== 'all';

  const handleExportSites = () => {
    if (data.length === 0 || isSitesBusy) return;

    const rows = data.map((site) => {
      const contract = buildSiteFrontendContract(site, publicApiBase, adminApiBase);

      return [
        site.id,
        site.publicSiteId || '',
        site.name,
        site.slug,
        site.description || '',
        site.customDomain || '',
        site.status,
        site.pageCount || 0,
        site.lastUpdated || '',
        getPublicPreviewHref(site),
        contract.endpoints.public.manifest,
        contract.endpoints.public.openApi,
        contract.endpoints.public.renderHome,
        contract.endpoints.admin.detail,
        `${typeof window !== 'undefined' ? window.location.origin : ''}/sites/${site.id}`,
        contract.delivery.hosting,
        contract.featureSystems.map((system) => `${system.key}:${system.adminPath}`).join('; '),
        contract.featureSystems.map((system) => system.publicSurface).join(' | '),
        contract.requiredNextControls.join(' | '),
      ];
    });
    const csv = [SITE_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-sites.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const clearSiteFilters = () => {
    if (isSitesBusy) return;

    setSearchQuery('');
    setStatusFilter('all');
    setDomainFilter('all');
    setPageCoverageFilter('all');
    setCurrentPage(1);
  };
  const openNewSite = () => {
    if (isSitesBusy) return;

    void navigate({ to: '/sites/new' });
  };
  const openSiteControlArea = (area: typeof SITE_CONTROL_AREAS[number]) => {
    if (isSitesBusy) return;

    if (area.route === '/pages') {
      void navigate(selectedSiteRouteSearch ? { to: '/pages', search: selectedSiteRouteSearch } : { to: '/pages' });
      return;
    }

    if (area.route === '/blog') {
      void navigate(selectedSiteRouteSearch ? { to: '/blog', search: selectedSiteRouteSearch } : { to: '/blog' });
      return;
    }

    if (area.route === '/products') {
      void navigate(selectedSiteRouteSearch ? { to: '/products', search: selectedSiteRouteSearch } : { to: '/products' });
      return;
    }

    if (area.route === '/forms') {
      void navigate(selectedSiteRouteSearch ? { to: '/forms', search: selectedSiteRouteSearch } : { to: '/forms' });
      return;
    }

    if (area.route === '/media') {
      void navigate(selectedSiteRouteSearch ? { to: '/media', search: selectedSiteRouteSearch } : { to: '/media' });
      return;
    }

    void navigate({ to: '/settings', search: { tab: 'infrastructure' } });
  };
  const openSiteFeatureSystem = (system: typeof SITE_FEATURE_SYSTEMS[number]) => {
    if (isSitesBusy) return;

    if (system.adminPath === '/pages') {
      void navigate(selectedSiteRouteSearch ? { to: '/pages', search: selectedSiteRouteSearch } : { to: '/pages' });
      return;
    }

    if (system.adminPath === '/blog') {
      void navigate(selectedSiteRouteSearch ? { to: '/blog', search: selectedSiteRouteSearch } : { to: '/blog' });
      return;
    }

    if (system.adminPath === '/products') {
      void navigate(selectedSiteRouteSearch ? { to: '/products', search: selectedSiteRouteSearch } : { to: '/products' });
      return;
    }

    if (system.adminPath === '/forms') {
      void navigate(selectedSiteRouteSearch ? { to: '/forms', search: selectedSiteRouteSearch } : { to: '/forms' });
      return;
    }

    if (system.adminPath === '/media') {
      void navigate(selectedSiteRouteSearch ? { to: '/media', search: selectedSiteRouteSearch } : { to: '/media' });
      return;
    }

    if (system.adminPath === '/collections') {
      void navigate(selectedSiteRouteSearch ? { to: '/collections', search: selectedSiteRouteSearch } : { to: '/collections' });
      return;
    }

    if (system.adminPath === '/users') {
      void navigate({ to: '/users' });
      return;
    }

    void navigate({ to: '/settings', search: { tab: 'infrastructure' } });
  };

  return (
    <PageShell
      title="Sites"
      description="Create, publish, preview, and manage every frontend workspace Backy controls."
      action={
        <button
          type="button"
          onClick={openNewSite}
          disabled={isSitesBusy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          New site
        </button>
      }
      className="w-full"
    >
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="sites-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Sites command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                siteLaunchReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {siteLaunchReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control site workspaces, publish state, preview domains, frontend contracts, and the feature systems each website needs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSites()}
              disabled={isSitesBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
              Refresh sites
            </button>
            <button
              type="button"
              onClick={openNewSite}
              disabled={isSitesBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="size-4" />
              New site
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Workspace launch readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks site inventory, public workspaces, page coverage, domain routing, API handoff, and publishing hygiene.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', siteLaunchReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${siteLaunchReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {siteLaunchReadiness.checks.map((check) => (
                <SiteLaunchCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Site operating workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {siteLaunchReadiness.workflow.map((step, index) => (
                <SiteWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Sites control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to health, frontend APIs, feature systems, library controls, and site records.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {SITE_LIST_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <div id="sites-health" className="grid gap-3 scroll-mt-24 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <metric.icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <Panel id="sites-api" className="scroll-mt-24">
        <PanelHeader
          title="Site frontend API"
          description="Discovery, rendering, and admin management endpoints for custom frontends connected to this workspace."
          icon={<Code2 className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={data.length === 0 || isSitesBusy}
                onClick={handleExportSites}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSitesBusy}
                onClick={() => void copySiteApiText(publicManifestUrl, 'Site manifest URL')}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selectedFrontendContract || isSitesBusy}
                onClick={() => void copySelectedFrontendContract()}
                iconStart={<Code2 className="size-4" />}
              >
                Copy contract
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-4">
            <SiteApiStat label="Selected site" value={selectedApiSite?.name || 'No site'} />
            <SiteApiStat label="Published" value={`${sites.filter((site) => site.status === 'published').length}`} />
            <SiteApiStat label="Draft" value={`${sites.filter((site) => site.status === 'draft').length}`} />
            <SiteApiStat label="Custom domains" value={`${sites.filter((site) => site.customDomain).length}`} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Site launch readiness</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tracks whether Backy has the site, pages, public state, routing, and API contract needed for a custom frontend.
                  </p>
                </div>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  siteLaunchReadiness.score >= 80
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700',
                )}
                >
                  {siteLaunchReadiness.score}% ready
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    siteLaunchReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                  style={{ width: `${siteLaunchReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {siteLaunchReadiness.checks.map((check) => (
                  <SiteLaunchCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Website operating workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {siteLaunchReadiness.workflow.map((step, index) => (
                  <SiteWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div id="sites-workflows" className="mt-4 rounded-lg border border-border bg-background p-4 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Frontend control map</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The site workspace should own every frontend system a Wix-style build needs: structure, content, commerce, leads, files, and delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSitesBusy) {
                    void navigate({ to: '/settings', search: { tab: 'infrastructure' } });
                  }
                }}
                disabled={isSitesBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Server className="h-4 w-4" />
                Delivery setup
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {SITE_CONTROL_AREAS.map((area) => (
                <button
                  key={area.title}
                  type="button"
                  onClick={() => openSiteControlArea(area)}
                  disabled={isSitesBusy}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="text-sm font-semibold text-foreground">{area.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <SiteApiSnippet label="Frontend manifest" value={publicManifestUrl} />
            <SiteApiSnippet label="OpenAPI schema" value={publicOpenApiUrl} />
            <SiteApiSnippet label="Render by path" value={publicRenderUrl} />
            <SiteApiSnippet label="Admin sites" value={adminSitesUrl} />
            <SiteApiSnippet label="Admin site detail" value={adminSiteDetailUrl} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Website feature contract</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every public frontend should be able to discover these systems from Backy, then render whatever design the builder or custom app needs.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedFrontendContract || isSitesBusy}
                  onClick={() => void copySelectedFrontendContract()}
                  iconStart={<Copy className="size-3.5" />}
                >
                  Copy JSON
                </Button>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {SITE_FEATURE_SYSTEMS.map((system) => (
                  <button
                    key={system.key}
                    type="button"
                    onClick={() => openSiteFeatureSystem(system)}
                    disabled={isSitesBusy}
                    className="rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{system.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.publicSurface}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {system.key}
                      </span>
                    </div>
                    <div className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                      {system.endpoint}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">What Backy still needs here</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                These are not external products replacing Backy. They are the missing controls Backy must own before it can feel like Wix, Webflow, WordPress, or Squarespace.
              </p>
              <div className="mt-4 grid gap-2">
                {(selectedFrontendContract?.requiredNextControls || [
                  'Create a site to generate the next control checklist.',
                ]).map((control) => (
                  <div key={control} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-xs leading-5 text-muted-foreground">{control}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PanelContent>
      </Panel>

      <div id="sites-controls" className="rounded-lg border border-border bg-card p-4 shadow-sm scroll-mt-24">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search sites, slugs, domains, or status..."
              value={searchQuery}
              disabled={isSitesBusy}
              onChange={(event) => {
                if (isSitesBusy) return;

                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              aria-label="Search sites"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <select
                value={statusFilter}
                disabled={isSitesBusy}
                onChange={(event) => {
                  if (isSitesBusy) return;

                  setStatusFilter(event.target.value as SiteStatusFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Filter sites by status"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              Domain
              <select
                value={domainFilter}
                disabled={isSitesBusy}
                onChange={(event) => {
                  if (isSitesBusy) return;

                  setDomainFilter(event.target.value as SiteDomainFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Filter sites by domain"
              >
                <option value="all">All domains</option>
                <option value="custom">Custom domains</option>
                <option value="backy">Backy preview domains</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              Pages
              <select
                value={pageCoverageFilter}
                disabled={isSitesBusy}
                onChange={(event) => {
                  if (isSitesBusy) return;

                  setPageCoverageFilter(event.target.value as SitePageCoverageFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Filter sites by page coverage"
              >
                <option value="all">All page coverage</option>
                <option value="with-pages">Has pages</option>
                <option value="empty">No pages yet</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadSites()}
              disabled={isSitesBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              aria-label="Refresh sites"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {notice && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </div>
        )}
      </div>

      <div id="sites-library" className="scroll-mt-24">
        <DataGrid
          columns={columns}
          data={data}
          loading={isLoading}
          interactionDisabled={isSitesBusy}
          sortConfig={sortConfig}
          onSort={(key) => {
            if (!isSitesBusy) {
              handleSort(key);
            }
          }}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={10}
          onPageChange={(page) => {
            if (!isSitesBusy) {
              setCurrentPage(page);
            }
          }}
          totalItems={totalItems}
          emptyState={
            <EmptyState
              icon={hasActiveFilters ? Search : Globe}
              title={hasActiveFilters ? 'No sites match those controls' : 'No sites found'}
              description={hasActiveFilters ? 'Clear the search or filters to return to the full workspace list.' : 'Create the first site before adding pages, navigation, media, products, or forms.'}
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearSiteFilters}
                    disabled={isSitesBusy}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openNewSite}
                    disabled={isSitesBusy}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Create site
                  </button>
                )
              }
            />
          }
        />
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDelete.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the site workspace and its managed content from the admin backend. Use archive when you only want to hide it.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Public address: <span className="font-medium text-foreground">{getDisplayDomain(pendingDelete)}</span>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Type <span className="font-semibold text-foreground">{pendingDelete.name}</span> to confirm deletion
              </span>
              <input
                value={deleteConfirmationText}
                disabled={isSiteMutationBusy}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Confirm site deletion name"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isSiteMutationBusy) {
                    setPendingDelete(null);
                    setDeleteConfirmationText('');
                  }
                }}
                disabled={isSiteMutationBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSite()}
                disabled={isSiteMutationBusy || deleteConfirmationText.trim() !== pendingDelete.name}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSiteMutationBusy ? 'Deleting...' : 'Delete site'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SiteApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function SiteLaunchCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
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

function SiteWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
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

function SiteApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}
