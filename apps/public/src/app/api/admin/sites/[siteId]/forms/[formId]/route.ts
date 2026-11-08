import { withVisitorPrivacyDeletion, visitorPrivacyDeletionErrorResponse } from '@/lib/visitorPrivacyTeardown';
import { formDefinitionWithVersion } from '@/lib/formDefinitionVersion';
import type { BackyFormUpdateInput } from '@backy-cms/core';
import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { deleteAdminForm, getFormById, getSiteByIdOrSlug, updateAdminForm } from '@/lib/backyStore';
import { prepareFormAttachmentDeletion, finishFormAttachmentDeletion } from '@/lib/formAttachmentLifecycle';
import { recordAdminAudit } from '@/lib/adminAudit';
import { parseFormFields } from '@/lib/adminFormFieldPolicy';
import { validateAdminFormCollectionTarget } from '@/lib/adminFormCollectionTargetPolicy';
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

const hasOwn = (body: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(body, key)
);

const parseBooleanControl = (
  body: Record<string, unknown>,
  key: string,
): { value?: boolean; invalid?: true } => {
  if (!hasOwn(body, key)) return {};
  return typeof body[key] === 'boolean'
    ? { value: body[key] }
    : { invalid: true };
};

const invalidAudienceResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_ADMIN_FORM_AUDIENCE',
  'Invalid admin form audience. Use public, authenticated, or adminOnly.',
  requestId,
);

const invalidModerationModeResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_ADMIN_FORM_MODERATION_MODE',
  'Invalid admin form moderation mode. Use manual or auto-approve.',
  requestId,
);

const invalidBooleanControlResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_ADMIN_FORM_BOOLEAN_CONTROL',
  'Form boolean controls must be true or false when provided.',
  requestId,
);

const formConfigurationValidationError = (body: Record<string, unknown>, requestId: string) => {
  if (
    hasOwn(body, 'audience') &&
    body.audience !== 'public' &&
    body.audience !== 'authenticated' &&
    body.audience !== 'adminOnly'
  ) {
    return invalidAudienceResponse(requestId);
  }

  if (
    hasOwn(body, 'moderationMode') &&
    body.moderationMode !== 'manual' &&
    body.moderationMode !== 'auto-approve'
  ) {
    return invalidModerationModeResponse(requestId);
  }

  for (const key of ['isActive', 'enableHoneypot', 'enableCaptcha']) {
    if (hasOwn(body, key) && typeof body[key] !== 'boolean') {
      return invalidBooleanControlResponse(requestId);
    }
  }

  return null;
};

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

