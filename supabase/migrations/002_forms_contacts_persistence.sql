-- ============================================================================
-- BACKY CMS - FORMS, SUBMISSIONS, AND CONTACTS DURABLE PERSISTENCE
-- ============================================================================
--
-- Adds the durable Postgres/Supabase tables used by the @backy/db form
-- repository. These tables back standalone/canvas forms, public submissions,
-- contact-share leads, spam/consent settings, collection-write provenance, and
-- moderation state.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- The original Supabase bootstrap used enums for audit logs. The current
-- @backy/db schema stores action/entity as text so new form audit actions such
-- as form.create, form.update, form.deleted, submission.reviewed, and
-- consent-retention.applied do not require enum migrations for every workflow.
ALTER TABLE IF EXISTS public.activity_logs
  ALTER COLUMN action TYPE TEXT USING action::TEXT,
  ALTER COLUMN entity_type TYPE TEXT USING entity_type::TEXT,
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

-- ============================================
-- FORM DEFINITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.form_definitions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'public',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  notification_email TEXT,
  notification_webhook TEXT,
  success_redirect_url TEXT,
  success_message TEXT,
  enable_honeypot BOOLEAN NOT NULL DEFAULT TRUE,
  enable_captcha BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_mode TEXT NOT NULL DEFAULT 'manual',
  contact_share JSONB DEFAULT '{}'::JSONB,
  collection_target JSONB DEFAULT '{}'::JSONB,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_definitions_audience_check CHECK (audience IN ('public', 'authenticated', 'adminOnly')),
  CONSTRAINT form_definitions_moderation_mode_check CHECK (moderation_mode IN ('manual', 'auto-approve'))
);

ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view form definitions" ON public.form_definitions;
CREATE POLICY "Team members can view form definitions"
  ON public.form_definitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_definitions.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public can view active published form definitions" ON public.form_definitions;
CREATE POLICY "Public can view active published form definitions"
  ON public.form_definitions FOR SELECT
  USING (
    is_active = TRUE
    AND audience = 'public'
    AND EXISTS (
      SELECT 1
      FROM public.sites s
      WHERE s.id = form_definitions.site_id
        AND s.is_published = TRUE
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
        AND tm.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_definitions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_form_definitions_updated_at ON public.form_definitions;
CREATE TRIGGER update_form_definitions_updated_at
  BEFORE UPDATE ON public.form_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- FORM SUBMISSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  values JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_hash TEXT,
  user_agent TEXT,
  request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  collection_record JSONB,
  collection_record_errors JSONB DEFAULT '[]'::JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_submissions_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'spam'))
);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view form submissions" ON public.form_submissions;
CREATE POLICY "Team members can view form submissions"
  ON public.form_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_submissions.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public can create active published form submissions" ON public.form_submissions;
CREATE POLICY "Public can create active published form submissions"
  ON public.form_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.form_definitions f
      JOIN public.sites s ON s.id = f.site_id
      WHERE f.id = form_submissions.form_id
        AND f.site_id = form_submissions.site_id
        AND f.is_active = TRUE
        AND f.audience = 'public'
        AND s.is_published = TRUE
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
        AND tm.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_submissions.site_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_form_submissions_updated_at ON public.form_submissions;
CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- FORM CONTACTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.form_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  source_values JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  source_submission_id UUID REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  request_id TEXT,
  source_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_contacts_status_check CHECK (status IN ('new', 'contacted', 'qualified', 'archived'))
);

ALTER TABLE public.form_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view form contacts" ON public.form_contacts;
CREATE POLICY "Team members can view form contacts"
  ON public.form_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_contacts.site_id
        AND tm.user_id = auth.uid()
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
        AND tm.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = form_contacts.site_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );

DROP TRIGGER IF EXISTS update_form_contacts_updated_at ON public.form_contacts;
CREATE TRIGGER update_form_contacts_updated_at
  BEFORE UPDATE ON public.form_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_contacts_source_submission_id_fkey'
      AND conrelid = 'public.form_contacts'::regclass
  ) THEN
    ALTER TABLE public.form_contacts
      ADD CONSTRAINT form_contacts_source_submission_id_fkey
      FOREIGN KEY (source_submission_id)
      REFERENCES public.form_submissions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_form_definitions_site_id ON public.form_definitions(site_id);
CREATE INDEX IF NOT EXISTS idx_form_definitions_page_id ON public.form_definitions(page_id);
CREATE INDEX IF NOT EXISTS idx_form_definitions_post_id ON public.form_definitions(post_id);
CREATE INDEX IF NOT EXISTS idx_form_definitions_is_active ON public.form_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_form_definitions_updated_at ON public.form_definitions(updated_at);
CREATE INDEX IF NOT EXISTS form_definitions_site_active_updated_idx ON public.form_definitions(site_id, is_active, updated_at);
CREATE INDEX IF NOT EXISTS form_definitions_site_page_updated_idx ON public.form_definitions(site_id, page_id, updated_at);
CREATE INDEX IF NOT EXISTS form_definitions_site_post_updated_idx ON public.form_definitions(site_id, post_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_form_definitions_settings_gin ON public.form_definitions USING GIN(settings);

CREATE INDEX IF NOT EXISTS idx_form_submissions_site_form ON public.form_submissions(site_id, form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON public.form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_request_id ON public.form_submissions(request_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at ON public.form_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS form_submissions_site_form_submitted_idx ON public.form_submissions(site_id, form_id, submitted_at);
CREATE INDEX IF NOT EXISTS form_submissions_site_form_status_submitted_idx ON public.form_submissions(site_id, form_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS form_submissions_site_request_idx ON public.form_submissions(site_id, request_id);
CREATE INDEX IF NOT EXISTS form_submissions_site_status_updated_idx ON public.form_submissions(site_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_values_gin ON public.form_submissions USING GIN(values);

CREATE INDEX IF NOT EXISTS idx_form_contacts_site_form ON public.form_contacts(site_id, form_id);
CREATE INDEX IF NOT EXISTS idx_form_contacts_status ON public.form_contacts(status);
CREATE INDEX IF NOT EXISTS idx_form_contacts_request_id ON public.form_contacts(request_id);
CREATE INDEX IF NOT EXISTS idx_form_contacts_email ON public.form_contacts(email);
CREATE INDEX IF NOT EXISTS idx_form_contacts_source_submission_id ON public.form_contacts(source_submission_id);
CREATE INDEX IF NOT EXISTS form_contacts_site_form_updated_idx ON public.form_contacts(site_id, form_id, updated_at);
CREATE INDEX IF NOT EXISTS form_contacts_site_form_status_updated_idx ON public.form_contacts(site_id, form_id, status, updated_at);
CREATE INDEX IF NOT EXISTS form_contacts_site_request_idx ON public.form_contacts(site_id, request_id);
CREATE INDEX IF NOT EXISTS form_contacts_site_email_idx ON public.form_contacts(site_id, email);
