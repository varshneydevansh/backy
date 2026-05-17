/**
 * Admin interactive component review workflow endpoint.
 *
 * POST /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/review
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
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

type ReviewAction = 'submit' | 'approve' | 'reject';

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

const normalizeReviewAction = (value: unknown): ReviewAction | null => (
  value === 'submit' || value === 'approve' || value === 'reject' ? value : null
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const objectValue = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
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

const deliverInteractiveComponentReviewWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  action: ReviewAction;
  before: InteractiveComponentWebhookSource;
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
    reason: `interactiveComponent.review.${params.action}`,
    data: {
      resourceType: 'interactiveComponent',
      before: interactiveComponentWebhookSnapshot(params.before),
      after: interactiveComponentWebhookSnapshot(params.after),
    },
    metadata: {
      action: `interactiveComponent.review.${params.action}`,
      changedKeys: ['interactiveComponents'],
      source: 'admin-interactive-component-review-api',
      resourceType: 'interactiveComponent',
      resourceId: params.after.id,
      componentKey: params.after.componentKey,
      version: params.after.version,
      reviewStatus: params.after.reviewStatus,
      status: params.after.status,
    },
  });

const reviewUpdate = (
  action: ReviewAction,
  body: Record<string, unknown>,
  existing?: { dependencyMetadata?: unknown },
): Record<string, unknown> => {
  const actor = textValue(body.reviewedBy) || textValue(body.updatedBy) || 'admin';
  const reviewMetadata = {
    notes: textValue(body.notes) || textValue(body.reviewNotes) || null,
    checklist: objectValue(body.checklist) || null,
  };

  if (action === 'submit') {
    return {
      status: 'disabled',
      reviewStatus: 'in_review',
      updatedBy: actor,
      dependencyMetadata: normalizeInteractiveComponentDependencyMetadata(body, existing),
      changelog: textValue(body.changelog) || 'Submitted interactive component for review.',
    };
  }

  if (action === 'reject') {
    return {
      status: 'disabled',
      reviewStatus: 'rejected',
      updatedBy: actor,
      reviewedBy: actor,
      reviewedAt: new Date().toISOString(),
      dependencyMetadata: {
        ...normalizeInteractiveComponentDependencyMetadata(body, existing),
        review: {
          ...reviewMetadata,
          rejectedAt: new Date().toISOString(),
          rejectedBy: actor,
        },
      },
      changelog: textValue(body.changelog) || 'Rejected interactive component review.',
    };
  }

  return {
    status: 'active',
    reviewStatus: 'approved',
    updatedBy: actor,
    reviewedBy: actor,
    reviewedAt: new Date().toISOString(),
    ...(body.runtime !== undefined ? { runtime: body.runtime } : {}),
    ...(body.integrity !== undefined ? { integrity: body.integrity } : {}),
    dependencyMetadata: {
      ...normalizeInteractiveComponentDependencyMetadata(body, existing),
      review: {
        ...reviewMetadata,
        approvedAt: new Date().toISOString(),
        approvedBy: actor,
      },
    },
    changelog: textValue(body.changelog) || 'Approved interactive component for publishing.',
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const body = await parseJsonBody(request);
    const action = normalizeReviewAction(body.action);
    if (!action) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Review action must be submit, approve, or reject', requestId);
    }

    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const before = await repositories.interactiveComponents.getByKeyVersion(site.id, normalizedKey, normalizedVersion);
      if (!before) {
        return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
      }
      const update = reviewUpdate(action, body, before);
      const validation = validateInteractiveComponentPayload(update, {
        ...before,
        siteId: site.id,
        componentKey: normalizedKey,
        version: normalizedVersion,
      });
      if (!validation.ok) {
        return validationErrorResponse(validation.issues, requestId);
      }
      const component = (await repositories.interactiveComponents.update(site.id, normalizedKey, normalizedVersion, update)).item;
      await repositories.auditLogs.record({
        siteId: site.id,
        teamId: site.teamId || null,
        actorId: textValue(update.reviewedBy) || textValue(update.updatedBy) || 'admin',
        entity: 'interactiveComponent',
        entityId: component.id,
        action: `interactiveComponent.review.${action}`,
        before: auditJson(before),
        after: auditJson(component),
        metadata: {
          action,
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
        reason: `interactive-component-review-${action}`,
        metadata: { componentKey: component.componentKey, version: component.version, reviewStatus: component.reviewStatus },
      });
      await deliverInteractiveComponentReviewWebhook({
        repositories,
        site,
        action,
        before,
        after: component,
        requestId,
        actor: textValue(update.reviewedBy) || textValue(update.updatedBy) || 'admin',
      });

      return NextResponse.json({ success: true, requestId, data: { action, component } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const before = getInteractiveComponent(site.id, normalizedKey, normalizedVersion);
    if (!before) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }
    const update = reviewUpdate(action, body, before);
    const validation = validateInteractiveComponentPayload(update, {
      ...before,
      siteId: site.id,
      componentKey: normalizedKey,
      version: normalizedVersion,
    });
    if (!validation.ok) {
      return validationErrorResponse(validation.issues, requestId);
    }
    const component = updateInteractiveComponent(site.id, normalizedKey, normalizedVersion, update);
    if (!component) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }
    recordAdminAuditLog({
      siteId: site.id,
      teamId: site.teamId || null,
      actorId: textValue(update.reviewedBy) || textValue(update.updatedBy) || 'admin',
      entity: 'interactiveComponent',
      entityId: component.id,
      action: `interactiveComponent.review.${action}`,
      before: auditJson(before),
      after: auditJson(component),
      metadata: {
        action,
        componentKey: component.componentKey,
        version: component.version,
        reviewStatus: component.reviewStatus,
        status: component.status,
      },
      requestId,
    });
    await deliverInteractiveComponentReviewWebhook({
      site: site as unknown as Site,
      action,
      before,
      after: component,
      requestId,
      actor: textValue(update.reviewedBy) || textValue(update.updatedBy) || 'admin',
    });

    return NextResponse.json({ success: true, requestId, data: { action, component } });
  } catch (error) {
    console.error('Admin interactive component review API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
