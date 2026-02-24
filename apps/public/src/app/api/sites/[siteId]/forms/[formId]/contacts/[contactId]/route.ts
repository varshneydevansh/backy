import { NextRequest, NextResponse } from 'next/server';
import {
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  trackWebhookEvent,
  updateContactStatus,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
  }>;
}

type ContactStatus = 'new' | 'contacted' | 'qualified' | 'archived';

async function notifyContactStatusWebhook(params: {
  formId: string;
  target: string;
  requestId?: string;
  contactId: string;
  submissionId?: string;
  contactStatus: ContactStatus;
  siteId: string;
  formValues?: Record<string, unknown>;
}) {
  const payload = {
    kind: 'contact-status',
    formId: params.formId,
    siteId: params.siteId,
    contactId: params.contactId,
    submissionId: params.submissionId,
    contactStatus: params.contactStatus,
    values: params.formValues ?? {},
    timestamp: new Date().toISOString(),
  };

  trackWebhookEvent({
    kind: 'contact-status',
    formId: params.formId,
    target: params.target,
    status: 'queued',
    requestId: params.requestId,
    contactId: params.contactId,
    submissionId: params.submissionId,
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
        kind: 'contact-status',
        formId: params.formId,
        target: params.target,
        status: 'failed',
        requestId: params.requestId,
        contactId: params.contactId,
        submissionId: params.submissionId,
        statusCode: response.status,
        error: `Webhook returned ${response.status}`,
      });
      return;
    }

    trackWebhookEvent({
      kind: 'contact-status',
      formId: params.formId,
      target: params.target,
      status: 'succeeded',
      requestId: params.requestId,
      contactId: params.contactId,
      submissionId: params.submissionId,
      statusCode: 200,
    });
  } catch (error) {
    trackWebhookEvent({
      kind: 'contact-status',
      formId: params.formId,
      target: params.target,
      status: 'failed',
      requestId: params.requestId,
      contactId: params.contactId,
      submissionId: params.submissionId,
      error: error instanceof Error ? error.message : 'Unknown webhook error',
    });
  }
}

function parseStatus(raw: unknown): ContactStatus | null {
  if (raw === 'new' || raw === 'contacted' || raw === 'qualified' || raw === 'archived') {
    return raw;
  }
  return null;
}

function parseBody(raw: unknown): { status: ContactStatus } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const status = parseStatus((raw as { status?: unknown }).status);
  if (!status) {
    return null;
  }

  return { status };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, formId, contactId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const body = parseBody(await request.json().catch(() => null));
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid payload. status is required.' },
        { status: 400 },
      );
    }

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const updated = updateContactStatus(contact.id, {
      status: body.status,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Unable to update contact' },
        { status: 409 },
      );
    }

    if (form.notificationWebhook) {
      const sourceSubmission = updated.sourceSubmissionId
        ? getSubmissionById(updated.sourceSubmissionId)
        : null;
      const requestId = updated.requestId || sourceSubmission?.requestId || undefined;

  void notifyContactStatusWebhook({
        formId: form.id,
        target: form.notificationWebhook,
        requestId,
        contactId: updated.id,
        submissionId: updated.sourceSubmissionId || undefined,
        contactStatus: updated.status,
        siteId: site.id,
      });
    }

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
