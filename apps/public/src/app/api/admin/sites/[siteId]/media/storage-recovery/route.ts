import { NextRequest } from 'next/server';
import { handleMediaStorageRecovery } from '@/lib/mediaStorageRecoveryAdmin';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  return handleMediaStorageRecovery(request, (await params).siteId);
}
