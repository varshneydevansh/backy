import { NextRequest, NextResponse } from 'next/server';
import { buildUserPermissionMatrix } from '@/lib/adminPermissions';
import { getAdminUserById } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { userId } = await context.params;
    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;
    const user = repositories
      ? await repositories.users.getById(userId)
      : getAdminUserById(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        permissions: buildUserPermissionMatrix(user),
      },
    });
  } catch (error) {
    console.error('Admin user permissions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
