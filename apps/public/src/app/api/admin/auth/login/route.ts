import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject } from '@backy-cms/core';
import {
  authenticateAdminCredentials,
  authenticateAdminCredentialsWithPersistence,
  checkPersistedAdminAuthRateLimit,
  clearPersistedAdminAuthRateLimit,
  createAdminSessionForExternalUser,
  peekPersistedAdminAuthRateLimit,
  revokeAdminSession,
  type AdminSession,
} from '@/lib/admin-auth/sessionStore';
import {
  isProductionAdminLocalAuthAllowed,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
} from '@/lib/admin-auth/productionPolicy';
import { attachAdminSessionCookie } from '@/lib/admin-auth/sessionCookie';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  authenticateSupabaseAdminCredentials,
  isSupabaseAdminAuthConfigured,
  SupabaseAdminAuthUnavailableError,
} from '@/lib/admin-auth/supabaseAuth';
import { isAdminMfaConfigured, verifyAdminMfaCode } from '@/lib/admin-auth/mfa';
import {
  hasUserMfaRecoveryCodes,
  isUserMfaRequired,
  verifyUserMfaRecoveryCode,
} from '@/lib/admin-auth/userMfa';
import { getAdminSettings, getAdminUserByEmail, updateAdminSettings } from '@/lib/backyStore';
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

const asAuthSettings = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as BackyJsonObject
    : undefined
);

const getClientAddress = (request: NextRequest) => (
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')?.trim()
  || 'unknown'
);

const rateLimitResponse = (requestId: string, retryAfterSeconds: number) => {
  const response = errorResponse(
    429,
    'RATE_LIMITED',
    'Too many login attempts. Please wait before trying again.',
    requestId,
  );
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
};

const successResponse = (requestId: string, session: AdminSession) => attachAdminSessionCookie(NextResponse.json({
  success: true,
  requestId,
  data: {
    user: session.user,
    session: {
      token: session.token,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      authMode: session.authMode,
    },
  },
}), session);

type LoginAuditRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;

const sessionAuditMetadata = (
  session: AdminSession,
  extra: Record<string, unknown> = {},
) => ({
  userId: session.user.id,
  email: session.user.email,
  role: session.user.role,
  authMode: session.authMode,
  ...extra,
});

const recordAuthAudit = async (input: {
  repositories: LoginAuditRepositories;
  requestId: string;
  action: string;
  session: AdminSession;
  metadata?: Record<string, unknown>;
}) => {
  await recordAdminAudit({
    repositories: input.repositories,
    actorId: input.session.user.id,
    entity: 'settings',
    entityId: 'platform',
    action: input.action,
    metadata: sessionAuditMetadata(input.session, input.metadata),
    requestId: input.requestId,
  });
};

const completeLoginResponse = async (
  requestId: string,
  session: AdminSession,
  repositories: LoginAuditRepositories,
  authSettings: Record<string, unknown> | undefined,
  twoFactorCode: unknown,
) => {
  const mfaRequired = isUserMfaRequired(authSettings, session.user.id);
  if (!mfaRequired) {
    await recordAuthAudit({
      repositories,
      requestId,
      action: 'auth.login.success',
      session,
      metadata: { mfaRequired: false },
    });
    return successResponse(requestId, session);
  }

  const envMfaConfigured = isAdminMfaConfigured();
  const recoveryCodesConfigured = hasUserMfaRecoveryCodes(authSettings, session.user.id);

  if (typeof twoFactorCode !== 'string' || !twoFactorCode.trim()) {
    revokeAdminSession(session.token);
    await recordAuthAudit({
      repositories,
      requestId,
      action: 'auth.login.mfa_required',
      session,
      metadata: { mfaRequired: true, envMfaConfigured, recoveryCodesConfigured },
    });
    return errorResponse(401, 'MFA_REQUIRED', 'Enter your two-factor authentication code.', requestId);
  }

  const recoveryVerification = verifyUserMfaRecoveryCode({
    auth: authSettings,
    userId: session.user.id,
    code: twoFactorCode,
  });
  if (recoveryVerification.ok) {
    if (repositories) {
      await repositories.settings.update({ auth: recoveryVerification.auth });
    } else {
      updateAdminSettings({ auth: recoveryVerification.auth });
    }
    await recordAuthAudit({
      repositories,
      requestId,
      action: 'auth.login.success',
      session,
      metadata: {
        mfaRequired: true,
        mfaMethod: 'recovery-code',
        recoveryCodesRemaining: recoveryVerification.recoveryCodesRemaining,
      },
    });
    return successResponse(requestId, session);
  }

  if (!envMfaConfigured && !recoveryCodesConfigured) {
    revokeAdminSession(session.token);
    await recordAuthAudit({
      repositories,
      requestId,
      action: 'auth.login.mfa_provider_missing',
      session,
      metadata: { mfaRequired: true, envMfaConfigured, recoveryCodesConfigured },
    });
    return errorResponse(
      503,
      'MFA_PROVIDER_NOT_CONFIGURED',
      'Two-factor authentication is required but no admin MFA verifier is configured.',
      requestId,
    );
  }

  if (!envMfaConfigured || !verifyAdminMfaCode(twoFactorCode)) {
    revokeAdminSession(session.token);
    await recordAuthAudit({
      repositories,
      requestId,
      action: 'auth.login.mfa_invalid',
      session,
      metadata: { mfaRequired: true, envMfaConfigured, recoveryCodesConfigured },
    });
    return errorResponse(401, 'INVALID_MFA_CODE', 'Invalid two-factor authentication code.', requestId);
  }

  await recordAuthAudit({
    repositories,
    requestId,
    action: 'auth.login.success',
    session,
    metadata: { mfaRequired: true, mfaMethod: 'configured-verifier' },
  });
  return successResponse(requestId, session);
};

