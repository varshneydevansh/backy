-- ============================================================================
-- BACKY CMS - INVITE-ONLY SUPABASE AUTH PROFILE DEFAULTS
-- ============================================================================
--
-- Provider-created identities must not become usable Backy admins just because
-- Supabase Auth accepted a password. Backy owns role/status activation through
-- owner bootstrap, invites, and the Users workspace.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  metadata_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  profile_role public.user_role := 'viewer'::public.user_role;
BEGIN
  IF metadata_role IN ('owner', 'admin', 'editor', 'viewer') THEN
    profile_role := metadata_role::public.user_role;
  END IF;

  INSERT INTO public.profiles AS profile (id, email, full_name, role, status, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    profile_role,
    'invited',
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profile.full_name),
    updated_at = NOW();

  RETURN NEW;
END;
$$;
