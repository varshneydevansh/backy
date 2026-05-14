export type CommerceWebhookSecretResolution = {
  reference: string;
  secret: string;
  source: 'none' | 'env' | 'development-direct' | 'unresolved';
  envKeys: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const envKeySafe = (value: string): string => (
  value.trim().replace(/^env:/i, '').replace(/^\$/, '')
);

const normalizedSecretKeySegment = (value: string): string => (
  envKeySafe(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

const envKeyCandidates = (reference: string): string[] => {
  const explicit = envKeySafe(reference);
  const normalized = normalizedSecretKeySegment(reference);
  const candidates = reference.startsWith('env:') || reference.startsWith('$')
    ? [explicit]
    : [
        `BACKY_COMMERCE_WEBHOOK_SECRET_${normalized}`,
        `BACKY_WEBHOOK_SECRET_${normalized}`,
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(explicit) ? explicit : '',
      ];

  return [...new Set(candidates.filter(Boolean))];
};

export const commerceWebhookSecretReference = (settings: unknown): string => {
  if (!isRecord(settings)) return '';
  const integrations = isRecord(settings.integrations) ? settings.integrations : {};
  const commerce = isRecord(integrations.commerce) ? integrations.commerce : {};
  return textValue(commerce.providerWebhookSecretId);
};

export const resolveCommerceWebhookSecret = (
  settings: unknown,
  env: Record<string, string | undefined> = process.env,
): CommerceWebhookSecretResolution => {
  const reference = commerceWebhookSecretReference(settings);
  if (!reference) {
    return { reference: '', secret: '', source: 'none', envKeys: [] };
  }

  const envKeys = envKeyCandidates(reference);
  for (const key of envKeys) {
    const secret = env[key]?.trim();
    if (secret) {
      return { reference, secret, source: 'env', envKeys };
    }
  }

  if (env.NODE_ENV !== 'production') {
    return { reference, secret: reference, source: 'development-direct', envKeys };
  }

  return { reference, secret: '', source: 'unresolved', envKeys };
};
