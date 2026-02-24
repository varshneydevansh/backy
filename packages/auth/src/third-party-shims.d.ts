declare module '@supabase/supabase-js' {
    export interface SupabaseClient<T = unknown> {
        from?: (table: string) => unknown;
        storage?: {
            from: (bucket: string) => {
                upload: (...args: any[]) => Promise<{ error?: { message: string } | null }>;
                remove: (paths: string[]) => Promise<{ error?: { message: string } }>;
                getPublicUrl: (path: string) => { data: { publicUrl: string } };
                createSignedUrl: (
                    path: string,
                    expiresIn: number
                ) => Promise<{ data: { signedUrl: string }; error: { message: string } | null }>;
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
        auth?: Record<string, any>;
    }

    export function createClient<T = unknown>(
        url: string,
        key: string,
        options?: Record<string, unknown>
    ): SupabaseClient<T>;
}
