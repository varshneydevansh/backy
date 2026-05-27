import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileInput,
  Filter,
  History,
  Inbox,
  MoreHorizontal,
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
  getSiteFrontendDesign,
  getFormWithSubmissions,
  getUserPermissions,
  applyFormConsentRetention,
  createFormEmbedBlock,
  getFormsAnalytics,
  listAdminAuditLogs,
  listFormDeliveryEvents,
  listCollections,
  cloneForm,
  listFormsWithMetadata,
  createForm,
  deleteForm,
  retryFormEmailDelivery,
  retryFormWebhookDelivery,
  updateForm,
  updateFormSubmission,
  type Collection,
  type AdminAuditLog,
  type FormDefinition,
  type FormDeliveryEvent,
  type FormFieldDefinition,
  type FormsAnalytics,
  type FormsPersistenceCertification,
  type FormSubmission,
  type FormSubmissionStatus,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import type { SiteSettings } from '@backy-cms/core';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
import { cn, formatDate } from '@/lib/utils';

type SubmissionStatusFilter = FormSubmissionStatus | 'all';
type PageTemplateHandoff = 'landing' | 'storefront' | 'contact' | 'registration';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];
type FormSourceFilter = 'all' | 'page' | 'blog' | 'embedded';
type FormStateFilter = 'all' | 'active' | 'inactive';
type FormDestinationFilter = 'all' | 'contacts' | 'collections' | 'inbox-only';
type FormReadinessFilter = 'all' | 'ready' | 'needs-work';
type FormsPermissionKey = 'forms.view' | 'forms.create' | 'forms.edit' | 'forms.manage' | 'forms.export' | 'forms.delete' | 'collections.view' | 'activity.export';
type FormLaunchReadinessStatus = 'ready' | 'attention' | 'blocked';

interface FormReadinessSummary {
  score: number;
  checks: Array<{
    label: string;
    detail: string;
    ready: boolean;
  }>;
  workflow: Array<{
    label: string;
    detail: string;
  }>;
}

interface FormLaunchReadinessCheck {
  key: string;
  label: string;
  status: FormLaunchReadinessStatus;
  detail: string;
}

interface FormLaunchActionPlan {
  schemaVersion: 'backy.form-launch-action-plan.v1';
  nextAction: 'select-form' | 'activate-form' | 'add-fields' | 'add-identity-field' | 'add-spam-guard' | 'route-destination' | 'configure-delivery' | 'certify-persistence' | 'launch-ready';
  recommendation: string;
  blockers: string[];
  attention: string[];
}

interface FormLaunchReadinessHandoff {
  schemaVersion: 'backy.form-launch-readiness.v1';
  generatedAt: string;
  status: FormLaunchReadinessStatus;
  score: number;
  selectedSiteId: string;
  form: {
    id: string;
    name: string;
    title: string;
    isActive: boolean;
    audience: FormDefinition['audience'];
    source: Exclude<FormSourceFilter, 'all'>;
    fieldCount: number;
    requiredFieldCount: number;
    moderationMode: FormDefinition['moderationMode'];
    createdAt: string;
    updatedAt: string;
  } | null;
  endpoints: {
    definition: string;
    submit: string;
    contacts: string;
  };
  routing: {
    contactShareEnabled: boolean;
    collectionWriteEnabled: boolean;
    collectionId: string;
    notificationEmailConfigured: boolean;
    notificationWebhookConfigured: boolean;
  };
  delivery: {
    total: number;
    succeeded: number;
    failed: number;
    queued: number;
  };
  consent: {
    fields: number;
    records: number;
    granted: number;
    missing: number;
  };
  persistenceCertification: {
    schemaVersion: FormsPersistenceCertification['schemaVersion'];
    status: FormsPersistenceCertification['status'];
    operatorGate: string;
    runtimeReady: boolean;
    missingInputs: string[];
  };
  privacy: {
    includesSubmissionValues: boolean;
    customerSafeFieldsOnly: boolean;
    excludedFields: string[];
  };
  samplePayload: Record<string, unknown> | null;
  checks: FormLaunchReadinessCheck[];
  actionPlan: FormLaunchActionPlan;
  nextSteps: string[];
}

interface FormDeliveryHandoff {
  schemaVersion: 'backy.form-delivery-handoff.v1';
  generatedAt: string;
  selectedSiteId: string;
  form: {
    id: string;
    name: string;
    title: string;
    isActive: boolean;
  } | null;
  endpoints: {
    events: string;
    webhookRetryTemplate: string;
    emailRetryTemplate: string;
  };
  configuration: {
    notificationEmailConfigured: boolean;
    notificationWebhookConfigured: boolean;
    moderationMode: FormDefinition['moderationMode'] | '';
  };
  metrics: FormLaunchReadinessHandoff['delivery'];
  recentEvents: Array<{
    id: string;
    kind: string;
    channel: string;
    status: string;
    statusCode: number | null;
    requestId: string | null;
    submissionId: string | null;
    retry: boolean;
    retryable: boolean;
    hasTarget: boolean;
    hasError: boolean;
    createdAt: string;
  }>;
  retry: {
    failedRetryableCount: number;
    retryableSubmissionIds: string[];
  };
  actionPlan: {
    status: 'ready' | 'attention';
    nextSteps: string[];
  };
  privacy: {
    includesSubmissionValues: boolean;
    includesProviderTargets: boolean;
    includesProviderResponses: boolean;
    excludedFields: string[];
  };
}

interface FormsPersistenceScenarioEvidence {
  schemaVersion: 'backy.forms-persistence-scenario-evidence.v1';
  status: 'ready' | 'attention';
  requiredGate: string;
  coverage: {
    covered: number;
    total: number;
    missing: string[];
  };
  scenarios: Array<{
    key: string;
    label: string;
    expectedEvidence: readonly string[];
    nextAction: string;
    evidenceCount: number;
    status: 'covered' | 'missing';
  }>;
  secretHandling: string;
}
type FormPersistenceCertificationHandoff = Omit<FormsPersistenceCertification, 'runtime' | 'checks'> & {
  runtime: FormsPersistenceCertification['runtime'] | null;
  checks: Array<{
    key: string;
    title: string;
    gate: string;
    status: string;
    detail: string;
  }>;
  scenarioEvidence: FormsPersistenceScenarioEvidence;
};

const FORMS_PERMISSION_ROLE_DEFAULTS: Record<FormsPermissionKey, Array<AuthUser['role']>> = {
  'forms.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.create': ['owner', 'admin', 'editor'],
  'forms.edit': ['owner', 'admin', 'editor'],
  'forms.manage': ['owner', 'admin', 'editor'],
  'forms.export': ['owner', 'admin'],
  'forms.delete': ['owner', 'admin'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'activity.export': ['owner', 'admin'],
};

interface FormsSearch {
  siteId?: string;
  formId?: string;
  frontendTemplate?: string;
  q?: string;
  source?: FormSourceFilter;
  state?: FormStateFilter;
  destination?: FormDestinationFilter;
  readiness?: FormReadinessFilter;
  status?: SubmissionStatusFilter;
  submissionQ?: string;
  quickCreate?: FormsQuickCreateIntent;
}

const FORM_SOURCE_FILTERS: FormSourceFilter[] = ['all', 'page', 'blog', 'embedded'];
const FORM_STATE_FILTERS: FormStateFilter[] = ['all', 'active', 'inactive'];
const FORM_DESTINATION_FILTERS: FormDestinationFilter[] = ['all', 'contacts', 'collections', 'inbox-only'];
const FORM_READINESS_FILTERS: FormReadinessFilter[] = ['all', 'ready', 'needs-work'];
const SUBMISSION_STATUS_FILTERS: SubmissionStatusFilter[] = ['all', 'pending', 'approved', 'rejected', 'spam'];
const FORM_FIELD_TYPES = ['text', 'email', 'number', 'textarea', 'select', 'checkbox', 'radio', 'date', 'tel', 'url', 'file'] as const;
type FormFieldType = typeof FORM_FIELD_TYPES[number];
type FormValidationRule = NonNullable<FormFieldDefinition['validation']>[number];
type FormValidationRuleType = 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max';
type FormSpamSettings = NonNullable<FormDefinition['spamSettings']>;
type FormConsentSettings = NonNullable<FormDefinition['consentSettings']>;
const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Text',
  email: 'Email',
  number: 'Number',
  textarea: 'Long text',
  select: 'Select',
  checkbox: 'Checkbox',
  radio: 'Radio',
  date: 'Date',
  tel: 'Phone',
  url: 'URL',
  file: 'File',
};
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
const formValidationRuleHasValue = (rule: Pick<FormValidationRule, 'value'> | undefined): boolean => (
  rule?.value !== undefined && String(rule.value).trim().length > 0
);
const DEFAULT_FORM_SPAM_SETTINGS: Required<FormSpamSettings> = {
  minFillMs: 900,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 8,
  duplicateWindowMs: 600_000,
  blockedTerms: [],
};
const DEFAULT_FORM_CONSENT_SETTINGS: Required<FormConsentSettings> = {
  policyLabel: 'Consent retained for audit and contact permission.',
  retentionDays: 365,
  deleteAfterDays: 730,
  requestEmail: '',
  exportIncludesIp: true,
};

const readNumberSetting = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readFormSpamSettings = (form?: FormDefinition | null): Required<FormSpamSettings> => {
  const settingsRecord = isPlainRecord(form?.settings) ? form.settings : {};
  const settingsSpam = isPlainRecord(settingsRecord.spam) ? settingsRecord.spam : {};
  const directSpam = isPlainRecord(form?.spamSettings) ? form.spamSettings : {};
  const merged = { ...settingsSpam, ...directSpam } as Record<string, unknown>;

  return {
    minFillMs: Math.max(0, Math.round(readNumberSetting(merged.minFillMs, DEFAULT_FORM_SPAM_SETTINGS.minFillMs))),
    rateLimitWindowMs: Math.max(1_000, Math.round(readNumberSetting(merged.rateLimitWindowMs, DEFAULT_FORM_SPAM_SETTINGS.rateLimitWindowMs))),
    rateLimitMax: Math.max(1, Math.round(readNumberSetting(merged.rateLimitMax, DEFAULT_FORM_SPAM_SETTINGS.rateLimitMax))),
    duplicateWindowMs: Math.max(1_000, Math.round(readNumberSetting(merged.duplicateWindowMs, DEFAULT_FORM_SPAM_SETTINGS.duplicateWindowMs))),
    blockedTerms: Array.isArray(merged.blockedTerms)
      ? merged.blockedTerms.map((term) => String(term).trim()).filter(Boolean).slice(0, 100)
      : [],
  };
};

const readFormConsentSettings = (form?: FormDefinition | null): Required<FormConsentSettings> => {
  const settingsRecord = isPlainRecord(form?.settings) ? form.settings : {};
  const settingsConsent = isPlainRecord(settingsRecord.consent) ? settingsRecord.consent : {};
  const directConsent = isPlainRecord(form?.consentSettings) ? form.consentSettings : {};
  const merged = { ...settingsConsent, ...directConsent } as Record<string, unknown>;

  return {
    policyLabel: typeof merged.policyLabel === 'string' && merged.policyLabel.trim()
      ? merged.policyLabel.trim()
      : DEFAULT_FORM_CONSENT_SETTINGS.policyLabel,
    retentionDays: Math.max(0, Math.round(readNumberSetting(merged.retentionDays, DEFAULT_FORM_CONSENT_SETTINGS.retentionDays))),
    deleteAfterDays: Math.max(0, Math.round(readNumberSetting(merged.deleteAfterDays, DEFAULT_FORM_CONSENT_SETTINGS.deleteAfterDays))),
    requestEmail: typeof merged.requestEmail === 'string' ? merged.requestEmail.trim() : '',
    exportIncludesIp: typeof merged.exportIncludesIp === 'boolean'
      ? merged.exportIncludesIp
      : DEFAULT_FORM_CONSENT_SETTINGS.exportIncludesIp,
  };
};

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

type FormsQuickCreateIntent = 'blank';

const isFormsQuickCreateIntent = (value: unknown): value is FormsQuickCreateIntent => (
  value === 'blank'
);

export const Route = createFileRoute('/forms')({
  validateSearch: (search: Record<string, unknown>): FormsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    formId: normalizedSearchString(search.formId),
    frontendTemplate: normalizedSearchString(search.frontendTemplate),
    q: normalizedSearchString(search.q),
    source: isFormSourceFilter(search.source) ? search.source : undefined,
    state: isFormStateFilter(search.state) ? search.state : undefined,
    destination: isFormDestinationFilter(search.destination) ? search.destination : undefined,
    readiness: isFormReadinessFilter(search.readiness) ? search.readiness : undefined,
    status: isSubmissionStatusFilter(search.status) ? search.status : undefined,
    submissionQ: normalizedSearchString(search.submissionQ),
    quickCreate: isFormsQuickCreateIntent(search.quickCreate) ? search.quickCreate : undefined,
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
  frontendFieldKeyMap?: Record<string, string>;
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
    detail: 'Honeypot, captcha provider verification, moderation mode, spam queue, and reviewer status controls.',
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
    detail: 'Route approved values into Contacts or a mapped collection today, then use the Users/Auth provider handoff for credentialed member sessions.',
  },
] as const;

const FORM_ACCOUNT_REGISTRATION_HANDOFF_SCHEMA_VERSION = 'backy.form-account-registration-handoff.v1';

const FORM_ACCOUNT_REGISTRATION_BINDINGS = [
  { key: 'registration.identity', target: 'form fields', fields: ['full_name', 'email', 'phone'] },
  { key: 'registration.memberType', target: 'member segmentation', fields: ['member_type'] },
  { key: 'registration.consent', target: 'consent evidence', fields: ['consent', 'request_id', 'source_form_id'] },
  { key: 'contact.review', target: 'Contacts review pipeline', fields: ['name', 'email', 'phone', 'notes', 'status'] },
  { key: 'profile.collection', target: 'optional member profile collection record', fields: ['name', 'email', 'member_type', 'source_submission_id'] },
] as const;

const FORM_ACCOUNT_REGISTRATION_ACTIONS = [
  { key: 'create-registration-form', route: '/forms', templateId: 'registration' },
  { key: 'create-registration-page', route: '/pages/new', template: 'registration' },
  { key: 'review-submissions', route: '/forms', endpoint: 'selectedAdminInbox' },
  { key: 'review-contacts', route: '/contacts' },
  { key: 'promote-member-profile', route: '/contacts', endpoint: 'promoteCustomer' },
  { key: 'configure-member-auth', route: '/users' },
] as const;

const FORM_PERSISTENCE_CERTIFICATION_CHECKS = [
  {
    key: 'local-ui-api',
    title: 'Local UI/API smoke',
    gate: 'npm run test:forms --workspace @backy-cms/admin',
    status: 'covered-locally',
    detail: 'Exercises the Forms workspace, public definition/submission APIs, moderation, delivery, analytics, contacts, collections, and handoff export in demo mode.',
  },
  {
    key: 'repository-contract',
    title: 'Repository contract',
    gate: 'npm run test:repositories --workspace @backy/db',
    status: 'covered-locally',
    detail: 'Covers repository primitives used by form definitions, submissions, contacts, collections, audit, and delivery records.',
  },
  {
    key: 'postgres-service',
    title: 'Supabase/Postgres service smoke',
    gate: 'npm run test:forms-postgres --workspace @backy/db',
    status: 'external-database-gate',
    detail: 'Requires BACKY_DATABASE_URL or DATABASE_URL against a configured Supabase/Postgres target before the Forms row can move from Partial to Ready.',
  },
] as const;

const FORM_PERSISTENCE_OPERATOR_GATE = 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres';
const FORM_PERSISTENCE_PREFLIGHT_GATES = [
  'npm run test:forms-postgres-preflight-contract',
  'npm run test:forms-postgres-disposable-guard',
] as const;
const FORM_PERSISTENCE_EVIDENCE_EXPECTATIONS = [
  'preflight contract output',
  'disposable target guard output',
  'DB-backed Forms smoke output',
  'non-secret workflow summary with disposable database confirmation',
] as const;
const FORM_PERSISTENCE_CERTIFICATION_SCENARIOS = [
  {
    key: 'form-definition-crud',
    label: 'Form definition CRUD',
    expectedEvidence: ['form definition rows', 'field schemas', 'active/inactive state'],
    nextAction: 'Create or update at least one persisted form definition with fields before running the DB smoke.',
  },
  {
    key: 'public-submission-intake',
    label: 'Public submission intake',
    expectedEvidence: ['public submission row', 'request id', 'validated field values'],
    nextAction: 'Submit a public form payload against the disposable database target.',
  },
  {
    key: 'moderation-review',
    label: 'Moderation review',
    expectedEvidence: ['approved submission', 'rejected or spam submission', 'review metadata'],
    nextAction: 'Approve, reject, or mark a stored submission as spam through the Forms inbox.',
  },
  {
    key: 'contact-share',
    label: 'Contact share',
    expectedEvidence: ['contact-share mapping', 'contact record', 'dedupe metadata'],
    nextAction: 'Enable contact sharing and approve a submission that creates or updates a contact.',
  },
  {
    key: 'collection-routing',
    label: 'Collection routing',
    expectedEvidence: ['collection target mapping', 'created collection record', 'routing status'],
    nextAction: 'Route an approved submission into a writable collection record.',
  },
  {
    key: 'delivery-audit',
    label: 'Delivery and audit events',
    expectedEvidence: ['email/webhook event', 'retry state', 'audit activity'],
    nextAction: 'Configure email or webhook delivery and capture at least one delivery or retry event.',
  },
  {
    key: 'consent-spam-settings',
    label: 'Consent and spam settings',
    expectedEvidence: ['consent field', 'honeypot/captcha setting', 'consent retention record'],
    nextAction: 'Add consent/spam controls and collect a submission that records consent state.',
  },
  {
    key: 'custom-frontend-contract',
    label: 'Custom frontend contract',
    expectedEvidence: ['definition URL', 'submit URL', 'sample payload'],
    nextAction: 'Select a form so the definition, submit, sample payload, and cURL handoff are available.',
  },
] as const;

type FormsPostgresDatabaseEnvAlias = 'BACKY_DATABASE_URL' | 'DATABASE_URL';

type FormsPostgresCertificationCommandOptions = {
  databaseEnvAlias: FormsPostgresDatabaseEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FORMS_POSTGRES_DATABASE_ENV_ALIASES: FormsPostgresDatabaseEnvAlias[] = ['BACKY_DATABASE_URL', 'DATABASE_URL'];

const DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: 'BACKY_DATABASE_URL',
  disposableConfirmed: true,
  expectedHost: '',
  expectedDatabase: '',
  includeReleaseDoctor: true,
} satisfies FormsPostgresCertificationCommandOptions;

const quoteFormsShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const quoteFormsEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteFormsShellValue(value)
);

const buildFormsPostgresCertificationEnvEntries = (
  options: FormsPostgresCertificationCommandOptions,
): Array<[string, string]> => {
  const envEntries: Array<[string, string]> = [
    ['BACKY_DATA_MODE', 'database'],
    ['BACKY_DATABASE_DISPOSABLE_CONFIRMED', options.disposableConfirmed ? 'true' : '<confirm-disposable-db-first>'],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ['BACKY_RELEASE_CERTIFY_DATABASE', '1'],
      ['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1'],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) {
    envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST', expectedHost]);
  }
  if (expectedDatabase) {
    envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE', expectedDatabase]);
  }

  return envEntries;
};

const buildFormsPostgresCertificationCommand = (options: FormsPostgresCertificationCommandOptions): string => {
  const envEntries = buildFormsPostgresCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteFormsShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    'npm run ci:forms-postgres',
  ].join('\n');
};

