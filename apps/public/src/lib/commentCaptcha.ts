import type { ResolvedCommentPolicy } from '@/lib/commentPolicy';
import { verifyFormCaptcha, type FormCaptchaVerificationResult } from '@/lib/formCaptcha';

const CAPTCHA_TOKEN_FIELDS = [
  'captchaToken',
  'captchaResponse',
  'turnstileToken',
  'cf-turnstile-response',
  'hcaptchaToken',
  'h-captcha-response',
  'recaptchaToken',
  'g-recaptcha-response',
] as const;

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export const parseCommentCaptchaToken = (body: Record<string, unknown>): string => {
  for (const field of CAPTCHA_TOKEN_FIELDS) {
    const value = readString(body[field]);
    if (value) return value;
  }

  return '';
};

export async function verifyCommentCaptcha(params: {
  policy: ResolvedCommentPolicy;
  body: Record<string, unknown>;
  requestId: string;
  siteId: string;
  targetType: 'page' | 'post';
  targetId: string;
}): Promise<FormCaptchaVerificationResult | null> {
  if (!params.policy.enableCaptcha) {
    return null;
  }

  const verification = await verifyFormCaptcha({
    token: parseCommentCaptchaToken(params.body),
    provider: params.policy.captchaProvider,
    remoteIp: null,
    requestId: params.requestId,
    siteId: params.siteId,
    formId: `comment:${params.targetType}:${params.targetId}`,
  });

  return verification.ok ? null : verification;
}

export function commentCaptchaFailurePayload(verification: FormCaptchaVerificationResult, requestId: string) {
  const code = verification.errorCode || 'CAPTCHA_FAILED';
  const message = verification.message || 'Captcha verification failed.';
  const status = code === 'CAPTCHA_NOT_CONFIGURED' || code === 'CAPTCHA_UNAVAILABLE' || code === 'CAPTCHA_TIMEOUT'
    ? 503
    : 422;

  return {
    status,
    body: {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
      status: 'rejected',
      spamFlags: ['captcha'],
      captcha: {
        provider: verification.provider,
        errorCode: code,
        errorCodes: verification.errorCodes || [],
      },
      message,
    },
  };
}
