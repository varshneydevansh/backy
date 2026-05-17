/**
 * Public sandbox runtime telemetry for interactive components.
 *
 * Accepts bounded lifecycle/error reports from the hosted renderer and stores
 * them in the existing interaction event stream for admin diagnostics.
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listInteractiveComponents, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import { buildPublicInteractiveComponentRegistry, type BackyInteractiveComponentRegistryEntry } from '@/lib/interactiveComponentRegistry';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const textValue = (value: unknown, maxLength = 240): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const telemetryMessageTypes = new Set([
  'ready',
  'init',
  'resize',
  'error',
  'fallback',
  'blocked',
]);

const prefixedTelemetryMessageTypes: Record<string, string> = {
  'backy.interactive-component.ready': 'ready',
  'backy.interactive-component.init': 'init',
  'backy.interactive-component.resize': 'resize',
  'backy.interactive-component.error': 'error',
  'backy.interactive-component.fallback': 'fallback',
  'backy.interactive-component.blocked': 'blocked',
};

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: { code, message },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
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
});

const normalizeTelemetryMessageType = (value: string): string => {
  const normalized = value.trim();
  if (telemetryMessageTypes.has(normalized)) return normalized;
  return prefixedTelemetryMessageTypes[normalized] || '';
};

const findTelemetryComponent = (
  siteId: string,
  components: PublicRegistryComponent[],
  componentKey: string,
  version: string,
) => {
  const registry = buildPublicInteractiveComponentRegistry(siteId, components.map(toPublicRegistryEntry));
  return registry.components.find((component) => (
    component.componentKey === componentKey &&
    (!version || component.version === version)
  )) || null;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Expected a JSON telemetry payload', requestId);
    }

    const componentKey = textValue(payload.componentKey, 160);
    const version = textValue(payload.version, 80);
    const elementId = textValue(payload.elementId, 120);
    const pageId = textValue(payload.pageId, 120);
    const postId = textValue(payload.postId, 120);
    const telemetryRequestId = textValue(payload.requestId, 120) || requestId;
    const messageType = normalizeTelemetryMessageType(textValue(payload.type, 120) || 'error');
    const message = textValue(payload.message, 500);

    if (!componentKey) {
      return errorResponse(400, 'MISSING_COMPONENT_KEY', 'componentKey is required', requestId);
    }
    if (!messageType) {
      return errorResponse(400, 'INVALID_EVENT_TYPE', 'type must be one of ready, init, resize, error, fallback, or blocked', requestId);
    }
    if (!message) {
      return errorResponse(400, 'MISSING_MESSAGE', 'message is required', requestId);
    }

    const target = [
      'interactive-component',
      componentKey,
      version,
      elementId,
    ].filter(Boolean).join(':');
    const metadata = {
      componentKey,
      version: version || null,
      elementId: elementId || null,
      pageId: pageId || null,
      postId: postId || null,
      messageType,
      source: 'interactive-component-sandbox',
    };

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const component = findTelemetryComponent(site.id, (await repositories.interactiveComponents.list({
        siteId: site.id,
        publicOnly: true,
        limit: 100,
        offset: 0,
      })).items, componentKey, version);
      if (!component) {
        return errorResponse(404, 'COMPONENT_NOT_FOUND', 'Interactive component is not registered for this site', requestId);
      }

      await recordRepositoryInteractionEvent(repositories, {
        kind: 'interactive-runtime',
        siteId: site.id,
        target,
        status: 'failed',
        requestId: telemetryRequestId,
        metadata,
        error: message,
      });

      return publicContractJson({
        success: true,
        requestId: telemetryRequestId,
        data: { recorded: true, siteId: site.id, componentKey, version: version || null },
        recorded: true,
      }, { status: 202, requestId: telemetryRequestId, cache: 'private' });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const component = findTelemetryComponent(site.id, listInteractiveComponents(site.id, { publicOnly: true }), componentKey, version);
    if (!component) {
      return errorResponse(404, 'COMPONENT_NOT_FOUND', 'Interactive component is not registered for this site', requestId);
    }

    trackWebhookEvent({
      kind: 'interactive-runtime',
      siteId: site.id,
      target,
      status: 'failed',
      requestId: telemetryRequestId,
      metadata,
      error: message,
    });

    return publicContractJson({
      success: true,
      requestId: telemetryRequestId,
      data: { recorded: true, siteId: site.id, componentKey, version: version || null },
      recorded: true,
    }, { status: 202, requestId: telemetryRequestId, cache: 'private' });
  } catch (error) {
    console.error('Interactive component runtime event API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
