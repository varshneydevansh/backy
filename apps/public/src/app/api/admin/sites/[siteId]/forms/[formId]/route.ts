import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { deleteAdminForm, getFormById, getSiteByIdOrSlug, updateAdminForm } from '@/lib/backyStore';
import { recordAdminAudit } from '@/lib/adminAudit';
import { parseFormFields } from '@/lib/adminFormFieldPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

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

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const nullableTextValue = (value: unknown): string | null => {
  const text = textValue(value);
  return text ? text : null;
};

const parseAudience = (value: unknown): FormDefinition['audience'] | undefined => (
  value === 'public' || value === 'authenticated' || value === 'adminOnly' ? value : undefined
);

const parseModerationMode = (value: unknown): FormDefinition['moderationMode'] | undefined => (
  value === 'manual' || value === 'auto-approve' ? value : undefined
);

const parseRecord = <TRecord extends Record<string, unknown>>(value: unknown): TRecord | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as TRecord
    : undefined
);

const mergeFormSettings = (
  settings: Record<string, unknown>,
  spamSettings?: FormDefinition['spamSettings'] & Record<string, unknown>,
  consentSettings?: FormDefinition['consentSettings'] & Record<string, unknown>,
): Record<string, unknown> => ({
  ...settings,
  ...(spamSettings
    ? { spam: { ...(parseRecord<Record<string, unknown>>(settings.spam) || {}), ...spamSettings } }
    : {}),
  ...(consentSettings
    ? { consent: { ...(parseRecord<Record<string, unknown>>(settings.consent) || {}), ...consentSettings } }
    : {}),
});

const mergeSettingsPatch = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const spamPatch = parseRecord<Record<string, unknown>>(patch.spam);
  const consentPatch = parseRecord<Record<string, unknown>>(patch.consent);

  return {
    ...base,
    ...patch,
    ...(spamPatch
      ? { spam: { ...(parseRecord<Record<string, unknown>>(base.spam) || {}), ...spamPatch } }
      : {}),
    ...(consentPatch
      ? { consent: { ...(parseRecord<Record<string, unknown>>(base.consent) || {}), ...consentPatch } }
      : {}),
  };
};

const normalizePatchInput = (body: Record<string, unknown>): Partial<FormDefinition> => {
  const input: Partial<FormDefinition> = {
    updatedBy: 'admin',
  };
  const settings = parseRecord<Record<string, unknown>>(body.settings) || {};
  const spamSettings = parseRecord<FormDefinition['spamSettings'] & Record<string, unknown>>(body.spamSettings);
  const consentSettings = parseRecord<FormDefinition['consentSettings'] & Record<string, unknown>>(body.consentSettings);

  if ('pageId' in body) input.pageId = nullableTextValue(body.pageId);
  if ('postId' in body) input.postId = nullableTextValue(body.postId);
  if ('name' in body) input.name = textValue(body.name);
  if ('title' in body) input.title = nullableTextValue(body.title);
  if ('description' in body) input.description = nullableTextValue(body.description);
  if ('audience' in body) input.audience = parseAudience(body.audience) || 'public';
  if ('isActive' in body) input.isActive = body.isActive !== false;
  if ('fields' in body) input.fields = parseFormFields(body.fields) || [];
  if ('notificationEmail' in body) input.notificationEmail = nullableTextValue(body.notificationEmail);
  if ('notificationWebhook' in body) input.notificationWebhook = nullableTextValue(body.notificationWebhook);
  if ('successRedirectUrl' in body) input.successRedirectUrl = nullableTextValue(body.successRedirectUrl);
  if ('successMessage' in body) input.successMessage = nullableTextValue(body.successMessage);
  if ('enableHoneypot' in body) input.enableHoneypot = body.enableHoneypot !== false;
  if ('enableCaptcha' in body) input.enableCaptcha = body.enableCaptcha === true;
  if ('spamSettings' in body) input.spamSettings = spamSettings;
  if ('consentSettings' in body) input.consentSettings = consentSettings;
  if ('moderationMode' in body) input.moderationMode = parseModerationMode(body.moderationMode) || 'manual';
  if ('contactShare' in body) input.contactShare = parseRecord<FormDefinition['contactShare'] & Record<string, unknown>>(body.contactShare);
  if ('collectionTarget' in body) input.collectionTarget = parseRecord<FormDefinition['collectionTarget'] & Record<string, unknown>>(body.collectionTarget);
  if ('settings' in body || spamSettings || consentSettings) {
    input.settings = mergeFormSettings(settings, spamSettings, consentSettings);
  }
  return input;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
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

      return NextResponse.json({ success: true, requestId, data: { form }, form });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { form }, form });
  } catch (error) {
    console.error('Admin form detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = await parseJsonBody(request);
    const input = normalizePatchInput(body);

    if ('name' in input && !input.name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Form name is required', requestId);
    }

    if ('fields' in input && (!input.fields || input.fields.length === 0)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'At least one form field is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const existing = await repositories.forms.getById(site.id, formId);
      if (!existing) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const updateInput = input.settings
        ? {
          ...input,
          settings: mergeSettingsPatch(
            parseRecord<Record<string, unknown>>(existing.settings) || {},
            input.settings,
          ),
        }
        : input;
      const updated = (await repositories.forms.update(site.id, formId, updateInput)).item;
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'form',
        entityId: updated.id,
        action: 'form.update',
        before: existing,
        after: updated,
        metadata: {
          title: updated.title || updated.name || updated.id,
          fieldCount: updated.fields.length,
          changedKeys: Object.keys(input).sort(),
        },
        requestId,
      });
      return NextResponse.json({ success: true, requestId, data: { form: updated }, form: updated });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const existing = getFormById(site.id, formId);
    if (!existing) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const updated = updateAdminForm(site.id, formId, input);
    if (!updated) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'form',
      entityId: updated.id,
      action: 'form.update',
      before: existing,
      after: updated,
      metadata: {
        title: updated.title || updated.name || updated.id,
        fieldCount: updated.fields.length,
        changedKeys: Object.keys(input).sort(),
      },
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { form: updated }, form: updated });
  } catch (error) {
    console.error('Admin form update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const existing = await repositories.forms.getById(site.id, formId);
      if (!existing) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      await repositories.forms.delete(site.id, formId);
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'form',
        entityId: existing.id,
        action: 'form.delete',
        before: existing,
        metadata: {
          title: existing.title || existing.name || existing.id,
          fieldCount: existing.fields.length,
        },
        requestId,
      });
      return NextResponse.json({ success: true, requestId, data: { deleted: true }, deleted: true });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const existing = getFormById(site.id, formId);
    if (!existing) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const deleted = deleteAdminForm(site.id, formId);
    if (!deleted) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'form',
      entityId: existing.id,
      action: 'form.delete',
      before: existing,
      metadata: {
        title: existing.title || existing.name || existing.id,
        fieldCount: existing.fields.length,
      },
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { deleted: true }, deleted: true });
  } catch (error) {
    console.error('Admin form delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
