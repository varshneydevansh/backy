import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  getAdminApiBase,
  getFormWithSubmissions,
  listCollections,
  listForms,
  createForm,
  updateForm,
  updateFormSubmission,
  type Collection,
  type FormDefinition,
  type FormFieldDefinition,
  type FormSubmission,
  type FormSubmissionStatus,
} from '@/lib/adminContentApi';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

type SubmissionStatusFilter = FormSubmissionStatus | 'all';
type PageTemplateHandoff = 'landing' | 'storefront' | 'contact' | 'registration';
type FormSourceFilter = 'all' | 'page' | 'blog' | 'embedded';
type FormStateFilter = 'all' | 'active' | 'inactive';
type FormDestinationFilter = 'all' | 'contacts' | 'collections' | 'inbox-only';
type FormReadinessFilter = 'all' | 'ready' | 'needs-work';

interface FormsSearch {
  siteId?: string;
  formId?: string;
  q?: string;
  source?: FormSourceFilter;
  state?: FormStateFilter;
  destination?: FormDestinationFilter;
  readiness?: FormReadinessFilter;
  status?: SubmissionStatusFilter;
  submissionQ?: string;
}

const FORM_SOURCE_FILTERS: FormSourceFilter[] = ['all', 'page', 'blog', 'embedded'];
const FORM_STATE_FILTERS: FormStateFilter[] = ['all', 'active', 'inactive'];
const FORM_DESTINATION_FILTERS: FormDestinationFilter[] = ['all', 'contacts', 'collections', 'inbox-only'];
const FORM_READINESS_FILTERS: FormReadinessFilter[] = ['all', 'ready', 'needs-work'];
const SUBMISSION_STATUS_FILTERS: SubmissionStatusFilter[] = ['all', 'pending', 'approved', 'rejected', 'spam'];
const FORM_FIELD_TYPES = ['text', 'email', 'number', 'textarea', 'select', 'checkbox', 'radio', 'date', 'tel', 'url', 'file'] as const;
type FormValidationRule = NonNullable<FormFieldDefinition['validation']>[number];
type FormValidationRuleType = 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max';
const FORM_VALIDATION_RULES: Array<{
  type: FormValidationRuleType;
  label: string;
  valuePlaceholder: string;
  valueMode: 'number' | 'text';
}> = [
  { type: 'minLength', label: 'Min length', valuePlaceholder: '2', valueMode: 'number' },
  { type: 'maxLength', label: 'Max length', valuePlaceholder: '120', valueMode: 'number' },
  { type: 'pattern', label: 'Pattern', valuePlaceholder: '^[A-Z].+', valueMode: 'text' },
  { type: 'min', label: 'Min value', valuePlaceholder: '1', valueMode: 'number' },
  { type: 'max', label: 'Max value', valuePlaceholder: '100', valueMode: 'number' },
];

const isFormSourceFilter = (value: unknown): value is FormSourceFilter => (
  typeof value === 'string' && FORM_SOURCE_FILTERS.includes(value as FormSourceFilter)
);

const isFormStateFilter = (value: unknown): value is FormStateFilter => (
  typeof value === 'string' && FORM_STATE_FILTERS.includes(value as FormStateFilter)
);

const isFormDestinationFilter = (value: unknown): value is FormDestinationFilter => (
  typeof value === 'string' && FORM_DESTINATION_FILTERS.includes(value as FormDestinationFilter)
);

const isFormReadinessFilter = (value: unknown): value is FormReadinessFilter => (
  typeof value === 'string' && FORM_READINESS_FILTERS.includes(value as FormReadinessFilter)
);

const isSubmissionStatusFilter = (value: unknown): value is SubmissionStatusFilter => (
  typeof value === 'string' && SUBMISSION_STATUS_FILTERS.includes(value as SubmissionStatusFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/forms')({
  validateSearch: (search: Record<string, unknown>): FormsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    formId: normalizedSearchString(search.formId),
    q: normalizedSearchString(search.q),
    source: isFormSourceFilter(search.source) ? search.source : undefined,
    state: isFormStateFilter(search.state) ? search.state : undefined,
    destination: isFormDestinationFilter(search.destination) ? search.destination : undefined,
    readiness: isFormReadinessFilter(search.readiness) ? search.readiness : undefined,
    status: isSubmissionStatusFilter(search.status) ? search.status : undefined,
    submissionQ: normalizedSearchString(search.submissionQ),
  }),
  component: FormsRoute,
});

const FORM_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose the website whose forms and submissions are being reviewed.',
    href: '#forms-site',
  },
  {
    title: 'Form health',
    detail: 'Active forms, pending submissions, spam volume, and review status.',
    href: '#forms-metrics',
  },
  {
    title: 'Form library',
    detail: 'Switch between page, blog, and embedded forms for this site.',
    href: '#forms-library',
  },
  {
    title: 'Templates',
    detail: 'Registration, contact, newsletter, and product inquiry schemas.',
    href: '#forms-templates',
  },
  {
    title: 'Frontend API',
    detail: 'Definition, submit URL, sample payload, and cURL handoff.',
    href: '#forms-api',
  },
  {
    title: 'Submission inbox',
    detail: 'Search, filter, export, approve, reject, or mark submissions as spam.',
    href: '#forms-inbox',
  },
] as const;

interface FormTemplateBlueprint {
  id: string;
  title: string;
  description: string;
  pageTemplate: PageTemplateHandoff;
  audience: FormDefinition['audience'];
  moderationMode: NonNullable<FormDefinition['moderationMode']>;
  successMessage: string;
  fields: FormFieldDefinition[];
  contactShare?: FormDefinition['contactShare'];
  collectionTarget?: FormDefinition['collectionTarget'];
}

const FORM_TEMPLATES: FormTemplateBlueprint[] = [
  {
    id: 'registration',
    title: 'Registration',
    description: 'Account, member, or waitlist signup with identity, phone, role, and consent fields.',
    pageTemplate: 'registration',
    audience: 'public',
    moderationMode: 'manual',
    successMessage: 'Registration received. Check your inbox for the next step.',
    contactShare: {
      enabled: true,
      nameField: 'full_name',
      emailField: 'email',
      phoneField: 'phone',
      notesField: 'member_type',
      dedupeByEmail: true,
    },
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', placeholder: 'Ada Lovelace', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 0100' },
      { key: 'member_type', label: 'Member type', type: 'select', options: ['Customer', 'Creator', 'Partner'], required: true },
      { key: 'consent', label: 'I agree to be contacted about this registration.', type: 'checkbox', required: true },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    description: 'Standard lead capture form for service inquiries and general website contact pages.',
    pageTemplate: 'contact',
    audience: 'public',
    moderationMode: 'manual',
    successMessage: 'Thanks. We will reply soon.',
    contactShare: {
      enabled: true,
      nameField: 'name',
      emailField: 'email',
      phoneField: 'phone',
      notesField: 'message',
      dedupeByEmail: true,
    },
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Your name', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 0100' },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Tell us what you need', required: true },
    ],
  },
  {
    id: 'newsletter',
    title: 'Newsletter',
    description: 'Lightweight subscriber capture with topic preference and consent controls.',
    pageTemplate: 'landing',
    audience: 'public',
    moderationMode: 'auto-approve',
    successMessage: 'You are subscribed.',
    contactShare: {
      enabled: true,
      nameField: 'name',
      emailField: 'email',
      notesField: 'topics',
      dedupeByEmail: true,
    },
    fields: [
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Optional' },
      { key: 'topics', label: 'Topics', type: 'select', options: ['Product updates', 'Design notes', 'Launches'], defaultValue: 'Product updates' },
      { key: 'consent', label: 'I agree to receive email updates.', type: 'checkbox', required: true },
    ],
  },
  {
    id: 'product-inquiry',
    title: 'Product inquiry',
    description: 'Commerce support or quote request form that can sit on product detail pages.',
    pageTemplate: 'storefront',
    audience: 'public',
    moderationMode: 'manual',
    successMessage: 'Inquiry received. We will follow up with details.',
    contactShare: {
      enabled: true,
      nameField: 'name',
      emailField: 'email',
      phoneField: 'phone',
      notesField: 'question',
      dedupeByEmail: true,
    },
    fields: [
      { key: 'product_sku', label: 'Product SKU', type: 'text', placeholder: 'BKY-001', required: true },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Your name', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { key: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1' },
      { key: 'question', label: 'Question', type: 'textarea', placeholder: 'Ask about pricing, delivery, or customization.' },
    ],
  },
  {
    id: 'file-intake',
    title: 'File intake',
    description: 'Document, portfolio, asset, or support-file upload flow backed by media references and review notes.',
    pageTemplate: 'contact',
    audience: 'public',
    moderationMode: 'manual',
    successMessage: 'Files received. We will review them and follow up.',
    contactShare: {
      enabled: true,
      nameField: 'name',
      emailField: 'email',
      notesField: 'notes',
      dedupeByEmail: true,
    },
    collectionTarget: {
      enabled: true,
      collectionId: 'file-requests',
      slugField: 'email',
      fieldMap: {
        name: 'name',
        email: 'email',
        upload: 'file_reference',
        notes: 'notes',
      },
    },
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Your name', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { key: 'upload', label: 'Upload', type: 'file', helpText: 'Attach a media asset ID or signed upload reference.', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Describe the file or request.' },
      { key: 'consent', label: 'I confirm I have permission to share these files.', type: 'checkbox', required: true },
    ],
  },
];

