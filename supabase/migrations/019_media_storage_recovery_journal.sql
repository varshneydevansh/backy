-- Server-only durable admission/cleanup journal. Paths are never public media metadata.
CREATE TABLE public.media_storage_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  media_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('upload','replace','transforms','delete','version-delete','version-restore')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','settled')),
  storage_identity TEXT NOT NULL CHECK (storage_identity ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL CHECK (provider IN ('local','s3','supabase')),
  files JSONB NOT NULL CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) BETWEEN 1 AND 10000),
  remaining_paths JSONB NOT NULL CHECK (jsonb_typeof(remaining_paths) = 'array'),
  CHECK ((state = 'pending' AND jsonb_array_length(remaining_paths) > 0) OR (state = 'settled' AND jsonb_array_length(remaining_paths) = 0)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_storage_jobs_site_state_idx ON public.media_storage_jobs(site_id,state,created_at,id);
ALTER TABLE public.media_storage_jobs ENABLE ROW LEVEL SECURITY;
-- No browser/operator-provider policies: authenticated server routes enforce site scope.
REVOKE ALL ON public.media_storage_jobs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.media_storage_jobs FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.media_storage_jobs FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON public.media_storage_jobs TO service_role; END IF;
END $$;
