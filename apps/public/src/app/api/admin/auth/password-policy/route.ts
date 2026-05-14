import { NextResponse } from 'next/server';
import { getAdminPasswordPolicy } from '@/lib/admin-auth/passwordPolicy';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const policy = getAdminPasswordPolicy();

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      policy,
    },
  });
}
