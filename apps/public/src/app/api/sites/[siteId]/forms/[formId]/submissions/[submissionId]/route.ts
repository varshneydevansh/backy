import { NextRequest } from 'next/server';
import { publicContractJson } from '@/lib/publicContractResponse';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    submissionId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: { code, message },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

const adminEndpointRequired = (requestId: string) => (
  errorResponse(
    405,
    'ADMIN_ENDPOINT_REQUIRED',
    'Submission review is private. Use /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId.',
    requestId,
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  await params;
  return adminEndpointRequired(requestId);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  await params;
  return adminEndpointRequired(requestId);
}

