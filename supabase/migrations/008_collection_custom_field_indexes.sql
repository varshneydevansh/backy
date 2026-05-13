-- Richer Postgres indexes for field-heavy CMS collection datasets.
--
-- These keep collection record filtering/search responsive when custom records
-- carry many JSONB fields and connected frontends page through large datasets.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Exact custom-field filters use values @> '{"field": value}'::jsonb.
-- jsonb_path_ops keeps this containment index compact for large record values.
CREATE INDEX IF NOT EXISTS idx_content_collection_records_values_path_gin
  ON public.content_collection_records
  USING GIN (values jsonb_path_ops);

-- Admin/public search uses lower(slug || values::text) LIKE '%query%'.
-- A trigram expression index prevents full scans across large custom datasets.
CREATE INDEX IF NOT EXISTS idx_content_collection_records_search_trgm
  ON public.content_collection_records
  USING GIN ((lower(coalesce(slug, '') || ' ' || coalesce(values::text, ''))) gin_trgm_ops);

-- Public collection feeds overwhelmingly read published records by collection.
CREATE INDEX IF NOT EXISTS content_collection_records_public_updated_idx
  ON public.content_collection_records(site_id, collection_id, updated_at DESC)
  WHERE status = 'published';
