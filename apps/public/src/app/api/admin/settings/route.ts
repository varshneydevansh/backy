/**
 * Admin platform settings endpoint.
 *
 * GET   /api/admin/settings
 * PATCH /api/admin/settings
 * POST  /api/admin/settings with { action: "regenerate-api-keys" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSettings, regenerateAdminApiKeys, updateAdminSettings } from '@/lib/backyStore';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeDeliveryMode = (value: unknown): 'managed-hosting' | 'custom-frontend' | null => (
  value === 'managed-hosting' || value === 'custom-frontend' ? value : null
);

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: getAdminSettings(),
      },
    });
  } catch (error) {
    console.error('Admin settings API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const body = await parseJsonBody(request);
    const deliveryMode = body.deliveryMode === undefined
      ? undefined
      : normalizeDeliveryMode(body.deliveryMode);

    if (body.deliveryMode !== undefined && !deliveryMode) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'Delivery mode must be managed-hosting or custom-frontend',
        requestId,
      );
    }

    const settings = updateAdminSettings({
      ...body,
      ...(deliveryMode ? { deliveryMode } : {}),
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings,
      },
    });
  } catch (error) {
    console.error('Admin settings update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const body = await parseJsonBody(request);

    if (body.action !== 'regenerate-api-keys') {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported settings action', requestId);
    }

    const keyScope = body.scope === 'public' || body.scope === 'admin' ? body.scope : 'all';
    const settings = regenerateAdminApiKeys(keyScope);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings,
      },
    });
  } catch (error) {
    console.error('Admin settings action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
