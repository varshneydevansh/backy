import { handleFormDesignVersions } from '@/lib/formTemplateVersions';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string; formId: string; revisionId: string }> }) {
 return handleFormDesignVersions(request, await context.params, true);
}
