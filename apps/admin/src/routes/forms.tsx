import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
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
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId],
  );
  const selectedFormDefinitionUrl = selectedForm
    ? `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(selectedForm.id)}/definition`
    : '';
  const selectedFormSubmitUrl = selectedForm
    ? `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(selectedForm.id)}/submissions`
    : '';
  const selectedFormSamplePayload = useMemo(
    () => selectedForm ? buildSampleSubmissionPayload(selectedForm) : null,
    [selectedForm],
  );
  const selectedFormSamplePayloadText = useMemo(
    () => selectedFormSamplePayload ? JSON.stringify(selectedFormSamplePayload, null, 2) : '',
    [selectedFormSamplePayload],
  );
  const selectedFormCurlExample = useMemo(
    () => selectedForm && selectedFormSubmitUrl && selectedFormSamplePayloadText
      ? [
          `curl -X POST ${toSingleQuotedShellString(selectedFormSubmitUrl)}`,
          "  -H 'content-type: application/json'",
          `  --data ${toSingleQuotedShellString(selectedFormSamplePayloadText)}`,
        ].join(' \\\n')
      : '',
    [selectedForm, selectedFormSamplePayloadText, selectedFormSubmitUrl],
  );
  const selectedFormReadiness = useMemo(() => {
    if (!selectedForm) {
      return {
        score: 0,
        checks: [],
        workflow: [],
      };
    }

    const hasFields = selectedForm.fields.length > 0;
    const hasRequiredIdentity = selectedForm.fields.some((field) => (
      ['email', 'tel'].includes(field.type) || ['email', 'phone'].includes(field.key)
    ));
    const hasSpamGuard = Boolean(selectedForm.enableHoneypot || selectedForm.enableCaptcha);
    const hasDestination = Boolean(selectedForm.contactShare?.enabled || selectedForm.collectionTarget?.enabled);
    const checks = [
      {
        label: 'Public definition',
        detail: selectedForm.isActive
          ? 'Available for frontend renderers and page blocks.'
          : 'Inactive forms are hidden from public delivery.',
        ready: selectedForm.isActive,
      },
      {
        label: 'Fields',
        detail: hasFields
          ? `${selectedForm.fields.length} fields, ${selectedForm.fields.filter((field) => field.required).length} required`
          : 'Add fields before using this form in a page or app.',
        ready: hasFields,
      },
      {
        label: 'Lead identity',
        detail: hasRequiredIdentity
          ? 'Email or phone field is available for contact workflows.'
          : 'Add email or phone if this should create contacts.',
        ready: hasRequiredIdentity,
      },
      {
        label: 'Spam guard',
        detail: hasSpamGuard
          ? [selectedForm.enableHoneypot ? 'honeypot' : null, selectedForm.enableCaptcha ? 'captcha' : null].filter(Boolean).join(' + ')
          : 'Enable honeypot or captcha before exposing high-traffic forms.',
        ready: hasSpamGuard,
      },
      {
        label: 'Destination',
        detail: hasDestination
          ? [
              selectedForm.contactShare?.enabled ? 'contact inbox' : null,
              selectedForm.collectionTarget?.enabled ? 'collection record' : null,
            ].filter(Boolean).join(' + ')
          : 'Submissions stay in the form inbox only.',
        ready: hasDestination,
      },
      {
        label: 'Review mode',
        detail: selectedForm.moderationMode === 'auto-approve'
          ? 'Submissions can skip manual review.'
          : 'Manual review protects public workflows.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Render', detail: 'Fetch definition and build fields dynamically.' },
        { label: 'Submit', detail: 'POST values, requestId, and timing metadata.' },
        { label: 'Protect', detail: hasSpamGuard ? 'Spam guards run before persistence.' : 'Add spam guard for public launches.' },
        { label: 'Route', detail: hasDestination ? 'Share to contacts or a collection target.' : 'Keep in form inbox for admin review.' },
      ],
    };
  }, [selectedForm]);
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
    setNotice(null);

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

  const copyFormApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(null);
    } catch {
      setError(value);
      return;
    }

    setError(null);
    setNotice(`${label} copied.`);
  };

  return (
    <PageShell
      title="Forms"
      description="Capture leads, review submissions, and connect public forms to contacts or collections."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="forms-active-site"
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
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
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
            <Link
              to="/pages"
              className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="size-4" />
              Open Pages
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <Panel className="self-start overflow-hidden">
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
                  <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Form readiness</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Checks public delivery, field shape, lead identity, spam protection, destinations, and review mode.
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold',
                          selectedFormReadiness.score >= 80
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700',
                        )}
                        >
                          {selectedFormReadiness.score}% ready
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            selectedFormReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                          )}
                          style={{ width: `${selectedFormReadiness.score}%` }}
                        />
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {selectedFormReadiness.checks.map((check) => (
                          <FormReadinessCheck key={check.label} {...check} />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-primary" />
                        <h3 className="text-sm font-semibold">Submission workflow</h3>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {selectedFormReadiness.workflow.map((step, index) => (
                          <FormWorkflowStep key={step.label} index={index + 1} {...step} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Code2 className="size-4" />
                          Frontend form API
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Use the definition endpoint to render fields in any frontend, then POST validated values to the submission endpoint.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => void copyFormApiText(selectedFormDefinitionUrl, 'Form definition URL')} iconStart={<Copy className="size-4" />}>
                          Copy definition
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copyFormApiText(selectedFormSamplePayloadText, 'Sample payload')}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy payload
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copyFormApiText(selectedFormCurlExample, 'cURL example')}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy cURL
                        </Button>
                        <a
                          href={selectedFormDefinitionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                        >
                          <ExternalLink className="size-4" />
                          Open definition
                        </a>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <ApiSnippet label="Definition URL" value={selectedFormDefinitionUrl} />
                      <ApiSnippet label="Submit URL" value={selectedFormSubmitUrl} />
                    </div>
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      <ApiSnippet label="Sample submission payload" value={selectedFormSamplePayloadText} />
                      <ApiSnippet label="cURL submit example" value={selectedFormCurlExample} />
                    </div>
                  </div>

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
                        aria-label="Search submissions"
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

function FormReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function FormWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2">
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

const buildSampleSubmissionPayload = (form: FormDefinition) => ({
  values: Object.fromEntries(form.fields.map((field) => [field.key, sampleFormFieldValue(field)])),
  requestId: `web-${form.id}-request`,
  startedAt: Date.now() - 8000,
  ...(form.pageId ? { pageId: form.pageId } : {}),
  ...(form.postId ? { postId: form.postId } : {}),
  ...(form.contactShare?.enabled ? {
    contactShareOverride: {
      enabled: true,
      nameField: form.contactShare.nameField,
      emailField: form.contactShare.emailField,
      phoneField: form.contactShare.phoneField,
      notesField: form.contactShare.notesField,
      dedupeByEmail: form.contactShare.dedupeByEmail,
    },
  } : {}),
});

const sampleFormFieldValue = (field: FormDefinition['fields'][number]): unknown => {
  if (field.defaultValue) return field.defaultValue;

  switch (field.type) {
    case 'email':
      return 'ada@example.com';
    case 'number':
      return 1;
    case 'date':
      return '2026-05-09';
    case 'tel':
      return '+1 555 0100';
    case 'url':
      return 'https://example.com';
    case 'select':
    case 'radio':
      return field.options?.[0] || 'Option 1';
    case 'checkbox':
      return field.required ? true : false;
    case 'textarea':
      return field.placeholder || 'Sample message from a custom frontend.';
    case 'file':
      return 'media_asset_id_or_signed_upload_reference';
    default:
      return field.placeholder || field.label || 'Sample value';
  }
};

const toSingleQuotedShellString = (value: string): string => (
  `'${value.replace(/'/g, "'\\''")}'`
);

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
