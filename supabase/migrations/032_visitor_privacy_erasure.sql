-- Local selected-member erasure fences and proven contributor history. No provider deletion.
ALTER TABLE public.comments ADD COLUMN privacy_erased_at timestamptz;
ALTER TABLE public.form_submissions ADD COLUMN privacy_erased_at timestamptz;
ALTER TABLE public.form_contacts ADD COLUMN provenance_ambiguous boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX form_contacts_site_identity_idx ON public.form_contacts(site_id,id);
CREATE TABLE public.form_contact_contributors (
 site_id uuid NOT NULL, contact_id uuid NOT NULL, submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE RESTRICT,
 member_id uuid, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(contact_id,submission_id),
 FOREIGN KEY(site_id,contact_id) REFERENCES public.form_contacts(site_id,id) ON DELETE CASCADE,
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE RESTRICT
);
-- A legacy pointer is one known contributor, never proof that older merges did not exist.
INSERT INTO public.form_contact_contributors(site_id,contact_id,submission_id,member_id)
 SELECT c.site_id,c.id,s.id,s.visitor_member_id FROM public.form_contacts c JOIN public.form_submissions s
 ON s.site_id=c.site_id AND s.form_id=c.form_id AND s.id=c.source_submission_id;
CREATE INDEX form_contact_contributors_member_idx ON public.form_contact_contributors(site_id,member_id);
CREATE TABLE public.visitor_privacy_fences (
 site_id uuid NOT NULL, member_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_id,member_id), FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.visitor_erasure_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL, member_id uuid NOT NULL, actor_id uuid NOT NULL,
 choices jsonb NOT NULL, fingerprint text NOT NULL, expires_at timestamptz NOT NULL,
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE CASCADE
);
CREATE TABLE public.visitor_erasure_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL, member_id uuid NOT NULL, actor_id uuid NOT NULL,
 preview_id uuid NOT NULL UNIQUE, choices jsonb NOT NULL, counts jsonb NOT NULL, request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,member_id) REFERENCES public.site_visitors(site_id,id) ON DELETE RESTRICT
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['form_contact_contributors','visitor_privacy_fences','visitor_erasure_previews','visitor_erasure_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
 END LOOP;
END $$;
-- Retained redacted rows cannot be repopulated by delayed moderation/import writes.
CREATE FUNCTION public.backy_reject_erased_source_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.privacy_erased_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.visitor_privacy_fences f WHERE f.site_id=OLD.site_id AND f.member_id=OLD.visitor_member_id) THEN RAISE EXCEPTION 'VISITOR_PRIVACY_FENCED' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comments_erasure_write_fence BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.backy_reject_erased_source_write();
CREATE TRIGGER submissions_erasure_write_fence BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.backy_reject_erased_source_write();

CREATE FUNCTION public.backy_reject_fenced_contact_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.form_contact_contributors p JOIN public.visitor_privacy_fences f ON f.site_id=p.site_id AND f.member_id=p.member_id WHERE p.site_id=OLD.site_id AND p.contact_id=OLD.id) OR EXISTS(SELECT 1 FROM public.form_submissions s JOIN public.visitor_privacy_fences f ON f.site_id=s.site_id AND f.member_id=s.visitor_member_id WHERE s.site_id=OLD.site_id AND s.form_id=OLD.form_id AND s.id=OLD.source_submission_id) THEN RAISE EXCEPTION 'VISITOR_PRIVACY_FENCED' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contact_erasure_write_fence BEFORE UPDATE ON public.form_contacts FOR EACH ROW EXECUTE FUNCTION public.backy_reject_fenced_contact_write();