const buildFormsPostgresCertificationEnvTemplate = (options: FormsPostgresCertificationCommandOptions): string => {
  const envEntries = buildFormsPostgresCertificationEnvEntries(options);

  return [
    '# Backy Forms Postgres certification environment',
    '# Keep the disposable database URL in CI secrets or local shell variables.',
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteFormsEnvTemplateValue(value)}`),
  ].join('\n');
};

const buildFormsPostgresCertificationRequiredInputs = (options: FormsPostgresCertificationCommandOptions): string[] => [
  `${options.databaseEnvAlias}=<disposable-postgres-url>`,
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  'disposable migrated Supabase/Postgres database',
  'form_definitions, form_submissions, and form_contacts migrations with RLS policies',
  ...(options.expectedHost.trim() ? ['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'] : []),
  ...(options.expectedDatabase.trim() ? ['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'] : []),
  ...(options.includeReleaseDoctor ? ['BACKY_RELEASE_CERTIFY_DATABASE=1', 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1'] : []),
];

const FORMS_POSTGRES_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFormsPostgresCertificationCommand(DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildFormsPostgresCertificationEnvTemplate(DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.forms-postgres-certification-env-template.v1',
  databaseUrlAliases: FORMS_POSTGRES_DATABASE_ENV_ALIASES,
  requiredInputs: buildFormsPostgresCertificationRequiredInputs(DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS),
  targetGuards: [
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  ],
  secretHandling: 'Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
};

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
  const currentAdmin = useAuthStore((state) => state.user);
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [inboxByForm, setInboxByForm] = useState<Record<string, FormInbox>>({});
  const [deliveryEventsByForm, setDeliveryEventsByForm] = useState<Record<string, FormDeliveryEvent[]>>({});
  const [formsAnalytics, setFormsAnalytics] = useState<FormsAnalytics | null>(null);
  const [formsPersistenceCertification, setFormsPersistenceCertification] = useState<FormsPersistenceCertification | null>(null);
  const [formsAuditLogs, setFormsAuditLogs] = useState<AdminAuditLog[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(routeSearch.formId || null);
  const [formDraft, setFormDraft] = useState<FormDefinition | null>(null);
  const [formDraftSubmitted, setFormDraftSubmitted] = useState(false);
  const [newFormFieldType, setNewFormFieldType] = useState<FormFieldType>('text');
  const [formSearchQuery, setFormSearchQuery] = useState(routeSearch.q || '');
  const [formSourceFilter, setFormSourceFilter] = useState<FormSourceFilter>(routeSearch.source || 'all');
  const [formStateFilter, setFormStateFilter] = useState<FormStateFilter>(routeSearch.state || 'all');
  const [formDestinationFilter, setFormDestinationFilter] = useState<FormDestinationFilter>(routeSearch.destination || 'all');
  const [formReadinessFilter, setFormReadinessFilter] = useState<FormReadinessFilter>(routeSearch.readiness || 'all');
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>(routeSearch.status || 'all');
  const [submissionQuery, setSubmissionQuery] = useState(routeSearch.submissionQ || '');
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [isRetryingDeliveryId, setIsRetryingDeliveryId] = useState<string | null>(null);
  const [isApplyingConsentRetention, setIsApplyingConsentRetention] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [isCloningForm, setIsCloningForm] = useState(false);
  const [isCreatingEmbedBlock, setIsCreatingEmbedBlock] = useState(false);
  const [createdEmbedSectionId, setCreatedEmbedSectionId] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [isDeletingFormId, setIsDeletingFormId] = useState<string | null>(null);
  const [pendingDeleteForm, setPendingDeleteForm] = useState<FormDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparedQuickCreate, setPreparedQuickCreate] = useState<FormsQuickCreateIntent | null>(null);
  const handledQuickCreateRef = useRef('');
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [formsPostgresCommandOptions, setFormsPostgresCommandOptions] = useState<FormsPostgresCertificationCommandOptions>(
    DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS,
  );
  const canUseFormsRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseFormsRoleDefaults;
  const isFormsPermissionAllowed = (key: FormsPermissionKey) => (
    isAdminPermissionAllowed(permissionMatrix, currentAdmin, key, FORMS_PERMISSION_ROLE_DEFAULTS)
    || (canUseFormsRoleDefaults && Boolean(currentAdmin && FORMS_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)))
  );
  const canViewForms = isFormsPermissionAllowed('forms.view');
  const canCreateForms = isFormsPermissionAllowed('forms.create');
  const canEditForms = isFormsPermissionAllowed('forms.edit');
  const canManageForms = isFormsPermissionAllowed('forms.manage');
  const canExportForms = isFormsPermissionAllowed('forms.export');
  const canDeleteForms = isFormsPermissionAllowed('forms.delete');
  const canViewCollections = isFormsPermissionAllowed('collections.view');
  const canExportActivity = isFormsPermissionAllowed('activity.export');
  const viewPermissionTitle = canViewForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.view', FORMS_PERMISSION_ROLE_DEFAULTS);
  const createPermissionTitle = canCreateForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.create', FORMS_PERMISSION_ROLE_DEFAULTS);
  const editPermissionTitle = canEditForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.edit', FORMS_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.manage', FORMS_PERMISSION_ROLE_DEFAULTS);
  const exportPermissionTitle = canExportForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.export', FORMS_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.delete', FORMS_PERMISSION_ROLE_DEFAULTS);
  const isFormsBusy = isLoading || Boolean(isUpdatingId) || Boolean(isRetryingDeliveryId) || isApplyingConsentRetention || Boolean(isCreatingTemplateId) || isCloningForm || isCreatingEmbedBlock || isSavingForm || Boolean(isDeletingFormId);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminBaseUrl = useMemo(() => getAdminApiBase(), []);
  const formsCreateActionStatusId = 'forms-create-action-status';
  const formsCreatePermissionDisabledReason = !canCreateForms
    ? createPermissionTitle || 'Your account cannot create forms.'
    : '';
  const formsCreateBusyDisabledReason = isFormsBusy
    ? 'Form creation is temporarily unavailable while Backy updates forms or submissions.'
    : '';
  const formsCreateDisabledReason = formsCreatePermissionDisabledReason || formsCreateBusyDisabledReason;
  const formCreateActionStatus = (label: string, disabledReason = formsCreateDisabledReason) => (
    disabledReason
      ? `${label} unavailable: ${disabledReason}`
      : `${label} available for ${activeSiteId}.`
  );
  const formsCreateActionStatus = formCreateActionStatus('New blank form');
  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId],
  );
  const selectedFormIsStandalone = Boolean(selectedForm && !selectedForm.pageId && !selectedForm.postId);
  const selectedFormActionStatusId = selectedForm
    ? `forms-selected-actions-status-${selectedForm.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : 'forms-selected-actions-status';
  const selectedFormActionBusyReason = isFormsBusy
    ? 'Form actions are temporarily unavailable while Backy updates forms or submissions.'
    : null;
  const selectedFormPageDisabledReason = selectedForm?.pageId ? selectedFormActionBusyReason : null;
  const selectedFormBlogDisabledReason = selectedForm?.postId ? selectedFormActionBusyReason : null;
  const selectedFormCloneDisabledReason = !selectedForm
    ? 'Select a form to clone it.'
    : !canCreateForms
      ? createPermissionTitle || 'Your account cannot create forms.'
      : selectedFormActionBusyReason;
  const selectedFormDeleteDisabledReason = !selectedForm
    ? 'Select a form to delete it.'
    : !canDeleteForms
      ? deletePermissionTitle || 'Your account cannot delete forms.'
      : selectedFormActionBusyReason;
  const selectedFormActionStatus = selectedForm
    ? [
        selectedForm.pageId
          ? selectedFormPageDisabledReason
            ? `Open source page unavailable: ${selectedFormPageDisabledReason}`
            : 'Open source page available.'
          : null,
        selectedForm.postId
          ? selectedFormBlogDisabledReason
            ? `Open source blog post unavailable: ${selectedFormBlogDisabledReason}`
            : 'Open source blog post available.'
          : null,
        selectedFormCloneDisabledReason ? `Clone unavailable: ${selectedFormCloneDisabledReason}` : 'Clone available.',
        selectedFormDeleteDisabledReason ? `Delete unavailable: ${selectedFormDeleteDisabledReason}` : 'Delete available.',
      ].filter(Boolean).join(' ')
    : 'Select a form to review form actions.';
  const formDraftDirty = Boolean(selectedForm && formDraft && JSON.stringify(buildFormUpdatePayload(formDraft)) !== JSON.stringify(buildFormUpdatePayload(selectedForm)));
  const writableCollections = useMemo(() => collections.filter((collection) => (
    collection.status === 'published' && collection.permissions.publicCreate
  )), [collections]);
  const canUseCollectionTargets = canViewCollections && writableCollections.length > 0;
  const collectionTargetUnavailableReason = !canViewCollections
    ? 'Collection visibility is not available for your account, so form writes cannot be mapped to collections.'
    : writableCollections.length === 0
      ? 'No published public-create collection is available. Create or publish one before enabling collection writes.'
      : null;
  const frontendFormTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'form'),
    [frontendDesign?.templates],
  );
  const activeFrontendTemplateId = routeSearch.frontendTemplate || '';
  const frontendTemplateBlueprints = useMemo(
    () => frontendFormTemplates.map((template) => ({
      template,
      blueprint: buildFrontendFormTemplateBlueprint(template),
    })),
    [frontendFormTemplates],
  );
  const formDraftTargetCollection = useMemo(() => {
    if (!formDraft?.collectionTarget?.collectionId) return null;
    return collections.find((collection) => collection.id === formDraft.collectionTarget?.collectionId) || null;
  }, [collections, formDraft?.collectionTarget?.collectionId]);
  const formDraftTargetCollectionWritable = Boolean(
    formDraftTargetCollection?.status === 'published' && formDraftTargetCollection.permissions.publicCreate,
  );
  const formDraftInlineErrors = useMemo(() => (
    formDraftSubmitted && formDraft ? buildFormDraftInlineErrors(formDraft, collections) : {}
  ), [collections, formDraft, formDraftSubmitted]);
  const formDraftInlineError = (key: string): string | undefined => formDraftInlineErrors[key];
  const formDraftInputClassName = (key: string, className: string): string => cn(
    className,
    formDraftInlineError(key) && 'border-destructive focus:ring-destructive',
  );
  const formDraftErrorProps = (key: string) => ({
    'aria-invalid': Boolean(formDraftInlineError(key)),
    'aria-describedby': formDraftInlineError(key) ? `${key}-error` : undefined,
  });
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
  const selectedFormReadiness = useMemo<FormReadinessSummary>(() => {
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
          ? [selectedForm.enableHoneypot ? 'honeypot' : null, selectedForm.enableCaptcha ? 'captcha provider' : null].filter(Boolean).join(' + ')
          : 'Enable honeypot or captcha verification before exposing high-traffic forms.',
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
  const selectedConsentFields = useMemo(
    () => selectedForm?.fields.filter(isConsentField) || [],
    [selectedForm],
  );
  const selectedDeliveryEvents = useMemo(
    () => selectedForm ? deliveryEventsByForm[selectedForm.id] || [] : [],
    [deliveryEventsByForm, selectedForm],
  );
  const selectedDeliveryMetrics = useMemo(() => ({
    total: selectedDeliveryEvents.length,
    failed: selectedDeliveryEvents.filter((event) => event.status === 'failed').length,
    succeeded: selectedDeliveryEvents.filter((event) => event.status === 'succeeded').length,
    queued: selectedDeliveryEvents.filter((event) => event.status === 'queued').length,
  }), [selectedDeliveryEvents]);
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
  const selectedSubmissionSet = useMemo(() => new Set(selectedSubmissionIds), [selectedSubmissionIds]);
  const selectedLoadedSubmissions = useMemo(() => (
    selectedSubmissions.filter((submission) => selectedSubmissionSet.has(submission.id))
  ), [selectedSubmissionSet, selectedSubmissions]);
  const selectedVisibleSubmissions = useMemo(() => (
    filteredSubmissions.filter((submission) => selectedSubmissionSet.has(submission.id))
  ), [filteredSubmissions, selectedSubmissionSet]);
  const hiddenSelectedSubmissionCount = Math.max(0, selectedLoadedSubmissions.length - selectedVisibleSubmissions.length);
  const formsSubmissionBulkSelectionStatusId = 'forms-submission-bulk-selection-status';
  const formsSubmissionBulkActionStatusId = 'forms-submission-bulk-action-status';
  const formsSubmissionBulkBusyReason = isFormsBusy
    ? 'Submission moderation is temporarily unavailable while Backy updates forms or submissions.'
    : null;
  const formsSubmissionBulkSelectionDisabledReason = !selectedForm
    ? 'Select a form before selecting submissions.'
    : !canManageForms
      ? managePermissionTitle || 'Your account cannot review submissions.'
      : formsSubmissionBulkBusyReason;
  const formsSubmissionBulkActionDisabledReason = !selectedForm
    ? 'Select a form before moderating submissions.'
    : !canManageForms
      ? managePermissionTitle || 'Your account cannot review submissions.'
      : formsSubmissionBulkBusyReason
        || (selectedLoadedSubmissions.length === 0 ? 'Select one or more loaded submissions first.' : null);
  const formsSubmissionBulkStatusDisabledReason = (status: FormSubmissionStatus) => (
    formsSubmissionBulkActionDisabledReason
    || (selectedLoadedSubmissions.every((submission) => submission.status === status)
      ? `Selected submissions are already ${status}.`
      : null)
  );
  const formsSubmissionBulkClearDisabledReason = selectedSubmissionIds.length === 0
    ? 'No selected submissions to clear.'
    : formsSubmissionBulkBusyReason;
  const formsSubmissionBulkActionState = (['approved', 'rejected', 'spam'] as const).some((status) => (
    !formsSubmissionBulkStatusDisabledReason(status)
  )) ? 'ready' : 'blocked';
  const formsSubmissionBulkActionStatus = [
    `${selectedLoadedSubmissions.length} selected submission${selectedLoadedSubmissions.length === 1 ? '' : 's'}.`,
    hiddenSelectedSubmissionCount > 0 ? `${hiddenSelectedSubmissionCount} selected outside this filtered view.` : null,
    formsSubmissionBulkClearDisabledReason ? `Clear selection unavailable: ${formsSubmissionBulkClearDisabledReason}` : 'Clear selection available.',
    formsSubmissionBulkStatusDisabledReason('approved')
      ? `Approve unavailable: ${formsSubmissionBulkStatusDisabledReason('approved')}`
      : 'Approve available.',
    formsSubmissionBulkStatusDisabledReason('rejected')
      ? `Reject unavailable: ${formsSubmissionBulkStatusDisabledReason('rejected')}`
      : 'Reject available.',
    formsSubmissionBulkStatusDisabledReason('spam')
      ? `Spam unavailable: ${formsSubmissionBulkStatusDisabledReason('spam')}`
      : 'Spam available.',
  ].filter(Boolean).join(' ');
  const allVisibleSubmissionsSelected = filteredSubmissions.length > 0
    && selectedVisibleSubmissions.length === filteredSubmissions.length;
  const selectedConsentRecords = useMemo(
    () => filteredSubmissions.flatMap((submission) => selectedConsentFields.map((field) => ({
      submission,
      field,
      value: submission.values[field.key],
      granted: isConsentGranted(submission.values[field.key]),
    }))),
    [filteredSubmissions, selectedConsentFields],
  );
  const selectedConsentMetrics = useMemo(() => ({
    fields: selectedConsentFields.length,
    records: selectedConsentRecords.length,
    granted: selectedConsentRecords.filter((record) => record.granted).length,
    missing: selectedConsentRecords.filter((record) => !record.granted).length,
  }), [selectedConsentFields.length, selectedConsentRecords]);
  const selectedConsentSettings = useMemo(
    () => readFormConsentSettings(selectedForm),
    [selectedForm],
  );
  const selectedConsentRetentionMetrics = useMemo(() => {
    const now = Date.now();
    const deleteDue = selectedConsentRecords.filter(({ submission }) => {
      const deleteAt = addDaysIso(submission.submittedAt, selectedConsentSettings.deleteAfterDays);
      return deleteAt ? Date.parse(deleteAt) <= now : false;
    }).length;
    const reviewDue = selectedConsentRecords.filter(({ submission }) => {
      const retentionAt = addDaysIso(submission.submittedAt, selectedConsentSettings.retentionDays);
      return retentionAt ? Date.parse(retentionAt) <= now : false;
    }).length;

    return { reviewDue, deleteDue };
  }, [selectedConsentRecords, selectedConsentSettings.deleteAfterDays, selectedConsentSettings.retentionDays]);
  const metrics = useMemo(() => {
    const submissions = Object.values(inboxByForm).flatMap((item) => item.submissions);
    const summary = formsAnalytics?.summary;
    return {
      forms: summary?.forms ?? forms.length,
      active: summary?.activeForms ?? forms.filter((form) => form.isActive).length,
      submissions: summary?.submissions ?? submissions.length,
      pending: summary?.pending ?? submissions.filter((submission) => submission.status === 'pending').length,
      approved: summary?.approved ?? submissions.filter((submission) => submission.status === 'approved').length,
      spam: summary?.spam ?? submissions.filter((submission) => submission.status === 'spam').length,
      routedToCollections: summary?.routedToCollections ?? submissions.filter((submission) => Boolean(submission.collectionRecord)).length,
      conversionRate: summary?.conversionRate ?? 0,
      spamRate: summary?.spamRate ?? 0,
    };
  }, [forms, formsAnalytics?.summary, inboxByForm]);
  const selectedFormAnalytics = useMemo(
    () => selectedForm ? formsAnalytics?.forms.find((entry) => entry.formId === selectedForm.id) || null : null,
    [formsAnalytics?.forms, selectedForm],
  );
  const leadSegmentHighlights = useMemo(() => {
    const priority = ['qualified', 'ready-to-promote', 'missing-email', 'duplicate-email'];
    const segments = formsAnalytics?.leads?.segments || [];
    return priority
      .map((id) => segments.find((segment) => segment.id === id))
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
      .slice(0, 4);
  }, [formsAnalytics?.leads?.segments]);
  const topSavedLeadLists = useMemo(
    () => [...(formsAnalytics?.leads?.savedLists || [])]
      .sort((left, right) => right.matchedCount - left.matchedCount || left.name.localeCompare(right.name))
      .slice(0, 3),
    [formsAnalytics?.leads?.savedLists],
  );
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
  const formPersistenceScenarioEvidence = useMemo<FormsPersistenceScenarioEvidence>(() => {
    const allSubmissions = Object.values(inboxByForm).flatMap((inbox) => inbox.submissions || []);
    const allDeliveryEvents = Object.values(deliveryEventsByForm).flatMap((events) => events || []);
    const formsWithFields = forms.filter((form) => form.fields.length > 0).length;
    const moderatedSubmissions = allSubmissions.filter((submission) => (
      submission.status === 'approved' ||
      submission.status === 'rejected' ||
      submission.status === 'spam' ||
      Boolean(submission.reviewedAt)
    )).length;
    const contactShareConfigured = forms.filter((form) => Boolean(form.contactShare?.enabled)).length;
    const contactRecords = formsAnalytics?.leads?.summary.contacts || 0;
    const collectionRoutedSubmissions = allSubmissions.filter((submission) => Boolean(submission.collectionRecord)).length;
    const consentFieldCount = forms.reduce((sum, form) => sum + form.fields.filter(isConsentField).length, 0);
    const spamGuardCount = forms.filter((form) => form.enableHoneypot || form.enableCaptcha).length;
    const evidenceCounts: Record<string, number> = {
      'form-definition-crud': formsWithFields,
      'public-submission-intake': Math.max(metrics.submissions, allSubmissions.length),
      'moderation-review': Math.max(metrics.approved + metrics.spam, moderatedSubmissions),
      'contact-share': contactRecords + contactShareConfigured,
      'collection-routing': Math.max(metrics.routedToCollections, collectionRoutedSubmissions),
      'delivery-audit': allDeliveryEvents.length + formsAuditLogs.filter((log) => String(log.action || '').toLowerCase().includes('form')).length,
      'consent-spam-settings': consentFieldCount + selectedConsentRecords.length + spamGuardCount,
      'custom-frontend-contract': selectedForm && selectedFormDefinitionUrl && selectedFormSubmitUrl && selectedFormSamplePayload ? 1 : 0,
    };
    const scenarios = FORM_PERSISTENCE_CERTIFICATION_SCENARIOS.map((scenario) => {
      const evidenceCount = evidenceCounts[scenario.key] || 0;
      return {
        ...scenario,
        evidenceCount,
        status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
      };
    });
    const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

    return {
      schemaVersion: 'backy.forms-persistence-scenario-evidence.v1',
      status: covered === scenarios.length ? 'ready' : 'attention',
      requiredGate: formsPersistenceCertification?.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE,
      coverage: {
        covered,
        total: scenarios.length,
        missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
      },
      scenarios,
      secretHandling: 'Forms persistence scenario evidence reports only names, counts, gates, and readiness states; database URLs, credentials, submission values, IP hashes, and contact payloads stay private.',
    };
  }, [
    deliveryEventsByForm,
    forms,
    formsAnalytics?.leads?.summary.contacts,
    formsAuditLogs,
    formsPersistenceCertification?.operatorGate,
    inboxByForm,
    metrics.approved,
    metrics.routedToCollections,
    metrics.spam,
    metrics.submissions,
    selectedConsentRecords.length,
    selectedForm,
    selectedFormDefinitionUrl,
    selectedFormSamplePayload,
    selectedFormSubmitUrl,
  ]);
  const formsPostgresCertificationCommand = useMemo(
    () => buildFormsPostgresCertificationCommand(formsPostgresCommandOptions),
    [formsPostgresCommandOptions],
  );
  const formsPostgresCertificationEnvTemplate = useMemo(
    () => buildFormsPostgresCertificationEnvTemplate(formsPostgresCommandOptions),
    [formsPostgresCommandOptions],
  );
  const formsPostgresCertificationRequiredInputs = useMemo(
    () => buildFormsPostgresCertificationRequiredInputs(formsPostgresCommandOptions),
    [formsPostgresCommandOptions],
  );
  const formPersistenceCertification = useMemo<FormPersistenceCertificationHandoff>(() => ({
    schemaVersion: 'backy.forms-persistence-certification.v1',
    status: 'external-database-gate',
    selectedSiteId: activeSiteId,
    requiredDatabaseEnv: ['BACKY_DATABASE_URL', 'DATABASE_URL'],
    requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    localEvidence: ['npm run test:forms --workspace @backy-cms/admin', 'npm run test:repositories --workspace @backy/db'],
    operatorGate: formsPersistenceCertification?.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE,
    preflightGates: formsPersistenceCertification?.preflightGates || [...FORM_PERSISTENCE_PREFLIGHT_GATES],
    databaseGate: 'npm run test:forms-postgres --workspace @backy/db',
    ciGate: 'npm run ci:forms-postgres',
    workflow: '.github/workflows/forms-postgres-contract.yml',
    targetGuards: [
      'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
      'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    ],
    requires: [
      'disposable migrated Supabase/Postgres database',
      'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
      'disposable_database_confirmed=true',
      'form_definitions, form_submissions, and form_contacts migrations with RLS policies',
    ],
    coverage: formsPersistenceCertification?.coverage || [
      'form definitions',
      'form submissions',
      'form contacts',
      'collection-record routing',
      'contact merge and promotion metadata',
      'consent/spam settings persistence',
    ],
    evidenceExpectations: formsPersistenceCertification?.evidenceExpectations || [...FORM_PERSISTENCE_EVIDENCE_EXPECTATIONS],
    runtime: formsPersistenceCertification?.runtime || null,
    operatorCommandTemplate: {
      ...(formsPersistenceCertification?.operatorCommandTemplate || FORMS_POSTGRES_OPERATOR_COMMAND_TEMPLATE),
      command: formsPostgresCertificationCommand,
      envTemplate: formsPostgresCertificationEnvTemplate,
      envTemplateSchemaVersion: 'backy.forms-postgres-certification-env-template.v1',
      requiredInputs: formsPostgresCertificationRequiredInputs,
    },
    operatorEnvTemplate: {
      schemaVersion: 'backy.forms-postgres-certification-env-template.v1',
      format: 'shell-env',
      fileName: '.env.backy-forms-postgres-certification',
      body: formsPostgresCertificationEnvTemplate,
      secretHandling: 'Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.',
    },
    secretHandling: 'Database URLs stay in server/CI environment variables; forms handoff manifests only expose non-secret gate names and readiness evidence.',
    checks: FORM_PERSISTENCE_CERTIFICATION_CHECKS.map((check) => ({ ...check })),
    scenarioEvidence: formPersistenceScenarioEvidence,
  }), [
    activeSiteId,
    formPersistenceScenarioEvidence,
    formsPostgresCertificationCommand,
    formsPostgresCertificationEnvTemplate,
    formsPostgresCertificationRequiredInputs,
    formsPersistenceCertification?.coverage,
    formsPersistenceCertification?.evidenceExpectations,
    formsPersistenceCertification?.operatorGate,
    formsPersistenceCertification?.operatorCommandTemplate,
    formsPersistenceCertification?.preflightGates,
    formsPersistenceCertification?.runtime,
  ]);
  const formsTemplatePack = useMemo(() => ({
    schemaVersion: 'backy.form-template-pack.v1',
    generatedAt: new Date().toISOString(),
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
    },
    export: {
      format: 'json',
      source: 'forms-template-library',
      builtInTemplateCount: FORM_TEMPLATES.length,
      frontendTemplateCount: frontendTemplateBlueprints.length,
    },
    builtInTemplates: FORM_TEMPLATES.map((template) => buildTemplateManifest(template)),
    frontendTemplates: frontendTemplateBlueprints.map(({ template, blueprint }) => ({
      schemaVersion: 'backy.frontend-form-template.v1',
      template,
      form: buildTemplateManifest(blueprint),
      settings: buildFrontendFormTemplateSettings(template, frontendDesign, blueprint.frontendFieldKeyMap),
    })),
  }), [activeSite?.name, activeSite?.slug, activeSiteId, frontendDesign, frontendTemplateBlueprints]);
  const selectedFormLaunchReadiness = useMemo<FormLaunchReadinessHandoff>(() => buildFormLaunchReadinessHandoff({
    activeSiteId,
    form: selectedForm,
    readiness: selectedFormReadiness,
    persistenceCertification: formPersistenceCertification,
    definitionUrl: selectedFormDefinitionUrl,
    submitUrl: selectedFormSubmitUrl,
    contactsUrl: selectedFormContactsUrl,
    analytics: selectedFormAnalytics,
    deliveryMetrics: selectedDeliveryMetrics,
    consentMetrics: selectedConsentMetrics,
    samplePayload: selectedFormSamplePayload,
  }), [
    activeSiteId,
    formPersistenceCertification,
    selectedConsentMetrics,
    selectedDeliveryMetrics,
    selectedForm,
    selectedFormAnalytics,
    selectedFormContactsUrl,
    selectedFormDefinitionUrl,
    selectedFormReadiness,
    selectedFormSamplePayload,
    selectedFormSubmitUrl,
  ]);
  const selectedFormDeliveryHandoff = useMemo<FormDeliveryHandoff>(() => buildFormDeliveryHandoff({
    activeSiteId,
    form: selectedForm,
    adminBaseUrl,
    publicBaseUrl,
    deliveryMetrics: selectedDeliveryMetrics,
    events: selectedDeliveryEvents,
  }), [
    activeSiteId,
    adminBaseUrl,
    publicBaseUrl,
    selectedDeliveryEvents,
    selectedDeliveryMetrics,
    selectedForm,
  ]);
  const formsAccountRegistrationHandoff = useMemo(() => ({
    schemaVersion: FORM_ACCOUNT_REGISTRATION_HANDOFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
    },
    template: {
      id: REGISTRATION_FORM_TEMPLATE.id,
      title: REGISTRATION_FORM_TEMPLATE.title,
      pageTemplate: REGISTRATION_FORM_TEMPLATE.pageTemplate,
      requiredFields: REGISTRATION_FORM_TEMPLATE.fields
        .filter((field) => field.required)
        .map((field) => field.key),
      contactShare: REGISTRATION_FORM_TEMPLATE.contactShare,
    },
    pageTemplates: {
      registration: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=registration`,
      memberLogin: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=member-login`,
      memberAccount: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=member-account`,
    },
    publicApis: {
      formsCatalog: formsListUrl,
      registrationDefinition: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/{registrationFormId}/definition`,
      registrationSubmit: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/forms/{registrationFormId}/submissions`,
    },
    privateReviewApis: {
      selectedInbox: selectedForm
        ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(selectedForm.id)}/submissions?limit=100`
        : '',
      selectedContacts: selectedFormContactsUrl,
      contactsWorkspace: `/contacts?siteId=${encodeURIComponent(activeSiteId)}`,
      usersWorkspace: `/users?siteId=${encodeURIComponent(activeSiteId)}`,
    },
    bindings: FORM_ACCOUNT_REGISTRATION_BINDINGS,
    actionBindings: FORM_ACCOUNT_REGISTRATION_ACTIONS,
    providerGate: {
      status: 'provider-gated',
      usersRoute: `/users?siteId=${encodeURIComponent(activeSiteId)}`,
      settingsRoute: '/settings?tab=infrastructure',
      requiredFor: ['credentialed-public-member-sessions', 'member-password-reset', 'member-email-verification', 'protected-member-routes'],
      boundary: 'Forms captures and validates registration values; Contacts/Collections review them; Users/Auth enforces credentialed member sessions.',
    },
    privacy: {
      includesSubmissionValues: false,
      includesContactIdentity: false,
      excludes: ['raw submission values', 'raw contact values', 'private admin users', 'session cookies', 'auth provider secrets', 'invite tokens', 'reset tokens'],
      note: 'Use public form APIs for visitor capture, private Forms/Contacts APIs for review, and Users/Auth provider readiness before enforcing member sessions.',
    },
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSiteId,
    adminBaseUrl,
    formsListUrl,
    publicBaseUrl,
    selectedForm,
    selectedFormContactsUrl,
  ]);
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
      frontendHandoff: formsAccountRegistrationHandoff,
      currentCapability: 'Backy can capture, moderate, export, and route registration submissions into contacts or collections.',
      providerGate: 'Credentialed member accounts, password/session lifecycle, and protected routes are enforced through the Users/Auth provider handoff.',
    },
    persistenceCertification: formPersistenceCertification,
    selectedFormLaunchReadiness,
    selectedFormDeliveryHandoff,
    templateExport: {
      schemaVersion: formsTemplatePack.schemaVersion,
      format: formsTemplatePack.export.format,
      builtInTemplateCount: formsTemplatePack.export.builtInTemplateCount,
      frontendTemplateCount: formsTemplatePack.export.frontendTemplateCount,
    },
    metrics,
    templates: FORM_TEMPLATES.map((template) => buildTemplateManifest(template)),
    frontendDesign: frontendDesign ? {
      status: frontendDesign.status,
      source: frontendDesign.source,
      formTemplates: frontendFormTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        routePattern: template.routePattern,
        bindingHints: template.bindingHints || [],
      })),
    } : null,
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
      settings: selectedForm.settings,
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
        frontendDesignTemplateId: getFormFrontendTemplateId(form),
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
    frontendDesign,
    frontendFormTemplates,
    formDestinationFilter,
    formPersistenceCertification,
    formsTemplatePack,
    formsAccountRegistrationHandoff,
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
    selectedFormDeliveryHandoff,
    selectedFormLaunchReadiness,
    selectedFormSamplePayload,
    selectedFormSubmitUrl,
  ]);
  const formsTemplatePackText = useMemo(() => JSON.stringify(formsTemplatePack, null, 2), [formsTemplatePack]);
  const selectedFormLaunchReadinessText = useMemo(() => JSON.stringify(selectedFormLaunchReadiness, null, 2), [selectedFormLaunchReadiness]);
  const selectedFormDeliveryHandoffText = useMemo(() => JSON.stringify(selectedFormDeliveryHandoff, null, 2), [selectedFormDeliveryHandoff]);
  const formPersistenceOperatorGate = formPersistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE;
  const formPersistenceCertificationText = useMemo(() => JSON.stringify(formPersistenceCertification, null, 2), [formPersistenceCertification]);
  const formsHandoffText = useMemo(() => JSON.stringify(formsHandoff, null, 2), [formsHandoff]);
  const formsAccountRegistrationHandoffText = useMemo(() => JSON.stringify(formsAccountRegistrationHandoff, null, 2), [formsAccountRegistrationHandoff]);
  const formsRouteSearch = useMemo<FormsSearch>(() => ({
    siteId: activeSiteId,
    ...(selectedFormId ? { formId: selectedFormId } : {}),
    ...(activeFrontendTemplateId ? { frontendTemplate: activeFrontendTemplateId } : {}),
    ...(formSearchQuery.trim() ? { q: formSearchQuery.trim() } : {}),
    ...(formSourceFilter !== 'all' ? { source: formSourceFilter } : {}),
    ...(formStateFilter !== 'all' ? { state: formStateFilter } : {}),
    ...(formDestinationFilter !== 'all' ? { destination: formDestinationFilter } : {}),
    ...(formReadinessFilter !== 'all' ? { readiness: formReadinessFilter } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(submissionQuery.trim() ? { submissionQ: submissionQuery.trim() } : {}),
  }), [
    activeSiteId,
    activeFrontendTemplateId,
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
      ...(merged.frontendTemplate?.trim() ? { frontendTemplate: merged.frontendTemplate.trim() } : {}),
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

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(loadError instanceof Error ? loadError.message : 'Unable to load form permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  const loadForms = async () => {
    if (isFormsBusy) return;
    if (!canViewForms) {
      setForms([]);
      setCollections([]);
      setInboxByForm({});
      setDeliveryEventsByForm({});
      setFormsAnalytics(null);
      setFormsPersistenceCertification(null);
      setFormsAuditLogs([]);
      setError(viewPermissionTitle || 'Your account cannot view forms.');
      setNotice(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [loadedFormsResult, loadedCollections, loadedAnalytics, loadedAuditResult] = await Promise.all([
        listFormsWithMetadata(activeSiteId),
        canViewCollections ? listCollections(activeSiteId).catch(() => []) : Promise.resolve([]),
        getFormsAnalytics(activeSiteId, { days: 14 }).catch(() => null),
        canExportActivity ? listAdminAuditLogs({ siteId: activeSiteId, limit: 40 }).catch(() => null) : Promise.resolve(null),
      ]);
      const loadedForms = loadedFormsResult.forms;
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
      const deliveryPairs = await Promise.all(
        loadedForms.map(async (form) => {
          try {
            const result = await listFormDeliveryEvents(activeSiteId, form.id, { limit: 50 });
            return [form.id, result.events] as const;
          } catch {
            return [form.id, []] as const;
          }
        }),
      );
      const nextInbox = Object.fromEntries(inboxPairs);
      setForms(loadedForms);
      setCollections(loadedCollections);
      setInboxByForm(nextInbox);
      setDeliveryEventsByForm(Object.fromEntries(deliveryPairs));
      setFormsAnalytics(loadedAnalytics);
      setFormsPersistenceCertification(loadedFormsResult.persistenceCertification || null);
      setFormsAuditLogs((loadedAuditResult?.logs || []).filter(isFormsAuditLog).slice(0, 8));
      setSelectedFormId((current) => (
        current && loadedForms.some((form) => form.id === current)
          ? current
          : loadedForms[0]?.id || null
      ));
    } catch (loadError) {
      if (isAdminPermissionDeniedError(loadError)) {
        setForms([]);
        setCollections([]);
        setInboxByForm({});
        setDeliveryEventsByForm({});
        setFormsAnalytics(null);
        setFormsPersistenceCertification(null);
        setFormsAuditLogs([]);
      }
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
    if (!canCreateForms) {
      setError(createPermissionTitle || 'Your account cannot create forms.');
      setNotice(null);
      return;
    }
    if (template.collectionTarget?.enabled && !canUseCollectionTargets) {
      setError(collectionTargetUnavailableReason || 'A published public-create collection is required before creating this collection-backed form.');
      setNotice(null);
      return;
    }

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
      setDeliveryEventsByForm((current) => ({ ...current, [created.id]: [] }));
      setSelectedFormId(created.id);
      updateFormsRouteSearch({ formId: created.id, q: undefined, source: undefined, state: undefined, destination: undefined, readiness: undefined });
      setNotice(`${template.title} form created. It is active and ready for public submissions.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create form from template');
    } finally {
      setIsCreatingTemplateId(null);
    }
  };

  const createFormFromFrontendTemplate = async (template: SiteFrontendDesignTemplate, blueprint: FormTemplateBlueprint) => {
    if (isFormsBusy) return;
    if (!canCreateForms) {
      setError(createPermissionTitle || 'Your account cannot create forms.');
      setNotice(null);
      return;
    }
    if (blueprint.collectionTarget?.enabled && !canUseCollectionTargets) {
      setError(collectionTargetUnavailableReason || 'A published public-create collection is required before creating this collection-backed form.');
      setNotice(null);
      return;
    }

    const creatingId = `frontend:${template.id}`;
    setIsCreatingTemplateId(creatingId);
    setError(null);
    setNotice(null);

    try {
      const created = await createForm(activeSiteId, {
        name: `${normalizeFieldKey(template.id) || 'frontend-form'}-${Date.now().toString(36)}`,
        title: blueprint.title,
        description: blueprint.description,
        audience: blueprint.audience,
        isActive: true,
        fields: blueprint.fields,
        successMessage: blueprint.successMessage,
        enableHoneypot: true,
        enableCaptcha: false,
        moderationMode: blueprint.moderationMode,
        contactShare: blueprint.contactShare,
        collectionTarget: blueprint.collectionTarget,
        settings: buildFrontendFormTemplateSettings(template, frontendDesign, blueprint.frontendFieldKeyMap),
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
      setDeliveryEventsByForm((current) => ({ ...current, [created.id]: [] }));
      setSelectedFormId(created.id);
      updateFormsRouteSearch({ formId: created.id, q: undefined, source: undefined, state: undefined, destination: undefined, readiness: undefined });
      setNotice(`${template.name} form created from the frontend design contract.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create form from frontend design template');
    } finally {
      setIsCreatingTemplateId(null);
    }
  };

  const createBlankStandaloneForm = async () => {
    if (isFormsBusy) return;
    if (!canCreateForms) {
      setError(createPermissionTitle || 'Your account cannot create forms.');
      setNotice(null);
      return;
    }

    const suffix = Date.now().toString(36);
    setIsCreatingTemplateId('blank');
    setError(null);
    setNotice(null);
    setPreparedQuickCreate(null);

    try {
      const created = await createForm(activeSiteId, {
        name: `blank-form-${suffix}`,
        title: 'Untitled form',
        description: 'Standalone form ready for custom fields and frontend embedding.',
        audience: 'public',
        isActive: true,
        fields: [
          {
            key: 'field_1',
            label: 'Field 1',
            type: 'text',
            required: false,
          },
        ],
        successMessage: 'Submission received.',
        enableHoneypot: true,
        enableCaptcha: false,
        moderationMode: 'manual',
        contactShare: { enabled: false },
        collectionTarget: { enabled: false, collectionId: '', fieldMap: {} },
        spamSettings: DEFAULT_FORM_SPAM_SETTINGS,
        consentSettings: DEFAULT_FORM_CONSENT_SETTINGS,
        settings: {
          spam: DEFAULT_FORM_SPAM_SETTINGS,
          consent: DEFAULT_FORM_CONSENT_SETTINGS,
          source: 'blank-standalone',
        },
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
      setDeliveryEventsByForm((current) => ({ ...current, [created.id]: [] }));
      setSelectedFormId(created.id);
      setFormDraft(cloneFormDefinition(created));
      updateFormsRouteSearch({ formId: created.id, q: undefined, source: undefined, state: undefined, destination: undefined, readiness: undefined });
      setNotice('Blank standalone form created. Add fields or save changes in the builder.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create blank form');
    } finally {
      setIsCreatingTemplateId(null);
    }
  };

  useEffect(() => {
    if (routeSearch.quickCreate !== 'blank') {
      handledQuickCreateRef.current = '';
      return;
    }
    if (isPermissionMatrixPending || isFormsBusy) return;

    const requestKey = `${activeSiteId}:${routeSearch.quickCreate}`;
    if (handledQuickCreateRef.current === requestKey) return;
    handledQuickCreateRef.current = requestKey;

    setFormSearchQuery('');
    setFormSourceFilter('all');
    setFormStateFilter('all');
    setFormDestinationFilter('all');
    setFormReadinessFilter('all');
    setSubmissionQuery('');
    setStatusFilter('all');
    setSelectedSubmissionIds([]);
    setSelectedFormId(null);
    setFormDraft(null);
    setError(null);
    setNotice('New blank form creation is ready. Choose New blank form to create and edit it.');
    setPreparedQuickCreate('blank');
    updateFormsRouteSearch({
      formId: undefined,
      q: undefined,
      source: undefined,
      state: undefined,
      destination: undefined,
      readiness: undefined,
      status: undefined,
      submissionQ: undefined,
    });

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="forms-create-blank-button"]')?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, isFormsBusy, isPermissionMatrixPending, routeSearch.quickCreate]);

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    const loadedSubmissionIds = new Set(selectedSubmissions.map((submission) => submission.id));
    setSelectedSubmissionIds((current) => {
      const next = current.filter((submissionId) => loadedSubmissionIds.has(submissionId));
      return next.length === current.length ? current : next;
    });
  }, [selectedSubmissions]);

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const nextFormId = routeSearch.formId || null;
    const siteChanged = nextSiteId !== selectedSiteId;
    const formChanged = nextFormId !== selectedFormId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
    }

    setSelectedFormId(nextFormId);
    if (siteChanged || formChanged) {
      setSelectedSubmissionIds([]);
    }
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
    selectedFormId,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    if (!isPermissionMatrixPending) {
      void loadForms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewForms, isPermissionMatrixPending]);

  useEffect(() => {
    let cancelled = false;

    const loadFrontendDesign = async () => {
      if (isPermissionMatrixPending) return;
      if (!canViewForms) {
        setFrontendDesign(null);
        setFrontendDesignError(viewPermissionTitle || 'Your account cannot view form frontend contracts.');
        setFrontendDesignLoading(false);
        return;
      }

      setFrontendDesignLoading(true);
      setFrontendDesignError(null);

      try {
        const response = await getSiteFrontendDesign(activeSiteId);
        if (!cancelled) {
          setFrontendDesign(response.frontendDesign);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFrontendDesign(null);
          setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design contract');
        }
      } finally {
        if (!cancelled) {
          setFrontendDesignLoading(false);
        }
      }
    };

    void loadFrontendDesign();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewForms, isPermissionMatrixPending, viewPermissionTitle]);

  useEffect(() => {
    setFormDraft(selectedForm ? cloneFormDefinition(selectedForm) : null);
    setFormDraftSubmitted(false);
    setCreatedEmbedSectionId(null);
  }, [selectedForm]);

  const patchFormDraft = (patch: Partial<FormDefinition>) => {
    if (!canEditForms) return;
    setFormDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const patchFormDraftSpamSettings = (patch: Partial<FormSpamSettings>) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;

      const currentSpam = readFormSpamSettings(current);
      return {
        ...current,
        spamSettings: {
          ...currentSpam,
          ...patch,
        },
        settings: {
          ...(current.settings || {}),
          spam: {
            ...currentSpam,
            ...patch,
          },
        },
      };
    });
  };

  const patchFormDraftConsentSettings = (patch: Partial<FormConsentSettings>) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;

      const currentConsent = readFormConsentSettings(current);
      const nextConsent = {
        ...currentConsent,
        ...patch,
      };
      return {
        ...current,
        consentSettings: nextConsent,
        settings: {
          ...(current.settings || {}),
          consent: nextConsent,
        },
      };
    });
  };

  const patchFormDraftContactShare = (patch: Partial<NonNullable<FormDefinition['contactShare']>>) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;

      const currentShare = current.contactShare || { enabled: false };
      const nextShare = normalizeFormContactShare({
        ...currentShare,
        ...patch,
      }, current.fields);

      return {
        ...current,
        contactShare: nextShare,
      };
    });
  };

  const patchFormDraftField = (fieldIndex: number, patch: Partial<FormFieldDefinition>) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;
      const currentField = current.fields[fieldIndex];
      if (!currentField) return current;
      const hasKeyPatch = Object.prototype.hasOwnProperty.call(patch, 'key');
      const currentKey = normalizeFieldKey(currentField.key);
      const patchedKey = hasKeyPatch
        ? getUniqueFormDraftFieldKey(
            current.fields.filter((_, index) => index !== fieldIndex),
            normalizeFieldKey(String(patch.key || '')) || currentKey,
          )
        : currentKey;
      const nextPatch = hasKeyPatch ? { ...patch, key: patchedKey } : patch;
      const fieldKeyChanged = hasKeyPatch && Boolean(currentKey) && Boolean(patchedKey) && currentKey !== patchedKey;
      const nextContactShare = fieldKeyChanged
        ? remapFormContactShareFieldKey(current.contactShare, currentKey, patchedKey)
        : current.contactShare;
      const nextCollectionTarget = fieldKeyChanged
        ? remapFormCollectionTargetFieldKey(current.collectionTarget, currentKey, patchedKey)
        : current.collectionTarget;

      return {
        ...current,
        fields: current.fields.map((field, index) => (
          index === fieldIndex ? { ...field, ...nextPatch } : field
        )),
        ...(nextContactShare ? { contactShare: nextContactShare } : {}),
        ...(nextCollectionTarget ? { collectionTarget: nextCollectionTarget } : {}),
      };
    });
  };

  const patchFormDraftFieldValidation = (
    fieldIndex: number,
    ruleType: FormValidationRuleType,
    patch: Partial<FormValidationRule>,
  ) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        fields: current.fields.map((field, index) => {
          if (index !== fieldIndex) return field;

          const allowedValidationTypes = new Set(validationTypesForFieldType(normalizeFormFieldType(field.type)));
          const compatibleRules = (field.validation || []).filter((rule) => (
            allowedValidationTypes.has(rule.type as FormValidationRuleType)
          ));
          if (!allowedValidationTypes.has(ruleType)) {
            return {
              ...field,
              validation: compatibleRules.length > 0 ? compatibleRules : undefined,
            };
          }

          const existingRules = compatibleRules;
          const existingRule = existingRules.find((rule) => rule.type === ruleType);
          const nextRule = {
            type: ruleType,
            message: existingRule?.message || defaultValidationMessage(field.label, ruleType),
            ...existingRule,
            ...patch,
          };
          const withoutRule = existingRules.filter((rule) => rule.type !== ruleType);
          const hasValue = formValidationRuleHasValue(nextRule);
          const validation = hasValue
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

  const patchFormDraftFieldType = (fieldIndex: number, type: FormFieldType) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;
      const currentField = current.fields[fieldIndex];
      if (!currentField) return current;

      return {
        ...current,
        fields: current.fields.map((field, index) => (
          index === fieldIndex ? applyFormFieldTypeDefaults(field, type) : field
        )),
      };
    });
  };

  const patchFormDraftFieldOptions = (fieldIndex: number, options: string[] | undefined) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;
      const currentField = current.fields[fieldIndex];
      if (!currentField) return current;

      return {
        ...current,
        fields: current.fields.map((field, index) => (
          index === fieldIndex ? applyFormFieldOptionDefaults(field, options) : field
        )),
      };
    });
  };

  const patchFormDraftCollectionTarget = (patch: Partial<NonNullable<FormDefinition['collectionTarget']>>) => {
    if (!canEditForms) return;
    if (patch.enabled === true && !canUseCollectionTargets) return;
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
      const normalizedTarget = normalizeFormCollectionTarget(nextTarget, current.fields) || nextTarget;

      return {
        ...current,
        collectionTarget: normalizedTarget.enabled ? normalizedTarget : { ...normalizedTarget, enabled: false },
      };
    });
  };

  const addFormDraftField = (fieldType: FormFieldType = newFormFieldType) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;
      const nextNumber = current.fields.length + 1;
      return {
        ...current,
        fields: [
          ...current.fields,
          buildFormDraftFieldPreset(current.fields, fieldType, nextNumber),
        ],
      };
    });
  };

  const duplicateFormDraftField = (fieldIndex: number) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current) return current;
      const field = current.fields[fieldIndex];
      if (!field) return current;

      const duplicateKey = getUniqueFormDraftFieldKey(current.fields, `${field.key || 'field'}_copy`);
      const duplicateField: FormFieldDefinition = {
        ...field,
        key: duplicateKey,
        label: `${field.label || 'Field'} copy`,
        options: field.options ? [...field.options] : undefined,
        validation: field.validation ? field.validation.map((rule) => ({ ...rule })) : undefined,
      };
      const fields = [...current.fields];
      fields.splice(fieldIndex + 1, 0, duplicateField);
      return { ...current, fields };
    });
  };

  const removeFormDraftField = (fieldIndex: number) => {
    if (!canEditForms) return;
    setFormDraft((current) => {
      if (!current || current.fields.length <= 1) return current;
      const removedField = current.fields[fieldIndex];
      if (!removedField) return current;
      const removedKey = normalizeFieldKey(removedField.key);
      const nextContactShare = removedKey
        ? removeFormContactShareFieldKey(current.contactShare, removedKey)
        : current.contactShare;
      const nextCollectionTarget = removedKey
        ? removeFormCollectionTargetFieldKey(current.collectionTarget, removedKey)
        : current.collectionTarget;
      return {
        ...current,
        fields: current.fields.filter((_, index) => index !== fieldIndex),
        ...(nextContactShare ? { contactShare: nextContactShare } : {}),
        ...(nextCollectionTarget ? { collectionTarget: nextCollectionTarget } : {}),
      };
    });
  };

  const moveFormDraftField = (fieldIndex: number, direction: -1 | 1) => {
    if (!canEditForms) return;
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
    if (!canEditForms) {
      setError(editPermissionTitle || 'Your account cannot update forms.');
      setNotice(null);
      return;
    }

    setFormDraftSubmitted(true);
    const draftInlineErrors = buildFormDraftInlineErrors(formDraft, collections);
    if (Object.keys(draftInlineErrors).length > 0) {
      setError('Fix form builder fields before saving.');
      setNotice(null);
      return;
    }

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
      setFormDraftSubmitted(false);
      setNotice('Form settings and fields saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save form');
    } finally {
      setIsSavingForm(false);
    }
  };

  const requestDeleteSelectedForm = () => {
    if (isFormsBusy || !selectedForm) return;
    if (!canDeleteForms) {
      setError(deletePermissionTitle || 'Your account cannot delete forms.');
      setNotice(null);
      return;
    }

    setPendingDeleteForm(selectedForm);
    setError(null);
    setNotice(null);
  };

  useEffect(() => {
    if (!pendingDeleteForm) return;

    const handleDeleteDialogKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isDeletingFormId) return;
      event.preventDefault();
      setPendingDeleteForm(null);
    };

    window.addEventListener('keydown', handleDeleteDialogKeydown);
    return () => window.removeEventListener('keydown', handleDeleteDialogKeydown);
  }, [isDeletingFormId, pendingDeleteForm]);

  const handleCloneSelectedForm = async () => {
    if (isFormsBusy || !selectedForm) return;
    if (!canCreateForms) {
      setError(createPermissionTitle || 'Your account cannot create forms.');
      setNotice(null);
      return;
    }

    setIsCloningForm(true);
    setError(null);
    setNotice(null);

    try {
      const cloned = await cloneForm(activeSiteId, selectedForm.id, {
        title: `${selectedForm.title || selectedForm.name} copy`,
        name: `${selectedForm.name}-copy`,
        isActive: false,
      });
      setForms((current) => [cloned, ...current.filter((form) => form.id !== cloned.id)]);
      setInboxByForm((current) => ({
        ...current,
        [cloned.id]: {
          form: cloned,
          submissions: [],
          total: 0,
        },
      }));
      setDeliveryEventsByForm((current) => ({ ...current, [cloned.id]: [] }));
      setSelectedFormId(cloned.id);
      setFormDraft(cloneFormDefinition(cloned));
      updateFormsRouteSearch({
        formId: cloned.id,
        q: undefined,
        source: undefined,
        state: undefined,
        destination: undefined,
        readiness: undefined,
        status: undefined,
        submissionQ: undefined,
      });
      setNotice(`${cloned.title || cloned.name} cloned as an inactive form.`);
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : 'Unable to clone form');
    } finally {
      setIsCloningForm(false);
    }
  };

  const confirmDeleteForm = async () => {
    if (isFormsBusy || !pendingDeleteForm) return;
    if (!canDeleteForms) {
      setError(deletePermissionTitle || 'Your account cannot delete forms.');
      setNotice(null);
      return;
    }

    const deletedForm = pendingDeleteForm;
    const nextForm = forms.find((form) => form.id !== deletedForm.id) || null;
    setIsDeletingFormId(deletedForm.id);
    setError(null);
    setNotice(null);

    try {
      await deleteForm(activeSiteId, deletedForm.id);
      setForms((current) => current.filter((form) => form.id !== deletedForm.id));
      setInboxByForm((current) => {
        const rest = { ...current };
        delete rest[deletedForm.id];
        return rest;
      });
      setDeliveryEventsByForm((current) => {
        const rest = { ...current };
        delete rest[deletedForm.id];
        return rest;
      });
      setSelectedFormId(nextForm?.id || null);
      setFormDraft(nextForm ? cloneFormDefinition(nextForm) : null);
      setPendingDeleteForm(null);
      updateFormsRouteSearch({
        formId: nextForm?.id,
        status: undefined,
        submissionQ: undefined,
      });
      setNotice(`${deletedForm.title || deletedForm.name} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete form');
    } finally {
      setIsDeletingFormId(null);
    }
  };

  const refreshFormDeliveryEvents = async (formId: string): Promise<FormDeliveryEvent[]> => {
    if (!canManageForms) {
      throw new Error(managePermissionTitle || 'Your account cannot refresh form delivery events.');
    }

    const result = await listFormDeliveryEvents(activeSiteId, formId, { limit: 50 });
    setDeliveryEventsByForm((current) => ({
      ...current,
      [formId]: result.events,
    }));
    return result.events;
  };

  const handleRefreshDeliveryEvents = async () => {
    if (isFormsBusy || !selectedForm) return;

    setError(null);
    setNotice(null);

    try {
      const events = await refreshFormDeliveryEvents(selectedForm.id);
      setNotice(`Delivery history refreshed with ${events.length} event${events.length === 1 ? '' : 's'}.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh delivery history');
    }
  };

  const handleRetryDeliveryEvent = async (event: FormDeliveryEvent) => {
    if (isFormsBusy || !selectedForm || !event.submissionId) return;
    if (!canManageForms) {
      setError(managePermissionTitle || 'Your account cannot retry form delivery.');
      setNotice(null);
      return;
    }

    const channel = typeof event.metadata?.channel === 'string' ? event.metadata.channel : 'webhook';
    setIsRetryingDeliveryId(event.id);
    setError(null);
    setNotice(null);

    try {
      const result = channel === 'email'
        ? await retryFormEmailDelivery(activeSiteId, selectedForm.id, event.submissionId)
        : await retryFormWebhookDelivery(activeSiteId, selectedForm.id, event.submissionId);
      await refreshFormDeliveryEvents(selectedForm.id);
      if (result.delivery.status === 'succeeded') {
        setNotice(`${channel === 'email' ? 'Email' : 'Webhook'} retry succeeded for ${event.submissionId}.`);
      } else {
        setError(result.delivery.error || `${channel === 'email' ? 'Email' : 'Webhook'} retry finished with ${result.delivery.status}.`);
      }
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : `Unable to retry ${channel === 'email' ? 'email' : 'webhook'} delivery`);
    } finally {
      setIsRetryingDeliveryId(null);
    }
  };

  const handleSubmissionStatus = async (submission: FormSubmission, status: FormSubmissionStatus) => {
    if (isFormsBusy) return;
    if (submission.status === status) return;
    if (!canManageForms) {
      setError(managePermissionTitle || 'Your account cannot review submissions.');
      setNotice(null);
      return;
    }

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

  const toggleVisibleSubmissionSelection = (selected: boolean) => {
    if (isFormsBusy || !canManageForms) return;

    const visibleIds = filteredSubmissions.map((submission) => submission.id);
    setSelectedSubmissionIds((current) => (
      selected
        ? Array.from(new Set([...current, ...visibleIds]))
        : current.filter((submissionId) => !visibleIds.includes(submissionId))
    ));
  };

  const handleBulkSubmissionStatus = async (status: FormSubmissionStatus) => {
    if (isFormsBusy || !selectedForm) return;
    if (!canManageForms) {
      setError(managePermissionTitle || 'Your account cannot review submissions.');
      setNotice(null);
      return;
    }

    const targets = selectedLoadedSubmissions.filter((submission) => submission.status !== status);
    if (targets.length === 0) {
      setNotice(selectedLoadedSubmissions.length > 0
        ? `Selected submissions are already ${status}.`
        : 'Select at least one loaded submission before applying a bulk review action.');
      return;
    }

    setIsUpdatingId('bulk-submissions');
    setError(null);
    setNotice(null);

    try {
      const results = await Promise.allSettled(targets.map((submission) => updateFormSubmission(activeSiteId, submission.formId, submission.id, {
        status,
        reviewedBy: 'admin',
      })));
      const updatedSubmissions = results
        .filter((result): result is PromiseFulfilledResult<FormSubmission> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failedCount = results.length - updatedSubmissions.length;

      if (updatedSubmissions.length === 0) {
        const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw firstFailure?.reason || new Error('Unable to update selected submissions');
      }

      const updatedById = new Map(updatedSubmissions.map((submission) => [submission.id, submission]));
      setInboxByForm((current) => {
        const inbox = current[selectedForm.id];
        if (!inbox) return current;

        return {
          ...current,
          [selectedForm.id]: {
            ...inbox,
            submissions: inbox.submissions.map((submission) => updatedById.get(submission.id) || submission),
          },
        };
      });
      setSelectedSubmissionIds((current) => current.filter((submissionId) => !updatedById.has(submissionId)));
      setNotice(`${updatedSubmissions.length} submission${updatedSubmissions.length === 1 ? '' : 's'} marked ${status}${failedCount > 0 ? `; ${failedCount} could not be updated` : ''}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update selected submissions');
    } finally {
      setIsUpdatingId(null);
    }
  };

  const handleExportSubmissions = () => {
    if (isFormsBusy) return;
    if (!selectedForm) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export form submissions.');
      setNotice(null);
      return;
    }

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

  const handleExportConsentRecords = () => {
    if (isFormsBusy) return;
    if (!selectedForm) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export consent records.');
      setNotice(null);
      return;
    }

    if (selectedConsentFields.length === 0) {
      setError('This form does not have a consent checkbox field to export.');
      setNotice(null);
      return;
    }

    const header = [
      'site_id',
      'form_id',
      'form_name',
      'submission_id',
      'status',
      'submitted_at',
      'request_id',
      'field_key',
      'field_label',
      'consent_value',
      'consent_granted',
      'policy_label',
      'retention_due_at',
      'delete_due_at',
      'privacy_request_email',
      'ip_hash',
      'user_agent',
      'page_id',
      'post_id',
    ];
    const rows = selectedConsentRecords.map(({ submission, field, value, granted }) => [
      activeSiteId,
      selectedForm.id,
      selectedForm.name,
      submission.id,
      submission.status,
      submission.submittedAt,
      submission.requestId || '',
      field.key,
      field.label,
      formatSubmissionValue(value),
      granted ? 'true' : 'false',
      selectedConsentSettings.policyLabel,
      addDaysIso(submission.submittedAt, selectedConsentSettings.retentionDays) || '',
      addDaysIso(submission.submittedAt, selectedConsentSettings.deleteAfterDays) || '',
      selectedConsentSettings.requestEmail || '',
      selectedConsentSettings.exportIncludesIp ? submission.ipHash || '' : '',
      selectedConsentSettings.exportIncludesIp ? submission.userAgent || '' : '',
      submission.pageId || '',
      submission.postId || '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedForm.name || selectedForm.id}-consent-export.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice(`Consent CSV exported with ${selectedConsentRecords.length} consent record${selectedConsentRecords.length === 1 ? '' : 's'}.`);
  };

  const handleApplyConsentRetention = async () => {
    if (isFormsBusy || !selectedForm) return;
    if (!canManageForms) {
      setError(managePermissionTitle || 'Your account cannot apply consent retention.');
      setNotice(null);
      return;
    }

    setIsApplyingConsentRetention(true);
    setError(null);
    setNotice(null);

    try {
      const result = await applyFormConsentRetention(activeSiteId, selectedForm.id, {
        actor: 'admin',
      });
      if (result.submissions.length > 0) {
        const updatedById = new Map(result.submissions.map((submission) => [submission.id, submission]));
        setInboxByForm((current) => {
          const inbox = current[selectedForm.id];
          if (!inbox) return current;

          return {
            ...current,
            [selectedForm.id]: {
              ...inbox,
              submissions: inbox.submissions.map((submission) => updatedById.get(submission.id) || submission),
            },
          };
        });
      }

      setNotice(
        result.anonymized > 0
          ? `Consent evidence anonymized for ${result.anonymized} due submission${result.anonymized === 1 ? '' : 's'}.`
          : 'No due consent evidence needed anonymization.',
      );
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : 'Unable to apply consent retention policy');
    } finally {
      setIsApplyingConsentRetention(false);
    }
  };

  const handleCreateEmbedBlock = async () => {
    if (isFormsBusy || !selectedForm) return;
    if (!canEditForms) {
      setError(editPermissionTitle || 'Your account cannot create reusable form blocks.');
      setNotice(null);
      return;
    }

    setIsCreatingEmbedBlock(true);
    setError(null);
    setNotice(null);
    setCreatedEmbedSectionId(null);

    try {
      const section = await createFormEmbedBlock(activeSiteId, selectedForm.id, {
        actor: 'admin',
        publicBaseUrl,
      });
      setCreatedEmbedSectionId(section.id);
      setNotice(`${section.name} saved to reusable sections.`);
    } catch (embedError) {
      setError(embedError instanceof Error ? embedError.message : 'Unable to create reusable form embed block');
    } finally {
      setIsCreatingEmbedBlock(false);
    }
  };

  const handleExportFormsCatalog = () => {
    if (isFormsBusy) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export forms.');
      setNotice(null);
      return;
    }

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

  const updateFormsPostgresCommandOptions = (next: Partial<FormsPostgresCertificationCommandOptions>) => {
    setFormsPostgresCommandOptions((current) => ({
      ...current,
      ...next,
    }));
  };

  const downloadFormsHandoff = () => {
    if (isFormsBusy) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export forms handoff data.');
      setNotice(null);
      return;
    }

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

  const downloadFormPersistenceCertification = () => {
    if (isFormsBusy) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export forms certification data.');
      setNotice(null);
      return;
    }

    const blob = new Blob([formPersistenceCertificationText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-forms-persistence-certification.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Forms persistence certification handoff downloaded.');
  };

  const downloadFormTemplatePack = () => {
    if (isFormsBusy) return;
    if (!canExportForms) {
      setError(exportPermissionTitle || 'Your account cannot export form templates.');
      setNotice(null);
      return;
    }

    const blob = new Blob([formsTemplatePackText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-form-template-pack.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Form template pack downloaded.');
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
    setSelectedSubmissionIds([]);
    setSelectedFormId(null);
    navigate({ to: '/forms', search: { siteId: nextSiteId }, replace: true });
  };
  const selectForm = (formId: string) => {
    if (isFormsBusy) return;

    setSelectedFormId(formId);
    setSubmissionQuery('');
    setStatusFilter('all');
    setSelectedSubmissionIds([]);
    updateFormsRouteSearch({
      formId,
      status: undefined,
      submissionQ: undefined,
    });
  };

  if (!isPermissionMatrixPending && !canViewForms) {
    return (
      <PageShell
        title="Forms unavailable"
        description={viewPermissionTitle || 'Your account cannot view forms or submissions.'}
      >
        <div
          role="alert"
          data-testid="forms-permission-state"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Form permissions could not be verified</p>
                <p className="mt-1 leading-6">
                  {permissionError || viewPermissionTitle || 'Ask an owner or admin to grant forms.view access.'}
                </p>
              </div>
            </div>
            <Link
              to="/users"
              className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
            >
              Review users
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

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
        <div
          role="alert"
          data-testid="forms-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Forms workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasActiveFormFilters && (
                <button
                  type="button"
                  onClick={clearFormFilters}
                  disabled={isFormsBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear form filters
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadForms()}
                disabled={isFormsBusy || !canViewForms}
                title={!canViewForms ? viewPermissionTitle : undefined}
                aria-label="Retry loading forms"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry load
              </button>
            </div>
          </div>
        </div>
      )}
      {permissionError && (
        <div
          role="alert"
          data-testid="forms-rbac-permission-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Form permissions could not be verified</p>
                <p className="mt-1 leading-6">{permissionError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadForms()}
              disabled={isFormsBusy}
              aria-label="Retry loading form permissions"
              className="inline-flex shrink-0 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry permissions
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <span id={formsCreateActionStatusId} className="sr-only" data-testid="forms-create-action-status" aria-live="polite">
        {formsCreateActionStatus}
      </span>

      <section
        className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
        data-testid="forms-command-center"
        data-quick-create-prepared={String(preparedQuickCreate === 'blank')}
        data-quick-create-target={preparedQuickCreate || undefined}
      >
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
          <div className="flex flex-col gap-2 xl:items-end">
            <div className="flex flex-wrap items-center gap-2 xl:justify-end" data-testid="forms-primary-actions">
              <Button
                variant="primary"
                onClick={() => void createBlankStandaloneForm()}
                disabled={isFormsBusy || !canCreateForms}
                title={formsCreateDisabledReason || undefined}
                aria-describedby={formsCreateActionStatusId}
                iconStart={<Plus className="size-4" />}
                data-action-state={formsCreateDisabledReason ? 'blocked' : 'ready'}
                data-action-status={formsCreateActionStatus}
                data-disabled-reason={formsCreateDisabledReason || undefined}
                data-target-site-id={activeSiteId}
                data-testid="forms-create-blank-button"
              >
                {isCreatingTemplateId === 'blank' ? 'Creating...' : 'New blank form'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportFormsCatalog}
                disabled={isFormsBusy || filteredForms.length === 0 || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Download className="size-4" />}
                data-testid="forms-command-export-csv"
              >
                Export forms CSV
              </Button>
              <Button
                onClick={() => void loadForms()}
                disabled={isFormsBusy || !canViewForms}
                title={!canViewForms ? viewPermissionTitle : undefined}
                iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
                data-testid="forms-command-refresh"
              >
                Refresh forms
              </Button>
            </div>
            <details className="self-start xl:self-end" data-testid="forms-secondary-actions" data-default-collapsed="true">
              <summary
                className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60 focus-ring"
                data-testid="forms-more-actions"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
                More actions
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 shadow-sm" data-testid="forms-secondary-action-menu">
                <Button
                  variant="outline"
                  onClick={() => void copyFormApiText(formsHandoffText, 'Forms handoff manifest')}
                  disabled={isFormsBusy || !canExportForms}
                  title={!canExportForms ? exportPermissionTitle : undefined}
                  iconStart={<Copy className="size-4" />}
                  data-testid="forms-command-copy-manifest"
                >
                  Copy manifest
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadFormsHandoff}
                  disabled={isFormsBusy || !canExportForms}
                  title={!canExportForms ? exportPermissionTitle : undefined}
                  iconStart={<Download className="size-4" />}
                  data-testid="forms-command-download-json"
                >
                  Download JSON
                </Button>
              </div>
            </details>
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

        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="forms-control-map-details" data-default-collapsed="true">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>Forms control map</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show map</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide map</span>
          </summary>
          <div className="border-t border-border p-4" data-testid="forms-control-map">
            <p className="text-sm text-muted-foreground">Jump to site scope, form health, templates, library, frontend API, and submission review.</p>
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
        </details>

        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="forms-frontend-contract-details" data-default-collapsed="true">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>Form frontend control contract</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">
              {FORM_FRONTEND_SYSTEMS.length} systems
            </span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide systems</span>
          </summary>
          <div className="border-t border-border p-4" data-testid="forms-frontend-contract-systems">
            <p className="text-sm text-muted-foreground">
              Custom frontends need these systems to render registration, contact, newsletter, product inquiry, file intake, and upload forms from Backy.
            </p>
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
        </details>

        <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="forms-account-contract">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Registration/account handoff</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Backy can run signup-style public forms today: render the registration schema, capture consent, review submissions, route approved values into contacts or collections, and hand credentialed sessions to Users/Auth provider enforcement.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyFormApiText(formsAccountRegistrationHandoffText, 'Registration account handoff')}
                disabled={isFormsBusy || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Copy className="size-4" />}
                data-testid="forms-account-registration-handoff-copy-button"
              >
                Copy account handoff
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void createFormFromTemplate(REGISTRATION_FORM_TEMPLATE)}
                disabled={isFormsBusy || !canCreateForms}
                title={formsCreateDisabledReason || undefined}
                aria-describedby={formsCreateActionStatusId}
                iconStart={<FileInput className="size-4" />}
                data-action-state={formsCreateDisabledReason ? 'blocked' : 'ready'}
                data-action-status={formCreateActionStatus('Registration form')}
                data-disabled-reason={formsCreateDisabledReason || undefined}
                data-target-site-id={activeSiteId}
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
          <details className="mt-4 rounded-lg border border-border bg-card p-3" data-testid="forms-account-registration-handoff-details" data-default-collapsed="true">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
              <div>
                <div className="text-sm font-semibold text-foreground">Custom frontend account handoff</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Expand for registration APIs, account bindings, provider gates, and privacy boundaries.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {formsAccountRegistrationHandoff.providerGate.status}
              </span>
            </summary>
            <div data-testid="forms-account-registration-handoff" className="mt-3 rounded-md border border-border bg-background p-3">
              <p className="text-xs leading-5 text-muted-foreground">
                {FORM_ACCOUNT_REGISTRATION_HANDOFF_SCHEMA_VERSION} packages registration form APIs, page templates, review endpoints, account bindings, provider gates, and privacy limits for member signup flows.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <FormMetaTile label="Bindings" value={`${FORM_ACCOUNT_REGISTRATION_BINDINGS.length}`} />
                <FormMetaTile label="Actions" value={`${FORM_ACCOUNT_REGISTRATION_ACTIONS.length}`} />
                <FormMetaTile label="Privacy" value={formsAccountRegistrationHandoff.privacy.includesSubmissionValues ? 'values included' : 'values excluded'} />
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                <ApiSnippet label="Registration definition" value={formsAccountRegistrationHandoff.publicApis.registrationDefinition} />
                <ApiSnippet label="Registration submit" value={formsAccountRegistrationHandoff.publicApis.registrationSubmit} />
                <ApiSnippet label="Users/Auth handoff" value={formsAccountRegistrationHandoff.providerGate.usersRoute} />
              </div>
            </div>
          </details>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="forms-persistence-certification">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Persistence certification</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Forms are covered by local UI/API and repository checks. The remaining launch gate is the Supabase/Postgres service smoke with a configured database URL.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyFormApiText(formPersistenceCertificationText, 'Forms persistence certification handoff')}
                disabled={isFormsBusy || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Copy className="size-4" />}
                data-testid="forms-persistence-certification-copy-button"
              >
                Copy DB handoff
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyFormApiText(formPersistenceOperatorGate, 'Forms persistence CI command')}
                disabled={isFormsBusy || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Copy className="size-4" />}
                data-testid="forms-persistence-certification-command-copy-button"
              >
                Copy CI command
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadFormPersistenceCertification}
                disabled={isFormsBusy || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Download className="size-4" />}
                data-testid="forms-persistence-certification-download-button"
              >
                Download DB JSON
              </Button>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                Database gate
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {formPersistenceCertification.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{check.title}</div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">{check.gate}</div>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold',
                    check.status === 'external-database-gate' ? 'bg-amber-50 text-amber-700' : 'bg-success/10 text-success',
                  )}
                  >
                    {check.status === 'external-database-gate' ? 'External' : 'Local'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Required database env: {formPersistenceCertification.requiredDatabaseEnv.join(' or ')}. Secrets stay in server/CI environment variables and are not included in the forms handoff manifest.
            <div className="mt-1">
              CI gate: <span className="font-mono">{formPersistenceCertification.ciGate}</span> via <span className="font-mono">{formPersistenceCertification.workflow}</span>.
            </div>
            <div className="mt-1">
              Target guards: {formPersistenceCertification.targetGuards.join(', ')}; requires {formPersistenceCertification.requires.slice(0, 2).join(' and ')}.
            </div>
          </div>
          <details className="mt-3 rounded-md border border-border bg-muted/10 p-3 text-xs" data-testid="forms-persistence-certification-details" data-default-collapsed="true">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
              <div>
                <div className="font-medium text-foreground">Database runbook, command builder, and evidence</div>
                <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                  Expand when running the disposable Supabase/Postgres certification. Daily form work keeps the readiness summary, handoff copy, CI command, and download actions visible.
                </p>
              </div>
              <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {formPersistenceCertification.scenarioEvidence.coverage.covered}/{formPersistenceCertification.scenarioEvidence.coverage.total} scenarios
              </span>
            </summary>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="forms-persistence-certification-runbook">
              <div className="font-medium text-foreground">Disposable database runbook</div>
              <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {formPersistenceOperatorGate}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preflight gates</div>
                  <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                    {(formPersistenceCertification.preflightGates || FORM_PERSISTENCE_PREFLIGHT_GATES).map((gate) => (
                      <li key={gate} className="font-mono">{gate}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence to attach</div>
                  <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                    {(formPersistenceCertification.evidenceExpectations || FORM_PERSISTENCE_EVIDENCE_EXPECTATIONS).map((expectation) => (
                      <li key={expectation}>{expectation}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-muted/10 p-3" data-testid="forms-postgres-certification-command-builder">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">Postgres certification command builder</div>
                  <p className="mt-1 max-w-3xl text-muted-foreground">
                    Build the exact command for the disposable Forms database smoke. Database URLs stay in CI secrets or local shell env; this builder only writes aliases and target guards.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyFormApiText(formsPostgresCertificationEnvTemplate, 'Forms Postgres certification env template')}
                    disabled={isFormsBusy || !canExportForms}
                    title={!canExportForms ? exportPermissionTitle : undefined}
                    iconStart={<Copy className="size-4" />}
                    data-testid="forms-postgres-certification-env-copy-button"
                  >
                    Copy env template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyFormApiText(formsPostgresCertificationCommand, 'Forms Postgres certification command')}
                    disabled={isFormsBusy || !canExportForms}
                    title={!canExportForms ? exportPermissionTitle : undefined}
                    iconStart={<Copy className="size-4" />}
                    data-testid="forms-postgres-certification-command-builder-copy-button"
                  >
                    Copy guarded command
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Database URL alias</span>
                  <select
                    value={formsPostgresCommandOptions.databaseEnvAlias}
                    onChange={(event) => updateFormsPostgresCommandOptions({
                      databaseEnvAlias: event.target.value as FormsPostgresDatabaseEnvAlias,
                    })}
                    disabled={isFormsBusy}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="forms-postgres-certification-database-alias-select"
                  >
                    {FORMS_POSTGRES_DATABASE_ENV_ALIASES.map((alias) => (
                      <option key={alias} value={alias}>{alias}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    Store the actual Postgres URL outside Backy.
                  </span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Expected host</span>
                  <input
                    type="text"
                    value={formsPostgresCommandOptions.expectedHost}
                    onChange={(event) => updateFormsPostgresCommandOptions({ expectedHost: event.target.value })}
                    disabled={isFormsBusy}
                    placeholder="db.example.supabase.co"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="forms-postgres-certification-expected-host-input"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    Optional guard for the target database host.
                  </span>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-foreground">Expected database</span>
                  <input
                    type="text"
                    value={formsPostgresCommandOptions.expectedDatabase}
                    onChange={(event) => updateFormsPostgresCommandOptions({ expectedDatabase: event.target.value })}
                    disabled={isFormsBusy}
                    placeholder="postgres"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    data-testid="forms-postgres-certification-expected-database-input"
                  />
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    Optional guard for the database name in the URL path.
                  </span>
                </label>
                <div className="grid gap-2">
                  <label className="flex min-h-[52px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <input
                      type="checkbox"
                      checked={formsPostgresCommandOptions.disposableConfirmed}
                      onChange={(event) => updateFormsPostgresCommandOptions({ disposableConfirmed: event.target.checked })}
                      disabled={isFormsBusy}
                      className="mt-1 size-4 rounded border-border"
                      data-testid="forms-postgres-certification-disposable-toggle"
                    />
                    <span>
                      <span className="block font-semibold text-foreground">Disposable confirmed</span>
                      <span className="mt-1 block font-mono text-[10px] text-muted-foreground">BACKY_DATABASE_DISPOSABLE_CONFIRMED=true</span>
                    </span>
                  </label>
                  <label className="flex min-h-[52px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <input
                      type="checkbox"
                      checked={formsPostgresCommandOptions.includeReleaseDoctor}
                      onChange={(event) => updateFormsPostgresCommandOptions({ includeReleaseDoctor: event.target.checked })}
                      disabled={isFormsBusy}
                      className="mt-1 size-4 rounded border-border"
                      data-testid="forms-postgres-certification-doctor-toggle"
                    />
                    <span>
                      <span className="block font-semibold text-foreground">Run release doctor first</span>
                      <span className="mt-1 block font-mono text-[10px] text-muted-foreground">npm run doctor:release-certification</span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="forms-postgres-certification-env-template">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Env template</div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      Copy this into CI secrets or a local shell env file, then replace the database URL placeholder with a disposable migrated Supabase/Postgres target before running the guarded command.
                    </p>
                  </div>
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    backy.forms-postgres-certification-env-template.v1
                  </span>
                </div>
                <pre
                  className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground"
                  data-testid="forms-postgres-certification-env-template-body"
                >
                  {formsPostgresCertificationEnvTemplate}
                </pre>
              </div>
              <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-foreground p-3 text-[11px] leading-5 text-background" data-testid="forms-postgres-certification-command">
                <code>{formsPostgresCertificationCommand}</code>
              </pre>
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="forms-postgres-certification-required-inputs">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required inputs for this command</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formsPostgresCertificationRequiredInputs.map((input) => (
                    <span key={input} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {input}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-card px-3 py-2" data-testid="forms-persistence-runtime-evidence">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-foreground">Runtime evidence</div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  formPersistenceCertification.runtime?.readyForCertification
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700',
                )}>
                  {formPersistenceCertification.runtime?.readyForCertification ? 'Ready for DB smoke' : 'Needs DB smoke inputs'}
                </span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Data mode</div>
                  <div className="mt-1 font-mono text-[11px] text-foreground">{formPersistenceCertification.runtime?.dataMode || 'unknown'}</div>
                </div>
                <div className="rounded border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Database type</div>
                  <div className="mt-1 font-mono text-[11px] text-foreground">{formPersistenceCertification.runtime?.databaseType || 'unknown'}</div>
                </div>
                <div className="rounded border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">URL alias</div>
                  <div className="mt-1 font-mono text-[11px] text-foreground">
                    {formPersistenceCertification.runtime?.databaseUrlConfigured
                      ? formPersistenceCertification.runtime.databaseUrlAlias || 'configured'
                      : 'missing'}
                  </div>
                </div>
                <div className="rounded border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Disposable confirmation</div>
                  <div className="mt-1 font-mono text-[11px] text-foreground">
                    {formPersistenceCertification.runtime?.disposableConfirmed ? 'confirmed' : 'missing'}
                  </div>
                </div>
              </div>
              {formPersistenceCertification.runtime?.missing?.length ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  Missing runtime inputs: {formPersistenceCertification.runtime.missing.join(', ')}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                Database URLs and credentials are never returned; this runtime summary exposes alias/configuration state only.
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="forms-persistence-scenario-evidence">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">Persistence scenario evidence</div>
                  <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                    Tracks the non-secret form data families operators should prove in the disposable Supabase/Postgres smoke before moving Forms out of Partial.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {formPersistenceCertification.scenarioEvidence.schemaVersion}
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    formPersistenceCertification.scenarioEvidence.status === 'ready'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700',
                  )}>
                    {formPersistenceCertification.scenarioEvidence.coverage.covered}/{formPersistenceCertification.scenarioEvidence.coverage.total} scenarios
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {formPersistenceCertification.scenarioEvidence.requiredGate}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {formPersistenceCertification.scenarioEvidence.scenarios.map((scenario) => (
                  <div key={scenario.key} className="rounded-md border border-border bg-card px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-foreground">{scenario.label}</div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      )}>
                        {scenario.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {scenario.evidenceCount} evidence item{scenario.evidenceCount === 1 ? '' : 's'}
                    </div>
                    {scenario.status === 'missing' ? (
                      <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                    ) : null}
                    <div className="mt-1 break-words text-[11px] text-muted-foreground">
                      Expected: {scenario.expectedEvidence.join(' | ')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {formPersistenceCertification.scenarioEvidence.secretHandling}
              </div>
            </div>
          </details>
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

      <div id="forms-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-6">
        {[
          { label: 'Forms', value: metrics.forms, icon: FileInput },
          { label: 'Active', value: metrics.active, icon: ShieldCheck },
          { label: 'Submissions', value: metrics.submissions, icon: ClipboardList },
          { label: 'Pending', value: metrics.pending, icon: Inbox },
          { label: 'Approved', value: metrics.approved, icon: CheckCircle2 },
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

      <section className="mb-6 rounded-lg border border-border bg-card p-4" data-testid="forms-analytics-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="size-4" />
              Submission analytics
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Backend aggregates across all loaded forms for moderation, collection routing, and launch-health review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">{metrics.conversionRate}% approved</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{metrics.spamRate}% spam</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{metrics.routedToCollections} routed</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-lg border border-border bg-background p-3" data-testid="forms-analytics-trend">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-muted-foreground">Last 14 days</span>
              <span className="font-mono text-xs text-muted-foreground">{formsAnalytics?.trend.reduce((sum, point) => sum + point.total, 0) || 0} submissions</span>
            </div>
            <FormTrendBars trend={formsAnalytics?.trend || []} />
          </div>
          <div className="rounded-lg border border-border bg-background p-3" data-testid="forms-analytics-top-forms">
            <div className="mb-3 text-xs font-semibold text-muted-foreground">Top forms</div>
            <div className="grid gap-2">
              {(formsAnalytics?.forms || []).slice(0, 4).map((entry) => (
                <div key={entry.formId} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{entry.title || entry.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.pending} pending · {entry.routedToCollections} routed
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold">{entry.submissions}</div>
                </div>
              ))}
              {(!formsAnalytics || formsAnalytics.forms.length === 0) && (
                <EmptyState
                  icon={BarChart3}
                  title="No form analytics yet"
                  description="Submission, moderation, and collection-routing metrics appear after forms receive traffic."
                />
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_1fr]" data-testid="forms-lead-analytics">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Filter className="size-3.5" />
                Lead segments
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {formsAnalytics?.leads?.summary.contacts || 0} contacts
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {leadSegmentHighlights.map((segment) => (
                <div key={segment.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{segment.label}</span>
                    <span className="font-mono text-sm font-semibold">{segment.count}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {segment.formIds.length} form{segment.formIds.length === 1 ? '' : 's'} · {segment.kind}
                  </div>
                </div>
              ))}
              {leadSegmentHighlights.length === 0 && (
                <div className="sm:col-span-2">
                  <EmptyState
                    icon={Filter}
                    title="No lead segments yet"
                    description="Lead-quality segments appear after contact-sharing forms collect or route lead data."
                  />
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3" data-testid="forms-saved-list-analytics">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Save className="size-3.5" />
                Saved lead lists
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {formsAnalytics?.leads?.summary.savedLists || 0} lists
              </span>
            </div>
            <div className="grid gap-2">
              {topSavedLeadLists.map((list) => (
                <div key={list.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{list.name}</span>
                    <span className="font-mono text-sm font-semibold">{list.matchedCount}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {list.filters.status || 'all'} · {list.filters.quality || 'all'} · {list.formIds.length} form{list.formIds.length === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
              {topSavedLeadLists.length === 0 && (
                <EmptyState
                  icon={Save}
                  title="No saved lead lists yet"
                  description="Saved contact lists created from filtered lead views will appear here."
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-card p-4" data-testid="forms-audit-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" />
              Forms activity
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Request-id-backed audit events for form edits, submission review, consent retention, and reusable embed blocks.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadForms()}
            disabled={isFormsBusy}
            iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
          >
            Refresh
          </Button>
        </div>
        <div className="mt-4 grid gap-2" data-testid="forms-audit-list">
          {formsAuditLogs.length === 0 ? (
            <EmptyState
              icon={History}
              title="No form audit events yet"
              description="Form edits, submission review, consent retention, and embed-block changes will appear here."
            />
          ) : (
            formsAuditLogs.map((log) => (
              <FormAuditLogCard key={log.id} log={log} />
            ))
          )}
        </div>
      </section>

      <Panel id="forms-templates" className="mb-6 scroll-mt-24">
        <PanelHeader
          title="Form templates"
          description="Start from a blank standalone form or copy complete schemas for registration, contact, newsletter, and product inquiry experiences."
          icon={<Sparkles className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={downloadFormTemplatePack}
                disabled={isFormsBusy || !canExportForms}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Download className="size-4" />}
                data-testid="forms-template-pack-download-button"
              >
                Download templates
              </Button>
              <Button
                variant="primary"
                onClick={() => void createBlankStandaloneForm()}
                disabled={isFormsBusy || !canCreateForms}
                title={formsCreateDisabledReason || undefined}
                aria-describedby={formsCreateActionStatusId}
                iconStart={<Plus className="size-4" />}
                data-action-state={formsCreateDisabledReason ? 'blocked' : 'ready'}
                data-action-status={formsCreateActionStatus}
                data-disabled-reason={formsCreateDisabledReason || undefined}
                data-target-site-id={activeSiteId}
                data-testid="forms-template-create-blank-button"
              >
                {isCreatingTemplateId === 'blank' ? 'Creating...' : 'New blank form'}
              </Button>
            </div>
          }
        />
        <PanelContent>
          {frontendFormTemplates.length > 0 || frontendDesignLoading || frontendDesignError ? (
            <div className="mb-5 rounded-lg border border-teal-200 bg-teal-50/50 p-4" data-testid="forms-frontend-template-options">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Frontend design forms</h3>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                    Create forms from the connected frontend contract while preserving template source, bindings, route pattern, and field intent.
                  </p>
                </div>
                <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-teal-700">
                  {frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend contract'}
                </span>
              </div>
              {frontendDesignLoading ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="size-3.5 animate-spin" />
                  Loading captured form templates...
                </div>
              ) : null}
              {frontendDesignError ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" />
                  {frontendDesignError}
                </div>
              ) : null}
              {frontendTemplateBlueprints.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {frontendTemplateBlueprints.map(({ template, blueprint }) => {
                    const settings = buildFrontendFormTemplateSettings(template, frontendDesign, blueprint.frontendFieldKeyMap);
                    const collectionBackedTemplateUnavailable = Boolean(blueprint.collectionTarget?.enabled && !canUseCollectionTargets);
                    const createFrontendTemplateTitle = !canCreateForms
                      ? createPermissionTitle
                      : collectionBackedTemplateUnavailable
                        ? collectionTargetUnavailableReason || undefined
                        : undefined;
                    const createFrontendTemplateDisabledReason = formsCreateDisabledReason || (
                      collectionBackedTemplateUnavailable ? collectionTargetUnavailableReason || 'Template collection routing is unavailable.' : ''
                    );
                    const createFrontendTemplateActionStatus = formCreateActionStatus(`${template.name} form`, createFrontendTemplateDisabledReason);
                    const manifestText = JSON.stringify({
                      schemaVersion: 'backy.frontend-form-template.v1',
                      template,
                      form: buildTemplateManifest(blueprint),
                      settings,
                    }, null, 2);

                    return (
                      <div
                        key={template.id}
                        className={cn(
                          'rounded-lg border bg-background p-4',
                          activeFrontendTemplateId === template.id
                            ? 'border-teal-600 ring-1 ring-teal-600'
                            : 'border-teal-200',
                        )}
                        data-active={activeFrontendTemplateId === template.id ? 'true' : 'false'}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">{template.name}</h4>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description || blueprint.description}</p>
                          </div>
                          <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700">
                            {blueprint.fields.length} fields
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{blueprint.moderationMode}</span>
                          <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {template.bindingHints?.length || 0} bindings
                          </span>
                          {template.routePattern ? (
                            <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.routePattern}</span>
                          ) : null}
                        </div>
                        <div className="mt-4 space-y-2">
                          {blueprint.fields.slice(0, 4).map((field) => (
                            <div key={field.key} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/40 px-2.5 py-2">
                              <span className="truncate text-xs font-medium text-foreground">{field.label}</span>
                              <span className="shrink-0 rounded bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{field.type}</span>
                            </div>
                          ))}
                          {blueprint.fields.length > 4 ? (
                            <div className="text-xs text-muted-foreground">+{blueprint.fields.length - 4} more field{blueprint.fields.length - 4 === 1 ? '' : 's'}</div>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void createFormFromFrontendTemplate(template, blueprint)}
                            disabled={isFormsBusy || !canCreateForms || collectionBackedTemplateUnavailable}
                            title={createFrontendTemplateDisabledReason || createFrontendTemplateTitle}
                            aria-describedby={formsCreateActionStatusId}
                            iconStart={<FileInput className="size-4" />}
                            data-action-state={createFrontendTemplateDisabledReason ? 'blocked' : 'ready'}
                            data-action-status={createFrontendTemplateActionStatus}
                            data-disabled-reason={createFrontendTemplateDisabledReason || undefined}
                            data-target-site-id={activeSiteId}
                            data-testid={`forms-frontend-template-${template.id}`}
                          >
                            {isCreatingTemplateId === `frontend:${template.id}` ? 'Creating...' : 'Create form'}
                          </Button>
                          {collectionBackedTemplateUnavailable ? (
                            <span className="basis-full text-xs text-amber-700" data-testid={`forms-frontend-template-${template.id}-disabled-reason`}>
                              {collectionTargetUnavailableReason}
                            </span>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copyFormApiText(manifestText, `${template.name} frontend form template`)}
                            disabled={isFormsBusy}
                            iconStart={<Copy className="size-4" />}
                          >
                            Copy schema
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !frontendDesignLoading && !frontendDesignError ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  The current frontend contract has no form templates yet.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {FORM_TEMPLATES.map((template) => {
              const templateManifest = buildTemplateManifest(template);
              const templateText = JSON.stringify(templateManifest, null, 2);
              const payloadText = JSON.stringify(templateManifest.samplePayload, null, 2);
              const collectionBackedTemplateUnavailable = Boolean(template.collectionTarget?.enabled && !canUseCollectionTargets);
              const createTemplateTitle = !canCreateForms
                ? createPermissionTitle
                : collectionBackedTemplateUnavailable
                  ? collectionTargetUnavailableReason || undefined
                  : undefined;
              const createTemplateDisabledReason = formsCreateDisabledReason || (
                collectionBackedTemplateUnavailable ? collectionTargetUnavailableReason || 'Template collection routing is unavailable.' : ''
              );
              const createTemplateActionStatus = formCreateActionStatus(`${template.title} form`, createTemplateDisabledReason);

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
                      disabled={isFormsBusy || !canCreateForms || collectionBackedTemplateUnavailable}
                      title={createTemplateDisabledReason || createTemplateTitle}
                      aria-describedby={formsCreateActionStatusId}
                      iconStart={<FileInput className="size-4" />}
                      data-action-state={createTemplateDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={createTemplateActionStatus}
                      data-disabled-reason={createTemplateDisabledReason || undefined}
                      data-target-site-id={activeSiteId}
                    >
                      {isCreatingTemplateId === template.id ? 'Creating...' : 'Create form'}
                    </Button>
                    {collectionBackedTemplateUnavailable ? (
                      <span className="basis-full text-xs text-amber-700" data-testid={`forms-template-${template.id}-disabled-reason`}>
                        {collectionTargetUnavailableReason}
                      </span>
                    ) : null}
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
          description="Create a standalone form for custom frontends, or start from a page template that includes a form block."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => void createBlankStandaloneForm()}
                disabled={isFormsBusy || !canCreateForms}
                title={formsCreateDisabledReason || undefined}
                aria-describedby={formsCreateActionStatusId}
                iconStart={<Plus className="size-4" />}
                data-action-state={formsCreateDisabledReason ? 'blocked' : 'ready'}
                data-action-status={formsCreateActionStatus}
                data-disabled-reason={formsCreateDisabledReason || undefined}
                data-target-site-id={activeSiteId}
                data-testid="forms-empty-create-blank-button"
              >
                New blank form
              </Button>
              <Button
                variant="outline"
                onClick={() => openFormPageTemplate('registration')}
                disabled={isFormsBusy}
                iconStart={<Sparkles className="size-4" />}
              >
                Create registration page
              </Button>
            </div>
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
                  <div>
                    <EmptyState
                      icon={ClipboardList}
                      title="No forms match this library view"
                      description="Change the search, source, state, destination, or readiness filters to broaden the form library."
                      action={hasActiveFormFilters ? (
                        <Button variant="outline" onClick={clearFormFilters} disabled={isFormsBusy}>
                          Clear form filters
                        </Button>
                      ) : undefined}
                    />
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
                    <div
                      className="flex flex-wrap items-center gap-2"
                      role="group"
                      aria-label={`Actions for ${selectedForm.title || selectedForm.name}`}
                      aria-describedby={selectedFormActionStatusId}
                      data-testid="forms-selected-action-group"
                      data-action-status={selectedFormActionStatus}
                    >
                      <span id={selectedFormActionStatusId} className="sr-only" data-testid="forms-selected-action-status">
                        {selectedFormActionStatus}
                      </span>
                      {selectedForm.pageId && (
                        <Link
                          to="/pages/$pageId/edit"
                          params={{ pageId: selectedForm.pageId }}
                          search={activeSiteSearch}
                          aria-disabled={Boolean(selectedFormPageDisabledReason)}
                          aria-describedby={selectedFormActionStatusId}
                          aria-label={`Open source page for ${selectedForm.title || selectedForm.name}`}
                          data-action-state={selectedFormPageDisabledReason ? 'blocked' : 'ready'}
                          data-disabled-reason={selectedFormPageDisabledReason || undefined}
                          data-testid="form-page-link"
                          onClick={(event) => {
                            if (selectedFormPageDisabledReason) {
                              event.preventDefault();
                            }
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted',
                            selectedFormPageDisabledReason && 'pointer-events-none opacity-60',
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
                          aria-disabled={Boolean(selectedFormBlogDisabledReason)}
                          aria-describedby={selectedFormActionStatusId}
                          aria-label={`Open source blog post for ${selectedForm.title || selectedForm.name}`}
                          data-action-state={selectedFormBlogDisabledReason ? 'blocked' : 'ready'}
                          data-disabled-reason={selectedFormBlogDisabledReason || undefined}
                          data-testid="form-blog-link"
                          onClick={(event) => {
                            if (selectedFormBlogDisabledReason) {
                              event.preventDefault();
                            }
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted',
                            selectedFormBlogDisabledReason && 'pointer-events-none opacity-60',
                          )}
                        >
                          <ExternalLink className="size-4" />
                          Blog
                        </Link>
                      )}
                      <StatusBadge status={selectedForm.audience} type="info" />
                      <Button
                        variant="outline"
                        onClick={() => void handleCloneSelectedForm()}
                        disabled={Boolean(selectedFormCloneDisabledReason)}
                        title={selectedFormCloneDisabledReason || undefined}
                        aria-describedby={selectedFormActionStatusId}
                        aria-label={`Clone ${selectedForm.title || selectedForm.name}`}
                        data-action-state={selectedFormCloneDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={selectedFormCloneDisabledReason || undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="form-clone-button"
                      >
                        {isCloningForm ? 'Cloning...' : 'Clone'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={requestDeleteSelectedForm}
                        disabled={Boolean(selectedFormDeleteDisabledReason)}
                        title={selectedFormDeleteDisabledReason || undefined}
                        aria-describedby={selectedFormActionStatusId}
                        aria-label={`Delete ${selectedForm.title || selectedForm.name}`}
                        data-action-state={selectedFormDeleteDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={selectedFormDeleteDisabledReason || undefined}
                        iconStart={<Trash2 className="size-4" />}
                        data-testid="form-delete-button"
                      >
                        Delete
                      </Button>
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
                            onClick={() => {
                              setFormDraft(cloneFormDefinition(selectedForm));
                              setFormDraftSubmitted(false);
                            }}
                            disabled={isFormsBusy || !formDraftDirty || !canEditForms}
                            title={!canEditForms ? editPermissionTitle : undefined}
                          >
                            Reset
                          </Button>
                          <Button
                            onClick={() => void saveFormDraft()}
                            disabled={isFormsBusy || !selectedFormIsStandalone || !formDraftDirty || !canEditForms}
                            title={!canEditForms ? editPermissionTitle : undefined}
                            iconStart={<Save className="size-4" />}
                            data-testid="form-builder-save-button"
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

                      <fieldset
                        disabled={isFormsBusy || !selectedFormIsStandalone || !canEditForms}
                        title={!canEditForms ? editPermissionTitle : undefined}
                        className="mt-4 grid gap-4 disabled:opacity-60"
                      >
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
                              className={formDraftInputClassName(
                                'form-builder-name',
                                'min-h-10 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
                              )}
                              data-testid="form-builder-name-input"
                              {...formDraftErrorProps('form-builder-name')}
                            />
                            <FormBuilderInlineError
                              id="form-builder-name-error"
                              error={formDraftInlineError('form-builder-name')}
                              testId="form-builder-name-error"
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
                              className={formDraftInputClassName(
                                'form-builder-success-redirect',
                                'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
                              )}
                              data-testid="form-builder-success-redirect-input"
                              {...formDraftErrorProps('form-builder-success-redirect')}
                            />
                            <FormBuilderInlineError
                              id="form-builder-success-redirect-error"
                              error={formDraftInlineError('form-builder-success-redirect')}
                              testId="form-builder-success-redirect-error"
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Notification email
                            <input
                              type="email"
                              value={formDraft.notificationEmail || ''}
                              onChange={(event) => patchFormDraft({ notificationEmail: event.target.value })}
                              placeholder="leads@example.com"
                              data-testid="form-notification-email-input"
                              className={formDraftInputClassName(
                                'form-builder-notification-email',
                                'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
                              )}
                              {...formDraftErrorProps('form-builder-notification-email')}
                            />
                            <FormBuilderInlineError
                              id="form-builder-notification-email-error"
                              error={formDraftInlineError('form-builder-notification-email')}
                              testId="form-builder-notification-email-error"
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium">
                            Webhook URL
                            <input
                              type="url"
                              value={formDraft.notificationWebhook || ''}
                              onChange={(event) => patchFormDraft({ notificationWebhook: event.target.value })}
                              placeholder="https://example.com/backy/forms"
                              data-testid="form-notification-webhook-input"
                              className={formDraftInputClassName(
                                'form-builder-notification-webhook',
                                'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
                              )}
                              {...formDraftErrorProps('form-builder-notification-webhook')}
                            />
                            <FormBuilderInlineError
                              id="form-builder-notification-webhook-error"
                              error={formDraftInlineError('form-builder-notification-webhook')}
                              testId="form-builder-notification-webhook-error"
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
                            Captcha provider
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
                          <label
                            className={cn(
                              'flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium',
                              (!canEditForms || (!formDraft.collectionTarget?.enabled && !canUseCollectionTargets)) && 'opacity-70',
                            )}
                            title={!canEditForms ? editPermissionTitle : collectionTargetUnavailableReason || undefined}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(formDraft.collectionTarget?.enabled)}
                              disabled={!canEditForms || (!formDraft.collectionTarget?.enabled && !canUseCollectionTargets)}
                              data-testid="form-collection-write-toggle"
                              onChange={(event) => {
                                const selectedCollection = formDraftTargetCollectionWritable
                                  ? formDraftTargetCollection
                                  : writableCollections[0];
                                patchFormDraftCollectionTarget({
                                  enabled: event.target.checked,
                                  collectionId: formDraftTargetCollectionWritable
                                    ? formDraft.collectionTarget?.collectionId || selectedCollection?.id || ''
                                    : selectedCollection?.id || '',
                                  slugField: formDraft.collectionTarget?.slugField || formDraft.fields[0]?.key,
                                  fieldMap: formDraft.collectionTarget?.fieldMap || buildDefaultCollectionFieldMap(formDraft, selectedCollection),
                                });
                              }}
                            />
                            Collection write
                          </label>
                        </div>
                        {collectionTargetUnavailableReason ? (
                          <div
                            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                            data-testid="form-collection-target-disabled-reason"
                          >
                            {collectionTargetUnavailableReason}
                          </div>
                        ) : null}

                        {formDraft.contactShare?.enabled && (
                          <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="form-contact-share-panel">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold">Contact share mapping</h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Choose which submitted fields create or update the private contact profile after approval.
                                </p>
                              </div>
                              <span className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-semibold',
                                formDraft.contactShare.emailField || formDraft.contactShare.phoneField
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700',
                              )}
                              >
                                {formDraft.contactShare.emailField || formDraft.contactShare.phoneField
                                  ? 'identity mapped'
                                  : 'needs identity'}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              {([
                                ['nameField', 'Name field'],
                                ['emailField', 'Email field'],
                                ['phoneField', 'Phone field'],
                                ['notesField', 'Notes field'],
                              ] as const).map(([key, label]) => (
                                <label key={key} className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                  {label}
                                  <select
                                    value={formDraft.contactShare?.[key] || ''}
                                    onChange={(event) => patchFormDraftContactShare({ [key]: event.target.value || undefined })}
                                    disabled={!canEditForms}
                                    className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                    aria-label={`Contact share ${label.toLowerCase()}`}
                                    data-testid={`form-contact-share-${key}`}
                                  >
                                    <option value="">Do not share</option>
                                    {formDraft.fields.map((field) => (
                                      <option key={field.key} value={field.key}>
                                        {field.label} ({field.key})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                            <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={Boolean(formDraft.contactShare.emailField) && formDraft.contactShare.dedupeByEmail !== false}
                                onChange={(event) => patchFormDraftContactShare({ dedupeByEmail: event.target.checked })}
                                disabled={!canEditForms || !formDraft.contactShare.emailField}
                                data-testid="form-contact-share-dedupe-toggle"
                                className="mt-1 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                              <span>
                                Dedupe contacts by email
                                <span className="block text-xs font-normal leading-5 text-muted-foreground">
                                  When enabled, approved submissions update an existing private contact with the same email instead of creating duplicates.
                                </span>
                              </span>
                            </label>
	                            {!formDraft.contactShare.emailField && !formDraft.contactShare.phoneField ? (
	                              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
	                                Map an email or phone field before relying on contact creation.
	                              </div>
	                            ) : null}
                            <FormBuilderInlineError
                              id="form-builder-contact-share-error"
                              error={formDraftInlineError('form-builder-contact-share')}
                              testId="form-builder-contact-share-error"
                            />
	                          </div>
	                        )}

                        <div data-testid="form-spam-settings-panel" className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">Spam controls</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Tune timing, rate-limit, duplicate, and blocked-term rules for this public form.
                              </p>
                            </div>
                            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                              API enforced
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="grid gap-1.5 text-sm font-medium">
                              Min fill ms
                              <input
                                type="number"
                                min={0}
                                max={120000}
                                value={readFormSpamSettings(formDraft).minFillMs}
	                                onChange={(event) => patchFormDraftSpamSettings({ minFillMs: Number(event.target.value) })}
	                                data-testid="form-spam-min-fill-ms-input"
	                                className={formDraftInputClassName(
	                                  'form-builder-spam-min-fill-ms',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-spam-min-fill-ms')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-spam-min-fill-ms-error"
                                error={formDraftInlineError('form-builder-spam-min-fill-ms')}
                                testId="form-builder-spam-min-fill-ms-error"
                              />
	                            </label>
                            <label className="grid gap-1.5 text-sm font-medium">
                              Rate window sec
                              <input
                                type="number"
                                min={1}
                                max={86400}
                                value={Math.round(readFormSpamSettings(formDraft).rateLimitWindowMs / 1000)}
	                                onChange={(event) => patchFormDraftSpamSettings({ rateLimitWindowMs: Number(event.target.value) * 1000 })}
	                                data-testid="form-spam-rate-window-seconds-input"
	                                className={formDraftInputClassName(
	                                  'form-builder-spam-rate-window',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-spam-rate-window')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-spam-rate-window-error"
                                error={formDraftInlineError('form-builder-spam-rate-window')}
                                testId="form-builder-spam-rate-window-error"
                              />
	                            </label>
                            <label className="grid gap-1.5 text-sm font-medium">
                              Max submissions
                              <input
                                type="number"
                                min={1}
                                max={1000}
                                value={readFormSpamSettings(formDraft).rateLimitMax}
	                                onChange={(event) => patchFormDraftSpamSettings({ rateLimitMax: Number(event.target.value) })}
	                                data-testid="form-spam-rate-limit-max-input"
	                                className={formDraftInputClassName(
	                                  'form-builder-spam-rate-limit-max',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-spam-rate-limit-max')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-spam-rate-limit-max-error"
                                error={formDraftInlineError('form-builder-spam-rate-limit-max')}
                                testId="form-builder-spam-rate-limit-max-error"
                              />
	                            </label>
                            <label className="grid gap-1.5 text-sm font-medium">
                              Duplicate window sec
                              <input
                                type="number"
                                min={1}
                                max={86400}
                                value={Math.round(readFormSpamSettings(formDraft).duplicateWindowMs / 1000)}
	                                onChange={(event) => patchFormDraftSpamSettings({ duplicateWindowMs: Number(event.target.value) * 1000 })}
	                                data-testid="form-spam-duplicate-window-seconds-input"
	                                className={formDraftInputClassName(
	                                  'form-builder-spam-duplicate-window',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-spam-duplicate-window')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-spam-duplicate-window-error"
                                error={formDraftInlineError('form-builder-spam-duplicate-window')}
                                testId="form-builder-spam-duplicate-window-error"
                              />
	                            </label>
                          </div>
                          <label className="mt-3 grid gap-1.5 text-sm font-medium">
                            Blocked terms
                            <textarea
                              value={readFormSpamSettings(formDraft).blockedTerms.join('\n')}
                              onChange={(event) => patchFormDraftSpamSettings({ blockedTerms: parseLines(event.target.value).slice(0, 100) })}
                              rows={3}
                              data-testid="form-spam-blocked-terms-input"
                              placeholder="One term per line"
                              className="min-h-24 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                        </div>

                        <div data-testid="form-consent-settings-panel" className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">Consent retention</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Control how consent evidence appears in exports and when it should be reviewed or deleted.
                              </p>
                            </div>
                            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                              Export enforced
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="grid gap-1.5 text-sm font-medium">
                              Retain for days
                              <input
                                type="number"
                                min={0}
                                max={3650}
                                value={readFormConsentSettings(formDraft).retentionDays}
                                onChange={(event) => patchFormDraftConsentSettings({ retentionDays: Number(event.target.value) })}
                                data-testid="form-consent-retention-days-input"
                                className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                              />
                            </label>
                            <label className="grid gap-1.5 text-sm font-medium">
                              Delete after days
                              <input
                                type="number"
                                min={0}
                                max={3650}
                                value={readFormConsentSettings(formDraft).deleteAfterDays}
	                                onChange={(event) => patchFormDraftConsentSettings({ deleteAfterDays: Number(event.target.value) })}
	                                data-testid="form-consent-delete-after-days-input"
	                                className={formDraftInputClassName(
	                                  'form-builder-consent-delete-after-days',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-consent-delete-after-days')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-consent-delete-after-days-error"
                                error={formDraftInlineError('form-builder-consent-delete-after-days')}
                                testId="form-builder-consent-delete-after-days-error"
                              />
	                            </label>
                            <label className="grid gap-1.5 text-sm font-medium xl:col-span-2">
                              Privacy request email
                              <input
                                type="email"
                                value={readFormConsentSettings(formDraft).requestEmail || ''}
	                                onChange={(event) => patchFormDraftConsentSettings({ requestEmail: event.target.value })}
	                                data-testid="form-consent-request-email-input"
	                                placeholder="privacy@example.com"
	                                className={formDraftInputClassName(
	                                  'form-builder-consent-request-email',
	                                  'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring',
	                                )}
	                                {...formDraftErrorProps('form-builder-consent-request-email')}
	                              />
                              <FormBuilderInlineError
                                id="form-builder-consent-request-email-error"
                                error={formDraftInlineError('form-builder-consent-request-email')}
                                testId="form-builder-consent-request-email-error"
                              />
	                            </label>
                          </div>
                          <label className="mt-3 grid gap-1.5 text-sm font-medium">
                            Policy label
                            <input
                              type="text"
                              value={readFormConsentSettings(formDraft).policyLabel}
                              onChange={(event) => patchFormDraftConsentSettings({ policyLabel: event.target.value })}
                              data-testid="form-consent-policy-label-input"
                              className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                            />
                          </label>
                          <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={readFormConsentSettings(formDraft).exportIncludesIp}
                              onChange={(event) => patchFormDraftConsentSettings({ exportIncludesIp: event.target.checked })}
                              data-testid="form-consent-export-ip-toggle"
                              className="mt-1"
                            />
                            <span>
                              Include IP hash and user-agent in consent exports
                              <span className="block text-xs font-normal leading-5 text-muted-foreground">
                                Turn off when exports should be privacy-minimized for routine audits.
                              </span>
                            </span>
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
                                formDraftTargetCollectionWritable
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700',
                              )}
                              >
                                {formDraftTargetCollectionWritable
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
                                    const nextCollection = writableCollections.find((collection) => collection.id === event.target.value);
                                    patchFormDraftCollectionTarget({
                                      collectionId: event.target.value,
                                      fieldMap: buildDefaultCollectionFieldMap(formDraft, nextCollection),
                                    });
	                                  }}
	                                  disabled={!canEditForms || !canUseCollectionTargets}
	                                  className={formDraftInputClassName(
	                                    'form-builder-collection-target',
	                                    'min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60',
	                                  )}
	                                  aria-label="Collection target collection"
	                                  {...formDraftErrorProps('form-builder-collection-target')}
	                                >
                                  <option value="">Select collection</option>
                                  {formDraftTargetCollection && !formDraftTargetCollectionWritable ? (
                                    <option value={formDraftTargetCollection.id}>
                                      {formDraftTargetCollection.name} (not public-create)
                                    </option>
                                  ) : null}
                                  {writableCollections.map((collection) => (
                                    <option key={collection.id} value={collection.id}>
                                      {collection.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                Slug source field
                                <select
                                  value={formDraft.collectionTarget.slugField || ''}
                                  onChange={(event) => patchFormDraftCollectionTarget({ slugField: event.target.value || undefined })}
                                  disabled={!canEditForms || !formDraftTargetCollectionWritable}
                                  className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Collection target slug field"
                                >
                                  <option value="">Auto generated</option>
                                  {formDraft.fields.map((field) => (
                                    <option key={field.key} value={field.key}>{field.label} ({field.key})</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            {formDraftTargetCollectionWritable && formDraftTargetCollection ? (
                              <div className="mt-3 grid gap-2">
                                {formDraft.fields.map((field) => (
                                  <label key={field.key} className="grid gap-1.5 rounded-lg border border-border bg-card p-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(140px,0.8fr)_minmax(180px,1fr)] sm:items-center">
                                    <span>{field.label} <span className="font-mono font-normal">({field.key})</span></span>
                                    <select
                                      value={formDraft.collectionTarget?.fieldMap?.[field.key] || ''}
                                      onChange={(event) => {
                                        const fieldMap = { ...(formDraft.collectionTarget?.fieldMap || {}) };
                                        if (event.target.value) {
                                          fieldMap[field.key] = event.target.value;
                                        } else {
                                          delete fieldMap[field.key];
                                        }
                                        patchFormDraftCollectionTarget({ fieldMap });
                                      }}
                                      disabled={!canEditForms}
                                      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
	                                {collectionTargetUnavailableReason || 'Select a published public-create collection before mapping writes.'}
	                              </div>
	                            )}
                            <FormBuilderInlineError
                              id="form-builder-collection-target-error"
                              error={formDraftInlineError('form-builder-collection-target')}
                              testId="form-builder-collection-target-error"
                            />
	                          </div>
	                        )}

                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">Fields</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Keys drive API payloads, contact mapping, and collection writes. Keep them stable after launch.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="sr-only" htmlFor="form-new-field-type">Field type</label>
                              <select
                                id="form-new-field-type"
                                value={newFormFieldType}
                                onChange={(event) => setNewFormFieldType(event.target.value as FormFieldType)}
                                disabled={!canEditForms}
                                className="min-h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label="New form field type"
                                data-testid="form-new-field-type-select"
                              >
                                {FORM_FIELD_TYPES.map((type) => (
                                  <option key={type} value={type}>{FORM_FIELD_TYPE_LABELS[type]}</option>
                                ))}
                              </select>
                              <Button size="sm" variant="outline" onClick={() => addFormDraftField()} disabled={!canEditForms} title={!canEditForms ? editPermissionTitle : undefined} iconStart={<Plus className="size-4" />}>
                                Add field
                              </Button>
	                            </div>
	                          </div>
                          <FormBuilderInlineError
                            id="form-builder-fields-error"
                            error={formDraftInlineError('form-builder-fields')}
                            testId="form-builder-fields-error"
                          />
	                          <div className="mt-3 grid gap-3">
	                            {formDraft.fields.map((field, fieldIndex) => {
	                              const fieldType = normalizeFormFieldType(field.type);
	                              const fieldValidationRuleDefinitions = getFormFieldValidationRuleDefinitions(fieldType);
	                              const fieldValidationCount = normalizeValidationRules({ ...field, type: fieldType })?.length || 0;
                              const fieldKeyErrorKey = `form-builder-field-${fieldIndex}-key`;
                              const fieldLabelErrorKey = `form-builder-field-${fieldIndex}-label`;
                              const fieldDefaultErrorKey = `form-builder-field-${fieldIndex}-default`;
                              const fieldOptionsErrorKey = `form-builder-field-${fieldIndex}-options`;
                              const fieldValidationErrorKey = `form-builder-field-${fieldIndex}-validation`;

	                              return (
	                                <div key={`${field.key}-${fieldIndex}`} className="rounded-lg border border-border bg-card p-3">
	                                <div className="grid gap-3 xl:grid-cols-[minmax(120px,0.8fr)_minmax(140px,1fr)_140px_110px_auto]">
	                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Key
	                                    <input
	                                      value={field.key}
	                                      onChange={(event) => patchFormDraftField(fieldIndex, { key: normalizeFieldKey(event.target.value) })}
	                                      className={formDraftInputClassName(
	                                        fieldKeyErrorKey,
	                                        'min-h-10 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring',
	                                      )}
                                        data-testid={`form-builder-field-${fieldIndex}-key-input`}
                                        {...formDraftErrorProps(fieldKeyErrorKey)}
	                                    />
                                    <FormBuilderInlineError
                                      id={`${fieldKeyErrorKey}-error`}
                                      error={formDraftInlineError(fieldKeyErrorKey)}
                                      testId={`${fieldKeyErrorKey}-error`}
                                    />
	                                  </label>
	                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
	                                    Label
	                                    <input
	                                      value={field.label}
	                                      onChange={(event) => patchFormDraftField(fieldIndex, { label: event.target.value })}
	                                      className={formDraftInputClassName(
	                                        fieldLabelErrorKey,
	                                        'min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring',
	                                      )}
                                        data-testid={`form-builder-field-${fieldIndex}-label-input`}
                                        {...formDraftErrorProps(fieldLabelErrorKey)}
	                                    />
                                    <FormBuilderInlineError
                                      id={`${fieldLabelErrorKey}-error`}
                                      error={formDraftInlineError(fieldLabelErrorKey)}
                                      testId={`${fieldLabelErrorKey}-error`}
                                    />
	                                  </label>
                                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Type
                                    <select
                                      value={field.type}
                                      onChange={(event) => patchFormDraftFieldType(fieldIndex, event.target.value as FormFieldType)}
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
                                      onClick={() => duplicateFormDraftField(fieldIndex)}
                                      disabled={!canEditForms}
                                      title={!canEditForms ? editPermissionTitle : undefined}
                                      iconStart={<Copy className="size-4" />}
                                      aria-label={`Duplicate ${field.label}`}
                                      data-testid="form-field-duplicate-button"
                                    >
                                      Duplicate
                                    </Button>
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
                                <div className="mt-3 grid gap-3 lg:grid-cols-4">
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
                                    Default value
                                    {field.type === 'select' || field.type === 'radio' ? (
                                      <select
                                        value={field.defaultValue || ''}
	                                        onChange={(event) => patchFormDraftField(fieldIndex, { defaultValue: event.target.value || undefined })}
	                                        data-testid="form-field-default-value-input"
	                                        className={formDraftInputClassName(
	                                          fieldDefaultErrorKey,
	                                          'min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring',
	                                        )}
                                          {...formDraftErrorProps(fieldDefaultErrorKey)}
	                                      >
                                        <option value="">No default</option>
                                        {(field.options || []).map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        value={field.defaultValue || ''}
                                        onChange={(event) => patchFormDraftField(fieldIndex, { defaultValue: event.target.value })}
	                                        placeholder={field.options?.[0] || field.placeholder || 'Optional default'}
	                                        data-testid="form-field-default-value-input"
	                                        className={formDraftInputClassName(
	                                          fieldDefaultErrorKey,
	                                          'min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring',
	                                        )}
                                          {...formDraftErrorProps(fieldDefaultErrorKey)}
	                                      />
	                                    )}
                                    <FormBuilderInlineError
                                      id={`${fieldDefaultErrorKey}-error`}
                                      error={formDraftInlineError(fieldDefaultErrorKey)}
                                      testId={`${fieldDefaultErrorKey}-error`}
                                    />
	                                  </label>
	                                  {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') ? (
	                                    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
	                                      Options
	                                      <input
	                                        value={(field.options || []).join(', ')}
	                                        onChange={(event) => patchFormDraftFieldOptions(fieldIndex, parseOptionsText(event.target.value))}
	                                        placeholder="Option one, Option two"
	                                        className={formDraftInputClassName(
	                                          fieldOptionsErrorKey,
	                                          'min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring',
	                                        )}
                                          data-testid={`form-builder-field-${fieldIndex}-options-input`}
                                          {...formDraftErrorProps(fieldOptionsErrorKey)}
	                                      />
                                      <FormBuilderInlineError
                                        id={`${fieldOptionsErrorKey}-error`}
                                        error={formDraftInlineError(fieldOptionsErrorKey)}
                                        testId={`${fieldOptionsErrorKey}-error`}
                                      />
	                                    </label>
	                                  ) : null}
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
                                      {fieldValidationCount} active
                                    </span>
                                  </div>
                                  {fieldValidationRuleDefinitions.length > 0 ? (
                                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                                      {fieldValidationRuleDefinitions.map((ruleDefinition) => {
                                        const rule = getValidationRule(field, ruleDefinition.type);
                                        const value = rule?.value ?? '';
                                        const ruleHasValue = formValidationRuleHasValue(rule);
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
                                                  disabled={!ruleHasValue}
                                                  onChange={(event) => patchFormDraftFieldValidation(fieldIndex, ruleDefinition.type, {
                                                    message: event.target.value,
                                                  })}
                                                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                                  aria-label={`${field.label} ${ruleDefinition.label} message`}
                                                />
                                              </label>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
	                                  ) : (
	                                    <div
                                      className="mt-3 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground"
                                      data-testid="form-field-validation-unavailable"
                                    >
                                      No configurable validation rules for this field type.
	                                    </div>
	                                  )}
                                  <FormBuilderInlineError
                                    id={`${fieldValidationErrorKey}-error`}
                                    error={formDraftInlineError(fieldValidationErrorKey)}
                                    testId={`${fieldValidationErrorKey}-error`}
                                  />
	                                </div>
	                              </div>
                              );
                            })}
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

                  <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4" data-testid="forms-launch-readiness">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">Form launch readiness</h3>
                          <span className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                            selectedFormLaunchReadiness.status === 'ready'
                              ? 'bg-emerald-50 text-emerald-700'
                              : selectedFormLaunchReadiness.status === 'attention'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-destructive/10 text-destructive',
                          )}
                          >
                            {selectedFormLaunchReadiness.status}
                          </span>
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Copy the selected form contract for custom frontends, generated pages, embed blocks, and launch reviews without including private submission values.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {selectedFormLaunchReadiness.schemaVersion}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyFormApiText(selectedFormLaunchReadinessText, 'Form launch readiness handoff')}
                          disabled={isFormsBusy || !canExportForms}
                          title={!canExportForms ? exportPermissionTitle : undefined}
                          iconStart={<Copy className="size-4" />}
                          data-testid="forms-launch-readiness-copy-button"
                        >
                          Copy launch JSON
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Selected form</div>
                        <div className="mt-1 truncate font-semibold text-foreground">
                          {selectedFormLaunchReadiness.form?.title || 'No form selected'}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Public API</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {selectedFormLaunchReadiness.endpoints.definition ? 'Definition + submit' : 'Unavailable'}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Routing</div>
                        <div className="mt-1 truncate font-semibold text-foreground">
                          {[
                            selectedFormLaunchReadiness.routing.contactShareEnabled ? 'contacts' : null,
                            selectedFormLaunchReadiness.routing.collectionWriteEnabled ? 'collections' : null,
                            selectedFormLaunchReadiness.routing.notificationWebhookConfigured ? 'webhook' : null,
                            selectedFormLaunchReadiness.routing.notificationEmailConfigured ? 'email' : null,
                          ].filter(Boolean).join(' + ') || 'inbox only'}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Launch score</div>
                        <div className="mt-1 font-semibold text-foreground">{selectedFormLaunchReadiness.score}%</div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'mt-3 rounded-lg border px-3 py-2 text-xs',
                        selectedFormLaunchReadiness.actionPlan.blockers.length
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : selectedFormLaunchReadiness.actionPlan.attention.length
                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                      )}
                      data-testid="forms-launch-readiness-action-plan"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">Next action: {selectedFormLaunchReadiness.actionPlan.nextAction.replace(/-/g, ' ')}</span>
                        <span className="font-mono text-[11px]">{selectedFormLaunchReadiness.actionPlan.schemaVersion}</span>
                      </div>
                      <div className="mt-1 leading-5">{selectedFormLaunchReadiness.actionPlan.recommendation}</div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {selectedFormLaunchReadiness.checks.map((check) => (
                        <FormLaunchReadinessCheckCard key={check.key} check={check} />
                      ))}
                    </div>

                    <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground">Next steps</div>
                      <div className="mt-1 leading-5">{selectedFormLaunchReadiness.nextSteps.join(' ')}</div>
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
                          disabled={isFormsBusy || !canExportForms}
                          title={!canExportForms ? exportPermissionTitle : undefined}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy manifest
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleCreateEmbedBlock()}
                          disabled={isFormsBusy || !selectedForm || !canEditForms}
                          title={!canEditForms ? editPermissionTitle : undefined}
                          iconStart={<Sparkles className="size-4" />}
                          data-testid="forms-create-embed-block-button"
                        >
                          {isCreatingEmbedBlock ? 'Saving block...' : 'Save embed block'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleExportFormsCatalog}
                          disabled={isFormsBusy || filteredForms.length === 0 || !canExportForms}
                          title={!canExportForms ? exportPermissionTitle : undefined}
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
                    {createdEmbedSectionId && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="forms-embed-block-result">
                        <span>
                          Reusable form block created for this frontend contract.
                        </span>
                        <Link
                          to="/reusable-sections"
                          search={{ siteId: activeSiteId, sectionId: createdEmbedSectionId }}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                        >
                          <ExternalLink className="size-4" />
                          Open block
                        </Link>
                      </div>
                    )}
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

                  <div data-testid="forms-webhook-delivery-panel" className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <RefreshCw className="size-4" />
                          Webhook delivery
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Review queued, failed, retried, and email notification deliveries without leaving the form workspace.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            backy.form-delivery-handoff.v1
                          </span>
                          <Button
                            data-testid="forms-delivery-handoff-copy-button"
                            size="sm"
                            variant="outline"
                            disabled={isFormsBusy || !canExportForms}
                            title={!canExportForms ? exportPermissionTitle : undefined}
                            onClick={() => void copyFormApiText(selectedFormDeliveryHandoffText, 'Form delivery handoff')}
                            iconStart={<Copy className="size-4" />}
                          >
                            Copy delivery JSON
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {selectedDeliveryMetrics.total} events
                        </span>
                        <span className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold',
                          selectedDeliveryMetrics.failed > 0 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-700',
                        )}
                        >
                          {selectedDeliveryMetrics.failed} failed
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isFormsBusy || !canManageForms}
                          title={!canManageForms ? managePermissionTitle : undefined}
                          onClick={() => void handleRefreshDeliveryEvents()}
                          iconStart={<RefreshCw className="size-4" />}
                        >
                          Refresh delivery
                        </Button>
                      </div>
                    </div>
                    {selectedDeliveryEvents.length === 0 ? (
                      <div className="mt-4">
                        <EmptyState
                          icon={Inbox}
                          title="No delivery events yet"
                          description="Webhook and email delivery attempts, retries, and provider responses for this form will appear here."
                        />
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        {selectedDeliveryEvents.slice(0, 8).map((event) => (
                          <FormDeliveryEventCard
                            key={event.id}
                            event={event}
                            isRetrying={isRetryingDeliveryId === event.id}
                            canManageForms={canManageForms}
                            disabledReason={managePermissionTitle}
                            onRetry={() => void handleRetryDeliveryEvent(event)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetaTile label="Moderation" value={selectedForm.moderationMode || 'manual'} />
                    <MetaTile label="Spam guard" value={[
                      selectedForm.enableHoneypot ? 'honeypot' : null,
                      selectedForm.enableCaptcha ? 'captcha provider' : null,
                    ].filter(Boolean).join(' + ') || 'none'} />
                    <MetaTile label="Lead share" value={selectedForm.contactShare?.enabled ? 'enabled' : 'off'} />
                    <MetaTile label="Collection write" value={selectedForm.collectionTarget?.enabled ? selectedForm.collectionTarget.collectionId : 'off'} />
                    <MetaTile label="Notification" value={selectedForm.notificationEmail || 'off'} />
                    <MetaTile label="Webhook" value={selectedForm.notificationWebhook ? 'configured' : 'off'} />
                    <MetaTile label="Success redirect" value={selectedForm.successRedirectUrl || 'message only'} />
                    <MetaTile label="Active state" value={selectedForm.isActive ? 'active' : 'inactive'} />
                    <MetaTile label="Total submissions" value={String(selectedFormAnalytics?.submissions ?? selectedInbox?.total ?? 0)} />
                    <MetaTile label="Routed records" value={String(selectedFormAnalytics?.routedToCollections ?? 0)} />
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

                  <div data-testid="forms-consent-export-panel" className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <ShieldCheck className="size-4" />
                          Consent export
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Export consent field values with submission status, request ID, timestamp, and source metadata for privacy audits.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isFormsBusy || selectedConsentFields.length === 0 || selectedConsentRetentionMetrics.deleteDue === 0 || !canManageForms}
                          title={!canManageForms ? managePermissionTitle : undefined}
                          onClick={() => void handleApplyConsentRetention()}
                          data-testid="forms-consent-anonymize-due-button"
                          iconStart={<ShieldCheck className="size-4" />}
                        >
                          Anonymize due
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isFormsBusy || selectedConsentFields.length === 0 || filteredSubmissions.length === 0 || !canExportForms}
                          title={!canExportForms ? exportPermissionTitle : undefined}
                          onClick={handleExportConsentRecords}
                          iconStart={<Download className="size-4" />}
                        >
                          Export consent CSV
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <MetaTile label="Consent fields" value={String(selectedConsentMetrics.fields)} />
                      <MetaTile label="Consent records" value={String(selectedConsentMetrics.records)} />
                      <MetaTile label="Granted" value={String(selectedConsentMetrics.granted)} />
                      <MetaTile label="Missing/false" value={String(selectedConsentMetrics.missing)} />
                      <MetaTile label="Review due" value={String(selectedConsentRetentionMetrics.reviewDue)} />
                      <MetaTile label="Deletion due" value={String(selectedConsentRetentionMetrics.deleteDue)} />
                      <MetaTile label="Retention days" value={String(selectedConsentSettings.retentionDays)} />
                      <MetaTile label="Policy" value={selectedConsentSettings.policyLabel} />
                    </div>
                    <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground" data-testid="forms-consent-policy-summary">
                      Delete/anonymize after {selectedConsentSettings.deleteAfterDays} days.
                      {selectedConsentSettings.requestEmail ? ` Privacy requests: ${selectedConsentSettings.requestEmail}.` : ' No privacy request email configured.'}
                      {selectedConsentSettings.exportIncludesIp ? ' Exports include IP hash and user-agent.' : ' Exports omit IP hash and user-agent.'}
                    </div>
                    {selectedConsentFields.length === 0 ? (
                      <div className="mt-4">
                        <EmptyState
                          icon={ShieldCheck}
                          title="No consent fields detected"
                          description="Add consent-like checkbox fields to include this form in privacy exports and retention review."
                        />
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {selectedConsentFields.map((field) => (
                          <div key={field.key} className="rounded-lg border border-border bg-background px-3 py-2">
                            <div className="text-xs font-semibold text-foreground">{field.label}</div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">{field.key}</div>
                          </div>
                        ))}
                      </div>
                    )}
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
                      disabled={isFormsBusy || !selectedForm || filteredSubmissions.length === 0 || !canExportForms}
                      title={!canExportForms ? exportPermissionTitle : undefined}
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
                {selectedSubmissions.length > 0 && (
                  <div
                    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm"
                    role="group"
                    aria-label="Selected submission bulk actions"
                    aria-describedby={`${formsSubmissionBulkSelectionStatusId} ${formsSubmissionBulkActionStatusId}`}
                    data-testid="forms-submission-bulk-toolbar"
                    data-action-status={formsSubmissionBulkActionStatus}
                    data-action-state={formsSubmissionBulkActionState}
                    data-selected-count={selectedLoadedSubmissions.length}
                    data-visible-selected-count={selectedVisibleSubmissions.length}
                    data-hidden-selected-count={hiddenSelectedSubmissionCount}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={allVisibleSubmissionsSelected}
                          disabled={Boolean(formsSubmissionBulkSelectionDisabledReason) || filteredSubmissions.length === 0}
                          title={!canManageForms ? managePermissionTitle : undefined}
                          onChange={(event) => toggleVisibleSubmissionSelection(event.target.checked)}
                          className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Select visible submissions"
                          aria-describedby={formsSubmissionBulkActionStatusId}
                          data-testid="forms-submission-bulk-select-visible"
                          data-action-state={formsSubmissionBulkSelectionDisabledReason || filteredSubmissions.length === 0 ? 'blocked' : 'ready'}
                          data-disabled-reason={formsSubmissionBulkSelectionDisabledReason || (filteredSubmissions.length === 0 ? 'No visible submissions to select.' : undefined)}
                        />
                        Select visible
                      </label>
                      <span
                        id={formsSubmissionBulkSelectionStatusId}
                        className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                        data-testid="forms-submission-bulk-selection-summary"
                      >
                        {selectedLoadedSubmissions.length} selected
                        {selectedVisibleSubmissions.length !== selectedLoadedSubmissions.length ? ` · ${selectedVisibleSubmissions.length} visible` : ''}
                        {hiddenSelectedSubmissionCount > 0 ? ` · ${hiddenSelectedSubmissionCount} outside this view` : ''}
                      </span>
                      <span id={formsSubmissionBulkActionStatusId} className="sr-only" data-testid="forms-submission-bulk-action-status" aria-live="polite">
                        {formsSubmissionBulkActionStatus}
                      </span>
                      {selectedSubmissionIds.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(formsSubmissionBulkClearDisabledReason)}
                          onClick={() => setSelectedSubmissionIds([])}
                          aria-describedby={formsSubmissionBulkActionStatusId}
                          data-action-state={formsSubmissionBulkClearDisabledReason ? 'blocked' : 'ready'}
                          data-disabled-reason={formsSubmissionBulkClearDisabledReason || undefined}
                          data-testid="forms-submission-bulk-clear-selection"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={Boolean(formsSubmissionBulkStatusDisabledReason('approved'))}
                        title={formsSubmissionBulkStatusDisabledReason('approved') || undefined}
                        onClick={() => void handleBulkSubmissionStatus('approved')}
                        iconStart={<CheckCircle2 className="size-4" />}
                        aria-describedby={formsSubmissionBulkActionStatusId}
                        data-action-state={formsSubmissionBulkStatusDisabledReason('approved') ? 'blocked' : 'ready'}
                        data-disabled-reason={formsSubmissionBulkStatusDisabledReason('approved') || undefined}
                        data-testid="forms-submission-bulk-approve"
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(formsSubmissionBulkStatusDisabledReason('rejected'))}
                        title={formsSubmissionBulkStatusDisabledReason('rejected') || undefined}
                        onClick={() => void handleBulkSubmissionStatus('rejected')}
                        aria-describedby={formsSubmissionBulkActionStatusId}
                        data-action-state={formsSubmissionBulkStatusDisabledReason('rejected') ? 'blocked' : 'ready'}
                        data-disabled-reason={formsSubmissionBulkStatusDisabledReason('rejected') || undefined}
                        data-testid="forms-submission-bulk-reject"
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={Boolean(formsSubmissionBulkStatusDisabledReason('spam'))}
                        title={formsSubmissionBulkStatusDisabledReason('spam') || undefined}
                        onClick={() => void handleBulkSubmissionStatus('spam')}
                        iconStart={<XCircle className="size-4" />}
                        aria-describedby={formsSubmissionBulkActionStatusId}
                        data-action-state={formsSubmissionBulkStatusDisabledReason('spam') ? 'blocked' : 'ready'}
                        data-disabled-reason={formsSubmissionBulkStatusDisabledReason('spam') || undefined}
                        data-testid="forms-submission-bulk-spam"
                      >
                        Spam
                      </Button>
                    </div>
                  </div>
                )}
                {filteredSubmissions.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="No submissions match this view"
                    description="Change the submission search or status filter to review more entries for this form."
                  />
                ) : (
                  <div className="grid gap-3">
                    {filteredSubmissions.map((submission) => (
                      <SubmissionCard
                        key={submission.id}
                        submission={submission}
                        fields={selectedForm?.fields || []}
                        isUpdating={isFormsBusy}
                        selected={selectedSubmissionSet.has(submission.id)}
                        canManageForms={canManageForms}
                        disabledReason={managePermissionTitle}
                        onSelect={(selected) => {
                          if (isFormsBusy || !canManageForms) return;
                          setSelectedSubmissionIds((current) => (
                            selected
                              ? Array.from(new Set([...current, submission.id]))
                              : current.filter((submissionId) => submissionId !== submission.id)
                          ));
                        }}
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
      {pendingDeleteForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-delete-confirm-title"
          aria-describedby="form-delete-confirm-description form-delete-confirm-impact"
          data-testid="form-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="form-delete-confirm-title" className="text-lg font-semibold text-foreground">Delete {pendingDeleteForm.title || pendingDeleteForm.name}?</h2>
                <p id="form-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  This removes the form definition, public definition endpoint, and submission intake for this form.
                </p>
              </div>
            </div>
            <div id="form-delete-confirm-impact" className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Form ID: <span className="font-mono font-medium text-foreground">{pendingDeleteForm.id}</span>
              {pendingDeleteForm.pageId || pendingDeleteForm.postId ? (
                <div className="mt-1 text-amber-700">
                  This form is owned by a canvas source. Open the page or blog canvas if you want to remove the visible form block too.
                </div>
              ) : null}
              {formDraftDirty && pendingDeleteForm.id === selectedForm?.id ? (
                <div className="mt-1 text-amber-700">
                  Unsaved builder changes will be discarded.
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingDeleteForm(null)}
                disabled={Boolean(isDeletingFormId)}
                data-testid="form-delete-cancel-button"
                aria-label={`Cancel deleting ${pendingDeleteForm.title || pendingDeleteForm.name}`}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void confirmDeleteForm()}
                disabled={Boolean(isDeletingFormId) || !canDeleteForms}
                title={!canDeleteForms ? deletePermissionTitle : undefined}
                data-testid="form-delete-confirm-button"
              >
                {isDeletingFormId === pendingDeleteForm.id ? 'Deleting...' : 'Delete form'}
              </Button>
            </div>
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

function FormTrendBars({ trend }: { trend: FormsAnalytics['trend'] }) {
  const max = Math.max(1, ...trend.map((point) => point.total));

  if (trend.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground">
        No submission trend data.
      </div>
    );
  }

  return (
    <div className="grid h-28 items-end gap-1" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}>
      {trend.map((point) => {
        const height = Math.max(6, Math.round((point.total / max) * 96));
        return (
          <div key={point.date} className="flex min-w-0 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height }}
              title={`${point.date}: ${point.total} submissions`}
            />
            <span className="w-full truncate text-center font-mono text-[10px] text-muted-foreground">
              {point.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function isFormsAuditLog(log: AdminAuditLog): boolean {
  if (log.entity === 'form' || log.entity === 'formSubmission') {
    return true;
  }

  if (log.entity === 'reusableSection') {
    return log.metadata?.source === 'form-embed-block' || typeof log.metadata?.formId === 'string';
  }

  return log.entity === 'site' && String(log.action).startsWith('forms.');
}

function auditMetadataText(log: AdminAuditLog, key: string): string {
  const value = log.metadata?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formAuditTitle(log: AdminAuditLog): string {
  if (log.action === 'form.create') return 'Form created';
  if (log.action === 'form.update') return 'Form updated';
  if (log.action === 'form.delete') return 'Form deleted';
  if (log.action === 'formSubmission.review') return 'Submission reviewed';
  if (log.action === 'form.consentRetention') return 'Consent retention applied';
  if (log.action === 'forms.consentRetention') return 'Site retention applied';
  if (log.action === 'reusableSection.create' && auditMetadataText(log, 'source') === 'form-embed-block') {
    return 'Embed block saved';
  }

  return log.action.replace(/[._-]+/g, ' ');
}

function formAuditDescription(log: AdminAuditLog): string {
  const title = auditMetadataText(log, 'title') || auditMetadataText(log, 'formTitle');
  const formId = auditMetadataText(log, 'formId');
  const status = auditMetadataText(log, 'status');
  const anonymized = auditMetadataText(log, 'anonymized');
  const scanned = auditMetadataText(log, 'scanned') || auditMetadataText(log, 'scannedSubmissions');
  const fieldCount = auditMetadataText(log, 'fieldCount');
  const reusableSlug = auditMetadataText(log, 'slug');

  if (log.action === 'formSubmission.review') {
    return `${status || 'updated'} submission ${log.entityId}${formId ? ` for ${formId}` : ''}.`;
  }

  if (log.action === 'form.consentRetention' || log.action === 'forms.consentRetention') {
    return `${anonymized || '0'} anonymized from ${scanned || '0'} scanned submission${scanned === '1' ? '' : 's'}.`;
  }

  if (log.action === 'reusableSection.create' && auditMetadataText(log, 'source') === 'form-embed-block') {
    return `${reusableSlug || log.entityId}${formId ? ` from ${formId}` : ''}.`;
  }

  return [
    title || log.entityId,
    fieldCount ? `${fieldCount} fields` : null,
  ].filter(Boolean).join(' · ');
}

function FormAuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{formAuditTitle(log)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{formAuditDescription(log)}</div>
        </div>
        <time className="shrink-0 font-mono text-xs text-muted-foreground" dateTime={log.createdAt}>
          {formatDate(log.createdAt)}
        </time>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-1">{log.actorId || 'admin'}</span>
        <span className="rounded bg-muted px-2 py-1">{log.entity}</span>
        {log.requestId && (
          <span className="rounded bg-muted px-2 py-1 font-mono">{log.requestId}</span>
        )}
      </div>
    </div>
  );
}

function FormBuilderInlineError({ id, error, testId }: { id: string; error?: string; testId: string }) {
  if (!error) return null;

  return (
    <span id={id} className="text-xs font-medium text-destructive" data-testid={testId}>
      {error}
    </span>
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

function FormLaunchReadinessCheckCard({ check }: { check: FormLaunchReadinessCheck }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-xs',
      check.status === 'ready'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : check.status === 'attention'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
    )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{check.label}</span>
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] capitalize">
          {check.status}
        </span>
      </div>
      <div className="mt-1 leading-5 opacity-90">{check.detail}</div>
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

function FormMetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
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

function FormDeliveryEventCard({
  event,
  isRetrying,
  canManageForms,
  disabledReason,
  onRetry,
}: {
  event: FormDeliveryEvent;
  isRetrying: boolean;
  canManageForms: boolean;
  disabledReason?: string;
  onRetry: () => void;
}) {
  const channel = typeof event.metadata?.channel === 'string' ? event.metadata.channel : 'webhook';
  const retryable = event.status === 'failed' && Boolean(event.submissionId);
  const isRetryEvent = event.metadata?.retry === true;
  const actionLabel = isRetrying ? 'Retrying' : channel === 'email' ? 'Retry email' : 'Retry';
  const statusClass = event.status === 'succeeded'
    ? 'bg-success/10 text-success'
    : event.status === 'failed'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-warning/10 text-warning';

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md px-2 py-1 text-[11px] font-semibold', statusClass)}>
              {event.status}
            </span>
            {isRetryEvent && (
              <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                retry
              </span>
            )}
            {channel === 'email' && (
              <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                email
              </span>
            )}
            {typeof event.statusCode === 'number' && (
              <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                HTTP {event.statusCode}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
          </div>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="min-w-0">
              <span className="font-medium text-foreground">Submission:</span>{' '}
              <span className="font-mono">{event.submissionId || 'n/a'}</span>
            </div>
            <div className="min-w-0">
              <span className="font-medium text-foreground">Request:</span>{' '}
              <span className="font-mono">{event.requestId || 'n/a'}</span>
            </div>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Target:</span> {event.target}
          </div>
          {event.error && (
            <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {event.error}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant={retryable ? 'danger' : 'outline'}
          disabled={!retryable || isRetrying || !canManageForms}
          title={!canManageForms ? disabledReason : undefined}
          onClick={onRetry}
          iconStart={<RefreshCw className={cn('size-4', isRetrying && 'animate-spin')} />}
          aria-label={channel === 'email'
            ? `Retry email notification delivery ${event.submissionId || event.id}`
            : `Retry webhook delivery ${event.submissionId || event.id}`}
          data-testid="forms-webhook-retry-button"
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function SubmissionCard({
  submission,
  fields,
  isUpdating,
  selected,
  canManageForms,
  disabledReason,
  onSelect,
  onStatus,
}: {
  submission: FormSubmission;
  fields: FormDefinition['fields'];
  isUpdating: boolean;
  selected: boolean;
  canManageForms: boolean;
  disabledReason?: string;
  onSelect: (selected: boolean) => void;
  onStatus: (status: FormSubmissionStatus) => void;
}) {
  const previewFields = fields.slice(0, 4);

  return (
    <article className="rounded-lg border border-border bg-background px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={selected}
              disabled={isUpdating || !canManageForms}
              title={!canManageForms ? disabledReason : undefined}
              onChange={(event) => onSelect(event.target.checked)}
              className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Select submission ${submission.id}`}
            />
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
            disabled={isUpdating || submission.status === 'approved' || !canManageForms}
            title={!canManageForms ? disabledReason : undefined}
            onClick={() => onStatus('approved')}
            iconStart={<CheckCircle2 className="size-4" />}
            aria-label={`Approve submission ${submission.id}`}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating || submission.status === 'rejected' || !canManageForms}
            title={!canManageForms ? disabledReason : undefined}
            onClick={() => onStatus('rejected')}
            aria-label={`Reject submission ${submission.id}`}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isUpdating || submission.status === 'spam' || !canManageForms}
            title={!canManageForms ? disabledReason : undefined}
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

const getFormFrontendTemplateId = (form: FormDefinition): string | undefined => (
  typeof form.settings?.frontendDesignTemplateId === 'string'
    ? form.settings.frontendDesignTemplateId
    : undefined
);

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

const summarizeFormLaunchStatus = (checks: FormLaunchReadinessCheck[]): FormLaunchReadinessStatus => {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'ready';
};

const buildFormLaunchActionPlan = (checks: FormLaunchReadinessCheck[]): FormLaunchActionPlan => {
  const blockers = checks.filter((check) => check.status === 'blocked').map((check) => check.detail);
  const attention = checks.filter((check) => check.status === 'attention').map((check) => check.detail);
  const hasBlocked = (key: string) => checks.some((check) => check.key === key && check.status === 'blocked');
  const hasAttention = (key: string) => checks.some((check) => check.key === key && check.status === 'attention');

  const nextAction: FormLaunchActionPlan['nextAction'] = hasBlocked('selected-form')
    ? 'select-form'
    : hasBlocked('active-definition')
      ? 'activate-form'
      : hasBlocked('field-schema')
        ? 'add-fields'
        : hasBlocked('identity-routing')
          ? 'add-identity-field'
          : hasAttention('spam-moderation')
            ? 'add-spam-guard'
            : hasAttention('destination-routing')
              ? 'route-destination'
              : hasAttention('delivery-handoff')
                ? 'configure-delivery'
                : hasAttention('persistence-certification')
                  ? 'certify-persistence'
                  : 'launch-ready';
  const recommendation = (() => {
    if (nextAction === 'select-form') return 'Select or create a form before copying a launch handoff.';
    if (nextAction === 'activate-form') return 'Activate the form so the public definition and submission APIs can be used.';
    if (nextAction === 'add-fields') return 'Add at least one form field before publishing this frontend contract.';
    if (nextAction === 'add-identity-field') return 'Add an email or phone field before relying on contact or account-style routing.';
    if (nextAction === 'add-spam-guard') return 'Enable honeypot or captcha before exposing this form to high-traffic public surfaces.';
    if (nextAction === 'route-destination') return 'Choose contact sharing or collection writes when the form should power leads, registrations, or dynamic records.';
    if (nextAction === 'configure-delivery') return 'Configure email or webhook delivery if external systems need immediate notification.';
    if (nextAction === 'certify-persistence') return 'Run the disposable Supabase/Postgres Forms gate before treating production persistence as complete.';
    return 'Form launch handoff is ready for custom frontends and embed blocks.';
  })();

  return {
    schemaVersion: 'backy.form-launch-action-plan.v1',
    nextAction,
    recommendation,
    blockers,
    attention,
  };
};

const buildFormLaunchReadinessHandoff = ({
  activeSiteId,
  form,
  readiness,
  persistenceCertification,
  definitionUrl,
  submitUrl,
  contactsUrl,
  analytics,
  deliveryMetrics,
  consentMetrics,
  samplePayload,
}: {
  activeSiteId: string;
  form: FormDefinition | null;
  readiness: FormReadinessSummary;
  persistenceCertification: FormPersistenceCertificationHandoff;
  definitionUrl: string;
  submitUrl: string;
  contactsUrl: string;
  analytics: FormsAnalytics['forms'][number] | null;
  deliveryMetrics: FormLaunchReadinessHandoff['delivery'];
  consentMetrics: FormLaunchReadinessHandoff['consent'];
  samplePayload: Record<string, unknown> | null;
}): FormLaunchReadinessHandoff => {
  const generatedAt = new Date().toISOString();
  const persistenceRuntimeReady = Boolean(persistenceCertification.runtime?.readyForCertification);
  const persistenceMissingInputs = Array.isArray(persistenceCertification.runtime?.missing)
    ? persistenceCertification.runtime.missing
    : [];

  if (!form) {
    const checks: FormLaunchReadinessCheck[] = [
      {
        key: 'selected-form',
        label: 'Selected form',
        status: 'blocked',
        detail: 'Select or create a form before exporting a launch readiness handoff.',
      },
      {
        key: 'persistence-certification',
        label: 'Supabase/Postgres gate',
        status: 'attention',
        detail: `${persistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE} remains the production persistence gate.`,
      },
    ];
    const actionPlan = buildFormLaunchActionPlan(checks);

    return {
      schemaVersion: 'backy.form-launch-readiness.v1',
      generatedAt,
      status: summarizeFormLaunchStatus(checks),
      score: 0,
      selectedSiteId: activeSiteId,
      form: null,
      endpoints: {
        definition: definitionUrl,
        submit: submitUrl,
        contacts: contactsUrl,
      },
      routing: {
        contactShareEnabled: false,
        collectionWriteEnabled: false,
        collectionId: '',
        notificationEmailConfigured: false,
        notificationWebhookConfigured: false,
      },
      delivery: deliveryMetrics,
      consent: consentMetrics,
      persistenceCertification: {
        schemaVersion: persistenceCertification.schemaVersion,
        status: persistenceCertification.status,
        operatorGate: persistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE,
        runtimeReady: persistenceRuntimeReady,
        missingInputs: persistenceMissingInputs,
      },
      privacy: {
        includesSubmissionValues: false,
        customerSafeFieldsOnly: true,
        excludedFields: ['submission.values', 'ipHash', 'userAgent', 'reviewNotes', 'delivery.providerResponse', 'databaseUrl'],
      },
      samplePayload: null,
      checks,
      actionPlan,
      nextSteps: actionPlan.blockers.length ? actionPlan.blockers : actionPlan.attention,
    };
  }

  const hasFields = form.fields.length > 0;
  const hasIdentity = formHasRequiredIdentity(form);
  const hasSpamGuard = formHasSpamGuard(form);
  const hasDestination = formHasDestination(form);
  const hasDelivery = Boolean(form.notificationEmail || form.notificationWebhook);
  const analyticsSubmissionCount = analytics?.submissions ?? 0;
  const requiredFieldCount = form.fields.filter((field) => field.required).length;
  const checks: FormLaunchReadinessCheck[] = [
    {
      key: 'active-definition',
      label: 'Active public definition',
      status: form.isActive ? 'ready' : 'blocked',
      detail: form.isActive
        ? `Definition and submit endpoints are available for ${form.title || form.name}; builder readiness is ${readiness.score}%.`
        : 'Inactive forms are hidden from public delivery until activated.',
    },
    {
      key: 'field-schema',
      label: 'Field schema',
      status: hasFields ? 'ready' : 'blocked',
      detail: hasFields
        ? `${form.fields.length} field${form.fields.length === 1 ? '' : 's'} with ${requiredFieldCount} required field${requiredFieldCount === 1 ? '' : 's'} are ready for dynamic renderers.`
        : 'Add fields before using this form in a page, app, or custom frontend.',
    },
    {
      key: 'identity-routing',
      label: 'Lead identity',
      status: hasIdentity ? 'ready' : 'blocked',
      detail: hasIdentity
        ? 'Email or phone data is available for contact, account, or follow-up workflows.'
        : 'Add an email or phone field before relying on contact or account-style routing.',
    },
    {
      key: 'spam-moderation',
      label: 'Spam and moderation',
      status: hasSpamGuard ? 'ready' : 'attention',
      detail: hasSpamGuard
        ? `Spam guard is enabled with ${form.enableHoneypot ? 'honeypot' : ''}${form.enableHoneypot && form.enableCaptcha ? ' and ' : ''}${form.enableCaptcha ? 'captcha' : ''}; moderation is ${form.moderationMode || 'manual'}.`
        : `Moderation is ${form.moderationMode || 'manual'}, but honeypot/captcha should be enabled before high-traffic launch.`,
    },
    {
      key: 'destination-routing',
      label: 'Destination routing',
      status: hasDestination ? 'ready' : 'attention',
      detail: hasDestination
        ? [
            form.contactShare?.enabled ? 'Contact sharing is enabled' : null,
            form.collectionTarget?.enabled ? `collection writes target ${form.collectionTarget.collectionId}` : null,
          ].filter(Boolean).join('; ')
        : 'Submissions stay in the form inbox only; choose Contacts or a collection for lead/registration workflows.',
    },
    {
      key: 'delivery-handoff',
      label: 'Delivery handoff',
      status: hasDelivery || deliveryMetrics.total > 0 ? 'ready' : 'attention',
      detail: hasDelivery
        ? `${form.notificationEmail ? 'Email delivery' : ''}${form.notificationEmail && form.notificationWebhook ? ' and ' : ''}${form.notificationWebhook ? 'webhook delivery' : ''} configured; ${deliveryMetrics.total} delivery event${deliveryMetrics.total === 1 ? '' : 's'} and ${analyticsSubmissionCount} analytics submission${analyticsSubmissionCount === 1 ? '' : 's'} tracked.`
        : `No email or webhook destination is configured; ${analyticsSubmissionCount} analytics submission${analyticsSubmissionCount === 1 ? '' : 's'} remain available in the Backy inbox.`,
    },
    {
      key: 'frontend-contract',
      label: 'Custom frontend contract',
      status: definitionUrl && submitUrl && samplePayload ? 'ready' : 'blocked',
      detail: definitionUrl && submitUrl && samplePayload
        ? 'Definition URL, submit URL, sample payload, cURL, and embed-block generation are available.'
        : 'Frontend contract endpoints or sample payload are unavailable until a form is selected.',
    },
    {
      key: 'persistence-certification',
      label: 'Supabase/Postgres gate',
      status: 'attention',
      detail: persistenceRuntimeReady
        ? `${persistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE} is ready to run against the configured disposable database target.`
        : `${persistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE} still needs ${persistenceMissingInputs.length ? persistenceMissingInputs.join(', ') : 'database URL and disposable confirmation'} before production persistence is certified.`,
    },
  ];
  const status = summarizeFormLaunchStatus(checks);
  const readyCount = checks.filter((check) => check.status === 'ready').length;
  const actionPlan = buildFormLaunchActionPlan(checks);
  const nextSteps = [...actionPlan.blockers, ...actionPlan.attention].slice(0, 5);

  return {
    schemaVersion: 'backy.form-launch-readiness.v1',
    generatedAt,
    status,
    score: Math.round((readyCount / checks.length) * 100),
    selectedSiteId: activeSiteId,
    form: {
      id: form.id,
      name: form.name,
      title: form.title || form.name,
      isActive: form.isActive,
      audience: form.audience,
      source: getFormSource(form),
      fieldCount: form.fields.length,
      requiredFieldCount,
      moderationMode: form.moderationMode,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    },
    endpoints: {
      definition: definitionUrl,
      submit: submitUrl,
      contacts: contactsUrl,
    },
    routing: {
      contactShareEnabled: Boolean(form.contactShare?.enabled),
      collectionWriteEnabled: Boolean(form.collectionTarget?.enabled),
      collectionId: form.collectionTarget?.enabled ? form.collectionTarget.collectionId : '',
      notificationEmailConfigured: Boolean(form.notificationEmail),
      notificationWebhookConfigured: Boolean(form.notificationWebhook),
    },
    delivery: deliveryMetrics,
    consent: consentMetrics,
    persistenceCertification: {
      schemaVersion: persistenceCertification.schemaVersion,
      status: persistenceCertification.status,
      operatorGate: persistenceCertification.operatorGate || FORM_PERSISTENCE_OPERATOR_GATE,
      runtimeReady: persistenceRuntimeReady,
      missingInputs: persistenceMissingInputs,
    },
    privacy: {
      includesSubmissionValues: false,
      customerSafeFieldsOnly: true,
      excludedFields: ['submission.values', 'ipHash', 'userAgent', 'reviewNotes', 'delivery.providerResponse', 'databaseUrl'],
    },
    samplePayload,
    checks,
    actionPlan,
    nextSteps: nextSteps.length
      ? nextSteps
      : ['Form launch handoff is ready for custom frontends, embed blocks, lead routing, and operator certification review.'],
  };
};

const getFormDeliveryEventChannel = (event: FormDeliveryEvent): string => {
  const channel = event.metadata?.channel;
  return typeof channel === 'string' && channel.trim() ? channel : 'webhook';
};

const buildFormDeliveryHandoff = ({
  activeSiteId,
  form,
  adminBaseUrl,
  publicBaseUrl,
  deliveryMetrics,
  events,
}: {
  activeSiteId: string;
  form: FormDefinition | null;
  adminBaseUrl: string;
  publicBaseUrl: string;
  deliveryMetrics: FormDeliveryHandoff['metrics'];
  events: FormDeliveryEvent[];
}): FormDeliveryHandoff => {
  const eventEndpoint = form
    ? `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=form-submission&formId=${encodeURIComponent(form.id)}`
    : `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=form-submission`;
  const retryBase = form
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/submissions/{submissionId}`
    : '';
  const hasDeliveryConfig = Boolean(form?.notificationEmail || form?.notificationWebhook);
  const hasFailedEvents = deliveryMetrics.failed > 0;
  const retryableSubmissionIds = [...new Set(events
    .filter((event) => event.status === 'failed' && Boolean(event.submissionId))
    .map((event) => event.submissionId as string))];
  const nextSteps = [
    !form ? 'Select a form before exporting delivery handoff evidence.' : null,
    form && !hasDeliveryConfig ? 'Configure notification email or webhook delivery before launch.' : null,
    hasFailedEvents ? 'Retry or inspect failed delivery events from the Forms workspace.' : null,
    form && hasDeliveryConfig && !hasFailedEvents ? 'Delivery handoff is ready for custom admin consoles and operator review.' : null,
  ].filter((step): step is string => Boolean(step));

  return {
    schemaVersion: 'backy.form-delivery-handoff.v1',
    generatedAt: new Date().toISOString(),
    selectedSiteId: activeSiteId,
    form: form
      ? {
          id: form.id,
          name: form.name,
          title: form.title || form.name,
          isActive: form.isActive,
        }
      : null,
    endpoints: {
      events: eventEndpoint,
      webhookRetryTemplate: retryBase ? `${retryBase}/webhook-retry` : '',
      emailRetryTemplate: retryBase ? `${retryBase}/email-retry` : '',
    },
    configuration: {
      notificationEmailConfigured: Boolean(form?.notificationEmail),
      notificationWebhookConfigured: Boolean(form?.notificationWebhook),
      moderationMode: form?.moderationMode || '',
    },
    metrics: deliveryMetrics,
    recentEvents: events.slice(0, 12).map((event) => ({
      id: event.id,
      kind: event.kind,
      channel: getFormDeliveryEventChannel(event),
      status: event.status,
      statusCode: typeof event.statusCode === 'number' ? event.statusCode : null,
      requestId: event.requestId || null,
      submissionId: event.submissionId || null,
      retry: event.metadata?.retry === true,
      retryable: event.status === 'failed' && Boolean(event.submissionId),
      hasTarget: Boolean(event.target),
      hasError: Boolean(event.error),
      createdAt: event.createdAt,
    })),
    retry: {
      failedRetryableCount: retryableSubmissionIds.length,
      retryableSubmissionIds,
    },
    actionPlan: {
      status: form && hasDeliveryConfig && !hasFailedEvents ? 'ready' : 'attention',
      nextSteps,
    },
    privacy: {
      includesSubmissionValues: false,
      includesProviderTargets: false,
      includesProviderResponses: false,
      excludedFields: [
        'submission.values',
        'event.target',
        'delivery.providerResponse',
        'notificationWebhook',
        'notificationEmail',
        'databaseUrl',
        'headers',
        'payload',
        'ipHash',
        'userAgent',
      ],
    },
  };
};

const cloneFormDefinition = (form: FormDefinition): FormDefinition => JSON.parse(JSON.stringify(form)) as FormDefinition;

const normalizeFieldKey = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

const getUniqueFormDraftFieldKey = (fields: FormFieldDefinition[], baseKey: string): string => {
  const usedKeys = new Set(fields.map((field) => normalizeFieldKey(field.key)).filter(Boolean));
  const normalizedBase = normalizeFieldKey(baseKey) || `field_${fields.length + 1}`;
  let candidate = normalizedBase;
  let index = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${normalizedBase}_${index}`;
    index += 1;
  }

  return candidate;
};

const remapFieldKeyReference = (value: string | undefined, oldKey: string, nextKey: string): string | undefined => (
  value === oldKey ? nextKey : value
);

const clearFieldKeyReference = (value: string | undefined, removedKey: string): string | undefined => (
  value === removedKey ? undefined : value
);

const formFieldKeySet = (fields: FormFieldDefinition[]): Set<string> => (
  new Set(fields.map((field) => normalizeFieldKey(field.key)).filter(Boolean))
);

const normalizeFormCollectionFieldMap = (
  fieldMap: Record<string, string> | undefined,
  fields: FormFieldDefinition[],
): Record<string, string> => {
  const allowedFormFieldKeys = formFieldKeySet(fields);
  return Object.fromEntries(Object.entries(fieldMap || {}).flatMap(([formFieldKey, collectionFieldKey]) => {
    const normalizedFormFieldKey = normalizeFieldKey(formFieldKey);
    const normalizedCollectionFieldKey = collectionFieldKey.trim();
    if (!normalizedFormFieldKey || !normalizedCollectionFieldKey || !allowedFormFieldKeys.has(normalizedFormFieldKey)) {
      return [];
    }

    return [[normalizedFormFieldKey, normalizedCollectionFieldKey]];
  }));
};

const normalizeFormCollectionTarget = (
  collectionTarget: FormDefinition['collectionTarget'],
  fields: FormFieldDefinition[],
): FormDefinition['collectionTarget'] => {
  if (!collectionTarget) return collectionTarget;

  const allowedFormFieldKeys = formFieldKeySet(fields);
  const collectionId = collectionTarget.collectionId.trim();
  const slugFieldKey = collectionTarget.slugField ? normalizeFieldKey(collectionTarget.slugField) : '';
  const slugField = slugFieldKey && allowedFormFieldKeys.has(slugFieldKey)
    ? slugFieldKey
    : undefined;

  return {
    ...collectionTarget,
    collectionId,
    slugField,
    fieldMap: normalizeFormCollectionFieldMap(collectionTarget.fieldMap, fields),
  };
};

const normalizeContactShareFieldReference = (
  value: string | undefined,
  fields: FormFieldDefinition[],
): string | undefined => {
  const normalizedKey = value ? normalizeFieldKey(value) : '';
  return normalizedKey && formFieldKeySet(fields).has(normalizedKey) ? normalizedKey : undefined;
};

const normalizeFormContactShare = (
  contactShare: FormDefinition['contactShare'],
  fields: FormFieldDefinition[],
): FormDefinition['contactShare'] => {
  if (!contactShare) return contactShare;

  const nameField = normalizeContactShareFieldReference(contactShare.nameField, fields);
  const emailField = normalizeContactShareFieldReference(contactShare.emailField, fields);
  const phoneField = normalizeContactShareFieldReference(contactShare.phoneField, fields);
  const notesField = normalizeContactShareFieldReference(contactShare.notesField, fields);

  return {
    enabled: contactShare.enabled === true,
    ...(nameField ? { nameField } : {}),
    ...(emailField ? { emailField } : {}),
    ...(phoneField ? { phoneField } : {}),
    ...(notesField ? { notesField } : {}),
    dedupeByEmail: Boolean(emailField) && contactShare.dedupeByEmail !== false,
  };
};

const remapFormContactShareFieldKey = (
  contactShare: FormDefinition['contactShare'],
  oldKey: string,
  nextKey: string,
): FormDefinition['contactShare'] => (
  contactShare
    ? {
        ...contactShare,
        nameField: remapFieldKeyReference(contactShare.nameField, oldKey, nextKey),
        emailField: remapFieldKeyReference(contactShare.emailField, oldKey, nextKey),
        phoneField: remapFieldKeyReference(contactShare.phoneField, oldKey, nextKey),
        notesField: remapFieldKeyReference(contactShare.notesField, oldKey, nextKey),
      }
    : contactShare
);

const remapFormCollectionTargetFieldKey = (
  collectionTarget: FormDefinition['collectionTarget'],
  oldKey: string,
  nextKey: string,
): FormDefinition['collectionTarget'] => {
  if (!collectionTarget) return collectionTarget;

  const fieldMap = { ...(collectionTarget.fieldMap || {}) };
  if (Object.prototype.hasOwnProperty.call(fieldMap, oldKey)) {
    fieldMap[nextKey] = fieldMap[oldKey];
    delete fieldMap[oldKey];
  }

  return {
    ...collectionTarget,
    slugField: remapFieldKeyReference(collectionTarget.slugField, oldKey, nextKey),
    fieldMap,
  };
};

const removeFormContactShareFieldKey = (
  contactShare: FormDefinition['contactShare'],
  removedKey: string,
): FormDefinition['contactShare'] => (
  contactShare
    ? {
        ...contactShare,
        nameField: clearFieldKeyReference(contactShare.nameField, removedKey),
        emailField: clearFieldKeyReference(contactShare.emailField, removedKey),
        phoneField: clearFieldKeyReference(contactShare.phoneField, removedKey),
        notesField: clearFieldKeyReference(contactShare.notesField, removedKey),
      }
    : contactShare
);

const removeFormCollectionTargetFieldKey = (
  collectionTarget: FormDefinition['collectionTarget'],
  removedKey: string,
): FormDefinition['collectionTarget'] => {
  if (!collectionTarget) return collectionTarget;

  const fieldMap = { ...(collectionTarget.fieldMap || {}) };
  delete fieldMap[removedKey];

  return {
    ...collectionTarget,
    slugField: clearFieldKeyReference(collectionTarget.slugField, removedKey),
    fieldMap,
  };
};

const FORM_FIELD_TYPE_PLACEHOLDERS: Partial<Record<FormFieldType, string>> = {
  email: 'you@example.com',
  tel: '+1 555 0100',
  url: 'https://example.com',
  textarea: 'Tell us what you need',
  number: '1',
};

const validationTypesForFieldType = (type: FormFieldType): FormValidationRuleType[] => {
  if (type === 'number') return ['min', 'max'];
  if (type === 'text' || type === 'textarea' || type === 'email' || type === 'tel' || type === 'url') {
    return ['minLength', 'maxLength', 'pattern'];
  }
  return [];
};

const getFormFieldValidationRuleDefinitions = (type: FormFieldType): typeof FORM_VALIDATION_RULES => {
  const allowedValidationTypes = new Set(validationTypesForFieldType(type));
  return FORM_VALIDATION_RULES.filter((rule) => allowedValidationTypes.has(rule.type));
};

const normalizeFormFieldType = (value: string | undefined): FormFieldType => (
  FORM_FIELD_TYPES.includes(value as FormFieldType) ? value as FormFieldType : 'text'
);

const formFieldTypeSupportsOptions = (type: FormFieldType): boolean => (
  type === 'select' || type === 'radio' || type === 'checkbox'
);

const formFieldTypeRequiresOptions = (type: FormFieldType): boolean => (
  type === 'select' || type === 'radio'
);

const normalizeFormFieldOptions = (options: string[] | undefined): string[] | undefined => {
  const normalized = (options || []).map((option) => option.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
};

const findMatchingFormFieldOption = (value: string, options: string[] | undefined): string | undefined => {
  const normalizedValue = value.trim().toLowerCase();
  return (options || []).find((option) => option.toLowerCase() === normalizedValue);
};

const isValidFormFieldDateDefault = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const isValidFormFieldTelDefault = (value: string): boolean => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 20 && /^[+()\d\s.-]+$/.test(value);
};

const normalizeFormFieldDefaultValue = (
  defaultValue: string | undefined,
  type: FormFieldType,
  options: string[] | undefined,
): string | undefined => {
  const value = typeof defaultValue === 'string' ? defaultValue.trim() : '';
  if (!value) return undefined;

  if (type === 'select' || type === 'radio') {
    return findMatchingFormFieldOption(value, options);
  }

  if (type === 'checkbox') {
    if (options?.length) {
      const selections = value.split(',').map((item) => item.trim()).filter(Boolean);
      const matchedSelections = selections
        .map((selection) => findMatchingFormFieldOption(selection, options))
        .filter((selection): selection is string => Boolean(selection));
      return matchedSelections.length === selections.length && matchedSelections.length > 0
        ? matchedSelections.join(', ')
        : undefined;
    }

    return ['true', 'on', '1', 'yes', 'false', 'off', '0', 'no'].includes(value.toLowerCase())
      ? value
      : undefined;
  }

  if (type === 'number') return Number.isFinite(Number(value)) ? value : undefined;
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
  if (type === 'date') return isValidFormFieldDateDefault(value) ? value : undefined;
  if (type === 'tel') return isValidFormFieldTelDefault(value) ? value : undefined;
  if (type === 'url') {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  return value;
};

const isValidFormBuilderEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidFormBuilderHttpUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidFormBuilderRedirectUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return isValidFormBuilderHttpUrl(trimmed);
};

const addFormDraftInlineError = (
  errors: Record<string, string>,
  key: string,
  message: string,
) => {
  if (!errors[key]) {
    errors[key] = message;
  }
};

const buildFormDraftInlineErrors = (
  form: FormDefinition,
  collections: Collection[],
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const formName = form.name.trim();
  const notificationEmail = form.notificationEmail?.trim() || '';
  const notificationWebhook = form.notificationWebhook?.trim() || '';
  const successRedirectUrl = form.successRedirectUrl?.trim() || '';
  const consentSettings = readFormConsentSettings(form);
  const spamSettings = readFormSpamSettings(form);
  const normalizedFieldKeys = form.fields.map((field) => normalizeFieldKey(field.key));
  const fieldKeyCounts = normalizedFieldKeys.reduce<Record<string, number>>((counts, key) => {
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, {});

  if (!formName) {
    addFormDraftInlineError(errors, 'form-builder-name', 'Machine name is required.');
  }
  if (notificationEmail && !isValidFormBuilderEmail(notificationEmail)) {
    addFormDraftInlineError(errors, 'form-builder-notification-email', 'Use a valid notification email address.');
  }
  if (notificationWebhook && !isValidFormBuilderHttpUrl(notificationWebhook)) {
    addFormDraftInlineError(errors, 'form-builder-notification-webhook', 'Use a valid https:// or http:// webhook URL.');
  }
  if (successRedirectUrl && !isValidFormBuilderRedirectUrl(successRedirectUrl)) {
    addFormDraftInlineError(errors, 'form-builder-success-redirect', 'Use a relative path or a valid https:// or http:// redirect URL.');
  }
  if (consentSettings.requestEmail && !isValidFormBuilderEmail(consentSettings.requestEmail)) {
    addFormDraftInlineError(errors, 'form-builder-consent-request-email', 'Use a valid privacy request email address.');
  }
  if (consentSettings.deleteAfterDays > 0 && consentSettings.deleteAfterDays < consentSettings.retentionDays) {
    addFormDraftInlineError(errors, 'form-builder-consent-delete-after-days', 'Delete-after days must be greater than or equal to retention days.');
  }
  if (spamSettings.minFillMs > 120_000) {
    addFormDraftInlineError(errors, 'form-builder-spam-min-fill-ms', 'Min fill time must be 120000 ms or less.');
  }
  if (spamSettings.rateLimitWindowMs > 86_400_000) {
    addFormDraftInlineError(errors, 'form-builder-spam-rate-window', 'Rate window must be 86400 seconds or less.');
  }
  if (spamSettings.rateLimitMax > 1000) {
    addFormDraftInlineError(errors, 'form-builder-spam-rate-limit-max', 'Max submissions must be 1000 or less.');
  }
  if (spamSettings.duplicateWindowMs > 86_400_000) {
    addFormDraftInlineError(errors, 'form-builder-spam-duplicate-window', 'Duplicate window must be 86400 seconds or less.');
  }

  if (form.fields.length === 0) {
    addFormDraftInlineError(errors, 'form-builder-fields', 'At least one form field is required.');
  }

  form.fields.forEach((field, index) => {
    const fieldPrefix = `form-builder-field-${index}`;
    const fieldType = normalizeFormFieldType(field.type);
    const fieldKey = normalizedFieldKeys[index];
    const fieldLabel = field.label.trim();
    const options = formFieldTypeSupportsOptions(fieldType) ? normalizeFormFieldOptions(field.options) : undefined;
    const defaultValue = typeof field.defaultValue === 'string' ? field.defaultValue.trim() : '';
    const allowedValidationTypes = new Set(validationTypesForFieldType(fieldType));

    if (!fieldKey) {
      addFormDraftInlineError(errors, `${fieldPrefix}-key`, 'Field key is required for API payloads.');
    } else if (fieldKeyCounts[fieldKey] > 1) {
      addFormDraftInlineError(errors, `${fieldPrefix}-key`, 'Field key must be unique in this form.');
    }
    if (!fieldLabel) {
      addFormDraftInlineError(errors, `${fieldPrefix}-label`, 'Field label is required.');
    }
    if (formFieldTypeRequiresOptions(fieldType) && !options?.length) {
      addFormDraftInlineError(errors, `${fieldPrefix}-options`, 'Add at least one option for this field type.');
    }
    if (defaultValue && !normalizeFormFieldDefaultValue(defaultValue, fieldType, options)) {
      addFormDraftInlineError(errors, `${fieldPrefix}-default`, 'Default value must match this field type and options.');
    }

    const validationRules = field.validation || [];
    const minLengthRule = validationRules.find((rule) => rule.type === 'minLength');
    const maxLengthRule = validationRules.find((rule) => rule.type === 'maxLength');
    const minRule = validationRules.find((rule) => rule.type === 'min');
    const maxRule = validationRules.find((rule) => rule.type === 'max');

    validationRules.forEach((rule) => {
      const ruleDefinition = FORM_VALIDATION_RULES.find((candidate) => candidate.type === rule.type);
      if (!allowedValidationTypes.has(rule.type as FormValidationRuleType) || !ruleDefinition) {
        addFormDraftInlineError(errors, `${fieldPrefix}-validation`, 'Remove validation rules that do not apply to this field type.');
        return;
      }
      if (!formValidationRuleHasValue(rule)) {
        return;
      }
      if (ruleDefinition.valueMode === 'number' && !Number.isFinite(Number(rule.value))) {
        addFormDraftInlineError(errors, `${fieldPrefix}-validation`, 'Validation rule values must be valid numbers.');
      }
      if (rule.type === 'pattern') {
        try {
          new RegExp(String(rule.value));
        } catch {
          addFormDraftInlineError(errors, `${fieldPrefix}-validation`, 'Pattern validation must be a valid regular expression.');
        }
      }
    });

    if (
      formValidationRuleHasValue(minLengthRule) &&
      formValidationRuleHasValue(maxLengthRule) &&
      Number(minLengthRule?.value) > Number(maxLengthRule?.value)
    ) {
      addFormDraftInlineError(errors, `${fieldPrefix}-validation`, 'Min length must be less than or equal to max length.');
    }
    if (
      formValidationRuleHasValue(minRule) &&
      formValidationRuleHasValue(maxRule) &&
      Number(minRule?.value) > Number(maxRule?.value)
    ) {
      addFormDraftInlineError(errors, `${fieldPrefix}-validation`, 'Min value must be less than or equal to max value.');
    }
  });

  if (form.contactShare?.enabled && !form.contactShare.emailField && !form.contactShare.phoneField) {
    addFormDraftInlineError(errors, 'form-builder-contact-share', 'Map an email or phone field before enabling contact creation.');
  }

  if (form.collectionTarget?.enabled) {
    const targetCollection = collections.find((collection) => collection.id === form.collectionTarget?.collectionId) || null;
    const normalizedFieldMap = normalizeFormCollectionFieldMap(form.collectionTarget.fieldMap, form.fields);
    const mappedCollectionFields = new Set(Object.values(normalizedFieldMap).filter(Boolean));
    if (!targetCollection) {
      addFormDraftInlineError(errors, 'form-builder-collection-target', 'Select a target collection before enabling collection writes.');
    } else if (targetCollection.status !== 'published' || !targetCollection.permissions.publicCreate) {
      addFormDraftInlineError(errors, 'form-builder-collection-target', 'Target collection must be published and allow public create.');
    } else if (mappedCollectionFields.size === 0) {
      addFormDraftInlineError(errors, 'form-builder-collection-target', 'Map at least one form field into the target collection.');
    } else {
      const missingRequiredFields = targetCollection.fields
        .filter((field) => field.required && !mappedCollectionFields.has(field.key))
        .map((field) => field.label || field.key);
      if (missingRequiredFields.length > 0) {
        addFormDraftInlineError(
          errors,
          'form-builder-collection-target',
          `Map required collection fields: ${missingRequiredFields.slice(0, 4).join(', ')}${missingRequiredFields.length > 4 ? ', ...' : ''}.`,
        );
      }
    }
  }

  return errors;
};

const applyFormFieldTypeDefaults = (
  field: FormFieldDefinition,
  type: FormFieldType,
): FormFieldDefinition => {
  const allowedValidationTypes = new Set(validationTypesForFieldType(type));
  const validation = (field.validation || []).filter((rule) => (
    allowedValidationTypes.has(rule.type as FormValidationRuleType)
  ));
  const existingOptions = normalizeFormFieldOptions(field.options) || [];
  const supportsOptions = formFieldTypeSupportsOptions(type);
  const options = supportsOptions
    ? existingOptions.length > 0
      ? existingOptions
      : type === 'select' || type === 'radio'
        ? ['Option one', 'Option two']
        : undefined
    : undefined;

  return {
    ...field,
    type,
    options,
    defaultValue: normalizeFormFieldDefaultValue(field.defaultValue, type, options),
    validation: validation.length > 0 ? validation : undefined,
    placeholder: field.placeholder || FORM_FIELD_TYPE_PLACEHOLDERS[type],
    helpText: field.helpText || (type === 'file' ? 'Accepts uploaded files submitted with this form.' : undefined),
  };
};

const applyFormFieldOptionDefaults = (
  field: FormFieldDefinition,
  optionsInput: string[] | undefined,
): FormFieldDefinition => {
  const type = normalizeFormFieldType(field.type);
  const options = formFieldTypeSupportsOptions(type) ? normalizeFormFieldOptions(optionsInput) : undefined;
  return {
    ...field,
    options,
    defaultValue: normalizeFormFieldDefaultValue(field.defaultValue, type, options),
  };
};

const buildFormDraftFieldPreset = (
  fields: FormFieldDefinition[],
  type: FormFieldType,
  nextNumber: number,
): FormFieldDefinition => {
  const baseField = (baseKey: string, label: string, patch: Partial<FormFieldDefinition> = {}): FormFieldDefinition => ({
    key: getUniqueFormDraftFieldKey(fields, baseKey),
    label,
    type,
    required: false,
    ...patch,
  });

  if (type === 'text') {
    return baseField(`field_${nextNumber}`, `Field ${nextNumber}`);
  }
  if (type === 'email') {
    return baseField('email', 'Email', { required: true, placeholder: 'you@example.com' });
  }
  if (type === 'tel') {
    return baseField('phone', 'Phone', { placeholder: '+1 555 0100' });
  }
  if (type === 'url') {
    return baseField('website', 'Website', { placeholder: 'https://example.com' });
  }
  if (type === 'textarea') {
    return baseField('message', 'Message', { placeholder: 'Tell us what you need' });
  }
  if (type === 'number') {
    return baseField('quantity', 'Quantity', { placeholder: '1', validation: [{ type: 'min', value: 0, message: 'Quantity must be at least 0.' }] });
  }
  if (type === 'select') {
    return baseField('choice', 'Choice', { options: ['Option one', 'Option two'] });
  }
  if (type === 'radio') {
    return baseField('preference', 'Preference', { options: ['Option one', 'Option two'] });
  }
  if (type === 'checkbox') {
    return baseField('consent', 'Consent', { helpText: 'Use for opt-in, agreement, or confirmation fields.' });
  }
  if (type === 'date') {
    return baseField('date', 'Date');
  }
  if (type === 'file') {
    return baseField('attachment', 'Attachment', { helpText: 'Accepts uploaded files submitted with this form.' });
  }

  return baseField(`field_${nextNumber}`, `Field ${nextNumber}`, { type: 'text' });
};

const parseOptionsText = (value: string): string[] | undefined => {
  return normalizeFormFieldOptions(value.split(','));
};

const parseLines = (value: string): string[] => (
  value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
);

const addDaysIso = (dateValue: string | null | undefined, days: number): string | null => {
  const timestamp = Date.parse(dateValue || '');
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const optionalStringFromRecord = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const optionalBooleanFromRecord = (record: Record<string, unknown> | undefined, key: string): boolean | undefined => {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const optionalStringListFromRecord = (record: Record<string, unknown> | undefined, key: string): string[] | undefined => {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;

  const options = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  return options.length > 0 ? options : undefined;
};

const frontendTemplateValidationRequiresField = (value: unknown): boolean => (
  Array.isArray(value) && value.some((rule) => (
    isPlainRecord(rule) && optionalStringFromRecord(rule, 'type') === 'required'
  ))
);

const normalizeFrontendFieldType = (value: unknown): FormFieldType => {
  const type = typeof value === 'string' ? value.trim() : undefined;
  return normalizeFormFieldType(type);
};

interface FrontendTemplateFieldsImport {
  fields: FormFieldDefinition[];
  fieldKeyAliases: Map<string, string>;
}

const getUniqueFrontendTemplateFieldKey = (usedKeys: Set<string>, baseKey: string, index: number): string => {
  const normalizedBase = normalizeFieldKey(baseKey) || `field_${index + 1}`;
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  usedKeys.add(candidate);
  return candidate;
};

const addFrontendTemplateFieldKeyAlias = (
  fieldKeyAliases: Map<string, string>,
  value: string | undefined,
  normalizedKey: string,
) => {
  const trimmed = value?.trim();
  if (!trimmed) return;

  [trimmed, normalizeFieldKey(trimmed)].filter(Boolean).forEach((alias) => {
    if (!fieldKeyAliases.has(alias)) {
      fieldKeyAliases.set(alias, normalizedKey);
    }
  });
};

const normalizeFrontendTemplateField = (
  value: unknown,
  index: number,
  usedKeys: Set<string>,
  fieldKeyAliases: Map<string, string>,
  sourceKey?: string,
): FormFieldDefinition | null => {
  const record = isPlainRecord(value) ? value : {};
  const label = optionalStringFromRecord(record, 'label') || optionalStringFromRecord(record, 'name') || `Field ${index + 1}`;
  const recordKey = optionalStringFromRecord(record, 'key');
  const recordId = optionalStringFromRecord(record, 'id');
  const recordName = optionalStringFromRecord(record, 'name');
  const key = getUniqueFrontendTemplateFieldKey(
    usedKeys,
    recordKey || recordId || sourceKey || label,
    index,
  );
  const type = normalizeFrontendFieldType(record.type);
  const field: FormFieldDefinition = {
    key,
    label,
    type,
    required:
      optionalBooleanFromRecord(record, 'required') === true ||
      frontendTemplateValidationRequiresField(record.validation),
  };
  const placeholder = optionalStringFromRecord(record, 'placeholder');
  const helpText = optionalStringFromRecord(record, 'helpText') || optionalStringFromRecord(record, 'description');
  const options = formFieldTypeSupportsOptions(type)
    ? normalizeFormFieldOptions(optionalStringListFromRecord(record, 'options'))
    : undefined;
  const defaultValue = normalizeFormFieldDefaultValue(
    optionalStringFromRecord(record, 'defaultValue'),
    type,
    options,
  );
  const validation = normalizeValidationRules({
    ...field,
    validation: Array.isArray(record.validation)
      ? record.validation as FormFieldDefinition['validation']
      : undefined,
  });

  if (placeholder) field.placeholder = placeholder;
  if (helpText) field.helpText = helpText;
  if (defaultValue) field.defaultValue = defaultValue;
  if (options) field.options = options;
  if (validation) field.validation = validation;

  [key, sourceKey, recordKey, recordId, recordName, label].forEach((alias) => {
    addFrontendTemplateFieldKeyAlias(fieldKeyAliases, alias, key);
  });

  return field;
};

const frontendTemplateFieldsFromContent = (content: Record<string, unknown> | undefined): FrontendTemplateFieldsImport => {
  const fieldsInput = content?.fields || content?.formFields || content?.schema;
  const usedKeys = new Set<string>();
  const fieldKeyAliases = new Map<string, string>();

  if (Array.isArray(fieldsInput)) {
    const fields = fieldsInput
      .map((field, index) => normalizeFrontendTemplateField(field, index, usedKeys, fieldKeyAliases))
      .filter((field): field is FormFieldDefinition => Boolean(field));
    return { fields, fieldKeyAliases };
  }

  if (isPlainRecord(fieldsInput)) {
    const fields = Object.entries(fieldsInput)
      .map(([key, value], index) => normalizeFrontendTemplateField(
        isPlainRecord(value) ? { key, ...value } : { key, label: key, type: value },
        index,
        usedKeys,
        fieldKeyAliases,
        key,
      ))
      .filter((field): field is FormFieldDefinition => Boolean(field));
    return { fields, fieldKeyAliases };
  }

  return { fields: [], fieldKeyAliases };
};

const defaultFrontendTemplateFields = (): FormFieldDefinition[] => [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Ada Lovelace' },
  { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'ada@example.com' },
  { key: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'How can we help?' },
];

const frontendTemplateFieldAliasesFromFields = (fields: FormFieldDefinition[]): Map<string, string> => {
  const fieldKeyAliases = new Map<string, string>();

  fields.forEach((field) => {
    addFrontendTemplateFieldKeyAlias(fieldKeyAliases, field.key, field.key);
    addFrontendTemplateFieldKeyAlias(fieldKeyAliases, field.label, field.key);
  });

  return fieldKeyAliases;
};

const frontendTemplateFieldKeyMapFromAliases = (
  fieldKeyAliases: Map<string, string>,
): Record<string, string> | undefined => {
  const entries = Array.from(fieldKeyAliases.entries())
    .filter(([alias, fieldKey]) => alias && fieldKey)
    .sort(([firstAlias], [secondAlias]) => firstAlias.localeCompare(secondAlias));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const remapFrontendTemplateFieldReference = (
  value: string | undefined,
  fieldKeyAliases: Map<string, string>,
): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return fieldKeyAliases.get(trimmed) || fieldKeyAliases.get(normalizeFieldKey(trimmed));
};

const remapFrontendTemplateFieldMap = (
  value: unknown,
  fieldKeyAliases: Map<string, string>,
): Record<string, string> | undefined => {
  if (!isPlainRecord(value)) return undefined;

  const entries = Object.entries(value).flatMap(([sourceField, targetField]) => {
    if (typeof targetField !== 'string') return [];

    const remappedSource = remapFrontendTemplateFieldReference(sourceField, fieldKeyAliases);
    const normalizedTarget = targetField.trim();
    return remappedSource && normalizedTarget ? [[remappedSource, normalizedTarget]] : [];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const inferFrontendTemplateContactShare = (
  fields: FormFieldDefinition[],
  fieldKeyAliases: Map<string, string>,
  content: Record<string, unknown> | undefined,
): FormDefinition['contactShare'] => {
  const configured = isPlainRecord(content?.contactShare) ? content.contactShare : undefined;
  if (configured?.enabled === false) return { enabled: false };

  const nameField = remapFrontendTemplateFieldReference(optionalStringFromRecord(configured, 'nameField'), fieldKeyAliases)
    || fields.find((field) => ['name', 'full_name', 'fullName'].includes(field.key))?.key;
  const emailField = remapFrontendTemplateFieldReference(optionalStringFromRecord(configured, 'emailField'), fieldKeyAliases)
    || fields.find((field) => field.type === 'email' || field.key.includes('email'))?.key;
  const phoneField = remapFrontendTemplateFieldReference(optionalStringFromRecord(configured, 'phoneField'), fieldKeyAliases)
    || fields.find((field) => field.type === 'tel' || field.key.includes('phone'))?.key;
  const notesField = remapFrontendTemplateFieldReference(optionalStringFromRecord(configured, 'notesField'), fieldKeyAliases)
    || fields.find((field) => field.type === 'textarea' || ['message', 'notes'].includes(field.key))?.key;

  if (!emailField && !phoneField) {
    return configured?.enabled === true ? { enabled: true } : undefined;
  }

  return {
    enabled: configured?.enabled !== false,
    ...(nameField ? { nameField } : {}),
    ...(emailField ? { emailField } : {}),
    ...(phoneField ? { phoneField } : {}),
    ...(notesField ? { notesField } : {}),
    dedupeByEmail: configured?.dedupeByEmail !== false,
  };
};

const inferFrontendTemplateCollectionTarget = (
  fields: FormFieldDefinition[],
  fieldKeyAliases: Map<string, string>,
  content: Record<string, unknown> | undefined,
): FormDefinition['collectionTarget'] => {
  const configured = isPlainRecord(content?.collectionTarget) ? content.collectionTarget : undefined;
  const collectionId = optionalStringFromRecord(configured, 'collectionId');
  if (!configured?.enabled || !collectionId) return undefined;

  return normalizeFormCollectionTarget({
    enabled: true,
    collectionId,
    fieldMap: remapFrontendTemplateFieldMap(configured.fieldMap, fieldKeyAliases),
    slugField: remapFrontendTemplateFieldReference(optionalStringFromRecord(configured, 'slugField'), fieldKeyAliases),
  }, fields);
};

const buildFrontendFormTemplateBlueprint = (template: SiteFrontendDesignTemplate): FormTemplateBlueprint => {
  const content = isPlainRecord(template.content) ? template.content : undefined;
  const fieldImport = frontendTemplateFieldsFromContent(content);
  const fields = fieldImport.fields;
  const normalizedFields = fields.length > 0 ? fields : defaultFrontendTemplateFields();
  const fieldKeyAliases = fields.length > 0
    ? fieldImport.fieldKeyAliases
    : frontendTemplateFieldAliasesFromFields(normalizedFields);
  const pageTemplate = optionalStringFromRecord(content, 'pageTemplate');
  const contactShare = normalizeFormContactShare(
    inferFrontendTemplateContactShare(normalizedFields, fieldKeyAliases, content),
    normalizedFields,
  );
  const collectionTarget = inferFrontendTemplateCollectionTarget(normalizedFields, fieldKeyAliases, content);

  return {
    id: `frontend-${normalizeFieldKey(template.id) || 'form'}`,
    title: optionalStringFromRecord(content, 'title') || `${template.name} form`,
    description: template.description || optionalStringFromRecord(content, 'description') || 'Form seeded from the connected frontend design contract.',
    pageTemplate: pageTemplate === 'landing' || pageTemplate === 'storefront' || pageTemplate === 'registration' ? pageTemplate : 'contact',
    audience: content?.audience === 'authenticated' || content?.audience === 'adminOnly' ? content.audience : 'public',
    moderationMode: content?.moderationMode === 'auto-approve' ? 'auto-approve' : 'manual',
    successMessage: optionalStringFromRecord(content, 'successMessage') || 'Thanks. We received your submission.',
    fields: normalizedFields,
    contactShare: contactShare?.enabled ? contactShare : undefined,
    collectionTarget: collectionTarget?.enabled ? collectionTarget : undefined,
    frontendFieldKeyMap: frontendTemplateFieldKeyMapFromAliases(fieldKeyAliases),
  };
};

const buildFrontendFormTemplateSettings = (
  template: SiteFrontendDesignTemplate,
  frontendDesign: SiteFrontendDesignContract | null,
  frontendFieldKeyMap?: Record<string, string>,
): Record<string, unknown> => ({
  frontendDesignTemplateId: template.id,
  frontendDesignTemplateName: template.name,
  frontendDesignSource: frontendDesign?.source,
  frontendDesignBindingHints: template.bindingHints || [],
  ...(frontendFieldKeyMap ? { frontendFieldKeyMap } : {}),
  ...(template.routePattern ? { frontendDesignRoutePattern: template.routePattern } : {}),
  ...(frontendDesign?.tokens ? { frontendDesignTokens: frontendDesign.tokens } : {}),
  ...(frontendDesign?.chrome ? { frontendDesignChrome: frontendDesign.chrome } : {}),
  ...(frontendDesign?.tokens?.customCss ? { frontendDesignCustomCss: frontendDesign.tokens.customCss } : {}),
});

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
  const allowedValidationTypes = new Set(validationTypesForFieldType(normalizeFormFieldType(field.type)));

  (field.validation || []).forEach((rule) => {
    const ruleRecord = isPlainRecord(rule) ? rule : null;
    if (!ruleRecord) {
      return;
    }

    const type = optionalStringFromRecord(ruleRecord, 'type') as FormValidationRuleType;
    const definition = FORM_VALIDATION_RULES.find((candidate) => candidate.type === type);
    if (!allowedValidationTypes.has(type) || !definition) {
      return;
    }

    if (!formValidationRuleHasValue({ value: ruleRecord.value as string | number | undefined })) {
      return;
    }

    const value = definition.valueMode === 'number'
      ? Number(ruleRecord.value)
      : String(ruleRecord.value).trim();

    if (definition.valueMode === 'number' && !Number.isFinite(value)) {
      return;
    }

    rules.push({
        type,
        value,
        message: optionalStringFromRecord(ruleRecord, 'message') || defaultValidationMessage(field.label, type),
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
  const fieldMap = Object.fromEntries(form.fields.map((field) => {
    const normalizedFieldKey = field.key.toLowerCase();
    const normalizedFieldLabel = field.label.toLowerCase();
    const matched = collectionFields.find((collectionField) => (
      collectionField.key.toLowerCase() === normalizedFieldKey ||
      collectionField.label.toLowerCase() === normalizedFieldLabel
    ));

    return [field.key, matched?.key || ''];
  }));
  return normalizeFormCollectionFieldMap(fieldMap, form.fields);
};

const buildFormUpdatePayload = (form: FormDefinition) => {
  const contactShare = normalizeFormContactShare(form.contactShare, form.fields);
  const collectionTarget = normalizeFormCollectionTarget(form.collectionTarget, form.fields);

  return {
    ...(() => {
      const spamSettings = readFormSpamSettings(form);
      const consentSettings = readFormConsentSettings(form);
      return {
        spamSettings,
        consentSettings,
        settings: {
          ...(form.settings || {}),
          spam: spamSettings,
          consent: consentSettings,
        },
      };
    })(),
    name: form.name.trim(),
    title: normalizeOptionalText(form.title),
    description: normalizeOptionalText(form.description),
    audience: form.audience,
    isActive: form.isActive,
    fields: form.fields.map((field, index) => {
      const type = normalizeFormFieldType(field.type);
      const options = formFieldTypeSupportsOptions(type) ? normalizeFormFieldOptions(field.options) : undefined;
      const defaultValue = normalizeFormFieldDefaultValue(field.defaultValue, type, options);
      const validation = normalizeValidationRules({ ...field, type });

      return {
        key: normalizeFieldKey(field.key) || `field_${index + 1}`,
        label: field.label.trim() || `Field ${index + 1}`,
        type,
        required: Boolean(field.required),
        ...(normalizeOptionalText(field.placeholder) ? { placeholder: normalizeOptionalText(field.placeholder) || undefined } : {}),
        ...(normalizeOptionalText(field.helpText) ? { helpText: normalizeOptionalText(field.helpText) || undefined } : {}),
        ...(defaultValue ? { defaultValue } : {}),
        ...(options ? { options } : {}),
        ...(validation ? { validation } : {}),
      };
    }),
    notificationEmail: normalizeOptionalText(form.notificationEmail),
    notificationWebhook: normalizeOptionalText(form.notificationWebhook),
    successRedirectUrl: normalizeOptionalText(form.successRedirectUrl),
    successMessage: normalizeOptionalText(form.successMessage),
    enableHoneypot: form.enableHoneypot !== false,
    enableCaptcha: form.enableCaptcha === true,
    moderationMode: form.moderationMode || 'manual',
    contactShare: contactShare?.enabled ? contactShare : { enabled: false },
    collectionTarget: collectionTarget?.enabled
      ? collectionTarget
      : { enabled: false, collectionId: collectionTarget?.collectionId || '', fieldMap: collectionTarget?.fieldMap || {} },
  };
};

const formatSubmissionValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatSubmissionValue).join(', ');
  return JSON.stringify(value);
};

const CONSENT_FIELD_PATTERN = /\b(consent|agree|agreement|terms|privacy|permission|subscribe|opt[-_ ]?in)\b/i;

const isConsentField = (field: FormFieldDefinition): boolean => (
  field.type === 'checkbox' && CONSENT_FIELD_PATTERN.test([field.key, field.label, field.helpText].filter(Boolean).join(' '))
);

const isConsentGranted = (value: unknown): boolean => (
  value === true ||
  value === 1 ||
  (typeof value === 'string' && ['true', '1', 'yes', 'on', 'accepted', 'agree', 'agreed'].includes(value.trim().toLowerCase()))
);

const buildSampleContactShareOverride = (
  form: Pick<FormDefinition, 'contactShare' | 'fields'>,
): Record<string, unknown> | undefined => {
  const contactShare = normalizeFormContactShare(form.contactShare, form.fields);
  const hasIdentityMapping = Boolean(contactShare?.nameField || contactShare?.emailField || contactShare?.phoneField);
  if (!contactShare?.enabled || !hasIdentityMapping) return undefined;

  return {
    enabled: true,
    ...(contactShare.nameField ? { nameField: contactShare.nameField } : {}),
    ...(contactShare.emailField ? { emailField: contactShare.emailField } : {}),
    ...(contactShare.phoneField ? { phoneField: contactShare.phoneField } : {}),
    ...(contactShare.notesField ? { notesField: contactShare.notesField } : {}),
    dedupeByEmail: contactShare.dedupeByEmail,
  };
};

const buildSampleSubmissionPayload = (form: FormDefinition) => {
  const contactShareOverride = buildSampleContactShareOverride(form);

  return {
    values: Object.fromEntries(form.fields.map((field) => [field.key, sampleFormFieldValue(field)])),
    requestId: `web-${form.id}-request`,
    startedAt: Date.now() - 8000,
    ...(form.pageId ? { pageId: form.pageId } : {}),
    ...(form.postId ? { postId: form.postId } : {}),
    ...(contactShareOverride ? {
      contactShareOverride: {
        ...contactShareOverride,
      },
    } : {}),
  };
};

const sampleFormFieldValue = (field: FormDefinition['fields'][number]): unknown => {
  const type = normalizeFormFieldType(field.type);
  const defaultValue = normalizeFormFieldDefaultValue(field.defaultValue, type, normalizeFormFieldOptions(field.options));
  if (defaultValue) return defaultValue;

  switch (type) {
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
      return normalizeFormFieldOptions(field.options)?.[0] || 'Option 1';
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
  const contactShare = normalizeFormContactShare(template.contactShare, template.fields);
  const collectionTarget = normalizeFormCollectionTarget(template.collectionTarget, template.fields);
  const contactShareOverride = buildSampleContactShareOverride({ ...template, contactShare });
  const samplePayload = {
    values: Object.fromEntries(template.fields.map((field) => [field.key, sampleFormFieldValue(field)])),
    requestId: `web-${template.id}-request`,
    startedAt: Date.now() - 8000,
    ...(contactShareOverride ? { contactShareOverride } : {}),
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
    contactShare: contactShare?.enabled ? contactShare : undefined,
    collectionTarget: collectionTarget?.enabled ? collectionTarget : undefined,
    frontendFieldKeyMap: template.frontendFieldKeyMap,
    fields: template.fields,
    editorFormBlockProps: {
      formId: `form-{pageSlug}-${template.id}`,
      formName: `{pageSlug}-${template.id}`,
      formTitle: template.title,
      formDescription: template.description,
      formActive: true,
      formAudience: template.audience,
      fields: template.fields,
      frontendFieldKeyMap: template.frontendFieldKeyMap,
      successMessage: template.successMessage,
      enableHoneypot: true,
      enableCaptcha: false,
      moderationMode: template.moderationMode,
      contactShareEnabled: Boolean(contactShare?.enabled),
      contactShareNameField: contactShare?.nameField,
      contactShareEmailField: contactShare?.emailField,
      contactSharePhoneField: contactShare?.phoneField,
      contactShareNotesField: contactShare?.notesField,
      contactShareDedupeByEmail: contactShare?.dedupeByEmail,
      collectionWriteEnabled: Boolean(collectionTarget?.enabled),
      collectionWriteCollectionId: collectionTarget?.collectionId,
      collectionWriteSlugField: collectionTarget?.slugField,
      collectionWriteFieldMap: collectionTarget?.fieldMap,
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
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
