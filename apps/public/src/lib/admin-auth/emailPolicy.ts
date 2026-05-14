import { getAdminSettings } from '@/lib/backyStore';

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

export const validateAdminEmailDomainPolicy = (email: string) => {
  const allowedDomains = getAllowedAdminEmailDomains();
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
