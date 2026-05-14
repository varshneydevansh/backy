/**
 * Admin CMS collection record bulk actions endpoint.
 *
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records/bulk
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject, PublishStatus } from '@backy-cms/core';
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
  }>;
}

interface CollectionAuditSource {
  id: string;
  name: string;
  slug: string;
}

interface CollectionRecordAuditSource {
  id: string;
  collectionId: string;
  slug: string;
  status: string;
  values?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
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

const parseRecordIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
    : []
);

const parseRecordStatus = (value: unknown): PublishStatus | null => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : null
);

const collectionRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
): BackyJsonObject => {
  const valueKeys = Object.keys(toRecord(record.values)).sort();
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    collectionSlug: collection.slug,
    recordId: record.id,
    slug: record.slug,
    status: record.status,
    valueKeys,
    valueCount: valueKeys.length,
    scheduledAt: record.scheduledAt || null,
    publishedAt: record.publishedAt || null,
  };
};

const bulkRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  input: {
    action: string;
    requestedRecordIds: string[];
    matchedCount: number;
    changedFields?: string[];
  },
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  bulk: true,
  bulkAction: input.action,
  requestedRecordIds: input.requestedRecordIds,
  requestedCount: input.requestedRecordIds.length,
  matchedCount: input.matchedCount,
  changedFields: input.changedFields || [],
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const action = typeof body.action === 'string' ? body.action : '';
  const access = await requireAdminAccess(request, requestId, { permission: action === 'delete' ? 'collections.delete' : 'collections.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }
      const commerceAccess = await requireCommerceCollectionAccess(
        request,
        requestId,
        collection.slug,
        action === 'delete' ? 'delete' : 'edit',
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const recordIds = parseRecordIds(body.recordIds);

      if (recordIds.length === 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'At least one collection record must be selected', requestId);
      }

      if (action === 'delete') {
        let deleted = 0;
        let skipped = 0;
        const deletedRecords: CollectionRecordAuditSource[] = [];

        for (const recordId of recordIds) {
          const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
            || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
          if (!record) {
            skipped += 1;
            continue;
          }

          if (await repositories.collections.deleteRecord(site.id, collection.id, record.id)) {
            deletedRecords.push(record);
            deleted += 1;
          } else {
            skipped += 1;
          }
        }

        for (const record of deletedRecords) {
          await recordAdminAudit({
            repositories,
            siteId: site.id,
            entity: 'collectionRecord',
            entityId: record.id,
            action: 'delete',
            before: collectionRecordAuditMetadata(collection, record),
            metadata: bulkRecordAuditMetadata(collection, record, {
              action,
              requestedRecordIds: recordIds,
              matchedCount: deleted,
            }),
            requestId,
          });
        }

        const cacheInvalidation = deleted > 0
          ? await recordSiteCacheInvalidation(repositories, {
              siteId: site.id,
              scope: 'content',
              entity: 'collection',
              entityId: collection.id,
              reason: 'collection-records-deleted',
              requestId,
            })
          : undefined;

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            action,
            deleted,
            updated: 0,
            skipped,
            records: [],
            cacheInvalidation,
          },
        });
      }

      if (action === 'updateStatus') {
        const status = parseRecordStatus(body.status);
        if (!status) {
          return errorResponse(400, 'VALIDATION_ERROR', 'A valid status is required for bulk status updates', requestId);
        }

        const records = [];
        const updatedRecords: Array<{
          before: CollectionRecordAuditSource;
          after: CollectionRecordAuditSource;
        }> = [];
        let updated = 0;
        let skipped = 0;

        for (const recordId of recordIds) {
          const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
            || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
          if (!record) {
            skipped += 1;
            continue;
          }

          const saved = (await repositories.collections.updateRecord(site.id, collection.id, record.id, { status })).item;
          records.push(saved);
          updatedRecords.push({ before: record, after: saved });
          updated += 1;
        }

        for (const { before, after } of updatedRecords) {
          await recordAdminAudit({
            repositories,
            siteId: site.id,
            entity: 'collectionRecord',
            entityId: after.id,
            action: 'update',
            before: collectionRecordAuditMetadata(collection, before),
            after: collectionRecordAuditMetadata(collection, after),
            metadata: bulkRecordAuditMetadata(collection, after, {
              action,
              requestedRecordIds: recordIds,
              matchedCount: updated,
              changedFields: ['status'],
            }),
            requestId,
          });
        }

        const cacheInvalidation = updated > 0
          ? await recordSiteCacheInvalidation(repositories, {
              siteId: site.id,
              scope: 'content',
              entity: 'collection',
              entityId: collection.id,
              reason: 'collection-records-status-updated',
              requestId,
            })
          : undefined;

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            action,
            deleted: 0,
            updated,
            skipped,
            records,
            cacheInvalidation,
          },
        });
      }

      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported bulk collection record action', requestId);
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    const commerceAccess = await requireCommerceCollectionAccess(
      request,
      requestId,
      collection.slug,
      action === 'delete' ? 'delete' : 'edit',
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const recordIds = parseRecordIds(body.recordIds);

    if (recordIds.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'At least one collection record must be selected', requestId);
    }

    if (action === 'delete') {
      let deleted = 0;
      let skipped = 0;
      const deletedRecords: CollectionRecordAuditSource[] = [];

      for (const recordId of recordIds) {
        const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
        if (!record) {
          skipped += 1;
          continue;
        }

        if (deleteAdminCollectionRecord(site.id, collection.id, record.id)) {
          deletedRecords.push(record);
          deleted += 1;
        } else {
          skipped += 1;
        }
      }

      for (const record of deletedRecords) {
        await recordAdminAudit({
          siteId: site.id,
          entity: 'collectionRecord',
          entityId: record.id,
          action: 'delete',
          before: collectionRecordAuditMetadata(collection, record),
          metadata: bulkRecordAuditMetadata(collection, record, {
            action,
            requestedRecordIds: recordIds,
            matchedCount: deleted,
          }),
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          deleted,
          updated: 0,
          skipped,
          records: [],
        },
      });
    }

    if (action === 'updateStatus') {
      const status = parseRecordStatus(body.status);
      if (!status) {
        return errorResponse(400, 'VALIDATION_ERROR', 'A valid status is required for bulk status updates', requestId);
      }

      const records = [];
      const updatedRecords: Array<{
        before: CollectionRecordAuditSource;
        after: CollectionRecordAuditSource;
      }> = [];
      let updated = 0;
      let skipped = 0;

      for (const recordId of recordIds) {
        const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
        if (!record) {
          skipped += 1;
          continue;
        }

        const saved = updateAdminCollectionRecord(site.id, collection.id, record.id, { status });
        if (saved) {
          records.push(saved);
          updatedRecords.push({ before: record, after: saved });
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      for (const { before, after } of updatedRecords) {
        await recordAdminAudit({
          siteId: site.id,
          entity: 'collectionRecord',
          entityId: after.id,
          action: 'update',
          before: collectionRecordAuditMetadata(collection, before),
          after: collectionRecordAuditMetadata(collection, after),
          metadata: bulkRecordAuditMetadata(collection, after, {
            action,
            requestedRecordIds: recordIds,
            matchedCount: updated,
            changedFields: ['status'],
          }),
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          deleted: 0,
          updated,
          skipped,
          records,
        },
      });
    }

    return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported bulk collection record action', requestId);
  } catch (error) {
    console.error('Admin collection record bulk API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
