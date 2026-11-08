-- Retain immutable reusable template snapshots separately from bounded audit logs.
CREATE TABLE IF NOT EXISTS public.template_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  source TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('baseline', 'save', 'restore')),
  restored_from_revision_id TEXT,
  actor_id TEXT,
  request_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_revisions_identity ON public.template_revisions(site_id, template_id, created_at DESC);
ALTER TABLE public.template_revisions ENABLE ROW LEVEL SECURITY;
-- No browser policy: only the protected backend can read or append historical draft content.
REVOKE ALL ON public.template_revisions FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.reject_template_revision_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Template revisions are immutable; append a new revision instead';
END;
$$;
DROP TRIGGER IF EXISTS template_revision_immutable ON public.template_revisions;
CREATE TRIGGER template_revision_immutable BEFORE UPDATE ON public.template_revisions
FOR EACH ROW EXECUTE FUNCTION public.reject_template_revision_update();
