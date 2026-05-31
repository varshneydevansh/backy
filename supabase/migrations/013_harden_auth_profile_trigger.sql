-- ============================================================================
-- BACKY CMS - SUPABASE AUTH PROFILE TRIGGER HARDENING
-- ============================================================================
--
-- Supabase Auth creates users from an auth-admin execution context that does not
-- guarantee the same search_path as operator-run SQL. Keep the auth signup
-- trigger deterministic by pinning trusted schemas, qualifying Backy enum casts,
-- and falling back safely when metadata contains an unknown role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  metadata_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  profile_role public.user_role := 'editor'::public.user_role;
BEGIN
  IF metadata_role IN ('owner', 'admin', 'editor', 'viewer') THEN
    profile_role := metadata_role::public.user_role;
  END IF;

  INSERT INTO public.profiles AS profile (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    profile_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profile.full_name),
    updated_at = NOW();

  RETURN NEW;
END;
$$;
