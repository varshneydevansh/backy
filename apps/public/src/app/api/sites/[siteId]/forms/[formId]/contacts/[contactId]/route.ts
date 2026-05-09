import { NextRequest } from 'next/server';
import { publicContractJson } from '@/lib/publicContractResponse';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  await params;

  return errorResponse(
    405,
    'ADMIN_ENDPOINT_REQUIRED',
    'Contact updates are private. Use /api/admin/sites/:siteId/forms/:formId/contacts/:contactId.',
    requestId,
  );
}

