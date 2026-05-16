import { createHash, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { getAdminSettings, getAdminUserByEmail, getAdminUserById, updateAdminUser } from '@/lib/backyStore';
import { validateAdminInviteOnlyActivationPolicy } from '@/lib/admin-auth/emailPolicy';
import { listAuthSettingsPermissionOverrides, type AdminUserPermissionOverride } from '@/lib/adminPermissionOverrides';
import { assertProductionAdminLocalAuthAllowed } from '@/lib/admin-auth/productionPolicy';

export interface AdminAuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited' | 'suspended';
}

export type AdminAuthMode = 'local-demo' | 'supabase';

export interface AdminSession {
  token: string;
  user: AdminAuthUser;
  issuedAt: string;
  expiresAt: string;
  authMode: AdminAuthMode;
}

export interface AdminSessionSummary {
  id: string;
  user: AdminAuthUser;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  authMode: AdminAuthMode;
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

export type AdminInviteAcceptResult =
  | {
      accepted: true;
      invite: AdminInviteToken;
      user: AdminAuthUser;
      session: AdminSession;
      previousStatus: AdminAuthUser['status'];
    }
  | {
      accepted: false;
      reason: 'missing' | 'expired' | 'user-not-found' | 'email-mismatch' | 'not-invited';
      invite?: AdminInviteToken;
    };

export type AdminPasswordResetResult =
  | {
      reset: true;
      resetToken: AdminPasswordResetToken;
      user: AdminAuthUser;
      session: AdminSession;
      previousStatus: AdminAuthUser['status'];
    }
  | {
      reset: false;
      reason: 'missing' | 'expired' | 'user-not-found' | 'email-mismatch' | 'inactive' | 'invite-only';
      resetToken?: AdminPasswordResetToken;
    };

type LocalCredential = {
  passwordHash: string;
  salt: string;
  userEmail: string;
  label: string;
  user?: AdminAuthUser;
};

type StoredSession = AdminSession & {
  lastSeenAt: string;
  permissionOverrides?: AdminUserPermissionOverride[];
};

type AdminAuthUserLike = {
  id: string;
  email: string;
  fullName: string;
  role: AdminAuthUser['role'];
  status: AdminAuthUser['status'];
};

type AdminPasswordCredentialLike = {
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
};

type AdminAuthUserPersistence = {
  getUserById?: (userId: string) => Promise<AdminAuthUserLike | null | undefined>;
  getUserByEmail?: (email: string) => Promise<AdminAuthUserLike | null | undefined>;
  getPasswordCredentialByEmail?: (email: string) => Promise<AdminPasswordCredentialLike | null | undefined>;
  setPasswordCredential?: (
    userId: string,
    credential: Pick<AdminPasswordCredentialLike, 'passwordHash' | 'salt'>,
  ) => Promise<AdminPasswordCredentialLike | null | undefined>;
  updateUser?: (userId: string, input: Partial<Pick<AdminAuthUser, 'status'>>) => Promise<AdminAuthUserLike | null | undefined>;
  getPasswordResetToken?: (token: string) => Promise<AdminPasswordResetToken | null | undefined>;
  consumePasswordResetToken?: (token: string) => Promise<void>;
  getInviteToken?: (token: string) => Promise<AdminInviteToken | null | undefined>;
  consumeInviteToken?: (token: string) => Promise<void>;
};

export type AdminAuthSessionSettings = {
  sessionTimeoutMinutes?: unknown;
  userPermissionOverrides?: unknown;
  permissionOverrides?: unknown;
};

const globalAdminSessionStore = globalThis as typeof globalThis & {
  __BACKY_ADMIN_SESSIONS__?: Map<string, StoredSession>;
  __BACKY_ADMIN_PASSWORD_RESET_TOKENS__?: Map<string, AdminPasswordResetToken>;
  __BACKY_ADMIN_INVITE_TOKENS__?: Map<string, AdminInviteToken>;
  __BACKY_ADMIN_LOCAL_CREDENTIALS__?: Map<string, LocalCredential>;
  __BACKY_ADMIN_AUTH_RATE_LIMITS__?: Map<string, { count: number; resetAt: number }>;
};

const ADMIN_SESSIONS = globalAdminSessionStore.__BACKY_ADMIN_SESSIONS__ ?? new Map<string, StoredSession>();
globalAdminSessionStore.__BACKY_ADMIN_SESSIONS__ = ADMIN_SESSIONS;

const PASSWORD_RESET_TOKENS = globalAdminSessionStore.__BACKY_ADMIN_PASSWORD_RESET_TOKENS__ ?? new Map<string, AdminPasswordResetToken>();
globalAdminSessionStore.__BACKY_ADMIN_PASSWORD_RESET_TOKENS__ = PASSWORD_RESET_TOKENS;

const INVITE_TOKENS = globalAdminSessionStore.__BACKY_ADMIN_INVITE_TOKENS__ ?? new Map<string, AdminInviteToken>();
globalAdminSessionStore.__BACKY_ADMIN_INVITE_TOKENS__ = INVITE_TOKENS;

const LOCAL_CREDENTIALS = globalAdminSessionStore.__BACKY_ADMIN_LOCAL_CREDENTIALS__ ?? new Map<string, LocalCredential>();
globalAdminSessionStore.__BACKY_ADMIN_LOCAL_CREDENTIALS__ = LOCAL_CREDENTIALS;

const AUTH_RATE_LIMITS = globalAdminSessionStore.__BACKY_ADMIN_AUTH_RATE_LIMITS__ ?? new Map<string, { count: number; resetAt: number }>();
globalAdminSessionStore.__BACKY_ADMIN_AUTH_RATE_LIMITS__ = AUTH_RATE_LIMITS;

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

const readPositiveInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

type AdminAuthRateLimitScope = 'login' | 'password-recovery' | 'password-reset';

const authRateLimitConfig = (scope: AdminAuthRateLimitScope) => {
  if (scope === 'login') {
    return {
      max: readPositiveInteger(process.env.BACKY_AUTH_LOGIN_RATE_LIMIT_MAX, 5, 1, 100),
      clientMax: readPositiveInteger(process.env.BACKY_AUTH_LOGIN_CLIENT_RATE_LIMIT_MAX, 25, 1, 500),
      windowMs: readPositiveInteger(process.env.BACKY_AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 1_000, 24 * 60 * 60 * 1000),
    };
  }

  return {
    max: readPositiveInteger(process.env.BACKY_AUTH_RECOVERY_RATE_LIMIT_MAX, 5, 1, 100),
    clientMax: readPositiveInteger(process.env.BACKY_AUTH_RECOVERY_CLIENT_RATE_LIMIT_MAX, 25, 1, 500),
    windowMs: readPositiveInteger(process.env.BACKY_AUTH_RECOVERY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 1_000, 24 * 60 * 60 * 1000),
  };
};

const hashRateLimitKey = (value: string) => (
  createHash('sha256').update(value).digest('hex').slice(0, 32)
);

const hashPassword = (password: string, salt: string) => (
  scryptSync(password, salt, 64).toString('hex')
);

const createPasswordCredential = (password: string): Pick<AdminPasswordCredentialLike, 'passwordHash' | 'salt'> => {
  const salt = randomUUID().replace(/-/g, '');
  return {
    passwordHash: hashPassword(password, salt),
    salt,
  };
};

const verifyPassword = (password: string, credential: Pick<AdminPasswordCredentialLike, 'passwordHash' | 'salt'>) => {
  const expected = Buffer.from(credential.passwordHash, 'hex');
  const actual = Buffer.from(hashPassword(password, credential.salt), 'hex');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const toAuthUser = (user: AdminAuthUserLike | null | undefined): AdminAuthUser | null => {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
  };
};

const normalizeSessionTimeoutMinutes = (value: unknown) => {
  const raw = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : 120;

  if (!Number.isFinite(raw)) return 120;
  return Math.min(Math.max(raw, 15), 10080);
};

const getSessionTimeoutMinutes = (authSettings?: AdminAuthSessionSettings) => {
  if (authSettings) {
    return normalizeSessionTimeoutMinutes(authSettings.sessionTimeoutMinutes);
  }

  const settings = getAdminSettings();
  return normalizeSessionTimeoutMinutes(settings.auth?.sessionTimeoutMinutes);
};

const createAdminSessionForUser = (
  user: AdminAuthUser,
  authSettings?: AdminAuthSessionSettings,
  options: { authMode?: AdminAuthMode } = {},
): AdminSession => {
  const authMode = options.authMode || 'local-demo';
  if (authMode === 'local-demo') {
    assertProductionAdminLocalAuthAllowed();
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + getSessionTimeoutMinutes(authSettings) * 60 * 1000);
  const permissionOverrides = authSettings
    ? listAuthSettingsPermissionOverrides(authSettings, user.id)
    : undefined;
  const session: StoredSession = {
    token: `bas_${randomUUID().replace(/-/g, '')}`,
    user,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    authMode,
    lastSeenAt: issuedAt.toISOString(),
    ...(permissionOverrides ? { permissionOverrides } : {}),
  };

  ADMIN_SESSIONS.set(session.token, session);
  return {
    token: session.token,
    user: session.user,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    authMode: session.authMode,
  };
};

export const createAdminSessionForExternalUser = (
  user: AdminAuthUser,
  authMode: Exclude<AdminAuthMode, 'local-demo'>,
  authSettings?: AdminAuthSessionSettings,
): AdminSession => createAdminSessionForUser(user, authSettings, { authMode });

export function listAdminSessionPermissionOverrides(
  token: string | null | undefined,
  userId: string,
): AdminUserPermissionOverride[] | null {
  const session = token ? ADMIN_SESSIONS.get(token.trim()) : null;
  if (!session || !Object.prototype.hasOwnProperty.call(session, 'permissionOverrides')) return null;
  return (session.permissionOverrides || []).filter((override) => override.userId === userId);
}

export function updateAdminSessionPermissionOverrides(
  userId: string,
  overrides: AdminUserPermissionOverride[],
): void {
  for (const [token, session] of ADMIN_SESSIONS.entries()) {
    if (session.user.id !== userId) continue;
    session.permissionOverrides = overrides.filter((override) => override.userId === userId);
    ADMIN_SESSIONS.set(token, session);
  }
}

const pruneExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of ADMIN_SESSIONS.entries()) {
    if (Date.parse(session.expiresAt) <= now) {
      ADMIN_SESSIONS.delete(token);
    }
  }
};

