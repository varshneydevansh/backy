/**
 * Public blog tags endpoint.
 *
 * GET /api/sites/[siteId]/blog/tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listBlogTags } from '@/lib/backyStore';

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
      tags: listBlogTags(site.id),
    });
  } catch (error) {
    console.error('Blog tags API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
