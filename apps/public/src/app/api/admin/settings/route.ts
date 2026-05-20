/**
 * Admin platform settings endpoint.
 *
 * GET   /api/admin/settings
 * PATCH /api/admin/settings
 * POST  /api/admin/settings with { action: "regenerate-api-keys" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { listAdminSessionPermissionOverrides } from '@/lib/admin-auth/sessionStore';
import { requireAdminAccess, type AdminAccessContext } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { buildUserPermissionMatrix } from '@/lib/adminPermissions';
import {
  getAdminSettings,
  getMediaList,
  getSiteByIdOrSlug,
  listAdminUserPermissionOverrides,
  regenerateAdminApiKeys,
  updateAdminSettings,
  updateMediaItem,
} from '@/lib/backyStore';
import { resolveCommerceWebhookSecret } from '@/lib/commerceWebhookSecrets';
import { getEmailDeliveryConfig } from '@/lib/formEmailDelivery';
import { getMediaStorageAdapter, getMediaStorageConfigSummary, resolveMediaStorageConfig } from '@/lib/mediaStorage';
import { resolveMediaScannerConfig } from '@/lib/mediaSafety';
import {
  getRequiredDatabaseRepositories,
  resolvePublicRepositoryRuntimeConfig,
  shouldUseDemoStoreFallback,
} from '@/lib/repositoryRuntime';
import { createStorageAdapter } from '@backy/storage';
import type { BackyJsonObject, BackyJsonValue, BackySettings, MediaItem, MediaVersion } from '@backy-cms/core';

export const runtime = 'nodejs';

const ADMIN_SETTINGS_SCHEMA = 'backy.admin-settings.v1';
const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const SETTINGS_PROVIDER_CERTIFICATION_GROUPS = [
  {
    family: 'Database and Supabase',
    providers: ['Supabase/Postgres', 'Supabase Auth', 'Supabase Storage'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_DATABASE_URL or DATABASE_URL',
      'BACKY_SUPABASE_URL or SUPABASE_URL',
      'BACKY_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY',
      'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
    ],
    evidence: 'Configured runtime diagnostics plus disposable database/storage/auth provider checks.',
  },
  {
    family: 'Storage and media delivery',
    providers: ['Local storage', 'Supabase Storage', 'S3/R2-compatible storage', 'Media scanner'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
      'BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET',
      'BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID',
      'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
      'BACKY_S3_REGION or AWS_REGION',
      'BACKY_MEDIA_SCAN_PROVIDER',
    ],
    evidence: 'Storage provisioning, read/write/list/stat probes, scanner readiness, and replacement credential rotation checks.',
  },
  {
    family: 'Vercel deployment and secrets',
    providers: ['Vercel project', 'Vercel team', 'Vercel domains', 'Vercel env secret manager'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'VERCEL_TOKEN or BACKY_VERCEL_TOKEN',
      'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
      'VERCEL_TEAM_ID or BACKY_VERCEL_TEAM_ID',
      'VERCEL_API_BASE_URL or BACKY_VERCEL_API_BASE_URL',
    ],
    evidence: 'Project metadata, deployment diagnostics, and non-secret env secret-manager planning evidence.',
  },
  {
    family: 'Notifications',
    providers: ['Webhook', 'Resend', 'SMTP', 'Local outbox'],
    gate: 'npm run ci:settings-provider-certification',
    requiredInputs: [
      'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
      'BACKY_RESEND_API_KEY or RESEND_API_KEY',
      'BACKY_SMTP_HOST or SMTP_HOST',
      'BACKY_SMTP_USER or SMTP_USER',
      'BACKY_SMTP_PASSWORD or SMTP_PASSWORD',
    ],
    evidence: 'Configured provider readiness plus test-notification delivery proof for the selected channel.',
  },
  {
    family: 'Commerce providers',
    providers: ['Stripe', 'TaxJar', 'Avalara', 'EasyPost', 'Shippo', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'Razorpay', 'Shopify', 'BigCommerce', 'WooCommerce', 'Etsy', 'Magento'],
    gate: 'npm run ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
      'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      'provider-specific catalog/payment credentials',
    ],
    evidence: 'Payment, tax, shipping, catalog, subscription, refund, and webhook provider readiness for selected live families.',
  },
] as const;

type SettingsCertificationStorageProvider = 'auto' | 'local' | 's3' | 'supabase';
type SettingsCertificationNotificationProvider = 'auto' | 'webhook' | 'http-endpoint' | 'resend' | 'smtp' | 'local-outbox';

type SettingsCertificationCommandOptions = {
  certifyStorage: boolean;
  storageProvider: SettingsCertificationStorageProvider;
  certifyRotation: boolean;
  certifyVercelSecrets: boolean;
  vercelProjectId: string;
  vercelTeamId: string;
  certifyNotification: boolean;
  notificationProvider: SettingsCertificationNotificationProvider;
  certifyCommerce: boolean;
  externalBaseUrl: string;
};

const SETTINGS_CERTIFICATION_STORAGE_PROVIDER_CHOICES: SettingsCertificationStorageProvider[] = ['auto', 'local', 's3', 'supabase'];
const SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_CHOICES: SettingsCertificationNotificationProvider[] = ['auto', 'webhook', 'http-endpoint', 'resend', 'smtp', 'local-outbox'];

const DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS = {
  certifyStorage: true,
  storageProvider: 'auto',
  certifyRotation: false,
  certifyVercelSecrets: false,
  vercelProjectId: '',
  vercelTeamId: '',
  certifyNotification: true,
  notificationProvider: 'auto',
  certifyCommerce: true,
  externalBaseUrl: '',
} satisfies SettingsCertificationCommandOptions;

const quoteShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const boolEnv = (value: boolean): '1' | '0' => (value ? '1' : '0');
const hasSettingsCertificationGroup = (options: SettingsCertificationCommandOptions) => (
  options.certifyStorage ||
  options.certifyRotation ||
  options.certifyVercelSecrets ||
  options.certifyNotification
);

const buildSettingsProviderCertificationCommand = (options: SettingsCertificationCommandOptions): string => {
  const settingsSelected = hasSettingsCertificationGroup(options);
  const externalBaseUrl = options.externalBaseUrl.trim().replace(/\/$/, '');
  const envEntries: Array<[string, string]> = [
    ['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1'],
    ['BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED', boolEnv(settingsSelected)],
    ['BACKY_SETTINGS_CERTIFY_STORAGE', boolEnv(options.certifyStorage)],
    ['BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER', options.storageProvider],
    ['BACKY_SETTINGS_CERTIFY_ROTATION', boolEnv(options.certifyRotation)],
    ['BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS', boolEnv(options.certifyVercelSecrets)],
    ['BACKY_SETTINGS_CERTIFY_NOTIFICATION', boolEnv(options.certifyNotification)],
    ['BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER', options.notificationProvider],
    ['BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', boolEnv(options.certifyCommerce)],
  ];

  if (externalBaseUrl) {
    envEntries.push(
      ['BACKY_SETTINGS_CERTIFICATION_BASE_URL', externalBaseUrl],
      ['BACKY_COMMERCE_CERTIFICATION_BASE_URL', externalBaseUrl],
      ['BACKY_ADMIN_API_KEY', '<admin-api-key>'],
    );
  }

  if (options.certifyVercelSecrets && options.vercelProjectId.trim()) {
    envEntries.push(['BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID', options.vercelProjectId.trim()]);
  }

  if (options.certifyVercelSecrets && options.vercelTeamId.trim()) {
    envEntries.push(['BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID', options.vercelTeamId.trim()]);
  }

  const commands = [
    settingsSelected ? 'npm run ci:settings-provider-certification' : '',
    options.certifyCommerce ? 'npm run ci:commerce-provider-certification' : '',
  ].filter(Boolean);

  return [
    ...envEntries.map(([key, value]) => `export ${key}=${quoteShellValue(value)}`),
    '',
    ...(commands.length ? commands : ['# Select at least one provider family before running certification.']),
  ].join('\n');
};

const buildSettingsProviderCertificationRequiredAliases = (options: SettingsCertificationCommandOptions): string[] => Array.from(new Set([
  'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
  hasSettingsCertificationGroup(options) ? 'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
  options.certifyCommerce ? 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
  options.certifyStorage || options.certifyRotation ? 'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER' : '',
  options.certifyStorage || options.certifyRotation ? 'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY' : '',
  options.certifyStorage || options.certifyRotation ? 'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY' : '',
  options.certifyRotation ? 'BACKY_*_NEXT_* replacement storage env' : '',
  options.certifyVercelSecrets ? 'VERCEL_TOKEN or BACKY_VERCEL_TOKEN' : '',
  options.certifyVercelSecrets ? 'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID' : '',
  options.certifyNotification ? 'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL' : '',
  options.certifyNotification ? 'BACKY_RESEND_API_KEY or RESEND_API_KEY' : '',
  options.certifyNotification ? 'BACKY_SMTP_HOST or SMTP_HOST' : '',
  options.certifyNotification ? 'BACKY_SMTP_USER or SMTP_USER' : '',
  options.certifyNotification ? 'BACKY_SMTP_PASSWORD or SMTP_PASSWORD' : '',
  options.certifyCommerce ? 'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY' : '',
  options.certifyCommerce ? 'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY' : '',
  options.certifyCommerce ? 'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY' : '',
  options.certifyCommerce ? 'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY' : '',
  options.certifyCommerce ? 'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET' : '',
].filter(Boolean)));

const SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildSettingsProviderCertificationCommand(DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS),
  storageProviderChoices: SETTINGS_CERTIFICATION_STORAGE_PROVIDER_CHOICES,
  notificationProviderChoices: SETTINGS_CERTIFICATION_NOTIFICATION_PROVIDER_CHOICES,
  requiredInputAliases: buildSettingsProviderCertificationRequiredAliases(DEFAULT_SETTINGS_CERTIFICATION_COMMAND_OPTIONS),
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const missingInputsFromRuntime = (summary: unknown): string[] => {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return [];
  }

  const missing = (summary as { missing?: unknown }).missing;
  return Array.isArray(missing)
    ? missing.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
};

const buildProviderCertificationRuntimeEvidence = ({
  database,
  storage,
  supabase,
  vercel,
  mediaScanner,
  notifications,
  commerce,
  interactiveComponents,
  publicApi,
}: {
  database: unknown;
  storage: unknown;
  supabase: unknown;
  vercel: unknown;
  mediaScanner: unknown;
  notifications: unknown;
  commerce: unknown;
  interactiveComponents: unknown;
  publicApi: unknown;
}) => {
  const missingInputAliases = uniqueStrings([
    ...missingInputsFromRuntime(database),
    ...missingInputsFromRuntime(storage),
    ...missingInputsFromRuntime(supabase),
    ...missingInputsFromRuntime(vercel),
    ...missingInputsFromRuntime(mediaScanner),
    ...missingInputsFromRuntime(notifications),
    ...missingInputsFromRuntime(commerce),
    ...missingInputsFromRuntime(interactiveComponents),
    ...missingInputsFromRuntime(publicApi),
  ]);

  return {
    database,
    storage,
    supabase,
    vercel,
    mediaScanner,
    notifications,
    commerce,
    interactiveComponents,
    publicApi,
    missingInputAliases,
    localRuntimeInputsConfigured: missingInputAliases.length === 0,
    liveProviderGateRequired: true,
    secretHandling: 'Provider secret values are never returned; runtime evidence reports booleans, aliases, provider families, and non-secret URLs only.',
  };
};

const providerCertificationContract = (runtimeEvidence: ReturnType<typeof buildProviderCertificationRuntimeEvidence>) => ({
  generatedAt: new Date().toISOString(),
  schemaVersion: 'backy.settings-provider-certification-handoff.v1',
  status: 'external-live-provider-gate',
  settingsGate: 'npm run ci:settings-provider-certification',
  commerceGate: 'npm run ci:commerce-provider-certification',
  localPreflight: 'npm run test:settings-provider-certification-preflight-contract',
  releasePreflight: 'npm run test:release-certification-preflight-contract',
  secretHandling: 'Provider credentials stay in deployment or CI environment variables; admin settings responses only expose non-secret provider families, gate names, and readiness evidence.',
  runtimeEvidence,
  operatorCommandTemplate: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
  groups: SETTINGS_PROVIDER_CERTIFICATION_GROUPS.map((group) => ({
    family: group.family,
    providers: [...group.providers],
    gate: group.gate,
    requiredInputs: [...group.requiredInputs],
    evidence: group.evidence,
  })),
});

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeDeliveryMode = (value: unknown): 'managed-hosting' | 'custom-frontend' | null => (
  value === 'managed-hosting' || value === 'custom-frontend' ? value : null
);

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const boolValue = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const stringValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const SIMPLE_DOMAIN_REGEX = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
const SUPABASE_PROJECT_REF_REGEX = /^[a-z0-9-]{6,63}$/;
const SECRET_ENV_REFERENCE_REGEX = /^(env:|\$)?[A-Z_][A-Z0-9_]*$/;
const SECRET_LIKE_VALUE_REGEXES = [
  /^(AKIA|ASIA)[A-Z0-9]{16}$/i,
  /^whsec_/i,
  /^stripe_whsec/i,
  /^sk_(live|test)_/i,
  /^rk_(live|test)_/i,
  /^gh[pousr]_/i,
  /^xox[baprs]-/i,
  /^-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/,
];

const isSecretReference = (value: string): boolean => (
  SECRET_ENV_REFERENCE_REGEX.test(value.trim())
);

const looksLikeRawSecret = (value: string): boolean => {
  const trimmed = value.trim();
  return SECRET_LIKE_VALUE_REGEXES.some((pattern) => pattern.test(trimmed));
};

const secretReferenceEnvKey = (reference: string): string => (
  reference.trim().replace(/^env:/i, '').replace(/^\$/, '')
);

const secretReferenceResolved = (reference: string): boolean => {
  const key = secretReferenceEnvKey(reference);
  return Boolean(key && process.env[key]?.trim());
};

const numberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const inferSupabaseProjectRef = (url: string): string => {
  try {
    const host = new URL(url).host;
    return host.endsWith('.supabase.co') ? host.replace('.supabase.co', '') : '';
  } catch {
    return '';
  }
};

const normalizeCorsOrigin = (origin: string) => {
  const trimmed = origin.trim();
  if (!trimmed || trimmed === '*') {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const getPublicApiRuntimeSummary = () => {
  const rawAllowedOrigins = envValue(['BACKY_CORS_ALLOWED_ORIGINS']);
  const allowedOrigins = rawAllowedOrigins
    .split(',')
    .map(normalizeCorsOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return {
    corsAllowedOriginsConfigured: allowedOrigins.length > 0,
    corsAllowedOriginCount: allowedOrigins.length,
    allowedOrigins,
    exactOriginPolicy: true,
    wildcardAllowed: false,
    exposedContractHeaders: [
      'ETag',
      'x-backy-request-id',
      'x-backy-contract-version',
      'x-backy-schema-version',
      'x-backy-supported-schema-versions',
      'x-backy-cache-scope',
      'x-backy-cache-revision',
      'x-backy-site-id',
    ],
    missing: allowedOrigins.length > 0 ? [] : ['BACKY_CORS_ALLOWED_ORIGINS'],
  };
};

const getDatabaseRuntimeSummary = () => {
  if (shouldUseDemoStoreFallback()) {
    return {
      mode: 'demo',
      provider: 'local-json',
      configured: true,
      missing: [] as string[],
      note: 'Backy is using local JSON persistence in this environment.',
    };
  }

  try {
    const config = resolvePublicRepositoryRuntimeConfig();
    const database = config.database;
    const url = database?.url;
    const host = url ? new URL(url).host : undefined;

    return {
      mode: config.mode,
      provider: database?.type || 'unknown',
      configured: config.mode === 'database' && Boolean(database?.path || database?.url),
      host,
      database: database?.name,
      path: database?.type === 'sqlite' ? database.path : undefined,
      logging: Boolean(database?.logging),
      missing: config.mode === 'database' && !database?.path && !database?.url
        ? ['BACKY_DATABASE_URL or DATABASE_URL']
        : [] as string[],
    };
  } catch (error) {
    return {
      mode: 'database',
      provider: 'unknown',
      configured: false,
      missing: ['BACKY_DATABASE_TYPE', 'BACKY_DATABASE_URL or DATABASE_URL'],
      error: error instanceof Error ? error.message : 'Unable to resolve database runtime.',
    };
  }
};

const getSupabaseRuntimeSummary = () => {
  const url = envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const anonKey = envValue(['BACKY_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const serviceKey = envValue(['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const bucket = envValue(['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET']);
  const databaseUrl = envValue(['BACKY_DATABASE_URL', 'DATABASE_URL']);
  const missing = [
    !url ? 'BACKY_SUPABASE_URL or SUPABASE_URL' : '',
    !anonKey && !serviceKey ? 'Supabase API key' : '',
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    projectUrl: url,
    projectRef: inferSupabaseProjectRef(url),
    anonKeyConfigured: Boolean(anonKey),
    serviceRoleConfigured: Boolean(serviceKey),
    databaseUrlConfigured: Boolean(databaseUrl),
    storageBucket: bucket,
    missing,
  };
};

const getVercelRuntimeSummary = () => {
  const projectId = envValue(['VERCEL_PROJECT_ID', 'BACKY_VERCEL_PROJECT_ID']);
  const teamId = envValue(['VERCEL_TEAM_ID', 'BACKY_VERCEL_TEAM_ID']);
  const url = envValue(['VERCEL_URL', 'BACKY_PUBLIC_APP_URL']);
  const env = envValue(['VERCEL_ENV']);
  const token = envValue(['VERCEL_TOKEN', 'BACKY_VERCEL_TOKEN']);
  const onVercel = process.env.VERCEL === '1' || Boolean(url);

  return {
    configured: onVercel || Boolean(projectId),
    onVercel,
    projectId,
    teamId,
    url,
    environment: env,
    tokenConfigured: Boolean(token),
    missing: onVercel || projectId ? [] : ['VERCEL_PROJECT_ID or VERCEL runtime'],
  };
};

const getMediaScannerRuntimeSummary = () => {
  try {
    const config = resolveMediaScannerConfig();
    const endpointConfigured = Boolean(config.endpoint);
    const missing = config.provider === 'http' && !endpointConfigured
      ? ['BACKY_MEDIA_SCAN_ENDPOINT or BACKY_MEDIA_SCANNER_ENDPOINT']
      : [];

    return {
      provider: config.provider,
      enabled: config.provider !== 'none',
      configured: config.provider === 'none' || missing.length === 0,
      endpointConfigured,
      host: config.host,
      port: config.port,
      apiKeyConfigured: Boolean(config.apiKey),
      timeoutMs: config.timeoutMs,
      failOpen: config.failOpen,
      missing,
    };
  } catch (error) {
    const provider = envValue(['BACKY_MEDIA_SCAN_PROVIDER', 'BACKY_MEDIA_SCANNER_PROVIDER']) || 'unknown';
    return {
      provider,
      enabled: provider !== 'none' && provider !== 'off' && provider !== 'disabled',
      configured: false,
      endpointConfigured: Boolean(envValue(['BACKY_MEDIA_SCAN_ENDPOINT', 'BACKY_MEDIA_SCANNER_ENDPOINT'])),
      host: envValue(['BACKY_MEDIA_SCAN_HOST', 'BACKY_MEDIA_SCANNER_HOST', 'BACKY_CLAMAV_HOST', 'CLAMD_HOST']),
      port: numberValue(envValue(['BACKY_MEDIA_SCAN_PORT', 'BACKY_MEDIA_SCANNER_PORT', 'BACKY_CLAMAV_PORT', 'CLAMD_PORT']), 3310),
      apiKeyConfigured: Boolean(envValue(['BACKY_MEDIA_SCAN_API_KEY', 'BACKY_MEDIA_SCANNER_API_KEY'])),
      timeoutMs: numberValue(envValue(['BACKY_MEDIA_SCAN_TIMEOUT_MS', 'BACKY_MEDIA_SCANNER_TIMEOUT_MS']), 5000),
      failOpen: ['1', 'true', 'yes', 'on'].includes(envValue(['BACKY_MEDIA_SCAN_FAIL_OPEN', 'BACKY_MEDIA_SCANNER_FAIL_OPEN']).toLowerCase()),
      missing: ['BACKY_MEDIA_SCAN_PROVIDER=http or none'],
      error: error instanceof Error ? error.message : 'Unable to resolve media scanner runtime.',
    };
  }
};

const getNotificationRuntimeSummary = () => {
  try {
    const config = getEmailDeliveryConfig();
    const provider = config.provider;
    const missing = [
      provider === 'http-endpoint' && !config.endpoint ? 'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL' : '',
      provider === 'resend' && !config.apiKey ? 'BACKY_RESEND_API_KEY or RESEND_API_KEY' : '',
      provider === 'smtp' && !config.smtp?.host ? 'BACKY_SMTP_HOST or SMTP_HOST' : '',
      provider === 'smtp' && config.smtp?.user && !config.smtp?.password ? 'BACKY_SMTP_PASSWORD or SMTP_PASSWORD' : '',
    ].filter(Boolean);

    return {
      emailProvider: provider,
      configured: missing.length === 0,
      productionReady: provider !== 'local-outbox' && missing.length === 0,
      from: config.from,
      endpointConfigured: Boolean(config.endpoint),
      apiKeyConfigured: Boolean(config.apiKey),
      smtpHostConfigured: Boolean(config.smtp?.host),
      smtpAuthConfigured: Boolean(config.smtp?.user && config.smtp?.password),
      missing,
    };
  } catch (error) {
    return {
      emailProvider: 'unknown',
      configured: false,
      productionReady: false,
      from: envValue(['BACKY_EMAIL_FROM', 'BACKY_NOTIFICATION_EMAIL_FROM', 'BACKY_SMTP_FROM', 'BACKY_RESEND_FROM']),
      endpointConfigured: Boolean(envValue(['BACKY_EMAIL_DELIVERY_ENDPOINT', 'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'])),
      apiKeyConfigured: Boolean(envValue(['BACKY_RESEND_API_KEY', 'RESEND_API_KEY'])),
      smtpHostConfigured: Boolean(envValue(['BACKY_SMTP_HOST', 'SMTP_HOST'])),
      smtpAuthConfigured: Boolean(envValue(['BACKY_SMTP_USER', 'SMTP_USER']) && envValue(['BACKY_SMTP_PASSWORD', 'SMTP_PASSWORD'])),
      missing: ['BACKY_EMAIL_PROVIDER configuration'],
      error: error instanceof Error ? error.message : 'Unable to resolve notification email runtime.',
    };
  }
};

const getCommerceRuntimeSummary = (settings: unknown) => {
  const resolution = resolveCommerceWebhookSecret(settings);
  const integrations = parseJsonObject(settings) || {};
  const commerce = parseJsonObject(parseJsonObject(integrations.integrations)?.commerce) || {};
  const paymentProviderValue = stringValue(commerce.paymentProvider);
  const paymentProvider = ['stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'].includes(paymentProviderValue)
    ? paymentProviderValue
    : 'none';
  const taxProviderValue = stringValue(commerce.taxProvider);
  const taxProvider = ['http', 'stripe', 'taxjar', 'avalara'].includes(taxProviderValue) ? taxProviderValue : 'manual';
  const shippingLabelProvider = ['easypost', 'shippo'].includes(stringValue(commerce.shippingLabelProvider))
    ? stringValue(commerce.shippingLabelProvider)
    : 'manual';
  const shippingProviderValue = stringValue(commerce.shippingProvider);
  const shippingProvider = ['http', 'easypost', 'shippo'].includes(shippingProviderValue) ? shippingProviderValue : 'manual';
  const discountProviderValue = stringValue(commerce.discountProvider);
  const discountProvider = ['http', 'stripe'].includes(discountProviderValue) ? discountProviderValue : 'manual';
  const stripeSecretKey = envValue(['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']);
  const stripeApiBaseUrl = envValue(['BACKY_STRIPE_API_BASE_URL', 'STRIPE_API_BASE_URL']);
  const stripeApiVersion = envValue(['BACKY_STRIPE_API_VERSION', 'STRIPE_API_VERSION']);
  const stripeTaxApiBaseUrl = envValue(['BACKY_STRIPE_TAX_API_BASE_URL']);
  const stripeDiscountApiBaseUrl = envValue(['BACKY_STRIPE_DISCOUNT_API_BASE_URL']);
  const stripeRefundApiBaseUrl = envValue(['BACKY_STRIPE_REFUND_API_BASE_URL']);
  const taxJarApiKey = envValue(['BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY']);
  const taxJarApiBaseUrl = envValue(['BACKY_TAXJAR_API_BASE_URL', 'TAXJAR_API_BASE_URL']);
  const avalaraAccountId = envValue(['BACKY_AVALARA_ACCOUNT_ID', 'AVALARA_ACCOUNT_ID']);
  const avalaraLicenseKey = envValue(['BACKY_AVALARA_LICENSE_KEY', 'AVALARA_LICENSE_KEY']);
  const avalaraCompanyCode = envValue(['BACKY_AVALARA_COMPANY_CODE', 'AVALARA_COMPANY_CODE']);
  const avalaraApiBaseUrl = envValue(['BACKY_AVALARA_API_BASE_URL', 'AVALARA_API_BASE_URL']);
  const paypalAccessToken = envValue(['BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN']);
  const paypalApiBaseUrl = envValue(['BACKY_PAYPAL_API_BASE_URL', 'PAYPAL_API_BASE_URL']);
  const paddleApiKey = envValue(['BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY']);
  const paddleApiBaseUrl = envValue(['BACKY_PADDLE_API_BASE_URL', 'PADDLE_API_BASE_URL']);
  const squareAccessToken = envValue(['BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN']);
  const squareApiBaseUrl = envValue(['BACKY_SQUARE_API_BASE_URL', 'SQUARE_API_BASE_URL']);
  const squareVersion = envValue(['BACKY_SQUARE_VERSION', 'SQUARE_VERSION']);
  const adyenApiKey = envValue(['BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY']);
  const adyenMerchantAccount = envValue(['BACKY_ADYEN_MERCHANT_ACCOUNT', 'ADYEN_MERCHANT_ACCOUNT']);
  const adyenApiBaseUrl = envValue(['BACKY_ADYEN_API_BASE_URL', 'ADYEN_API_BASE_URL']);
  const adyenRecurringApiBaseUrl = envValue(['BACKY_ADYEN_RECURRING_API_BASE_URL', 'ADYEN_RECURRING_API_BASE_URL']);
  const mollieApiKey = envValue(['BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY']);
  const mollieApiBaseUrl = envValue(['BACKY_MOLLIE_API_BASE_URL', 'MOLLIE_API_BASE_URL']);
  const razorpayKeyId = envValue(['BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID']);
  const razorpayKeySecret = envValue(['BACKY_RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_SECRET']);
  const razorpayApiBaseUrl = envValue(['BACKY_RAZORPAY_API_BASE_URL', 'RAZORPAY_API_BASE_URL']);
  const easyPostApiKey = envValue(['BACKY_EASYPOST_API_KEY', 'EASYPOST_API_KEY']);
  const easyPostApiBaseUrl = envValue(['BACKY_EASYPOST_API_BASE_URL', 'EASYPOST_API_BASE_URL']);
  const shippoApiKey = envValue(['BACKY_SHIPPO_API_KEY', 'SHIPPO_API_KEY']);
  const shippoApiBaseUrl = envValue(['BACKY_SHIPPO_API_BASE_URL', 'SHIPPO_API_BASE_URL']);
  const shopifyAdminAccessToken = envValue(['BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']);
  const shopifyStoreDomain = envValue(['BACKY_SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STORE_DOMAIN']);
  const shopifyAdminApiBaseUrl = envValue(['BACKY_SHOPIFY_ADMIN_API_BASE_URL', 'SHOPIFY_ADMIN_API_BASE_URL']);
  const bigCommerceAccessToken = envValue(['BACKY_BIGCOMMERCE_ACCESS_TOKEN', 'BIGCOMMERCE_ACCESS_TOKEN']);
  const bigCommerceStoreHash = envValue(['BACKY_BIGCOMMERCE_STORE_HASH', 'BIGCOMMERCE_STORE_HASH']);
  const bigCommerceApiBaseUrl = envValue(['BACKY_BIGCOMMERCE_API_BASE_URL', 'BIGCOMMERCE_API_BASE_URL']);
  const wooCommerceConsumerKey = envValue(['BACKY_WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_KEY']);
  const wooCommerceConsumerSecret = envValue(['BACKY_WOOCOMMERCE_CONSUMER_SECRET', 'WOOCOMMERCE_CONSUMER_SECRET']);
  const wooCommerceStoreUrl = envValue(['BACKY_WOOCOMMERCE_STORE_URL', 'WOOCOMMERCE_STORE_URL']);
  const wooCommerceApiBaseUrl = envValue(['BACKY_WOOCOMMERCE_API_BASE_URL', 'WOOCOMMERCE_API_BASE_URL']);
  const etsyAccessToken = envValue(['BACKY_ETSY_ACCESS_TOKEN', 'ETSY_ACCESS_TOKEN']);
  const etsyApiKey = envValue(['BACKY_ETSY_API_KEY', 'ETSY_API_KEY']);
  const etsyShopId = envValue(['BACKY_ETSY_SHOP_ID', 'ETSY_SHOP_ID']);
  const etsyApiBaseUrl = envValue(['BACKY_ETSY_API_BASE_URL', 'ETSY_API_BASE_URL']);
  const magentoAccessToken = envValue(['BACKY_MAGENTO_ACCESS_TOKEN', 'MAGENTO_ACCESS_TOKEN']);
  const magentoStoreUrl = envValue(['BACKY_MAGENTO_STORE_URL', 'MAGENTO_STORE_URL']);
  const magentoApiBaseUrl = envValue(['BACKY_MAGENTO_API_BASE_URL', 'MAGENTO_API_BASE_URL']);
  const stripeRequired = paymentProvider === 'stripe' || taxProvider === 'stripe' || discountProvider === 'stripe';
  const missing = [
    resolution.reference && !resolution.secret
      ? `${resolution.envKeys.join(' or ') || 'commerce webhook secret env'}`
      : '',
    stripeRequired && !stripeSecretKey
      ? 'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'
      : '',
    taxProvider === 'taxjar' && !taxJarApiKey
      ? 'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY'
      : '',
    taxProvider === 'avalara' && (!avalaraAccountId || !avalaraLicenseKey || !avalaraCompanyCode)
      ? 'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID, BACKY_AVALARA_LICENSE_KEY/AVALARA_LICENSE_KEY, and BACKY_AVALARA_COMPANY_CODE/AVALARA_COMPANY_CODE'
      : '',
    (shippingLabelProvider === 'easypost' || shippingProvider === 'easypost') && !easyPostApiKey
      ? 'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY'
      : '',
    (shippingLabelProvider === 'shippo' || shippingProvider === 'shippo') && !shippoApiKey
      ? 'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY'
      : '',
  ].filter(Boolean);

  return {
    webhookSecretReference: resolution.reference,
    webhookSecretConfigured: Boolean(resolution.secret),
    webhookSecretSource: resolution.source,
    webhookSecretEnvKeys: resolution.envKeys,
    stripeSecretConfigured: Boolean(stripeSecretKey),
    stripeApiBaseUrl: stripeApiBaseUrl || 'https://api.stripe.com',
    stripeApiVersion: stripeApiVersion || undefined,
    stripeTaxApiBaseUrl: stripeTaxApiBaseUrl || stripeApiBaseUrl || 'https://api.stripe.com',
    stripeDiscountApiBaseUrl: stripeDiscountApiBaseUrl || stripeApiBaseUrl || 'https://api.stripe.com',
    stripeRefundApiBaseUrl: stripeRefundApiBaseUrl || stripeApiBaseUrl || 'https://api.stripe.com',
    taxJarApiKeyConfigured: Boolean(taxJarApiKey),
    taxJarApiBaseUrl: taxJarApiBaseUrl || 'https://api.taxjar.com/v2',
    avalaraAccountConfigured: Boolean(avalaraAccountId),
    avalaraLicenseKeyConfigured: Boolean(avalaraLicenseKey),
    avalaraCompanyCodeConfigured: Boolean(avalaraCompanyCode),
    avalaraApiBaseUrl: avalaraApiBaseUrl || 'https://sandbox-rest.avatax.com',
    paypalAccessTokenConfigured: Boolean(paypalAccessToken),
    paypalApiBaseUrl: paypalApiBaseUrl || 'https://api-m.paypal.com',
    paddleApiKeyConfigured: Boolean(paddleApiKey),
    paddleApiBaseUrl: paddleApiBaseUrl || 'https://api.paddle.com',
    squareAccessTokenConfigured: Boolean(squareAccessToken),
    squareApiBaseUrl: squareApiBaseUrl || 'https://connect.squareup.com',
    squareVersion: squareVersion || '2026-01-22',
    adyenApiKeyConfigured: Boolean(adyenApiKey),
    adyenMerchantAccountConfigured: Boolean(adyenMerchantAccount),
    adyenApiBaseUrl: adyenApiBaseUrl || 'https://checkout-test.adyen.com/v71',
    adyenRecurringApiBaseUrl: adyenRecurringApiBaseUrl || 'https://pal-test.adyen.com/pal/servlet/Recurring/v68',
    mollieApiKeyConfigured: Boolean(mollieApiKey),
    mollieApiBaseUrl: mollieApiBaseUrl || 'https://api.mollie.com/v2',
    razorpayKeyIdConfigured: Boolean(razorpayKeyId),
    razorpayKeySecretConfigured: Boolean(razorpayKeySecret),
    razorpayApiBaseUrl: razorpayApiBaseUrl || 'https://api.razorpay.com',
    paymentProvider,
    taxProvider,
    shippingProvider,
    discountProvider,
    easyPostApiKeyConfigured: Boolean(easyPostApiKey),
    easyPostApiBaseUrl: easyPostApiBaseUrl || 'https://api.easypost.com/v2',
    shippoApiKeyConfigured: Boolean(shippoApiKey),
    shippoApiBaseUrl: shippoApiBaseUrl || 'https://api.goshippo.com',
    shippingLabelProvider,
    shopifyAdminAccessTokenConfigured: Boolean(shopifyAdminAccessToken),
    shopifyStoreConfigured: Boolean(shopifyStoreDomain || shopifyAdminApiBaseUrl),
    shopifyStoreDomain,
    shopifyAdminApiBaseUrl,
    bigCommerceAccessTokenConfigured: Boolean(bigCommerceAccessToken),
    bigCommerceStoreConfigured: Boolean(bigCommerceStoreHash || bigCommerceApiBaseUrl),
    bigCommerceStoreHash,
    bigCommerceApiBaseUrl,
    wooCommerceConsumerKeyConfigured: Boolean(wooCommerceConsumerKey),
    wooCommerceConsumerSecretConfigured: Boolean(wooCommerceConsumerSecret),
    wooCommerceStoreConfigured: Boolean(wooCommerceStoreUrl || wooCommerceApiBaseUrl),
    wooCommerceStoreUrl,
    wooCommerceApiBaseUrl,
    etsyAccessTokenConfigured: Boolean(etsyAccessToken),
    etsyApiKeyConfigured: Boolean(etsyApiKey),
    etsyShopConfigured: Boolean(etsyShopId),
    etsyShopId,
    etsyApiBaseUrl: etsyApiBaseUrl || 'https://api.etsy.com/v3/application',
    magentoAccessTokenConfigured: Boolean(magentoAccessToken),
    magentoStoreConfigured: Boolean(magentoStoreUrl || magentoApiBaseUrl),
    magentoStoreUrl,
    magentoApiBaseUrl,
    missing,
  };
};

const getInteractiveComponentRuntimeSummary = () => {
  const registryProvider = envValue(['BACKY_COMPONENT_REGISTRY_PROVIDER', 'BACKY_INTERACTIVE_COMPONENT_REGISTRY_PROVIDER']) || 'local';
  const registryUrl = envValue(['BACKY_COMPONENT_REGISTRY_URL', 'BACKY_INTERACTIVE_COMPONENT_REGISTRY_URL']);
  const bundleBaseUrl = envValue(['BACKY_COMPONENT_BUNDLE_BASE_URL', 'BACKY_INTERACTIVE_COMPONENT_BUNDLE_BASE_URL']);
  const sandboxOrigin = envValue(['BACKY_COMPONENT_SANDBOX_ORIGIN', 'BACKY_INTERACTIVE_SANDBOX_ORIGIN']);
  const cspPolicy = envValue(['BACKY_COMPONENT_SANDBOX_CSP', 'BACKY_INTERACTIVE_SANDBOX_CSP']);
  const signingKey = envValue(['BACKY_COMPONENT_REGISTRY_SIGNING_KEY', 'BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY']);
  const reviewRequired = !['0', 'false', 'no', 'off'].includes(
    (envValue(['BACKY_COMPONENT_REGISTRY_REVIEW_REQUIRED', 'BACKY_INTERACTIVE_REVIEW_REQUIRED']) || 'true').toLowerCase(),
  );
  const customCodeEnabled = ['1', 'true', 'yes', 'on'].includes(
    envValue(['BACKY_CUSTOM_CODE_COMPONENTS_ENABLED', 'BACKY_INTERACTIVE_CUSTOM_CODE_ENABLED']).toLowerCase(),
  );
  const iframeSandbox = envValue(['BACKY_COMPONENT_IFRAME_SANDBOX', 'BACKY_INTERACTIVE_IFRAME_SANDBOX'])
    || 'allow-scripts allow-forms';
  const allowedConnectSrc = envValue(['BACKY_COMPONENT_ALLOWED_CONNECT_SRC', 'BACKY_INTERACTIVE_ALLOWED_CONNECT_SRC']);
  const missing = [
    registryProvider !== 'local' && !registryUrl ? 'BACKY_COMPONENT_REGISTRY_URL' : '',
    customCodeEnabled && !sandboxOrigin ? 'BACKY_COMPONENT_SANDBOX_ORIGIN' : '',
    customCodeEnabled && !cspPolicy ? 'BACKY_COMPONENT_SANDBOX_CSP' : '',
    customCodeEnabled && !signingKey ? 'BACKY_COMPONENT_REGISTRY_SIGNING_KEY' : '',
  ].filter(Boolean);

  return {
    registryProvider,
    registryConfigured: registryProvider === 'local' || Boolean(registryUrl),
    registryUrl: registryUrl || undefined,
    bundleBaseUrl: bundleBaseUrl || undefined,
    signingKeyConfigured: Boolean(signingKey),
    reviewRequired,
    customCodeEnabled,
    sandboxOrigin: sandboxOrigin || undefined,
    cspConfigured: Boolean(cspPolicy),
    iframeSandbox,
    allowedConnectSrc: allowedConnectSrc || undefined,
    configured: missing.length === 0,
    missing,
  };
};

const canExposeAdminApiKey = (access: AdminAccessContext) => {
  if (access.type !== 'session' || !access.session) return false;

  const sessionOverrides = listAdminSessionPermissionOverrides(access.session.token, access.session.user.id);
  const overrides = sessionOverrides !== null
    ? sessionOverrides
    : listAdminUserPermissionOverrides(access.session.user.id);
  const matrix = buildUserPermissionMatrix(access.session.user, overrides);
  return Boolean(matrix.groups
    .flatMap((group) => group.permissions)
    .find((permission) => permission.key === 'settings.manageKeys')?.allowed);
};

type AdminSettingsSource = BackySettings | ReturnType<typeof getAdminSettings>;

const settingsApiKeys = (settings: AdminSettingsSource) => {
  const apiKeys = settings.apiKeys as {
    publicKey?: string;
    publicApiKey?: string;
    secretKeyId?: string;
    adminApiKey?: string;
  };

  return {
    publicApiKey: apiKeys.publicKey || apiKeys.publicApiKey || '',
    adminApiKey: apiKeys.secretKeyId || apiKeys.adminApiKey || '',
  };
};

const keyFingerprint = (value: string | undefined): string | null => (
  value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null
);

const keyHash = (value: string): string => createHash('sha256').update(value).digest('hex');

const createAdminServiceApiKey = (): string => (
  `sk_srv_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 16)}`
);

const normalizeServiceKeyGrants = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => {
        const revokedAt = stringValue(entry.revokedAt) || null;
        return {
          id: stringValue(entry.id) || `key_service_${randomUUID().slice(0, 8)}`,
          label: stringValue(entry.label) || 'Server API key',
          keyPrefix: stringValue(entry.keyPrefix) || 'sk_srv_',
          keyFingerprint: stringValue(entry.keyFingerprint) || null,
          keyHash: stringValue(entry.keyHash) || null,
          permissionScope: stringValue(entry.permissionScope) || 'non-owner-admin',
          createdAt: stringValue(entry.createdAt) || new Date().toISOString(),
          createdBy: stringValue(entry.createdBy) || null,
          requestId: stringValue(entry.requestId) || null,
          lastUsedAt: stringValue(entry.lastUsedAt) || null,
          revokedAt,
          revokedBy: stringValue(entry.revokedBy) || null,
          revokedRequestId: stringValue(entry.revokedRequestId) || null,
          status: revokedAt || entry.status === 'revoked' ? 'revoked' : 'active',
        };
      })
      .slice(0, 50)
    : []
);

const sanitizeServiceKeyGrant = (entry: BackyJsonObject): BackyJsonObject => {
  const {
    keyHash: _keyHash,
    ...safeEntry
  } = entry;
  return safeEntry;
};

const sanitizeAuthForResponse = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }

  const {
    passwordResetTokens: _passwordResetTokens,
    inviteTokens: _inviteTokens,
    ...auth
  } = input;

  if (!auth) {
    return undefined;
  }

  return {
    ...auth,
    apiKeyServiceKeys: normalizeServiceKeyGrants(auth.apiKeyServiceKeys).map(sanitizeServiceKeyGrant),
  };
};

const normalizeRotationHistory = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => ({
        id: stringValue(entry.id) || `key_rotation_${randomUUID().slice(0, 8)}`,
        scope: entry.scope === 'public' || entry.scope === 'admin' ? entry.scope : 'all',
        rotatedAt: stringValue(entry.rotatedAt) || new Date().toISOString(),
        actorId: stringValue(entry.actorId) || null,
        requestId: stringValue(entry.requestId) || null,
        publicKeyChanged: entry.publicKeyChanged === true,
        adminKeyChanged: entry.adminKeyChanged === true,
        previousPublicKeyFingerprint: stringValue(entry.previousPublicKeyFingerprint) || null,
        newPublicKeyFingerprint: stringValue(entry.newPublicKeyFingerprint) || null,
        previousAdminKeyFingerprint: stringValue(entry.previousAdminKeyFingerprint) || null,
        newAdminKeyFingerprint: stringValue(entry.newAdminKeyFingerprint) || null,
      }))
      .slice(0, 20)
    : []
);

const appendRotationHistory = (
  auth: BackyJsonObject | undefined,
  entry: BackyJsonObject,
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRotationHistory: [
    entry,
    ...normalizeRotationHistory(auth?.apiKeyRotationHistory),
  ].slice(0, 20),
});

const normalizeRevocationHistory = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => ({
        id: stringValue(entry.id) || `key_revocation_${randomUUID().slice(0, 8)}`,
        scope: entry.scope === 'public' || entry.scope === 'admin' ? entry.scope : 'all',
        keyType: entry.keyType === 'admin' ? 'admin' : 'public',
        revokedAt: stringValue(entry.revokedAt) || new Date().toISOString(),
        actorId: stringValue(entry.actorId) || null,
        requestId: stringValue(entry.requestId) || null,
        reason: entry.reason === 'manual' || entry.reason === 'replaced' ? entry.reason : 'rotated',
        revokedKeyFingerprint: stringValue(entry.revokedKeyFingerprint) || null,
        replacementKeyFingerprint: stringValue(entry.replacementKeyFingerprint) || null,
      }))
      .slice(0, 40)
    : []
);

const appendRevocationHistory = (
  auth: BackyJsonObject | undefined,
  entries: BackyJsonObject[],
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRevocationHistory: [
    ...entries,
    ...normalizeRevocationHistory(auth?.apiKeyRevocationHistory),
  ].slice(0, 40),
});

const buildRotationHistoryEntry = ({
  scope,
  beforeSettings,
  afterSettings,
  access,
  requestId,
}: {
  scope: 'all' | 'public' | 'admin';
  beforeSettings: AdminSettingsSource;
  afterSettings: AdminSettingsSource;
  access: AdminAccessContext;
  requestId: string;
}): BackyJsonObject => {
  const before = settingsApiKeys(beforeSettings);
  const after = settingsApiKeys(afterSettings);

  return {
    id: `key_rotation_${randomUUID().slice(0, 8)}`,
    scope,
    rotatedAt: new Date().toISOString(),
    actorId: access.session?.user.id || null,
    requestId,
    publicKeyChanged: before.publicApiKey !== after.publicApiKey,
    adminKeyChanged: before.adminApiKey !== after.adminApiKey,
    previousPublicKeyFingerprint: keyFingerprint(before.publicApiKey),
    newPublicKeyFingerprint: keyFingerprint(after.publicApiKey),
    previousAdminKeyFingerprint: keyFingerprint(before.adminApiKey),
    newAdminKeyFingerprint: keyFingerprint(after.adminApiKey),
  };
};

const buildRevocationHistoryEntries = ({
  scope,
  beforeSettings,
  afterSettings,
  access,
  requestId,
}: {
  scope: 'all' | 'public' | 'admin';
  beforeSettings: AdminSettingsSource;
  afterSettings: AdminSettingsSource;
  access: AdminAccessContext;
  requestId: string;
}): BackyJsonObject[] => {
  const before = settingsApiKeys(beforeSettings);
  const after = settingsApiKeys(afterSettings);
  const revokedAt = new Date().toISOString();
  const actorId = access.session?.user.id || null;
  const entries: BackyJsonObject[] = [];

  if (before.publicApiKey !== after.publicApiKey) {
    entries.push({
      id: `key_revocation_${randomUUID().slice(0, 8)}`,
      scope,
      keyType: 'public',
      revokedAt,
      actorId,
      requestId,
      reason: 'rotated',
      revokedKeyFingerprint: keyFingerprint(before.publicApiKey),
      replacementKeyFingerprint: keyFingerprint(after.publicApiKey),
    });
  }

  if (before.adminApiKey !== after.adminApiKey) {
    entries.push({
      id: `key_revocation_${randomUUID().slice(0, 8)}`,
      scope,
      keyType: 'admin',
      revokedAt,
      actorId,
      requestId,
      reason: 'rotated',
      revokedKeyFingerprint: keyFingerprint(before.adminApiKey),
      replacementKeyFingerprint: keyFingerprint(after.adminApiKey),
    });
  }

  return entries;
};

const toAdminSettings = (settings: AdminSettingsSource, options: { includeAdminApiKey?: boolean } = {}) => {
  const apiKeys = settingsApiKeys(settings);
  const runtimeStorage = getMediaStorageConfigSummary();
  const runtimeDatabase = getDatabaseRuntimeSummary();
  const runtimeSupabase = getSupabaseRuntimeSummary();
  const runtimeMediaScanner = getMediaScannerRuntimeSummary();
  const runtimeVercel = getVercelRuntimeSummary();
  const runtimeNotifications = getNotificationRuntimeSummary();
  const runtimeCommerce = getCommerceRuntimeSummary(settings);
  const runtimeInteractiveComponents = getInteractiveComponentRuntimeSummary();
  const runtimePublicApi = getPublicApiRuntimeSummary();
  const providerCertificationRuntimeEvidence = buildProviderCertificationRuntimeEvidence({
    database: runtimeDatabase,
    storage: runtimeStorage,
    supabase: runtimeSupabase,
    vercel: runtimeVercel,
    mediaScanner: runtimeMediaScanner,
    notifications: runtimeNotifications,
    commerce: runtimeCommerce,
    interactiveComponents: runtimeInteractiveComponents,
    publicApi: runtimePublicApi,
  });

  return {
    schemaVersion: ADMIN_SETTINGS_SCHEMA,
    scope: {
      workspaceSettingsScope: 'global',
      siteSettingsScope: 'site',
      siteSettingsEndpointTemplate: '/api/admin/sites/:siteId/settings',
    },
    endpoints: {
      workspaceSettings: '/api/admin/settings',
      siteSettings: '/api/admin/sites/:siteId/settings',
    },
    deliveryMode: settings.deliveryMode === 'custom-frontend' ? 'custom-frontend' : 'managed-hosting',
    apiKeys: {
      publicApiKey: apiKeys.publicApiKey,
      adminApiKey: options.includeAdminApiKey ? apiKeys.adminApiKey : '',
    },
    storage: 'storage' in settings ? settings.storage || {} : {},
    runtimeStorage,
    auth: sanitizeAuthForResponse(settings.auth) || {},
    integrations: settings.integrations || {},
    runtimeDatabase,
    runtimeSupabase,
    runtimeMediaScanner,
    runtimeVercel,
    runtimeNotifications,
    runtimeCommerce,
    runtimeInteractiveComponents,
    runtimePublicApi,
    providerCertification: providerCertificationContract(providerCertificationRuntimeEvidence),
    updatedAt: settings.updatedAt,
  };
};

const parseJsonObject = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : undefined
);

const normalizeDeploymentHistory = (value: unknown): BackyJsonObject[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => parseJsonObject(item))
    .filter((item): item is BackyJsonObject => Boolean(item))
    .slice(0, 10);
};

const validateSecretReferenceValue = (label: string, reference: string, example: string): string | null => {
  if (!reference) {
    return null;
  }

  if (isSecretReference(reference)) {
    return null;
  }

  if (looksLikeRawSecret(reference)) {
    return `${label} must be stored in deployment environment variables or a connected secret store. Save an env reference such as ${example} instead of the raw secret.`;
  }

  return `${label} must be an environment variable reference such as ${example}, $${secretReferenceEnvKey(example)}, or ${secretReferenceEnvKey(example)}.`;
};

const validateSecretReferencePolicy = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const commerce = parseJsonObject(input?.commerce) || {};
  const storage = parseJsonObject(input?.storage) || {};
  const checks: Array<{ label: string; reference: string; example: string }> = [
    {
      label: 'Commerce webhook signing secret',
      reference: stringValue(commerce.providerWebhookSecretId),
      example: 'env:STRIPE_WEBHOOK_SECRET',
    },
    {
      label: 'S3 access key secret reference',
      reference: stringValue(storage.accessKeyIdSecretRef),
      example: 'env:BACKY_S3_ACCESS_KEY_ID',
    },
    {
      label: 'S3 secret access key reference',
      reference: stringValue(storage.secretAccessKeySecretRef),
      example: 'env:BACKY_S3_SECRET_ACCESS_KEY',
    },
    {
      label: 'Supabase storage key reference',
      reference: stringValue(storage.supabaseKeySecretRef),
      example: 'env:BACKY_SUPABASE_SERVICE_ROLE_KEY',
    },
  ];

  for (const check of checks) {
    const error = validateSecretReferenceValue(check.label, check.reference, check.example);
    if (error) {
      return error;
    }
  }

  return null;
};

const validateCommerceProviderEndpoints = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const commerce = parseJsonObject(input?.commerce) || {};
  const notifications = parseJsonObject(input?.notifications) || {};
  const checks: Array<{ provider: string; url: string; label: string }> = [
    {
      provider: stringValue(commerce.taxProvider),
      url: stringValue(commerce.taxProviderUrl),
      label: 'Tax provider endpoint URL',
    },
    {
      provider: stringValue(commerce.shippingProvider),
      url: stringValue(commerce.shippingProviderUrl),
      label: 'Shipping provider endpoint URL',
    },
    {
      provider: stringValue(commerce.discountProvider),
      url: stringValue(commerce.discountProviderUrl),
      label: 'Discount provider endpoint URL',
    },
    {
      provider: stringValue(commerce.catalogSyncProvider || commerce.productSyncProvider || commerce.providerCatalogSyncProvider),
      url: stringValue(commerce.catalogSyncProviderUrl || commerce.productSyncProviderUrl || commerce.providerCatalogSyncUrl),
      label: 'Product catalog sync endpoint URL',
    },
    {
      provider: stringValue(commerce.fulfillmentProvider),
      url: stringValue(commerce.fulfillmentProviderUrl),
      label: 'Fulfillment endpoint URL',
    },
    {
      provider: stringValue(commerce.subscriptionActionProvider || commerce.subscriptionLifecycleProvider),
      url: stringValue(commerce.subscriptionActionProviderUrl || commerce.subscriptionLifecycleProviderUrl),
      label: 'Subscription lifecycle endpoint URL',
    },
  ];

  for (const check of checks) {
    if (['http', 'generic-http', 'custom-http'].includes(check.provider) && !check.url.trim()) {
      return `${check.label} is required when its provider is set to HTTP.`;
    }
    if (check.url.trim() && !validateWebhookUrl(check.url).ok) {
      return `${check.label} must be an http or https URL.`;
    }
  }

  const callbackChecks = [
    {
      url: stringValue(commerce.providerWebhookUrl),
      label: 'Commerce provider webhook URL',
    },
    {
      url: stringValue(notifications.webhookUrl),
      label: 'Notification webhook URL',
    },
  ];

  for (const check of callbackChecks) {
    if (check.url.trim() && !validateWebhookUrl(check.url).ok) {
      return `${check.label} must be an http or https URL.`;
    }
  }

  return null;
};

const validateInfrastructureProviderSettings = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const storage = parseJsonObject(input?.storage) || {};
  const supabase = parseJsonObject(input?.supabase) || {};
  const vercel = parseJsonObject(input?.vercel) || {};
  const urlChecks = [
    {
      url: stringValue(storage.publicBaseUrl),
      label: 'Storage public base URL',
    },
    {
      url: stringValue(supabase.projectUrl),
      label: 'Supabase project URL',
    },
  ];

  for (const check of urlChecks) {
    if (check.url && !validateWebhookUrl(check.url).ok) {
      return `${check.label} must be an http or https URL.`;
    }
  }

  const supabaseProjectRef = stringValue(supabase.projectRef);
  if (supabaseProjectRef && !SUPABASE_PROJECT_REF_REGEX.test(supabaseProjectRef)) {
    return 'Supabase project ref must use lowercase letters, numbers, and hyphens only.';
  }

  const vercelProductionDomain = stringValue(vercel.productionDomain);
  if (
    vercelProductionDomain
    && (vercelProductionDomain.includes('://') || !SIMPLE_DOMAIN_REGEX.test(vercelProductionDomain))
  ) {
    return 'Vercel production domain must be a bare hostname without protocol or path.';
  }

  return null;
};

const validateStoragePolicySettings = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const storage = parseJsonObject(input?.storage) || {};
  const checks = [
    { key: 'maxFileSizeMb', label: 'Max upload size', min: 1, max: 2048, unit: 'MB' },
    { key: 'workspaceStorageLimitGb', label: 'Workspace storage limit', min: 1, max: 102400, unit: 'GB' },
    { key: 'warningThresholdPercent', label: 'Storage warning threshold', min: 50, max: 100, unit: 'percent' },
  ];

  for (const check of checks) {
    if (storage[check.key] === undefined) {
      continue;
    }
    const value = numberValue(storage[check.key], Number.NaN);
    if (!Number.isFinite(value) || value < check.min || value > check.max) {
      return `${check.label} must be from ${check.min} to ${check.max} ${check.unit}.`;
    }
  }

  return null;
};

const validateCommerceOperationalSettings = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const commerce = parseJsonObject(input?.commerce) || {};
  const currency = stringValue(commerce.currency);

  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    return 'Commerce currency must be a three-letter uppercase ISO code.';
  }

  const checkoutSuccessPath = stringValue(commerce.checkoutSuccessPath);
  if (checkoutSuccessPath && !checkoutSuccessPath.startsWith('/')) {
    return 'Commerce success redirect path must start with /.';
  }

  const checkoutCancelPath = stringValue(commerce.checkoutCancelPath);
  if (checkoutCancelPath && !checkoutCancelPath.startsWith('/')) {
    return 'Commerce cancel redirect path must start with /.';
  }

  const billingContactEmail = stringValue(commerce.billingContactEmail);
  if (billingContactEmail && !EMAIL_ADDRESS_REGEX.test(billingContactEmail)) {
    return 'Billing contact email must be a valid email address.';
  }

  return null;
};

const validateNotificationRecipientSettings = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const notifications = parseJsonObject(input?.notifications) || {};
  const email = parseJsonObject(notifications.email) || {};
  const recipient = stringValue(email.recipient);

  if (recipient && !EMAIL_ADDRESS_REGEX.test(recipient)) {
    return 'Notification recipient must be a valid email address.';
  }

  return null;
};

const validateAuthPolicySettings = (auth: unknown): string | null => {
  const policy = parseJsonObject(auth);
  if (!policy) {
    return null;
  }

  const minPasswordLength = numberValue(policy.minPasswordLength, 12);
  if (minPasswordLength < 8 || minPasswordLength > 128) {
    return 'Minimum password length must be from 8 to 128 characters.';
  }

  const sessionTimeoutMinutes = numberValue(policy.sessionTimeoutMinutes, 120);
  if (sessionTimeoutMinutes < 15 || sessionTimeoutMinutes > 10080) {
    return 'Session timeout must be from 15 to 10080 minutes.';
  }

  const invalidDomains = stringValue(policy.allowedEmailDomains)
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean)
    .filter((domain) => !SIMPLE_DOMAIN_REGEX.test(domain));

  if (invalidDomains.length > 0) {
    return `Allowed email domains include invalid values: ${invalidDomains.slice(0, 3).join(', ')}.`;
  }

  return null;
};

const validateBrandSeoSettings = (integrations: unknown): string | null => {
  const input = parseJsonObject(integrations);
  const general = parseJsonObject(input?.general) || {};
  const appearance = parseJsonObject(input?.appearance) || {};
  const seo = parseJsonObject(input?.seo) || {};
  const siteName = stringValue(general.siteName);

  if (general.siteName !== undefined && !siteName) {
    return 'Default site name is required.';
  }

  const colorChecks = [
    { key: 'primaryColor', label: 'Primary color' },
    { key: 'secondaryColor', label: 'Secondary color' },
    { key: 'backgroundColor', label: 'Background color' },
    { key: 'surfaceColor', label: 'Surface color' },
    { key: 'textColor', label: 'Text color' },
    { key: 'mutedTextColor', label: 'Muted text color' },
  ];

  for (const check of colorChecks) {
    const value = stringValue(appearance[check.key]);
    if (appearance[check.key] !== undefined && !HEX_COLOR_REGEX.test(value)) {
      return `${check.label} must be a six-character hex color.`;
    }
  }

  const numericChecks = [
    { key: 'baseFontSize', label: 'Base font size', min: 12, max: 24, unit: 'pixels' },
    { key: 'radius', label: 'Corner radius', min: 0, max: 32, unit: 'pixels' },
    { key: 'spacingUnit', label: 'Spacing unit', min: 2, max: 16, unit: 'pixels' },
  ];

  for (const check of numericChecks) {
    if (appearance[check.key] === undefined) {
      continue;
    }
    const value = numberValue(appearance[check.key], Number.NaN);
    if (!Number.isFinite(value) || value < check.min || value > check.max) {
      return `${check.label} must be from ${check.min} to ${check.max} ${check.unit}.`;
    }
  }

  const ogImageUrl = stringValue(seo.ogImageUrl);
  if (ogImageUrl && !validateWebhookUrl(ogImageUrl).ok) {
    return 'Default OG image URL must be an http or https URL.';
  }

  return null;
};

const normalizeAdminAuthSettings = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }
  const {
    passwordResetTokens: _passwordResetTokens,
    inviteTokens: _inviteTokens,
    apiKeyServiceKeys: _apiKeyServiceKeys,
    ...safeInput
  } = input;

  return {
    ...safeInput,
    requireTwoFactor: boolValue(safeInput.requireTwoFactor),
  };
};

const normalizeNotificationIntegrations = (value: unknown): BackyJsonObject | undefined => {
  const notifications = parseJsonObject(value);
  if (!notifications) {
    return undefined;
  }

  const email = parseJsonObject(notifications.email) || {};
  const inApp = parseJsonObject(notifications.inApp) || {};

  return {
    ...notifications,
    email: {
      ...email,
      newUser: false,
      pagePublished: false,
      orderCreated: email.orderCreated === true,
      productLowStock: email.productLowStock === true,
      systemUpdates: false,
    },
    inApp: {
      ...inApp,
      mentions: false,
    },
    digestFrequency: notifications.digestFrequency === 'off' ? 'off' : 'instant',
  };
};

const validateWebhookUrl = (value: string): { ok: true; url: URL } | { ok: false } => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? { ok: true, url } : { ok: false };
  } catch {
    return { ok: false };
  }
};

const webhookAuditTarget = (target: string): string => {
  const parsed = validateWebhookUrl(target);
  if (!parsed.ok) return target;
  return `${parsed.url.origin}${parsed.url.pathname}`;
};

const resolveNotificationWebhookUrl = (settings: AdminSettingsSource, override: unknown): string => {
  const overrideUrl = stringValue(override);
  if (overrideUrl) return overrideUrl;

  const integrations = parseJsonObject(settings.integrations) || {};
  const notifications = parseJsonObject(integrations.notifications) || {};
  return stringValue(notifications.webhookUrl);
};

async function sendSettingsNotificationWebhook(params: {
  target: string;
  requestId: string;
  access: AdminAccessContext;
  retryOf?: string;
}) {
  const startedAt = new Date().toISOString();
  const retry = Boolean(params.retryOf);
  const payload = {
    schemaVersion: 'backy.settings-notification-webhook-test.v1',
    kind: retry ? 'settings.notification_webhook.retry' : 'settings.notification_webhook.test',
    requestId: params.requestId,
    retry,
    retryOf: params.retryOf || null,
    actorId: params.access.session?.user.id || null,
    generatedAt: startedAt,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(params.target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backy-event-kind': payload.kind,
        'x-backy-request-id': params.requestId,
        'x-backy-settings-webhook-test': 'true',
        ...(retry ? { 'x-backy-webhook-retry': 'true' } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return {
      attempted: true,
      target: params.target,
      targetSummary: webhookAuditTarget(params.target),
      status: response.ok ? 'succeeded' : 'failed',
      statusCode: response.status,
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
      requestId: params.requestId,
      retry,
      retryOf: params.retryOf || null,
      generatedAt: startedAt,
    };
  } catch (error) {
    return {
      attempted: true,
      target: params.target,
      targetSummary: webhookAuditTarget(params.target),
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown webhook error',
      requestId: params.requestId,
      retry,
      retryOf: params.retryOf || null,
      generatedAt: startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const normalizeInfrastructureIntegrations = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }

  const supabase = parseJsonObject(input.supabase) || {};
  const storage = parseJsonObject(input.storage) || {};
  const vercel = parseJsonObject(input.vercel) || {};
  const deploymentHistory = normalizeDeploymentHistory(vercel.deploymentHistory);
  const commerce = parseJsonObject(input.commerce) || {};
  const commerceMode = stringValue(commerce.mode);
  const paymentProvider = stringValue(commerce.paymentProvider);
  const providerMode = stringValue(commerce.providerMode);
  const reconciliationMode = stringValue(commerce.reconciliationMode);
  const billingPlan = stringValue(commerce.billingPlan);
  const overageMode = stringValue(commerce.overageMode);
  const notifications = normalizeNotificationIntegrations(input.notifications);

  return {
    ...input,
    ...(notifications ? { notifications } : {}),
    supabase: {
      projectUrl: stringValue(supabase.projectUrl),
      projectRef: stringValue(supabase.projectRef) || inferSupabaseProjectRef(stringValue(supabase.projectUrl)),
      databaseEnabled: boolValue(supabase.databaseEnabled),
      storageEnabled: boolValue(supabase.storageEnabled),
      authEnabled: boolValue(supabase.authEnabled),
    },
    storage: {
      provider: stringValue(storage.provider),
      bucket: stringValue(storage.bucket),
      publicBaseUrl: stringValue(storage.publicBaseUrl),
      pathPrefix: stringValue(storage.pathPrefix),
      accessKeyIdSecretRef: stringValue(storage.accessKeyIdSecretRef),
      secretAccessKeySecretRef: stringValue(storage.secretAccessKeySecretRef),
      supabaseKeySecretRef: stringValue(storage.supabaseKeySecretRef),
      privateFilesEnabled: boolValue(storage.privateFilesEnabled),
      imageTransformsEnabled: boolValue(storage.imageTransformsEnabled, true),
      lifecyclePolicyEnabled: boolValue(storage.lifecyclePolicyEnabled),
      lifecycleTempRetentionDays: Math.max(1, Math.min(365, Math.round(numberValue(storage.lifecycleTempRetentionDays, 7)))),
      lifecycleNoncurrentVersionDays: Math.max(1, Math.min(3650, Math.round(numberValue(storage.lifecycleNoncurrentVersionDays, 90)))),
      maxFileSizeMb: Math.min(Math.max(numberValue(storage.maxFileSizeMb, 25), 1), 2048),
      workspaceStorageLimitGb: Math.min(Math.max(numberValue(storage.workspaceStorageLimitGb, 10), 1), 102400),
      warningThresholdPercent: Math.min(Math.max(numberValue(storage.warningThresholdPercent, 80), 50), 100),
      allowedFileTypes: stringValue(storage.allowedFileTypes),
    },
    vercel: {
      projectId: stringValue(vercel.projectId),
      teamSlug: stringValue(vercel.teamSlug),
      productionDomain: stringValue(vercel.productionDomain),
      autoDeploy: boolValue(vercel.autoDeploy),
      previewDeployments: boolValue(vercel.previewDeployments, true),
      ...(deploymentHistory.length > 0 ? { deploymentHistory: deploymentHistory as unknown as BackyJsonValue } : {}),
    },
    commerce: {
      mode: ['catalog-only', 'manual-orders', 'checkout-provider'].includes(commerceMode)
        ? commerceMode
        : 'catalog-only',
      currency: stringValue(commerce.currency).toUpperCase().slice(0, 3),
      paymentProvider: ['none', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'].includes(paymentProvider)
        ? paymentProvider
        : 'none',
      providerMode: providerMode === 'live' ? 'live' : 'test',
      providerAccountId: stringValue(commerce.providerAccountId),
      providerWebhookUrl: stringValue(commerce.providerWebhookUrl),
      providerWebhookSecretId: stringValue(commerce.providerWebhookSecretId),
      providerWebhookEvents: stringValue(commerce.providerWebhookEvents),
      reconciliationMode: ['manual', 'webhook', 'scheduled'].includes(reconciliationMode)
        ? reconciliationMode
        : 'manual',
      reconciliationWindowHours: Math.max(1, Math.min(720, Math.round(numberValue(commerce.reconciliationWindowHours, 24)))),
      checkoutSuccessPath: stringValue(commerce.checkoutSuccessPath),
      checkoutCancelPath: stringValue(commerce.checkoutCancelPath),
      guestCheckout: boolValue(commerce.guestCheckout, true),
      taxEnabled: boolValue(commerce.taxEnabled),
      shippingEnabled: boolValue(commerce.shippingEnabled),
      discountsEnabled: boolValue(commerce.discountsEnabled),
      taxRatePercent: Math.max(0, Math.min(100, numberValue(commerce.taxRatePercent, 8.25))),
      digitalTaxRatePercent: Math.max(0, Math.min(100, numberValue(commerce.digitalTaxRatePercent, 6))),
      shippingBaseAmount: Math.max(0, numberValue(commerce.shippingBaseAmount, 8)),
      shippingWeightRate: Math.max(0, numberValue(commerce.shippingWeightRate, 1.25)),
      discountPercent: Math.max(0, Math.min(100, numberValue(commerce.discountPercent, 10))),
      taxProvider: ['http', 'stripe', 'taxjar', 'avalara'].includes(stringValue(commerce.taxProvider))
        ? stringValue(commerce.taxProvider)
        : 'manual',
      taxProviderUrl: stringValue(commerce.taxProviderUrl),
      shippingProvider: ['http', 'easypost', 'shippo'].includes(stringValue(commerce.shippingProvider))
        ? stringValue(commerce.shippingProvider)
        : 'manual',
      shippingProviderUrl: stringValue(commerce.shippingProviderUrl),
      discountProvider: ['http', 'stripe'].includes(stringValue(commerce.discountProvider))
        ? stringValue(commerce.discountProvider)
        : 'manual',
      discountProviderUrl: stringValue(commerce.discountProviderUrl),
      catalogSyncProvider: ['http', 'generic-http', 'custom-http'].includes(stringValue(commerce.catalogSyncProvider))
        ? stringValue(commerce.catalogSyncProvider)
        : 'manual',
      catalogSyncProviderUrl: stringValue(commerce.catalogSyncProviderUrl),
      subscriptionActionProvider: ['http', 'generic-http', 'custom-http'].includes(stringValue(commerce.subscriptionActionProvider || commerce.subscriptionLifecycleProvider))
        ? stringValue(commerce.subscriptionActionProvider || commerce.subscriptionLifecycleProvider)
        : 'manual',
      subscriptionActionProviderUrl: stringValue(commerce.subscriptionActionProviderUrl || commerce.subscriptionLifecycleProviderUrl),
      shippingLabelProvider: ['easypost', 'shippo'].includes(stringValue(commerce.shippingLabelProvider))
        ? stringValue(commerce.shippingLabelProvider)
        : 'manual',
      shippingOriginAddress: stringValue(commerce.shippingOriginAddress),
      shippingDefaultParcel: stringValue(commerce.shippingDefaultParcel),
      shippingDefaultCarrier: stringValue(commerce.shippingDefaultCarrier),
      shippingDefaultServiceLevel: stringValue(commerce.shippingDefaultServiceLevel),
      shippingDefaultRateId: stringValue(commerce.shippingDefaultRateId),
      fulfillmentProvider: stringValue(commerce.fulfillmentProvider) === 'http' ? 'http' : 'manual',
      fulfillmentProviderUrl: stringValue(commerce.fulfillmentProviderUrl),
      inventoryReservations: boolValue(commerce.inventoryReservations, true),
      reservationMinutes: Math.max(1, Math.min(1440, Math.round(numberValue(commerce.reservationMinutes, 15)))),
      webhookEventsEnabled: boolValue(commerce.webhookEventsEnabled),
      billingPlan: ['free', 'starter', 'pro', 'enterprise'].includes(billingPlan)
        ? billingPlan
        : 'free',
      monthlyOrderLimit: Math.max(0, Math.min(1000000, Math.round(numberValue(commerce.monthlyOrderLimit, 100)))),
      productLimit: Math.max(0, Math.min(1000000, Math.round(numberValue(commerce.productLimit, 100)))),
      siteLimit: Math.max(1, Math.min(10000, Math.round(numberValue(commerce.siteLimit, 3)))),
      teamLimit: Math.max(1, Math.min(10000, Math.round(numberValue(commerce.teamLimit, 3)))),
      seatLimit: Math.max(1, Math.min(10000, Math.round(numberValue(commerce.seatLimit, 3)))),
      overageMode: ['block', 'warn', 'manual-review'].includes(overageMode)
        ? overageMode
        : 'warn',
      billingContactEmail: stringValue(commerce.billingContactEmail),
    },
  };
};

const isMediaStorageSettingsPatch = (body: Record<string, unknown>): boolean => {
  const bodyKeys = Object.keys(body);
  if (
    bodyKeys.length === 0 ||
    !bodyKeys.includes('integrations') ||
    bodyKeys.some((key) => key !== 'integrations' && key !== 'deliveryMode')
  ) {
    return false;
  }

  const integrations = parseJsonObject(body.integrations);
  if (!integrations) {
    return false;
  }

  const integrationKeys = Object.keys(integrations);
  return integrationKeys.length > 0 && integrationKeys.every((key) => key === 'storage' || key === 'supabase');
};

const isMediaStorageInfrastructureCheck = (body: Record<string, unknown>): boolean => {
  if (body.action !== 'validate-infrastructure') {
    return false;
  }

  const bodyKeys = Object.keys(body);
  if (bodyKeys.some((key) => key !== 'action' && key !== 'deliveryMode' && key !== 'integrations')) {
    return false;
  }

  return isMediaStorageSettingsPatch({
    integrations: body.integrations,
  });
};

const mergeMediaStorageIntegrations = (
  current: unknown,
  patch: unknown,
): BackyJsonObject | undefined => {
  const currentIntegrations = parseJsonObject(current) || {};
  const patchIntegrations = parseJsonObject(patch);
  if (!patchIntegrations) {
    return undefined;
  }

  const normalized = normalizeInfrastructureIntegrations({
    ...currentIntegrations,
    ...patchIntegrations,
  });
  if (!normalized) {
    return undefined;
  }

  return {
    ...currentIntegrations,
    ...(parseJsonObject(normalized.storage) ? { storage: normalized.storage } : {}),
    ...(parseJsonObject(normalized.supabase) ? { supabase: normalized.supabase } : {}),
  };
};

type InfrastructureDiagnosticStatus = 'ready' | 'warning' | 'blocked';

interface InfrastructureCheckInput {
  deliveryMode: 'managed-hosting' | 'custom-frontend';
  integrations: BackyJsonObject;
  runtimeDatabase: ReturnType<typeof getDatabaseRuntimeSummary>;
  runtimeStorage: ReturnType<typeof getMediaStorageConfigSummary>;
  runtimeSupabase: ReturnType<typeof getSupabaseRuntimeSummary>;
  runtimeMediaScanner: ReturnType<typeof getMediaScannerRuntimeSummary>;
  runtimeVercel: ReturnType<typeof getVercelRuntimeSummary>;
  runtimeNotifications: ReturnType<typeof getNotificationRuntimeSummary>;
  runtimeCommerce: ReturnType<typeof getCommerceRuntimeSummary>;
  runtimeInteractiveComponents: ReturnType<typeof getInteractiveComponentRuntimeSummary>;
  runtimePublicApi: ReturnType<typeof getPublicApiRuntimeSummary>;
}

type StorageProvisioningStatus = 'ready' | 'blocked';

interface StorageProvisioningCheck {
  label: string;
  ready: boolean;
  detail: string;
}

interface StorageSecretReferenceProbe {
  provider: string;
  status: StorageProvisioningStatus;
  summary: string;
  checks: StorageProvisioningCheck[];
}

interface StorageProvisioningAutomation {
  provider: string;
  action: 'create-or-verify-container';
  status: StorageProvisioningStatus;
  created: boolean;
  checked: boolean;
  target: string;
  detail: string;
}

const storageSecretReferenceEntries = (storage: BackyJsonObject, provider: string) => {
  if (provider === 's3') {
    return [
      {
        label: 'S3 access key secret ref',
        reference: stringValue(storage.accessKeyIdSecretRef),
      },
      {
        label: 'S3 secret access key ref',
        reference: stringValue(storage.secretAccessKeySecretRef),
      },
    ].filter((entry) => entry.reference);
  }

  if (provider === 'supabase') {
    return [
      {
        label: 'Supabase storage key ref',
        reference: stringValue(storage.supabaseKeySecretRef),
      },
    ].filter((entry) => entry.reference);
  }

  return [];
};

const buildStorageSecretReferenceProbe = (storage: BackyJsonObject, provider: string): StorageSecretReferenceProbe => {
  const entries = storageSecretReferenceEntries(storage, provider);
  const checks = entries.length > 0
    ? entries.map((entry) => {
        const key = secretReferenceEnvKey(entry.reference);
        const ready = secretReferenceResolved(entry.reference);
        return {
          label: entry.label,
          ready,
          detail: ready
            ? `${entry.label} resolves through ${key}.`
            : `${entry.label} points to ${key || 'an empty reference'}, but no server-side value is available.`,
        };
      })
    : [
        {
          label: 'Storage secret refs',
          ready: true,
          detail: 'No storage secret refs are configured; Backy will use the standard provider environment variables.',
        },
      ];
  const blocked = checks.some((check) => !check.ready);

  return {
    provider,
    status: blocked ? 'blocked' : 'ready',
    summary: entries.length === 0
      ? 'Storage secret refs are not configured for this provider.'
      : blocked
        ? 'One or more storage secret refs do not resolve in the server environment.'
        : 'Configured storage secret refs resolve without exposing secret values.',
    checks,
  };
};

interface StorageCredentialRotationProbe {
  status: StorageProvisioningStatus;
  summary: string;
  probePath: string;
  fields: Array<{
    name: string;
    secret: boolean;
    required: boolean;
    detected: boolean;
  }>;
  checks: StorageProvisioningCheck[];
  nextSteps: string[];
}

type StorageSecretManagerMode = 'plan' | 'promote' | 'revoke-replacement';

interface StorageSecretManagerOperation {
  action: 'upsert' | 'delete';
  name: string;
  source?: string;
  secret: boolean;
  required: boolean;
  ready: boolean;
  executed: boolean;
  detail: string;
}

interface StorageSecretManagerResult {
  provider: string;
  secretManager: 'vercel-env';
  mode: StorageSecretManagerMode;
  dryRun: boolean;
  status: StorageProvisioningStatus;
  executed: boolean;
  projectId?: string;
  teamId?: string;
  targetEnvironments: string[];
  summary: string;
  checks: StorageProvisioningCheck[];
  operations: StorageSecretManagerOperation[];
  nextSteps: string[];
  generatedAt: string;
}

interface StorageLifecyclePolicyAutomation {
  provider: string;
  action: 'apply-lifecycle-policy';
  status: StorageProvisioningStatus;
  applied: boolean;
  checked: boolean;
  target: string;
  detail: string;
  policy?: {
    tempRetentionDays: number;
    noncurrentVersionDays: number;
  };
}

interface StorageLifecycleCleanupResult {
  provider: string;
  action: 'cleanup-expired-storage';
  status: StorageProvisioningStatus;
  dryRun: boolean;
  siteId?: string;
  cutoff: {
    probeObjectsBefore: string;
    retainedVersionsBefore?: string;
  };
  deleted: {
    probeObjects: number;
    retainedVersions: number;
    storageObjects: number;
  };
  candidates: {
    probeObjects: number;
    retainedVersions: number;
  };
  errors: string[];
  detail: string;
}

const optionalRuntimeImport = async <TModule,>(specifier: string): Promise<TModule> => {
  const runtimeImport = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<TModule>;
  return runtimeImport(specifier);
};

const makeInfrastructureDiagnostic = (
  area: 'database' | 'storage' | 'supabase' | 'mediaScanner' | 'vercel' | 'notifications' | 'commerce' | 'interactiveComponents',
  label: string,
  checks: Array<{ label: string; ready: boolean; required: boolean; detail: string }>,
) => {
  const requiredFailures = checks.filter((check) => check.required && !check.ready);
  const optionalFailures = checks.filter((check) => !check.required && !check.ready);
  const status: InfrastructureDiagnosticStatus = requiredFailures.length > 0
    ? 'blocked'
    : optionalFailures.length > 0
      ? 'warning'
      : 'ready';

  return {
    area,
    label,
    status,
    summary: status === 'ready'
      ? `${label} is ready for the selected Backy settings.`
      : status === 'blocked'
        ? `${label} is missing required configuration.`
        : `${label} is usable, but optional production wiring is incomplete.`,
    missing: checks.filter((check) => !check.ready).map((check) => check.label),
    checks,
  };
};

const buildInfrastructureDiagnostics = ({
  deliveryMode,
  integrations,
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeMediaScanner,
  runtimeVercel,
  runtimeNotifications,
  runtimeCommerce,
  runtimeInteractiveComponents,
}: InfrastructureCheckInput) => {
  const storage = parseJsonObject(integrations.storage) || {};
  const supabase = parseJsonObject(integrations.supabase) || {};
  const vercel = parseJsonObject(integrations.vercel) || {};
  const commerce = parseJsonObject(integrations.commerce) || {};
  const notifications = parseJsonObject(integrations.notifications) || {};
  const notificationEmail = parseJsonObject(notifications.email) || {};
  const storageProvider = stringValue(storage.provider) || runtimeStorage.provider;
  const storageBucket = stringValue(storage.bucket) || runtimeStorage.bucket || runtimeSupabase.storageBucket;
  const storagePublicBaseUrl = stringValue(storage.publicBaseUrl) || runtimeStorage.publicUrl || '';
  const storageSecretRefs = buildStorageSecretReferenceProbe(storage, storageProvider);
  const storageSecretRefsConfigured = storageSecretReferenceEntries(storage, storageProvider).length > 0;
  const supabaseProjectUrl = stringValue(supabase.projectUrl) || runtimeSupabase.projectUrl || '';
  const supabaseProjectRef = stringValue(supabase.projectRef) || runtimeSupabase.projectRef || inferSupabaseProjectRef(supabaseProjectUrl);
  const supabaseEnabled = boolValue(supabase.databaseEnabled)
    || boolValue(supabase.storageEnabled)
    || boolValue(supabase.authEnabled)
    || storageProvider === 'supabase';
  const vercelProjectId = stringValue(vercel.projectId) || runtimeVercel.projectId || '';
  const vercelProductionDomain = stringValue(vercel.productionDomain) || runtimeVercel.url || '';
  const notificationEmailEnabled = boolValue(notificationEmail.formSubmission)
    || boolValue(notificationEmail.comments)
    || boolValue(notificationEmail.orderCreated)
    || boolValue(notificationEmail.productLowStock)
    || boolValue(notificationEmail.systemUpdates)
    || Boolean(stringValue(notificationEmail.recipient));
  const commerceWebhookRequired = boolValue(commerce.webhookEventsEnabled)
    && stringValue(commerce.paymentProvider) !== 'none';

  return [
    makeInfrastructureDiagnostic('database', 'Database runtime', [
      {
        label: 'Persistence runtime',
        ready: Boolean(runtimeDatabase.configured),
        required: true,
        detail: runtimeDatabase.configured
          ? `${runtimeDatabase.provider} persistence is available.`
          : `Missing ${runtimeDatabase.missing.join(', ') || 'database configuration'}.`,
      },
      {
        label: 'Supabase database intent',
        ready: !boolValue(supabase.databaseEnabled) || Boolean(runtimeSupabase.databaseUrlConfigured || runtimeDatabase.configured),
        required: boolValue(supabase.databaseEnabled),
        detail: boolValue(supabase.databaseEnabled)
          ? 'Supabase database is enabled and needs a repository/database runtime.'
          : 'Supabase database is not enabled for this workspace.',
      },
    ]),
    makeInfrastructureDiagnostic('storage', 'Media storage', [
      {
        label: 'Storage provider',
        ready: Boolean(storageProvider),
        required: true,
        detail: storageProvider ? `${storageProvider} is selected.` : 'Choose local, Supabase Storage, or S3-compatible storage.',
      },
      {
        label: 'Storage bucket',
        ready: storageProvider === 'local' || Boolean(storageBucket),
        required: storageProvider !== 'local',
        detail: storageProvider === 'local'
          ? 'Local storage does not require a bucket.'
          : storageBucket
            ? `${storageBucket} will store uploaded files.`
            : 'Set a bucket for Supabase/S3 media uploads.',
      },
      {
        label: 'Public asset URL',
        ready: deliveryMode !== 'custom-frontend' || storageProvider === 'local' || Boolean(storagePublicBaseUrl),
        required: deliveryMode === 'custom-frontend' && storageProvider !== 'local',
        detail: storagePublicBaseUrl
          ? 'Public file URL is configured for custom frontends.'
          : 'Custom frontends need a public base URL for media delivery.',
      },
      {
        label: 'Storage secret refs',
        ready: storageSecretRefs.status === 'ready',
        required: storageSecretRefsConfigured,
        detail: storageSecretRefs.summary,
      },
    ]),
    makeInfrastructureDiagnostic('supabase', 'Supabase connection', [
      {
        label: 'Project URL or ref',
        ready: !supabaseEnabled || Boolean(supabaseProjectUrl || supabaseProjectRef),
        required: supabaseEnabled,
        detail: supabaseProjectUrl || supabaseProjectRef
          ? 'Supabase project metadata is present.'
          : 'Set a Supabase project URL or project ref.',
      },
      {
        label: 'Supabase API key env',
        ready: !supabaseEnabled || Boolean(runtimeSupabase.anonKeyConfigured || runtimeSupabase.serviceRoleConfigured),
        required: supabaseEnabled,
        detail: runtimeSupabase.anonKeyConfigured || runtimeSupabase.serviceRoleConfigured
          ? 'Supabase API key environment is detected.'
          : 'Set BACKY_SUPABASE_ANON_KEY or BACKY_SUPABASE_SERVICE_ROLE_KEY.',
      },
      {
        label: 'Service role for privileged work',
        ready: !boolValue(supabase.databaseEnabled) && !boolValue(supabase.storageEnabled) || Boolean(runtimeSupabase.serviceRoleConfigured),
        required: boolValue(supabase.databaseEnabled) || boolValue(supabase.storageEnabled),
        detail: runtimeSupabase.serviceRoleConfigured
          ? 'Service role key is available server-side.'
          : 'Database/storage writes need a server-only Supabase service role key.',
      },
    ]),
    makeInfrastructureDiagnostic('mediaScanner', 'Media scanner', [
      {
        label: 'Scanner runtime',
        ready: Boolean(runtimeMediaScanner.configured),
        required: Boolean(runtimeMediaScanner.enabled),
        detail: runtimeMediaScanner.enabled
          ? `${runtimeMediaScanner.provider} media scanning is enabled.`
          : 'Media scanning is not enabled; uploads rely on file type and size policy only.',
      },
      {
        label: 'Scanner endpoint',
        ready: !runtimeMediaScanner.enabled || Boolean(runtimeMediaScanner.endpointConfigured || runtimeMediaScanner.host),
        required: Boolean(runtimeMediaScanner.enabled),
        detail: runtimeMediaScanner.endpointConfigured || runtimeMediaScanner.host
          ? 'Scanner endpoint or host is configured.'
          : 'Enable BACKY_MEDIA_SCAN_ENDPOINT or ClamAV host settings before requiring scan enforcement.',
      },
    ]),
    makeInfrastructureDiagnostic('vercel', 'Vercel deployment', [
      {
        label: 'Project metadata',
        ready: Boolean(vercelProjectId || runtimeVercel.onVercel),
        required: boolValue(vercel.autoDeploy),
        detail: vercelProjectId || runtimeVercel.onVercel
          ? 'Vercel project/runtime metadata is present.'
          : 'Set Vercel project metadata before enabling deploy orchestration.',
      },
      {
        label: 'Production domain',
        ready: deliveryMode !== 'custom-frontend' || Boolean(vercelProductionDomain),
        required: deliveryMode === 'custom-frontend',
        detail: vercelProductionDomain
          ? 'Production domain is configured.'
          : 'Custom frontend mode should expose the production domain.',
      },
      {
        label: 'Deploy token env',
        ready: !boolValue(vercel.autoDeploy) || Boolean(runtimeVercel.tokenConfigured),
        required: boolValue(vercel.autoDeploy),
        detail: runtimeVercel.tokenConfigured
          ? 'Vercel deploy token is detected server-side.'
          : 'Auto deploy needs VERCEL_TOKEN or BACKY_VERCEL_TOKEN.',
      },
    ]),
    makeInfrastructureDiagnostic('notifications', 'Notification delivery', [
      {
        label: 'Email provider',
        ready: !notificationEmailEnabled || Boolean(runtimeNotifications.configured),
        required: notificationEmailEnabled,
        detail: runtimeNotifications.configured
          ? `${runtimeNotifications.emailProvider} email delivery is configured.`
          : `Missing ${runtimeNotifications.missing.join(', ') || 'email delivery configuration'}.`,
      },
      {
        label: 'Production email provider',
        ready: !notificationEmailEnabled || Boolean(runtimeNotifications.productionReady),
        required: false,
        detail: runtimeNotifications.productionReady
          ? 'A production email provider is selected.'
          : 'Local outbox is useful for development, but production notification emails need SMTP, Resend, or an HTTP endpoint.',
      },
    ]),
    makeInfrastructureDiagnostic('commerce', 'Commerce webhook secrets', [
      {
        label: 'Provider webhook secret',
        ready: !commerceWebhookRequired || Boolean(runtimeCommerce.webhookSecretConfigured),
        required: commerceWebhookRequired,
        detail: runtimeCommerce.webhookSecretConfigured
          ? `Commerce webhook secret resolved from ${runtimeCommerce.webhookSecretSource}.`
          : `Missing ${runtimeCommerce.missing.join(', ') || 'commerce webhook secret environment'}.`,
      },
      {
        label: 'Provider webhook metadata',
        ready: !commerceWebhookRequired || Boolean(stringValue(commerce.providerWebhookUrl)),
        required: commerceWebhookRequired,
        detail: stringValue(commerce.providerWebhookUrl)
          ? 'Commerce provider webhook URL is configured in Settings.'
          : 'Add the provider webhook URL before relying on automatic settlement.',
      },
      {
        label: 'Stripe API execution',
        ready: !(stringValue(commerce.paymentProvider) === 'stripe' || stringValue(commerce.taxProvider) === 'stripe' || stringValue(commerce.discountProvider) === 'stripe') || Boolean(runtimeCommerce.stripeSecretConfigured),
        required: stringValue(commerce.paymentProvider) === 'stripe' || stringValue(commerce.taxProvider) === 'stripe' || stringValue(commerce.discountProvider) === 'stripe',
        detail: runtimeCommerce.stripeSecretConfigured
          ? 'Stripe API key is available server-side for checkout sessions, tax calculations, promotion-code discounts, and provider refunds.'
          : 'Set BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY before relying on Stripe execution.',
      },
      {
        label: 'Refund provider execution',
        ready: Boolean(
          runtimeCommerce.stripeSecretConfigured ||
            runtimeCommerce.paypalAccessTokenConfigured ||
            runtimeCommerce.paddleApiKeyConfigured ||
            runtimeCommerce.squareAccessTokenConfigured ||
            (runtimeCommerce.adyenApiKeyConfigured && runtimeCommerce.adyenMerchantAccountConfigured) ||
            runtimeCommerce.mollieApiKeyConfigured ||
            (runtimeCommerce.razorpayKeyIdConfigured && runtimeCommerce.razorpayKeySecretConfigured),
        ),
        required: false,
        detail: [
          runtimeCommerce.stripeSecretConfigured ? 'Stripe refunds ready.' : '',
          runtimeCommerce.paypalAccessTokenConfigured ? 'PayPal refunds ready.' : '',
          runtimeCommerce.paddleApiKeyConfigured ? 'Paddle refunds ready.' : '',
          runtimeCommerce.squareAccessTokenConfigured ? 'Square refunds ready.' : '',
          runtimeCommerce.adyenApiKeyConfigured && runtimeCommerce.adyenMerchantAccountConfigured ? 'Adyen refunds ready.' : '',
          runtimeCommerce.mollieApiKeyConfigured ? 'Mollie refunds ready.' : '',
          runtimeCommerce.razorpayKeyIdConfigured && runtimeCommerce.razorpayKeySecretConfigured ? 'Razorpay refunds ready.' : '',
        ].filter(Boolean).join(' ') || 'Set payment provider credentials before relying on direct order refund execution.',
      },
      {
        label: 'TaxJar API execution',
        ready: stringValue(commerce.taxProvider) !== 'taxjar' || Boolean(runtimeCommerce.taxJarApiKeyConfigured),
        required: stringValue(commerce.taxProvider) === 'taxjar',
        detail: runtimeCommerce.taxJarApiKeyConfigured
          ? 'TaxJar API key is available server-side for order tax quote calculations.'
          : 'Set BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY before relying on TaxJar execution.',
      },
      {
        label: 'Avalara API execution',
        ready: stringValue(commerce.taxProvider) !== 'avalara' || Boolean(runtimeCommerce.avalaraAccountConfigured && runtimeCommerce.avalaraLicenseKeyConfigured && runtimeCommerce.avalaraCompanyCodeConfigured),
        required: stringValue(commerce.taxProvider) === 'avalara',
        detail: runtimeCommerce.avalaraAccountConfigured && runtimeCommerce.avalaraLicenseKeyConfigured && runtimeCommerce.avalaraCompanyCodeConfigured
          ? 'Avalara account, license key, and company code are available server-side for order tax quote calculations.'
          : 'Set BACKY_AVALARA_ACCOUNT_ID, BACKY_AVALARA_LICENSE_KEY, and BACKY_AVALARA_COMPANY_CODE before relying on Avalara execution.',
      },
      {
        label: 'Catalog provider credentials',
        ready: Boolean(
          runtimeCommerce.shopifyAdminAccessTokenConfigured ||
            runtimeCommerce.bigCommerceAccessTokenConfigured ||
            (runtimeCommerce.wooCommerceConsumerKeyConfigured && runtimeCommerce.wooCommerceConsumerSecretConfigured) ||
            (runtimeCommerce.etsyAccessTokenConfigured && runtimeCommerce.etsyApiKeyConfigured && runtimeCommerce.etsyShopConfigured) ||
            (runtimeCommerce.magentoAccessTokenConfigured && runtimeCommerce.magentoStoreConfigured) ||
            stringValue(commerce.catalogSyncProvider) === 'http',
        ),
        required: false,
        detail: [
          runtimeCommerce.shopifyAdminAccessTokenConfigured && runtimeCommerce.shopifyStoreConfigured ? 'Shopify catalog sync ready.' : '',
          runtimeCommerce.bigCommerceAccessTokenConfigured && runtimeCommerce.bigCommerceStoreConfigured ? 'BigCommerce catalog sync ready.' : '',
          runtimeCommerce.wooCommerceConsumerKeyConfigured && runtimeCommerce.wooCommerceConsumerSecretConfigured && runtimeCommerce.wooCommerceStoreConfigured ? 'WooCommerce catalog sync ready.' : '',
          runtimeCommerce.etsyAccessTokenConfigured && runtimeCommerce.etsyApiKeyConfigured && runtimeCommerce.etsyShopConfigured ? 'Etsy draft listing sync ready.' : '',
          runtimeCommerce.magentoAccessTokenConfigured && runtimeCommerce.magentoStoreConfigured ? 'Magento catalog sync ready.' : '',
          stringValue(commerce.catalogSyncProvider) === 'http' ? 'HTTP catalog sync endpoint is configured in Settings.' : '',
        ].filter(Boolean).join(' ') || 'Set catalog provider credentials or configure the HTTP catalog sync endpoint before relying on direct product sync execution.',
      },
      {
        label: 'Shipping provider execution',
        ready: (stringValue(commerce.shippingLabelProvider) === 'shippo' || stringValue(commerce.shippingProvider) === 'shippo')
          ? Boolean(runtimeCommerce.shippoApiKeyConfigured)
          : !['easypost'].includes(stringValue(commerce.shippingLabelProvider)) && stringValue(commerce.shippingProvider) !== 'easypost' || Boolean(runtimeCommerce.easyPostApiKeyConfigured),
        required: ['easypost', 'shippo'].includes(stringValue(commerce.shippingLabelProvider)) || ['easypost', 'shippo'].includes(stringValue(commerce.shippingProvider)),
        detail: stringValue(commerce.shippingLabelProvider) === 'shippo' || stringValue(commerce.shippingProvider) === 'shippo'
          ? runtimeCommerce.shippoApiKeyConfigured
            ? 'Shippo API key is available server-side for shipping quotes, label purchase, tracking, and refund requests.'
            : 'Set BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY before enabling Shippo shipping execution.'
          : runtimeCommerce.easyPostApiKeyConfigured
            ? 'EasyPost API key is available server-side for shipping quotes, label purchase, void, and tracking refresh.'
            : 'Set BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY before enabling EasyPost shipping execution.',
      },
      {
        label: 'Subscription lifecycle execution',
        ready: ['http', 'generic-http', 'custom-http'].includes(stringValue(commerce.subscriptionActionProvider))
          ? Boolean(stringValue(commerce.subscriptionActionProviderUrl))
          : Boolean(
            runtimeCommerce.stripeSecretConfigured ||
            runtimeCommerce.paypalAccessTokenConfigured ||
            runtimeCommerce.paddleApiKeyConfigured ||
            runtimeCommerce.squareAccessTokenConfigured ||
            (runtimeCommerce.adyenApiKeyConfigured && runtimeCommerce.adyenMerchantAccountConfigured) ||
            runtimeCommerce.mollieApiKeyConfigured ||
            (runtimeCommerce.razorpayKeyIdConfigured && runtimeCommerce.razorpayKeySecretConfigured),
          ),
        required: ['http', 'generic-http', 'custom-http'].includes(stringValue(commerce.subscriptionActionProvider)),
        detail: ['http', 'generic-http', 'custom-http'].includes(stringValue(commerce.subscriptionActionProvider))
          ? stringValue(commerce.subscriptionActionProviderUrl)
            ? 'HTTP subscription lifecycle adapter endpoint is configured in Settings.'
            : 'Set the subscription lifecycle endpoint before relying on generic HTTP subscription actions.'
          : [
            runtimeCommerce.stripeSecretConfigured ? 'Stripe subscription actions ready.' : '',
            runtimeCommerce.paypalAccessTokenConfigured ? 'PayPal subscription actions ready.' : '',
            runtimeCommerce.paddleApiKeyConfigured ? 'Paddle subscription actions ready.' : '',
            runtimeCommerce.squareAccessTokenConfigured ? 'Square subscription actions ready.' : '',
            runtimeCommerce.adyenApiKeyConfigured && runtimeCommerce.adyenMerchantAccountConfigured ? 'Adyen cancellation actions ready.' : '',
            runtimeCommerce.mollieApiKeyConfigured ? 'Mollie cancellation actions ready.' : '',
            runtimeCommerce.razorpayKeyIdConfigured && runtimeCommerce.razorpayKeySecretConfigured ? 'Razorpay subscription actions ready.' : '',
          ].filter(Boolean).join(' ') || 'Configure native provider credentials or a generic HTTP subscription lifecycle adapter before relying on direct subscription actions.',
      },
    ]),
    makeInfrastructureDiagnostic('interactiveComponents', 'Interactive component platform', [
      {
        label: 'Component registry',
        ready: Boolean(runtimeInteractiveComponents.registryConfigured),
        required: true,
        detail: runtimeInteractiveComponents.registryConfigured
          ? `${runtimeInteractiveComponents.registryProvider} registry metadata is available.`
          : `Missing ${runtimeInteractiveComponents.missing.join(', ') || 'component registry configuration'}.`,
      },
      {
        label: 'Signed bundle review',
        ready: Boolean(runtimeInteractiveComponents.signingKeyConfigured || !runtimeInteractiveComponents.customCodeEnabled),
        required: Boolean(runtimeInteractiveComponents.customCodeEnabled),
        detail: runtimeInteractiveComponents.signingKeyConfigured
          ? 'Registry signing key is configured server-side.'
          : runtimeInteractiveComponents.customCodeEnabled
            ? 'Custom code components need a server-side registry signing key.'
            : 'Custom code components are disabled; trusted built-in components can still render.',
      },
      {
        label: 'Sandbox runtime',
        ready: !runtimeInteractiveComponents.customCodeEnabled || Boolean(runtimeInteractiveComponents.sandboxOrigin && runtimeInteractiveComponents.cspConfigured),
        required: Boolean(runtimeInteractiveComponents.customCodeEnabled),
        detail: runtimeInteractiveComponents.customCodeEnabled
          ? runtimeInteractiveComponents.sandboxOrigin && runtimeInteractiveComponents.cspConfigured
            ? 'Custom code components will render in a sandboxed iframe with CSP.'
            : 'Set sandbox origin and CSP before enabling custom code component execution.'
          : 'Custom code components are disabled; fallback and registry metadata remain available.',
      },
    ]),
  ];
};

const getInfrastructureStatusCounts = (diagnostics: ReturnType<typeof buildInfrastructureDiagnostics>) => ({
  ready: diagnostics.filter((diagnostic) => diagnostic.status === 'ready').length,
  warning: diagnostics.filter((diagnostic) => diagnostic.status === 'warning').length,
  blocked: diagnostics.filter((diagnostic) => diagnostic.status === 'blocked').length,
});

const getInfrastructureOverallStatus = (diagnostics: ReturnType<typeof buildInfrastructureDiagnostics>) => {
  const counts = getInfrastructureStatusCounts(diagnostics);
  if (counts.blocked > 0) return 'blocked';
  if (counts.warning > 0) return 'warning';
  return 'ready';
};

const buildDeploymentHistoryEntry = ({
  integrations,
  diagnostics,
  requestId,
  generatedAt,
}: {
  integrations: BackyJsonObject;
  diagnostics: ReturnType<typeof buildInfrastructureDiagnostics>;
  requestId: string;
  generatedAt: string;
}): BackyJsonObject => {
  const vercel = parseJsonObject(integrations.vercel) || {};
  const counts = getInfrastructureStatusCounts(diagnostics);

  return {
    id: `deploy_check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    checkedAt: generatedAt,
    requestId,
    status: getInfrastructureOverallStatus(diagnostics),
    projectId: stringValue(vercel.projectId),
    productionDomain: stringValue(vercel.productionDomain),
    autoDeploy: boolValue(vercel.autoDeploy),
    previewDeployments: boolValue(vercel.previewDeployments, true),
    readyCount: counts.ready,
    warningCount: counts.warning,
    blockedCount: counts.blocked,
    diagnostics: diagnostics.map((diagnostic) => ({
      area: diagnostic.area,
      label: diagnostic.label,
      status: diagnostic.status,
      summary: diagnostic.summary,
    })) as unknown as BackyJsonValue,
  };
};

const storageRotationFields = (provider: string) => {
  if (provider === 's3') {
    return [
      { name: 'BACKY_S3_ACCESS_KEY_ID', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'])) },
      { name: 'BACKY_S3_SECRET_ACCESS_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'])) },
      { name: 'BACKY_S3_BUCKET', secret: false, required: true, detected: Boolean(envValue(['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET'])) },
      { name: 'BACKY_S3_REGION', secret: false, required: true, detected: Boolean(envValue(['BACKY_S3_REGION', 'AWS_REGION'])) },
      { name: 'BACKY_S3_ENDPOINT', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_ENDPOINT', 'BACKY_STORAGE_ENDPOINT'])) },
    ];
  }

  if (provider === 'supabase') {
    return [
      { name: 'BACKY_SUPABASE_SERVICE_ROLE_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])) },
      { name: 'BACKY_SUPABASE_ANON_KEY', secret: true, required: false, detected: Boolean(envValue(['BACKY_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'])) },
      { name: 'BACKY_SUPABASE_URL', secret: false, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL'])) },
      { name: 'BACKY_SUPABASE_STORAGE_BUCKET', secret: false, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET'])) },
    ];
  }

  return [
    { name: 'BACKY_LOCAL_UPLOADS_DIR', secret: false, required: false, detected: Boolean(envValue(['BACKY_LOCAL_UPLOADS_DIR', 'BACKY_STORAGE_LOCAL_PATH'])) },
    { name: 'BACKY_LOCAL_PUBLIC_URL', secret: false, required: false, detected: Boolean(envValue(['BACKY_LOCAL_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL'])) },
  ];
};

const storageRotationCandidateFields = (provider: string) => {
  if (provider === 's3') {
    return [
      { name: 'BACKY_S3_NEXT_ACCESS_KEY_ID', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_NEXT_ACCESS_KEY_ID', 'AWS_NEXT_ACCESS_KEY_ID'])) },
      { name: 'BACKY_S3_NEXT_SECRET_ACCESS_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_NEXT_SECRET_ACCESS_KEY', 'AWS_NEXT_SECRET_ACCESS_KEY'])) },
      { name: 'BACKY_S3_NEXT_BUCKET', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_NEXT_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET'])) },
      { name: 'BACKY_S3_NEXT_REGION', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_NEXT_REGION', 'AWS_NEXT_REGION'])) },
      { name: 'BACKY_S3_NEXT_ENDPOINT', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_NEXT_ENDPOINT', 'BACKY_NEXT_STORAGE_ENDPOINT'])) },
      { name: 'BACKY_S3_NEXT_PUBLIC_URL', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_NEXT_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL'])) },
    ];
  }

  if (provider === 'supabase') {
    return [
      { name: 'BACKY_SUPABASE_NEXT_URL', secret: false, required: false, detected: Boolean(envValue(['BACKY_SUPABASE_NEXT_URL', 'SUPABASE_NEXT_URL'])) },
      { name: 'BACKY_SUPABASE_NEXT_SERVICE_ROLE_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_NEXT_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_NEXT_ANON_KEY', 'SUPABASE_NEXT_SERVICE_ROLE_KEY', 'SUPABASE_NEXT_ANON_KEY'])) },
      { name: 'BACKY_SUPABASE_NEXT_STORAGE_BUCKET', secret: false, required: false, detected: Boolean(envValue(['BACKY_SUPABASE_NEXT_STORAGE_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET'])) },
    ];
  }

  return [
    { name: 'BACKY_NEXT_LOCAL_UPLOADS_DIR', secret: false, required: false, detected: Boolean(envValue(['BACKY_NEXT_LOCAL_UPLOADS_DIR', 'BACKY_NEXT_STORAGE_LOCAL_PATH'])) },
    { name: 'BACKY_NEXT_LOCAL_PUBLIC_URL', secret: false, required: false, detected: Boolean(envValue(['BACKY_NEXT_LOCAL_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL'])) },
  ];
};

const storageSecretManagerMappings = (provider: string): Array<{
  sourceNames: string[];
  targetName: string;
  secret: boolean;
  required: boolean;
}> => {
  if (provider === 's3') {
    return [
      { sourceNames: ['BACKY_S3_NEXT_ACCESS_KEY_ID', 'AWS_NEXT_ACCESS_KEY_ID'], targetName: 'BACKY_S3_ACCESS_KEY_ID', secret: true, required: true },
      { sourceNames: ['BACKY_S3_NEXT_SECRET_ACCESS_KEY', 'AWS_NEXT_SECRET_ACCESS_KEY'], targetName: 'BACKY_S3_SECRET_ACCESS_KEY', secret: true, required: true },
      { sourceNames: ['BACKY_S3_NEXT_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET'], targetName: 'BACKY_S3_BUCKET', secret: false, required: false },
      { sourceNames: ['BACKY_S3_NEXT_REGION', 'AWS_NEXT_REGION'], targetName: 'BACKY_S3_REGION', secret: false, required: false },
      { sourceNames: ['BACKY_S3_NEXT_ENDPOINT', 'BACKY_NEXT_STORAGE_ENDPOINT'], targetName: 'BACKY_S3_ENDPOINT', secret: false, required: false },
      { sourceNames: ['BACKY_S3_NEXT_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL'], targetName: 'BACKY_S3_PUBLIC_URL', secret: false, required: false },
    ];
  }

  if (provider === 'supabase') {
    return [
      { sourceNames: ['BACKY_SUPABASE_NEXT_URL', 'SUPABASE_NEXT_URL'], targetName: 'BACKY_SUPABASE_URL', secret: false, required: false },
      { sourceNames: ['BACKY_SUPABASE_NEXT_SERVICE_ROLE_KEY', 'SUPABASE_NEXT_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_NEXT_ANON_KEY', 'SUPABASE_NEXT_ANON_KEY'], targetName: 'BACKY_SUPABASE_SERVICE_ROLE_KEY', secret: true, required: true },
      { sourceNames: ['BACKY_SUPABASE_NEXT_STORAGE_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET'], targetName: 'BACKY_SUPABASE_STORAGE_BUCKET', secret: false, required: false },
    ];
  }

  return [
    { sourceNames: ['BACKY_NEXT_LOCAL_UPLOADS_DIR', 'BACKY_NEXT_STORAGE_LOCAL_PATH'], targetName: 'BACKY_LOCAL_UPLOADS_DIR', secret: false, required: false },
    { sourceNames: ['BACKY_NEXT_LOCAL_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL'], targetName: 'BACKY_LOCAL_PUBLIC_URL', secret: false, required: false },
  ];
};

const buildStorageRotationCandidateEnv = (provider: string): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...process.env };
  if (provider === 's3') {
    env.BACKY_STORAGE_PROVIDER = 's3';
    env.BACKY_S3_ACCESS_KEY_ID = envValue(['BACKY_S3_NEXT_ACCESS_KEY_ID', 'AWS_NEXT_ACCESS_KEY_ID']) || env.BACKY_S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
    env.BACKY_S3_SECRET_ACCESS_KEY = envValue(['BACKY_S3_NEXT_SECRET_ACCESS_KEY', 'AWS_NEXT_SECRET_ACCESS_KEY']) || env.BACKY_S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;
    env.BACKY_S3_BUCKET = envValue(['BACKY_S3_NEXT_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET']) || env.BACKY_S3_BUCKET || env.BACKY_STORAGE_BUCKET;
    env.BACKY_S3_REGION = envValue(['BACKY_S3_NEXT_REGION', 'AWS_NEXT_REGION']) || env.BACKY_S3_REGION || env.AWS_REGION;
    env.BACKY_S3_ENDPOINT = envValue(['BACKY_S3_NEXT_ENDPOINT', 'BACKY_NEXT_STORAGE_ENDPOINT']) || env.BACKY_S3_ENDPOINT || env.BACKY_STORAGE_ENDPOINT;
    env.BACKY_S3_PUBLIC_URL = envValue(['BACKY_S3_NEXT_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL']) || env.BACKY_S3_PUBLIC_URL || env.BACKY_MEDIA_PUBLIC_URL;
    env.BACKY_S3_FORCE_PATH_STYLE = envValue(['BACKY_S3_NEXT_FORCE_PATH_STYLE']) || env.BACKY_S3_FORCE_PATH_STYLE;
    return env;
  }

  if (provider === 'supabase') {
    env.BACKY_STORAGE_PROVIDER = 'supabase';
    env.BACKY_SUPABASE_URL = envValue(['BACKY_SUPABASE_NEXT_URL', 'SUPABASE_NEXT_URL']) || env.BACKY_SUPABASE_URL || env.SUPABASE_URL;
    env.BACKY_SUPABASE_SERVICE_ROLE_KEY = envValue(['BACKY_SUPABASE_NEXT_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_NEXT_ANON_KEY', 'SUPABASE_NEXT_SERVICE_ROLE_KEY', 'SUPABASE_NEXT_ANON_KEY']) || env.BACKY_SUPABASE_SERVICE_ROLE_KEY || env.BACKY_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
    env.BACKY_SUPABASE_STORAGE_BUCKET = envValue(['BACKY_SUPABASE_NEXT_STORAGE_BUCKET', 'BACKY_NEXT_STORAGE_BUCKET']) || env.BACKY_SUPABASE_STORAGE_BUCKET || env.BACKY_STORAGE_BUCKET;
    return env;
  }

  env.BACKY_STORAGE_PROVIDER = 'local';
  env.BACKY_LOCAL_UPLOADS_DIR = envValue(['BACKY_NEXT_LOCAL_UPLOADS_DIR', 'BACKY_NEXT_STORAGE_LOCAL_PATH']) || env.BACKY_LOCAL_UPLOADS_DIR || env.BACKY_STORAGE_LOCAL_PATH;
  env.BACKY_LOCAL_PUBLIC_URL = envValue(['BACKY_NEXT_LOCAL_PUBLIC_URL', 'BACKY_NEXT_MEDIA_PUBLIC_URL']) || env.BACKY_LOCAL_PUBLIC_URL || env.BACKY_MEDIA_PUBLIC_URL;
  return env;
};

const hasStorageRotationCandidate = (provider: string) => (
  storageRotationCandidateFields(provider).some((field) => field.detected)
);

type ResolvedMediaStorage = ReturnType<typeof resolveMediaStorageConfig>;

const getStoragePolicySettings = (settings: AdminSettingsSource): BackyJsonObject => {
  const integrations = parseJsonObject(settings.integrations) || {};
  return parseJsonObject(integrations.storage) || {};
};

const runStorageLifecyclePolicyAutomation = async (
  settings: AdminSettingsSource,
  resolved: ResolvedMediaStorage = resolveMediaStorageConfig(),
): Promise<StorageLifecyclePolicyAutomation> => {
  const storage = getStoragePolicySettings(settings);
  const enabled = boolValue(storage.lifecyclePolicyEnabled);
  const tempRetentionDays = Math.max(1, Math.min(365, Math.round(numberValue(storage.lifecycleTempRetentionDays, 7))));
  const noncurrentVersionDays = Math.max(1, Math.min(3650, Math.round(numberValue(storage.lifecycleNoncurrentVersionDays, 90))));
  const target = resolved.summary.bucket || resolved.summary.basePath || 'storage container';

  if (!enabled) {
    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'blocked',
      applied: false,
      checked: false,
      target,
      detail: 'Lifecycle policy automation is disabled in Media storage settings.',
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  }

  if (!resolved.config) {
    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'blocked',
      applied: false,
      checked: false,
      target,
      detail: resolved.summary.error || `Missing ${resolved.summary.missing.join(', ') || 'storage configuration'}.`,
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  }

  if (resolved.config.provider === 'local') {
    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'ready',
      applied: false,
      checked: true,
      target,
      detail: 'Local storage lifecycle is managed by filesystem cleanup; no provider-native lifecycle policy is available.',
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  }

  if (resolved.config.provider === 'supabase') {
    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'blocked',
      applied: false,
      checked: true,
      target,
      detail: 'Supabase Storage lifecycle automation is not available through the current storage client; configure retention from the Supabase project or scheduled cleanup worker.',
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  }

  try {
    const s3Module = await optionalRuntimeImport<{
      S3Client: new (input: Record<string, unknown>) => { send: (command: unknown) => Promise<unknown> };
      PutBucketLifecycleConfigurationCommand: new (input: Record<string, unknown>) => unknown;
    }>('@aws-sdk/client-s3');
    const { S3Client, PutBucketLifecycleConfigurationCommand } = s3Module;
    const config = resolved.config;
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });

    await client.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: config.bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'backy-internal-probe-cleanup',
            Status: 'Enabled',
            Filter: { Prefix: 'sites/_backy/' },
            Expiration: { Days: tempRetentionDays },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: Math.min(tempRetentionDays, 7) },
          },
          {
            ID: 'backy-noncurrent-media-version-retention',
            Status: 'Enabled',
            Filter: { Prefix: 'sites/' },
            NoncurrentVersionExpiration: { NoncurrentDays: noncurrentVersionDays },
          },
        ],
      },
    }));

    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'ready',
      applied: true,
      checked: true,
      target: config.bucket,
      detail: `S3-compatible lifecycle policy applied to bucket "${config.bucket}".`,
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  } catch (error) {
    return {
      provider: resolved.summary.provider,
      action: 'apply-lifecycle-policy',
      status: 'blocked',
      applied: false,
      checked: false,
      target,
      detail: error instanceof Error ? error.message : 'S3 lifecycle policy automation failed.',
      policy: {
        tempRetentionDays,
        noncurrentVersionDays,
      },
    };
  }
};

const dateBefore = (value: unknown, cutoff: Date): boolean => {
  const timestamp = typeof value === 'string' || typeof value === 'number' || value instanceof Date
    ? new Date(value).getTime()
    : Number.NaN;
  return Number.isFinite(timestamp) && timestamp < cutoff.getTime();
};

const replacementVersionsFromMetadata = (metadata: MediaItem['metadata'] | undefined): Record<string, unknown>[] => (
  metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions.filter((version): version is Record<string, unknown> => (
        !!version && typeof version === 'object' && !Array.isArray(version)
      ))
    : []
);

const removeReplacementVersions = (
  metadata: MediaItem['metadata'] | undefined,
  removedIds: Set<string>,
): MediaItem['metadata'] => {
  const nextVersions = replacementVersionsFromMetadata(metadata).filter((version) => (
    typeof version.id !== 'string' || !removedIds.has(version.id)
  ));
  return {
    ...(metadata || {}),
    replacementVersions: nextVersions,
    replacementCount: nextVersions.length,
  };
};

const safeLifecycleStoragePath = (siteId: string | undefined, value: unknown): string | null => {
  const path = typeof value === 'string' ? value.trim() : '';
  if (!path) return null;
  if (path.startsWith('sites/_backy/')) return path;
  if (siteId && path.startsWith(`sites/${siteId}/`)) return path;
  return null;
};

const mediaVersionStoragePath = (siteId: string, version: Record<string, unknown> | MediaVersion): string | null => (
  safeLifecycleStoragePath(siteId, 'storagePath' in version ? version.storagePath : null)
);

const runStorageLifecycleCleanup = async (input: {
  settings: AdminSettingsSource;
  siteId?: string;
  dryRun?: boolean;
}): Promise<StorageLifecycleCleanupResult> => {
  const resolved = resolveMediaStorageConfig();
  const storage = getStoragePolicySettings(input.settings);
  const tempRetentionDays = Math.max(1, Math.min(365, Math.round(numberValue(storage.lifecycleTempRetentionDays, 7))));
  const noncurrentVersionDays = Math.max(1, Math.min(3650, Math.round(numberValue(storage.lifecycleNoncurrentVersionDays, 90))));
  const probeCutoff = new Date(Date.now() - tempRetentionDays * 24 * 60 * 60 * 1000);
  const retainedCutoff = new Date(Date.now() - noncurrentVersionDays * 24 * 60 * 60 * 1000);
  const result: StorageLifecycleCleanupResult = {
    provider: resolved.summary.provider,
    action: 'cleanup-expired-storage',
    status: 'ready',
    dryRun: input.dryRun !== false,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    cutoff: {
      probeObjectsBefore: probeCutoff.toISOString(),
      ...(input.siteId ? { retainedVersionsBefore: retainedCutoff.toISOString() } : {}),
    },
    deleted: {
      probeObjects: 0,
      retainedVersions: 0,
      storageObjects: 0,
    },
    candidates: {
      probeObjects: 0,
      retainedVersions: 0,
    },
    errors: [],
    detail: '',
  };

  if (!resolved.config) {
    return {
      ...result,
      status: 'blocked',
      detail: resolved.summary.error || `Missing ${resolved.summary.missing.join(', ') || 'storage configuration'}.`,
    };
  }

  const adapter = await getMediaStorageAdapter();
  const deleteStoragePath = async (path: string, kind: 'probe' | 'version') => {
    if (result.dryRun) return;
    try {
      await adapter.delete(path);
      result.deleted.storageObjects += 1;
      if (kind === 'probe') result.deleted.probeObjects += 1;
    } catch (error) {
      result.errors.push(`${path}: ${error instanceof Error ? error.message : 'delete failed'}`);
    }
  };

  for (const prefix of ['sites/_backy/provisioning', 'sites/_backy/rotation']) {
    try {
      const objects = await adapter.list(prefix);
      const expired = objects.filter((item) => (
        safeLifecycleStoragePath(undefined, item.path) && dateBefore(item.lastModified, probeCutoff)
      ));
      result.candidates.probeObjects += expired.length;
      for (const item of expired) {
        const path = safeLifecycleStoragePath(undefined, item.path);
        if (path) await deleteStoragePath(path, 'probe');
      }
    } catch (error) {
      result.errors.push(`${prefix}: ${error instanceof Error ? error.message : 'list failed'}`);
    }
  }

  if (input.siteId) {
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(input.siteId) || await repositories.sites.getBySlug(input.siteId);
      if (site) {
        const media = (await repositories.media.list({
          siteId: site.id,
          type: 'all',
          visibility: 'all',
          limit: 10000,
          offset: 0,
        })).items;
        for (const item of media) {
          const removedIds = new Set<string>();
          const metadataVersions = replacementVersionsFromMetadata(item.metadata).filter((version) => (
            typeof version.id === 'string' && dateBefore(version.replacedAt || version.createdAt, retainedCutoff)
          ));
          const repositoryVersions = (await repositories.media.listVersions({
            siteId: site.id,
            mediaId: item.id,
            limit: 10000,
            offset: 0,
          })).items.filter((version) => dateBefore(version.replacedAt || version.createdAt, retainedCutoff));

          result.candidates.retainedVersions += metadataVersions.length + repositoryVersions.length;

          for (const version of [...metadataVersions, ...repositoryVersions]) {
            const versionId = typeof version.id === 'string' ? version.id : '';
            const path = mediaVersionStoragePath(site.id, version);
            if (versionId) removedIds.add(versionId);
            if (path) await deleteStoragePath(path, 'version');
            if (!result.dryRun && 'mediaId' in version && versionId) {
              await repositories.media.deleteVersion({ siteId: site.id, mediaId: item.id, versionId });
              result.deleted.retainedVersions += 1;
            } else if (!result.dryRun && !('mediaId' in version)) {
              result.deleted.retainedVersions += 1;
            }
          }

          if (!result.dryRun && removedIds.size > 0) {
            await repositories.media.update(site.id, item.id, {
              metadata: removeReplacementVersions(item.metadata, removedIds),
            });
          }
        }
      }
    } else {
      const site = getSiteByIdOrSlug(input.siteId);
      if (site) {
        const media = getMediaList(site.id, { limit: 10000, offset: 0 }).media;
        for (const item of media) {
          const expiredVersions = replacementVersionsFromMetadata(item.metadata).filter((version) => (
            typeof version.id === 'string' && dateBefore(version.replacedAt || version.createdAt, retainedCutoff)
          ));
          result.candidates.retainedVersions += expiredVersions.length;
          const removedIds = new Set(expiredVersions.map((version) => String(version.id)));
          for (const version of expiredVersions) {
            const path = mediaVersionStoragePath(site.id, version);
            if (path) await deleteStoragePath(path, 'version');
            if (!result.dryRun) result.deleted.retainedVersions += 1;
          }
          if (!result.dryRun && removedIds.size > 0) {
            updateMediaItem(site.id, item.id, {
              metadata: removeReplacementVersions(item.metadata, removedIds),
            });
          }
        }
      }
    }
  }

  const failed = result.errors.length > 0;
  return {
    ...result,
    status: failed ? 'blocked' : 'ready',
    detail: result.dryRun
      ? `Lifecycle cleanup preview found ${result.candidates.probeObjects} probe objects and ${result.candidates.retainedVersions} retained versions eligible for cleanup.`
      : `Lifecycle cleanup removed ${result.deleted.probeObjects} probe objects, ${result.deleted.retainedVersions} retained versions, and ${result.deleted.storageObjects} storage objects.`,
  };
};

const runStorageContainerAutomation = async (
  resolved: ResolvedMediaStorage = resolveMediaStorageConfig(),
): Promise<StorageProvisioningAutomation> => {
  const { config, summary } = resolved;
  const provider = summary.provider;
  const target = provider === 'local'
    ? summary.basePath || 'local uploads directory'
    : summary.bucket || 'storage bucket';

  if (!config) {
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'blocked',
      created: false,
      checked: false,
      target,
      detail: summary.error || `Missing ${summary.missing.join(', ') || 'storage configuration'}.`,
    };
  }

  if (config.provider === 'local') {
    await mkdir(config.basePath, { recursive: true });
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'ready',
      created: true,
      checked: true,
      target: config.basePath,
      detail: 'Local media storage directory is present and ready for file writes.',
    };
  }

  if (config.provider === 'supabase') {
    try {
      const { createClient } = await optionalRuntimeImport<{
        createClient: typeof import('@supabase/supabase-js').createClient;
      }>('@supabase/supabase-js');
      const supabase = createClient(config.url, config.key);
      const existing = await supabase.storage.getBucket(config.bucket);
      if (!existing.error) {
        return {
          provider,
          action: 'create-or-verify-container',
          status: 'ready',
          created: false,
          checked: true,
          target: config.bucket,
          detail: `Supabase Storage bucket "${config.bucket}" already exists.`,
        };
      }

      const created = await supabase.storage.createBucket(config.bucket, {
        public: false,
        fileSizeLimit: undefined,
      });
      if (created.error) {
        return {
          provider,
          action: 'create-or-verify-container',
          status: 'blocked',
          created: false,
          checked: true,
          target: config.bucket,
          detail: `Supabase bucket automation failed: ${created.error.message}`,
        };
      }

      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: true,
        checked: true,
        target: config.bucket,
        detail: `Supabase Storage bucket "${config.bucket}" was created.`,
      };
    } catch (error) {
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'blocked',
        created: false,
        checked: false,
        target: config.bucket,
        detail: error instanceof Error ? error.message : 'Supabase bucket automation failed.',
      };
    }
  }

  try {
    const s3Module = await optionalRuntimeImport<{
      S3Client: new (input: Record<string, unknown>) => { send: (command: unknown) => Promise<unknown> };
      CreateBucketCommand: new (input: Record<string, unknown>) => unknown;
      HeadBucketCommand: new (input: Record<string, unknown>) => unknown;
    }>('@aws-sdk/client-s3');
    const { S3Client, CreateBucketCommand, HeadBucketCommand } = s3Module;
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: false,
        checked: true,
        target: config.bucket,
        detail: `S3-compatible bucket "${config.bucket}" already exists and is accessible.`,
      };
    } catch {
      await client.send(new CreateBucketCommand({
        Bucket: config.bucket,
        ...(config.region && config.region !== 'us-east-1'
          ? { CreateBucketConfiguration: { LocationConstraint: config.region } }
          : {}),
      }));
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: true,
        checked: true,
        target: config.bucket,
        detail: `S3-compatible bucket "${config.bucket}" was created and verified.`,
      };
    }
  } catch (error) {
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'blocked',
      created: false,
      checked: false,
      target: config.bucket,
      detail: error instanceof Error ? error.message : 'S3 bucket automation failed.',
    };
  }
};

const runStorageOperationChecks = async (input: {
  adapter: Awaited<ReturnType<typeof createStorageAdapter>>;
  probePath: string;
  probeBody: Buffer;
}): Promise<StorageProvisioningCheck[]> => {
  const checks: StorageProvisioningCheck[] = [];
  const upload = await input.adapter.upload(input.probeBody, {
    path: input.probePath,
    filename: input.probePath.split('/').pop() || 'probe.txt',
    mimeType: 'text/plain',
    metadata: {
      source: 'backy-media-storage-probe',
    },
  });
  checks.push({
    label: 'Probe upload',
    ready: upload.path === input.probePath,
    detail: upload.path === input.probePath
      ? `Probe object uploaded to ${input.probePath}.`
      : `Probe uploaded to ${upload.path}.`,
  });

  const readBuffer = await input.adapter.read(input.probePath);
  checks.push({
    label: 'Readback',
    ready: readBuffer.equals(input.probeBody),
    detail: readBuffer.equals(input.probeBody)
      ? 'Probe object was read back with matching bytes.'
      : 'Probe readback bytes did not match the uploaded content.',
  });

  const stat = await input.adapter.stat(input.probePath);
  checks.push({
    label: 'Object metadata',
    ready: Boolean(stat && stat.size === input.probeBody.length),
    detail: stat
      ? `Provider returned object metadata (${stat.size} bytes).`
      : 'Provider did not return object metadata for the probe.',
  });

  const prefix = input.probePath.split('/').slice(0, -1).join('/');
  const listed = await input.adapter.list(prefix);
  checks.push({
    label: 'Bucket listing',
    ready: listed.some((item) => item.path === input.probePath),
    detail: listed.some((item) => item.path === input.probePath)
      ? 'Provider list operation can see the probe object.'
      : 'Provider list operation did not include the probe object.',
  });

  await input.adapter.delete(input.probePath);
  const existsAfterDelete = await input.adapter.exists(input.probePath);
  checks.push({
    label: 'Probe cleanup',
    ready: !existsAfterDelete,
    detail: existsAfterDelete
      ? 'Probe object still exists after delete.'
      : 'Probe object cleaned up successfully.',
  });

  return checks;
};

const runMediaStorageCredentialRotationProbe = async (
  requestId: string,
  provider: string,
): Promise<StorageCredentialRotationProbe> => {
  const fields = storageRotationCandidateFields(provider);
  const probePath = `sites/_backy/rotation/${requestId}.txt`;
  const probeBody = Buffer.from(`backy media storage rotation probe ${requestId}\n`, 'utf8');
  const nextSteps = [
    'Provision the replacement provider credential in the storage provider account.',
    'Expose the replacement credential through BACKY_*_NEXT_* environment variables.',
    'Run this rotation probe and confirm it reaches ready.',
    'Promote the replacement credential to the active BACKY_* storage variables.',
    'Redeploy or restart Backy, run the provisioning probe once more, then revoke the old provider credential.',
  ];

  if (!hasStorageRotationCandidate(provider)) {
    return {
      status: 'blocked',
      summary: 'No replacement storage credential environment variables were detected for a rotation probe.',
      probePath,
      fields,
      checks: [
        {
          label: 'Replacement credential',
          ready: false,
          detail: 'Set the provider-specific BACKY_*_NEXT_* environment variables before probing credential rotation.',
        },
      ],
      nextSteps,
    };
  }

  const candidate = resolveMediaStorageConfig(buildStorageRotationCandidateEnv(provider));
  if (!candidate.config) {
    return {
      status: 'blocked',
      summary: 'Replacement storage credential is incomplete.',
      probePath,
      fields,
      checks: [
        {
          label: 'Replacement configuration',
          ready: false,
          detail: candidate.summary.error || `Missing ${candidate.summary.missing.join(', ') || 'storage configuration'}.`,
        },
      ],
      nextSteps,
    };
  }

  const automation = await runStorageContainerAutomation(candidate);
  const checks: StorageProvisioningCheck[] = [
    {
      label: 'Replacement configuration',
      ready: candidate.summary.configured,
      detail: `${candidate.summary.provider} replacement storage configuration resolved without exposing credential values.`,
    },
    {
      label: 'Replacement container',
      ready: automation.status === 'ready',
      detail: automation.detail,
    },
  ];

  if (automation.status !== 'ready') {
    return {
      status: 'blocked',
      summary: 'Replacement credential was detected, but its storage container could not be verified.',
      probePath,
      fields,
      checks,
      nextSteps,
    };
  }

  try {
    const adapter = await createStorageAdapter(candidate.config);
    checks.push(...await runStorageOperationChecks({ adapter, probePath, probeBody }));
  } catch (error) {
    checks.push({
      label: 'Replacement provider operation',
      ready: false,
      detail: error instanceof Error ? error.message : 'Replacement credential provider operation failed.',
    });
  }

  const blocked = checks.some((check) => !check.ready);
  return {
    status: blocked ? 'blocked' : 'ready',
    summary: blocked
      ? 'Replacement credential was detected, but one or more rotation checks failed.'
      : 'Replacement credential can create or verify the storage container and complete upload, readback, metadata, listing, and cleanup operations.',
    probePath,
    fields,
    checks,
    nextSteps,
  };
};

const vercelSecretManagerConfig = () => {
  const runtime = getVercelRuntimeSummary();
  const apiBaseUrl = envValue(['BACKY_VERCEL_API_BASE_URL', 'VERCEL_API_BASE_URL']) || 'https://api.vercel.com';
  return {
    token: envValue(['VERCEL_TOKEN', 'BACKY_VERCEL_TOKEN']),
    projectId: runtime.projectId || envValue(['VERCEL_PROJECT_ID', 'BACKY_VERCEL_PROJECT_ID']),
    teamId: runtime.teamId || envValue(['VERCEL_TEAM_ID', 'BACKY_VERCEL_TEAM_ID']),
    apiBaseUrl,
  };
};

const vercelProjectEnvUrl = (projectId: string, path = '', version: 'v9' | 'v10' = 'v9') => {
  const { apiBaseUrl, teamId } = vercelSecretManagerConfig();
  const url = new URL(`/${version}/projects/${encodeURIComponent(projectId)}/env${path}`, apiBaseUrl);
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }
  return url;
};

const vercelEnvRequest = async (
  url: URL | string,
  init: RequestInit,
): Promise<unknown> => {
  const { token } = vercelSecretManagerConfig();
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = parseJsonObject(payload)?.error
      ? stringValue(parseJsonObject(parseJsonObject(payload)?.error)?.message)
      : '';
    throw new Error(message || `Vercel environment API returned ${response.status}`);
  }
  return payload;
};

const listVercelEnvVariables = async (projectId: string): Promise<Array<{ id: string; key: string }>> => {
  const payload = parseJsonObject(await vercelEnvRequest(vercelProjectEnvUrl(projectId, '', 'v10'), { method: 'GET' })) || {};
  const envs = Array.isArray(payload.envs) ? payload.envs : [];
  return envs
    .map((item) => parseJsonObject(item))
    .filter((item): item is BackyJsonObject => Boolean(item))
    .map((item) => ({
      id: stringValue(item.id),
      key: stringValue(item.key),
    }))
    .filter((item) => item.id && item.key);
};

const deleteVercelEnvKey = async (projectId: string, key: string, existing?: Array<{ id: string; key: string }>) => {
  const envs = existing || await listVercelEnvVariables(projectId);
  const matches = envs.filter((env) => env.key === key);
  for (const env of matches) {
    await vercelEnvRequest(vercelProjectEnvUrl(projectId, `/${encodeURIComponent(env.id)}`), { method: 'DELETE' });
  }
  return matches.length;
};

const createVercelEnvKey = async (
  projectId: string,
  input: {
    key: string;
    value: string;
    secret: boolean;
    targetEnvironments: string[];
  },
) => {
  const { apiBaseUrl, teamId } = vercelSecretManagerConfig();
  const url = new URL(`/v10/projects/${encodeURIComponent(projectId)}/env`, apiBaseUrl);
  url.searchParams.set('upsert', 'true');
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }
  const payload = await vercelEnvRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      key: input.key,
      value: input.value,
      type: input.secret ? 'sensitive' : 'plain',
      target: input.targetEnvironments,
    }),
  });
  const failed = parseJsonObject(payload)?.failed;
  if (Array.isArray(failed) && failed.length > 0) {
    const firstFailure = parseJsonObject(failed[0]) || {};
    throw new Error(stringValue(firstFailure.error) || stringValue(firstFailure.reason) || `Vercel could not upsert ${input.key}.`);
  }
};

const runMediaStorageSecretManager = async (input: {
  provider: string;
  mode: StorageSecretManagerMode;
  dryRun: boolean;
  targetEnvironments?: string[];
}): Promise<StorageSecretManagerResult> => {
  const { token, projectId, teamId } = vercelSecretManagerConfig();
  const targetEnvironments = (input.targetEnvironments?.length ? input.targetEnvironments : ['production', 'preview'])
    .filter((target) => ['production', 'preview', 'development'].includes(target));
  const mappings = storageSecretManagerMappings(input.provider);
  const managerChecks: StorageProvisioningCheck[] = [
    {
      label: 'Vercel project',
      ready: Boolean(projectId),
      detail: projectId
        ? 'Vercel project id resolved from runtime environment.'
        : 'Set VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID before executing provider-native secret operations.',
    },
    {
      label: 'Vercel API token',
      ready: Boolean(token),
      detail: token
        ? 'Vercel API token is configured without exposing the token value.'
        : 'Set VERCEL_TOKEN or BACKY_VERCEL_TOKEN before executing provider-native secret operations.',
    },
  ];
  const operations: StorageSecretManagerOperation[] = mappings.map((mapping) => {
    const sourceName = mapping.sourceNames.find((name) => Boolean(process.env[name]));
    const sourceValue = sourceName ? process.env[sourceName] : undefined;
    const ready = input.mode === 'revoke-replacement' ? Boolean(sourceName) || !mapping.required : Boolean(sourceValue) || !mapping.required;
    return {
      action: input.mode === 'revoke-replacement' ? 'delete' : 'upsert',
      name: input.mode === 'revoke-replacement' ? (sourceName || mapping.sourceNames[0]) : mapping.targetName,
      source: input.mode === 'revoke-replacement' ? undefined : sourceName || mapping.sourceNames[0],
      secret: mapping.secret,
      required: mapping.required,
      ready,
      executed: false,
      detail: ready
        ? input.mode === 'revoke-replacement'
          ? `Replacement variable ${sourceName || mapping.sourceNames[0]} is eligible for removal after promotion.`
          : `Replacement value from ${sourceName || mapping.sourceNames[0]} can be promoted to ${mapping.targetName}.`
        : `Missing required replacement value for ${mapping.targetName}.`,
    };
  });
  const missingRequired = operations.some((operation) => operation.required && !operation.ready);
  const secretDevelopmentTarget = targetEnvironments.includes('development') && operations.some((operation) => (
    operation.secret && operation.ready
  ));
  const canExecute = Boolean(projectId && token && !missingRequired && !secretDevelopmentTarget && targetEnvironments.length > 0);
  const nextSteps = [
    'Run the credential rotation probe and confirm the replacement credential reaches ready.',
    'Use this Vercel env manager in dry-run mode to review the create/update/delete operations.',
    'Execute promotion to upsert active BACKY_* storage variables in Vercel.',
    'Redeploy Backy so the runtime picks up promoted storage variables.',
    'Run the provisioning probe again, then revoke the replacement BACKY_*_NEXT_* variables.',
  ];

  if (!input.dryRun && canExecute && projectId) {
    if (input.mode === 'promote') {
      for (const operation of operations.filter((operation) => operation.ready)) {
        const mapping = mappings.find((item) => item.targetName === operation.name);
        const sourceName = mapping?.sourceNames.find((name) => Boolean(process.env[name]));
        const sourceValue = sourceName ? process.env[sourceName] : undefined;
        if (!sourceValue || !mapping) continue;
        await createVercelEnvKey(projectId, {
          key: operation.name,
          value: sourceValue,
          secret: operation.secret,
          targetEnvironments,
        });
        operation.executed = true;
        operation.detail = `${operation.name} was upserted in Vercel for ${targetEnvironments.join(', ')}.`;
      }
    } else if (input.mode === 'revoke-replacement') {
      const existing = await listVercelEnvVariables(projectId);
      for (const operation of operations.filter((operation) => operation.ready)) {
        const deleted = await deleteVercelEnvKey(projectId, operation.name, existing);
        operation.executed = deleted > 0;
        operation.detail = deleted > 0
          ? `${operation.name} was removed from Vercel.`
          : `${operation.name} was not present in Vercel.`;
      }
    }
  }

  const executed = operations.some((operation) => operation.executed);
  const blocked = missingRequired || (!input.dryRun && !canExecute);
  return {
    provider: input.provider,
    secretManager: 'vercel-env',
    mode: input.mode,
    dryRun: input.dryRun,
    status: blocked ? 'blocked' : 'ready',
    executed,
    projectId,
    teamId,
    targetEnvironments,
    summary: input.dryRun
      ? 'Vercel environment secret manager plan generated without writing secret values.'
      : blocked
        ? 'Vercel environment secret manager could not execute because configuration or replacement values are missing.'
        : executed
          ? 'Vercel environment secret manager executed the requested storage credential operation.'
          : 'Vercel environment secret manager completed without changes.',
    checks: [
      ...managerChecks,
      {
        label: 'Replacement values',
        ready: !missingRequired,
        detail: missingRequired
          ? 'One or more required replacement variables are missing.'
          : 'Required replacement variables are present or not required for this operation.',
      },
      {
        label: 'Target environments',
        ready: targetEnvironments.length > 0 && !secretDevelopmentTarget,
        detail: secretDevelopmentTarget
          ? 'Storage secrets are promoted as Vercel sensitive environment variables, which must target production and/or preview only.'
          : targetEnvironments.length > 0
            ? `Targeting ${targetEnvironments.join(', ')}.`
          : 'Select at least one Vercel environment target.',
      },
    ],
    operations,
    nextSteps,
    generatedAt: new Date().toISOString(),
  };
};

const getSettingsForStorageProbe = async (): Promise<AdminSettingsSource> => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    return repositories.settings.get();
  }

  return getAdminSettings();
};

const runMediaStorageProvisioningProbe = async (requestId: string, siteId?: string) => {
  const settings = await getSettingsForStorageProbe();
  const resolved = resolveMediaStorageConfig();
  const summary = resolved.summary;
  const storagePolicy = getStoragePolicySettings(settings);
  const secretReferences = buildStorageSecretReferenceProbe(storagePolicy, summary.provider);
  const lifecyclePolicyRequested = boolValue(storagePolicy.lifecyclePolicyEnabled);
  const automation = await runStorageContainerAutomation(resolved);
  const lifecyclePolicy = await runStorageLifecyclePolicyAutomation(settings, resolved);
  const lifecycleCleanup = await runStorageLifecycleCleanup({
    settings,
    siteId,
    dryRun: !lifecyclePolicyRequested,
  });
  const credentialRotation = await runMediaStorageCredentialRotationProbe(requestId, summary.provider);
  const checks: StorageProvisioningCheck[] = [
    {
      label: 'Runtime configuration',
      ready: summary.configured,
      detail: summary.configured
        ? `${summary.provider} storage runtime is configured.`
        : summary.error || `Missing ${summary.missing.join(', ') || 'storage configuration'}.`,
    },
  ];
  const probePath = `sites/_backy/provisioning/${requestId}.txt`;
  const probeBody = Buffer.from(`backy media storage probe ${requestId}\n`, 'utf8');

  if (!summary.configured) {
    return {
      provider: summary.provider,
      status: 'blocked' as StorageProvisioningStatus,
      summary: 'Storage runtime is not configured enough to run a provisioning probe.',
      runtimeStorage: summary,
      probePath,
      automation,
      lifecyclePolicy,
      lifecycleCleanup,
      secretReferences,
      checks,
      credentialRotation,
      rotation: {
        fields: storageRotationFields(summary.provider),
        nextSteps: [
          'Set the missing server environment variables.',
          'Redeploy or restart the Backy runtime.',
          'Run the provisioning probe again before accepting uploads.',
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const adapter = await getMediaStorageAdapter();
    checks.push(...await runStorageOperationChecks({ adapter, probePath, probeBody }));
  } catch (error) {
    checks.push({
      label: 'Provider operation',
      ready: false,
      detail: error instanceof Error ? error.message : 'Storage provider operation failed.',
    });
  }

  const blocked = checks.some((check) => !check.ready);
  const lifecycleBlocked = lifecyclePolicyRequested && (
    lifecyclePolicy.status === 'blocked' ||
    lifecycleCleanup.status === 'blocked'
  );
  const secretReferenceBlocked = secretReferences.status === 'blocked';
  return {
    provider: summary.provider,
    status: blocked || automation.status === 'blocked' || lifecycleBlocked || secretReferenceBlocked ? 'blocked' as StorageProvisioningStatus : 'ready' as StorageProvisioningStatus,
    summary: blocked
      ? 'Storage provisioning probe found an operation that needs attention.'
      : secretReferenceBlocked
        ? 'Storage secret references need attention before accepting production uploads.'
      : lifecycleBlocked
        ? 'Storage lifecycle policy automation needs attention before accepting production uploads.'
      : automation.status === 'blocked'
        ? 'Storage container automation needs attention before accepting production uploads.'
        : 'Storage container is provisioned and the bucket/path accepts upload, readback, metadata, listing, and cleanup operations.',
    runtimeStorage: summary,
    probePath,
    automation,
    lifecyclePolicy,
    lifecycleCleanup,
    secretReferences,
    checks,
    credentialRotation,
    rotation: {
      fields: storageRotationFields(summary.provider),
      nextSteps: [
        'Create the replacement provider credential with bucket read/write/delete scope.',
        'Update server environment variables with the replacement credential.',
        'Redeploy or restart Backy so the runtime picks up the new credential.',
        'Run this provisioning probe, then revoke the old provider credential.',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
};

const sanitizeSettingsAuditSnapshot = (settings: unknown): BackyJsonObject | undefined => {
  const snapshot = parseJsonObject(settings);
  if (!snapshot) {
    return undefined;
  }

  const apiKeys = parseJsonObject(snapshot.apiKeys);
  return {
    ...snapshot,
    apiKeys: {
      publicConfigured: Boolean(apiKeys?.publicKey || apiKeys?.publicApiKey),
      adminConfigured: Boolean(apiKeys?.secretKeyId || apiKeys?.adminApiKey),
      redacted: true,
    },
    auth: sanitizeAuthForResponse(snapshot.auth) || {},
  };
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'settings.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const settings = await repositories.settings.get();

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...toAdminSettings(getAdminSettings(), { includeAdminApiKey: canExposeAdminApiKey(access) }),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const mediaStoragePatch = isMediaStorageSettingsPatch(body);
  const access = await requireAdminAccess(request, requestId, {
    permission: mediaStoragePatch ? 'media.configure' : 'settings.configure',
  });
  if (access instanceof NextResponse) {
    return access;
  }
  if (body.apiKeys !== undefined) {
    const keyAccess = await requireAdminAccess(request, requestId, {
      permission: 'settings.manageKeys',
    });
    if (keyAccess instanceof NextResponse) {
      return keyAccess;
    }
  }

  try {
    const deliveryMode = body.deliveryMode === undefined
      ? undefined
      : normalizeDeliveryMode(body.deliveryMode);

    if (body.deliveryMode !== undefined && !deliveryMode) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'Delivery mode must be managed-hosting or custom-frontend',
        requestId,
      );
    }

    const storagePolicyError = body.integrations !== undefined
      ? validateStoragePolicySettings(body.integrations)
      : null;
    if (storagePolicyError) {
      return errorResponse(400, 'VALIDATION_ERROR', storagePolicyError, requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const apiKeysInput = body.apiKeys && typeof body.apiKeys === 'object' && !Array.isArray(body.apiKeys)
        ? body.apiKeys as Record<string, unknown>
        : {};
      const storage = parseJsonObject(body.storage);
      const auth = normalizeAdminAuthSettings(body.auth);
      const mergedAuth = auth
        ? {
            ...(beforeSettings.auth || {}),
            ...auth,
          }
        : undefined;
      const integrations = mediaStoragePatch
        ? mergeMediaStorageIntegrations(beforeSettings.integrations, body.integrations)
        : normalizeInfrastructureIntegrations(body.integrations) || parseJsonObject(body.integrations);
      const secretReferenceError = validateSecretReferencePolicy(integrations);
      if (secretReferenceError) {
        return errorResponse(400, 'SECRET_REFERENCE_REQUIRED', secretReferenceError, requestId);
      }
      const infrastructureSettingsError = validateInfrastructureProviderSettings(integrations);
      if (infrastructureSettingsError) {
        return errorResponse(400, 'VALIDATION_ERROR', infrastructureSettingsError, requestId);
      }
      const brandSeoSettingsError = validateBrandSeoSettings(integrations);
      if (brandSeoSettingsError) {
        return errorResponse(400, 'VALIDATION_ERROR', brandSeoSettingsError, requestId);
      }
      const commerceSettingsError = validateCommerceOperationalSettings(integrations);
      if (commerceSettingsError) {
        return errorResponse(400, 'VALIDATION_ERROR', commerceSettingsError, requestId);
      }
      const notificationRecipientError = validateNotificationRecipientSettings(integrations);
      if (notificationRecipientError) {
        return errorResponse(400, 'VALIDATION_ERROR', notificationRecipientError, requestId);
      }
      const commerceEndpointError = validateCommerceProviderEndpoints(integrations);
      if (commerceEndpointError) {
        return errorResponse(400, 'VALIDATION_ERROR', commerceEndpointError, requestId);
      }
      const authPolicyError = body.auth !== undefined ? validateAuthPolicySettings(mergedAuth) : null;
      if (authPolicyError) {
        return errorResponse(400, 'VALIDATION_ERROR', authPolicyError, requestId);
      }
      const settings = (await repositories.settings.update({
        ...(deliveryMode ? { deliveryMode } : {}),
        apiKeys: {
          ...(typeof apiKeysInput.publicApiKey === 'string' ? { publicKey: apiKeysInput.publicApiKey.trim() } : {}),
          ...(typeof apiKeysInput.adminApiKey === 'string' ? { secretKeyId: apiKeysInput.adminApiKey.trim() } : {}),
        },
        ...(storage ? { storage } : {}),
        ...(mergedAuth ? { auth: mergedAuth } : {}),
        ...(integrations ? { integrations } : {}),
      })).item;
      await recordAdminAudit({
        repositories,
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.update',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          changedKeys: Object.keys(body).filter((key) => key !== 'apiKeys'),
          apiKeysChanged: Boolean(body.apiKeys),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const auth = normalizeAdminAuthSettings(body.auth);
    const sanitizedBody = {
      ...body,
      ...(body.auth !== undefined && auth ? { auth } : {}),
    };
    if (body.auth !== undefined && !auth) {
      delete sanitizedBody.auth;
    }
    const integrations = mediaStoragePatch
      ? mergeMediaStorageIntegrations(beforeSettings.integrations, body.integrations)
      : normalizeInfrastructureIntegrations(body.integrations);
    const secretReferenceError = validateSecretReferencePolicy(integrations);
    if (secretReferenceError) {
      return errorResponse(400, 'SECRET_REFERENCE_REQUIRED', secretReferenceError, requestId);
    }
    const infrastructureSettingsError = validateInfrastructureProviderSettings(integrations);
    if (infrastructureSettingsError) {
      return errorResponse(400, 'VALIDATION_ERROR', infrastructureSettingsError, requestId);
    }
    const brandSeoSettingsError = validateBrandSeoSettings(integrations);
    if (brandSeoSettingsError) {
      return errorResponse(400, 'VALIDATION_ERROR', brandSeoSettingsError, requestId);
    }
    const commerceSettingsError = validateCommerceOperationalSettings(integrations);
    if (commerceSettingsError) {
      return errorResponse(400, 'VALIDATION_ERROR', commerceSettingsError, requestId);
    }
    const notificationRecipientError = validateNotificationRecipientSettings(integrations);
    if (notificationRecipientError) {
      return errorResponse(400, 'VALIDATION_ERROR', notificationRecipientError, requestId);
    }
    const commerceEndpointError = validateCommerceProviderEndpoints(integrations);
    if (commerceEndpointError) {
      return errorResponse(400, 'VALIDATION_ERROR', commerceEndpointError, requestId);
    }
    const authPolicyError = body.auth !== undefined ? validateAuthPolicySettings(auth) : null;
    if (authPolicyError) {
      return errorResponse(400, 'VALIDATION_ERROR', authPolicyError, requestId);
    }
    const settings = updateAdminSettings({
      ...sanitizedBody,
      ...(deliveryMode ? { deliveryMode } : {}),
      ...(integrations ? { integrations } : {}),
    });
    await recordAdminAudit({
      entity: 'settings',
      entityId: 'platform',
      action: 'settings.update',
      before: sanitizeSettingsAuditSnapshot(beforeSettings),
      after: sanitizeSettingsAuditSnapshot(settings),
      metadata: {
        changedKeys: Object.keys(body).filter((key) => key !== 'apiKeys'),
        apiKeysChanged: Boolean(body.apiKeys),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  try {
    const body = await parseJsonBody(request);
    const mediaStorageCheck = isMediaStorageInfrastructureCheck(body);
    const mediaStorageProvisioningProbe = body.action === 'media-storage-provisioning-probe';
    const mediaStorageCredentialRotationProbe = body.action === 'media-storage-credential-rotation-probe';
    const mediaStorageSecretManager = body.action === 'media-storage-secret-manager';
    const keyManagementAction = body.action === 'regenerate-api-keys' ||
      body.action === 'issue-admin-api-key' ||
      body.action === 'revoke-admin-api-key';
    const access = await requireAdminAccess(request, requestId, {
      permission: mediaStorageCheck || mediaStorageProvisioningProbe || mediaStorageCredentialRotationProbe || mediaStorageSecretManager
        ? 'media.configure'
        : keyManagementAction
          ? 'settings.manageKeys'
          : 'settings.configure',
    });
    if (access instanceof NextResponse) {
      return access;
    }

    if (mediaStorageProvisioningProbe) {
      const result = await runMediaStorageProvisioningProbe(requestId, stringValue(body.siteId) || undefined);
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'media-storage',
        action: 'settings.media_storage.provisioning_probe',
        metadata: {
          provider: result.provider,
          status: result.status,
          probePath: result.probePath,
          siteId: result.lifecycleCleanup?.siteId || null,
          failedChecks: result.checks.filter((check) => !check.ready).map((check) => check.label),
          lifecycleCleanup: result.lifecycleCleanup
            ? {
                dryRun: result.lifecycleCleanup.dryRun,
                candidates: result.lifecycleCleanup.candidates,
                deleted: result.lifecycleCleanup.deleted,
                errors: result.lifecycleCleanup.errors.length,
              }
            : null,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: result,
      });
    }

    if (mediaStorageCredentialRotationProbe) {
      const provider = resolveMediaStorageConfig().summary.provider;
      const result = await runMediaStorageCredentialRotationProbe(requestId, provider);
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'media-storage',
        action: 'settings.media_storage.credential_rotation_probe',
        metadata: {
          provider,
          status: result.status,
          probePath: result.probePath,
          detectedReplacementFields: result.fields.filter((field) => field.detected).map((field) => field.name),
          failedChecks: result.checks.filter((check) => !check.ready).map((check) => check.label),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          provider,
          ...result,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    if (mediaStorageSecretManager) {
      const requestedMode = stringValue(body.mode);
      const mode: StorageSecretManagerMode = requestedMode === 'promote' || requestedMode === 'revoke-replacement'
        ? requestedMode
        : 'plan';
      const rawTargets = Array.isArray(body.targetEnvironments)
        ? body.targetEnvironments.map((target) => stringValue(target)).filter(Boolean)
        : undefined;
      const provider = resolveMediaStorageConfig().summary.provider;
      const result = await runMediaStorageSecretManager({
        provider,
        mode,
        dryRun: body.dryRun !== false || mode === 'plan',
        targetEnvironments: rawTargets,
      });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'media-storage',
        action: 'settings.media_storage.secret_manager',
        metadata: {
          provider,
          mode: result.mode,
          dryRun: result.dryRun,
          status: result.status,
          executed: result.executed,
          secretManager: result.secretManager,
          projectId: result.projectId || null,
          teamId: result.teamId || null,
          targetEnvironments: result.targetEnvironments,
          operations: result.operations.map((operation) => ({
            action: operation.action,
            name: operation.name,
            source: operation.source || null,
            ready: operation.ready,
            executed: operation.executed,
            secret: operation.secret,
          })),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: result,
      });
    }

    if (body.action === 'test-notification-webhook') {
      const retryOf = stringValue(body.retryOf);

      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const settings = await repositories.settings.get();
        const target = resolveNotificationWebhookUrl(settings, body.webhookUrl);
        const validated = validateWebhookUrl(target);
        if (!target) {
          return errorResponse(409, 'NOTIFICATION_WEBHOOK_NOT_CONFIGURED', 'Notification webhook URL is not configured.', requestId);
        }
        if (!validated.ok) {
          return errorResponse(400, 'VALIDATION_ERROR', 'Notification webhook URL must be http or https.', requestId);
        }

        const delivery = await sendSettingsNotificationWebhook({
          target,
          requestId,
          access,
          retryOf,
        });
        await recordAdminAudit({
          repositories,
          entity: 'settings',
          entityId: 'platform',
          action: retryOf ? 'settings.notification_webhook.retry' : 'settings.notification_webhook.test',
          metadata: {
            target: delivery.targetSummary,
            status: delivery.status,
            ...(delivery.statusCode === undefined ? {} : { statusCode: delivery.statusCode }),
            ...(delivery.error ? { error: delivery.error } : {}),
            retry: delivery.retry,
            retryOf: delivery.retryOf,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
            delivery,
          },
        });
      }

      const settings = getAdminSettings();
      const target = resolveNotificationWebhookUrl(settings, body.webhookUrl);
      const validated = validateWebhookUrl(target);
      if (!target) {
        return errorResponse(409, 'NOTIFICATION_WEBHOOK_NOT_CONFIGURED', 'Notification webhook URL is not configured.', requestId);
      }
      if (!validated.ok) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Notification webhook URL must be http or https.', requestId);
      }

      const delivery = await sendSettingsNotificationWebhook({
        target,
        requestId,
        access,
        retryOf,
      });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'platform',
        action: retryOf ? 'settings.notification_webhook.retry' : 'settings.notification_webhook.test',
        metadata: {
          target: delivery.targetSummary,
          status: delivery.status,
          ...(delivery.statusCode === undefined ? {} : { statusCode: delivery.statusCode }),
          ...(delivery.error ? { error: delivery.error } : {}),
          retry: delivery.retry,
          retryOf: delivery.retryOf,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          delivery,
        },
      });
    }

    if (body.action === 'issue-admin-api-key') {
      const label = stringValue(body.label).trim();
      if (!label || label.length > 80) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Service key label is required and must be 80 characters or less.', requestId);
      }

      const issuedKey = createAdminServiceApiKey();
      const now = new Date().toISOString();
      const grant: BackyJsonObject = {
        id: `key_service_${randomUUID().slice(0, 8)}`,
        label,
        keyPrefix: `${issuedKey.slice(0, 10)}...`,
        keyFingerprint: keyFingerprint(issuedKey),
        keyHash: keyHash(issuedKey),
        permissionScope: 'non-owner-admin',
        createdAt: now,
        createdBy: access.session?.user.id || null,
        requestId,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        revokedRequestId: null,
        status: 'active',
      };

      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const beforeSettings = await repositories.settings.get();
        const settings = (await repositories.settings.update({
          auth: {
            ...(beforeSettings.auth || {}),
            apiKeyServiceKeys: [
              grant,
              ...normalizeServiceKeyGrants(beforeSettings.auth?.apiKeyServiceKeys),
            ].slice(0, 50),
          },
        })).item;
        await recordAdminAudit({
          repositories,
          entity: 'settings',
          entityId: 'platform',
          action: 'settings.api_keys.issue',
          before: sanitizeSettingsAuditSnapshot(beforeSettings),
          after: sanitizeSettingsAuditSnapshot(settings),
          metadata: {
            keyId: grant.id,
            label,
            keyFingerprint: grant.keyFingerprint,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
            issuedKey: {
              id: grant.id,
              label,
              adminApiKey: issuedKey,
              keyFingerprint: grant.keyFingerprint,
              keyPrefix: grant.keyPrefix,
            },
          },
        });
      }

      const beforeSettings = getAdminSettings();
      const settings = updateAdminSettings({
        auth: {
          ...(beforeSettings.auth || {}),
          apiKeyServiceKeys: [
            grant,
            ...normalizeServiceKeyGrants(beforeSettings.auth?.apiKeyServiceKeys),
          ].slice(0, 50),
        },
      });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.issue',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          keyId: grant.id,
          label,
          keyFingerprint: grant.keyFingerprint,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          issuedKey: {
            id: grant.id,
            label,
            adminApiKey: issuedKey,
            keyFingerprint: grant.keyFingerprint,
            keyPrefix: grant.keyPrefix,
          },
        },
      });
    }

    if (body.action === 'revoke-admin-api-key') {
      const keyId = stringValue(body.keyId).trim();
      if (!keyId) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Service key id is required.', requestId);
      }

      const revokeGrant = async (currentSettings: AdminSettingsSource) => {
        const grants = normalizeServiceKeyGrants(currentSettings.auth?.apiKeyServiceKeys);
        const target = grants.find((grant) => grant.id === keyId);
        if (!target) {
          return { error: errorResponse(404, 'API_KEY_NOT_FOUND', 'Service key was not found.', requestId) };
        }
        if (target.revokedAt || target.status === 'revoked') {
          return { error: errorResponse(409, 'API_KEY_ALREADY_REVOKED', 'Service key is already revoked.', requestId) };
        }

        const now = new Date().toISOString();
        const nextGrants = grants.map((grant) => (
          grant.id === keyId
            ? {
                ...grant,
                revokedAt: now,
                revokedBy: access.session?.user.id || null,
                revokedRequestId: requestId,
                status: 'revoked',
              }
            : grant
        ));
        const revocationEntry: BackyJsonObject = {
          id: `key_revocation_${randomUUID().slice(0, 8)}`,
          scope: 'admin',
          keyType: 'admin',
          revokedAt: now,
          actorId: access.session?.user.id || null,
          requestId,
          reason: 'manual',
          revokedKeyFingerprint: stringValue(target.keyFingerprint) || null,
          replacementKeyFingerprint: null,
        };
        return {
          target,
          auth: appendRevocationHistory(
            {
              ...(currentSettings.auth || {}),
              apiKeyServiceKeys: nextGrants,
            },
            [revocationEntry],
          ),
        };
      };

      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const beforeSettings = await repositories.settings.get();
        const result = await revokeGrant(beforeSettings);
        if (result.error) return result.error;
        const settings = (await repositories.settings.update({ auth: result.auth })).item;
        await recordAdminAudit({
          repositories,
          entity: 'settings',
          entityId: 'platform',
          action: 'settings.api_keys.revoke',
          before: sanitizeSettingsAuditSnapshot(beforeSettings),
          after: sanitizeSettingsAuditSnapshot(settings),
          metadata: {
            keyId,
            label: result.target?.label,
            keyFingerprint: result.target?.keyFingerprint,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          },
        });
      }

      const beforeSettings = getAdminSettings();
      const result = await revokeGrant(beforeSettings);
      if (result.error) return result.error;
      const settings = updateAdminSettings({ auth: result.auth });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.revoke',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          keyId,
          label: result.target?.label,
          keyFingerprint: result.target?.keyFingerprint,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    if (body.action === 'validate-infrastructure') {
      const currentSettings = !shouldUseDemoStoreFallback()
        ? toAdminSettings(await (await getRequiredDatabaseRepositories()).settings.get(), { includeAdminApiKey: canExposeAdminApiKey(access) })
        : {
          ...toAdminSettings(getAdminSettings(), { includeAdminApiKey: canExposeAdminApiKey(access) }),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
          runtimeNotifications: getNotificationRuntimeSummary(),
          runtimeCommerce: getCommerceRuntimeSummary(getAdminSettings()),
          runtimeInteractiveComponents: getInteractiveComponentRuntimeSummary(),
        };
      const normalizedIntegrations = mediaStorageCheck
        ? mergeMediaStorageIntegrations(currentSettings.integrations, body.integrations)
        : normalizeInfrastructureIntegrations(body.integrations);
      const integrations = normalizedIntegrations || parseJsonObject(body.integrations) || currentSettings.integrations || {};
      const deliveryMode = body.deliveryMode === undefined
        ? normalizeDeliveryMode(currentSettings.deliveryMode)
        : normalizeDeliveryMode(body.deliveryMode);

      if (!deliveryMode) {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          'Delivery mode must be managed-hosting or custom-frontend',
          requestId,
        );
      }

      const generatedAt = new Date().toISOString();
      const diagnostics = buildInfrastructureDiagnostics({
        deliveryMode,
        integrations,
        runtimeDatabase: currentSettings.runtimeDatabase,
        runtimeStorage: currentSettings.runtimeStorage,
        runtimeSupabase: currentSettings.runtimeSupabase,
        runtimeMediaScanner: currentSettings.runtimeMediaScanner,
        runtimeVercel: currentSettings.runtimeVercel,
        runtimeNotifications: currentSettings.runtimeNotifications,
        runtimeCommerce: currentSettings.runtimeCommerce,
        runtimeInteractiveComponents: currentSettings.runtimeInteractiveComponents,
        runtimePublicApi: currentSettings.runtimePublicApi,
      });
      const historyEntry = body.recordHistory === true && !mediaStorageCheck
        ? buildDeploymentHistoryEntry({
            integrations,
            diagnostics,
            requestId,
            generatedAt,
          })
        : undefined;

      if (historyEntry) {
        if (!shouldUseDemoStoreFallback()) {
          const repositories = await getRequiredDatabaseRepositories();
          const beforeSettings = await repositories.settings.get();
          const beforeIntegrations = parseJsonObject(beforeSettings.integrations) || {};
          const beforeVercel = parseJsonObject(beforeIntegrations.vercel) || {};
          const deploymentHistory = [
            historyEntry,
            ...normalizeDeploymentHistory(beforeVercel.deploymentHistory),
          ].slice(0, 10);
          const settings = (await repositories.settings.update({
            integrations: {
              ...beforeIntegrations,
              vercel: {
                ...beforeVercel,
                deploymentHistory: deploymentHistory as unknown as BackyJsonValue,
              },
            },
          })).item;
          await recordAdminAudit({
            repositories,
            entity: 'settings',
            entityId: 'platform',
            action: 'settings.infrastructure_check.recorded',
            before: sanitizeSettingsAuditSnapshot(beforeSettings),
            after: sanitizeSettingsAuditSnapshot(settings),
            metadata: {
              status: historyEntry.status,
              blockedCount: historyEntry.blockedCount,
              warningCount: historyEntry.warningCount,
              readyCount: historyEntry.readyCount,
            },
            requestId,
          });
        } else {
          const beforeSettings = getAdminSettings();
          const beforeIntegrations = parseJsonObject(beforeSettings.integrations) || {};
          const beforeVercel = parseJsonObject(beforeIntegrations.vercel) || {};
          const deploymentHistory = [
            historyEntry,
            ...normalizeDeploymentHistory(beforeVercel.deploymentHistory),
          ].slice(0, 10);
          const settings = updateAdminSettings({
            integrations: {
              ...beforeIntegrations,
              vercel: {
                ...beforeVercel,
                deploymentHistory: deploymentHistory as unknown as BackyJsonValue,
              },
            },
          });
          await recordAdminAudit({
            entity: 'settings',
            entityId: 'platform',
            action: 'settings.infrastructure_check.recorded',
            before: sanitizeSettingsAuditSnapshot(beforeSettings),
            after: sanitizeSettingsAuditSnapshot(settings),
            metadata: {
              status: historyEntry.status,
              blockedCount: historyEntry.blockedCount,
              warningCount: historyEntry.warningCount,
              readyCount: historyEntry.readyCount,
            },
            requestId,
          });
        }
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          diagnostics,
          generatedAt,
          ...(historyEntry ? { historyEntry } : {}),
        },
      });
    }

    if (body.action !== 'regenerate-api-keys') {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported settings action', requestId);
    }

    const keyScope = body.scope === 'public' || body.scope === 'admin' ? body.scope : 'all';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const rotatedSettings = (await repositories.settings.update({
        rotatePublicKey: keyScope === 'all' || keyScope === 'public',
        rotateSecretKey: keyScope === 'all' || keyScope === 'admin',
      })).item;
      const rotationEntry = buildRotationHistoryEntry({
        scope: keyScope,
        beforeSettings,
        afterSettings: rotatedSettings,
        access,
        requestId,
      });
      const revocationEntries = buildRevocationHistoryEntries({
        scope: keyScope,
        beforeSettings,
        afterSettings: rotatedSettings,
        access,
        requestId,
      });
      const authWithRotation = appendRotationHistory(rotatedSettings.auth, rotationEntry);
      const settings = (await repositories.settings.update({
        auth: appendRevocationHistory(authWithRotation, revocationEntries),
      })).item;
      await recordAdminAudit({
        repositories,
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.regenerate',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          scope: keyScope,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const settings = regenerateAdminApiKeys(keyScope, {
      actorId: access.session?.user.id || null,
      requestId,
    });
    await recordAdminAudit({
      entity: 'settings',
      entityId: 'platform',
      action: 'settings.api_keys.regenerate',
      before: sanitizeSettingsAuditSnapshot(beforeSettings),
      after: sanitizeSettingsAuditSnapshot(settings),
      metadata: {
        scope: keyScope,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
