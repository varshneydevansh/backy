-- Composite indexes for durable collection route, record filter, and dynamic dataset queries.

CREATE INDEX IF NOT EXISTS content_collections_site_slug_idx
  ON public.content_collections(site_id, slug);

CREATE INDEX IF NOT EXISTS content_collections_site_status_updated_idx
  ON public.content_collections(site_id, status, updated_at);

CREATE INDEX IF NOT EXISTS content_collections_site_route_idx
  ON public.content_collections(site_id, route_pattern, list_route_pattern);

CREATE INDEX IF NOT EXISTS content_collection_records_site_collection_status_updated_idx
  ON public.content_collection_records(site_id, collection_id, status, updated_at);

CREATE INDEX IF NOT EXISTS content_collection_records_site_collection_slug_idx
  ON public.content_collection_records(site_id, collection_id, slug);
