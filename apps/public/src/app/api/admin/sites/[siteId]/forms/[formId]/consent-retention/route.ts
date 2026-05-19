import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, FormFieldDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  anonymizeFormSubmissionConsentEvidence,
  getFormById,
  getSiteByIdOrSlug,
  listFormSubmissions,
} from '@/lib/backyStore';
import { recordAdminAudit } from '@/lib/adminAudit';
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

const readDeleteAfterDays = (form: FormDefinition): number => {
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

const addDays = (dateValue: string | null | undefined, days: number): number | null => {
  const timestamp = Date.parse(dateValue || '');
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getTime();
};

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

const shouldAnonymize = (
  submission: FormSubmission,
  consentFieldKeys: string[],
  deleteAfterDays: number,
  now: number,
): boolean => {
  if (consentFieldKeys.length === 0) return false;

  const dueAt = addDays(submission.submittedAt, deleteAfterDays);
  if (dueAt === null || dueAt > now) return false;

  return Boolean(
    submission.ipHash ||
    submission.userAgent ||
    consentFieldKeys.some((key) => {
      const value = submission.values?.[key];
      return value !== null && value !== undefined && value !== '';
    }),
  );
};

const anonymizeValues = (
  values: Record<string, unknown>,
  consentFieldKeys: string[],
): Record<string, unknown> => {
  const consentKeys = new Set(consentFieldKeys);
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => (
      consentKeys.has(key) ? [key, null] : [key, value]
    )),
  );
};

const appendAnonymizedNote = (submission: FormSubmission, actor: string) => (
  [
    submission.adminNotes,
    `Consent evidence anonymized by ${actor} at ${new Date().toISOString()}.`,
  ].filter(Boolean).join('\n')
);

const listAllDemoSubmissions = (formId: string): FormSubmission[] => {
  const items: FormSubmission[] = [];
  let offset = 0;

  while (true) {
    const page = listFormSubmissions(formId, { limit: PAGE_SIZE, offset });
    items.push(...page.data);
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
    const dryRunFilter = parseDryRun(body, false);
    if (dryRunFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONSENT_RETENTION_DRY_RUN', 'dryRun must be a boolean when provided.', requestId);
    }
    const dryRun = dryRunFilter.value;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'admin';
    const nowFilter = parseNow(body);
    if (nowFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_FORM_CONSENT_RETENTION_NOW', 'now must be a valid date/time string when provided.', requestId);
    }
    const now = nowFilter.value;

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
      const deleteAfterDays = readDeleteAfterDays(form);
      const submissions: FormSubmission[] = [];
      let offset = 0;
      while (true) {
        const page = await repositories.forms.listSubmissions({
          siteId: site.id,
          formId: form.id,
          limit: PAGE_SIZE,
          offset,
        });
        submissions.push(...page.items);
        if (!page.pagination.hasMore) break;
        offset += PAGE_SIZE;
      }

      const dueSubmissions = submissions.filter((submission) => shouldAnonymize(submission, consentFieldKeys, deleteAfterDays, now));
      const updated: FormSubmission[] = [];
      if (!dryRun) {
        for (const submission of dueSubmissions) {
          updated.push((await repositories.forms.updateSubmission(site.id, submission.id, {
            values: anonymizeValues(submission.values || {}, consentFieldKeys),
            ipHash: null,
            userAgent: null,
            adminNotes: appendAnonymizedNote(submission, actor),
          })).item);
        }
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: actor,
          entity: 'form',
          entityId: form.id,
          action: 'form.consentRetention',
          metadata: {
            dryRun,
            scanned: submissions.length,
            due: dueSubmissions.length,
            anonymized: updated.length,
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
          scanned: submissions.length,
          due: dueSubmissions.length,
          anonymized: dryRun ? 0 : updated.length,
          submissions: dryRun ? dueSubmissions : updated,
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
    const deleteAfterDays = readDeleteAfterDays(form);
    const submissions = listAllDemoSubmissions(form.id);
    const dueSubmissions = submissions.filter((submission) => shouldAnonymize(submission, consentFieldKeys, deleteAfterDays, now));
    const updated = dryRun
      ? []
      : dueSubmissions.flatMap((submission) => {
        const anonymized = anonymizeFormSubmissionConsentEvidence(form.id, submission.id, consentFieldKeys, actor);
        return anonymized ? [anonymized] : [];
      });
    if (!dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: actor,
        entity: 'form',
        entityId: form.id,
        action: 'form.consentRetention',
        metadata: {
          dryRun,
          scanned: submissions.length,
          due: dueSubmissions.length,
          anonymized: updated.length,
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
        scanned: submissions.length,
        due: dueSubmissions.length,
        anonymized: dryRun ? 0 : updated.length,
        submissions: dryRun ? dueSubmissions : updated,
      },
    });
  } catch (error) {
    console.error('Admin consent retention API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
