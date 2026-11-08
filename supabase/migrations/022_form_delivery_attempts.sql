-- Dedicated retry evidence outlives ordinary audit retention. Server-only admission.
CREATE TABLE public.form_delivery_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 form_id UUID NOT NULL, submission_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('form-submission')),
 channel TEXT NOT NULL CHECK(channel IN ('webhook','email')),
 target TEXT NOT NULL, source_event_id TEXT, request_id TEXT NOT NULL, reason TEXT, actor TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','succeeded','failed','uncertain')),
 status_code INTEGER, error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(site_id,source_event_id)
);
CREATE INDEX form_delivery_site_idx ON public.form_delivery_attempts(site_id,created_at,id);
ALTER TABLE public.form_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_delivery_attempts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.form_delivery_attempts FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.form_delivery_attempts FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON public.form_delivery_attempts TO service_role; END IF;
END $$;
