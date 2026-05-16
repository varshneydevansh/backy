import { NextRequest, NextResponse } from 'next/server';
import {
  checkAdminAuthRateLimit,
  createAdminPasswordResetToken,
} from '@/lib/admin-auth/sessionStore';
import { validateAdminInviteOnlyActivationPolicy } from '@/lib/admin-auth/emailPolicy';
import { getAdminUserByEmail } from '@/lib/backyStore';
import { addPersistedPasswordResetToken } from '@/lib/adminAuthTokenPersistence';
import { deliverAdminPasswordResetEmail, type AdminUserDeliveryResult } from '@/lib/adminUserEmailDelivery';
import { getEmailDeliveryConfig } from '@/lib/formEmailDelivery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const exposeLocalRecoveryToken = () => (
  process.env.BACKY_EXPOSE_LOCAL_RECOVERY_TOKEN?.trim().toLowerCase() === 'true'
);

const rateLimitResponse = (requestId: string, retryAfterSeconds: number) => {
  const response = NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many recovery requests. Please wait before trying again.',
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
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !email.includes('@')) {
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid workspace email is required.',
        },
      },
      { status: 400 },
    );
  }

  const clientAddress = getClientAddress(request);
  const clientLimit = checkAdminAuthRateLimit({
    scope: 'password-recovery',
    identifier: `client:${clientAddress}`,
    bucket: 'client',
  });
  if (!clientLimit.allowed) {
    return rateLimitResponse(requestId, clientLimit.retryAfterSeconds);
  }

  const principalLimit = checkAdminAuthRateLimit({
    scope: 'password-recovery',
    identifier: `email:${email}`,
    bucket: 'principal',
  });
  if (!principalLimit.allowed) {
    return rateLimitResponse(requestId, principalLimit.retryAfterSeconds);
  }

  let resetDelivery: AdminUserDeliveryResult | null = null;
  let localRecovery: { resetUrl: string; expiresAt: string } | undefined;

  try {
    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;
    const user = repositories
      ? await repositories.users.getByEmail(email)
      : getAdminUserByEmail(email);
    if (user && user.status !== 'inactive' && user.status !== 'suspended') {
      const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(user.status, 'active');
      if (inviteOnlyPolicy.ok) {
        const reset = createAdminPasswordResetToken({
          user,
          requestedById: null,
          origin: request.headers.get('origin') || request.nextUrl.origin,
          expiresInMinutes: 60,
          persistInMemory: !repositories,
        });
        resetDelivery = await deliverAdminPasswordResetEmail({ user, reset, requestId });
        const deliveredReset = {
          ...reset,
          deliveryConfigured: resetDelivery.deliveryConfigured === true,
        };
        if (repositories) {
          const currentSettings = await repositories.settings.get();
          await repositories.settings.update({
            auth: addPersistedPasswordResetToken(currentSettings.auth, deliveredReset),
          });
        }
        if (exposeLocalRecoveryToken()) {
          localRecovery = {
            resetUrl: reset.resetUrl,
            expiresAt: reset.expiresAt,
          };
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recovery delivery error';
    const statusCode = resetDelivery?.statusCode;
    console.error('Admin password recovery delivery failed:', { message, statusCode, requestId });
  }

  const deliveryConfig = getEmailDeliveryConfig();
  const publicResetDelivery: AdminUserDeliveryResult = {
    attempted: true,
    provider: deliveryConfig.provider,
    status: 'queued',
    deliveryConfigured: true,
  };
  const message = localRecovery
    ? 'Local recovery link generated. Open it to reset the password in this development environment.'
    : 'If recovery is available for this account, the reset email was queued through the configured recovery channel.';

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      accepted: true,
      deliveryConfigured: true,
      resetDelivery: publicResetDelivery,
      message,
      ...(localRecovery ? { localRecovery } : {}),
    },
  });
}
