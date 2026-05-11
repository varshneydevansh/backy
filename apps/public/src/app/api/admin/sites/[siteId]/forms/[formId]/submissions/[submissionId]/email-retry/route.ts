import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getFormById, getSiteByIdOrSlug, getSubmissionById, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import {
  buildFormNotificationEmail,
  EmailDeliveryError,
  getEmailDeliveryConfig,
  sendEmailMessage,
} from '@/lib/formEmailDelivery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

async function recordEmailRetryEvent(params: {
  repositories?: FormRepositories | null;
  siteId: string;
  formId: string;
  submissionId: string;
  target: string;
  status: DeliveryStatus;
  provider: string;
  from: string;
  submissionStatus: string;
  subject?: string;
  statusCode?: number;
  requestId: string;
  error?: string;
  metadata?: Record<string, unknown>;
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
      channel: 'email',
      retry: true,
      provider: params.provider,
      from: params.from,
      ...(params.subject ? { subject: params.subject } : {}),
      submissionStatus: params.submissionStatus,
      ...(params.metadata || {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

async function retryFormEmail(params: {
  repositories?: FormRepositories | null;
  siteId: string;
  form: FormDefinition;
  submission: FormSubmission;
  requestId: string;
}) {
  const to = readString(params.form.notificationEmail);
  if (!to) {
    return { attempted: false as const, status: 'failed' as const, error: 'Form does not have a notification email configured.' };
  }

  if (params.submission.status === 'spam' || params.submission.status === 'rejected') {
    return { attempted: false as const, status: 'failed' as const, error: `Submission status ${params.submission.status} is not deliverable.` };
  }

  const target = `mailto:${to}`;
  const config = getEmailDeliveryConfig();
  const message = buildFormNotificationEmail({
    config,
    siteId: params.siteId,
    form: params.form,
    submission: params.submission,
    values: params.submission.values || {},
    requestId: params.requestId,
    to,
  });

  await recordEmailRetryEvent({
    repositories: params.repositories,
    siteId: params.siteId,
    formId: params.form.id,
    submissionId: params.submission.id,
    target,
    status: 'queued',
    provider: config.provider,
    from: config.from,
    submissionStatus: params.submission.status,
    subject: message.subject,
    requestId: params.requestId,
  });

  try {
    const result = await sendEmailMessage(config, message);
    await recordEmailRetryEvent({
      repositories: params.repositories,
      siteId: params.siteId,
      formId: params.form.id,
      submissionId: params.submission.id,
      target,
      status: 'succeeded',
      provider: config.provider,
      from: config.from,
      submissionStatus: params.submission.status,
      subject: message.subject,
      statusCode: result.statusCode,
      requestId: params.requestId,
      metadata: result.metadata,
    });

    return {
      attempted: true as const,
      target,
      status: 'succeeded' as const,
      statusCode: result.statusCode,
      provider: config.provider,
      metadata: result.metadata,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown email delivery error';
    await recordEmailRetryEvent({
      repositories: params.repositories,
      siteId: params.siteId,
      formId: params.form.id,
      submissionId: params.submission.id,
      target,
      status: 'failed',
      provider: config.provider,
      from: config.from,
      submissionStatus: params.submission.status,
      subject: message.subject,
      statusCode: error instanceof EmailDeliveryError ? error.statusCode : undefined,
      requestId: params.requestId,
      error: messageText,
      metadata: error instanceof EmailDeliveryError ? error.metadata : undefined,
    });

    return {
      attempted: true as const,
      target,
      status: 'failed' as const,
      statusCode: error instanceof EmailDeliveryError ? error.statusCode : undefined,
      provider: config.provider,
      error: messageText,
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

      const delivery = await retryFormEmail({ repositories, siteId: site.id, form, submission, requestId });
      if (!delivery.attempted) {
        return errorResponse(409, 'EMAIL_RETRY_NOT_DELIVERABLE', delivery.error, requestId);
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

    const delivery = await retryFormEmail({ siteId: site.id, form, submission, requestId });
    if (!delivery.attempted) {
      return errorResponse(409, 'EMAIL_RETRY_NOT_DELIVERABLE', delivery.error, requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: { delivery, submission },
      delivery,
      submission,
    });
  } catch (error) {
    console.error('Admin form email retry API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
