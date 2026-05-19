import { NextRequest, NextResponse } from 'next/server';
import type { Contact } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { createContactRecord, getFormById, getSiteByIdOrSlug, listFormContacts } from '@/lib/backyStore';
import { normalizeContactEmail, validateOptionalContactEmail } from '@/lib/contactEmailPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'archived'] as const;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseLimit = (value: string | null): { value: number; invalid?: string } => {
  if (value === null || value.trim() === '') {
    return { value: 20 };
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100
    ? { value: parsed }
    : { value: 20, invalid: value };
};

const parseOffset = (value: string | null): { value: number; invalid?: string } => {
  if (value === null || value.trim() === '') {
    return { value: 0 };
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? { value: parsed }
    : { value: 0, invalid: value };
};

const parseStatus = (value: string | null): { value?: (typeof CONTACT_STATUSES)[number]; invalid?: string } => {
  if (value === null || value.trim() === '' || value === 'all') {
    return {};
  }
  return CONTACT_STATUSES.includes(value as (typeof CONTACT_STATUSES)[number])
    ? { value: value as (typeof CONTACT_STATUSES)[number] }
    : { invalid: value };
};

const parseOptionalString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const parseContactStatus = (value: unknown): Contact['status'] => (
  value === 'new' || value === 'contacted' || value === 'qualified' || value === 'archived'
    ? value
    : 'new'
);

const isValidContactStatus = (value: unknown): value is Contact['status'] => (
  value === 'new' || value === 'contacted' || value === 'qualified' || value === 'archived'
);

const invalidContactStatusResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_ADMIN_FORM_CONTACT_STATUS',
  'Invalid admin form contact status. Use new, contacted, qualified, or archived.',
  requestId,
);

const parseSourceValues = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const parseContactBody = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = parseOptionalString(record.name);
  const email = parseOptionalString(record.email);
  const phone = parseOptionalString(record.phone);
  const notes = parseOptionalString(record.notes);
  const statusProvided = Object.prototype.hasOwnProperty.call(record, 'status');
  const status = parseContactStatus(record.status);
  const statusInvalid = statusProvided && !isValidContactStatus(record.status);

  if (!name && !email && !phone && !statusProvided) {
    return null;
  }

  return {
    statusInvalid,
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    notes: notes ?? null,
    pageId: parseOptionalString(record.pageId) ?? null,
    postId: parseOptionalString(record.postId) ?? null,
    requestId: parseOptionalString(record.requestId) ?? null,
    status,
    sourceValues: parseSourceValues(record.sourceValues),
    upsertByEmail: record.upsertByEmail === true,
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const { searchParams } = new URL(request.url);
    const statusFilter = parseStatus(searchParams.get('status'));
    if (statusFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONTACT_STATUS', 'Invalid admin form contact status filter. Use new, contacted, qualified, archived, or all.', requestId);
    }
    const filterRequestId = searchParams.get('requestId')?.trim() || undefined;
    const limitFilter = parseLimit(searchParams.get('limit'));
    if (limitFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONTACT_LIMIT', 'Invalid admin form contact limit filter. Use an integer from 1 to 100.', requestId);
    }
    const offsetFilter = parseOffset(searchParams.get('offset'));
    if (offsetFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONTACT_OFFSET', 'Invalid admin form contact offset filter. Use a non-negative integer.', requestId);
    }
    const status = statusFilter.value;
    const limit = limitFilter.value;
    const offset = offsetFilter.value;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const result = await repositories.forms.listContacts({
        siteId: site.id,
        formId: form.id,
        status,
        requestId: filterRequestId,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          formId: form.id,
          contacts: result.items,
          count: result.pagination.total,
          pagination: result.pagination,
        },
        formId: form.id,
        contacts: result.items,
        count: result.pagination.total,
        pagination: result.pagination,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const result = listFormContacts(form.id, {
      status,
      requestId: filterRequestId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        formId: form.id,
        contacts: result.contacts,
        count: result.count,
        pagination: result.pagination,
      },
      formId: form.id,
      contacts: result.contacts,
      count: result.count,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Admin form contacts API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = parseContactBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Contact requires a name, email, or phone.', requestId);
    }
    if (body.statusInvalid) {
      return invalidContactStatusResponse(requestId);
    }
    if (!body.name && !body.email && !body.phone) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Contact requires a name, email, or phone.', requestId);
    }
    const emailPolicy = validateOptionalContactEmail(body.email);
    if (!emailPolicy.ok) {
      return errorResponse(400, 'INVALID_CONTACT_EMAIL', emailPolicy.message, requestId);
    }
    const contactInput = {
      ...body,
      email: emailPolicy.email,
    };

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const normalizedEmail = normalizeContactEmail(contactInput.email);
      const existing = contactInput.upsertByEmail && normalizedEmail
        ? (await repositories.forms.listContacts({ siteId: site.id, formId: form.id, limit: 1000 })).items
            .find((contact) => normalizeContactEmail(contact.email) === normalizedEmail)
        : undefined;
      const contact = existing
        ? (await repositories.forms.updateContact(site.id, existing.id, {
            pageId: contactInput.pageId,
            postId: contactInput.postId,
            name: contactInput.name,
            email: contactInput.email,
            phone: contactInput.phone,
            notes: contactInput.notes,
            status: contactInput.status,
            sourceValues: contactInput.sourceValues,
            requestId: contactInput.requestId,
          })).item
        : (await repositories.forms.createContact({
            siteId: site.id,
            formId: form.id,
            pageId: contactInput.pageId,
            postId: contactInput.postId,
            name: contactInput.name,
            email: contactInput.email,
            phone: contactInput.phone,
            notes: contactInput.notes,
            status: contactInput.status,
            sourceValues: contactInput.sourceValues,
            sourceSubmissionId: undefined,
            requestId: contactInput.requestId,
            sourceIpHash: null,
          })).item;

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          formId: form.id,
          contact,
          created: !existing,
          updated: Boolean(existing),
        },
        formId: form.id,
        contact,
      }, { status: existing ? 200 : 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const result = createContactRecord({
      siteId: site.id,
      formId: form.id,
      pageId: contactInput.pageId,
      postId: contactInput.postId,
      name: contactInput.name,
      email: contactInput.email,
      phone: contactInput.phone,
      notes: contactInput.notes,
      status: contactInput.status,
      sourceValues: contactInput.sourceValues,
      sourceSubmissionId: undefined,
      requestId: contactInput.requestId,
      sourceIpHash: null,
    }, { upsertByEmail: contactInput.upsertByEmail });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        formId: form.id,
        contact: result.contact,
        created: !result.existing,
        updated: result.existing,
      },
      formId: form.id,
      contact: result.contact,
    }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    console.error('Admin form contact create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
