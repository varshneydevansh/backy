import { NextRequest } from 'next/server';
import {
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  trackWebhookEvent,
  updateContactStatus,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
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
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

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
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId, contactId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const body = parseBody(await request.json().catch(() => null));
      if (!body) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', requestId);
      }

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) {
        return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      }

      const updated = (await repositories.forms.updateContact(site.id, contact.id, {
        status: body.status,
      })).item;

      return privateResponse({
        success: true,
        requestId,
        data: {
          contact: updated,
        },
        contact: updated,
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

    const body = parseBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', requestId);
    }

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }

    const updated = updateContactStatus(contact.id, {
      status: body.status,
    });

    if (!updated) {
      return errorResponse(409, 'CONTACT_UPDATE_FAILED', 'Unable to update contact', requestId);
    }

    if (form.notificationWebhook) {
      const sourceSubmission = updated.sourceSubmissionId
        ? getSubmissionById(updated.sourceSubmissionId)
        : null;
      const webhookRequestId = updated.requestId || sourceSubmission?.requestId || requestId;

      void notifyContactStatusWebhook({
        formId: form.id,
        target: form.notificationWebhook,
        requestId: webhookRequestId,
        contactId: updated.id,
        submissionId: updated.sourceSubmissionId || undefined,
        contactStatus: updated.status,
        siteId: site.id,
      });
    }

    return privateResponse({
      success: true,
      requestId,
      data: {
        contact: updated,
      },
      contact: updated,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
