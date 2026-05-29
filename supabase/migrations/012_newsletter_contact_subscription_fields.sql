-- ============================================================================
-- BACKY CMS - NEWSLETTER CONTACT SUBSCRIPTION FIELDS
-- ============================================================================
--
-- Makes newsletter subscriber state queryable on form_contacts while keeping
-- raw consent/topic evidence in source_values for audit and import portability.
-- ============================================================================

ALTER TABLE IF EXISTS public.form_contacts
  ADD COLUMN IF NOT EXISTS newsletter_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_subscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS newsletter_unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS newsletter_topics TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_source TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_consent BOOLEAN,
  ADD COLUMN IF NOT EXISTS newsletter_consent_text TEXT;

ALTER TABLE IF EXISTS public.form_contacts
  DROP CONSTRAINT IF EXISTS form_contacts_newsletter_subscription_status_check;

ALTER TABLE IF EXISTS public.form_contacts
  ADD CONSTRAINT form_contacts_newsletter_subscription_status_check
  CHECK (
    newsletter_subscription_status IS NULL
    OR newsletter_subscription_status IN ('subscribed', 'unsubscribed', 'pending', 'bounced', 'complained')
  );

CREATE INDEX IF NOT EXISTS form_contacts_site_newsletter_status_updated_idx
  ON public.form_contacts(site_id, newsletter_subscription_status, updated_at);
