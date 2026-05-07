import { NextRequest, NextResponse } from 'next/server';
import { createPreviewToken, getAdminPageById, getSiteByIdOrSlug } from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getAdminPageById(site.id, pageId);
    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const body = await request.json().catch(() => ({})) as { ttlSeconds?: number };
    const preview = createPreviewToken(
      site.id,
      'page',
      page.id,
      body.ttlSeconds,
      request.headers.get('x-backy-actor') || 'admin',
    );
    const origin = new URL(request.url).origin;
    const encodedToken = encodeURIComponent(preview.token);
    const encodedSlug = encodeURIComponent(page.slug || 'index');
    const renderUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/render?path=/${encodedSlug}&previewToken=${encodedToken}`;
    const pageApiUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/pages?slug=${encodedSlug}&previewToken=${encodedToken}`;

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        previewToken: preview.token,
        expiresAt: preview.expiresAt,
        targetType: preview.targetType,
        targetId: preview.targetId,
        renderUrl,
        pageApiUrl,
      },
    });
  } catch (error) {
    console.error('Admin page preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