const rateLimitIdentifier = (kind: 'client' | 'email', value: string) => `${kind}:${value}`;

const getLoginRateLimit = (auth: BackyJsonObject | undefined, clientAddress: string, email: string) => {
  const clientLimit = peekPersistedAdminAuthRateLimit({
    auth,
    scope: 'login',
    identifier: rateLimitIdentifier('client', clientAddress),
    bucket: 'client',
  });
  if (!clientLimit.allowed) return clientLimit;

  return peekPersistedAdminAuthRateLimit({
    auth,
    scope: 'login',
    identifier: rateLimitIdentifier('email', email),
    bucket: 'principal',
  });
};

const recordFailedLoginAttempt = (auth: BackyJsonObject | undefined, clientAddress: string, email: string) => {
  const clientLimit = checkPersistedAdminAuthRateLimit({
    auth,
    scope: 'login',
    identifier: rateLimitIdentifier('client', clientAddress),
    bucket: 'client',
  });
  if (!clientLimit.limit.allowed) return clientLimit;

  return checkPersistedAdminAuthRateLimit({
    auth: clientLimit.auth,
    scope: 'login',
    identifier: rateLimitIdentifier('email', email),
    bucket: 'principal',
  });
};

const clearFailedLoginAttempts = (auth: BackyJsonObject | undefined, clientAddress: string, email: string) => {
  const withoutClient = clearPersistedAdminAuthRateLimit({
    auth,
    scope: 'login',
    identifier: rateLimitIdentifier('client', clientAddress),
  });
  return clearPersistedAdminAuthRateLimit({
    auth: withoutClient,
    scope: 'login',
    identifier: rateLimitIdentifier('email', email),
  });
};

const persistAuthSettings = async (
  repositories: LoginAuditRepositories,
  auth: BackyJsonObject,
) => {
  if (repositories) {
    await repositories.settings.update({ auth });
  } else {
    updateAdminSettings({ auth });
  }
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const twoFactorCode = body.twoFactorCode;
  const clientAddress = getClientAddress(request);

  if (!email || !email.includes('@') || !password) {
    return errorResponse(400, 'VALIDATION_ERROR', 'A valid email and password are required.', requestId);
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  let authSettings = repositories
    ? asAuthSettings((await repositories.settings.get()).auth)
    : asAuthSettings(getAdminSettings().auth);

  const loginLimit = getLoginRateLimit(authSettings, clientAddress, email);
  if (!loginLimit.allowed) {
    return rateLimitResponse(requestId, loginLimit.retryAfterSeconds);
  }

  const recordFailure = async () => {
    const failedAttempt = recordFailedLoginAttempt(authSettings, clientAddress, email);
    await persistAuthSettings(repositories, failedAttempt.auth);
    authSettings = failedAttempt.auth;
    return failedAttempt.limit;
  };

  const clearFailures = async () => {
    const clearedAuth = clearFailedLoginAttempts(authSettings, clientAddress, email);
    await persistAuthSettings(repositories, clearedAuth);
    authSettings = clearedAuth;
  };

  const supabaseAuthConfigured = isSupabaseAdminAuthConfigured();
  let supabaseAuthUnavailable = false;
  if (supabaseAuthConfigured) {
    try {
      const supabaseIdentity = await authenticateSupabaseAdminCredentials(email, password);
      if (supabaseIdentity) {
        const user = repositories
          ? await repositories.users.getByEmail(supabaseIdentity.email)
          : getAdminUserByEmail(supabaseIdentity.email);
        if (user?.status === 'active') {
          await clearFailures();
          return completeLoginResponse(requestId, createAdminSessionForExternalUser({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            status: user.status,
          }, 'supabase', authSettings), repositories, authSettings, twoFactorCode);
        }
      }
    } catch (error) {
      if (error instanceof SupabaseAdminAuthUnavailableError) {
        supabaseAuthUnavailable = true;
      } else {
        throw error;
      }
    }
  }

  if (!isProductionAdminLocalAuthAllowed()) {
    if (supabaseAuthUnavailable) {
      return errorResponse(
        503,
        'ADMIN_AUTH_PROVIDER_UNAVAILABLE',
        'Supabase Auth is configured but could not be reached. Check the Supabase URL and server network connectivity.',
        requestId,
      );
    }
    if (supabaseAuthConfigured) {
      const failedAttempt = await recordFailure();
      if (!failedAttempt.allowed) {
        return rateLimitResponse(requestId, failedAttempt.retryAfterSeconds);
      }
      return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.', requestId);
    }

    return errorResponse(
      503,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
      requestId,
    );
  }

  const session = repositories
    ? await authenticateAdminCredentialsWithPersistence(email, password, {
      getPasswordCredentialByEmail: (userEmail) => repositories.users.getPasswordCredentialByEmail(userEmail),
      getUserByEmail: (userEmail) => repositories.users.getByEmail(userEmail),
    }, authSettings)
    : authenticateAdminCredentials(email, password, authSettings);
  if (!session) {
    const failedAttempt = await recordFailure();
    if (!failedAttempt.allowed) {
      return rateLimitResponse(requestId, failedAttempt.retryAfterSeconds);
    }
    return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.', requestId);
  }

  await clearFailures();
  return completeLoginResponse(requestId, session, repositories, authSettings, twoFactorCode);
}
