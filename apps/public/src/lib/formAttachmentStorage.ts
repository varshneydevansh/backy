import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createStorageAdapter, type StorageAdapter } from '@backy/storage';
import { resolveMediaStorageConfig } from './mediaStorage';

export class FormAttachmentStorageError extends Error {}

/** Attachments never use the public media directory or a public/CDN bucket. */
export async function getFormAttachmentStorage(): Promise<StorageAdapter> {
  const resolved = resolveMediaStorageConfig();
  if (!resolved.config) throw new FormAttachmentStorageError('Private form attachment storage is not configured.');
  const config = resolved.config;
  if (config.provider === 'local') {
    // Configured runtime bytes and ancestor safety checks are not deployment inputs.
    const basePath = resolve(/* turbopackIgnore: true */ process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR || join(process.cwd(), '.backy-private', 'form-attachments'));
    let ancestor = basePath;
    while (!existsSync(/* turbopackIgnore: true */ ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
    const physicalPath = resolve(realpathSync(/* turbopackIgnore: true */ ancestor), relative(ancestor, basePath));
    const publicPath = resolve(process.cwd(), 'public');
    const publicRelative = relative(existsSync(publicPath) ? realpathSync(publicPath) : publicPath, physicalPath);
    if (!publicRelative || !publicRelative.startsWith(`..${sep}`) && publicRelative !== '..' && !publicRelative.startsWith(sep)) {
      throw new FormAttachmentStorageError('Form attachment storage must be outside the public directory.');
    }
    return createStorageAdapter({ provider: 'local', basePath: physicalPath, publicUrl: '' });
  }
  const bucket = process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET?.trim();
  if (!bucket || bucket === config.bucket) throw new FormAttachmentStorageError('A separate private form attachment bucket is required.');
  try {
    if (config.provider === 'supabase') {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.storage.getBucket(bucket);
      if (result.error || !result.data || result.data.public !== false) throw new Error('Private bucket verification failed');
      return createStorageAdapter({ ...config, bucket });
    }
    // The S3 SDK is an optional storage peer; absence fails closed at runtime.
    type S3PrivacyModule = {
      S3Client: new (config: unknown) => { send: (command: unknown) => Promise<{ PublicAccessBlockConfiguration?: { BlockPublicAcls?: boolean; IgnorePublicAcls?: boolean; BlockPublicPolicy?: boolean; RestrictPublicBuckets?: boolean }; PolicyStatus?: { IsPublic?: boolean } }>; destroy: () => void };
      GetPublicAccessBlockCommand: new (input: { Bucket: string }) => unknown;
      GetBucketPolicyStatusCommand: new (input: { Bucket: string }) => unknown;
    };
    const optionalImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<S3PrivacyModule>;
    const { S3Client, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand } = await optionalImport('@aws-sdk/client-s3');
    const client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
    try {
      const [block, policy] = await Promise.all([
        client.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
        client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket })),
      ]);
      const flags = block.PublicAccessBlockConfiguration;
      if (!flags?.BlockPublicAcls || !flags.IgnorePublicAcls || !flags.BlockPublicPolicy || !flags.RestrictPublicBuckets || policy.PolicyStatus?.IsPublic !== false) throw new Error('Private bucket verification failed');
      const { publicUrl: _publicUrl, ...privateConfig } = config;
      return createStorageAdapter({ ...privateConfig, bucket });
    } finally { client.destroy(); }
  } catch {
    throw new FormAttachmentStorageError('Unable to verify private form attachment storage.');
  }
}