const REGISTRATION_FORM_TEMPLATE = FORM_TEMPLATES.find((template) => template.id === 'registration') ?? FORM_TEMPLATES[0];

const FORM_FRONTEND_SYSTEMS = [
  {
    key: 'definition',
    title: 'Dynamic form definition',
    detail: 'Frontend renderers fetch field labels, types, validation, options, defaults, and active state.',
  },
  {
    key: 'submission',
    title: 'Submission pipeline',
    detail: 'Public apps POST values, request IDs, timing metadata, source page/post IDs, and consent fields.',
  },
  {
    key: 'spam',
    title: 'Spam protection',
    detail: 'Honeypot, captcha readiness, moderation mode, spam queue, and reviewer status controls.',
  },
  {
    key: 'contacts',
    title: 'Lead routing',
    detail: 'Contact sharing maps name, email, phone, notes, dedupe rules, and follow-up workflows.',
  },
  {
    key: 'collections',
    title: 'Collection writes',
    detail: 'Structured submissions can write records into custom collections for directories, events, or registrations.',
  },
  {
    key: 'files',
    title: 'File uploads',
    detail: 'File fields hand off media asset IDs or signed upload references for private/public storage flows.',
  },
] as const;

const FORM_ACCOUNT_HANDOFF_STEPS = [
  {
    key: 'signup',
    title: 'Account signup',
    detail: 'Use the registration template to collect identity, email, phone, member type, and consent from any custom frontend.',
  },
  {
    key: 'review',
    title: 'Review and consent',
    detail: 'Keep moderation manual by default so admins can approve registrations before they become contacts, members, or collection records.',
  },
  {
    key: 'profile',
    title: 'Profile handoff',
    detail: 'Route approved values into Contacts or a mapped collection today; auth/session provisioning stays a dedicated user-account milestone.',
  },
] as const;

const FORM_EXPORT_COLUMNS = [
  'form_id',
  'active_site_id',
  'name',
  'title',
  'description',
  'is_active',
  'audience',
  'source',
  'page_id',
  'post_id',
  'field_count',
  'required_field_count',
  'field_keys',
  'field_types',
  'moderation_mode',
  'honeypot',
  'captcha',
  'contact_share',
  'collection_target',
  'submission_total',
  'submission_pending',
  'submission_spam',
  'definition_url',
  'submit_url',
  'contacts_url',
  'frontend_systems',
] as const;

interface FormInbox {
  form: FormDefinition;
  submissions: FormSubmission[];
  total: number;
}

