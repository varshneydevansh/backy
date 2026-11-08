import { NextRequest } from 'next/server';
import { siteMailboxManagementActionRoute } from '@/lib/siteMailboxManagement';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string; managementBindingId: string }> }) { return siteMailboxManagementActionRoute(request, context, 'inspect'); }
