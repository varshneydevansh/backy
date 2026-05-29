import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Newspaper,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createForm,
  getAdminApiBase,
  listContactSegments,
  listFormContacts,
  listForms,
  updateContact,
  type AdminContact,
  type ContactSegmentAnalytics,
  type ContactStatus,
  type FormDefinition,
  type FormDefinitionInput,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthStore, type User } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { cn, formatDate } from '@/lib/utils';

interface NewsletterSearch {
  siteId?: string;
  formId?: string;
}

type NewsletterPermissionKey = 'forms.view' | 'forms.manage' | 'forms.export' | 'pages.edit';

interface NewsletterSubscriber {
  contact: AdminContact;
  form: FormDefinition;
}

const NEWSLETTER_SCHEMA_VERSION = 'backy.newsletter-management-handoff.v1';
const NEWSLETTER_SYNC_POLICY_VERSION = 'backy.newsletter-sync-boundary.v1';

const NEWSLETTER_PERMISSION_ROLE_DEFAULTS: Record<NewsletterPermissionKey, Array<User['role']>> = {
  'forms.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.manage': ['owner', 'admin', 'editor'],
  'forms.export': ['owner', 'admin'],
  'pages.edit': ['owner', 'admin', 'editor'],
};

const NEWSLETTER_FORM_INPUT: Omit<FormDefinitionInput, 'name'> = {
  title: 'Newsletter signup',
  description: 'Public newsletter subscriber capture with topic preference and consent evidence.',
  audience: 'public',
  isActive: true,
  fields: [
    { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Optional' },
    {
      key: 'topics',
      label: 'Topics',
      type: 'select',
      options: ['Investigations', 'Local reports', 'Policy updates', 'Corrections'],
      defaultValue: 'Investigations',
    },
    { key: 'consent', label: 'I agree to receive email updates and can unsubscribe anytime.', type: 'checkbox', required: true },
    { key: 'signup_source', label: 'Signup source', type: 'text', placeholder: 'Website newsletter page' },
  ],
  successMessage: 'Subscription confirmed. Watch your inbox for the next report.',
  moderationMode: 'auto-approve',
  enableHoneypot: true,
  enableCaptcha: false,
  contactShare: {
    enabled: true,
    nameField: 'name',
    emailField: 'email',
    notesField: 'topics',
    dedupeByEmail: true,
  },
  consentSettings: {
    policyLabel: 'Newsletter consent',
    retentionDays: 365,
    deleteAfterDays: 1095,
    exportIncludesIp: false,
  },
  settings: {
    backyIntent: 'newsletter',
    schemaVersion: 'backy.newsletter-form.v1',
    source: 'newsletter-workspace',
    subscriptionManagement: {
      statusField: 'status',
      emailField: 'email',
      topicField: 'topics',
      consentField: 'consent',
      sourceField: 'signup_source',
    },
  },
};

const normalizeSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/newsletter')({
  validateSearch: (search: Record<string, unknown>): NewsletterSearch => ({
    siteId: normalizeSearchString(search.siteId),
    formId: normalizeSearchString(search.formId),
  }),
  component: NewsletterRoute,
});

