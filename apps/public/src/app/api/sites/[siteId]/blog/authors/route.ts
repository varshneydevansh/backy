/**
 * Public blog authors endpoint.
 *
 * GET /api/sites/[siteId]/blog/authors
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listBlogAuthors } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';

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
      errorMessage: message,
    },
    { status },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const authors = await repositories.blogTaxonomy.listAuthors(site.id);

      return NextResponse.json({
        success: true,
        requestId,
        data: { authors },
        authors,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const authors = listBlogAuthors(site.id);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        authors,
      },
      authors,
    });
  } catch (error) {
    console.error('Blog authors API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
