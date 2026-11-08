-- Server-held S256 verifiers for explicit site-bound signup/recovery flows.
CREATE TABLE public.visitor_pkce_flows (
 state_hash TEXT PRIMARY KEY CHECK(state_hash ~ '^[a-f0-9]{64}$'),
 site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('signup','recovery')),
 origin TEXT NOT NULL, return_url TEXT NOT NULL,
 verifier TEXT NOT NULL CHECK(verifier ~ '^[A-Za-z0-9_-]{43}$'),
 expected_email TEXT NOT NULL CHECK(expected_email = lower(expected_email)),
 display_name TEXT NOT NULL DEFAULT '' CHECK(length(display_name) <= 120),
 member_id UUID, expires_at TIMESTAMPTZ NOT NULL,
 CHECK((purpose = 'signup' AND member_id IS NULL) OR (purpose = 'recovery' AND member_id IS NOT NULL)),
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE CASCADE
);
CREATE INDEX visitor_pkce_flows_expiry_idx ON public.visitor_pkce_flows(site_id,expires_at);
ALTER TABLE public.visitor_pkce_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitor_pkce_flows FROM PUBLIC, anon, authenticated;
-- No browser policies. Only Backy's trusted persisted database runtime reads the verifier.