const adminAuthRateLimitKey = (input: {
  scope: AdminAuthRateLimitScope;
  identifier: string;
  bucket?: 'principal' | 'client';
}) => {
  const normalizedIdentifier = input.identifier.trim().toLowerCase() || 'anonymous';
  return `${input.scope}:${hashRateLimitKey(normalizedIdentifier)}`;
};

const pruneExpiredAuthRateLimits = (now = Date.now()) => {
  for (const [storedKey, state] of AUTH_RATE_LIMITS.entries()) {
    if (state.resetAt <= now) {
      AUTH_RATE_LIMITS.delete(storedKey);
    }
  }
};

export function peekAdminAuthRateLimit(input: {
  scope: AdminAuthRateLimitScope;
  identifier: string;
  bucket?: 'principal' | 'client';
}): { allowed: true; remaining: number; resetAt: string | null } | { allowed: false; retryAfterSeconds: number; resetAt: string } {
  const { max, clientMax } = authRateLimitConfig(input.scope);
  const effectiveMax = input.bucket === 'client' ? clientMax : max;
  const now = Date.now();
  pruneExpiredAuthRateLimits(now);

  const current = AUTH_RATE_LIMITS.get(adminAuthRateLimitKey(input));
  if (!current || current.resetAt <= now) {
    return {
      allowed: true,
      remaining: effectiveMax,
      resetAt: null,
    };
  }

  if (current.count >= effectiveMax) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      resetAt: new Date(current.resetAt).toISOString(),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, effectiveMax - current.count),
    resetAt: new Date(current.resetAt).toISOString(),
  };
}

