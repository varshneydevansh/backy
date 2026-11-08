import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createStorageAdapter, type StorageAdapter } from "@backy/storage";
import { resolveMediaStorageConfig } from "./mediaStorage";

export class CommercePrivateStorageError extends Error {}

/** Paid files never use a public directory or public/CDN bucket. */
export interface CommercePrivateStorageContext {
  storage: StorageAdapter;
  storageIdentity: string;
  storageProvider: string;
}
const identity = (provider: string, scope: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(["backy.commerce-private.v1", provider, scope]))
    .digest("hex");
export async function getCommercePrivateStorageContext(): Promise<CommercePrivateStorageContext> {
  const resolved = resolveMediaStorageConfig();
  if (!resolved.config)
    throw new CommercePrivateStorageError(
      "Private commerce file storage is not configured.",
    );
  const config = resolved.config;
  if (config.provider === "local") {
    // Configured runtime bytes and ancestor safety checks are not deployment inputs.
    const basePath = resolve(
      /* turbopackIgnore: true */ process.env.BACKY_COMMERCE_PRIVATE_DIR ||
        join(process.cwd(), ".backy-private", "commerce"),
    );
    let ancestor = basePath;
    while (
      !existsSync(/* turbopackIgnore: true */ ancestor) &&
      dirname(ancestor) !== ancestor
    )
      ancestor = dirname(ancestor);
    const physicalPath = resolve(
      realpathSync(/* turbopackIgnore: true */ ancestor),
      relative(ancestor, basePath),
    );
    const publicPath = resolve(process.cwd(), "public");
    const publicRelative = relative(
      existsSync(publicPath) ? realpathSync(publicPath) : publicPath,
      physicalPath,
    );
    if (
      !publicRelative ||
      (!publicRelative.startsWith(`..${sep}`) &&
        publicRelative !== ".." &&
        !publicRelative.startsWith(sep))
    ) {
      throw new CommercePrivateStorageError(
        "Commerce file storage must be outside the public directory.",
      );
    }
    return {
      storage: await createStorageAdapter({
        provider: "local",
        basePath: physicalPath,
        publicUrl: "",
      }),
      storageIdentity: identity("local", physicalPath),
      storageProvider: "local",
    };
  }
  const bucket =
    process.env.BACKY_COMMERCE_PRIVATE_BUCKET?.trim() || config.bucket;
  if (!bucket)
    throw new CommercePrivateStorageError(
      "A separate private commerce file bucket is required.",
    );
  try {
    if (config.provider === "supabase") {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(config.url, config.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await client.storage.getBucket(bucket);
      if (result.error || !result.data || result.data.public !== false)
        throw new Error("Private bucket verification failed");
      return {
        storage: await createStorageAdapter({ ...config, bucket }),
        storageIdentity: identity("supabase", [
          new URL(config.url).origin,
          new URL(config.url).pathname,
          bucket,
        ]),
        storageProvider: "supabase",
      };
    }
    // The S3 SDK is an optional storage peer; absence fails closed at runtime.
    type S3PrivacyModule = {
      S3Client: new (config: unknown) => {
        send: (command: unknown) => Promise<{
          PublicAccessBlockConfiguration?: {
            BlockPublicAcls?: boolean;
            IgnorePublicAcls?: boolean;
            BlockPublicPolicy?: boolean;
            RestrictPublicBuckets?: boolean;
          };
          PolicyStatus?: { IsPublic?: boolean };
        }>;
        destroy: () => void;
      };
      GetPublicAccessBlockCommand: new (input: { Bucket: string }) => unknown;
      GetBucketPolicyStatusCommand: new (input: { Bucket: string }) => unknown;
    };
    const optionalImport = new Function(
      "specifier",
      "return import(specifier)",
    ) as (specifier: string) => Promise<S3PrivacyModule>;
    const {
      S3Client,
      GetPublicAccessBlockCommand,
      GetBucketPolicyStatusCommand,
    } = await optionalImport("@aws-sdk/client-s3");
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    try {
      const [block, policy] = await Promise.all([
        client.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
        client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket })),
      ]);
      const flags = block.PublicAccessBlockConfiguration;
      if (
        !flags?.BlockPublicAcls ||
        !flags.IgnorePublicAcls ||
        !flags.BlockPublicPolicy ||
        !flags.RestrictPublicBuckets ||
        policy.PolicyStatus?.IsPublic !== false
      )
        throw new Error("Private bucket verification failed");
      const { publicUrl: _publicUrl, ...privateConfig } = config;
      return {
        storage: await createStorageAdapter({ ...privateConfig, bucket }),
        storageIdentity: identity("s3", [
          config.endpoint || "aws",
          config.region,
          bucket,
          Boolean(config.forcePathStyle),
        ]),
        storageProvider: "s3",
      };
    } finally {
      client.destroy();
    }
  } catch {
    throw new CommercePrivateStorageError(
      "Unable to verify private commerce file storage.",
    );
  }
}

export async function getCommercePrivateStorage(): Promise<StorageAdapter> {
  return (await getCommercePrivateStorageContext()).storage;
}
