import { NextRequest } from 'next/server';
import { handleAdminVisitorMembers } from '@/lib/adminVisitorMembers';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ siteId: string; memberId: string; }> };
export async function GET(request: NextRequest, context: Params) { const params = await context.params; return handleAdminVisitorMembers(request, params.siteId, params.memberId); }
export async function PATCH(request: NextRequest, context: Params) { const params = await context.params; return handleAdminVisitorMembers(request, params.siteId, params.memberId); }
export async function DELETE(request: NextRequest, context: Params) { const params = await context.params; return handleAdminVisitorMembers(request, params.siteId, params.memberId); }
