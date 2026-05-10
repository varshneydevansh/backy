import { NextRequest } from 'next/server';
import {
  deleteCommentBlocklistEntries,
  getSiteByIdOrSlug,
  listCommentBlocklist,
} from '@/lib/backyStore';
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
    const limit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const result = listCommentBlocklist(site.id, {
      type: parseType(searchParams.get('type')),
      q: searchParams.get('q') || undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return privateResponse({
      success: true,
      requestId,
      data: {
        siteId: site.id,
        blocklist: result.blocklist,
        count: result.count,
        pagination: result.pagination,
      },
      siteId: site.id,
      blocklist: result.blocklist,
      count: result.count,
      pagination: result.pagination,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

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

    const result = deleteCommentBlocklistEntries({ siteId: site.id, ids });

    return privateResponse({
      success: true,
      requestId,
      data: {
        siteId: site.id,
        deleted: result.deleted,
        deletedCount: result.deleted.length,
        missingIds: result.missingIds,
      },
      siteId: site.id,
      deleted: result.deleted,
      deletedCount: result.deleted.length,
      missingIds: result.missingIds,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
