-- Private upload/cleanup evidence is retained before any provider write.
ALTER TABLE commerce_digital_files ADD COLUMN storage_identity text, ADD COLUMN storage_provider text, ADD COLUMN state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','retiring','removed'));
CREATE TABLE commerce_private_file_jobs (
 id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE, product_id uuid NOT NULL,
 filename text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 3145728),
 storage_path text NOT NULL, storage_identity text NOT NULL CHECK(storage_identity ~ '^[a-f0-9]{64}$'),
 storage_provider text NOT NULL CHECK(storage_provider IN ('local','s3','supabase')),
 binary_fingerprint text NOT NULL CHECK(binary_fingerprint ~ '^[a-f0-9]{64}$'), expires_days integer NOT NULL CHECK(expires_days BETWEEN 1 AND 365), max_downloads integer NOT NULL CHECK(max_downloads BETWEEN 1 AND 100),
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','registered','cleanup-pending','removed')),
 actor_id uuid, cleanup_actor_id uuid, error_code text, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(site_id,storage_identity,storage_path)
);
CREATE INDEX commerce_private_file_jobs_site ON commerce_private_file_jobs(site_id,state,created_at);
-- Claims retain immutable historical identity after order deletion. Pending checkout snapshots are protected too.
CREATE TABLE commerce_private_file_claims (
 site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE, file_id uuid NOT NULL REFERENCES commerce_digital_files(id),
 order_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(site_id,file_id,order_id)
);
ALTER TABLE commerce_private_file_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_private_file_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commerce_private_file_jobs,commerce_private_file_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON commerce_private_file_jobs,commerce_private_file_claims TO service_role;
CREATE FUNCTION commerce_private_order_items(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE items jsonb;
BEGIN
 IF NOT lower(v::text) LIKE '%digitalfileid%' THEN RETURN '[]'::jsonb; END IF;
 items := CASE WHEN jsonb_typeof(v->'items')='string' THEN (v->>'items')::jsonb ELSE v->'items' END;
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)>100 THEN RAISE EXCEPTION 'COMMERCE_FILE_SNAPSHOT_INVALID'; END IF;
 RETURN items;
END $$;
CREATE FUNCTION commerce_private_order_claims() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; f commerce_digital_files%ROWTYPE; old_items jsonb := '[]'::jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM content_collections WHERE id=NEW.collection_id AND site_id=NEW.site_id AND slug='orders') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN old_items := commerce_private_order_items(OLD.values); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(commerce_private_order_items(NEW.values)) LOOP
  IF item->>'digitalFileId' IS NULL THEN CONTINUE; END IF;
  SELECT * INTO f FROM commerce_digital_files WHERE id=(item->>'digitalFileId')::uuid AND site_id=NEW.site_id AND product_id=(item->>'productId')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCE_FILE_SNAPSHOT_UNAVAILABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_items) previous WHERE previous->>'digitalFileId'=item->>'digitalFileId') AND (f.state<>'active' OR f.storage_identity IS NULL) THEN RAISE EXCEPTION 'COMMERCE_FILE_SNAPSHOT_UNAVAILABLE'; END IF;
  INSERT INTO commerce_private_file_claims(site_id,file_id,order_id) VALUES(NEW.site_id,f.id,NEW.id) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_private_order_claim BEFORE INSERT OR UPDATE OF values ON content_collection_records FOR EACH ROW EXECUTE FUNCTION commerce_private_order_claims();
-- Legacy snapshots receive conservative claims even if storage identity cannot be verified.
INSERT INTO commerce_private_file_claims(site_id,file_id,order_id)
SELECT f.site_id,f.id,r.id FROM commerce_digital_files f JOIN content_collection_records r ON r.site_id=f.site_id JOIN content_collections c ON c.id=r.collection_id AND c.site_id=r.site_id AND c.slug='orders' WHERE lower(r.values::text) LIKE '%'||f.id::text||'%' ON CONFLICT DO NOTHING;
CREATE FUNCTION commerce_private_site_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM commerce_digital_files WHERE site_id=OLD.id AND state<>'removed') OR EXISTS(SELECT 1 FROM commerce_private_file_jobs WHERE site_id=OLD.id AND state<>'removed') THEN RAISE EXCEPTION 'SITE_PRIVATE_COMMERCE_FILES_REMAIN'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER commerce_private_site_delete BEFORE DELETE ON sites FOR EACH ROW EXECUTE FUNCTION commerce_private_site_delete_guard();
