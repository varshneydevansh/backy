/**
 * Admin interactive component version rollback endpoint.
 *
 * POST /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/rollback
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getInteractiveComponent,
  getSiteByIdOrSlug,
  recordAdminAuditLog,
  rollbackInteractiveComponentVersion,
} from '@/lib/backyStore';
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

const deliverInteractiveComponentRollbackWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  before: InteractiveComponentWebhookSource;
  restored: InteractiveComponentWebhookSource;
  restoredFromVersion: string | null;
  disabledVersions: InteractiveComponentWebhookSource[];
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: 'site-updated',
    requestId: params.requestId,
    actor: params.actor,
    reason: 'interactiveComponent.rollback',
    data: {
      resourceType: 'interactiveComponent',
      before: interactiveComponentWebhookSnapshot(params.before),
      after: interactiveComponentWebhookSnapshot(params.restored),
      restoredFromVersion: params.restoredFromVersion,
      disabledVersions: params.disabledVersions.map(interactiveComponentWebhookSnapshot),
    },
    metadata: {
      action: 'interactiveComponent.rollback',
      changedKeys: ['interactiveComponents'],
      source: 'admin-interactive-component-rollback-api',
      resourceType: 'interactiveComponent',
      resourceId: params.restored.id,
      componentKey: params.restored.componentKey,
      version: params.restored.version,
      restoredFromVersion: params.restoredFromVersion,
      disabledVersions: params.disabledVersions.map((component) => component.version),
      reviewStatus: params.restored.reviewStatus,
      status: params.restored.status,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const normalizedKey = normalizeComponentKey(componentKey);
      const normalizedVersion = normalizeVersion(version);
      const before = await repositories.interactiveComponents.getByKeyVersion(site.id, normalizedKey, normalizedVersion);
      if (!before) {
        return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
      }

      const body = await parseJsonBody(request);
      const result = await repositories.interactiveComponents.rollbackVersion(site.id, normalizedKey, normalizedVersion, {
        rollbackBy: typeof body.rollbackBy === 'string' ? body.rollbackBy : null,
        updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy : null,
        changelog: typeof body.changelog === 'string' ? body.changelog : null,
      });
      if (!result) {
        return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
      }

      await repositories.auditLogs.record({
        siteId: site.id,
        teamId: site.teamId || null,
        actorId: typeof body.rollbackBy === 'string' ? body.rollbackBy : 'admin',
        entity: 'interactiveComponent',
        entityId: result.restored.id,
        action: 'interactiveComponent.rollback',
        before: auditJson(before),
        after: auditJson(result.restored),
        metadata: {
          componentKey: result.restored.componentKey,
          version: result.restored.version,
          restoredFromVersion: result.restoredFromVersion,
          disabledVersions: result.disabledVersions.map((component) => component.version),
        },
        requestId,
      });
      await repositories.cacheInvalidations.record({
        siteId: site.id,
        scope: 'settings',
        entity: 'interactiveComponent',
        entityId: result.restored.id,
        reason: 'interactive-component-rolled-back',
        metadata: {
          componentKey: result.restored.componentKey,
          version: result.restored.version,
          restoredFromVersion: result.restoredFromVersion,
        },
      });
      await deliverInteractiveComponentRollbackWebhook({
        repositories,
        site: site as Site,
        before,
        restored: result.restored,
        restoredFromVersion: result.restoredFromVersion,
        disabledVersions: result.disabledVersions,
        requestId,
        actor: typeof body.rollbackBy === 'string' ? body.rollbackBy : 'admin',
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          rolledBack: true,
          restoredFromVersion: result.restoredFromVersion,
          component: result.restored,
          disabledVersions: result.disabledVersions,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);
    const before = getInteractiveComponent(site.id, normalizedKey, normalizedVersion);
    if (!before) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    const body = await parseJsonBody(request);
    const result = rollbackInteractiveComponentVersion(site.id, normalizedKey, normalizedVersion, body);
    if (!result) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    recordAdminAuditLog({
      siteId: site.id,
      teamId: site.teamId || null,
      actorId: typeof body.rollbackBy === 'string' ? body.rollbackBy : 'admin',
      entity: 'interactiveComponent',
      entityId: result.restored.id,
      action: 'interactiveComponent.rollback',
      before: auditJson(before),
      after: auditJson(result.restored),
      metadata: {
        componentKey: result.restored.componentKey,
        version: result.restored.version,
        restoredFromVersion: result.restoredFromVersion,
        disabledVersions: result.disabledVersions.map((component) => component.version),
      },
      requestId,
    });
    await deliverInteractiveComponentRollbackWebhook({
      site: site as unknown as Site,
      before,
      restored: result.restored,
      restoredFromVersion: result.restoredFromVersion,
      disabledVersions: result.disabledVersions,
      requestId,
      actor: typeof body.rollbackBy === 'string' ? body.rollbackBy : 'admin',
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        rolledBack: true,
        restoredFromVersion: result.restoredFromVersion,
        component: result.restored,
        disabledVersions: result.disabledVersions,
      },
    });
  } catch (error) {
    console.error('Admin interactive component rollback API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
