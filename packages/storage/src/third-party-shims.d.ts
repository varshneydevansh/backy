declare module '@aws-sdk/client-s3' {
    export class S3Client {
        constructor(config: unknown);
        send(command: unknown): Promise<any>;
    }

    export class PutObjectCommand {
        constructor(input: Record<string, unknown>);
    }

    export class DeleteObjectCommand {
        constructor(input: Record<string, unknown>);
    }

    export class HeadObjectCommand {
        constructor(input: Record<string, unknown>);
    }

    export class ListObjectsV2Command {
        constructor(input: Record<string, unknown>);
    }

    export class GetObjectCommand {
        constructor(input: Record<string, unknown>);
    }
}

declare module '@aws-sdk/s3-request-presigner' {
    export function getSignedUrl(
        client: unknown,
        command: unknown,
        options?: { expiresIn?: number }
    ): Promise<string>;
}

declare module '@supabase/supabase-js' {
    interface SupabaseClient<T = unknown> {
        storage: {
            from: (bucket: string) => {
                upload: (
                    path: string,
                    file: Blob | Uint8Array | ArrayBuffer | string,
                    options?: {
                        contentType?: string;
                        upsert?: boolean;
                    }
                ) => Promise<{ error?: { message: string } | null }>;
                remove: (paths: string[]) => Promise<{
                    error?: { message: string };
                }>;
                getPublicUrl: (path: string) => { data: { publicUrl: string } };
                createSignedUrl: (
                    path: string,
                    expiresIn: number
                ) => Promise<{
                    data: { signedUrl: string };
                    error: { message: string } | null;
                }>;
                list: (
                    path: string,
                    options?: { search?: string }
                ) => Promise<{
                    data?: Array<{
                        name: string;
                        metadata?: { size?: number; mimetype?: string };
                        updated_at?: string;
                        created_at?: string;
                    }>;
                    error?: { message: string };
                }>;
            };
        };
    }

    export function createClient<T = unknown>(
        url: string,
        key: string,
        options?: Record<string, unknown>
    ): SupabaseClient<T>;
}
