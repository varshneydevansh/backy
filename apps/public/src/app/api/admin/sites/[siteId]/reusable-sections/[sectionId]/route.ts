/**
 * Admin reusable section detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 * PATCH  /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 * DELETE /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  deleteReusableSection,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateReusableSection,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const hasElements = (value: unknown): boolean => (
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray((value as { elements?: unknown }).elements) &&
  ((value as { elements: unknown[] }).elements.length > 0)
);

const parseContent = (value: unknown): BackyJsonObject => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : {}
);

const parseMetadata = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : undefined
);

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
  }
  return [];
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
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

      return NextResponse.json({ success: true, requestId, data: { section } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { section } });
  } catch (error) {
    console.error('Admin reusable section detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
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

      const body = await parseJsonBody(request);
      const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section slug is required', requestId);
      }

      if (body.content !== undefined && !hasElements(body.content)) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section content must include at least one element', requestId);
      }

      if (nextSlug && nextSlug !== section.slug) {
        const conflict = await repositories.reusableSections.getBySlug(site.id, nextSlug);
        if (conflict && conflict.id !== section.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId);
        }
      }

      const versionConflict = reusableSectionConflict(section, body);
      if (versionConflict) {
        return NextResponse.json({
          success: false,
          requestId,
          error: {
            code: 'REUSABLE_SECTION_VERSION_CONFLICT',
            message: 'Reusable section has changed since the client loaded it',
            details: {
              ...versionConflict,
              section,
            },
          },
        }, { status: 409 });
      }

      const updatedBy = body.updatedBy !== undefined
        ? typeof body.updatedBy === 'string' ? body.updatedBy.trim() || null : null
        : section.updatedBy || null;
      const metadata = buildReusableSectionUpdateMetadata(section, body.metadata === undefined ? undefined : parseMetadata(body.metadata), {
        actor: updatedBy,
        requestId,
      }) as BackyJsonObject;
      const updated = (await repositories.reusableSections.update(site.id, section.id, {
        ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(body.description !== undefined ? { description: typeof body.description === 'string' ? body.description.trim() || null : null } : {}),
        ...(typeof body.category === 'string' && body.category.trim() ? { category: body.category.trim() } : {}),
        ...(body.status === 'active' || body.status === 'archived' ? { status: body.status } : {}),
        ...(body.tags !== undefined ? { tags: parseTags(body.tags) } : {}),
        ...(body.content !== undefined ? { content: parseContent(body.content) } : {}),
        metadata,
        ...(body.sourceElementId !== undefined ? { sourceElementId: typeof body.sourceElementId === 'string' ? body.sourceElementId.trim() || null : null } : {}),
        ...(body.updatedBy !== undefined ? { updatedBy } : {}),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: updated.id,
        reason: 'reusable-section-updated',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'reusableSection',
        entityId: updated.id,
        action: 'reusableSection.update',
        before: section,
        after: updated,
        metadata: {
          changedKeys: Object.keys(body).filter((key) => key !== 'expectedVersion' && key !== 'expectedUpdatedAt'),
          version: reusableSectionVersionFromMetadata(updated.metadata),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          section: updated,
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

    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section slug is required', requestId);
    }

    if (body.content !== undefined && !hasElements(body.content)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section content must include at least one element', requestId);
    }

    if (nextSlug && nextSlug !== section.slug) {
      const conflict = getReusableSectionByIdOrSlug(site.id, nextSlug);
      if (conflict && conflict.id !== section.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId);
      }
    }

    const versionConflict = reusableSectionConflict(section, body);
    if (versionConflict) {
      return NextResponse.json({
        success: false,
        requestId,
        error: {
          code: 'REUSABLE_SECTION_VERSION_CONFLICT',
          message: 'Reusable section has changed since the client loaded it',
          details: {
            ...versionConflict,
            section,
          },
        },
      }, { status: 409 });
    }

    const updatedBy = body.updatedBy !== undefined
      ? typeof body.updatedBy === 'string' ? body.updatedBy.trim() || null : null
      : section.updatedBy || null;
    const updated = updateReusableSection(site.id, section.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
      metadata: buildReusableSectionUpdateMetadata(section, body.metadata, {
        actor: updatedBy,
        requestId,
      }),
      ...(body.updatedBy !== undefined ? { updatedBy } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'reusableSection',
      entityId: updated.id,
      action: 'reusableSection.update',
      before: section,
      after: updated,
      metadata: {
        changedKeys: Object.keys(body).filter((key) => key !== 'expectedVersion' && key !== 'expectedUpdatedAt'),
        version: reusableSectionVersionFromMetadata(updated.metadata),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        section: updated,
        version: reusableSectionVersionFromMetadata(updated.metadata),
      },
    });
  } catch (error) {
    console.error('Admin reusable section update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.delete' });
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

      const deleted = await repositories.reusableSections.delete(site.id, section.id);
      if (!deleted) {
        return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: section.id,
        reason: 'reusable-section-deleted',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'reusableSection',
        entityId: section.id,
        action: 'reusableSection.delete',
        before: section,
        metadata: {
          slug: section.slug,
          category: section.category,
          status: section.status,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          sectionId: section.id,
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

    const deleted = deleteReusableSection(site.id, section.id);
    if (!deleted) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'reusableSection',
      entityId: section.id,
      action: 'reusableSection.delete',
      before: section,
      metadata: {
        slug: section.slug,
        category: section.category,
        status: section.status,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        sectionId: section.id,
      },
    });
  } catch (error) {
    console.error('Admin reusable section delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
