/**
 * ==========================================================================
 * Settings Configuration Panel
 * ==========================================================================
 *
 * Admin settings UI for configuring:
 * - Database connection (Postgres, MySQL, SQLite)
 * - Storage provider (S3, Supabase, Local)
 * - Authentication (SSO providers)
 * - General settings
 */

import React, { useState, useCallback } from 'react';

// ==========================================================================
// TYPES
// ==========================================================================

export interface DatabaseConfig {
    type: 'postgres' | 'mysql' | 'sqlite';
    url: string;
    poolSize?: number;
}

export interface StorageConfig {
    provider: 's3' | 'supabase' | 'local';
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
    localPath?: string;
}

export interface AuthConfig {
    providers: {
        google?: { clientId: string; clientSecret: string; enabled: boolean };
        github?: { clientId: string; clientSecret: string; enabled: boolean };
        microsoft?: { clientId: string; clientSecret: string; tenantId: string; enabled: boolean };
    };
    jwtSecret: string;
    jwtExpiry: string;
    allowEmailPassword: boolean;
}

export interface GeneralConfig {
    siteName: string;
    adminEmail: string;
    maxUploadSize: number;
    enableAnalytics: boolean;
    maintenanceMode: boolean;
}

export interface AppConfig {
    database: DatabaseConfig;
    storage: StorageConfig;
    auth: AuthConfig;
    general: GeneralConfig;
}

interface SettingsPanelProps {
    config: AppConfig;
    onChange: (config: AppConfig) => void;
    onSave: () => Promise<void>;
}

// ==========================================================================
// STYLES
// ==========================================================================

const styles = {
    container: {
        padding: '24px',
        maxWidth: '800px',
        margin: '0 auto',
    } as React.CSSProperties,
    header: {
        marginBottom: '24px',
    } as React.CSSProperties,
    title: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#111827',
        marginBottom: '4px',
    } as React.CSSProperties,
    subtitle: {
        fontSize: '14px',
        color: '#6b7280',
    } as React.CSSProperties,
    tabs: {
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '24px',
    } as React.CSSProperties,
    tab: {
        padding: '12px 20px',
        fontSize: '14px',
        fontWeight: 500,
        color: '#6b7280',
        background: 'none',
        border: 'none',
        borderBottom: '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.15s',
    } as React.CSSProperties,
    activeTab: {
        color: '#3b82f6',
        borderBottomColor: '#3b82f6',
    } as React.CSSProperties,
    section: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        marginBottom: '20px',
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: '16px',
        fontWeight: 600,
        color: '#111827',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    } as React.CSSProperties,
    field: {
        marginBottom: '16px',
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: 500,
        color: '#374151',
        marginBottom: '6px',
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        transition: 'border-color 0.15s',
    } as React.CSSProperties,
    select: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        backgroundColor: '#ffffff',
    } as React.CSSProperties,
    row: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
    } as React.CSSProperties,
    checkbox: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '14px',
        color: '#374151',
        cursor: 'pointer',
    } as React.CSSProperties,
    saveButton: {
        padding: '12px 24px',
        backgroundColor: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    } as React.CSSProperties,
    providerCard: {
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '12px',
    } as React.CSSProperties,
    providerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
    } as React.CSSProperties,
    badge: {
        padding: '4px 8px',
        backgroundColor: '#dcfce7',
        color: '#166534',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 500,
    } as React.CSSProperties,
    badgeDisabled: {
        padding: '4px 8px',
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 500,
    } as React.CSSProperties,
};

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

type TabType = 'database' | 'storage' | 'auth' | 'general';

interface DatabaseTabProps {
    config: DatabaseConfig;
    onChange: (config: DatabaseConfig) => void;
}

