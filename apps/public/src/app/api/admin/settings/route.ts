/**
 * Admin platform settings endpoint.
 *
 * GET   /api/admin/settings
 * PATCH /api/admin/settings
 * POST  /api/admin/settings with { action: "regenerate-api-keys" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings, regenerateAdminApiKeys, updateAdminSettings } from '@/lib/backyStore';
import { getMediaStorageConfigSummary } from '@/lib/mediaStorage';
import {
  getRequiredDatabaseRepositories,
  resolvePublicRepositoryRuntimeConfig,
  shouldUseDemoStoreFallback,
} from '@/lib/repositoryRuntime';
import type { BackyJsonObject, BackySettings } from '@backy-cms/core';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const inferSupabaseProjectRef = (url: string): string => {
  try {
    const host = new URL(url).host;
    return host.endsWith('.supabase.co') ? host.replace('.supabase.co', '') : '';
  } catch {
    return '';
  }
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
  const onVercel = process.env.VERCEL === '1' || Boolean(url);

  return {
    configured: onVercel || Boolean(projectId),
    onVercel,
    projectId,
    teamId,
    url,
    environment: env,
    missing: onVercel || projectId ? [] : ['VERCEL_PROJECT_ID or VERCEL runtime'],
  };
};

const toAdminSettings = (settings: BackySettings) => ({
  deliveryMode: settings.deliveryMode === 'custom-frontend' ? 'custom-frontend' : 'managed-hosting',
  apiKeys: {
    publicApiKey: settings.apiKeys.publicKey || '',
    adminApiKey: settings.apiKeys.secretKeyId || '',
  },
  storage: settings.storage || {},
  runtimeStorage: getMediaStorageConfigSummary(),
  auth: settings.auth || {},
  integrations: settings.integrations || {},
  runtimeDatabase: getDatabaseRuntimeSummary(),
  runtimeSupabase: getSupabaseRuntimeSummary(),
  runtimeVercel: getVercelRuntimeSummary(),
  updatedAt: settings.updatedAt,
});

const parseJsonObject = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : undefined
);

const normalizeInfrastructureIntegrations = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }

  const supabase = parseJsonObject(input.supabase) || {};
  const vercel = parseJsonObject(input.vercel) || {};

  return {
    ...input,
    supabase: {
      projectUrl: stringValue(supabase.projectUrl),
      projectRef: stringValue(supabase.projectRef) || inferSupabaseProjectRef(stringValue(supabase.projectUrl)),
      databaseEnabled: boolValue(supabase.databaseEnabled),
      storageEnabled: boolValue(supabase.storageEnabled),
      authEnabled: boolValue(supabase.authEnabled),
    },
    vercel: {
      projectId: stringValue(vercel.projectId),
      teamSlug: stringValue(vercel.teamSlug),
      productionDomain: stringValue(vercel.productionDomain),
      autoDeploy: boolValue(vercel.autoDeploy),
      previewDeployments: boolValue(vercel.previewDeployments, true),
    },
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
  };
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const settings = await repositories.settings.get();

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings),
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...getAdminSettings(),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
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

  try {
    const body = await parseJsonBody(request);
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

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const apiKeysInput = body.apiKeys && typeof body.apiKeys === 'object' && !Array.isArray(body.apiKeys)
        ? body.apiKeys as Record<string, unknown>
        : {};
      const storage = parseJsonObject(body.storage);
      const auth = parseJsonObject(body.auth);
      const integrations = normalizeInfrastructureIntegrations(body.integrations) || parseJsonObject(body.integrations);
      const settings = (await repositories.settings.update({
        ...(deliveryMode ? { deliveryMode } : {}),
        apiKeys: {
          ...(typeof apiKeysInput.publicApiKey === 'string' ? { publicKey: apiKeysInput.publicApiKey.trim() } : {}),
          ...(typeof apiKeysInput.adminApiKey === 'string' ? { secretKeyId: apiKeysInput.adminApiKey.trim() } : {}),
        },
        ...(storage ? { storage } : {}),
        ...(auth ? { auth } : {}),
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
          settings: toAdminSettings(settings),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const integrations = normalizeInfrastructureIntegrations(body.integrations);
    const settings = updateAdminSettings({
      ...body,
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
          ...settings,
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
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

    if (body.action !== 'regenerate-api-keys') {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported settings action', requestId);
    }

    const keyScope = body.scope === 'public' || body.scope === 'admin' ? body.scope : 'all';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const settings = (await repositories.settings.update({
        rotatePublicKey: keyScope === 'all' || keyScope === 'public',
        rotateSecretKey: keyScope === 'all' || keyScope === 'admin',
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
          settings: toAdminSettings(settings),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const settings = regenerateAdminApiKeys(keyScope);
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
          ...settings,
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
