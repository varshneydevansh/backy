import { createHash } from 'node:crypto';
import type { BackyJsonObject } from '@backy-cms/core';
import type { AdminInviteToken, AdminPasswordResetToken } from '@/lib/admin-auth/sessionStore';

type PersistedResetToken = Omit<AdminPasswordResetToken, 'token'> & {
  tokenHash: string;
};

type PersistedInviteToken = Omit<AdminInviteToken, 'token'> & {
  tokenHash: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const pruneUnexpired = <TToken extends { expiresAt: string }>(tokens: TToken[]) => {
  const now = Date.now();
  return tokens.filter((token) => Date.parse(token.expiresAt) > now);
};

const toResetToken = (value: unknown): PersistedResetToken | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.tokenHash !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    tokenHash: value.tokenHash,
    userId: value.userId,
    email: value.email,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    requestedById: typeof value.requestedById === 'string' ? value.requestedById : null,
    deliveryConfigured: false,
    resetUrl: typeof value.resetUrl === 'string' ? value.resetUrl : '',
  };
};

const toInviteToken = (value: unknown): PersistedInviteToken | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.tokenHash !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    tokenHash: value.tokenHash,
    userId: value.userId,
    email: value.email,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    requestedById: typeof value.requestedById === 'string' ? value.requestedById : null,
    deliveryConfigured: false,
    inviteUrl: typeof value.inviteUrl === 'string' ? value.inviteUrl : '',
  };
};

export const getPersistedPasswordResetToken = (
  authSettings: unknown,
  token: string,
): AdminPasswordResetToken | null => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const tokenHash = hashToken(token);
  const match = (Array.isArray(settings.passwordResetTokens) ? settings.passwordResetTokens : [])
    .map(toResetToken)
    .find((candidate): candidate is PersistedResetToken => Boolean(candidate && candidate.tokenHash === tokenHash));

  return match
    ? {
        ...match,
        token,
      }
    : null;
};

export const getPersistedInviteToken = (
  authSettings: unknown,
  token: string,
): AdminInviteToken | null => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const tokenHash = hashToken(token);
  const match = (Array.isArray(settings.inviteTokens) ? settings.inviteTokens : [])
    .map(toInviteToken)
    .find((candidate): candidate is PersistedInviteToken => Boolean(candidate && candidate.tokenHash === tokenHash));

  return match
    ? {
        ...match,
        token,
      }
    : null;
};

export const addPersistedPasswordResetToken = (
  authSettings: unknown,
  token: AdminPasswordResetToken,
): BackyJsonObject => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const { token: rawToken, ...persistedToken } = token;
  const existing = pruneUnexpired((Array.isArray(settings.passwordResetTokens) ? settings.passwordResetTokens : [])
    .map(toResetToken)
    .filter((candidate): candidate is PersistedResetToken => Boolean(candidate)))
    .filter((candidate) => candidate.id !== token.id && candidate.tokenHash !== hashToken(rawToken));

  return {
    ...settings,
    passwordResetTokens: [
      ...existing,
      {
        ...persistedToken,
        resetUrl: '',
        tokenHash: hashToken(rawToken),
      },
    ],
  } as BackyJsonObject;
};

export const addPersistedInviteToken = (
  authSettings: unknown,
  token: AdminInviteToken,
): BackyJsonObject => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const { token: rawToken, ...persistedToken } = token;
  const existing = pruneUnexpired((Array.isArray(settings.inviteTokens) ? settings.inviteTokens : [])
    .map(toInviteToken)
    .filter((candidate): candidate is PersistedInviteToken => Boolean(candidate)))
    .filter((candidate) => candidate.id !== token.id && candidate.tokenHash !== hashToken(rawToken));

  return {
    ...settings,
    inviteTokens: [
      ...existing,
      {
        ...persistedToken,
        inviteUrl: '',
        tokenHash: hashToken(rawToken),
      },
    ],
  } as BackyJsonObject;
};

export const removePersistedPasswordResetToken = (
  authSettings: unknown,
  token: string,
): BackyJsonObject => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const tokenHash = hashToken(token);
  return {
    ...settings,
    passwordResetTokens: pruneUnexpired((Array.isArray(settings.passwordResetTokens) ? settings.passwordResetTokens : [])
      .map(toResetToken)
      .filter((candidate): candidate is PersistedResetToken => Boolean(candidate)))
      .filter((candidate) => candidate.tokenHash !== tokenHash),
  } as BackyJsonObject;
};

export const removePersistedInviteToken = (
  authSettings: unknown,
  token: string,
): BackyJsonObject => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const tokenHash = hashToken(token);
  return {
    ...settings,
    inviteTokens: pruneUnexpired((Array.isArray(settings.inviteTokens) ? settings.inviteTokens : [])
      .map(toInviteToken)
      .filter((candidate): candidate is PersistedInviteToken => Boolean(candidate)))
      .filter((candidate) => candidate.tokenHash !== tokenHash),
  } as BackyJsonObject;
};
