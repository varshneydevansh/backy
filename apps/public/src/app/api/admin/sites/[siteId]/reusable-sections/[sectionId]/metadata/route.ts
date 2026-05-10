/**
 * Admin reusable section structured metadata endpoint.
 *
 * GET   /api/admin/sites/[siteId]/reusable-sections/[sectionId]/metadata
 * PATCH /api/admin/sites/[siteId]/reusable-sections/[sectionId]/metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateReusableSection,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  buildReusableSectionMetadataPatch,
  reusableSectionLibraryMetadata,
} from '@/lib/reusableSectionMetadata';
import {
  buildReusableSectionUpdateMetadata,
  reusableSectionConflict,
  reusableSectionVersionFromMetadata,
} from '@/lib/reusableSectionVersions';
import type { BackyJsonObject } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) => (
  NextResponse.json({ success: false, requestId, error: { code, message, ...(details ? { details } : {}) } }, { status })
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const section = await repositories.reusableSections.getById(site.id, sectionId) ||
        await repositories.reusableSections.getBySlug(site.id, sectionId);
      if (!section) {
        return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sectionId: section.id,
          metadata: section.metadata || {},
          library: reusableSectionLibraryMetadata(section.metadata),
          version: reusableSectionVersionFromMetadata(section.metadata),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sectionId: section.id,
        metadata: section.metadata || {},
        library: reusableSectionLibraryMetadata(section.metadata),
        version: reusableSectionVersionFromMetadata(section.metadata),
      },
    });
  } catch (error) {
    console.error('Admin reusable section metadata API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const section = await repositories.reusableSections.getById(site.id, sectionId) ||
        await repositories.reusableSections.getBySlug(site.id, sectionId);
      if (!section) {
        return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
      }

      const versionConflict = reusableSectionConflict(section, body);
      if (versionConflict) {
        return errorResponse(409, 'REUSABLE_SECTION_VERSION_CONFLICT', 'Reusable section has changed since the client loaded it', requestId, {
          ...versionConflict,
          section,
        });
      }

      const patch = buildReusableSectionMetadataPatch(section.metadata, body);
      if (patch.errors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section metadata is invalid', requestId, {
          errors: patch.errors,
        });
      }

      const updatedBy = typeof body.updatedBy === 'string' && body.updatedBy.trim()
        ? body.updatedBy.trim()
        : section.updatedBy || null;
      const metadata = buildReusableSectionUpdateMetadata(section, patch.metadata, {
        actor: updatedBy,
        requestId,
      }) as BackyJsonObject;
      const updated = (await repositories.reusableSections.update(site.id, section.id, {
        metadata,
        updatedBy,
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: updated.id,
        reason: 'reusable-section-metadata-updated',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'reusableSection',
        entityId: updated.id,
        action: 'reusableSection.metadata.update',
        before: section,
        after: updated,
        metadata: {
          changedKeys: patch.changedKeys,
          version: reusableSectionVersionFromMetadata(updated.metadata),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          section: updated,
          metadata: updated.metadata || {},
          library: reusableSectionLibraryMetadata(updated.metadata),
          version: reusableSectionVersionFromMetadata(updated.metadata),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    const versionConflict = reusableSectionConflict(section, body);
    if (versionConflict) {
      return errorResponse(409, 'REUSABLE_SECTION_VERSION_CONFLICT', 'Reusable section has changed since the client loaded it', requestId, {
        ...versionConflict,
        section,
      });
    }

    const patch = buildReusableSectionMetadataPatch(section.metadata, body);
    if (patch.errors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section metadata is invalid', requestId, {
        errors: patch.errors,
      });
    }

    const updatedBy = typeof body.updatedBy === 'string' && body.updatedBy.trim()
      ? body.updatedBy.trim()
      : section.updatedBy || null;
    const updated = updateReusableSection(site.id, section.id, {
      metadata: buildReusableSectionUpdateMetadata(section, patch.metadata, {
        actor: updatedBy,
        requestId,
      }),
      updatedBy,
    });
    if (!updated) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'reusableSection',
      entityId: updated.id,
      action: 'reusableSection.metadata.update',
      before: section,
      after: updated,
      metadata: {
        changedKeys: patch.changedKeys,
        version: reusableSectionVersionFromMetadata(updated.metadata),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        section: updated,
        metadata: updated.metadata || {},
        library: reusableSectionLibraryMetadata(updated.metadata),
        version: reusableSectionVersionFromMetadata(updated.metadata),
      },
    });
  } catch (error) {
    console.error('Admin reusable section metadata update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