const normalizePatchInput = (body: Record<string, unknown>, actorId: string | null): BackyFormUpdateInput => {
  const input: BackyFormUpdateInput = {
    updatedBy: actorId,
    ...(typeof body.expectedVersion === 'string' ? { expectedVersion: body.expectedVersion } : {}),
  };
  const settings = parseRecord<Record<string, unknown>>(body.settings) || {};
  const spamSettings = parseRecord<FormDefinition['spamSettings'] & Record<string, unknown>>(body.spamSettings);
  const consentSettings = parseRecord<FormDefinition['consentSettings'] & Record<string, unknown>>(body.consentSettings);
  const isActive = parseBooleanControl(body, 'isActive');
  const enableHoneypot = parseBooleanControl(body, 'enableHoneypot');
  const enableCaptcha = parseBooleanControl(body, 'enableCaptcha');

  if ('pageId' in body) input.pageId = nullableTextValue(body.pageId);
  if ('postId' in body) input.postId = nullableTextValue(body.postId);
  if ('name' in body) input.name = textValue(body.name);
  if ('title' in body) input.title = nullableTextValue(body.title);
  if ('description' in body) input.description = nullableTextValue(body.description);
  if ('audience' in body) input.audience = parseAudience(body.audience) || 'public';
  if (isActive.value !== undefined) input.isActive = isActive.value;
  if ('fields' in body) input.fields = parseFormFields(body.fields) || [];
  if ('notificationEmail' in body) input.notificationEmail = nullableTextValue(body.notificationEmail);
  if ('notificationWebhook' in body) input.notificationWebhook = nullableTextValue(body.notificationWebhook);
  if ('successRedirectUrl' in body) input.successRedirectUrl = nullableTextValue(body.successRedirectUrl);
  if ('successMessage' in body) input.successMessage = nullableTextValue(body.successMessage);
  if (enableHoneypot.value !== undefined) input.enableHoneypot = enableHoneypot.value;
  if (enableCaptcha.value !== undefined) input.enableCaptcha = enableCaptcha.value;
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
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
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

      return NextResponse.json({ success: true, requestId, data: { form: formDefinitionWithVersion(form) }, form: formDefinitionWithVersion(form) });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { form: formDefinitionWithVersion(form) }, form: formDefinitionWithVersion(form) });
  } catch (error) {
    console.error('Admin form detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = await parseJsonBody(request);
    if ('expectedVersion' in body && (typeof body.expectedVersion !== 'string' || !/^form-v1:[a-f0-9]{64}$/.test(body.expectedVersion))) return errorResponse(400, 'INVALID_FORM_DEFINITION_VERSION', 'Reload the form before saving.', requestId);
    const configurationError = formConfigurationValidationError(body, requestId);
    if (configurationError) {
      return configurationError;
    }
    const input = normalizePatchInput(body, access.session?.user.id || null);

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

      if (!repositories.forms.withDefinitionWriteLock) return errorResponse(503, 'FORM_DEFINITION_WRITE_UNAVAILABLE', 'Guarded form storage is unavailable.', requestId);
      let existing: FormDefinition | undefined;
      const updated = await repositories.forms.withDefinitionWriteLock(site.id, formId, async (writer, current, scoped) => {
        existing = current;
      const updateInput = input.settings
        ? {
          ...input,
          settings: mergeSettingsPatch(
            parseRecord<Record<string, unknown>>(existing.settings) || {},
            input.settings,
          ),
        }
        : input;
      if ('collectionTarget' in updateInput || 'fields' in updateInput) {
        const collectionTargetValidation = await validateAdminFormCollectionTarget({
          siteId: site.id,
          collectionTarget: updateInput.collectionTarget === undefined ? existing.collectionTarget : updateInput.collectionTarget,
          formFields: updateInput.fields || existing.fields,
          repositories: scoped,
        });
        if (!collectionTargetValidation.ok) {
          return errorResponse(
            collectionTargetValidation.status,
            collectionTargetValidation.code,
            collectionTargetValidation.message,
            requestId,
          );
        }
        updateInput.collectionTarget = collectionTargetValidation.collectionTarget;
      }
        return (await writer.update(site.id, formId, updateInput)).item;
      });
      if (updated instanceof NextResponse) return updated;
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
      return NextResponse.json({ success: true, requestId, data: { form: formDefinitionWithVersion(updated) }, form: formDefinitionWithVersion(updated) });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const existing = getFormById(site.id, formId);
    if (!existing) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    if ('collectionTarget' in input || 'fields' in input) {
      const collectionTargetValidation = await validateAdminFormCollectionTarget({
        siteId: site.id,
        collectionTarget: input.collectionTarget === undefined ? existing.collectionTarget : input.collectionTarget,
        formFields: input.fields || existing.fields,
      });
      if (!collectionTargetValidation.ok) {
        return errorResponse(
          collectionTargetValidation.status,
          collectionTargetValidation.code,
          collectionTargetValidation.message,
          requestId,
        );
      }
      input.collectionTarget = collectionTargetValidation.collectionTarget;
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

    return NextResponse.json({ success: true, requestId, data: { form: formDefinitionWithVersion(updated) }, form: formDefinitionWithVersion(updated) });
  } catch (error) {
    if ((error as any)?.code === 'FORM_DEFINITION_CONFLICT') return errorResponse(409, 'FORM_DEFINITION_CONFLICT', 'The form changed. Reload before saving.', requestId);
    if ((error as any)?.code === 'FORM_NOT_FOUND') return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found.', requestId);
    if ((error as any)?.code === 'FORM_DEFINITION_WRITE_UNAVAILABLE') return errorResponse(503, 'FORM_DEFINITION_WRITE_UNAVAILABLE', 'Guarded form storage is unavailable.', requestId);
    console.error('Admin form update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  let logicalDeleted = false;
  let restoreActive: (() => Promise<void>) | null = null;
  const pendingResponse = () => NextResponse.json({ success: true, requestId, data: { deleted: true, cleanupPending: true, retry: 'Repeat this authorized DELETE to resume private attachment cleanup.' }, deleted: true, cleanupPending: true }, { status: 202 });
  try {
    const { siteId, formId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return await withVisitorPrivacyDeletion(repositories, site.id, formId, async () => {
      const existing = await repositories.forms.getById(site.id, formId);
      if (!existing) {
        logicalDeleted = true;
        const cleanup = await finishFormAttachmentDeletion(site.id, formId, repositories);
        if (!cleanup.found) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
        return cleanup.cleanupPending ? pendingResponse() : NextResponse.json({ success: true, requestId, data: { deleted: true, cleanupPending: false }, deleted: true, cleanupPending: false });
      }
      if (existing.siteId !== site.id) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      if (existing.isActive) {
        restoreActive = async () => { await repositories.forms.update(site.id, existing.id, { isActive: true }); };
        await repositories.forms.update(site.id, existing.id, { isActive: false });
      }
      const cleanupPrepared = await prepareFormAttachmentDeletion(site.id, existing.id, repositories);
      if (!await repositories.forms.delete(site.id, existing.id)) throw new Error('Form deletion failed');
      logicalDeleted = true;
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
          attachmentCleanupQueued: cleanupPrepared,
        },
        requestId,
      });
      const cleanup = cleanupPrepared ? await finishFormAttachmentDeletion(site.id, existing.id, repositories) : { cleanupPending: false };
      return cleanup.cleanupPending ? pendingResponse() : NextResponse.json({ success: true, requestId, data: { deleted: true, cleanupPending: false }, deleted: true, cleanupPending: false });
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const existing = getFormById(site.id, formId);
    if (!existing) {
      logicalDeleted = true;
      const cleanup = await finishFormAttachmentDeletion(site.id, formId, null);
      if (!cleanup.found) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      return cleanup.cleanupPending ? pendingResponse() : NextResponse.json({ success: true, requestId, data: { deleted: true, cleanupPending: false }, deleted: true, cleanupPending: false });
    }
    if (existing.siteId !== site.id) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    if (existing.isActive) {
      restoreActive = async () => { if (!updateAdminForm(site.id, existing.id, { isActive: true })) throw new Error('Form recovery failed'); };
      if (!updateAdminForm(site.id, existing.id, { isActive: false })) throw new Error('Form deactivation failed');
    }
    const cleanupPrepared = await prepareFormAttachmentDeletion(site.id, existing.id, null);
    const deleted = deleteAdminForm(site.id, existing.id);
    if (!deleted) {
      throw new Error('Form deletion failed');
    }
    logicalDeleted = true;
    await recordAdminAudit({
      siteId: site.id,
      entity: 'form',
      entityId: existing.id,
      action: 'form.delete',
      before: existing,
      metadata: {
        title: existing.title || existing.name || existing.id,
        fieldCount: existing.fields.length,
        attachmentCleanupQueued: cleanupPrepared,
      },
      requestId,
    });

    const cleanup = cleanupPrepared ? await finishFormAttachmentDeletion(site.id, existing.id, null) : { cleanupPending: false };
    return cleanup.cleanupPending ? pendingResponse() : NextResponse.json({ success: true, requestId, data: { deleted: true, cleanupPending: false }, deleted: true, cleanupPending: false });
  } catch (error) {
    const privacyError = visitorPrivacyDeletionErrorResponse(error, requestId, 'form'); if (privacyError) return privacyError;
    if (logicalDeleted) return pendingResponse();
    if (restoreActive) {
      try { await restoreActive(); } catch {
        return errorResponse(503, 'FORM_DELETE_RECOVERY_REQUIRED', 'The form was not deleted and remains deactivated. Restore repository access, then reactivate the form or retry this authorized DELETE.', requestId);
      }
    }
    return errorResponse(503, 'FORM_ATTACHMENT_CLEANUP_UNAVAILABLE', 'The form was not deleted. Unable to verify or persist private attachment cleanup; retry this authorized DELETE.', requestId);
  }
}
