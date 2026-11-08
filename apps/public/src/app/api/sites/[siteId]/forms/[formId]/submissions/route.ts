import { deliverFormSubmission } from '@/lib/formSubmissionDelivery';
import { requireSiteVisitor, VisitorAccessError } from '@/lib/visitor-auth/routes';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonValue, Contact, FormDefinition, FormSubmission } from '@backy-cms/core';
import {
  attachCollectionRecordToSubmission,
  buildContactShareFromSubmission,
  createCollectionRecordFromFormSubmission,
  createFormSubmission,
  getAdminSettings,
  listFormSubmissions,
  listFormsBySite,
  getMediaList,
  getFormById,
  getSiteByIdOrSlug,
  normalizeFormSubmissionValues,
  trackWebhookEvent,
  validateAndClassifyFormSubmission,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import {
  frontendDesignProvenanceFromMetadata,
  frontendFormFieldKeyMapFromMetadata,
} from '@/lib/frontendDesignContract';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import { verifyFormCaptcha } from '@/lib/formCaptcha';
import { requireAdminAccess } from '@/lib/adminAccess';
import { publicContractJson } from '@/lib/publicContractResponse';
import { requirePublicFormAudienceAccess } from '@/lib/publicFormAudienceAccess';
import { validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { admitFormAttachmentUpload, formAttachmentsFromValues, readFormSubmissionRequest, storeFormAttachments, FormAttachmentError } from '@/lib/formAttachments';
import { FormAttachmentStorageError } from '@/lib/formAttachmentStorage';
import { MediaSafetyError } from '@/lib/mediaSafety';
import { collectCompleteExportPages, CollectionExportIncompleteError } from '@/lib/collectionExportPagination';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;

type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
type FormRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type WebhookEventKind = 'form-submission' | 'contact-shared' | 'contact-status';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const CAPTCHA_TRANSPORT_KEYS = new Set([
  'captcha',
  'captchaToken',
  'captchaResponse',
  'turnstileToken',
  'hcaptchaToken',
  'recaptchaToken',
  'g-recaptcha-response',
  'cf-turnstile-response',
]);

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

function parseStatus(raw: string | null): { value: SubmissionStatus | 'all'; invalid?: string } {
  if (!raw) {
    return { value: 'all' };
  }

  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'all'
  ) {
    return { value: raw };
  }

  return { value: 'all', invalid: raw };
}

function parseLimit(value: string | null): { value: number; invalid?: string } {
  if (!value) {
    return { value: 20 };
  }
  if (!/^\d+$/.test(value)) {
    return { value: 20, invalid: value };
  }
  const parsed = Number.parseInt(value, 10);
  const capped = Math.min(parsed, 100);
  return Number.isFinite(parsed) && parsed > 0 && parsed === capped
    ? { value: parsed }
    : { value: 20, invalid: value };
}

function parseOffset(value: string | null): { value: number; invalid?: string } {
  if (!value) {
    return { value: 0 };
  }
  if (!/^\d+$/.test(value)) {
    return { value: 0, invalid: value };
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? { value: parsed } : { value: 0, invalid: value };
}

function parseTextInput(raw: string | null): string {
  return raw ? raw.trim() : '';
}

function parseRequestId(raw: string | null): string | undefined {
  const normalized = parseTextInput(raw);
  return normalized.length ? normalized : undefined;
}

function parseCaptchaToken(rawRecord: Record<string, unknown>): string | undefined {
  const directToken = [
    rawRecord.captchaToken,
    rawRecord.captchaResponse,
    rawRecord.turnstileToken,
    rawRecord.hcaptchaToken,
    rawRecord.recaptchaToken,
    rawRecord['g-recaptcha-response'],
    rawRecord['cf-turnstile-response'],
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (typeof directToken === 'string') {
    return directToken.trim();
  }

  const captcha = rawRecord.captcha;
  if (captcha && typeof captcha === 'object' && !Array.isArray(captcha)) {
    const nested = captcha as Record<string, unknown>;
    const nestedToken = [nested.token, nested.response].find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof nestedToken === 'string') {
      return nestedToken.trim();
    }
  }

  return undefined;
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
          key !== 'startedAt' &&
          !CAPTCHA_TRANSPORT_KEYS.has(key)
        ) {
          acc[key] = value;
        }
        return acc;
      }, {});

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
    startedAt: typeof (raw as { startedAt?: unknown }).startedAt === 'number'
      ? (raw as { startedAt: number }).startedAt
      : typeof (raw as { startedAt?: unknown }).startedAt === 'string'
        ? (raw as { startedAt: string }).startedAt
        : undefined,
    captchaToken: parseCaptchaToken(rawRecord),
  };
}

