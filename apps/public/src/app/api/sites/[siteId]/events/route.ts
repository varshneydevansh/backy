import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listAuditEvents } from '@/lib/backyStore';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { BackyAuditLogEntry } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type AuditKind = 'form-submission' | 'contact-shared' | 'contact-sync' | 'contact-status' | 'commerce-webhook' | 'comment-submitted' | 'comment-status' | 'comment-reported' | 'all';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

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

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 20;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function parseOffset(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseKind(raw: string | null): AuditKind {
  if (
    raw === 'form-submission' ||
    raw === 'contact-shared' ||
    raw === 'contact-sync' ||
    raw === 'contact-status' ||
    raw === 'commerce-webhook' ||
    raw === 'comment-submitted' ||
    raw === 'comment-status' ||
    raw === 'comment-reported'
  ) {
    return raw;
  }

  return 'all';
}

function parseTextInput(raw: string | null): string {
  return raw ? raw.trim() : '';
}

function permissionForKind(kind: AuditKind) {
  if (kind === 'form-submission' || kind === 'contact-shared' || kind === 'contact-sync' || kind === 'contact-status') {
    return 'forms.view';
  }
  if (kind === 'comment-submitted' || kind === 'comment-status' || kind === 'comment-reported') {
    return 'comments.view';
  }
  if (kind === 'commerce-webhook') {
    return 'commerce.view';
  }

  return 'activity.export';
}

function metadataText(event: BackyAuditLogEntry, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function auditLogToPublicEvent(event: BackyAuditLogEntry) {
  return {
    id: event.id,
    siteId: event.siteId || '',
    kind: event.action,
    formId: metadataText(event, 'formId'),
    commentId: event.entity === 'comment' ? event.entityId : metadataText(event, 'commentId'),
    contactId: event.entity === 'contact' ? event.entityId : metadataText(event, 'contactId'),
    submissionId: event.entity === 'formSubmission' ? event.entityId : metadataText(event, 'submissionId'),
    target: metadataText(event, 'target') || `${event.entity}:${event.entityId}`,
    status: metadataText(event, 'status') || 'succeeded',
    statusCode: typeof event.metadata?.statusCode === 'number' ? event.metadata.statusCode : undefined,
    requestId: event.requestId,
    reason: metadataText(event, 'reason'),
    actor: event.actorId || metadataText(event, 'actor'),
    metadata: event.metadata || {},
    error: metadataText(event, 'error') || undefined,
    createdAt: event.createdAt,
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get('kind'));
    const requestId = parseTextInput(searchParams.get('requestId'));
    const formId = parseTextInput(searchParams.get('formId'));
    const commentId = parseTextInput(searchParams.get('commentId'));
    const contactId = parseTextInput(searchParams.get('contactId'));
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));
    const access = requireAdminAccess(request, responseRequestId, { permission: permissionForKind(kind) });
    if (access instanceof NextResponse) {
      return access;
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const result = await repositories.auditLogs.list({
        siteId: site.id,
        action: kind === 'all' ? undefined : kind,
        requestId: requestId || undefined,
        limit,
        offset,
      });
      const events = result.items
        .map(auditLogToPublicEvent)
        .filter((event) => formId ? event.formId === formId : true)
        .filter((event) => commentId ? event.commentId === commentId : true)
        .filter((event) => contactId ? event.contactId === contactId : true);

      return privateResponse({
        success: true,
        requestId: responseRequestId,
        data: {
          siteId: site.id,
          events,
          count: events.length,
          pagination: {
            ...result.pagination,
            total: events.length,
          },
        },
        siteId: site.id,
        events,
        count: events.length,
        pagination: {
          ...result.pagination,
          total: events.length,
        },
      }, responseRequestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const result = listAuditEvents(site.id, {
      kind,
      requestId: requestId || undefined,
      formId: formId || undefined,
      commentId: commentId || undefined,
      contactId: contactId || undefined,
      limit,
      offset,
    });

    return privateResponse({
      success: true,
      requestId: responseRequestId,
      data: {
        siteId: site.id,
        events: result.events,
        count: result.count,
        pagination: result.pagination,
      },
      siteId: site.id,
      events: result.events,
      count: result.count,
      pagination: result.pagination,
    }, responseRequestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}
