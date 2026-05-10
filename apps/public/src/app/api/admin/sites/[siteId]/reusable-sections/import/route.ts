/**
 * Admin reusable section import endpoint.
 *
 * POST /api/admin/sites/[siteId]/reusable-sections/import?upsert=true
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createReusableSection,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateReusableSection,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  buildInitialReusableSectionMetadata,
  buildReusableSectionUpdateMetadata,
} from '@/lib/reusableSectionVersions';
import type { BackyJsonObject } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ImportSection = {
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: 'active' | 'archived';
  tags?: string[];
  content: BackyJsonObject;
  metadata?: BackyJsonObject;
  sourceElementId?: string | null;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) => (
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
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

const parseMetadata = (value: unknown): BackyJsonObject | undefined => (
  isRecord(value) ? value as BackyJsonObject : undefined
);

const parseContent = (value: unknown): BackyJsonObject => (
  isRecord(value) ? value as BackyJsonObject : {}
);

const hasElements = (value: unknown): boolean => (
  isRecord(value) &&
  Array.isArray(value.elements) &&
  value.elements.length > 0
);

const sectionsFromBody = (body: Record<string, unknown>): unknown[] => {
  if (Array.isArray(body.sections)) return body.sections;
  const data = isRecord(body.data) ? body.data : {};
  if (Array.isArray(data.sections)) return data.sections;
  if (isRecord(body.section)) return [body.section];
  return [];
};

const normalizeImportSection = (value: unknown): ImportSection | null => {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const slug = normalizeSlug(value.slug || name);
  const content = parseContent(value.content);
  if (!name || !slug || !hasElements(content)) {
    return null;
  }

  return {
    name,
    slug,
    description: typeof value.description === 'string' ? value.description.trim() || null : null,
    category: typeof value.category === 'string' && value.category.trim() ? value.category.trim() : 'general',
    status: value.status === 'archived' ? 'archived' : 'active',
    tags: parseTags(value.tags),
    content,
    metadata: parseMetadata(value.metadata),
    sourceElementId: typeof value.sourceElementId === 'string' ? value.sourceElementId.trim() || null : null,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const upsert = searchParams.get('upsert') === 'true';
    const body = await parseJsonBody(request);
    const actor = typeof body.importedBy === 'string' && body.importedBy.trim() ? body.importedBy.trim() : 'admin';
    const sections = sectionsFromBody(body).map(normalizeImportSection).filter(Boolean) as ImportSection[];

    if (sections.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section import requires at least one valid section with content.elements', requestId);
    }

    const duplicateSlug = sections.find((section, index) => sections.findIndex((item) => item.slug === section.slug) !== index);
    if (duplicateSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section import contains duplicate slugs', requestId, { slug: duplicateSlug.slug });
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const imported = [];
      let created = 0;
      let updated = 0;
      for (const section of sections) {
        const existing = await repositories.reusableSections.getBySlug(site.id, section.slug);
        if (existing && !upsert) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId, { slug: section.slug });
        }

        if (existing) {
          const result = (await repositories.reusableSections.update(site.id, existing.id, {
            name: section.name,
            description: section.description ?? null,
            category: section.category || 'general',
            status: section.status || 'active',
            tags: section.tags || [],
            content: section.content,
            metadata: buildReusableSectionUpdateMetadata(existing, section.metadata, { actor, requestId }) as BackyJsonObject,
            sourceElementId: section.sourceElementId ?? null,
            updatedBy: actor,
          })).item;
          imported.push(result);
          updated += 1;
        } else {
          const result = (await repositories.reusableSections.create({
            siteId: site.id,
            name: section.name,
            slug: section.slug,
            description: section.description ?? null,
            category: section.category || 'general',
            status: section.status || 'active',
            tags: section.tags || [],
            content: section.content,
            metadata: buildInitialReusableSectionMetadata(section.metadata, { actor, requestId }) as BackyJsonObject,
            sourceElementId: section.sourceElementId ?? null,
            createdBy: actor,
            updatedBy: actor,
          })).item;
          imported.push(result);
          created += 1;
        }
      }

      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        reason: 'reusable-section-imported',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          import: { created, updated, total: imported.length },
          sections: imported,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const imported = [];
    let created = 0;
    let updated = 0;
    for (const section of sections) {
      const existing = getReusableSectionByIdOrSlug(site.id, section.slug);
      if (existing && !upsert) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId, { slug: section.slug });
      }

      if (existing) {
        const result = updateReusableSection(site.id, existing.id, {
          name: section.name,
          description: section.description ?? null,
          category: section.category || 'general',
          status: section.status || 'active',
          tags: section.tags || [],
          content: section.content,
          metadata: buildReusableSectionUpdateMetadata(existing, section.metadata, { actor, requestId }),
          sourceElementId: section.sourceElementId ?? null,
          updatedBy: actor,
        });
        if (result) {
          imported.push(result);
          updated += 1;
        }
      } else {
        imported.push(createReusableSection(site.id, {
          name: section.name,
          slug: section.slug,
          description: section.description ?? null,
          category: section.category || 'general',
          status: section.status || 'active',
          tags: section.tags || [],
          content: section.content,
          metadata: buildInitialReusableSectionMetadata(section.metadata, { actor, requestId }),
          sourceElementId: section.sourceElementId ?? null,
          createdBy: actor,
          updatedBy: actor,
        }));
        created += 1;
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        import: { created, updated, total: imported.length },
        sections: imported,
      },
    });
  } catch (error) {
    console.error('Admin reusable section import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
