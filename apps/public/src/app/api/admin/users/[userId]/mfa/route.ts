import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getUserMfaEnrollment,
  updateUserMfaEnrollment,
  type UserMfaEnrollmentSummary,
} from '@/lib/admin-auth/userMfa';
import { getAdminSettings, getAdminUserById, updateAdminSettings } from '@/lib/backyStore';
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

type UserForMfa = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
};

const getUserAndSettings = async (userId: string) => {
  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const user = repositories
    ? await repositories.users.getById(userId)
    : getAdminUserById(userId);
  const settings = repositories
    ? await repositories.settings.get()
    : getAdminSettings();

  return {
    repositories,
    user: user as UserForMfa | null,
    settings,
  };
};

const enrollmentResponse = (
  requestId: string,
  user: UserForMfa,
  enrollment: UserMfaEnrollmentSummary,
  recoveryCodes: string[] = [],
) => NextResponse.json({
  success: true,
  requestId,
  data: {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    },
    mfa: enrollment,
    ...(recoveryCodes.length > 0 ? { recoveryCodes } : {}),
  },
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;
    const { user, settings } = await getUserAndSettings(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return enrollmentResponse(requestId, user, getUserMfaEnrollment(settings.auth, user.id, user.email));
  } catch (error) {
    console.error('Admin user MFA API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;
    const body = await parseJsonBody(request);
    const enabled = body.enabled;
    const generateRecoveryCodes = body.generateRecoveryCodes === true;

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return errorResponse(400, 'VALIDATION_ERROR', 'enabled must be a boolean when provided.', requestId);
    }

    if (body.generateRecoveryCodes !== undefined && typeof body.generateRecoveryCodes !== 'boolean') {
      return errorResponse(400, 'VALIDATION_ERROR', 'generateRecoveryCodes must be a boolean when provided.', requestId);
    }

    if (enabled === undefined && !generateRecoveryCodes) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Provide enabled or generateRecoveryCodes.', requestId);
    }

    const { repositories, user, settings } = await getUserAndSettings(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    const before = getUserMfaEnrollment(settings.auth, user.id, user.email);
    const result = updateUserMfaEnrollment({
      auth: settings.auth,
      user,
      enabled: enabled ?? (generateRecoveryCodes ? true : undefined),
      generateRecoveryCodes,
      actorId: access.session?.user.id || null,
    });

    if (repositories) {
      await repositories.settings.update({ auth: result.auth });
    } else {
      updateAdminSettings({ auth: result.auth });
    }

    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      entity: 'user',
      entityId: user.id,
      action: generateRecoveryCodes ? 'user.mfa.recovery_codes.rotate' : 'user.mfa.update',
      before,
      after: result.enrollment,
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status,
        enabled: result.enrollment.enabled,
        generatedRecoveryCodes: generateRecoveryCodes,
        recoveryCodesRemaining: result.enrollment.recoveryCodesRemaining,
        rawRecoveryCodesIncluded: result.recoveryCodes.length > 0,
      },
      requestId,
    });

    return enrollmentResponse(requestId, user, result.enrollment, result.recoveryCodes);
  } catch (error) {
    console.error('Admin user MFA update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
