import { getAdminApiBase } from '@/lib/adminContentApi';
import type { User } from '@/stores/authStore';

export interface AdminSession {
  token?: string;
  issuedAt: string;
  expiresAt: string;
  authMode: 'local-demo' | 'supabase';
}

export interface AdminSessionSummary {
  id: string;
  user: User & {
    status?: 'active' | 'inactive' | 'invited' | 'suspended';
  };
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  authMode: 'local-demo' | 'supabase';
  current: boolean;
}

export interface AdminPasswordResetToken {
  id: string;
  token: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  requestedById?: string | null;
  deliveryConfigured: boolean;
  resetUrl: string;
}

export interface AdminInviteToken {
  id: string;
  token: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  requestedById?: string | null;
  deliveryConfigured: boolean;
  inviteUrl: string;
}

export interface AdminUserMfaEnrollment {
  userId: string;
  email: string;
  enabled: boolean;
  method: 'recovery-code';
  recoveryCodesRemaining: number;
  recoveryCodesIssuedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  disabledAt: string | null;
}

interface AdminAuthResponse {
  success: boolean;
  data?: {
    user: User;
    session: AdminSession;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export class AdminAuthApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.name = 'AdminAuthApiError';
    this.code = options.code;
    this.status = options.status;
  }
}

export class AdminAuthNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthNetworkError';
  }
}

interface AdminInviteAcceptResponse {
  success: boolean;
  data?: {
    accepted: boolean;
    user: User;
    session: AdminSession;
    invite: {
      id: string;
      email: string;
      createdAt: string;
      expiresAt: string;
      requestedById?: string | null;
      deliveryConfigured: boolean;
    };
  };
  error?: {
    message?: string;
  };
}

interface AdminPasswordResetAcceptResponse {
  success: boolean;
  data?: {
    reset: boolean;
    user: User;
    session: AdminSession;
    resetToken: {
      id: string;
      email: string;
      createdAt: string;
      expiresAt: string;
      requestedById?: string | null;
      deliveryConfigured: boolean;
    };
  };
  error?: {
    message?: string;
  };
}

interface AdminSessionListResponse {
  success: boolean;
  data?: {
    sessions: AdminSessionSummary[];
  };
  error?: {
    message?: string;
  };
}

interface AdminSessionRevokeResponse {
  success: boolean;
  data?: {
    revoked: boolean;
  };
  error?: {
    message?: string;
  };
}

interface AdminPasswordResetTokenResponse {
  success: boolean;
  data?: {
    reset: AdminPasswordResetToken;
  };
  error?: {
    message?: string;
  };
}

interface AdminInviteTokenResponse {
  success: boolean;
  data?: {
    invite: AdminInviteToken;
  };
  error?: {
    message?: string;
  };
}

interface AdminUserMfaResponse {
  success: boolean;
  data?: {
    mfa: AdminUserMfaEnrollment;
    recoveryCodes?: string[];
  };
  error?: {
    message?: string;
  };
}

interface AdminPasswordRecoveryResponse {
  success: boolean;
  data?: {
    accepted: boolean;
    deliveryConfigured: boolean;
    resetDelivery?: {
      attempted: boolean;
      provider: 'local-outbox' | 'http-endpoint' | 'resend' | 'smtp';
      status: 'queued' | 'failed';
      deliveryConfigured: boolean;
      statusCode?: number;
      error?: string;
      metadata?: Record<string, unknown>;
    } | null;
    message?: string;
    localRecovery?: {
      resetUrl: string;
      expiresAt: string;
    };
  };
  error?: {
    message?: string;
  };
}

interface AdminPasswordPolicyResponse {
  success: boolean;
  data?: {
    policy: {
      minPasswordLength: number;
    };
  };
  error?: {
    message?: string;
  };
}

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => null);
  return payload as T;
};

const AUTH_REQUEST_TIMEOUT_MS = 8000;

const describeAdminAuthEndpoint = () => {
  const adminApiBase = getAdminApiBase();
  const isLocalBackend = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):3001\/api\/admin$/i.test(adminApiBase);

  if (isLocalBackend) {
    return `Check that the local backend is running on port 3001. Admin API base: ${adminApiBase}.`;
  }

  return `Check VITE_BACKY_ADMIN_API_BASE_URL / VITE_BACKY_PUBLIC_API_BASE_URL and confirm backy-public is healthy. Admin API base: ${adminApiBase}.`;
};

const adminAuthFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
    : null;

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal || controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AdminAuthNetworkError(`Backy admin API did not respond. ${describeAdminAuthEndpoint()}`);
    }
    if (error instanceof TypeError) {
      throw new AdminAuthNetworkError(`Backy admin API could not be reached. ${describeAdminAuthEndpoint()}`);
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const sessionHeaders = (token?: string | null, extra?: HeadersInit): Headers => {
  const headers = new Headers(extra);
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return headers;
};

export async function fetchAdminPasswordPolicy() {
  const response = await fetch(`${getAdminApiBase()}/auth/password-policy`, {
    credentials: 'include',
  });
  const payload = await readJson<AdminPasswordPolicyResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load password policy');
  }

  return payload.data.policy;
}

export async function loginAdmin(email: string, password: string, twoFactorCode?: string) {
  const response = await adminAuthFetch(`${getAdminApiBase()}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new AdminAuthApiError(payload?.error?.message || 'Invalid email or password', {
      code: payload?.error?.code,
      status: response.status,
    });
  }

  return payload.data;
}

export async function fetchAdminSession(token?: string | null) {
  const response = await adminAuthFetch(`${getAdminApiBase()}/auth/session`, {
    credentials: 'include',
    headers: sessionHeaders(token),
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Admin session is no longer valid');
  }

  return payload.data;
}

export async function rotateAdminSession(token?: string | null) {
  const response = await adminAuthFetch(`${getAdminApiBase()}/auth/session`, {
    method: 'POST',
    credentials: 'include',
    headers: sessionHeaders(token),
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to rotate admin session');
  }

  return payload.data;
}

export async function logoutAdmin(token?: string | null) {
  await adminAuthFetch(`${getAdminApiBase()}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: sessionHeaders(token),
  }).catch(() => undefined);
}

export async function listAdminAuthSessions(token?: string | null, filters: { userId?: string; email?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.email) params.set('email', filters.email);
  const query = params.toString();
  const response = await fetch(`${getAdminApiBase()}/auth/sessions${query ? `?${query}` : ''}`, {
    credentials: 'include',
    headers: sessionHeaders(token),
  });
  const payload = await readJson<AdminSessionListResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load admin sessions');
  }

  return payload.data.sessions;
}

export async function revokeAdminAuthSession(token: string | null | undefined, sessionId: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/sessions`, {
    method: 'DELETE',
    credentials: 'include',
    headers: sessionHeaders(token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ sessionId }),
  });
  const payload = await readJson<AdminSessionRevokeResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to revoke admin session');
  }

  return payload.data;
}

export async function createAdminPasswordResetToken(
  token: string | null | undefined,
  userId: string,
  options: { expiresInMinutes?: number } = {},
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/password-reset`, {
    method: 'POST',
    credentials: 'include',
    headers: sessionHeaders(token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(options),
  });
  const payload = await readJson<AdminPasswordResetTokenResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to create password reset token');
  }

  return payload.data.reset;
}

export async function createAdminInviteToken(
  token: string | null | undefined,
  userId: string,
  options: { expiresInMinutes?: number } = {},
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/invite-link`, {
    method: 'POST',
    credentials: 'include',
    headers: sessionHeaders(token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(options),
  });
  const payload = await readJson<AdminInviteTokenResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to create invite link');
  }

  return payload.data.invite;
}

export async function getAdminUserMfa(token: string | null | undefined, userId: string) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/mfa`, {
    credentials: 'include',
    headers: sessionHeaders(token),
  });
  const payload = await readJson<AdminUserMfaResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load user MFA settings');
  }

  return payload.data.mfa;
}

export async function updateAdminUserMfa(
  token: string | null | undefined,
  userId: string,
  input: { enabled?: boolean; generateRecoveryCodes?: boolean },
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/mfa`, {
    method: 'PATCH',
    credentials: 'include',
    headers: sessionHeaders(token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(input),
  });
  const payload = await readJson<AdminUserMfaResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to update user MFA settings');
  }

  return {
    mfa: payload.data.mfa,
    recoveryCodes: payload.data.recoveryCodes || [],
  };
}

export async function acceptAdminInvite(token: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/accept-invite`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  const payload = await readJson<AdminInviteAcceptResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to accept invite');
  }

  return payload.data;
}

export async function resetAdminPassword(token: string, password: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token, password }),
  });
  const payload = await readJson<AdminPasswordResetAcceptResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to reset password');
  }

  return payload.data;
}

export async function requestAdminPasswordRecovery(email: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/password-recovery`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  const payload = await readJson<AdminPasswordRecoveryResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to request password recovery');
  }

  return payload.data;
}