function DatabaseTab({ config, onChange }: DatabaseTabProps) {
    return (
        <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
                💾 Database Configuration
            </h3>

            <div style={styles.field}>
                <label style={styles.label}>Database Type</label>
                <select
                    style={styles.select}
                    value={config.type}
                    onChange={(e) => onChange({ ...config, type: e.target.value as DatabaseConfig['type'] })}
                >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                </select>
            </div>

            <div style={styles.field}>
                <label style={styles.label}>
                    {config.type === 'sqlite' ? 'Database Path' : 'Connection URL'}
                </label>
                <input
                    type="text"
                    style={styles.input}
                    value={config.url}
                    onChange={(e) => onChange({ ...config, url: e.target.value })}
                    placeholder={
                        config.type === 'sqlite'
                            ? '/path/to/database.db'
                            : config.type === 'postgres'
                                ? 'postgres://user:pass@localhost:5432/dbname'
                                : 'mysql://user:pass@localhost:3306/dbname'
                    }
                />
            </div>

            {config.type !== 'sqlite' && (
                <div style={styles.field}>
                    <label style={styles.label}>Connection Pool Size</label>
                    <input
                        type="number"
                        style={{ ...styles.input, width: '120px' }}
                        value={config.poolSize || 10}
                        onChange={(e) => onChange({ ...config, poolSize: parseInt(e.target.value) })}
                        min={1}
                        max={100}
                    />
                </div>
            )}
        </div>
    );
}

interface StorageTabProps {
    config: StorageConfig;
    onChange: (config: StorageConfig) => void;
}

