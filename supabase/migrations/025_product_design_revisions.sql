-- Private product design preimages; commerce operational values never enter history.
CREATE TABLE public.product_design_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 collection_id UUID NOT NULL REFERENCES public.content_collections(id) ON DELETE CASCADE,
 record_id UUID NOT NULL REFERENCES public.content_collection_records(id) ON DELETE CASCADE,
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='backy.product-design-version.v1' AND octet_length(snapshot::text)<=8388608),
 operation TEXT NOT NULL CHECK(operation IN ('template-upgrade','restore')),
 template_id TEXT CHECK(template_id IS NULL OR length(template_id) BETWEEN 1 AND 128),
 target_revision_id TEXT CHECK(target_revision_id IS NULL OR length(target_revision_id) BETWEEN 1 AND 128),
 actor_id TEXT CHECK(actor_id IS NULL OR length(actor_id) BETWEEN 1 AND 200),
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_design_revisions_scope_idx ON public.product_design_revisions(site_id,collection_id,record_id,created_at DESC,id DESC);
ALTER TABLE public.product_design_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_design_revisions FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.product_design_revisions FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.product_design_revisions FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE ALL ON public.product_design_revisions FROM service_role; GRANT SELECT,INSERT ON public.product_design_revisions TO service_role; END IF;
END $$;
CREATE FUNCTION public.guard_product_design_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM public.content_collection_records r JOIN public.content_collections c ON c.id=r.collection_id AND c.site_id=r.site_id WHERE r.id=NEW.record_id AND r.site_id=NEW.site_id AND r.collection_id=NEW.collection_id AND c.slug='products') THEN
   RAISE EXCEPTION 'Product design revision scope is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 -- Only ordinary parent deletion may cascade history removal. Direct history mutation is denied.
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.content_collection_records r WHERE r.id=OLD.record_id)
    OR NOT EXISTS(SELECT 1 FROM public.content_collections c WHERE c.id=OLD.collection_id)
    OR NOT EXISTS(SELECT 1 FROM public.sites s WHERE s.id=OLD.site_id) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Product design history is append-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER product_design_revision_insert BEFORE INSERT ON public.product_design_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_product_design_revision();
CREATE TRIGGER product_design_revision_retain BEFORE UPDATE OR DELETE ON public.product_design_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_product_design_revision();
CREATE TRIGGER product_design_revision_retain_truncate BEFORE TRUNCATE ON public.product_design_revisions FOR EACH STATEMENT EXECUTE FUNCTION public.guard_product_design_revision();
