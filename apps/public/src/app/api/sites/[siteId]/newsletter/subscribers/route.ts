import { NextRequest } from 'next/server';
import type { Contact, FormDefinition } from '@backy-cms/core';
import { createContactRecord, getSiteByIdOrSlug, listFormContacts, listFormsBySite } from '@/lib/backyStore';
import { normalizeContactEmail, validateOptionalContactEmail } from '@/lib/contactEmailPolicy';
import {
  NEWSLETTER_SUBSCRIBE_SCHEMA_VERSION,
  buildNewsletterContactFields,
  buildNewsletterSourceValues,
  buildNewsletterSubscriberPayload,
  isNewsletterForm,
} from '@/lib/newsletterSubscribers';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type NewsletterPublicBody = {
  email?: unknown;
  name?: unknown;
  topics?: unknown;
  source?: unknown;
  signup_source?: unknown;
  consent?: unknown;
  consentText?: unknown;
  formId?: unknown;
  values?: unknown;
};

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const jsonResponse = <TBody,>(body: TBody, request: NextRequest, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    request,
    requestId,
    cache: status >= 400 ? 'error' : 'private',
    schemaVersion: NEWSLETTER_SUBSCRIBE_SCHEMA_VERSION,
  })
);

const errorResponse = (status: number, code: string, message: string, request: NextRequest, requestId: string) => (
  jsonResponse({
    success: false,
    requestId,
    error: { code, message },
    errorMessage: message,
  }, request, requestId, status)
);

const parseBody = async (request: NextRequest): Promise<NewsletterPublicBody> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const readNewsletterBodyField = (body: NewsletterPublicBody, key: string): unknown => {
  const direct = (body as Record<string, unknown>)[key];
  if (direct !== undefined) return direct;
  const values = isRecord(body.values) ? body.values : {};
  return values[key];
};

const findNewsletterForm = (forms: FormDefinition[], formId?: string): FormDefinition | null => (
  forms
    .filter((form) => form.isActive)
    .filter(isNewsletterForm)
    .find((form) => (formId ? form.id === formId : true)) || null
);

