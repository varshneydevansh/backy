import { extname } from 'node:path';
import { DEFAULT_SITE_SETTINGS } from '@backy-cms/core';

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

export type MediaBillingPolicy = {
  overageMode: string;
  mediaLimitGb: number;
  billingPlan: string;
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

const EXTENSION_MIME_FAMILIES: Record<string, string> = {
  '.avif': 'image',
  '.gif': 'image',
  '.jpeg': 'image',
  '.jpg': 'image',
  '.png': 'image',
  '.svg': 'image',
  '.webp': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.mp3': 'audio',
  '.ogg': 'audio',
  '.wav': 'audio',
  '.csv': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.md': 'document',
  '.pdf': 'document',
  '.ppt': 'document',
  '.pptx': 'document',
  '.rtf': 'document',
  '.txt': 'document',
  '.xls': 'document',
  '.xlsx': 'document',
  '.eot': 'font',
  '.otf': 'font',
  '.ttf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
};

const MIME_TYPE_FAMILIES: Record<string, string> = {
  'application/csv': 'document',
  'application/font-woff': 'font',
  'application/font-woff2': 'font',
  'application/msword': 'document',
  'application/pdf': 'document',
  'application/rtf': 'document',
  'application/vnd.ms-fontobject': 'font',
  'application/vnd.ms-excel': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/x-font-otf': 'font',
  'application/x-font-ttf': 'font',
  'text/csv': 'document',
  'text/markdown': 'document',
  'text/plain': 'document',
};

const categoryForFile = (mimeType: string, extension: string) => {
  const mapped = MIME_TYPE_FAMILIES[mimeType] || EXTENSION_MIME_FAMILIES[extension];
  if (mapped) {
    return mapped;
  }

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('font/')) return 'font';

  return 'other';
};

const fileMatchesMimeFamily = (family: string, mimeType: string, extension: string) => (
  mimeType.startsWith(`${family}/`) ||
  MIME_TYPE_FAMILIES[mimeType] === family ||
  EXTENSION_MIME_FAMILIES[extension] === family
);

const fileMatchesMediaCategory = (category: string, mimeType: string, extension: string) => {
  const fileCategory = categoryForFile(mimeType, extension);

  if (category === 'all' || category === '*') {
    return true;
  }

  if (category === 'file') {
    return fileCategory === 'document' || fileCategory === 'other';
  }

  return fileCategory === category;
};

const toRecord = <TRecord extends Record<string, unknown>>(value: unknown): TRecord | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as TRecord
    : undefined
);

export const readMediaBillingPolicy = (
  siteSettings: unknown,
  workspaceSettings: unknown,
): MediaBillingPolicy => {
  const siteRoot = toRecord<Record<string, unknown>>(siteSettings) || {};
  const workspaceRoot = toRecord<Record<string, unknown>>(workspaceSettings) || {};
  const integrations = toRecord<Record<string, unknown>>(workspaceRoot.integrations) || {};
  const commerce = toRecord<Record<string, unknown>>(integrations.commerce) || {};
  const billingQuota = toRecord<Record<string, unknown>>(siteRoot.billingQuota) || {};
  const limits = toRecord<Record<string, unknown>>(billingQuota.limits) || {};
  const mediaGb = Number(limits.mediaGb);

  return {
    overageMode: typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn',
    mediaLimitGb: Number.isFinite(mediaGb) && mediaGb >= 0
      ? mediaGb
      : DEFAULT_SITE_SETTINGS.billingQuota.limits.mediaGb,
    billingPlan: typeof billingQuota.plan === 'string'
      ? billingQuota.plan
      : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

export const mediaBillingLimitBytes = (policy: MediaBillingPolicy): number => (
  Math.floor(policy.mediaLimitGb * 1024 * 1024 * 1024)
);

export const readMediaBillingLimit = (
  siteSettings: unknown,
  workspaceSettings: unknown,
  nextUsageBytes: number,
) => {
  const policy = readMediaBillingPolicy(siteSettings, workspaceSettings);
  const limitBytes = mediaBillingLimitBytes(policy);

  return {
    policy,
    limitBytes,
    blocked: policy.overageMode === 'block' && nextUsageBytes > limitBytes,
  };
};

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
    if (rule === '*' || rule === '*/*' || rule === 'all') {
      return true;
    }

    if (rule.startsWith('.')) {
      return extension === rule;
    }

    if (rule.endsWith('/*')) {
      const family = rule.slice(0, -2);
      return fileMatchesMimeFamily(family, mimeType, extension) ||
        fileMatchesMediaCategory(family, mimeType, extension);
    }

    if (['image', 'video', 'audio', 'document', 'file', 'font', 'other'].includes(rule)) {
      return fileMatchesMediaCategory(rule, mimeType, extension);
    }

    return mimeType === rule;
  });
};
