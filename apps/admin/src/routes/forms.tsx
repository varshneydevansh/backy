import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileInput,
  Filter,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  getFormWithSubmissions,
  listForms,
  updateFormSubmission,
  type FormDefinition,
  type FormSubmission,
  type FormSubmissionStatus,
} from '@/lib/adminContentApi';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/forms')({
  component: FormsRoute,
});

type SubmissionStatusFilter = FormSubmissionStatus | 'all';

interface FormInbox {
  form: FormDefinition;
  submissions: FormSubmission[];
  total: number;
}

function FormsRoute() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [inboxByForm, setInboxByForm] = useState<Record<string, FormInbox>>({});
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>('all');
  const [submissionQuery, setSubmissionQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId],
  );
  const selectedInbox = selectedForm ? inboxByForm[selectedForm.id] : null;
  const selectedSubmissions = selectedInbox?.submissions || [];
  const filteredSubmissions = useMemo(
    () => selectedSubmissions.filter((submission) => {
      const statusMatches = statusFilter === 'all' || submission.status === statusFilter;
      if (!statusMatches) return false;

      const query = submissionQuery.trim().toLowerCase();
      if (!query) return true;

      const searchable = [
        submission.id,
        submission.requestId,
        submission.status,
        submission.reviewedBy,
        submission.collectionRecord?.collectionSlug,
        submission.collectionRecord?.recordSlug,
        ...Object.values(submission.values).map(formatSubmissionValue),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    }),
    [selectedSubmissions, statusFilter, submissionQuery],
  );
  const metrics = useMemo(() => {
    const submissions = Object.values(inboxByForm).flatMap((item) => item.submissions);
    return {
      forms: forms.length,
      active: forms.filter((form) => form.isActive).length,
      pending: submissions.filter((submission) => submission.status === 'pending').length,
      spam: submissions.filter((submission) => submission.status === 'spam').length,
    };
  }, [forms, inboxByForm]);

  const loadForms = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedForms = await listForms(activeSiteId);
      const inboxPairs = await Promise.all(
        loadedForms.map(async (form) => {
          const detail = await getFormWithSubmissions(activeSiteId, form.id, { limit: 100 });
          return [form.id, {
            form: detail.form,
            submissions: detail.submissions.data || [],
            total: detail.submissions.pagination?.total ?? detail.submissions.data.length,
          }] as const;
        }),
      );
      const nextInbox = Object.fromEntries(inboxPairs);
      setForms(loadedForms);
      setInboxByForm(nextInbox);
      setSelectedFormId((current) => (
        current && loadedForms.some((form) => form.id === current)
          ? current
          : loadedForms[0]?.id || null
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load forms');
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
    void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  const handleSubmissionStatus = async (submission: FormSubmission, status: FormSubmissionStatus) => {
    setIsUpdatingId(submission.id);
    setError(null);

    try {
      const updated = await updateFormSubmission(activeSiteId, submission.formId, submission.id, {
        status,
        reviewedBy: 'admin',
      });
      setInboxByForm((current) => {
        const inbox = current[submission.formId];
        if (!inbox) return current;

        return {
          ...current,
          [submission.formId]: {
            ...inbox,
            submissions: inbox.submissions.map((item) => (item.id === updated.id ? updated : item)),
          },
        };
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update submission');
    } finally {
      setIsUpdatingId(null);
    }
  };

  const handleExportSubmissions = () => {
    if (!selectedForm) return;

    const fieldKeys = selectedForm.fields.map((field) => field.key);
    const header = [
      'submission_id',
      'status',
      'submitted_at',
      'request_id',
      'collection_record',
      ...fieldKeys,
    ];
    const rows = filteredSubmissions.map((submission) => [
      submission.id,
      submission.status,
      submission.submittedAt,
      submission.requestId || '',
      submission.collectionRecord
        ? `${submission.collectionRecord.collectionSlug}/${submission.collectionRecord.recordSlug}`
        : '',
      ...fieldKeys.map((key) => formatSubmissionValue(submission.values[key])),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedForm.name || selectedForm.id}-submissions.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="Forms"
      description="Capture leads, review submissions, and connect public forms to contacts or collections."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
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
          <Button onClick={() => void loadForms()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {[
          { label: 'Forms', value: metrics.forms, icon: FileInput },
          { label: 'Active', value: metrics.active, icon: ShieldCheck },
          { label: 'Pending', value: metrics.pending, icon: Inbox },
          { label: 'Spam', value: metrics.spam, icon: XCircle },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold">{metric.value}</div>
            </div>
          );
        })}
      </div>

      {isLoading && forms.length === 0 ? (
        <Panel>
          <PanelContent className="flex h-64 items-center justify-center pt-5">
            <div className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          </PanelContent>
        </Panel>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No forms found"
          description="Forms appear here when a page or blog design includes a form block for this site."
          action={
            <Button className="mt-2" onClick={() => window.open('/pages', '_self')} iconStart={<Sparkles className="size-4" />}>
              Open Pages
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Form library"
              description={`${forms.length} form${forms.length === 1 ? '' : 's'} on ${activeSite?.name || activeSiteId}`}
              icon={<ClipboardList className="size-4" />}
            />
            <PanelContent className="grid gap-2">
              {forms.map((form) => {
                const inbox = inboxByForm[form.id];
                const isSelected = form.id === selectedForm?.id;
                const pending = inbox?.submissions.filter((submission) => submission.status === 'pending').length || 0;

                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => setSelectedFormId(form.id)}
                    className={cn(
                      'rounded-lg border px-3 py-3 text-left transition-colors',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{form.title || form.name}</div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{form.id}</div>
                      </div>
                      <StatusBadge status={form.isActive ? 'active' : 'inactive'} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-2 py-1">{form.fields.length} fields</span>
                      <span className="rounded bg-muted px-2 py-1">{inbox?.total || 0} submissions</span>
                      {pending > 0 && <span className="rounded bg-warning/10 px-2 py-1 text-warning">{pending} pending</span>}
                    </div>
                  </button>
                );
              })}
            </PanelContent>
          </Panel>

          <div className="min-w-0 space-y-6">
            {selectedForm && (
              <Panel>
                <PanelHeader
                  title={selectedForm.title || selectedForm.name}
                  description={selectedForm.description || selectedForm.id}
                  icon={<FileInput className="size-4" />}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedForm.pageId && (
                        <Link
                          to="/pages/$pageId/edit"
                          params={{ pageId: selectedForm.pageId }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          <ExternalLink className="size-4" />
                          Page
                        </Link>
                      )}
                      {selectedForm.postId && (
                        <Link
                          to="/blog/$postId"
                          params={{ postId: selectedForm.postId }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          <ExternalLink className="size-4" />
                          Blog
                        </Link>
                      )}
                      <StatusBadge status={selectedForm.audience} type="info" />
                    </div>
                  }
                />
                <PanelContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetaTile label="Moderation" value={selectedForm.moderationMode || 'manual'} />
                    <MetaTile label="Spam guard" value={[
                      selectedForm.enableHoneypot ? 'honeypot' : null,
                      selectedForm.enableCaptcha ? 'captcha' : null,
                    ].filter(Boolean).join(' + ') || 'none'} />
                    <MetaTile label="Lead share" value={selectedForm.contactShare?.enabled ? 'enabled' : 'off'} />
                    <MetaTile label="Collection write" value={selectedForm.collectionTarget?.enabled ? selectedForm.collectionTarget.collectionId : 'off'} />
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedForm.fields.map((field) => (
                      <div key={field.key} className="rounded-lg border border-border bg-background px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{field.label}</div>
                          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{field.type}</span>
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{field.key}</div>
                        {field.required && <div className="mt-2 text-xs font-medium text-warning">Required</div>}
                      </div>
                    ))}
                  </div>
                </PanelContent>
              </Panel>
            )}

            <Panel className="overflow-hidden">
              <PanelHeader
                title="Submission inbox"
                description={`${filteredSubmissions.length}/${selectedSubmissions.length} visible`}
                icon={<Inbox className="size-4" />}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-56">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={submissionQuery}
                        onChange={(event) => setSubmissionQuery(event.target.value)}
                        placeholder="Search submissions..."
                        className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleExportSubmissions}
                      disabled={!selectedForm || filteredSubmissions.length === 0}
                      iconStart={<Download className="size-4" />}
                    >
                      Export CSV
                    </Button>
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
                      <Filter className="ml-2 size-4 text-muted-foreground" />
                      {(['all', 'pending', 'approved', 'rejected', 'spam'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setStatusFilter(status)}
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
                }
              />
              <PanelContent>
                {filteredSubmissions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    No submissions for this filter.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredSubmissions.map((submission) => (
                      <SubmissionCard
                        key={submission.id}
                        submission={submission}
                        fields={selectedForm?.fields || []}
                        isUpdating={isUpdatingId === submission.id}
                        onStatus={(status) => void handleSubmissionStatus(submission, status)}
                      />
                    ))}
                  </div>
                )}
              </PanelContent>
            </Panel>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

function SubmissionCard({
  submission,
  fields,
  isUpdating,
  onStatus,
}: {
  submission: FormSubmission;
  fields: FormDefinition['fields'];
  isUpdating: boolean;
  onStatus: (status: FormSubmissionStatus) => void;
}) {
  const previewFields = fields.slice(0, 4);

  return (
    <article className="rounded-lg border border-border bg-background px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={submission.status}
              type={submission.status === 'approved' ? 'success' : submission.status === 'spam' || submission.status === 'rejected' ? 'error' : 'warning'}
            />
            <span className="text-sm text-muted-foreground">{formatDate(submission.submittedAt)}</span>
          </div>
          <div className="mt-2 truncate font-mono text-xs text-muted-foreground">{submission.id}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={isUpdating || submission.status === 'approved'}
            onClick={() => onStatus('approved')}
            iconStart={<CheckCircle2 className="size-4" />}
            aria-label={`Approve submission ${submission.id}`}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating || submission.status === 'rejected'}
            onClick={() => onStatus('rejected')}
            aria-label={`Reject submission ${submission.id}`}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isUpdating || submission.status === 'spam'}
            onClick={() => onStatus('spam')}
            iconStart={<XCircle className="size-4" />}
            aria-label={`Mark submission ${submission.id} as spam`}
          >
            Spam
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {previewFields.map((field) => (
          <div key={field.key} className="min-w-0 rounded-lg bg-muted px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
            <div className="mt-1 truncate text-sm">{formatSubmissionValue(submission.values[field.key])}</div>
          </div>
        ))}
      </div>

      {(submission.requestId || submission.collectionRecord) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {submission.requestId && <span className="rounded bg-muted px-2 py-1 font-mono">{submission.requestId}</span>}
          {submission.collectionRecord && (
            <Link
              to="/collections"
              search={{
                siteId: submission.collectionRecord.siteId,
                collectionId: submission.collectionRecord.collectionId,
                recordId: submission.collectionRecord.recordId,
              }}
              className="inline-flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-success hover:underline"
            >
              <ExternalLink className="size-3" />
              {submission.collectionRecord.collectionSlug}/{submission.collectionRecord.recordSlug}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

const formatSubmissionValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatSubmissionValue).join(', ');
  return JSON.stringify(value);
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
