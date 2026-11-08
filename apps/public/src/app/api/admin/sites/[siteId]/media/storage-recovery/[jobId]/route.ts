import { NextRequest } from 'next/server';
import { handleMediaStorageRecovery } from '@/lib/mediaStorageRecoveryAdmin';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string; jobId: string }> }) {
  const { siteId, jobId } = await params;
  return handleMediaStorageRecovery(request, siteId, jobId);
}
