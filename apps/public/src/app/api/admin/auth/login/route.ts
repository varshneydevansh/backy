import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateAdminCredentials,
  authenticateAdminCredentialsWithPersistence,
} from '@/lib/admin-auth/sessionStore';
import {
  isProductionAdminLocalAuthAllowed,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
} from '@/lib/admin-auth/productionPolicy';
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

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !email.includes('@') || !password) {
    return errorResponse(400, 'VALIDATION_ERROR', 'A valid email and password are required.', requestId);
  }

  if (!isProductionAdminLocalAuthAllowed()) {
    return errorResponse(
      503,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
      PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
      requestId,
    );
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const authSettings = repositories ? asAuthSettings((await repositories.settings.get()).auth) : undefined;
  const session = repositories
    ? await authenticateAdminCredentialsWithPersistence(email, password, {
      getPasswordCredentialByEmail: (userEmail) => repositories.users.getPasswordCredentialByEmail(userEmail),
      getUserByEmail: (userEmail) => repositories.users.getByEmail(userEmail),
    }, authSettings)
    : authenticateAdminCredentials(email, password, authSettings);
  if (!session) {
    return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.', requestId);
  }

  return NextResponse.json({
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
  });
}
