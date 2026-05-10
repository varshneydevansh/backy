/**
 * Admin blog posts endpoint.
 *
 * GET  /api/admin/sites/[siteId]/blog
 * POST /api/admin/sites/[siteId]/blog
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyContentDocument,
  type BackyPost,
} from '@backy-cms/core';
import {
  createAdminBlogPost,
  getBlogPosts,
  getSiteByIdOrSlug,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { seedInputFromFrontendDesignTemplate } from '@/lib/frontendDesignContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const parseStatusFilter = (value: string | null) => {
  if (value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived') {
    return value;
  }

  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const statusFromInput = (value: unknown): 'draft' | 'published' | 'scheduled' | 'archived' => (
  value === 'published' || value === 'scheduled' || value === 'archived' ? value : 'draft'
);

const stringArrayFromInput = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);

const contentElementsFromInput = (rawContent: unknown): unknown[] => {
  if (isRecord(rawContent) && Array.isArray(rawContent.elements)) {
    return rawContent.elements;
  }

  return Array.isArray(rawContent) ? rawContent : [];
};

const contentDocumentFromInput = (
  rawContent: unknown,
  input: {
    id: string;
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled' | 'archived';
  },
): BackyContentDocument => {
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }
  if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: input.id,
    kind: 'post',
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: contentElementsFromInput(rawContent),
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
  });
};

const adminPostFromRepositoryPost = (post: BackyPost) => {
  const canvasSize = isRecord(post.content.metadata?.canvasSize)
    ? post.content.metadata.canvasSize
    : { width: 1200, height: 900 };
  return {
    ...post,
    content: {
      elements: post.content.elements,
      canvasSize,
      customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
      contentDocument: post.content,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));
      const payload = await repositories.posts.list({
        siteId: site.id,
        includeUnpublished: true,
        status: parseStatusFilter(searchParams.get('status')) || 'all',
        categoryId: searchParams.get('categoryId') || undefined,
        tagId: searchParams.get('tagId') || undefined,
        authorId: searchParams.get('authorId') || undefined,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          posts: payload.items.map(adminPostFromRepositoryPost),
          pagination: payload.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const status = parseStatusFilter(searchParams.get('status'));
    const payload = getBlogPosts(site.id, {
      includeUnpublished: true,
      status,
      categoryId: searchParams.get('categoryId') || undefined,
      categorySlug: searchParams.get('categorySlug') || undefined,
      tagId: searchParams.get('tagId') || undefined,
      tagSlug: searchParams.get('tagSlug') || undefined,
      authorId: searchParams.get('authorId') || undefined,
      authorSlug: searchParams.get('authorSlug') || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        posts: payload.posts,
        pagination: payload.pagination,
      },
    });
  } catch (error) {
    console.error('Admin blog list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const body = await parseJsonBody(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const slug = normalizeSlug(body.slug || title);
      const status = statusFromInput(body.status);

      if (!title) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Post title is required', requestId);
      }

      if (!slug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Post slug is required', requestId);
      }

      const slugCheck = await repositories.posts.checkSlug({ siteId: site.id, slug });
      if (!slugCheck.available) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A post with this slug already exists', requestId);
      }

      const seeded = seedInputFromFrontendDesignTemplate({
        siteSettings: site.settings,
        body,
        templateType: 'blogPost',
        kind: 'post',
        title,
        excerpt: typeof body.excerpt === 'string' ? body.excerpt : null,
      });

      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }

      const createBody = seeded.body;
      const postId = typeof createBody.id === 'string' && createBody.id.trim().length > 0 ? createBody.id.trim() : `post_${slug}`;
      const created = await repositories.posts.create({
        siteId: site.id,
        title,
        slug,
        excerpt: typeof createBody.excerpt === 'string' ? createBody.excerpt : null,
        status,
        scheduledAt: typeof createBody.scheduledAt === 'string' ? createBody.scheduledAt : null,
        featuredImageId: typeof createBody.featuredImageId === 'string' ? createBody.featuredImageId : null,
        authorId: typeof createBody.authorId === 'string' ? createBody.authorId : null,
        categoryIds: stringArrayFromInput(createBody.categoryIds),
        tagIds: stringArrayFromInput(createBody.tagIds),
        content: contentDocumentFromInput(createBody.content, { id: postId, title, slug, status }),
        meta: isRecord(createBody.meta) ? createBody.meta : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'post',
        entityId: created.item.id,
        reason: 'post-created',
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            post: adminPostFromRepositoryPost(created.item),
            cacheInvalidation,
          },
        },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const slug = normalizeSlug(body.slug || title);

    if (!title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Post title is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Post slug is required', requestId);
    }

    const conflict = getBlogPosts(site.id, {
      includeUnpublished: true,
      slug,
    }).posts[0];

    if (conflict) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A post with this slug already exists', requestId);
    }

    const seeded = seedInputFromFrontendDesignTemplate({
      siteSettings: site.settings,
      body,
      templateType: 'blogPost',
      kind: 'post',
      title,
      excerpt: typeof body.excerpt === 'string' ? body.excerpt : null,
    });

    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }

    const post = createAdminBlogPost(site.id, {
      ...seeded.body,
      title,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          post,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin blog create API error:', error);
    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Internal server error',
      requestId,
    );
  }
}