export function checkAdminAuthRateLimit(input: {
  scope: AdminAuthRateLimitScope;
  identifier: string;
  bucket?: 'principal' | 'client';
}): { allowed: true; remaining: number; resetAt: string } | { allowed: false; retryAfterSeconds: number; resetAt: string } {
  const { max, clientMax, windowMs } = authRateLimitConfig(input.scope);
  const effectiveMax = input.bucket === 'client' ? clientMax : max;
  const now = Date.now();
  const key = adminAuthRateLimitKey(input);
  pruneExpiredAuthRateLimits(now);

  const current = AUTH_RATE_LIMITS.get(key);
  const state = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  state.count += 1;
  AUTH_RATE_LIMITS.set(key, state);

  if (state.count > effectiveMax) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      resetAt: new Date(state.resetAt).toISOString(),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, effectiveMax - state.count),
    resetAt: new Date(state.resetAt).toISOString(),
  };
}

export function clearAdminAuthRateLimit(input: {
  scope: AdminAuthRateLimitScope;
  identifier: string;
}): void {
  AUTH_RATE_LIMITS.delete(adminAuthRateLimitKey(input));
}

export function authenticateAdminCredentials(
  email: string,
  password: string,
  authSettings?: AdminAuthSessionSettings,
): AdminSession | null {
  pruneExpiredSessions();

  const normalizedEmail = normalizeEmail(email);
  const localCredential = LOCAL_CREDENTIALS.get(normalizedEmail);
  if (localCredential && verifyPassword(password, localCredential)) {
    const user = toAuthUser(getAdminUserByEmail(localCredential.userEmail)) || localCredential.user || null;
    if (!user || user.status !== 'active') {
      return null;
    }

    return createAdminSessionForUser(user, authSettings);
  }

  const credential = DEMO_CREDENTIALS[normalizedEmail];
  if (!credential || credential.password !== password) {
    return null;
  }

  const user = toAuthUser(getAdminUserByEmail(credential.userEmail));
  if (!user || user.status !== 'active') {
    return null;
  }

  return createAdminSessionForUser(user, authSettings);
}

