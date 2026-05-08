import { NextRequest } from 'next/server';
import {
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  updateFormSubmissionStatus,
  buildContactShareFromSubmission,
  trackWebhookEvent,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { Contact, FormDefinition, FormSubmission } from '@backy-cms/core';

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

const parseShareValue = (values: Record<string, unknown>, field?: string): string | null => {
  if (!field) return null;
  const value = values[field];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const buildRepositoryContactShare = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  form: FormDefinition,
  submission: FormSubmission,
  contactShareOverride?: ContactShareOverridePayload,
): Promise<Contact | null> => {
  const resolvedShare = {
    enabled: contactShareOverride?.enabled !== undefined
      ? contactShareOverride.enabled
      : form.contactShare?.enabled ?? false,
    nameField: contactShareOverride?.nameField || form.contactShare?.nameField,
    emailField: contactShareOverride?.emailField || form.contactShare?.emailField,
    phoneField: contactShareOverride?.phoneField || form.contactShare?.phoneField,
    notesField: contactShareOverride?.notesField || form.contactShare?.notesField,
    dedupeByEmail: contactShareOverride?.dedupeByEmail ?? form.contactShare?.dedupeByEmail,
  };

  if (!resolvedShare.enabled || submission.status === 'spam') return null;

  const name = parseShareValue(submission.values, resolvedShare.nameField);
  const email = parseShareValue(submission.values, resolvedShare.emailField);
  const phone = parseShareValue(submission.values, resolvedShare.phoneField);
  const notes = parseShareValue(submission.values, resolvedShare.notesField);
  if (!name && !email && !phone) return null;

  const existing = resolvedShare.dedupeByEmail !== false && email
    ? (await repositories.forms.listContacts({
        siteId: form.siteId,
        formId: form.id,
        search: email,
        limit: 100,
        offset: 0,
      })).items.find((contact) => normalizeIdentifier(contact.email || '') === normalizeIdentifier(email))
    : null;
  const mergedNotes = [existing?.notes, notes].filter(Boolean).join(existing?.notes ? '\n' : '');

  if (existing) {
    return (await repositories.forms.updateContact(form.siteId, existing.id, {
      name: name ?? existing.name,
      email: email ?? existing.email,
      phone: phone ?? existing.phone,
      notes: mergedNotes,
      sourceValues: submission.values,
      status: 'new',
    })).item;
  }

  return (await repositories.forms.createContact({
    siteId: form.siteId,
    formId: form.id,
    pageId: submission.pageId ?? null,
    postId: submission.postId ?? null,
    name,
    email,
    phone,
    notes,
    sourceValues: submission.values,
    status: 'new',
    sourceSubmissionId: submission.id,
    requestId: submission.requestId,
    sourceIpHash: submission.ipHash,
  })).item;
};

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

      const submission = await repositories.forms.getSubmissionById(site.id, form.id, submissionId);
      if (!submission) {
        return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
      }

      return privateResponse({
        success: true,
        requestId,
        data: {
          submission,
        },
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
      data: {
        submission,
      },
      submission,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId, submissionId } = await params;
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

      const submission = await repositories.forms.getSubmissionById(site.id, form.id, submissionId);
      if (!submission) {
        return errorResponse(404, 'SUBMISSION_NOT_FOUND', 'Submission not found', requestId);
      }

      const body = parseBody(await request.json().catch(() => null));
      if (!body || !body.status) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', requestId);
      }

      const updated = (await repositories.forms.updateSubmission(site.id, submission.id, {
        status: body.status,
        reviewedBy: body.reviewedBy,
        reviewedAt: new Date().toISOString(),
        adminNotes: body.adminNotes,
      })).item;

      const shouldShareContact = body.contactShareOverride?.enabled !== undefined
        ? body.contactShareOverride.enabled
        : form.contactShare?.enabled === true;
      if (updated.status === 'approved' && shouldShareContact) {
        await buildRepositoryContactShare(repositories, form, updated, body.contactShareOverride);
      }

      return privateResponse({
        success: true,
        requestId,
        data: {
          submission: updated,
        },
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

    return privateResponse({
      success: true,
      requestId,
      data: {
        submission: updated,
      },
      submission: updated,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
