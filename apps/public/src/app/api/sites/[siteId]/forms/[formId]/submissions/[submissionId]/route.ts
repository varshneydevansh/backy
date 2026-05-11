import { NextRequest, NextResponse } from 'next/server';
import {
  buildContactShareFromSubmission,
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  updateFormSubmissionStatus,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { FormSubmission } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    submissionId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const parseStatus = (value: unknown): FormSubmission['status'] | null => (
  value === 'pending' || value === 'approved' || value === 'rejected' || value === 'spam'
    ? value
    : null
);

const parseBody = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    status: parseStatus(record.status),
    reviewedBy: typeof record.reviewedBy === 'string' ? record.reviewedBy : undefined,
    adminNotes: typeof record.adminNotes === 'string' ? record.adminNotes : undefined,
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId, submissionId } = await params;

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

      const submission = await repositories.forms.getSubmissionById(site.id, form.id, submissionId);
      if (!submission) {
        return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
      }

      return privateResponse({
        success: true,
        requestId,
        data: { submission },
        submission,
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

    const submission = getSubmissionById(submissionId);
    if (!submission || submission.formId !== form.id) {
      return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
    }

    return privateResponse({
      success: true,
      requestId,
      data: { submission },
      submission,
    }, requestId);
  } catch (error) {
    console.error('Public form submission detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId, submissionId } = await params;
    const body = parseBody(await request.json().catch(() => null));
    if (!body?.status) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', requestId);
    }

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

      const submission = await repositories.forms.getSubmissionById(site.id, form.id, submissionId);
      if (!submission) {
        return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
      }

      const updated = (await repositories.forms.updateSubmission(site.id, submission.id, {
        status: body.status,
        reviewedBy: body.reviewedBy,
        reviewedAt: new Date().toISOString(),
        adminNotes: body.adminNotes,
      })).item;

      return privateResponse({
        success: true,
        requestId,
        data: { submission: updated },
        submission: updated,
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

    const submission = getSubmissionById(submissionId);
    if (!submission || submission.formId !== form.id) {
      return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
    }

    const updated = updateFormSubmissionStatus(submissionId, {
      status: body.status,
      reviewedBy: body.reviewedBy,
      adminNotes: body.adminNotes,
    });
    if (!updated) {
      return errorResponse(409, 'SUBMISSION_UPDATE_FAILED', 'Unable to update submission', requestId);
    }

    if (updated.status === 'approved' && form.contactShare?.enabled === true) {
      buildContactShareFromSubmission(site.id, form.id, updated.values, {
        status: updated.status,
        pageId: updated.pageId ?? null,
        postId: updated.postId ?? null,
        ipHash: updated.ipHash ?? null,
        sourceSubmissionId: updated.id,
      });
    }

    return privateResponse({
      success: true,
      requestId,
      data: { submission: updated },
      submission: updated,
    }, requestId);
  } catch (error) {
    console.error('Public form submission detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
