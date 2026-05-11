import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject, Contact } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import {
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  trackWebhookEvent,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

type SyncStatus = 'queued' | 'succeeded' | 'failed';

const MAX_SYNC_CONTACTS = 50;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const parseBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const parseContactIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))).slice(0, MAX_SYNC_CONTACTS);
};

const parseOptionalText = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const parseTargetUrl = (value: unknown): string | null => {
  const raw = parseOptionalText(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const auditMetadata = (value: Record<string, unknown>): BackyJsonObject => value as BackyJsonObject;

const publicContactPayload = (contact: Contact, includeSourceValues: boolean) => ({
  id: contact.id,
  formId: contact.formId,
  pageId: contact.pageId || null,
  postId: contact.postId || null,
  sourceSubmissionId: contact.sourceSubmissionId || null,
  requestId: contact.requestId || null,
  status: contact.status,
  name: contact.name || null,
  email: contact.email || null,
  phone: contact.phone || null,
  notes: contact.notes || null,
  createdAt: contact.createdAt,
  updatedAt: contact.updatedAt,
  ...(includeSourceValues ? { sourceValues: contact.sourceValues || {} } : {}),
});

const recordContactSyncEvent = async (input: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  siteId: string;
  formId: string;
  contactId: string;
  target: string;
  status: SyncStatus;
  requestId: string;
  statusCode?: number;
  error?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const event = {
    kind: 'contact-sync' as const,
    siteId: input.siteId,
    formId: input.formId,
    contactId: input.contactId,
    target: input.target,
    status: input.status,
    requestId: input.requestId,
    actor: input.actorId || undefined,
    statusCode: input.statusCode,
    error: input.error,
    metadata: input.metadata,
  };

  if (input.repositories) {
    await recordRepositoryInteractionEvent(input.repositories, event);
    return;
  }

  trackWebhookEvent(event);
};

const deliverContactSync = async (input: {
  request: NextRequest;
  siteId: string;
  formId: string;
  contacts: Contact[];
  targetUrl: string;
  requestId: string;
  includeSourceValues: boolean;
  reason: string | null;
}) => {
  const payload = {
    kind: 'contact-sync',
    siteId: input.siteId,
    formId: input.formId,
    contactIds: input.contacts.map((contact) => contact.id),
    count: input.contacts.length,
    reason: input.reason,
    contacts: input.contacts.map((contact) => publicContactPayload(contact, input.includeSourceValues)),
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(input.targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-backy-site-id': input.siteId,
        'x-backy-form-id': input.formId,
        'x-backy-contact-count': String(input.contacts.length),
        'x-backy-request-id': input.requestId,
        'x-backy-contact-sync': 'true',
        ...(input.request.headers.get('origin') ? { origin: input.request.headers.get('origin') || '' } : {}),
      },
      body: JSON.stringify(payload),
    });

    return {
      status: response.ok ? 'succeeded' as const : 'failed' as const,
      statusCode: response.status,
      error: response.ok ? null : `Webhook returned ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'failed' as const,
      statusCode: undefined,
      error: error instanceof Error ? error.message : 'Unknown sync error',
    };
  }
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, formId } = await params;
    const body = await parseBody(request);
    const contactIds = parseContactIds(body.contactIds);
    const targetUrl = parseTargetUrl(body.targetUrl);
    const includeSourceValues = body.includeSourceValues !== false;
    const reason = parseOptionalText(body.reason);

    if (contactIds.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Select at least one contact to sync.', requestId);
    }
    if (!targetUrl) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A valid http(s) targetUrl is required.', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

      const contacts = (await Promise.all(
        contactIds.map((contactId) => repositories.forms.getContactById(site.id, form.id, contactId)),
      )).filter((contact): contact is Contact => Boolean(contact));
      const foundIds = new Set(contacts.map((contact) => contact.id));
      const missingIds = contactIds.filter((contactId) => !foundIds.has(contactId));
      if (missingIds.length > 0) {
        return errorResponse(404, 'CONTACT_NOT_FOUND', `Missing contacts: ${missingIds.join(', ')}`, requestId);
      }

      await Promise.all(contacts.map((contact) => recordContactSyncEvent({
        repositories,
        siteId: site.id,
        formId: form.id,
        contactId: contact.id,
        target: targetUrl,
        status: 'queued',
        requestId,
        actorId: access.session?.user.id,
        metadata: { reason, includeSourceValues, contactStatus: contact.status },
      })));
      const delivery = await deliverContactSync({ request, siteId: site.id, formId: form.id, contacts, targetUrl, requestId, includeSourceValues, reason });
      await Promise.all(contacts.map((contact) => recordContactSyncEvent({
        repositories,
        siteId: site.id,
        formId: form.id,
        contactId: contact.id,
        target: targetUrl,
        status: delivery.status,
        requestId,
        actorId: access.session?.user.id,
        statusCode: delivery.statusCode,
        error: delivery.error || undefined,
        metadata: { reason, includeSourceValues, contactStatus: contact.status },
      })));
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'form',
        entityId: form.id,
        action: 'contacts.sync',
        metadata: auditMetadata({
          target: targetUrl,
          status: delivery.status,
          statusCode: delivery.statusCode || null,
          count: contacts.length,
          contactIds,
          reason,
          error: delivery.error,
        }),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          formId: form.id,
          delivery: {
            target: targetUrl,
            status: delivery.status,
            statusCode: delivery.statusCode || null,
            error: delivery.error,
            count: contacts.length,
            contactIds,
          },
        },
      }, { status: delivery.status === 'succeeded' ? 200 : 502 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const form = getFormById(site.id, formId);
    if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

    const contacts = contactIds
      .map((contactId) => getContactById(contactId))
      .filter((contact): contact is Contact => Boolean(contact && contact.siteId === site.id && contact.formId === form.id));
    const foundIds = new Set(contacts.map((contact) => contact.id));
    const missingIds = contactIds.filter((contactId) => !foundIds.has(contactId));
    if (missingIds.length > 0) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', `Missing contacts: ${missingIds.join(', ')}`, requestId);
    }

    await Promise.all(contacts.map((contact) => recordContactSyncEvent({
      siteId: site.id,
      formId: form.id,
      contactId: contact.id,
      target: targetUrl,
      status: 'queued',
      requestId,
      actorId: access.session?.user.id,
      metadata: { reason, includeSourceValues, contactStatus: contact.status },
    })));
    const delivery = await deliverContactSync({ request, siteId: site.id, formId: form.id, contacts, targetUrl, requestId, includeSourceValues, reason });
    await Promise.all(contacts.map((contact) => recordContactSyncEvent({
      siteId: site.id,
      formId: form.id,
      contactId: contact.id,
      target: targetUrl,
      status: delivery.status,
      requestId,
      actorId: access.session?.user.id,
      statusCode: delivery.statusCode,
      error: delivery.error || undefined,
      metadata: { reason, includeSourceValues, contactStatus: contact.status },
    })));
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'form',
      entityId: form.id,
      action: 'contacts.sync',
      metadata: auditMetadata({
        target: targetUrl,
        status: delivery.status,
        statusCode: delivery.statusCode || null,
        count: contacts.length,
        contactIds,
        reason,
        error: delivery.error,
      }),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        formId: form.id,
        delivery: {
          target: targetUrl,
          status: delivery.status,
          statusCode: delivery.statusCode || null,
          error: delivery.error,
          count: contacts.length,
          contactIds,
        },
      },
    }, { status: delivery.status === 'succeeded' ? 200 : 502 });
  } catch (error) {
    console.error('Admin contact sync API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
