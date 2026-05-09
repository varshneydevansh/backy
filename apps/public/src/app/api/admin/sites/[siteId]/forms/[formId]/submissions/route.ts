import { NextRequest, NextResponse } from 'next/server';
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

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '20', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
};

const parseOffset = (value: string | null) => {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseStatus = (value: string | null) => (
  SUBMISSION_STATUSES.includes(value as (typeof SUBMISSION_STATUSES)[number])
    ? value as (typeof SUBMISSION_STATUSES)[number]
    : undefined
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

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

