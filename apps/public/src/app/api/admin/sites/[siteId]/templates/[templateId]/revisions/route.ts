import { NextRequest } from 'next/server';
import { templateRevisionList } from '@/lib/templateHistoryApi';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string; templateId: string }> }) {
  const { siteId, templateId } = await params;
  return templateRevisionList(request, siteId, templateId);
}
