import { NextRequest } from 'next/server';
import { templateRevisionList } from '@/lib/templateHistoryApi';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return templateRevisionList(request, siteId);
}
