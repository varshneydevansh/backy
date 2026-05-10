import { NextRequest, NextResponse } from 'next/server';
import type { Contact } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { createContactRecord, getFormById, getSiteByIdOrSlug, listFormContacts } from '@/lib/backyStore';
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

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '20', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
};

const parseOffset = (value: string | null) => {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseStatus = (value: string | null) => (
  CONTACT_STATUSES.includes(value as (typeof CONTACT_STATUSES)[number])
    ? value as (typeof CONTACT_STATUSES)[number]
    : undefined
);

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || null;

const parseOptionalString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const parseContactStatus = (value: unknown): Contact['status'] => (
  value === 'new' || value === 'contacted' || value === 'qualified' || value === 'archived'
    ? value
    : 'new'
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

  if (!name && !email && !phone) {
    return null;
  }

  return {
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    notes: notes ?? null,
    pageId: parseOptionalString(record.pageId) ?? null,
    postId: parseOptionalString(record.postId) ?? null,
    requestId: parseOptionalString(record.requestId) ?? null,
    status: parseContactStatus(record.status),
    sourceValues: parseSourceValues(record.sourceValues),
    upsertByEmail: record.upsertByEmail === true,
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const filterRequestId = searchParams.get('requestId')?.trim() || undefined;
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));

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
  const access = requireAdminAccess(request, requestId, { permission: 'collections.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = parseContactBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Contact requires a name, email, or phone.', requestId);
    }

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

      const normalizedEmail = normalizeEmail(body.email);
      const existing = body.upsertByEmail && normalizedEmail
        ? (await repositories.forms.listContacts({ siteId: site.id, formId: form.id, limit: 1000 })).items
            .find((contact) => normalizeEmail(contact.email) === normalizedEmail)
        : undefined;
      const contact = existing
        ? (await repositories.forms.updateContact(site.id, existing.id, {
            pageId: body.pageId,
            postId: body.postId,
            name: body.name,
            email: body.email,
            phone: body.phone,
            notes: body.notes,
            status: body.status,
            sourceValues: body.sourceValues,
            requestId: body.requestId,
          })).item
        : (await repositories.forms.createContact({
            siteId: site.id,
            formId: form.id,
            pageId: body.pageId,
            postId: body.postId,
            name: body.name,
            email: body.email,
            phone: body.phone,
            notes: body.notes,
            status: body.status,
            sourceValues: body.sourceValues,
            sourceSubmissionId: undefined,
            requestId: body.requestId,
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
      pageId: body.pageId,
      postId: body.postId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      notes: body.notes,
      status: body.status,
      sourceValues: body.sourceValues,
      sourceSubmissionId: undefined,
      requestId: body.requestId,
      sourceIpHash: null,
    }, { upsertByEmail: body.upsertByEmail });

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
