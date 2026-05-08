import { isAbsolute, join } from 'node:path';
import { createStorageAdapter, type StorageAdapter, type StorageConfig, type StorageProvider } from '@backy/storage';

const UPLOAD_PUBLIC_PREFIX = '/uploads';

type Env = Record<string, string | undefined>;

export interface MediaStorageConfigSummary {
  provider: StorageProvider;
  configured: boolean;
  publicUrl?: string;
  basePath?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  missing: string[];
  error?: string;
}

interface ResolvedMediaStorageConfig {
  config: StorageConfig | null;
  summary: MediaStorageConfigSummary;
}

const envValue = (env: Env, names: string[]): string | undefined => {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

const envBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

const storageProviderFromEnv = (env: Env): StorageProvider | null => {
  const provider = (envValue(env, ['BACKY_STORAGE_PROVIDER', 'BACKY_MEDIA_STORAGE_PROVIDER']) || 'local').toLowerCase();

  if (provider === 'local' || provider === 's3' || provider === 'supabase') {
    return provider;
  }

  return null;
};

const localBasePath = (env: Env) => {
  const configuredPath = envValue(env, ['BACKY_LOCAL_UPLOADS_DIR', 'BACKY_STORAGE_LOCAL_PATH']);

  if (!configuredPath) {
    return join(process.cwd(), 'public', 'uploads');
  }

  return isAbsolute(configuredPath) ? configuredPath : join(process.cwd(), configuredPath);
};

const missingFields = (env: Env, fields: Array<{ name: string; env: string[] }>) => (
  fields.filter((field) => !envValue(env, field.env)).map((field) => field.name)
);

export const resolveMediaStorageConfig = (env: Env = process.env): ResolvedMediaStorageConfig => {
  const provider = storageProviderFromEnv(env);

  if (!provider) {
    const rawProvider = envValue(env, ['BACKY_STORAGE_PROVIDER', 'BACKY_MEDIA_STORAGE_PROVIDER']) || 'local';
    return {
      config: null,
      summary: {
        provider: 'local',
        configured: false,
        missing: [],
        error: `Unsupported storage provider "${rawProvider}". Expected local, s3, or supabase.`,
      },
    };
  }

  if (provider === 'local') {
    const basePath = localBasePath(env);
    const publicUrl = envValue(env, ['BACKY_LOCAL_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL']) || UPLOAD_PUBLIC_PREFIX;
    return {
      config: {
        provider: 'local',
        basePath,
        publicUrl,
      },
      summary: {
        provider,
        configured: true,
        basePath,
        publicUrl,
        missing: [],
      },
    };
  }

  if (provider === 's3') {
    const bucket = envValue(env, ['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET']);
    const region = envValue(env, ['BACKY_S3_REGION', 'AWS_REGION']);
    const accessKeyId = envValue(env, ['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']);
    const secretAccessKey = envValue(env, ['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']);
    const endpoint = envValue(env, ['BACKY_S3_ENDPOINT', 'BACKY_STORAGE_ENDPOINT']);
    const publicUrl = envValue(env, ['BACKY_S3_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL']);
    const forcePathStyle = envBoolean(envValue(env, ['BACKY_S3_FORCE_PATH_STYLE']));
    const missing = missingFields(env, [
      { name: 'bucket', env: ['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET'] },
      { name: 'region', env: ['BACKY_S3_REGION', 'AWS_REGION'] },
      { name: 'accessKeyId', env: ['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'] },
      { name: 'secretAccessKey', env: ['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'] },
    ]);

    return {
      config: missing.length === 0 && bucket && region && accessKeyId && secretAccessKey
        ? {
            provider,
            bucket,
            region,
            accessKeyId,
            secretAccessKey,
            ...(endpoint ? { endpoint } : {}),
            ...(publicUrl ? { publicUrl } : {}),
            ...(forcePathStyle !== undefined ? { forcePathStyle } : {}),
          }
        : null,
      summary: {
        provider,
        configured: missing.length === 0,
        ...(bucket ? { bucket } : {}),
        ...(region ? { region } : {}),
        ...(endpoint ? { endpoint } : {}),
        ...(publicUrl ? { publicUrl } : {}),
        ...(forcePathStyle !== undefined ? { forcePathStyle } : {}),
        missing,
        ...(missing.length > 0 ? { error: `Missing S3 storage configuration: ${missing.join(', ')}.` } : {}),
      },
    };
  }

  const url = envValue(env, ['BACKY_SUPABASE_URL', 'SUPABASE_URL']);
  const key = envValue(env, ['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);
  const bucket = envValue(env, ['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET']);
  const missing = missingFields(env, [
    { name: 'url', env: ['BACKY_SUPABASE_URL', 'SUPABASE_URL'] },
    { name: 'key', env: ['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'] },
    { name: 'bucket', env: ['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET'] },
  ]);

  return {
    config: missing.length === 0 && url && key && bucket
      ? {
          provider,
          url,
          key,
          bucket,
        }
      : null,
    summary: {
      provider,
      configured: missing.length === 0,
      ...(bucket ? { bucket } : {}),
      publicUrl: url,
      missing,
      ...(missing.length > 0 ? { error: `Missing Supabase storage configuration: ${missing.join(', ')}.` } : {}),
    },
  };
};

let mediaStorageAdapterPromise: Promise<StorageAdapter> | null = null;
let mediaStorageAdapterSignature: string | null = null;

export const getMediaStorageConfigSummary = (): MediaStorageConfigSummary => (
  resolveMediaStorageConfig().summary
);

export const getMediaStorageAdapter = async (): Promise<StorageAdapter> => {
  const resolved = resolveMediaStorageConfig();

  if (!resolved.config) {
    throw new Error(resolved.summary.error || 'Media storage is not configured.');
  }

  const signature = JSON.stringify(resolved.config);
  if (!mediaStorageAdapterPromise || mediaStorageAdapterSignature !== signature) {
    mediaStorageAdapterPromise = createStorageAdapter(resolved.config);
    mediaStorageAdapterSignature = signature;
  }

  return mediaStorageAdapterPromise;
};

export const getMediaStoragePath = (input: {
  siteId: string;
  mediaFolder: string;
  storedFilename: string;
}): string => (
  `sites/${input.siteId}/${input.mediaFolder}/${input.storedFilename}`
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const storagePathFromMetadata = (siteId: string, metadata: unknown): string | null => {
  if (!isRecord(metadata) || typeof metadata.storagePath !== 'string') {
    return null;
  }

  return metadata.storagePath.startsWith(`sites/${siteId}/`) ? metadata.storagePath : null;
};

const stripPublicPrefix = (url: string, publicUrl: string, siteId: string): string | null => {
  const normalizedPrefix = publicUrl.replace(/\/+$/, '');
  const localPrefix = `${normalizedPrefix}/sites/${siteId}/`;

  if (url.startsWith(localPrefix)) {
    return url.slice(normalizedPrefix.length + 1);
  }

  return null;
};

export const getMediaStoragePathFromUrl = (
  siteId: string,
  url: string | null | undefined,
  env: Env = process.env,
): string | null => {
  if (!url) {
    return null;
  }

  const resolved = resolveMediaStorageConfig(env);
  const publicPrefixes = [
    UPLOAD_PUBLIC_PREFIX,
    resolved.summary.publicUrl,
  ].filter((value): value is string => Boolean(value));

  for (const publicPrefix of publicPrefixes) {
    const storagePath = stripPublicPrefix(url, publicPrefix, siteId);
    if (storagePath) {
      return storagePath;
    }
  }

  return null;
};

export const getMediaStoragePathFromMedia = (
  siteId: string,
  media: {
    url?: string | null;
    metadata?: unknown;
  },
): string | null => {
  const metadataPath = storagePathFromMetadata(siteId, media.metadata);
  if (metadataPath) {
    return metadataPath;
  }

  return getMediaStoragePathFromUrl(siteId, media.url);
};