export async function authenticateAdminCredentialsWithPersistence(
  email: string,
  password: string,
  persistence: Pick<AdminAuthUserPersistence, 'getPasswordCredentialByEmail' | 'getUserByEmail'> = {},
  authSettings?: AdminAuthSessionSettings,
): Promise<AdminSession | null> {
  pruneExpiredSessions();

  const normalizedEmail = normalizeEmail(email);
  if (persistence.getPasswordCredentialByEmail) {
    const credential = await persistence.getPasswordCredentialByEmail(normalizedEmail);
    if (!credential || !verifyPassword(password, credential)) {
      return null;
    }

    const user = toAuthUser(
      persistence.getUserByEmail
        ? await persistence.getUserByEmail(credential.email)
        : getAdminUserByEmail(credential.email),
    );
    if (!user || user.id !== credential.userId || user.status !== 'active') {
      return null;
    }

    return createAdminSessionForUser(user, authSettings);
  }

  const localCredential = LOCAL_CREDENTIALS.get(normalizedEmail);
  if (localCredential && verifyPassword(password, localCredential)) {
    const user = toAuthUser(
      persistence.getUserByEmail
        ? await persistence.getUserByEmail(localCredential.userEmail)
        : getAdminUserByEmail(localCredential.userEmail),
    ) || (!persistence.getUserByEmail ? localCredential.user || null : null);

    if (!user || user.status !== 'active') {
      return null;
    }

    return createAdminSessionForUser(user, authSettings);
  }

  if (persistence.getUserByEmail) {
    return null;
  }

  return authenticateAdminCredentials(email, password, authSettings);
}

export function setLocalAdminPassword(input: {
  user: Pick<AdminAuthUser, 'email' | 'fullName'> & Partial<AdminAuthUser>;
  password: string;
}) {
  const email = normalizeEmail(input.user.email);
  const credential = createPasswordCredential(input.password);
  const user = toAuthUser(input.user.id && input.user.role && input.user.status
    ? input.user as AdminAuthUserLike
    : null);

  LOCAL_CREDENTIALS.set(email, {
    ...credential,
    userEmail: email,
    label: input.user.fullName || email,
    ...(user ? { user } : {}),
  });
}

