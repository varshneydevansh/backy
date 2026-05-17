#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('..', import.meta.url);
const nextEnvUrl = new URL('apps/public/next-env.d.ts', root);
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const requireDatabaseMode = process.env.BACKY_SDK_REQUIRE_DATABASE === '1';
const configuredDatabaseUrl = process.env.BACKY_DATABASE_URL || process.env.DATABASE_URL || '';
const expectedDatabaseHost = (process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST || '').trim();
const expectedDatabaseName = (process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE || '').trim();
const sdkSmokeMfaCode = process.env.BACKY_SDK_MFA_CODE
  || process.env.BACKY_ADMIN_CONTRACT_MFA_CODE
  || process.env.BACKY_ADMIN_MFA_CODE
  || process.env.BACKY_ADMIN_2FA_CODE
  || 'backy-sdk-smoke-mfa';

if (requireDatabaseMode && !configuredDatabaseUrl) {
  throw new Error('BACKY_SDK_REQUIRE_DATABASE=1 requires BACKY_DATABASE_URL or DATABASE_URL for the SDK database smoke.');
}

const assertExpectedDatabaseTarget = () => {
  if (!requireDatabaseMode) return;
  const expectedHost = expectedDatabaseHost;
  const expectedDatabase = expectedDatabaseName;
  if (!expectedHost && !expectedDatabase) return;

  let parsed;
  try {
    parsed = new URL(configuredDatabaseUrl);
  } catch {
    throw new Error('BACKY_DATABASE_URL or DATABASE_URL must be a valid Postgres URL before SDK database target certification can run.');
  }

  const actualHost = parsed.hostname;
  const actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (expectedHost && actualHost !== expectedHost) {
    throw new Error(`SDK Postgres certification expected database host ${expectedHost}, but BACKY_DATABASE_URL points at ${actualHost || 'unknown'}.`);
  }
  if (expectedDatabase && actualDatabase !== expectedDatabase) {
    throw new Error(`SDK Postgres certification expected database name ${expectedDatabase}, but BACKY_DATABASE_URL points at ${actualDatabase || 'unknown'}.`);
  }
};

assertExpectedDatabaseTarget();

