import { NextRequest, NextResponse } from 'next/server';
import {
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  updateFormSubmissionStatus,
  buildContactShareFromSubmission,
  trackWebhookEvent,
} from '@/lib/backyStore';
import type { FormSubmission } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    submissionId: string;
  }>;
}

interface ContactShareOverridePayload {
  enabled?: boolean;
  nameField?: string;
  emailField?: string;
  phoneField?: string;
  notesField?: string;
  dedupeByEmail?: boolean;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status },
  )
);

function parseStatus(raw: unknown): FormSubmission['status'] | null {
  if (raw === 'pending' || raw === 'approved' || raw === 'rejected' || raw === 'spam') {
    return raw;
  }
  return null;
}

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const contactShare = typeof (raw as { contactShareOverride?: unknown }).contactShareOverride === 'object'
    ? ((raw as { contactShareOverride?: Record<string, unknown> }).contactShareOverride || null)
    : null;

  const contactShareOverride: ContactShareOverridePayload | null = contactShare
    ? {
      enabled: typeof (contactShare as { enabled?: unknown }).enabled === 'boolean'
        ? (contactShare as { enabled: boolean }).enabled
        : undefined,
      nameField: typeof (contactShare as { nameField?: unknown }).nameField === 'string'
        ? (contactShare as { nameField: string }).nameField
        : undefined,
      emailField: typeof (contactShare as { emailField?: unknown }).emailField === 'string'
        ? (contactShare as { emailField: string }).emailField
        : undefined,
      phoneField: typeof (contactShare as { phoneField?: unknown }).phoneField === 'string'
        ? (contactShare as { phoneField: string }).phoneField
        : undefined,
      notesField: typeof (contactShare as { notesField?: unknown }).notesField === 'string'
        ? (contactShare as { notesField: string }).notesField
        : undefined,
      dedupeByEmail: typeof (contactShare as { dedupeByEmail?: unknown }).dedupeByEmail === 'boolean'
        ? (contactShare as { dedupeByEmail: boolean }).dedupeByEmail
        : undefined,
    }
    : null;

  return {
    status: parseStatus((raw as { status?: unknown }).status),
    reviewedBy: typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
      ? (raw as { reviewedBy: string }).reviewedBy
      : undefined,
    adminNotes: typeof (raw as { adminNotes?: unknown }).adminNotes === 'string'
      ? (raw as { adminNotes: string }).adminNotes
      : undefined,
    contactShareOverride: contactShareOverride && Object.keys(contactShareOverride).length > 0
      ? contactShareOverride
      : undefined,
  };
}

async function notifyContactWebhook(params: {
  formId: string;
  eventType: 'contact-shared' | 'contact-status';
  target: string;
  requestId?: string;
  siteId?: string;
  submissionId?: string;
  contactId?: string;
  contactStatus?: string;
  values?: Record<string, unknown>;
}) {
  const webhookKind = params.eventType === 'contact-status' ? 'contact-status' : 'contact-shared';
  const payload = {
    kind: params.eventType,
    formId: params.formId,
    siteId: params.siteId,
    submissionId: params.submissionId,
    contactId: params.contactId,
    contactStatus: params.contactStatus,
    values: params.values ?? {},
    timestamp: new Date().toISOString(),
  };

  trackWebhookEvent({
    kind: webhookKind,
    formId: params.formId,
    target: params.target,
    status: 'queued',
    requestId: params.requestId,
    submissionId: params.submissionId,
    contactId: params.contactId,
  });

  try {
    const response = await fetch(params.target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      trackWebhookEvent({
        kind: webhookKind,
        formId: params.formId,
        target: params.target,
        status: 'failed',
        requestId: params.requestId,
        submissionId: params.submissionId,
        contactId: params.contactId,
        statusCode: response.status,
        error: `Webhook returned ${response.status}`,
      });
      return;
    }

    trackWebhookEvent({
      kind: webhookKind,
      formId: params.formId,
      target: params.target,
      status: 'succeeded',
      requestId: params.requestId,
      submissionId: params.submissionId,
      contactId: params.contactId,
      statusCode: 200,
    });
  } catch (error) {
    trackWebhookEvent({
      kind: webhookKind,
      formId: params.formId,
      target: params.target,
      status: 'failed',
      requestId: params.requestId,
      submissionId: params.submissionId,
      contactId: params.contactId,
      error: error instanceof Error ? error.message : 'Unknown webhook error',
    });
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId, submissionId } = await params;
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

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        submission,
      },
      submission,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId, submissionId } = await params;
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

    const body = parseBody(await request.json().catch(() => null));
    if (!body || !body.status) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', requestId);
    }

    const nextStatus = body.status;
    const updated = updateFormSubmissionStatus(submissionId, {
      status: nextStatus,
      reviewedBy: body.reviewedBy,
      adminNotes: body.adminNotes,
    });

    if (!updated) {
      return errorResponse(409, 'SUBMISSION_UPDATE_FAILED', 'Unable to update submission', requestId);
    }

    const shouldShareContact = body?.contactShareOverride?.enabled !== undefined
      ? body.contactShareOverride.enabled
      : form.contactShare?.enabled === true;

    if (nextStatus === 'approved' && shouldShareContact) {
      const contact = buildContactShareFromSubmission(site.id, form.id, updated.values, {
        status: updated.status,
        pageId: updated.pageId ?? null,
        postId: updated.postId ?? null,
        ipHash: updated.ipHash ?? null,
        sourceSubmissionId: updated.id,
      }, body?.contactShareOverride ?? undefined);

      if (contact && form.notificationWebhook) {
        await notifyContactWebhook({
          formId: form.id,
          eventType: 'contact-shared',
          target: form.notificationWebhook,
          requestId: updated.requestId ?? undefined,
          siteId: site.id,
          submissionId: updated.id,
          contactId: contact.id,
          contactStatus: contact.status,
          values: updated.values,
        });
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        submission: updated,
      },
      submission: updated,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
