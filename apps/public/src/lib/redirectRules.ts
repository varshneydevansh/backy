import type { SiteSettings } from '@backy-cms/core';

export type RedirectStatusCode = 301 | 302 | 307 | 308 | 410;

export interface NormalizedRedirectRule {
  id?: string;
  from: string;
  to?: string;
  statusCode: RedirectStatusCode;
  enabled: boolean;
}

export type ResolvedRedirectRoute =
  | {
      type: 'redirect';
      path: string;
      status: 'published';
      canonical: string;
      params: Record<string, string>;
      resource: {
        id: string;
        kind: 'redirect';
        from: string;
        to: string;
        statusCode: 301 | 302 | 307 | 308;
      };
    }
  | {
      type: 'gone';
      path: string;
      status: 'archived';
      canonical: string;
      params: Record<string, string>;
      resource: {
        id: string;
        kind: 'gone';
        from: string;
        statusCode: 410;
      };
    };

const REDIRECT_STATUS_CODES = new Set<RedirectStatusCode>([301, 302, 307, 308, 410]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeRoutePath = (rawPath: string | null | undefined): string => {
  const pathOnly = (rawPath || '/').split('?')[0].split('#')[0].trim();
  const normalized = pathOnly.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
};

export function normalizeRedirectRules(value: unknown): NormalizedRedirectRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((rule, index) => {
      const rawStatusCode = Number(rule.statusCode);
      const permanent = rule.permanent === true;
      const statusCode = REDIRECT_STATUS_CODES.has(rawStatusCode as RedirectStatusCode)
        ? rawStatusCode as RedirectStatusCode
        : permanent
          ? 301
          : 302;

      return {
        id: normalizeText(rule.id) || `redirect_${index}`,
        from: normalizeRoutePath(typeof rule.from === 'string' ? rule.from : '/'),
        to: normalizeText(rule.to) || normalizeText(rule.destination),
        statusCode,
        enabled: rule.enabled !== false,
      };
    })
    .filter((rule) => rule.from.length > 0 && (rule.statusCode === 410 || !!rule.to));
}

export function resolveRedirectRoute(
  settings: Pick<SiteSettings, 'redirectRules'> | undefined | null,
  rawPath: string,
): ResolvedRedirectRoute | null {
  const path = normalizeRoutePath(rawPath);
  const rule = normalizeRedirectRules(settings?.redirectRules).find((candidate) => (
    candidate.enabled && candidate.from === path
  ));

  if (!rule) {
    return null;
  }

  if (rule.statusCode === 410) {
    return {
      type: 'gone',
      path,
      status: 'archived',
      canonical: path,
      params: {},
      resource: {
        id: rule.id || `gone_${path.replace(/[^a-z0-9]+/gi, '_')}`,
        kind: 'gone',
        from: rule.from,
        statusCode: 410,
      },
    };
  }

  const to = rule.to || '/';
  return {
    type: 'redirect',
    path,
    status: 'published',
    canonical: to,
    params: {},
    resource: {
      id: rule.id || `redirect_${path.replace(/[^a-z0-9]+/gi, '_')}`,
      kind: 'redirect',
      from: rule.from,
      to,
      statusCode: rule.statusCode,
    },
  };
}
