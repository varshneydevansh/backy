-- Visitor membership and sessions are separate from CMS profiles and operator credentials.
CREATE TABLE public.site_visitors (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 provider_issuer TEXT NOT NULL, provider_subject TEXT NOT NULL,
 email TEXT NOT NULL CHECK(email = lower(email)), display_name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(site_id, provider_issuer, provider_subject), UNIQUE(site_id, email), UNIQUE(site_id,id)
);
CREATE TABLE public.visitor_sessions (
 token_hash TEXT PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE, member_id UUID NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE CASCADE
);
CREATE INDEX visitor_sessions_member_idx ON public.visitor_sessions(site_id,member_id);
CREATE TABLE public.visitor_auth_rate_limits (
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE, key_hash TEXT NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),
 count INTEGER NOT NULL DEFAULT 1, reset_at TIMESTAMPTZ NOT NULL, UNIQUE(site_id,key_hash)
);
CREATE TABLE public.visitor_recovery_challenges (
 token_hash TEXT PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'), site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 member_id UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE CASCADE
);
ALTER TABLE public.site_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_recovery_challenges ENABLE ROW LEVEL SECURITY;
-- No browser policies. Provider user IDs/JWTs cannot read membership, sessions, or credentials directly.
REVOKE ALL ON public.site_visitors, public.visitor_sessions, public.visitor_auth_rate_limits, public.visitor_recovery_challenges FROM anon, authenticated;

-- Existing guest/operator history remains unchanged. New verified visitor attribution is separate.
ALTER TABLE public.comments ADD COLUMN visitor_member_id UUID;
ALTER TABLE public.comments ADD CONSTRAINT comments_visitor_site_fk FOREIGN KEY(site_id,visitor_member_id)
 REFERENCES public.site_visitors(site_id,id) ON DELETE SET NULL (visitor_member_id);
ALTER TABLE public.form_submissions ADD COLUMN visitor_member_id UUID;
ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_visitor_site_fk FOREIGN KEY(site_id,visitor_member_id)
 REFERENCES public.site_visitors(site_id,id) ON DELETE SET NULL (visitor_member_id);
