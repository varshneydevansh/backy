import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createPreviewToken, getAdminBlogPostById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const encodePath = (path: string) => (
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    const body = await request.json().catch(() => ({})) as { ttlSeconds?: number };

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const post = await repositories.posts.getById(site.id, postId);

      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      const preview = await repositories.contentWorkflows.createPreviewToken({
        siteId: site.id,
        targetType: 'post',
        targetId: post.id,
        ttlSeconds: body.ttlSeconds,
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const origin = new URL(request.url).origin;
      const encodedToken = encodeURIComponent(preview.token);
      const encodedSlug = encodePath(post.slug);
      const hostedUrl = `${origin}/sites/${encodeURIComponent(site.slug || site.id)}/blog/${encodedSlug}?previewToken=${encodedToken}`;
      const postApiUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/blog?slug=${encodedSlug}&previewToken=${encodedToken}`;

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id || request.headers.get('x-backy-actor') || 'admin-api',
        entity: 'post',
        entityId: post.id,
        action: 'previewToken.create',
        metadata: {
          targetType: preview.targetType,
          targetId: preview.targetId,
          slug: post.slug,
          ttlSeconds: body.ttlSeconds || null,
          expiresAt: preview.expiresAt,
          hostedPath: `/sites/${encodeURIComponent(site.slug || site.id)}/blog/${encodedSlug}`,
          postApiPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/blog?slug=${encodedSlug}`,
          tokenStored: false,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          previewToken: preview.token,
          expiresAt: preview.expiresAt,
          targetType: preview.targetType,
          targetId: preview.targetId,
          hostedUrl,
          postApiUrl,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const post = getAdminBlogPostById(site.id, postId);
    if (!post) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const preview = createPreviewToken(
      site.id,
      'post',
      post.id,
      body.ttlSeconds,
      request.headers.get('x-backy-actor') || 'admin',
    );
    const origin = new URL(request.url).origin;
    const encodedToken = encodeURIComponent(preview.token);
    const encodedSlug = encodePath(post.slug);
    const hostedUrl = `${origin}/sites/${encodeURIComponent(site.slug || site.id)}/blog/${encodedSlug}?previewToken=${encodedToken}`;
    const postApiUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/blog?slug=${encodedSlug}&previewToken=${encodedToken}`;

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id || request.headers.get('x-backy-actor') || 'admin-api',
      entity: 'post',
      entityId: post.id,
      action: 'previewToken.create',
      metadata: {
        targetType: preview.targetType,
        targetId: preview.targetId,
        slug: post.slug,
        ttlSeconds: body.ttlSeconds || null,
        expiresAt: preview.expiresAt,
        hostedPath: `/sites/${encodeURIComponent(site.slug || site.id)}/blog/${encodedSlug}`,
        postApiPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/blog?slug=${encodedSlug}`,
        tokenStored: false,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        previewToken: preview.token,
        expiresAt: preview.expiresAt,
        targetType: preview.targetType,
        targetId: preview.targetId,
        hostedUrl,
        postApiUrl,
      },
    });
  } catch (error) {
    console.error('Admin blog preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
