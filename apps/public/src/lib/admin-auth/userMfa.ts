import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BackyJsonObject, BackyJsonValue } from '@backy-cms/core';

type JsonRecord = BackyJsonObject;

const USER_MFA_ENROLLMENTS_KEY = 'userMfaEnrollments';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 5;

export type UserMfaEnrollmentSummary = {
  userId: string;
  email: string;
  enabled: boolean;
  method: 'recovery-code';
  recoveryCodesRemaining: number;
  recoveryCodesIssuedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  disabledAt: string | null;
};

type UserMfaEnrollmentRecord = UserMfaEnrollmentSummary & {
  recoveryCodeHashes: string[];
};

export type UserMfaUpdateResult = {
  auth: JsonRecord;
  enrollment: UserMfaEnrollmentSummary;
  recoveryCodes: string[];
};

export type UserMfaVerificationResult = {
  ok: boolean;
  auth: JsonRecord;
  enrollment: UserMfaEnrollmentSummary | null;
  recoveryCodesRemaining: number;
};

const isRecord = (value: unknown): value is JsonRecord => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const asAuthObject = (auth: unknown): BackyJsonObject => (
  isRecord(auth) ? { ...auth } as BackyJsonObject : {}
);

const normalizeRecoveryCode = (value: unknown): string => (
  typeof value === 'string' ? value.replace(/\s+/g, '').trim().toLowerCase() : ''
);

const hashRecoveryCode = (code: string): string => (
  createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
);

const timingSafeStringEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const generateRecoveryCode = () => `mfa_${randomBytes(RECOVERY_CODE_BYTES).toString('hex')}`;

const normalizeEnrollment = (value: unknown, userId: string, fallbackEmail = ''): UserMfaEnrollmentRecord | null => {
  if (!isRecord(value)) return null;

  const recoveryCodeHashes = Array.isArray(value.recoveryCodeHashes)
    ? value.recoveryCodeHashes.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString();

  return {
    userId,
    email: typeof value.email === 'string' ? value.email : fallbackEmail,
    enabled: value.enabled === true,
    method: 'recovery-code',
    recoveryCodeHashes,
    recoveryCodesRemaining: recoveryCodeHashes.length,
    recoveryCodesIssuedAt: typeof value.recoveryCodesIssuedAt === 'string' ? value.recoveryCodesIssuedAt : null,
    updatedAt,
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : null,
    disabledAt: typeof value.disabledAt === 'string' ? value.disabledAt : null,
  };
};

const toSummary = (enrollment: UserMfaEnrollmentRecord): UserMfaEnrollmentSummary => ({
  userId: enrollment.userId,
  email: enrollment.email,
  enabled: enrollment.enabled,
  method: enrollment.method,
  recoveryCodesRemaining: enrollment.recoveryCodeHashes.length,
  recoveryCodesIssuedAt: enrollment.recoveryCodesIssuedAt,
  updatedAt: enrollment.updatedAt,
  updatedBy: enrollment.updatedBy,
  disabledAt: enrollment.disabledAt,
});

const getEnrollmentMap = (auth: unknown): Record<string, unknown> => {
  const authObject = asAuthObject(auth);
  const rawMap = authObject[USER_MFA_ENROLLMENTS_KEY];
  return isRecord(rawMap) ? { ...rawMap } : {};
};

const setEnrollmentRecord = (
  auth: unknown,
  userId: string,
  enrollment: UserMfaEnrollmentRecord,
): BackyJsonObject => {
  const authObject = asAuthObject(auth);
  const map = getEnrollmentMap(authObject);
  map[userId] = enrollment as unknown as BackyJsonValue;
  return {
    ...authObject,
    [USER_MFA_ENROLLMENTS_KEY]: map as BackyJsonObject,
  };
};

export const getUserMfaEnrollment = (
  auth: unknown,
  userId: string,
  fallbackEmail = '',
): UserMfaEnrollmentSummary => {
  const map = getEnrollmentMap(auth);
  const enrollment = normalizeEnrollment(map[userId], userId, fallbackEmail);
  return toSummary(enrollment || {
    userId,
    email: fallbackEmail,
    enabled: false,
    method: 'recovery-code',
    recoveryCodeHashes: [],
    recoveryCodesRemaining: 0,
    recoveryCodesIssuedAt: null,
    updatedAt: '',
    updatedBy: null,
    disabledAt: null,
  });
};

