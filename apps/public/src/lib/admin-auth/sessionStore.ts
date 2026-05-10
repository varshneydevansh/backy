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

export interface AdminSessionSummary {
  id: string;
  user: AdminAuthUser;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  authMode: 'local-demo';
  current: boolean;
}

type StoredSession = AdminSession & {
  lastSeenAt: string;
};

const globalAdminSessionStore = globalThis as typeof globalThis & {
  __BACKY_ADMIN_SESSIONS__?: Map<string, StoredSession>;
};

const ADMIN_SESSIONS = globalAdminSessionStore.__BACKY_ADMIN_SESSIONS__ ?? new Map<string, StoredSession>();
globalAdminSessionStore.__BACKY_ADMIN_SESSIONS__ = ADMIN_SESSIONS;

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

export function listAdminSessions(options: {
  currentToken?: string | null;
  userId?: string;
  email?: string;
} = {}): AdminSessionSummary[] {
  pruneExpiredSessions();

  const currentToken = options.currentToken?.trim() || '';
  const userId = options.userId?.trim() || '';
  const email = normalizeEmail(options.email);

  return Array.from(ADMIN_SESSIONS.values())
    .filter((session) => {
      const user = toAuthUser(getAdminUserById(session.user.id));
      if (!user || user.status !== 'active') {
        ADMIN_SESSIONS.delete(session.token);
        return false;
      }

      session.user = user;

      if (userId && user.id !== userId) return false;
      if (email && user.email.toLowerCase() !== email) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .map((session) => ({
      id: session.token.slice(-12),
      user: session.user,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      authMode: session.authMode,
      current: Boolean(currentToken && session.token === currentToken),
    }));
}

export function revokeAdminSessionById(sessionId: string, currentToken?: string | null): {
  revoked: boolean;
  current: boolean;
} {
  pruneExpiredSessions();

  const normalizedSessionId = sessionId.trim();
  const normalizedCurrentToken = currentToken?.trim() || '';
  if (!normalizedSessionId) {
    return { revoked: false, current: false };
  }

  for (const [token] of ADMIN_SESSIONS.entries()) {
    if (token.slice(-12) !== normalizedSessionId) continue;

    const current = Boolean(normalizedCurrentToken && token === normalizedCurrentToken);
    if (current) {
      return { revoked: false, current: true };
    }

    return { revoked: ADMIN_SESSIONS.delete(token), current: false };
  }

  return { revoked: false, current: false };
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
