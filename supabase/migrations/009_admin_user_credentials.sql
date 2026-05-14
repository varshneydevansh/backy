-- ============================================================================
-- BACKY CMS - ADMIN USER CREDENTIALS
-- ============================================================================
--
-- Stores local admin password credentials separately from public profile
-- metadata so DB-backed login/password reset survives process restarts without
-- exposing hashes through ordinary profile reads.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_user_credentials (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_user_credentials_updated_at_idx
  ON public.admin_user_credentials(updated_at);

ALTER TABLE public.admin_user_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage admin user credentials" ON public.admin_user_credentials;
CREATE POLICY "Admins can manage admin user credentials"
  ON public.admin_user_credentials FOR ALL
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