const withFormFrontendDesign = <TForm extends { settings?: unknown }>(form: TForm) => ({
  ...form,
  frontendDesign: frontendDesignProvenanceFromMetadata(form.settings),
  frontendFieldKeyMap: frontendFormFieldKeyMapFromMetadata(form.settings),
});

const normalizeFrontendSubmissionAliasKey = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

const normalizeFrontendSubmissionValueKeys = (
  form: Pick<FormDefinition, 'fields' | 'settings'>,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const fieldKeys = new Set((form.fields || []).map((field) => field.key).filter(Boolean));
  const frontendFieldKeyMap = frontendFormFieldKeyMapFromMetadata(form.settings) || {};

  return Object.entries(values).reduce<Record<string, unknown>>((acc, [rawKey, value]) => {
    if (fieldKeys.has(rawKey)) {
      acc[rawKey] = value;
      return acc;
    }

    const mappedKey =
      frontendFieldKeyMap[rawKey] ||
      frontendFieldKeyMap[normalizeFrontendSubmissionAliasKey(rawKey)];
    if (mappedKey && fieldKeys.has(mappedKey) && !Object.prototype.hasOwnProperty.call(acc, mappedKey)) {
      acc[mappedKey] = value;
    }

    return acc;
  }, {});
};

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

async function captchaErrorResponseIfNeeded(params: {
  form: FormDefinition;
  captchaToken?: string;
  requestId: string;
  siteId: string;
  ipHash: string | null;
}) {
  if (params.form.enableCaptcha !== true) {
    return null;
  }

  const verification = await verifyFormCaptcha({
    token: params.captchaToken,
    remoteIp: params.ipHash,
    requestId: params.requestId,
    siteId: params.siteId,
    formId: params.form.id,
  });

  if (verification.ok) {
    return null;
  }

  const code = verification.errorCode || 'CAPTCHA_FAILED';
  const message = verification.message || 'Captcha verification failed.';
  const status = code === 'CAPTCHA_NOT_CONFIGURED' || code === 'CAPTCHA_UNAVAILABLE' || code === 'CAPTCHA_TIMEOUT'
    ? 503
    : 422;

  return contractResponse(
    {
      success: false,
      requestId: params.requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
      status: 'rejected',
      validation: [],
      spamFlags: ['captcha'],
      captcha: {
        provider: verification.provider,
        errorCode: code,
        errorCodes: verification.errorCodes || [],
      },
      message,
    },
    params.requestId,
    status,
  );
}

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const isObjectRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const readObject = (value: unknown): Record<string, unknown> => (
  isObjectRecord(value) ? value : {}
);

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

