import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject, Contact } from '@backy-cms/core';
import { requireAdminAccess, type AdminAccessContext } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  deleteContactRecord,
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  updateContactStatus,
} from '@/lib/backyStore';
import { validateOptionalContactEmail } from '@/lib/contactEmailPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
  }>;
}

type ContactStatus = 'new' | 'contacted' | 'qualified' | 'archived';
type NewsletterStatus = NonNullable<Contact['newsletterSubscriptionStatus']>;
const NEWSLETTER_STATUSES: NewsletterStatus[] = ['subscribed', 'unsubscribed', 'pending', 'bounced', 'complained'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const getAccessActorId = (access: AdminAccessContext): string => (
  access.session?.user.id || access.session?.user.email || 'admin'
);

const parseStatus = (value: unknown): ContactStatus | null => (
  value === 'new' || value === 'contacted' || value === 'qualified' || value === 'archived'
    ? value
    : null
);

const parseNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const parseNullableBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', '0', 'off'].includes(normalized)) return false;
  }
  return null;
};

const parseNewsletterStatus = (value: unknown): { value?: NewsletterStatus | null; invalid?: string } => {
  if (value === undefined) return {};
  if (value === null || value === '') return { value: null };
  return NEWSLETTER_STATUSES.includes(value as NewsletterStatus)
    ? { value: value as NewsletterStatus }
    : { invalid: String(value) };
};

const parseSourceValues = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const parseBody = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = parseStatus(record.status);
  const statusProvided = Object.prototype.hasOwnProperty.call(record, 'status');
  const name = parseNullableString(record.name);
  const email = parseNullableString(record.email);
  const phone = parseNullableString(record.phone);
  const notes = parseNullableString(record.notes);
  const pageId = parseNullableString(record.pageId);
  const postId = parseNullableString(record.postId);
  const requestId = parseNullableString(record.requestId);
  const sourceIpHash = parseNullableString(record.sourceIpHash);
  const sourceSubmissionId = parseNullableString(record.sourceSubmissionId);
  const sourceValues = parseSourceValues(record.sourceValues);
  const newsletterSubscriptionStatus = parseNewsletterStatus(record.newsletterSubscriptionStatus);
  const newsletterSubscriptionStatusProvided = Object.prototype.hasOwnProperty.call(record, 'newsletterSubscriptionStatus');
  const newsletterSubscribedAt = parseNullableString(record.newsletterSubscribedAt);
  const newsletterUnsubscribedAt = parseNullableString(record.newsletterUnsubscribedAt);
  const newsletterTopics = parseNullableString(record.newsletterTopics);
  const newsletterSource = parseNullableString(record.newsletterSource);
  const newsletterConsent = parseNullableBoolean(record.newsletterConsent);
  const newsletterConsentText = parseNullableString(record.newsletterConsentText);

  if (
    !status
    && !statusProvided
    && name === undefined
    && email === undefined
    && phone === undefined
    && notes === undefined
    && pageId === undefined
    && postId === undefined
    && requestId === undefined
    && sourceIpHash === undefined
    && sourceSubmissionId === undefined
    && sourceValues === undefined
    && !newsletterSubscriptionStatusProvided
    && newsletterSubscribedAt === undefined
    && newsletterUnsubscribedAt === undefined
    && newsletterTopics === undefined
    && newsletterSource === undefined
    && newsletterConsent === undefined
    && newsletterConsentText === undefined
  ) {
    return null;
  }

  return {
    statusProvided,
    ...(status ? { status } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(pageId !== undefined ? { pageId } : {}),
    ...(postId !== undefined ? { postId } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
    ...(sourceIpHash !== undefined ? { sourceIpHash } : {}),
    ...(sourceSubmissionId !== undefined ? { sourceSubmissionId } : {}),
    ...(sourceValues !== undefined ? { sourceValues } : {}),
    newsletterSubscriptionStatusInvalid: Boolean(newsletterSubscriptionStatus.invalid),
    ...(newsletterSubscriptionStatusProvided ? { newsletterSubscriptionStatus: newsletterSubscriptionStatus.value ?? null } : {}),
    ...(newsletterSubscribedAt !== undefined ? { newsletterSubscribedAt } : {}),
    ...(newsletterUnsubscribedAt !== undefined ? { newsletterUnsubscribedAt } : {}),
    ...(newsletterTopics !== undefined ? { newsletterTopics } : {}),
    ...(newsletterSource !== undefined ? { newsletterSource } : {}),
    ...(newsletterConsent !== undefined ? { newsletterConsent } : {}),
    ...(newsletterConsentText !== undefined ? { newsletterConsentText } : {}),
  };
};

const invalidStatusResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_ADMIN_FORM_CONTACT_STATUS',
  'Invalid admin form contact status. Use new, contacted, qualified, or archived.',
  requestId,
);

