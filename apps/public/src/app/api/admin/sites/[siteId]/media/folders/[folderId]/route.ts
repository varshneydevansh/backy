import { NextRequest, NextResponse } from 'next/server';
import { deleteMediaFolder, getSiteByIdOrSlug, updateMediaFolder } from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    folderId: string;
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, folderId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const folder = updateMediaFolder(site.id, folderId, body);

    if (!folder) {
      return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { folder } });
  } catch (error) {
    console.error('Admin media folder update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, folderId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const deleted = deleteMediaFolder(site.id, folderId);

    if (!deleted) {
      return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { deleted: true, folderId } });
  } catch (error) {
    console.error('Admin media folder delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
