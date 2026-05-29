import { NextRequest, NextResponse } from 'next/server';
import type { Contact, FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { createContactRecord, getSiteByIdOrSlug, listFormContacts, listFormsBySite } from '@/lib/backyStore';
import { normalizeContactEmail, validateOptionalContactEmail } from '@/lib/contactEmailPolicy';
import {
  NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION,
  buildNewsletterContactFields,
  buildNewsletterSourceValues,
  buildNewsletterSubscriberPayload,
  buildNewsletterSummary,
  isNewsletterContact,
  isNewsletterForm,
  newsletterStatusFromContact,
  type NewsletterSubscriptionStatus,
} from '@/lib/newsletterSubscribers';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type NewsletterSubscriberBody = {
  email?: unknown;
  name?: unknown;
  topics?: unknown;
  source?: unknown;
  consent?: unknown;
  consentText?: unknown;
  status?: unknown;
  contactStatus?: unknown;
  formId?: unknown;
};

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const CONTACT_STATUSES: Contact['status'][] = ['new', 'contacted', 'qualified', 'archived'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const booleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', '0', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const parseLimit = (value: string | null): { value: number; invalid?: string } => {
  if (!value) return { value: 50 };
  if (!/^\d+$/.test(value)) return { value: 50, invalid: value };
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 && parsed <= 100 ? { value: parsed } : { value: 50, invalid: value };
};

const parseOffset = (value: string | null): { value: number; invalid?: string } => {
  if (!value) return { value: 0 };
  if (!/^\d+$/.test(value)) return { value: 0, invalid: value };
  return { value: Number.parseInt(value, 10) };
};

const parseNewsletterStatus = (value: unknown): NewsletterSubscriptionStatus | 'all' => (
  value === 'subscribed' || value === 'unsubscribed' ? value : 'all'
);

const parseContactStatus = (value: unknown, subscriptionStatus: NewsletterSubscriptionStatus): Contact['status'] => {
  if (subscriptionStatus === 'unsubscribed') return 'archived';
  return CONTACT_STATUSES.includes(value as Contact['status']) ? value as Contact['status'] : 'new';
};

const parseBody = async (request: NextRequest): Promise<NewsletterSubscriberBody> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const findNewsletterForms = (forms: FormDefinition[], formId?: string): FormDefinition[] => (
  forms
    .filter(isNewsletterForm)
    .filter((form) => (formId ? form.id === formId : true))
);

const filterSubscribers = (
  contacts: Contact[],
  forms: FormDefinition[],
  input: {
    status: NewsletterSubscriptionStatus | 'all';
    search?: string;
  },
) => {
  const formById = new Map(forms.map((form) => [form.id, form]));
  const normalizedSearch = input.search?.trim().toLowerCase() || '';
  return contacts
    .filter((contact) => isNewsletterContact(contact, formById.get(contact.formId)))
    .filter((contact) => (input.status === 'all' ? true : newsletterStatusFromContact(contact) === input.status))
    .filter((contact) => {
      if (!normalizedSearch) return true;
      return [
        contact.email,
        contact.name,
        contact.notes,
        JSON.stringify(contact.sourceValues || {}),
        formById.get(contact.formId)?.title,
        formById.get(contact.formId)?.name,
      ].some((entry) => String(entry || '').toLowerCase().includes(normalizedSearch));
    });
};

const paginate = <TItem,>(items: TItem[], limit: number, offset: number) => ({
  items: items.slice(offset, offset + limit),
  pagination: {
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length,
  },
});

const newsletterResponse = (
  requestId: string,
  site: { id: string; slug?: string; name?: string },
  forms: FormDefinition[],
  contacts: Contact[],
  input: { limit: number; offset: number; status: NewsletterSubscriptionStatus | 'all'; search?: string },
) => {
  const filtered = filterSubscribers(contacts, forms, { status: input.status, search: input.search });
  const paged = paginate(filtered, input.limit, input.offset);
  const formById = new Map(forms.map((form) => [form.id, form]));
  const subscribers = paged.items.map((contact) => (
    buildNewsletterSubscriberPayload(contact, formById.get(contact.formId) || forms[0], { includeSourceValues: true })
  ));

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      schemaVersion: NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION,
      site: { id: site.id, slug: site.slug || null, name: site.name || null },
      forms: forms.map((form) => ({
        id: form.id,
        name: form.name,
        title: form.title || null,
        active: form.isActive,
        fields: form.fields,
        definitionUrl: `/api/sites/${site.id}/forms/${form.id}/definition`,
        submitUrl: `/api/sites/${site.id}/forms/${form.id}/submissions`,
      })),
      subscribers,
      count: paged.pagination.total,
      pagination: paged.pagination,
      summary: buildNewsletterSummary(filtered),
      handoff: {
        publicSubscribe: `/api/sites/${site.id}/newsletter/subscribers`,
        publicUnsubscribe: `/api/sites/${site.id}/newsletter/subscribers`,
        adminSubscribers: `/api/admin/sites/${site.id}/newsletter/subscribers`,
        deliveryBoundary: 'Backy stores subscribers and consent; email delivery, bounces, abuse controls, and DNS authentication stay provider-backed.',
      },
    },
    subscribers,
    count: paged.pagination.total,
    pagination: paged.pagination,
  });
};

