/**
 * Admin reusable section instance registry and propagation endpoint.
 *
 * GET  /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 * POST /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminBlogPostById,
  getAdminPageById,
  getBlogPosts,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  getPageSummary,
  updateAdminBlogPost,
  updateAdminPage,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import {
  listReusableSectionInstancesInContent,
  refreshReusableSectionInstancesInContent,
  type ReusableSectionInstance,
} from '@/lib/reusableSectionInstances';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { BackyContentDocument } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
  }>;
}

type InstanceTargetType = 'page' | 'post';

type ContentTarget = {
  type: InstanceTargetType;
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  content: unknown;
};

type AdminPage = NonNullable<ReturnType<typeof getAdminPageById>>;

const isAdminPage = (value: ReturnType<typeof getAdminPageById>): value is AdminPage => Boolean(value);

type InstanceTargetReport = {
  type: InstanceTargetType;
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  instances: ReusableSectionInstance[];
};

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

const targetTypeFilter = (value: string | null | undefined): InstanceTargetType | 'all' => (
  value === 'page' || value === 'post' ? value : 'all'
);

const targetMatches = (
  target: ContentTarget,
  filter: {
    targetType: InstanceTargetType | 'all';
    targetId?: string;
  },
): boolean => {
  if (filter.targetType !== 'all' && target.type !== filter.targetType) return false;
  if (filter.targetId && target.id !== filter.targetId && target.slug !== filter.targetId) return false;
  return true;
};

const reportInstances = (
  targets: ContentTarget[],
  section: Parameters<typeof listReusableSectionInstancesInContent>[1],
): InstanceTargetReport[] => (
  targets.flatMap((target) => {
    const instances = listReusableSectionInstancesInContent(target.content, section);
    return instances.length > 0
      ? [{
          type: target.type,
          id: target.id,
          title: target.title,
          slug: target.slug,
          status: target.status,
          updatedAt: target.updatedAt,
          instances,
        }]
      : [];
  })
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;
    const { searchParams } = new URL(request.url);
    const targetType = targetTypeFilter(searchParams.get('targetType') || searchParams.get('type'));
    const targetId = searchParams.get('targetId') || undefined;

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

      const [pages, posts] = await Promise.all([
        targetType === 'post'
          ? Promise.resolve({ items: [] })
          : repositories.pages.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000, offset: 0 }),
        targetType === 'page'
          ? Promise.resolve({ items: [] })
          : repositories.posts.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000, offset: 0 }),
      ]);
      const targets: ContentTarget[] = [
        ...pages.items.map((page) => ({
          type: 'page' as const,
          id: page.id,
          title: page.title,
          slug: page.slug,
          status: page.status,
          updatedAt: page.updatedAt,
          content: page.content,
        })),
        ...posts.items.map((post) => ({
          type: 'post' as const,
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updatedAt: post.updatedAt,
          content: post.content,
        })),
      ].filter((target) => targetMatches(target, { targetType, targetId }));
      const targetReports = reportInstances(targets, section);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sectionId: section.id,
          sourceUpdatedAt: section.updatedAt,
          targets: targetReports,
          totals: {
            targets: targetReports.length,
            instances: targetReports.reduce((total, target) => total + target.instances.length, 0),
            stale: targetReports.reduce((total, target) => total + target.instances.filter((instance) => instance.stale).length, 0),
          },
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

    const pageTargets: ContentTarget[] = targetType === 'post'
      ? []
      : getPageSummary(site.id, { includeUnpublished: true })
          .map((page) => getAdminPageById(site.id, page.id))
          .filter(isAdminPage)
          .map((page) => ({
            type: 'page' as const,
            id: page.id,
            title: page.title,
            slug: page.slug,
            status: page.status,
            updatedAt: page.updatedAt,
            content: page.content,
          }));
    const postTargets: ContentTarget[] = targetType === 'page'
      ? []
      : getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 }).posts.map((post) => ({
          type: 'post' as const,
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updatedAt: post.updatedAt,
          content: post.content,
        }));
    const targetReports = reportInstances(
      [...pageTargets, ...postTargets].filter((target) => targetMatches(target, { targetType, targetId })),
      section,
    );

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sectionId: section.id,
        sourceUpdatedAt: section.updatedAt,
        targets: targetReports,
        totals: {
          targets: targetReports.length,
          instances: targetReports.reduce((total, target) => total + target.instances.length, 0),
          stale: targetReports.reduce((total, target) => total + target.instances.filter((instance) => instance.stale).length, 0),
        },
      },
    });
  } catch (error) {
    console.error('Admin reusable section instances API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;
    const body = await parseJsonBody(request);
    const targetType = targetTypeFilter(typeof body.targetType === 'string' ? body.targetType : undefined);
    const targetId = typeof body.targetId === 'string' && body.targetId.trim() ? body.targetId.trim() : undefined;
    const dryRun = body.dryRun === true;
    const updatedBy = typeof body.updatedBy === 'string' && body.updatedBy.trim() ? body.updatedBy.trim() : 'admin';

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

      const [pages, posts] = await Promise.all([
        targetType === 'post'
          ? Promise.resolve({ items: [] })
          : repositories.pages.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000, offset: 0 }),
        targetType === 'page'
          ? Promise.resolve({ items: [] })
          : repositories.posts.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000, offset: 0 }),
      ]);
      const targets: ContentTarget[] = [
        ...pages.items.map((page) => ({
          type: 'page' as const,
          id: page.id,
          title: page.title,
          slug: page.slug,
          status: page.status,
          updatedAt: page.updatedAt,
          content: page.content,
        })),
        ...posts.items.map((post) => ({
          type: 'post' as const,
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updatedAt: post.updatedAt,
          content: post.content,
        })),
      ].filter((target) => targetMatches(target, { targetType, targetId }));
      const refreshedTargets = [];
      for (const target of targets) {
        const result = refreshReusableSectionInstancesInContent(target.content, section);
        if (result.refreshed === 0) continue;
        refreshedTargets.push({
          type: target.type,
          id: target.id,
          title: target.title,
          slug: target.slug,
          refreshed: result.refreshed,
        });
        if (dryRun) continue;
        if (target.type === 'page') {
          await repositories.pages.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Refresh reusable section ${section.name}`,
          });
        } else {
          await repositories.posts.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Refresh reusable section ${section.name}`,
          });
        }
      }
      const cacheInvalidation = dryRun ? null : await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: section.id,
        reason: 'reusable-section-instances-refreshed',
        requestId,
      });
      if (!dryRun) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          entity: 'reusableSection',
          entityId: section.id,
          action: 'reusableSection.instances.refresh',
          after: {
            refreshedTargets,
          },
          metadata: {
            targetType,
            targetId: targetId || null,
            updatedBy,
            targets: refreshedTargets.length,
            instances: refreshedTargets.reduce((total, target) => total + target.refreshed, 0),
          },
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          dryRun,
          sectionId: section.id,
          sourceUpdatedAt: section.updatedAt,
          refreshedTargets,
          totals: {
            targets: refreshedTargets.length,
            instances: refreshedTargets.reduce((total, target) => total + target.refreshed, 0),
          },
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

    const pageTargets: ContentTarget[] = targetType === 'post'
      ? []
      : getPageSummary(site.id, { includeUnpublished: true })
          .map((page) => getAdminPageById(site.id, page.id))
          .filter(isAdminPage)
          .map((page) => ({
            type: 'page' as const,
            id: page.id,
            title: page.title,
            slug: page.slug,
            status: page.status,
            updatedAt: page.updatedAt,
            content: page.content,
          }));
    const postTargets: ContentTarget[] = targetType === 'page'
      ? []
      : getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 }).posts.map((post) => ({
          type: 'post' as const,
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updatedAt: post.updatedAt,
          content: post.content,
        }));
    const targets = [...pageTargets, ...postTargets].filter((target) => targetMatches(target, { targetType, targetId }));
    const refreshedTargets = [];
    for (const target of targets) {
      const result = refreshReusableSectionInstancesInContent(target.content, section);
      if (result.refreshed === 0) continue;
      refreshedTargets.push({
        type: target.type,
        id: target.id,
        title: target.title,
        slug: target.slug,
        refreshed: result.refreshed,
      });
      if (dryRun) continue;
      if (target.type === 'page') {
        updateAdminPage(site.id, target.id, {
          content: result.content,
          updatedBy,
          revisionNote: `Refresh reusable section ${section.name}`,
        });
      } else {
        updateAdminBlogPost(site.id, target.id, {
          content: result.content,
          updatedBy,
          revisionNote: `Refresh reusable section ${section.name}`,
        });
      }
    }
    if (!dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        entity: 'reusableSection',
        entityId: section.id,
        action: 'reusableSection.instances.refresh',
        after: {
          refreshedTargets,
        },
        metadata: {
          targetType,
          targetId: targetId || null,
          updatedBy,
          targets: refreshedTargets.length,
          instances: refreshedTargets.reduce((total, target) => total + target.refreshed, 0),
        },
        requestId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        dryRun,
        sectionId: section.id,
        sourceUpdatedAt: section.updatedAt,
        refreshedTargets,
        totals: {
          targets: refreshedTargets.length,
          instances: refreshedTargets.reduce((total, target) => total + target.refreshed, 0),
        },
      },
    });
  } catch (error) {
    console.error('Admin reusable section instances refresh API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
