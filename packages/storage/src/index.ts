/**
 * ==========================================================================
 * @backy/storage - Storage Adapters
 * ==========================================================================
 *
 * Abstract storage layer for file uploads. Supports multiple backends:
 * - S3 (AWS, Cloudflare R2, MinIO, etc.)
 * - Supabase Storage
 * - Local filesystem
 *
 * @module @backy/storage
 * @author Backy Team
 * @license MIT
 */

/// <reference path="./third-party-shims.d.ts" />

import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, extname, basename } from 'path';

// ==========================================================================
// TYPES
// ==========================================================================

/** Supported storage providers */
export type StorageProvider = 's3' | 'supabase' | 'local';

/**
 * Upload result returned after successful file upload
 */
export interface UploadResult {
    /** Public URL to access the file */
    url: string;
    /** Storage path (key) */
    path: string;
    /** File size in bytes */
    size: number;
    /** MIME type */
    mimeType: string;
    /** Generated filename */
    filename: string;
}

/**
 * Storage item metadata for listing
 */
export interface StorageItem {
    /** Storage path/key */
    path: string;
    /** File size in bytes */
    size: number;
    /** Last modified timestamp */
    lastModified: Date;
    /** MIME type (if known) */
    mimeType?: string;
}

/**
 * Configuration for S3-compatible storage
 */
export interface S3Config {
    provider: 's3';
    /** S3 bucket name */
    bucket: string;
    /** AWS region */
    region: string;
    /** Custom endpoint (for R2, MinIO, etc.) */
    endpoint?: string;
    /** Access key ID */
    accessKeyId: string;
    /** Secret access key */
    secretAccessKey: string;
    /** Public URL prefix for accessing files */
    publicUrl?: string;
    /** Use path-style URLs (for MinIO) */
    forcePathStyle?: boolean;
}

/**
 * Configuration for Supabase Storage
 */
export interface SupabaseConfig {
    provider: 'supabase';
    /** Supabase project URL */
    url: string;
    /** Supabase anon or service key */
    key: string;
    /** Storage bucket name */
    bucket: string;
}

/**
 * Configuration for local filesystem storage
 */
export interface LocalConfig {
    provider: 'local';
    /** Base directory for file storage */
    basePath: string;
    /** Public URL prefix for serving files */
    publicUrl: string;
}

/** Union of all storage configurations */
export type StorageConfig = S3Config | SupabaseConfig | LocalConfig;

// ==========================================================================
// STORAGE ADAPTER INTERFACE
// ==========================================================================

/**
 * Storage adapter interface
 *
 * All storage providers implement this interface for consistent API.
 */
export interface StorageAdapter {
    /** Provider type */
    readonly provider: StorageProvider;

    /**
     * Upload a file to storage
     *
     * @param file - File buffer or Blob
     * @param path - Optional path/key (auto-generated if not provided)
     * @param options - Upload options
     */
    upload(
        file: Buffer | Blob,
        options?: {
            path?: string;
            mimeType?: string;
            filename?: string;
        }
    ): Promise<UploadResult>;

    /**
     * Delete a file from storage
     *
     * @param path - File path/key to delete
     */
    delete(path: string): Promise<void>;

    /**
     * Get public URL for a file
     *
     * @param path - File path/key
     * @returns Public URL
     */
    getPublicUrl(path: string): string;

    /**
     * Get a signed/temporary URL for private access
     *
     * @param path - File path/key
     * @param expiresIn - Expiration time in seconds
     * @returns Signed URL
     */
    getSignedUrl(path: string, expiresIn: number): Promise<string>;

    /**
     * List files in a directory/prefix
     *
     * @param prefix - Path prefix to list
     * @returns Array of storage items
     */
    list(prefix: string): Promise<StorageItem[]>;

    /**
     * Check if a file exists
     *
     * @param path - File path/key
     */
    exists(path: string): Promise<boolean>;
}

// ==========================================================================
// S3 ADAPTER
// ==========================================================================

/**
 * Create an S3-compatible storage adapter
 *
 * Works with AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, etc.
 */
