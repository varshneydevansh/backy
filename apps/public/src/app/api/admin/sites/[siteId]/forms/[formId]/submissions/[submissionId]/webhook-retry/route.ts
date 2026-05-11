import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getFormById, getSiteByIdOrSlug, getSubmissionById, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    submissionId: string;
  }>;
}

type FormRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type DeliveryStatus = 'queued' | 'succeeded' | 'failed';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

async function recordDeliveryEvent(params: {
  repositories?: FormRepositories | null;
  siteId: string;
  formId: string;
  submissionId: string;
  target: string;
  status: DeliveryStatus;
  statusCode?: number;
  requestId: string;
  error?: string;
}) {
  const event = {
    kind: 'form-submission' as const,
    siteId: params.siteId,
    formId: params.formId,
    submissionId: params.submissionId,
    target: params.target,
    status: params.status,
    statusCode: params.statusCode,
    requestId: params.requestId,
    error: params.error,
    metadata: {
      retry: true,
      submissionId: params.submissionId,
      status: params.status,
      ...(params.statusCode !== undefined ? { statusCode: params.statusCode } : {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

async function retryFormWebhook(params: {
  repositories?: FormRepositories | null;
  siteId: string;
  form: FormDefinition;
  submission: FormSubmission;
  requestId: string;
}) {
  const target = params.form.notificationWebhook;
  if (!target) {
    return { attempted: false as const, status: 'failed' as const, error: 'Form does not have a notification webhook configured.' };
  }

  if (params.submission.status === 'spam' || params.submission.status === 'rejected') {
    return { attempted: false as const, status: 'failed' as const, error: `Submission status ${params.submission.status} is not deliverable.` };
  }

  await recordDeliveryEvent({
    repositories: params.repositories,
    siteId: params.siteId,
    formId: params.form.id,
    submissionId: params.submission.id,
    target,
    status: 'queued',
    requestId: params.requestId,
  });

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backy-site-id': params.siteId,
        'x-backy-form-id': params.form.id,
        'x-backy-submission-id': params.submission.id,
        'x-backy-webhook-retry': 'true',
      },
      body: JSON.stringify({
        retry: true,
        formId: params.form.id,
        siteId: params.siteId,
        values: params.submission.values,
        submissionId: params.submission.id,
        status: params.submission.status,
        pageId: params.submission.pageId,
        postId: params.submission.postId,
      }),
    });

    const deliveryStatus = response.ok ? 'succeeded' : 'failed';
    const error = response.ok ? undefined : `Webhook returned ${response.status}`;
    await recordDeliveryEvent({
      repositories: params.repositories,
      siteId: params.siteId,
      formId: params.form.id,
      submissionId: params.submission.id,
      target,
      status: deliveryStatus,
      statusCode: response.status,
      requestId: params.requestId,
      error,
    });

    return {
      attempted: true as const,
      target,
      status: deliveryStatus,
      statusCode: response.status,
      error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    await recordDeliveryEvent({
      repositories: params.repositories,
      siteId: params.siteId,
      formId: params.form.id,
      submissionId: params.submission.id,
      target,
      status: 'failed',
      requestId: params.requestId,
      error: message,
    });

    return {
      attempted: true as const,
      target,
      status: 'failed' as const,
      error: message,
    };
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const body = await request.json().catch(() => null);
  const bodyRequestId = isRecord(body) && typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const requestId = request.headers.get('x-request-id') || bodyRequestId || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId, submissionId } = await params;

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

      const submission = await repositories.forms.getSubmissionById(site.id, form.id, submissionId);
      if (!submission) {
        return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
      }

      const delivery = await retryFormWebhook({ repositories, siteId: site.id, form, submission, requestId });
      if (!delivery.attempted) {
        return errorResponse(409, 'WEBHOOK_RETRY_NOT_DELIVERABLE', delivery.error, requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: { delivery, submission },
        delivery,
        submission,
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

    const submission = getSubmissionById(submissionId);
    if (!submission || submission.formId !== form.id) {
      return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
    }

    const delivery = await retryFormWebhook({ siteId: site.id, form, submission, requestId });
    if (!delivery.attempted) {
      return errorResponse(409, 'WEBHOOK_RETRY_NOT_DELIVERABLE', delivery.error, requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: { delivery, submission },
      delivery,
      submission,
    });
  } catch (error) {
    console.error('Admin form webhook retry API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
