import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createMediaFolder, getSiteByIdOrSlug, listMediaFolders } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

const nullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const numberFromInput = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const folders = await repositories.media.listFolders(site.id);
      return NextResponse.json({ success: true, requestId, data: { folders } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const folders = listMediaFolders(site.id);

    return NextResponse.json({ success: true, requestId, data: { folders } });
  } catch (error) {
    console.error('Admin media folders list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Folder name is required', requestId);
    }

    const parentId = nullableString(body.parentId);
    if (parentId) {
      const parentFolder = repositories
        ? await repositories.media.getFolderById(site.id, parentId)
        : listMediaFolders(site.id).find((folder) => folder.id === parentId);

      if (!parentFolder) {
        return errorResponse(404, 'PARENT_FOLDER_NOT_FOUND', 'Parent media folder not found', requestId);
      }
    }
    const sortOrder = numberFromInput(body.sortOrder);

    const folder = repositories
      ? (await repositories.media.createFolder({
          siteId: site.id,
          name,
          parentId,
          sortOrder,
        })).item
      : createMediaFolder(site.id, { name, parentId, sortOrder });
    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: 'mediaFolder',
      entityId: folder.id,
      action: 'mediaFolder.create',
      after: folder,
      metadata: {
        name: folder.name,
        parentId: folder.parentId,
        sortOrder: folder.sortOrder,
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'media',
          entity: 'mediaFolder',
          entityId: folder.id,
          reason: 'media-folder-created',
          requestId,
        })
      : undefined;

    return NextResponse.json({ success: true, requestId, data: { folder, cacheInvalidation } }, { status: 201 });
  } catch (error) {
    console.error('Admin media folder create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
