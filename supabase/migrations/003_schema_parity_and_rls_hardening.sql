-- ============================================================================
-- BACKY CMS - SCHEMA PARITY AND RLS HARDENING
-- ============================================================================
--
-- Brings Supabase installs forward to the current @backy/db repository schema
-- and tightens public RLS policies so direct database access does not expose
-- unpublished site content or bypass server-side public API controls.
-- ============================================================================

-- The product model now distinguishes owners from admins. Keep the original
-- enum-backed Supabase bootstrap compatible with current app roles.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner' BEFORE 'admin';

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE IF EXISTS public.blog_categories
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS public.blog_tags
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS update_blog_categories_updated_at ON public.blog_categories;
CREATE TRIGGER update_blog_categories_updated_at
  BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_blog_tags_updated_at ON public.blog_tags;
CREATE TRIGGER update_blog_tags_updated_at
  BEFORE UPDATE ON public.blog_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- OWNER-AWARE POLICY REPLACEMENTS
-- ============================================

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can manage all teams" ON public.teams;
CREATE POLICY "Admins can manage all teams"
  ON public.teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::TEXT IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Team admins can manage members" ON public.team_members;
CREATE POLICY "Team admins can manage members"
  ON public.team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm2
      WHERE tm2.team_id = team_members.team_id
        AND tm2.user_id = auth.uid()
        AND tm2.role::TEXT IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm2
      WHERE tm2.team_id = team_members.team_id
        AND tm2.user_id = auth.uid()
        AND tm2.role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Editors can create sites" ON public.sites;
CREATE POLICY "Editors can create sites"
  ON public.sites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = sites.team_id
        AND user_id = auth.uid()
        AND role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can update sites" ON public.sites;
CREATE POLICY "Editors can update sites"
  ON public.sites FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = sites.team_id
        AND user_id = auth.uid()
        AND role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = sites.team_id
        AND user_id = auth.uid()
        AND role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Admins can delete sites" ON public.sites;
CREATE POLICY "Admins can delete sites"
  ON public.sites FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = sites.team_id
        AND user_id = auth.uid()
        AND role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Editors can manage pages" ON public.pages;
CREATE POLICY "Editors can manage pages"
  ON public.pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = pages.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = pages.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can manage posts" ON public.blog_posts;
CREATE POLICY "Editors can manage posts"
  ON public.blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_posts.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_posts.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Team members can manage categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Team members can view categories" ON public.blog_categories;
CREATE POLICY "Team members can view categories"
  ON public.blog_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_categories.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage categories" ON public.blog_categories;
CREATE POLICY "Editors can manage categories"
  ON public.blog_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_categories.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_categories.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Team members can manage tags" ON public.blog_tags;
DROP POLICY IF EXISTS "Team members can view tags" ON public.blog_tags;
CREATE POLICY "Team members can view tags"
  ON public.blog_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_tags.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage tags" ON public.blog_tags;
CREATE POLICY "Editors can manage tags"
  ON public.blog_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_tags.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_tags.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can manage media" ON public.media;
CREATE POLICY "Editors can manage media"
  ON public.media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Team members can manage folders" ON public.media_folders;
DROP POLICY IF EXISTS "Team members can view folders" ON public.media_folders;
CREATE POLICY "Team members can view folders"
  ON public.media_folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_folders.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage folders" ON public.media_folders;
CREATE POLICY "Editors can manage folders"
  ON public.media_folders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_folders.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_folders.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Team admins can manage domains" ON public.domain_mappings;
CREATE POLICY "Team admins can manage domains"
  ON public.domain_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = domain_mappings.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = domain_mappings.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Team members can manage links" ON public.custom_links;
DROP POLICY IF EXISTS "Team members can view links" ON public.custom_links;
CREATE POLICY "Team members can view links"
  ON public.custom_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = custom_links.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage links" ON public.custom_links;
CREATE POLICY "Editors can manage links"
  ON public.custom_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = custom_links.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = custom_links.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can manage form definitions" ON public.form_definitions;
CREATE POLICY "Editors can manage form definitions"
  ON public.form_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_definitions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_definitions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can manage form submissions" ON public.form_submissions;
CREATE POLICY "Editors can manage form submissions"
  ON public.form_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_submissions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_submissions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can manage form contacts" ON public.form_contacts;
CREATE POLICY "Editors can manage form contacts"
  ON public.form_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_contacts.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_contacts.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

-- ============================================
-- PUBLIC POLICY HARDENING
-- ============================================

