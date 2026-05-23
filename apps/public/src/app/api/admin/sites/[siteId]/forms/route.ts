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

const envValue = (keys: string[]): { key: string; value: string } | null => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }

  return null;
};

const booleanEnvEnabled = (key: string): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

const getFormsPersistenceRuntimeSummary = () => {
  const databaseUrl = envValue(['BACKY_DATABASE_URL', 'DATABASE_URL']);
  const dataMode = process.env.BACKY_DATA_MODE?.trim() || 'database';
  const databaseType = process.env.BACKY_DATABASE_TYPE?.trim() || (
    databaseUrl?.value.startsWith('mysql') ? 'mysql' : 'postgres'
  );
  const disposableConfirmed = booleanEnvEnabled('BACKY_DATABASE_DISPOSABLE_CONFIRMED');
  const expectedHostConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST?.trim());
  const expectedDatabaseConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE?.trim());
  const missing = [
    ...(dataMode !== 'demo' && !databaseUrl ? ['BACKY_DATABASE_URL or DATABASE_URL'] : []),
    ...(!disposableConfirmed ? ['BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'] : []),
  ];

  return {
    dataMode,
    databaseType,
    databaseUrlConfigured: Boolean(databaseUrl),
    databaseUrlAlias: databaseUrl?.key || null,
    disposableConfirmed,
    expectedHostConfigured,
    expectedDatabaseConfigured,
    readyForCertification: dataMode !== 'demo' && Boolean(databaseUrl) && disposableConfirmed,
    missing,
    secretHandling: 'Database URLs and credentials are never returned; this runtime summary exposes alias/configuration state only.',
  };
};

type FormsPostgresDatabaseEnvAlias = 'BACKY_DATABASE_URL' | 'DATABASE_URL';

type FormsPostgresCertificationCommandOptions = {
  databaseEnvAlias: FormsPostgresDatabaseEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FORMS_POSTGRES_DATABASE_ENV_ALIASES: FormsPostgresDatabaseEnvAlias[] = ['BACKY_DATABASE_URL', 'DATABASE_URL'];

const DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: 'BACKY_DATABASE_URL',
  disposableConfirmed: true,
  expectedHost: '',
  expectedDatabase: '',
  includeReleaseDoctor: true,
} satisfies FormsPostgresCertificationCommandOptions;

const quoteFormsShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const quoteFormsEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteFormsShellValue(value)
);

const buildFormsPostgresCertificationEnvEntries = (
  options: FormsPostgresCertificationCommandOptions,
): Array<[string, string]> => {
  const envEntries: Array<[string, string]> = [
    ['BACKY_DATA_MODE', 'database'],
    ['BACKY_DATABASE_DISPOSABLE_CONFIRMED', options.disposableConfirmed ? 'true' : '<confirm-disposable-db-first>'],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ['BACKY_RELEASE_CERTIFY_DATABASE', '1'],
      ['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1'],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST', expectedHost]);
  if (expectedDatabase) envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE', expectedDatabase]);

  return envEntries;
};

const buildFormsPostgresCertificationCommand = (options: FormsPostgresCertificationCommandOptions): string => {
  const envEntries = buildFormsPostgresCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteFormsShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    'npm run ci:forms-postgres',
  ].join('\n');
};

