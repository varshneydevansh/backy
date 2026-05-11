import { NextRequest } from 'next/server';
import type { BackyJsonValue, Contact, FormDefinition, FormSubmission } from '@backy-cms/core';
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
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const contractResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: status >= 400 ? 'error' : 'private',
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

  const rawRecord = raw as Record<string, unknown>;
  const valuesCandidate = rawRecord.values ?? rawRecord.fields ?? rawRecord.data ?? rawRecord.submission;
  const values = valuesCandidate && typeof valuesCandidate === 'object' && !Array.isArray(valuesCandidate)
    ? valuesCandidate as Record<string, unknown>
    : Object.entries(rawRecord).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (
          key !== 'contactShareOverride' &&
          key !== 'honeypot' &&
          key !== 'pageId' &&
          key !== 'postId' &&
          key !== 'requestId' &&
          key !== 'rateLimitBypass' &&
          key !== 'startedAt'
        ) {
          acc[key] = value;
        }
        return acc;
      }, {});

  const contactShare = typeof rawRecord.contactShareOverride === 'object'
    ? (rawRecord.contactShareOverride as Record<string, unknown> | null)
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

const withFormFrontendDesign = <TForm extends { settings?: unknown }>(form: TForm) => ({
  ...form,
  frontendDesign: frontendDesignProvenanceFromMetadata(form.settings),
});

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

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

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
  values: Record<string, unknown>,
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

  if (!resolvedShare.enabled || submission.status === 'spam') {
    return null;
  }

  const name = parseShareValue(values, resolvedShare.nameField);
  const email = parseShareValue(values, resolvedShare.emailField);
  const phone = parseShareValue(values, resolvedShare.phoneField);
  const notes = parseShareValue(values, resolvedShare.notesField);

  if (!name && !email && !phone) {
    return null;
  }

  const dedupeByEmail = resolvedShare.dedupeByEmail !== false;
  const existing = dedupeByEmail && email
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
      sourceValues: values,
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
    sourceValues: values,
    status: 'new',
    sourceSubmissionId: submission.id,
    requestId: submission.requestId,
    sourceIpHash: submission.ipHash,
  })).item;
};

