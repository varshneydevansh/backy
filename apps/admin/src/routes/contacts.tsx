import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Code2,
  Contact,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  GitMerge,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  applyContactConsentRetention,
  createFormContact,
  deleteContactSavedList,
  getAdminApiBase,
  getUserPermissions,
  importFormContactsCsv,
  listAdminAuditLogs,
  listContactSavedLists,
  listContactSegments,
  listFormContacts,
  promoteContactToCustomer,
  promoteContactToUser,
  saveContactSavedList,
  syncFormContacts,
  listForms,
  updateContact,
  type AdminAuditLog,
  type AdminContact,
  type AdminUserPermissionMatrix,
  type ContactConsentRetentionResult,
  type ContactSyncDelivery,
  type ContactSavedList,
  type ContactSegmentAnalytics,
  type ContactStatus,
  type FormDefinition,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

type ContactStatusFilter = ContactStatus | 'all';
type ContactQualityFilter = 'all' | 'missing-email' | 'missing-phone' | 'needs-notes' | 'has-source-values' | 'ready-to-promote' | 'duplicate-email';
type ContactsPermissionKey =
  | 'forms.view'
  | 'forms.manage'
  | 'forms.export'
  | 'activity.export'
  | 'users.view'
  | 'users.create'
  | 'collections.edit'
  | 'pages.edit'
  | 'settings.view';

interface ContactsSearch {
  siteId?: string;
  formId?: string;
  status?: ContactStatusFilter;
  quality?: ContactQualityFilter;
  q?: string;
}

const CONTACT_STATUS_FILTERS: ContactStatusFilter[] = ['all', 'new', 'contacted', 'qualified', 'archived'];
const CONTACT_QUALITY_FILTERS: ContactQualityFilter[] = ['all', 'missing-email', 'missing-phone', 'needs-notes', 'has-source-values', 'ready-to-promote', 'duplicate-email'];
const CONTACT_IMPORT_COLUMNS = ['name', 'email', 'phone', 'status', 'notes', 'sourceValues'] as const;
const CONTACT_PROMOTION_SOURCE_KEY = '__backyPromotion';
const CONTACT_CUSTOMER_PROMOTION_SOURCE_KEY = '__backyCustomerPromotion';
const CONTACT_ACCESS_PERMISSIONS = [
  { key: 'forms.view', detail: 'Load source forms, private contacts, segments, and saved lead lists.' },
  { key: 'forms.manage', detail: 'Create, update, import, promote, sync, merge, and apply contact retention.' },
  { key: 'forms.export', detail: 'Export lead CSV files and contact consent evidence.' },
  { key: 'activity.export', detail: 'Read contact, form, and settings audit activity for this site.' },
] as const;
const CONTACTS_PERMISSION_ROLE_DEFAULTS: Record<ContactsPermissionKey, Array<AuthUser['role']>> = {
  'forms.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.manage': ['owner', 'admin', 'editor'],
  'forms.export': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
  'users.view': ['owner', 'admin'],
  'users.create': ['owner', 'admin'],
  'collections.edit': ['owner', 'admin', 'editor'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'settings.view': ['owner', 'admin'],
};

const normalizeContactEmail = (value?: string | null) => value?.trim().toLowerCase() || '';

type ContactPromotionMetadata = {
  target?: string;
  userId?: string;
  email?: string;
  role?: string;
  status?: string;
  existingUser?: boolean;
  promotedAt?: string;
  inviteUrl?: string;
};

type ContactCustomerPromotionMetadata = {
  target?: string;
  collectionId?: string;
  collectionSlug?: string;
  recordId?: string;
  recordSlug?: string;
  email?: string;
  existingRecord?: boolean;
  createdCollection?: boolean;
  promotedAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const getContactPromotion = (contact: AdminContact): ContactPromotionMetadata | null => {
  const promotion = contact.sourceValues?.[CONTACT_PROMOTION_SOURCE_KEY];
  return isRecord(promotion) ? promotion as ContactPromotionMetadata : null;
};

const getContactCustomerPromotion = (contact: AdminContact): ContactCustomerPromotionMetadata | null => {
  const promotion = contact.sourceValues?.[CONTACT_CUSTOMER_PROMOTION_SOURCE_KEY];
  return isRecord(promotion) ? promotion as ContactCustomerPromotionMetadata : null;
};

const isContactStatusFilter = (value: unknown): value is ContactStatusFilter => (
  typeof value === 'string' && CONTACT_STATUS_FILTERS.includes(value as ContactStatusFilter)
);

const isContactQualityFilter = (value: unknown): value is ContactQualityFilter => (
  typeof value === 'string' && CONTACT_QUALITY_FILTERS.includes(value as ContactQualityFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/contacts')({
  validateSearch: (search: Record<string, unknown>): ContactsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    formId: normalizedSearchString(search.formId),
    status: isContactStatusFilter(search.status) ? search.status : undefined,
    quality: isContactQualityFilter(search.quality) ? search.quality : undefined,
    q: normalizedSearchString(search.q),
  }),
  component: ContactsRoute,
});

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

const CONTACT_WORKFLOW_SURFACES = [
  {
    key: 'forms',
    title: 'Forms',
    detail: 'Design public lead forms, enable contact sharing, and map submitted fields into CRM identity records.',
    route: '/forms',
  },
  {
    key: 'contactPage',
    title: 'Contact page',
    detail: 'Seed an editable page with a connected contact form block for public inquiries and service requests.',
    route: '/pages/new',
    template: 'contact',
  },
  {
    key: 'registrationPage',
    title: 'Registration page',
    detail: 'Create account/signup pages that capture member leads before auth provider credentials are wired.',
    route: '/pages/new',
    template: 'registration',
  },
  {
    key: 'users',
    title: 'Users',
    detail: 'Promote captured members into role-scoped users, collaborators, editors, or private audience accounts.',
    route: '/users',
  },
  {
    key: 'settings',
    title: 'Settings',
    detail: 'Connect runtime database, auth, and provider infrastructure before production lead capture.',
    route: '/settings',
  },
] as const;

const CONTACT_PROMOTION_REQUIREMENTS = [
  {
    key: 'identity',
    title: 'Identity ready',
    detail: 'A promotable lead needs at least an email or phone plus consent/source values from the originating form.',
  },
  {
    key: 'qualification',
    title: 'Qualified lifecycle',
    detail: 'Use qualified status when a contact is ready for membership, sales follow-up, or collaborator review.',
  },
  {
    key: 'destination',
    title: 'Destination chosen',
    detail: 'Promote through Users for workspace access, Contacts for CRM follow-up, or Collections for public member profiles.',
  },
  {
    key: 'auth',
    title: 'Auth provider pending',
    detail: 'Credentialed member sessions, password reset, and protected portal APIs still belong to the Users/Auth integration pass.',
  },
] as const;

interface ContactInbox {
  form: FormDefinition;
  contacts: AdminContact[];
  total: number;
}

