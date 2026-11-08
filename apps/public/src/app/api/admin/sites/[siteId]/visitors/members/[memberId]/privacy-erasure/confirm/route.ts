import { NextRequest } from 'next/server';
import { handleAdminVisitorErasure } from '@/lib/adminVisitorErasure';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string; memberId: string }> }) {
 const {siteId,memberId}=await context.params;
 return handleAdminVisitorErasure(request,siteId,memberId,'confirm');
}
