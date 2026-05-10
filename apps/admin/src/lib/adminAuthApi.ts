import { getAdminApiBase } from '@/lib/adminContentApi';
import type { User } from '@/stores/authStore';

export interface AdminSession {
  token: string;
  issuedAt: string;
  expiresAt: string;
  authMode: 'local-demo';
}

interface AdminAuthResponse {
  success: boolean;
  data?: {
    user: User;
    session: AdminSession;
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
    localRecovery?: {
      email: string;
      label: string;
      demoPassword: string;
    } | null;
    message?: string;
  };
  error?: {
    message?: string;
  };
}

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => null);
  return payload as T;
};

export async function loginAdmin(email: string, password: string) {
  const response = await fetch(`${getAdminApiBase()}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson<AdminAuthResponse>(response);

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Invalid email or password');
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
