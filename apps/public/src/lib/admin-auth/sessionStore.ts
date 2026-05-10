import { randomUUID } from 'node:crypto';
import { getAdminSettings, getAdminUserByEmail, getAdminUserById } from '@/lib/backyStore';

export interface AdminAuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited' | 'suspended';
}

export interface AdminSession {
  token: string;
  user: AdminAuthUser;
  issuedAt: string;
  expiresAt: string;
  authMode: 'local-demo';
}

type StoredSession = AdminSession & {
  lastSeenAt: string;
};

const ADMIN_SESSIONS = new Map<string, StoredSession>();

const DEMO_CREDENTIALS: Record<string, { password: string; userEmail: string; label: string }> = {
  'admin@backy.io': {
    password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    userEmail: 'admin@backy.io',
    label: 'Admin',
  },
  'jane@backy.io': {
    password: process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123',
    userEmail: 'jane@backy.io',
    label: 'Editor',
  },
  'editor@backy.io': {
    password: process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123',
    userEmail: 'jane@backy.io',
    label: 'Editor',
  },
};

const normalizeEmail = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const toAuthUser = (user: ReturnType<typeof getAdminUserById>): AdminAuthUser | null => {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
  };
};

const getSessionTimeoutMinutes = () => {
  const settings = getAdminSettings();
  const raw = settings.auth && typeof settings.auth.sessionTimeoutMinutes === 'number'
    ? settings.auth.sessionTimeoutMinutes
    : 120;

  if (!Number.isFinite(raw)) return 120;
  return Math.min(Math.max(raw, 15), 10080);
};

const pruneExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of ADMIN_SESSIONS.entries()) {
    if (Date.parse(session.expiresAt) <= now) {
      ADMIN_SESSIONS.delete(token);
    }
  }
};

export function authenticateAdminCredentials(email: string, password: string): AdminSession | null {
  pruneExpiredSessions();

  const normalizedEmail = normalizeEmail(email);
  const credential = DEMO_CREDENTIALS[normalizedEmail];
  if (!credential || credential.password !== password) {
    return null;
  }

  const user = toAuthUser(getAdminUserByEmail(credential.userEmail));
  if (!user || user.status !== 'active') {
    return null;
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + getSessionTimeoutMinutes() * 60 * 1000);
  const session: StoredSession = {
    token: `bas_${randomUUID().replace(/-/g, '')}`,
    user,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    authMode: 'local-demo',
    lastSeenAt: issuedAt.toISOString(),
  };

  ADMIN_SESSIONS.set(session.token, session);
  return {
    token: session.token,
    user: session.user,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    authMode: session.authMode,
  };
}

export function getAdminSession(token: string | null | undefined): AdminSession | null {
  pruneExpiredSessions();
  if (!token) return null;

  const session = ADMIN_SESSIONS.get(token.trim());
  if (!session) return null;

  const user = toAuthUser(getAdminUserById(session.user.id));
  if (!user || user.status !== 'active') {
    ADMIN_SESSIONS.delete(session.token);
    return null;
  }

  const now = new Date().toISOString();
  session.user = user;
  session.lastSeenAt = now;
  ADMIN_SESSIONS.set(session.token, session);

  return {
    token: session.token,
    user: session.user,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    authMode: session.authMode,
  };
}

export function revokeAdminSession(token: string | null | undefined): boolean {
  if (!token) return false;
  return ADMIN_SESSIONS.delete(token.trim());
}

export function getLocalRecoveryAccount(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const credential = DEMO_CREDENTIALS[normalizedEmail];
  if (!credential) return null;

  const user = getAdminUserByEmail(credential.userEmail);
  if (!user || user.status !== 'active') return null;

  return {
    email: normalizedEmail,
    label: credential.label,
    demoPassword: credential.password,
  };
}
