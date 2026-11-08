-- Campaign content/audience are frozen at queue admission. External SMTP acceptance is not arrival.
CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200), text text NOT NULL CHECK (length(text) BETWEEN 1 AND 30000), form_id uuid,
 state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','scheduled','queued','processing','completed','cancelled')),
 version integer NOT NULL DEFAULT 1, request_key text NOT NULL, request_hash text NOT NULL, actor_id text,
 recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count BETWEEN 0 AND 100), scheduled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(site_id,request_key), UNIQUE(site_id,id)
);
CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL, campaign_id uuid NOT NULL, contact_id uuid REFERENCES public.form_contacts(id) ON DELETE SET NULL,
 email text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','accepted','delivered','failed','uncertain','suppressed','cancelled','bounced','complained')),
 provider_message_id text, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,campaign_id) REFERENCES public.newsletter_campaigns(site_id,id) ON DELETE CASCADE, UNIQUE(campaign_id,email)
);
CREATE TABLE IF NOT EXISTS public.newsletter_suppressions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE, email text NOT NULL,
 reason text NOT NULL CHECK (reason IN ('unsubscribed','bounced','complained')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(site_id,email)
);
CREATE TABLE IF NOT EXISTS public.newsletter_feedback_events (
 id text PRIMARY KEY, site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE, delivery_id uuid NOT NULL REFERENCES public.newsletter_deliveries(id) ON DELETE CASCADE,
 kind text NOT NULL, evidence text, actor_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.newsletter_dispatch_gate (id text PRIMARY KEY, day text NOT NULL, count integer NOT NULL, next_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS newsletter_campaign_site_idx ON public.newsletter_campaigns(site_id,created_at);
CREATE INDEX IF NOT EXISTS newsletter_delivery_queue_idx ON public.newsletter_deliveries(site_id,campaign_id,state);
-- Backend-only tables: no authenticated/anonymous browser access; API applies site permissions.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['newsletter_campaigns','newsletter_deliveries','newsletter_suppressions','newsletter_feedback_events','newsletter_dispatch_gate'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',t);
 END LOOP;
END $$;
