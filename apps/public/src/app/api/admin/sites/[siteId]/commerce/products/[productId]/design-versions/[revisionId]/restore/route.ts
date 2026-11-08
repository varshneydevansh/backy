import { NextRequest } from 'next/server';
import { handleProductDesignVersions } from '@/lib/productTemplateVersions';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: {params: Promise<{siteId:string;productId:string;revisionId:string}>}) { return handleProductDesignVersions(request,await context.params,true); }
