import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getCommerceCronReadiness } from '@/lib/commerceCronReadiness';
import { publicContractJson } from '@/lib/publicContractResponse';

export const runtime = 'nodejs';

const READINESS_SCHEMA_VERSION = 'backy.commerce-reconciliation-readiness.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error', schemaVersion: READINESS_SCHEMA_VERSION },
  )
);

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.configure' });
  if (access instanceof NextResponse) return access;

  try {
    const cronReadiness = getCommerceCronReadiness();
    return publicContractJson({
      success: true,
      requestId,
      data: {
        cronReadiness,
      },
    }, { status: 200, requestId, request, cache: 'private', schemaVersion: READINESS_SCHEMA_VERSION });
  } catch (error) {
    console.error('Commerce reconciliation readiness API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
