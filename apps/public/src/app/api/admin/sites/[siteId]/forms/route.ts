import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { createAdminForm, getAdminSettings, getSiteByIdOrSlug, listFormsBySite } from '@/lib/backyStore';
import { recordAdminAudit } from '@/lib/adminAudit';
import { parseFormFields } from '@/lib/adminFormFieldPolicy';
import { validateAdminFormCollectionTarget } from '@/lib/adminFormCollectionTargetPolicy';
import { seedFormInputFromFrontendDesignTemplate } from '@/lib/frontendDesignContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
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

const parseAudience = (value: unknown): FormDefinition['audience'] => (
  value === 'authenticated' || value === 'adminOnly' ? value : 'public'
);

const parseModerationMode = (value: unknown): FormDefinition['moderationMode'] => (
  value === 'auto-approve' ? 'auto-approve' : 'manual'
);

const parseRecord = <TRecord extends Record<string, unknown>>(value: unknown): TRecord | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as TRecord
    : undefined
);

const readFormBillingPolicy = (siteSettings: unknown, workspaceSettings: unknown) => {
  const siteRoot = parseRecord<Record<string, unknown>>(siteSettings) || {};
  const workspaceRoot = parseRecord<Record<string, unknown>>(workspaceSettings) || {};
  const integrations = parseRecord<Record<string, unknown>>(workspaceRoot.integrations) || {};
  const commerce = parseRecord<Record<string, unknown>>(integrations.commerce) || {};
  const billingQuota = parseRecord<Record<string, unknown>>(siteRoot.billingQuota) || {};
  const limits = parseRecord<Record<string, unknown>>(billingQuota.limits) || {};
  const limit = Number(limits.forms);

  return {
    overageMode: typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn',
    formLimit: Number.isFinite(limit) && limit >= 0
      ? Math.round(limit)
      : DEFAULT_SITE_SETTINGS.billingQuota.limits.forms,
    billingPlan: typeof billingQuota.plan === 'string'
      ? billingQuota.plan
      : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

const enforceFormBillingLimit = (
  siteSettings: unknown,
  workspaceSettings: unknown,
  currentFormCount: number,
  requestId: string,
) => {
  const policy = readFormBillingPolicy(siteSettings, workspaceSettings);
  if (policy.overageMode === 'block' && currentFormCount >= policy.formLimit) {
    return errorResponse(
      402,
      'BILLING_FORM_LIMIT',
      `The ${policy.billingPlan} site plan allows ${policy.formLimit} form${policy.formLimit === 1 ? '' : 's'}. Update the site billing quota before creating another form.`,
      requestId,
    );
  }

  return null;
};

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

const normalizeCreateInput = (siteId: string, body: Record<string, unknown>) => {
  const settings = parseRecord<Record<string, unknown>>(body.settings) || {};
  const spamSettings = parseRecord<FormDefinition['spamSettings'] & Record<string, unknown>>(body.spamSettings);
  const consentSettings = parseRecord<FormDefinition['consentSettings'] & Record<string, unknown>>(body.consentSettings);

  return {
    siteId,
    pageId: textValue(body.pageId) || null,
    postId: textValue(body.postId) || null,
    name: textValue(body.name || body.title),
    title: textValue(body.title || body.name),
    description: textValue(body.description) || null,
    audience: parseAudience(body.audience),
    isActive: body.isActive !== false,
    fields: parseFormFields(body.fields) || [],
    notificationEmail: textValue(body.notificationEmail) || null,
    notificationWebhook: textValue(body.notificationWebhook) || null,
    successRedirectUrl: textValue(body.successRedirectUrl) || null,
    successMessage: textValue(body.successMessage) || 'Submission received.',
    enableHoneypot: body.enableHoneypot !== false,
    enableCaptcha: body.enableCaptcha === true,
    spamSettings,
    consentSettings,
    moderationMode: parseModerationMode(body.moderationMode),
    contactShare: parseRecord<FormDefinition['contactShare'] & Record<string, unknown>>(body.contactShare),
    collectionTarget: parseRecord<FormDefinition['collectionTarget'] & Record<string, unknown>>(body.collectionTarget),
    settings: mergeFormSettings(settings, spamSettings, consentSettings),
    createdBy: 'admin',
    updatedBy: 'admin',
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId') || undefined;
    const postId = searchParams.get('postId') || undefined;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const payload = await repositories.forms.list({
        siteId: site.id,
        pageId,
        postId,
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          forms: payload.items,
          total: payload.pagination.total,
          pagination: payload.pagination,
        },
        forms: payload.items,
        total: payload.pagination.total,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const forms = listFormsBySite(site.id, { pageId, postId });
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        forms,
        total: forms.length,
        pagination: {
          total: forms.length,
          limit: forms.length,
          offset: 0,
          hasMore: false,
        },
      },
      forms,
      total: forms.length,
    });
  } catch (error) {
    console.error('Admin forms API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const seeded = seedFormInputFromFrontendDesignTemplate({ siteSettings: site.settings, body });
      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }

      const input = normalizeCreateInput(site.id, seeded.body);
      if (!input.name || !input.title) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Form name and title are required', requestId);
      }

      if (input.fields.length === 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'At least one form field is required', requestId);
      }

      const collectionTargetValidation = await validateAdminFormCollectionTarget({
        siteId: site.id,
        collectionTarget: input.collectionTarget,
        formFields: input.fields,
        repositories,
      });
      if (!collectionTargetValidation.ok) {
        return errorResponse(
          collectionTargetValidation.status,
          collectionTargetValidation.code,
          collectionTargetValidation.message,
          requestId,
        );
      }

      const [settings, existingForms] = await Promise.all([
        repositories.settings.get(),
        repositories.forms.list({
          siteId: site.id,
          limit: 1,
          offset: 0,
        }),
      ]);
      const billingLimitError = enforceFormBillingLimit(site.settings, settings, existingForms.pagination.total, requestId);
      if (billingLimitError) {
        return billingLimitError;
      }

      const created = (await repositories.forms.create({
        ...input,
        siteId: site.id,
        collectionTarget: collectionTargetValidation.collectionTarget,
      })).item;
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'form',
        entityId: created.id,
        action: 'form.create',
        after: created,
        metadata: {
          title: created.title || created.name || created.id,
          fieldCount: created.fields.length,
          source: textValue(seeded.body.frontendDesignTemplateId) ? 'frontend-design-template' : 'admin-template',
        },
        requestId,
      });

      return NextResponse.json(
        { success: true, requestId, data: { form: created }, form: created },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const seeded = seedFormInputFromFrontendDesignTemplate({ siteSettings: site.settings, body });
    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }

    const input = normalizeCreateInput(site.id, seeded.body);
    if (!input.name || !input.title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Form name and title are required', requestId);
    }

    if (input.fields.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'At least one form field is required', requestId);
    }

    const collectionTargetValidation = await validateAdminFormCollectionTarget({
      siteId: site.id,
      collectionTarget: input.collectionTarget,
      formFields: input.fields,
    });
    if (!collectionTargetValidation.ok) {
      return errorResponse(
        collectionTargetValidation.status,
        collectionTargetValidation.code,
        collectionTargetValidation.message,
        requestId,
      );
    }

    const existingForms = listFormsBySite(site.id);
    const billingLimitError = enforceFormBillingLimit(site.settings, getAdminSettings(), existingForms.length, requestId);
    if (billingLimitError) {
      return billingLimitError;
    }

    const created = createAdminForm({
      ...input,
      siteId: site.id,
      collectionTarget: collectionTargetValidation.collectionTarget,
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: 'form',
      entityId: created.id,
      action: 'form.create',
      after: created,
      metadata: {
        title: created.title || created.name || created.id,
        fieldCount: created.fields.length,
        source: textValue(seeded.body.frontendDesignTemplateId) ? 'frontend-design-template' : 'admin-template',
      },
      requestId,
    });

    return NextResponse.json(
      { success: true, requestId, data: { form: created }, form: created },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin forms create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
