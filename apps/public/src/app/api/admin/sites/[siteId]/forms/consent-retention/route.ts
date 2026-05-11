import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, FormFieldDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  anonymizeFormSubmissionConsentEvidence,
  getSiteByIdOrSlug,
  listFormsBySite,
  listFormSubmissions,
} from '@/lib/backyStore';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
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

const parseNow = (body: Record<string, unknown>): number => {
  if (typeof body.now === 'string') {
    const timestamp = Date.parse(body.now);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Date.now();
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

const buildFormResult = (
  form: FormDefinition,
  submissions: FormSubmission[],
  now: number,
) => {
  const consentFields = findConsentFields(form.fields || []);
  const consentFieldKeys = consentFields.map((field) => field.key);
  const deleteAfterDays = readDeleteAfterDays(form);
  const dueSubmissions = submissions.filter((submission) => shouldAnonymize(submission, consentFieldKeys, deleteAfterDays, now));

  return {
    formId: form.id,
    formName: form.name,
    policy: { deleteAfterDays },
    consentFieldKeys,
    scanned: submissions.length,
    due: dueSubmissions.length,
    dueSubmissions,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const dryRun = body.dryRun === true;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'scheduled-retention';
    const now = parseNow(body);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const forms: FormDefinition[] = [];
      let formsOffset = 0;
      while (true) {
        const page = await repositories.forms.list({
          siteId: site.id,
          limit: PAGE_SIZE,
          offset: formsOffset,
        });
        forms.push(...page.items);
        if (!page.pagination.hasMore) break;
        formsOffset += PAGE_SIZE;
      }

      const results = [];
      for (const form of forms) {
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

        const result = buildFormResult(form, submissions, now);
        const updated: FormSubmission[] = [];
        if (!dryRun) {
          for (const submission of result.dueSubmissions) {
            updated.push((await repositories.forms.updateSubmission(site.id, submission.id, {
              values: anonymizeValues(submission.values || {}, result.consentFieldKeys),
              ipHash: null,
              userAgent: null,
              adminNotes: appendAnonymizedNote(submission, actor),
            })).item);
          }
        }

        results.push({
          ...result,
          dueSubmissions: undefined,
          anonymized: dryRun ? 0 : updated.length,
          submissions: dryRun ? result.dueSubmissions : updated,
        });
      }
      const summary = {
        dryRun,
        policy: { now: new Date(now).toISOString() },
        scannedForms: forms.length,
        formsWithConsent: results.filter((result) => result.consentFieldKeys.length > 0).length,
        scannedSubmissions: results.reduce((total, result) => total + result.scanned, 0),
        due: results.reduce((total, result) => total + result.due, 0),
        anonymized: results.reduce((total, result) => total + result.anonymized, 0),
      };
      if (!dryRun) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: actor,
          entity: 'site',
          entityId: site.id,
          action: 'forms.consentRetention',
          metadata: summary,
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          ...summary,
          results,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const forms = listFormsBySite(site.id);
    const results = forms.map((form) => {
      const result = buildFormResult(form, listAllDemoSubmissions(form.id), now);
      const updated = dryRun
        ? []
        : result.dueSubmissions.flatMap((submission) => {
          const anonymized = anonymizeFormSubmissionConsentEvidence(form.id, submission.id, result.consentFieldKeys, actor);
          return anonymized ? [anonymized] : [];
        });

      return {
        ...result,
        dueSubmissions: undefined,
        anonymized: dryRun ? 0 : updated.length,
        submissions: dryRun ? result.dueSubmissions : updated,
      };
    });
    const summary = {
      dryRun,
      policy: { now: new Date(now).toISOString() },
      scannedForms: forms.length,
      formsWithConsent: results.filter((result) => result.consentFieldKeys.length > 0).length,
      scannedSubmissions: results.reduce((total, result) => total + result.scanned, 0),
      due: results.reduce((total, result) => total + result.due, 0),
      anonymized: results.reduce((total, result) => total + result.anonymized, 0),
    };
    if (!dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: actor,
        entity: 'site',
        entityId: site.id,
        action: 'forms.consentRetention',
        metadata: summary,
        requestId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        ...summary,
        results,
      },
    });
  } catch (error) {
    console.error('Admin scheduled consent retention API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
