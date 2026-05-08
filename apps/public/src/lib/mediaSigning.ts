import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignedMediaDisposition = 'inline' | 'attachment';

const DEFAULT_EXPIRES_IN_SECONDS = 300;
const MAX_EXPIRES_IN_SECONDS = 60 * 60;

const signingSecret = () => (
  process.env.BACKY_MEDIA_SIGNING_SECRET?.trim() ||
  process.env.BACKY_ADMIN_SECRET_KEY?.trim() ||
  process.env.BACKY_ADMIN_API_KEY?.trim() ||
  'backy-dev-media-signing-secret'
);

const normalizedDisposition = (value: unknown): SignedMediaDisposition => (
  value === 'attachment' ? 'attachment' : 'inline'
);

const normalizeExpiresIn = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_EXPIRES_IN_SECONDS;
  }

  return Math.max(30, Math.min(MAX_EXPIRES_IN_SECONDS, Math.floor(parsed)));
};

const signedMediaPayload = (
  siteId: string,
  mediaId: string,
  expiresAt: number,
  disposition: SignedMediaDisposition,
) => `${siteId}:${mediaId}:${expiresAt}:${disposition}`;

const signPayload = (payload: string) => (
  createHmac('sha256', signingSecret())
    .update(payload)
    .digest('base64url')
);

export const createSignedMediaAccess = (input: {
  siteId: string;
  mediaId: string;
  expiresInSeconds?: unknown;
  disposition?: unknown;
}) => {
  const disposition = normalizedDisposition(input.disposition);
  const expiresAt = Math.floor(Date.now() / 1000) + normalizeExpiresIn(input.expiresInSeconds);
  const payload = signedMediaPayload(input.siteId, input.mediaId, expiresAt, disposition);

  return {
    expiresAt,
    disposition,
    token: signPayload(payload),
  };
};

export const verifySignedMediaAccess = (input: {
  siteId: string;
  mediaId: string;
  expiresAt: unknown;
  disposition: unknown;
  token: unknown;
}) => {
  const expiresAt = Number(input.expiresAt);
  const token = typeof input.token === 'string' ? input.token : '';
  const disposition = normalizedDisposition(input.disposition);

  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !token) {
    return false;
  }

  const expected = signPayload(signedMediaPayload(input.siteId, input.mediaId, expiresAt, disposition));
  const expectedBytes = Buffer.from(expected);
  const tokenBytes = Buffer.from(token);

  return expectedBytes.length === tokenBytes.length && timingSafeEqual(expectedBytes, tokenBytes);
};

export const buildSignedMediaPath = (input: {
  siteId: string;
  mediaId: string;
  token: string;
  expiresAt: number;
  disposition: SignedMediaDisposition;
}) => {
  const searchParams = new URLSearchParams({
    token: input.token,
    expiresAt: String(input.expiresAt),
    disposition: input.disposition,
  });

  return `/api/sites/${encodeURIComponent(input.siteId)}/media/${encodeURIComponent(input.mediaId)}/file?${searchParams.toString()}`;
};
