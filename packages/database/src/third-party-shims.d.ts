declare module '@supabase/supabase-js' {
    export interface SupabaseQueryError {
        message: string;
        code?: string;
        [key: string]: unknown;
    }

    export interface SupabaseQueryResponse<T = unknown> {
        data: T | null;
        error: SupabaseQueryError | null;
        count: number | null;
        status?: number;
        statusText?: string;
        [key: string]: unknown;
    }

    interface SupabaseQueryBuilder<T = unknown> extends PromiseLike<SupabaseQueryResponse<T>> {
        select<TNext = T>(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): SupabaseQueryBuilder<TNext>;
        insert<TNext = T>(values: unknown, options?: { returning?: 'representation' | 'minimal' }): SupabaseQueryBuilder<TNext>;
        update<TNext = T>(values: unknown): SupabaseQueryBuilder<TNext>;
        delete<TNext = T>(): SupabaseQueryBuilder<TNext>;
        eq(column: string, value: unknown): this;
        ilike(column: string, value: string): this;
        order(column: string, options?: { ascending?: boolean }): this;
        single<TSingle = T>(): PromiseLike<SupabaseQueryResponse<TSingle>>;
        then<TResult1 = SupabaseQueryResponse<T>, TResult2 = never>(
            onfulfilled?: ((value: SupabaseQueryResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ): Promise<TResult1 | TResult2>;
    }

    export interface SupabaseClient<T = any> {
        from<TData = any>(table: string): SupabaseQueryBuilder<TData>;
        storage: {
            from: (bucket: string) => {
                upload: (...args: any[]) => Promise<{ error?: { message: string } }>;
                remove: (...args: any[]) => Promise<{ error?: { message: string } }>;
                getPublicUrl: (...args: any[]) => { data: { publicUrl: string } };
                createSignedUrl: (...args: any[]) => Promise<{ data: { signedUrl: string }; error: null }>;
                list: (...args: any[]) => Promise<{ data?: { name: string; metadata?: any }[]; error?: any }>;
            };
        };
    }

    interface SupabaseOptions {
        persistSession?: boolean;
        autoRefreshToken?: boolean;
        detectSessionInUrl?: boolean;
        [key: string]: any;
    }

    interface SupabaseClientOptions {
        auth?: {
            persistSession?: boolean;
            autoRefreshToken?: boolean;
            detectSessionInUrl?: boolean;
            [key: string]: any;
        };
        db?: {
            schema?: string;
            [key: string]: any;
        };
        [key: string]: any;
    }

    export function createClient<T = any>(
        url: string,
        key: string,
        options?: SupabaseOptions | SupabaseClientOptions
    ): SupabaseClient<T>;
}
