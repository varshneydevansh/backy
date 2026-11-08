-- Private, durable planned-byte journal. Restores always create a fresh draft site.
CREATE TABLE public.site_backup_restore_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 source_site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 target_site_id UUID NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','committed','settled')),
 files JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(files)='array'),
 storage_identity TEXT NOT NULL CHECK(storage_identity ~ '^[a-f0-9]{64}$'),
 remaining INTEGER NOT NULL DEFAULT 0 CHECK(remaining>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX site_backup_restore_jobs_source_idx ON public.site_backup_restore_jobs(source_site_id,state,created_at);
ALTER TABLE public.site_backup_restore_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_backup_restore_jobs FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.site_backup_restore_jobs FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.site_backup_restore_jobs FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON public.site_backup_restore_jobs TO service_role; END IF;
END $$;