DROP POLICY IF EXISTS "Public can view published pages" ON public.pages;
CREATE POLICY "Public can view published pages"
  ON public.pages FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = pages.site_id
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Public can view published posts" ON public.blog_posts;
CREATE POLICY "Public can view published posts"
  ON public.blog_posts FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = blog_posts.site_id
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Public can view media" ON public.media;
CREATE POLICY "Public can view media"
  ON public.media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = media.site_id
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Public can create active published form submissions" ON public.form_submissions;
CREATE POLICY "Service role can create form submissions"
  ON public.form_submissions FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Service role can insert page views" ON public.page_views;
CREATE POLICY "Service role can insert page views"
  ON public.page_views FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

-- ============================================
-- CONTENT COLLECTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.content_collections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  route_pattern TEXT,
  list_route_pattern TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  permissions JSONB NOT NULL DEFAULT '{
    "publicRead": true,
    "publicCreate": false,
    "publicUpdate": false,
    "publicDelete": false
  }'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug),
  CONSTRAINT content_collections_status_check CHECK (status IN ('draft', 'published', 'scheduled', 'archived'))
);

ALTER TABLE public.content_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view content collections" ON public.content_collections;
CREATE POLICY "Team members can view content collections"
  ON public.content_collections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collections.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public can view published content collections" ON public.content_collections;
CREATE POLICY "Public can view published content collections"
  ON public.content_collections FOR SELECT
  USING (
    status = 'published'
    AND permissions->>'publicRead' = 'true'
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = content_collections.site_id
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Editors can manage content collections" ON public.content_collections;
CREATE POLICY "Editors can manage content collections"
  ON public.content_collections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collections.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collections.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_content_collections_updated_at ON public.content_collections;
CREATE TRIGGER update_content_collections_updated_at
  BEFORE UPDATE ON public.content_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.content_collection_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.content_collections(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  values JSONB NOT NULL DEFAULT '{}'::JSONB,
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, collection_id, slug),
  CONSTRAINT content_collection_records_status_check CHECK (status IN ('draft', 'published', 'scheduled', 'archived'))
);

ALTER TABLE public.content_collection_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view content collection records" ON public.content_collection_records;
CREATE POLICY "Team members can view content collection records"
  ON public.content_collection_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collection_records.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public can view published content collection records" ON public.content_collection_records;
CREATE POLICY "Public can view published content collection records"
  ON public.content_collection_records FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.content_collections c
      JOIN public.sites s ON s.id = c.site_id
      WHERE c.id = content_collection_records.collection_id
        AND c.site_id = content_collection_records.site_id
        AND c.status = 'published'
        AND c.permissions->>'publicRead' = 'true'
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Editors can manage content collection records" ON public.content_collection_records;
CREATE POLICY "Editors can manage content collection records"
  ON public.content_collection_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collection_records.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_collection_records.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
    AND EXISTS (
      SELECT 1 FROM public.content_collections c
      WHERE c.id = content_collection_records.collection_id
        AND c.site_id = content_collection_records.site_id
    )
  );

DROP TRIGGER IF EXISTS update_content_collection_records_updated_at ON public.content_collection_records;
CREATE TRIGGER update_content_collection_records_updated_at
  BEFORE UPDATE ON public.content_collection_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PLATFORM SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id TEXT PRIMARY KEY,
  delivery_mode TEXT NOT NULL DEFAULT 'managed-hosting',
  api_keys JSONB NOT NULL DEFAULT '{}'::JSONB,
  storage JSONB NOT NULL DEFAULT '{}'::JSONB,
  auth JSONB NOT NULL DEFAULT '{}'::JSONB,
  integrations JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_settings_delivery_mode_check CHECK (delivery_mode IN ('demo', 'database', 'managed-hosting', 'custom-frontend'))
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Owners and admins can manage platform settings"
  ON public.platform_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::TEXT IN ('owner', 'admin')
        AND is_active = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::TEXT IN ('owner', 'admin')
        AND is_active = TRUE
    )
  );

-- ============================================
-- REUSABLE SECTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.reusable_sections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_element_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug),
  CONSTRAINT reusable_sections_status_check CHECK (status IN ('active', 'archived'))
);

ALTER TABLE public.reusable_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view reusable sections" ON public.reusable_sections;
CREATE POLICY "Team members can view reusable sections"
  ON public.reusable_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = reusable_sections.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage reusable sections" ON public.reusable_sections;
CREATE POLICY "Editors can manage reusable sections"
  ON public.reusable_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = reusable_sections.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = reusable_sections.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_reusable_sections_updated_at ON public.reusable_sections;
CREATE TRIGGER update_reusable_sections_updated_at
  BEFORE UPDATE ON public.reusable_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CONTENT WORKFLOWS
-- ============================================

