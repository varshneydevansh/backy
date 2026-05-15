import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_SITE_SETTINGS,
  type Contact,
  type FormDefinition,
  type FormSubmission,
  type SiteContactSavedList,
  type SiteContactSavedListFilters,
  type SiteSettings,
} from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listFormContacts, listFormsBySite, listFormSubmissions } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type FormSubmissionStatus = FormSubmission['status'];

interface FormAnalyticsSummary {
  forms: number;
  activeForms: number;
  inactiveForms: number;
  submissions: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  routedToCollections: number;
  conversionRate: number;
  spamRate: number;
}

interface FormAnalyticsTrendPoint {
  date: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
}

interface FormAnalyticsFormBreakdown {
  formId: string;
  name: string;
  title: string | null;
  isActive: boolean;
  submissions: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  routedToCollections: number;
  lastSubmittedAt: string | null;
}

interface FormAnalyticsContactSegment {
  id: Contact['status'] | 'all' | 'missing-email' | 'missing-phone' | 'needs-notes' | 'has-source-values' | 'ready-to-promote' | 'duplicate-email';
  label: string;
  kind: 'system' | 'lifecycle' | 'quality';
  count: number;
  contactIds: string[];
  formIds: string[];
  description: string;
}

const STATUSES: FormSubmissionStatus[] = ['pending', 'approved', 'rejected', 'spam'];
const CONTACT_STATUSES: Contact['status'][] = ['new', 'contacted', 'qualified', 'archived'];
const CONTACT_LIST_STATUSES = ['all', 'new', 'contacted', 'qualified', 'archived'] as const;
const CONTACT_LIST_QUALITIES = ['all', 'missing-email', 'missing-phone', 'needs-notes', 'has-source-values', 'ready-to-promote', 'duplicate-email'] as const;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseDays = (value: string | null): number => {
  const parsed = Number.parseInt(value || '14', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(90, parsed)) : 14;
};

const emptyStatusCounts = () => ({
  pending: 0,
  approved: 0,
  rejected: 0,
  spam: 0,
});

const incrementStatus = (target: ReturnType<typeof emptyStatusCounts>, status: FormSubmissionStatus) => {
  if (status === 'approved') target.approved += 1;
  else if (status === 'rejected') target.rejected += 1;
  else if (status === 'spam') target.spam += 1;
  else target.pending += 1;
};

const dayKey = (value: string | null | undefined): string | null => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
};

const trendSeed = (days: number): FormAnalyticsTrendPoint[] => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    return {
      date: date.toISOString().slice(0, 10),
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      spam: 0,
    };
  });
};

const submissionTimestamp = (submission: FormSubmission): number => {
  const timestamp = Date.parse(submission.submittedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeIdentifier = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));

const siteSettings = (settings: SiteSettings | undefined): SiteSettings => (
  (settings || DEFAULT_SITE_SETTINGS) as SiteSettings
);

const normalizeFilters = (value: unknown): SiteContactSavedListFilters => {
  const record = isRecord(value) ? value : {};
  const status = CONTACT_LIST_STATUSES.includes(record.status as (typeof CONTACT_LIST_STATUSES)[number])
    ? record.status as SiteContactSavedListFilters['status']
    : 'all';
  const quality = CONTACT_LIST_QUALITIES.includes(record.quality as (typeof CONTACT_LIST_QUALITIES)[number])
    ? record.quality as SiteContactSavedListFilters['quality']
    : 'all';
  const formId = textValue(record.formId) || 'all';
  const query = textValue(record.query);

  return {
    formId,
    status,
    quality,
    ...(query ? { query } : {}),
  };
};