export function getAdminSession(token: string | null | undefined): AdminSession | null {
  pruneExpiredSessions();
  if (!token) return null;

  const session = ADMIN_SESSIONS.get(token.trim());
  if (!session) return null;

  const user = toAuthUser(getAdminUserById(session.user.id)) || session.user;
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

export async function getAdminSessionWithPersistence(
  token: string | null | undefined,
  persistence: Pick<AdminAuthUserPersistence, 'getUserById'> = {},
): Promise<AdminSession | null> {
  pruneExpiredSessions();
  if (!token) return null;

  const session = ADMIN_SESSIONS.get(token.trim());
  if (!session) return null;

  const user = toAuthUser(
    persistence.getUserById
      ? await persistence.getUserById(session.user.id)
      : getAdminUserById(session.user.id),
  ) || (!persistence.getUserById ? session.user : null);

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

export function rotateAdminSession(token: string | null | undefined, authSettings?: AdminAuthSessionSettings): {
  session: AdminSession;
  previousSessionId: string;
  newSessionId: string;
} | null {
  pruneExpiredSessions();
  if (!token) return null;

  const normalizedToken = token.trim();
  const current = ADMIN_SESSIONS.get(normalizedToken);
  if (!current) return null;

  const user = toAuthUser(getAdminUserById(current.user.id)) || current.user;
  if (!user || user.status !== 'active') {
    ADMIN_SESSIONS.delete(normalizedToken);
    return null;
  }

  const previousSessionId = current.token.slice(-12);
  const next = createAdminSessionForUser(user, authSettings, { authMode: current.authMode });
  ADMIN_SESSIONS.delete(normalizedToken);

  return {
    session: next,
    previousSessionId,
    newSessionId: next.token.slice(-12),
  };
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
      const user = toAuthUser(getAdminUserById(session.user.id)) || session.user;
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

export function createAdminPasswordResetToken(input: {
  user: Pick<AdminAuthUser, 'id' | 'email'>;
  requestedById?: string | null;
  origin?: string;
  expiresInMinutes?: number;
  persistInMemory?: boolean;
}): AdminPasswordResetToken {
  const createdAt = new Date();
  const expiresInMinutes = Number.isFinite(input.expiresInMinutes)
    ? Math.min(Math.max(input.expiresInMinutes || 60, 5), 1440)
    : 60;
  const expiresAt = new Date(createdAt.getTime() + expiresInMinutes * 60 * 1000);
  const token = `bpr_${randomUUID().replace(/-/g, '')}`;
  const origin = input.origin?.replace(/\/$/, '') || '';
  const resetToken: AdminPasswordResetToken = {
    id: `reset_${token.slice(-12)}`,
    token,
    userId: input.user.id,
    email: input.user.email,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    requestedById: input.requestedById || null,
    deliveryConfigured: false,
    resetUrl: `${origin || '/admin'}/reset-password?token=${encodeURIComponent(token)}`,
  };

  if (input.persistInMemory !== false) {
    PASSWORD_RESET_TOKENS.set(token, resetToken);
  }
  return resetToken;
}

export async function resetAdminPasswordToken(
  token: string | null | undefined,
  password: string,
  persistence: AdminAuthUserPersistence = {},
  authSettings?: AdminAuthSessionSettings,
): Promise<AdminPasswordResetResult> {
  pruneExpiredSessions();

  const normalizedToken = token?.trim() || '';
  const resetToken = normalizedToken
    ? PASSWORD_RESET_TOKENS.get(normalizedToken) || await persistence.getPasswordResetToken?.(normalizedToken) || null
    : null;
  if (!resetToken) {
    return { reset: false, reason: 'missing' };
  }

  if (Date.parse(resetToken.expiresAt) <= Date.now()) {
    PASSWORD_RESET_TOKENS.delete(normalizedToken);
    await persistence.consumePasswordResetToken?.(normalizedToken);
    return { reset: false, reason: 'expired', resetToken };
  }

  const currentUser = toAuthUser(
    (persistence.getUserById ? await persistence.getUserById(resetToken.userId) : null)
    || getAdminUserById(resetToken.userId),
  );
  if (!currentUser) {
    PASSWORD_RESET_TOKENS.delete(normalizedToken);
    await persistence.consumePasswordResetToken?.(normalizedToken);
    return { reset: false, reason: 'user-not-found', resetToken };
  }

  if (currentUser.email.toLowerCase() !== resetToken.email.toLowerCase()) {
    return { reset: false, reason: 'email-mismatch', resetToken };
  }

  if (currentUser.status === 'inactive' || currentUser.status === 'suspended') {
    return { reset: false, reason: 'inactive', resetToken };
  }

  const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(currentUser.status, 'active');
  if (!inviteOnlyPolicy.ok) {
    return { reset: false, reason: 'invite-only', resetToken };
  }

  const previousStatus = currentUser.status;
  const updated = persistence.updateUser
    ? await persistence.updateUser(currentUser.id, {
      status: currentUser.status === 'invited' ? 'active' : currentUser.status,
    })
    : updateAdminUser(currentUser.id, {
      status: currentUser.status === 'invited' ? 'active' : currentUser.status,
    });
  const user = toAuthUser(updated);
  if (!user) {
    return { reset: false, reason: 'user-not-found', resetToken };
  }

  const credential = createPasswordCredential(password);
  if (persistence.setPasswordCredential) {
    await persistence.setPasswordCredential(user.id, credential);
  } else {
    setLocalAdminPassword({ user, password });
  }
  PASSWORD_RESET_TOKENS.delete(normalizedToken);
  await persistence.consumePasswordResetToken?.(normalizedToken);
  const session = createAdminSessionForUser(user, authSettings);

  return {
    reset: true,
    resetToken,
    user,
    session,
    previousStatus,
  };
}

export function createAdminInviteToken(input: {
  user: Pick<AdminAuthUser, 'id' | 'email'>;
  requestedById?: string | null;
  origin?: string;
  expiresInMinutes?: number;
  persistInMemory?: boolean;
}): AdminInviteToken {
  const createdAt = new Date();
  const expiresInMinutes = Number.isFinite(input.expiresInMinutes)
    ? Math.min(Math.max(input.expiresInMinutes || 10080, 30), 43200)
    : 10080;
  const expiresAt = new Date(createdAt.getTime() + expiresInMinutes * 60 * 1000);
  const token = `bit_${randomUUID().replace(/-/g, '')}`;
  const origin = input.origin?.replace(/\/$/, '') || '';
  const inviteToken: AdminInviteToken = {
    id: `invite_${token.slice(-12)}`,
    token,
    userId: input.user.id,
    email: input.user.email,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    requestedById: input.requestedById || null,
    deliveryConfigured: false,
    inviteUrl: `${origin || '/admin'}/accept-invite?token=${encodeURIComponent(token)}`,
  };

  if (input.persistInMemory !== false) {
    INVITE_TOKENS.set(token, inviteToken);
  }
  return inviteToken;
}

export async function acceptAdminInviteToken(
  token: string | null | undefined,
  persistence: AdminAuthUserPersistence = {},
  authSettings?: AdminAuthSessionSettings,
): Promise<AdminInviteAcceptResult> {
  pruneExpiredSessions();

  const normalizedToken = token?.trim() || '';
  const invite = normalizedToken
    ? INVITE_TOKENS.get(normalizedToken) || await persistence.getInviteToken?.(normalizedToken) || null
    : null;
  if (!invite) {
    return { accepted: false, reason: 'missing' };
  }

  if (Date.parse(invite.expiresAt) <= Date.now()) {
    INVITE_TOKENS.delete(normalizedToken);
    await persistence.consumeInviteToken?.(normalizedToken);
    return { accepted: false, reason: 'expired', invite };
  }

  const currentUser = toAuthUser(
    (persistence.getUserById ? await persistence.getUserById(invite.userId) : null)
    || getAdminUserById(invite.userId),
  );
  if (!currentUser) {
    INVITE_TOKENS.delete(normalizedToken);
    await persistence.consumeInviteToken?.(normalizedToken);
    return { accepted: false, reason: 'user-not-found', invite };
  }

  if (currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { accepted: false, reason: 'email-mismatch', invite };
  }

  if (currentUser.status !== 'invited') {
    return { accepted: false, reason: 'not-invited', invite };
  }

  const previousStatus = currentUser.status;
  const updated = persistence.updateUser
    ? await persistence.updateUser(currentUser.id, { status: 'active' })
    : updateAdminUser(currentUser.id, { status: 'active' });
  const user = toAuthUser(updated);
  if (!user) {
    return { accepted: false, reason: 'user-not-found', invite };
  }

  INVITE_TOKENS.delete(normalizedToken);
  await persistence.consumeInviteToken?.(normalizedToken);
  const session = createAdminSessionForUser(user, authSettings);
  return {
    accepted: true,
    invite,
    user,
    session,
    previousStatus,
  };
}
