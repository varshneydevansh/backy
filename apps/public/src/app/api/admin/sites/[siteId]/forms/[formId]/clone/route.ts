import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  createAdminForm,
  getAdminSettings,
  getFormById,
  getSiteByIdOrSlug,
  listFormsBySite,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const hasOwn = (body: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(body, key)
);

const cloneJson = <TValue,>(value: TValue): TValue => JSON.parse(JSON.stringify(value)) as TValue;

const readFormBillingPolicy = (siteSettings: unknown, workspaceSettings: unknown) => {
  const siteRoot = isRecord(siteSettings) ? siteSettings : {};
  const workspaceRoot = isRecord(workspaceSettings) ? workspaceSettings : {};
  const integrations = isRecord(workspaceRoot.integrations) ? workspaceRoot.integrations : {};
  const commerce = isRecord(integrations.commerce) ? integrations.commerce : {};
  const billingQuota = isRecord(siteRoot.billingQuota) ? siteRoot.billingQuota : {};
  const limits = isRecord(billingQuota.limits) ? billingQuota.limits : {};
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
      `The ${policy.billingPlan} site plan allows ${policy.formLimit} form${policy.formLimit === 1 ? '' : 's'}. Update the site billing quota before cloning another form.`,
      requestId,
    );
  }

  return null;
};

const parseCloneOverrides = (body: Record<string, unknown>, requestId: string) => {
  if (hasOwn(body, 'name') && typeof body.name !== 'string') {
    return { error: errorResponse(400, 'INVALID_ADMIN_FORM_CLONE_NAME', 'Clone name must be a string when provided.', requestId) };
  }
  if (hasOwn(body, 'title') && typeof body.title !== 'string') {
    return { error: errorResponse(400, 'INVALID_ADMIN_FORM_CLONE_TITLE', 'Clone title must be a string when provided.', requestId) };
  }
  if (hasOwn(body, 'isActive') && typeof body.isActive !== 'boolean') {
    return { error: errorResponse(400, 'INVALID_ADMIN_FORM_CLONE_ACTIVE', 'Clone isActive must be true or false when provided.', requestId) };
  }

  return {
    value: {
      name: textValue(body.name),
      title: textValue(body.title),
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    },
  };
};

const cloneFormInput = (
  source: FormDefinition,
  overrides: { name: string; title: string; isActive?: boolean },
  actor: string,
): Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'> => {
  const nextName = overrides.name || `${source.name} copy`;
  const nextTitle = overrides.title || `${source.title || source.name} copy`;

  return {
    siteId: source.siteId,
    pageId: source.pageId || null,
    postId: source.postId || null,
    name: nextName,
    title: nextTitle,
    description: source.description || null,
    audience: source.audience || 'public',
    isActive: overrides.isActive ?? source.isActive,
    fields: cloneJson(source.fields || []),
    notificationEmail: source.notificationEmail || null,
    notificationWebhook: source.notificationWebhook || null,
    successRedirectUrl: source.successRedirectUrl || null,
    successMessage: source.successMessage || 'Submission received.',
    enableHoneypot: source.enableHoneypot !== false,
    enableCaptcha: source.enableCaptcha === true,
    spamSettings: source.spamSettings ? cloneJson(source.spamSettings) : undefined,
    consentSettings: source.consentSettings ? cloneJson(source.consentSettings) : undefined,
    moderationMode: source.moderationMode || 'manual',
    contactShare: source.contactShare ? cloneJson(source.contactShare) : undefined,
    collectionTarget: source.collectionTarget ? cloneJson(source.collectionTarget) : undefined,
    settings: cloneJson(source.settings || {}),
    createdBy: actor,
    updatedBy: actor,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, formId } = await params;
    const body = await parseJsonBody(request);
    const parsed = parseCloneOverrides(body, requestId);
    if (parsed.error) {
      return parsed.error;
    }
    const actor = access.session?.user.id || access.session?.user.email || 'admin';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const source = await repositories.forms.getById(site.id, formId);
      if (!source) {
        return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
      }

      const [settings, existingForms] = await Promise.all([
        repositories.settings.get(),
        repositories.forms.list({ siteId: site.id, limit: 1, offset: 0 }),
      ]);
      const billingLimitError = enforceFormBillingLimit(site.settings, settings, existingForms.pagination.total, requestId);
      if (billingLimitError) {
        return billingLimitError;
      }

      const cloned = (await repositories.forms.create(cloneFormInput(source, parsed.value, actor))).item;
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'form',
        entityId: cloned.id,
        action: 'form.clone',
        before: source,
        after: cloned,
        metadata: {
          sourceFormId: source.id,
          sourceFormName: source.name,
          clonedFormName: cloned.name,
          fieldCount: cloned.fields.length,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { form: cloned, sourceFormId: source.id },
        form: cloned,
      }, { status: 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const source = getFormById(site.id, formId);
    if (!source) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    const existingForms = listFormsBySite(site.id);
    const billingLimitError = enforceFormBillingLimit(site.settings, getAdminSettings(), existingForms.length, requestId);
    if (billingLimitError) {
      return billingLimitError;
    }

    const cloned = createAdminForm(cloneFormInput(source, parsed.value, actor));
    await recordAdminAudit({
      siteId: site.id,
      entity: 'form',
      entityId: cloned.id,
      action: 'form.clone',
      before: source,
      after: cloned,
      metadata: {
        sourceFormId: source.id,
        sourceFormName: source.name,
        clonedFormName: cloned.name,
        fieldCount: cloned.fields.length,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { form: cloned, sourceFormId: source.id },
      form: cloned,
    }, { status: 201 });
  } catch (error) {
    console.error('Admin form clone API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
