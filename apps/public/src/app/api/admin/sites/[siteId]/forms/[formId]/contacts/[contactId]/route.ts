import { NextRequest, NextResponse } from 'next/server';
import {
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  updateContactStatus,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
  }>;
}

type ContactStatus = 'new' | 'contacted' | 'qualified' | 'archived';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseStatus = (value: unknown): ContactStatus | null => (
  value === 'new' || value === 'contacted' || value === 'qualified' || value === 'archived'
    ? value
    : null
);

const parseNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const parseBody = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = parseStatus(record.status);
  const notes = parseNullableString(record.notes);

  if (!status && notes === undefined) {
    return null;
  }

  return {
    ...(status ? { status } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId, contactId } = await params;
    const body = parseBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or notes is required.', requestId);
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

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) {
        return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      }

      const updated = (await repositories.forms.updateContact(site.id, contact.id, {
        status: body.status,
        notes: body.notes,
      })).item;

      return NextResponse.json({
        success: true,
        requestId,
        data: { contact: updated },
        contact: updated,
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

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }

    const updated = updateContactStatus(contact.id, {
      status: body.status,
      notes: body.notes,
    });

    if (!updated) {
      return errorResponse(409, 'CONTACT_UPDATE_FAILED', 'Unable to update contact', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: { contact: updated },
      contact: updated,
    });
  } catch (error) {
    console.error('Admin form contact API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

