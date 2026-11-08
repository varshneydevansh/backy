import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCommentBlocklistEntries,
  getSiteByIdOrSlug,
  listCommentBlocklist,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

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

const parseType = (raw: string | null) => (raw === 'email' || raw === 'ip' ? raw : 'all');

const parseBoundedInteger = (raw: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const parseIds = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof raw === 'string') {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'comments.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories
      ? await resolveRepositorySite(repositories, siteId)
      : getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseBoundedInteger(searchParams.get('limit'), 50, 1, 100);
    const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const type = parseType(searchParams.get('type'));
    const result = repositories ? await repositories.comments.listBlocklist({
      siteId: site.id,
      type,
      q: searchParams.get('q') || undefined,
      limit,
      offset,
    }) : listCommentBlocklist(site.id, {
      type,
      q: searchParams.get('q') || undefined,
      limit,
      offset,
    });
    const blocklist = 'items' in result ? result.items : result.blocklist;
    const count = 'items' in result ? result.pagination.total : result.count;

    return privateResponse({
      success: true,
      requestId,
      data: {
        siteId: site.id,
        blocklist,
        count,
        pagination: result.pagination,
      },
      siteId: site.id,
      blocklist,
      count,
      pagination: result.pagination,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories
      ? await resolveRepositorySite(repositories, siteId)
      : getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await request.json().catch(() => ({}));
    const ids = parseIds((body as { ids?: unknown; blocklistIds?: unknown }).ids ?? (body as { blocklistIds?: unknown }).blocklistIds);
    if (!ids.length) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'ids or blocklistIds are required', requestId);
    }

    if (repositories && typeof repositories.comments.deleteBlocklistEntries !== 'function') return errorResponse(503, 'COMMENT_MODERATION_UNAVAILABLE', 'Atomic blocklist deletion is unavailable.', requestId);
    const completionWarnings: string[] = [];
    const result = repositories
      ? await repositories.comments.deleteBlocklistEntries(site.id, ids)
      : deleteCommentBlocklistEntries({ siteId: site.id, ids });
    try { await recordAdminAudit({
      repositories,
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'comment',
      entityId: 'blocklist',
      action: 'commentBlocklist.delete',
      metadata: {
        permission: 'comments.manage',
        deletedCount: result.deleted.length,
        missingCount: result.missingIds.length,
        blocklistIds: result.deleted.map((entry) => entry.id),
        types: Array.from(new Set(result.deleted.map((entry) => entry.type))),
      },
      requestId,
    }); } catch { completionWarnings.push('COMMENT_AUDIT_PENDING'); }

    return privateResponse({
      success: true,
      requestId,
      data: {
        siteId: site.id,
        deleted: result.deleted,
        deletedCount: result.deleted.length,
        missingIds: result.missingIds,
        completionWarnings,
        concurrencyBoundary: repositories ? 'database-site-row-lock' : 'demo-single-process',
      },
      siteId: site.id,
      deleted: result.deleted,
      deletedCount: result.deleted.length,
      missingIds: result.missingIds,
    }, requestId);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'COMMENT_MODERATION_CONFLICT' || code === 'COMMENT_PARENT_CONFLICT') return errorResponse(409, 'COMMENT_MODERATION_CONFLICT', 'The selected blocklist scope changed. Reload before deleting.', requestId);
    if (code === 'COMMENT_MODERATION_UNAVAILABLE' || code === 'COMMENT_INVENTORY_INCOMPLETE') return errorResponse(503, code, 'The selected blocklist could not be removed atomically. No deletion was committed.', requestId);
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
