-- Private duplicate protection. No recipients, message bodies, provider keys or attachment bytes.
CREATE TABLE mailbox_management_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 binding_id text NOT NULL CHECK (binding_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$'),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK (operation IN ('mailbox','alias')),
 address text NOT NULL CHECK (length(address) <= 304 AND address ~ '^[a-z0-9._-]+@[a-z0-9.-]+$'), target_binding_id text,
 CHECK ((operation = 'mailbox' AND target_binding_id IS NULL) OR (operation = 'alias' AND target_binding_id IS NOT NULL AND target_binding_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','rejected','uncertain')),
 status_code integer CHECK (status_code BETWEEN 100 AND 599),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mailbox_management_site_binding_key_idx ON mailbox_management_attempts(site_id,binding_id,idempotency_key);
CREATE INDEX mailbox_management_history_idx ON mailbox_management_attempts(site_id,binding_id,created_at);
ALTER TABLE mailbox_management_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mailbox_management_attempts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON mailbox_management_attempts FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON mailbox_management_attempts FROM authenticated; END IF;
END $$;
-- Keep the idempotency boundary permanent; only pending -> one terminal outcome is writable.
CREATE FUNCTION protect_mailbox_management_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Mailbox duplicate evidence cannot be deleted' USING ERRCODE = '23514'; END IF;
 IF ROW(NEW.id,NEW.site_id,NEW.binding_id,NEW.idempotency_key,NEW.fingerprint,NEW.created_at,NEW.operation,NEW.address,NEW.target_binding_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.site_id,OLD.binding_id,OLD.idempotency_key,OLD.fingerprint,OLD.created_at,OLD.operation,OLD.address,OLD.target_binding_id)
    OR OLD.state <> 'pending' OR NEW.state NOT IN ('accepted','rejected','uncertain') THEN
  RAISE EXCEPTION 'Mailbox send identity or settled outcome cannot be replaced' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mailbox_management_attempt_immutable BEFORE UPDATE OR DELETE ON mailbox_management_attempts FOR EACH ROW EXECUTE FUNCTION protect_mailbox_management_attempt();
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE TRUNCATE ON mailbox_management_attempts FROM service_role; END IF;
END $$;
