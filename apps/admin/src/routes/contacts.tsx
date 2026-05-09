import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
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
    () => forms.find((form) => form.id === selectedFormId) || forms[0] || null,
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
  const metrics = useMemo(() => ({
    contacts: allContacts.length,
    new: allContacts.filter((contact) => contact.status === 'new').length,
    qualified: allContacts.filter((contact) => contact.status === 'qualified').length,
    archived: allContacts.filter((contact) => contact.status === 'archived').length,
  }), [allContacts]);

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

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Metric label="Contacts" value={metrics.contacts} icon={<Contact className="size-4" />} />
        <Metric label="New" value={metrics.new} icon={<Mail className="size-4" />} />
        <Metric label="Qualified" value={metrics.qualified} icon={<UserCheck className="size-4" />} />
        <Metric label="Archived" value={metrics.archived} icon={<Archive className="size-4" />} />
      </div>

      <Panel>
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
          {apiForm && (
            <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
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
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3">
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
}: {
  contact: AdminContact;
  form?: FormDefinition;
  disabled: boolean;
  onStatus: (status: ContactStatus) => void;
}) {
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
        {contact.notes ? (
          <p className="line-clamp-2 text-muted-foreground">{contact.notes}</p>
        ) : null}
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

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
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
