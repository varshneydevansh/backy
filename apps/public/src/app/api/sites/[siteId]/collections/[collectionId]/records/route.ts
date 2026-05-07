/**
 * Public CMS collection records endpoint.
 *
 * GET /api/sites/[siteId]/collections/[collectionId]/records
 * GET /api/sites/[siteId]/collections/[collectionId]/records?slug=example
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCollectionByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const payload = listCollectionRecords(site.id, collection.id, {
      slug: searchParams.get('slug') || undefined,
      limit,
      offset,
    });

    if (searchParams.get('slug') && payload.records.length === 0) {
      return NextResponse.json({ error: 'Collection record not found' }, { status: 404 });
    }

    return NextResponse.json({
      collection,
      records: payload.records,
      pagination: payload.pagination,
    });
  } catch (error) {
    console.error('Public collection records API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
