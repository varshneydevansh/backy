-- Bounded resumable staging, server-only. Uses durable PostgreSQL rather than
-- Vercel process memory/filesystem; bytes are not served until normal admission.
CREATE TABLE public.media_upload_sessions (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 255),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  uploaded_offset integer NOT NULL DEFAULT 0 CHECK (uploaded_offset >= 0 AND uploaded_offset <= size_bytes),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  state text NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading','completing','complete','failed')),
  media_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_upload_sessions_site_idx ON public.media_upload_sessions(site_id,state,expires_at);
CREATE TABLE public.media_upload_chunks (
  upload_id uuid NOT NULL REFERENCES public.media_upload_sessions(id) ON DELETE CASCADE,
  chunk_offset integer NOT NULL CHECK (chunk_offset >= 0),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 1048576),
  PRIMARY KEY (upload_id,chunk_offset)
);
ALTER TABLE public.media_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_upload_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_upload_sessions, public.media_upload_chunks FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.media_upload_sessions, public.media_upload_chunks FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.media_upload_sessions, public.media_upload_chunks FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON public.media_upload_sessions, public.media_upload_chunks TO service_role; END IF;
END $$;
