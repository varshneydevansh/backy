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

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore, type DeliveryMode } from '@/stores/mockStore';

// ============================================
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

// ============================================
// TABS
// ============================================

const TABS = [
  { id: 'general', name: 'General', icon: Globe },
  { id: 'appearance', name: 'Appearance', icon: Palette },
  { id: 'seo', name: 'SEO', icon: Database },
  { id: 'delivery', name: 'Delivery', icon: Code },
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
  const [activeTab, setActiveTab] = useState('general');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('managed-hosting');
  const [saved, setSaved] = useState(false);
  const persistedDeliveryMode = useStore((state) => state.settings.deliveryMode);
  const updateSettings = useStore((state) => state.updateSettings);
  const publicApiKey = useStore((state) => state.settings.apiKeys.publicApiKey);
  const adminApiKey = useStore((state) => state.settings.apiKeys.adminApiKey);
  const regenerateApiKeys = useStore((state) => state.regenerateApiKeys);

  useEffect(() => {
    setDeliveryMode(persistedDeliveryMode);
  }, [persistedDeliveryMode]);

  const handleSave = () => {
    updateSettings({ deliveryMode });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your CMS settings and preferences
          </p>
        </div>

        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium',
            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border rounded-xl p-6">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'appearance' && <AppearanceSettings />}
        {activeTab === 'seo' && <SEOSettings />}
        {activeTab === 'delivery' && (
          <DeliveryModeSettings value={deliveryMode} onChange={setDeliveryMode} />
        )}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'security' && (
          <SecuritySettings
            publicApiKey={publicApiKey}
            adminApiKey={adminApiKey}
            onRegenerateKeys={regenerateApiKeys}
          />
        )}
      </div>
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
    <div className="rounded-lg border border-border p-4">
      <h4 className="font-medium mb-3">{title}</h4>
      <ul className="space-y-3 text-sm">
        {endpoints.map((endpoint) => {
          const fullUrl = buildCopyText(baseUrl, endpoint.path);
          return (
            <li
              key={`${title}-${endpoint.method}-${endpoint.path}`}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-foreground">
                    <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 mr-2 font-bold">
                      {endpoint.method}
                    </span>
                    {fullUrl}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {endpoint.description}
                  </p>
                </div>
                <button
                  onClick={() => onCopy(fullUrl)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors',
                    copiedEndpoint === fullUrl
                      ? 'text-emerald-600 font-medium'
                      : 'text-foreground'
                  )}
                >
                  {copiedEndpoint === fullUrl ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeliveryModeSettings({
  value,
  onChange,
}: {
  value: DeliveryMode;
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
    <div className="space-y-6">
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
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div id="api" className="space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-foreground" />
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
}: {
  publicApiKey: string;
  adminApiKey: string;
  onRegenerateKeys: () => void;
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
    </div>
  );
}

export default SettingsPage;
