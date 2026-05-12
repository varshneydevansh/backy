-- Durable comment author blocklist for moderation actions.

CREATE TABLE IF NOT EXISTS public.comment_blocklist (
  id TEXT PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comment_blocklist_type_check CHECK (type IN ('email', 'ip'))
);

ALTER TABLE public.comment_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view comment blocklist" ON public.comment_blocklist;
CREATE POLICY "Team members can view comment blocklist"
  ON public.comment_blocklist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comment_blocklist.site_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Editors can manage comment blocklist" ON public.comment_blocklist;
CREATE POLICY "Editors can manage comment blocklist"
  ON public.comment_blocklist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comment_blocklist.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = comment_blocklist.site_id
        AND tm.user_id = auth.uid()
        AND tm.role::TEXT IN ('owner', 'admin', 'editor')
    )
  );

CREATE INDEX IF NOT EXISTS idx_comment_blocklist_site_type ON public.comment_blocklist(site_id, type);
CREATE INDEX IF NOT EXISTS idx_comment_blocklist_created_at ON public.comment_blocklist(created_at);
