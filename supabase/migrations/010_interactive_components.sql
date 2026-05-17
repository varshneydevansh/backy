-- ============================================================================
-- BACKY CMS - INTERACTIVE COMPONENT REGISTRY
-- ============================================================================
--
-- Stores site-scoped trusted and sandboxed component versions for interactive
-- figures, simulations, calculators, and custom code components.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.interactive_components (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  component_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  type TEXT DEFAULT 'codeComponent' NOT NULL,
  status TEXT DEFAULT 'disabled' NOT NULL,
  review_status TEXT DEFAULT 'draft' NOT NULL,
  version TEXT NOT NULL,
  render_mode TEXT DEFAULT 'sandbox-iframe' NOT NULL,
  source TEXT DEFAULT 'custom' NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  allowed_data_scopes JSONB DEFAULT '[]' NOT NULL,
  required_fields JSONB DEFAULT '[]' NOT NULL,
  controls JSONB DEFAULT '[]' NOT NULL,
  fallback JSONB DEFAULT '{"required": true, "supported": []}' NOT NULL,
  security JSONB DEFAULT '{}' NOT NULL,
  integrity JSONB DEFAULT '{"signed": false, "signatureRequiredForCustomCode": true}' NOT NULL,
  runtime JSONB DEFAULT '{}' NOT NULL,
  owner_id TEXT,
  dependency_metadata JSONB DEFAULT '{}' NOT NULL,
  changelog TEXT,
  rollback_from_version TEXT,
  created_by TEXT,
  updated_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT interactive_components_type_check CHECK (type IN ('interactiveFigure', 'codeComponent')),
  CONSTRAINT interactive_components_status_check CHECK (status IN ('active', 'disabled', 'archived')),
  CONSTRAINT interactive_components_review_status_check CHECK (review_status IN ('draft', 'in_review', 'approved', 'rejected')),
  CONSTRAINT interactive_components_render_mode_check CHECK (render_mode IN ('trusted-component', 'sandbox-iframe', 'static-fallback')),
  CONSTRAINT interactive_components_source_check CHECK (source IN ('registry', 'custom'))
);

ALTER TABLE public.interactive_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view approved active interactive components" ON public.interactive_components;
CREATE POLICY "Public can view approved active interactive components"
  ON public.interactive_components FOR SELECT
  USING (
    status = 'active'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = interactive_components.site_id
        AND s.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "Team members can view interactive components" ON public.interactive_components;
CREATE POLICY "Team members can view interactive components"
  ON public.interactive_components FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = interactive_components.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage interactive components" ON public.interactive_components;
CREATE POLICY "Editors can manage interactive components"
  ON public.interactive_components FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = interactive_components.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = interactive_components.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS interactive_components_site_key_version_idx
  ON public.interactive_components(site_id, component_key, version);
CREATE INDEX IF NOT EXISTS interactive_components_site_status_idx
  ON public.interactive_components(site_id, status);
CREATE INDEX IF NOT EXISTS interactive_components_site_review_status_idx
  ON public.interactive_components(site_id, review_status);
CREATE INDEX IF NOT EXISTS interactive_components_site_updated_idx
  ON public.interactive_components(site_id, updated_at);
