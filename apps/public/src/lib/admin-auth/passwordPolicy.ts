import { getAdminSettings } from '@/lib/backyStore';

const DEFAULT_MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const normalizeMinPasswordLength = (value: unknown) => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : DEFAULT_MIN_PASSWORD_LENGTH;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MIN_PASSWORD_LENGTH;
  }

  return Math.min(Math.max(Math.round(parsed), MIN_PASSWORD_LENGTH), MAX_PASSWORD_LENGTH);
};

export const getAdminPasswordPolicy = () => {
  const settings = getAdminSettings();
  return {
    minPasswordLength: normalizeMinPasswordLength(settings.auth?.minPasswordLength),
  };
};

export const validateAdminPasswordPolicy = (password: string) => {
  const policy = getAdminPasswordPolicy();

  if (password.length < policy.minPasswordLength) {
    return {
      ok: false as const,
      policy,
      message: `Password must be at least ${policy.minPasswordLength} characters.`,
    };
  }

  return {
    ok: true as const,
    policy,
  };
};