export async function createS3Adapter(config: S3Config): Promise<StorageAdapter> {
    // Dynamic import to avoid bundling if not used
    const s3Module = await import('@aws-sdk/client-s3').catch(() => {
        throw new Error(
            'AWS SDK v3 clients are not installed. Install "@aws-sdk/client-s3" and "@aws-sdk/s3-request-presigner" to enable S3 storage integration.'
        );
    });
    const { getSignedUrl: getS3SignedUrl } = await import('@aws-sdk/s3-request-presigner').catch(() => {
        throw new Error(
            '@aws-sdk/s3-request-presigner is required to generate signed URLs.'
        );
    });
    const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = s3Module;

    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: config.forcePathStyle,
    });

    const getBaseUrl = (): string => {
        if (config.publicUrl) return config.publicUrl;
        if (config.endpoint) return `${config.endpoint}/${config.bucket}`;
        return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
    };

    return {
        provider: 's3',

        async upload(file, options = {}): Promise<UploadResult> {
            const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
            const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);
            const ext = options.filename ? extname(options.filename) : '';
            const filename = `${hash}-${randomUUID().slice(0, 8)}${ext}`;
            const path = options.path || `uploads/${new Date().toISOString().slice(0, 7)}/${filename}`;

            await client.send(
                new PutObjectCommand({
                    Bucket: config.bucket,
                    Key: path,
                    Body: buffer,
                    ContentType: options.mimeType || 'application/octet-stream',
                })
            );

            return {
                url: `${getBaseUrl()}/${path}`,
                path,
                size: buffer.length,
                mimeType: options.mimeType || 'application/octet-stream',
                filename,
            };
        },

        async delete(path: string): Promise<void> {
            await client.send(
                new DeleteObjectCommand({
                    Bucket: config.bucket,
                    Key: path,
                })
            );
        },

        getPublicUrl(path: string): string {
            return `${getBaseUrl()}/${path}`;
        },

        async getSignedUrl(path: string, expiresIn: number): Promise<string> {
            const { GetObjectCommand } = await import('@aws-sdk/client-s3');
            const command = new GetObjectCommand({ Bucket: config.bucket, Key: path });
            return getS3SignedUrl(client, command, { expiresIn });
        },

        async list(prefix: string): Promise<StorageItem[]> {
            const response = await client.send(
                new ListObjectsV2Command({
                    Bucket: config.bucket,
                    Prefix: prefix,
                })
            );

            return (response.Contents || []).map((item: { Key?: string; Size?: number; LastModified?: Date }) => ({
                path: item.Key || '',
                size: item.Size || 0,
                lastModified: item.LastModified || new Date(),
            }));
        },

        async exists(path: string): Promise<boolean> {
            try {
                await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: path }));
                return true;
            } catch {
                return false;
            }
        },
    };
}

// ==========================================================================
// SUPABASE ADAPTER
// ==========================================================================

/**
 * Create a Supabase Storage adapter
 */
export async function createSupabaseAdapter(
    config: SupabaseConfig
): Promise<StorageAdapter> {
    const { createClient } = await import('@supabase/supabase-js').catch(() => {
        throw new Error(
            '@supabase/supabase-js is required for Supabase storage adapter.'
        );
    });
    const supabase = createClient(config.url, config.key);
    const storage = supabase.storage.from(config.bucket);

    return {
        provider: 'supabase',

        async upload(file, options = {}): Promise<UploadResult> {
            const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
            const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);
            const ext = options.filename ? extname(options.filename) : '';
            const filename = `${hash}-${randomUUID().slice(0, 8)}${ext}`;
            const path = options.path || `uploads/${new Date().toISOString().slice(0, 7)}/${filename}`;

            const { error } = await storage.upload(path, buffer, {
                contentType: options.mimeType,
                upsert: false,
            });

            if (error) throw new Error(`Upload failed: ${error.message}`);

            const { data: urlData } = storage.getPublicUrl(path);

            return {
                url: urlData.publicUrl,
                path,
                size: buffer.length,
                mimeType: options.mimeType || 'application/octet-stream',
                filename,
            };
        },

        async delete(path: string): Promise<void> {
            const { error } = await storage.remove([path]);
            if (error) throw new Error(`Delete failed: ${error.message}`);
        },

        getPublicUrl(path: string): string {
            const { data } = storage.getPublicUrl(path);
            return data.publicUrl;
        },

        async getSignedUrl(path: string, expiresIn: number): Promise<string> {
            const { data, error } = await storage.createSignedUrl(path, expiresIn);
            if (error) throw new Error(`Signed URL failed: ${error.message}`);
            return data.signedUrl;
        },

        async list(prefix: string): Promise<StorageItem[]> {
            const { data, error } = await storage.list(prefix);
            if (error) throw new Error(`List failed: ${error.message}`);

            return (data || []).map((
                item: {
                    name: string;
                    updated_at?: string;
                    created_at?: string;
                    metadata?: { size?: number; mimetype?: string };
                }
            ) => ({
                path: `${prefix}/${item.name}`,
                size: item.metadata?.size || 0,
                lastModified: new Date(item.updated_at || item.created_at || new Date().toISOString()),
                mimeType: item.metadata?.mimetype,
            }));
        },

        async exists(path: string): Promise<boolean> {
            const dir = dirname(path);
            const name = basename(path);
            const { data } = await storage.list(dir, { search: name });
            return (data || []).some((item: { name: string }) => item.name === name);
        },
    };
}

