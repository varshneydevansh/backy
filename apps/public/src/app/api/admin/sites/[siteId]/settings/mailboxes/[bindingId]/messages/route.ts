import { NextRequest } from 'next/server';
import { siteMailboxRoute, type SiteMailboxParams } from '@/lib/siteMailboxes';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<SiteMailboxParams> }) { return siteMailboxRoute(request, context, 'messages'); }
