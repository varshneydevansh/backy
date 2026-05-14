/**
 * Public CMS collection record mutation endpoint.
 *
 * PATCH  /api/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * DELETE /api/sites/[siteId]/collections/[collectionId]/records/[recordId]
 */

import { NextRequest } from 'next/server';
import type { BackyCollection, BackyJsonValue } from '@backy-cms/core';
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { withCollectionRecordFrontendDesign } from '@/lib/publicCollectionResources';
import { normalizeCollectionRecordMediaValues, validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
    recordId: string;
  }>;
}

type PublicWriteAction = 'update' | 'delete';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
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

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const normalizeString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value
        .map((item) => normalizeString(item))
        .filter(Boolean)
    : []
);

const bearerToken = (request: NextRequest): string => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const publicWriteTokenFromRequest = (request: NextRequest, body: Record<string, unknown> = {}): string => (
  bearerToken(request) ||
  normalizeString(request.headers.get('x-backy-public-write-token')) ||
  normalizeString(request.headers.get('x-backy-visitor-token')) ||
  normalizeString(body.publicWriteToken) ||
  normalizeString(body.writeToken) ||
  normalizeString(body.token)
);

const publicWritePolicyFromCollection = (
  collection: StoreCollection | { metadata?: unknown },
) => {
  const metadata = toRecord(collection.metadata);
  const policy = toRecord(metadata.visitorWritePolicy);
  const publicWriteToken = normalizeString(policy.publicWriteToken) || normalizeString(metadata.publicWriteToken);
  const updateToken = normalizeString(policy.updateToken) || publicWriteToken;
  const deleteToken = normalizeString(policy.deleteToken) || publicWriteToken;
  const updateFieldMode = policy.updateFieldMode === 'selected' ? 'selected' : 'all';
  const allowedUpdateFields = normalizeStringList(policy.allowedUpdateFields);

  return {
    updateFieldMode,
    allowedUpdateFields,
    updateToken,
    deleteToken,
    hasUpdateToken: Boolean(updateToken),
    hasDeleteToken: Boolean(deleteToken),
  };
};

const authorizePublicWrite = (
  collection: StoreCollection | { metadata?: unknown },
  action: PublicWriteAction,
  token: string,
) => {
  const policy = publicWritePolicyFromCollection(collection);
  const expectedToken = action === 'update' ? policy.updateToken : policy.deleteToken;
  const hasConfiguredToken = action === 'update' ? policy.hasUpdateToken : policy.hasDeleteToken;

  return {
    ok: Boolean(token && expectedToken && token === expectedToken),
    hasConfiguredToken,
    policy,
  };
};