const normalizeSavedLists = (settings: SiteSettings): SiteContactSavedList[] => (
  Array.isArray(settings.contacts?.savedLists)
    ? settings.contacts.savedLists
        .filter((list): list is SiteContactSavedList => isRecord(list) && typeof list.id === 'string' && typeof list.name === 'string')
        .map((list) => ({
          id: textValue(list.id),
          name: textValue(list.name) || 'Saved lead list',
          description: textValue(list.description) || null,
          filters: normalizeFilters(list.filters),
          createdAt: textValue(list.createdAt) || new Date().toISOString(),
          updatedAt: textValue(list.updatedAt) || textValue(list.createdAt) || new Date().toISOString(),
        }))
    : []
);

const duplicateEmailSet = (contacts: Contact[]) => {
  const groups = new Map<string, Contact[]>();
  contacts.forEach((contact) => {
    const email = normalizeIdentifier(contact.email);
    if (!email || contact.status === 'archived') return;
    groups.set(email, [...(groups.get(email) || []), contact]);
  });

  return new Set(Array.from(groups.entries()).filter(([, group]) => group.length > 1).map(([email]) => email));
};

const segmentFromContacts = (
  id: FormAnalyticsContactSegment['id'],
  label: string,
  kind: FormAnalyticsContactSegment['kind'],
  description: string,
  contacts: Contact[],
): FormAnalyticsContactSegment => ({
  id,
  label,
  kind,
  count: contacts.length,
  contactIds: contacts.map((contact) => contact.id),
  formIds: uniqueSorted(contacts.map((contact) => contact.formId)),
  description,
});

const filterContactsForList = (
  contacts: Contact[],
  forms: FormDefinition[],
  filters: SiteContactSavedListFilters,
): Contact[] => {
  const duplicates = duplicateEmailSet(contacts);
  const formById = new Map(forms.map((form) => [form.id, form]));
  const query = filters.query?.trim().toLowerCase() || '';

  return contacts.filter((contact) => {
    if (filters.formId && filters.formId !== 'all' && contact.formId !== filters.formId) return false;
    if (filters.status && filters.status !== 'all' && contact.status !== filters.status) return false;

    const hasEmail = Boolean(contact.email?.trim());
    const hasPhone = Boolean(contact.phone?.trim());
    const hasNotes = Boolean(contact.notes?.trim());
    const hasSourceValues = Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0);
    const quality = filters.quality || 'all';
    if (quality === 'missing-email' && hasEmail) return false;
    if (quality === 'missing-phone' && hasPhone) return false;
    if (quality === 'needs-notes' && hasNotes) return false;
    if (quality === 'has-source-values' && !hasSourceValues) return false;
    if (quality === 'ready-to-promote' && (contact.status !== 'qualified' || !hasEmail)) return false;
    if (quality === 'duplicate-email' && !duplicates.has(normalizeIdentifier(contact.email))) return false;

    if (!query) return true;
    const form = formById.get(contact.formId);
    return [
      contact.name,
      contact.email,
      contact.phone,
      contact.notes,
      contact.requestId,
      form?.title,
      form?.name,
    ].some((entry) => String(entry || '').toLowerCase().includes(query));
  });
};

const fetchAllSubmissions = async (
  fetchPage: (offset: number) => Promise<{ items: FormSubmission[]; total: number; hasMore: boolean }>,
): Promise<FormSubmission[]> => {
  const submissions: FormSubmission[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await fetchPage(offset);
    submissions.push(...result.items);
    if (!result.hasMore || submissions.length >= result.total) break;
  }
  return submissions;
};

const fetchAllContacts = async (
  fetchPage: (offset: number) => Promise<{ items: Contact[]; total: number; hasMore: boolean }>,
): Promise<Contact[]> => {
  const contacts: Contact[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await fetchPage(offset);
    contacts.push(...result.items);
    if (!result.hasMore || contacts.length >= result.total) break;
  }
  return contacts;
};

