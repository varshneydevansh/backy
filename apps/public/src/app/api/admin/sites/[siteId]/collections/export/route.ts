/**
 * Admin CMS collection backup export endpoint.
 *
 * GET /api/admin/sites/[siteId]/collections/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getSiteByIdOrSlug,
  listCollections,
  listCollectionRecords,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { collectCompleteExportPages, CollectionExportIncompleteError } from '@/lib/collectionExportPagination';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ExportableCollection = BackyCollection & {
  records: ExportableRecord[];
};

type ExportableRecord = {
  id: string;
  slug: string;
  status: string;
  values: Record<string, unknown>;
  publishedAt?: string | null;
  scheduledAt?: string | null;
};

type BackyCollection = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields: unknown[];
  permissions?: unknown;
  metadata?: Record<string, unknown> | null;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const normalizeIdSet = (value: string | null): Set<string> | null => {
  if (!value) return null;
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
};

const exportRecord = (record: ExportableRecord) => ({
  sourceRecordId: record.id,
  slug: record.slug,
  status: record.status,
  values: record.values,
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const exportCollection = (collection: ExportableCollection) => ({
  sourceCollectionId: collection.id,
  name: collection.name,
  slug: collection.slug,
  description: collection.description || null,
  status: collection.status,
  routePattern: collection.routePattern || null,
  listRoutePattern: collection.listRoutePattern || null,
  fields: collection.fields,
  permissions: collection.permissions,
  metadata: collection.metadata || {},
  records: collection.records.map(exportRecord),
});

const exportPayload = (input: {
  requestId: string;
  siteId: string;
  siteSlug?: string;
  collections: ExportableCollection[];
}) => {
  const recordCount = input.collections.reduce((total, collection) => total + collection.records.length, 0);

  return {
    success: true,
    requestId: input.requestId,
    data: {
      backup: {
        schemaVersion: 'backy.collections.backup.v1',
        exportedAt: new Date().toISOString(),
        siteId: input.siteId,
        siteSlug: input.siteSlug,
        collectionCount: input.collections.length,
        recordCount,
      },
      collections: input.collections.map(exportCollection),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'collections.export' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const ids = normalizeIdSet(searchParams.get('ids') || searchParams.get('collectionIds'));
    const includeRecords = searchParams.get('records') !== 'false';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const schemas = await collectCompleteExportPages((pagination) => repositories.collections.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        ...pagination,
      }), (collection) => collection.siteId === site.id);
      const collections = schemas
        .filter((collection) => ids ? ids.has(collection.id) || ids.has(collection.slug) : true);
      const exportableCollections = await Promise.all(collections.map(async (collection) => ({
        ...collection,
        records: includeRecords
          ? await collectCompleteExportPages((pagination) => repositories.collections.listRecords({
              siteId: site.id, collectionId: collection.id, includeUnpublished: true, status: 'all', ...pagination,
            }), (record) => record.siteId === site.id && record.collectionId === collection.id)
          : [],
      })));
      const payload = exportPayload({
        requestId,
        siteId: site.id,
        siteSlug: site.slug,
        collections: exportableCollections,
      });

      return NextResponse.json(payload, {
        headers: {
          'content-disposition': `attachment; filename="${site.slug || site.id}-collections-backup.json"`,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collections = await Promise.all(listCollections(site.id, { includeUnpublished: true })
      .filter((collection) => ids ? ids.has(collection.id) || ids.has(collection.slug) : true)
      .map(async (collection) => ({
        ...collection,
        records: includeRecords
          ? await collectCompleteExportPages(async (pagination) => {
              const page = listCollectionRecords(site.id, collection.id, { includeUnpublished: true, ...pagination });
              return { items: page.records, pagination: page.pagination };
            }, (record) => record.siteId === site.id && record.collectionId === collection.id)
          : [],
      })));
    const payload = exportPayload({ requestId, siteId: site.id, siteSlug: site.slug, collections });

    return NextResponse.json(payload, {
      headers: {
        'content-disposition': `attachment; filename="${site.slug || site.id}-collections-backup.json"`,
      },
    });
  } catch (error) {
    if (error instanceof CollectionExportIncompleteError) return errorResponse(409, 'COLLECTION_EXPORT_INCOMPLETE', error.message, requestId);
    console.error('Admin collections backup export API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
