import { NextRequest } from 'next/server';
import { handleAdminVisitorMembers } from '@/lib/adminVisitorMembers';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ siteId: string; memberId: string; }> };
export async function POST(request: NextRequest, context: Params) { const params = await context.params; return handleAdminVisitorMembers(request, params.siteId, params.memberId, 'revoke-sessions'); }
