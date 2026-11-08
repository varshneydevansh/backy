-- Browser database roles need row operations governed by RLS, never whole-table
-- destructive/schema/maintenance authority. Scope is the canonical Backy tables;
-- provider-owned objects, legitimate CRUD grants, and RLS policies are unchanged.
-- Future defaults below affect only the role executing this migration, not other
-- provider/default-ACL owners. Their defaults require separate reviewed repair.
DO $backy_browser_table_privileges$
DECLARE
  table_name TEXT;
  browser_role TEXT;
  privilege_name TEXT;
  table_oid OID;
  dangerous_privileges TEXT[] := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];
BEGIN
  -- MAINTAIN was introduced in PostgreSQL 17; never parse it on older servers.
  IF current_setting('server_version_num')::INTEGER >= 170000 THEN
    dangerous_privileges := array_append(dangerous_privileges, 'MAINTAIN');
  END IF;

  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      RAISE EXCEPTION 'Migration 023 requires browser role %', browser_role;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'activity_logs',
    'admin_user_credentials',
    'blog_categories',
    'blog_posts',
    'blog_tags',
    'cache_invalidation_events',
    'comment_blocklist',
    'comment_delivery_attempts',
    'comments',
    'content_collection_records',
    'content_collections',
    'content_revisions',
    'custom_links',
    'domain_mappings',
    'form_contacts',
    'form_definitions',
    'form_delivery_attempts',
    'form_submissions',
    'interactive_components',
    'media',
    'media_folders',
    'media_pages',
    'media_storage_jobs',
    'media_versions',
    'page_versions',
    'page_views',
    'pages',
    'platform_settings',
    'preview_tokens',
    'profiles',
    'reusable_sections',
    'site_backup_restore_jobs',
    'site_visitors',
    'sites',
    'team_members',
    'teams',
    'template_revisions',
    'visitor_auth_rate_limits',
    'visitor_recovery_challenges',
    'visitor_sessions'
  ] LOOP
    table_oid := to_regclass(format('public.%I', table_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = table_oid AND relkind IN ('r', 'p')
    ) THEN
      RAISE EXCEPTION 'Migration 023 requires canonical table public.%', table_name;
    END IF;
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH privilege_name IN ARRAY dangerous_privileges LOOP
        EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I',
          privilege_name, table_name, browser_role);
        -- Do not silently succeed if PUBLIC/inherited/owner authority remains.
        -- Reconciliation of unrelated role grants is outside this migration.
        IF has_table_privilege(browser_role, table_oid, privilege_name) THEN
          RAISE EXCEPTION 'Migration 023: % still has % on public.%; review inherited/PUBLIC/owner grants',
            browser_role, privilege_name, table_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- No FOR ROLE: intentionally change the current migration owner's defaults.
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY dangerous_privileges LOOP
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE %s ON TABLES FROM %I',
        privilege_name, browser_role);
    END LOOP;
    -- A per-schema REVOKE cannot subtract global default grants. Refuse unsafe
    -- global/inherited defaults instead of changing other schemas or owners.
    IF EXISTS (
      SELECT 1 FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) grant_entry
      WHERE d.defaclrole = current_user::regrole
        AND d.defaclobjtype = 'r'
        AND d.defaclnamespace IN (0, 'public'::regnamespace)
        AND grant_entry.privilege_type = ANY(dangerous_privileges)
        AND CASE WHEN grant_entry.grantee = 0 THEN TRUE
          ELSE pg_has_role(browser_role, grant_entry.grantee, 'USAGE') END
    ) THEN
      RAISE EXCEPTION 'Migration 023: unsafe current-owner global/inherited table defaults remain for %; reconcile explicitly', browser_role;
    END IF;
  END LOOP;
END;
$backy_browser_table_privileges$;
