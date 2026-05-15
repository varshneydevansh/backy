import { extname } from 'node:path';

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_SITE_MEDIA_QUOTA_BYTES = 500 * 1024 * 1024;

type MediaUploadPolicySettings = {
  integrations?: {
    storage?: {
      maxFileSizeMb?: unknown;
      workspaceStorageLimitGb?: unknown;
      warningThresholdPercent?: unknown;
      allowedFileTypes?: unknown;
    } | null;
  } | null;
} | null | undefined;

export type MediaUploadPolicy = {
  maxUploadBytes: number;
  quotaBytes: number;
  warningThresholdPercent: number;
  allowedFileTypes: string[];
};

const finitePositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const envQuotaBytes = () => {
  const configured = finitePositiveNumber(process.env.BACKY_SITE_MEDIA_QUOTA_BYTES);
  return configured ? Math.floor(configured) : null;
};

export const resolveMediaUploadPolicy = (settings: MediaUploadPolicySettings): MediaUploadPolicy => {
  const storage = settings?.integrations?.storage || {};
  const maxFileSizeMb = finitePositiveNumber(storage.maxFileSizeMb);
  const workspaceStorageLimitGb = finitePositiveNumber(storage.workspaceStorageLimitGb);
  const warningThresholdPercent = finitePositiveNumber(storage.warningThresholdPercent);
  const allowedFileTypes = typeof storage.allowedFileTypes === 'string'
    ? storage.allowedFileTypes.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    maxUploadBytes: maxFileSizeMb
      ? Math.floor(Math.min(Math.max(maxFileSizeMb, 1), 2048) * 1024 * 1024)
      : DEFAULT_MAX_UPLOAD_BYTES,
    quotaBytes: envQuotaBytes()
      || (workspaceStorageLimitGb
        ? Math.floor(Math.min(Math.max(workspaceStorageLimitGb, 1), 102400) * 1024 * 1024 * 1024)
        : DEFAULT_SITE_MEDIA_QUOTA_BYTES),
    warningThresholdPercent: warningThresholdPercent
      ? Math.floor(Math.min(Math.max(warningThresholdPercent, 50), 100))
      : 80,
    allowedFileTypes,
  };
};

export const mediaQuotaPayload = (limitBytes: number, usedBytes: number, policy?: MediaUploadPolicy) => ({
  limitBytes,
  usedBytes,
  remainingBytes: Math.max(0, limitBytes - usedBytes),
  ...(policy
    ? {
        warningThresholdPercent: policy.warningThresholdPercent,
        warningBytes: Math.floor(limitBytes * (policy.warningThresholdPercent / 100)),
      }
    : {}),
});

export const isUploadAllowedByFileType = (
  policy: MediaUploadPolicy,
  input: {
    filename: string;
    mimeType: string;
  },
) => {
  if (policy.allowedFileTypes.length === 0) {
    return true;
  }

  const mimeType = input.mimeType.toLowerCase();
  const extension = extname(input.filename).toLowerCase();

  return policy.allowedFileTypes.some((rule) => {
    if (rule.startsWith('.')) {
      return extension === rule;
    }

    if (rule.endsWith('/*')) {
      return mimeType.startsWith(`${rule.slice(0, -1)}`);
    }

    return mimeType === rule;
  });
};