function StorageTab({ config, onChange }: StorageTabProps) {
    return (
        <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
                ☁️ Storage Configuration
            </h3>

            <div style={styles.field}>
                <label style={styles.label}>Storage Provider</label>
                <select
                    style={styles.select}
                    value={config.provider}
                    onChange={(e) =>
                        onChange({ ...config, provider: e.target.value as StorageConfig['provider'] })
                    }
                >
                    <option value="s3">Amazon S3 / R2 / MinIO</option>
                    <option value="supabase">Supabase Storage</option>
                    <option value="local">Local Filesystem</option>
                </select>
            </div>

            {config.provider === 's3' && (
                <>
                    <div style={styles.row}>
                        <div style={styles.field}>
                            <label style={styles.label}>Bucket Name</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={config.bucket || ''}
                                onChange={(e) => onChange({ ...config, bucket: e.target.value })}
                                placeholder="my-bucket"
                            />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Region</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={config.region || ''}
                                onChange={(e) => onChange({ ...config, region: e.target.value })}
                                placeholder="us-east-1"
                            />
                        </div>
                    </div>
                    <div style={styles.row}>
                        <div style={styles.field}>
                            <label style={styles.label}>Access Key ID</label>
                            <input
                                type="text"
                                style={styles.input}
                                value={config.accessKeyId || ''}
                                onChange={(e) => onChange({ ...config, accessKeyId: e.target.value })}
                                placeholder="AKIA..."
                            />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Secret Access Key</label>
                            <input
                                type="password"
                                style={styles.input}
                                value={config.secretAccessKey || ''}
                                onChange={(e) => onChange({ ...config, secretAccessKey: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                </>
            )}

            {config.provider === 'supabase' && (
                <>
                    <div style={styles.field}>
                        <label style={styles.label}>Supabase URL</label>
                        <input
                            type="text"
                            style={styles.input}
                            value={config.supabaseUrl || ''}
                            onChange={(e) => onChange({ ...config, supabaseUrl: e.target.value })}
                            placeholder="https://xxx.supabase.co"
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Supabase Service Key</label>
                        <input
                            type="password"
                            style={styles.input}
                            value={config.supabaseKey || ''}
                            onChange={(e) => onChange({ ...config, supabaseKey: e.target.value })}
                            placeholder="eyJ..."
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Bucket Name</label>
                        <input
                            type="text"
                            style={styles.input}
                            value={config.bucket || ''}
                            onChange={(e) => onChange({ ...config, bucket: e.target.value })}
                            placeholder="media"
                        />
                    </div>
                </>
            )}

            {config.provider === 'local' && (
                <div style={styles.field}>
                    <label style={styles.label}>Storage Path</label>
                    <input
                        type="text"
                        style={styles.input}
                        value={config.localPath || ''}
                        onChange={(e) => onChange({ ...config, localPath: e.target.value })}
                        placeholder="./uploads"
                    />
                </div>
            )}
        </div>
    );
}

interface AuthTabProps {
    config: AuthConfig;
    onChange: (config: AuthConfig) => void;
}

function AuthTab({ config, onChange }: AuthTabProps) {
    const updateProvider = (
        provider: 'google' | 'github' | 'microsoft',
        updates: Partial<NonNullable<AuthConfig['providers']['google']>>
    ) => {
        onChange({
            ...config,
            providers: {
                ...config.providers,
                [provider]: { ...config.providers[provider], ...updates },
            },
        });
    };

    return (
        <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
                🔐 Authentication Configuration
            </h3>

            {/* JWT Settings */}
            <div style={{ ...styles.row, marginBottom: '20px' }}>
                <div style={styles.field}>
                    <label style={styles.label}>JWT Secret</label>
                    <input
                        type="password"
                        style={styles.input}
                        value={config.jwtSecret}
                        onChange={(e) => onChange({ ...config, jwtSecret: e.target.value })}
                        placeholder="Your secret key..."
                    />
                </div>
                <div style={styles.field}>
                    <label style={styles.label}>JWT Expiry</label>
                    <input
                        type="text"
                        style={styles.input}
                        value={config.jwtExpiry}
                        onChange={(e) => onChange({ ...config, jwtExpiry: e.target.value })}
                        placeholder="7d"
                    />
                </div>
            </div>

            <label style={styles.checkbox}>
                <input
                    type="checkbox"
                    checked={config.allowEmailPassword}
                    onChange={(e) => onChange({ ...config, allowEmailPassword: e.target.checked })}
                />
                Allow Email/Password Login
            </label>

            <h4 style={{ ...styles.sectionTitle, marginTop: '24px', fontSize: '14px' }}>
                SSO Providers
            </h4>

            {/* Google */}
            <div style={styles.providerCard}>
                <div style={styles.providerHeader}>
                    <span style={{ fontWeight: 500 }}>🔴 Google</span>
                    <span style={config.providers.google?.enabled ? styles.badge : styles.badgeDisabled}>
                        {config.providers.google?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <label style={{ ...styles.checkbox, marginBottom: '12px' }}>
                    <input
                        type="checkbox"
                        checked={config.providers.google?.enabled || false}
                        onChange={(e) => updateProvider('google', { enabled: e.target.checked })}
                    />
                    Enable Google SSO
                </label>
                {config.providers.google?.enabled && (
                    <div style={styles.row}>
                        <input
                            type="text"
                            style={styles.input}
                            value={config.providers.google?.clientId || ''}
                            onChange={(e) => updateProvider('google', { clientId: e.target.value })}
                            placeholder="Client ID"
                        />
                        <input
                            type="password"
                            style={styles.input}
                            value={config.providers.google?.clientSecret || ''}
                            onChange={(e) => updateProvider('google', { clientSecret: e.target.value })}
                            placeholder="Client Secret"
                        />
                    </div>
                )}
            </div>

            {/* GitHub */}
            <div style={styles.providerCard}>
                <div style={styles.providerHeader}>
                    <span style={{ fontWeight: 500 }}>⬛ GitHub</span>
                    <span style={config.providers.github?.enabled ? styles.badge : styles.badgeDisabled}>
                        {config.providers.github?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <label style={{ ...styles.checkbox, marginBottom: '12px' }}>
                    <input
                        type="checkbox"
                        checked={config.providers.github?.enabled || false}
                        onChange={(e) => updateProvider('github', { enabled: e.target.checked })}
                    />
                    Enable GitHub SSO
                </label>
                {config.providers.github?.enabled && (
                    <div style={styles.row}>
                        <input
                            type="text"
                            style={styles.input}
                            value={config.providers.github?.clientId || ''}
                            onChange={(e) => updateProvider('github', { clientId: e.target.value })}
                            placeholder="Client ID"
                        />
                        <input
                            type="password"
                            style={styles.input}
                            value={config.providers.github?.clientSecret || ''}
                            onChange={(e) => updateProvider('github', { clientSecret: e.target.value })}
                            placeholder="Client Secret"
                        />
                    </div>
                )}
            </div>

            {/* Microsoft */}
            <div style={styles.providerCard}>
                <div style={styles.providerHeader}>
                    <span style={{ fontWeight: 500 }}>🔷 Microsoft</span>
                    <span style={config.providers.microsoft?.enabled ? styles.badge : styles.badgeDisabled}>
                        {config.providers.microsoft?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <label style={{ ...styles.checkbox, marginBottom: '12px' }}>
                    <input
                        type="checkbox"
                        checked={config.providers.microsoft?.enabled || false}
                        onChange={(e) => updateProvider('microsoft', { enabled: e.target.checked })}
                    />
                    Enable Microsoft SSO
                </label>
                {config.providers.microsoft?.enabled && (
                    <>
                        <div style={{ ...styles.row, marginBottom: '8px' }}>
                            <input
                                type="text"
                                style={styles.input}
                                value={config.providers.microsoft?.clientId || ''}
                                onChange={(e) => updateProvider('microsoft', { clientId: e.target.value })}
                                placeholder="Client ID"
                            />
                            <input
                                type="password"
                                style={styles.input}
                                value={config.providers.microsoft?.clientSecret || ''}
                                onChange={(e) => updateProvider('microsoft', { clientSecret: e.target.value })}
                                placeholder="Client Secret"
                            />
                        </div>
                        <input
                            type="text"
                            style={styles.input}
                            value={(config.providers.microsoft as { tenantId?: string })?.tenantId || ''}
                            onChange={(e) => updateProvider('microsoft', { tenantId: e.target.value } as unknown as Partial<NonNullable<AuthConfig['providers']['google']>>)}
                            placeholder="Tenant ID (optional, default: common)"
                        />
                    </>
                )}
            </div>
        </div>
    );
}

interface GeneralTabProps {
    config: GeneralConfig;
    onChange: (config: GeneralConfig) => void;
}

function GeneralTab({ config, onChange }: GeneralTabProps) {
    return (
        <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
                ⚙️ General Settings
            </h3>

            <div style={styles.row}>
                <div style={styles.field}>
                    <label style={styles.label}>Site Name</label>
                    <input
                        type="text"
                        style={styles.input}
                        value={config.siteName}
                        onChange={(e) => onChange({ ...config, siteName: e.target.value })}
                        placeholder="Backy CMS"
                    />
                </div>
                <div style={styles.field}>
                    <label style={styles.label}>Admin Email</label>
                    <input
                        type="email"
                        style={styles.input}
                        value={config.adminEmail}
                        onChange={(e) => onChange({ ...config, adminEmail: e.target.value })}
                        placeholder="admin@example.com"
                    />
                </div>
            </div>

            <div style={styles.field}>
                <label style={styles.label}>Max Upload Size (MB)</label>
                <input
                    type="number"
                    style={{ ...styles.input, width: '120px' }}
                    value={config.maxUploadSize}
                    onChange={(e) => onChange({ ...config, maxUploadSize: parseInt(e.target.value) })}
                    min={1}
                    max={100}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                <label style={styles.checkbox}>
                    <input
                        type="checkbox"
                        checked={config.enableAnalytics}
                        onChange={(e) => onChange({ ...config, enableAnalytics: e.target.checked })}
                    />
                    Enable Analytics
                </label>
                <label style={styles.checkbox}>
                    <input
                        type="checkbox"
                        checked={config.maintenanceMode}
                        onChange={(e) => onChange({ ...config, maintenanceMode: e.target.checked })}
                    />
                    Maintenance Mode
                </label>
            </div>
        </div>
    );
}

// ==========================================================================
// MAIN COMPONENT
// ==========================================================================

export function SettingsPanel({ config, onChange, onSave }: SettingsPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('database');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            await onSave();
        } finally {
            setIsSaving(false);
        }
    }, [onSave]);

    const tabs: Array<{ id: TabType; label: string; icon: string }> = [
        { id: 'database', label: 'Database', icon: '💾' },
        { id: 'storage', label: 'Storage', icon: '☁️' },
        { id: 'auth', label: 'Authentication', icon: '🔐' },
        { id: 'general', label: 'General', icon: '⚙️' },
    ];

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>Settings</h1>
                <p style={styles.subtitle}>
                    Configure your Backy CMS instance
                </p>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        style={{
                            ...styles.tab,
                            ...(activeTab === tab.id ? styles.activeTab : {}),
                        }}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'database' && (
                <DatabaseTab
                    config={config.database}
                    onChange={(database) => onChange({ ...config, database })}
                />
            )}
            {activeTab === 'storage' && (
                <StorageTab
                    config={config.storage}
                    onChange={(storage) => onChange({ ...config, storage })}
                />
            )}
            {activeTab === 'auth' && (
                <AuthTab
                    config={config.auth}
                    onChange={(auth) => onChange({ ...config, auth })}
                />
            )}
            {activeTab === 'general' && (
                <GeneralTab
                    config={config.general}
                    onChange={(general) => onChange({ ...config, general })}
                />
            )}

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    style={{
                        ...styles.saveButton,
                        opacity: isSaving ? 0.7 : 1,
                    }}
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? '⏳ Saving...' : '💾 Save Changes'}
                </button>
            </div>
        </div>
    );
}

export default SettingsPanel;
