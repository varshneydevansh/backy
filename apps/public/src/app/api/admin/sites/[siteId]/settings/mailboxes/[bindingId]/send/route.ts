import { NextRequest } from 'next/server';
import { siteMailboxSendingRoute, type MailboxSendingParams } from '@/lib/siteMailboxSending';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<MailboxSendingParams> }) { return siteMailboxSendingRoute(request, context, 'send'); }
