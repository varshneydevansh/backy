import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Code2,
  Contact,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  listFormContacts,
  listForms,
  updateContact,
  type AdminContact,
  type ContactStatus,
  type FormDefinition,
} from '@/lib/adminContentApi';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/contacts')({
  component: ContactsRoute,
});

type ContactStatusFilter = ContactStatus | 'all';

const CONTACT_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose the website whose captured leads and signup flows are being reviewed.',
    href: '#contacts-site',
  },
  {
    title: 'Pipeline health',
    detail: 'Monitor new, contacted, qualified, archived, and total lead volume.',
    href: '#contacts-metrics',
  },
  {
    title: 'Contact API',
    detail: 'List contacts, update lifecycle status, and hand private endpoints to custom tools.',
    href: '#contacts-api',
  },
  {
    title: 'Lead inbox',
    detail: 'Search, filter, export, annotate, and route every captured record.',
    href: '#contacts-inbox',
  },
  {
    title: 'Lifecycle actions',
    detail: 'Move records through new, contacted, qualified, and archived states.',
    href: '#contacts-actions',
  },
] as const;

interface ContactInbox {
  form: FormDefinition;
  contacts: AdminContact[];
  total: number;
}

function ContactsRoute() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [contactsByForm, setContactsByForm] = useState<Record<string, ContactInbox>>({});
  const [selectedFormId, setSelectedFormId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const formById = useMemo(() => new Map(forms.map((form) => [form.id, form])), [forms]);
  const apiForm = useMemo(
    () => selectedFormId === 'all' ? null : forms.find((form) => form.id === selectedFormId) || null,
    [forms, selectedFormId],
  );
  const contactsUrl = apiForm
    ? `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts?limit=100`
    : '';
  const contactUpdateUrl = apiForm
    ? `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/{contactId}`
    : '';
  const allContacts = useMemo(
    () => Object.values(contactsByForm).flatMap((inbox) => inbox.contacts),
    [contactsByForm],
  );
  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return allContacts.filter((contact) => {
      const form = formById.get(contact.formId);
      const matchesForm = selectedFormId === 'all' || contact.formId === selectedFormId;
      const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
      const matchesSearch = !normalizedSearch || [
        contact.name,
        contact.email,
        contact.phone,
        contact.notes,
        contact.requestId,
        form?.title,
        form?.name,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesForm && matchesStatus && matchesSearch;
    });
  }, [allContacts, formById, searchQuery, selectedFormId, statusFilter]);
  const exportSourceKeys = useMemo(() => (
    Array.from(new Set(filteredContacts.flatMap((contact) => (
      contact.sourceValues ? Object.keys(contact.sourceValues) : []
    )))).sort((a, b) => a.localeCompare(b))
  ), [filteredContacts]);
  const metrics = useMemo(() => ({
    contacts: allContacts.length,
    new: allContacts.filter((contact) => contact.status === 'new').length,
    contacted: allContacts.filter((contact) => contact.status === 'contacted').length,
    qualified: allContacts.filter((contact) => contact.status === 'qualified').length,
    archived: allContacts.filter((contact) => contact.status === 'archived').length,
  }), [allContacts]);
  const pipelineReadiness = useMemo(() => {
    if (apiForm) {
      return null;
    }

    const checks = [
      {
        label: 'Form sources',
        detail: forms.length > 0
          ? `${forms.length} source form${forms.length === 1 ? '' : 's'} connected.`
          : 'Connect public forms before contacts can be captured.',
        ready: forms.length > 0,
      },
      {
        label: 'Lead records',
        detail: metrics.contacts > 0
          ? `${metrics.contacts} contact${metrics.contacts === 1 ? '' : 's'} captured.`
          : 'No lead records have entered this site pipeline yet.',
        ready: metrics.contacts > 0,
      },
      {
        label: 'Follow-up queue',
        detail: metrics.new > 0
          ? `${metrics.new} new lead${metrics.new === 1 ? '' : 's'} need review.`
          : 'New lead queue is clear.',
        ready: true,
      },
      {
        label: 'Qualification',
        detail: metrics.qualified > 0
          ? `${metrics.qualified} qualified contact${metrics.qualified === 1 ? '' : 's'}.`
          : 'Use qualified status when a lead is ready for sales or membership.',
        ready: metrics.contacts === 0 || metrics.qualified > 0,
      },
      {
        label: 'Archive hygiene',
        detail: metrics.archived > 0
          ? `${metrics.archived} archived record${metrics.archived === 1 ? '' : 's'}.`
          : 'Archive stale or rejected leads to keep the inbox focused.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Capture', detail: 'Forms, registrations, and signup blocks create contact records.' },
        { label: 'Review', detail: 'Search by person, form, phone, email, note, or request ID.' },
        { label: 'Qualify', detail: 'Move records through contacted and qualified stages.' },
        { label: 'Sync', detail: 'Export CSV or use the private contact API for custom systems.' },
      ],
    };
  }, [apiForm, forms.length, metrics.archived, metrics.contacts, metrics.new, metrics.qualified]);
  const apiFormReadiness = useMemo(() => {
    if (!apiForm) {
      return {
        score: 0,
        checks: [],
        workflow: [],
      };
    }

    const formContacts = contactsByForm[apiForm.id]?.contacts || [];
    const contactShareEnabled = apiForm.contactShare?.enabled === true;
    const emailField = apiForm.contactShare?.emailField;
    const phoneField = apiForm.contactShare?.phoneField;
    const nameField = apiForm.contactShare?.nameField;
    const identityFields = [
      nameField ? `name:${nameField}` : null,
      emailField ? `email:${emailField}` : null,
      phoneField ? `phone:${phoneField}` : null,
    ].filter(Boolean);
    const hasIdentityMap = Boolean(emailField || phoneField);
    const hasContacts = formContacts.length > 0;
    const hasLifecycleProgress = formContacts.some((contact) => contact.status !== 'new');
    const checks = [
      {
        label: 'Form source',
        detail: apiForm.isActive
          ? 'Active form can feed the contact pipeline.'
          : 'Inactive forms do not create public leads.',
        ready: apiForm.isActive,
      },
      {
        label: 'Lead sharing',
        detail: contactShareEnabled
          ? 'Submissions can create or update contacts.'
          : 'Enable contact sharing on the form block to collect leads.',
        ready: contactShareEnabled,
      },
      {
        label: 'Identity mapping',
        detail: identityFields.length > 0
          ? identityFields.join(', ')
          : 'Map at least email or phone for useful CRM records.',
        ready: hasIdentityMap,
      },
      {
        label: 'Inbox data',
        detail: hasContacts
          ? `${formContacts.length} contacts captured`
          : 'No contacts captured for this form yet.',
        ready: hasContacts,
      },
      {
        label: 'Lifecycle',
        detail: hasLifecycleProgress
          ? 'At least one lead has moved beyond new.'
          : 'Use contacted, qualified, and archived to keep the pipeline clean.',
        ready: hasContacts ? hasLifecycleProgress : true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Capture', detail: contactShareEnabled ? 'Form submissions share lead fields.' : 'Enable contact sharing in the form block.' },
        { label: 'Dedupe', detail: apiForm.contactShare?.dedupeByEmail ? 'Email dedupe updates existing contacts.' : 'Dedupe is off for this source.' },
        { label: 'Qualify', detail: 'Move leads through new, contacted, qualified, archived.' },
        { label: 'Sync', detail: 'Use the contact API for custom CRM dashboards.' },
      ],
    };
  }, [apiForm, contactsByForm]);
  const commandReadiness = pipelineReadiness || apiFormReadiness;
  const contactHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    endpoints: {
      selectedContacts: contactsUrl,
      selectedUpdate: contactUpdateUrl,
      formContacts: forms.map((form) => ({
        formId: form.id,
        label: form.title || form.name || form.id,
        list: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts?limit=100`,
        update: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/{contactId}`,
      })),
    },
    readiness: {
      score: commandReadiness.score,
      checks: commandReadiness.checks,
    },
    metrics,
    lifecycleStates: ['new', 'contacted', 'qualified', 'archived'],
    filters: {
      formId: selectedFormId,
      status: statusFilter,
      query: searchQuery.trim(),
    },
    selectedSourceForm: apiForm ? {
      id: apiForm.id,
      name: apiForm.name,
      title: apiForm.title,
      isActive: apiForm.isActive,
      audience: apiForm.audience,
      contactShare: apiForm.contactShare,
      pageId: apiForm.pageId,
      postId: apiForm.postId,
    } : null,
    export: {
      csvIncludesIdentity: true,
      csvIncludesSourceValues: true,
      sourceValueKeys: exportSourceKeys,
    },
    sources: forms.map((form) => {
      const contacts = contactsByForm[form.id]?.contacts || [];
      return {
        formId: form.id,
        name: form.name,
        title: form.title,
        isActive: form.isActive,
        contactShare: form.contactShare,
        contactCounts: {
          total: contacts.length,
          new: contacts.filter((contact) => contact.status === 'new').length,
          contacted: contacts.filter((contact) => contact.status === 'contacted').length,
          qualified: contacts.filter((contact) => contact.status === 'qualified').length,
          archived: contacts.filter((contact) => contact.status === 'archived').length,
        },
      };
    }),
    contacts: allContacts.map((contact) => ({
      id: contact.id,
      formId: contact.formId,
      status: contact.status,
      pageId: contact.pageId,
      postId: contact.postId,
      sourceSubmissionId: contact.sourceSubmissionId,
      requestId: contact.requestId,
      hasName: Boolean(contact.name),
      hasEmail: Boolean(contact.email),
      hasPhone: Boolean(contact.phone),
      hasNotes: Boolean(contact.notes),
      hasSourceValues: Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0),
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    })),
    privacy: {
      includesContactIdentity: false,
      includesSourceValues: false,
      note: 'Use CSV export or private contact API for identity fields. This manifest only exposes endpoint contracts, lifecycle state, counts, and non-PII record flags.',
    },
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    allContacts,
    apiForm,
    commandReadiness.checks,
    commandReadiness.score,
    contactUpdateUrl,
    contactsByForm,
    contactsUrl,
    exportSourceKeys,
    forms,
    metrics,
    publicBaseUrl,
    searchQuery,
    selectedFormId,
    statusFilter,
  ]);
  const contactHandoffText = useMemo(() => JSON.stringify(contactHandoff, null, 2), [contactHandoff]);

  const loadContacts = async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const loadedForms = await listForms(activeSiteId);
      const inboxPairs = await Promise.all(
        loadedForms.map(async (form) => {
          const result = await listFormContacts(activeSiteId, form.id, { limit: 100 });
          return [form.id, {
            form,
            contacts: result.contacts,
            total: result.count,
          }] as const;
        }),
      );

      setForms(loadedForms);
      setContactsByForm(Object.fromEntries(inboxPairs));
      setSelectedFormId((current) => (
        current === 'all' || loadedForms.some((form) => form.id === current)
          ? current
          : 'all'
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === selectedSiteId)) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    void loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  const handleStatus = async (contact: AdminContact, status: ContactStatus) => {
    setUpdatingId(contact.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateContact(activeSiteId, contact.formId, contact.id, { status });
      setContactsByForm((current) => {
        const inbox = current[contact.formId];
        if (!inbox) return current;

        return {
          ...current,
          [contact.formId]: {
            ...inbox,
            contacts: inbox.contacts.map((item) => (item.id === updated.id ? updated : item)),
          },
        };
      });
      setNotice(`${updated.name || updated.email || 'Contact'} marked ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update contact');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleNotes = async (contact: AdminContact, notes: string) => {
    setUpdatingId(contact.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateContact(activeSiteId, contact.formId, contact.id, { notes: notes.trim() || null });
      setContactsByForm((current) => {
        const inbox = current[contact.formId];
        if (!inbox) return current;

        return {
          ...current,
          [contact.formId]: {
            ...inbox,
            contacts: inbox.contacts.map((item) => (item.id === updated.id ? updated : item)),
          },
        };
      });
      setNotice(`Notes saved for ${updated.name || updated.email || 'contact'}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to save contact notes');
    } finally {
      setUpdatingId(null);
    }
  };

  const copyContactApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };
  const downloadContactHandoff = () => {
    const blob = new Blob([contactHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-contacts-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Contact handoff manifest downloaded.');
  };

  const handleExportContacts = () => {
    if (filteredContacts.length === 0) return;

    const header = [
      'contact_id',
      'form_id',
      'form_name',
      'status',
      'name',
      'email',
      'phone',
      'notes',
      'created_at',
      'updated_at',
      'request_id',
      ...exportSourceKeys.map((key) => `source_${key}`),
    ];
    const rows = filteredContacts.map((contact) => {
      const form = formById.get(contact.formId);
      return [
        contact.id,
        contact.formId,
        form?.title || form?.name || '',
        contact.status,
        contact.name || '',
        contact.email || '',
        contact.phone || '',
        contact.notes || '',
        contact.createdAt || '',
        contact.updatedAt || '',
        contact.requestId || '',
        ...exportSourceKeys.map((key) => formatContactSourceValue(contact.sourceValues?.[key])),
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteId}-contacts.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="Contacts"
      description="Manage leads captured by public forms, registration blocks, and collection-bound signup flows."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="contacts-active-site"
            aria-label="Active Site"
            value={activeSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadContacts()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="contacts-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Contacts command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                commandReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {commandReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control lead capture, source forms, CRM lifecycle states, internal notes, CSV exports, and private contact APIs for custom frontends.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void copyContactApiText(contactHandoffText, 'Contact handoff manifest')}
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadContactHandoff} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={handleExportContacts}
              disabled={filteredContacts.length === 0}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button onClick={() => void loadContacts()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh contacts
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Lead pipeline readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks source availability, contact capture, follow-up queues, lifecycle usage, and sync readiness.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', commandReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${commandReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {commandReadiness.checks.map((check) => (
                <ContactReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Lead workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {commandReadiness.workflow.map((step, index) => (
                <ContactWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Contacts control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, health metrics, API handoff, inbox review, and lifecycle controls.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {CONTACT_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <div id="contacts-site" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="contacts-active-site-inline">
          Active site
        </label>
        <select
          id="contacts-active-site-inline"
          aria-label="Active contacts site"
          value={activeSiteId}
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          {sites.length === 0 ? (
            <option value="site-demo">Demo site</option>
          ) : sites.map((site) => (
            <option key={site.id} value={site.publicSiteId || site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {activeSite?.name || activeSiteId} lead pipeline
        </span>
      </div>

      <div id="contacts-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Contacts" value={metrics.contacts} icon={<Contact className="size-4" />} />
        <Metric label="New" value={metrics.new} icon={<Mail className="size-4" />} />
        <Metric label="Contacted" value={metrics.contacted} icon={<Phone className="size-4" />} />
        <Metric label="Qualified" value={metrics.qualified} icon={<UserCheck className="size-4" />} />
        <Metric label="Archived" value={metrics.archived} icon={<Archive className="size-4" />} />
      </div>

      <Panel id="contacts-inbox" className="scroll-mt-24">
        <PanelHeader
          title="Lead Inbox"
          description={`${filteredContacts.length}/${allContacts.length} visible contacts`}
          icon={<Contact className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleExportContacts}
                disabled={filteredContacts.length === 0}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Link to="/forms">
                <Button variant="outline" iconStart={<Mail className="size-4" />}>
                  Forms
                </Button>
              </Link>
            </div>
          }
        />
        <PanelContent>
          {apiForm ? (
            <div id="contacts-api" className="mb-5 rounded-lg border border-border bg-muted/30 p-4 scroll-mt-24">
              <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Contact pipeline readiness</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Checks form source status, lead sharing, identity mapping, captured data, and lifecycle usage.
                      </p>
                    </div>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      apiFormReadiness.score >= 80
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                    >
                      {apiFormReadiness.score}% ready
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        apiFormReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${apiFormReadiness.score}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {apiFormReadiness.checks.map((check) => (
                      <ContactReadinessCheck key={check.label} {...check} />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Lead workflow</h3>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {apiFormReadiness.workflow.map((step, index) => (
                      <ContactWorkflowStep key={step.label} index={index + 1} {...step} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="size-4" />
                    Contact pipeline API
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Use this private endpoint to list lead records created by a form and the update endpoint to sync status changes from a custom dashboard.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void copyContactApiText(contactsUrl, 'Contacts URL')} iconStart={<Copy className="size-4" />}>
                    Copy contacts
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyContactApiText(contactHandoffText, 'Contact handoff manifest')}
                    iconStart={<Copy className="size-4" />}
                  >
                    Copy manifest
                  </Button>
                  <a
                    href={contactsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <ExternalLink className="size-4" />
                    Open endpoint
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MetaTile label="API form" value={apiForm.title || apiForm.name || apiForm.id} />
                <MetaTile label="Lead share" value={apiForm.contactShare?.enabled ? 'enabled' : 'off'} />
                <MetaTile label="Visibility" value="private" />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <ApiSnippet label="List contacts" value={contactsUrl} />
                <ApiSnippet label="Update contact" value={contactUpdateUrl} />
              </div>
            </div>
          ) : (
            <div id="contacts-api" className="mb-5 rounded-lg border border-dashed border-border bg-muted/30 p-4 scroll-mt-24">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="size-4" />
                    Contact pipeline API
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Select one source form to expose its contact list and update endpoints. The all-forms view is an admin aggregate.
                  </p>
                </div>
                <Link to="/forms">
                  <Button variant="outline" iconStart={<Mail className="size-4" />}>
                    Configure forms
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div id="contacts-actions" className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-24">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search contacts"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search contacts, forms, request IDs..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              aria-label="Form filter"
              value={selectedFormId}
              onChange={(event) => setSelectedFormId(event.target.value)}
              className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All forms</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>{form.title || form.name}</option>
              ))}
            </select>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
              <Filter className="ml-2 size-4 text-muted-foreground" />
              {(['all', 'new', 'contacted', 'qualified', 'archived'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
                    statusFilter === status && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {isLoading && allContacts.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            </div>
          ) : allContacts.length === 0 ? (
            <EmptyState
              icon={Contact}
              title="No contacts yet"
              description="Contacts appear when forms share lead information into the contact pipeline."
              action={
                <Link to="/forms">
                  <Button className="mt-2" iconStart={<Mail className="size-4" />}>Review Forms</Button>
                </Link>
              }
            />
          ) : filteredContacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No contacts match this view.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  form={formById.get(contact.formId)}
                  disabled={updatingId === contact.id}
                  onStatus={(status) => void handleStatus(contact, status)}
                  onNotes={(notes) => void handleNotes(contact, notes)}
                />
              ))}
            </div>
          )}
        </PanelContent>
      </Panel>
    </PageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

function ContactReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function ContactWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function ApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function ContactCard({
  contact,
  form,
  disabled,
  onStatus,
  onNotes,
}: {
  contact: AdminContact;
  form?: FormDefinition;
  disabled: boolean;
  onStatus: (status: ContactStatus) => void;
  onNotes: (notes: string) => void;
}) {
  const [notesDraft, setNotesDraft] = useState(contact.notes || '');

  useEffect(() => {
    setNotesDraft(contact.notes || '');
  }, [contact.notes]);

  const notesChanged = notesDraft.trim() !== (contact.notes || '').trim();

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{contact.name || contact.email || 'Unnamed contact'}</h3>
            <StatusBadge status={contact.status} type={statusType(contact.status)} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {form?.title || form?.name || contact.formId}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {formatDate(contact.updatedAt || contact.createdAt)}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-primary hover:underline">
            <Mail className="size-4" />
            {contact.email}
          </a>
        ) : null}
        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-primary hover:underline">
            <Phone className="size-4" />
            {contact.phone}
          </a>
        ) : null}
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`contact-notes-${contact.id}`}>
          Internal notes
        </label>
        <textarea
          id={`contact-notes-${contact.id}`}
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Follow-up context, qualification notes, or next steps."
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !notesChanged}
            onClick={() => onNotes(notesDraft)}
            iconStart={<Save className="size-4" />}
            aria-label={`Save notes for ${contact.name || contact.email || contact.id}`}
          >
            Save notes
          </Button>
        </div>
      </div>

      {contact.sourceValues && Object.keys(contact.sourceValues).length > 0 ? (
        <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Submitted values</div>
          <dl className="grid gap-1 text-xs">
            {Object.entries(contact.sourceValues).slice(0, 4).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt className="truncate font-medium text-muted-foreground">{key}</dt>
                <dd className="truncate">{String(value || '-')}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => onStatus('contacted')}
          disabled={disabled || contact.status === 'contacted'}
          iconStart={<Mail className="size-4" />}
          aria-label={`Mark ${contact.name || contact.email || contact.id} as contacted`}
        >
          Contacted
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatus('qualified')}
          disabled={disabled || contact.status === 'qualified'}
          iconStart={<CheckCircle2 className="size-4" />}
          aria-label={`Mark ${contact.name || contact.email || contact.id} as qualified`}
        >
          Qualified
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatus('new')}
          disabled={disabled || contact.status === 'new'}
          iconStart={<Contact className="size-4" />}
          aria-label={`Mark ${contact.name || contact.email || contact.id} as new`}
        >
          New
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => onStatus('archived')}
          disabled={disabled || contact.status === 'archived'}
          iconStart={<Archive className="size-4" />}
          aria-label={`Archive ${contact.name || contact.email || contact.id}`}
        >
          Archive
        </Button>
      </div>
    </article>
  );
}

function statusType(status: ContactStatus) {
  if (status === 'qualified') return 'success';
  if (status === 'new') return 'warning';
  if (status === 'contacted') return 'info';
  return 'neutral';
}

const formatContactSourceValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatContactSourceValue).filter(Boolean).join(', ');
  return JSON.stringify(value);
};

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminHost = () => {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
