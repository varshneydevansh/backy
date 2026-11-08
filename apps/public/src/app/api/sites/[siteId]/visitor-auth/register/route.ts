import { NextRequest } from 'next/server';
import { handleVisitorAuth } from '@/lib/visitor-auth/routes';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  return handleVisitorAuth(request, siteId, 'register');
}