async function recordWebhookDeliveryEvent(params: {
  repositories?: FormRepositories | null;
  kind: WebhookEventKind;
  siteId: string;
  formId: string;
  target: string;
  status: 'queued' | 'succeeded' | 'failed';
  requestId?: string;
  submissionId?: string;
  contactId?: string;
  contactStatus?: string;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    kind: params.kind,
    siteId: params.siteId,
    formId: params.formId,
    target: params.target,
    status: params.status,
    requestId: params.requestId,
    submissionId: params.submissionId,
    contactId: params.contactId,
    statusCode: params.statusCode,
    error: params.error,
    metadata: {
      ...(params.metadata || {}),
      ...(params.contactStatus ? { contactStatus: params.contactStatus } : {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

async function getNotificationSettings(repositories?: FormRepositories | null): Promise<Record<string, unknown>> {
  if (repositories) {
    const settings = await repositories.settings.get();
    return readObject(readObject(settings.integrations).notifications);
  }

  return readObject(readObject(getAdminSettings().integrations).notifications);
}

const formSubmissionEmailEnabled = (notifications: Record<string, unknown>): boolean => {
  const email = readObject(notifications.email);
  const digestFrequency = readString(notifications.digestFrequency);
  return email.formSubmission !== false && digestFrequency !== 'off';
};

const resolveFormSubmissionEmailRecipient = (
  form: FormDefinition,
  notifications: Record<string, unknown>,
): { email: string; source: 'form' | 'settings' } | null => {
  const formRecipient = readString(form.notificationEmail);
  if (formRecipient) {
    return { email: formRecipient, source: 'form' };
  }

  const notificationEmail = readObject(notifications.email);
  const settingsRecipient = readString(notificationEmail.recipient)
    || readString(notificationEmail.to)
    || readString(notificationEmail.adminEmail);
  return settingsRecipient ? { email: settingsRecipient, source: 'settings' } : null;
};

async function notifyFormSubmissionEmail(params: {repositories?:FormRepositories|null;siteId:string;form:FormDefinition;submission:FormSubmission;values:Record<string,unknown>;requestId:string}) {
 if(['spam','rejected'].includes(params.submission.status))return;
 const notifications=await getNotificationSettings(params.repositories);
 if(!formSubmissionEmailEnabled(notifications))return;
 const recipient=resolveFormSubmissionEmailRecipient(params.form,notifications);if(!recipient)return;
 return deliverFormSubmission({...params,channel:'email',target:'mailto:'+recipient.email});
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
  values: Record<string, unknown>,
  submission: FormSubmission,
): Promise<Contact | null> => {
  const formShareEnabled = form.contactShare?.enabled === true;
  const resolvedShare = {
    enabled: formShareEnabled,
    nameField: form.contactShare?.nameField,
    emailField: form.contactShare?.emailField,
    phoneField: form.contactShare?.phoneField,
    notesField: form.contactShare?.notesField,
    dedupeByEmail: form.contactShare?.dedupeByEmail,
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

  if (!repositories.forms.shareContactFromSubmission) throw Object.assign(new Error('Persisted contact contributor provenance is unavailable.'), {code:'VISITOR_PRIVACY_FENCE_UNAVAILABLE'});
  return (await repositories.forms.shareContactFromSubmission(form.siteId,form.id,submission.id,{
    siteId:form.siteId,formId:form.id,pageId:submission.pageId??null,postId:submission.postId??null,name,email,phone,notes,sourceValues:values,status:'new',requestId:submission.requestId,sourceIpHash:submission.ipHash,
  },resolvedShare.dedupeByEmail !== false)).item;
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

  const validationErrors = await validateRepositoryCollectionRecordValues({
    repository: repositories.collections,
    siteId,
    collection,
    values: mappedValues,
  });
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
  repositories?: FormRepositories | null;
  formId: string;
  eventType: 'contact-shared' | 'contact-status';
  target: string;
  requestId?: string;
  siteId: string;
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

  await recordWebhookDeliveryEvent({
    repositories: params.repositories,
    kind: webhookKind,
    siteId: params.siteId,
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
      await recordWebhookDeliveryEvent({
        repositories: params.repositories,
        kind: webhookKind,
        siteId: params.siteId,
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

    await recordWebhookDeliveryEvent({
      repositories: params.repositories,
      kind: webhookKind,
      siteId: params.siteId,
      formId: params.formId,
      target: params.target,
      status: 'succeeded',
      requestId: params.requestId,
      submissionId: params.submissionId,
      contactId: params.contactId,
      statusCode: 200,
    });
  } catch (error) {
    await recordWebhookDeliveryEvent({
      repositories: params.repositories,
      kind: webhookKind,
      siteId: params.siteId,
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

async function notifyFormSubmissionWebhook(params: {
  repositories?: FormRepositories | null;
  siteId: string;
  form: FormDefinition;
  submission: FormSubmission;
  values: Record<string, unknown>;
  pageId?: string | null;
  postId?: string | null;
  requestId: string;
  contact?: Contact | null;
}) {
  const target = params.form.notificationWebhook;
  if (!target || params.submission.status === 'spam' || params.submission.status === 'rejected') {
    return;
  }

  const delivery=await deliverFormSubmission({...params,channel:'webhook',target});

  if (params.contact) {
    await notifyContactWebhook({
      repositories: params.repositories,
      formId: params.form.id,
      eventType: 'contact-shared',
      target,
      requestId: params.requestId,
      siteId: params.siteId,
      submissionId: params.submission.id,
      contactId: params.contact.id,
      contactStatus: params.contact.status,
      values: params.values,
    });
  }
  return delivery;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, responseRequestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const { searchParams } = new URL(request.url);
    const statusFilter = parseStatus(searchParams.get('status'));
    if (statusFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_FORM_SUBMISSION_STATUS',
        'Invalid form submission status filter. Use pending, approved, rejected, spam, or all.',
        responseRequestId,
      );
    }
    const filterRequestId = parseRequestId(searchParams.get('requestId'));
    const limitFilter = parseLimit(searchParams.get('limit'));
    if (limitFilter.invalid) {
      return errorResponse(400, 'INVALID_FORM_SUBMISSION_LIMIT', 'Invalid form submission limit filter. Use an integer from 1 to 100.', responseRequestId);
    }
    const offsetFilter = parseOffset(searchParams.get('offset'));
    if (offsetFilter.invalid) {
      return errorResponse(400, 'INVALID_FORM_SUBMISSION_OFFSET', 'Invalid form submission offset filter. Use a non-negative integer.', responseRequestId);
    }
    const status = statusFilter.value;
    const limit = limitFilter.value;
    const offset = offsetFilter.value;

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

    const submissions = listFormSubmissions(form.id, { siteId: site.id,
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

async function notificationWarnings(params:Parameters<typeof notifyFormSubmissionWebhook>[0]):Promise<string[]> {
 const warnings:string[]=[];
 for(const notify of [()=>notifyFormSubmissionWebhook(params),()=>notifyFormSubmissionEmail(params)]){
  try{const outcome=await notify();warnings.push(...(outcome?.completionWarnings||[]));if(outcome&&outcome.status!=='succeeded')warnings.push('FORM_NOTIFICATION_PENDING');}
  catch{warnings.push('FORM_NOTIFICATION_PENDING');}
 }
 return [...new Set(warnings)];
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();
  let attachmentBatch: Awaited<ReturnType<typeof storeFormAttachments>> | null = null;
  let attachmentsPersisted = false;

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
      const audienceAccess = await requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit');
      if (audienceAccess) {
        return audienceAccess;
      }

      const uploadInput = await readFormSubmissionRequest(request, form, frontendFormFieldKeyMapFromMetadata(form.settings) || {});
      const parsed = parseRequestBody(uploadInput.raw);
      if (!parsed) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
      }

      const requestId = normalizeRequestId(parsed.requestId);
      const ipHash = extractIpHash(request);
      const captchaResponse = await captchaErrorResponseIfNeeded({
        form,
        captchaToken: parsed.captchaToken,
        requestId,
        siteId: site.id,
        ipHash,
      });
      if (captchaResponse) {
        return captchaResponse;
      }

      const frontendNormalizedValues = normalizeFrontendSubmissionValueKeys(form, parsed.values);
      const submissionValues = normalizeFormSubmissionValues(form, frontendNormalizedValues);
      const classification = validateAndClassifyFormSubmission(
        form,
        submissionValues,
        {
          honeypot: parsed.honeypot,
          ipHash,
          requestId,
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

      if (uploadInput.pending.length) {
        const [media, submissions, settings] = await Promise.all([
          collectCompleteExportPages((pagination) => repositories.media.list({ siteId: site.id, type: 'all', visibility: 'all', ...pagination }), (media) => media.siteId === site.id),
          collectCompleteExportPages((pagination) => repositories.forms.listSubmissions({ siteId: site.id, status: 'all', ...pagination }), (submission) => submission.siteId === site.id),
          repositories.settings.get(),
        ]);
        admitFormAttachmentUpload(site.id, form.id, ipHash, submissions);
        const currentUsageBytes = media.reduce((total, media) => total + media.sizeBytes, 0) + submissions.reduce((total, submission) => total + formAttachmentsFromValues(submission.values).reduce((total, file) => total + file.sizeBytes, 0), 0);
        attachmentBatch = await storeFormAttachments({ siteId: site.id, formId: form.id, pending: uploadInput.pending, settings, siteSettings: site.settings, currentUsageBytes });
      }
      if (uploadInput.pending.length) {
        const currentForm = await repositories.forms.getById(site.id, form.id);
        if (!currentForm || currentForm.siteId !== site.id || !currentForm.isActive || currentForm.audience !== form.audience) throw new FormAttachmentError(409, 'FORM_ATTACHMENT_FORM_UNAVAILABLE', 'This form can no longer accept file submissions.');
      }
      const visitor = form.audience === 'authenticated' ? await requireSiteVisitor(request, site.id) : null;
      let submission = (await repositories.forms.createSubmission({
        visitorMemberId: visitor?.id || null,
        siteId: site.id,
        formId: form.id,
        values: submissionValues,
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
      attachmentsPersisted = true;

      let contact: Contact | null = null;
      let collectionRecordResult: Awaited<ReturnType<typeof createRepositoryCollectionRecordFromSubmission>> | null = null;
      if (classification.status === 'approved') {
      if (!repositories.forms.withSubmissionFollowup) throw Object.assign(new Error('Persisted submission privacy fence unavailable'), {code:'VISITOR_PRIVACY_FENCE_UNAVAILABLE'});
      const followup = await repositories.forms.withSubmissionFollowup(site.id,form.id,submission.id,async():Promise<{contact:Contact|null;recordResult:Awaited<ReturnType<typeof createRepositoryCollectionRecordFromSubmission>>|null;submission:FormSubmission}>=>{
      if (classification.status === 'approved') {
        contact = await buildRepositoryContactShare(repositories, form, submissionValues, submission);
        collectionRecordResult = await createRepositoryCollectionRecordFromSubmission(
          repositories,
          site.id,
          form,
          submissionValues,
          submission,
        );
        submission = (await repositories.forms.updateSubmission(site.id, submission.id, {
          collectionRecord: collectionRecordResult.record,
          collectionRecordErrors: collectionRecordResult.errors,
        })).item;
      }

      return {contact,recordResult:collectionRecordResult,submission};
      });
      contact=followup.contact;collectionRecordResult=followup.recordResult;submission=followup.submission;
      }
      const completionWarnings=await notificationWarnings({
        repositories,
        siteId: site.id,
        form,
        submission,
        values: submissionValues,
        pageId: parsed.pageId,
        postId: parsed.postId,
        requestId,
        contact,
      });

      return privateResponse(
        {
          success: true,
          requestId,
          status: submission.status,
          message: submission.status === 'pending'
            ? 'Submission received and awaiting moderation.'
            : 'Submission received.',
          completionWarnings,
          data: {
            completionWarnings,
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
    const audienceAccess = await requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit');
    if (audienceAccess) {
      return audienceAccess;
    }

    const uploadInput = await readFormSubmissionRequest(request, form, frontendFormFieldKeyMapFromMetadata(form.settings) || {});
    const parsed = parseRequestBody(uploadInput.raw);
    if (!parsed) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
    }

    const requestId = normalizeRequestId(parsed.requestId);
    const ipHash = extractIpHash(request);
    const captchaResponse = await captchaErrorResponseIfNeeded({
      form,
      captchaToken: parsed.captchaToken,
      requestId,
      siteId: site.id,
      ipHash,
    });
    if (captchaResponse) {
      return captchaResponse;
    }

    const frontendNormalizedValues = normalizeFrontendSubmissionValueKeys(form, parsed.values);
    const submissionValues = normalizeFormSubmissionValues(form, frontendNormalizedValues);
    const classification = validateAndClassifyFormSubmission(
      form,
      submissionValues,
      {
        honeypot: parsed.honeypot,
        ipHash,
        requestId,
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

    if (uploadInput.pending.length) {
      const submissions = (await Promise.all(listFormsBySite(site.id).map((candidate) => collectCompleteExportPages(async (pagination) => {
        const page = listFormSubmissions(candidate.id, { ...pagination, siteId: site.id });
        return { items: page.data, pagination: page.pagination };
      }, (submission) => submission.siteId === site.id && submission.formId === candidate.id)))).flat();
      const media = await collectCompleteExportPages(async (pagination) => {
        const page = getMediaList(site.id, { ...pagination });
        return { items: page.media, pagination: page.pagination };
      }, (media) => media.siteId === site.id);
      admitFormAttachmentUpload(site.id, form.id, ipHash, submissions);
      const currentUsageBytes = media.reduce((total, media) => total + media.sizeBytes, 0) + submissions.reduce((total, submission) => total + formAttachmentsFromValues(submission.values).reduce((total, file) => total + file.sizeBytes, 0), 0);
      attachmentBatch = await storeFormAttachments({ siteId: site.id, formId: form.id, pending: uploadInput.pending, settings: getAdminSettings(), siteSettings: site.settings, currentUsageBytes });
    }
    if (uploadInput.pending.length) {
      const currentForm = getFormById(site.id, form.id);
      if (!currentForm || currentForm.siteId !== site.id || !currentForm.isActive || currentForm.audience !== form.audience) throw new FormAttachmentError(409, 'FORM_ATTACHMENT_FORM_UNAVAILABLE', 'This form can no longer accept file submissions.');
    }
    let submission = createFormSubmission({
      siteId: site.id,
      formId: form.id,
      values: submissionValues,
      pageId: parsed.pageId,
      postId: parsed.postId,
      ipHash,
      userAgent: request.headers.get('user-agent') || undefined,
      requestId,
      status: classification.status,
    });
    attachmentsPersisted = true;

    let contact = null;
    let collectionRecordResult = null;
    if (classification.status === 'approved') {
      contact = buildContactShareFromSubmission(site.id, form.id, submissionValues, {
        status: submission.status,
        pageId: parsed.pageId,
        postId: parsed.postId,
        requestId,
        ipHash,
        sourceSubmissionId: submission.id,
      });

      collectionRecordResult = createCollectionRecordFromFormSubmission(
        site.id,
        form,
        submissionValues,
        submission,
      );
      submission = attachCollectionRecordToSubmission(submission.id, {
        record: collectionRecordResult.record,
        errors: collectionRecordResult.errors,
      }) || submission;
    }

    const completionWarnings=await notificationWarnings({
      siteId: site.id,
      form,
      submission,
      values: submissionValues,
      pageId: parsed.pageId,
      postId: parsed.postId,
      requestId,
      contact,
    });

    return privateResponse(
      {
        success: true,
        requestId,
        status: submission.status,
        message: submission.status === 'pending'
          ? 'Submission received and awaiting moderation.'
          : 'Submission received.',
        completionWarnings,
        data: {
          completionWarnings,
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
    if (attachmentBatch && !attachmentsPersisted) {
      try { await attachmentBatch.cleanup(); }
      catch (cleanupError) { error = cleanupError; }
    }
    if (error instanceof FormAttachmentError) return errorResponse(error.status, error.code, error.message, responseRequestId);
    if (error instanceof FormAttachmentStorageError) return errorResponse(503, 'FORM_ATTACHMENT_STORAGE_NOT_CONFIGURED', error.message, responseRequestId);
    if (error instanceof CollectionExportIncompleteError) return errorResponse(503, 'FORM_ATTACHMENT_QUOTA_UNAVAILABLE', 'Unable to verify the complete site storage quota.', responseRequestId);
    if (error instanceof MediaSafetyError) {
      const unavailable = ['production-media-scanner-required', 'missing-scanner-endpoint', 'scanner-request-failed', 'clamav-request-failed', 'scanner-http-error'].includes(String(error.details?.reason || ''));
      return errorResponse(unavailable ? 503 : 415, 'FORM_ATTACHMENT_SCAN_FAILED', 'The attachment could not pass the configured safety scan.', responseRequestId);
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'VISITOR_MEMBERSHIP_REQUIRED') return errorResponse(401, 'VISITOR_AUTHENTICATION_REQUIRED', 'A current website account is required.', responseRequestId);
    if (error instanceof VisitorAccessError) return errorResponse(error.status, error.code, error.message, responseRequestId);
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
