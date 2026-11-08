-- Access removal is a retained admission tombstone, never provider identity deletion or content erasure.
-- Preserve visitor_member_id attribution and unique site/provider identity; enrollment must not revive it.
ALTER TABLE public.site_visitors DROP CONSTRAINT site_visitors_status_check;
ALTER TABLE public.site_visitors ADD CONSTRAINT site_visitors_status_check CHECK(status IN ('active','suspended','removed'));
CREATE INDEX site_visitors_management_idx ON public.site_visitors(site_id, created_at DESC, id DESC);
