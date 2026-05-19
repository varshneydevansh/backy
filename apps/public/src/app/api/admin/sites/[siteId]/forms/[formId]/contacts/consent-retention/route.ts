import { NextRequest, NextResponse } from 'next/server';
import type { Contact, FormDefinition, FormFieldDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  anonymizeFormContactConsentEvidence,
  getFormById,
  getSiteByIdOrSlug,
  listFormContacts,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

const CONSENT_FIELD_PATTERN = /\b(consent|agree|agreement|terms|privacy|permission|subscribe|opt[-_ ]?in)\b/i;
const DEFAULT_DELETE_AFTER_DAYS = 730;
const PAGE_SIZE = 100;
const MAX_CONTACTS = 250;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const hasOwn = (body: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(body, key)
);

const parseDryRun = (body: Record<string, unknown>, fallback: boolean): { value: boolean; invalid?: true } => {
  if (!hasOwn(body, 'dryRun')) return { value: fallback };
  return typeof body.dryRun === 'boolean'
    ? { value: body.dryRun }
    : { value: fallback, invalid: true };
};

const readNumberSetting = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseRetentionDaysOverride = (body: Record<string, unknown>): { value?: number; invalid?: true } => {
  if (!hasOwn(body, 'retentionDays')) return {};
  const raw = body.retentionDays;
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) {
    return { invalid: true };
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0
    ? { value: parsed }
    : { invalid: true };
};

const readDeleteAfterDays = (form: FormDefinition, override: unknown): number => {
  if (override !== undefined) {
    return Math.max(0, Math.round(readNumberSetting(override, DEFAULT_DELETE_AFTER_DAYS)));
  }

  const settings = isRecord(form.settings) ? form.settings : {};
  const settingsConsent = isRecord(settings.consent) ? settings.consent : {};
  const directConsent = isRecord(form.consentSettings) ? form.consentSettings : {};
  const merged = { ...settingsConsent, ...directConsent };
  return Math.max(0, Math.round(readNumberSetting(merged.deleteAfterDays, DEFAULT_DELETE_AFTER_DAYS)));
};

const findConsentFields = (fields: FormFieldDefinition[]): FormFieldDefinition[] => (
  fields.filter((field) => (
    field.type === 'checkbox' &&
    CONSENT_FIELD_PATTERN.test(`${field.key} ${field.label}`)
  ))
);

const parseNow = (body: Record<string, unknown>): { value: number; invalid?: true } => {
  if (!hasOwn(body, 'now')) return { value: Date.now() };
  if (typeof body.now === 'string' && body.now.trim()) {
    const timestamp = Date.parse(body.now);
    return Number.isFinite(timestamp)
      ? { value: timestamp }
      : { value: Date.now(), invalid: true };
  }
  return { value: Date.now(), invalid: true };
};

const addDays = (dateValue: string | null | undefined, days: number): number | null => {
  const timestamp = Date.parse(dateValue || '');
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getTime();
};

const parseContactIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))).slice(0, MAX_CONTACTS)
    : []
);

const consentValuesForContact = (contact: Contact, consentFieldKeys: string[]): Record<string, unknown> => (
  Object.fromEntries(consentFieldKeys.map((key) => [key, contact.sourceValues?.[key] ?? null]))
);

const shouldAnonymizeContact = (
  contact: Contact,
  consentFieldKeys: string[],
  deleteAfterDays: number,
  now: number,
): boolean => {
  if (consentFieldKeys.length === 0) return false;

  const dueAt = addDays(contact.createdAt, deleteAfterDays);
  if (dueAt === null || dueAt > now) return false;

  return Boolean(
    contact.sourceIpHash ||
    consentFieldKeys.some((key) => {
      const value = contact.sourceValues?.[key];
      return value !== null && value !== undefined && value !== '';
    }),
  );
};

