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

import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
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
    path: '/sites/:siteId/forms',
    description: 'List forms and review submissions.',
  },
];

function getEnvValue(key: string): string {
  const env =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env ??
    {};
  return env[key]?.trim() ?? '';
}

function getApiBase(kind: 'public' | 'admin'): string {
  const publicFallback =
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
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
      const backendSettings = await updateBackendSettings({ deliveryMode, integrations });
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

  const handleRegenerateKeys = async () => {
    setNotice(null);

    try {
      const backendSettings = await regenerateSettingsApiKeys();
      applyBackendSettings(backendSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadSettingsAuditLogs();
    } catch {
      setNotice('Backend key regeneration failed. API keys were not changed.');
    }
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

      {/* Tabs */}
      <SegmentedTabs items={TABS} value={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <Panel>
        <PanelContent className="pt-5">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'appearance' && <AppearanceSettings />}
        {activeTab === 'seo' && <SEOSettings />}
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
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'security' && (
          <SecuritySettings
            publicApiKey={publicApiKey}
            adminApiKey={adminApiKey}
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

// ============================================
// GENERAL SETTINGS
// ============================================

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Site Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Site Name
            </label>
            <input
              type="text"
              defaultValue="My Website"
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Site Description
            </label>
            <textarea
              defaultValue="A brief description of your website"
              rows={3}
              className={cn(
                'w-full max-w-md px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Timezone
            </label>
            <select
              defaultValue="UTC"
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

function AppearanceSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Theme Colors</h3>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                defaultValue="#3b82f6"
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <input
                type="text"
                defaultValue="#3b82f6"
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Secondary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                defaultValue="#8b5cf6"
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <input
                type="text"
                defaultValue="#8b5cf6"
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
            <label className="block text-sm font-medium mb-1">
              Font Family
            </label>
            <select
              defaultValue="inter"
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
            <label className="block text-sm font-medium mb-1">
              Base Font Size
            </label>
            <input
              type="number"
              defaultValue={16}
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

function SEOSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default SEO Settings</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">
              Default Title Template
            </label>
            <input
              type="text"
              defaultValue="%s | My Website"
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
            <label className="block text-sm font-medium mb-1">
              Default Meta Description
            </label>
            <textarea
              defaultValue="Welcome to my website"
              rows={3}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Default Keywords
            </label>
            <input
              type="text"
              defaultValue="website, blog, cms"
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
            <label className="block text-sm font-medium mb-1">
              Default OG Image
            </label>
            <input
              type="file"
              accept="image/*"
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
            <label className="block text-sm font-medium mb-1">
              Google Analytics ID
            </label>
            <input
              type="text"
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
type SupabaseSettings = NonNullable<IntegrationSettings['supabase']>;
type VercelSettings = NonNullable<IntegrationSettings['vercel']>;

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

function NotificationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Email Notifications</h3>
        <div className="space-y-3">
          {[
            { id: 'new-user', label: 'New user registration' },
            { id: 'page-published', label: 'Page published' },
            { id: 'form-submission', label: 'New form submission' },
            { id: 'system-updates', label: 'System updates' },
          ].map((item) => (
            <label key={item.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">In-App Notifications</h3>
        <div className="space-y-3">
          {[
            { id: 'comments', label: 'New comments' },
            { id: 'mentions', label: 'Mentions' },
            { id: 'activity', label: 'Team activity' },
          ].map((item) => (
            <label key={item.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// SECURITY SETTINGS
// ============================================

function SecuritySettings({
  publicApiKey,
  adminApiKey,
  onRegenerateKeys,
  auditLogs,
  isAuditLoading,
  auditNotice,
  onRefreshAudit,
}: {
  publicApiKey: string;
  adminApiKey: string;
  onRegenerateKeys: () => void;
  auditLogs: AdminAuditLog[];
  isAuditLoading: boolean;
  auditNotice: string | null;
  onRefreshAudit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Password</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">
              Current Password
            </label>
            <input
              type="password"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              New Password
            </label>
            <input
              type="password"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Two-Factor Authentication</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add an extra layer of security to your account
        </p>
        <button
          className={cn(
            'px-4 py-2 rounded-lg border font-medium',
            'hover:bg-accent transition-colors'
          )}
        >
          Enable 2FA
        </button>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">API Keys</h3>
        <div className="space-y-4 max-w-md">
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Public API Key</p>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {publicApiKey}
                </p>
              </div>
              <button
                type="button"
                onClick={onRegenerateKeys}
                className="text-sm text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="font-medium">Admin API Key</p>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              {adminApiKey}
            </p>
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
