-- Provider accounts and CMS operators are separate identities. A public
-- provider signup must never manufacture a Backy operator profile or role.
-- Authorized operator creation/bootstrap/invitation uses the users repository,
-- which explicitly inserts a profile after creating its auth identity.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Keep the legacy function harmless if another deployment still references it.
-- Existing profiles and provider identities are preserved.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN NEW;
END;
$$;
