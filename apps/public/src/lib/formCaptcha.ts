export type FormCaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock';

export interface FormCaptchaVerificationInput {
  token?: string | null;
  remoteIp?: string | null;
  requestId?: string | null;
  siteId: string;
  formId: string;
  provider?: FormCaptchaProvider | null;
}

export interface FormCaptchaVerificationResult {
  ok: boolean;
  provider: FormCaptchaProvider | 'unconfigured';
  errorCode?: string;
  message?: string;
  statusCode?: number;
  hostname?: string | null;
  challengeTs?: string | null;
  action?: string | null;
  score?: number | null;
  errorCodes?: string[];
}

interface FormCaptchaProviderConfig {
  provider: FormCaptchaProvider | null;
  secretKey?: string;
  mockToken: string;
  timeoutMs: number;
}

const PROVIDERS = new Set<FormCaptchaProvider>(['turnstile', 'hcaptcha', 'recaptcha', 'mock']);

const readEnv = (key: string): string => process.env[key]?.trim() || '';

const readTimeout = (): number => {
  const parsed = Number.parseInt(readEnv('BACKY_FORM_CAPTCHA_TIMEOUT_MS') || '5000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
};

const readProvider = (override?: FormCaptchaProvider | null): FormCaptchaProvider | null => {
  if (override && PROVIDERS.has(override)) {
    return override;
  }

  const raw = (readEnv('BACKY_FORM_CAPTCHA_PROVIDER') || readEnv('BACKY_CAPTCHA_PROVIDER')).toLowerCase();
  if (PROVIDERS.has(raw as FormCaptchaProvider)) {
    return raw as FormCaptchaProvider;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'mock';
  }

  return null;
};

const readProviderSecret = (provider: FormCaptchaProvider | null): string => {
  if (!provider || provider === 'mock') {
    return '';
  }

  const providerSecretKey = provider === 'turnstile'
    ? 'BACKY_TURNSTILE_SECRET_KEY'
    : provider === 'hcaptcha'
      ? 'BACKY_HCAPTCHA_SECRET_KEY'
      : 'BACKY_RECAPTCHA_SECRET_KEY';

  return readEnv(providerSecretKey) || readEnv('BACKY_FORM_CAPTCHA_SECRET_KEY') || readEnv('BACKY_CAPTCHA_SECRET_KEY');
};

const getCaptchaConfig = (override?: FormCaptchaProvider | null): FormCaptchaProviderConfig => {
  const provider = readProvider(override);
  return {
    provider,
    secretKey: readProviderSecret(provider),
    mockToken: readEnv('BACKY_FORM_CAPTCHA_MOCK_TOKEN') || 'backy-captcha-pass',
    timeoutMs: readTimeout(),
  };
};

const verificationUrlForProvider = (provider: FormCaptchaProvider): string | null => {
  if (provider === 'turnstile') {
    return 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  }
  if (provider === 'hcaptcha') {
    return 'https://hcaptcha.com/siteverify';
  }
  if (provider === 'recaptcha') {
    return 'https://www.google.com/recaptcha/api/siteverify';
  }
  return null;
};

const readStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

const readString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const readNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

export async function verifyFormCaptcha(input: FormCaptchaVerificationInput): Promise<FormCaptchaVerificationResult> {
  const token = input.token?.trim();
  const config = getCaptchaConfig(input.provider);

  if (!token) {
    return {
      ok: false,
      provider: config.provider || 'unconfigured',
      errorCode: 'CAPTCHA_REQUIRED',
      message: 'Captcha verification token is required.',
    };
  }

  if (!config.provider) {
    return {
      ok: false,
      provider: 'unconfigured',
      errorCode: 'CAPTCHA_NOT_CONFIGURED',
      message: 'Captcha provider is not configured.',
    };
  }

  if (config.provider === 'mock') {
    return token === config.mockToken
      ? { ok: true, provider: 'mock' }
      : {
          ok: false,
          provider: 'mock',
          errorCode: 'CAPTCHA_FAILED',
          message: 'Captcha verification failed.',
          errorCodes: ['invalid-mock-token'],
        };
  }

  if (!config.secretKey) {
    return {
      ok: false,
      provider: config.provider,
      errorCode: 'CAPTCHA_NOT_CONFIGURED',
      message: 'Captcha provider secret is not configured.',
    };
  }

  const verificationUrl = verificationUrlForProvider(config.provider);
  if (!verificationUrl) {
    return {
      ok: false,
      provider: config.provider,
      errorCode: 'CAPTCHA_NOT_CONFIGURED',
      message: 'Captcha provider is not supported.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const body = new URLSearchParams({
      secret: config.secretKey,
      response: token,
    });
    if (input.remoteIp) {
      body.set('remoteip', input.remoteIp);
    }

    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const success = payload.success === true;

    return {
      ok: success,
      provider: config.provider,
      statusCode: response.status,
      errorCode: success ? undefined : 'CAPTCHA_FAILED',
      message: success ? undefined : 'Captcha verification failed.',
      hostname: readString(payload.hostname),
      challengeTs: readString(payload.challenge_ts),
      action: readString(payload.action),
      score: readNumber(payload.score),
      errorCodes: readStringArray(payload['error-codes']),
    };
  } catch (error) {
    return {
      ok: false,
      provider: config.provider,
      errorCode: error instanceof Error && error.name === 'AbortError'
        ? 'CAPTCHA_TIMEOUT'
        : 'CAPTCHA_UNAVAILABLE',
      message: error instanceof Error && error.name === 'AbortError'
        ? 'Captcha verification timed out.'
        : 'Captcha verification is unavailable.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