function FormsRoute() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [inboxByForm, setInboxByForm] = useState<Record<string, FormInbox>>({});
  const [selectedFormId, setSelectedFormId] = useState<string | null>(routeSearch.formId || null);
  const [formDraft, setFormDraft] = useState<FormDefinition | null>(null);
  const [formSearchQuery, setFormSearchQuery] = useState(routeSearch.q || '');
  const [formSourceFilter, setFormSourceFilter] = useState<FormSourceFilter>(routeSearch.source || 'all');
  const [formStateFilter, setFormStateFilter] = useState<FormStateFilter>(routeSearch.state || 'all');
  const [formDestinationFilter, setFormDestinationFilter] = useState<FormDestinationFilter>(routeSearch.destination || 'all');
  const [formReadinessFilter, setFormReadinessFilter] = useState<FormReadinessFilter>(routeSearch.readiness || 'all');
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>(routeSearch.status || 'all');
  const [submissionQuery, setSubmissionQuery] = useState(routeSearch.submissionQ || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isFormsBusy = isLoading || Boolean(isUpdatingId) || Boolean(isCreatingTemplateId) || isSavingForm;

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminBaseUrl = useMemo(() => getAdminApiBase(), []);
  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId],
  );
  const selectedFormIsStandalone = Boolean(selectedForm && !selectedForm.pageId && !selectedForm.postId);
  const formDraftDirty = Boolean(selectedForm && formDraft && JSON.stringify(buildFormUpdatePayload(formDraft)) !== JSON.stringify(buildFormUpdatePayload(selectedForm)));
  const writableCollections = useMemo(() => collections.filter((collection) => (
    collection.status === 'published' && collection.permissions.publicCreate
  )), [collections]);
  const formDraftTargetCollection = useMemo(() => {
    if (!formDraft?.collectionTarget?.collectionId) return null;
    return collections.find((collection) => collection.id === formDraft.collectionTarget?.collectionId) || null;
  }, [collections, formDraft?.collectionTarget?.collectionId]);
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
    const hasRequiredIdentity = formHasRequiredIdentity(selectedForm);
    const hasSpamGuard = formHasSpamGuard(selectedForm);
    const hasDestination = formHasDestination(selectedForm);
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
  const filteredForms = useMemo(() => {
    const normalizedSearch = formSearchQuery.trim().toLowerCase();

    return forms.filter((form) => {
      const source = getFormSource(form);
      if (formSourceFilter !== 'all' && source !== formSourceFilter) return false;

      if (formStateFilter === 'active' && !form.isActive) return false;
      if (formStateFilter === 'inactive' && form.isActive) return false;

      const sharesContacts = Boolean(form.contactShare?.enabled);
      const writesCollection = Boolean(form.collectionTarget?.enabled);
      if (formDestinationFilter === 'contacts' && !sharesContacts) return false;
      if (formDestinationFilter === 'collections' && !writesCollection) return false;
      if (formDestinationFilter === 'inbox-only' && (sharesContacts || writesCollection)) return false;

      const readinessScore = getFormLaunchReadinessScore(form);
      if (formReadinessFilter === 'ready' && readinessScore < 80) return false;
      if (formReadinessFilter === 'needs-work' && readinessScore >= 80) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        form.id,
        form.name,
        form.title,
        form.description,
        form.audience,
        form.moderationMode,
        source,
        form.pageId,
        form.postId,
        ...form.fields.flatMap((field) => [field.key, field.label, field.type, field.placeholder, field.helpText]),
      ].filter(Boolean).join(' ').toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [formDestinationFilter, formReadinessFilter, formSearchQuery, formSourceFilter, formStateFilter, forms]);
  const hasActiveFormFilters = Boolean(
    formSearchQuery.trim() ||
    formSourceFilter !== 'all' ||
    formStateFilter !== 'all' ||
    formDestinationFilter !== 'all' ||
    formReadinessFilter !== 'all',
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
  const formCommandReadiness = useMemo(() => {
    if (selectedForm) {
      return selectedFormReadiness;
    }

    const checks = [
      {
        label: 'Form library',
        detail: forms.length > 0 ? `${forms.length} form${forms.length === 1 ? '' : 's'} loaded.` : 'Create a page or blog form block first.',
        ready: forms.length > 0,
      },
      {
        label: 'Active forms',
        detail: metrics.active > 0 ? `${metrics.active} active form${metrics.active === 1 ? '' : 's'}.` : 'Activate a form before public delivery.',
        ready: metrics.active > 0,
      },
      {
        label: 'Submission inbox',
        detail: metrics.pending > 0 ? `${metrics.pending} pending submission${metrics.pending === 1 ? '' : 's'}.` : 'No pending submissions for review.',
        ready: true,
      },
      {
        label: 'Spam review',
        detail: metrics.spam > 0 ? `${metrics.spam} spam submission${metrics.spam === 1 ? '' : 's'} isolated.` : 'Spam queue is clear.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Build', detail: 'Add a form block to a page, post, or frontend surface.' },
        { label: 'Expose', detail: 'Use definition and submit APIs from custom frontends.' },
        { label: 'Protect', detail: 'Enable spam guard, review mode, and destination routing.' },
        { label: 'Review', detail: 'Approve, reject, export, or route submissions into contacts and collections.' },
      ],
    };
  }, [forms.length, metrics.active, metrics.pending, metrics.spam, selectedForm, selectedFormReadiness]);
  const formsListUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms`;
  const selectedFormContactsUrl = selectedForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(selectedForm.id)}/contacts?limit=100`
    : '';
  const formsHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    endpoints: {
      formList: formsListUrl,
      selectedDefinition: selectedFormDefinitionUrl,
      selectedSubmit: selectedFormSubmitUrl,
      selectedAdminInbox: selectedForm
        ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(selectedForm.id)}/submissions?limit=100`
        : '',
      selectedContacts: selectedFormContactsUrl,
    },
    readiness: {
      score: formCommandReadiness.score,
      checks: formCommandReadiness.checks,
    },
    export: {
      format: 'csv',
      columns: FORM_EXPORT_COLUMNS,
      filteredRows: filteredForms.length,
    },
    filters: {
      query: formSearchQuery.trim(),
      source: formSourceFilter,
      state: formStateFilter,
      destination: formDestinationFilter,
      readiness: formReadinessFilter,
      visible: filteredForms.length,
      total: forms.length,
    },
    frontendSystems: FORM_FRONTEND_SYSTEMS,
    accountRegistration: {
      templateId: REGISTRATION_FORM_TEMPLATE.id,
      pageTemplate: REGISTRATION_FORM_TEMPLATE.pageTemplate,
      title: REGISTRATION_FORM_TEMPLATE.title,
      requiredFields: REGISTRATION_FORM_TEMPLATE.fields
        .filter((field) => field.required)
        .map((field) => field.key),
      contactShare: REGISTRATION_FORM_TEMPLATE.contactShare,
      handoffSteps: FORM_ACCOUNT_HANDOFF_STEPS,
      currentCapability: 'Backy can capture, moderate, export, and route registration submissions into contacts or collections.',
      remainingAccountMilestone: 'Authenticated member accounts, password/session lifecycle, and role assignment are still handled by the Users/Auth roadmap.',
    },
    metrics,
    templates: FORM_TEMPLATES.map((template) => buildTemplateManifest(template)),
    selectedForm: selectedForm ? {
      id: selectedForm.id,
      name: selectedForm.name,
      title: selectedForm.title,
      description: selectedForm.description,
      isActive: selectedForm.isActive,
      audience: selectedForm.audience,
      moderationMode: selectedForm.moderationMode,
      pageId: selectedForm.pageId,
      postId: selectedForm.postId,
      enableHoneypot: selectedForm.enableHoneypot,
      enableCaptcha: selectedForm.enableCaptcha,
      contactShare: selectedForm.contactShare,
      collectionTarget: selectedForm.collectionTarget,
      fields: selectedForm.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        helpText: field.helpText,
        options: field.options,
        defaultValue: field.defaultValue,
        validation: field.validation,
      })),
      samplePayload: selectedFormSamplePayload,
      curl: selectedFormCurlExample,
    } : null,
    forms: filteredForms.map((form) => {
      const inbox = inboxByForm[form.id];
      const source = getFormSource(form);
      return {
        id: form.id,
        name: form.name,
        title: form.title,
        description: form.description,
        isActive: form.isActive,
        audience: form.audience,
        source,
        pageId: form.pageId,
        postId: form.postId,
        readinessScore: getFormLaunchReadinessScore(form),
        fieldCount: form.fields.length,
        requiredFieldCount: form.fields.filter((field) => field.required).length,
        moderationMode: form.moderationMode,
        spamGuards: {
          honeypot: form.enableHoneypot,
          captcha: form.enableCaptcha,
        },
        destinations: {
          contactShare: Boolean(form.contactShare?.enabled),
          collectionTarget: Boolean(form.collectionTarget?.enabled),
        },
        submissionCounts: {
          total: inbox?.total || 0,
          pending: inbox?.submissions.filter((submission) => submission.status === 'pending').length || 0,
          approved: inbox?.submissions.filter((submission) => submission.status === 'approved').length || 0,
          rejected: inbox?.submissions.filter((submission) => submission.status === 'rejected').length || 0,
          spam: inbox?.submissions.filter((submission) => submission.status === 'spam').length || 0,
        },
        definitionUrl: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/definition`,
        submitUrl: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/submissions`,
      };
    }),
    privacy: {
      includesSubmissionValues: false,
      note: 'Submission values stay in the admin inbox and CSV export. This manifest exposes form definitions, endpoints, routing configuration, and counts only.',
    },
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    adminBaseUrl,
    filteredForms,
    formDestinationFilter,
    formCommandReadiness.checks,
    formCommandReadiness.score,
    formReadinessFilter,
    formSearchQuery,
    formSourceFilter,
    formStateFilter,
    forms,
    formsListUrl,
    inboxByForm,
    metrics,
    publicBaseUrl,
    selectedForm,
    selectedFormContactsUrl,
    selectedFormCurlExample,
    selectedFormDefinitionUrl,
    selectedFormSamplePayload,
    selectedFormSubmitUrl,
  ]);
  const formsHandoffText = useMemo(() => JSON.stringify(formsHandoff, null, 2), [formsHandoff]);
  const formsRouteSearch = useMemo<FormsSearch>(() => ({
    siteId: activeSiteId,
    ...(selectedFormId ? { formId: selectedFormId } : {}),
    ...(formSearchQuery.trim() ? { q: formSearchQuery.trim() } : {}),
    ...(formSourceFilter !== 'all' ? { source: formSourceFilter } : {}),
    ...(formStateFilter !== 'all' ? { state: formStateFilter } : {}),
    ...(formDestinationFilter !== 'all' ? { destination: formDestinationFilter } : {}),
    ...(formReadinessFilter !== 'all' ? { readiness: formReadinessFilter } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(submissionQuery.trim() ? { submissionQ: submissionQuery.trim() } : {}),
  }), [
    activeSiteId,
    formDestinationFilter,
    formReadinessFilter,
    formSearchQuery,
    formSourceFilter,
    formStateFilter,
    selectedFormId,
    statusFilter,
    submissionQuery,
  ]);

  const updateFormsRouteSearch = (next: FormsSearch) => {
    const merged: FormsSearch = {
      ...formsRouteSearch,
      ...next,
    };
    const normalized: FormsSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.formId ? { formId: merged.formId } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
      ...(merged.source && merged.source !== 'all' ? { source: merged.source } : {}),
      ...(merged.state && merged.state !== 'all' ? { state: merged.state } : {}),
      ...(merged.destination && merged.destination !== 'all' ? { destination: merged.destination } : {}),
      ...(merged.readiness && merged.readiness !== 'all' ? { readiness: merged.readiness } : {}),
      ...(merged.status && merged.status !== 'all' ? { status: merged.status } : {}),
      ...(merged.submissionQ?.trim() ? { submissionQ: merged.submissionQ.trim() } : {}),
    };

    navigate({ to: '/forms', search: normalized, replace: true });
  };

  const loadForms = async () => {
    if (isFormsBusy) return;

    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [loadedForms, loadedCollections] = await Promise.all([
        listForms(activeSiteId),
        listCollections(activeSiteId).catch(() => []),
      ]);
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
      setCollections(loadedCollections);
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

  const openFormPageTemplate = (template: PageTemplateHandoff) => {
    if (isFormsBusy) return;

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template } });
  };

  const createFormFromTemplate = async (template: FormTemplateBlueprint) => {
    if (isFormsBusy) return;

    setIsCreatingTemplateId(template.id);
    setError(null);
    setNotice(null);

    try {
      const created = await createForm(activeSiteId, {
        name: `${template.id}-${Date.now().toString(36)}`,
        title: template.title,
        description: template.description,
        audience: template.audience,
        isActive: true,
        fields: template.fields,
        successMessage: template.successMessage,
        enableHoneypot: true,
        enableCaptcha: false,
        moderationMode: template.moderationMode,
        contactShare: template.contactShare,
        collectionTarget: template.collectionTarget,
      });
      setForms((current) => [created, ...current.filter((form) => form.id !== created.id)]);
      setInboxByForm((current) => ({
        ...current,
        [created.id]: {
          form: created,
          submissions: [],
          total: 0,
        },
      }));
      setSelectedFormId(created.id);
      updateFormsRouteSearch({ formId: created.id, q: undefined, source: undefined, state: undefined, destination: undefined, readiness: undefined });
      setNotice(`${template.title} form created. It is active and ready for public submissions.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create form from template');
    } finally {
      setIsCreatingTemplateId(null);
    }
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
    }

    setSelectedFormId(routeSearch.formId || null);
    setFormSearchQuery(routeSearch.q || '');
    setFormSourceFilter(routeSearch.source || 'all');
    setFormStateFilter(routeSearch.state || 'all');
    setFormDestinationFilter(routeSearch.destination || 'all');
    setFormReadinessFilter(routeSearch.readiness || 'all');
    setSubmissionQuery(routeSearch.submissionQ || '');
    setStatusFilter(routeSearch.status || 'all');
  }, [
    routeSearch.destination,
    routeSearch.formId,
    routeSearch.q,
    routeSearch.readiness,
    routeSearch.siteId,
    routeSearch.source,
    routeSearch.state,
    routeSearch.status,
    routeSearch.submissionQ,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    setFormDraft(selectedForm ? cloneFormDefinition(selectedForm) : null);
  }, [selectedForm]);

  const patchFormDraft = (patch: Partial<FormDefinition>) => {
    setFormDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const patchFormDraftField = (fieldIndex: number, patch: Partial<FormFieldDefinition>) => {
    setFormDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        fields: current.fields.map((field, index) => (
          index === fieldIndex ? { ...field, ...patch } : field
        )),
      };
    });
  };

  const patchFormDraftFieldValidation = (
    fieldIndex: number,
    ruleType: FormValidationRuleType,
    patch: Partial<FormValidationRule>,
  ) => {
    setFormDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        fields: current.fields.map((field, index) => {
          if (index !== fieldIndex) return field;

          const existingRules = field.validation || [];
          const existingRule = existingRules.find((rule) => rule.type === ruleType);
          const nextRule = {
            type: ruleType,
            message: existingRule?.message || defaultValidationMessage(field.label, ruleType),
            ...existingRule,
            ...patch,
          };
          const withoutRule = existingRules.filter((rule) => rule.type !== ruleType);
          const hasValue = nextRule.value !== undefined && String(nextRule.value).trim().length > 0;
          const hasMessage = Boolean(nextRule.message?.trim());
          const validation = hasValue || hasMessage
            ? [...withoutRule, nextRule]
            : withoutRule;

          return {
            ...field,
            validation: validation.length > 0 ? validation : undefined,
          };
        }),
      };
    });
  };

  const patchFormDraftCollectionTarget = (patch: Partial<NonNullable<FormDefinition['collectionTarget']>>) => {
    setFormDraft((current) => {
      if (!current) return current;

      const currentTarget = current.collectionTarget || {
        enabled: false,
        collectionId: '',
        slugField: current.fields[0]?.key,
        fieldMap: {},
      };
      const nextTarget = {
        ...currentTarget,
        ...patch,
      };

      return {
        ...current,
        collectionTarget: nextTarget.enabled ? nextTarget : { ...nextTarget, enabled: false },
      };
    });
  };

  const addFormDraftField = () => {
    setFormDraft((current) => {
      if (!current) return current;
      const nextNumber = current.fields.length + 1;
      return {
        ...current,
        fields: [
          ...current.fields,
          {
            key: `field_${nextNumber}`,
            label: `Field ${nextNumber}`,
            type: 'text',
            required: false,
          },
        ],
      };
    });
  };

  const removeFormDraftField = (fieldIndex: number) => {
    setFormDraft((current) => {
      if (!current || current.fields.length <= 1) return current;
      return {
        ...current,
        fields: current.fields.filter((_, index) => index !== fieldIndex),
      };
    });
  };

  const moveFormDraftField = (fieldIndex: number, direction: -1 | 1) => {
    setFormDraft((current) => {
      if (!current) return current;
      const nextIndex = fieldIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;

      const fields = [...current.fields];
      const [field] = fields.splice(fieldIndex, 1);
      fields.splice(nextIndex, 0, field);
      return { ...current, fields };
    });
  };

  const saveFormDraft = async () => {
    if (isFormsBusy || !selectedForm || !formDraft || !selectedFormIsStandalone) return;

    const payload = buildFormUpdatePayload(formDraft);
    if (!payload.name.trim()) {
      setError('Form name is required.');
      setNotice(null);
      return;
    }
    if (!payload.fields.length) {
      setError('At least one field is required.');
      setNotice(null);
      return;
    }
    if (payload.fields.some((field) => !field.key.trim() || !field.label.trim())) {
      setError('Every field needs a key and label.');
      setNotice(null);
      return;
    }

    setIsSavingForm(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateForm(activeSiteId, selectedForm.id, payload);
      setForms((current) => current.map((form) => (form.id === updated.id ? updated : form)));
      setInboxByForm((current) => {
        const inbox = current[updated.id];
        if (!inbox) return current;

        return {
          ...current,
          [updated.id]: {
            ...inbox,
            form: updated,
          },
        };
      });
      setFormDraft(cloneFormDefinition(updated));
      setNotice('Form settings and fields saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save form');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleSubmissionStatus = async (submission: FormSubmission, status: FormSubmissionStatus) => {
    if (isFormsBusy) return;
    if (submission.status === status) return;

    setIsUpdatingId(submission.id);
    setError(null);
    setNotice(null);

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
      setNotice(`Submission marked ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update submission');
    } finally {
      setIsUpdatingId(null);
    }
  };

  const handleExportSubmissions = () => {
    if (isFormsBusy) return;
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
    setError(null);
    setNotice(`Submission CSV exported with ${filteredSubmissions.length} visible submission${filteredSubmissions.length === 1 ? '' : 's'}.`);
  };

  const handleExportFormsCatalog = () => {
    if (isFormsBusy) return;

    if (filteredForms.length === 0) {
      setError(hasActiveFormFilters ? 'No forms match the active filters.' : 'No forms are available to export for this site.');
      setNotice(null);
      return;
    }

    const rows = filteredForms.map((form) => {
      const inbox = inboxByForm[form.id];
      const source = getFormSource(form);
      const definitionUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/definition`;
      const submitUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/submissions`;
      const contactsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts?limit=100`;

      return [
        form.id,
        activeSiteId,
        form.name,
        form.title,
        form.description || '',
        form.isActive,
        form.audience,
        source,
        form.pageId || '',
        form.postId || '',
        form.fields.length,
        form.fields.filter((field) => field.required).length,
        form.fields.map((field) => field.key).join('; '),
        form.fields.map((field) => `${field.key}:${field.type}`).join('; '),
        form.moderationMode,
        Boolean(form.enableHoneypot),
        Boolean(form.enableCaptcha),
        Boolean(form.contactShare?.enabled),
        form.collectionTarget?.enabled ? form.collectionTarget.collectionId : '',
        inbox?.total || 0,
        inbox?.submissions.filter((submission) => submission.status === 'pending').length || 0,
        inbox?.submissions.filter((submission) => submission.status === 'spam').length || 0,
        definitionUrl,
        submitUrl,
        contactsUrl,
        FORM_FRONTEND_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
      ];
    });
    const csv = [FORM_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-forms-catalog.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice(`Forms catalog CSV exported with ${filteredForms.length} visible form${filteredForms.length === 1 ? '' : 's'}.`);
  };

  const copyFormApiText = async (value: string, label: string) => {
    if (isFormsBusy) return;

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
  const downloadFormsHandoff = () => {
    if (isFormsBusy) return;

    const blob = new Blob([formsHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-forms-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Forms handoff manifest downloaded.');
  };
  const clearFormFilters = () => {
    if (isFormsBusy) return;

    setFormSearchQuery('');
    setFormSourceFilter('all');
    setFormStateFilter('all');
    setFormDestinationFilter('all');
    setFormReadinessFilter('all');
    setSelectedFormId(null);
    updateFormsRouteSearch({
      formId: undefined,
      q: undefined,
      source: undefined,
      state: undefined,
      destination: undefined,
      readiness: undefined,
    });
  };
  const selectFormsSite = (nextSiteId: string) => {
    if (isFormsBusy) return;

    setSelectedSiteId(nextSiteId);
    setFormSearchQuery('');
    setFormSourceFilter('all');
    setFormStateFilter('all');
    setFormDestinationFilter('all');
    setFormReadinessFilter('all');
    setSubmissionQuery('');
    setStatusFilter('all');
    setSelectedFormId(null);
    navigate({ to: '/forms', search: { siteId: nextSiteId }, replace: true });
  };
  const selectForm = (formId: string) => {
    if (isFormsBusy) return;

    setSelectedFormId(formId);
    setSubmissionQuery('');
    setStatusFilter('all');
    updateFormsRouteSearch({
      formId,
      status: undefined,
      submissionQ: undefined,
    });
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
            disabled={isFormsBusy}
            onChange={(event) => {
              selectFormsSite(event.target.value);
            }}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadForms()} disabled={isFormsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="forms-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Forms command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                formCommandReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {formCommandReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control public form delivery, dynamic frontend rendering, spam protection, contact routing, collection writes, review queues, and submission exports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void copyFormApiText(formsHandoffText, 'Forms handoff manifest')}
              disabled={isFormsBusy}
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadFormsHandoff} disabled={isFormsBusy} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={handleExportFormsCatalog}
              disabled={isFormsBusy || filteredForms.length === 0}
              iconStart={<Download className="size-4" />}
            >
              Export forms CSV
            </Button>
            <Button onClick={() => void loadForms()} disabled={isFormsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh forms
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Form readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks whether forms can render publicly, collect usable lead data, protect submissions, and route records.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', formCommandReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${formCommandReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {formCommandReadiness.checks.map((check) => (
                <FormReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <FileInput className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Submission workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {formCommandReadiness.workflow.map((step, index) => (
                <FormWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Forms control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, form health, templates, library, frontend API, and submission review.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            {FORM_CONTROL_AREAS.map((area) => (
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

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Form frontend control contract</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom frontends need these systems to render registration, contact, newsletter, product inquiry, file intake, and upload forms from Backy.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {FORM_FRONTEND_SYSTEMS.length} systems
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {FORM_FRONTEND_SYSTEMS.map((system) => (
              <div key={system.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{system.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {system.key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="forms-account-contract">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Registration/account handoff</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Backy can run signup-style public forms today: render the registration schema, capture consent, review submissions, and route approved values into contacts or collections. Authenticated member accounts remain a separate Users/Auth milestone.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void createFormFromTemplate(REGISTRATION_FORM_TEMPLATE)}
                disabled={isFormsBusy}
                iconStart={<FileInput className="size-4" />}
              >
                {isCreatingTemplateId === REGISTRATION_FORM_TEMPLATE.id ? 'Creating...' : 'Create registration form'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openFormPageTemplate(REGISTRATION_FORM_TEMPLATE.pageTemplate)}
                disabled={isFormsBusy}
                iconStart={<Sparkles className="size-4" />}
              >
                Start registration page
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {FORM_ACCOUNT_HANDOFF_STEPS.map((step, index) => (
              <div key={step.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="text-sm font-semibold text-foreground">{step.title}</div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div id="forms-site" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="forms-active-site-inline">
          Active site
        </label>
        <select
          id="forms-active-site-inline"
          aria-label="Active forms site"
          value={activeSiteId}
          disabled={isFormsBusy}
          onChange={(event) => {
            selectFormsSite(event.target.value);
          }}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
          {activeSite?.name || activeSiteId} form inbox
        </span>
      </div>

      <div id="forms-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-4">
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

      <Panel id="forms-templates" className="mb-6 scroll-mt-24">
        <PanelHeader
          title="Form templates"
          description="Copy complete schemas for registration, contact, newsletter, and product inquiry experiences."
          icon={<Sparkles className="size-4" />}
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {FORM_TEMPLATES.map((template) => {
              const templateManifest = buildTemplateManifest(template);
              const templateText = JSON.stringify(templateManifest, null, 2);
              const payloadText = JSON.stringify(templateManifest.samplePayload, null, 2);

              return (
                <div key={template.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{template.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                      {template.fields.length} fields
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.audience}</span>
                    <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.moderationMode}</span>
                    <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {template.contactShare?.enabled ? 'contacts' : 'inbox'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {template.fields.slice(0, 4).map((field) => (
                      <div key={field.key} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/40 px-2.5 py-2">
                        <span className="truncate text-xs font-medium text-foreground">{field.label}</span>
                        <span className="shrink-0 rounded bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{field.type}</span>
                      </div>
                    ))}
                    {template.fields.length > 4 ? (
                      <div className="text-xs text-muted-foreground">+{template.fields.length - 4} more field{template.fields.length - 4 === 1 ? '' : 's'}</div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void createFormFromTemplate(template)}
                      disabled={isFormsBusy}
                      iconStart={<FileInput className="size-4" />}
                    >
                      {isCreatingTemplateId === template.id ? 'Creating...' : 'Create form'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openFormPageTemplate(template.pageTemplate)}
                      disabled={isFormsBusy}
                      iconStart={<Sparkles className="size-4" />}
                    >
                      Start page
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void copyFormApiText(templateText, `${template.title} form template`)}
                      disabled={isFormsBusy}
                      iconStart={<Copy className="size-4" />}
                    >
                      Copy schema
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copyFormApiText(payloadText, `${template.title} sample payload`)}
                      disabled={isFormsBusy}
                      iconStart={<Copy className="size-4" />}
                    >
                      Payload
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelContent>
      </Panel>

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
            <Button
              variant="primary"
              onClick={() => openFormPageTemplate('registration')}
              disabled={isFormsBusy}
              className="mt-2"
              iconStart={<Sparkles className="size-4" />}
            >
              Create registration page
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <Panel id="forms-library" className="self-start overflow-hidden scroll-mt-24">
            <PanelHeader
              title="Form library"
              description={`${filteredForms.length}/${forms.length} visible form${forms.length === 1 ? '' : 's'} on ${activeSite?.name || activeSiteId}`}
              icon={<ClipboardList className="size-4" />}
            />
            <PanelContent>
              <div className="grid gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    aria-label="Search forms"
                    value={formSearchQuery}
                    disabled={isFormsBusy}
                    onChange={(event) => {
                      if (isFormsBusy) return;
                      const q = event.target.value;
                      setFormSearchQuery(q);
                      setSelectedFormId(null);
                      updateFormsRouteSearch({ q: q || undefined, formId: undefined });
                    }}
                    placeholder="Search forms, fields, IDs..."
                    className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <select
                    aria-label="Form source filter"
                    value={formSourceFilter}
                    disabled={isFormsBusy}
                    onChange={(event) => {
                      if (isFormsBusy) return;
                      const source = event.target.value as FormSourceFilter;
                      setFormSourceFilter(source);
                      setSelectedFormId(null);
                      updateFormsRouteSearch({ source, formId: undefined });
                    }}
                    className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All sources</option>
                    <option value="page">Page forms</option>
                    <option value="blog">Blog forms</option>
                    <option value="embedded">Embedded forms</option>
                  </select>
                  <select
                    aria-label="Form state filter"
                    value={formStateFilter}
                    disabled={isFormsBusy}
                    onChange={(event) => {
                      if (isFormsBusy) return;
                      const state = event.target.value as FormStateFilter;
                      setFormStateFilter(state);
                      setSelectedFormId(null);
                      updateFormsRouteSearch({ state, formId: undefined });
                    }}
                    className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All states</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                  </select>
                  <select
                    aria-label="Form destination filter"
                    value={formDestinationFilter}
                    disabled={isFormsBusy}
                    onChange={(event) => {
                      if (isFormsBusy) return;
                      const destination = event.target.value as FormDestinationFilter;
                      setFormDestinationFilter(destination);
                      setSelectedFormId(null);
                      updateFormsRouteSearch({ destination, formId: undefined });
                    }}
                    className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All destinations</option>
                    <option value="contacts">Routes to contacts</option>
                    <option value="collections">Writes collections</option>
                    <option value="inbox-only">Inbox only</option>
                  </select>
                  <select
                    aria-label="Form readiness filter"
                    value={formReadinessFilter}
                    disabled={isFormsBusy}
                    onChange={(event) => {
                      if (isFormsBusy) return;
                      const readiness = event.target.value as FormReadinessFilter;
                      setFormReadinessFilter(readiness);
                      setSelectedFormId(null);
                      updateFormsRouteSearch({ readiness, formId: undefined });
                    }}
                    className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All readiness</option>
                    <option value="ready">Launch ready</option>
                    <option value="needs-work">Needs work</option>
                  </select>
                </div>
                {hasActiveFormFilters && (
                  <Button variant="outline" onClick={clearFormFilters} disabled={isFormsBusy} className="w-full">
                    Clear form filters
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {filteredForms.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                    <div className="text-sm font-medium text-foreground">No forms match this library view</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Change the search, source, state, destination, or readiness filters to broaden the form library.
                    </div>
                    {hasActiveFormFilters && (
                      <Button variant="outline" onClick={clearFormFilters} disabled={isFormsBusy} className="mt-4">
                        Clear form filters
                      </Button>
                    )}
                  </div>
                ) : filteredForms.map((form) => {
                  const inbox = inboxByForm[form.id];
                  const isSelected = form.id === selectedForm?.id;
                  const pending = inbox?.submissions.filter((submission) => submission.status === 'pending').length || 0;
                  const source = getFormSource(form);
                  const readinessScore = getFormLaunchReadinessScore(form);

                  return (
                    <button
                      key={form.id}
                      type="button"
                      disabled={isFormsBusy}
                      onClick={() => selectForm(form.id)}
                      className={cn(
                        'rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
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
                        <span className="rounded bg-muted px-2 py-1 capitalize">{source}</span>
                        <span className="rounded bg-muted px-2 py-1">{form.fields.length} fields</span>
                        <span className="rounded bg-muted px-2 py-1">{inbox?.total || 0} submissions</span>
                        <span className={cn(
                          'rounded px-2 py-1',
                          readinessScore >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}
                        >
                          {readinessScore}% ready
                        </span>
                        {form.contactShare?.enabled && <span className="rounded bg-primary/10 px-2 py-1 text-primary">contacts</span>}
                        {form.collectionTarget?.enabled && <span className="rounded bg-success/10 px-2 py-1 text-success">collection</span>}
                        {pending > 0 && <span className="rounded bg-warning/10 px-2 py-1 text-warning">{pending} pending</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </PanelContent>
          </Panel>

          <div className="min-w-0 space-y-6">
            {selectedForm && (
              <Panel id="forms-detail" className="scroll-mt-24">
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
                          search={activeSiteSearch}
                          aria-disabled={isFormsBusy}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted',
                            isFormsBusy && 'pointer-events-none opacity-60',
                          )}
                        >
                          <ExternalLink className="size-4" />
                          Page
                        </Link>
                      )}
                      {selectedForm.postId && (
                        <Link
                          to="/blog/$postId"
                          params={{ postId: selectedForm.postId }}
                          search={activeSiteSearch}
                          aria-disabled={isFormsBusy}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted',
                            isFormsBusy && 'pointer-events-none opacity-60',
                          )}
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
                  {formDraft && (
                    <div className="mb-5 rounded-lg border border-border bg-background p-4" data-testid="form-builder-panel">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <FileInput className="size-4" />
                            Form builder
                          </div>
                          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            Edit the standalone form contract that custom frontends fetch from Backy. Page and blog form blocks remain editable from their canvas source.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!selectedFormIsStandalone && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Canvas-owned
                            </span>
                          )}
                          {formDraftDirty && selectedFormIsStandalone && (
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                              Unsaved changes
                            </span>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => setFormDraft(cloneFormDefinition(selectedForm))}
                            disabled={isFormsBusy || !formDraftDirty}
                          >
                            Reset
                          </Button>
                          <Button
                            onClick={() => void saveFormDraft()}
                            disabled={isFormsBusy || !selectedFormIsStandalone || !formDraftDirty}
                            iconStart={<Save className="size-4" />}
                          >
                            {isSavingForm ? 'Saving...' : 'Save form'}
                          </Button>
                        </div>
                      </div>

                      {!selectedFormIsStandalone && (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          This form is generated from a page or blog canvas. Open the source canvas to change fields so the rendered page and API definition stay in sync.
                        </div>
                      )}

                      <fieldset disabled={isFormsBusy || !selectedFormIsStandalone} className="mt-4 grid gap-4 disabled:opacity-60">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <label className="grid gap-1.5 text-sm font-medium">
                            Form title
                            <input
                              value={formDraft.title || ''}
                              onChange={(event) => patchFormDraft({ title: event.target.value })}
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Machine name
                            <input
                              value={formDraft.name}
                              onChange={(event) => patchFormDraft({ name: event.target.value })}
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium lg:col-span-2">
                            Description
                            <textarea
                              value={formDraft.description || ''}
                              onChange={(event) => patchFormDraft({ description: event.target.value })}
                              rows={2}
                              className="min-h-20 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="grid gap-1.5 text-sm font-medium">
                            Audience
                            <select
                              value={formDraft.audience}
                              onChange={(event) => patchFormDraft({ audience: event.target.value as FormDefinition['audience'] })}
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal"
                            >
                              <option value="public">Public</option>
                              <option value="authenticated">Authenticated</option>
                              <option value="adminOnly">Admin only</option>
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Moderation
                            <select
                              value={formDraft.moderationMode || 'manual'}
                              onChange={(event) => patchFormDraft({ moderationMode: event.target.value as FormDefinition['moderationMode'] })}
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal"
                            >
                              <option value="manual">Manual review</option>
                              <option value="auto-approve">Auto approve</option>
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Success message
                            <input
                              value={formDraft.successMessage || ''}
                              onChange={(event) => patchFormDraft({ successMessage: event.target.value })}
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Redirect URL
                            <input
                              value={formDraft.successRedirectUrl || ''}
                              onChange={(event) => patchFormDraft({ successRedirectUrl: event.target.value })}
                              placeholder="/thanks"
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={formDraft.isActive}
                              onChange={(event) => patchFormDraft({ isActive: event.target.checked })}
                            />
                            Active
                          </label>
                          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={formDraft.enableHoneypot !== false}
                              onChange={(event) => patchFormDraft({ enableHoneypot: event.target.checked })}
                            />
                            Honeypot
                          </label>
                          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={formDraft.enableCaptcha === true}
                              onChange={(event) => patchFormDraft({ enableCaptcha: event.target.checked })}
                            />
                            Captcha
                          </label>
                          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={Boolean(formDraft.contactShare?.enabled)}
                              onChange={(event) => patchFormDraft({
                                contactShare: {
                                  enabled: event.target.checked,
                                  nameField: formDraft.contactShare?.nameField || formDraft.fields.find((field) => field.key.includes('name'))?.key,
                                  emailField: formDraft.contactShare?.emailField || formDraft.fields.find((field) => field.type === 'email')?.key,
                                  phoneField: formDraft.contactShare?.phoneField || formDraft.fields.find((field) => field.type === 'tel')?.key,
                                  notesField: formDraft.contactShare?.notesField,
                                  dedupeByEmail: formDraft.contactShare?.dedupeByEmail !== false,
                                },
                              })}
                            />
                            Contact share
                          </label>
                          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={Boolean(formDraft.collectionTarget?.enabled)}
                              onChange={(event) => {
                                const selectedCollection = formDraftTargetCollection || writableCollections[0] || collections[0];
                                patchFormDraftCollectionTarget({
                                  enabled: event.target.checked,
                                  collectionId: formDraft.collectionTarget?.collectionId || selectedCollection?.id || '',
                                  slugField: formDraft.collectionTarget?.slugField || formDraft.fields[0]?.key,
                                  fieldMap: formDraft.collectionTarget?.fieldMap || buildDefaultCollectionFieldMap(formDraft, selectedCollection),
                                });
                              }}
                            />
                            Collection write
                          </label>
                        </div>

                        {formDraft.collectionTarget?.enabled && (
                          <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="form-collection-target-panel">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold">Collection write target</h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Route accepted submissions into a published public-create collection, with explicit form-field to collection-field mapping.
                                </p>
                              </div>
                              <span className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-semibold',
                                formDraftTargetCollection?.permissions.publicCreate && formDraftTargetCollection.status === 'published'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700',
                              )}
                              >
                                {formDraftTargetCollection?.permissions.publicCreate && formDraftTargetCollection.status === 'published'
                                  ? 'write ready'
                                  : 'needs public create'}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Target collection
                                <select
                                  value={formDraft.collectionTarget.collectionId}
                                  onChange={(event) => {
                                    const nextCollection = collections.find((collection) => collection.id === event.target.value);
                                    patchFormDraftCollectionTarget({
                                      collectionId: event.target.value,
                                      fieldMap: buildDefaultCollectionFieldMap(formDraft, nextCollection),
                                    });
                                  }}
                                  className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal text-foreground"
                                  aria-label="Collection target collection"
                                >
                                  <option value="">Select collection</option>
                                  {collections.map((collection) => (
                                    <option key={collection.id} value={collection.id}>
                                      {collection.name} {collection.status === 'published' && collection.permissions.publicCreate ? '' : '(not public-create)'}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Slug source field
                                <select
                                  value={formDraft.collectionTarget.slugField || ''}
                                  onChange={(event) => patchFormDraftCollectionTarget({ slugField: event.target.value || undefined })}
                                  className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal text-foreground"
                                  aria-label="Collection target slug field"
                                >
                                  <option value="">Auto generated</option>
                                  {formDraft.fields.map((field) => (
                                    <option key={field.key} value={field.key}>{field.label} ({field.key})</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            {formDraftTargetCollection ? (
                              <div className="mt-3 grid gap-2">
                                {formDraft.fields.map((field) => (
                                  <label key={field.key} className="grid gap-1.5 rounded-lg border border-border bg-card p-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(140px,0.8fr)_minmax(180px,1fr)] sm:items-center">
                                    <span>{field.label} <span className="font-mono font-normal">({field.key})</span></span>
                                    <select
                                      value={formDraft.collectionTarget?.fieldMap?.[field.key] || ''}
                                      onChange={(event) => patchFormDraftCollectionTarget({
                                        fieldMap: {
                                          ...(formDraft.collectionTarget?.fieldMap || {}),
                                          [field.key]: event.target.value,
                                        },
                                      })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                                      aria-label={`Map ${field.label} to collection field`}
                                    >
                                      <option value="">Do not write</option>
                                      {formDraftTargetCollection.fields.map((collectionField) => (
                                        <option key={collectionField.key} value={collectionField.key}>
                                          {collectionField.label} ({collectionField.key})
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                Create or select a published public-create collection before enabling writes.
                              </div>
                            )}
                          </div>
                        )}

                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">Fields</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Keys drive API payloads, contact mapping, and collection writes. Keep them stable after launch.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={addFormDraftField} iconStart={<Plus className="size-4" />}>
                              Add field
                            </Button>
                          </div>
                          <div className="mt-3 grid gap-3">
                            {formDraft.fields.map((field, fieldIndex) => (
                              <div key={`${field.key}-${fieldIndex}`} className="rounded-lg border border-border bg-card p-3">
                                <div className="grid gap-3 xl:grid-cols-[minmax(120px,0.8fr)_minmax(140px,1fr)_140px_110px_auto]">
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Key
                                    <input
                                      value={field.key}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { key: normalizeFieldKey(event.target.value) })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Label
                                    <input
                                      value={field.label}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { label: event.target.value })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Type
                                    <select
                                      value={field.type}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { type: event.target.value })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                                    >
                                      {FORM_FIELD_TYPES.map((type) => (
                                        <option key={type} value={type}>{type}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex min-h-10 items-end gap-2 text-sm font-medium">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(field.required)}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { required: event.target.checked })}
                                    />
                                    Required
                                  </label>
                                  <div className="flex items-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => moveFormDraftField(fieldIndex, -1)}
                                      disabled={fieldIndex === 0}
                                      aria-label={`Move ${field.label} up`}
                                    >
                                      Up
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => moveFormDraftField(fieldIndex, 1)}
                                      disabled={fieldIndex === formDraft.fields.length - 1}
                                      aria-label={`Move ${field.label} down`}
                                    >
                                      Down
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={() => removeFormDraftField(fieldIndex)}
                                      disabled={formDraft.fields.length <= 1}
                                      iconStart={<Trash2 className="size-4" />}
                                      aria-label={`Remove ${field.label}`}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Placeholder
                                    <input
                                      value={field.placeholder || ''}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { placeholder: event.target.value })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Help text
                                    <input
                                      value={field.helpText || ''}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { helpText: event.target.value })}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Options
                                    <input
                                      value={(field.options || []).join(', ')}
                                      onChange={(event) => patchFormDraftField(fieldIndex, { options: parseOptionsText(event.target.value) })}
                                      placeholder="Option one, Option two"
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </label>
                                </div>
                                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <h4 className="text-xs font-semibold text-foreground">Validation rules</h4>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        These rules are returned by the definition API and enforced before public submissions are stored.
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
                                      {field.validation?.length || 0} active
                                    </span>
                                  </div>
                                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                                    {FORM_VALIDATION_RULES.map((ruleDefinition) => {
                                      const rule = getValidationRule(field, ruleDefinition.type);
                                      const value = rule?.value ?? '';
                                      return (
                                        <div key={ruleDefinition.type} className="rounded-lg border border-border bg-card p-3">
                                          <div className="grid gap-2 sm:grid-cols-[minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(140px,1fr)]">
                                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                              Rule
                                              <span className="flex min-h-10 items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
                                                {ruleDefinition.label}
                                              </span>
                                            </label>
                                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                              Value
                                              <input
                                                type={ruleDefinition.valueMode === 'number' ? 'number' : 'text'}
                                                value={String(value)}
                                                placeholder={ruleDefinition.valuePlaceholder}
                                                onChange={(event) => patchFormDraftFieldValidation(fieldIndex, ruleDefinition.type, {
                                                  value: parseValidationValue(ruleDefinition.valueMode, event.target.value),
                                                })}
                                                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                                aria-label={`${field.label} ${ruleDefinition.label} value`}
                                              />
                                            </label>
                                            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                              Message
                                              <input
                                                value={rule?.message || ''}
                                                placeholder={defaultValidationMessage(field.label, ruleDefinition.type)}
                                                onChange={(event) => patchFormDraftFieldValidation(fieldIndex, ruleDefinition.type, {
                                                  message: event.target.value,
                                                })}
                                                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                                                aria-label={`${field.label} ${ruleDefinition.label} message`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </fieldset>
                    </div>
                  )}

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

                  <div id="forms-api" className="mb-5 rounded-lg border border-border bg-muted/30 p-4 scroll-mt-24">
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
                        <Button onClick={() => void copyFormApiText(selectedFormDefinitionUrl, 'Form definition URL')} disabled={isFormsBusy} iconStart={<Copy className="size-4" />}>
                          Copy definition
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copyFormApiText(formsHandoffText, 'Forms handoff manifest')}
                          disabled={isFormsBusy}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy manifest
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleExportFormsCatalog}
                          disabled={isFormsBusy || filteredForms.length === 0}
                          iconStart={<Download className="size-4" />}
                        >
                          Export catalog
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copyFormApiText(selectedFormSamplePayloadText, 'Sample payload')}
                          disabled={isFormsBusy}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy payload
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copyFormApiText(selectedFormCurlExample, 'cURL example')}
                          disabled={isFormsBusy}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy cURL
                        </Button>
                        <a
                          href={selectedFormDefinitionUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={isFormsBusy}
                          onClick={(event) => {
                            if (isFormsBusy) event.preventDefault();
                          }}
                          className={cn(
                            'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                            isFormsBusy && 'pointer-events-none opacity-60',
                          )}
                        >
                          <ExternalLink className="size-4" />
                          Open definition
                        </a>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <ApiSnippet label="Forms list URL" value={formsListUrl} />
                      <ApiSnippet label="Definition URL" value={selectedFormDefinitionUrl} />
                      <ApiSnippet label="Submit URL" value={selectedFormSubmitUrl} />
                      <ApiSnippet label="Contacts URL" value={selectedFormContactsUrl} />
                    </div>
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      <ApiSnippet label="Sample submission payload" value={selectedFormSamplePayloadText} />
                      <ApiSnippet label="cURL submit example" value={selectedFormCurlExample} />
                    </div>
                  </div>

                  <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <ClipboardList className="size-4" />
                          Destination routing
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Shows what happens after this form is submitted: inbox review, contact creation, collection writes, notifications, webhooks, and success behavior.
                        </p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        formHasDestination(selectedForm) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      )}
                      >
                        {formHasDestination(selectedForm) ? 'Routed' : 'Inbox only'}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <RoutingTile
                        title="Contact share"
                        status={selectedForm.contactShare?.enabled ? 'Enabled' : 'Off'}
                        detail={selectedForm.contactShare?.enabled
                          ? [
                              selectedForm.contactShare.nameField ? `name:${selectedForm.contactShare.nameField}` : null,
                              selectedForm.contactShare.emailField ? `email:${selectedForm.contactShare.emailField}` : null,
                              selectedForm.contactShare.phoneField ? `phone:${selectedForm.contactShare.phoneField}` : null,
                              selectedForm.contactShare.dedupeByEmail ? 'dedupe email' : null,
                            ].filter(Boolean).join(' / ')
                          : 'Submissions stay in the form inbox unless this is enabled.'}
                        ready={Boolean(selectedForm.contactShare?.enabled)}
                      />
                      <RoutingTile
                        title="Collection write"
                        status={selectedForm.collectionTarget?.enabled ? 'Enabled' : 'Off'}
                        detail={selectedForm.collectionTarget?.enabled
                          ? `${selectedForm.collectionTarget.collectionId}${selectedForm.collectionTarget.slugField ? ` via ${selectedForm.collectionTarget.slugField}` : ''}`
                          : 'Use collection writes for registrations, applications, events, or custom objects.'}
                        ready={Boolean(selectedForm.collectionTarget?.enabled)}
                      />
                      <RoutingTile
                        title="Notifications"
                        status={selectedForm.notificationEmail || selectedForm.notificationWebhook ? 'Configured' : 'Off'}
                        detail={[
                          selectedForm.notificationEmail ? `email:${selectedForm.notificationEmail}` : null,
                          selectedForm.notificationWebhook ? 'webhook configured' : null,
                        ].filter(Boolean).join(' / ') || 'Use Settings notifications or form-specific email/webhook routing.'}
                        ready={Boolean(selectedForm.notificationEmail || selectedForm.notificationWebhook)}
                      />
                      <RoutingTile
                        title="Success behavior"
                        status={selectedForm.successRedirectUrl ? 'Redirect' : 'Message'}
                        detail={selectedForm.successRedirectUrl || selectedForm.successMessage || 'Default success message'}
                        ready={Boolean(selectedForm.successRedirectUrl || selectedForm.successMessage)}
                      />
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
                    <MetaTile label="Notification" value={selectedForm.notificationEmail || 'off'} />
                    <MetaTile label="Webhook" value={selectedForm.notificationWebhook ? 'configured' : 'off'} />
                    <MetaTile label="Success redirect" value={selectedForm.successRedirectUrl || 'message only'} />
                    <MetaTile label="Active state" value={selectedForm.isActive ? 'active' : 'inactive'} />
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

            <Panel id="forms-inbox" className="overflow-hidden scroll-mt-24">
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
                        disabled={isFormsBusy}
                        onChange={(event) => {
                          if (isFormsBusy) return;
                          const submissionQ = event.target.value;
                          setSubmissionQuery(submissionQ);
                          updateFormsRouteSearch({ submissionQ: submissionQ || undefined });
                        }}
                        placeholder="Search submissions..."
                        className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleExportSubmissions}
                      disabled={isFormsBusy || !selectedForm || filteredSubmissions.length === 0}
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
                          disabled={isFormsBusy}
                          onClick={() => {
                            if (isFormsBusy) return;
                            setStatusFilter(status);
                            updateFormsRouteSearch({ status });
                          }}
                          className={cn(
                            'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
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
                        isUpdating={isFormsBusy}
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
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
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

function RoutingTile({
  title,
  status,
  detail,
  ready,
}: {
  title: string;
  status: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>
        <span className={cn(
          'shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold',
          ready ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
        )}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
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

const getFormSource = (form: FormDefinition): Exclude<FormSourceFilter, 'all'> => {
  if (form.pageId) return 'page';
  if (form.postId) return 'blog';
  return 'embedded';
};

const formHasRequiredIdentity = (form: FormDefinition): boolean => (
  form.fields.some((field) => (
    ['email', 'tel'].includes(field.type) || ['email', 'phone'].includes(field.key)
  ))
);

const formHasSpamGuard = (form: FormDefinition): boolean => (
  Boolean(form.enableHoneypot || form.enableCaptcha)
);

const formHasDestination = (form: FormDefinition): boolean => (
  Boolean(form.contactShare?.enabled || form.collectionTarget?.enabled)
);

const getFormLaunchReadinessScore = (form: FormDefinition): number => {
  const checks = [
    form.isActive,
    form.fields.length > 0,
    formHasRequiredIdentity(form),
    formHasSpamGuard(form),
    formHasDestination(form),
    true,
  ];
  const readyCount = checks.filter(Boolean).length;

  return Math.round((readyCount / checks.length) * 100);
};

const cloneFormDefinition = (form: FormDefinition): FormDefinition => JSON.parse(JSON.stringify(form)) as FormDefinition;

const normalizeFieldKey = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

const parseOptionsText = (value: string): string[] | undefined => {
  const options = value.split(',').map((option) => option.trim()).filter(Boolean);
  return options.length > 0 ? options : undefined;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

const getValidationRule = (
  field: FormFieldDefinition,
  ruleType: FormValidationRuleType,
): FormValidationRule | undefined => (
  field.validation?.find((rule) => rule.type === ruleType)
);

const parseValidationValue = (mode: 'number' | 'text', value: string): string | number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (mode === 'number') {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  return trimmed;
};

const defaultValidationMessage = (fieldLabel: string, ruleType: FormValidationRuleType): string => {
  const label = fieldLabel.trim() || 'This field';
  if (ruleType === 'minLength') return `${label} is too short.`;
  if (ruleType === 'maxLength') return `${label} is too long.`;
  if (ruleType === 'pattern') return `${label} format is invalid.`;
  if (ruleType === 'min') return `${label} is too small.`;
  return `${label} is too large.`;
};

const normalizeValidationRules = (field: FormFieldDefinition): FormValidationRule[] | undefined => {
  const rules: FormValidationRule[] = [];

  (field.validation || []).forEach((rule) => {
    const type = rule.type as FormValidationRuleType;
    if (!FORM_VALIDATION_RULES.some((definition) => definition.type === type)) {
      return;
    }

    const value = typeof rule.value === 'number'
      ? rule.value
      : typeof rule.value === 'string'
        ? rule.value.trim()
        : undefined;
    if (value === undefined || value === '') {
      return;
    }

    rules.push({
        type,
        value,
        message: rule.message?.trim() || defaultValidationMessage(field.label, type),
    });
  });

  return rules.length > 0 ? rules : undefined;
};

const buildDefaultCollectionFieldMap = (
  form: FormDefinition,
  collection: Collection | null | undefined,
): Record<string, string> => {
  if (!collection) return {};

  const collectionFields = collection.fields;
  return Object.fromEntries(form.fields.map((field) => {
    const normalizedFieldKey = field.key.toLowerCase();
    const normalizedFieldLabel = field.label.toLowerCase();
    const matched = collectionFields.find((collectionField) => (
      collectionField.key.toLowerCase() === normalizedFieldKey ||
      collectionField.label.toLowerCase() === normalizedFieldLabel
    ));

    return [field.key, matched?.key || ''];
  }));
};

const buildFormUpdatePayload = (form: FormDefinition) => ({
  name: form.name.trim(),
  title: normalizeOptionalText(form.title),
  description: normalizeOptionalText(form.description),
  audience: form.audience,
  isActive: form.isActive,
  fields: form.fields.map((field, index) => ({
    key: normalizeFieldKey(field.key) || `field_${index + 1}`,
    label: field.label.trim() || `Field ${index + 1}`,
    type: field.type || 'text',
    required: Boolean(field.required),
    ...(normalizeOptionalText(field.placeholder) ? { placeholder: normalizeOptionalText(field.placeholder) || undefined } : {}),
    ...(normalizeOptionalText(field.helpText) ? { helpText: normalizeOptionalText(field.helpText) || undefined } : {}),
    ...(normalizeOptionalText(field.defaultValue) ? { defaultValue: normalizeOptionalText(field.defaultValue) || undefined } : {}),
    ...(field.options && field.options.length > 0 ? { options: field.options.map((option) => option.trim()).filter(Boolean) } : {}),
    ...(normalizeValidationRules(field) ? { validation: normalizeValidationRules(field) } : {}),
  })),
  notificationEmail: normalizeOptionalText(form.notificationEmail),
  notificationWebhook: normalizeOptionalText(form.notificationWebhook),
  successRedirectUrl: normalizeOptionalText(form.successRedirectUrl),
  successMessage: normalizeOptionalText(form.successMessage),
  enableHoneypot: form.enableHoneypot !== false,
  enableCaptcha: form.enableCaptcha === true,
  moderationMode: form.moderationMode || 'manual',
  contactShare: form.contactShare?.enabled ? form.contactShare : { enabled: false },
  collectionTarget: form.collectionTarget?.enabled
    ? form.collectionTarget
    : { enabled: false, collectionId: form.collectionTarget?.collectionId || '', fieldMap: form.collectionTarget?.fieldMap || {} },
});

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

function buildTemplateManifest(template: FormTemplateBlueprint) {
  const samplePayload = {
    values: Object.fromEntries(template.fields.map((field) => [field.key, sampleFormFieldValue(field)])),
    requestId: `web-${template.id}-request`,
    startedAt: Date.now() - 8000,
  };

  return {
    schemaVersion: 'backy.form-template.v1',
    id: template.id,
    title: template.title,
    description: template.description,
    audience: template.audience,
    isActive: true,
    moderationMode: template.moderationMode,
    successMessage: template.successMessage,
    spamGuards: {
      honeypot: true,
      captcha: false,
    },
    contactShare: template.contactShare,
    collectionTarget: template.collectionTarget,
    fields: template.fields,
    editorFormBlockProps: {
      formId: `form-{pageSlug}-${template.id}`,
      formName: `{pageSlug}-${template.id}`,
      formTitle: template.title,
      formDescription: template.description,
      formActive: true,
      formAudience: template.audience,
      successMessage: template.successMessage,
      enableHoneypot: true,
      enableCaptcha: false,
      moderationMode: template.moderationMode,
      contactShareEnabled: Boolean(template.contactShare?.enabled),
      contactShareNameField: template.contactShare?.nameField,
      contactShareEmailField: template.contactShare?.emailField,
      contactSharePhoneField: template.contactShare?.phoneField,
      contactShareNotesField: template.contactShare?.notesField,
    },
    pageTemplateHandoff: {
      route: '/pages/new',
      template: template.pageTemplate,
    },
    samplePayload,
  };
}

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