const createRepositoryCollectionRecordFromSubmission = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  form: FormDefinition,
  values: Record<string, unknown>,
  submission: FormSubmission,
): Promise<{
  record: FormSubmission['collectionRecord'];
  errors: Array<{ field: string; message: string }>;
}> => {
  const target = form.collectionTarget;
  if (!target?.enabled) {
    return { record: null, errors: [] };
  }

  const collection = await repositories.collections.getById(siteId, target.collectionId)
    || await repositories.collections.getBySlug(siteId, target.collectionId);
  if (!collection || collection.status !== 'published') {
    return {
      record: null,
      errors: [{ field: 'collectionId', message: 'Target collection is not published or does not exist.' }],
    };
  }

  if (!collection.permissions.publicCreate) {
    return {
      record: null,
      errors: [{ field: 'collectionId', message: 'Target collection does not allow public creation.' }],
    };
  }

  const fieldKeys = new Set(collection.fields.map((field) => field.key));
  const fieldMap = target.fieldMap || {};
  const mappedValues = Object.entries(values).reduce<Record<string, unknown>>((acc, [sourceKey, value]) => {
    const mappedKey = typeof fieldMap[sourceKey] === 'string' && fieldMap[sourceKey].trim().length > 0
      ? fieldMap[sourceKey].trim()
      : sourceKey;
    if (fieldKeys.has(mappedKey)) {
      acc[mappedKey] = value;
    }
    return acc;
  }, {});

  const sourceSubmissionFieldKey = ['sourceSubmissionId', 'source_submission_id', 'sourcesubmissionid']
    .find((key) => fieldKeys.has(key));
  if (sourceSubmissionFieldKey) {
    mappedValues[sourceSubmissionFieldKey] = submission.id;
  }

  const validationErrors = validateCollectionRecordValues(collection as unknown as StoreCollection, mappedValues);
  if (validationErrors.length > 0) {
    return { record: null, errors: validationErrors };
  }

  const slugSource = target.slugField
    ? values[target.slugField] ?? mappedValues[target.slugField]
    : mappedValues.slug || mappedValues.title || mappedValues.name;
  const baseSlug = String(slugSource || `${form.id}-${submission.id}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'submission';
  let slug = baseSlug;
  let suffix = 2;
  while (await repositories.collections.getRecordBySlug(siteId, collection.id, slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const saved = (await repositories.collections.createRecord({
    siteId,
    collectionId: collection.id,
    slug,
    status: 'draft',
    values: toJsonRecord(mappedValues),
  })).item;

  return {
    record: {
      siteId,
      collectionId: collection.id,
      collectionSlug: collection.slug,
      recordId: saved.id,
      recordSlug: saved.slug,
      status: saved.status,
      createdAt: saved.createdAt,
    },
    errors: [],
  };
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId } = await params;
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const filterRequestId = parseRequestId(searchParams.get('requestId'));
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form || !form.isActive) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', responseRequestId);
      }

      const result = await repositories.forms.listSubmissions({
        siteId: site.id,
        formId: form.id,
        status: status === 'all' ? undefined : status,
        requestId: filterRequestId,
        limit,
        offset,
      });
      const submissions = {
        data: result.items,
        pagination: result.pagination,
      };
      const formContract = withFormFrontendDesign(form);

      return privateResponse({
        success: true,
        requestId: responseRequestId,
        data: { form: formContract, submissions },
        form: formContract,
        submissions,
      }, responseRequestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', responseRequestId);
    }

    const submissions = listFormSubmissions(form.id, {
      status: status === 'all' ? undefined : status,
      requestId: filterRequestId,
      limit,
      offset,
    });
    const formContract = withFormFrontendDesign(form);

    return privateResponse({
      success: true,
      requestId: responseRequestId,
      data: { form: formContract, submissions },
      form: formContract,
      submissions,
    }, responseRequestId);
  } catch (error) {
    console.error('Public form submissions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, formId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const form = await repositories.forms.getById(site.id, formId);
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
        return contractResponse(
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
          requestId,
          422,
        );
      }

      let submission = (await repositories.forms.createSubmission({
        siteId: site.id,
        formId: form.id,
        values: parsed.values,
        pageId: parsed.pageId,
        postId: parsed.postId,
        ipHash,
        userAgent: request.headers.get('user-agent') || undefined,
        requestId,
        status: classification.status,
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: null,
        collectionRecord: null,
        collectionRecordErrors: [],
      })).item;

      let contact: Contact | null = null;
      let collectionRecordResult: Awaited<ReturnType<typeof createRepositoryCollectionRecordFromSubmission>> | null = null;
      if (classification.status === 'approved' || classification.status === 'pending') {
        contact = await buildRepositoryContactShare(repositories, form, parsed.values, submission, parsed.contactShareOverride);
        collectionRecordResult = await createRepositoryCollectionRecordFromSubmission(
          repositories,
          site.id,
          form,
          parsed.values,
          submission,
        );
        submission = (await repositories.forms.updateSubmission(site.id, submission.id, {
          collectionRecord: collectionRecordResult.record,
          collectionRecordErrors: collectionRecordResult.errors,
        })).item;
      }

      return privateResponse(
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
        requestId,
        201,
      );
    }

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
      return contractResponse(
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
        requestId,
        422,
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

    return privateResponse(
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
      requestId,
      201,
    );
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();
  void params;

  return contractResponse(
    {
      success: false,
      requestId,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Unsupported method. Use POST for form submissions.',
      },
      errorMessage: 'Unsupported method. Use POST for form submissions.',
    },
    requestId,
    405,
  );
}