function NewsletterRoute() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const currentAdmin = useAuthStore((state) => state.user);
  const sites = useStore((state) => state.sites);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [contactsByForm, setContactsByForm] = useState<Record<string, AdminContact[]>>({});
  const [contactSegments, setContactSegments] = useState<ContactSegmentAnalytics | null>(null);
  const [selectedFormId, setSelectedFormId] = useState(routeSearch.formId || 'all');
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const adminBaseUrl = useMemo(() => getAdminApiBase(), []);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const permissionAllowed = useCallback((key: NewsletterPermissionKey) => (
    isAdminPermissionAllowed(null, currentAdmin, key, NEWSLETTER_PERMISSION_ROLE_DEFAULTS)
  ), [currentAdmin]);
  const canViewNewsletter = permissionAllowed('forms.view');
  const canManageNewsletter = permissionAllowed('forms.manage');
  const canExportNewsletter = permissionAllowed('forms.export');
  const canEditPages = permissionAllowed('pages.edit');
  const viewDisabledReason = canViewNewsletter ? '' : adminPermissionReason(null, currentAdmin, 'forms.view', NEWSLETTER_PERMISSION_ROLE_DEFAULTS);
  const manageDisabledReason = canManageNewsletter ? '' : adminPermissionReason(null, currentAdmin, 'forms.manage', NEWSLETTER_PERMISSION_ROLE_DEFAULTS);
  const exportDisabledReason = canExportNewsletter ? '' : adminPermissionReason(null, currentAdmin, 'forms.export', NEWSLETTER_PERMISSION_ROLE_DEFAULTS);
  const pageDisabledReason = canEditPages ? '' : adminPermissionReason(null, currentAdmin, 'pages.edit', NEWSLETTER_PERMISSION_ROLE_DEFAULTS);
  const newsletterForms = useMemo(() => forms.filter(isNewsletterForm), [forms]);
  const selectedNewsletterForms = useMemo(() => (
    selectedFormId === 'all'
      ? newsletterForms
      : newsletterForms.filter((form) => form.id === selectedFormId)
  ), [newsletterForms, selectedFormId]);
  const subscribers = useMemo<NewsletterSubscriber[]>(() => (
    selectedNewsletterForms.flatMap((form) => (
      (contactsByForm[form.id] || []).map((contact) => ({ contact, form }))
    ))
  ), [contactsByForm, selectedNewsletterForms]);
  const metrics = useMemo(() => buildNewsletterMetrics(subscribers), [subscribers]);
  const topicRows = useMemo(() => buildTopicRows(subscribers), [subscribers]);
  const latestSubscribers = useMemo(() => (
    [...subscribers].sort((a, b) => (
      (Date.parse(b.contact.createdAt) || 0) - (Date.parse(a.contact.createdAt) || 0)
    ))
  ), [subscribers]);
  const contactSegmentsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/contact-segments`;
  const newsletterSubscribersUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/newsletter/subscribers`;
  const newsletterApiUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/contact-lists`;
  const publicNewsletterSubscribersUrl = `${publicBaseUrl}/api/sites/${activeSiteId}/newsletter/subscribers`;
  const newsletterPageRoute = `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=newsletter&templateSource=backy-canvas&focus=canvas`;
  const blogRoute = `/blog/new?siteId=${encodeURIComponent(activeSiteId)}&templateSource=backy-canvas&focus=canvas`;
  const newsletterHandoff = useMemo(() => buildNewsletterHandoff({
    activeSiteId,
    adminBaseUrl,
    publicBaseUrl,
    forms: newsletterForms,
    subscribers,
    contactSegments,
  }), [activeSiteId, adminBaseUrl, contactSegments, newsletterForms, publicBaseUrl, subscribers]);
  const newsletterHandoffText = useMemo(() => JSON.stringify(newsletterHandoff, null, 2), [newsletterHandoff]);
  const actionBusy = isLoading || Boolean(isMutating);
  const viewActionStatusId = 'newsletter-view-action-status';
  const manageActionStatusId = 'newsletter-manage-action-status';
  const exportActionStatusId = 'newsletter-export-action-status';
  const viewActionStatus = viewDisabledReason
    ? `Newsletter unavailable: ${viewDisabledReason}`
    : `Newsletter workspace ready for ${activeSiteId}.`;
  const manageActionStatus = manageDisabledReason
    ? `Newsletter management unavailable: ${manageDisabledReason}`
    : `Newsletter management available for ${activeSiteId}.`;
  const exportActionStatus = exportDisabledReason
    ? `Newsletter export unavailable: ${exportDisabledReason}`
    : `Newsletter export available for ${subscribers.length} subscriber${subscribers.length === 1 ? '' : 's'}.`;

  const loadNewsletter = useCallback(async () => {
    if (!canViewNewsletter) {
      setForms([]);
      setContactsByForm({});
      setContactSegments(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const loadedForms = await listForms(activeSiteId);
      const loadedNewsletterForms = loadedForms.filter(isNewsletterForm);
      const [segments, contactResults] = await Promise.all([
        listContactSegments(activeSiteId).catch(() => null),
        Promise.all(loadedNewsletterForms.map(async (form) => ({
          formId: form.id,
          contacts: await listFormContacts(activeSiteId, form.id, { limit: 500 })
            .then((result) => result.contacts)
            .catch(() => []),
        }))),
      ]);
      setForms(loadedForms);
      setContactSegments(segments);
      setContactsByForm(Object.fromEntries(contactResults.map((result) => [result.formId, result.contacts])));
      if (selectedFormId !== 'all' && !loadedNewsletterForms.some((form) => form.id === selectedFormId)) {
        setSelectedFormId('all');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load newsletter subscribers.');
    } finally {
      setIsLoading(false);
    }
  }, [activeSiteId, canViewNewsletter, selectedFormId]);

  useEffect(() => {
    void loadNewsletter();
  }, [loadNewsletter]);

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const selectSite = (nextSiteId: string) => {
    setSelectedSiteId(nextSiteId);
    setSelectedFormId('all');
    navigate({ to: '/newsletter', search: { siteId: nextSiteId }, replace: true });
  };

  const selectForm = (nextFormId: string) => {
    setSelectedFormId(nextFormId);
    navigate({
      to: '/newsletter',
      search: {
        siteId: activeSiteId,
        ...(nextFormId === 'all' ? {} : { formId: nextFormId }),
      },
      replace: true,
    });
  };

  const createNewsletterSignupForm = async () => {
    if (!canManageNewsletter || actionBusy) return;

    setIsMutating('create-form');
    setError(null);
    setNotice(null);
    try {
      const created = await createForm(activeSiteId, {
        ...NEWSLETTER_FORM_INPUT,
        name: `newsletter-${Date.now().toString(36)}`,
      });
      setNotice('Newsletter signup form created. It is active and ready for public submissions.');
      setSelectedFormId(created.id);
      navigate({ to: '/newsletter', search: { siteId: activeSiteId, formId: created.id }, replace: true });
      await loadNewsletter();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create newsletter signup form.');
    } finally {
      setIsMutating(null);
    }
  };

  const updateSubscriberStatus = async (subscriber: NewsletterSubscriber, status: ContactStatus) => {
    if (!canManageNewsletter || actionBusy) return;

    const mutationId = `${subscriber.contact.id}:${status}`;
    setIsMutating(mutationId);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateContact(activeSiteId, subscriber.form.id, subscriber.contact.id, { status });
      setContactsByForm((current) => ({
        ...current,
        [subscriber.form.id]: (current[subscriber.form.id] || []).map((contact) => (
          contact.id === updated.id ? updated : contact
        )),
      }));
      setNotice(`${subscriber.contact.email || subscriber.contact.name || 'Subscriber'} moved to ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update subscriber.');
    } finally {
      setIsMutating(null);
    }
  };

  const copyNewsletterText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(`${label} could not be copied. Use the visible API text instead.`);
    }
  };

  const exportNewsletterCsv = () => {
    if (!canExportNewsletter || subscribers.length === 0) return;

    const rows = [
      ['email', 'name', 'status', 'topics', 'signup_source', 'form_id', 'form_title', 'created_at', 'updated_at'],
      ...latestSubscribers.map(({ contact, form }) => [
        contact.email || '',
        contact.name || '',
        contact.status,
        readSourceValue(contact, 'topics'),
        readSourceValue(contact, 'signup_source') || readSourceValue(contact, 'source'),
        form.id,
        form.title || form.name,
        contact.createdAt,
        contact.updatedAt,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteId}-newsletter-subscribers.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${subscribers.length} newsletter subscriber${subscribers.length === 1 ? '' : 's'}.`);
  };

  const openNewsletterPageCreate = () => {
    if (!canEditPages || actionBusy) return;
    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'newsletter', templateSource: 'backy-canvas', focus: 'canvas' } });
  };

  const openBlogComposer = () => {
    navigate({ to: '/blog/new', search: { siteId: activeSiteId, templateSource: 'backy-canvas', focus: 'canvas' } });
  };

  return (
    <PageShell
      title="Newsletter"
      description="Manage subscriber capture, consent, segments, exports, and custom frontend handoff for publication workflows."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Newsletter site"
            value={activeSiteId}
            disabled={actionBusy}
            onChange={(event) => selectSite(event.target.value)}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="newsletter-site-select"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => void loadNewsletter()}
            disabled={actionBusy || !canViewNewsletter}
            title={viewDisabledReason || undefined}
            aria-describedby={viewActionStatusId}
            iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
            data-testid="newsletter-refresh"
            data-action-state={viewDisabledReason ? 'blocked' : 'ready'}
            data-action-status={viewActionStatus}
          >
            Refresh
          </Button>
        </div>
      }
    >
      <span id={viewActionStatusId} className="sr-only" aria-live="polite" data-testid="newsletter-view-action-status">
        {viewActionStatus}
      </span>
      <span id={manageActionStatusId} className="sr-only" aria-live="polite" data-testid="newsletter-manage-action-status">
        {manageActionStatus}
      </span>
      <span id={exportActionStatusId} className="sr-only" aria-live="polite" data-testid="newsletter-export-action-status">
        {exportActionStatus}
      </span>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="newsletter-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Publication audience desk</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                newsletterForms.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {newsletterForms.length > 0 ? 'Capture ready' : 'Setup needed'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Backy owns the subscriber database, consent evidence, topic segments, API handoff, and export/sync path. Bulk delivery, inbox reputation, bounces, and DNS authentication stay behind an email provider boundary.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button
              onClick={() => void createNewsletterSignupForm()}
              disabled={actionBusy || !canManageNewsletter}
              title={manageDisabledReason || undefined}
              aria-describedby={manageActionStatusId}
              iconStart={<UserPlus className="size-4" />}
              data-testid="newsletter-create-form"
              data-action-state={manageDisabledReason ? 'blocked' : 'ready'}
              data-action-status={manageActionStatus}
            >
              New signup form
            </Button>
            <Button
              variant="outline"
              onClick={openNewsletterPageCreate}
              disabled={actionBusy || !canEditPages}
              title={pageDisabledReason || undefined}
              iconStart={<FileText className="size-4" />}
              data-testid="newsletter-create-page"
            >
              Newsletter page
            </Button>
            <Button
              variant="outline"
              onClick={openBlogComposer}
              iconStart={<Newspaper className="size-4" />}
              data-testid="newsletter-new-post"
            >
              Write post
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Subscribers" value={String(metrics.total)} icon={<Mail className="size-4" />} />
          <Metric label="Active" value={String(metrics.active)} icon={<CheckCircle2 className="size-4" />} />
          <Metric label="Archived" value={String(metrics.archived)} icon={<Archive className="size-4" />} />
          <Metric label="Signup forms" value={String(newsletterForms.length)} icon={<FileText className="size-4" />} />
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.65fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Audience capture flow</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a signup form, place it on a canvas page or custom frontend, then manage subscribers here.
                </p>
              </div>
              <select
                aria-label="Newsletter form filter"
                value={selectedFormId}
                disabled={actionBusy || newsletterForms.length === 0}
                onChange={(event) => selectForm(event.target.value)}
                className="min-h-10 min-w-48 rounded-lg border bg-card px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="newsletter-form-filter"
              >
                <option value="all">All newsletter forms</option>
                {newsletterForms.map((form) => (
                  <option key={form.id} value={form.id}>{form.title || form.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <FlowStep index={1} title="Capture" detail="Public form definition and submission APIs collect email, topic, source, and consent." />
              <FlowStep index={2} title="Manage" detail="Contacts preserve subscriber identity, lifecycle status, and source values per site." />
              <FlowStep index={3} title="Deliver" detail="Export or sync to an email provider after SPF, DKIM, DMARC, bounces, and unsubscribe are configured." />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Delivery boundary</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Subscriber management is native. Actual mailbox delivery should use a provider because reputation, abuse controls, unsubscribe enforcement, and DNS records decide whether reports reach inboxes.
            </p>
            <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
              {NEWSLETTER_SYNC_POLICY_VERSION}: no provider secrets in public manifests, canvas props, or frontend handoff payloads.
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <section className="rounded-lg border border-border bg-card p-4" data-testid="newsletter-subscriber-list">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Subscribers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review source, consent, topic, and lifecycle state for every newsletter signup.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={exportNewsletterCsv}
                disabled={actionBusy || subscribers.length === 0 || !canExportNewsletter}
                title={subscribers.length === 0 ? 'No newsletter subscribers to export.' : exportDisabledReason || undefined}
                aria-describedby={exportActionStatusId}
                iconStart={<Download className="size-4" />}
                data-testid="newsletter-export-csv"
                data-action-state={subscribers.length === 0 || exportDisabledReason ? 'blocked' : 'ready'}
                data-action-status={exportActionStatus}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => void copyNewsletterText(newsletterHandoffText, 'Newsletter handoff')}
                disabled={actionBusy || !canViewNewsletter}
                title={viewDisabledReason || undefined}
                iconStart={<Copy className="size-4" />}
                data-testid="newsletter-copy-handoff"
              >
                Copy handoff
              </Button>
            </div>
          </div>

          {latestSubscribers.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={Mail}
                title={newsletterForms.length === 0 ? 'No newsletter signup form yet' : 'No subscribers yet'}
                description={newsletterForms.length === 0
                  ? 'Create a newsletter signup form, then place it on a Backy canvas page or any custom frontend.'
                  : 'Subscribers captured through newsletter forms will appear here with consent and source metadata.'}
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <div className="grid min-w-[900px] grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.6fr)_minmax(140px,0.5fr)_minmax(160px,0.6fr)_auto] gap-0 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
                <span>Subscriber</span>
                <span>Topic/source</span>
                <span>Status</span>
                <span>Joined</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-border">
                {latestSubscribers.map((subscriber) => (
                  <SubscriberRow
                    key={subscriber.contact.id}
                    subscriber={subscriber}
                    disabled={actionBusy || !canManageNewsletter}
                    disabledReason={manageDisabledReason}
                    onStatusChange={(status) => void updateSubscriberStatus(subscriber, status)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4" data-testid="newsletter-topics">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Topic segments</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Topic values come from the newsletter form source payload and can be exported or synced.
            </p>
            <div className="mt-3 space-y-2">
              {topicRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
                  No topic data yet.
                </p>
              ) : topicRows.map((topic) => (
                <div key={topic.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="truncate text-sm font-medium text-foreground">{topic.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{topic.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4" data-testid="newsletter-api-handoff">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">API handoff</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Give this to a custom frontend or email-sync worker.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyNewsletterText(newsletterHandoffText, 'Newsletter handoff')}
                disabled={actionBusy || !canViewNewsletter}
                iconStart={<Copy className="size-3.5" />}
              >
                Copy
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              <ApiSnippet label="Newsletter route" value={`/newsletter?siteId=${activeSiteId}`} />
              <ApiSnippet label="Public subscribe" value={publicNewsletterSubscribersUrl} />
              <ApiSnippet label="Admin subscribers" value={newsletterSubscribersUrl} />
              <ApiSnippet label="Segments" value={contactSegmentsUrl} />
              <ApiSnippet label="Contact lists" value={newsletterApiUrl} />
              <ApiSnippet label="Canvas page" value={newsletterPageRoute} />
              <ApiSnippet label="Blog composer" value={blogRoute} />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4" data-testid="newsletter-forms">
            <h2 className="text-sm font-semibold text-foreground">Signup forms</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Public forms that Backy identifies as newsletter/subscriber capture.
            </p>
            <div className="mt-3 space-y-2">
              {newsletterForms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
                  Create a signup form to expose definition and submit endpoints.
                </p>
              ) : newsletterForms.map((form) => (
                <div key={form.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">{form.title || form.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{form.fields.length} fields | {contactsByForm[form.id]?.length || 0} subscribers</p>
                    </div>
                    <StatusBadge status={form.isActive ? 'active' : 'inactive'} />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <ApiSnippet label="Definition" value={`${publicBaseUrl}/api/sites/${activeSiteId}/forms/${form.id}/definition`} />
                    <ApiSnippet label="Submit" value={`${publicBaseUrl}/api/sites/${activeSiteId}/forms/${form.id}/submissions`} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-lg border border-border bg-card p-4" data-testid="newsletter-content-workflow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Writing workflow</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Use Blog for published reports, Pages for newsletter landing/preferences surfaces, and this workspace for subscriber state. Campaign sending remains an integration step until a provider is connected.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={openBlogComposer} iconStart={<Newspaper className="size-4" />}>
              New report
            </Button>
            <Button variant="outline" onClick={openNewsletterPageCreate} disabled={!canEditPages} title={pageDisabledReason || undefined} iconStart={<ExternalLink className="size-4" />}>
              Signup page
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <WorkflowCard title="Local reporting" detail="Write posts in Backy, keep the slug, SEO, categories, comments, and canvas design attached to the same site." />
          <WorkflowCard title="Subscriber proof" detail="Every public signup lands as a contact with source form, request id, consent values, topic preference, and lifecycle state." />
          <WorkflowCard title="Provider handoff" detail="Use CSV or private Contacts APIs to sync subscribers to Buttondown, Mailchimp, Resend, SES, or another delivery system without exposing secrets." />
        </div>
      </section>
    </PageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function FlowStep({ index, title, detail }: { index: number; title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
          {index}
        </span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function WorkflowCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <code className="mt-1 block break-all font-mono text-xs text-foreground">{value}</code>
    </div>
  );
}

function SubscriberRow({
  subscriber,
  disabled,
  disabledReason,
  onStatusChange,
}: {
  subscriber: NewsletterSubscriber;
  disabled: boolean;
  disabledReason?: string;
  onStatusChange: (status: ContactStatus) => void;
}) {
  const { contact, form } = subscriber;
  const topic = readSourceValue(contact, 'topics') || 'No topic';
  const source = readSourceValue(contact, 'signup_source') || readSourceValue(contact, 'source') || form.title || form.name;
  return (
    <div className="grid min-w-[900px] grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.6fr)_minmax(140px,0.5fr)_minmax(160px,0.6fr)_auto] items-start gap-0 px-4 py-3 text-sm">
      <div className="min-w-0 pr-3">
        <div className="truncate font-semibold text-foreground">{contact.email || contact.name || 'Unnamed subscriber'}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{contact.name || 'No name'} | {form.title || form.name}</div>
      </div>
      <div className="min-w-0 pr-3">
        <div className="truncate text-foreground">{topic}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{source}</div>
      </div>
      <div className="pr-3">
        <StatusBadge status={contact.status} />
      </div>
      <div className="pr-3 text-xs text-muted-foreground">
        {formatDate(contact.createdAt)}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {contact.status === 'archived' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            title={disabledReason}
            onClick={() => onStatusChange('new')}
          >
            Reactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            title={disabledReason}
            onClick={() => onStatusChange('archived')}
          >
            Archive
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || contact.status === 'qualified'}
          title={disabledReason}
          onClick={() => onStatusChange('qualified')}
          iconStart={<Send className="size-3.5" />}
        >
          Ready
        </Button>
      </div>
    </div>
  );
}

function isNewsletterForm(form: FormDefinition): boolean {
  const settings = isRecord(form.settings) ? form.settings : {};
  const haystack = [
    form.name,
    form.title,
    form.description,
    form.successMessage,
    readRecordString(settings.backyIntent),
    readRecordString(settings.schemaVersion),
    readRecordString(settings.source),
    readRecordString(settings.templateId),
    ...form.fields.map((field) => `${field.key} ${field.label}`),
  ].join(' ').toLowerCase();
  return (
    haystack.includes('newsletter') ||
    haystack.includes('subscriber') ||
    haystack.includes('subscription') ||
    haystack.includes('publication') ||
    Boolean(form.contactShare?.enabled && form.contactShare.notesField === 'topics')
  );
}

function buildNewsletterMetrics(subscribers: NewsletterSubscriber[]) {
  return subscribers.reduce((metrics, { contact }) => {
    metrics.total += 1;
    if (contact.status === 'archived') metrics.archived += 1;
    else metrics.active += 1;
    if (contact.status === 'qualified') metrics.ready += 1;
    return metrics;
  }, { total: 0, active: 0, archived: 0, ready: 0 });
}

function buildTopicRows(subscribers: NewsletterSubscriber[]) {
  const topics = new Map<string, number>();
  subscribers.forEach(({ contact }) => {
    const value = readSourceValue(contact, 'topics') || 'Unspecified';
    value.split(',')
      .map((topic) => topic.trim())
      .filter(Boolean)
      .forEach((topic) => topics.set(topic, (topics.get(topic) || 0) + 1));
  });
  return Array.from(topics.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildNewsletterHandoff({
  activeSiteId,
  adminBaseUrl,
  publicBaseUrl,
  forms,
  subscribers,
  contactSegments,
}: {
  activeSiteId: string;
  adminBaseUrl: string;
  publicBaseUrl: string;
  forms: FormDefinition[];
  subscribers: NewsletterSubscriber[];
  contactSegments: ContactSegmentAnalytics | null;
}) {
  return {
    schemaVersion: NEWSLETTER_SCHEMA_VERSION,
    siteId: activeSiteId,
    workspaceRoute: `/newsletter?siteId=${activeSiteId}`,
    counts: {
      forms: forms.length,
      subscribers: subscribers.length,
      activeSubscribers: subscribers.filter(({ contact }) => contact.status !== 'archived').length,
    },
    publicCapture: {
      formsList: `${publicBaseUrl}/api/sites/${activeSiteId}/forms`,
      subscribersUrl: `${publicBaseUrl}/api/sites/${activeSiteId}/newsletter/subscribers`,
      subscriberMethods: {
        subscribe: 'POST',
        unsubscribe: 'DELETE',
      },
      forms: forms.map((form) => ({
        id: form.id,
        name: form.name,
        title: form.title,
        definitionUrl: `${publicBaseUrl}/api/sites/${activeSiteId}/forms/${form.id}/definition`,
        submitUrl: `${publicBaseUrl}/api/sites/${activeSiteId}/forms/${form.id}/submissions`,
        fields: form.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: Boolean(field.required),
        })),
      })),
      samplePayload: {
        values: {
          email: 'reader@example.com',
          name: 'Reader',
          topics: 'Investigations',
          consent: true,
          signup_source: 'newsletter page',
        },
      },
    },
    privateManagement: {
      contactsByFormUrl: `${adminBaseUrl}/sites/${activeSiteId}/forms/{formId}/contacts?limit=100`,
      newsletterSubscribersUrl: `${adminBaseUrl}/sites/${activeSiteId}/newsletter/subscribers`,
      contactSegmentsUrl: `${adminBaseUrl}/sites/${activeSiteId}/forms/contact-segments`,
      contactListsUrl: `${adminBaseUrl}/sites/${activeSiteId}/forms/contact-lists`,
      syncUrl: `${adminBaseUrl}/sites/${activeSiteId}/forms/{formId}/contacts/sync`,
      consentRetentionUrl: `${adminBaseUrl}/sites/${activeSiteId}/forms/{formId}/contacts/consent-retention`,
      segmentSummary: contactSegments?.summary || null,
    },
    canvasRoutes: {
      newsletterPage: `/pages/new?siteId=${activeSiteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
      blogPost: `/blog/new?siteId=${activeSiteId}&templateSource=backy-canvas&focus=canvas`,
    },
    providerBoundary: {
      status: 'external-delivery-required',
      nativeBackyScope: ['subscriber records', 'consent evidence', 'topic/source metadata', 'CSV export', 'private sync API', 'custom frontend capture'],
      deliveryProviderScope: ['mailbox delivery', 'unsubscribe enforcement', 'bounce handling', 'SPF/DKIM/DMARC', 'abuse monitoring', 'IP/domain reputation'],
      secretPolicy: 'Provider API keys stay in Settings/server-side environment only; do not expose them through page props, public manifests, or custom frontend handoff.',
    },
  };
}

function readSourceValue(contact: AdminContact, key: string): string {
  const source = contact.sourceValues || {};
  const exact = source[key];
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matched = Object.entries(source).find(([entryKey]) => (
    entryKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey
  ));
  return formatSourceValue(exact ?? matched?.[1]);
}

function formatSourceValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatSourceValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readRecordString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getEnvValue(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
}

function getLocalBackendOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

function isLocalAdminHost(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3001';
}

function getPublicBaseUrl(): string {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
}
