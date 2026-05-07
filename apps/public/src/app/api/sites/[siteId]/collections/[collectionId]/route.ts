/**
 * Public CMS collection detail endpoint.
 *
 * GET /api/sites/[siteId]/collections/[collectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollectionByIdOrSlug, getSiteByIdOrSlug } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, collectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error('Public collection detail API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
