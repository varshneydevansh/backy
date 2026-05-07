/**
 * Public CMS collections endpoint.
 *
 * GET /api/sites/[siteId]/collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listCollections } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const collections = listCollections(site.id);

    return NextResponse.json({
      collections,
      pagination: {
        total: collections.length,
        limit: collections.length,
        offset: 0,
        hasMore: false,
      },
    });
  } catch (error) {
    console.error('Public collections list API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
