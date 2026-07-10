const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export const normalizePublicOrigin = (
  origin: string | null | undefined,
): string | null => {
  const trimmed = origin?.trim();
  if (!trimmed || trimmed === '*') return null;

  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

export const getAllowedPublicOrigins = (): Set<string> => {
  const configured = process.env.BACKY_CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map(normalizePublicOrigin)
    .filter((origin): origin is string => Boolean(origin)) ?? [];

  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS
      .map(normalizePublicOrigin)
      .filter((origin): origin is string => Boolean(origin)),
    ...configured,
  ]);
};

export const isAllowedPublicOrigin = (
  origin: string | null | undefined,
): boolean => {
  const normalized = normalizePublicOrigin(origin);
  return Boolean(normalized && getAllowedPublicOrigins().has(normalized));
};
