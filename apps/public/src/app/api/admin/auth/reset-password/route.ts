import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { BackyJsonObject } from '@backy-cms/core';
import { checkPersistedAdminAuthRateLimit, resetAdminPasswordToken } from '@/lib/admin-auth/sessionStore';
import { validateAdminPasswordPolicy } from '@/lib/admin-auth/passwordPolicy';
import {
  isProductionAdminLocalAuthAllowed,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
} from '@/lib/admin-auth/productionPolicy';
import { attachAdminSessionCookie } from '@/lib/admin-auth/sessionCookie';
import {
  getPersistedPasswordResetToken,
  removePersistedPasswordResetToken,
} from '@/lib/adminAuthTokenPersistence';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings, updateAdminSettings } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  isSupabaseAdminAuthConfigured,
  SupabaseAdminAuthUnavailableError,
  updateSupabaseAdminPassword,
} from '@/lib/admin-auth/supabaseAuth';

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

const getClientAddress = (request: NextRequest) => (
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')?.trim()
  || 'unknown'
);

const asAuthSettings = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as BackyJsonObject
    : undefined
);

const rateLimitResponse = (requestId: string, retryAfterSeconds: number) => {
  const response = NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many password reset attempts. Please wait before trying again.',
      },
    },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const supabaseRecovery = body.provider === 'supabase';

  if (!token) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Password reset token is required.', requestId);
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  let authSettings = repositories
    ? asAuthSettings((await repositories.settings.get()).auth)
    : asAuthSettings(getAdminSettings().auth);
  const persistAuthSettings = async (auth: BackyJsonObject) => {
    if (repositories) {
      await repositories.settings.update({ auth });
    } else {
      updateAdminSettings({ auth });
    }
    authSettings = auth;
  };

  const passwordPolicy = await validateAdminPasswordPolicy(password, authSettings);
  if (!passwordPolicy.ok) {
    return errorResponse(400, 'VALIDATION_ERROR', passwordPolicy.message, requestId);
  }

  const clientAddress = getClientAddress(request);
  const clientLimit = checkPersistedAdminAuthRateLimit({
    auth: authSettings,
    scope: 'password-reset',
    identifier: `client:${clientAddress}`,
    bucket: 'client',
  });
  await persistAuthSettings(clientLimit.auth);
  if (!clientLimit.limit.allowed) {
    return rateLimitResponse(requestId, clientLimit.limit.retryAfterSeconds);
  }

  const principalLimit = checkPersistedAdminAuthRateLimit({
    auth: authSettings,
    scope: 'password-reset',
    identifier: `token:${createHash('sha256').update(token).digest('hex')}`,
    bucket: 'principal',
  });
  await persistAuthSettings(principalLimit.auth);
  if (!principalLimit.limit.allowed) {
    return rateLimitResponse(requestId, principalLimit.limit.retryAfterSeconds);
  }

  if (supabaseRecovery) {
    if (!isSupabaseAdminAuthConfigured()) {
      return errorResponse(503, 'ADMIN_AUTH_PROVIDER_UNAVAILABLE', 'Supabase Auth is not configured.', requestId);
    }

    let identity;
    try {
      identity = await updateSupabaseAdminPassword(token, password);
    } catch (error) {
      if (error instanceof SupabaseAdminAuthUnavailableError) {
        return errorResponse(503, 'ADMIN_AUTH_PROVIDER_UNAVAILABLE', 'Supabase Auth could not complete this password reset.', requestId);
      }
      throw error;
    }

    if (!identity) {
      return errorResponse(401, 'INVALID_RECOVERY_TOKEN', 'This Supabase recovery link is invalid or expired.', requestId);
    }

    const user = repositories
      ? await repositories.users.getByEmail(identity.email)
      : null;
    if (!user || user.status !== 'active') {
      return errorResponse(403, 'ADMIN_ACCOUNT_NOT_ACTIVE', 'The recovered Supabase account does not have an active Backy admin profile.', requestId);
    }

    await recordAdminAudit({
      repositories,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      action: 'user.password_reset.accept',
      before: { status: user.status },
      after: { status: user.status },
      metadata: {
        email: user.email,
        role: user.role,
        credentialUpdated: true,
        credentialMode: 'supabase',
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        reset: true,
        user,
        session: null,
        requiresSignIn: true,
        provider: 'supabase',
      },
    });
  }

  if (!isProductionAdminLocalAuthAllowed()) {
    return errorResponse(
      503,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
      requestId,
    );
  }

  const result = await resetAdminPasswordToken(token, password, repositories
    ? {
      getUserById: (userId) => repositories.users.getById(userId),
      setPasswordCredential: (userId, credential) => repositories.users.setPasswordCredential(userId, credential),
      updateUser: async (userId, input) => (await repositories.users.update(userId, input)).item,
      getPasswordResetToken: async (candidateToken) => getPersistedPasswordResetToken((await repositories.settings.get()).auth, candidateToken),
      consumePasswordResetToken: async (candidateToken) => {
        const current = await repositories.settings.get();
        await repositories.settings.update({
          auth: removePersistedPasswordResetToken(current.auth, candidateToken),
        });
      },
    }
    : undefined, authSettings);
  if (!result.reset) {
    const status = result.reason === 'expired'
      ? 410
      : result.reason === 'missing'
        ? 404
        : 409;
    const message = result.reason === 'expired'
      ? 'Password reset link has expired.'
      : result.reason === 'missing'
        ? 'Password reset token was not found.'
        : result.reason === 'inactive'
          ? 'This account must be active or invited before password reset.'
          : result.reason === 'invite-only'
            ? 'Invite-only workspace access requires users to accept an invitation before becoming active.'
            : 'Password reset token could not be accepted.';
    const code = result.reason === 'invite-only'
      ? 'INVITE_ONLY_REQUIRED'
      : `RESET_${result.reason.replace(/-/g, '_').toUpperCase()}`;

    return errorResponse(status, code, message, requestId);
  }

  await recordAdminAudit({
    repositories,
    actorId: result.user.id,
    entity: 'user',
    entityId: result.user.id,
    action: 'user.password_reset.accept',
    before: {
      status: result.previousStatus,
    },
    after: {
      status: result.user.status,
    },
    metadata: {
      email: result.user.email,
      role: result.user.role,
      resetTokenId: result.resetToken.id,
      requestedById: result.resetToken.requestedById || null,
      credentialUpdated: true,
      credentialMode: repositories ? 'database' : 'local-demo',
    },
    requestId,
  });

  return attachAdminSessionCookie(NextResponse.json({
    success: true,
    requestId,
    data: {
      reset: true,
      user: result.user,
      session: result.session,
      resetToken: {
        id: result.resetToken.id,
        email: result.resetToken.email,
        createdAt: result.resetToken.createdAt,
        expiresAt: result.resetToken.expiresAt,
        requestedById: result.resetToken.requestedById || null,
        deliveryConfigured: result.resetToken.deliveryConfigured,
      },
    },
  }), result.session);
}
