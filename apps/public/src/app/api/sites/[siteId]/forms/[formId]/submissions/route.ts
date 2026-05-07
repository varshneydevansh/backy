import { NextRequest, NextResponse } from 'next/server';
import {
  attachCollectionRecordToSubmission,
  buildContactShareFromSubmission,
  createCollectionRecordFromFormSubmission,
  createFormSubmission,
  listFormSubmissions,
  getFormById,
  getSiteByIdOrSlug,
  trackWebhookEvent,
  validateAndClassifyFormSubmission,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
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

const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;

type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

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

function parseStatus(raw: string | null): SubmissionStatus | 'all' {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam'
  ) {
    return raw;
  }

  return 'all';
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || '20', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseTextInput(raw: string | null): string {
  return raw ? raw.trim() : '';
}

function parseRequestId(raw: string | null): string | undefined {
  const normalized = parseTextInput(raw);
  return normalized.length ? normalized : undefined;
}

function parseRequestBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const values = typeof (raw as { values?: unknown }).values === 'object'
    && (raw as { values?: unknown }).values !== null
      ? ((raw as { values?: Record<string, unknown> }).values as Record<string, unknown>)
      : {};

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
    values,
    honeypot: typeof (raw as { honeypot?: unknown }).honeypot === 'string'
      ? (raw as { honeypot: string }).honeypot
      : '',
    pageId: typeof (raw as { pageId?: unknown }).pageId === 'string'
      ? (raw as { pageId: string }).pageId
      : null,
    postId: typeof (raw as { postId?: unknown }).postId === 'string'
      ? (raw as { postId: string }).postId
      : null,
    requestId: typeof (raw as { requestId?: unknown }).requestId === 'string'
      ? (raw as { requestId: string }).requestId
      : undefined,
    rateLimitBypass: (raw as { rateLimitBypass?: unknown }).rateLimitBypass === true,
    startedAt: typeof (raw as { startedAt?: unknown }).startedAt === 'number'
      ? (raw as { startedAt: number }).startedAt
      : typeof (raw as { startedAt?: unknown }).startedAt === 'string'
        ? (raw as { startedAt: string }).startedAt
        : undefined,
    contactShareOverride: contactShareOverride && Object.keys(contactShareOverride).length > 0
      ? contactShareOverride
      : undefined,
  };
}

function normalizeRequestId(value?: string): string {
  const trimmed = (value || '').trim();
  return trimmed || `srv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractIpHash(request: NextRequest): string | null {
  const forwardHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');
  if (!forwardHeader) {
    return null;
  }

  return forwardHeader
    .split(',')
    .map((value) => value.trim())
    .find(Boolean) || null;
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', responseRequestId);
    }

    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const requestId = parseRequestId(searchParams.get('requestId'));
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));

    const result = listFormSubmissions(form.id, {
      status: status === 'all' ? undefined : status,
      requestId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId: responseRequestId,
      data: {
        form,
        submissions: result,
      },
      form: form,
      submissions: result,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', responseRequestId);
    }

    if (!form.isActive) {
      return errorResponse(400, 'FORM_INACTIVE', 'Form is not active', responseRequestId);
    }

    const parsed = parseRequestBody(await request.json().catch(() => null));
    if (!parsed) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
    }

    const requestId = normalizeRequestId(parsed.requestId);
    const ipHash = extractIpHash(request);
    const classification = validateAndClassifyFormSubmission(
      form,
      parsed.values,
      {
        honeypot: parsed.honeypot,
        ipHash,
        requestId,
        rateLimitBypass: parsed.rateLimitBypass,
        startedAt: parsed.startedAt,
      },
    );

    if (!classification.ok) {
      return NextResponse.json(
        {
          success: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: classification.spamMessage || 'Submission blocked.',
          },
          errorMessage: classification.spamMessage || 'Submission blocked.',
          status: classification.status,
          validation: classification.validation,
          spamFlags: classification.spamFlags,
          message: classification.spamMessage || 'Submission blocked.',
        },
        { status: 422 },
      );
    }

    let submission = createFormSubmission({
      siteId: site.id,
      formId: form.id,
      values: parsed.values,
      pageId: parsed.pageId,
      postId: parsed.postId,
      ipHash,
      userAgent: request.headers.get('user-agent') || undefined,
      requestId,
      status: classification.status,
    });

    let contact = null;
    let collectionRecordResult = null;
    if (classification.status === 'approved' || classification.status === 'pending') {
      contact = buildContactShareFromSubmission(site.id, form.id, parsed.values, {
        status: submission.status,
        pageId: parsed.pageId,
        postId: parsed.postId,
        requestId,
        ipHash,
        sourceSubmissionId: submission.id,
      }, parsed.contactShareOverride ?? undefined);

      collectionRecordResult = createCollectionRecordFromFormSubmission(
        site.id,
        form,
        parsed.values,
        submission,
      );
      submission = attachCollectionRecordToSubmission(submission.id, {
        record: collectionRecordResult.record,
        errors: collectionRecordResult.errors,
      }) || submission;
    }

    if (form.notificationWebhook && submission.status !== 'spam' && submission.status !== 'rejected') {
      const eventIdPayload = {
        formId: form.id,
        values: submission.values,
        submissionId: submission.id,
        status: submission.status,
        pageId: parsed.pageId,
        postId: parsed.postId,
      };

      trackWebhookEvent({
        kind: 'form-submission',
        formId: form.id,
        target: form.notificationWebhook,
        status: 'queued',
        requestId,
      });

      try {
        const response = await fetch(form.notificationWebhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-backy-site-id': site.id,
            'x-backy-form-id': form.id,
            'x-backy-submission-id': submission.id,
          },
          body: JSON.stringify(eventIdPayload),
        });

        if (!response.ok) {
          trackWebhookEvent({
            kind: 'form-submission',
            formId: form.id,
            target: form.notificationWebhook,
            status: 'failed',
            statusCode: response.status,
            requestId,
            error: `Webhook returned ${response.status}`,
          });
        } else {
          trackWebhookEvent({
            kind: 'form-submission',
            formId: form.id,
            target: form.notificationWebhook,
            status: 'succeeded',
            statusCode: 200,
            requestId: requestId,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown webhook error';
        trackWebhookEvent({
          kind: 'form-submission',
          formId: form.id,
          target: form.notificationWebhook,
          status: 'failed',
          requestId,
          error: message,
        });
      }

      if (contact) {
        await notifyContactWebhook({
          formId: form.id,
          eventType: 'contact-shared',
          target: form.notificationWebhook,
          requestId,
          siteId: site.id,
          submissionId: submission.id,
          contactId: contact.id,
          contactStatus: contact.status,
          values: parsed.values,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        requestId,
        status: submission.status,
        message: submission.status === 'pending'
          ? 'Submission received and awaiting moderation.'
          : 'Submission received.',
        data: {
          status: submission.status,
          message: submission.status === 'pending'
            ? 'Submission received and awaiting moderation.'
            : 'Submission received.',
          submission,
          contact,
          collectionRecord: collectionRecordResult?.record || null,
          collectionRecordErrors: collectionRecordResult?.errors || [],
        },
        submission,
        contact,
        collectionRecord: collectionRecordResult?.record || null,
        collectionRecordErrors: collectionRecordResult?.errors || [],
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();
  void params;

  return NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Unsupported method. Use POST for form submissions.',
      },
      errorMessage: 'Unsupported method. Use POST for form submissions.',
    },
    { status: 405 },
  );
}
