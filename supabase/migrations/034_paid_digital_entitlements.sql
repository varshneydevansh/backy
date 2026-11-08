-- Private server-only digital fulfilment. Public discovery contains no file paths or proof hashes.
CREATE TABLE commerce_digital_files (
 id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 -- Historical product identity survives catalog deletion; purchased files remain available.
 product_id uuid NOT NULL,
 filename text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 3145728),
 storage_path text NOT NULL, binary_fingerprint text NOT NULL CHECK(binary_fingerprint ~ '^[a-f0-9]{64}$'), expires_days integer NOT NULL CHECK(expires_days BETWEEN 1 AND 365),
 max_downloads integer NOT NULL CHECK(max_downloads BETWEEN 1 AND 100), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX commerce_digital_files_product ON commerce_digital_files(site_id, product_id, created_at DESC);
CREATE TABLE commerce_buyer_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES content_collection_records(id) ON DELETE CASCADE,
 file_id uuid NOT NULL REFERENCES commerce_digital_files(id), expires_at timestamptz NOT NULL,
 max_downloads integer NOT NULL CHECK(max_downloads BETWEEN 1 AND 100), downloads integer NOT NULL DEFAULT 0 CHECK(downloads >= 0),
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(site_id, order_id, file_id)
);
CREATE TABLE commerce_entitlement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 order_id uuid REFERENCES content_collection_records(id) ON DELETE CASCADE, entitlement_id uuid REFERENCES commerce_buyer_entitlements(id) ON DELETE CASCADE,
 file_id uuid REFERENCES commerce_digital_files(id),
 kind text NOT NULL CHECK(kind IN ('file.registered','issued','download.admitted','revoked')), actor_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX commerce_entitlement_events_order ON commerce_entitlement_events(site_id,order_id,created_at);
ALTER TABLE commerce_digital_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_buyer_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_entitlement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commerce_digital_files,commerce_buyer_entitlements,commerce_entitlement_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON commerce_digital_files,commerce_buyer_entitlements,commerce_entitlement_events TO service_role;
