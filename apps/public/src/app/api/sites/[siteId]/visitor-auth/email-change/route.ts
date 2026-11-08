import { NextRequest } from 'next/server';
import { handleVisitorEmailChange } from '@/lib/visitor-auth/email-change-routes';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  return handleVisitorEmailChange(request, (await context.params).siteId, 'email-change');
}
