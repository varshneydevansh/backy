-- ============================================================================
-- BACKY CMS - MEDIA VERSION HISTORY
-- ============================================================================
--
-- Adds first-class retained media version rows for replacement history.
-- Existing replacement metadata remains a compatibility fallback for demo mode
-- and older installs.
-- ============================================================================

ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'font';

CREATE TABLE IF NOT EXISTS public.media_versions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  media_id UUID REFERENCES public.media(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  type media_type DEFAULT 'other' NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  storage_path TEXT,
  storage_provider TEXT,
  replaced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  replaced_by TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.media_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view media versions" ON public.media_versions;
CREATE POLICY "Team members can view media versions"
  ON public.media_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_versions.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage media versions" ON public.media_versions;
CREATE POLICY "Editors can manage media versions"
  ON public.media_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_versions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_versions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

CREATE INDEX IF NOT EXISTS idx_media_versions_site_id ON public.media_versions(site_id);
CREATE INDEX IF NOT EXISTS idx_media_versions_media_id ON public.media_versions(media_id);
CREATE INDEX IF NOT EXISTS idx_media_versions_replaced_at ON public.media_versions(replaced_at);