export const isUserMfaRequired = (auth: unknown, userId: string): boolean => {
  if (asAuthObject(auth).requireTwoFactor === true) {
    return true;
  }

  const map = getEnrollmentMap(auth);
  return normalizeEnrollment(map[userId], userId)?.enabled === true;
};

export const hasUserMfaRecoveryCodes = (auth: unknown, userId: string): boolean => {
  const map = getEnrollmentMap(auth);
  const enrollment = normalizeEnrollment(map[userId], userId);
  return Boolean(enrollment?.enabled && enrollment.recoveryCodeHashes.length > 0);
};

export const updateUserMfaEnrollment = (input: {
  auth: unknown;
  user: { id: string; email: string };
  enabled?: boolean;
  generateRecoveryCodes?: boolean;
  actorId?: string | null;
  now?: string;
}): UserMfaUpdateResult => {
  const now = input.now || new Date().toISOString();
  const map = getEnrollmentMap(input.auth);
  const current = normalizeEnrollment(map[input.user.id], input.user.id, input.user.email);
  const nextEnabled = input.enabled ?? current?.enabled ?? false;
  const recoveryCodes = input.generateRecoveryCodes
    ? Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
    : [];
  const recoveryCodeHashes = recoveryCodes.length > 0
    ? recoveryCodes.map(hashRecoveryCode)
    : current?.recoveryCodeHashes || [];
  const enrollment: UserMfaEnrollmentRecord = {
    userId: input.user.id,
    email: input.user.email,
    enabled: nextEnabled,
    method: 'recovery-code',
    recoveryCodeHashes: nextEnabled ? recoveryCodeHashes : [],
    recoveryCodesRemaining: nextEnabled ? recoveryCodeHashes.length : 0,
    recoveryCodesIssuedAt: nextEnabled
      ? recoveryCodes.length > 0 ? now : current?.recoveryCodesIssuedAt || null
      : null,
    updatedAt: now,
    updatedBy: input.actorId || null,
    disabledAt: nextEnabled ? null : now,
  };

  return {
    auth: setEnrollmentRecord(input.auth, input.user.id, enrollment),
    enrollment: toSummary(enrollment),
    recoveryCodes,
  };
};

export const verifyUserMfaRecoveryCode = (input: {
  auth: unknown;
  userId: string;
  code: unknown;
}): UserMfaVerificationResult => {
  const code = normalizeRecoveryCode(input.code);
  const map = getEnrollmentMap(input.auth);
  const enrollment = normalizeEnrollment(map[input.userId], input.userId);
  if (!code || !enrollment?.enabled || enrollment.recoveryCodeHashes.length === 0) {
    return {
      ok: false,
      auth: asAuthObject(input.auth),
      enrollment: enrollment ? toSummary(enrollment) : null,
      recoveryCodesRemaining: enrollment?.recoveryCodeHashes.length || 0,
    };
  }

  const codeHash = hashRecoveryCode(code);
  const matchIndex = enrollment.recoveryCodeHashes.findIndex((hash) => timingSafeStringEqual(hash, codeHash));
  if (matchIndex === -1) {
    return {
      ok: false,
      auth: asAuthObject(input.auth),
      enrollment: toSummary(enrollment),
      recoveryCodesRemaining: enrollment.recoveryCodeHashes.length,
    };
  }

  const nextHashes = enrollment.recoveryCodeHashes.filter((_, index) => index !== matchIndex);
  const nextEnrollment: UserMfaEnrollmentRecord = {
    ...enrollment,
    recoveryCodeHashes: nextHashes,
    recoveryCodesRemaining: nextHashes.length,
    updatedAt: new Date().toISOString(),
  };

  return {
    ok: true,
    auth: setEnrollmentRecord(input.auth, input.userId, nextEnrollment),
    enrollment: toSummary(nextEnrollment),
    recoveryCodesRemaining: nextHashes.length,
  };
};
