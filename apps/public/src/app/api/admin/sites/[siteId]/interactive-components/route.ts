/**
 * Admin interactive component registry endpoint.
 *
 * GET  /api/admin/sites/[siteId]/interactive-components
 * POST /api/admin/sites/[siteId]/interactive-components
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  createInteractiveComponent,
  getInteractiveComponent,
  getSiteByIdOrSlug,
  listInteractiveComponents,
  recordAdminAuditLog,
} from '@/lib/backyStore';
import { interactiveComponentImportBody } from '@/lib/interactiveComponentExport';
import {
  normalizeInteractiveComponentDependencyMetadata,
  validateInteractiveComponentPayload,
} from '@/lib/interactiveComponentValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';
import type { BackyJsonObject, Site } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const validationErrorResponse = (issues: string[], requestId: string) => (
  NextResponse.json({
    success: false,
    requestId,
    error: {
      code: 'INTERACTIVE_COMPONENT_VALIDATION_FAILED',
      message: 'Interactive component failed runtime integrity validation',
      issues,
    },
  }, { status: 400 })
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

const auditJson = (value: unknown): BackyJsonObject => JSON.parse(JSON.stringify(value)) as BackyJsonObject;

const stringList = (value: unknown): string[] | undefined => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)))
    : undefined
);

const jsonObjectArray = (value: unknown): BackyJsonObject[] | undefined => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)).map(auditJson)
    : undefined
);

const normalizeType = (value: unknown) => value === 'interactiveFigure' ? 'interactiveFigure' : 'codeComponent';
const normalizeStatus = (value: unknown) => value === 'active' || value === 'archived' ? value : 'disabled';
const normalizeReviewStatus = (value: unknown) => (
  value === 'in_review' || value === 'approved' || value === 'rejected' ? value : 'draft'
);
const normalizeRenderMode = (value: unknown) => (
  value === 'trusted-component' || value === 'static-fallback' ? value : 'sandbox-iframe'
);
const normalizeSource = (value: unknown) => value === 'registry' ? 'registry' : 'custom';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeComponentKey = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^[._-]+|[._-]+$/g, '')
    : ''
);

const normalizeVersion = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().replace(/[^a-zA-Z0-9._+-]+/g, '').slice(0, 40)
    : ''
);

const normalizeImportedSandboxRuntime = (
  body: Record<string, unknown>,
  siteId: string,
  componentKey: string,
  version: string,
): Record<string, unknown> => {
  if (!isRecord(body.exportPackage)) {
    return body;
  }

  const runtime = isRecord(body.runtime) ? body.runtime : {};
  const renderMode = normalizeRenderMode(body.renderMode);
  if (renderMode !== 'sandbox-iframe') {
    return body;
  }

  return {
    ...body,
    runtime: {
      ...runtime,
      sandboxUrl: `/api/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/sandbox`,
    },
  };
};

interface InteractiveComponentWebhookSource {
  id: string;
  componentKey: string;
  version: string;
  displayName: string;
  type: string;
  status: string;
  reviewStatus: string;
  renderMode: string;
  source: string;
  updatedAt: string;
}

const interactiveComponentWebhookSnapshot = (component: InteractiveComponentWebhookSource): BackyJsonObject => ({
  componentId: component.id,
  componentKey: component.componentKey,
  version: component.version,
  displayName: component.displayName,
  type: component.type,
  status: component.status,
  reviewStatus: component.reviewStatus,
  renderMode: component.renderMode,
  source: component.source,
  updatedAt: component.updatedAt,
});

const deliverInteractiveComponentRegistryWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  action: 'interactiveComponent.create';
  after: InteractiveComponentWebhookSource;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: 'site-updated',
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: 'interactiveComponent',
      after: interactiveComponentWebhookSnapshot(params.after),
    },
    metadata: {
      action: params.action,
      changedKeys: ['interactiveComponents'],
      source: 'admin-interactive-components-api',
      resourceType: 'interactiveComponent',
      resourceId: params.after.id,
      componentKey: params.after.componentKey,
      version: params.after.version,
      reviewStatus: params.after.reviewStatus,
      status: params.after.status,
    },
  });

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status') || 'all';
      const reviewStatus = searchParams.get('reviewStatus') || 'all';
      const type = searchParams.get('type') || 'all';
      const result = await repositories.interactiveComponents.list({
        siteId: site.id,
        status: status === 'active' || status === 'disabled' || status === 'archived' || status === 'all' ? status : 'all',
        reviewStatus: reviewStatus === 'draft' || reviewStatus === 'in_review' || reviewStatus === 'approved' || reviewStatus === 'rejected' || reviewStatus === 'all' ? reviewStatus : 'all',
        type: type === 'interactiveFigure' || type === 'codeComponent' || type === 'all' ? type : 'all',
        search: searchParams.get('search') || undefined,
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          components: result.items,
          pagination: result.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const reviewStatus = searchParams.get('reviewStatus') || 'all';
    const type = searchParams.get('type') || 'all';
    const components = listInteractiveComponents(site.id, {
      status: status === 'active' || status === 'disabled' || status === 'archived' || status === 'all' ? status : 'all',
      reviewStatus: reviewStatus === 'draft' || reviewStatus === 'in_review' || reviewStatus === 'approved' || reviewStatus === 'rejected' || reviewStatus === 'all' ? reviewStatus : 'all',
      type: type === 'interactiveFigure' || type === 'codeComponent' || type === 'all' ? type : 'all',
      search: searchParams.get('search') || undefined,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        components,
        pagination: {
          total: components.length,
          limit: components.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin interactive component registry list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const parsedBody = interactiveComponentImportBody(await parseJsonBody(request));
      const componentKey = normalizeComponentKey(parsedBody.componentKey);
      const version = normalizeVersion(parsedBody.version) || '1.0.0';
      const body = normalizeImportedSandboxRuntime(parsedBody, site.id, componentKey, version);
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

      if (!componentKey) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Component key is required', requestId);
      }
      if (!displayName) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Display name is required', requestId);
      }
      if (await repositories.interactiveComponents.getByKeyVersion(site.id, componentKey, version)) {
        return errorResponse(409, 'INTERACTIVE_COMPONENT_VERSION_CONFLICT', 'This component key and version already exist', requestId);
      }
      const validation = validateInteractiveComponentPayload({
        ...body,
        siteId: site.id,
        componentKey,
        version,
      });
      if (!validation.ok) {
        return validationErrorResponse(validation.issues, requestId);
      }

      const component = (await repositories.interactiveComponents.create({
        siteId: site.id,
        componentKey,
        version,
        displayName,
        type: normalizeType(body.type),
        status: normalizeStatus(body.status),
        reviewStatus: normalizeReviewStatus(body.reviewStatus),
        renderMode: normalizeRenderMode(body.renderMode),
        source: normalizeSource(body.source),
        description: typeof body.description === 'string' ? body.description.trim() : '',
        allowedDataScopes: stringList(body.allowedDataScopes),
        requiredFields: stringList(body.requiredFields),
        controls: jsonObjectArray(body.controls),
        fallback: body.fallback && typeof body.fallback === 'object' && !Array.isArray(body.fallback) ? body.fallback as never : undefined,
        security: body.security && typeof body.security === 'object' && !Array.isArray(body.security) ? auditJson(body.security) : undefined,
        integrity: body.integrity && typeof body.integrity === 'object' && !Array.isArray(body.integrity) ? body.integrity as never : undefined,
        runtime: body.runtime && typeof body.runtime === 'object' && !Array.isArray(body.runtime) ? body.runtime as never : undefined,
        ownerId: typeof body.ownerId === 'string' ? body.ownerId.trim() || null : null,
        dependencyMetadata: auditJson(normalizeInteractiveComponentDependencyMetadata(body)),
        changelog: typeof body.changelog === 'string' ? body.changelog.trim() || null : null,
        rollbackFromVersion: typeof body.rollbackFromVersion === 'string' ? body.rollbackFromVersion.trim() || null : null,
        createdBy: typeof body.createdBy === 'string' ? body.createdBy.trim() || null : null,
        updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy.trim() || null : null,
        reviewedBy: typeof body.reviewedBy === 'string' ? body.reviewedBy.trim() || null : null,
        reviewedAt: typeof body.reviewedAt === 'string' ? body.reviewedAt.trim() || null : null,
      })).item;
      await repositories.auditLogs.record({
        siteId: site.id,
        teamId: site.teamId || null,
        actorId: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
        entity: 'interactiveComponent',
        entityId: component.id,
        action: 'interactiveComponent.create',
        after: auditJson(component),
        metadata: {
          componentKey: component.componentKey,
          version: component.version,
          reviewStatus: component.reviewStatus,
          status: component.status,
        },
        requestId,
      });
      await repositories.cacheInvalidations.record({
        siteId: site.id,
        scope: 'settings',
        entity: 'interactiveComponent',
        entityId: component.id,
        reason: 'interactive-component-created',
        metadata: { componentKey, version },
      });
      await deliverInteractiveComponentRegistryWebhook({
        repositories,
        site,
        action: 'interactiveComponent.create',
        after: component,
        requestId,
        actor: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
      });

      return NextResponse.json({ success: true, requestId, data: { component } }, { status: 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const parsedBody = interactiveComponentImportBody(await parseJsonBody(request));
    const componentKey = normalizeComponentKey(parsedBody.componentKey);
    const version = normalizeVersion(parsedBody.version) || '1.0.0';
    const body = normalizeImportedSandboxRuntime(parsedBody, site.id, componentKey, version);
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

    if (!componentKey) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Component key is required', requestId);
    }
    if (!displayName) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Display name is required', requestId);
    }
    if (getInteractiveComponent(site.id, componentKey, version)) {
      return errorResponse(409, 'INTERACTIVE_COMPONENT_VERSION_CONFLICT', 'This component key and version already exist', requestId);
    }
    const validation = validateInteractiveComponentPayload({
      ...body,
      siteId: site.id,
      componentKey,
      version,
    });
    if (!validation.ok) {
      return validationErrorResponse(validation.issues, requestId);
    }

    const component = createInteractiveComponent(site.id, {
      ...body,
      dependencyMetadata: normalizeInteractiveComponentDependencyMetadata(body),
      componentKey,
      version,
      displayName,
    });
    recordAdminAuditLog({
      siteId: site.id,
      teamId: site.teamId || null,
      actorId: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
      entity: 'interactiveComponent',
      entityId: component.id,
      action: 'interactiveComponent.create',
      after: auditJson(component),
      metadata: {
        componentKey: component.componentKey,
        version: component.version,
        reviewStatus: component.reviewStatus,
        status: component.status,
      },
      requestId,
    });
    await deliverInteractiveComponentRegistryWebhook({
      site: site as unknown as Site,
      action: 'interactiveComponent.create',
      after: component,
      requestId,
      actor: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
    });

    return NextResponse.json({ success: true, requestId, data: { component } }, { status: 201 });
  } catch (error) {
    console.error('Admin interactive component registry create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
