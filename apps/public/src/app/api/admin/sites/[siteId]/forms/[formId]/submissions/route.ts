import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getFormById, getSiteByIdOrSlug, listFormSubmissions } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;

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

const parseStatus = (value: string | null): { value?: (typeof SUBMISSION_STATUSES)[number]; invalid?: string } => {
  if (value === null || value.trim() === '' || value === 'all') {
    return {};
  }
  return SUBMISSION_STATUSES.includes(value as (typeof SUBMISSION_STATUSES)[number])
    ? { value: value as (typeof SUBMISSION_STATUSES)[number] }
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
      return errorResponse(400, 'INVALID_ADMIN_FORM_SUBMISSION_STATUS', 'Invalid admin form submission status filter. Use pending, approved, rejected, spam, or all.', requestId);
    }
    const filterRequestId = searchParams.get('requestId')?.trim() || undefined;
    const limitFilter = parseLimit(searchParams.get('limit'));
    if (limitFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_SUBMISSION_LIMIT', 'Invalid admin form submission limit filter. Use an integer from 1 to 100.', requestId);
    }
    const offsetFilter = parseOffset(searchParams.get('offset'));
    if (offsetFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_SUBMISSION_OFFSET', 'Invalid admin form submission offset filter. Use a non-negative integer.', requestId);
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

      const result = await repositories.forms.listSubmissions({
        siteId: site.id,
        formId: form.id,
        status,
        requestId: filterRequestId,
        limit,
        offset,
      });
      const submissions = {
        data: result.items,
        pagination: result.pagination,
      };

      return NextResponse.json({
        success: true,
        requestId,
        data: { form, submissions },
        form,
        submissions,
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

    const submissions = listFormSubmissions(form.id, {
      status,
      requestId: filterRequestId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { form, submissions },
      form,
      submissions,
    });
  } catch (error) {
    console.error('Admin form submissions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
