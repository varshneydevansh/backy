/**
 * Admin interactive component registry detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]
 * PATCH  /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]
 * DELETE /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  deleteInteractiveComponent,
  getInteractiveComponent,
  getSiteByIdOrSlug,
  recordAdminAuditLog,
  updateInteractiveComponent,
} from '@/lib/backyStore';
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
    componentKey: string;
    version: string;
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

const normalizeType = (value: unknown) => value === 'interactiveFigure' ? 'interactiveFigure' : value === 'codeComponent' ? 'codeComponent' : undefined;
const normalizeStatus = (value: unknown) => value === 'active' || value === 'disabled' || value === 'archived' ? value : undefined;
const normalizeReviewStatus = (value: unknown) => (
  value === 'draft' || value === 'in_review' || value === 'approved' || value === 'rejected' ? value : undefined
);
const normalizeRenderMode = (value: unknown) => (
  value === 'trusted-component' || value === 'sandbox-iframe' || value === 'static-fallback' ? value : undefined
);
const normalizeSource = (value: unknown) => value === 'registry' || value === 'custom' ? value : undefined;

const normalizeComponentKey = (value: unknown): string => (
  typeof value === 'string'
    ? decodeURIComponent(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^[._-]+|[._-]+$/g, '')
    : ''
);

const normalizeVersion = (value: unknown): string => (
  typeof value === 'string'
    ? decodeURIComponent(value).trim().replace(/[^a-zA-Z0-9._+-]+/g, '').slice(0, 40)
    : ''
);

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

const deliverInteractiveComponentDetailWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  action: 'interactiveComponent.update' | 'interactiveComponent.delete';
  before?: InteractiveComponentWebhookSource | null;
  after?: InteractiveComponentWebhookSource | null;
  requestId: string;
  actor?: string | null;
  changedKeys?: string[];
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
      before: params.before ? interactiveComponentWebhookSnapshot(params.before) : null,
      after: params.after ? interactiveComponentWebhookSnapshot(params.after) : null,
    },
    metadata: {
      action: params.action,
      changedKeys: ['interactiveComponents'],
      source: 'admin-interactive-component-detail-api',
      resourceType: 'interactiveComponent',
      resourceId: params.after?.id || params.before?.id || null,
      componentKey: params.after?.componentKey || params.before?.componentKey || '',
      version: params.after?.version || params.before?.version || '',
      reviewStatus: params.after?.reviewStatus || params.before?.reviewStatus || '',
      status: params.after?.status || params.before?.status || '',
      fields: params.changedKeys || [],
    },
  });

async function resolveDemoSite(siteId: string, requestId: string) {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
    if (!site) {
      return { response: errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId) };
    }
    return { site, repositories };
  }

  const site = getSiteByIdOrSlug(siteId);
  if (!site) {
    return { response: errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId) };
  }

  return { site };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const resolved = await resolveDemoSite(siteId, requestId);
    if (resolved.response) return resolved.response;

    const component = resolved.repositories
      ? await resolved.repositories.interactiveComponents.getByKeyVersion(
          resolved.site.id,
          normalizeComponentKey(componentKey),
          normalizeVersion(version),
        )
      : getInteractiveComponent(
          resolved.site.id,
          normalizeComponentKey(componentKey),
          normalizeVersion(version),
        );
    if (!component) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { component } });
  } catch (error) {
    console.error('Admin interactive component registry detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const resolved = await resolveDemoSite(siteId, requestId);
    if (resolved.response) return resolved.response;

    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);
    const before = resolved.repositories
      ? await resolved.repositories.interactiveComponents.getByKeyVersion(resolved.site.id, normalizedKey, normalizedVersion)
      : getInteractiveComponent(resolved.site.id, normalizedKey, normalizedVersion);
    if (!before) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    const body = await parseJsonBody(request);
    if (body.componentKey !== undefined || body.version !== undefined) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Component key and version are immutable. Create a new version instead.', requestId);
    }
    const validation = validateInteractiveComponentPayload(body, {
      ...before,
      siteId: resolved.site.id,
      componentKey: normalizedKey,
      version: normalizedVersion,
    });
    if (!validation.ok) {
      return validationErrorResponse(validation.issues, requestId);
    }
    const updateBody = body.dependencyMetadata !== undefined || body.dependencyPolicy !== undefined || body.compatibility !== undefined || body.dataBindingPresets !== undefined
      ? {
          ...body,
          dependencyMetadata: normalizeInteractiveComponentDependencyMetadata(body, before),
        }
      : body;

    const updated = resolved.repositories
      ? (await resolved.repositories.interactiveComponents.update(resolved.site.id, normalizedKey, normalizedVersion, {
          displayName: typeof body.displayName === 'string' ? body.displayName.trim() : undefined,
          type: normalizeType(body.type),
          status: normalizeStatus(body.status),
          reviewStatus: normalizeReviewStatus(body.reviewStatus),
          renderMode: normalizeRenderMode(body.renderMode),
          source: normalizeSource(body.source),
          description: typeof body.description === 'string' ? body.description.trim() : undefined,
          allowedDataScopes: stringList(body.allowedDataScopes),
          requiredFields: stringList(body.requiredFields),
          controls: jsonObjectArray(body.controls),
          fallback: body.fallback && typeof body.fallback === 'object' && !Array.isArray(body.fallback) ? body.fallback as never : undefined,
          security: body.security && typeof body.security === 'object' && !Array.isArray(body.security) ? auditJson(body.security) : undefined,
          integrity: body.integrity && typeof body.integrity === 'object' && !Array.isArray(body.integrity) ? body.integrity as never : undefined,
          runtime: body.runtime && typeof body.runtime === 'object' && !Array.isArray(body.runtime) ? body.runtime as never : undefined,
          ownerId: typeof body.ownerId === 'string' ? body.ownerId.trim() || null : undefined,
          dependencyMetadata: updateBody.dependencyMetadata && typeof updateBody.dependencyMetadata === 'object' && !Array.isArray(updateBody.dependencyMetadata)
            ? auditJson(updateBody.dependencyMetadata)
            : undefined,
          changelog: typeof body.changelog === 'string' ? body.changelog.trim() || null : undefined,
          rollbackFromVersion: typeof body.rollbackFromVersion === 'string' ? body.rollbackFromVersion.trim() || null : undefined,
          updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy.trim() || null : undefined,
          reviewedBy: typeof body.reviewedBy === 'string' ? body.reviewedBy.trim() || null : undefined,
          reviewedAt: typeof body.reviewedAt === 'string' ? body.reviewedAt.trim() || null : undefined,
        })).item
      : updateInteractiveComponent(resolved.site.id, normalizedKey, normalizedVersion, updateBody);
    if (!updated) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }
    const auditPayload = {
      siteId: resolved.site.id,
      teamId: resolved.site.teamId || null,
      actorId: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
      entity: 'interactiveComponent' as const,
      entityId: updated.id,
      action: 'interactiveComponent.update',
      before: auditJson(before),
      after: auditJson(updated),
      metadata: {
        componentKey: updated.componentKey,
        version: updated.version,
        reviewStatus: updated.reviewStatus,
        status: updated.status,
        changedKeys: Object.keys(body),
      },
      requestId,
    };
    if (resolved.repositories) {
      await resolved.repositories.auditLogs.record(auditPayload);
      await resolved.repositories.cacheInvalidations.record({
        siteId: resolved.site.id,
        scope: 'settings',
        entity: 'interactiveComponent',
        entityId: updated.id,
        reason: 'interactive-component-updated',
        metadata: { componentKey: updated.componentKey, version: updated.version },
      });
    } else {
      recordAdminAuditLog(auditPayload);
    }
    await deliverInteractiveComponentDetailWebhook({
      repositories: resolved.repositories,
      site: resolved.site as Site,
      action: 'interactiveComponent.update',
      before,
      after: updated,
      requestId,
      actor: typeof body.updatedBy === 'string' ? body.updatedBy : 'admin',
      changedKeys: Object.keys(body),
    });

    return NextResponse.json({ success: true, requestId, data: { component: updated } });
  } catch (error) {
    console.error('Admin interactive component registry update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.delete' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const resolved = await resolveDemoSite(siteId, requestId);
    if (resolved.response) return resolved.response;

    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);
    const before = resolved.repositories
      ? await resolved.repositories.interactiveComponents.getByKeyVersion(resolved.site.id, normalizedKey, normalizedVersion)
      : getInteractiveComponent(resolved.site.id, normalizedKey, normalizedVersion);
    if (!before) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    if (resolved.repositories) {
      await resolved.repositories.interactiveComponents.delete(resolved.site.id, normalizedKey, normalizedVersion);
    } else {
      deleteInteractiveComponent(resolved.site.id, normalizedKey, normalizedVersion);
    }
    const auditPayload = {
      siteId: resolved.site.id,
      teamId: resolved.site.teamId || null,
      actorId: 'admin',
      entity: 'interactiveComponent' as const,
      entityId: before.id,
      action: 'interactiveComponent.delete',
      before: auditJson(before),
      metadata: {
        componentKey: before.componentKey,
        version: before.version,
      },
      requestId,
    };
    if (resolved.repositories) {
      await resolved.repositories.auditLogs.record(auditPayload);
      await resolved.repositories.cacheInvalidations.record({
        siteId: resolved.site.id,
        scope: 'settings',
        entity: 'interactiveComponent',
        entityId: before.id,
        reason: 'interactive-component-deleted',
        metadata: { componentKey: before.componentKey, version: before.version },
      });
    } else {
      recordAdminAuditLog(auditPayload);
    }
    await deliverInteractiveComponentDetailWebhook({
      repositories: resolved.repositories,
      site: resolved.site as Site,
      action: 'interactiveComponent.delete',
      before,
      after: null,
      requestId,
      actor: 'admin',
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        componentId: before.id,
      },
    });
  } catch (error) {
    console.error('Admin interactive component registry delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