const applyPublicUpdateFieldPolicy = (
  collection: StoreCollection | { metadata?: unknown },
  values: Record<string, unknown>,
) => {
  const policy = publicWritePolicyFromCollection(collection);
  if (policy.updateFieldMode !== 'selected') {
    return { values, ignoredFields: [], allowedUpdateFields: [] };
  }

  const allowed = new Set(policy.allowedUpdateFields);
  const filteredValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key)),
  );
  const ignoredFields = Object.keys(values).filter((key) => !allowed.has(key));

  return {
    values: filteredValues,
    ignoredFields,
    allowedUpdateFields: policy.allowedUpdateFields,
  };
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId, recordId } = await params;
    const body = await parseJsonBody(request);
    const submittedValues = toRecord(body.values || body.fields);
    const token = publicWriteTokenFromRequest(request, body);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection || collection.status !== 'published') {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      if (!collection.permissions.publicUpdate) {
        return errorResponse(403, 'PUBLIC_UPDATE_DISABLED', 'This collection does not allow public record updates', requestId);
      }

      const authorization = authorizePublicWrite(collection, 'update', token);
      if (!authorization.ok) {
        return errorResponse(
          403,
          'PUBLIC_UPDATE_AUTH_REQUIRED',
          authorization.hasConfiguredToken
            ? 'A valid public write token is required to update this collection record'
            : 'Public updates require a configured collection write token',
          requestId,
        );
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      const updatePolicy = applyPublicUpdateFieldPolicy(collection, submittedValues);
      const normalizedUpdateValues = normalizeCollectionRecordMediaValues(collection, updatePolicy.values);
      const updatePolicyResponse = { ...updatePolicy, values: normalizedUpdateValues };
      const values = normalizeCollectionRecordMediaValues(collection, { ...record.values, ...normalizedUpdateValues });
      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository: repositories.collections,
        mediaRepository: repositories.media,
        siteId: site.id,
        collection,
        values,
        existingValues: record.values,
        excludeRecordId: record.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;

      return privateResponse({
        success: true,
        requestId,
        data: { record: withCollectionRecordFrontendDesign(updated), visitorWritePolicy: updatePolicyResponse },
        record: withCollectionRecordFrontendDesign(updated),
        visitorWritePolicy: updatePolicyResponse,
      }, requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection || collection.status !== 'published') {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    if (!collection.permissions.publicUpdate) {
      return errorResponse(403, 'PUBLIC_UPDATE_DISABLED', 'This collection does not allow public record updates', requestId);
    }

    const authorization = authorizePublicWrite(collection, 'update', token);
    if (!authorization.ok) {
      return errorResponse(
        403,
        'PUBLIC_UPDATE_AUTH_REQUIRED',
        authorization.hasConfiguredToken
          ? 'A valid public write token is required to update this collection record'
          : 'Public updates require a configured collection write token',
        requestId,
      );
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const updatePolicy = applyPublicUpdateFieldPolicy(collection, submittedValues);
    const normalizedUpdateValues = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      updatePolicy.values,
    );
    const updatePolicyResponse = { ...updatePolicy, values: normalizedUpdateValues };
    const values = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      { ...record.values, ...normalizedUpdateValues },
    );
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
    }

    const updated = updateAdminCollectionRecord(site.id, collection.id, record.id, { values });
    if (!updated) {
      return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return privateResponse({
      success: true,
      requestId,
      data: { record: withCollectionRecordFrontendDesign(updated), visitorWritePolicy: updatePolicyResponse },
      record: withCollectionRecordFrontendDesign(updated),
      visitorWritePolicy: updatePolicyResponse,
    }, requestId);
  } catch (error) {
    console.error('Public collection record update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId, recordId } = await params;
    const body = await parseJsonBody(request);
    const token = publicWriteTokenFromRequest(request, body);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection || collection.status !== 'published') {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      if (!collection.permissions.publicDelete) {
        return errorResponse(403, 'PUBLIC_DELETE_DISABLED', 'This collection does not allow public record deletion', requestId);
      }

      const authorization = authorizePublicWrite(collection, 'delete', token);
      if (!authorization.ok) {
        return errorResponse(
          403,
          'PUBLIC_DELETE_AUTH_REQUIRED',
          authorization.hasConfiguredToken
            ? 'A valid public write token is required to delete this collection record'
            : 'Public deletes require a configured collection write token',
          requestId,
        );
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      await repositories.collections.deleteRecord(site.id, collection.id, record.id);
      return privateResponse({
        success: true,
        requestId,
        data: {
          deleted: true,
          recordId: record.id,
          slug: record.slug,
        },
        deleted: true,
        recordId: record.id,
        slug: record.slug,
      }, requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection || collection.status !== 'published') {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    if (!collection.permissions.publicDelete) {
      return errorResponse(403, 'PUBLIC_DELETE_DISABLED', 'This collection does not allow public record deletion', requestId);
    }

    const authorization = authorizePublicWrite(collection, 'delete', token);
    if (!authorization.ok) {
      return errorResponse(
        403,
        'PUBLIC_DELETE_AUTH_REQUIRED',
        authorization.hasConfiguredToken
          ? 'A valid public write token is required to delete this collection record'
          : 'Public deletes require a configured collection write token',
        requestId,
      );
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const deleted = deleteAdminCollectionRecord(site.id, collection.id, record.id);
    if (!deleted) {
      return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return privateResponse({
      success: true,
      requestId,
      data: {
        deleted: true,
        recordId: record.id,
        slug: record.slug,
      },
      deleted: true,
      recordId: record.id,
      slug: record.slug,
    }, requestId);
  } catch (error) {
    console.error('Public collection record delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
