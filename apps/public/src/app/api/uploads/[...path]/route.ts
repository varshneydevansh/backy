import { NextRequest } from 'next/server';
import { handlePublicUploadFile } from '@/lib/publicUploadFile';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    path?: string[];
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return handlePublicUploadFile(request, await params);
}
