/**
 * Admin reusable section version restore endpoint.
 *
 * POST /api/admin/sites/[siteId]/reusable-sections/[sectionId]/versions/[version]/restore
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
  buildReusableSectionUpdateMetadata,
  listReusableSectionVersions,
  reusableSectionConflict,
  reusableSectionVersionFromMetadata,
  type ReusableSectionVersionEntry,
} from '@/lib/reusableSectionVersions';
import type { BackyJsonObject } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
    version: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const adminJson = (body: Record<string, unknown>, requestId: string, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-backy-cache-scope', 'admin');
  response.headers.set('x-backy-admin-contract-version', 'backy.admin.v1');
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) => (
  adminJson({ success: false, requestId, error: { code, message, ...(details ? { details } : {}) } }, requestId, status)
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const parseVersion = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

const asContent = (value: unknown): BackyJsonObject => (
  isRecord(value) ? value as BackyJsonObject : {}
);

const mergeRestoreMetadata = (
  metadata: unknown,
  target: ReusableSectionVersionEntry,
): BackyJsonObject => {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const reusableSection = isRecord(base.reusableSection) ? { ...base.reusableSection } : {};
  return {
    ...base,
    reusableSection: {
      ...reusableSection,
      restoredFromVersion: target.version,
      restoredFromUpdatedAt: target.updatedAt,
    },
  } as BackyJsonObject;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId, version } = await params;
    const targetVersion = parseVersion(version);
    if (!targetVersion) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A valid reusable section version is required', requestId);
    }
    const body = await parseJsonBody(request);
    const restoredBy = typeof body.restoredBy === 'string' && body.restoredBy.trim()
      ? body.restoredBy.trim()
      : typeof body.updatedBy === 'string' && body.updatedBy.trim()
        ? body.updatedBy.trim()
        : 'admin';

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

      const target = listReusableSectionVersions(section).versions.find((entry) => entry.version === targetVersion);
      if (!target) {
        return errorResponse(404, 'REUSABLE_SECTION_VERSION_NOT_FOUND', 'Reusable section version not found', requestId);
      }

      const slugConflict = await repositories.reusableSections.getBySlug(site.id, target.slug);
      if (slugConflict && slugConflict.id !== section.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId, { slug: target.slug });
      }

      const updated = (await repositories.reusableSections.update(site.id, section.id, {
        name: target.name,
        slug: target.slug,
        description: target.description ?? null,
        category: target.category,
        status: target.status === 'archived' ? 'archived' : 'active',
        tags: target.tags,
        content: asContent(target.content),
        metadata: buildReusableSectionUpdateMetadata(section, mergeRestoreMetadata(section.metadata, target), {
          actor: restoredBy,
          requestId,
        }) as BackyJsonObject,
        sourceElementId: target.sourceElementId ?? null,
        updatedBy: restoredBy,
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: updated.id,
        reason: 'reusable-section-restored',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'reusableSection',
        entityId: updated.id,
        action: 'reusableSection.restore',
        before: section,
        after: updated,
        metadata: {
          restoredFromVersion: target.version,
          restoredFromUpdatedAt: target.updatedAt,
          version: reusableSectionVersionFromMetadata(updated.metadata),
        },
        requestId,
      });

      return adminJson({
        success: true,
        requestId,
        data: {
          restored: true,
          restoredFromVersion: target.version,
          version: reusableSectionVersionFromMetadata(updated.metadata),
          section: updated,
          cacheInvalidation,
        },
      }, requestId);
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

    const target = listReusableSectionVersions(section).versions.find((entry) => entry.version === targetVersion);
    if (!target) {
      return errorResponse(404, 'REUSABLE_SECTION_VERSION_NOT_FOUND', 'Reusable section version not found', requestId);
    }

    const slugConflict = getReusableSectionByIdOrSlug(site.id, target.slug);
    if (slugConflict && slugConflict.id !== section.id) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId, { slug: target.slug });
    }

    const updated = updateReusableSection(site.id, section.id, {
      name: target.name,
      slug: target.slug,
      description: target.description ?? null,
      category: target.category,
      status: target.status === 'archived' ? 'archived' : 'active',
      tags: target.tags,
      content: asContent(target.content),
      metadata: buildReusableSectionUpdateMetadata(section, mergeRestoreMetadata(section.metadata, target), {
        actor: restoredBy,
        requestId,
      }),
      sourceElementId: target.sourceElementId ?? null,
      updatedBy: restoredBy,
    });
    if (!updated) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'reusableSection',
      entityId: updated.id,
      action: 'reusableSection.restore',
      before: section,
      after: updated,
      metadata: {
        restoredFromVersion: target.version,
        restoredFromUpdatedAt: target.updatedAt,
        version: reusableSectionVersionFromMetadata(updated.metadata),
      },
      requestId,
    });

    return adminJson({
      success: true,
      requestId,
      data: {
        restored: true,
        restoredFromVersion: target.version,
        version: reusableSectionVersionFromMetadata(updated.metadata),
        section: updated,
      },
    }, requestId);
  } catch (error) {
    console.error('Admin reusable section version restore API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
