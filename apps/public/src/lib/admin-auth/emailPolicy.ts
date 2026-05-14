import { getAdminSettings } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeDomain = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^@+/, '')
  .replace(/\.+$/, '');

const normalizeEmailDomain = (email: string) => {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return '';
  }

  return normalizeDomain(normalized.slice(atIndex + 1));
};

const parseAllowedDomains = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeDomain)
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\s,;]+/)
    .map(normalizeDomain)
    .filter(Boolean);
};

export const getAllowedAdminEmailDomains = () => {
  const settings = getAdminSettings();
  return Array.from(new Set(parseAllowedDomains(settings.auth?.allowedEmailDomains)));
};

export const getAdminAuthPolicySettings = async () => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const settings = await repositories.settings.get();
    return isRecord(settings.auth) ? settings.auth : {};
  }

  const settings = getAdminSettings();
  return isRecord(settings.auth) ? settings.auth : {};
};

export const validateAdminEmailDomainPolicy = async (
  email: string,
  authSettings?: Record<string, unknown>,
) => {
  const settings = authSettings ?? await getAdminAuthPolicySettings();
  const allowedDomains = Array.from(new Set(parseAllowedDomains(settings.allowedEmailDomains)));
  if (allowedDomains.length === 0) {
    return {
      ok: true as const,
      allowedDomains,
      domain: normalizeEmailDomain(email),
    };
  }

  const domain = normalizeEmailDomain(email);
  if (domain && allowedDomains.includes(domain)) {
    return {
      ok: true as const,
      allowedDomains,
      domain,
    };
  }

  return {
    ok: false as const,
    allowedDomains,
    domain,
    message: `Email domain must be one of: ${allowedDomains.join(', ')}.`,
  };
};

const inviteOnlyMessage = 'Invite-only workspace access requires new users to start as invited.';

export const validateAdminInviteOnlyCreatePolicy = async (
  status: string,
  authSettings?: Record<string, unknown>,
) => {
  const settings = authSettings ?? await getAdminAuthPolicySettings();
  if (settings.inviteOnly !== true || status === 'invited') {
    return {
      ok: true as const,
      inviteOnly: settings.inviteOnly === true,
    };
  }

  return {
    ok: false as const,
    inviteOnly: true,
    message: inviteOnlyMessage,
  };
};

export const validateAdminInviteOnlyActivationPolicy = async (
  currentStatus: string,
  nextStatus: string,
  authSettings?: Record<string, unknown>,
) => {
  const settings = authSettings ?? await getAdminAuthPolicySettings();
  if (settings.inviteOnly !== true || nextStatus !== 'active' || currentStatus === 'active') {
    return {
      ok: true as const,
      inviteOnly: settings.inviteOnly === true,
    };
  }

  return {
    ok: false as const,
    inviteOnly: true,
    message: 'Invite-only workspace access requires users to accept an invitation before becoming active.',
  };
};
