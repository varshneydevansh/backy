import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateAdminCredentials,
  authenticateAdminCredentialsWithPersistence,
  createAdminSessionForExternalUser,
  type AdminSession,
} from '@/lib/admin-auth/sessionStore';
import {
  isProductionAdminLocalAuthAllowed,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
} from '@/lib/admin-auth/productionPolicy';
import { attachAdminSessionCookie } from '@/lib/admin-auth/sessionCookie';
import {
  authenticateSupabaseAdminCredentials,
  isSupabaseAdminAuthConfigured,
  SupabaseAdminAuthUnavailableError,
} from '@/lib/admin-auth/supabaseAuth';
import { getAdminUserByEmail } from '@/lib/backyStore';
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

const asAuthSettings = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

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

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !email.includes('@') || !password) {
    return errorResponse(400, 'VALIDATION_ERROR', 'A valid email and password are required.', requestId);
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const authSettings = repositories ? asAuthSettings((await repositories.settings.get()).auth) : undefined;
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
          return successResponse(requestId, createAdminSessionForExternalUser({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            status: user.status,
          }, 'supabase', authSettings));
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
    return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.', requestId);
  }

  return successResponse(requestId, session);
}
