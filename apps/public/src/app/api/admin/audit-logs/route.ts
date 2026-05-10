/**
 * Admin audit log endpoint.
 *
 * GET /api/admin/audit-logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAdminAudit } from '@/lib/adminAudit';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { BackyAuditLogListInput, BackyRepositoryEntity } from '@backy-cms/core';

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

const parseLimit = (value: string | null): number => {
  const parsed = value ? Number.parseInt(value, 10) : 50;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
};

const parseOffset = (value: string | null): number => {
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseText = (value: string | null): string | undefined => {
  const normalized = value?.trim();
  return normalized || undefined;
};

const parseEntity = (value: string | null): BackyRepositoryEntity | undefined => {
  if (
    value === 'site' ||
    value === 'page' ||
    value === 'post' ||
    value === 'blogCategory' ||
    value === 'blogTag' ||
    value === 'collection' ||
    value === 'collectionRecord' ||
    value === 'media' ||
    value === 'mediaFolder' ||
    value === 'form' ||
    value === 'formSubmission' ||
    value === 'reusableSection' ||
    value === 'contact' ||
    value === 'comment' ||
    value === 'user' ||
    value === 'settings' ||
    value === 'auditLog' ||
    value === 'cacheInvalidation'
  ) {
    return value;
  }

  return undefined;
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { searchParams } = new URL(request.url);
    const entityInput = searchParams.get('entity');
    const entity = parseEntity(entityInput);

    if (entityInput && !entity) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported audit entity filter', requestId);
    }

    const filters: BackyAuditLogListInput = {
      siteId: parseText(searchParams.get('siteId')),
      teamId: parseText(searchParams.get('teamId')),
      actorId: parseText(searchParams.get('actorId')),
      entity,
      entityId: parseText(searchParams.get('entityId')),
      action: parseText(searchParams.get('action')),
      requestId: parseText(searchParams.get('requestId')),
      limit: parseLimit(searchParams.get('limit')),
      offset: parseOffset(searchParams.get('offset')),
    };
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const result = await listAdminAudit({
      repositories,
      filters,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        logs: result.items,
        count: result.pagination.total,
        pagination: result.pagination,
      },
      logs: result.items,
      count: result.pagination.total,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Admin audit logs API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
