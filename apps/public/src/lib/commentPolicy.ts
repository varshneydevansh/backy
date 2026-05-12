import type { SiteCommentPolicy } from '@backy-cms/core';

export interface ResolvedCommentPolicy {
  enabled: boolean;
  moderationMode: 'manual' | 'auto-approve';
  allowGuests: boolean;
  requireName: boolean;
  requireEmail: boolean;
  allowReplies: boolean;
  enableReports: boolean;
  enableCaptcha: boolean;
  captchaProvider: 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock';
  captchaSiteKey: string;
  blockedTerms: string[];
  closedMessage: string;
  sort: 'newest' | 'oldest';
}

const parseBoolean = (raw: unknown): boolean | undefined => {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  }
  return undefined;
};

const parseModerationMode = (raw: unknown): 'manual' | 'auto-approve' | undefined => (
  raw === 'auto-approve' ? 'auto-approve' : raw === 'manual' ? 'manual' : undefined
);

const parseCaptchaProvider = (raw: unknown): 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock' | undefined => (
  raw === 'turnstile' || raw === 'hcaptcha' || raw === 'recaptcha' || raw === 'mock' ? raw : undefined
);

const parseString = (raw: unknown): string => (
  typeof raw === 'string' ? raw.trim() : ''
);

const parseBlockedTerms = (raw: unknown): string[] => (
  Array.isArray(raw)
    ? raw.map(parseString).filter(Boolean).slice(0, 100)
    : []
);

export const normalizeSiteCommentPolicy = (raw: unknown): ResolvedCommentPolicy => {
  const policy = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as SiteCommentPolicy
    : {};
  const moderationMode = parseModerationMode(policy.moderationMode);
  const sort = policy.sort === 'oldest' ? 'oldest' : 'newest';

  return {
    enabled: policy.enabled !== false,
    moderationMode: moderationMode || 'manual',
    allowGuests: policy.allowGuests !== false,
    requireName: policy.requireName !== false,
    requireEmail: policy.requireEmail === true,
    allowReplies: policy.allowReplies !== false,
    enableReports: policy.enableReports !== false,
    enableCaptcha: policy.enableCaptcha === true,
    captchaProvider: parseCaptchaProvider(policy.captchaProvider) || 'mock',
    captchaSiteKey: parseString(policy.captchaSiteKey),
    blockedTerms: parseBlockedTerms(policy.blockedTerms),
    closedMessage: parseString(policy.closedMessage) || 'Comments are closed for this site.',
    sort,
  };
};

export const resolveCommentSubmissionPolicy = (
  rawPolicy: unknown,
  body: Record<string, unknown>,
): ResolvedCommentPolicy => {
  const policy = normalizeSiteCommentPolicy(rawPolicy);
  const moderationOverride = parseModerationMode(
    body.commentModerationMode ?? body.moderationMode ?? body.mode,
  );
  const allowGuestsOverride = parseBoolean(body.commentAllowGuests);
  const allowRepliesOverride = parseBoolean(body.commentAllowReplies);
  const requireNameOverride = parseBoolean(body.commentRequireName);
  const requireEmailOverride = parseBoolean(body.commentRequireEmail);
  const enableCaptchaOverride = parseBoolean(body.commentEnableCaptcha);

  return {
    ...policy,
    moderationMode: moderationOverride || policy.moderationMode,
    allowGuests: policy.allowGuests && allowGuestsOverride !== false,
    allowReplies: policy.allowReplies && allowRepliesOverride !== false,
    requireName: policy.requireName || requireNameOverride === true,
    requireEmail: policy.requireEmail || requireEmailOverride === true,
    enableCaptcha: policy.enableCaptcha || enableCaptchaOverride === true,
  };
};
