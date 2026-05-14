/**
 * ============================================================================
 * BACKY CMS - DATABASE PACKAGE
 * ============================================================================
 *
 * This package provides database connectivity, types, and queries for
 * the Backy CMS. It uses Supabase as the backend database.
 *
 * @package @backy-cms/database
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

/// <reference path="./third-party-shims.d.ts" />

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
