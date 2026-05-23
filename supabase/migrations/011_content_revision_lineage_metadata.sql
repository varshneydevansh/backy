-- Persist first-class revision lineage and operation metadata for page/blog rollback graphs.

ALTER TABLE public.content_revisions
  ADD COLUMN IF NOT EXISTS parent_revision_id TEXT,
  ADD COLUMN IF NOT EXISTS operation TEXT,
  ADD COLUMN IF NOT EXISTS restore_target_revision_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_content_revisions_parent_revision
  ON public.content_revisions(parent_revision_id);

CREATE INDEX IF NOT EXISTS idx_content_revisions_operation
  ON public.content_revisions(site_id, target_type, target_id, operation);