const fetchRepositoryForms = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
): Promise<FormDefinition[]> => {
  const forms: FormDefinition[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.list({ siteId, limit: PAGE_LIMIT, offset });
    forms.push(...result.items);
    if (!result.pagination.hasMore || forms.length >= result.pagination.total) break;
  }
  return forms;
};

const fetchRepositoryContacts = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  forms: FormDefinition[],
): Promise<Contact[]> => {
  const contacts: Contact[] = [];
  for (const form of forms) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_LIMIT;
      const result = await repositories.forms.listContacts({ siteId, formId: form.id, limit: PAGE_LIMIT, offset });
      contacts.push(...result.items);
      if (!result.pagination.hasMore || offset + result.items.length >= result.pagination.total) break;
    }
  }
  return contacts;
};

const findRepositoryContactByEmail = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  formId: string,
  email: string,
): Promise<Contact | undefined> => {
  const normalizedEmail = normalizeContactEmail(email);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.listContacts({ siteId, formId, limit: PAGE_LIMIT, offset });
    const contact = result.items.find((item) => normalizeContactEmail(item.email) === normalizedEmail);
    if (contact) return contact;
    if (!result.pagination.hasMore || offset + result.items.length >= result.pagination.total) break;
  }
  return undefined;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const limitFilter = parseLimit(searchParams.get('limit'));
    if (limitFilter.invalid) return errorResponse(400, 'INVALID_NEWSLETTER_LIMIT', 'Invalid newsletter subscriber limit. Use an integer from 1 to 100.', requestId);
    const offsetFilter = parseOffset(searchParams.get('offset'));
    if (offsetFilter.invalid) return errorResponse(400, 'INVALID_NEWSLETTER_OFFSET', 'Invalid newsletter subscriber offset. Use a non-negative integer.', requestId);
    const status = parseNewsletterStatus(searchParams.get('status') || 'all');
    const formId = textValue(searchParams.get('formId'));
    const search = textValue(searchParams.get('q'));

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      const forms = findNewsletterForms(await fetchRepositoryForms(repositories, site.id), formId);
      const contacts = await fetchRepositoryContacts(repositories, site.id, forms);
      return newsletterResponse(requestId, site, forms, contacts, {
        limit: limitFilter.value,
        offset: offsetFilter.value,
        status,
        search,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const forms = findNewsletterForms(listFormsBySite(site.id), formId);
    const contacts = forms.flatMap((form) => listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts);
    return newsletterResponse(requestId, site, forms, contacts, {
      limit: limitFilter.value,
      offset: offsetFilter.value,
      status,
      search,
    });
  } catch (error) {
    console.error('Admin newsletter subscribers API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseBody(request);
    const emailPolicy = validateOptionalContactEmail(textValue(body.email));
    if (!emailPolicy.ok || !emailPolicy.email) {
      return errorResponse(400, 'INVALID_NEWSLETTER_EMAIL', emailPolicy.ok ? 'Newsletter subscriber email is required.' : emailPolicy.message, requestId);
    }
    const subscriptionStatus = parseNewsletterStatus(body.status) === 'unsubscribed' ? 'unsubscribed' : 'subscribed';
    const contactStatus = parseContactStatus(body.contactStatus, subscriptionStatus);
    const formId = textValue(body.formId);
    const now = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      const forms = findNewsletterForms(await fetchRepositoryForms(repositories, site.id), formId);
      const form = forms[0];
      if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Create a newsletter signup form before adding subscribers.', requestId);
      const existing = await findRepositoryContactByEmail(repositories, site.id, form.id, emailPolicy.email);
      const sourceValues = buildNewsletterSourceValues({
        existingSourceValues: existing?.sourceValues,
        status: subscriptionStatus,
        topics: textValue(body.topics),
        source: textValue(body.source) || 'admin-newsletter-api',
        consent: booleanValue(body.consent),
        consentText: textValue(body.consentText),
        requestId,
        now,
      });
      const newsletterFields = buildNewsletterContactFields({
        existing,
        status: subscriptionStatus,
        topics: textValue(body.topics),
        source: textValue(body.source) || 'admin-newsletter-api',
        consent: booleanValue(body.consent),
        consentText: textValue(body.consentText),
        now,
      });
      const contact = existing
        ? (await repositories.forms.updateContact(site.id, existing.id, {
            name: textValue(body.name) || existing.name,
            email: emailPolicy.email,
            notes: textValue(body.topics) || existing.notes,
            status: contactStatus,
            sourceValues,
            ...newsletterFields,
            requestId,
          })).item
        : (await repositories.forms.createContact({
            siteId: site.id,
            formId: form.id,
            pageId: null,
            postId: null,
            name: textValue(body.name) || null,
            email: emailPolicy.email,
            phone: null,
            notes: textValue(body.topics) || null,
            status: contactStatus,
            sourceValues,
            ...newsletterFields,
            requestId,
          })).item;
      return NextResponse.json({
        success: true,
        requestId,
        data: {
          schemaVersion: NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION,
          subscriber: buildNewsletterSubscriberPayload(contact, form, { includeSourceValues: true }),
          existing: Boolean(existing),
        },
        subscriber: buildNewsletterSubscriberPayload(contact, form, { includeSourceValues: true }),
        existing: Boolean(existing),
      }, { status: existing ? 200 : 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const forms = findNewsletterForms(listFormsBySite(site.id), formId);
    const form = forms[0];
    if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Create a newsletter signup form before adding subscribers.', requestId);
    const result = createContactRecord({
      siteId: site.id,
      formId: form.id,
      pageId: null,
      postId: null,
      name: textValue(body.name) || null,
      email: emailPolicy.email,
      phone: null,
      notes: textValue(body.topics) || null,
      status: contactStatus,
      sourceValues: buildNewsletterSourceValues({
        status: subscriptionStatus,
        topics: textValue(body.topics),
        source: textValue(body.source) || 'admin-newsletter-api',
        consent: booleanValue(body.consent),
        consentText: textValue(body.consentText),
        requestId,
        now,
      }),
      ...buildNewsletterContactFields({
        status: subscriptionStatus,
        topics: textValue(body.topics),
        source: textValue(body.source) || 'admin-newsletter-api',
        consent: booleanValue(body.consent),
        consentText: textValue(body.consentText),
        now,
      }),
      requestId,
      sourceSubmissionId: undefined,
      sourceIpHash: null,
    }, { upsertByEmail: true });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        schemaVersion: NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION,
        subscriber: buildNewsletterSubscriberPayload(result.contact, form, { includeSourceValues: true }),
        existing: result.existing,
      },
      subscriber: buildNewsletterSubscriberPayload(result.contact, form, { includeSourceValues: true }),
      existing: result.existing,
    }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    console.error('Admin newsletter subscriber save API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
