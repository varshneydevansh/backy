import { NextRequest, NextResponse } from 'next/server';
import type { Contact, FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listFormContacts, listFormsBySite } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ContactSegmentId =
  | 'all'
  | Contact['status']
  | 'missing-email'
  | 'missing-phone'
  | 'needs-notes'
  | 'has-source-values'
  | 'ready-to-promote'
  | 'duplicate-email';

interface ContactSegment {
  id: ContactSegmentId;
  label: string;
  kind: 'system' | 'lifecycle' | 'quality';
  count: number;
  contactIds: string[];
  formIds: string[];
  description: string;
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const STATUSES: Contact['status'][] = ['new', 'contacted', 'qualified', 'archived'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

const hasSourceValues = (contact: Contact): boolean => (
  Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0)
);

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));

const segmentFromContacts = (
  id: ContactSegmentId,
  label: string,
  kind: ContactSegment['kind'],
  description: string,
  contacts: Contact[],
): ContactSegment => ({
  id,
  label,
  kind,
  count: contacts.length,
  contactIds: contacts.map((contact) => contact.id),
  formIds: uniqueSorted(contacts.map((contact) => contact.formId)),
  description,
});

const duplicateEmailSet = (contacts: Contact[]) => {
  const groups = new Map<string, Contact[]>();
  contacts.forEach((contact) => {
    const email = normalizeEmail(contact.email);
    if (!email || contact.status === 'archived') return;
    groups.set(email, [...(groups.get(email) || []), contact]);
  });

  return new Set(
    Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([email]) => email),
  );
};

const buildContactSegments = (forms: FormDefinition[], contacts: Contact[]) => {
  const duplicates = duplicateEmailSet(contacts);
  const byStatus = Object.fromEntries(
    STATUSES.map((status) => [status, contacts.filter((contact) => contact.status === status)]),
  ) as Record<Contact['status'], Contact[]>;
  const quality = {
    missingEmail: contacts.filter((contact) => !contact.email?.trim()),
    missingPhone: contacts.filter((contact) => !contact.phone?.trim()),
    needsNotes: contacts.filter((contact) => !contact.notes?.trim()),
    hasSourceValues: contacts.filter(hasSourceValues),
    readyToPromote: contacts.filter((contact) => contact.status === 'qualified' && Boolean(normalizeEmail(contact.email))),
    duplicateEmail: contacts.filter((contact) => duplicates.has(normalizeEmail(contact.email))),
  };

  const segments: ContactSegment[] = [
    segmentFromContacts('all', 'All contacts', 'system', 'Every contact in the selected site or form scope.', contacts),
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
    segments,
    summary: {
      forms: forms.length,
      contacts: contacts.length,
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
    },
    forms: forms.map((form) => ({
      id: form.id,
      name: form.name,
      title: form.title || null,
      isActive: form.isActive,
      contactShare: {
        enabled: form.contactShare?.enabled === true,
        dedupeByEmail: form.contactShare?.dedupeByEmail === true,
      },
    })),
  };
};

const fetchRepositoryContacts = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  formId?: string,
): Promise<Contact[]> => {
  const contacts: Contact[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.listContacts({
      siteId,
      formId,
      limit: PAGE_LIMIT,
      offset,
    });
    contacts.push(...result.items);
    if (!result.pagination.hasMore || contacts.length >= result.pagination.total) break;
  }

  return contacts;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('formId')?.trim() || undefined;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const formsResult = await repositories.forms.list({ siteId: site.id, limit: PAGE_LIMIT, offset: 0 });
      const forms = formId
        ? formsResult.items.filter((form) => form.id === formId)
        : formsResult.items;
      if (formId && forms.length === 0) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const analytics = buildContactSegments(forms, await fetchRepositoryContacts(repositories, site.id, formId));

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          formId: formId || null,
          analytics,
          generatedAt: new Date().toISOString(),
        },
        segments: analytics.segments,
        summary: analytics.summary,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const forms = listFormsBySite(site.id).filter((form) => (formId ? form.id === formId : true));
    if (formId && forms.length === 0) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const contacts = forms.flatMap((form) => (
      listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts
    ));
    const analytics = buildContactSegments(forms, contacts);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        formId: formId || null,
        analytics,
        generatedAt: new Date().toISOString(),
      },
      segments: analytics.segments,
      summary: analytics.summary,
    });
  } catch (error) {
    console.error('Admin form contact segments API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
