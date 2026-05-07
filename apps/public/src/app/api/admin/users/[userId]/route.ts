/**
 * Admin user detail endpoint.
 *
 * GET    /api/admin/users/:userId
 * PATCH  /api/admin/users/:userId
 * DELETE /api/admin/users/:userId
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteAdminUser, getAdminUserByEmail, getAdminUserById, updateAdminUser } from '@/lib/backyStore';

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

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeRole = (value: unknown): 'admin' | 'editor' | 'viewer' | null => (
  value === 'admin' || value === 'editor' || value === 'viewer' ? value : null
);

const normalizeStatus = (value: unknown): 'active' | 'inactive' | 'invited' | null => (
  value === 'active' || value === 'inactive' || value === 'invited' ? value : null
);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { userId } = await context.params;
    const user = getAdminUserById(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error('Admin user detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { userId } = await context.params;
    const current = getAdminUserById(userId);

    if (!current) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextEmail = body.email === undefined ? current.email : normalizeEmail(body.email);
    const nextRole = body.role === undefined ? current.role : normalizeRole(body.role);
    const nextStatus = body.status === undefined ? current.status : normalizeStatus(body.status);

    if (body.fullName !== undefined && (typeof body.fullName !== 'string' || !body.fullName.trim())) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Full name cannot be blank', requestId);
    }

    if (!nextEmail || !nextEmail.includes('@')) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A valid email address is required', requestId);
    }

    if (!nextRole) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Role must be admin, editor, or viewer', requestId);
    }

    if (!nextStatus) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, or invited', requestId);
    }

    const emailOwner = getAdminUserByEmail(nextEmail);
    if (emailOwner && emailOwner.id !== userId) {
      return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
    }

    const user = updateAdminUser(userId, {
      ...body,
      email: nextEmail,
      role: nextRole,
      status: nextStatus,
    });

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error('Admin user update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { userId } = await context.params;
    const deleted = deleteAdminUser(userId);

    if (!deleted) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        userId,
      },
    });
  } catch (error) {
    console.error('Admin user delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
