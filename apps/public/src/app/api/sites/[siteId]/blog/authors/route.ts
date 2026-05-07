/**
 * Public blog authors endpoint.
 *
 * GET /api/sites/[siteId]/blog/authors
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listBlogAuthors } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      authors: listBlogAuthors(site.id),
    });
  } catch (error) {
    console.error('Blog authors API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
