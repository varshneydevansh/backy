import { getAdminApiBase } from '@/lib/adminContentApi';
import type { User } from '@/stores/authStore';

export interface AdminSession {
  token: string;
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

export async function fetchAdminPasswordPolicy() {
  const response = await fetch(`${getAdminApiBase()}/auth/password-policy`);
  const payload = await readJson<AdminPasswordPolicyResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load password policy');
  }

  return payload.data.policy;
}

export async function loginAdmin(email: string, password: string, twoFactorCode?: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/login`, {
    method: 'POST',
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

export async function fetchAdminSession(token: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/session`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Admin session is no longer valid');
  }

  return payload.data;
}

export async function rotateAdminSession(token: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/session`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to rotate admin session');
  }

  return payload.data;
}

export async function logoutAdmin(token?: string | null) {
  await fetch(`${getAdminApiBase()}/auth/logout`, {
    method: 'POST',
    headers: token
      ? {
          authorization: `Bearer ${token}`,
        }
      : undefined,
  }).catch(() => undefined);
}

export async function listAdminAuthSessions(token: string, filters: { userId?: string; email?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.email) params.set('email', filters.email);
  const query = params.toString();
  const response = await fetch(`${getAdminApiBase()}/auth/sessions${query ? `?${query}` : ''}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await readJson<AdminSessionListResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load admin sessions');
  }

  return payload.data.sessions;
}

export async function revokeAdminAuthSession(token: string, sessionId: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/sessions`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });
  const payload = await readJson<AdminSessionRevokeResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to revoke admin session');
  }

  return payload.data;
}

export async function createAdminPasswordResetToken(
  token: string,
  userId: string,
  options: { expiresInMinutes?: number } = {},
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/password-reset`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(options),
  });
  const payload = await readJson<AdminPasswordResetTokenResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to create password reset token');
  }

  return payload.data.reset;
}

export async function createAdminInviteToken(
  token: string,
  userId: string,
  options: { expiresInMinutes?: number } = {},
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/invite-link`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(options),
  });
  const payload = await readJson<AdminInviteTokenResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to create invite link');
  }

  return payload.data.invite;
}

export async function getAdminUserMfa(token: string, userId: string) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/mfa`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await readJson<AdminUserMfaResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Unable to load user MFA settings');
  }

  return payload.data.mfa;
}

export async function updateAdminUserMfa(
  token: string,
  userId: string,
  input: { enabled?: boolean; generateRecoveryCodes?: boolean },
) {
  const response = await fetch(`${getAdminApiBase()}/users/${encodeURIComponent(userId)}/mfa`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
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