CREATE TABLE IF NOT EXISTS public.content_revisions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT content_revisions_target_type_check CHECK (target_type IN ('page', 'post'))
);

ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view content revisions" ON public.content_revisions;
CREATE POLICY "Team members can view content revisions"
  ON public.content_revisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_revisions.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can create content revisions" ON public.content_revisions;
CREATE POLICY "Editors can create content revisions"
  ON public.content_revisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = content_revisions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

CREATE TABLE IF NOT EXISTS public.preview_tokens (
  token TEXT PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  CONSTRAINT preview_tokens_target_type_check CHECK (target_type IN ('page', 'post'))
);

ALTER TABLE public.preview_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors can manage preview tokens" ON public.preview_tokens;
CREATE POLICY "Editors can manage preview tokens"
  ON public.preview_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = preview_tokens.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = preview_tokens.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

-- ============================================
-- COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  comment_thread_id TEXT,
  author_name TEXT,
  author_email TEXT,
  author_website TEXT,
  user_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  parent_id TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  block_reason TEXT,
  blocked_by TEXT,
  blocked_at TIMESTAMPTZ,
  report_count INTEGER NOT NULL DEFAULT 0,
  report_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  request_id TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comments_target_type_check CHECK (target_type IN ('page', 'post')),
  CONSTRAINT comments_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'spam', 'blocked')),
  CONSTRAINT comments_report_count_check CHECK (report_count >= 0)
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view comments" ON public.comments;
CREATE POLICY "Team members can view comments"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comments.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage comments" ON public.comments;
CREATE POLICY "Editors can manage comments"
  ON public.comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comments.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comments.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_comments_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CACHE INVALIDATION EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.cache_invalidation_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'all',
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT NOT NULL,
  revision TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cache_invalidation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view cache invalidations" ON public.cache_invalidation_events;
CREATE POLICY "Team members can view cache invalidations"
  ON public.cache_invalidation_events FOR SELECT
  USING (
    (
      site_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.sites s
        JOIN public.team_members tm ON s.team_id = tm.team_id
        WHERE s.id = cache_invalidation_events.site_id
          AND tm.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::TEXT IN ('owner', 'admin')
        AND is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "Editors can create cache invalidations" ON public.cache_invalidation_events;
CREATE POLICY "Editors can create cache invalidations"
  ON public.cache_invalidation_events FOR INSERT
  WITH CHECK (
    (
      site_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.sites s
        JOIN public.team_members tm ON s.team_id = tm.team_id
        WHERE s.id = cache_invalidation_events.site_id
          AND tm.user_id = auth.uid()
          AND tm.role::TEXT IN ('owner', 'admin', 'editor')
      )
    )
    OR (
      site_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('owner', 'admin')
          AND is_active = TRUE
      )
    )
  );

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

CREATE INDEX IF NOT EXISTS idx_content_collections_site_id ON public.content_collections(site_id);
CREATE INDEX IF NOT EXISTS idx_content_collections_status ON public.content_collections(status);
CREATE INDEX IF NOT EXISTS idx_content_collections_updated_at ON public.content_collections(updated_at);

CREATE INDEX IF NOT EXISTS idx_content_collection_records_site_collection ON public.content_collection_records(site_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_content_collection_records_slug ON public.content_collection_records(slug);
CREATE INDEX IF NOT EXISTS idx_content_collection_records_status ON public.content_collection_records(status);
CREATE INDEX IF NOT EXISTS idx_content_collection_records_updated_at ON public.content_collection_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_content_collection_records_values_gin ON public.content_collection_records USING GIN(values);

CREATE INDEX IF NOT EXISTS idx_reusable_sections_site_id ON public.reusable_sections(site_id);
CREATE INDEX IF NOT EXISTS idx_reusable_sections_status ON public.reusable_sections(status);
CREATE INDEX IF NOT EXISTS idx_reusable_sections_updated_at ON public.reusable_sections(updated_at);
CREATE INDEX IF NOT EXISTS idx_reusable_sections_tags_gin ON public.reusable_sections USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_content_revisions_site_target ON public.content_revisions(site_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_revisions_created_at ON public.content_revisions(created_at);

CREATE INDEX IF NOT EXISTS idx_preview_tokens_site_target ON public.preview_tokens(site_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires_at ON public.preview_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_comments_site_target ON public.comments(site_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON public.comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_request_id ON public.comments(request_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at);

CREATE INDEX IF NOT EXISTS idx_cache_invalidations_site_scope ON public.cache_invalidation_events(site_id, scope);
CREATE INDEX IF NOT EXISTS idx_cache_invalidations_entity ON public.cache_invalidation_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cache_invalidations_created_at ON public.cache_invalidation_events(created_at);