// ==========================================================================
// LOCAL ADAPTER
// ==========================================================================

/**
 * Create a local filesystem storage adapter
 *
 * Useful for development and self-hosted deployments.
 */
export function createLocalAdapter(config: LocalConfig): StorageAdapter {
    // Ensure base directory exists
    if (!existsSync(config.basePath)) {
        mkdirSync(config.basePath, { recursive: true });
    }

    return {
        provider: 'local',

        async upload(file, options = {}): Promise<UploadResult> {
            const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
            const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);
            const ext = options.filename ? extname(options.filename) : '';
            const filename = `${hash}-${randomUUID().slice(0, 8)}${ext}`;
            const relativePath =
                options.path || `uploads/${new Date().toISOString().slice(0, 7)}/${filename}`;
            const fullPath = join(config.basePath, relativePath);

            // Ensure directory exists
            const dir = dirname(fullPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            writeFileSync(fullPath, buffer);

            return {
                url: `${config.publicUrl}/${relativePath}`,
                path: relativePath,
                size: buffer.length,
                mimeType: options.mimeType || 'application/octet-stream',
                filename,
            };
        },

        async delete(path: string): Promise<void> {
            const fullPath = join(config.basePath, path);
            if (existsSync(fullPath)) {
                unlinkSync(fullPath);
            }
        },

        getPublicUrl(path: string): string {
            return `${config.publicUrl}/${path}`;
        },

        async getSignedUrl(path: string): Promise<string> {
            // Local storage doesn't support signed URLs
            // Return public URL instead
            return this.getPublicUrl(path);
        },

        async list(prefix: string): Promise<StorageItem[]> {
            const { readdirSync, statSync } = await import('fs');
            const fullPath = join(config.basePath, prefix);

            if (!existsSync(fullPath)) return [];

            const files = readdirSync(fullPath, { withFileTypes: true });
            return files
                .filter((f: { isFile: () => boolean; name: string }) => f.isFile())
                .map((f: { isFile: () => boolean; name: string }) => {
                    const filePath = join(fullPath, f.name);
                    const stat = statSync(filePath);
                    return {
                        path: join(prefix, f.name),
                        size: stat.size,
                        lastModified: stat.mtime,
                    };
                });
        },

        async exists(path: string): Promise<boolean> {
            return existsSync(join(config.basePath, path));
        },
    };
}

// ==========================================================================
// FACTORY
// ==========================================================================

/**
 * Create a storage adapter based on configuration
 *
 * @example
 * ```ts
 * // S3
 * const storage = await createStorageAdapter({
 *   provider: 's3',
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: '...',
 *   secretAccessKey: '...',
 * });
 *
 * // Local
 * const storage = await createStorageAdapter({
 *   provider: 'local',
 *   basePath: './uploads',
 *   publicUrl: 'http://localhost:3000/uploads',
 * });
 * ```
 */
export async function createStorageAdapter(
    config: StorageConfig
): Promise<StorageAdapter> {
    switch (config.provider) {
        case 's3':
            return createS3Adapter(config);
        case 'supabase':
            return createSupabaseAdapter(config);
        case 'local':
            return createLocalAdapter(config);
        default:
            throw new Error(`Unsupported storage provider: ${(config as StorageConfig).provider}`);
    }
}

// ==========================================================================
// SINGLETON
// ==========================================================================

let globalStorage: StorageAdapter | null = null;

/**
 * Create or reuse a global storage adapter instance.
 */
export async function getStorageAdapter(
    config?: StorageConfig
): Promise<StorageAdapter> {
    if (globalStorage) {
        return globalStorage;
    }

    if (!config) {
        throw new Error('Storage not initialized. Call getStorageAdapter(config) first.');
    }

    globalStorage = await createStorageAdapter(config);
    return globalStorage;
}

/**
 * Create a reset storage instance
 */
export async function resetStorageAdapter(): Promise<void> {
    if (globalStorage) {
        globalStorage = null;
    }
}