function ContactsRoute() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [contactsByForm, setContactsByForm] = useState<Record<string, ContactInbox>>({});
  const [contactSegments, setContactSegments] = useState<ContactSegmentAnalytics | null>(null);
  const [contactSavedLists, setContactSavedLists] = useState<ContactSavedList[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>(routeSearch.formId || 'all');
  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>(routeSearch.status || 'all');
  const [qualityFilter, setQualityFilter] = useState<ContactQualityFilter>(routeSearch.quality || 'all');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [bulkContactStatus, setBulkContactStatus] = useState<ContactStatus>('contacted');
  const [contactDraft, setContactDraft] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'new' as ContactStatus,
    notes: '',
  });
  const [savedListName, setSavedListName] = useState('');
  const [contactSyncTarget, setContactSyncTarget] = useState('');
  const [lastContactSync, setLastContactSync] = useState<ContactSyncDelivery | null>(null);
  const [contactRetentionDays, setContactRetentionDays] = useState('0');
  const [lastContactRetention, setLastContactRetention] = useState<ContactConsentRetentionResult | null>(null);
  const [contactAuditLogs, setContactAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingContactAudit, setIsLoadingContactAudit] = useState(false);
  const [contactAuditError, setContactAuditError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contactImportInputRef = useRef<HTMLInputElement | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewForms = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'forms.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canManageForms = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'forms.manage', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canExportForms = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'forms.export', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canExportActivity = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canViewUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canCreateUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.create', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canEditCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canEditPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const canViewSettings = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'settings.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.manage', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const exportPermissionTitle = canExportForms ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.export', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const usersViewPermissionTitle = canViewUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const usersCreatePermissionTitle = canCreateUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.create', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const collectionsEditPermissionTitle = canEditCollections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'collections.edit', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const pagesEditPermissionTitle = canEditPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const settingsViewPermissionTitle = canViewSettings ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'settings.view', CONTACTS_PERMISSION_ROLE_DEFAULTS);
  const isContactMutationBusy = updatingId !== null;
  const isContactsBusy = isLoading || isContactMutationBusy || isPermissionMatrixPending;
  const contactViewDisabled = isContactsBusy || !canViewForms;
  const contactMutationDisabled = isContactsBusy || !canManageForms;
  const contactExportDisabled = isContactsBusy || !canExportForms;
  const contactAuditDisabled = isLoadingContactAudit || isPermissionMatrixPending || !canExportActivity;

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const adminBaseUrl = useMemo(() => getAdminApiBase(), []);
  const formById = useMemo(() => new Map(forms.map((form) => [form.id, form])), [forms]);
  const apiForm = useMemo(
    () => selectedFormId === 'all' ? null : forms.find((form) => form.id === selectedFormId) || null,
    [forms, selectedFormId],
  );
  const contactsUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts?limit=100`
    : '';
  const contactUpdateUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/{contactId}`
    : '';
  const contactPromoteUserUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/{contactId}/promote`
    : '';
  const contactPromoteCustomerUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/{contactId}/promote-customer`
    : '';
  const contactSyncUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/sync`
    : '';
  const contactConsentRetentionUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/consent-retention`
    : '';
  const contactCreateUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts`
    : '';
  const contactImportUrl = apiForm
    ? `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(apiForm.id)}/contacts/import?upsertByEmail=true`
    : '';
  const contactSegmentsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/contact-segments${apiForm ? `?formId=${encodeURIComponent(apiForm.id)}` : ''}`;
  const contactListsUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/contact-lists`;
  const allContacts = useMemo(
    () => Object.values(contactsByForm).flatMap((inbox) => inbox.contacts),
    [contactsByForm],
  );
  const duplicateEmailGroups = useMemo(() => {
    const groups = new Map<string, AdminContact[]>();
    allContacts.forEach((contact) => {
      const email = normalizeContactEmail(contact.email);
      if (!email || contact.status === 'archived') return;
      groups.set(email, [...(groups.get(email) || []), contact]);
    });

    return Array.from(groups.entries())
      .map(([email, contacts]) => ({ email, contacts }))
      .filter((group) => group.contacts.length > 1)
      .sort((left, right) => right.contacts.length - left.contacts.length || left.email.localeCompare(right.email));
  }, [allContacts]);
  const duplicateEmailSet = useMemo(() => new Set(duplicateEmailGroups.map((group) => group.email)), [duplicateEmailGroups]);
  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return allContacts.filter((contact) => {
      const form = formById.get(contact.formId);
      const matchesForm = selectedFormId === 'all' || contact.formId === selectedFormId;
      const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
      if (!matchesForm || !matchesStatus) return false;

      const hasEmail = Boolean(contact.email?.trim());
      const hasPhone = Boolean(contact.phone?.trim());
      const hasNotes = Boolean(contact.notes?.trim());
      const hasSourceValues = Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0);

      if (qualityFilter === 'missing-email' && hasEmail) return false;
      if (qualityFilter === 'missing-phone' && hasPhone) return false;
      if (qualityFilter === 'needs-notes' && hasNotes) return false;
      if (qualityFilter === 'has-source-values' && !hasSourceValues) return false;
      if (qualityFilter === 'ready-to-promote' && (contact.status !== 'qualified' || !hasEmail)) return false;
      if (qualityFilter === 'duplicate-email' && !duplicateEmailSet.has(normalizeContactEmail(contact.email))) return false;

      const matchesSearch = !normalizedSearch || [
        contact.name,
        contact.email,
        contact.phone,
        contact.notes,
        contact.requestId,
        form?.title,
        form?.name,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesSearch;
    });
  }, [allContacts, duplicateEmailSet, formById, qualityFilter, searchQuery, selectedFormId, statusFilter]);
  const hasActiveContactFilters = Boolean(
    searchQuery.trim() ||
    selectedFormId !== 'all' ||
    statusFilter !== 'all' ||
    qualityFilter !== 'all',
  );
  const selectedContactSet = useMemo(() => new Set(selectedContactIds), [selectedContactIds]);
  const selectedContacts = useMemo(() => (
    allContacts.filter((contact) => selectedContactSet.has(contact.id))
  ), [allContacts, selectedContactSet]);
  const selectedMergeEmail = useMemo(() => {
    const emails = Array.from(new Set(selectedContacts.map((contact) => normalizeContactEmail(contact.email)).filter(Boolean)));
    return emails.length === 1 && selectedContacts.length > 1 ? emails[0] : '';
  }, [selectedContacts]);
  const canMergeSelectedContacts = Boolean(selectedMergeEmail);
  const allVisibleContactsSelected = filteredContacts.length > 0
    && filteredContacts.every((contact) => selectedContactSet.has(contact.id));
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
  const backendSegmentsById = useMemo(() => new Map(
    (contactSegments?.segments || []).map((segment) => [segment.id, segment]),
  ), [contactSegments]);
  const backendSegmentHighlights = useMemo(() => (
    ['ready-to-promote', 'duplicate-email', 'missing-email', 'needs-notes'] as const
  ).map((id) => backendSegmentsById.get(id)).filter((segment): segment is NonNullable<typeof segment> => Boolean(segment)), [backendSegmentsById]);
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
      {
        label: 'Dedupe queue',
        detail: duplicateEmailGroups.length > 0
          ? `${duplicateEmailGroups.length} duplicate email group${duplicateEmailGroups.length === 1 ? '' : 's'} need merge review.`
          : 'No duplicate email groups in the active lead pipeline.',
        ready: duplicateEmailGroups.length === 0,
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
  }, [apiForm, duplicateEmailGroups.length, forms.length, metrics.archived, metrics.contacts, metrics.new, metrics.qualified]);
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
    const duplicateCount = duplicateEmailGroups.filter((group) => group.contacts.some((contact) => contact.formId === apiForm.id)).length;
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
      {
        label: 'Dedupe',
        detail: duplicateCount > 0
          ? `${duplicateCount} duplicate group${duplicateCount === 1 ? '' : 's'} need merge review.`
          : 'No duplicate email groups for this form.',
        ready: duplicateCount === 0,
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
  }, [apiForm, contactsByForm, duplicateEmailGroups]);
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
      selectedCreate: contactCreateUrl,
      selectedImport: contactImportUrl,
      formContacts: forms.map((form) => ({
        formId: form.id,
        label: form.title || form.name || form.id,
        list: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts?limit=100`,
        update: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/{contactId}`,
        promoteUser: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/{contactId}/promote`,
        promoteCustomer: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/{contactId}/promote-customer`,
        sync: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/sync`,
        consentRetention: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/consent-retention`,
        create: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts`,
        import: `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/${encodeURIComponent(form.id)}/contacts/import?upsertByEmail=true`,
      })),
      segments: contactSegmentsUrl,
      savedLists: contactListsUrl,
    },
    controlRoutes: {
      forms: `/forms?siteId=${encodeURIComponent(activeSiteId)}`,
      contactPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=contact`,
      registrationPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=registration`,
      users: `/users?siteId=${encodeURIComponent(activeSiteId)}`,
      settings: '/settings',
    },
    promotion: {
      model: 'Contacts are the review layer between public registration/contact forms and private users, CRM follow-up, or member profile collections.',
      requirements: CONTACT_PROMOTION_REQUIREMENTS,
      readyToPromote: allContacts.filter((contact) => contact.status === 'qualified' && Boolean(normalizeContactEmail(contact.email))).length,
      promotedUsers: allContacts.filter((contact) => Boolean(getContactPromotion(contact)?.userId)).length,
      promotedCustomers: allContacts.filter((contact) => Boolean(getContactCustomerPromotion(contact)?.recordId)).length,
      duplicateEmailGroups: duplicateEmailGroups.length,
      nextActions: [
        'Mark high-intent contacts as qualified.',
        'Merge duplicate email groups before exporting or promoting a record.',
        'Use Users for Backy workspace access; use Collections for public/member profile data.',
        'Connect Supabase/Auth infrastructure before issuing credentialed member sessions.',
      ],
    },
    readiness: {
      score: commandReadiness.score,
      checks: commandReadiness.checks,
    },
    metrics,
    backendSegments: contactSegments ? {
      summary: contactSegments.summary,
      segments: contactSegments.segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        kind: segment.kind,
        count: segment.count,
        formIds: segment.formIds,
      })),
    } : null,
    savedLists: contactSavedLists.map((list) => ({
      id: list.id,
      name: list.name,
      filters: list.filters,
      matchedCount: list.matchedCount,
      formIds: list.formIds,
    })),
    lifecycleStates: ['new', 'contacted', 'qualified', 'archived'],
    sync: {
      selectedEndpoint: contactSyncUrl,
      lastStatus: lastContactSync?.status || null,
      lastCount: lastContactSync?.count || 0,
      lastTarget: lastContactSync?.target || null,
    },
    retention: {
      selectedEndpoint: contactConsentRetentionUrl,
      retentionDays: Number.parseInt(contactRetentionDays, 10) || 0,
      lastScanned: lastContactRetention?.scanned || 0,
      lastDue: lastContactRetention?.due || 0,
      lastAnonymized: lastContactRetention?.anonymized || 0,
      consentFieldKeys: lastContactRetention?.consentFieldKeys || [],
    },
    access: {
      permissions: CONTACT_ACCESS_PERMISSIONS,
      auditLogCount: contactAuditLogs.length,
      auditActions: Array.from(new Set(contactAuditLogs.map((log) => log.action))),
    },
    filters: {
      formId: selectedFormId,
      status: statusFilter,
      quality: qualityFilter,
      query: searchQuery.trim(),
      visible: filteredContacts.length,
      total: allContacts.length,
    },
    selection: {
      selected: selectedContactIds.length,
      selectedIds: selectedContactIds,
      allVisibleSelected: allVisibleContactsSelected,
      bulkStatus: bulkContactStatus,
      mergeEmail: selectedMergeEmail || null,
      canMerge: canMergeSelectedContacts,
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
      filteredRows: filteredContacts.length,
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
    duplicates: duplicateEmailGroups.map((group) => ({
      email: group.email,
      count: group.contacts.length,
      contactIds: group.contacts.map((contact) => contact.id),
      formIds: Array.from(new Set(group.contacts.map((contact) => contact.formId))),
    })),
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
    allVisibleContactsSelected,
    apiForm,
    bulkContactStatus,
    canMergeSelectedContacts,
    contactConsentRetentionUrl,
    contactCreateUrl,
    contactImportUrl,
    contactListsUrl,
    contactRetentionDays,
    contactSyncUrl,
    contactPromoteCustomerUrl,
    contactAuditLogs,
    contactSavedLists,
    contactSegments,
    contactSegmentsUrl,
    commandReadiness.checks,
    commandReadiness.score,
    contactPromoteUserUrl,
    contactUpdateUrl,
    contactsByForm,
    contactsUrl,
    duplicateEmailGroups,
    exportSourceKeys,
    filteredContacts.length,
    forms,
    metrics,
    lastContactSync,
    lastContactRetention,
    adminBaseUrl,
    qualityFilter,
    searchQuery,
    selectedContactIds,
    selectedMergeEmail,
    selectedFormId,
    statusFilter,
  ]);
  const contactHandoffText = useMemo(() => JSON.stringify(contactHandoff, null, 2), [contactHandoff]);
  const contactsRouteSearch = useMemo<ContactsSearch>(() => ({
    siteId: activeSiteId,
    ...(selectedFormId !== 'all' ? { formId: selectedFormId } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(qualityFilter !== 'all' ? { quality: qualityFilter } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
  }), [activeSiteId, qualityFilter, searchQuery, selectedFormId, statusFilter]);

  const updateContactsRouteSearch = (next: ContactsSearch) => {
    if (isContactsBusy) return;

    const merged: ContactsSearch = {
      ...contactsRouteSearch,
      ...next,
    };
    const normalized: ContactsSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.formId && merged.formId !== 'all' ? { formId: merged.formId } : {}),
      ...(merged.status && merged.status !== 'all' ? { status: merged.status } : {}),
      ...(merged.quality && merged.quality !== 'all' ? { quality: merged.quality } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
    };

    navigate({ to: '/contacts', search: normalized, replace: true });
  };

  const showPermissionDenied = (key: ContactsPermissionKey, action: string) => {
    setNotice(null);
    setError(`Your account needs ${key} to ${action}. ${adminPermissionReason(permissionMatrix, currentAdmin, key, CONTACTS_PERMISSION_ROLE_DEFAULTS)}`);
  };

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError('Sign in with an admin account to load contact permissions.');
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    setPermissionError(null);
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
          setPermissionError(loadError instanceof Error ? loadError.message : 'Unable to load contact permissions.');
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

  const loadContacts = async () => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      setForms([]);
      setContactsByForm({});
      setContactSegments(null);
      setContactSavedLists([]);
      setSelectedContactIds([]);
      setError(viewPermissionTitle || 'Your account cannot view contact pipelines.');
      setNotice(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [loadedForms, loadedSegments, loadedSavedLists] = await Promise.all([
        listForms(activeSiteId),
        listContactSegments(activeSiteId),
        listContactSavedLists(activeSiteId),
      ]);
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
      setContactSegments(loadedSegments);
      setContactSavedLists(loadedSavedLists);
      const loadedContactIds = new Set(inboxPairs.flatMap(([, inbox]) => inbox.contacts.map((contact) => contact.id)));
      setSelectedContactIds((current) => current.filter((id) => loadedContactIds.has(id)));
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

  const loadContactAuditLogs = async () => {
    if (isPermissionMatrixPending) return;
    if (!canExportActivity) {
      setContactAuditLogs([]);
      setContactAuditError(activityPermissionTitle || 'Your account cannot read contact audit activity.');
      return;
    }

    setIsLoadingContactAudit(true);
    setContactAuditError(null);

    try {
      const result = await listAdminAuditLogs({ siteId: activeSiteId, limit: 40 });
      setContactAuditLogs(result.logs.filter(isContactAuditLog).slice(0, 8));
    } catch (auditError) {
      setContactAuditLogs([]);
      setContactAuditError(auditError instanceof Error ? auditError.message : 'Unable to load contact audit activity.');
    } finally {
      setIsLoadingContactAudit(false);
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

    setSearchQuery(routeSearch.q || '');
    setSelectedFormId(routeSearch.formId || 'all');
    setStatusFilter(routeSearch.status || 'all');
    setQualityFilter(routeSearch.quality || 'all');
    setSelectedContactIds([]);
  }, [
    routeSearch.formId,
    routeSearch.q,
    routeSearch.quality,
    routeSearch.siteId,
    routeSearch.status,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    if (!isPermissionMatrixPending) {
      void loadContacts();
      void loadContactAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewForms, canExportActivity, isPermissionMatrixPending]);

  const handleStatus = async (contact: AdminContact, status: ContactStatus) => {
    if (isContactsBusy || contact.status === status) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'update contact lifecycle state');
      return;
    }

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

  const updateContactInState = (updated: AdminContact) => {
    setContactsByForm((current) => {
      const inbox = current[updated.formId];
      if (!inbox) return current;

      return {
        ...current,
        [updated.formId]: {
          ...inbox,
          contacts: inbox.contacts.map((item) => (item.id === updated.id ? updated : item)),
        },
      };
    });
  };

  const toggleContactSelection = (contactId: string, selected: boolean) => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'select contacts');
      return;
    }

    setSelectedContactIds((current) => (
      selected
        ? Array.from(new Set([...current, contactId]))
        : current.filter((id) => id !== contactId)
    ));
  };

  const toggleVisibleContactSelection = (selected: boolean) => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'select contacts');
      return;
    }

    const visibleIds = filteredContacts.map((contact) => contact.id);
    setSelectedContactIds((current) => {
      if (!selected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const handleBulkContactStatus = async () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'bulk update contacts');
      return;
    }

    const targets = selectedContacts.filter((contact) => contact.status !== bulkContactStatus);
    if (targets.length === 0) {
      setError(null);
      setNotice(selectedContacts.length > 0
        ? `Selected contacts are already ${bulkContactStatus}.`
        : 'Select at least one visible contact before applying a lifecycle action.');
      return;
    }

    setUpdatingId('bulk-contacts');
    setError(null);
    setNotice(null);

    try {
      const updatedContacts = await Promise.all(
        targets.map((contact) => updateContact(activeSiteId, contact.formId, contact.id, { status: bulkContactStatus })),
      );
      updatedContacts.forEach(updateContactInState);
      setSelectedContactIds([]);
      setNotice(`${updatedContacts.length} contact${updatedContacts.length === 1 ? '' : 's'} moved to ${bulkContactStatus}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update selected contacts');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSyncSelectedContacts = async () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'sync selected contacts');
      return;
    }

    const targetUrl = contactSyncTarget.trim();
    if (selectedContacts.length === 0) {
      setNotice('Select at least one visible contact before syncing.');
      setError(null);
      return;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      setNotice(null);
      setError('Enter a valid http(s) webhook URL before syncing selected contacts.');
      return;
    }

    const contactsBySourceForm = selectedContacts.reduce((groups, contact) => {
      groups.set(contact.formId, [...(groups.get(contact.formId) || []), contact]);
      return groups;
    }, new Map<string, AdminContact[]>());

    setUpdatingId('sync-contacts');
    setError(null);
    setNotice(null);

    try {
      const results = await Promise.allSettled(
        Array.from(contactsBySourceForm.entries()).map(([formId, contacts]) => (
          syncFormContacts(activeSiteId, formId, {
            contactIds: contacts.map((contact) => contact.id),
            targetUrl,
            includeSourceValues: true,
            reason: 'manual-admin-sync',
          })
        )),
      );
      const fulfilled = results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof syncFormContacts>>> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failed = results.filter((result) => result.status === 'rejected');
      const syncedCount = fulfilled.reduce((sum, result) => sum + result.delivery.count, 0);
      const failedCount = failed.length;
      const lastDelivery = fulfilled.at(-1)?.delivery || null;

      setLastContactSync(lastDelivery
        ? {
          ...lastDelivery,
          count: syncedCount,
          status: failedCount > 0 || fulfilled.some((result) => result.delivery.status === 'failed') ? 'failed' : lastDelivery.status,
        }
        : {
          target: targetUrl,
          status: 'failed',
          count: 0,
          contactIds: [],
          error: failed[0]?.reason instanceof Error ? failed[0].reason.message : 'Unable to sync contacts',
        });
      if (failedCount > 0) {
        setError(`${failedCount} contact source ${failedCount === 1 ? 'form' : 'forms'} failed to sync.`);
      } else {
        setNotice(`Synced ${syncedCount} selected contact${syncedCount === 1 ? '' : 's'} to webhook.`);
      }
      void loadContactAuditLogs();
    } finally {
      setUpdatingId(null);
    }
  };

  const parseRetentionDays = () => {
    const parsed = Number.parseInt(contactRetentionDays, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const combineContactRetentionResults = (
    results: ContactConsentRetentionResult[],
    dryRun: boolean,
  ): ContactConsentRetentionResult => ({
    formId: results.length === 1 ? results[0].formId : 'multiple',
    dryRun,
    policy: results.at(-1)?.policy || { deleteAfterDays: parseRetentionDays(), now: new Date().toISOString() },
    consentFieldKeys: Array.from(new Set(results.flatMap((result) => result.consentFieldKeys))),
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    due: results.reduce((sum, result) => sum + result.due, 0),
    anonymized: results.reduce((sum, result) => sum + result.anonymized, 0),
    contacts: results.flatMap((result) => result.contacts),
  });

  const downloadContactRetentionCsv = (result: ContactConsentRetentionResult) => {
    if (!canExportForms) {
      showPermissionDenied('forms.export', 'export contact consent evidence');
      return;
    }

    const consentKeys = result.consentFieldKeys;
    const header = [
      'contact_id',
      'form_id',
      'status',
      'name',
      'email',
      'phone',
      'request_id',
      'source_submission_id',
      'source_ip_hash',
      'due',
      'due_at',
      'created_at',
      'updated_at',
      ...consentKeys.map((key) => `consent_${key}`),
    ];
    const rows = result.contacts.map((contact) => [
      contact.id,
      contact.formId,
      contact.status,
      contact.name || '',
      contact.email || '',
      contact.phone || '',
      contact.requestId || '',
      contact.sourceSubmissionId || '',
      contact.sourceIpHash || '',
      contact.due ? 'yes' : 'no',
      contact.dueAt || '',
      contact.createdAt || '',
      contact.updatedAt || '',
      ...consentKeys.map((key) => formatContactSourceValue(contact.consentValues?.[key])),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteId}-contact-consent-evidence.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleContactRetention = async (dryRun: boolean) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', dryRun ? 'scan contact consent retention' : 'apply contact retention');
      return;
    }
    if (dryRun && !canExportForms) {
      showPermissionDenied('forms.export', 'export contact consent evidence');
      return;
    }

    if (selectedContacts.length === 0) {
      setError(null);
      setNotice('Select at least one visible contact before running contact retention.');
      return;
    }

    const retentionDays = parseRetentionDays();
    const contactsBySourceForm = selectedContacts.reduce((groups, contact) => {
      groups.set(contact.formId, [...(groups.get(contact.formId) || []), contact]);
      return groups;
    }, new Map<string, AdminContact[]>());

    setUpdatingId(dryRun ? 'export-contact-retention' : 'apply-contact-retention');
    setError(null);
    setNotice(null);

    try {
      const results = await Promise.all(
        Array.from(contactsBySourceForm.entries()).map(([formId, contacts]) => (
          applyContactConsentRetention(activeSiteId, formId, {
            contactIds: contacts.map((contact) => contact.id),
            dryRun,
            retentionDays,
            actor: 'admin',
          })
        )),
      );
      const combined = combineContactRetentionResults(results, dryRun);
      setLastContactRetention(combined);

      if (dryRun) {
        downloadContactRetentionCsv(combined);
        setNotice(`Exported consent evidence for ${combined.contacts.length} selected contact${combined.contacts.length === 1 ? '' : 's'}; ${combined.due} due for retention.`);
        return;
      }

      const refreshed = await Promise.all(
        Array.from(contactsBySourceForm.keys()).map(async (formId) => {
          const form = formById.get(formId);
          if (!form) return null;
          const inbox = await listFormContacts(activeSiteId, formId, { limit: 100 });
          return { formId, form, inbox };
        }),
      );
      setContactsByForm((current) => {
        const next = { ...current };
        refreshed.forEach((entry) => {
          if (!entry) return;
          next[entry.formId] = {
            form: entry.form,
            contacts: entry.inbox.contacts,
            total: entry.inbox.count,
          };
        });
        return next;
      });
      setSelectedContactIds([]);
      setNotice(`Anonymized consent evidence for ${combined.anonymized} due contact${combined.anonymized === 1 ? '' : 's'}.`);
      void loadContactAuditLogs();
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : 'Unable to run contact retention');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMergeSelectedContacts = async () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'merge duplicate contacts');
      return;
    }

    if (!canMergeSelectedContacts) {
      setError(null);
      setNotice('Select two or more contacts with the same email before merging.');
      return;
    }

    const sortedContacts = [...selectedContacts].sort((left, right) => (
      new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
    ));
    const primary = sortedContacts[0];
    const duplicates = sortedContacts.slice(1);
    const duplicateIds = duplicates.map((contact) => contact.id);
    const mergedNotes = Array.from(new Set([
      ...sortedContacts.map((contact) => contact.notes?.trim()).filter(Boolean),
      `Merged duplicate contacts into ${primary.id}: ${duplicateIds.join(', ')}`,
    ])).join('\n');
    const mergedSourceValues = sortedContacts.reduce<Record<string, unknown>>((values, contact) => ({
      ...values,
      ...(contact.sourceValues || {}),
    }), {
      mergedAt: new Date().toISOString(),
      mergedPrimaryId: primary.id,
      mergedDuplicateIds: duplicateIds,
    });
    const preferredName = primary.name || sortedContacts.find((contact) => contact.name)?.name || null;
    const preferredPhone = primary.phone || sortedContacts.find((contact) => contact.phone)?.phone || null;

    setUpdatingId('merge-contacts');
    setError(null);
    setNotice(null);

    try {
      const updatedPrimary = await updateContact(activeSiteId, primary.formId, primary.id, {
        name: preferredName,
        email: primary.email,
        phone: preferredPhone,
        notes: mergedNotes,
        sourceValues: mergedSourceValues,
      });
      const archivedDuplicates = await Promise.all(
        duplicates.map((contact) => updateContact(activeSiteId, contact.formId, contact.id, {
          status: 'archived',
          notes: Array.from(new Set([
            contact.notes?.trim(),
            `Merged into ${updatedPrimary.id} (${updatedPrimary.email || selectedMergeEmail}).`,
          ].filter(Boolean))).join('\n'),
        })),
      );

      [updatedPrimary, ...archivedDuplicates].forEach(updateContactInState);
      setSelectedContactIds([]);
      setNotice(`${archivedDuplicates.length + 1} duplicate contacts merged for ${selectedMergeEmail}.`);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : 'Unable to merge selected contacts');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleNotes = async (contact: AdminContact, notes: string) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'save contact notes');
      return;
    }

    setUpdatingId(contact.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateContact(activeSiteId, contact.formId, contact.id, { notes: notes.trim() || null });
      updateContactInState(updated);
      setNotice(`Notes saved for ${updated.name || updated.email || 'contact'}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to save contact notes');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePromoteContactToUser = async (contact: AdminContact) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'promote contacts');
      return;
    }
    if (!canCreateUsers) {
      showPermissionDenied('users.create', 'promote contacts to users');
      return;
    }

    setUpdatingId(`promote-user-${contact.id}`);
    setError(null);
    setNotice(null);

    try {
      const result = await promoteContactToUser(activeSiteId, contact.formId, contact.id, {
        role: 'viewer',
        status: 'invited',
        createInvite: true,
      });
      updateContactInState(result.contact);
      setNotice(result.invite?.inviteUrl
        ? `Promoted ${result.user.email} to an invited user. Invite link is ready in the contact metadata.`
        : `Promoted ${result.user.email} to ${result.existingUser ? 'an existing' : 'a new'} user account.`);
      void loadContactAuditLogs();
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : 'Unable to promote contact to user');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePromoteContactToCustomer = async (contact: AdminContact) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'promote contacts');
      return;
    }
    if (!canEditCollections) {
      showPermissionDenied('collections.edit', 'promote contacts to customer records');
      return;
    }

    setUpdatingId(`promote-customer-${contact.id}`);
    setError(null);
    setNotice(null);

    try {
      const result = await promoteContactToCustomer(activeSiteId, contact.formId, contact.id, {
        customerStatus: 'customer',
      });
      updateContactInState(result.contact);
      setNotice(`Promoted ${contact.email || result.record.slug} to ${result.existingRecord ? 'an existing' : 'a new'} customer profile.`);
      void loadContactAuditLogs();
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : 'Unable to promote contact to customer');
    } finally {
      setUpdatingId(null);
    }
  };

  const copyContactApiText = async (value: string, label: string) => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'copy contact API details');
      return;
    }

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
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'download contact handoff manifests');
      return;
    }

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
    if (filteredContacts.length === 0 || isContactsBusy) return;
    if (!canExportForms) {
      showPermissionDenied('forms.export', 'export contact CSV files');
      return;
    }

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

  const downloadContactImportTemplate = () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'download contact import templates');
      return;
    }

    const rows = [
      CONTACT_IMPORT_COLUMNS,
      [
        'Imported Lead',
        'lead@example.com',
        '+1 555 0199',
        'new',
        'Imported from offline event.',
        JSON.stringify({ source: 'csv', campaign: 'spring-launch' }),
      ],
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteId}-contacts-template.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Contact import template downloaded.');
  };

  const handleCreateContact = async () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'create contacts');
      return;
    }
    if (!apiForm) {
      setError(null);
      setNotice('Select one source form before creating a contact.');
      return;
    }

    const name = contactDraft.name.trim();
    const email = contactDraft.email.trim();
    const phone = contactDraft.phone.trim();
    const notes = contactDraft.notes.trim();
    if (!name && !email && !phone) {
      setNotice(null);
      setError('Contact requires a name, email, or phone.');
      return;
    }

    setUpdatingId('create-contact');
    setError(null);
    setNotice(null);

    try {
      const created = await createFormContact(activeSiteId, apiForm.id, {
        name: name || null,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
        status: contactDraft.status,
        sourceValues: { source: 'manual' },
        upsertByEmail: true,
      });
      setContactsByForm((current) => {
        const inbox = current[apiForm.id];
        if (!inbox) return current;
        const exists = inbox.contacts.some((contact) => contact.id === created.id);

        return {
          ...current,
          [apiForm.id]: {
            ...inbox,
            contacts: exists
              ? inbox.contacts.map((contact) => (contact.id === created.id ? created : contact))
              : [created, ...inbox.contacts],
            total: exists ? inbox.total : inbox.total + 1,
          },
        };
      });
      setContactDraft({ name: '', email: '', phone: '', status: 'new', notes: '' });
      setNotice(`${created.name || created.email || 'Contact'} saved to ${apiForm.title || apiForm.name}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create contact');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleImportContacts = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'import contacts');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!apiForm) {
      setError(null);
      setNotice('Select one source form before importing contacts.');
      return;
    }

    setUpdatingId('import-contacts');
    setError(null);
    setNotice(null);

    try {
      const csv = await file.text();
      const result = await importFormContactsCsv(activeSiteId, apiForm.id, csv, { upsertByEmail: true });
      const refreshed = await listFormContacts(activeSiteId, apiForm.id, { limit: 100 });
      setContactsByForm((current) => ({
        ...current,
        [apiForm.id]: {
          form: apiForm,
          contacts: refreshed.contacts,
          total: refreshed.count,
        },
      }));
      setSelectedFormId(apiForm.id);
      setNotice(`Imported ${result.created} contact${result.created === 1 ? '' : 's'}${result.updated ? ` and updated ${result.updated}` : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import contacts');
    } finally {
      setUpdatingId(null);
    }
  };

  const currentSavedListFilters = () => ({
    formId: selectedFormId,
    status: statusFilter,
    quality: qualityFilter,
    ...(searchQuery.trim() ? { query: searchQuery.trim() } : {}),
  });

  const handleSaveContactList = async () => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'save contact lists');
      return;
    }

    const name = savedListName.trim();
    if (!name) {
      setNotice(null);
      setError('Saved list requires a name.');
      return;
    }

    setUpdatingId('save-contact-list');
    setError(null);
    setNotice(null);

    try {
      const result = await saveContactSavedList(activeSiteId, {
        name,
        filters: currentSavedListFilters(),
      });
      setContactSavedLists(result.lists);
      setSavedListName('');
      setNotice(`Saved list "${result.list.name}" for ${filteredContacts.length} visible contact${filteredContacts.length === 1 ? '' : 's'}.`);
      void loadContactAuditLogs();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save contact list');
    } finally {
      setUpdatingId(null);
    }
  };

  const applyContactSavedList = (list: ContactSavedList) => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'apply contact lists');
      return;
    }

    const formId = list.filters.formId || 'all';
    const status = list.filters.status || 'all';
    const quality = list.filters.quality || 'all';
    const query = list.filters.query || '';
    setSelectedFormId(formId);
    setStatusFilter(status);
    setQualityFilter(quality);
    setSearchQuery(query);
    setSelectedContactIds([]);
    updateContactsRouteSearch({
      formId,
      status,
      quality,
      q: query || undefined,
    });
  };

  const handleDeleteContactSavedList = async (list: ContactSavedList) => {
    if (isContactsBusy) return;
    if (!canManageForms) {
      showPermissionDenied('forms.manage', 'delete contact lists');
      return;
    }

    setUpdatingId(`delete-contact-list-${list.id}`);
    setError(null);
    setNotice(null);

    try {
      await deleteContactSavedList(activeSiteId, list.id);
      setContactSavedLists((current) => current.filter((item) => item.id !== list.id));
      setNotice(`Deleted saved list "${list.name}".`);
      void loadContactAuditLogs();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete saved contact list');
    } finally {
      setUpdatingId(null);
    }
  };

  const clearContactFilters = () => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'filter contacts');
      return;
    }

    setSearchQuery('');
    setSelectedFormId('all');
    setStatusFilter('all');
    setQualityFilter('all');
    setSelectedContactIds([]);
    updateContactsRouteSearch({
      formId: undefined,
      status: undefined,
      quality: undefined,
      q: undefined,
    });
  };
  const openFormsWorkspace = () => {
    if (isContactsBusy) return;
    if (!canViewForms) {
      showPermissionDenied('forms.view', 'open forms');
      return;
    }

    navigate({ to: '/forms', search: activeSiteSearch });
  };
  const openUsersWorkspace = () => {
    if (isContactsBusy) return;
    if (!canViewUsers) {
      showPermissionDenied('users.view', 'open users');
      return;
    }

    navigate({ to: '/users', search: activeSiteSearch });
  };
  const openLeadInfrastructureSettings = () => {
    if (isContactsBusy) return;
    if (!canViewSettings) {
      showPermissionDenied('settings.view', 'open settings');
      return;
    }

    navigate({ to: '/settings', search: { tab: 'infrastructure' } });
  };
  const openLeadCapturePage = (template: 'contact' | 'registration') => {
    if (isContactsBusy) return;
    if (!canEditPages) {
      showPermissionDenied('pages.edit', 'start lead capture pages');
      return;
    }

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template } });
  };
  const openContactWorkflowSurface = (surface: typeof CONTACT_WORKFLOW_SURFACES[number]) => {
    if (surface.route === '/pages/new') {
      openLeadCapturePage(surface.template);
      return;
    }

    if (surface.route === '/forms') {
      openFormsWorkspace();
      return;
    }

    if (surface.route === '/users') {
      openUsersWorkspace();
      return;
    }

    openLeadInfrastructureSettings();
  };
  const contactWorkflowSurfaceDisabled = (surface: typeof CONTACT_WORKFLOW_SURFACES[number]) => {
    if (isContactsBusy) return true;
    if (surface.route === '/pages/new') return !canEditPages;
    if (surface.route === '/forms') return !canViewForms;
    if (surface.route === '/users') return !canViewUsers;
    return !canViewSettings;
  };
  const contactWorkflowSurfaceTitle = (surface: typeof CONTACT_WORKFLOW_SURFACES[number]) => {
    if (surface.route === '/pages/new' && !canEditPages) return pagesEditPermissionTitle;
    if (surface.route === '/forms' && !canViewForms) return viewPermissionTitle;
    if (surface.route === '/users' && !canViewUsers) return usersViewPermissionTitle;
    if (surface.route !== '/pages/new' && surface.route !== '/forms' && surface.route !== '/users' && !canViewSettings) return settingsViewPermissionTitle;
    return undefined;
  };
  const selectContactsSite = (nextSiteId: string) => {
    if (isContactsBusy) return;

    setSelectedSiteId(nextSiteId);
    setSearchQuery('');
    setSelectedFormId('all');
    setStatusFilter('all');
    setQualityFilter('all');
    setSelectedContactIds([]);
    navigate({ to: '/contacts', search: { siteId: nextSiteId }, replace: true });
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
            disabled={isContactsBusy}
            onChange={(event) => {
              selectContactsSite(event.target.value);
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
          <Button onClick={() => void loadContacts()} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
    >
      <input
        ref={contactImportInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => void handleImportContacts(event)}
        aria-label="Import contacts CSV"
      />
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}
      {permissionError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissionError}
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
              disabled={contactViewDisabled}
              title={!canViewForms ? viewPermissionTitle : undefined}
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadContactHandoff} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={handleExportContacts}
              disabled={filteredContacts.length === 0 || contactExportDisabled}
              title={!canExportForms ? exportPermissionTitle : undefined}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button variant="outline" onClick={downloadContactImportTemplate} disabled={contactMutationDisabled} title={!canManageForms ? managePermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
              CSV template
            </Button>
            <Button
              variant="outline"
              onClick={() => contactImportInputRef.current?.click()}
              disabled={!apiForm || contactMutationDisabled}
              title={!canManageForms ? managePermissionTitle : undefined}
              iconStart={<Upload className="size-4" />}
              data-testid="contacts-import-csv"
            >
              Import CSV
            </Button>
            <Button onClick={() => void loadContacts()} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Connected lead workflows</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Contacts are useful only when capture pages, form definitions, member handoff, and runtime infrastructure are connected.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {CONTACT_WORKFLOW_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {CONTACT_WORKFLOW_SURFACES.map((surface) => (
              <button
                key={surface.key}
                type="button"
                onClick={() => openContactWorkflowSurface(surface)}
                disabled={contactWorkflowSurfaceDisabled(surface)}
                title={contactWorkflowSurfaceTitle(surface)}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="contacts-promotion-contract">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Lead promotion contract</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Contacts sit between public forms and private systems: qualify leads, merge duplicates, then promote them into Users for workspace access, Contacts for follow-up, or Collections for member/profile data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openUsersWorkspace} disabled={isContactsBusy || !canViewUsers} title={!canViewUsers ? usersViewPermissionTitle : undefined} iconStart={<UserCheck className="size-4" />}>
                Users
              </Button>
              <Button size="sm" variant="outline" onClick={() => openLeadCapturePage('registration')} disabled={isContactsBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<UserPlus className="size-4" />}>
                Registration page
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {CONTACT_PROMOTION_REQUIREMENTS.map((requirement, index) => (
              <div key={requirement.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="text-sm font-semibold text-foreground">{requirement.title}</div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{requirement.detail}</p>
              </div>
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
          disabled={isContactsBusy}
          onChange={(event) => {
            selectContactsSite(event.target.value);
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

      <div className="mb-6 rounded-lg border border-border bg-card p-4" data-testid="contacts-segment-analytics">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Backend contact segments</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Private API counts for lifecycle and lead-quality lists used by the inbox, exports, promotion handoff, and custom CRM views.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void copyContactApiText(contactSegmentsUrl, 'Contact segments URL')}
            disabled={contactViewDisabled}
            title={!canViewForms ? viewPermissionTitle : undefined}
            iconStart={<Copy className="size-4" />}
          >
            Copy endpoint
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {backendSegmentHighlights.map((segment) => (
            <div key={segment.id} className="rounded-lg border border-border bg-background px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{segment.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                  {segment.kind}
                </span>
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold">{segment.count}</div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{segment.description}</p>
            </div>
          ))}
        </div>
        <code className="mt-4 block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
          {contactSegmentsUrl}
        </code>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-4" data-testid="contacts-saved-lists">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Saved lead lists</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Save the current form, lifecycle, lead quality, and search filters as a backend-managed list for custom CRM views.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void copyContactApiText(contactListsUrl, 'Contact lists URL')}
            disabled={contactViewDisabled}
            title={!canViewForms ? viewPermissionTitle : undefined}
            iconStart={<Copy className="size-4" />}
          >
            Copy endpoint
          </Button>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-xs font-medium text-muted-foreground">
            List name
            <input
              value={savedListName}
              disabled={contactMutationDisabled}
              onChange={(event) => setSavedListName(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Qualified leads with source values"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={contactMutationDisabled || !savedListName.trim()}
              title={!canManageForms ? managePermissionTitle : undefined}
              onClick={() => void handleSaveContactList()}
              iconStart={<Save className="size-4" />}
            >
              Save current view
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {contactSavedLists.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground">
              No saved lists yet.
            </div>
          ) : contactSavedLists.map((list) => (
            <div key={list.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{list.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {list.matchedCount} match{list.matchedCount === 1 ? '' : 'es'} | {list.filters.status || 'all'} | {list.filters.quality || 'all'}
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {list.formIds.length || 'All'} form{list.formIds.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} onClick={() => applyContactSavedList(list)}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" disabled={contactMutationDisabled} title={!canManageForms ? managePermissionTitle : undefined} onClick={() => void handleDeleteContactSavedList(list)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        <code className="mt-4 block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
          {contactListsUrl}
        </code>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-4" data-testid="contacts-access-audit">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Contacts access and audit</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Contact APIs are permission-gated, and recent contact activity is read from the admin audit log endpoint.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadContactAuditLogs()}
            disabled={contactAuditDisabled}
            title={!canExportActivity ? activityPermissionTitle : undefined}
            iconStart={<RefreshCw className={cn('size-4', isLoadingContactAudit && 'animate-spin')} />}
          >
            Refresh audit
          </Button>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div className="rounded-lg border border-border bg-background p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permission contract</h3>
            <div className="mt-3 grid gap-2">
              {CONTACT_ACCESS_PERMISSIONS.map((permission) => (
                <div key={permission.key} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="font-mono text-xs font-semibold text-foreground">{permission.key}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{permission.detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                activity.export
              </span>
            </div>
            {contactAuditError ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {contactAuditError}
              </div>
            ) : isLoadingContactAudit ? (
              <div className="mt-3 flex h-28 items-center justify-center rounded-md border border-dashed border-border">
                <div className="size-6 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              </div>
            ) : contactAuditLogs.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No contact audit activity yet for this site.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {contactAuditLogs.map((log) => (
                  <ContactAuditLogCard key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>
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
                disabled={filteredContacts.length === 0 || contactExportDisabled}
                title={!canExportForms ? exportPermissionTitle : undefined}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => contactImportInputRef.current?.click()}
                disabled={!apiForm || contactMutationDisabled}
                title={!canManageForms ? managePermissionTitle : undefined}
                iconStart={<Upload className="size-4" />}
              >
                Import CSV
              </Button>
              <Button variant="outline" onClick={openFormsWorkspace} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<Mail className="size-4" />}>
                Forms
              </Button>
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
                  <Button onClick={() => void copyContactApiText(contactsUrl, 'Contacts URL')} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                    Copy contacts
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyContactApiText(contactHandoffText, 'Contact handoff manifest')}
                    disabled={contactViewDisabled}
                    title={!canViewForms ? viewPermissionTitle : undefined}
                    iconStart={<Copy className="size-4" />}
                  >
                    Copy manifest
                  </Button>
                  <a
                    href={contactsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={contactViewDisabled}
                    onClick={(event) => {
                      if (contactViewDisabled) event.preventDefault();
                    }}
                    title={!canViewForms ? viewPermissionTitle : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                      contactViewDisabled && 'pointer-events-none opacity-60',
                    )}
                  >
                    <ExternalLink className="size-4" />
                    Open endpoint
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MetaTile label="API form" value={apiForm.title || apiForm.name || apiForm.id} />
                <MetaTile label="Lead share" value={apiForm.contactShare?.enabled ? 'enabled' : 'off'} />
                <MetaTile label="Selected" value={`${selectedContactIds.length} contact${selectedContactIds.length === 1 ? '' : 's'}`} />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
                <ApiSnippet label="List contacts" value={contactsUrl} />
                <ApiSnippet label="Update contact" value={contactUpdateUrl} />
                <ApiSnippet label="Promote user" value={contactPromoteUserUrl} />
                <ApiSnippet label="Promote customer" value={contactPromoteCustomerUrl} />
                <ApiSnippet label="Sync contacts" value={contactSyncUrl} />
                <ApiSnippet label="Consent retention" value={contactConsentRetentionUrl} />
                <ApiSnippet label="Create contact" value={contactCreateUrl} />
                <ApiSnippet label="Import contacts" value={contactImportUrl} />
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
                <Button variant="outline" onClick={openFormsWorkspace} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} iconStart={<Mail className="size-4" />}>
                  Configure forms
                </Button>
              </div>
            </div>
          )}

          <div className="mb-4 rounded-lg border border-border bg-card p-4" data-testid="contacts-create-contact">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserPlus className="size-4 text-primary" />
                  Add contact
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {apiForm
                    ? `Create or update one lead in ${apiForm.title || apiForm.name}.`
                    : 'Select one source form before creating or importing contacts.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadContactImportTemplate}
                  disabled={contactMutationDisabled}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  iconStart={<FileText className="size-4" />}
                  data-testid="contacts-import-template"
                >
                  CSV template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => contactImportInputRef.current?.click()}
                  disabled={!apiForm || contactMutationDisabled}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  iconStart={<Upload className="size-4" />}
                >
                  Import CSV
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_10rem]">
              <label className="text-xs font-medium text-muted-foreground">
                Name
                <input
                  value={contactDraft.name}
                  disabled={!apiForm || contactMutationDisabled}
                  onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Lead name"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Email
                <input
                  value={contactDraft.email}
                  disabled={!apiForm || contactMutationDisabled}
                  onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="lead@example.com"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Phone
                <input
                  value={contactDraft.phone}
                  disabled={!apiForm || contactMutationDisabled}
                  onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="+1 555 0100"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Status
                <select
                  value={contactDraft.status}
                  disabled={!apiForm || contactMutationDisabled}
                  onChange={(event) => setContactDraft((current) => ({ ...current, status: event.target.value as ContactStatus }))}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {CONTACT_STATUS_FILTERS.filter((status): status is ContactStatus => status !== 'all').map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <label className="text-xs font-medium text-muted-foreground">
                Notes
                <textarea
                  value={contactDraft.notes}
                  disabled={!apiForm || contactMutationDisabled}
                  onChange={(event) => setContactDraft((current) => ({ ...current, notes: event.target.value }))}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Follow-up context or source details."
                />
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={!apiForm || contactMutationDisabled}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  onClick={() => void handleCreateContact()}
                  iconStart={<UserPlus className="size-4" />}
                >
                  Save contact
                </Button>
              </div>
            </div>
          </div>

          <div id="contacts-actions" className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-24">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search contacts"
                value={searchQuery}
                disabled={contactViewDisabled}
                onChange={(event) => {
                  if (isContactsBusy) return;
                  const q = event.target.value;
                  setSearchQuery(q);
                  updateContactsRouteSearch({ q: q || undefined });
                }}
                placeholder="Search contacts, forms, request IDs..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <select
              aria-label="Form filter"
              value={selectedFormId}
              disabled={contactViewDisabled}
              onChange={(event) => {
                if (isContactsBusy) return;
                const formId = event.target.value;
                setSelectedFormId(formId);
                updateContactsRouteSearch({ formId });
              }}
              className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All forms</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>{form.title || form.name}</option>
              ))}
            </select>
            <select
              aria-label="Lead quality filter"
              value={qualityFilter}
              disabled={contactViewDisabled}
              onChange={(event) => {
                if (isContactsBusy) return;
                const quality = event.target.value as ContactQualityFilter;
                setQualityFilter(quality);
                updateContactsRouteSearch({ quality });
              }}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All lead quality</option>
              <option value="missing-email">Missing email</option>
              <option value="missing-phone">Missing phone</option>
              <option value="needs-notes">Needs notes</option>
              <option value="has-source-values">Has source values</option>
              <option value="ready-to-promote">Ready to promote</option>
              <option value="duplicate-email">Duplicate email</option>
            </select>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
              <Filter className="ml-2 size-4 text-muted-foreground" />
              {(['all', 'new', 'contacted', 'qualified', 'archived'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    if (isContactsBusy) return;
                    setStatusFilter(status);
                    updateContactsRouteSearch({ status });
                  }}
                  disabled={contactViewDisabled}
                  aria-pressed={statusFilter === status}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                    statusFilter === status && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
            {hasActiveContactFilters && (
              <Button variant="outline" onClick={clearContactFilters} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="mb-4 rounded-lg border border-border bg-card p-4" data-testid="contacts-bulk-actions">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={allVisibleContactsSelected}
                    disabled={contactViewDisabled || filteredContacts.length === 0}
                    onChange={(event) => toggleVisibleContactSelection(event.target.checked)}
                    className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Select visible contacts"
                  />
                  Select visible
                </label>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {selectedContacts.length} selected
                </span>
                <span className={cn(
                  'rounded-md px-2 py-1 text-xs font-semibold',
                  duplicateEmailGroups.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                )}
                >
                  {duplicateEmailGroups.length} duplicate group{duplicateEmailGroups.length === 1 ? '' : 's'}
                </span>
                {selectedContactIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={contactViewDisabled}
                    onClick={() => setSelectedContactIds([])}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  Retention days
                  <input
                    type="number"
                    min={0}
                    value={contactRetentionDays}
                    disabled={contactMutationDisabled}
                    onChange={(event) => setContactRetentionDays(event.target.value)}
                    className="min-h-10 w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Contact consent retention days"
                    data-testid="contacts-retention-days"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isContactsBusy || selectedContacts.length === 0 || !canManageForms || !canExportForms}
                  title={!canManageForms ? managePermissionTitle : !canExportForms ? exportPermissionTitle : undefined}
                  onClick={() => void handleContactRetention(true)}
                  iconStart={<Download className="size-4" />}
                  data-testid="contacts-retention-export"
                >
                  Export evidence
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactMutationDisabled || selectedContacts.length === 0}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  onClick={() => void handleContactRetention(false)}
                  iconStart={<ShieldCheck className="size-4" />}
                  data-testid="contacts-retention-apply"
                >
                  Apply retention
                </Button>
                <input
                  type="url"
                  value={contactSyncTarget}
                  disabled={contactMutationDisabled}
                  onChange={(event) => setContactSyncTarget(event.target.value)}
                  placeholder="https://crm.example.com/backy/contacts"
                  className="min-h-10 min-w-[18rem] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Contact sync webhook URL"
                  data-testid="contacts-sync-webhook-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactMutationDisabled || selectedContacts.length === 0 || !contactSyncTarget.trim()}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  onClick={() => void handleSyncSelectedContacts()}
                  iconStart={<Upload className="size-4" />}
                  data-testid="contacts-sync-webhook"
                >
                  Sync selected
                </Button>
                <select
                  value={bulkContactStatus}
                  disabled={contactMutationDisabled || selectedContacts.length === 0}
                  onChange={(event) => setBulkContactStatus(event.target.value as ContactStatus)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Bulk contact lifecycle status"
                >
                  {CONTACT_STATUS_FILTERS.filter((status): status is ContactStatus => status !== 'all').map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactMutationDisabled || selectedContacts.length === 0}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  onClick={() => void handleBulkContactStatus()}
                  iconStart={<CheckCircle2 className="size-4" />}
                >
                  Apply lifecycle
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactMutationDisabled || !canMergeSelectedContacts}
                  title={!canManageForms ? managePermissionTitle : undefined}
                  onClick={() => void handleMergeSelectedContacts()}
                  iconStart={<GitMerge className="size-4" />}
                  data-testid="contacts-merge-duplicates"
                >
                  Merge duplicates
                </Button>
              </div>
            </div>
            {lastContactSync ? (
              <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Last sync: <span className="font-semibold text-foreground">{lastContactSync.status}</span>
                {' '}for {lastContactSync.count} contact{lastContactSync.count === 1 ? '' : 's'} to{' '}
                <span className="break-all font-mono">{lastContactSync.target}</span>
                {lastContactSync.statusCode ? ` (${lastContactSync.statusCode})` : ''}
              </div>
            ) : null}
            {lastContactRetention ? (
              <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="contacts-retention-summary">
                Last retention: scanned <span className="font-semibold text-foreground">{lastContactRetention.scanned}</span>,
                {' '}due <span className="font-semibold text-foreground">{lastContactRetention.due}</span>,
                {' '}anonymized <span className="font-semibold text-foreground">{lastContactRetention.anonymized}</span>
                {' '}with {lastContactRetention.consentFieldKeys.length || 0} consent field{lastContactRetention.consentFieldKeys.length === 1 ? '' : 's'}.
              </div>
            ) : null}
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
                <Button onClick={openFormsWorkspace} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} className="mt-2" iconStart={<Mail className="size-4" />}>
                  Review Forms
                </Button>
              }
            />
          ) : filteredContacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <div className="text-sm font-medium text-foreground">No contacts match this view</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Change the search, form, lifecycle, or lead quality filters to broaden the inbox.
              </div>
              {hasActiveContactFilters && (
                <Button variant="outline" onClick={clearContactFilters} disabled={contactViewDisabled} title={!canViewForms ? viewPermissionTitle : undefined} className="mt-4">
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  form={formById.get(contact.formId)}
                  selected={selectedContactSet.has(contact.id)}
                  disabled={contactMutationDisabled}
                  onSelect={(selected) => toggleContactSelection(contact.id, selected)}
                  onStatus={(status) => void handleStatus(contact, status)}
                  onNotes={(notes) => void handleNotes(contact, notes)}
                  onPromoteUser={() => void handlePromoteContactToUser(contact)}
                  onPromoteCustomer={() => void handlePromoteContactToCustomer(contact)}
                  promoteUserDisabled={!canCreateUsers}
                  promoteUserTitle={!canCreateUsers ? usersCreatePermissionTitle : undefined}
                  promoteCustomerDisabled={!canEditCollections}
                  promoteCustomerTitle={!canEditCollections ? collectionsEditPermissionTitle : undefined}
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

function isContactAuditLog(log: AdminAuditLog): boolean {
  if (log.entity === 'contact') return true;
  if (String(log.action).startsWith('contact') || String(log.action).startsWith('contacts.')) return true;
  if (log.action === 'contactList.create' || log.action === 'contactList.update' || log.action === 'contactList.delete') return true;
  if (log.entity === 'form' && (log.action === 'contacts.sync' || log.action === 'contact.consentRetention')) return true;
  return Boolean(typeof log.metadata?.contactId === 'string' || Array.isArray(log.metadata?.contactIds));
}

function auditValue(log: AdminAuditLog, key: string): string {
  const value = log.metadata?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length > 0 ? `${value.length} selected` : '';
  return '';
}

function contactAuditTitle(log: AdminAuditLog): string {
  if (log.action === 'contactList.create') return 'Saved lead list created';
  if (log.action === 'contactList.update') return 'Saved lead list updated';
  if (log.action === 'contactList.delete') return 'Saved lead list deleted';
  if (log.action === 'contact.promote.user') return 'Contact promoted to user';
  if (log.action === 'contact.promote.customer') return 'Contact promoted to customer';
  if (log.action === 'contacts.sync') return 'Selected contacts synced';
  if (log.action === 'contact.consentRetention') return 'Contact retention applied';
  return log.action.replace(/[._-]+/g, ' ');
}

function contactAuditDescription(log: AdminAuditLog): string {
  if (log.action === 'contacts.sync') {
    return `${auditValue(log, 'count') || '0'} contact${auditValue(log, 'count') === '1' ? '' : 's'} to ${auditValue(log, 'target') || 'webhook'}.`;
  }
  if (log.action === 'contact.consentRetention') {
    return `${auditValue(log, 'anonymized') || '0'} anonymized from ${auditValue(log, 'scanned') || '0'} scanned contact${auditValue(log, 'scanned') === '1' ? '' : 's'}.`;
  }
  if (log.action === 'contact.promote.user') {
    return `${auditValue(log, 'email') || log.entityId} into ${auditValue(log, 'role') || 'viewer'} access.`;
  }
  if (log.action === 'contact.promote.customer') {
    return `${auditValue(log, 'email') || log.entityId} into ${auditValue(log, 'collectionId') || 'customers'}.`;
  }
  if (log.action.startsWith('contactList.')) {
    return `${log.entityId}${auditValue(log, 'status') ? ` | ${auditValue(log, 'status')}` : ''}`;
  }
  return [log.entity, log.entityId].filter(Boolean).join(' | ');
}

function ContactAuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{contactAuditTitle(log)}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{contactAuditDescription(log)}</div>
        </div>
        <time className="shrink-0 font-mono text-xs text-muted-foreground" dateTime={log.createdAt}>
          {formatDate(log.createdAt)}
        </time>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-1">{log.actorId || 'admin'}</span>
        <span className="rounded bg-muted px-2 py-1">{log.entity}</span>
        {log.requestId ? (
          <span className="rounded bg-muted px-2 py-1 font-mono">{log.requestId}</span>
        ) : null}
      </div>
    </div>
  );
}

function ContactCard({
  contact,
  form,
  selected,
  disabled,
  onSelect,
  onStatus,
  onNotes,
  onPromoteUser,
  onPromoteCustomer,
  promoteUserDisabled,
  promoteUserTitle,
  promoteCustomerDisabled,
  promoteCustomerTitle,
}: {
  contact: AdminContact;
  form?: FormDefinition;
  selected: boolean;
  disabled: boolean;
  onSelect: (selected: boolean) => void;
  onStatus: (status: ContactStatus) => void;
  onNotes: (notes: string) => void;
  onPromoteUser: () => void;
  onPromoteCustomer: () => void;
  promoteUserDisabled: boolean;
  promoteUserTitle?: string;
  promoteCustomerDisabled: boolean;
  promoteCustomerTitle?: string;
}) {
  const [notesDraft, setNotesDraft] = useState(contact.notes || '');

  useEffect(() => {
    setNotesDraft(contact.notes || '');
  }, [contact.notes]);

  const notesChanged = notesDraft.trim() !== (contact.notes || '').trim();
  const promotion = getContactPromotion(contact);
  const customerPromotion = getContactCustomerPromotion(contact);
  const submittedValues = Object.entries(contact.sourceValues || {})
    .filter(([key]) => key !== CONTACT_PROMOTION_SOURCE_KEY && key !== CONTACT_CUSTOMER_PROMOTION_SOURCE_KEY);
  const canPromoteToUser = Boolean(contact.email && contact.status === 'qualified' && !promotion?.userId);
  const canPromoteToCustomer = Boolean(contact.email && contact.status === 'qualified' && !customerPromotion?.recordId);

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Select contact ${contact.name || contact.email || contact.id}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{contact.name || contact.email || 'Unnamed contact'}</h3>
              <StatusBadge status={contact.status} type={statusType(contact.status)} />
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {form?.title || form?.name || contact.formId}
            </div>
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
          disabled={disabled}
          onChange={(event) => {
            if (disabled) return;
            setNotesDraft(event.target.value);
          }}
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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

      {promotion?.userId ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <div className="font-semibold">Promoted user</div>
          <div className="mt-1 truncate">
            {promotion.email || contact.email} | {promotion.role || 'viewer'} | {promotion.status || 'invited'}
          </div>
          {promotion.inviteUrl ? (
            <code className="mt-2 block min-w-0 overflow-x-auto rounded border border-emerald-200 bg-white/70 px-2 py-1 font-mono text-[11px] text-emerald-900">
              {promotion.inviteUrl}
            </code>
          ) : null}
        </div>
      ) : null}

      {customerPromotion?.recordId ? (
        <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          <div className="font-semibold">Promoted customer</div>
          <div className="mt-1 truncate">
            {customerPromotion.email || contact.email} | {customerPromotion.collectionSlug || customerPromotion.collectionId || 'customers'} | {customerPromotion.recordSlug || customerPromotion.recordId}
          </div>
        </div>
      ) : null}

      {submittedValues.length > 0 ? (
        <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Submitted values</div>
          <dl className="grid gap-1 text-xs">
            {submittedValues.slice(0, 4).map(([key, value]) => (
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
          onClick={onPromoteUser}
          disabled={disabled || promoteUserDisabled || !canPromoteToUser}
          title={promoteUserTitle}
          iconStart={<UserPlus className="size-4" />}
          aria-label={`Promote ${contact.name || contact.email || contact.id} to user`}
          data-testid="contacts-promote-user"
        >
          Promote user
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onPromoteCustomer}
          disabled={disabled || promoteCustomerDisabled || !canPromoteToCustomer}
          title={promoteCustomerTitle}
          iconStart={<UserCheck className="size-4" />}
          aria-label={`Promote ${contact.name || contact.email || contact.id} to customer`}
          data-testid="contacts-promote-customer"
        >
          Promote customer
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

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