const buildFormsPostgresCertificationEnvTemplate = (options: FormsPostgresCertificationCommandOptions): string => {
  const envEntries = buildFormsPostgresCertificationEnvEntries(options);

  return [
    '# Backy Forms Postgres certification environment',
    '# Keep the disposable database URL in CI secrets or local shell variables.',
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteFormsEnvTemplateValue(value)}`),
  ].join('\n');
};

const FORM_PERSISTENCE_CERTIFICATION_SCENARIOS = [
  {
    key: 'form-definition-crud',
    label: 'Form definition CRUD',
    expectedEvidence: ['form definition rows', 'field schemas', 'active/inactive state'],
    nextAction: 'Create or update at least one persisted form definition with fields before running the DB smoke.',
  },
  {
    key: 'public-submission-intake',
    label: 'Public submission intake',
    expectedEvidence: ['public submission row', 'request id', 'validated field values'],
    nextAction: 'Submit a public form payload against the disposable database target.',
  },
  {
    key: 'moderation-review',
    label: 'Moderation review',
    expectedEvidence: ['approved submission', 'rejected or spam submission', 'review metadata'],
    nextAction: 'Approve, reject, or mark a stored submission as spam through the Forms inbox.',
  },
  {
    key: 'contact-share',
    label: 'Contact share',
    expectedEvidence: ['contact-share mapping', 'contact record', 'dedupe metadata'],
    nextAction: 'Enable contact sharing and approve a submission that creates or updates a contact.',
  },
  {
    key: 'collection-routing',
    label: 'Collection routing',
    expectedEvidence: ['collection target mapping', 'created collection record', 'routing status'],
    nextAction: 'Route an approved submission into a writable collection record.',
  },
  {
    key: 'delivery-audit',
    label: 'Delivery and audit events',
    expectedEvidence: ['email/webhook event', 'retry state', 'audit activity'],
    nextAction: 'Configure email or webhook delivery and capture at least one delivery or retry event.',
  },
  {
    key: 'consent-spam-settings',
    label: 'Consent and spam settings',
    expectedEvidence: ['consent field', 'honeypot/captcha setting', 'consent retention record'],
    nextAction: 'Add consent/spam controls and collect a submission that records consent state.',
  },
  {
    key: 'custom-frontend-contract',
    label: 'Custom frontend contract',
    expectedEvidence: ['definition URL', 'submit URL', 'sample payload'],
    nextAction: 'Select a form so the definition, submit, sample payload, and cURL handoff are available.',
  },
] as const;

const formFieldTextIncludes = (
  form: FormDefinition,
  text: string,
): boolean => form.fields.some((field) => (
  field.type.toLowerCase().includes(text) ||
  field.key.toLowerCase().includes(text) ||
  field.label.toLowerCase().includes(text)
));

const buildFormsPersistenceScenarioEvidence = (forms: FormDefinition[]) => {
  const formsWithFields = forms.filter((form) => form.fields.length > 0).length;
  const activePublicForms = forms.filter((form) => form.isActive && form.audience === 'public').length;
  const manuallyModeratedForms = forms.filter((form) => (form.moderationMode || 'manual') === 'manual').length;
  const contactShareConfigured = forms.filter((form) => Boolean(form.contactShare?.enabled)).length;
  const collectionRoutingConfigured = forms.filter((form) => Boolean(form.collectionTarget?.enabled)).length;
  const deliveryConfigured = forms.filter((form) => Boolean(form.notificationEmail || form.notificationWebhook)).length;
  const consentOrSpamConfigured = forms.filter((form) => (
    Boolean(form.enableHoneypot || form.enableCaptcha || form.spamSettings || form.consentSettings) ||
    formFieldTextIncludes(form, 'consent')
  )).length;
  const evidenceCounts: Record<string, number> = {
    'form-definition-crud': formsWithFields,
    'public-submission-intake': activePublicForms,
    'moderation-review': manuallyModeratedForms,
    'contact-share': contactShareConfigured,
    'collection-routing': collectionRoutingConfigured,
    'delivery-audit': deliveryConfigured,
    'consent-spam-settings': consentOrSpamConfigured,
    'custom-frontend-contract': formsWithFields,
  };
  const scenarios = FORM_PERSISTENCE_CERTIFICATION_SCENARIOS.map((scenario) => {
    const evidenceCount = evidenceCounts[scenario.key] || 0;
    return {
      ...scenario,
      evidenceCount,
      status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

  return {
    schemaVersion: 'backy.forms-persistence-scenario-evidence.v1',
    status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
    requiredGate: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling: 'Forms persistence scenario evidence reports only names, counts, gates, and readiness states; database URLs, credentials, submission values, IP hashes, and contact payloads stay private.',
  };
};

const FORMS_POSTGRES_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFormsPostgresCertificationCommand(DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildFormsPostgresCertificationEnvTemplate(DEFAULT_FORMS_POSTGRES_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.forms-postgres-certification-env-template.v1',
  databaseUrlAliases: FORMS_POSTGRES_DATABASE_ENV_ALIASES,
  requiredInputs: [
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    'disposable migrated Supabase/Postgres database',
  ],
  targetGuards: [
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  ],
  secretHandling: 'Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
};

const formPersistenceCertification = (siteId: string, forms: FormDefinition[] = []) => ({
  schemaVersion: 'backy.forms-persistence-certification.v1',
  status: 'external-database-gate',
  selectedSiteId: siteId,
  requiredDatabaseEnv: ['BACKY_DATABASE_URL', 'DATABASE_URL'],
  requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  localEvidence: [
    'npm run test:forms --workspace @backy-cms/admin',
    'npm run test:repositories --workspace @backy/db',
  ],
  operatorGate: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
  preflightGates: [
    'npm run test:forms-postgres-preflight-contract',
    'npm run test:forms-postgres-disposable-guard',
  ],
  databaseGate: 'npm run test:forms-postgres --workspace @backy/db',
  ciGate: 'npm run ci:forms-postgres',
  workflow: '.github/workflows/forms-postgres-contract.yml',
  targetGuards: [
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  ],
  requires: [
    'disposable migrated Supabase/Postgres database',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    'disposable_database_confirmed=true',
    'form_definitions, form_submissions, and form_contacts migrations with RLS policies',
  ],
  coverage: [
    'form definitions',
    'form submissions',
    'form contacts',
    'collection-record routing',
    'contact merge and promotion metadata',
    'consent/spam settings persistence',
  ],
  evidenceExpectations: [
    'preflight contract output',
    'disposable target guard output',
    'DB-backed Forms smoke output',
    'non-secret workflow summary with disposable database confirmation',
  ],
  operatorCommandTemplate: FORMS_POSTGRES_OPERATOR_COMMAND_TEMPLATE,
  operatorEnvTemplate: {
    schemaVersion: 'backy.forms-postgres-certification-env-template.v1',
    format: 'shell-env',
    fileName: '.env.backy-forms-postgres-certification',
    body: FORMS_POSTGRES_OPERATOR_COMMAND_TEMPLATE.envTemplate,
    secretHandling: 'Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.',
  },
  runtime: getFormsPersistenceRuntimeSummary(),
  scenarioEvidence: buildFormsPersistenceScenarioEvidence(forms),
  secretHandling: 'Database URLs stay in server/CI environment variables; Forms API responses expose only non-secret gate names and readiness evidence.',
});

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

const hasOwn = (body: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(body, key)
);

const parseBooleanControl = (
  body: Record<string, unknown>,
  key: string,
  fallback: boolean,
): { value: boolean; invalid?: true } => {
  if (!hasOwn(body, key)) return { value: fallback };
  return typeof body[key] === 'boolean'
    ? { value: body[key] }
    : { value: fallback, invalid: true };
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

const normalizeCreateInput = (siteId: string, body: Record<string, unknown>, actorId: string | null) => {
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
    isActive: parseBooleanControl(body, 'isActive', true).value,
    fields: parseFormFields(body.fields) || [],
    notificationEmail: textValue(body.notificationEmail) || null,
    notificationWebhook: textValue(body.notificationWebhook) || null,
    successRedirectUrl: textValue(body.successRedirectUrl) || null,
    successMessage: textValue(body.successMessage) || 'Submission received.',
    enableHoneypot: parseBooleanControl(body, 'enableHoneypot', true).value,
    enableCaptcha: parseBooleanControl(body, 'enableCaptcha', false).value,
    spamSettings,
    consentSettings,
    moderationMode: parseModerationMode(body.moderationMode),
    contactShare: parseRecord<FormDefinition['contactShare'] & Record<string, unknown>>(body.contactShare),
    collectionTarget: parseRecord<FormDefinition['collectionTarget'] & Record<string, unknown>>(body.collectionTarget),
    settings: mergeFormSettings(settings, spamSettings, consentSettings),
    createdBy: actorId,
    updatedBy: actorId,
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
          persistenceCertification: formPersistenceCertification(site.id, payload.items),
        },
        forms: payload.items,
        total: payload.pagination.total,
        persistenceCertification: formPersistenceCertification(site.id, payload.items),
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
        persistenceCertification: formPersistenceCertification(site.id, forms),
      },
      forms,
      total: forms.length,
      persistenceCertification: formPersistenceCertification(site.id, forms),
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
    const configurationError = formConfigurationValidationError(body, requestId);
    if (configurationError) {
      return configurationError;
    }

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

      const input = normalizeCreateInput(site.id, seeded.body, access.session?.user.id || null);
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

    const input = normalizeCreateInput(site.id, seeded.body, access.session?.user.id || null);
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
