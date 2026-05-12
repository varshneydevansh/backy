import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { deleteMediaFolder, getSiteByIdOrSlug, listMediaFolders, updateMediaFolder } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { MediaFolder } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    folderId: string;
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

const listDemoMediaFolder = (siteId: string, folderId: string) => (
  listMediaFolders(siteId).find((folder) => folder.id === folderId)
);

const wouldCreateFolderCycle = (
  folders: Array<Pick<MediaFolder, 'id' | 'parentId'>>,
  folderId: string,
  parentId: string | null | undefined,
) => {
  let currentParentId = parentId;
  const seen = new Set<string>();

  while (currentParentId) {
    if (currentParentId === folderId || seen.has(currentParentId)) {
      return true;
    }

    seen.add(currentParentId);
    currentParentId = folders.find((folder) => folder.id === currentParentId)?.parentId ?? null;
  }

  return false;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, folderId } = await params;
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const parentId = nullableString(body.parentId);

    if (repositories) {
      const beforeFolder = await repositories.media.getFolderById(site.id, folderId);
      if (!beforeFolder) {
        return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
      }

      if (parentId === folderId) {
        return errorResponse(400, 'VALIDATION_ERROR', 'A media folder cannot be its own parent', requestId);
      }

      if (parentId) {
        const folders = await repositories.media.listFolders(site.id);
        if (!folders.some((folder) => folder.id === parentId)) {
          return errorResponse(404, 'PARENT_FOLDER_NOT_FOUND', 'Parent media folder not found', requestId);
        }

        if (wouldCreateFolderCycle(folders, folderId, parentId)) {
          return errorResponse(400, 'VALIDATION_ERROR', 'A media folder cannot be moved inside one of its descendants', requestId);
        }
      }

      const folder = (await repositories.media.updateFolder(site.id, folderId, {
        name: typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : undefined,
        parentId,
        sortOrder: numberFromInput(body.sortOrder),
      })).item;
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'mediaFolder',
        entityId: folder.id,
        action: 'mediaFolder.update',
        before: beforeFolder,
        after: folder,
        metadata: {
          changedKeys: Object.keys(body),
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'media',
        entity: 'mediaFolder',
        entityId: folder.id,
        reason: 'media-folder-updated',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { folder, cacheInvalidation } });
    }

    const beforeFolder = listDemoMediaFolder(site.id, folderId);
    if (!beforeFolder) {
      return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
    }

    if (parentId === folderId) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A media folder cannot be its own parent', requestId);
    }

    if (parentId) {
      const folders = listMediaFolders(site.id);
      if (!folders.some((item) => item.id === parentId)) {
        return errorResponse(404, 'PARENT_FOLDER_NOT_FOUND', 'Parent media folder not found', requestId);
      }

      if (wouldCreateFolderCycle(folders, folderId, parentId)) {
        return errorResponse(400, 'VALIDATION_ERROR', 'A media folder cannot be moved inside one of its descendants', requestId);
      }
    }

    const folder = updateMediaFolder(site.id, folderId, body);

    if (!folder) {
      return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'mediaFolder',
      entityId: folder.id,
      action: 'mediaFolder.update',
      before: beforeFolder,
      after: folder,
      metadata: {
        changedKeys: Object.keys(body),
      },
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { folder } });
  } catch (error) {
    console.error('Admin media folder update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, folderId } = await params;
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const beforeFolder = repositories
      ? await repositories.media.getFolderById(site.id, folderId)
      : listDemoMediaFolder(site.id, folderId);
    const deleted = repositories
      ? Boolean(beforeFolder && await repositories.media.deleteFolder(site.id, folderId))
      : deleteMediaFolder(site.id, folderId);

    if (!deleted) {
      return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
    }
    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: 'mediaFolder',
      entityId: folderId,
      action: 'mediaFolder.delete',
      before: beforeFolder,
      metadata: {
        name: beforeFolder?.name || null,
        parentId: beforeFolder?.parentId || null,
        sortOrder: beforeFolder?.sortOrder ?? null,
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'media',
          entity: 'mediaFolder',
          entityId: folderId,
          reason: 'media-folder-deleted',
          requestId,
        })
      : undefined;

    return NextResponse.json({ success: true, requestId, data: { deleted: true, folderId, cacheInvalidation } });
  } catch (error) {
    console.error('Admin media folder delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