const buildLeadAnalytics = (
  forms: FormDefinition[],
  contacts: Contact[],
  savedLists: SiteContactSavedList[],
) => {
  const duplicates = duplicateEmailSet(contacts);
  const byStatus = Object.fromEntries(
    CONTACT_STATUSES.map((status) => [status, contacts.filter((contact) => contact.status === status)]),
  ) as Record<Contact['status'], Contact[]>;
  const quality = {
    missingEmail: contacts.filter((contact) => !contact.email?.trim()),
    missingPhone: contacts.filter((contact) => !contact.phone?.trim()),
    needsNotes: contacts.filter((contact) => !contact.notes?.trim()),
    hasSourceValues: contacts.filter((contact) => Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0)),
    readyToPromote: contacts.filter((contact) => contact.status === 'qualified' && Boolean(normalizeIdentifier(contact.email))),
    duplicateEmail: contacts.filter((contact) => duplicates.has(normalizeIdentifier(contact.email))),
  };
  const segments: FormAnalyticsContactSegment[] = [
    segmentFromContacts('all', 'All leads', 'system', 'Every form contact in this site.', contacts),
    segmentFromContacts('new', 'New', 'lifecycle', 'Contacts captured but not yet reviewed.', byStatus.new),
    segmentFromContacts('contacted', 'Contacted', 'lifecycle', 'Contacts that have received follow-up.', byStatus.contacted),
    segmentFromContacts('qualified', 'Qualified', 'lifecycle', 'Contacts ready for sales, membership, or user promotion.', byStatus.qualified),
    segmentFromContacts('archived', 'Archived', 'lifecycle', 'Closed, stale, rejected, or merged contact records.', byStatus.archived),
    segmentFromContacts('missing-email', 'Missing email', 'quality', 'Contacts without email identity.', quality.missingEmail),
    segmentFromContacts('missing-phone', 'Missing phone', 'quality', 'Contacts without phone identity.', quality.missingPhone),
    segmentFromContacts('needs-notes', 'Needs notes', 'quality', 'Contacts without internal follow-up notes.', quality.needsNotes),
    segmentFromContacts('has-source-values', 'Has source values', 'quality', 'Contacts retaining submitted form values.', quality.hasSourceValues),
    segmentFromContacts('ready-to-promote', 'Ready to promote', 'quality', 'Qualified contacts with email identity.', quality.readyToPromote),
    segmentFromContacts('duplicate-email', 'Duplicate email', 'quality', 'Active contacts sharing the same email identity.', quality.duplicateEmail),
  ];

  return {
    summary: {
      contacts: contacts.length,
      captureRate: forms.length > 0 ? Math.round((contacts.length / forms.length) * 10) / 10 : 0,
      lifecycle: {
        new: byStatus.new.length,
        contacted: byStatus.contacted.length,
        qualified: byStatus.qualified.length,
        archived: byStatus.archived.length,
      },
      quality: {
        missingEmail: quality.missingEmail.length,
        missingPhone: quality.missingPhone.length,
        needsNotes: quality.needsNotes.length,
        hasSourceValues: quality.hasSourceValues.length,
        readyToPromote: quality.readyToPromote.length,
        duplicateEmail: quality.duplicateEmail.length,
        duplicateEmailGroups: duplicates.size,
      },
      savedLists: savedLists.length,
    },
    segments,
    savedLists: savedLists.map((list) => {
      const matched = filterContactsForList(contacts, forms, list.filters);
      return {
        ...list,
        matchedCount: matched.length,
        contactIds: matched.map((contact) => contact.id),
        formIds: uniqueSorted(matched.map((contact) => contact.formId)),
      };
    }),
    forms: forms.map((form) => {
      const formContacts = contacts.filter((contact) => contact.formId === form.id);
      return {
        formId: form.id,
        name: form.name,
        title: form.title || null,
        contactShareEnabled: form.contactShare?.enabled === true,
        contacts: formContacts.length,
        qualified: formContacts.filter((contact) => contact.status === 'qualified').length,
        readyToPromote: formContacts.filter((contact) => contact.status === 'qualified' && Boolean(normalizeIdentifier(contact.email))).length,
      };
    }).sort((left, right) => right.contacts - left.contacts || left.name.localeCompare(right.name)),
  };
};

