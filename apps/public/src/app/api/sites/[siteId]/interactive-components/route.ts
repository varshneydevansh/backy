/**
 * Public interactive component registry discovery.
 *
 * GET /api/sites/[siteId]/interactive-components
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listInteractiveComponents } from '@/lib/backyStore';
import { buildPublicInteractiveComponentRegistry, type BackyInteractiveComponentRegistryEntry } from '@/lib/interactiveComponentRegistry';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

type PublicRegistryComponent = {
  componentKey: string;
  displayName: string;
  type: BackyInteractiveComponentRegistryEntry['type'];
  status: 'active' | 'disabled' | 'archived' | string;
  version: string;
  renderMode: BackyInteractiveComponentRegistryEntry['renderMode'];
  source: BackyInteractiveComponentRegistryEntry['source'];
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  fallback?: BackyInteractiveComponentRegistryEntry['fallback'];
  integrity?: BackyInteractiveComponentRegistryEntry['integrity'];
  runtime?: BackyInteractiveComponentRegistryEntry['runtime'];
  dependencyMetadata?: Record<string, unknown>;
};

const recordValue = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const stringListValue = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []
);

const recordListValue = (value: unknown): Array<Record<string, unknown>> | undefined => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : undefined
);

const normalizeDependencyPolicy = (value: unknown): BackyInteractiveComponentRegistryEntry['dependencyPolicy'] | undefined => {
  const record = recordValue(value);
  const preset = typeof record?.preset === 'string' ? record.preset : '';
  if (preset !== 'built-in' && preset !== 'signed-sandbox' && preset !== 'no-runtime-deps') {
    return undefined;
  }
  if (!record) {
    return undefined;
  }

  return {
    preset,
    allowedPackagePatterns: stringListValue(record.allowedPackagePatterns),
    blockedBuiltins: stringListValue(record.blockedBuiltins),
    lifecycleScripts: false,
    remoteRuntimeUrls: false,
  };
};

const normalizeCompatibility = (value: unknown): BackyInteractiveComponentRegistryEntry['compatibility'] | undefined => {
  const record = recordValue(value);
  const reducedMotion = record?.reducedMotion === 'recommended' ? 'recommended' : 'required';
  const backyRuntime = typeof record?.backyRuntime === 'string' ? record.backyRuntime.trim() : '';
  const renderTargets = stringListValue(record?.renderTargets);

  if (!backyRuntime || renderTargets.length === 0) {
    return undefined;
  }

  return {
    backyRuntime,
    renderTargets,
    animationLibraries: stringListValue(record?.animationLibraries),
    browserSupport: stringListValue(record?.browserSupport),
    reducedMotion,
  };
};

const toPublicRegistryEntry = (component: PublicRegistryComponent): BackyInteractiveComponentRegistryEntry => ({
  componentKey: component.componentKey,
  displayName: component.displayName,
  type: component.type,
  status: component.status === 'active' ? 'active' : 'disabled',
  version: component.version,
  renderMode: component.renderMode,
  source: component.source,
  description: component.description || '',
  allowedDataScopes: component.allowedDataScopes || [],
  requiredFields: component.requiredFields || [],
  controls: component.controls || [],
  fallback: component.fallback || { required: true, supported: [] },
  security: {
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
    communication: 'postMessage-only',
  },
  integrity: component.integrity || { signed: false, signatureRequiredForCustomCode: true },
  runtime: component.runtime,
  dependencyPolicy: normalizeDependencyPolicy(component.dependencyMetadata?.dependencyPolicy),
  compatibility: normalizeCompatibility(component.dependencyMetadata?.compatibility),
  dataBindingPresets: recordListValue(component.dependencyMetadata?.dataBindingPresets) as BackyInteractiveComponentRegistryEntry['dataBindingPresets'],
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const registryEntries = (await repositories.interactiveComponents.list({
        siteId: site.id,
        publicOnly: true,
        limit: 100,
        offset: 0,
      })).items.map(toPublicRegistryEntry);
      const registry = buildPublicInteractiveComponentRegistry(site.id, registryEntries);
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'settings',
      }) || undefined;

      return publicContractJson({
        success: true,
        requestId,
        data: registry,
        registry,
        components: registry.components,
        pagination: registry.pagination,
      }, {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: registry.schemaVersion,
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const registryEntries = listInteractiveComponents(site.id, { publicOnly: true }).map(toPublicRegistryEntry);
    const registry = buildPublicInteractiveComponentRegistry(site.id, registryEntries);

    return publicContractJson({
      success: true,
      requestId,
      data: registry,
      registry,
      components: registry.components,
      pagination: registry.pagination,
    }, {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: registry.schemaVersion,
      siteId: site.id,
    });
  } catch (error) {
    console.error('Interactive component registry API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
