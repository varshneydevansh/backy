-- Owner investigations retain the original provider outcome and never authorize delivery replay.
ALTER TABLE public.comment_delivery_attempts ADD COLUMN provider_evidence JSONB;
ALTER TABLE public.comment_delivery_attempts ADD CONSTRAINT comment_delivery_attempt_site_id UNIQUE(site_id,id);
CREATE TABLE public.comment_delivery_reconciliations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 attempt_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 200),
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
 observed_updated_at TIMESTAMPTZ NOT NULL,
 observed_state TEXT NOT NULL CHECK(observed_state IN ('pending','uncertain')),
 evidence TEXT NOT NULL CHECK(evidence IN ('provider-console-reviewed','recipient-report-reviewed','outcome-unavailable')),
 disposition TEXT NOT NULL CHECK(disposition = 'retain-without-resend'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,attempt_id) REFERENCES public.comment_delivery_attempts(site_id,id) ON DELETE RESTRICT,
 UNIQUE(site_id,attempt_id,version)
);
ALTER TABLE public.comment_delivery_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_delivery_reconciliations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.comment_delivery_reconciliations FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.comment_delivery_reconciliations FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE ALL ON public.comment_delivery_reconciliations FROM service_role; GRANT SELECT,INSERT ON public.comment_delivery_reconciliations TO service_role; END IF;
END $$;
ALTER TABLE public.form_delivery_attempts ADD COLUMN provider_evidence JSONB;
ALTER TABLE public.form_delivery_attempts ADD CONSTRAINT form_delivery_attempt_site_id UNIQUE(site_id,id);
CREATE TABLE public.form_delivery_reconciliations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 attempt_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 200),
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
 observed_updated_at TIMESTAMPTZ NOT NULL,
 observed_state TEXT NOT NULL CHECK(observed_state IN ('pending','uncertain')),
 evidence TEXT NOT NULL CHECK(evidence IN ('provider-console-reviewed','recipient-report-reviewed','outcome-unavailable')),
 disposition TEXT NOT NULL CHECK(disposition = 'retain-without-resend'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,attempt_id) REFERENCES public.form_delivery_attempts(site_id,id) ON DELETE RESTRICT,
 UNIQUE(site_id,attempt_id,version)
);
ALTER TABLE public.form_delivery_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_delivery_reconciliations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.form_delivery_reconciliations FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.form_delivery_reconciliations FROM authenticated; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE ALL ON public.form_delivery_reconciliations FROM service_role; GRANT SELECT,INSERT ON public.form_delivery_reconciliations TO service_role; END IF;
END $$;
CREATE FUNCTION public.retain_delivery_investigation() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Delivery investigation history is append-only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER retain_comment_delivery_investigation BEFORE UPDATE OR DELETE ON public.comment_delivery_reconciliations FOR EACH ROW EXECUTE FUNCTION public.retain_delivery_investigation();
CREATE TRIGGER retain_form_delivery_investigation BEFORE UPDATE OR DELETE ON public.form_delivery_reconciliations FOR EACH ROW EXECUTE FUNCTION public.retain_delivery_investigation();
CREATE TRIGGER retain_comment_delivery_investigation_truncate BEFORE TRUNCATE ON public.comment_delivery_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION public.retain_delivery_investigation();
CREATE TRIGGER retain_form_delivery_investigation_truncate BEFORE TRUNCATE ON public.form_delivery_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION public.retain_delivery_investigation();
