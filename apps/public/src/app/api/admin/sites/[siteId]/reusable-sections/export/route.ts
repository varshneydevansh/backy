/**
 * Admin reusable section export endpoint.
 *
 * GET /api/admin/sites/[siteId]/reusable-sections/export
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSiteByIdOrSlug,
  listReusableSections,
} from '@/lib/backyStore';
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

const normalizeIdSet = (value: string | null): Set<string> | null => {
  if (!value) return null;
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
};

const exportSection = (section: Record<string, unknown>) => ({
  sourceSectionId: section.id,
  name: section.name,
  slug: section.slug,
  description: section.description ?? null,
  category: section.category,
  status: section.status,
  tags: Array.isArray(section.tags) ? section.tags : [],
  content: section.content,
  metadata: section.metadata || {},
  sourceElementId: section.sourceElementId ?? null,
});

const exportPayload = (input: {
  requestId: string;
  siteId: string;
  siteSlug?: string;
  sections: Record<string, unknown>[];
}) => ({
  success: true,
  requestId: input.requestId,
  data: {
    export: {
      schemaVersion: 'backy.reusable-sections.export.v1',
      exportedAt: new Date().toISOString(),
      siteId: input.siteId,
      siteSlug: input.siteSlug,
      sectionCount: input.sections.length,
    },
    sections: input.sections.map(exportSection),
  },
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const ids = normalizeIdSet(searchParams.get('ids') || searchParams.get('sectionIds'));
    const statusParam = searchParams.get('status');
    const status = statusParam === 'active' || statusParam === 'archived' || statusParam === 'all'
      ? statusParam
      : 'all';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const result = await repositories.reusableSections.list({
        siteId: site.id,
        status,
        category: searchParams.get('category') || undefined,
        tag: searchParams.get('tag') || undefined,
        search: searchParams.get('search') || undefined,
        limit: 1000,
        offset: 0,
      });
      const sections = ids
        ? result.items.filter((section) => ids.has(section.id) || ids.has(section.slug))
        : result.items;
      const payload = exportPayload({ requestId, siteId: site.id, siteSlug: site.slug, sections: sections as unknown as Record<string, unknown>[] });
      return NextResponse.json(payload, {
        headers: {
          'content-disposition': `attachment; filename="${site.slug || site.id}-reusable-sections.json"`,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const sections = listReusableSections(site.id, {
      status,
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      search: searchParams.get('search') || undefined,
    }).filter((section) => ids ? ids.has(section.id) || ids.has(section.slug) : true);
    const payload = exportPayload({ requestId, siteId: site.id, siteSlug: site.slug, sections: sections as unknown as Record<string, unknown>[] });
    return NextResponse.json(payload, {
      headers: {
        'content-disposition': `attachment; filename="${site.slug || site.id}-reusable-sections.json"`,
      },
    });
  } catch (error) {
    console.error('Admin reusable section export API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
