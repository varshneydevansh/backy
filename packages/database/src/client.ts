/**
 * ============================================================================
 * SCYTHIAN CMS - DATABASE CLIENT
 * ============================================================================
 *
 * This module provides the Supabase client configuration and initialization.
 * It handles both server-side and client-side Supabase instances.
 *
 * @module DatabaseClient
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ============================================
// CLIENT CONFIGURATION
// ============================================

/**
 * Supabase configuration from environment variables
 */
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Validate that Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('your-project') &&
    supabaseUrl.startsWith('https://')
  );
}

/**
 * Get Supabase configuration status
 */
export function getSupabaseConfig(): { url: string; key: string; configured: boolean } {
  return {
    url: supabaseUrl,
    key: supabaseKey.slice(0, 10) + '...', // Mask for security
    configured: isSupabaseConfigured(),
  };
}

// ============================================
// CLIENT INSTANCES
// ============================================

/**
 * Singleton Supabase client instance
 *
 * This is the main client used throughout the application.
 * It's created once and reused to avoid multiple connections.
 */
let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client instance
 *
 * Creates the client if it doesn't exist, otherwise returns the existing one.
 *
 * @returns Supabase client instance
 * @throws Error if Supabase is not configured
 *
 * @example
 * ```ts
 * const supabase = getSupabaseClient();
 * const { data, error } = await supabase.from('sites').select('*');
 * ```
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
    );
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      db: {
        schema: 'public',
      },
    });
  }

  return supabaseInstance;
}

/**
 * Create a fresh Supabase client instance
 *
 * Use this when you need a new client with different options,
 * such as for server-side rendering or admin operations.
 *
 * @param options - Additional client options
 * @returns New Supabase client instance
 */
export function createSupabaseClient(
  options?: Parameters<typeof createClient>[2]
): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    ...options,
  });
}

/**
 * Create a server-side Supabase client with service role
 *
 * This client has elevated privileges and should only be used
 * in secure server contexts (API routes, edge functions).
 *
 * @returns Server-side Supabase client
 */
export function createServerClient(): SupabaseClient<Database> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. This is required for server-side operations.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });
}

// ============================================
// TYPE EXPORTS
// ============================================

export type { Database } from './types';
export type { SupabaseClient } from '@supabase/supabase-js';