const toEvidenceContact = (
  contact: Contact,
  consentFieldKeys: string[],
  deleteAfterDays: number,
  now: number,
) => {
  const dueAt = addDays(contact.createdAt, deleteAfterDays);
  return {
    id: contact.id,
    formId: contact.formId,
    pageId: contact.pageId || null,
    postId: contact.postId || null,
    status: contact.status,
    name: contact.name || null,
    email: contact.email || null,
    phone: contact.phone || null,
    requestId: contact.requestId || null,
    sourceSubmissionId: contact.sourceSubmissionId || null,
    sourceIpHash: contact.sourceIpHash || null,
    consentValues: consentValuesForContact(contact, consentFieldKeys),
    dueAt: dueAt === null ? null : new Date(dueAt).toISOString(),
    due: shouldAnonymizeContact(contact, consentFieldKeys, deleteAfterDays, now),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
};

const listAllDemoContacts = (formId: string): Contact[] => {
  const items: Contact[] = [];
  let offset = 0;

  while (true) {
    const page = listFormContacts(formId, { limit: PAGE_SIZE, offset });
    items.push(...page.contacts);
    if (!page.pagination.hasMore) break;
    offset += PAGE_SIZE;
  }

  return items;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = await parseJsonBody(request);
    const dryRunFilter = parseDryRun(body, true);
    if (dryRunFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONSENT_RETENTION_DRY_RUN', 'dryRun must be a boolean when provided.', requestId);
    }
    const dryRun = dryRunFilter.value;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'admin';
    const contactIds = parseContactIds(body.contactIds);
    const nowFilter = parseNow(body);
    if (nowFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONSENT_RETENTION_NOW', 'now must be a valid date/time string when provided.', requestId);
    }
    const now = nowFilter.value;
    const retentionDaysFilter = parseRetentionDaysOverride(body);
    if (retentionDaysFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONSENT_RETENTION_DAYS', 'retentionDays must be a non-negative integer when provided.', requestId);
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

      const consentFields = findConsentFields(form.fields || []);
      const consentFieldKeys = consentFields.map((field) => field.key);
      const deleteAfterDays = readDeleteAfterDays(form, retentionDaysFilter.value);
      const contacts: Contact[] = [];
      if (contactIds.length > 0) {
        const found = await Promise.all(contactIds.map((contactId) => repositories.forms.getContactById(site.id, form.id, contactId)));
        contacts.push(...found.filter((contact): contact is Contact => Boolean(contact)));
      } else {
        let offset = 0;
        while (true) {
          const page = await repositories.forms.listContacts({
            siteId: site.id,
            formId: form.id,
            limit: PAGE_SIZE,
            offset,
          });
          contacts.push(...page.items);
          if (!page.pagination.hasMore) break;
          offset += PAGE_SIZE;
        }
      }

      if (contactIds.length > 0 && contacts.length !== contactIds.length) {
        const foundIds = new Set(contacts.map((contact) => contact.id));
        const missingIds = contactIds.filter((contactId) => !foundIds.has(contactId));
        return errorResponse(404, 'CONTACT_NOT_FOUND', `Missing contacts: ${missingIds.join(', ')}`, requestId);
      }

      const dueContacts = contacts.filter((contact) => shouldAnonymizeContact(contact, consentFieldKeys, deleteAfterDays, now));
      const updated: Contact[] = [];
      if (!dryRun) {
        for (const contact of dueContacts) {
          const nextSourceValues = Object.fromEntries(
            Object.entries(contact.sourceValues || {}).map(([key, value]) => (
              consentFieldKeys.includes(key) ? [key, null] : [key, value]
            )),
          );
          const marker = `Contact consent evidence anonymized by ${actor} at ${new Date().toISOString()}.`;
          updated.push((await repositories.forms.updateContact(site.id, contact.id, {
            sourceValues: nextSourceValues,
            sourceIpHash: null,
            notes: [contact.notes, marker].filter(Boolean).join('\n'),
          })).item);
        }
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: actor,
          entity: 'form',
          entityId: form.id,
          action: 'contact.consentRetention',
          metadata: {
            dryRun,
            scanned: contacts.length,
            due: dueContacts.length,
            anonymized: updated.length,
            contactIds,
            consentFieldKeys,
            deleteAfterDays,
          },
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          formId: form.id,
          dryRun,
          policy: { deleteAfterDays, now: new Date(now).toISOString() },
          consentFieldKeys,
          scanned: contacts.length,
          due: dueContacts.length,
          anonymized: dryRun ? 0 : updated.length,
          contacts: (dryRun ? contacts : updated).map((contact) => toEvidenceContact(contact, consentFieldKeys, deleteAfterDays, now)),
        },
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

    const consentFields = findConsentFields(form.fields || []);
    const consentFieldKeys = consentFields.map((field) => field.key);
    const deleteAfterDays = readDeleteAfterDays(form, retentionDaysFilter.value);
    const allContacts = listAllDemoContacts(form.id);
    const contacts = contactIds.length > 0
      ? allContacts.filter((contact) => contactIds.includes(contact.id))
      : allContacts;
    if (contactIds.length > 0 && contacts.length !== contactIds.length) {
      const foundIds = new Set(contacts.map((contact) => contact.id));
      const missingIds = contactIds.filter((contactId) => !foundIds.has(contactId));
      return errorResponse(404, 'CONTACT_NOT_FOUND', `Missing contacts: ${missingIds.join(', ')}`, requestId);
    }

    const dueContacts = contacts.filter((contact) => shouldAnonymizeContact(contact, consentFieldKeys, deleteAfterDays, now));
    const updated = dryRun
      ? []
      : dueContacts.flatMap((contact) => {
        const anonymized = anonymizeFormContactConsentEvidence(form.id, contact.id, consentFieldKeys, actor);
        return anonymized ? [anonymized] : [];
      });
    if (!dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: actor,
        entity: 'form',
        entityId: form.id,
        action: 'contact.consentRetention',
        metadata: {
          dryRun,
          scanned: contacts.length,
          due: dueContacts.length,
          anonymized: updated.length,
          contactIds,
          consentFieldKeys,
          deleteAfterDays,
        },
        requestId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        formId: form.id,
        dryRun,
        policy: { deleteAfterDays, now: new Date(now).toISOString() },
        consentFieldKeys,
        scanned: contacts.length,
        due: dueContacts.length,
        anonymized: dryRun ? 0 : updated.length,
        contacts: (dryRun ? contacts : updated).map((contact) => toEvidenceContact(contact, consentFieldKeys, deleteAfterDays, now)),
      },
    });
  } catch (error) {
    console.error('Admin contact consent retention API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
