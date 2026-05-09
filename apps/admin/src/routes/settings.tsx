/**
 * ============================================================================
 * BACKY CMS - SETTINGS PAGE
 * ============================================================================
 *
 * The settings page for managing global CMS settings, site settings,
 * user preferences, and integrations.
 *
 * @module SettingsPage
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Palette,
  Globe,
  Shield,
  Database,
  Bell,
  Save,
  Check,
  Code,
  Server,
  ExternalLink,
  History,
  RefreshCw,
  Cloud,
  Rocket,
  CheckCircle2,
  Copy,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import { useStore, type DeliveryMode } from '@/stores/mockStore';
import {
  getSettings,
  listAdminAuditLogs,
  regenerateSettingsApiKeys,
  type AdminAuditLog,
  type SiteSettingsInput,
  updateSettings as updateBackendSettings,
} from '@/lib/adminContentApi';

// ============================================
// TABS
// ============================================

type SettingsTab = 'general' | 'appearance' | 'seo' | 'delivery' | 'infrastructure' | 'notifications' | 'security';

interface SettingsSearch {
  tab?: SettingsTab;
}

const SETTINGS_TAB_IDS: SettingsTab[] = ['general', 'appearance', 'seo', 'delivery', 'infrastructure', 'notifications', 'security'];

const isSettingsTab = (value: unknown): value is SettingsTab => (
  typeof value === 'string' && SETTINGS_TAB_IDS.includes(value as SettingsTab)
);

// ============================================
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: isSettingsTab(search.tab) ? search.tab : undefined,
  }),
  component: SettingsPage,
});

const TABS: Array<SegmentedTabItem<SettingsTab>> = [
  { id: 'general', name: 'General', icon: Globe },
  { id: 'appearance', name: 'Appearance', icon: Palette },
  { id: 'seo', name: 'SEO', icon: Database },
  { id: 'delivery', name: 'Delivery', icon: Code },
  { id: 'infrastructure', name: 'Infrastructure', icon: Cloud },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'security', name: 'Security', icon: Shield },
];

type ApiEndpoint = {
  method: string;
  path: string;
  description: string;
};

type ResponsibilityArea = {
  area: string;
  owner: 'Backy in-house' | 'Supabase connection' | 'Vercel connection';
  controlSurface: string;
  runtimeSource: string;
  frontendImpact: string;
};

type FrontendApiCapability = {
  area: string;
  status: 'ready' | 'partial' | 'planned';
  contract: string;
  controls: string;
  stillNeeded: string;
};

const DELIVERY_OPTIONS: Array<{
  id: DeliveryMode;
  title: string;
  description: string;
}> = [
  {
    id: 'managed-hosting',
    title: 'Managed rendering (Backy-generated pages)',
    description:
      'Backy generates pages and site output for you. Publish in the editor and serve from Backy.',
  },
  {
    id: 'custom-frontend',
    title: 'Custom frontend (headless API mode)',
    description:
      'Use your own frontend and consume Backy public APIs for pages, products, forms, media, comments, and dynamic data.',
  },
];

const PUBLIC_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/sites/:identifier',
    description: 'Resolve a site by slug, custom domain, or identifier.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/manifest',
    description: 'Fetch the frontend discovery manifest: routes, capabilities, schemas, and module endpoints.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/resolve?path=/',
    description: 'Resolve a public route to its content type, canonical path, and render URL.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/render?path=/',
    description: 'Fetch the render payload for any published page, blog post, or dynamic collection route.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages',
    description: 'List published pages for navigation, sitemaps, and frontend page indexes.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/navigation',
    description: 'Read primary/footer navigation structures for custom frontends.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog?status=published',
    description: 'List published blog posts.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/categories',
    description: 'Fetch blog categories for filters, archive pages, and editorial navigation.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/tags',
    description: 'Fetch blog tags for filters, topic pages, and custom frontend chips.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media?type=image',
    description: 'List public media assets for custom frontends and design systems.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media/fonts',
    description: 'Fetch the public font manifest for frontend typography loading.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media/:mediaId/file',
    description: 'Deliver a media file; private files require a signed URL.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections',
    description: 'List public dynamic collections that can drive repeatable frontend sections.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/:collectionId/records?status=published',
    description: 'Fetch public collection records for listings, catalogs, and structured content.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records?status=published',
    description: 'Fetch published product catalog records for storefront grids and product detail pages.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records?slug=:slug',
    description: 'Resolve a single public product by slug for a custom storefront.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/catalog',
    description: 'Fetch normalized storefront catalog data with product facets, filters, readiness, and pagination.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/catalog?slug=:slug',
    description: 'Resolve one normalized storefront product by slug.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/commerce/orders',
    description: 'Fetch the public order-intake contract before wiring a custom checkout.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/commerce/orders',
    description: 'Create a private Backy order from a public cart while keeping the raw orders collection private.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/reusable-sections',
    description: 'Read reusable section definitions for shared headers, footers, and repeatable design blocks.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms/:formId/definition',
    description: 'Fetch a cacheable public form definition without submissions or private contacts.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/forms/:formId/submissions',
    description: 'Submit form payloads with optional anti-spam metadata.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages/:pageId/comments?status=approved',
    description: 'Read approved page comments.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/pages/:pageId/comments',
    description: 'Submit a page comment.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/:postId/comments?status=approved',
    description: 'Read approved blog post comments.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/blog/:postId/comments',
    description: 'Submit a blog post comment.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/comments/report-reasons',
    description: 'Read the supported report/block reason taxonomy.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/comments/:commentId/report',
    description: 'Report a public comment for moderation.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/seo?format=sitemap',
    description: 'Fetch generated SEO metadata, sitemap, or robots output.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/openapi',
    description: 'Download the generated OpenAPI contract for this site.',
  },
];

const ADMIN_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/sites',
    description: 'List sites for the authenticated admin workspace.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/pages',
    description: 'Read pages for site management.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/pages',
    description: 'Create or update page payloads.',
  },
  {
    method: 'PATCH',
    path: '/sites/:siteId/pages/:pageId',
    description: 'Patch page settings, content, or status.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog',
    description: 'List and manage blog posts for the active site.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media',
    description: 'List media assets, folders, metadata, bindings, and delivery state.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/media',
    description: 'Upload a media asset for pages, blog posts, products, or custom frontends.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections',
    description: 'Manage collection schemas used for catalogs, listings, and dynamic pages.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/:collectionId/records',
    description: 'List records for products, directories, portfolios, and any custom object type.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms',
    description: 'List forms and review submissions.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/forms/:formId/contacts',
    description: 'Review private contacts captured by a public registration, contact, or inquiry form.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/comments?status=pending',
    description: 'Moderate page and blog comments from a custom admin frontend.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/products/records',
    description: 'Manage sellable product catalog records and storefront publishing state.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/collections/orders/records',
    description: 'Manage private order records, payment state, fulfillment, refunds, and customer support data.',
  },
  {
    method: 'GET',
    path: '/users',
    description: 'List admin collaborators, roles, lifecycle state, and access metadata.',
  },
];

const PLATFORM_RESPONSIBILITIES: ResponsibilityArea[] = [
  {
    area: 'CMS data and page editor',
    owner: 'Backy in-house',
    controlSurface: 'Pages, Blog, Collections, reusable sections, canvas editor',
    runtimeSource: 'Backy APIs and repository layer',
    frontendImpact: 'Controls every route, component tree, SEO payload, and render payload a frontend consumes.',
  },
  {
    area: 'Forms, contacts, comments, and users',
    owner: 'Backy in-house',
    controlSurface: 'Forms, Contacts, Comments, Users, Notifications',
    runtimeSource: 'Backy public/admin APIs with audit-ready moderation and exports',
    frontendImpact: 'Powers registrations, lead capture, comments, team access, and workflow alerts.',
  },
  {
    area: 'Commerce and selling',
    owner: 'Backy in-house',
    controlSurface: 'Products, Orders, checkout handoff fields, refunds, fulfillment, inventory, and exports',
    runtimeSource: 'Backy collection APIs with public product delivery and private order operations',
    frontendImpact: 'Lets custom storefronts render products publicly while order/customer/payment data remains admin-only.',
  },
  {
    area: 'Media and file delivery',
    owner: 'Backy in-house',
    controlSurface: 'Media library, folders, tags, visibility, transforms, font assets',
    runtimeSource: 'Configured storage provider with Backy metadata and signed/public delivery APIs',
    frontendImpact: 'Lets any frontend request images, files, fonts, and responsive transforms from Backy contracts.',
  },
  {
    area: 'Database persistence',
    owner: 'Supabase connection',
    controlSurface: 'Infrastructure metadata and runtime env checks',
    runtimeSource: 'Supabase/Postgres environment variables and repository runtime',
    frontendImpact: 'Moves Backy data from demo/local runtime into a hosted database without exposing secrets.',
  },
  {
    area: 'Hosting and deploy workflow',
    owner: 'Vercel connection',
    controlSurface: 'Infrastructure metadata, domains, preview deploy preference, production URL',
    runtimeSource: 'Vercel deployment environment and project metadata',
    frontendImpact: 'Hosts Backy and custom frontends while keeping domains and preview behavior visible in Settings.',
  },
];

const PLATFORM_BACKLOG = [
  {
    item: 'Checkout/provider orchestration',
    status: 'product and order control surfaces exist; payment-provider sessions, taxes, shipping rates, and webhook settlement still need deeper backend workflows',
  },
  {
    item: 'Supabase auth adapter',
    status: 'metadata and env detection exist; direct auth provider workflow is not finished yet',
  },
  {
    item: 'One-click Vercel deploy orchestration',
    status: 'project/domain metadata exists; deploy execution should remain a separate connected workflow',
  },
] as const;

const FRONTEND_API_CAPABILITIES: FrontendApiCapability[] = [
  {
    area: 'Site routing and render payloads',
    status: 'ready',
    contract: 'manifest, openapi, resolve, render, navigation, SEO, pages, blog',
    controls: 'Sites, Pages, Blog, reusable sections, redirects, SEO',
    stillNeeded: 'More visual QA and template presets for every common website pattern.',
  },
  {
    area: 'Visual design and reusable blocks',
    status: 'partial',
    contract: 'page/post render payloads, reusable sections, media, fonts, theme tokens',
    controls: 'Page editor, blog editor, media library, appearance settings',
    stillNeeded: 'Global header/footer editing, richer responsive constraints, symbols, and component variants.',
  },
  {
    area: 'Dynamic CMS objects',
    status: 'ready',
    contract: 'collections, collection records, dynamic list/detail routes',
    controls: 'Collections, records, import/export, permissions',
    stillNeeded: 'Relationship fields, computed fields, validation presets, and richer list designer controls.',
  },
  {
    area: 'Commerce and selling',
    status: 'partial',
    contract: 'commerce catalog, order-intake contract, private orders collection, product records',
    controls: 'Products, Orders, collections, media galleries',
    stillNeeded: 'Provider checkout sessions, taxes, shipping rates, refunds, discounts, subscriptions, and fulfillment automation.',
  },
  {
    area: 'Forms, contacts, comments, registration',
    status: 'partial',
    contract: 'form definition, submissions, contacts, comments, moderation/reporting',
    controls: 'Forms, Contacts, Comments, Users, notification settings',
    stillNeeded: 'Full member registration/login flows, form templates, automations, spam controls, and approval workflows.',
  },
  {
    area: 'Infrastructure and custom frontend handoff',
    status: 'partial',
    contract: 'settings handoff, env contract, public/admin API bases, runtime summaries',
    controls: 'Settings delivery, infrastructure, security, API keys',
    stillNeeded: 'One-click deploy orchestration, Supabase auth adapter, domain verification, and deployment history.',
  },
];

const SETTINGS_CONTROL_AREAS: Array<{
  tab: SettingsTab;
  title: string;
  detail: string;
}> = [
  {
    tab: 'delivery',
    title: 'Frontend API delivery',
    detail: 'Choose managed rendering or headless API mode and copy public/admin endpoint contracts.',
  },
  {
    tab: 'infrastructure',
    title: 'Supabase and Vercel',
    detail: 'Connect database, storage, deployment ownership, preview deploys, and hosting metadata.',
  },
  {
    tab: 'appearance',
    title: 'Design tokens',
    detail: 'Control global colors, typography, and frontend defaults that custom designs can consume.',
  },
  {
    tab: 'seo',
    title: 'SEO and analytics',
    detail: 'Set title templates, social previews, keywords, analytics, and public metadata defaults.',
  },
  {
    tab: 'notifications',
    title: 'Workflow alerts',
    detail: 'Route user registrations, publishes, forms, comments, and system events to the right channels.',
  },
  {
    tab: 'security',
    title: 'Access and audit',
    detail: 'Manage API keys, account rules, two-factor requirements, session length, and audit history.',
  },
];

function getEnvValue(key: string): string {
  const env =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env ??
    {};
  return env[key]?.trim() ?? '';
}

function isLocalAdminDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
}

function getLocalBackendOrigin(): string {
  return isLocalAdminDevHost() ? 'http://localhost:3001' : 'http://localhost:3000';
}

function getApiBase(kind: 'public' | 'admin'): string {
  const publicFallback =
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    getLocalBackendOrigin();
  const adminFallback =
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    publicFallback;
  const base = kind === 'admin' ? adminFallback : publicFallback;
  return `${base.replace(/\/api$/, '').replace(/\/$/, '')}/api${kind === 'admin' ? '/admin' : ''}`;
}

function buildCopyText(base: string, path: string): string {
  return `${base}${path}`;
}

// ============================================
// COMPONENT
// ============================================

function SettingsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [activeTab, setActiveTab] = useState<SettingsTab>(search.tab || 'general');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('managed-hosting');
  const [authSettings, setAuthSettings] = useState<SiteSettingsInput['auth']>();
  const [runtimeStorage, setRuntimeStorage] = useState<SiteSettingsInput['runtimeStorage']>();
  const [integrations, setIntegrations] = useState<NonNullable<SiteSettingsInput['integrations']>>({});
  const [runtimeDatabase, setRuntimeDatabase] = useState<SiteSettingsInput['runtimeDatabase']>();
  const [runtimeSupabase, setRuntimeSupabase] = useState<SiteSettingsInput['runtimeSupabase']>();
  const [runtimeVercel, setRuntimeVercel] = useState<SiteSettingsInput['runtimeVercel']>();
  const [settingsAuditLogs, setSettingsAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const persistedDeliveryMode = useStore((state) => state.settings.deliveryMode);
  const updateSettings = useStore((state) => state.updateSettings);
  const publicApiKey = useStore((state) => state.settings.apiKeys.publicApiKey);
  const adminApiKey = useStore((state) => state.settings.apiKeys.adminApiKey);

  const applyBackendSettings = useCallback((backendSettings: SiteSettingsInput) => {
    updateSettings(backendSettings);
    setDeliveryMode(backendSettings.deliveryMode);
    setAuthSettings(backendSettings.auth);
    setRuntimeStorage(backendSettings.runtimeStorage);
    setIntegrations(backendSettings.integrations || {});
    setRuntimeDatabase(backendSettings.runtimeDatabase);
    setRuntimeSupabase(backendSettings.runtimeSupabase);
    setRuntimeVercel(backendSettings.runtimeVercel);
  }, [updateSettings]);

  useEffect(() => {
    setDeliveryMode(persistedDeliveryMode);
  }, [persistedDeliveryMode]);

  useEffect(() => {
    if (search.tab && search.tab !== activeTab) {
      setActiveTab(search.tab);
    }
  }, [activeTab, search.tab]);

  const loadSettingsAuditLogs = useCallback(async () => {
    setIsAuditLoading(true);
    setAuditNotice(null);

    try {
      const result = await listAdminAuditLogs({
        entity: 'settings',
        entityId: 'platform',
        limit: 8,
      });
      setSettingsAuditLogs(result.logs);
    } catch {
      setAuditNotice('Unable to load settings audit trail.');
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const backendSettings = await getSettings();
        if (!cancelled) {
          applyBackendSettings(backendSettings);
          setNotice(null);
        }
      } catch {
        if (!cancelled) {
          setNotice('Using local fallback settings because the backend settings API is unavailable.');
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [applyBackendSettings]);

  useEffect(() => {
    void loadSettingsAuditLogs();
  }, [loadSettingsAuditLogs]);

  const handleSave = async () => {
    setIsSaving(true);
    setNotice(null);

    try {
      const backendSettings = await updateBackendSettings({ deliveryMode, auth: authSettings, integrations });
      applyBackendSettings(backendSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend save failed. Settings were not persisted.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateKeys = async (scope: 'all' | 'public' | 'admin' = 'all') => {
    setNotice(null);

    try {
      const backendSettings = await regenerateSettingsApiKeys(scope);
      applyBackendSettings(backendSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend key regeneration failed. API keys were not changed.');
    }
  };

  const generalSettings: GeneralSettingsConfig = {
    ...DEFAULT_GENERAL_SETTINGS,
    ...(integrations.general || {}),
  };
  const appearanceSettings: AppearanceSettingsConfig = {
    ...DEFAULT_APPEARANCE_SETTINGS,
    ...(integrations.appearance || {}),
  };
  const seoSettings: SeoSettingsConfig = {
    ...DEFAULT_SEO_SETTINGS,
    ...(integrations.seo || {}),
  };
  const notificationSettings: NotificationSettingsConfig = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(integrations.notifications || {}),
    email: {
      ...DEFAULT_NOTIFICATION_SETTINGS.email,
      ...(integrations.notifications?.email || {}),
    },
    inApp: {
      ...DEFAULT_NOTIFICATION_SETTINGS.inApp,
      ...(integrations.notifications?.inApp || {}),
    },
  };
  const platformReadiness = useMemo(() => {
    const savedGeneral = integrations.general;
    const savedAppearance = integrations.appearance;
    const savedSeo = integrations.seo;
    const savedNotifications = integrations.notifications;
    const storage = integrations.storage;
    const supabase = integrations.supabase;
    const vercel = integrations.vercel;
    const storageConfigured = runtimeStorage?.configured === true
      || Boolean(storage?.provider || storage?.bucket || storage?.publicBaseUrl);
    const databaseConfigured = runtimeDatabase?.configured === true;
    const supabaseConfigured = runtimeSupabase?.configured === true
      || Boolean(supabase?.databaseEnabled || supabase?.storageEnabled || supabase?.authEnabled);
    const vercelConfigured = runtimeVercel?.configured === true
      || Boolean(vercel?.projectId || vercel?.productionDomain);
    const securityConfigured = Boolean(publicApiKey && adminApiKey && (authSettings?.minPasswordLength || 0) >= 10);
    const checks = [
      {
        label: 'Delivery mode',
        detail: deliveryMode === 'custom-frontend'
          ? 'Headless API mode is selected for custom frontends.'
          : 'Managed rendering is selected for Backy-served pages.',
        ready: Boolean(deliveryMode),
      },
      {
        label: 'API keys',
        detail: publicApiKey && adminApiKey ? 'Public and admin keys exist.' : 'Generate public and admin API keys.',
        ready: Boolean(publicApiKey && adminApiKey),
      },
      {
        label: 'Storage runtime',
        detail: runtimeStorage
          ? storageConfigured
            ? `${runtimeStorage.provider} storage is configured.`
            : `Missing ${runtimeStorage.missing?.join(', ') || 'storage configuration'}.`
          : 'Storage runtime has not reported yet.',
        ready: storageConfigured,
      },
      {
        label: 'Database runtime',
        detail: runtimeDatabase
          ? databaseConfigured
            ? `${runtimeDatabase.provider || runtimeDatabase.mode || 'database'} is configured.`
            : runtimeDatabase.error || 'Database runtime needs configuration.'
          : 'Database runtime has not reported yet.',
        ready: databaseConfigured,
      },
      {
        label: 'Supabase connection',
        detail: supabaseConfigured
          ? 'Supabase metadata or runtime capability is present.'
          : 'Add Supabase project metadata or environment variables.',
        ready: supabaseConfigured,
      },
      {
        label: 'Vercel deployment',
        detail: vercelConfigured
          ? 'Vercel runtime or project metadata is present.'
          : 'Add Vercel project metadata or deploy environment variables.',
        ready: vercelConfigured,
      },
      {
        label: 'Design and SEO defaults',
        detail: savedGeneral || savedAppearance || savedSeo
          ? 'Global site metadata, design, or SEO defaults have been customized.'
          : 'Customize defaults before using them as frontend tokens.',
        ready: Boolean(savedGeneral || savedAppearance || savedSeo),
      },
      {
        label: 'Security baseline',
        detail: securityConfigured
          ? 'Keys and password policy are present.'
          : 'Review API keys and password/session policy.',
        ready: securityConfigured,
      },
      {
        label: 'Notification routing',
        detail: savedNotifications
          ? 'Notification preferences are stored.'
          : 'Review publish, form, registration, and system alerts.',
        ready: Boolean(savedNotifications),
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Choose delivery', detail: 'Decide managed rendering or custom frontend API mode.' },
        { label: 'Connect runtime', detail: 'Wire storage, database, Supabase, and Vercel environment metadata.' },
        { label: 'Lock access', detail: 'Regenerate keys, set auth policy, and confirm audit visibility.' },
        { label: 'Publish contracts', detail: 'Use public/admin endpoints plus design and SEO defaults in any frontend.' },
      ],
    };
  }, [
    adminApiKey,
    authSettings?.minPasswordLength,
    deliveryMode,
    integrations.appearance,
    integrations.general,
    integrations.notifications,
    integrations.seo,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    publicApiKey,
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const publicApiBase = useMemo(() => getApiBase('public'), []);
  const adminApiBase = useMemo(() => getApiBase('admin'), []);
  const infrastructureEnvContract = useMemo(() => buildInfrastructureEnvContract({
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
    storage: integrations.storage,
    supabase: integrations.supabase,
    vercel: integrations.vercel,
  }), [
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);
  const settingsHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    delivery: {
      mode: deliveryMode,
      publicApiBase,
      adminApiBase,
      publicSiteBase: publicApiBase.replace(/\/api$/, '/sites'),
    },
    endpoints: {
      public: PUBLIC_API_ENDPOINTS.map((endpoint) => ({
        ...endpoint,
        url: buildCopyText(publicApiBase, endpoint.path),
      })),
      admin: ADMIN_API_ENDPOINTS.map((endpoint) => ({
        ...endpoint,
        url: buildCopyText(adminApiBase, endpoint.path),
      })),
    },
    infrastructure: {
      storage: {
        runtime: runtimeStorage || null,
        metadata: integrations.storage || null,
        note: 'Storage provider metadata lives in Backy; bucket credentials and service keys stay in deployment environment variables.',
      },
      database: runtimeDatabase || null,
      supabase: {
        runtime: runtimeSupabase || null,
        metadata: integrations.supabase || null,
        note: 'Secrets and database URLs stay in deployment environment variables; Backy stores non-secret project metadata only.',
      },
      vercel: {
        runtime: runtimeVercel || null,
        metadata: integrations.vercel || null,
        note: 'Project ownership, domains, and preview-deploy preferences are tracked here; deploy tokens remain environment-managed.',
      },
      envContract: infrastructureEnvContract,
    },
    ownershipModel: PLATFORM_RESPONSIBILITIES,
    frontendApiCapabilities: FRONTEND_API_CAPABILITIES,
    backlog: PLATFORM_BACKLOG,
    frontendDefaults: {
      general: generalSettings,
      appearance: appearanceSettings,
      themeContract: buildAppearanceThemeContract(appearanceSettings),
      seo: seoSettings,
      notifications: notificationSettings,
    },
    security: {
      hasPublicApiKey: Boolean(publicApiKey),
      hasAdminApiKey: Boolean(adminApiKey),
      auth: authSettings || null,
    },
    readiness: platformReadiness,
    guardrails: [
      'Backy owns CMS data, editor content, API keys, forms, media metadata, and admin workflows.',
      'Supabase and Vercel are external providers connected through runtime env and non-secret metadata.',
      'Custom frontends should use public endpoints and design defaults; admin endpoints must remain private.',
      'Commerce controls exist in the admin model, but durable storefront checkout APIs are still a separate backend milestone.',
      'Infrastructure runtime cards show detected capability, while form fields store operator-controlled metadata.',
    ],
  }), [
    adminApiBase,
    adminApiKey,
    appearanceSettings,
    authSettings,
    deliveryMode,
    generalSettings,
    integrations.storage,
    integrations.supabase,
    integrations.vercel,
    infrastructureEnvContract,
    notificationSettings,
    platformReadiness,
    publicApiBase,
    publicApiKey,
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
    seoSettings,
  ]);
  const settingsHandoffText = useMemo(() => JSON.stringify(settingsHandoff, null, 2), [settingsHandoff]);

  const copySettingsHandoffText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadSettingsHandoff = () => {
    const blob = new Blob([settingsHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-settings-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Settings handoff manifest downloaded.');
  };

  const updateNotificationSettings = (next: NotificationSettingsConfig) => {
    setIntegrations({
      ...integrations,
      notifications: next,
    });
  };
  const updateGeneralSettings = (next: GeneralSettingsConfig) => {
    setIntegrations({
      ...integrations,
      general: next,
    });
  };
  const updateAppearanceSettings = (next: AppearanceSettingsConfig) => {
    setIntegrations({
      ...integrations,
      appearance: next,
    });
  };
  const updateSeoSettings = (next: SeoSettingsConfig) => {
    setIntegrations({
      ...integrations,
      seo: next,
    });
  };
  const openSettingsTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate({ to: '/settings', search: { tab }, replace: true });
    window.requestAnimationFrame(() => {
      document.getElementById('settings-tab-content')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Control delivery, infrastructure, design defaults, API keys, notifications, and security for every frontend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void copySettingsHandoffText(settingsHandoffText, 'Settings handoff manifest')}
            iconStart={<Copy className="size-4" />}
          >
            Copy handoff
          </Button>
          <Button
            variant="outline"
            onClick={downloadSettingsHandoff}
            iconStart={<Download className="size-4" />}
          >
            Download JSON
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={isSaving}
            iconStart={saved ? <Check className="size-4" /> : <Save className="size-4" />}
          >
            {saved ? 'Saved' : isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {notice && (
        <Notice tone="warning">{notice}</Notice>
      )}

      <div id="settings-command-center" className="scroll-mt-24" data-testid="settings-command-center">
        <Panel>
          <PanelHeader
            title="Settings command center"
            description="One place to see whether Backy can securely power managed sites, custom frontends, media, database-backed content, Supabase, and Vercel deploy workflows."
            icon={<Server className="size-4" />}
            action={
              <span className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                platformReadiness.score >= 80
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
              >
                {platformReadiness.score}% ready
              </span>
            }
          />
          <PanelContent>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Backend control health</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Checks the pieces a Wix/WordPress-style backend needs before frontends depend on it.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {deliveryMode === 'custom-frontend' ? 'Headless' : 'Managed'}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      platformReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                    )}
                    style={{ width: `${platformReadiness.score}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {platformReadiness.checks.map((check) => (
                    <SettingsReadinessCheck key={check.label} {...check} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Setup workflow</h3>
                </div>
                <div className="mt-3 grid gap-2">
                  {platformReadiness.workflow.map((step, index) => (
                    <SettingsWorkflowStep key={step.label} index={index + 1} {...step} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Settings control map</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Jump to the settings that control public APIs, visual defaults, infrastructure, notifications, and security.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openSettingsTab('infrastructure')}
                  iconStart={<Cloud className="size-4" />}
                >
                  Open infrastructure
                </Button>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {SETTINGS_CONTROL_AREAS.map((area) => (
                  <button
                    key={area.title}
                    type="button"
                    onClick={() => openSettingsTab(area.tab)}
                    className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="text-sm font-semibold text-foreground">{area.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Frontend API capability map</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    What a custom frontend can already consume from Backy, and which Wix/Webflow/Squarespace-level backend pieces still need product work.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openSettingsTab('delivery')}
                  iconStart={<Code className="size-4" />}
                >
                  Open API delivery
                </Button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {FRONTEND_API_CAPABILITIES.map((capability) => (
                  <SettingsCapabilityCard key={capability.area} capability={capability} />
                ))}
              </div>
            </div>
          </PanelContent>
        </Panel>
      </div>

      {/* Tabs */}
      <div id="settings-tabs" className="scroll-mt-24">
        <SegmentedTabs
          items={TABS}
          value={activeTab}
          onChange={openSettingsTab}
          ariaLabel="Settings sections"
          getPanelId={() => 'settings-tab-content'}
        />
      </div>

      {/* Tab Content */}
      <Panel id="settings-tab-content" className="scroll-mt-24" role="tabpanel">
        <PanelContent className="pt-5">
        {activeTab === 'general' && (
          <GeneralSettings value={generalSettings} onChange={updateGeneralSettings} />
        )}
        {activeTab === 'appearance' && (
          <AppearanceSettings value={appearanceSettings} onChange={updateAppearanceSettings} />
        )}
        {activeTab === 'seo' && (
          <SEOSettings value={seoSettings} onChange={updateSeoSettings} />
        )}
        {activeTab === 'delivery' && (
          <DeliveryModeSettings
            value={deliveryMode}
            runtimeStorage={runtimeStorage}
            onChange={setDeliveryMode}
          />
        )}
        {activeTab === 'infrastructure' && (
          <InfrastructureSettings
            integrations={integrations}
            runtimeDatabase={runtimeDatabase}
            runtimeStorage={runtimeStorage}
            runtimeSupabase={runtimeSupabase}
            runtimeVercel={runtimeVercel}
            envContract={infrastructureEnvContract}
            onChange={setIntegrations}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationSettings
            value={notificationSettings}
            onChange={updateNotificationSettings}
          />
        )}
        {activeTab === 'security' && (
          <SecuritySettings
            publicApiKey={publicApiKey}
            adminApiKey={adminApiKey}
            authSettings={authSettings}
            onAuthSettingsChange={setAuthSettings}
            onRegenerateKeys={handleRegenerateKeys}
            auditLogs={settingsAuditLogs}
            isAuditLoading={isAuditLoading}
            auditNotice={auditNotice}
            onRefreshAudit={() => void loadSettingsAuditLogs()}
          />
        )}
        </PanelContent>
      </Panel>
    </div>
  );
}

function SettingsReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
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

function SettingsWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
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

function SettingsCapabilityCard({ capability }: { capability: FrontendApiCapability }) {
  const statusLabel = {
    ready: 'Ready',
    partial: 'Partial',
    planned: 'Planned',
  }[capability.status];
  const statusClassName = {
    ready: 'bg-emerald-50 text-emerald-700',
    partial: 'bg-amber-50 text-amber-700',
    planned: 'bg-slate-100 text-slate-600',
  }[capability.status];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="min-w-0 text-sm font-semibold text-foreground">{capability.area}</h4>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', statusClassName)}>
          {statusLabel}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5">
        <div>
          <dt className="font-semibold text-foreground">Contract</dt>
          <dd className="text-muted-foreground">{capability.contract}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Admin controls</dt>
          <dd className="text-muted-foreground">{capability.controls}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Still needed</dt>
          <dd className="text-muted-foreground">{capability.stillNeeded}</dd>
        </div>
      </dl>
    </div>
  );
}

// ============================================
// GENERAL SETTINGS
// ============================================

function GeneralSettings({
  value,
  onChange,
}: {
  value: GeneralSettingsConfig;
  onChange: (next: GeneralSettingsConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Site Information</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="settings-site-name" className="block text-sm font-medium mb-1">
              Site Name
            </label>
            <input
              id="settings-site-name"
              type="text"
              value={value.siteName || ''}
              onChange={(event) => onChange({ ...value, siteName: event.target.value })}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-site-description" className="block text-sm font-medium mb-1">
              Site Description
            </label>
            <textarea
              id="settings-site-description"
              value={value.siteDescription || ''}
              onChange={(event) => onChange({ ...value, siteDescription: event.target.value })}
              rows={3}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-timezone" className="block text-sm font-medium mb-1">
              Timezone
            </label>
            <select
              id="settings-timezone"
              value={value.timezone || DEFAULT_GENERAL_SETTINGS.timezone}
              onChange={(event) => onChange({ ...value, timezone: event.target.value })}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// APPEARANCE SETTINGS
// ============================================

function AppearanceSettings({
  value,
  onChange,
}: {
  value: AppearanceSettingsConfig;
  onChange: (next: AppearanceSettingsConfig) => void;
}) {
  const resolved = resolveAppearanceSettings(value);
  const colorControls = [
    { key: 'primaryColor', label: 'Primary', variable: '--backy-color-primary' },
    { key: 'secondaryColor', label: 'Secondary', variable: '--backy-color-secondary' },
    { key: 'backgroundColor', label: 'Background', variable: '--backy-color-background' },
    { key: 'surfaceColor', label: 'Surface', variable: '--backy-color-surface' },
    { key: 'textColor', label: 'Text', variable: '--backy-color-text' },
    { key: 'mutedTextColor', label: 'Muted text', variable: '--backy-color-muted-text' },
  ] as const;
  const themeContract = buildAppearanceThemeContract(value);

  const updateColor = (key: typeof colorControls[number]['key'], nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };
  const updateNumber = (key: 'baseFontSize' | 'radius' | 'spacingUnit', nextValue: number) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold">Theme colors</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {colorControls.map((control) => (
            <div key={control.key} className="rounded-lg border border-border bg-background p-3">
              <label htmlFor={`settings-${control.key}`} className="block text-sm font-medium">
                {control.label}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id={`settings-${control.key}`}
                  type="color"
                  value={colorInputValue(resolved[control.key], DEFAULT_APPEARANCE_SETTINGS[control.key])}
                  onChange={(event) => updateColor(control.key, event.target.value)}
                  className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border"
                />
                <input
                  type="text"
                  aria-label={`${control.label} color hex`}
                  value={resolved[control.key]}
                  onChange={(event) => updateColor(control.key, event.target.value)}
                  className={cn(
                    'min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                  )}
                />
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">{control.variable}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">Typography and layout tokens</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { key: 'headingFontFamily', label: 'Heading font' },
            { key: 'bodyFontFamily', label: 'Body font' },
            { key: 'monoFontFamily', label: 'Mono font' },
          ].map((control) => (
            <label key={control.key} className="space-y-2 text-sm">
              <span className="font-medium">{control.label}</span>
              <select
                value={String(resolved[control.key as keyof typeof resolved] || '')}
                onChange={(event) => onChange({ ...value, [control.key]: event.target.value })}
                className={cn(
                  'w-full rounded-lg border bg-background px-3 py-2',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                {FONT_FAMILY_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </label>
          ))}

          <label htmlFor="settings-base-font-size" className="space-y-2 text-sm">
            <span className="font-medium">Base font size</span>
            <input
              id="settings-base-font-size"
              type="number"
              value={resolved.baseFontSize}
              onChange={(event) => updateNumber('baseFontSize', Number(event.target.value))}
              min={12}
              max={24}
              className={cn(
                'w-full rounded-lg border bg-background px-3 py-2',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </label>

          <label htmlFor="settings-radius" className="space-y-2 text-sm">
            <span className="font-medium">Corner radius</span>
            <input
              id="settings-radius"
              type="number"
              value={resolved.radius}
              onChange={(event) => updateNumber('radius', Number(event.target.value))}
              min={0}
              max={32}
              className={cn(
                'w-full rounded-lg border bg-background px-3 py-2',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </label>

          <label htmlFor="settings-spacing-unit" className="space-y-2 text-sm">
            <span className="font-medium">Spacing unit</span>
            <input
              id="settings-spacing-unit"
              type="number"
              value={resolved.spacingUnit}
              onChange={(event) => updateNumber('spacingUnit', Number(event.target.value))}
              min={2}
              max={16}
              className={cn(
                'w-full rounded-lg border bg-background px-3 py-2',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </label>

          <label htmlFor="settings-motion-preset" className="space-y-2 text-sm">
            <span className="font-medium">Motion preset</span>
            <select
              id="settings-motion-preset"
              value={resolved.motionPreset}
              onChange={(event) => onChange({ ...value, motionPreset: event.target.value })}
              className={cn(
                'w-full rounded-lg border bg-background px-3 py-2',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            >
              {MOTION_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <div
          className="rounded-lg border border-border p-5"
          style={{
            backgroundColor: resolved.backgroundColor,
            color: resolved.textColor,
            borderRadius: resolved.radius,
          }}
        >
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: resolved.surfaceColor,
              borderColor: resolved.mutedTextColor,
              borderRadius: resolved.radius,
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: resolved.mutedTextColor }}>
              Theme preview
            </div>
            <h4 className="mt-3 text-2xl font-semibold" style={{ fontFamily: resolved.headingFontFamily }}>
              Designed from Backy tokens
            </h4>
            <p className="mt-2 text-sm leading-6" style={{ color: resolved.mutedTextColor, fontFamily: resolved.bodyFontFamily || resolved.fontFamily }}>
              Custom frontends can consume these colors, type roles, spacing, radius, and motion defaults from Settings.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: resolved.primaryColor,
                color: resolved.backgroundColor,
                borderRadius: resolved.radius,
              }}
            >
              Primary action
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Frontend theme contract</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This token payload is included in the Settings handoff manifest and can drive any custom frontend design system.
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(themeContract, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SEO SETTINGS
// ============================================

function SEOSettings({
  value,
  onChange,
}: {
  value: SeoSettingsConfig;
  onChange: (next: SeoSettingsConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default SEO Settings</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-title-template" className="block text-sm font-medium mb-1">
              Default Title Template
            </label>
            <input
              id="settings-title-template"
              type="text"
              value={value.titleTemplate || ''}
              onChange={(event) => onChange({ ...value, titleTemplate: event.target.value })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use %s for the page title
            </p>
          </div>

          <div>
            <label htmlFor="settings-meta-description" className="block text-sm font-medium mb-1">
              Default Meta Description
            </label>
            <textarea
              id="settings-meta-description"
              value={value.metaDescription || ''}
              onChange={(event) => onChange({ ...value, metaDescription: event.target.value })}
              rows={3}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label htmlFor="settings-keywords" className="block text-sm font-medium mb-1">
              Default Keywords
            </label>
            <input
              id="settings-keywords"
              type="text"
              value={value.keywords || ''}
              onChange={(event) => onChange({ ...value, keywords: event.target.value })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Social Sharing</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-og-image" className="block text-sm font-medium mb-1">
              Default OG Image URL
            </label>
            <input
              id="settings-og-image"
              type="url"
              value={value.ogImageUrl || ''}
              onChange={(event) => onChange({ ...value, ogImageUrl: event.target.value })}
              placeholder="https://example.com/og-image.jpg"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Analytics</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-analytics-id" className="block text-sm font-medium mb-1">
              Google Analytics ID
            </label>
            <input
              id="settings-analytics-id"
              type="text"
              value={value.analyticsId || ''}
              onChange={(event) => onChange({ ...value, analyticsId: event.target.value })}
              placeholder="G-XXXXXXXXXX"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DELIVERY + API SETTINGS
// ============================================

function EndpointBlock({
  title,
  baseUrl,
  endpoints,
  copiedEndpoint,
  onCopy,
}: {
  title: string;
  baseUrl: string;
  endpoints: ApiEndpoint[];
  copiedEndpoint: string;
  onCopy: (url: string) => void;
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <PanelContent>
        <ul className="flex flex-col gap-3 text-sm">
          {endpoints.map((endpoint) => {
            const fullUrl = buildCopyText(baseUrl, endpoint.path);
            return (
              <li
                key={`${title}-${endpoint.method}-${endpoint.path}`}
                className="rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs text-foreground">
                      <span className="mr-2 inline-flex items-center rounded bg-muted px-2 py-0.5 font-bold">
                        {endpoint.method}
                      </span>
                      {fullUrl}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {endpoint.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onCopy(fullUrl)}
                    className={copiedEndpoint === fullUrl ? 'text-success' : undefined}
                  >
                    {copiedEndpoint === fullUrl ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </PanelContent>
    </Panel>
  );
}

function DeliveryModeSettings({
  value,
  runtimeStorage,
  onChange,
}: {
  value: DeliveryMode;
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  onChange: (next: DeliveryMode) => void;
}) {
  const [copiedEndpoint, setCopiedEndpoint] = useState('');
  const publicApiBase = getApiBase('public');
  const adminApiBase = getApiBase('admin');
  const publicHostBase = publicApiBase.replace(/\/api$/, '');
  const publicSiteBase = `${publicHostBase}/sites`;

  const copyEndpoint = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedEndpoint(url);
      setTimeout(() => {
        setCopiedEndpoint((current) => (current === url ? '' : current));
      }, 1200);
    } catch {
      setCopiedEndpoint('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div id="managed">
        <h3 className="text-lg font-semibold mb-4">Delivery Mode</h3>
        <div className="grid gap-3">
          {DELIVERY_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer transition-colors',
                value === option.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-accent/40'
              )}
            >
              <input
                type="radio"
                name="delivery-mode"
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
                className="mt-1"
              />
              <div>
                <p className="font-medium">{option.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">How this setting affects delivery</p>
            <p className="text-sm text-muted-foreground mt-1">
              {value === 'managed-hosting'
                ? `Pages are rendered and served by Backy at ${publicSiteBase}/[:site]/[path].`
                : 'Use API endpoints to run your own custom frontend stack.'}
            </p>
          </div>
          <a
            href={value === 'managed-hosting' ? '#managed' : '#api'}
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            {value === 'managed-hosting' ? 'Managed docs' : 'API docs'}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {runtimeStorage && (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Media storage runtime</p>
              <p className="text-sm text-muted-foreground mt-1">
                Uploads are currently routed through the {runtimeStorage.provider} provider.
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                runtimeStorage.configured
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
              )}
            >
              {runtimeStorage.configured ? 'Configured' : 'Needs config'}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            {runtimeStorage.bucket && (
              <div>
                <dt className="text-xs text-muted-foreground">Bucket</dt>
                <dd className="font-mono text-xs">{runtimeStorage.bucket}</dd>
              </div>
            )}
            {runtimeStorage.region && (
              <div>
                <dt className="text-xs text-muted-foreground">Region</dt>
                <dd className="font-mono text-xs">{runtimeStorage.region}</dd>
              </div>
            )}
            {runtimeStorage.publicUrl && (
              <div>
                <dt className="text-xs text-muted-foreground">Public URL</dt>
                <dd className="font-mono text-xs break-all">{runtimeStorage.publicUrl}</dd>
              </div>
            )}
            {runtimeStorage.basePath && (
              <div>
                <dt className="text-xs text-muted-foreground">Local path</dt>
                <dd className="font-mono text-xs break-all">{runtimeStorage.basePath}</dd>
              </div>
            )}
          </dl>
          {runtimeStorage.missing.length > 0 && (
            <p className="mt-4 text-sm text-warning">
              Missing configuration: {runtimeStorage.missing.join(', ')}
            </p>
          )}
          {runtimeStorage.error && (
            <p className="mt-2 text-sm text-warning">{runtimeStorage.error}</p>
          )}
        </div>
      )}

      <div id="api" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-foreground" />
          <h3 className="text-lg font-semibold">API Access</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Your frontend can consume these contracts directly.
          Reference contract: <code>specs/backy-api-contracts.md</code>
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <EndpointBlock
            title="Public read + interaction"
            baseUrl={publicApiBase}
            endpoints={PUBLIC_API_ENDPOINTS}
            copiedEndpoint={copiedEndpoint}
            onCopy={copyEndpoint}
          />
          <EndpointBlock
            title="Admin write + management"
            baseUrl={adminApiBase}
            endpoints={ADMIN_API_ENDPOINTS}
            copiedEndpoint={copiedEndpoint}
            onCopy={copyEndpoint}
          />
        </div>
      </div>

      {value === 'custom-frontend' && (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm">
          <p className="font-medium">Getting started with custom frontend</p>
          <p className="text-muted-foreground mt-1">
            1) Fetch site context from <code>{`${publicApiBase}/sites/:identifier`}</code>.
            2) Load page payload from
            <code>{`${publicApiBase}/sites/:siteId/pages?path=/...`}</code>.
            3) Render using shared public contract keys only.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// INFRASTRUCTURE SETTINGS
// ============================================

type IntegrationSettings = NonNullable<SiteSettingsInput['integrations']>;
type AuthSettingsConfig = NonNullable<SiteSettingsInput['auth']>;
type GeneralSettingsConfig = NonNullable<IntegrationSettings['general']>;
type AppearanceSettingsConfig = NonNullable<IntegrationSettings['appearance']>;
type SeoSettingsConfig = NonNullable<IntegrationSettings['seo']>;
type SupabaseSettings = NonNullable<IntegrationSettings['supabase']>;
type StorageSettings = NonNullable<IntegrationSettings['storage']>;
type VercelSettings = NonNullable<IntegrationSettings['vercel']>;
type NotificationSettingsConfig = NonNullable<IntegrationSettings['notifications']>;
type InfrastructureEnvProvider = 'database' | 'storage' | 'supabase' | 'vercel';
type InfrastructureEnvContract = {
  provider: InfrastructureEnvProvider;
  key: string;
  label: string;
  description: string;
  configured: boolean;
  required: boolean;
  secret?: boolean;
  aliases?: string[];
  valueHint?: string;
  example: string;
};

const DEFAULT_GENERAL_SETTINGS: Required<GeneralSettingsConfig> = {
  siteName: 'My Website',
  siteDescription: 'A brief description of your website',
  timezone: 'UTC',
};

const DEFAULT_APPEARANCE_SETTINGS: Required<AppearanceSettingsConfig> = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  surfaceColor: '#f8fafc',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  fontFamily: 'inter',
  headingFontFamily: 'inter',
  bodyFontFamily: 'inter',
  monoFontFamily: 'jetbrains-mono',
  baseFontSize: 16,
  radius: 8,
  spacingUnit: 4,
  motionPreset: 'subtle',
};

const FONT_FAMILY_OPTIONS = [
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System UI' },
  { value: 'geist', label: 'Geist' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'opensans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
] as const;

const MOTION_PRESETS = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'expressive', label: 'Expressive' },
] as const;

const DEFAULT_SEO_SETTINGS: Required<SeoSettingsConfig> = {
  titleTemplate: '%s | My Website',
  metaDescription: 'Welcome to my website',
  keywords: 'website, blog, cms',
  ogImageUrl: '',
  analyticsId: '',
};

const DEFAULT_AUTH_SETTINGS: Required<AuthSettingsConfig> = {
  requireTwoFactor: false,
  inviteOnly: false,
  minPasswordLength: 12,
  sessionTimeoutMinutes: 120,
  allowedEmailDomains: '',
};

const colorInputValue = (value: string | undefined, fallback: string) => (
  /^#[0-9a-fA-F]{6}$/.test(value || '') ? value || fallback : fallback
);

const resolveAppearanceSettings = (value?: AppearanceSettingsConfig): Required<AppearanceSettingsConfig> => ({
  ...DEFAULT_APPEARANCE_SETTINGS,
  ...(value || {}),
});

const buildAppearanceThemeContract = (value?: AppearanceSettingsConfig) => {
  const resolved = resolveAppearanceSettings(value);

  return {
    schemaVersion: 'backy.theme.v1',
    colors: {
      primary: resolved.primaryColor,
      secondary: resolved.secondaryColor,
      background: resolved.backgroundColor,
      surface: resolved.surfaceColor,
      text: resolved.textColor,
      mutedText: resolved.mutedTextColor,
    },
    typography: {
      heading: resolved.headingFontFamily,
      body: resolved.bodyFontFamily || resolved.fontFamily,
      mono: resolved.monoFontFamily,
      baseFontSize: resolved.baseFontSize,
    },
    layout: {
      radius: resolved.radius,
      spacingUnit: resolved.spacingUnit,
    },
    motion: {
      preset: resolved.motionPreset,
    },
    cssVariables: {
      '--backy-color-primary': resolved.primaryColor,
      '--backy-color-secondary': resolved.secondaryColor,
      '--backy-color-background': resolved.backgroundColor,
      '--backy-color-surface': resolved.surfaceColor,
      '--backy-color-text': resolved.textColor,
      '--backy-color-muted-text': resolved.mutedTextColor,
      '--backy-font-heading': resolved.headingFontFamily,
      '--backy-font-body': resolved.bodyFontFamily || resolved.fontFamily,
      '--backy-font-mono': resolved.monoFontFamily,
      '--backy-font-size-base': `${resolved.baseFontSize}px`,
      '--backy-radius': `${resolved.radius}px`,
      '--backy-spacing-unit': `${resolved.spacingUnit}px`,
      '--backy-motion-preset': resolved.motionPreset,
    },
  };
};

const DEFAULT_NOTIFICATION_SETTINGS: Required<Pick<NotificationSettingsConfig, 'email' | 'inApp' | 'digestFrequency'>> & {
  webhookUrl: string;
} = {
  email: {
    newUser: true,
    pagePublished: true,
    formSubmission: true,
    systemUpdates: false,
  },
  inApp: {
    comments: true,
    mentions: true,
    activity: true,
  },
  digestFrequency: 'instant',
  webhookUrl: '',
};

const inputClassName = cn(
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-ring'
);

const configuredValue = (...values: Array<string | boolean | undefined | null>): boolean => (
  values.some((value) => (typeof value === 'boolean' ? value : Boolean(value)))
);

const buildInfrastructureEnvContract = ({
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeVercel,
  storage,
  supabase,
  vercel,
}: {
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  storage?: StorageSettings;
  supabase?: SupabaseSettings;
  vercel?: VercelSettings;
}): InfrastructureEnvContract[] => [
  {
    provider: 'database',
    key: 'BACKY_DATABASE_URL',
    aliases: ['DATABASE_URL'],
    label: 'Repository database',
    description: 'Postgres or hosted database URL used by Backy repositories outside demo/local mode.',
    configured: Boolean(runtimeDatabase?.mode === 'database' && runtimeDatabase.configured),
    required: true,
    secret: true,
    valueHint: runtimeDatabase?.host || runtimeDatabase?.path || runtimeDatabase?.database,
    example: 'postgres://user:password@host:5432/backy',
  },
  {
    provider: 'storage',
    key: 'BACKY_STORAGE_PROVIDER',
    aliases: ['BACKY_MEDIA_STORAGE_PROVIDER'],
    label: 'Media storage provider',
    description: 'Selects local, s3, or supabase storage for uploads, files, fonts, and public assets.',
    configured: configuredValue(runtimeStorage?.provider, storage?.provider),
    required: true,
    valueHint: runtimeStorage?.provider || storage?.provider,
    example: 'supabase',
  },
  {
    provider: 'storage',
    key: 'BACKY_STORAGE_PUBLIC_BASE_URL',
    aliases: ['BACKY_MEDIA_PUBLIC_BASE_URL'],
    label: 'Public file base URL',
    description: 'Canonical public URL prefix used for hosted images, fonts, documents, and downloadable files.',
    configured: configuredValue(runtimeStorage?.publicUrl, storage?.publicBaseUrl),
    required: Boolean(storage?.provider && storage.provider !== 'local'),
    valueHint: runtimeStorage?.publicUrl || storage?.publicBaseUrl,
    example: 'https://project-ref.supabase.co/storage/v1/object/public/media',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_URL',
    aliases: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
    label: 'Supabase project URL',
    description: 'Project URL for Supabase-backed database, storage, and future auth adapter work.',
    configured: configuredValue(runtimeSupabase?.projectUrl, supabase?.projectUrl),
    required: Boolean(supabase?.databaseEnabled || supabase?.storageEnabled || supabase?.authEnabled),
    valueHint: runtimeSupabase?.projectUrl || supabase?.projectUrl,
    example: 'https://project-ref.supabase.co',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_ANON_KEY',
    aliases: ['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    label: 'Supabase anon key',
    description: 'Public Supabase key for read/client-safe Supabase workflows when enabled.',
    configured: Boolean(runtimeSupabase?.anonKeyConfigured),
    required: Boolean(supabase?.authEnabled),
    secret: true,
    example: '<supabase-anon-key>',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    aliases: ['SUPABASE_SERVICE_ROLE_KEY'],
    label: 'Supabase service role key',
    description: 'Server-only Supabase key for Backy storage and privileged database operations.',
    configured: Boolean(runtimeSupabase?.serviceRoleConfigured),
    required: Boolean(supabase?.databaseEnabled || supabase?.storageEnabled),
    secret: true,
    example: '<supabase-service-role-key>',
  },
  {
    provider: 'supabase',
    key: 'BACKY_SUPABASE_STORAGE_BUCKET',
    aliases: ['BACKY_STORAGE_BUCKET'],
    label: 'Supabase storage bucket',
    description: 'Bucket used by media uploads when Supabase storage is selected.',
    configured: configuredValue(runtimeSupabase?.storageBucket, runtimeStorage?.provider === 'supabase' && runtimeStorage.bucket, storage?.provider === 'supabase' && storage.bucket),
    required: Boolean(supabase?.storageEnabled || runtimeStorage?.provider === 'supabase' || storage?.provider === 'supabase'),
    valueHint: runtimeSupabase?.storageBucket || (runtimeStorage?.provider === 'supabase' ? runtimeStorage.bucket : undefined) || (storage?.provider === 'supabase' ? storage.bucket : undefined),
    example: 'media',
  },
  {
    provider: 'vercel',
    key: 'VERCEL_PROJECT_ID',
    aliases: ['BACKY_VERCEL_PROJECT_ID'],
    label: 'Vercel project',
    description: 'Project identifier for hosted Backy and future deploy orchestration.',
    configured: configuredValue(runtimeVercel?.projectId, vercel?.projectId),
    required: Boolean(vercel?.autoDeploy || vercel?.previewDeployments),
    valueHint: runtimeVercel?.projectId || vercel?.projectId,
    example: 'prj_xxxxxxxxxxxxxxxxxxxx',
  },
  {
    provider: 'vercel',
    key: 'VERCEL_TEAM_ID',
    aliases: ['BACKY_VERCEL_TEAM_ID'],
    label: 'Vercel team',
    description: 'Optional team owner for deployments, domains, and account-scoped workflows.',
    configured: configuredValue(runtimeVercel?.teamId, vercel?.teamSlug),
    required: false,
    valueHint: runtimeVercel?.teamId || vercel?.teamSlug,
    example: 'team_xxxxxxxxxxxxxxxxxxxx',
  },
  {
    provider: 'vercel',
    key: 'BACKY_PUBLIC_APP_URL',
    aliases: ['VERCEL_URL'],
    label: 'Public app URL',
    description: 'Canonical hosted URL used in API contracts, callbacks, previews, and frontend handoff.',
    configured: configuredValue(runtimeVercel?.url, vercel?.productionDomain),
    required: true,
    valueHint: runtimeVercel?.url || vercel?.productionDomain,
    example: 'https://backy.example.com',
  },
];

const formatEnvTemplate = (
  contracts: InfrastructureEnvContract[],
  provider?: InfrastructureEnvProvider,
) => contracts
  .filter((item) => !provider || item.provider === provider)
  .map((item) => {
    const value = item.secret ? item.example : item.valueHint || item.example;
    return `${item.key}=${value}`;
  })
  .join('\n');

function RuntimeCard({
  title,
  description,
  status,
  configured,
  details,
}: {
  title: string;
  description: string;
  status: string;
  configured: boolean;
  details: Array<{ label: string; value?: string | boolean | null }>;
}) {
  return (
    <Panel>
      <PanelHeader
        title={title}
        description={description}
        action={
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
              configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
          >
            {status}
          </span>
        }
      />
      <PanelContent>
        <dl className="grid gap-3 text-sm">
          {details.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="max-w-[60%] truncate text-right font-mono text-xs">
                {item.value === true ? 'yes' : item.value === false ? 'no' : item.value || 'not set'}
              </dd>
            </div>
          ))}
        </dl>
      </PanelContent>
    </Panel>
  );
}

function InfrastructureEnvContractPanel({
  contracts,
  copiedProfile,
  onCopy,
}: {
  contracts: InfrastructureEnvContract[];
  copiedProfile: string;
  onCopy: (label: string, provider?: InfrastructureEnvProvider) => void;
}) {
  const configuredCount = contracts.filter((item) => item.configured).length;
  const requiredOpenCount = contracts.filter((item) => item.required && !item.configured).length;
  const profiles: Array<{ label: string; provider?: InfrastructureEnvProvider }> = [
    { label: 'all env' },
    { label: 'supabase', provider: 'supabase' },
    { label: 'vercel', provider: 'vercel' },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Deployment env contract"
        description="Copy the environment contract needed for Vercel and Supabase without exposing stored secrets in Backy."
        icon={<Server className="size-4" />}
        action={
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
              requiredOpenCount === 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
          >
            {configuredCount}/{contracts.length} detected
          </span>
        }
      />
      <PanelContent>
        <div className="flex flex-wrap gap-2">
          {profiles.map((profile) => (
            <Button
              key={profile.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onCopy(profile.label, profile.provider)}
              iconStart={copiedProfile === profile.label ? <Check className="size-4" /> : <Copy className="size-4" />}
            >
              {copiedProfile === profile.label ? 'Copied' : `Copy ${profile.label}`}
            </Button>
          ))}
        </div>

        {requiredOpenCount > 0 && (
          <Notice tone="warning" className="mt-4">
            {requiredOpenCount} required environment {requiredOpenCount === 1 ? 'variable is' : 'variables are'} still missing for the selected infrastructure options.
          </Notice>
        )}

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(180px,0.9fr)_minmax(180px,1fr)_120px] border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground max-lg:hidden">
            <div>Variable</div>
            <div>Purpose</div>
            <div className="text-right">Status</div>
          </div>
          <div className="divide-y divide-border">
            {contracts.map((item) => (
              <div
                key={item.key}
                className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[minmax(180px,0.9fr)_minmax(180px,1fr)_120px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.key}</code>
                    {item.required && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Required
                      </span>
                    )}
                    {item.secret && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Secret
                      </span>
                    )}
                  </div>
                  {item.aliases && item.aliases.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aliases: {item.aliases.join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  <div className="font-medium text-foreground">{item.label}</div>
                  <p>{item.description}</p>
                  {item.valueHint && !item.secret && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.valueHint}</p>
                  )}
                </div>
                <div className="flex justify-start lg:justify-end">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                      item.configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                    )}
                  >
                    {item.configured ? 'Detected' : 'Missing'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}

function InfrastructureSettings({
  integrations,
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeVercel,
  envContract,
  onChange,
}: {
  integrations: IntegrationSettings;
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  envContract: InfrastructureEnvContract[];
  onChange: (next: IntegrationSettings) => void;
}) {
  const storage: StorageSettings = integrations.storage || {};
  const supabase: SupabaseSettings = integrations.supabase || {};
  const vercel: VercelSettings = integrations.vercel || {};
  const [copiedEnvProfile, setCopiedEnvProfile] = useState('');

  const updateStorage = (next: Partial<StorageSettings>) => {
    onChange({
      ...integrations,
      storage: {
        ...storage,
        ...next,
      },
    });
  };

  const updateSupabase = (next: Partial<SupabaseSettings>) => {
    onChange({
      ...integrations,
      supabase: {
        ...supabase,
        ...next,
      },
    });
  };

  const updateVercel = (next: Partial<VercelSettings>) => {
    onChange({
      ...integrations,
      vercel: {
        ...vercel,
        ...next,
      },
    });
  };

  const useRuntimeStorage = () => {
    updateStorage({
      provider: runtimeStorage?.provider || storage.provider || 'local',
      bucket: runtimeStorage?.bucket || storage.bucket || '',
      publicBaseUrl: runtimeStorage?.publicUrl || storage.publicBaseUrl || '',
      pathPrefix: runtimeStorage?.basePath || storage.pathPrefix || '',
      imageTransformsEnabled: storage.imageTransformsEnabled !== false,
    });
  };

  const useRuntimeSupabase = () => {
    updateSupabase({
      projectUrl: runtimeSupabase?.projectUrl || supabase.projectUrl || '',
      projectRef: runtimeSupabase?.projectRef || supabase.projectRef || '',
      databaseEnabled: Boolean(runtimeSupabase?.databaseUrlConfigured || supabase.databaseEnabled),
      storageEnabled: Boolean(runtimeSupabase?.storageBucket || supabase.storageEnabled),
    });
  };

  const useRuntimeVercel = () => {
    updateVercel({
      projectId: runtimeVercel?.projectId || vercel.projectId || '',
      productionDomain: runtimeVercel?.url || vercel.productionDomain || '',
    });
  };

  const copyEnvTemplate = async (label: string, provider?: InfrastructureEnvProvider) => {
    const value = formatEnvTemplate(envContract, provider);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEnvProfile(label);
      setTimeout(() => {
        setCopiedEnvProfile((current) => (current === label ? '' : current));
      }, 1400);
    } catch {
      setCopiedEnvProfile('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold">Infrastructure connections</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Backy is the in-house CMS and API control plane. Supabase and Vercel are connected providers: metadata is stored here, while real tokens and database URLs stay in environment variables.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Ownership model</h4>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              This separates what Backy controls directly from what is detected or delegated to connected providers.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Backy + providers
          </span>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          {PLATFORM_RESPONSIBILITIES.map((item) => (
            <div key={item.area} className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs font-semibold text-foreground">{item.area}</div>
              <div className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {item.owner}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.controlSurface}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RuntimeCard
          title="Database runtime"
          description="Current persistence mode used by Backy APIs."
          status={runtimeDatabase?.configured ? 'Configured' : 'Needs config'}
          configured={Boolean(runtimeDatabase?.configured)}
          details={[
            { label: 'Mode', value: runtimeDatabase?.mode },
            { label: 'Provider', value: runtimeDatabase?.provider },
            { label: 'Host/path', value: runtimeDatabase?.host || runtimeDatabase?.path },
          ]}
        />
        <RuntimeCard
          title="Supabase runtime"
          description="Detected Supabase environment capability."
          status={runtimeSupabase?.configured ? 'Configured' : 'Needs env'}
          configured={Boolean(runtimeSupabase?.configured)}
          details={[
            { label: 'Project ref', value: runtimeSupabase?.projectRef },
            { label: 'Database URL', value: runtimeSupabase?.databaseUrlConfigured },
            { label: 'Storage bucket', value: runtimeSupabase?.storageBucket },
          ]}
        />
        <RuntimeCard
          title="Vercel runtime"
          description="Detected deployment metadata for hosted Backy."
          status={runtimeVercel?.configured ? 'Configured' : 'Needs env'}
          configured={Boolean(runtimeVercel?.configured)}
          details={[
            { label: 'On Vercel', value: runtimeVercel?.onVercel },
            { label: 'Project ID', value: runtimeVercel?.projectId },
            { label: 'Environment', value: runtimeVercel?.environment },
          ]}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Media storage"
          description="Store the non-secret file-delivery intent that Media, page editors, product downloads, and custom frontends should follow."
          icon={<Database className="size-4" />}
          action={
            <Button size="sm" onClick={useRuntimeStorage}>
              Use detected storage
            </Button>
          }
        />
        <PanelContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-semibold text-foreground">Storage behavior</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Backy keeps file metadata, folders, visibility, bindings, and transform contracts in-house. The provider below tells deployments where bytes should live.
              </p>
              <dl className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Runtime provider</dt>
                  <dd className="font-mono">{runtimeStorage?.provider || 'not detected'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Runtime bucket</dt>
                  <dd className="max-w-[55%] truncate font-mono">{runtimeStorage?.bucket || 'not set'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Configured</dt>
                  <dd className={runtimeStorage?.configured ? 'text-success' : 'text-warning'}>
                    {runtimeStorage?.configured ? 'yes' : 'needs env'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Provider</span>
                <select
                  value={storage.provider || ''}
                  onChange={(event) => updateStorage({ provider: event.target.value })}
                  className={inputClassName}
                >
                  <option value="">Choose provider</option>
                  <option value="local">Local development</option>
                  <option value="supabase">Supabase Storage</option>
                  <option value="s3">S3 compatible</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Bucket</span>
                <input
                  value={storage.bucket || ''}
                  onChange={(event) => updateStorage({ bucket: event.target.value })}
                  placeholder="media"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium">Public base URL</span>
                <input
                  value={storage.publicBaseUrl || ''}
                  onChange={(event) => updateStorage({ publicBaseUrl: event.target.value })}
                  placeholder="https://project-ref.supabase.co/storage/v1/object/public/media"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Path prefix</span>
                <input
                  value={storage.pathPrefix || ''}
                  onChange={(event) => updateStorage({ pathPrefix: event.target.value })}
                  placeholder="sites/{siteId}"
                  className={inputClassName}
                />
              </label>
              <div className="grid gap-2">
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(storage.privateFilesEnabled)}
                    onChange={(event) => updateStorage({ privateFilesEnabled: event.target.checked })}
                    className="size-4 rounded border-input"
                  />
                  Private files
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={storage.imageTransformsEnabled !== false}
                    onChange={(event) => updateStorage({ imageTransformsEnabled: event.target.checked })}
                    className="size-4 rounded border-input"
                  />
                  Image transforms
                </label>
              </div>
            </div>
          </div>
          {runtimeStorage?.missing && runtimeStorage.missing.length > 0 && (
            <Notice tone="warning" className="mt-4">
              Missing storage env: {runtimeStorage.missing.join(', ')}
            </Notice>
          )}
        </PanelContent>
      </Panel>

      {runtimeDatabase?.error && (
        <Notice tone="warning" title="Database runtime issue">
          {runtimeDatabase.error}
        </Notice>
      )}

      <InfrastructureEnvContractPanel
        contracts={envContract}
        copiedProfile={copiedEnvProfile}
        onCopy={copyEnvTemplate}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Supabase"
            description="Use Supabase for Postgres persistence, storage, and auth-ready metadata."
            icon={<Cloud className="size-4" />}
            action={
              <Button size="sm" onClick={useRuntimeSupabase}>
                Use detected env
              </Button>
            }
          />
          <PanelContent>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project URL</span>
                <input
                  value={supabase.projectUrl || ''}
                  onChange={(event) => updateSupabase({ projectUrl: event.target.value })}
                  placeholder="https://project-ref.supabase.co"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project ref</span>
                <input
                  value={supabase.projectRef || ''}
                  onChange={(event) => updateSupabase({ projectRef: event.target.value })}
                  placeholder="project-ref"
                  className={inputClassName}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['databaseEnabled', 'Database'],
                  ['storageEnabled', 'Storage'],
                  ['authEnabled', 'Auth'],
                ].map(([key, label]) => (
                  <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(supabase[key as keyof SupabaseSettings])}
                      onChange={(event) => updateSupabase({ [key]: event.target.checked } as Partial<SupabaseSettings>)}
                      className="size-4 rounded border-input"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {runtimeSupabase?.missing && runtimeSupabase.missing.length > 0 && (
                <Notice tone="warning">
                  Missing Supabase env: {runtimeSupabase.missing.join(', ')}
                </Notice>
              )}
            </div>
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader
            title="Vercel"
            description="Track deployment ownership for hosted Backy and future deploy workflows."
            icon={<Rocket className="size-4" />}
            action={
              <Button size="sm" onClick={useRuntimeVercel}>
                Use detected env
              </Button>
            }
          />
          <PanelContent>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Project ID</span>
                <input
                  value={vercel.projectId || ''}
                  onChange={(event) => updateVercel({ projectId: event.target.value })}
                  placeholder="prj_..."
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Team slug</span>
                <input
                  value={vercel.teamSlug || ''}
                  onChange={(event) => updateVercel({ teamSlug: event.target.value })}
                  placeholder="team-or-account"
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Production domain</span>
                <input
                  value={vercel.productionDomain || ''}
                  onChange={(event) => updateVercel({ productionDomain: event.target.value })}
                  placeholder="backy.example.com"
                  className={inputClassName}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(vercel.autoDeploy)}
                    onChange={(event) => updateVercel({ autoDeploy: event.target.checked })}
                    className="size-4 rounded border-input"
                  />
                  Auto deploy
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={vercel.previewDeployments !== false}
                    onChange={(event) => updateVercel({ previewDeployments: event.target.checked })}
                    className="size-4 rounded border-input"
                  />
                  Preview deploys
                </label>
              </div>
              {runtimeVercel?.missing && runtimeVercel.missing.length > 0 && (
                <Notice tone="warning">
                  Missing Vercel env: {runtimeVercel.missing.join(', ')}
                </Notice>
              )}
            </div>
          </PanelContent>
        </Panel>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-semibold">Backend milestones still visible from Settings</h4>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {PLATFORM_BACKLOG.map((item) => (
            <div key={item.item} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-xs font-semibold text-foreground">{item.item}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// NOTIFICATION SETTINGS
// ============================================

function NotificationSettings({
  value,
  onChange,
}: {
  value: NotificationSettingsConfig;
  onChange: (next: NotificationSettingsConfig) => void;
}) {
  const updateEmail = (key: keyof NonNullable<NotificationSettingsConfig['email']>, checked: boolean) => {
    onChange({
      ...value,
      email: {
        ...value.email,
        [key]: checked,
      },
    });
  };

  const updateInApp = (key: keyof NonNullable<NotificationSettingsConfig['inApp']>, checked: boolean) => {
    onChange({
      ...value,
      inApp: {
        ...value.inApp,
        [key]: checked,
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <PanelHeader
          title="Email notifications"
          description="Workspace events that should be sent to configured notification channels."
        />
        <PanelContent>
          <div className="grid gap-3">
            {[
              { key: 'newUser' as const, label: 'New user registration' },
              { key: 'pagePublished' as const, label: 'Page published' },
              { key: 'formSubmission' as const, label: 'New form submission' },
              { key: 'systemUpdates' as const, label: 'System updates' },
            ].map((item) => (
              <label key={item.key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value.email?.[item.key])}
                  onChange={(event) => updateEmail(item.key, event.target.checked)}
                  className="size-4 rounded border-input"
                />
              </label>
            ))}
          </div>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="In-app notifications"
          description="Events shown in the dashboard notification bell."
        />
        <PanelContent>
          <div className="grid gap-3">
            {[
              { key: 'comments' as const, label: 'Pending comments' },
              { key: 'mentions' as const, label: 'Team mentions' },
              { key: 'activity' as const, label: 'Team activity' },
            ].map((item) => (
              <label key={item.key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value.inApp?.[item.key])}
                  onChange={(event) => updateInApp(item.key, event.target.checked)}
                  className="size-4 rounded border-input"
                />
              </label>
            ))}
          </div>
        </PanelContent>
      </Panel>

      <Panel>
        <PanelHeader
          title="Digest and webhook"
          description="Persist notification cadence and a future-compatible webhook endpoint."
        />
        <PanelContent>
          <div className="grid gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Digest frequency</span>
              <select
                value={value.digestFrequency || DEFAULT_NOTIFICATION_SETTINGS.digestFrequency}
                onChange={(event) => onChange({
                  ...value,
                  digestFrequency: event.target.value as NotificationSettingsConfig['digestFrequency'],
                })}
                className={inputClassName}
              >
                <option value="instant">Instant</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Webhook URL</span>
              <input
                value={value.webhookUrl || ''}
                onChange={(event) => onChange({ ...value, webhookUrl: event.target.value })}
                placeholder="https://example.com/backy-events"
                className={inputClassName}
              />
            </label>
          </div>
        </PanelContent>
      </Panel>

      <Notice tone="info" title="Runtime behavior">
        Pending comment notifications in the header honor the in-app comments toggle immediately after settings are saved.
      </Notice>
    </div>
  );
}

// ============================================
// SECURITY SETTINGS
// ============================================

function SecuritySettings({
  publicApiKey,
  adminApiKey,
  authSettings,
  onAuthSettingsChange,
  onRegenerateKeys,
  auditLogs,
  isAuditLoading,
  auditNotice,
  onRefreshAudit,
}: {
  publicApiKey: string;
  adminApiKey: string;
  authSettings?: SiteSettingsInput['auth'];
  onAuthSettingsChange: (next: SiteSettingsInput['auth']) => void;
  onRegenerateKeys: (scope: 'all' | 'public' | 'admin') => Promise<void> | void;
  auditLogs: AdminAuditLog[];
  isAuditLoading: boolean;
  auditNotice: string | null;
  onRefreshAudit: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<'public' | 'admin' | null>(null);
  const [rotatingKey, setRotatingKey] = useState<'all' | 'public' | 'admin' | null>(null);
  const policy: Required<AuthSettingsConfig> = {
    ...DEFAULT_AUTH_SETTINGS,
    ...(authSettings || {}),
  };

  const updatePolicy = (next: Partial<AuthSettingsConfig>) => {
    onAuthSettingsChange({
      ...policy,
      ...next,
    });
  };

  const copyKey = async (scope: 'public' | 'admin', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(scope);
      setTimeout(() => {
        setCopiedKey((current) => (current === scope ? null : current));
      }, 1200);
    } catch {
      setCopiedKey(null);
    }
  };

  const rotateKey = async (scope: 'all' | 'public' | 'admin') => {
    setRotatingKey(scope);
    try {
      await onRegenerateKeys(scope);
    } finally {
      setRotatingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Workspace security policy"
          description="Persist auth policy for admin sessions and future Supabase auth enforcement."
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-2">
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
              <span>Require two-factor authentication</span>
              <input
                type="checkbox"
                checked={policy.requireTwoFactor}
                onChange={(event) => updatePolicy({ requireTwoFactor: event.target.checked })}
                className="size-4 rounded border-input"
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm">
              <span>Invite-only workspace access</span>
              <input
                type="checkbox"
                checked={policy.inviteOnly}
                onChange={(event) => updatePolicy({ inviteOnly: event.target.checked })}
                className="size-4 rounded border-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Minimum password length</span>
              <input
                type="number"
                min={8}
                max={128}
                value={policy.minPasswordLength}
                onChange={(event) => updatePolicy({ minPasswordLength: Number(event.target.value) })}
                className={inputClassName}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Session timeout</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={15}
                  max={10080}
                  value={policy.sessionTimeoutMinutes}
                  onChange={(event) => updatePolicy({ sessionTimeoutMinutes: Number(event.target.value) })}
                  className={inputClassName}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm xl:col-span-2">
              <span className="font-medium">Allowed email domains</span>
              <input
                value={policy.allowedEmailDomains}
                onChange={(event) => updatePolicy({ allowedEmailDomains: event.target.value })}
                placeholder="example.com, agency.dev"
                className={inputClassName}
              />
              <span className="text-xs text-muted-foreground">
                Leave blank to allow any invited email domain.
              </span>
            </label>
          </div>
        </PanelContent>
      </Panel>

      <div>
        <h3 className="text-lg font-semibold mb-4">API Keys</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            {
              scope: 'public' as const,
              label: 'Public API Key',
              value: publicApiKey,
              detail: 'Use from custom frontends for published content, forms, comments, and media delivery.',
            },
            {
              scope: 'admin' as const,
              label: 'Admin API Key',
              value: adminApiKey,
              detail: 'Use only from trusted server environments for dashboard and management workflows.',
            },
          ].map((item) => (
            <div key={item.scope} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  Active
                </span>
              </div>
              <p className="mt-3 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                {item.value}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyKey(item.scope, item.value)}>
                  {copiedKey === item.scope ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void rotateKey(item.scope)}
                  disabled={rotatingKey !== null}
                >
                  {rotatingKey === item.scope ? 'Regenerating...' : `Regenerate ${item.scope}`}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Rotate both keys</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this when a workspace credential may have been exposed. Existing integrations need to update both keys.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void rotateKey('all')}
              disabled={rotatingKey !== null}
            >
              {rotatingKey === 'all' ? 'Regenerating...' : 'Regenerate all keys'}
            </Button>
          </div>
        </div>
      </div>

      <AuditTrail
        logs={auditLogs}
        isLoading={isAuditLoading}
        notice={auditNotice}
        onRefresh={onRefreshAudit}
      />
    </div>
  );
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const textFromRecord = (value: Record<string, unknown> | undefined, key: string): string | null => {
  const raw = value?.[key];
  return typeof raw === 'string' && raw.trim() ? raw : null;
};

function formatAuditTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function auditTitle(log: AdminAuditLog): string {
  if (log.action === 'settings.update') {
    return 'Settings updated';
  }
  if (log.action === 'settings.api_keys.regenerate') {
    return 'API keys regenerated';
  }
  return log.action;
}

function auditDescription(log: AdminAuditLog): string {
  const beforeMode = textFromRecord(log.before, 'deliveryMode');
  const afterMode = textFromRecord(log.after, 'deliveryMode');
  const metadata = asRecord(log.metadata);
  const changedKeys = Array.isArray(metadata?.changedKeys)
    ? metadata.changedKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const scope = typeof metadata?.scope === 'string' ? metadata.scope : null;

  if (beforeMode && afterMode && beforeMode !== afterMode) {
    return `Delivery mode changed from ${beforeMode} to ${afterMode}.`;
  }

  if (scope) {
    return `Regenerated ${scope === 'all' ? 'public and admin' : scope} API key${scope === 'all' ? 's' : ''}.`;
  }

  if (changedKeys.length > 0) {
    return `Changed ${changedKeys.join(', ')}.`;
  }

  return `Request ${log.requestId || log.id}`;
}

function AuditTrail({
  logs,
  isLoading,
  notice,
  onRefresh,
}: {
  logs: AdminAuditLog[];
  isLoading: boolean;
  notice: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-foreground" />
            <h3 className="text-lg font-semibold">Settings Audit Trail</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Recent settings and API-key changes recorded by the backend.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium',
            'hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {notice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {isLoading && logs.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">
            Loading audit trail...
          </div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">
            No settings audit events have been recorded yet.
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{auditTitle(log)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {auditDescription(log)}
                </p>
                {log.requestId && (
                  <p className="font-mono text-xs text-muted-foreground mt-2 break-all">
                    {log.requestId}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{formatAuditTime(log.createdAt)}</p>
                <p className="mt-1">{log.actorId || 'admin'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
