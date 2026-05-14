/**
 * BACKY CMS - NEW SITE PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Code2, Copy, CreditCard, Download, FileText, Globe, Layers3, Link2, Rocket, Save, ShieldCheck } from 'lucide-react';
import { AdminContentApiError, createPage, createSite, getAdminApiBase, getUserPermissions, type AdminUserPermissionMatrix } from '@/lib/adminContentApi';
import { useAuthStore, type User } from '@/stores/authStore';
import { useStore, type Site } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { getSiteSelectionFromSearch } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';

export const Route = createFileRoute('/sites/new')({
  component: NewSitePage,
});

const STATUS_OPTIONS: Array<{ value: Site['status']; label: string; detail: string }> = [
  { value: 'draft', label: 'Draft', detail: 'Private while you build pages, navigation, products, and forms.' },
  { value: 'published', label: 'Published', detail: 'Public immediately after creation.' },
  { value: 'archived', label: 'Archived', detail: 'Creates the workspace but keeps it out of active work.' },
];

type SiteBlueprint = 'blank' | 'business' | 'storefront' | 'publication';
type SiteCreatePermissionKey = 'sites.create' | 'pages.edit' | 'pages.publish';
type SiteCreateBillingPlan = NonNullable<NonNullable<Site['settings']>['billingQuota']>['plan'];
type SiteCreateTemplateSource = 'starter-marketplace' | 'import-url' | 'custom-frontend';

const BILLING_PLAN_OPTIONS: Array<{ value: SiteCreateBillingPlan; label: string; detail: string }> = [
  { value: 'free', label: 'Free', detail: 'Small personal workspace limits.' },
  { value: 'pro', label: 'Pro', detail: 'Higher page, media, and domain limits.' },
  { value: 'business', label: 'Business', detail: 'Team workspace with commerce-ready limits.' },
  { value: 'enterprise', label: 'Enterprise', detail: 'Large catalog, media, and team limits.' },
];

const CREATE_BILLING_PLAN_LIMITS: Record<SiteCreateBillingPlan, NonNullable<NonNullable<Site['settings']>['billingQuota']>['limits']> = {
  free: {
    pages: 10,
    mediaGb: 1,
    bandwidthGb: 10,
    forms: 3,
    products: 25,
    collections: 3,
    teamMembers: 2,
    customDomains: 1,
  },
  pro: {
    pages: 75,
    mediaGb: 25,
    bandwidthGb: 250,
    forms: 20,
    products: 500,
    collections: 25,
    teamMembers: 8,
    customDomains: 5,
  },
  business: {
    pages: 250,
    mediaGb: 100,
    bandwidthGb: 1000,
    forms: 75,
    products: 5000,
    collections: 100,
    teamMembers: 25,
    customDomains: 20,
  },
  enterprise: {
    pages: 1000,
    mediaGb: 1000,
    bandwidthGb: 10000,
    forms: 500,
    products: 50000,
    collections: 500,
    teamMembers: 250,
    customDomains: 100,
  },
};

const TEMPLATE_SOURCE_OPTIONS: Array<{ value: SiteCreateTemplateSource; label: string; detail: string }> = [
  { value: 'starter-marketplace', label: 'Starter marketplace', detail: 'Use the selected Backy blueprint as the first reusable design source.' },
  { value: 'import-url', label: 'Import URL', detail: 'Record an external design/import URL for follow-up capture.' },
  { value: 'custom-frontend', label: 'Custom frontend', detail: 'Record a custom frontend contract source for handoff.' },
];

const SITE_CREATE_PERMISSION_ROLE_DEFAULTS: Record<SiteCreatePermissionKey, Array<User['role']>> = {
  'sites.create': ['owner', 'admin'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
};

const siteCreatePermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: SiteCreatePermissionKey,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key) || null;

const isSiteCreatePermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  _currentAdmin: User | null,
  key: SiteCreatePermissionKey,
): boolean => {
  const matrixRule = siteCreatePermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.allowed;

  return false;
};

const siteCreatePermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: User | null,
  key: SiteCreatePermissionKey,
): string => {
  const matrixRule = siteCreatePermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.reason;
  if (!currentAdmin) return 'Sign in with an admin account to use this capability.';
  if (!permissionMatrix) return 'Permission matrix unavailable. Reload permissions before using this capability.';

  return SITE_CREATE_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)
    ? `Blocked until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Blocked by backend permissions and ${currentAdmin.role} role defaults.`;
};

interface StarterPageSpec {
  title: string;
  slug: string;
  template: string;
  description: string;
  isHomepage?: boolean;
}

const BLUEPRINT_OPTIONS: Array<{
  id: SiteBlueprint;
  name: string;
  detail: string;
  pages: StarterPageSpec[];
}> = [
  {
    id: 'blank',
    name: 'Blank workspace',
    detail: 'Create only the site record and add pages later.',
    pages: [],
  },
  {
    id: 'business',
    name: 'Business site',
    detail: 'Home, About, Contact, and starter lead capture.',
    pages: [
      { title: 'Home', slug: 'index', template: 'landing', description: 'Introduce the offer and guide visitors to the next step.', isHomepage: true },
      { title: 'About', slug: 'about', template: 'about', description: 'Explain the story, values, and proof behind the brand.' },
      { title: 'Contact', slug: 'contact', template: 'contact', description: 'Invite visitors to ask a question or request a quote.' },
    ],
  },
  {
    id: 'storefront',
    name: 'Storefront',
    detail: 'Home, Shop, Contact, and commerce-ready copy.',
    pages: [
      { title: 'Home', slug: 'index', template: 'landing', description: 'Feature the flagship offer and route visitors to products.', isHomepage: true },
      { title: 'Shop', slug: 'shop', template: 'store', description: 'A flexible storefront page ready to bind to Backy products.' },
      { title: 'Contact', slug: 'contact', template: 'contact', description: 'Collect support, wholesale, or product questions.' },
    ],
  },
  {
    id: 'publication',
    name: 'Publication',
    detail: 'Home, Blog, About, and editorial setup.',
    pages: [
      { title: 'Home', slug: 'index', template: 'landing', description: 'Introduce the publication and highlight recent stories.', isHomepage: true },
      { title: 'Blog', slug: 'blog', template: 'blog', description: 'A public index page for articles and editorial content.' },
      { title: 'About', slug: 'about', template: 'about', description: 'Explain the editorial mission and contributors.' },
    ],
  },
];

const SITE_CREATION_AREAS = [
  {
    title: 'Site identity',
    detail: 'Name, slug, custom domain, status, and description.',
    href: '#site-identity',
  },
  {
    title: 'Starter structure',
    detail: 'Blueprint pages that become editable canvas records after creation.',
    href: '#site-blueprint',
  },
  {
    title: 'Launch setup',
    detail: 'DNS verification, deploy target, plan limits, and template source.',
    href: '#site-launch',
  },
  {
    title: 'Public address',
    detail: 'Managed Backy subdomain or normalized custom domain.',
    href: '#site-preview',
  },
  {
    title: 'Seeded pages',
    detail: 'The first homepage and supporting routes that will open in the editor.',
    href: '#site-pages',
  },
  {
    title: 'API handoff',
    detail: 'Create endpoint, starter payload, seeded routes, and frontend contract.',
    href: '#site-api',
  },
] as const;

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeDomain = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '');

const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isValidDomain = (value: string) => !value || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
const normalizeOptionalUrl = (value: string) => value.trim();
const createDnsToken = (slug: string) => `backy-${slug || 'new-site'}-${Math.random().toString(36).slice(2, 10)}`;
const createSetupEventId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function NewSitePage() {
  const navigate = useNavigate();
  const { sites, pages, setSites, setPages } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [createdSiteRecovery, setCreatedSiteRecovery] = useState<Site | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    customDomain: '',
    teamId: '',
    description: '',
    status: 'draft' as Site['status'],
    blueprint: 'business' as SiteBlueprint,
    vercelProjectId: '',
    vercelTeamSlug: '',
    vercelProductionDomain: '',
    billingPlan: 'free' as SiteCreateBillingPlan,
    billingEmail: '',
    templateSource: 'starter-marketplace' as SiteCreateTemplateSource,
    templateImportUrl: '',
    marketplaceTemplateId: 'backy-starter-business',
  });
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canCreateSites = !isPermissionMatrixPending && isSiteCreatePermissionAllowed(permissionMatrix, currentAdmin, 'sites.create');
  const canEditPages = !isPermissionMatrixPending && isSiteCreatePermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit');
  const canPublishPages = !isPermissionMatrixPending && isSiteCreatePermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish');
  const createPermissionTitle = canCreateSites ? undefined : siteCreatePermissionReason(permissionMatrix, currentAdmin, 'sites.create');
  const editPagesPermissionTitle = canEditPages ? undefined : siteCreatePermissionReason(permissionMatrix, currentAdmin, 'pages.edit');
  const publishPagesPermissionTitle = canPublishPages ? undefined : siteCreatePermissionReason(permissionMatrix, currentAdmin, 'pages.publish');
  const isCreateBusy = isLoading || isPermissionMatrixPending;

  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[0],
    [formData.status],
  );
  const displaySlug = formData.slug || slugify(formData.name);
  const normalizedDomain = normalizeDomain(formData.customDomain);
  const publicAddress = normalizedDomain || `${displaySlug || 'new-site'}.backy.app`;
  const existingPagesSearch = useMemo(() => ({ siteId: getSiteSelectionFromSearch(sites) }), [sites]);
  const selectedBlueprint = useMemo(
    () => BLUEPRINT_OPTIONS.find((blueprint) => blueprint.id === formData.blueprint) || BLUEPRINT_OPTIONS[0],
    [formData.blueprint],
  );
  const selectedBillingPlan = useMemo(
    () => BILLING_PLAN_OPTIONS.find((plan) => plan.value === formData.billingPlan) || BILLING_PLAN_OPTIONS[0],
    [formData.billingPlan],
  );
  const selectedTemplateSource = useMemo(
    () => TEMPLATE_SOURCE_OPTIONS.find((source) => source.value === formData.templateSource) || TEMPLATE_SOURCE_OPTIONS[0],
    [formData.templateSource],
  );
  const templateImportUrl = normalizeOptionalUrl(formData.templateImportUrl);
  const vercelProjectId = formData.vercelProjectId.trim();
  const vercelTeamSlug = formData.vercelTeamSlug.trim();
  const vercelProductionDomain = normalizeDomain(formData.vercelProductionDomain) || normalizedDomain || `${displaySlug || 'new-site'}.backy.app`;
  const starterPagesSelected = selectedBlueprint.pages.length > 0;
  const statusSeedsPublishedPages = formData.status === 'published';
  const canSeedStarterPages = !starterPagesSelected || (canEditPages && (!statusSeedsPublishedPages || canPublishPages));
  const creationFormDisabled = isCreateBusy || !canCreateSites;
  const starterPageControlsDisabled = creationFormDisabled || !canEditPages;
  const creationDisabledTitle = isPermissionMatrixPending
    ? 'Loading site creation permissions...'
    : !canCreateSites
      ? createPermissionTitle
      : undefined;
  const starterPageDisabledTitle = creationDisabledTitle
    || (!canEditPages ? editPagesPermissionTitle : undefined)
    || (statusSeedsPublishedPages && !canPublishPages ? publishPagesPermissionTitle : undefined);
  const canSubmit = formData.name.trim().length > 1
    && isValidSlug(displaySlug)
    && isValidDomain(normalizedDomain)
    && (formData.templateSource !== 'import-url' || templateImportUrl.length > 0)
    && canCreateSites
    && canSeedStarterPages;
  const adminSitesUrl = useMemo(() => `${getAdminApiBase()}/sites`, []);
  const publicApiBase = useMemo(() => getAdminApiBase().replace(/\/api\/admin$/, '/api'), []);
  const siteCreationReadiness = useMemo(() => {
    const hasName = formData.name.trim().length > 1;
    const hasValidSlug = isValidSlug(displaySlug);
    const hasValidDomain = isValidDomain(normalizedDomain);
    const hasStarterPages = selectedBlueprint.pages.length > 0;
    const checks = [
      {
        label: 'Workspace name',
        detail: hasName ? formData.name.trim() : 'Add a clear site name.',
        ready: hasName,
      },
      {
        label: 'Managed route',
        detail: hasValidSlug ? `${displaySlug}.backy.app` : 'Use lowercase letters, numbers, and hyphens.',
        ready: hasValidSlug,
      },
      {
        label: 'Domain input',
        detail: normalizedDomain ? normalizedDomain : 'Managed Backy subdomain will be used.',
        ready: hasValidDomain,
      },
      {
        label: 'DNS verification',
        detail: normalizedDomain ? 'Custom domain will start with pending TXT/CNAME verification.' : 'Managed Backy subdomain will be marked verified.',
        ready: hasValidDomain,
      },
      {
        label: 'Vercel target',
        detail: vercelProjectId
          ? `Preview deploy handoff will target ${vercelProjectId}.`
          : 'Deploy metadata can be added later from site controls.',
        ready: true,
      },
      {
        label: 'Plan limits',
        detail: `${selectedBillingPlan.label} limits will be stored with the site.`,
        ready: true,
      },
      {
        label: 'Template source',
        detail: selectedTemplateSource.detail,
        ready: formData.templateSource !== 'import-url' || templateImportUrl.length > 0,
      },
      {
        label: 'Backend team',
        detail: formData.teamId.trim()
          ? `Create under team ${formData.teamId.trim()}.`
          : 'Server will infer the database team from configuration or existing site ownership.',
        ready: true,
      },
      {
        label: 'Starter pages',
        detail: hasStarterPages && canSeedStarterPages
          ? `${selectedBlueprint.pages.length} page${selectedBlueprint.pages.length === 1 ? '' : 's'} will be seeded with editable header, navigation, and footer`
          : hasStarterPages
            ? `Starter pages need pages.edit${statusSeedsPublishedPages ? ' and pages.publish' : ''}.`
            : 'Blank workspace starts without pages.',
        ready: !hasStarterPages || canSeedStarterPages,
      },
      {
        label: 'Site creation access',
        detail: canCreateSites ? 'Your account can create site workspaces.' : createPermissionTitle || 'Site creation is not available.',
        ready: canCreateSites,
      },
      {
        label: 'Homepage seed',
        detail: selectedBlueprint.pages.some((page) => page.isHomepage)
          ? 'Blueprint includes a homepage route.'
          : 'Create a homepage after the blank site is created.',
        ready: selectedBlueprint.id === 'blank' || selectedBlueprint.pages.some((page) => page.isHomepage),
      },
      {
        label: 'Publish state',
        detail: selectedStatus.detail,
        ready: Boolean(formData.status),
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Create workspace', detail: 'Persist the site identity, slug, status, and optional custom domain.' },
        { label: 'Seed structure', detail: 'Optionally create starter pages with serialized body, header, navigation, and footer content.' },
        { label: 'Open controls', detail: 'Manage readiness, navigation, redirects, SEO, automation, and API handoff.' },
        { label: 'Design and publish', detail: 'Edit seeded pages, connect content systems, and expose the frontend contract.' },
      ],
    };
  }, [
    displaySlug,
    formData.name,
    formData.status,
    formData.teamId,
    formData.templateSource,
    normalizedDomain,
    selectedBillingPlan.label,
    canCreateSites,
    canSeedStarterPages,
    createPermissionTitle,
    selectedBlueprint.id,
    selectedBlueprint.pages,
    selectedTemplateSource.detail,
    selectedStatus.detail,
    statusSeedsPublishedPages,
    templateImportUrl.length,
    vercelProjectId,
  ]);
  const createPayloadPreview = useMemo(() => ({
    name: formData.name.trim() || 'Untitled site',
    slug: displaySlug || 'new-site',
    customDomain: normalizedDomain || null,
    teamId: formData.teamId.trim() || undefined,
    description: formData.description.trim(),
    status: formData.status,
    blueprint: formData.blueprint,
    launchSetup: {
      dns: normalizedDomain ? 'pending dns-txt verification' : 'managed domain verified',
      vercelProjectId: vercelProjectId || null,
      vercelProductionDomain,
      billingPlan: formData.billingPlan,
      templateSource: formData.templateSource,
      templateImportUrl: templateImportUrl || null,
      marketplaceTemplateId: formData.marketplaceTemplateId.trim() || null,
    },
    starterPages: selectedBlueprint.pages.map((page) => ({
      title: page.title,
      slug: page.slug,
      path: page.isHomepage ? '/' : `/${page.slug}`,
      template: page.template,
      isHomepage: Boolean(page.isHomepage),
      siteChrome: selectedBlueprint.id === 'blank' ? 'none' : 'editable header, navigation, and footer',
    })),
  }), [
    displaySlug,
    formData.blueprint,
    formData.description,
    formData.billingPlan,
    formData.name,
    formData.marketplaceTemplateId,
    formData.status,
    formData.teamId,
    formData.templateSource,
    normalizedDomain,
    selectedBlueprint.pages,
    templateImportUrl,
    vercelProductionDomain,
    vercelProjectId,
  ]);
  const creationHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    endpoint: {
      method: 'POST',
      url: adminSitesUrl,
    },
    site: {
      name: formData.name.trim() || 'Untitled site',
      slug: displaySlug || 'new-site',
      publicAddress,
      customDomain: normalizedDomain || null,
      teamId: formData.teamId.trim() || undefined,
      status: formData.status,
    },
    blueprint: {
      id: selectedBlueprint.id,
      name: selectedBlueprint.name,
      detail: selectedBlueprint.detail,
      seedsPages: selectedBlueprint.pages.length > 0,
    },
    launchSetup: {
      domainVerification: normalizedDomain ? {
        status: 'pending',
        method: 'dns-txt',
        domain: normalizedDomain,
        txtHost: `_backy.${normalizedDomain}`,
      } : {
        status: 'verified',
        method: 'dns-txt',
        domain: publicAddress,
      },
      vercelDeployment: {
        status: vercelProjectId ? 'preview_queued' : 'not_started',
        projectId: vercelProjectId || null,
        teamSlug: vercelTeamSlug || null,
        productionDomain: vercelProductionDomain,
      },
      billingQuota: {
        plan: formData.billingPlan,
        status: 'active',
        limits: CREATE_BILLING_PLAN_LIMITS[formData.billingPlan],
      },
      frontendDesign: {
        source: formData.templateSource,
        marketplaceTemplateId: formData.marketplaceTemplateId.trim() || null,
        importUrl: templateImportUrl || null,
      },
    },
    seededPages: selectedBlueprint.pages.map((page) => ({
      title: page.title,
      slug: page.slug,
      path: page.isHomepage ? '/' : `/${page.slug}`,
      template: page.template,
      isHomepage: Boolean(page.isHomepage),
      content: 'Serialized Backy canvas starter content with editable site chrome',
    })),
    endpointsAfterCreate: {
      siteDetail: `${adminSitesUrl}/{siteId}`,
      siteReadiness: `${adminSitesUrl}/{siteId}/readiness`,
      navigation: `${adminSitesUrl}/{siteId}/navigation`,
      redirects: `${adminSitesUrl}/{siteId}/redirects`,
      seo: `${adminSitesUrl}/{siteId}/seo`,
      pages: `${adminSitesUrl}/{siteId}/pages`,
      publicResolve: `${publicApiBase}/sites/{siteId}/resolve?path=/`,
      publicRender: `${publicApiBase}/sites/{siteId}/render?path=/`,
      publicOpenApi: `${publicApiBase}/sites/{siteId}/openapi`,
    },
    readiness: siteCreationReadiness,
    payloadPreview: createPayloadPreview,
    guardrails: [
      'Backend owns duplicate slug and custom domain validation.',
      'Starter pages are persisted only after the site record is created.',
      'Seeded pages use serialized canvas content with editable header, navigation, body, and footer blocks.',
      'Custom frontends should resolve site/page content through public endpoints and keep admin endpoints private.',
    ],
  }), [
    adminSitesUrl,
    createPayloadPreview,
    displaySlug,
    formData.name,
    formData.billingPlan,
    formData.marketplaceTemplateId,
    formData.status,
    formData.teamId,
    formData.templateSource,
    normalizedDomain,
    publicAddress,
    publicApiBase,
    selectedBlueprint.detail,
    selectedBlueprint.id,
    selectedBlueprint.name,
    selectedBlueprint.pages,
    siteCreationReadiness,
    templateImportUrl,
    vercelProductionDomain,
    vercelProjectId,
    vercelTeamSlug,
  ]);
  const creationHandoffText = useMemo(() => JSON.stringify(creationHandoff, null, 2), [creationHandoff]);

  useEffect(() => {
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
      .catch((permissionsError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(permissionsError instanceof Error ? permissionsError.message : 'Unable to load site creation permissions.');
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

  const copyCreationText = async (value: string, label: string) => {
    if (isCreateBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const downloadCreationHandoff = () => {
    if (isCreateBusy) return;

    const blob = new Blob([creationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${displaySlug || 'new-site'}-backy-site-create-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Site creation handoff manifest downloaded.');
  };
  const openCreatedSiteRecovery = () => {
    if (!createdSiteRecovery || isCreateBusy) return;

    void navigate({ to: '/sites/$siteId', params: { siteId: createdSiteRecovery.id } });
  };
  const openCreatedSitePages = () => {
    if (!createdSiteRecovery || isCreateBusy) return;

    void navigate({ to: '/pages', search: { siteId: createdSiteRecovery.publicSiteId || createdSiteRecovery.id } });
  };
  const buildCreationSettings = (createdAt: string): Partial<NonNullable<Site['settings']>> => {
    const domain = normalizedDomain || `${displaySlug}.backy.app`;
    const token = createDnsToken(displaySlug);
    const pageUsage = selectedBlueprint.pages.length;
    const limits = CREATE_BILLING_PLAN_LIMITS[formData.billingPlan];
    const deploymentStatus = vercelProjectId ? 'preview_queued' : 'not_started';
    const templateId = formData.marketplaceTemplateId.trim() || `backy-${formData.blueprint}-starter`;

    return {
      siteStatus: formData.status,
      domainVerification: {
        status: normalizedDomain ? 'pending' : 'verified',
        method: 'dns-txt',
        domain,
        token,
        txtHost: `_backy.${domain}`,
        txtValue: `backy-site-verification=${token}`,
        cnameTarget: `${displaySlug}.backy.app`,
        requestedAt: createdAt,
        checkedAt: normalizedDomain ? null : createdAt,
        verifiedAt: normalizedDomain ? null : createdAt,
        lastError: null,
      },
      vercelDeployment: {
        status: deploymentStatus,
        projectId: vercelProjectId,
        teamSlug: vercelTeamSlug,
        productionDomain: vercelProductionDomain,
        previewUrl: '',
        productionUrl: `https://${vercelProductionDomain}`,
        environment: 'preview',
        lastAction: vercelProjectId ? 'prepare-preview' : null,
        requestedAt: vercelProjectId ? createdAt : null,
        completedAt: null,
        promotedAt: null,
        rolledBackAt: null,
        command: 'vercel pull --yes --environment=preview && vercel build && vercel deploy --prebuilt',
        missing: vercelProjectId ? ['Server-side Vercel token'] : ['Vercel project metadata', 'Server-side Vercel token'],
        history: vercelProjectId ? [{
          id: createSetupEventId('deploy'),
          action: 'prepare-preview',
          status: deploymentStatus,
          environment: 'preview',
          targetUrl: vercelProductionDomain,
          command: 'vercel pull --yes --environment=preview && vercel build && vercel deploy --prebuilt',
          requestedAt: createdAt,
          completedAt: null,
          missing: ['Server-side Vercel token'],
        }] : [],
      },
      billingQuota: {
        plan: formData.billingPlan,
        status: 'active',
        billingOwnerId: currentAdmin?.id || null,
        billingEmail: formData.billingEmail.trim(),
        renewalAt: null,
        limits,
        usage: {
          pages: pageUsage,
          mediaGb: 0,
          bandwidthGb: 0,
          forms: 0,
          products: formData.blueprint === 'storefront' ? 0 : 0,
          collections: 0,
          teamMembers: 1,
          customDomains: normalizedDomain ? 1 : 0,
          updatedAt: createdAt,
        },
        lastAction: `set-${formData.billingPlan}`,
        notes: `Initialized from /sites/new with ${selectedBlueprint.name}.`,
        history: [{
          id: createSetupEventId('billing'),
          action: `set-${formData.billingPlan}`,
          plan: formData.billingPlan,
          status: 'active',
          requestedAt: createdAt,
          usage: {
            pages: pageUsage,
            mediaGb: 0,
            bandwidthGb: 0,
            forms: 0,
            products: 0,
            collections: 0,
            teamMembers: 1,
            customDomains: normalizedDomain ? 1 : 0,
            updatedAt: createdAt,
          },
          limits,
        }],
      },
      frontendDesign: {
        schemaVersion: 'backy.frontend-design.v1',
        status: formData.templateSource === 'starter-marketplace' ? 'captured' : 'unconfigured',
        source: {
          type: formData.templateSource === 'custom-frontend' ? 'custom-frontend' : 'manual',
          label: selectedTemplateSource.label,
          url: templateImportUrl || undefined,
          capturedAt: createdAt,
        },
        tokens: {},
        chrome: {
          header: { source: 'site-create-blueprint', editable: true },
          navigation: { source: 'site-create-blueprint', editable: true },
          footer: { source: 'site-create-blueprint', editable: true },
        },
        templates: selectedBlueprint.pages.map((page) => ({
          id: `${templateId}-${page.slug}`,
          type: 'page',
          name: `${selectedBlueprint.name} ${page.title}`,
          routePattern: page.isHomepage ? '/' : `/${page.slug}`,
          description: page.description,
          canvasSize: DEFAULT_CANVAS_SIZE,
          bindingHints: [],
        })),
        editableMap: [],
        notes: `Created from ${selectedBlueprint.name}; template source: ${selectedTemplateSource.label}.`,
        updatedAt: createdAt,
      },
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCreateBusy) return;
    if (!canCreateSites) {
      setError(`Your account needs sites.create to create a site. ${createPermissionTitle}`);
      setNotice(null);
      return;
    }
    if (starterPagesSelected && !canEditPages) {
      setError(`Your account needs pages.edit to seed starter pages. ${editPagesPermissionTitle}`);
      setNotice(null);
      return;
    }
    if (starterPagesSelected && statusSeedsPublishedPages && !canPublishPages) {
      setError(`Your account needs pages.publish to create published starter pages. ${publishPagesPermissionTitle}`);
      setNotice(null);
      return;
    }

    if (!canSubmit) {
      setError('Add a site name, use a valid URL slug, check the custom domain format, and complete the selected template source.');
      setNotice(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);
    setCreatedSiteRecovery(null);

    try {
      const createdAt = new Date().toISOString();
      const created = await createSite({
        name: formData.name.trim(),
        slug: displaySlug,
        teamId: formData.teamId.trim() || undefined,
        customDomain: normalizedDomain || null,
        description: formData.description.trim(),
        status: formData.status,
        settings: buildCreationSettings(createdAt),
      });
      let createdPages: Awaited<ReturnType<typeof seedStarterPages>> = [];
      let seedError: unknown = null;

      try {
        createdPages = await seedStarterPages(created.publicSiteId || created.id, selectedBlueprint.pages, formData.status);
      } catch (starterPageError) {
        seedError = starterPageError;
      }

      const createdWithCount = {
        ...created,
        pageCount: Math.max(created.pageCount || 0, createdPages.length),
      };
      setSites([createdWithCount, ...sites.filter((site) => site.id !== created.id)]);
      if (createdPages.length > 0) {
        setPages([...createdPages, ...pages.filter((page) => !createdPages.some((createdPage) => createdPage.id === page.id))]);
      }

      if (seedError) {
        setCreatedSiteRecovery(createdWithCount);
        setError(seedError instanceof Error
          ? `${created.name} was created, but starter pages could not be seeded: ${seedError.message}`
          : `${created.name} was created, but starter pages could not be seeded.`);
        setNotice('The site record is safe. Open the site controls or pages to continue setup manually.');
        setIsLoading(false);
        return;
      }

      navigate({ to: '/pages', search: { siteId: created.publicSiteId || created.id } });
    } catch (createError) {
      if (createError instanceof AdminContentApiError && createError.code === 'TEAM_REQUIRED') {
        setError('Database mode needs a team owner for this site. Enter a Database team ID here, configure BACKY_DEFAULT_TEAM_ID on the backend, or create the first site through a seeded team.');
      } else {
        setError(createError instanceof Error
          ? `${createError.message}. The site was not created because the backend did not persist it.`
          : 'Unable to create site. The site was not persisted.');
      }
      setNotice(null);
      setIsLoading(false);
    }
  };

  return (
    <PageShell
      title="Create site"
      description="Start a managed frontend workspace that Backy can drive through APIs and admin controls."
      action={
        <button
          type="button"
          onClick={() => {
            if (!isCreateBusy) {
              void navigate({ to: '/sites' });
            }
          }}
          disabled={isCreateBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Sites
        </button>
      }
      className="w-full"
    >
      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="site-creation-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Site creation command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                siteCreationReadiness.score >= 80
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
              >
                {siteCreationReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Prepare a multi-page website workspace with routes, starter canvas content, public address, and backend systems from the first submit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyCreationText(creationHandoffText, 'Site creation handoff manifest')}
              disabled={isCreateBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadCreationHandoff}
              disabled={isCreateBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isCreateBusy) {
                  void navigate({ to: '/pages', search: existingPagesSearch });
                }
              }}
              disabled={isCreateBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              Existing pages
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Workspace readiness</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checks whether this site will be created with usable identity, route, domain state, blueprint, and publishing behavior.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                {formData.blueprint}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  siteCreationReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${siteCreationReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {siteCreationReadiness.checks.map((check) => (
                <SiteCreationCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Create-to-control workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {siteCreationReadiness.workflow.map((step, index) => (
                <SiteCreationWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div>
            <h3 className="text-sm font-semibold">Creation control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump through the decisions that make this site ready for pages, APIs, design work, and publishing.
            </p>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {SITE_CREATION_AREAS.map((area) => (
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

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section id="site-identity" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Site identity</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This becomes the root record for pages, navigation, SEO, redirects, media, forms, and commerce.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          )}
          {(permissionError || isPermissionMatrixPending || !canCreateSites || (starterPagesSelected && !canSeedStarterPages)) && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {permissionError
                || (isPermissionMatrixPending
                  ? 'Loading site creation permissions...'
                  : !canCreateSites
                    ? `Your account needs sites.create to create a site. ${createPermissionTitle}`
                    : starterPagesSelected && !canEditPages
                      ? `Starter page seeding needs pages.edit. ${editPagesPermissionTitle}`
                      : `Published starter page seeding needs pages.publish. ${publishPagesPermissionTitle}`)}
            </div>
          )}
          {createdSiteRecovery && (
            <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
              <div className="text-sm font-semibold text-teal-950">Continue with {createdSiteRecovery.name}</div>
              <div className="mt-1 text-sm text-teal-900">
                The workspace exists even though starter pages need manual setup.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCreatedSiteRecovery}
                  disabled={isCreateBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Globe className="h-4 w-4" />
                  Open site controls
                </button>
                <button
                  type="button"
                  onClick={openCreatedSitePages}
                  disabled={isCreateBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-950 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FileText className="h-4 w-4" />
                  Open pages
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Site name</span>
              <input
                type="text"
                value={formData.name}
                disabled={creationFormDisabled}
                title={creationDisabledTitle}
                onChange={(e) => {
                  if (creationFormDisabled) return;

                  setFormData({
                    ...formData,
                    name: e.target.value,
                    slug: slugEdited ? formData.slug : slugify(e.target.value),
                  });
                }}
                placeholder="Northstar Studio"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Status</span>
              <select
                value={formData.status}
                disabled={creationFormDisabled}
                title={creationDisabledTitle}
                onChange={(e) => {
                  if (creationFormDisabled) return;

                  setFormData({ ...formData, status: e.target.value as Site['status'] });
                }}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedStatus.detail}</span>
            </label>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">URL slug</span>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="border-r border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">backy.app/</span>
                <input
                  type="text"
                  value={displaySlug}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setSlugEdited(true);
                    setFormData({ ...formData, slug: slugify(e.target.value) });
                  }}
                  placeholder="northstar-studio"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
              {!isValidSlug(displaySlug) && (
                <span className="mt-2 block text-xs text-red-600">Use lowercase letters, numbers, and hyphens.</span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium">Custom domain</span>
              <div className="relative mt-2">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.customDomain}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, customDomain: e.target.value });
                  }}
                  onBlur={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, customDomain: normalizeDomain(e.target.value) });
                  }}
                  placeholder="example.com"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              {!isValidDomain(normalizedDomain) && (
                <span className="mt-2 block text-xs text-red-600">Use a domain like example.com.</span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium">Database team ID</span>
              <input
                type="text"
                value={formData.teamId}
                disabled={creationFormDisabled}
                title={creationDisabledTitle}
                onChange={(e) => {
                  if (creationFormDisabled) return;

                  setFormData({ ...formData, teamId: e.target.value.trim() });
                }}
                placeholder="team_..."
                data-testid="site-create-team-id-input"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Optional for demo mode. Required in database mode when the backend cannot infer a team.
              </span>
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={formData.description}
              disabled={creationFormDisabled}
              title={creationDisabledTitle}
              onChange={(e) => {
                if (creationFormDisabled) return;

                setFormData({ ...formData, description: e.target.value });
              }}
              placeholder="Portfolio, product catalog, blog, booking site, or client workspace."
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <div id="site-launch" className="mt-6 scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              Launch setup
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Store the initial DNS, deployment, billing, and design-source contract with the site record.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Vercel project ID</span>
                <input
                  type="text"
                  value={formData.vercelProjectId}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, vercelProjectId: e.target.value.trim() });
                  }}
                  placeholder="prj_..."
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Vercel team slug</span>
                <input
                  type="text"
                  value={formData.vercelTeamSlug}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, vercelTeamSlug: e.target.value.trim() });
                  }}
                  placeholder="team-slug"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Production domain</span>
                <input
                  type="text"
                  value={formData.vercelProductionDomain}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, vercelProductionDomain: e.target.value });
                  }}
                  onBlur={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, vercelProductionDomain: normalizeDomain(e.target.value) });
                  }}
                  placeholder={normalizedDomain || `${displaySlug || 'new-site'}.backy.app`}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Billing plan</span>
                <select
                  value={formData.billingPlan}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, billingPlan: e.target.value as SiteCreateBillingPlan });
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {BILLING_PLAN_OPTIONS.map((plan) => (
                    <option key={plan.value} value={plan.value}>{plan.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedBillingPlan.detail}</span>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Billing email</span>
                <input
                  type="email"
                  value={formData.billingEmail}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, billingEmail: e.target.value.trim() });
                  }}
                  placeholder="billing@example.com"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Template source</span>
                <select
                  value={formData.templateSource}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, templateSource: e.target.value as SiteCreateTemplateSource });
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {TEMPLATE_SOURCE_OPTIONS.map((source) => (
                    <option key={source.value} value={source.value}>{source.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedTemplateSource.detail}</span>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Template import URL</span>
                <input
                  type="url"
                  value={formData.templateImportUrl}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, templateImportUrl: e.target.value.trim() });
                  }}
                  placeholder="https://example.com/design-contract.json"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                {formData.templateSource === 'import-url' && templateImportUrl.length === 0 && (
                  <span className="mt-2 block text-xs text-red-600">Add the import URL or choose another template source.</span>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-medium">Marketplace template ID</span>
                <input
                  type="text"
                  value={formData.marketplaceTemplateId}
                  disabled={creationFormDisabled}
                  title={creationDisabledTitle}
                  onChange={(e) => {
                    if (creationFormDisabled) return;

                    setFormData({ ...formData, marketplaceTemplateId: e.target.value.trim() });
                  }}
                  placeholder="backy-starter-business"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SiteLaunchSummary icon="dns" label="DNS" value={normalizedDomain ? 'Pending TXT/CNAME' : 'Managed verified'} />
              <SiteLaunchSummary icon="deploy" label="Deploy" value={vercelProjectId ? 'Preview queued' : 'Add project later'} />
              <SiteLaunchSummary icon="billing" label="Plan" value={selectedBillingPlan.label} />
            </div>
          </div>

          <div id="site-blueprint" className="mt-6 scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-teal-700" />
              Starter structure
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Seed the first pages now so this site opens as a usable workspace instead of an empty shell.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {BLUEPRINT_OPTIONS.map((blueprint) => (
                <label
                  key={blueprint.id}
                  className={cn(
                    'cursor-pointer rounded-lg border p-4 transition hover:border-primary/50',
                    formData.blueprint === blueprint.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-background',
                    (creationFormDisabled || (blueprint.pages.length > 0 && starterPageControlsDisabled)) && 'cursor-not-allowed opacity-60',
                  )}
                  title={blueprint.pages.length > 0 ? starterPageDisabledTitle : creationDisabledTitle}
                >
                  <input
                    type="radio"
                    name="site-blueprint"
                    value={blueprint.id}
                    checked={formData.blueprint === blueprint.id}
                    disabled={creationFormDisabled || (blueprint.pages.length > 0 && starterPageControlsDisabled)}
                    onChange={(event) => {
                      if (creationFormDisabled || (blueprint.pages.length > 0 && starterPageControlsDisabled)) return;

                      setFormData({ ...formData, blueprint: event.target.value as SiteBlueprint });
                    }}
                    className="sr-only"
                  />
                  <span className="block font-semibold text-foreground">{blueprint.name}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{blueprint.detail}</span>
                  <span className="mt-3 block text-xs font-medium text-muted-foreground">
                    {blueprint.pages.length === 0 ? 'No starter pages' : blueprint.pages.map((page) => page.title).join(' / ')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section id="site-preview" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Globe className="h-4 w-4 text-teal-700" />
              Public address
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-3">
              <p className="break-all text-sm font-semibold text-foreground">{publicAddress}</p>
              <p className="mt-1 text-xs text-muted-foreground">{normalizedDomain ? 'Custom domain' : 'Managed Backy subdomain'}</p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers3 className="h-4 w-4 text-teal-700" />
              Workspace includes
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {[
                'Pages and blog content',
                'Navigation, redirects, SEO, and readiness checks',
                'Media, forms, comments, contacts, products, and orders',
                'Headless API records for a custom frontend',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="site-pages" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-teal-700" />
              Pages to seed
            </div>
            <div className="mt-4 space-y-2">
              {selectedBlueprint.pages.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                  No pages will be created.
                </p>
              ) : selectedBlueprint.pages.map((page) => (
                <div key={page.slug} className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{page.title}</span>
                    {page.isHomepage && <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Home</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">/{page.isHomepage ? '' : page.slug}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="site-api" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Code2 className="h-4 w-4 text-teal-700" />
              API handoff
            </div>
            <div className="mt-4 rounded-lg border border-border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">Create endpoint</div>
              <div className="mt-2 break-all font-mono text-xs text-foreground">{adminSitesUrl}</div>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(createPayloadPreview, null, 2)}
            </pre>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => void copyCreationText(adminSitesUrl, 'Site create API URL')}
                disabled={isCreateBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy URL
              </button>
              <button
                type="button"
                onClick={() => void copyCreationText(creationHandoffText, 'Site creation handoff manifest')}
                disabled={isCreateBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy handoff
              </button>
            </div>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isCreateBusy || !canSubmit}
              title={!canCreateSites ? createPermissionTitle : !canSeedStarterPages ? starterPageDisabledTitle : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Creating...' : 'Create site'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isCreateBusy) {
                  void navigate({ to: '/sites' });
                }
              }}
              disabled={isCreateBusy}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </aside>
      </form>
    </PageShell>
  );
}

function SiteCreationCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
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

function SiteCreationWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
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

function SiteLaunchSummary({
  icon,
  label,
  value,
}: {
  icon: 'dns' | 'deploy' | 'billing';
  label: string;
  value: string;
}) {
  const Icon = icon === 'dns' ? ShieldCheck : icon === 'deploy' ? Rocket : CreditCard;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span className="rounded-md bg-teal-50 p-1.5 text-teal-700">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

async function seedStarterPages(
  siteId: string,
  pageSpecs: StarterPageSpec[],
  status: Site['status'],
) {
  const createdPages = [];

  for (const spec of pageSpecs) {
    createdPages.push(await createPage(siteId, {
      title: spec.title,
      slug: spec.slug,
      status,
      description: spec.description,
      template: spec.template,
      isHomepage: spec.isHomepage || false,
      meta: {
        title: spec.title,
        description: spec.description,
        template: spec.template,
      },
      content: createStarterPageContent(spec, status, pageSpecs),
    }));
  }

  return createdPages;
}

function createStarterPageContent(spec: StarterPageSpec, status: Site['status'], allPages: StarterPageSpec[]) {
  const elements = buildStarterElements(spec, allPages);
  return JSON.parse(serializeCanvasContent(elements, {
    ...DEFAULT_CANVAS_SIZE,
    height: getCanvasHeightForElements(elements),
  }, undefined, {
    documentId: `page_${spec.slug || 'home'}`,
    kind: 'page',
    title: spec.title,
    slug: spec.slug,
    status,
    locale: 'en',
  }));
}

function buildStarterElements(spec: StarterPageSpec, allPages: StarterPageSpec[]): CanvasElement[] {
  const palette = getStarterPalette(spec.template);
  const navItems = allPages.length > 0
    ? allPages.map((page) => page.title)
    : ['Home', 'About', 'Contact'];
  const hero = createCanvasElement('section', 0, 0, {
    id: `${spec.slug}-hero-section`,
    width: 1200,
    height: spec.template === 'contact' ? 620 : 520,
    props: { backgroundColor: palette.background, borderRadius: 0, padding: 0 },
    children: [
      createCanvasElement('heading', 72, 78, {
        id: `${spec.slug}-heading`,
        width: 560,
        height: 110,
        props: { content: spec.title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: palette.heading },
      }),
      createCanvasElement('paragraph', 76, 210, {
        id: `${spec.slug}-copy`,
        width: 520,
        height: 100,
        props: { content: spec.description, fontSize: 18, lineHeight: 1.6, color: palette.text },
      }),
      createCanvasElement('button', 76, 346, {
        id: `${spec.slug}-button`,
        width: 180,
        height: 50,
        props: { label: getStarterButtonLabel(spec.template), backgroundColor: palette.accent, color: palette.accentText, borderRadius: 8, fontWeight: '700' },
      }),
    ],
  });

  if (spec.template === 'contact') {
    hero.children = [
      ...(hero.children || []),
      createCanvasElement('form', 690, 72, {
        id: `${spec.slug}-form`,
        width: 420,
        height: 430,
        props: {
          formId: `form-${spec.slug}-contact`,
          formName: `${spec.slug}-contact`,
          formTitle: 'Contact form',
          formDescription: 'Starter contact form generated with the site blueprint.',
          successMessage: 'Thanks. We will reply soon.',
          enableHoneypot: true,
          contactShareEnabled: true,
          contactShareNameField: 'name',
          contactShareEmailField: 'email',
          contactShareNotesField: 'message',
          backgroundColor: '#ffffff',
          borderRadius: 8,
          borderColor: '#d8ded2',
          borderWidth: 1,
          borderStyle: 'solid',
        },
        children: [
          createCanvasElement('input', 24, 30, { id: `${spec.slug}-name`, width: 360, height: 54, props: { label: 'Name', name: 'name', placeholder: 'Your name', required: true } }),
          createCanvasElement('input', 24, 104, { id: `${spec.slug}-email`, width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
          createCanvasElement('textarea', 24, 180, { id: `${spec.slug}-message`, width: 360, height: 110, props: { label: 'Message', name: 'message', placeholder: 'Tell us what you need', required: true } }),
          createCanvasElement('button', 24, 326, { id: `${spec.slug}-submit`, width: 170, height: 48, props: { label: 'Send message', backgroundColor: palette.accent, color: palette.accentText, borderRadius: 8, fontWeight: '700' } }),
        ],
      }),
    ];

    return withPageChrome([hero], {
      title: spec.title,
      variant: `site-${spec.template}-${spec.slug}`,
      navItems,
      headerActionLabel: getStarterButtonLabel(spec.template),
    });
  }

  return withPageChrome([
    hero,
    createCanvasElement('section', 0, 520, {
      id: `${spec.slug}-feature-section`,
      width: 1200,
      height: 330,
      props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
      children: getStarterFeatureLabels(spec.template).map((label, index) => createCanvasElement('box', 72 + index * 360, 72, {
        id: `${spec.slug}-feature-${index}`,
        width: 320,
        height: 160,
        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
        children: [
          createCanvasElement('heading', 22, 24, {
            id: `${spec.slug}-feature-heading-${index}`,
            width: 260,
            height: 36,
            props: { content: label, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
          }),
          createCanvasElement('paragraph', 22, 78, {
            id: `${spec.slug}-feature-copy-${index}`,
            width: 250,
            height: 64,
            props: { content: 'Edit this section, bind it to CMS data, or save it as a reusable block.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
          }),
        ],
      })),
    }),
  ], {
    title: spec.title,
    variant: `site-${spec.template}-${spec.slug}`,
    navItems,
    headerActionLabel: getStarterButtonLabel(spec.template),
  });
}

function getStarterPalette(template: string) {
  if (template === 'store') {
    return { background: '#f7f8f4', heading: '#111827', text: '#4b5563', accent: '#14532d', accentText: '#ffffff' };
  }
  if (template === 'blog') {
    return { background: '#111827', heading: '#ffffff', text: '#d1d5db', accent: '#f59e0b', accentText: '#111827' };
  }

  return { background: '#f8fafc', heading: '#111827', text: '#475569', accent: '#0f766e', accentText: '#ffffff' };
}

function getStarterButtonLabel(template: string) {
  if (template === 'store') return 'Shop products';
  if (template === 'blog') return 'Read articles';
  if (template === 'contact') return 'Contact us';
  return 'Get started';
}

function getStarterFeatureLabels(template: string) {
  if (template === 'store') return ['Featured products', 'Secure checkout', 'Digital delivery'];
  if (template === 'blog') return ['Latest articles', 'Categories', 'Newsletter'];
  if (template === 'about') return ['Story', 'Values', 'Team'];
  return ['Design freely', 'Bind content', 'Publish faster'];
}
