import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonValue, Contact, FormDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  attachCollectionRecordToSubmission,
  buildContactShareFromSubmission,
  createCollectionRecordFromFormSubmission,
  getFormById,
  getSiteByIdOrSlug,
  getSubmissionById,
  updateFormSubmissionStatus,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { recordAdminAudit } from '@/lib/adminAudit';
import { validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseStatus = (value: unknown): FormSubmission['status'] | null => (
  value === 'pending' || value === 'approved' || value === 'rejected' || value === 'spam'
    ? value
    : null
);

const parseContactShareOverride = (value: unknown): ContactShareOverridePayload | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const override = {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    nameField: typeof record.nameField === 'string' ? record.nameField : undefined,
    emailField: typeof record.emailField === 'string' ? record.emailField : undefined,
    phoneField: typeof record.phoneField === 'string' ? record.phoneField : undefined,
    notesField: typeof record.notesField === 'string' ? record.notesField : undefined,
    dedupeByEmail: typeof record.dedupeByEmail === 'boolean' ? record.dedupeByEmail : undefined,
  };

  return Object.values(override).some((item) => item !== undefined) ? override : undefined;
};

const parseBody = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    status: parseStatus(record.status),
    reviewedBy: typeof record.reviewedBy === 'string' ? record.reviewedBy : undefined,
    adminNotes: typeof record.adminNotes === 'string' ? record.adminNotes : undefined,
    contactShareOverride: parseContactShareOverride(record.contactShareOverride),
  };
};

const parseShareValue = (values: Record<string, unknown>, field?: string): string | null => {
  if (!field) return null;
  const value = values[field];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

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

const createRepositoryCollectionRecordFromSubmission = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  form: FormDefinition,
  submission: FormSubmission,
): Promise<{
  record: FormSubmission['collectionRecord'];
  errors: Array<{ field: string; message: string }>;
}> => {
  const target = form.collectionTarget;
  if (!target?.enabled || submission.collectionRecord) {
    return {
      record: submission.collectionRecord || null,
      errors: submission.collectionRecordErrors || [],
    };
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
  const mappedValues = Object.entries(submission.values).reduce<Record<string, unknown>>((acc, [sourceKey, value]) => {
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
    ? submission.values[target.slugField] ?? mappedValues[target.slugField]
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
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

      return NextResponse.json({
        success: true,
        requestId,
        data: { submission },
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

    return NextResponse.json({
      success: true,
      requestId,
      data: { submission },
      submission,
    });
  } catch (error) {
    console.error('Admin form submission API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
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

      let updated = (await repositories.forms.updateSubmission(site.id, submission.id, {
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
      if (updated.status === 'approved' && form.collectionTarget?.enabled && !updated.collectionRecord) {
        const collectionRecordResult = await createRepositoryCollectionRecordFromSubmission(
          repositories,
          site.id,
          form,
          updated,
        );
        updated = (await repositories.forms.updateSubmission(site.id, updated.id, {
          collectionRecord: collectionRecordResult.record,
          collectionRecordErrors: collectionRecordResult.errors,
        })).item;
      }
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'formSubmission',
        entityId: updated.id,
        action: 'formSubmission.review',
        before: submission,
        after: updated,
        metadata: {
          formId: form.id,
          formTitle: form.title || form.name || form.id,
          status: updated.status,
          reviewedBy: updated.reviewedBy || body.reviewedBy || 'admin',
          contactShare: updated.status === 'approved' && shouldShareContact,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { submission: updated },
        submission: updated,
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

    let updated = updateFormSubmissionStatus(submissionId, {
      status: body.status,
      reviewedBy: body.reviewedBy,
      adminNotes: body.adminNotes,
    });
    if (!updated) {
      return errorResponse(409, 'SUBMISSION_UPDATE_FAILED', 'Unable to update submission', requestId);
    }

    const shouldShareContact = body.contactShareOverride?.enabled !== undefined
      ? body.contactShareOverride.enabled
      : form.contactShare?.enabled === true;
    if (updated.status === 'approved' && shouldShareContact) {
      buildContactShareFromSubmission(site.id, form.id, updated.values, {
        status: updated.status,
        pageId: updated.pageId ?? null,
        postId: updated.postId ?? null,
        ipHash: updated.ipHash ?? null,
        sourceSubmissionId: updated.id,
      }, body.contactShareOverride);
    }
    if (updated.status === 'approved' && form.collectionTarget?.enabled && !updated.collectionRecord) {
      const collectionRecordResult = createCollectionRecordFromFormSubmission(
        site.id,
        form,
        updated.values,
        updated,
      );
      updated = attachCollectionRecordToSubmission(updated.id, {
        record: collectionRecordResult.record,
        errors: collectionRecordResult.errors,
      }) || updated;
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'formSubmission',
      entityId: updated.id,
      action: 'formSubmission.review',
      before: submission,
      after: updated,
      metadata: {
        formId: form.id,
        formTitle: form.title || form.name || form.id,
        status: updated.status,
        reviewedBy: updated.reviewedBy || body.reviewedBy || 'admin',
        contactShare: updated.status === 'approved' && shouldShareContact,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { submission: updated },
      submission: updated,
    });
  } catch (error) {
    console.error('Admin form submission API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
