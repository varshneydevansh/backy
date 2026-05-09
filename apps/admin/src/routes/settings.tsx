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
import { createFileRoute } from '@tanstack/react-router';
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
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

// ============================================
// TABS
// ============================================

type SettingsTab = 'general' | 'appearance' | 'seo' | 'delivery' | 'infrastructure' | 'notifications' | 'security';

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
      'Use your own frontend and consume Backy public APIs for pages, forms, and comments.',
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
    path: '/sites/:siteId/pages?path=/',
    description: 'Resolve page content by path (published only).',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/posts?status=published',
    description: 'List published blog posts.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/blog/posts/:slug',
    description: 'Fetch a single published blog post by slug.',
  },
  {
    method: 'GET',
    path: '/sites/:siteId/media?type=image',
    description: 'List public media assets for custom frontends and design systems.',
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
    method: 'POST',
    path: '/sites/:siteId/forms/:formId/submissions',
    description: 'Submit form payloads with optional anti-spam metadata.',
  },
  {
    method: 'POST',
    path: '/sites/:siteId/forms/:formId/contacts',
    description: 'Submit contact-share payloads.',
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
    path: '/sites/:siteId/blog/posts',
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
    path: '/sites/:siteId/comments?status=pending',
    description: 'Moderate page and blog comments from a custom admin frontend.',
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
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
    const supabase = integrations.supabase;
    const vercel = integrations.vercel;
    const storageConfigured = runtimeStorage?.configured === true;
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
    integrations.supabase,
    integrations.vercel,
    publicApiKey,
    runtimeDatabase,
    runtimeStorage,
    runtimeSupabase,
    runtimeVercel,
  ]);

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

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your CMS settings and preferences
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving}
          iconStart={saved ? <Check className="size-4" /> : <Save className="size-4" />}
        >
          {saved ? 'Saved' : isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {notice && (
        <Notice tone="warning">{notice}</Notice>
      )}

      <Panel>
        <PanelHeader
          title="Platform readiness"
          description="One place to see whether Backy can securely power managed sites, custom frontends, media, database-backed content, and deploy workflows."
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
                onClick={() => setActiveTab('infrastructure')}
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
                  onClick={() => setActiveTab(area.tab)}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="text-sm font-semibold text-foreground">{area.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </PanelContent>
      </Panel>

      {/* Tabs */}
      <SegmentedTabs items={TABS} value={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <Panel>
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
            runtimeSupabase={runtimeSupabase}
            runtimeVercel={runtimeVercel}
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
  const updateColor = (key: 'primaryColor' | 'secondaryColor', nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Theme Colors</h3>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <label htmlFor="settings-primary-color" className="block text-sm font-medium mb-1">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-primary-color"
                type="color"
                value={colorInputValue(value.primaryColor, DEFAULT_APPEARANCE_SETTINGS.primaryColor)}
                onChange={(event) => updateColor('primaryColor', event.target.value)}
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <input
                type="text"
                aria-label="Primary color hex"
                value={value.primaryColor || ''}
                onChange={(event) => updateColor('primaryColor', event.target.value)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
            </div>
          </div>

          <div>
            <label htmlFor="settings-secondary-color" className="block text-sm font-medium mb-1">
              Secondary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-secondary-color"
                type="color"
                value={colorInputValue(value.secondaryColor, DEFAULT_APPEARANCE_SETTINGS.secondaryColor)}
                onChange={(event) => updateColor('secondaryColor', event.target.value)}
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <input
                type="text"
                aria-label="Secondary color hex"
                value={value.secondaryColor || ''}
                onChange={(event) => updateColor('secondaryColor', event.target.value)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Typography</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-font-family" className="block text-sm font-medium mb-1">
              Font Family
            </label>
            <select
              id="settings-font-family"
              value={value.fontFamily || DEFAULT_APPEARANCE_SETTINGS.fontFamily}
              onChange={(event) => onChange({ ...value, fontFamily: event.target.value })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="inter">Inter</option>
              <option value="roboto">Roboto</option>
              <option value="opensans">Open Sans</option>
              <option value="lato">Lato</option>
              <option value="poppins">Poppins</option>
            </select>
          </div>

          <div>
            <label htmlFor="settings-base-font-size" className="block text-sm font-medium mb-1">
              Base Font Size
            </label>
            <input
              id="settings-base-font-size"
              type="number"
              value={value.baseFontSize || DEFAULT_APPEARANCE_SETTINGS.baseFontSize}
              onChange={(event) => onChange({ ...value, baseFontSize: Number(event.target.value) })}
              min={12}
              max={24}
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
type VercelSettings = NonNullable<IntegrationSettings['vercel']>;
type NotificationSettingsConfig = NonNullable<IntegrationSettings['notifications']>;

const DEFAULT_GENERAL_SETTINGS: Required<GeneralSettingsConfig> = {
  siteName: 'My Website',
  siteDescription: 'A brief description of your website',
  timezone: 'UTC',
};

const DEFAULT_APPEARANCE_SETTINGS: Required<AppearanceSettingsConfig> = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  fontFamily: 'inter',
  baseFontSize: 16,
};

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

function InfrastructureSettings({
  integrations,
  runtimeDatabase,
  runtimeSupabase,
  runtimeVercel,
  onChange,
}: {
  integrations: IntegrationSettings;
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  onChange: (next: IntegrationSettings) => void;
}) {
  const supabase: SupabaseSettings = integrations.supabase || {};
  const vercel: VercelSettings = integrations.vercel || {};

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold">Infrastructure connections</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Persist non-secret connection metadata here. Real tokens and database URLs stay in environment variables.
        </p>
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

      {runtimeDatabase?.error && (
        <Notice tone="warning" title="Database runtime issue">
          {runtimeDatabase.error}
        </Notice>
      )}

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
