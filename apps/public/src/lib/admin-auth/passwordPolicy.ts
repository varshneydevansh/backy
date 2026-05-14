import { getAdminAuthPolicySettings } from '@/lib/admin-auth/emailPolicy';

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

export const getAdminPasswordPolicyFromAuthSettings = (settings: Record<string, unknown> = {}) => {
  return {
    minPasswordLength: normalizeMinPasswordLength(settings.minPasswordLength),
  };
};

export const getAdminPasswordPolicy = async (authSettings?: Record<string, unknown>) => {
  const settings = authSettings ?? await getAdminAuthPolicySettings();
  return getAdminPasswordPolicyFromAuthSettings(settings);
};

export const validateAdminPasswordPolicy = async (
  password: string,
  authSettings?: Record<string, unknown>,
) => {
  const policy = await getAdminPasswordPolicy(authSettings);

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
