import { handleCollectionDesignVersions } from '@/lib/collectionTemplateVersions';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string; collectionId: string; revisionId: string }> }) {
 return handleCollectionDesignVersions(request, await context.params, true);
}
