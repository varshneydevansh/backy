import { NextRequest } from 'next/server';
import { siteMailboxRoute, type SiteMailboxParams } from '@/lib/siteMailboxes';
export const runtime = 'nodejs';
/** Provider text retrieval marks Seen, so opening it is an explicit protected action. */
export async function POST(request: NextRequest, context: { params: Promise<SiteMailboxParams> }) { return siteMailboxRoute(request, context, 'read'); }
