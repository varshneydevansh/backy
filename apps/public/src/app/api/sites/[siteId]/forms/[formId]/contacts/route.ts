import { NextRequest, NextResponse } from 'next/server';
import { getFormById, getSiteByIdOrSlug, listFormContacts } from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'archived'] as const;

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: { code, message },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

const parseLimit = (value: string | null): { value: number; invalid?: string } => {
  if (!value) {
    return { value: 20 };
  }
  if (!/^\d+$/.test(value)) {
    return { value: 20, invalid: value };
  }
  const parsed = Number.parseInt(value, 10);
  const capped = Math.min(parsed, 100);
  return Number.isFinite(parsed) && parsed > 0 && parsed === capped
    ? { value: parsed }
    : { value: 20, invalid: value };
};

const parseOffset = (value: string | null): { value: number; invalid?: string } => {
  if (!value) {
    return { value: 0 };
  }
  if (!/^\d+$/.test(value)) {
    return { value: 0, invalid: value };
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? { value: parsed } : { value: 0, invalid: value };
};

const parseStatus = (value: string | null): { value?: (typeof CONTACT_STATUSES)[number]; invalid?: string } => {
  if (!value) {
    return {};
  }
  return CONTACT_STATUSES.includes(value as (typeof CONTACT_STATUSES)[number])
    ? { value: value as (typeof CONTACT_STATUSES)[number] }
    : { invalid: value };
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
      return errorResponse(
        400,
        'INVALID_FORM_CONTACT_STATUS',
        'Invalid form contact status filter. Use new, contacted, qualified, or archived.',
        requestId,
      );
    }
    const filterRequestId = searchParams.get('requestId')?.trim() || undefined;
    const limitFilter = parseLimit(searchParams.get('limit'));
    if (limitFilter.invalid) {
      return errorResponse(400, 'INVALID_FORM_CONTACT_LIMIT', 'Invalid form contact limit filter. Use an integer from 1 to 100.', requestId);
    }
    const offsetFilter = parseOffset(searchParams.get('offset'));
    if (offsetFilter.invalid) {
      return errorResponse(400, 'INVALID_FORM_CONTACT_OFFSET', 'Invalid form contact offset filter. Use a non-negative integer.', requestId);
    }
    const status = statusFilter.value;
    const limit = limitFilter.value;
    const offset = offsetFilter.value;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form || !form.isActive) {
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

      return privateResponse({
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
      }, requestId);
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

    return privateResponse({
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
    }, requestId);
  } catch (error) {
    console.error('Public form contacts API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
