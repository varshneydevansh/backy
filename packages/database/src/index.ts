/**
 * ============================================================================
 * SCYTHIAN CMS - DATABASE PACKAGE
 * ============================================================================
 *
 * This package provides database connectivity, types, and queries for
 * the Scythian CMS. It uses Supabase as the backend database.
 *
 * @package @scythian-cms/database
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

// ============================================
// CLIENT EXPORTS
// ============================================

export {
  getSupabaseClient,
  createSupabaseClient,
  createServerClient,
  isSupabaseConfigured,
  getSupabaseConfig,
} from './client';

export type { Database, SupabaseClient } from './client';

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  TableRow,
  TableInsert,
  TableUpdate,
  EnumType,
} from './types';

// ============================================
// QUERY EXPORTS
// ============================================

export * from './queries/sites';
