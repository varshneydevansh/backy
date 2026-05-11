#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname, '..');

const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertIncludes = (source, needle, label) => {
  assert(source.includes(needle), `${label} missing ${needle}`);
};

const schemaSource = read('packages/db/src/schema/index.ts');
const tableNames = [...schemaSource.matchAll(/export const \w+ = pgTable\('([^']+)'/g)]
  .map((match) => match[1])
  .sort();

assert(tableNames.length > 0, 'No pgTable definitions found in @backy/db schema');

const migrationsDir = resolve(root, 'supabase/migrations');
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => read(`supabase/migrations/${file}`))
  .join('\n');

for (const table of tableNames) {
  const createTable = `CREATE TABLE public.${table}`;
  const createTableIfNotExists = `CREATE TABLE IF NOT EXISTS public.${table}`;
  assert(
    migrationSql.includes(createTable) || migrationSql.includes(createTableIfNotExists),
    `Supabase migrations do not create public.${table}`,
  );
  assertIncludes(
    migrationSql,
    `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
    `public.${table}`,
  );
}

const hardeningMigration = read('supabase/migrations/003_schema_parity_and_rls_hardening.sql');
for (const marker of [
  "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner'",
  "role::TEXT IN ('owner', 'admin'",
  'DROP POLICY IF EXISTS "Public can view published pages"',
  'DROP POLICY IF EXISTS "Public can view published posts"',
  'DROP POLICY IF EXISTS "Public can view media"',
  'DROP POLICY IF EXISTS "Public can create active published form submissions"',
  'Service role can create form submissions',
  's.is_published = TRUE',
  'TO service_role',
  'DROP POLICY IF EXISTS "Team members can manage categories"',
  'DROP POLICY IF EXISTS "Team members can manage tags"',
  'DROP POLICY IF EXISTS "Team members can manage folders"',
  'DROP POLICY IF EXISTS "Team members can manage links"',
]) {
  assertIncludes(hardeningMigration, marker, 'RLS hardening migration');
}

for (const sensitivePublicTable of [
  'comments',
  'platform_settings',
  'preview_tokens',
  'content_revisions',
  'cache_invalidation_events',
]) {
  assert(
    !hardeningMigration.includes(`Public can view ${sensitivePublicTable}`),
    `RLS hardening migration should not expose public.${sensitivePublicTable} to public select`,
  );
}

console.log('Supabase RLS smoke passed');
