/**
 * ==========================================================================
 * REST API - Public Media Folders Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/media/folders - List public media folder tree
 */

import { NextRequest } from 'next/server';
import type { MediaFolder, MediaItem } from '@backy-cms/core';
import { getMediaList, getSiteByIdOrSlug, listMediaFolders } from '@/lib/backyStore';
import { isMediaQuarantined } from '@/lib/mediaSafety';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

interface PublicMediaFolder extends MediaFolder {
    path: string;
    depth: number;
    childIds: string[];
    directAssetCount: number;
    assetCount: number;
}

interface PublicMediaRootFolder {
    id: null;
    name: 'Root';
    path: 'Root';
    depth: -1;
    childIds: string[];
    directAssetCount: number;
    assetCount: number;
}

const MEDIA_FOLDERS_SCHEMA_VERSION = 'backy.media-folders.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
        {
            status,
            requestId,
            cache: 'error',
            schemaVersion: MEDIA_FOLDERS_SCHEMA_VERSION,
        },
    )
);

const compareFolders = (a: MediaFolder, b: MediaFolder) => (
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
);

const buildPublicMediaFolders = (
    folders: MediaFolder[],
    media: MediaItem[],
): { folders: PublicMediaFolder[]; root: PublicMediaRootFolder } => {
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const directCounts = new Map<string, number>();
    let rootDirectAssetCount = 0;

    for (const item of media) {
        if (item.folderId && folderById.has(item.folderId)) {
            directCounts.set(item.folderId, (directCounts.get(item.folderId) || 0) + 1);
            continue;
        }

        rootDirectAssetCount += 1;
    }

    const visibleFolderIds = new Set<string>();
    const includeFolderAndAncestors = (folderId: string) => {
        let currentId: string | null = folderId;
        const seen = new Set<string>();

        while (currentId && !seen.has(currentId)) {
            seen.add(currentId);
            const folder = folderById.get(currentId);
            if (!folder) {
                return;
            }
            visibleFolderIds.add(folder.id);
            currentId = folder.parentId;
        }
    };

    for (const folderId of directCounts.keys()) {
        includeFolderAndAncestors(folderId);
    }

    const childrenByParent = new Map<string, MediaFolder[]>();
    for (const folder of folders) {
        if (!visibleFolderIds.has(folder.id)) {
            continue;
        }

        const parentId = folder.parentId && visibleFolderIds.has(folder.parentId)
            ? folder.parentId
            : 'root';
        const siblings = childrenByParent.get(parentId) || [];
        siblings.push(folder);
        childrenByParent.set(parentId, siblings);
    }

    for (const siblings of childrenByParent.values()) {
        siblings.sort(compareFolders);
    }

    const subtreeCounts = new Map<string, number>();
    const counting = new Set<string>();
    const countSubtreeAssets = (folderId: string): number => {
        const existing = subtreeCounts.get(folderId);
        if (existing !== undefined) {
            return existing;
        }
        if (counting.has(folderId)) {
            return directCounts.get(folderId) || 0;
        }

        counting.add(folderId);
        const total = (directCounts.get(folderId) || 0) + (childrenByParent.get(folderId) || [])
            .reduce((sum, child) => sum + countSubtreeAssets(child.id), 0);
        counting.delete(folderId);
        subtreeCounts.set(folderId, total);
        return total;
    };

    const publicFolders: PublicMediaFolder[] = [];
    const visited = new Set<string>();
    const walk = (folder: MediaFolder, parentPath: string, depth: number) => {
        if (visited.has(folder.id)) {
            return;
        }

        visited.add(folder.id);
        const children = childrenByParent.get(folder.id) || [];
        const path = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        publicFolders.push({
            ...folder,
            path,
            depth,
            childIds: children.map((child) => child.id),
            directAssetCount: directCounts.get(folder.id) || 0,
            assetCount: countSubtreeAssets(folder.id),
        });

        for (const child of children) {
            walk(child, path, depth + 1);
        }
    };

    const rootChildren = childrenByParent.get('root') || [];
    for (const folder of rootChildren) {
        walk(folder, '', 0);
    }

    for (const folder of folders.filter((folder) => visibleFolderIds.has(folder.id)).sort(compareFolders)) {
        walk(folder, '', 0);
    }

    return {
        folders: publicFolders,
        root: {
            id: null,
            name: 'Root',
            path: 'Root',
            depth: -1,
            childIds: rootChildren.map((folder) => folder.id),
            directAssetCount: rootDirectAssetCount,
            assetCount: media.length,
        },
    };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId } = await params;

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
            if (!site || !site.isPublished) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            const [folders, result, cacheRevision] = await Promise.all([
                repositories.media.listFolders(site.id),
                repositories.media.list({
                    siteId: site.id,
                    visibility: 'public',
                    limit: 10000,
                    offset: 0,
                }),
                repositories.cacheInvalidations.latestRevision({
                    siteId: site.id,
                    scope: 'media',
                }),
            ]);
            const publicMedia = result.items.filter((item) => !isMediaQuarantined(item));
            const folderPayload = buildPublicMediaFolders(folders, publicMedia);
            const data = {
                schemaVersion: MEDIA_FOLDERS_SCHEMA_VERSION,
                ...folderPayload,
                count: folderPayload.folders.length,
                publicAssetCount: publicMedia.length,
            };

            return publicContractJson({
                success: true,
                requestId,
                data,
                ...data,
            }, {
                requestId,
                request,
                cache: 'discovery',
                siteId: site.id,
                cacheRevision: cacheRevision || undefined,
                schemaVersion: MEDIA_FOLDERS_SCHEMA_VERSION,
            });
        }

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        }

        const folders = listMediaFolders(site.id);
        const mediaPayload = getMediaList(site.id, {
            visibility: 'public',
            limit: 10000,
            offset: 0,
        });
        const publicMedia = mediaPayload.media.filter((item) => !isMediaQuarantined(item));
        const folderPayload = buildPublicMediaFolders(folders, publicMedia);
        const data = {
            schemaVersion: MEDIA_FOLDERS_SCHEMA_VERSION,
            ...folderPayload,
            count: folderPayload.folders.length,
            publicAssetCount: publicMedia.length,
        };

        return publicContractJson({
            success: true,
            requestId,
            data,
            ...data,
        }, {
            requestId,
            request,
            cache: 'discovery',
            siteId: site.id,
            schemaVersion: MEDIA_FOLDERS_SCHEMA_VERSION,
        });
    } catch (error) {
        console.error('Public media folders API error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