const toContactUpdate = (body: NonNullable<ReturnType<typeof parseBody>>) => {
  const update: Partial<Contact> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.name !== undefined) update.name = body.name;
  if (body.email !== undefined) update.email = body.email;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.pageId !== undefined) update.pageId = body.pageId;
  if (body.postId !== undefined) update.postId = body.postId;
  if (body.requestId !== undefined) update.requestId = body.requestId;
  if (body.sourceIpHash !== undefined) update.sourceIpHash = body.sourceIpHash;
  if (body.sourceSubmissionId !== undefined) update.sourceSubmissionId = body.sourceSubmissionId || undefined;
  if (body.sourceValues !== undefined) update.sourceValues = body.sourceValues;
  if (body.newsletterSubscriptionStatus !== undefined) update.newsletterSubscriptionStatus = body.newsletterSubscriptionStatus;
  if (body.newsletterSubscribedAt !== undefined) update.newsletterSubscribedAt = body.newsletterSubscribedAt;
  if (body.newsletterUnsubscribedAt !== undefined) update.newsletterUnsubscribedAt = body.newsletterUnsubscribedAt;
  if (body.newsletterTopics !== undefined) update.newsletterTopics = body.newsletterTopics;
  if (body.newsletterSource !== undefined) update.newsletterSource = body.newsletterSource;
  if (body.newsletterConsent !== undefined) update.newsletterConsent = body.newsletterConsent;
  if (body.newsletterConsentText !== undefined) update.newsletterConsentText = body.newsletterConsentText;
  return update;
};

const toFallbackUpdate = (body: NonNullable<ReturnType<typeof parseBody>>) => {
  return {
    ...toContactUpdate(body),
  };
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId, contactId } = await params;
    const body = parseBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or notes is required.', requestId);
    }
    if (body.statusProvided && !body.status) {
      return invalidStatusResponse(requestId);
    }
    if (body.newsletterSubscriptionStatusInvalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONTACT_NEWSLETTER_STATUS', 'Invalid newsletter subscription status.', requestId);
    }
    const emailPolicy = body.email === undefined
      ? { ok: true as const, email: undefined }
      : validateOptionalContactEmail(body.email);
    if (!emailPolicy.ok) {
      return errorResponse(400, 'INVALID_CONTACT_EMAIL', emailPolicy.message, requestId);
    }
    const contactInput = emailPolicy.email === undefined
      ? body
      : {
          ...body,
          email: emailPolicy.email,
        };

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

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) {
        return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      }

      const updated = (await repositories.forms.updateContact(site.id, contact.id, toContactUpdate(contactInput))).item;

      return NextResponse.json({
        success: true,
        requestId,
        data: { contact: updated },
        contact: updated,
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

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }

    const updated = updateContactStatus(contact.id, toFallbackUpdate(contactInput));

    if (!updated) {
      return errorResponse(409, 'CONTACT_UPDATE_FAILED', 'Unable to update contact', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: { contact: updated },
      contact: updated,
    });
  } catch (error) {
    console.error('Admin form contact API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId, contactId } = await params;

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

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) {
        return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      }

      const deleted = await repositories.forms.deleteContact(site.id, contact.id);
      if (!deleted) {
        return errorResponse(409, 'CONTACT_DELETE_FAILED', 'Unable to delete contact', requestId);
      }

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: getAccessActorId(access),
        entity: 'contact',
        entityId: contact.id,
        action: 'contact.delete',
        before: contact,
        after: null,
        metadata: {
          formId: form.id,
          email: contact.email || null,
        } as BackyJsonObject,
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { deleted: true, contact },
        deleted: true,
        contact,
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

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }

    const deletedContact = deleteContactRecord(contact.id);
    if (!deletedContact) {
      return errorResponse(409, 'CONTACT_DELETE_FAILED', 'Unable to delete contact', requestId);
    }

    await recordAdminAudit({
      siteId: site.id,
      actorId: getAccessActorId(access),
      entity: 'contact',
      entityId: contact.id,
      action: 'contact.delete',
      before: contact,
      after: null,
      metadata: {
        formId: form.id,
        email: contact.email || null,
      } as BackyJsonObject,
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { deleted: true, contact: deletedContact },
      deleted: true,
      contact: deletedContact,
    });
  } catch (error) {
    console.error('Admin form contact delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