const fetchRepositoryForms = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
): Promise<FormDefinition[]> => {
  const forms: FormDefinition[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.list({ siteId, limit: PAGE_LIMIT, offset, isActive: true });
    forms.push(...result.items);
    if (!result.pagination.hasMore || forms.length >= result.pagination.total) break;
  }
  return forms;
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

const subscriberCreatedResponse = (
  request: NextRequest,
  requestId: string,
  contact: Contact,
  form: FormDefinition,
  existing: boolean,
) => jsonResponse({
  success: true,
  requestId,
  data: {
    schemaVersion: NEWSLETTER_SUBSCRIBE_SCHEMA_VERSION,
    subscriber: buildNewsletterSubscriberPayload(contact, form),
    existing,
    deliveryBoundary: 'Backy captured the subscriber; email delivery, unsubscribe enforcement, bounces, and DNS authentication stay provider-backed.',
  },
  subscriber: buildNewsletterSubscriberPayload(contact, form),
  existing,
}, request, requestId, existing ? 200 : 201);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseBody(request);
    const consent = booleanValue(readNewsletterBodyField(body, 'consent'));
    if (consent !== true) {
      return errorResponse(400, 'NEWSLETTER_CONSENT_REQUIRED', 'Newsletter signup requires explicit consent.', request, requestId);
    }
    const emailPolicy = validateOptionalContactEmail(textValue(readNewsletterBodyField(body, 'email')));
    if (!emailPolicy.ok || !emailPolicy.email) {
      return errorResponse(400, 'INVALID_NEWSLETTER_EMAIL', emailPolicy.ok ? 'Newsletter subscriber email is required.' : emailPolicy.message, request, requestId);
    }
    const name = textValue(readNewsletterBodyField(body, 'name'));
    const topics = textValue(readNewsletterBodyField(body, 'topics'));
    const source = textValue(readNewsletterBodyField(body, 'source')) || textValue(readNewsletterBodyField(body, 'signup_source')) || 'public-newsletter-api';
    const consentText = textValue(readNewsletterBodyField(body, 'consentText'));
    const formId = textValue(readNewsletterBodyField(body, 'formId'));
    const now = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', request, requestId);
      const form = findNewsletterForm(await fetchRepositoryForms(repositories, site.id), formId);
      if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Newsletter signup is not configured for this site.', request, requestId);
      const existing = await findRepositoryContactByEmail(repositories, site.id, form.id, emailPolicy.email);
      const sourceValues = buildNewsletterSourceValues({
        existingSourceValues: existing?.sourceValues,
        status: 'subscribed',
        topics,
        source,
        consent,
        consentText,
        requestId,
        now,
      });
      const newsletterFields = buildNewsletterContactFields({
        existing,
        status: 'subscribed',
        topics,
        source,
        consent,
        consentText,
        now,
      });
      const contact = existing
        ? (await repositories.forms.updateContact(site.id, existing.id, {
            name: name || existing.name,
            email: emailPolicy.email,
            notes: topics || existing.notes,
            status: existing.status === 'archived' ? 'new' : existing.status,
            sourceValues,
            ...newsletterFields,
            requestId,
          })).item
        : (await repositories.forms.createContact({
            siteId: site.id,
            formId: form.id,
            pageId: null,
            postId: null,
            name: name || null,
            email: emailPolicy.email,
            phone: null,
            notes: topics || null,
            status: 'new',
            sourceValues,
            ...newsletterFields,
            requestId,
          })).item;
      return subscriberCreatedResponse(request, requestId, contact, form, Boolean(existing));
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', request, requestId);
    const form = findNewsletterForm(listFormsBySite(site.id), formId);
    if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Newsletter signup is not configured for this site.', request, requestId);
    const result = createContactRecord({
      siteId: site.id,
      formId: form.id,
      pageId: null,
      postId: null,
      name: name || null,
      email: emailPolicy.email,
      phone: null,
      notes: topics || null,
      status: 'new',
      sourceValues: buildNewsletterSourceValues({
        status: 'subscribed',
        topics,
        source,
        consent,
        consentText,
        requestId,
        now,
      }),
      ...buildNewsletterContactFields({
        status: 'subscribed',
        topics,
        source,
        consent,
        consentText,
        now,
      }),
      requestId,
      sourceSubmissionId: undefined,
      sourceIpHash: null,
    }, { upsertByEmail: true });
    return subscriberCreatedResponse(request, requestId, result.contact, form, result.existing);
  } catch (error) {
    console.error('Public newsletter signup API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', request, requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseBody(request);
    const emailPolicy = validateOptionalContactEmail(textValue(readNewsletterBodyField(body, 'email')));
    if (!emailPolicy.ok || !emailPolicy.email) {
      return errorResponse(400, 'INVALID_NEWSLETTER_EMAIL', emailPolicy.ok ? 'Newsletter subscriber email is required.' : emailPolicy.message, request, requestId);
    }
    const source = textValue(readNewsletterBodyField(body, 'source')) || textValue(readNewsletterBodyField(body, 'signup_source')) || 'public-newsletter-api';
    const formId = textValue(readNewsletterBodyField(body, 'formId'));
    const now = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', request, requestId);
      const form = findNewsletterForm(await fetchRepositoryForms(repositories, site.id), formId);
      if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Newsletter signup is not configured for this site.', request, requestId);
      const existing = await findRepositoryContactByEmail(repositories, site.id, form.id, emailPolicy.email);
      if (!existing) return errorResponse(404, 'NEWSLETTER_SUBSCRIBER_NOT_FOUND', 'Newsletter subscriber was not found.', request, requestId);
      const contact = (await repositories.forms.updateContact(site.id, existing.id, {
        status: 'archived',
        sourceValues: buildNewsletterSourceValues({
          existingSourceValues: existing.sourceValues,
          status: 'unsubscribed',
          source,
          requestId,
          now,
        }),
        ...buildNewsletterContactFields({
          existing,
          status: 'unsubscribed',
          source,
          now,
        }),
        requestId,
      })).item;
      return subscriberCreatedResponse(request, requestId, contact, form, true);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', request, requestId);
    const form = findNewsletterForm(listFormsBySite(site.id), formId);
    if (!form) return errorResponse(404, 'NEWSLETTER_FORM_NOT_CONFIGURED', 'Newsletter signup is not configured for this site.', request, requestId);
    const normalizedEmail = normalizeContactEmail(emailPolicy.email);
    const existing = listFormContacts(form.id, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }).contacts
      .find((contact) => normalizeContactEmail(contact.email) === normalizedEmail);
    if (!existing) return errorResponse(404, 'NEWSLETTER_SUBSCRIBER_NOT_FOUND', 'Newsletter subscriber was not found.', request, requestId);
    const result = createContactRecord({
      ...existing,
      status: 'archived',
      sourceValues: buildNewsletterSourceValues({
        existingSourceValues: existing.sourceValues,
        status: 'unsubscribed',
        source,
        requestId,
        now,
      }),
      ...buildNewsletterContactFields({
        existing,
        status: 'unsubscribed',
        source,
        now,
      }),
      requestId,
      sourceSubmissionId: existing.sourceSubmissionId,
      sourceIpHash: existing.sourceIpHash,
    }, { upsertByEmail: true });
    return subscriberCreatedResponse(request, requestId, result.contact, form, true);
  } catch (error) {
    console.error('Public newsletter unsubscribe API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', request, requestId);
  }
}
