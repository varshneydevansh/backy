import { handleCollectionDesignVersions } from '@/lib/collectionTemplateVersions';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ siteId: string; collectionId: string }> }) {
 return handleCollectionDesignVersions(request, await context.params);
}
