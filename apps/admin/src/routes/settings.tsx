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

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Palette,
  Globe,
  Mail,
  Shield,
  Database,
  Bell,
  Save,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'security', name: 'Security', icon: Shield },
];

// ============================================
// COMPONENT
// ============================================

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
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
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'security' && <SecuritySettings />}
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

function SecuritySettings() {
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
                  bk_live_xxxxxxxxxxxx
                </p>
              </div>
              <button className="text-sm text-primary hover:underline">
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