const buildAnalytics = (
  forms: FormDefinition[],
  submissions: FormSubmission[],
  contacts: Contact[],
  savedLists: SiteContactSavedList[],
  days: number,
) => {
  const statusCounts = emptyStatusCounts();
  const trend = trendSeed(days);
  const trendByDate = new Map(trend.map((point) => [point.date, point]));
  const perForm = new Map<string, FormAnalyticsFormBreakdown>();

  forms.forEach((form) => {
    perForm.set(form.id, {
      formId: form.id,
      name: form.name,
      title: form.title || null,
      isActive: form.isActive,
      submissions: 0,
      ...emptyStatusCounts(),
      routedToCollections: 0,
      lastSubmittedAt: null,
    });
  });

  submissions.forEach((submission) => {
    const status = STATUSES.includes(submission.status) ? submission.status : 'pending';
    const form = perForm.get(submission.formId);
    incrementStatus(statusCounts, status);

    if (form) {
      form.submissions += 1;
      incrementStatus(form, status);
      if (submission.collectionRecord) form.routedToCollections += 1;
      if (!form.lastSubmittedAt || submissionTimestamp(submission) > Date.parse(form.lastSubmittedAt)) {
        form.lastSubmittedAt = submission.submittedAt;
      }
    }

    const date = dayKey(submission.submittedAt);
    const point = date ? trendByDate.get(date) : undefined;
    if (point) {
      point.total += 1;
      incrementStatus(point, status);
    }
  });

  const routedToCollections = submissions.filter((submission) => Boolean(submission.collectionRecord)).length;
  const summary: FormAnalyticsSummary = {
    forms: forms.length,
    activeForms: forms.filter((form) => form.isActive).length,
    inactiveForms: forms.filter((form) => !form.isActive).length,
    submissions: submissions.length,
    pending: statusCounts.pending,
    approved: statusCounts.approved,
    rejected: statusCounts.rejected,
    spam: statusCounts.spam,
    routedToCollections,
    conversionRate: submissions.length > 0 ? Math.round((statusCounts.approved / submissions.length) * 100) : 0,
    spamRate: submissions.length > 0 ? Math.round((statusCounts.spam / submissions.length) * 100) : 0,
  };

  return {
    summary,
    trend,
    forms: Array.from(perForm.values()).sort((a, b) => (
      b.submissions - a.submissions ||
      (Date.parse(b.lastSubmittedAt || '') || 0) - (Date.parse(a.lastSubmittedAt || '') || 0) ||
      a.name.localeCompare(b.name)
    )),
    leads: buildLeadAnalytics(forms, contacts, savedLists),
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseDays(searchParams.get('days'));

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const formsResult = await repositories.forms.list({ siteId: site.id, limit: 100, offset: 0 });
      const forms = formsResult.items;
      const submissions = await fetchAllSubmissions(async (offset) => {
        const page = await repositories.forms.listSubmissions({
          siteId: site.id,
          limit: PAGE_LIMIT,
          offset,
        });
        return {
          items: page.items,
          total: page.pagination.total,
          hasMore: page.pagination.hasMore,
        };
      });
      const contacts = await fetchAllContacts(async (offset) => {
        const page = await repositories.forms.listContacts({
          siteId: site.id,
          limit: PAGE_LIMIT,
          offset,
        });
        return {
          items: page.items,
          total: page.pagination.total,
          hasMore: page.pagination.hasMore,
        };
      });
      const analytics = buildAnalytics(forms, submissions, contacts, normalizeSavedLists(siteSettings(site.settings)), days);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          analytics,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const forms = listFormsBySite(site.id);
    const submissions = forms.flatMap((form) => (
      listFormSubmissions(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).data
    ));
    const contacts = forms.flatMap((form) => (
      listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts
    ));
    const analytics = buildAnalytics(forms, submissions, contacts, normalizeSavedLists(siteSettings(site.settings)), days);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        analytics,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Admin forms analytics API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
