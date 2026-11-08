import { NextRequest } from 'next/server';
import { templateRevisionRestore } from '@/lib/templateHistoryApi';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string; templateId: string; revisionId: string }> }) {
  const { siteId, templateId, revisionId } = await params;
  return templateRevisionRestore(request, siteId, templateId, revisionId);
}
