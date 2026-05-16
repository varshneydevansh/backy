import { createHmac, timingSafeEqual } from 'node:crypto';

const STATIC_CODE_KEYS = [
  'BACKY_ADMIN_MFA_CODE',
  'BACKY_ADMIN_2FA_CODE',
  'BACKY_ADMIN_MFA_RECOVERY_CODE',
];

const TOTP_SECRET_KEYS = [
  'BACKY_ADMIN_MFA_TOTP_SECRET',
  'BACKY_ADMIN_2FA_TOTP_SECRET',
];

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

const envValue = (keys: string[], env: NodeJS.ProcessEnv): string => {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const normalizeCode = (value: unknown): string => (
  typeof value === 'string' ? value.replace(/\s+/g, '').trim() : ''
);

const timingSafeStringEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const decodeBase32 = (secret: string): Buffer | null => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (!normalized) return null;

  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index === -1) return null;
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
};

const hotp = (secret: Buffer, counter: number): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

const verifyTotpCode = (code: string, secretValue: string, nowMs: number): boolean => {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = decodeBase32(secretValue);
  if (!secret) return false;

  const currentCounter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    if (timingSafeStringEqual(hotp(secret, currentCounter + offset), code)) {
      return true;
    }
  }

  return false;
};

export const isAdminMfaConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => (
  Boolean(envValue(STATIC_CODE_KEYS, env) || envValue(TOTP_SECRET_KEYS, env))
);

export const verifyAdminMfaCode = (
  codeValue: unknown,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): boolean => {
  const code = normalizeCode(codeValue);
  if (!code) return false;

  const staticCode = normalizeCode(envValue(STATIC_CODE_KEYS, env));
  if (staticCode && timingSafeStringEqual(code, staticCode)) {
    return true;
  }

  const totpSecret = envValue(TOTP_SECRET_KEYS, env);
  return Boolean(totpSecret && verifyTotpCode(code, totpSecret, nowMs));
};
