import { NextRequest } from 'next/server';
import { siteMailboxManagementRoute } from '@/lib/siteMailboxManagement';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ siteId: string }> }) { return siteMailboxManagementRoute(request, context); }