const requiredDatabaseSchema = {
  sites: ['id', 'team_id', 'name', 'slug', 'description', 'theme', 'settings', 'is_published', 'published_at', 'created_at', 'updated_at'],
  pages: ['id', 'site_id', 'title', 'slug', 'description', 'content', 'meta', 'status', 'published_at', 'scheduled_at', 'is_homepage', 'sort_order', 'created_at', 'updated_at'],
  blog_posts: ['id', 'site_id', 'title', 'slug', 'excerpt', 'content', 'content_format', 'status', 'published_at', 'scheduled_at', 'meta', 'view_count', 'created_at', 'updated_at'],
  media: ['id', 'site_id', 'filename', 'original_name', 'mime_type', 'size_bytes', 'type', 'url', 'thumbnail_url', 'folder_id', 'tags', 'metadata', 'alt_text', 'caption', 'created_at', 'updated_at'],
  media_folders: ['id', 'site_id', 'parent_id', 'name', 'sort_order', 'created_at'],
  media_versions: ['id', 'site_id', 'media_id', 'filename', 'original_name', 'mime_type', 'size_bytes', 'type', 'url', 'thumbnail_url', 'storage_path', 'storage_provider', 'replaced_at', 'replaced_by', 'reason', 'metadata', 'created_at'],
  content_collections: ['id', 'site_id', 'name', 'slug', 'route_pattern', 'list_route_pattern', 'description', 'status', 'fields', 'permissions', 'metadata', 'created_at', 'updated_at'],
  content_collection_records: ['id', 'site_id', 'collection_id', 'slug', 'status', 'values', 'published_at', 'scheduled_at', 'created_at', 'updated_at'],
  reusable_sections: ['id', 'site_id', 'name', 'slug', 'description', 'category', 'status', 'tags', 'content', 'metadata', 'source_element_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  form_definitions: ['id', 'site_id', 'page_id', 'post_id', 'name', 'title', 'description', 'audience', 'is_active', 'fields', 'notification_email', 'notification_webhook', 'success_redirect_url', 'success_message', 'enable_honeypot', 'enable_captcha', 'moderation_mode', 'contact_share', 'collection_target', 'settings', 'created_at', 'updated_at'],
  form_submissions: ['id', 'site_id', 'form_id', 'page_id', 'post_id', 'values', 'ip_hash', 'user_agent', 'request_id', 'status', 'reviewed_by', 'reviewed_at', 'admin_notes', 'collection_record', 'collection_record_errors', 'submitted_at', 'updated_at'],
  form_contacts: ['id', 'site_id', 'form_id', 'page_id', 'post_id', 'name', 'email', 'phone', 'notes', 'source_values', 'status', 'source_submission_id', 'request_id', 'source_ip_hash', 'created_at', 'updated_at'],
  comments: ['id', 'site_id', 'target_type', 'target_id', 'comment_thread_id', 'author_name', 'author_email', 'content', 'status', 'parent_id', 'report_count', 'report_reasons', 'request_id', 'ip_hash', 'created_at', 'updated_at'],
  activity_logs: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at'],
  platform_settings: ['id', 'delivery_mode', 'api_keys', 'storage', 'auth', 'integrations', 'updated_at'],
  cache_invalidation_events: ['id', 'site_id', 'scope', 'entity_type', 'entity_id', 'reason', 'revision', 'metadata', 'created_at'],
  interactive_components: ['id', 'site_id', 'component_key', 'display_name', 'type', 'status', 'review_status', 'version', 'render_mode', 'source', 'description', 'allowed_data_scopes', 'required_fields', 'controls', 'fallback', 'security', 'integrity', 'runtime', 'dependency_metadata', 'created_at', 'updated_at'],
};

const requiredDatabaseEnums = {
  media_type: ['image', 'video', 'audio', 'document', 'font', 'other'],
};

const requiredDatabaseRlsTables = [
  'content_collections',
  'content_collection_records',
  'reusable_sections',
  'form_definitions',
  'form_submissions',
  'form_contacts',
  'comments',
  'media_folders',
  'media_versions',
  'cache_invalidation_events',
  'interactive_components',
];

const requiredDatabasePolicies = {
  content_collections: [
    'Team members can view content collections',
    'Public can view published content collections',
    'Editors can manage content collections',
  ],
  content_collection_records: [
    'Team members can view content collection records',
    'Public can view published content collection records',
    'Editors can manage content collection records',
  ],
  reusable_sections: [
    'Team members can view reusable sections',
    'Editors can manage reusable sections',
  ],
  form_definitions: [
    'Team members can view form definitions',
    'Public can view active published form definitions',
    'Editors can manage form definitions',
  ],
  form_submissions: [
    'Team members can view form submissions',
    'Public can create active published form submissions',
    'Editors can manage form submissions',
  ],
  form_contacts: [
    'Team members can view form contacts',
    'Editors can manage form contacts',
  ],
  comments: [
    'Team members can view comments',
    'Editors can manage comments',
  ],
  media_folders: [
    'Team members can view folders',
    'Editors can manage folders',
  ],
  media_versions: [
    'Team members can view media versions',
    'Editors can manage media versions',
  ],
  cache_invalidation_events: [
    'Team members can view cache invalidations',
    'Editors can create cache invalidations',
  ],
  interactive_components: [
    'Public can view approved active interactive components',
    'Team members can view interactive components',
    'Editors can manage interactive components',
  ],
};

const requiredDatabaseIndexes = {
  content_collections: [
    'idx_content_collections_site_id',
    'idx_content_collections_status',
    'idx_content_collections_updated_at',
    'content_collections_site_slug_idx',
    'content_collections_site_status_updated_idx',
    'content_collections_site_route_idx',
  ],
  content_collection_records: [
    'idx_content_collection_records_site_collection',
    'idx_content_collection_records_slug',
    'idx_content_collection_records_status',
    'idx_content_collection_records_updated_at',
    'idx_content_collection_records_values_gin',
    'content_collection_records_site_collection_status_updated_idx',
    'content_collection_records_site_collection_slug_idx',
    'content_collection_records_public_updated_idx',
  ],
  reusable_sections: [
    'idx_reusable_sections_site_id',
    'idx_reusable_sections_status',
    'idx_reusable_sections_updated_at',
    'idx_reusable_sections_tags_gin',
  ],
  form_definitions: [
    'idx_form_definitions_site_id',
    'form_definitions_site_active_updated_idx',
    'form_definitions_site_page_updated_idx',
    'form_definitions_site_post_updated_idx',
    'idx_form_definitions_settings_gin',
  ],
  form_submissions: [
    'idx_form_submissions_site_form',
    'form_submissions_site_form_submitted_idx',
    'form_submissions_site_form_status_submitted_idx',
    'form_submissions_site_request_idx',
    'form_submissions_site_status_updated_idx',
    'idx_form_submissions_values_gin',
  ],
  form_contacts: [
    'idx_form_contacts_site_form',
    'form_contacts_site_form_updated_idx',
    'form_contacts_site_form_status_updated_idx',
    'form_contacts_site_request_idx',
    'form_contacts_site_email_idx',
    'idx_form_contacts_source_submission_id',
  ],
  comments: [
    'idx_comments_site_target',
    'idx_comments_status',
    'idx_comments_parent_id',
    'idx_comments_request_id',
    'idx_comments_created_at',
  ],
  media_versions: [
    'idx_media_versions_site_id',
    'idx_media_versions_media_id',
    'idx_media_versions_replaced_at',
  ],
  cache_invalidation_events: [
    'idx_cache_invalidations_site_scope',
    'idx_cache_invalidations_entity',
    'idx_cache_invalidations_created_at',
  ],
  interactive_components: [
    'interactive_components_site_key_version_idx',
    'interactive_components_site_status_idx',
    'interactive_components_site_review_status_idx',
    'interactive_components_site_updated_idx',
  ],
};

const requiredDatabaseConstraints = {
  content_collections: [
    'content_collections_status_check',
  ],
  content_collection_records: [
    'content_collection_records_status_check',
  ],
  reusable_sections: [
    'reusable_sections_status_check',
  ],
  form_definitions: [
    'form_definitions_audience_check',
    'form_definitions_moderation_mode_check',
  ],
  form_submissions: [
    'form_submissions_status_check',
  ],
  form_contacts: [
    'form_contacts_status_check',
    'form_contacts_source_submission_id_fkey',
  ],
  comments: [
    'comments_target_type_check',
    'comments_status_check',
    'comments_report_count_check',
  ],
  interactive_components: [
    'interactive_components_type_check',
    'interactive_components_status_check',
    'interactive_components_review_status_check',
    'interactive_components_render_mode_check',
    'interactive_components_source_check',
  ],
};

const baseEnv = {
  ...process.env,
  BACKY_ADMIN_MFA_CODE: process.env.BACKY_ADMIN_MFA_CODE || sdkSmokeMfaCode,
  BACKY_SDK_MFA_CODE: process.env.BACKY_SDK_MFA_CODE || sdkSmokeMfaCode,
  ...(requireDatabaseMode
    ? {
        BACKY_DATA_MODE: 'database',
        BACKY_DATABASE_URL: process.env.BACKY_DATABASE_URL || configuredDatabaseUrl,
        DATABASE_URL: process.env.DATABASE_URL || configuredDatabaseUrl,
        BACKY_ADMIN_API_KEY: process.env.BACKY_ADMIN_API_KEY
          || process.env.BACKY_ADMIN_SECRET_KEY
          || 'backy-sdk-postgres-smoke-admin-key',
      }
    : {}),
};

const assertSdkDatabaseSchemaReady = async () => {
  if (!requireDatabaseMode) return;

  const postgres = (await import('postgres')).default;
  const sql = postgres(configuredDatabaseUrl, { max: 1 });
  const missing = [];

  try {
    for (const [tableName, expectedColumns] of Object.entries(requiredDatabaseSchema)) {
      const rows = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
      `;
      const columns = new Set(rows.map((row) => row.column_name));
      if (columns.size === 0) {
        missing.push(`public.${tableName} table`);
        continue;
      }

      for (const columnName of expectedColumns) {
        if (!columns.has(columnName)) {
          missing.push(`public.${tableName}.${columnName}`);
        }
      }
    }

    for (const [typeName, expectedValues] of Object.entries(requiredDatabaseEnums)) {
      const rows = await sql`
        SELECT e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = ${typeName}
      `;
      const values = new Set(rows.map((row) => row.enumlabel));
      if (values.size === 0) {
        missing.push(`public.${typeName} enum`);
        continue;
      }

      for (const value of expectedValues) {
        if (!values.has(value)) {
          missing.push(`public.${typeName}.${value}`);
        }
      }
    }

    for (const tableName of requiredDatabaseRlsTables) {
      const rows = await sql`
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ${tableName}
      `;
      if (rows[0]?.relrowsecurity !== true) {
        missing.push(`public.${tableName} row level security`);
      }
    }

    for (const [tableName, expectedPolicies] of Object.entries(requiredDatabasePolicies)) {
      const rows = await sql`
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ${tableName}
      `;
      const policies = new Set(rows.map((row) => row.policyname));
      for (const policyName of expectedPolicies) {
        if (!policies.has(policyName)) {
          missing.push(`public.${tableName} policy ${policyName}`);
        }
      }
    }

    for (const [tableName, expectedIndexes] of Object.entries(requiredDatabaseIndexes)) {
      const rows = await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = ${tableName}
      `;
      const indexes = new Set(rows.map((row) => row.indexname));
      for (const indexName of expectedIndexes) {
        if (!indexes.has(indexName)) {
          missing.push(`public.${tableName} index ${indexName}`);
        }
      }
    }

    for (const [tableName, expectedConstraints] of Object.entries(requiredDatabaseConstraints)) {
      const rows = await sql`
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = ${tableName}
      `;
      const constraints = new Set(rows.map((row) => row.conname));
      for (const constraintName of expectedConstraints) {
        if (!constraints.has(constraintName)) {
          missing.push(`public.${tableName} constraint ${constraintName}`);
        }
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (missing.length > 0) {
    throw new Error([
      'Configured Postgres/Supabase database is not migrated for the Backy SDK public contract smoke.',
      `Missing schema objects: ${missing.join(', ')}`,
      'Apply supabase/migrations/*.sql or the equivalent Drizzle migrations before running this smoke.',
    ].join(' '));
  }
};

const runStep = (label, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(npmBin, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...baseEnv,
      ...options.env,
    },
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${label} failed with ${signal || `exit code ${code}`}`));
  });
});

const waitForDiscovery = async (serverState) => {
  const deadline = Date.now() + Number(process.env.BACKY_SDK_CI_SERVER_TIMEOUT_MS || 60000);
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverState.exited && lastError) {
      break;
    }

    try {
      const response = await fetch(`${baseUrl}/api/sites/site-demo/manifest`, {
        headers: { accept: 'application/json' },
      });

      if (response.ok) {
        const json = await response.json();
        if (json?.success !== false && json?.data?.site) {
          return;
        }
      }

      lastError = new Error(`discovery returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`Backy public app did not become ready at ${baseUrl}: ${lastError?.message || 'timeout'}`);
};

const stopServer = async (server) => {
  if (!server || server.exitCode !== null || server.signalCode) return;

  server.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(5000).then(() => false),
  ]);

  if (exited === false && server.exitCode === null) {
    server.kill('SIGKILL');
  }
};

let originalNextEnv = null;
let server = null;

try {
  originalNextEnv = await readFile(nextEnvUrl, 'utf8').catch(() => null);

  await assertSdkDatabaseSchemaReady();
  await runStep('SDK generated contract types', ['run', 'test:frontend-contract-types']);
  await runStep('SDK typecheck', ['--workspace', '@backy/sdk-js', 'run', 'typecheck']);
  await runStep('SDK build', ['--workspace', '@backy/sdk-js', 'run', 'build']);

  const serverState = { exited: false };
  server = spawn(npmBin, ['--workspace', '@backy/public', 'run', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv,
  });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  server.once('exit', () => {
    serverState.exited = true;
  });

  await waitForDiscovery(serverState);
  await runStep('SDK smoke', ['run', 'test:smoke:sdk'], {
    env: {
      BACKY_SDK_BASE_URL: baseUrl,
    },
  });

  console.log(JSON.stringify({
    ok: true,
    contract: 'backy.sdk-postgres-smoke-ci.v1',
    databaseRequired: requireDatabaseMode,
    dataMode: baseEnv.BACKY_DATA_MODE,
    targetGuard: {
      expectedHostConfigured: Boolean(expectedDatabaseHost),
      expectedDatabaseConfigured: Boolean(expectedDatabaseName),
    },
    verified: [
      'SDK generated contract types',
      'SDK package typecheck',
      'SDK package build',
      'public app discovery',
      'SDK runtime smoke',
      ...(requireDatabaseMode ? ['configured Postgres/Supabase schema preflight'] : []),
    ],
  }, null, 2));
} finally {
  await stopServer(server);

  if (originalNextEnv !== null) {
    await writeFile(nextEnvUrl, originalNextEnv);
  }
}
