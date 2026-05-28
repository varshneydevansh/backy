#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_FORMS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_FORMS_CDP_PORT || 9379);
const SCREENSHOT_PATH = process.env.BACKY_FORMS_SCREENSHOT || path.join(os.tmpdir(), 'backy-forms-smoke.png');
const EXPECTED_EMAIL_PROVIDER = process.env.BACKY_FORMS_SMOKE_EXPECT_EMAIL_PROVIDER || 'local-outbox';
const EXPECTED_EMAIL_STATUS_CODE = Number(process.env.BACKY_FORMS_SMOKE_EXPECT_EMAIL_STATUS_CODE || (EXPECTED_EMAIL_PROVIDER === 'local-outbox' ? 202 : 200));
const EXPECTED_EMAIL_INITIAL_STATUS = process.env.BACKY_FORMS_SMOKE_EXPECT_EMAIL_INITIAL_STATUS || 'succeeded';
const EXPECTED_EMAIL_RETRY_STATUS_CODE = Number(process.env.BACKY_FORMS_SMOKE_EXPECT_EMAIL_RETRY_STATUS_CODE || EXPECTED_EMAIL_STATUS_CODE);
const FRONTEND_FORM_TEMPLATE_ID = 'smoke-form-contract-template';
const FRONTEND_FORM_TEMPLATE_NAME = 'Smoke Frontend Intake';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertFormsPersistenceCertificationSource = () => {
  const source = fs.readFileSync(new URL('../src/routes/forms.tsx', import.meta.url), 'utf8');
  const adminContentApiSource = fs.readFileSync(new URL('../src/lib/adminContentApi.ts', import.meta.url), 'utf8');
  const embedBlockRouteSource = fs.readFileSync(new URL('../../public/src/app/api/admin/sites/[siteId]/forms/[formId]/embed-block/route.ts', import.meta.url), 'utf8');
  const reviewRouteSource = fs.readFileSync(new URL('../../public/src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/review/route.ts', import.meta.url), 'utf8');
  const publicStoreSource = fs.readFileSync(new URL('../../public/src/lib/backyStore.ts', import.meta.url), 'utf8');
  const publicFormDefinitionRouteSource = fs.readFileSync(new URL('../../public/src/app/api/sites/[siteId]/forms/[formId]/definition/route.ts', import.meta.url), 'utf8');
  const publicFormDetailRouteSource = fs.readFileSync(new URL('../../public/src/app/api/sites/[siteId]/forms/[formId]/route.ts', import.meta.url), 'utf8');
  const publicFormSubmissionsRouteSource = fs.readFileSync(new URL('../../public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts', import.meta.url), 'utf8');
  const publicManifestRouteSource = fs.readFileSync(new URL('../../public/src/app/api/sites/[siteId]/manifest/route.ts', import.meta.url), 'utf8');
  const publicOpenApiRouteSource = fs.readFileSync(new URL('../../public/src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8');
  const frontendDesignContractSource = fs.readFileSync(new URL('../../public/src/lib/frontendDesignContract.ts', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  assert(source.includes('data-testid="forms-persistence-certification"'), 'Forms page must render the persistence certification handoff');
  assert(
    source.includes('data-testid="forms-persistence-certification-details"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Daily form work keeps the readiness summary, handoff copy, CI command, and download actions visible.'),
    'Forms persistence certification operator details must be collapsed by default',
  );
  assert(
    source.includes('data-testid="forms-control-map-details"') &&
      source.includes('data-testid="forms-control-map"') &&
      source.includes('FORM_CONTROL_AREAS.map((area) =>') &&
      source.includes('data-testid="forms-frontend-contract-details"') &&
      source.includes('data-testid="forms-frontend-contract-systems"') &&
      source.includes('FORM_FRONTEND_SYSTEMS.map((system) =>') &&
      source.includes('data-default-collapsed="true"'),
    'Forms command center must keep low-frequency control maps and frontend-system details collapsed by default',
  );
  {
    const commandCenterBlockStart = source.indexOf('data-testid="forms-command-center"');
    const commandCenterBlockEnd = source.indexOf('<div className="mt-5 grid gap-3', commandCenterBlockStart);
    const commandCenterBlock = commandCenterBlockStart >= 0
      ? source.slice(commandCenterBlockStart, commandCenterBlockEnd >= 0 ? commandCenterBlockEnd : commandCenterBlockStart + 6200)
      : '';
    const primaryActionsIndex = commandCenterBlock.indexOf('data-testid="forms-primary-actions"');
    const createIndex = commandCenterBlock.indexOf('data-testid="forms-create-blank-button"');
    const exportIndex = commandCenterBlock.indexOf('data-testid="forms-command-export-csv"');
    const refreshIndex = commandCenterBlock.indexOf('data-testid="forms-command-refresh"');
    const secondaryActionsIndex = commandCenterBlock.indexOf('data-testid="forms-secondary-actions"');
    const moreActionsIndex = commandCenterBlock.indexOf('data-testid="forms-more-actions"');
    const copyIndex = commandCenterBlock.indexOf('data-testid="forms-command-copy-manifest"');
    const downloadIndex = commandCenterBlock.indexOf('data-testid="forms-command-download-json"');
    assert(
      primaryActionsIndex >= 0 &&
        createIndex > primaryActionsIndex &&
        exportIndex > createIndex &&
        refreshIndex > exportIndex &&
        secondaryActionsIndex > refreshIndex &&
        commandCenterBlock.includes('data-default-collapsed="true"') &&
        moreActionsIndex > secondaryActionsIndex &&
        copyIndex > moreActionsIndex &&
        downloadIndex > copyIndex,
      'Forms command center must lead with create/export/refresh actions and move manifest/JSON handoff behind More actions.',
    );
  }
  for (const [snippet, message] of [
    ['const formsViewActionStatusId = \'forms-view-action-status\';', 'Forms route must define a shared view action status id'],
    ['const formsExportActionStatusId = \'forms-export-action-status\';', 'Forms route must define a shared export action status id'],
    ['const formsCommandSecondaryActionStatusId = \'forms-command-secondary-action-status\';', 'Forms route must define a shared command secondary action status id'],
    ['data-testid="forms-view-action-status"', 'Forms route must render hidden view action status copy'],
    ['data-testid="forms-export-action-status"', 'Forms route must render hidden export action status copy'],
    ['data-testid="forms-command-secondary-action-status"', 'Forms route must render hidden command secondary action status copy'],
    ['data-action-status={formsCommandSecondaryActionStatus}', 'Forms secondary command group must expose aggregate action status'],
    ['data-action-status={formsCommandCopyActionStatus}', 'Forms copy-manifest command must expose command-specific action status'],
    ['data-action-status={formsCommandDownloadActionStatus}', 'Forms download-manifest command must expose command-specific action status'],
    ['data-disabled-reason={formsCommandCopyDisabledReason || undefined}', 'Forms copy-manifest command must expose command-specific disabled reasons'],
    ['data-action="forms.create.blank"', 'Forms blank-create actions must expose a stable data-action'],
    ['data-action="forms.export.catalogCsv"', 'Forms CSV export must expose a stable data-action'],
    ['data-action="forms.refresh"', 'Forms refresh controls must expose a stable data-action'],
    ['data-action="forms.copy.handoffManifest"', 'Forms manifest copy action must expose a stable data-action'],
    ['data-action="forms.download.handoffJson"', 'Forms manifest download action must expose a stable data-action'],
    ['data-action-route={formsListUrl}', 'Forms handoff actions must expose their target route'],
    ['data-state={formsCatalogExportDisabledReason ? \'blocked\' : \'ready\'}', 'Forms catalog export must mirror ready/blocked state in data-state'],
    ['data-disabled-reason={formsCatalogExportDisabledReason || undefined}', 'Forms catalog export must expose disabled reasons'],
    ['data-action="forms.copy.accountRegistrationHandoff"', 'Forms account handoff copy must expose a stable data-action'],
    ['data-action="forms.open.registrationPageTemplate"', 'Forms registration page action must expose a stable route action'],
  ]) {
    assert(source.includes(snippet), message);
  }
  assert(source.includes('persistenceCertification'), 'Forms handoff manifest must expose persistence certification metadata');
  assert(source.includes('scenarioEvidence'), 'Forms persistence handoff must expose scenario-level database evidence metadata');
  assert(
    source.includes('data-testid="forms-persistence-certification-download-button"') &&
      source.includes('data-testid="forms-persistence-certification-copy-button"') &&
      source.includes('data-testid="forms-persistence-certification-command-copy-button"') &&
      source.includes('formPersistenceCertificationText') &&
      source.includes('-backy-forms-persistence-certification.json') &&
      source.includes('Forms persistence certification handoff downloaded.'),
    'Forms page must expose a focused persistence certification JSON export',
  );
  assert(
    source.includes('data-testid="forms-persistence-scenario-evidence"') &&
      source.includes("schemaVersion: 'backy.forms-persistence-scenario-evidence.v1'") &&
      source.includes('Form definition CRUD') &&
      source.includes('Public submission intake') &&
      source.includes('Moderation review') &&
      source.includes('Contact share') &&
      source.includes('Collection routing') &&
      source.includes('Delivery and audit events') &&
      source.includes('Consent and spam settings') &&
      source.includes('Custom frontend contract'),
    'Forms page must render non-secret scenario evidence for the database persistence gate',
  );
  assert(source.includes('data-testid="forms-template-pack-download-button"'), 'Forms templates panel must expose template-pack download action');
  assert(source.includes("schemaVersion: 'backy.form-template-pack.v1'"), 'Forms template export must advertise backy.form-template-pack.v1');
  assert(source.includes('templateExport'), 'Forms handoff manifest must summarize template export metadata');
  assert(source.includes('-backy-form-template-pack.json'), 'Forms template export must download a named JSON template pack');
  assert(source.includes('data-testid="forms-launch-readiness"'), 'Forms selected-form workspace must render the launch readiness handoff');
  assert(
    source.includes("schemaVersion: 'backy.form-launch-readiness.v1'") &&
      source.includes("schemaVersion: 'backy.form-launch-action-plan.v1'") &&
      source.includes('selectedFormLaunchReadinessText') &&
      source.includes('selectedFormLaunchReadiness') &&
      source.includes('buildFormLaunchReadinessHandoff') &&
      source.includes('data-testid="forms-launch-readiness-copy-button"') &&
      source.includes('data-testid="forms-launch-readiness-action-plan"') &&
      source.includes("selectedFormLaunchReadinessText, 'Form launch readiness handoff'") &&
      source.includes('includesSubmissionValues: false') &&
      source.includes('customerSafeFieldsOnly'),
    'Forms page must expose a copyable selected-form launch readiness manifest',
  );
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Forms route must use the shared EmptyState component');
  assert(source.includes('data-testid="forms-error-state"') && source.includes('Forms workspace needs attention'), 'Forms route must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading forms"') && source.includes('Clear form filters'), 'Forms backend error state must expose retry and filter recovery actions');
  assert(
    source.includes('const canUseFormsRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseFormsRoleDefaults;') &&
      source.includes('const isFormsPermissionAllowed = (key: FormsPermissionKey) => (') &&
      source.includes("const canViewForms = isFormsPermissionAllowed('forms.view');") &&
      source.includes("const canCreateForms = isFormsPermissionAllowed('forms.create');") &&
      source.includes("const canEditForms = isFormsPermissionAllowed('forms.edit');") &&
      source.includes("const canManageForms = isFormsPermissionAllowed('forms.manage');") &&
      source.includes("const canExportForms = isFormsPermissionAllowed('forms.export');") &&
      source.includes("const canDeleteForms = isFormsPermissionAllowed('forms.delete');") &&
      source.includes("const canViewCollections = isFormsPermissionAllowed('collections.view');") &&
      source.includes("const canExportActivity = isFormsPermissionAllowed('activity.export');") &&
      source.includes('const isFormsBusy = isLoading || Boolean(isUpdatingId) || Boolean(isRetryingDeliveryId) || isApplyingConsentRetention || Boolean(isCreatingTemplateId) || isCloningForm || isCreatingEmbedBlock || isSavingForm || Boolean(isDeletingFormId);') &&
      !source.includes('const canViewForms = !isPermissionMatrixPending') &&
      !source.includes('const isFormsBusy = isLoading || Boolean(isUpdatingId) || Boolean(isRetryingDeliveryId) || isApplyingConsentRetention || Boolean(isCreatingTemplateId) || isCloningForm || isCreatingEmbedBlock || isSavingForm || Boolean(isDeletingFormId) || isPermissionMatrixPending;') &&
      source.includes('data-testid="forms-permission-state"') &&
      source.includes('Form permissions could not be verified'),
    'Forms route must expose a labelled permission error state and keep role-default workflows usable while permission details hydrate',
  );
  assert(source.includes('to="/users"') && source.includes('Review users'), 'Forms permission error state must link to user access management');
  assert(!source.includes('Users/Auth roadmap'), 'Forms route must not send registration/account work to stale Users/Auth roadmap copy');
  assert(!source.includes('Authenticated member accounts remain a separate Users/Auth milestone'), 'Forms route must not render stale member-account milestone copy');
  assert(!source.includes('remainingAccountMilestone'), 'Forms handoff must use a provider gate instead of a stale remaining-account milestone');
  assert(
    source.includes("const FORM_ACCOUNT_REGISTRATION_HANDOFF_SCHEMA_VERSION = 'backy.form-account-registration-handoff.v1'") &&
      source.includes('FORM_ACCOUNT_REGISTRATION_BINDINGS') &&
      source.includes('FORM_ACCOUNT_REGISTRATION_ACTIONS') &&
      source.includes('frontendHandoff: formsAccountRegistrationHandoff') &&
      source.includes('formsAccountRegistrationHandoffText') &&
      source.includes('data-testid="forms-account-registration-handoff-details"') &&
      source.includes('data-testid="forms-account-registration-handoff"') &&
      source.includes('data-testid="forms-account-registration-handoff-copy-button"') &&
      source.includes('Users/Auth provider handoff') &&
      source.includes('raw submission values') &&
      source.includes('auth provider secrets'),
    'Forms route must expose a copyable account-registration custom frontend handoff with provider and privacy boundaries',
  );
  assert(source.includes('data-testid="forms-rbac-permission-state"') && source.includes('aria-label="Retry loading form permissions"'), 'Forms permission banner must expose a retry action');
  assert(source.includes('title="No form audit events yet"'), 'Forms audit panel must keep the empty activity title visible');
  assert(source.includes('Form edits, submission review, consent retention, and embed-block changes will appear here.'), 'Forms audit empty state must explain which actions populate activity');
  assert(source.includes('title="No delivery events yet"'), 'Forms delivery panel must keep the empty delivery title visible');
  assert(source.includes('Webhook and email delivery attempts, retries, and provider responses for this form will appear here.'), 'Forms delivery empty state must explain which events populate delivery history');
  assert(
    source.includes('data-testid="forms-delivery-handoff-copy-button"') &&
      source.includes("schemaVersion: 'backy.form-delivery-handoff.v1'") &&
      source.includes('selectedFormDeliveryHandoffText') &&
      source.includes('selectedFormDeliveryHandoff') &&
      source.includes('buildFormDeliveryHandoff') &&
      source.includes("selectedFormDeliveryHandoffText, 'Form delivery handoff'") &&
      source.includes('delivery.providerResponse') &&
      source.includes('includesSubmissionValues: false') &&
      source.includes('includesProviderResponses: false'),
    'Forms delivery panel must expose a copyable selected-form delivery handoff without private delivery payloads',
  );
  assert(source.includes('title="No form analytics yet"'), 'Forms analytics panel must keep the no-analytics empty-state title visible');
  assert(source.includes('Submission, moderation, and collection-routing metrics appear after forms receive traffic.'), 'Forms analytics empty state must explain what will populate metrics');
  assert(source.includes('title="No lead segments yet"'), 'Forms lead analytics panel must keep the no-segments empty-state title visible');
  assert(source.includes('title="No saved lead lists yet"'), 'Forms saved lead lists panel must keep the no-lists empty-state title visible');
  assert(
    source.includes("const formsCreateActionStatusId = 'forms-create-action-status';") &&
      source.includes('formsCreateDisabledReason') &&
      source.includes("const formsCreateActionStatus = formCreateActionStatus('New blank form');") &&
      source.includes('data-testid="forms-create-action-status"') &&
      source.includes('data-action-status={formsCreateActionStatus}') &&
      source.includes('data-action-state={formsCreateDisabledReason ?') &&
      source.includes('data-disabled-reason={formsCreateDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId}') &&
      source.includes('aria-describedby={formsCreateActionStatusId}') &&
      source.includes('createFrontendTemplateActionStatus') &&
      source.includes('createTemplateActionStatus'),
    'Forms primary create actions must expose a shared action-status contract with ready/blocked state and target-site metadata.',
  );
  {
    const quickCreateEffectStart = source.indexOf("if (routeSearch.quickCreate !== 'blank')");
    const quickCreateEffectEnd = source.indexOf('}, [activeSiteId, isFormsBusy, isPermissionMatrixPending, routeSearch.quickCreate]);', quickCreateEffectStart);
    const quickCreateEffectBlock = quickCreateEffectStart >= 0
      ? source.slice(quickCreateEffectStart, quickCreateEffectEnd >= 0 ? quickCreateEffectEnd : quickCreateEffectStart + 2200)
      : '';
    assert(
      quickCreateEffectBlock.includes('void createBlankStandaloneForm();') &&
        quickCreateEffectBlock.includes('setSelectedFormId(null);') &&
        quickCreateEffectBlock.includes('setFormDraft(null);') &&
        !quickCreateEffectBlock.includes('New blank form creation is ready') &&
        !quickCreateEffectBlock.includes("document.querySelector<HTMLButtonElement>('[data-testid=\"forms-create-blank-button\"]')?.focus()"),
      'Forms sidebar quick-create blank route must create the standalone form immediately instead of preparing a second click.',
    );
  }
  assert(source.includes('title="No forms match this library view"'), 'Forms library filter empty state must keep the shared title visible');
  assert(source.includes('Change the search, source, state, destination, or readiness filters to broaden the form library.'), 'Forms library filter empty state must explain filter recovery');
  assert(source.includes('title="No consent fields detected"'), 'Forms consent export panel must keep the no-consent-fields empty-state title visible');
  assert(source.includes('title="No submissions match this view"'), 'Forms submission inbox filter empty state must keep the shared title visible');
  assert(source.includes('Change the submission search or status filter to review more entries for this form.'), 'Forms submission filter empty state must explain filter recovery');
  assert(
      source.includes('const selectedSubmissionSet = useMemo') &&
      source.includes("const formsSubmissionBulkActionStatusId = 'forms-submission-bulk-action-status';") &&
      source.includes('const hiddenSelectedSubmissionCount = Math.max') &&
      source.includes('const formsSubmissionBulkStatusDisabledReason = (status: FormSubmissionStatus)') &&
      source.includes('toggleVisibleSubmissionSelection') &&
      source.includes('handleBulkSubmissionStatus') &&
      source.includes('data-testid="forms-submission-bulk-toolbar"') &&
      source.includes('data-testid="forms-submission-bulk-selection-summary"') &&
      source.includes('data-testid="forms-submission-bulk-action-status"') &&
      source.includes('data-testid="forms-submission-bulk-select-visible"') &&
      source.includes('data-testid="forms-submission-bulk-clear-selection"') &&
      source.includes('data-testid="forms-submission-bulk-approve"') &&
      source.includes('data-action-status={formsSubmissionBulkActionStatus}') &&
      source.includes('data-action-state={formsSubmissionBulkActionState}') &&
      source.includes('data-disabled-reason={formsSubmissionBulkStatusDisabledReason') &&
      source.includes('outside this view'),
    'Forms submission inbox must expose selected-submission bulk moderation with visible/outside-view summaries, shared action status, and ready/blocked reasons',
  );
  assert(source.includes('cloneForm,') && source.includes('handleCloneSelectedForm') && source.includes('data-testid="form-clone-button"'), 'Forms page must expose a selected-form clone action');
  assert(source.includes('setIsCloningForm(true)') && source.includes("isActive: false") && source.includes('cloned as an inactive form.'), 'Forms clone action must create inactive clones with busy and notice states');
  assert(
    source.includes('const selectedFormActionStatusId = selectedForm') &&
      source.includes('data-testid="forms-selected-action-group"') &&
      source.includes('data-testid="forms-selected-action-status"') &&
      source.includes('data-action-status={selectedFormActionStatus}') &&
      source.includes('aria-label={`Actions for ${selectedForm.title || selectedForm.name}`}') &&
      source.includes('aria-describedby={selectedFormActionStatusId}') &&
      source.includes('Open source page available.') &&
      source.includes('Open source blog post available.') &&
      source.includes('Clone available.') &&
      source.includes('Delete available.') &&
      source.includes('data-testid="form-page-link"') &&
      source.includes('data-testid="form-blog-link"') &&
      source.includes('data-action-state={selectedFormCloneDisabledReason ?') &&
      source.includes('data-action-state={selectedFormDeleteDisabledReason ?') &&
      source.includes('data-disabled-reason={selectedFormCloneDisabledReason || undefined}') &&
      source.includes('data-disabled-reason={selectedFormDeleteDisabledReason || undefined}'),
    'Forms selected-form actions must expose a named action-status group with ready/blocked state metadata.',
  );
  assert(
    source.includes('const handleDeleteDialogKeydown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isDeletingFormId) return;") &&
      source.includes("window.addEventListener('keydown', handleDeleteDialogKeydown)") &&
      source.includes('role="dialog"') &&
      source.includes('aria-modal="true"') &&
      source.includes('aria-labelledby="form-delete-confirm-title"') &&
      source.includes('aria-describedby="form-delete-confirm-description form-delete-confirm-impact"') &&
      source.includes('id="form-delete-confirm-title"') &&
      source.includes('id="form-delete-confirm-description"') &&
      source.includes('id="form-delete-confirm-impact"') &&
      source.includes('data-testid="form-delete-cancel-button"') &&
      source.includes('aria-label={`Cancel deleting ${pendingDeleteForm.title || pendingDeleteForm.name}`}'),
    'Forms delete confirmation must expose accessible dialog semantics, labelled impact copy, a cancel hook, and Escape recovery.',
  );
  assert(
    reviewRouteSource.includes("import { PATCH } from '../route'") &&
      reviewRouteSource.includes('export async function POST') &&
      reviewRouteSource.includes('requireAdminAccess') &&
      reviewRouteSource.includes("permission: 'forms.manage'"),
    'Forms review POST route must explicitly require forms.manage before delegating to the audited submission review implementation',
  );
  assert(
    source.includes('duplicateFormDraftField') &&
      source.includes('getUniqueFormDraftFieldKey') &&
      source.includes('data-testid="form-field-duplicate-button"') &&
      source.includes("label: `${field.label || 'Field'} copy`") &&
      source.includes('validation: field.validation ? field.validation.map((rule) => ({ ...rule })) : undefined'),
    'Forms builder must expose duplicate field controls that preserve field configuration with a unique key',
  );
  assert(
    source.includes('const formBuilderActionStatusId = selectedForm') &&
      source.includes('data-testid="form-builder-action-status"') &&
      source.includes('data-action="forms.builder.reset"') &&
      source.includes('data-action="forms.builder.save"') &&
      source.includes('data-action="forms.builder.edit"') &&
      source.includes('data-action="forms.builder.toggleActive"') &&
      source.includes('data-action="forms.builder.toggleHoneypot"') &&
      source.includes('data-action="forms.builder.toggleCaptcha"') &&
      source.includes('data-action="forms.builder.toggleContactShare"') &&
      source.includes('data-action="forms.builder.toggleCollectionWrite"') &&
      source.includes('data-action="forms.builder.addField"') &&
      source.includes('data-action="forms.builder.duplicateField"') &&
      source.includes('data-action="forms.builder.moveFieldUp"') &&
      source.includes('data-action="forms.builder.moveFieldDown"') &&
      source.includes('data-action="forms.builder.removeField"') &&
      source.includes('data-target-form-id={selectedForm.id}') &&
      source.includes('data-disabled-reason={formBuilderSaveDisabledReason || undefined}'),
    'Forms builder controls must expose action contracts, target form ids, ready/blocked state, and disabled reasons.',
  );
  assert(
    source.includes('form-field-duplicate-button') &&
      source.includes('validation: field.validation ? field.validation.map((rule) => ({ ...rule })) : undefined') &&
      smokeSource.includes('duplicateCompanyFieldThroughUi') &&
      smokeSource.includes('company_copy'),
    'Forms rendered smoke must click duplicate field and verify copied validation persists with a unique key',
  );
  assert(
    source.includes('buildFormDraftFieldPreset') &&
      source.includes('data-testid="form-new-field-type-select"') &&
      source.includes('const FORM_FIELD_TYPE_LABELS') &&
      source.includes("return baseField('email', 'Email', { required: true") &&
      source.includes("return baseField('attachment', 'Attachment'"),
    'Forms builder must expose typed add-field presets for common form controls',
  );
  assert(
    source.includes('remapFormContactShareFieldKey') &&
      source.includes('remapFormCollectionTargetFieldKey') &&
      source.includes('fieldKeyChanged') &&
      source.includes('nameField: remapFieldKeyReference') &&
      source.includes('slugField: remapFieldKeyReference') &&
      source.includes('fieldMap[nextKey] = fieldMap[oldKey]'),
    'Forms builder must preserve contact-share and collection-write mappings when a form field key is renamed',
  );
  assert(
    source.includes('removeFormContactShareFieldKey') &&
      source.includes('removeFormCollectionTargetFieldKey') &&
      source.includes('clearFieldKeyReference') &&
      source.includes('const removedKey = normalizeFieldKey(removedField.key)') &&
      source.includes('delete fieldMap[removedKey]') &&
      source.includes('slugField: clearFieldKeyReference(collectionTarget.slugField, removedKey)'),
    'Forms builder must clear contact-share and collection-write mappings when a mapped field is removed',
  );
  assert(
    source.includes('normalizeFormCollectionTarget') &&
      source.includes('normalizeFormCollectionFieldMap') &&
      source.includes('normalizedCollectionFieldKey') &&
      source.includes('delete fieldMap[field.key]') &&
      source.includes('const collectionTarget = normalizeFormCollectionTarget(form.collectionTarget, form.fields)') &&
      source.includes('return normalizeFormCollectionFieldMap(fieldMap, form.fields)'),
    'Forms builder must persist only current non-empty collection write mappings',
  );
  assert(
    source.includes('patchFormDraftFieldType') &&
      source.includes('applyFormFieldTypeDefaults') &&
      source.includes('formFieldTypeRequiresOptions') &&
      source.includes("type === 'select' || type === 'radio'") &&
      source.includes("['Option one', 'Option two']") &&
      source.includes('validationTypesForFieldType') &&
      source.includes("if (type === 'number') return ['min', 'max'];"),
    'Forms builder must normalize options and compatible validation when a field type changes',
  );
  assert(
    source.includes('getFormFieldValidationRuleDefinitions') &&
      source.includes('fieldValidationRuleDefinitions.map') &&
      source.includes('data-testid="form-field-validation-unavailable"') &&
      source.includes('const allowedValidationTypes = new Set(validationTypesForFieldType(normalizeFormFieldType(field.type)))') &&
      source.includes('if (!allowedValidationTypes.has(ruleType))') &&
      source.includes('normalizeValidationRules({ ...field, type: fieldType })') &&
      source.includes('formValidationRuleHasValue') &&
      source.includes('const validation = hasValue') &&
      source.includes('disabled={!ruleHasValue}'),
    'Forms builder must only expose and persist validation rules compatible with each field type',
  );
  assert(
    source.includes('const [formDraftSubmitted, setFormDraftSubmitted] = useState(false);') &&
      source.includes('buildFormDraftInlineErrors(formDraft, collections)') &&
      source.includes("setError('Fix form builder fields before saving.');") &&
      source.includes('data-testid="form-builder-save-button"') &&
      source.includes('testId="form-builder-name-error"') &&
      source.includes('testId="form-builder-notification-email-error"') &&
      source.includes('testId="form-builder-notification-webhook-error"') &&
      source.includes('testId="form-builder-success-redirect-error"') &&
      source.includes('testId="form-builder-consent-request-email-error"') &&
      source.includes('testId="form-builder-collection-target-error"') &&
      source.includes('data-testid={`form-builder-field-${fieldIndex}-key-input`}') &&
      source.includes('testId={`${fieldKeyErrorKey}-error`}') &&
      source.includes('testId={`${fieldLabelErrorKey}-error`}') &&
      source.includes('testId={`${fieldOptionsErrorKey}-error`}') &&
      source.includes('testId={`${fieldDefaultErrorKey}-error`}') &&
      source.includes('testId={`${fieldValidationErrorKey}-error`}') &&
      source.includes('Map required collection fields:') &&
      source.includes('Default value must match this field type and options.'),
    'Forms builder must use source-guarded inline validation before saving standalone form API definitions',
  );
  assert(
    source.includes('patchFormDraftContactShare') &&
      source.includes('data-testid="form-contact-share-panel"') &&
      source.includes('data-testid={`form-contact-share-${key}`}') &&
      source.includes('data-testid="form-contact-share-dedupe-toggle"') &&
      source.includes('Map an email or phone field before relying on contact creation.') &&
      source.includes('Dedupe contacts by email'),
    'Forms builder must expose explicit contact-share mapping controls',
  );
  assert(
    source.includes('normalizeFormContactShare') &&
      source.includes('normalizeContactShareFieldReference') &&
      source.includes('const contactShare = normalizeFormContactShare(form.contactShare, form.fields)') &&
      source.includes('contactShare: contactShare?.enabled ? contactShare : { enabled: false }') &&
      source.includes('checked={Boolean(formDraft.contactShare.emailField) && formDraft.contactShare.dedupeByEmail !== false}'),
    'Forms builder must persist only current contact-share field references and keep email dedupe tied to an email mapping',
  );
  assert(
    source.includes('buildSampleContactShareOverride') &&
      source.includes('const contactShareOverride = buildSampleContactShareOverride(form)') &&
      source.includes('const contactShareOverride = buildSampleContactShareOverride({ ...template, contactShare })') &&
      source.includes('const hasIdentityMapping = Boolean(contactShare?.nameField || contactShare?.emailField || contactShare?.phoneField)') &&
      source.includes('dedupeByEmail: contactShare.dedupeByEmail'),
    'Forms handoff sample payloads must use normalized contact-share overrides with usable identity mappings',
  );
  assert(
    source.includes('contactShareDedupeByEmail: contactShare?.dedupeByEmail') &&
      source.includes('fields: template.fields') &&
      source.includes('collectionWriteEnabled: Boolean(collectionTarget?.enabled)') &&
      source.includes('collectionWriteCollectionId: collectionTarget?.collectionId') &&
      source.includes('collectionWriteFieldMap: collectionTarget?.fieldMap') &&
      embedBlockRouteSource.includes('fields: cloneJson(form.fields) as unknown as BackyJsonValue') &&
      embedBlockRouteSource.includes('contactShareEnabled: Boolean(contactShare?.enabled)') &&
      embedBlockRouteSource.includes('contactShareDedupeByEmail:') &&
      embedBlockRouteSource.includes('collectionWriteEnabled: Boolean(collectionTarget?.enabled)') &&
      embedBlockRouteSource.includes('collectionWriteCollectionId: collectionTarget?.collectionId || ""') &&
      embedBlockRouteSource.includes('collectionWriteFieldMap: collectionTarget?.fieldMap') &&
      embedBlockRouteSource.includes('formAudience: form.audience') &&
      embedBlockRouteSource.includes('formActive: form.isActive !== false') &&
      embedBlockRouteSource.includes('notificationEmail: form.notificationEmail || ""') &&
      embedBlockRouteSource.includes('notificationWebhook: form.notificationWebhook || ""') &&
      embedBlockRouteSource.includes('enableHoneypot: form.enableHoneypot !== false') &&
      embedBlockRouteSource.includes('enableCaptcha: form.enableCaptcha === true') &&
      embedBlockRouteSource.includes('fields: cloneJson(form.fields) as unknown as BackyJsonValue') &&
      embedBlockRouteSource.includes('notificationEmail: form.notificationEmail || null') &&
      embedBlockRouteSource.includes('normalizeEmbedContactShare') &&
      embedBlockRouteSource.includes('normalizeEmbedCollectionTarget') &&
      embedBlockRouteSource.includes('normalizeEmbedCollectionFieldMap') &&
      embedBlockRouteSource.includes('const contactShare = normalizeEmbedContactShare(form)') &&
      embedBlockRouteSource.includes('const collectionTarget = normalizeEmbedCollectionTarget(form)') &&
      embedBlockRouteSource.includes('contactShare: contactShare?.enabled') &&
      embedBlockRouteSource.includes('collectionTarget: collectionTarget?.enabled'),
    'Forms template and embed-block handoffs must emit flattened canvas props for contact and collection routing',
  );
  assert(
    publicStoreSource.includes('normalizeCanvasContactShare') &&
      publicStoreSource.includes('normalizeCanvasCollectionTarget') &&
      publicStoreSource.includes('normalizeCanvasCollectionFieldMap') &&
      publicStoreSource.includes('const rawContactShare: FormDefinition["contactShare"]') &&
      publicStoreSource.includes('const rawCollectionTarget: FormDefinition["collectionTarget"]') &&
      publicStoreSource.includes('contactShare: normalizeCanvasContactShare(rawContactShare, fields)') &&
      publicStoreSource.includes('collectionTarget: normalizeCanvasCollectionTarget(rawCollectionTarget, fields)'),
    'Canvas-derived forms must normalize contact-share and collection-write routing against collected form fields',
  );
  assert(
    publicStoreSource.includes('normalizeCanvasFormField') &&
      publicStoreSource.includes('normalizeCanvasFormFieldDefaultValue') &&
      publicStoreSource.includes('normalizeCanvasFormFieldValidation') &&
      publicStoreSource.includes('canvasValidationTypesForFieldType') &&
      publicStoreSource.includes('return normalizeCanvasFormField({') &&
      publicStoreSource.includes('validation: buildDynamicValidationRules(fieldType, node.props)') &&
      publicStoreSource.includes('const validation = normalizeFormSchemaValidation(') &&
      publicStoreSource.includes('options: normalizeCanvasFormFieldOptions(type, record.options)') &&
      publicStoreSource.includes('canvasFormSchemaValidationRequiresField(record.validation)'),
    'Canvas-derived forms must normalize field options, defaults, and type-compatible validation before becoming backend definitions',
  );
  assert(
    source.includes('data-testid="form-field-default-value-input"') &&
      source.includes('onChange={(event) => patchFormDraftField(fieldIndex, { defaultValue: event.target.value })}') &&
      source.includes('placeholder={field.options?.[0] || field.placeholder ||') &&
      source.includes('defaultValue: field.defaultValue'),
    'Forms builder must expose default-value editing for field definitions',
  );
  assert(
    source.includes('patchFormDraftFieldOptions') &&
      source.includes('applyFormFieldOptionDefaults') &&
      source.includes('normalizeFormFieldDefaultValue') &&
      source.includes('defaultValue: normalizeFormFieldDefaultValue(field.defaultValue, type, options)') &&
      source.includes('field.type === \'select\' || field.type === \'radio\'') &&
      source.includes('<option value="">No default</option>') &&
      source.includes('onChange={(event) => patchFormDraftFieldOptions(fieldIndex, parseOptionsText(event.target.value))}'),
    'Forms builder must keep field defaults compatible with type and option changes',
  );
  assert(
    source.includes('frontendTemplateValidationRequiresField') &&
      source.includes('frontendTemplateValidationRequiresField(record.validation)') &&
      source.includes('getUniqueFrontendTemplateFieldKey') &&
      source.includes('FrontendTemplateFieldsImport') &&
      source.includes('addFrontendTemplateFieldKeyAlias') &&
      source.includes('fieldKeyAliases.set(alias, normalizedKey)') &&
      source.includes('frontendTemplateFieldAliasesFromFields') &&
      source.includes('frontendTemplateFieldKeyMapFromAliases') &&
      source.includes('frontendFieldKeyMap?: Record<string, string>') &&
      source.includes('frontendFieldKeyMap: frontendTemplateFieldKeyMapFromAliases(fieldKeyAliases)') &&
      source.includes('frontendFieldKeyMap: template.frontendFieldKeyMap') &&
      source.includes('buildFrontendFormTemplateSettings(template, frontendDesign, blueprint.frontendFieldKeyMap)') &&
      source.includes('frontendFieldKeyMap?: Record<string, string>,') &&
      source.includes('...(frontendFieldKeyMap ? { frontendFieldKeyMap } : {})') &&
      source.includes('const customJs = firstFrontendTemplateString(content.customJS, content.customJs, metadata.customJS, metadata.customJs);') &&
      source.includes('const contentDocument = firstFrontendTemplateRecord(content.contentDocument, metadata.contentDocument);') &&
      source.includes('const themeTokenRefs = firstFrontendTemplateRecord(content.themeTokenRefs, metadata.themeTokenRefs);') &&
      source.includes('const assets = firstFrontendTemplateArrayOrRecord(content.assets, metadata.assets);') &&
      source.includes('const animations = firstFrontendTemplateArrayOrRecord(content.animations, metadata.animations);') &&
      source.includes('const interactions = firstFrontendTemplateArrayOrRecord(content.interactions, metadata.interactions);') &&
      source.includes('const dataBindings = firstFrontendTemplateRecord(content.dataBindings, metadata.dataBindings);') &&
      source.includes('const editableMap = firstFrontendTemplateRecord(content.editableMap, metadata.editableMap);') &&
      source.includes('frontendDesignCustomJs: customJs') &&
      source.includes('frontendDesignContentDocument: contentDocument') &&
      source.includes('frontendDesignThemeTokenRefs: themeTokenRefs') &&
      source.includes('frontendDesignAssets: assets') &&
      source.includes('frontendDesignAnimations: animations') &&
      source.includes('frontendDesignInteractions: interactions') &&
      source.includes('frontendDesignDataBindings: dataBindings') &&
      source.includes('frontendDesignEditableMap: editableMap') &&
      source.includes('frontendDesignSeo: seo') &&
      source.includes('frontendDesignMetadata: designMetadata') &&
      source.includes('addFrontendTemplateFieldKeyAlias(fieldKeyAliases, field.label, field.key)') &&
      source.includes('return fieldKeyAliases.get(trimmed) || fieldKeyAliases.get(normalizeFieldKey(trimmed))') &&
      source.includes('const fieldKeyAliases = fields.length > 0') &&
      source.includes('usedKeys.add(candidate)') &&
      source.includes('const usedKeys = new Set<string>()') &&
      source.includes('const fieldKeyAliases = new Map<string, string>()') &&
      source.includes('normalizeFrontendTemplateField(field, index, usedKeys, fieldKeyAliases)') &&
      source.includes('remapFrontendTemplateFieldReference') &&
      source.includes('remapFrontendTemplateFieldMap') &&
      source.includes('fieldMap: remapFrontendTemplateFieldMap(configured.fieldMap, fieldKeyAliases)') &&
      source.includes('const validation = normalizeValidationRules({') &&
      source.includes("validation: Array.isArray(record.validation)") &&
      source.includes("const ruleRecord = isPlainRecord(rule) ? rule : null") &&
      source.includes("const definition = FORM_VALIDATION_RULES.find((candidate) => candidate.type === type)") &&
      source.includes("definition.valueMode === 'number'") &&
      source.includes('const contactShare = normalizeFormContactShare(') &&
      source.includes('return normalizeFormCollectionTarget({') &&
      source.includes('inferFrontendTemplateCollectionTarget(normalizedFields, fieldKeyAliases, content)') &&
      source.includes('contactShare: contactShare?.enabled ? contactShare : undefined') &&
      source.includes('collectionTarget: collectionTarget?.enabled ? collectionTarget : undefined'),
    'Frontend design form templates must normalize imported field validation and routing before creating backend forms',
  );
  assert(
    frontendDesignContractSource.includes('frontendFormFieldKeyMapFromMetadata') &&
      frontendDesignContractSource.includes('fieldKeyMap: stringRecord(metadata.frontendFieldKeyMap)') &&
      publicFormDefinitionRouteSource.includes('frontendFormFieldKeyMapFromMetadata') &&
      publicFormDefinitionRouteSource.includes('frontendFieldKeyMap: frontendFormFieldKeyMapFromMetadata(form.settings)') &&
      publicFormDetailRouteSource.includes('frontendFormFieldKeyMapFromMetadata') &&
      publicFormDetailRouteSource.includes('frontendFieldKeyMap: frontendFormFieldKeyMapFromMetadata(form.settings)') &&
      publicManifestRouteSource.includes('frontendFormFieldKeyMapFromMetadata') &&
      publicManifestRouteSource.includes('frontendFieldKeyMap: frontendFormFieldKeyMapFromMetadata(form.settings)') &&
      publicOpenApiRouteSource.includes('frontendFieldKeyMap:') &&
      publicOpenApiRouteSource.includes('fieldKeyMap:'),
    'Public form definition, detail, manifest, and OpenAPI contracts must expose frontend field key maps for custom frontend bindings',
  );
  assert(
    publicFormSubmissionsRouteSource.includes('normalizeFrontendSubmissionValueKeys') &&
      publicFormSubmissionsRouteSource.includes('normalizeFrontendSubmissionAliasKey') &&
      publicFormSubmissionsRouteSource.includes('normalizeContactShareOverride') &&
      publicFormSubmissionsRouteSource.includes('normalizeFrontendSubmissionFieldReference') &&
      publicFormSubmissionsRouteSource.includes('frontendFormFieldKeyMapFromMetadata(form.settings)') &&
      publicFormSubmissionsRouteSource.includes('frontendFieldKeyMap[normalizeFrontendSubmissionAliasKey(rawKey)]') &&
      publicFormSubmissionsRouteSource.includes('contactShareOverride = normalizeContactShareOverride(form, parsed.contactShareOverride)') &&
      publicFormSubmissionsRouteSource.includes('contact = await buildRepositoryContactShare(repositories, form, submissionValues, submission, contactShareOverride)') &&
      publicFormSubmissionsRouteSource.includes('}, contactShareOverride)') &&
      publicFormSubmissionsRouteSource.includes('const frontendNormalizedValues = normalizeFrontendSubmissionValueKeys(form, parsed.values)') &&
      publicFormSubmissionsRouteSource.includes('const submissionValues = normalizeFormSubmissionValues(form, frontendNormalizedValues)') &&
      publicOpenApiRouteSource.includes('canonical field keys or frontendFieldKeyMap aliases') &&
      publicOpenApiRouteSource.includes('alias lookup also normalizes casing, spaces, hyphens, and punctuation') &&
      publicOpenApiRouteSource.includes('Optional contact-share mapping override') &&
      publicOpenApiRouteSource.includes('Accepts canonical field keys or normalized frontendFieldKeyMap aliases.'),
    'Public form submissions must accept frontend field key map aliases before validation and storage',
  );
  assert(adminContentApiSource.includes('export async function cloneForm') && adminContentApiSource.includes('/forms/${formId}/clone'), 'Admin content API must expose the form clone endpoint helper');
  for (const label of [
    'backy.forms-persistence-certification.v1',
    'npm run test:forms --workspace @backy-cms/admin',
    'npm run test:repositories --workspace @backy/db',
    'npm run test:forms-postgres --workspace @backy/db',
    'npm run ci:forms-postgres',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
    'npm run test:forms-postgres-preflight-contract',
    'npm run test:forms-postgres-disposable-guard',
    '.github/workflows/forms-postgres-contract.yml',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    'disposable migrated Supabase/Postgres database',
    'disposable_database_confirmed=true',
    'external-database-gate',
    'forms-persistence-certification-runbook',
    'forms-persistence-runtime-evidence',
    'forms-postgres-certification-command-builder',
    'forms-postgres-certification-env-copy-button',
    'forms-postgres-certification-env-template',
    'forms-postgres-certification-env-template-body',
    'forms-postgres-certification-command-builder-copy-button',
    'data-action="forms.copy.postgresEnvTemplate"',
    'data-action="forms.copy.postgresGuardedCommand"',
    'data-action="forms.configure.postgresDatabaseAlias"',
    'data-action="forms.configure.postgresExpectedHost"',
    'data-action="forms.configure.postgresExpectedDatabase"',
    'data-action="forms.toggle.postgresDisposableConfirmed"',
    'data-action="forms.toggle.postgresReleaseDoctor"',
    "data-state={formsPostgresCommandOptions.disposableConfirmed ? 'checked' : 'unchecked'}",
    "data-state={formsPostgresCommandOptions.includeReleaseDoctor ? 'checked' : 'unchecked'}",
    'forms-postgres-certification-database-alias-select',
    'forms-postgres-certification-expected-host-input',
    'forms-postgres-certification-expected-database-input',
    'forms-postgres-certification-disposable-toggle',
    'forms-postgres-certification-doctor-toggle',
    'forms-postgres-certification-required-inputs',
    'formsPostgresCertificationEnvTemplate',
    'buildFormsPostgresCertificationEnvTemplate',
    'operatorCommandTemplate',
    'operatorEnvTemplate',
    'backy.forms-postgres-certification-env-template.v1',
    'BACKY_RELEASE_CERTIFY_DATABASE',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'Copy CI command',
    'Copy env template',
    'Copy guarded command',
    'Env template',
    'Runtime evidence',
    'preflight contract output',
    'DB-backed Forms smoke output',
    'readyForCertification',
    'databaseUrlConfigured',
    'Database URLs and credentials are never returned',
    'scenarioEvidence',
    'backy.forms-persistence-scenario-evidence.v1',
    'form-definition-crud',
    'public-submission-intake',
    'custom-frontend-contract',
    'Forms persistence scenario evidence reports only names, counts, gates, and readiness states',
  ]) {
    assert(source.includes(label), `Forms persistence certification must name ${label}`);
  }
};

const assertFormsPersistenceCertificationResponse = (payload) => {
  const certification = payload.data?.persistenceCertification;
  const legacyCertification = payload.persistenceCertification;
  assert(certification, `Forms API response must include data.persistenceCertification: ${JSON.stringify(payload).slice(0, 700)}`);
  assert(legacyCertification, `Forms API response must include legacy persistenceCertification: ${JSON.stringify(payload).slice(0, 700)}`);
  assert(certification.schemaVersion === 'backy.forms-persistence-certification.v1', `Unexpected Forms persistence certification schema: ${JSON.stringify(certification)}`);
  assert(certification.status === 'external-database-gate', `Unexpected Forms persistence certification status: ${JSON.stringify(certification)}`);
  assert(certification.selectedSiteId === SITE_ID, `Forms persistence certification must identify the selected site: ${JSON.stringify(certification)}`);
  assert(certification.operatorGate === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres', `Forms persistence certification missing operator gate: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.preflightGates) && certification.preflightGates.includes('npm run test:forms-postgres-preflight-contract') && certification.preflightGates.includes('npm run test:forms-postgres-disposable-guard'), `Forms persistence certification missing preflight gates: ${JSON.stringify(certification)}`);
  assert(certification.databaseGate === 'npm run test:forms-postgres --workspace @backy/db', `Forms persistence certification missing database gate: ${JSON.stringify(certification)}`);
  assert(certification.ciGate === 'npm run ci:forms-postgres', `Forms persistence certification missing CI gate: ${JSON.stringify(certification)}`);
  assert(certification.workflow === '.github/workflows/forms-postgres-contract.yml', `Forms persistence certification missing workflow: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.requiredDatabaseEnv) && certification.requiredDatabaseEnv.includes('BACKY_DATABASE_URL') && certification.requiredDatabaseEnv.includes('DATABASE_URL'), `Forms persistence certification missing database env aliases: ${JSON.stringify(certification)}`);
  assert(certification.requiredConfirmationEnv === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true', `Forms persistence certification missing disposable confirmation env: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.targetGuards) && certification.targetGuards.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') && certification.targetGuards.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'), `Forms persistence certification missing target guards: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.requires) && certification.requires.includes('disposable migrated Supabase/Postgres database') && certification.requires.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') && certification.requires.includes('disposable_database_confirmed=true'), `Forms persistence certification missing disposable database requirements: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.evidenceExpectations) && certification.evidenceExpectations.includes('preflight contract output') && certification.evidenceExpectations.includes('DB-backed Forms smoke output'), `Forms persistence certification missing operator evidence expectations: ${JSON.stringify(certification)}`);
  assert(certification.operatorCommandTemplate, `Forms persistence certification missing operator command template: ${JSON.stringify(certification)}`);
  assert(typeof certification.operatorCommandTemplate.command === 'string' && certification.operatorCommandTemplate.command.includes('npm run ci:forms-postgres') && certification.operatorCommandTemplate.command.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED') && certification.operatorCommandTemplate.command.includes('BACKY_RELEASE_CERTIFY_DATABASE'), `Forms persistence certification missing operator command aliases: ${JSON.stringify(certification.operatorCommandTemplate)}`);
  assert(certification.operatorCommandTemplate.envTemplateSchemaVersion === 'backy.forms-postgres-certification-env-template.v1', `Forms persistence certification missing env template schema: ${JSON.stringify(certification.operatorCommandTemplate)}`);
  assert(typeof certification.operatorCommandTemplate.envTemplate === 'string' && certification.operatorCommandTemplate.envTemplate.includes('BACKY_DATABASE_URL=<disposable-postgres-url>') && certification.operatorCommandTemplate.envTemplate.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') && certification.operatorCommandTemplate.envTemplate.includes('BACKY_RELEASE_CERTIFY_DATABASE=1'), `Forms persistence certification missing operator env template aliases: ${JSON.stringify(certification.operatorCommandTemplate)}`);
  assert(Array.isArray(certification.operatorCommandTemplate.databaseUrlAliases) && certification.operatorCommandTemplate.databaseUrlAliases.includes('BACKY_DATABASE_URL') && certification.operatorCommandTemplate.databaseUrlAliases.includes('DATABASE_URL'), `Forms persistence certification missing database URL alias choices: ${JSON.stringify(certification.operatorCommandTemplate)}`);
  assert(Array.isArray(certification.operatorCommandTemplate.requiredInputs) && certification.operatorCommandTemplate.requiredInputs.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'), `Forms persistence certification missing operator required inputs: ${JSON.stringify(certification.operatorCommandTemplate)}`);
  assert(certification.operatorEnvTemplate, `Forms persistence certification missing operator env template handoff: ${JSON.stringify(certification)}`);
  assert(certification.operatorEnvTemplate.schemaVersion === 'backy.forms-postgres-certification-env-template.v1', `Unexpected Forms operator env template schema: ${JSON.stringify(certification.operatorEnvTemplate)}`);
  assert(certification.operatorEnvTemplate.format === 'shell-env' && certification.operatorEnvTemplate.fileName === '.env.backy-forms-postgres-certification', `Forms operator env template must expose shell-env filename: ${JSON.stringify(certification.operatorEnvTemplate)}`);
  assert(typeof certification.operatorEnvTemplate.body === 'string' && certification.operatorEnvTemplate.body.includes('# Backy Forms Postgres certification environment') && certification.operatorEnvTemplate.body.includes('BACKY_DATABASE_URL=<disposable-postgres-url>') && certification.operatorEnvTemplate.body.includes('BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1'), `Forms operator env template body missing guarded env entries: ${JSON.stringify(certification.operatorEnvTemplate)}`);
  assert(certification.runtime && typeof certification.runtime.databaseUrlConfigured === 'boolean' && Object.prototype.hasOwnProperty.call(certification.runtime, 'databaseUrlAlias'), `Forms persistence certification must expose non-secret database URL runtime state: ${JSON.stringify(certification)}`);
  assert(typeof certification.runtime.dataMode === 'string' && typeof certification.runtime.databaseType === 'string', `Forms persistence certification must expose non-secret runtime mode/type defaults: ${JSON.stringify(certification)}`);
  assert(typeof certification.runtime.disposableConfirmed === 'boolean' && typeof certification.runtime.readyForCertification === 'boolean', `Forms persistence certification must expose disposable confirmation readiness: ${JSON.stringify(certification)}`);
  assert(Array.isArray(certification.runtime.missing), `Forms persistence certification must expose missing runtime inputs: ${JSON.stringify(certification)}`);
  assert(typeof certification.runtime.secretHandling === 'string' && certification.runtime.secretHandling.includes('Database URLs and credentials are never returned'), `Forms runtime summary must describe non-secret handling: ${JSON.stringify(certification)}`);
  assert(certification.scenarioEvidence, `Forms persistence certification missing scenario evidence: ${JSON.stringify(certification)}`);
  assert(certification.scenarioEvidence.schemaVersion === 'backy.forms-persistence-scenario-evidence.v1', `Unexpected Forms scenario evidence schema: ${JSON.stringify(certification.scenarioEvidence)}`);
  assert(certification.scenarioEvidence.requiredGate === certification.operatorGate, `Forms scenario evidence gate must mirror operator gate: ${JSON.stringify(certification.scenarioEvidence)}`);
  assert(certification.scenarioEvidence.coverage && certification.scenarioEvidence.coverage.total === 8 && Array.isArray(certification.scenarioEvidence.coverage.missing), `Forms scenario evidence must expose coverage totals: ${JSON.stringify(certification.scenarioEvidence)}`);
  assert(Array.isArray(certification.scenarioEvidence.scenarios) && certification.scenarioEvidence.scenarios.length === 8, `Forms scenario evidence must enumerate all scenarios: ${JSON.stringify(certification.scenarioEvidence)}`);
  for (const scenarioKey of ['form-definition-crud', 'public-submission-intake', 'moderation-review', 'contact-share', 'collection-routing', 'delivery-audit', 'consent-spam-settings', 'custom-frontend-contract']) {
    assert(certification.scenarioEvidence.scenarios.some((scenario) => scenario.key === scenarioKey), `Forms scenario evidence missing ${scenarioKey}: ${JSON.stringify(certification.scenarioEvidence)}`);
  }
  assert(typeof certification.scenarioEvidence.secretHandling === 'string' && certification.scenarioEvidence.secretHandling.includes('database URLs, credentials, submission values, IP hashes, and contact payloads stay private'), `Forms scenario evidence must describe non-secret handling: ${JSON.stringify(certification.scenarioEvidence)}`);
  assert(typeof certification.secretHandling === 'string' && certification.secretHandling.includes('Database URLs stay in server/CI environment variables'), `Forms persistence certification must describe non-secret handling: ${JSON.stringify(certification)}`);
  assert(JSON.stringify(legacyCertification) === JSON.stringify(certification), `Legacy Forms persistence certification must mirror data.persistenceCertification: ${JSON.stringify({ certification, legacyCertification })}`);
};

const startWebhookReceiver = async ({ failFirstFormSubmission = false } = {}) => new Promise((resolve, reject) => {
  const deliveries = [];
  let failedFormSubmission = false;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      let payload = null;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        payload = body;
      }
      deliveries.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        payload,
      });
      const shouldFail = failFirstFormSubmission &&
        !failedFormSubmission &&
        payload &&
        typeof payload === 'object' &&
        payload.submissionId &&
        payload.formId &&
        payload.retry !== true &&
        !payload.kind;
      if (shouldFail) {
        failedFormSubmission = true;
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, retryable: true }));
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      reject(new Error('Unable to bind webhook receiver'));
      return;
    }

    resolve({
      url: `http://127.0.0.1:${address.port}/backy/forms`,
      deliveries,
      close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
    });
  });
});

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...((endpoint.startsWith('/api/admin/') || endpoint.includes('/events?')) && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const requestApiRaw = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...((endpoint.startsWith('/api/admin/') || endpoint.includes('/events?')) && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_FORMS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE
    || 'backy-dev-mfa';
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const assertFormsPermissionOverridesAreEnforced = async () => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({
      overrides: {
        'forms.create': 'deny',
      },
    }),
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/forms`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        name: `denied-form-${Date.now().toString(36)}`,
        title: 'Denied form smoke',
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied forms.create override should reject form creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied forms.create override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
  } finally {
    await requestApi('/api/admin/users/user-admin/permissions', {
      method: 'PATCH',
      body: JSON.stringify({
        overrides: {
          'forms.create': null,
        },
      }),
    });
  }
};

const getFrontendDesign = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'PATCH',
    body: JSON.stringify({ frontendDesign }),
  });
  const updated = payload.data?.frontendDesign;
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke forms frontend',
    url: 'https://example.com/smoke-forms-frontend',
    repository: 'example/backy-smoke-forms-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-form-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeFormsHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeFormsNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeFormsFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_FORM_TEMPLATE_ID,
      type: 'form',
      name: FRONTEND_FORM_TEMPLATE_NAME,
      routePattern: '/contact/smoke-intake',
      description: 'Frontend contract form template used by the forms smoke.',
      content: {
        customJS: 'window.__backySmokeFormTemplate = true;',
        contentDocument: {
          schemaVersion: 'backy.content.v1',
          kind: 'form',
          id: 'smoke-form-template-document',
          elements: [
            {
              id: 'smoke-form-shell',
              type: 'form',
              props: {
                title: 'Smoke frontend intake',
                fieldKeys: ['full_name', 'email', 'project_budget', 'message'],
              },
            },
          ],
          metadata: {
            templateSource: 'custom-frontend',
            templateKind: 'form',
          },
        },
        canvasSize: { width: 1120, height: 760 },
        themeTokenRefs: {
          'form.heading.color': 'colors.text',
          'form.submit.background': 'colors.primary',
        },
        assets: [
          { id: 'smoke-form-hero-asset', role: 'form-hero', source: 'custom-frontend' },
        ],
        animations: [
          { id: 'smoke-form-intro-animation', target: 'smoke-form-shell', timeline: 'form-intro' },
        ],
        interactions: [
          { id: 'smoke-form-submit-interaction', target: 'smoke-form-submit', trigger: 'submit' },
        ],
        dataBindings: {
          submitEndpoint: { source: 'form.submitUrl', targetPath: 'props.action' },
          projectBudget: { source: 'submission.project_budget', targetPath: 'fields.project_budget.value' },
        },
        editableMap: {
          'form.heading': {
            elementId: 'smoke-form-shell',
            targetPath: 'props.title',
            field: 'props.title',
          },
        },
        seo: {
          title: 'Smoke frontend intake',
        },
        metadata: {
          templateKind: 'form',
          animationTimeline: 'smoke-form-intro',
        },
        title: 'Smoke frontend intake',
        description: 'A custom frontend intake form seeded from the connected design contract.',
        successMessage: 'Smoke intake received.',
        pageTemplate: 'contact',
        fields: [
          { key: 'full_name', label: 'Full name', type: 'text', required: true, placeholder: 'Ada Lovelace' },
          { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'ada@example.com' },
          { key: 'project_budget', label: 'Project budget', type: 'select', required: false, options: ['$5k-$10k', '$10k-$25k', '$25k+'] },
          { key: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'Tell us about the project.' },
        ],
        contactShare: {
          enabled: true,
          nameField: 'full_name',
          emailField: 'email',
          notesField: 'message',
          dedupeByEmail: true,
        },
      },
      bindingHints: [
        { role: 'form.name', binding: 'submission.full_name' },
        { role: 'form.email', binding: 'submission.email' },
        { role: 'form.message', binding: 'submission.message' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="contact-form"]',
      role: 'form',
      binding: 'form.definition',
      fields: ['fields', 'successMessage'],
    },
  ],
  notes: 'Temporary contract for validating form creation from custom frontend templates.',
});

const listForms = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms`);
  assertFormsPersistenceCertificationResponse(payload);
  return payload.data?.forms || payload.forms || [];
};

const getSite = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`);
  return payload.data?.site || payload.site;
};

const updateSite = async (input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.site || payload.site;
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings;
};

const updateSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings;
};

const listCollections = async () => {
  const collections = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections?includeUnpublished=true&limit=${limit}&offset=${offset}`);
    const chunk = payload.data?.collections || payload.collections || [];
    collections.push(...chunk);
    const pagination = payload.data?.pagination || payload.pagination || {};

    if (!pagination.hasMore || chunk.length === 0) {
      break;
    }

    offset += limit;
  }

  return collections;
};

const temporarilyAllowFormsSmokeFixtureQuotas = async (extraForms = 5, extraCollections = 1) => {
  const site = await getSite();
  const existingForms = await listForms();
  const existingCollections = await listCollections();
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const currentFormLimit = Number(originalLimits.forms || 0);
  const currentCollectionLimit = Number(originalLimits.collections || 0);
  const nextFormLimit = Math.max(Number.isFinite(currentFormLimit) ? currentFormLimit : 0, existingForms.length + extraForms);
  const nextCollectionLimit = Math.max(Number.isFinite(currentCollectionLimit) ? currentCollectionLimit : 0, existingCollections.length + extraCollections);

  if (nextFormLimit === currentFormLimit && nextCollectionLimit === currentCollectionLimit) {
    return null;
  }

  await updateSite({
    settings: {
      ...originalSiteSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          forms: nextFormLimit,
          collections: nextCollectionLimit,
        },
      },
    },
  });

  return originalSiteSettings;
};

const restoreFormsSmokeFixtureQuotas = async (settings) => {
  if (!settings) return;
  await updateSite({ settings });
};

const listReusableSections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections?status=all`);
  return payload.data?.sections || payload.sections || [];
};

const getFormsAnalytics = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/analytics?days=14`);
  return payload.data?.analytics;
};

const getAdminAuditLogs = async () => {
  const payload = await requestApi(`/api/admin/audit-logs?siteId=${encodeURIComponent(SITE_ID)}&limit=60`);
  return payload.data?.logs || payload.logs || [];
};

const getFormWithSubmissions = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/submissions?limit=100`);
  return {
    form: payload.data?.form || payload.form,
    submissions: payload.data?.submissions?.data || payload.submissions?.data || [],
  };
};

const listFormContacts = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts?limit=100`);
  return payload.data?.contacts || payload.contacts || [];
};

const deleteForm = async (formId) => {
  if (!formId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}`, { method: 'DELETE' });
};

const assertFormBillingLimitEnforced = async (suffix) => {
  const site = await getSite();
  const settings = await getSettings();
  const existingForms = await listForms();
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedName = `blocked-form-limit-${suffix}`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'block',
      },
    },
  });
  await updateSite({
    settings: {
      ...originalSiteSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          forms: existingForms.length,
        },
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(`/api/admin/sites/${SITE_ID}/forms`, {
      method: 'POST',
      body: JSON.stringify({
        name: blockedName,
        title: 'Blocked form limit smoke',
        description: 'Temporary form that should be blocked by billing quota.',
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true },
        ],
      }),
    });

    assert(response.status === 402, `Billing form limit should reject form creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_FORM_LIMIT', `Billing form limit should return BILLING_FORM_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    const afterForms = await listForms();
    assert(!afterForms.some((form) => form.name === blockedName || form.title === 'Blocked form limit smoke'), 'Billing-limited form creation unexpectedly persisted a form.');
  } finally {
    await updateSite({ settings: originalSiteSettings });
    await updateSettings({ integrations: originalIntegrations });
  }
};

const createCaptchaSmokeForm = async () => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms`, {
    method: 'POST',
    body: JSON.stringify({
      name: `captcha-smoke-${suffix}`,
      title: 'Captcha smoke',
      description: 'Temporary form for captcha provider smoke coverage.',
      audience: 'public',
      isActive: true,
      moderationMode: 'auto-approve',
      enableHoneypot: true,
      enableCaptcha: true,
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'message', label: 'Message', type: 'textarea', required: false },
      ],
    }),
  });
  const form = payload.data?.form || payload.form;
  assert(form?.id, `Captcha smoke form was not created: ${JSON.stringify(payload).slice(0, 500)}`);
  return form;
};

const createDeleteDialogSmokeForm = async () => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms`, {
    method: 'POST',
    body: JSON.stringify({
      name: `delete-dialog-smoke-${suffix}`,
      title: 'Delete dialog smoke',
      description: 'Temporary form for delete confirmation recovery coverage.',
      audience: 'public',
      isActive: false,
      moderationMode: 'manual',
      enableHoneypot: true,
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'message', label: 'Message', type: 'textarea', required: false },
      ],
    }),
  });
  const form = payload.data?.form || payload.form;
  assert(form?.id, `Delete-dialog smoke form was not created: ${JSON.stringify(payload).slice(0, 500)}`);
  return form;
};

const assertFormCreateFieldSanitization = async () => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms`, {
    method: 'POST',
    body: JSON.stringify({
      name: `field-sanitization-${suffix}`,
      title: 'Field sanitization smoke',
      fields: [
        {
          key: 'Full Name!',
          label: 'Full Name',
          type: 'unsupported',
          required: true,
          options: ['A', 'A', 'B'],
          validation: [
            { type: 'minLength', value: 2, message: 'Use at least two characters.' },
            { type: 'unknown', value: 9, message: 'Drop me.' },
            'not-a-rule',
          ],
        },
        {
          key: 'Full Name!',
          label: 'Duplicate Full Name',
          type: 'email',
          required: false,
        },
      ],
    }),
  });
  const form = payload.data?.form || payload.form;
  assert(form?.id, `Field sanitization form was not created: ${JSON.stringify(payload).slice(0, 500)}`);
  try {
    const [first, second] = form.fields || [];
    assert(first?.key === 'full_name', `Create should sanitize first field key: ${JSON.stringify(form.fields)}`);
    assert(first?.type === 'text', `Create should normalize unsupported field type to text: ${JSON.stringify(form.fields)}`);
    assert(first?.required === true, `Create should preserve required flag: ${JSON.stringify(form.fields)}`);
    assert(first?.options?.length === 2, `Create should dedupe field options: ${JSON.stringify(form.fields)}`);
    assert(
      first?.validation?.length === 1 &&
      first.validation[0].type === 'minLength' &&
      first.validation[0].message === 'Use at least two characters.',
      `Create should sanitize validation rules: ${JSON.stringify(form.fields)}`,
    );
    assert(second?.key === 'full_name_2', `Create should make duplicate field keys unique: ${JSON.stringify(form.fields)}`);
    assert(second?.type === 'email', `Create should preserve supported field type: ${JSON.stringify(form.fields)}`);
  } finally {
    await deleteForm(form.id);
  }
};

const assertCaptchaProviderHook = async () => {
  let formId = null;

  try {
    const form = await createCaptchaSmokeForm();
    formId = form.id;

    const missingResponse = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: `forms-captcha-missing-${Date.now().toString(36)}`,
        rateLimitBypass: true,
        startedAt: Date.now() - 3000,
        honeypot: '',
        values: {
          email: 'forms-captcha-missing@example.com',
        },
      }),
    });
    const missingPayload = await missingResponse.json().catch(() => ({}));
    const missingSerialized = JSON.stringify(missingPayload);
    assert(missingResponse.status === 422, `Captcha-protected form should reject missing token with 422: ${missingResponse.status} ${missingSerialized}`);
    assert(missingPayload?.error?.code === 'CAPTCHA_REQUIRED', `Missing captcha token should return CAPTCHA_REQUIRED: ${missingSerialized}`);
    assert(
      missingPayload.spamFlags?.includes('captcha') || missingPayload.captcha?.errorCode === 'CAPTCHA_REQUIRED',
      `Missing captcha token response should expose captcha metadata: ${missingSerialized}`,
    );

    const requestId = `forms-captcha-valid-${Date.now().toString(36)}`;
    const validPayload = await requestApi(`/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
      method: 'POST',
      body: JSON.stringify({
        requestId,
        rateLimitBypass: true,
        startedAt: Date.now() - 3000,
        honeypot: '',
        captchaToken: process.env.BACKY_FORM_CAPTCHA_MOCK_TOKEN || 'backy-captcha-pass',
        email: 'forms-captcha-valid@example.com',
        message: 'Valid captcha smoke submission.',
      }),
    });

    const submission = validPayload.data?.submission || validPayload.submission;
    assert(submission?.id, `Captcha-protected form did not accept a valid token: ${JSON.stringify(validPayload).slice(0, 500)}`);
    assert(submission.status === 'approved', `Captcha smoke submission should auto-approve: ${JSON.stringify(submission).slice(0, 500)}`);
    assert(submission.values?.email === 'forms-captcha-valid@example.com', `Captcha smoke direct field-key payload did not persist email: ${JSON.stringify(submission.values)}`);
    assert(!Object.prototype.hasOwnProperty.call(submission.values || {}, 'captchaToken'), `Captcha token leaked into submitted values: ${JSON.stringify(submission.values)}`);

    return {
      formId,
      submissionId: submission.id,
      missingCode: missingPayload.error?.code,
      provider: missingPayload.captcha?.provider || 'mock',
    };
  } finally {
    if (formId) {
      await deleteForm(formId).catch((error) => {
        console.warn('Unable to delete captcha smoke form:', error instanceof Error ? error.message : error);
      });
    }
  }
};

const deleteReusableSection = async (sectionId) => {
  if (!sectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, { method: 'DELETE' });
};

const createCollection = async () => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Forms Smoke Registrations ${suffix}`,
      slug: `forms-smoke-registrations-${suffix}`,
      status: 'published',
      permissions: {
        publicRead: false,
        publicCreate: true,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        { key: 'full_name', label: 'Full name', type: 'text', required: true, unique: false, sortOrder: 10 },
        { key: 'email', label: 'Email', type: 'email', required: true, unique: false, sortOrder: 20 },
        { key: 'company', label: 'Company', type: 'text', required: true, unique: false, sortOrder: 30 },
        { key: 'source_submission_id', label: 'Source submission', type: 'text', required: false, unique: false, sortOrder: 40 },
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Unable to create smoke collection: ${JSON.stringify(payload).slice(0, 500)}`);
  return collection;
};

const deleteCollection = async (collectionId) => {
  if (!collectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
};

const listCollectionRecords = async (collectionId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?limit=100&status=all`);
  return payload.data?.records || payload.records || [];
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson('/json/list');
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    events,
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
`;

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const navigateToForms = async (client, options = {}) => {
  const formIdQuery = options.formId ? `&formId=${encodeURIComponent(options.formId)}` : '';
  const expectedText = options.expectedText || 'Registration';
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/forms?siteId=${encodeURIComponent(SITE_ID)}${formIdQuery}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="forms-command-center"]')),
      analytics: Boolean(document.querySelector('[data-testid="forms-analytics-panel"]')),
      audit: Boolean(document.querySelector('[data-testid="forms-audit-panel"]')),
      templates: document.body?.innerText?.includes('Form templates') || false,
      expectedText: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
      registration: document.body?.innerText?.includes('Registration') || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (state.ready && state.analytics && state.audit && state.templates && state.expectedText) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Forms page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickRegistrationCreateForm = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const cards = Array.from(document.querySelectorAll('#forms-templates [class*="rounded"]'));
      const card = cards.find((candidate) => (
        (candidate.textContent || '').includes('Registration') &&
        (candidate.textContent || '').includes('Account, member, or waitlist signup')
      ));
      const button = Array.from((card || document).querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').replace(/\\s+/g, ' ').trim().includes('Create form')
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, card: Boolean(card), button: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to click Registration Create form: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const clickFrontendTemplateCreateForm = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="forms-frontend-template-options"]');
      const button = document.querySelector('[data-testid="forms-frontend-template-${FRONTEND_FORM_TEMPLATE_ID}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          section: Boolean(section),
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to click frontend template Create form: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const clickBlankCreateForm = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="forms-create-blank-button"]')
        || document.querySelector('[data-testid="forms-template-create-blank-button"]')
        || document.querySelector('[data-testid="forms-empty-create-blank-button"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to click blank form create button: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const waitForBlankStandaloneForm = async (client, beforeIds) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const forms = await listForms();
    const created = forms.find((form) => (
      !beforeIds.has(form.id) &&
      form.title === 'Untitled form' &&
      !form.pageId &&
      !form.postId &&
      form.settings?.source === 'blank-standalone'
    ));
    const state = await evaluate(client, `(() => ({
      notice: document.body?.innerText?.includes('Blank standalone form created') || false,
      builder: Boolean(document.querySelector('[data-testid="form-builder-panel"]')),
      saveButton: Array.from(document.querySelectorAll('button')).some((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save form'
      )),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (created && state.notice && state.builder && state.saveButton) {
      assert(created.fields?.length === 1 && created.fields[0].key === 'field_1', `Blank form did not persist default field: ${JSON.stringify(created.fields)}`);
      assert(created.contactShare?.enabled === false, `Blank form contact share should default off: ${JSON.stringify(created.contactShare)}`);
      assert(created.collectionTarget?.enabled === false, `Blank form collection target should default off: ${JSON.stringify(created.collectionTarget)}`);
      return { form: created, state };
    }

    if (attempt === 99) {
      throw new Error(`Blank standalone form was not created: ${JSON.stringify({
        forms: forms.map((form) => ({
          id: form.id,
          title: form.title,
          pageId: form.pageId,
          postId: form.postId,
          settings: form.settings,
        })).slice(0, 10),
        state,
      })}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForFrontendTemplateForm = async (beforeIds) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const forms = await listForms();
    const created = forms.find((form) => (
      !beforeIds.has(form.id) &&
      form.settings?.frontendDesignTemplateId === FRONTEND_FORM_TEMPLATE_ID
    ));

    if (created) {
      return created;
    }

    if (attempt === 99) {
      throw new Error(`Frontend form template was not created: ${JSON.stringify(forms.map((form) => ({
        id: form.id,
        title: form.title,
        settings: form.settings,
      })).slice(0, 10))}`);
    }

    await sleep(250);
  }

  return null;
};

const assertFrontendTemplateForm = async (formId) => {
  const form = await getAdminForm(formId);
  assert(form?.title === 'Smoke frontend intake', `Frontend form title mismatch: ${form?.title}`);
  assert(form?.settings?.frontendDesignTemplateId === FRONTEND_FORM_TEMPLATE_ID, `Frontend template id was not stored: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignTemplateName === FRONTEND_FORM_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignSource?.label === 'Smoke forms frontend', `Frontend source snapshot missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignRoutePattern === '/contact/smoke-intake', `Frontend route pattern missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignChrome?.header?.component === 'SmokeFormsHeader', `Frontend chrome snapshot missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(form?.settings)}`);
  assert(Array.isArray(form?.settings?.frontendDesignBindingHints) && form.settings.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignCustomJs?.includes('__backySmokeFormTemplate'), `Frontend custom JS provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignContentDocument?.schemaVersion === 'backy.content.v1', `Frontend content document provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignCanvasSize?.width === 1120, `Frontend canvas size provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignThemeTokenRefs?.['form.submit.background'] === 'colors.primary', `Frontend theme-token refs missing: ${JSON.stringify(form?.settings)}`);
  assert(Array.isArray(form?.settings?.frontendDesignAssets) && form.settings.frontendDesignAssets[0]?.id === 'smoke-form-hero-asset', `Frontend asset provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(Array.isArray(form?.settings?.frontendDesignAnimations) && form.settings.frontendDesignAnimations[0]?.timeline === 'form-intro', `Frontend animation provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(Array.isArray(form?.settings?.frontendDesignInteractions) && form.settings.frontendDesignInteractions[0]?.trigger === 'submit', `Frontend interaction provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignDataBindings?.submitEndpoint?.source === 'form.submitUrl', `Frontend data-binding provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignEditableMap?.['form.heading']?.targetPath === 'props.title', `Frontend editable-map provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignSeo?.title === 'Smoke frontend intake', `Frontend SEO provenance missing: ${JSON.stringify(form?.settings)}`);
  assert(form?.settings?.frontendDesignMetadata?.animationTimeline === 'smoke-form-intro', `Frontend template metadata missing: ${JSON.stringify(form?.settings)}`);
  assert(
    form?.settings?.frontendFieldKeyMap?.['Full name'] === 'full_name' &&
      form.settings.frontendFieldKeyMap?.project_budget === 'project_budget',
    `Frontend field key map was not stored: ${JSON.stringify(form?.settings)}`,
  );
  assert(form?.fields?.some((field) => field.key === 'project_budget' && field.type === 'select' && field.options?.includes('$25k+')), `Frontend fields did not persist: ${JSON.stringify(form?.fields)}`);
  const definition = await requestApi(`/api/sites/${SITE_ID}/forms/${form.id}/definition`);
  assert(
    definition.data?.form?.frontendFieldKeyMap?.['Full name'] === 'full_name' &&
      definition.data.form.frontendDesign?.fieldKeyMap?.project_budget === 'project_budget',
    `Frontend public definition did not expose field key map: ${JSON.stringify(definition).slice(0, 1000)}`,
  );
  assert(
    definition.data?.form?.frontendDesign?.customJs?.includes('__backySmokeFormTemplate') &&
      definition.data.form.frontendDesign?.themeTokenRefs?.['form.submit.background'] === 'colors.primary' &&
      Array.isArray(definition.data.form.frontendDesign?.animations) &&
      definition.data.form.frontendDesign.animations[0]?.timeline === 'form-intro' &&
      definition.data.form.frontendDesign?.editableMap?.['form.heading']?.targetPath === 'props.title',
    `Frontend public definition did not expose rich design provenance: ${JSON.stringify(definition).slice(0, 1000)}`,
  );
  const aliasSubmission = await requestApi(`/api/sites/${SITE_ID}/forms/${form.id}/submissions`, {
    method: 'POST',
    body: JSON.stringify({
      requestId: `forms-frontend-alias-${Date.now().toString(36)}`,
      startedAt: Date.now() - 3000,
      honeypot: '',
      values: {
        'full name': 'Frontend Alias User',
        EMAIL: 'forms-frontend-alias@example.com',
        'Project Budget!': '$25k+',
        message: 'Submitted with frontend aliases.',
      },
      contactShareOverride: {
        enabled: true,
        nameField: 'FULL NAME',
        emailField: 'email',
        notesField: 'Message!',
        dedupeByEmail: true,
      },
    }),
  });
  const aliasSubmissionRecord = aliasSubmission.data?.submission || aliasSubmission.submission;
  assert(aliasSubmissionRecord?.values?.full_name === 'Frontend Alias User', `Frontend alias full name did not normalize: ${JSON.stringify(aliasSubmission).slice(0, 1000)}`);
  assert(aliasSubmissionRecord?.values?.email === 'forms-frontend-alias@example.com', `Frontend alias email did not normalize: ${JSON.stringify(aliasSubmission).slice(0, 1000)}`);
  assert(aliasSubmissionRecord?.values?.project_budget === '$25k+', `Frontend alias select value did not normalize: ${JSON.stringify(aliasSubmission).slice(0, 1000)}`);
  assert(
    form?.contactShare?.enabled === true &&
    form.contactShare.nameField === 'full_name' &&
    form.contactShare.emailField === 'email' &&
    form.contactShare.notesField === 'message',
    `Frontend contact share mapping did not persist: ${JSON.stringify(form?.contactShare)}`,
  );
  return form;
};

const waitForCreatedForm = async (client, beforeIds) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const forms = await listForms();
    const created = forms.find((form) => !beforeIds.has(form.id) && form.title === 'Registration');
    const state = await evaluate(client, `(() => ({
      notice: document.body?.innerText?.includes('Registration form created') || false,
      selected: document.body?.innerText?.includes('Registration') && document.body?.innerText?.includes('Frontend form API'),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (created && state.notice) {
      return { form: created, state };
    }

    if (attempt === 99) {
      throw new Error(`Registration form was not created: ${JSON.stringify({ forms: forms.map((form) => form.id), state })}`);
    }

    await sleep(250);
  }

  return null;
};

const getAdminForm = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}`);
  return payload.data?.form || payload.form;
};

const assertFormActionsWired = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const cloneButton = document.querySelector('[data-testid="form-clone-button"]');
      if (!(cloneButton instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'clone-button-missing', body: document.body?.innerText?.slice(0, 500) || '' };
      }
      if (cloneButton.disabled) {
        return { ok: false, reason: 'clone-button-disabled', text: cloneButton.textContent || '' };
      }
      const deleteButton = document.querySelector('[data-testid="form-delete-button"]');
      if (!(deleteButton instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'delete-button-missing', body: document.body?.innerText?.slice(0, 500) || '' };
      }
      if (deleteButton.disabled) {
        return { ok: false, reason: 'delete-button-disabled', text: deleteButton.textContent || '' };
      }
      const actionGroup = document.querySelector('[data-testid="forms-selected-action-group"]');
      const actionStatus = document.querySelector('[data-testid="forms-selected-action-status"]');
      const actionStatusId = actionStatus?.id || '';
      const actionStatusText = (actionStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
      const actionGroupStatus = actionGroup?.getAttribute('data-action-status') || '';
      const actionState = {
        groupRole: actionGroup?.getAttribute('role') || '',
        groupLabel: actionGroup?.getAttribute('aria-label') || '',
        groupDescribedBy: actionGroup?.getAttribute('aria-describedby') || '',
        statusId: actionStatusId,
        statusText: actionStatusText,
        groupStatus: actionGroupStatus,
        cloneState: cloneButton.getAttribute('data-action-state') || '',
        cloneReason: cloneButton.getAttribute('data-disabled-reason') || '',
        cloneDescribedBy: cloneButton.getAttribute('aria-describedby') || '',
        deleteState: deleteButton.getAttribute('data-action-state') || '',
        deleteReason: deleteButton.getAttribute('data-disabled-reason') || '',
        deleteDescribedBy: deleteButton.getAttribute('aria-describedby') || '',
      };
      if (
        !(actionGroup instanceof HTMLElement) ||
        !(actionStatus instanceof HTMLElement) ||
        actionState.groupRole !== 'group' ||
        !actionState.groupLabel.startsWith('Actions for ') ||
        actionState.groupDescribedBy !== actionStatusId ||
        actionState.statusText !== actionState.groupStatus ||
        !actionState.statusText.includes('Clone available.') ||
        !actionState.statusText.includes('Delete available.') ||
        actionState.cloneState !== 'ready' ||
        actionState.cloneReason !== '' ||
        actionState.cloneDescribedBy !== actionStatusId ||
        actionState.deleteState !== 'ready' ||
        actionState.deleteReason !== '' ||
        actionState.deleteDescribedBy !== actionStatusId
      ) {
        return { ok: false, reason: 'selected-action-status', actionState };
      }
      deleteButton.click();
      const dialog = document.querySelector('[data-testid="form-delete-confirm-dialog"]');
      const confirmButton = document.querySelector('[data-testid="form-delete-confirm-button"]');
      const cancelButton = document.querySelector('[data-testid="form-delete-cancel-button"]');
      if (!(dialog instanceof HTMLElement) || !(confirmButton instanceof HTMLButtonElement) || !(cancelButton instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'delete-dialog-missing',
          body: document.body?.innerText?.slice(0, 800) || '',
        };
      }
      const semantics = {
        role: dialog.getAttribute('role') || '',
        modal: dialog.getAttribute('aria-modal') || '',
        labelledBy: dialog.getAttribute('aria-labelledby') || '',
        describedBy: dialog.getAttribute('aria-describedby') || '',
        hasTitle: Boolean(document.querySelector('#form-delete-confirm-title')),
        hasDescription: Boolean(document.querySelector('#form-delete-confirm-description')),
        hasImpact: Boolean(document.querySelector('#form-delete-confirm-impact')),
      };
      if (
        semantics.role !== 'dialog' ||
        semantics.modal !== 'true' ||
        semantics.labelledBy !== 'form-delete-confirm-title' ||
        !semantics.describedBy.includes('form-delete-confirm-description') ||
        !semantics.describedBy.includes('form-delete-confirm-impact') ||
        !semantics.hasTitle ||
        !semantics.hasDescription ||
        !semantics.hasImpact
      ) {
        return { ok: false, reason: 'delete-dialog-semantics', semantics };
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return { ok: true, phase: 'opened-and-escaped', semantics };
    })()`);

    if (result.ok) {
      for (let closeAttempt = 0; closeAttempt < 20; closeAttempt += 1) {
        const closedState = await evaluate(client, `(() => ({
          closed: !document.querySelector('[data-testid="form-delete-confirm-dialog"]'),
          body: document.body?.innerText?.slice(0, 500) || '',
        }))()`);
        if (closedState.closed) break;
        if (closeAttempt === 19) {
          throw new Error(`Form delete confirmation did not close on Escape: ${JSON.stringify(closedState)}`);
        }
        await sleep(100);
      }

      for (let reopenAttempt = 0; reopenAttempt < 30; reopenAttempt += 1) {
        const reopenState = await evaluate(client, `(() => {
          const deleteButton = document.querySelector('[data-testid="form-delete-button"]');
          if (!(deleteButton instanceof HTMLButtonElement)) {
            return { ok: false, reason: 'delete-button-missing-after-escape', body: document.body?.innerText?.slice(0, 800) || '' };
          }
          if (deleteButton.disabled) return { ok: false, reason: 'delete-button-disabled-after-escape' };
          deleteButton.click();
          const dialog = document.querySelector('[data-testid="form-delete-confirm-dialog"]');
          const cancelButton = document.querySelector('[data-testid="form-delete-cancel-button"]');
          if (!(dialog instanceof HTMLElement) || !(cancelButton instanceof HTMLButtonElement)) {
            return { ok: false, reason: 'dialog-reopen-failed', body: document.body?.innerText?.slice(0, 800) || '' };
          }
          cancelButton.click();
          return { ok: true };
        })()`);
        if (reopenState.ok) return;
        if (reopenAttempt === 29) {
          throw new Error(`Unable to reopen/cancel form delete confirmation after Escape: ${JSON.stringify(reopenState)}`);
        }
        await sleep(150);
      }
      return;
    }

    if (attempt === 79) {
      throw new Error(`Form selected actions were not wired: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const duplicateCompanyFieldThroughUi = async (client) => {
  let clickState = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    clickState = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      if (!panel) return { ok: false, reason: 'panel-missing' };
      const fieldCards = Array.from(panel.querySelectorAll('.rounded-lg.border.border-border.bg-card.p-3'));
      const companyCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'company')
      ));
      if (!(companyCard instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'company-card-missing',
          fieldKeys: fieldCards.flatMap((candidate) => Array.from(candidate.querySelectorAll('input')).map((input) => input.value)).filter(Boolean).slice(0, 30),
        };
      }
      const minLengthValue = Array.from(companyCard.querySelectorAll('input')).find((input) => (input.getAttribute('aria-label') || '').includes('Min length value'));
      const minLengthMessage = Array.from(companyCard.querySelectorAll('input')).find((input) => (input.getAttribute('aria-label') || '').includes('Min length message'));
      const duplicateButton = companyCard.querySelector('[data-testid="form-field-duplicate-button"]');
      if (!(minLengthValue instanceof HTMLInputElement) || minLengthValue.value !== '4') {
        return { ok: false, reason: 'company-validation-not-ready', minLengthValue: minLengthValue?.value || '' };
      }
      if (!(minLengthMessage instanceof HTMLInputElement) || minLengthMessage.value !== 'Company must be at least 4 characters.') {
        return { ok: false, reason: 'company-validation-message-not-ready', minLengthMessage: minLengthMessage?.value || '' };
      }
      if (!(duplicateButton instanceof HTMLButtonElement)) return { ok: false, reason: 'duplicate-button-missing' };
      if (duplicateButton.disabled) return { ok: false, reason: 'duplicate-button-disabled' };
      duplicateButton.scrollIntoView({ block: 'center' });
      duplicateButton.click();
      return { ok: true };
    })()`);

    if (clickState.ok) {
      break;
    }
    if (attempt === 59) {
      throw new Error(`Unable to duplicate Company form field: ${JSON.stringify(clickState)}`);
    }
    await sleep(150);
  }

  let duplicateState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    duplicateState = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      if (!panel) return { ok: false, reason: 'panel-missing' };
      const fieldCards = Array.from(panel.querySelectorAll('.rounded-lg.border.border-border.bg-card.p-3'));
      const duplicateCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'company_copy')
      ));
      if (!(duplicateCard instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'duplicate-card-missing',
          fieldKeys: fieldCards.flatMap((candidate) => Array.from(candidate.querySelectorAll('input')).map((input) => input.value)).filter(Boolean).slice(0, 40),
        };
      }
      const inputs = Array.from(duplicateCard.querySelectorAll('input'));
      const key = inputs.find((input) => input.value === 'company_copy');
      const label = inputs.find((input) => input.value === 'Company copy');
      const minLengthValue = inputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length value'));
      const minLengthMessage = inputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length message'));
      const duplicateButton = duplicateCard.querySelector('[data-testid="form-field-duplicate-button"]');
      return {
        ok: key instanceof HTMLInputElement &&
          label instanceof HTMLInputElement &&
          minLengthValue instanceof HTMLInputElement &&
          minLengthValue.value === '4' &&
          minLengthMessage instanceof HTMLInputElement &&
          minLengthMessage.value === 'Company must be at least 4 characters.' &&
          duplicateButton instanceof HTMLButtonElement &&
          !duplicateButton.disabled,
        key: key?.value || '',
        label: label?.value || '',
        minLengthValue: minLengthValue?.value || '',
        minLengthMessage: minLengthMessage?.value || '',
        duplicateDisabled: duplicateButton instanceof HTMLButtonElement ? duplicateButton.disabled : null,
      };
    })()`);

    if (duplicateState.ok) {
      return duplicateState;
    }
    if (attempt === 79) {
      throw new Error(`Duplicated Company form field did not preserve configuration: ${JSON.stringify(duplicateState)}`);
    }
    await sleep(150);
  }

  return duplicateState;
};

const editFormBuilderInUi = async (client, formId, collectionId, webhookUrl) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const prototype = input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      if (!panel) {
        return { ok: false, reason: 'panel-missing', body: document.body?.innerText?.slice(0, 500) || '' };
      }

      const inputs = Array.from(panel.querySelectorAll('input'));
      const textareas = Array.from(panel.querySelectorAll('textarea'));
      const title = inputs.find((input) => input.value === 'Registration');
      const machineName = inputs.find((input) => input.value.startsWith('registration-'));
      const firstPlaceholder = inputs.find((input) => input.value === 'Ada Lovelace');
      const notificationEmail = panel.querySelector('[data-testid="form-notification-email-input"]');
      const notificationWebhook = panel.querySelector('[data-testid="form-notification-webhook-input"]');
      const spamMinFill = panel.querySelector('[data-testid="form-spam-min-fill-ms-input"]');
      const spamRateWindow = panel.querySelector('[data-testid="form-spam-rate-window-seconds-input"]');
      const spamRateMax = panel.querySelector('[data-testid="form-spam-rate-limit-max-input"]');
      const spamDuplicateWindow = panel.querySelector('[data-testid="form-spam-duplicate-window-seconds-input"]');
      const spamBlockedTerms = panel.querySelector('[data-testid="form-spam-blocked-terms-input"]');
      const consentRetention = panel.querySelector('[data-testid="form-consent-retention-days-input"]');
      const consentDeleteAfter = panel.querySelector('[data-testid="form-consent-delete-after-days-input"]');
      const consentRequestEmail = panel.querySelector('[data-testid="form-consent-request-email-input"]');
      const consentPolicyLabel = panel.querySelector('[data-testid="form-consent-policy-label-input"]');
      const consentExportIp = panel.querySelector('[data-testid="form-consent-export-ip-toggle"]');
      const addButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add field'
      ));

      if (
        !(title instanceof HTMLInputElement) ||
        !(machineName instanceof HTMLInputElement) ||
        !(firstPlaceholder instanceof HTMLInputElement) ||
        !(notificationEmail instanceof HTMLInputElement) ||
        !(notificationWebhook instanceof HTMLInputElement) ||
        !(spamMinFill instanceof HTMLInputElement) ||
        !(spamRateWindow instanceof HTMLInputElement) ||
        !(spamRateMax instanceof HTMLInputElement) ||
        !(spamDuplicateWindow instanceof HTMLInputElement) ||
        !(spamBlockedTerms instanceof HTMLTextAreaElement) ||
        !(consentRetention instanceof HTMLInputElement) ||
        !(consentDeleteAfter instanceof HTMLInputElement) ||
        !(consentRequestEmail instanceof HTMLInputElement) ||
        !(consentPolicyLabel instanceof HTMLInputElement) ||
        !(consentExportIp instanceof HTMLInputElement) ||
        !(addButton instanceof HTMLButtonElement)
      ) {
        return {
          ok: false,
          reason: 'controls-missing',
          inputs: inputs.map((input) => input.value).slice(0, 20),
          buttons: Array.from(panel.querySelectorAll('button')).map((button) => button.textContent || '').slice(0, 20),
        };
      }

      title.focus();
      setInputValue(title, 'Registration edited');

      machineName.focus();
      setInputValue(machineName, 'registration_smoke');

      firstPlaceholder.focus();
      setInputValue(firstPlaceholder, 'Grace Hopper');

      notificationEmail.focus();
      setInputValue(notificationEmail, 'forms-smoke-leads@example.com');

      notificationWebhook.focus();
      setInputValue(notificationWebhook, ${JSON.stringify(webhookUrl)});

      spamMinFill.focus();
      setInputValue(spamMinFill, '2000');

      spamRateWindow.focus();
      setInputValue(spamRateWindow, '45');

      spamRateMax.focus();
      setInputValue(spamRateMax, '6');

      spamDuplicateWindow.focus();
      setInputValue(spamDuplicateWindow, '300');

      spamBlockedTerms.focus();
      setInputValue(spamBlockedTerms, 'blocky-spam');

      consentRetention.focus();
      setInputValue(consentRetention, '30');

      consentDeleteAfter.focus();
      setInputValue(consentDeleteAfter, '365');

      consentRequestEmail.focus();
      setInputValue(consentRequestEmail, 'privacy@example.com');

      consentPolicyLabel.focus();
      setInputValue(consentPolicyLabel, 'Registration consent policy');

      if (consentExportIp.checked) {
        consentExportIp.click();
      }

      addButton.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to edit form builder: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      if (!panel) return { ok: false, reason: 'panel-missing' };
      const fieldCards = Array.from(panel.querySelectorAll('.rounded-lg.border.border-border.bg-card.p-3'));
      const companyCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'company') &&
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'Company')
      ));
      if (companyCard) {
        return { ok: true, reason: 'company-field-ready' };
      }
      const fieldCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'field_6')
      ));
      if (!(fieldCard instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'new-field-card-missing',
          inputs: fieldCards.flatMap((candidate) => Array.from(candidate.querySelectorAll('input')).map((input) => input.value)).filter(Boolean).slice(-24),
        };
      }
      const fieldInputs = Array.from(fieldCard.querySelectorAll('input'));
      const key = fieldInputs.find((input) => input.value === 'field_6');
      const label = fieldInputs.find((input) => input.value === 'Field 6');
      if (!(key instanceof HTMLInputElement) || !(label instanceof HTMLInputElement)) {
        return {
          ok: false,
          reason: 'new-field-controls-missing',
          inputs: fieldInputs.map((input) => input.value).slice(-16),
        };
      }

      label.focus();
      setInputValue(label, 'Company');

      key.focus();
      setInputValue(key, 'company');

      return { ok: false, reason: 'company-rename-dispatched', key: key.value, label: label.value };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to rename new form field: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      if (!panel) return { ok: false, reason: 'panel-missing' };
      const fieldCards = Array.from(panel.querySelectorAll('.rounded-lg.border.border-border.bg-card.p-3'));
      const fieldCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'company')
      ));
      if (!(fieldCard instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'company-card-missing',
          fieldKeys: fieldCards.flatMap((candidate) => Array.from(candidate.querySelectorAll('input')).map((input) => input.value)).filter(Boolean).slice(0, 30),
        };
      }
      const fieldInputs = Array.from((fieldCard || panel).querySelectorAll('input'));
      const minLengthValue = fieldInputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length value'));
      const minLengthMessage = fieldInputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length message'));
      const collectionWriteToggle = Array.from(panel.querySelectorAll('label')).find((label) => (
        (label.textContent || '').includes('Collection write')
      ))?.querySelector('input[type="checkbox"]');
      const collectionDisabledReason = panel.querySelector('[data-testid="form-collection-target-disabled-reason"]');
      const saveButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save form'
      ));
      if (
        !(minLengthValue instanceof HTMLInputElement) ||
        !(minLengthMessage instanceof HTMLInputElement) ||
        !(collectionWriteToggle instanceof HTMLInputElement) ||
        !(saveButton instanceof HTMLButtonElement)
      ) {
        return {
          ok: false,
          reason: 'validation-or-collection-controls-missing',
          inputs: fieldInputs.map((input) => ({
            value: input.value,
            aria: input.getAttribute('aria-label') || '',
          })).slice(-24),
          buttons: Array.from(panel.querySelectorAll('button')).map((button) => button.textContent || '').slice(-10),
        };
      }
      if (collectionWriteToggle.disabled) {
        return {
          ok: false,
          reason: 'collection-toggle-disabled',
          disabledReason: collectionDisabledReason?.textContent || '',
        };
      }

      minLengthValue.focus();
      setInputValue(minLengthValue, '4');

      minLengthMessage.focus();
      setInputValue(minLengthMessage, 'Company must be at least 4 characters.');

      if (!collectionWriteToggle.checked) {
        collectionWriteToggle.click();
      }

      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to enable form collection target: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  const duplicatedCompanyField = await duplicateCompanyFieldThroughUi(client);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const selectValue = (select, value) => {
        select.value = value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const panel = document.querySelector('[data-testid="form-builder-panel"]');
      const collectionPanel = document.querySelector('[data-testid="form-collection-target-panel"]');
      if (!panel || !collectionPanel) return { ok: false, reason: 'collection-panel-missing', body: document.body?.innerText?.slice(0, 700) || '' };

      const collectionSelect = collectionPanel.querySelector('select[aria-label="Collection target collection"]');
      const slugSelect = collectionPanel.querySelector('select[aria-label="Collection target slug field"]');
      if (!(collectionSelect instanceof HTMLSelectElement) || !(slugSelect instanceof HTMLSelectElement)) {
        return { ok: false, reason: 'target-selects-missing' };
      }
      if (collectionSelect.disabled || Array.from(collectionSelect.options).some((option) => (option.textContent || '').includes('(not public-create)'))) {
        return {
          ok: false,
          reason: 'collection-target-select-not-writable-only',
          disabled: collectionSelect.disabled,
          options: Array.from(collectionSelect.options).map((option) => option.textContent || ''),
        };
      }

      selectValue(collectionSelect, ${JSON.stringify(collectionId)});
      selectValue(slugSelect, 'email');

      const mappings = {
        'Map Full name to collection field': 'full_name',
        'Map Email to collection field': 'email',
        'Map Company to collection field': 'company',
      };
      for (const [aria, value] of Object.entries(mappings)) {
        const select = collectionPanel.querySelector('select[aria-label="' + aria + '"]');
        if (!(select instanceof HTMLSelectElement)) {
          return {
            ok: false,
            reason: 'mapping-select-missing',
            aria,
            selects: Array.from(collectionPanel.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || ''),
          };
        }
        selectValue(select, value);
      }

      const saveButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save form'
      ));
      if (saveButton.disabled) {
        return { ok: false, reason: 'save-disabled', button: saveButton.textContent || '' };
      }
      saveButton.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to save form collection mapping changes: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const saved = await evaluate(client, `(() => ({
      notice: document.body?.innerText?.includes('Form settings and fields saved.') || false,
      body: document.body?.innerText?.slice(0, 700) || '',
      inlineErrors: Array.from(document.querySelectorAll('[data-testid$="-error"]'))
        .map((element) => ({
          testId: element.getAttribute('data-testid') || '',
          text: (element.textContent || '').replace(/\\s+/g, ' ').trim(),
        }))
        .filter((item) => item.text),
    }))()`);
    const form = await getAdminForm(formId);
    const editedTitle = form?.title === 'Registration edited';
    const company = form?.fields?.some((field) => field.key === 'company' && field.label === 'Company');
    const companyValidation = form?.fields?.find((field) => field.key === 'company')?.validation || [];
    const companyCopy = form?.fields?.find((field) => field.key === 'company_copy');
    const companyCopyValidation = companyCopy?.validation || [];
    const collectionTarget = form?.collectionTarget;
    const hasCompanyMinLength = companyValidation.some((rule) => (
      rule.type === 'minLength' &&
      Number(rule.value) === 4 &&
      rule.message === 'Company must be at least 4 characters.'
    ));
    const hasCompanyCopy = (
      companyCopy?.label === 'Company copy' &&
      companyCopy?.type === 'text' &&
      companyCopyValidation.some((rule) => (
        rule.type === 'minLength' &&
        Number(rule.value) === 4 &&
        rule.message === 'Company must be at least 4 characters.'
      ))
    );
    const hasCollectionMapping = (
      collectionTarget?.enabled === true &&
      collectionTarget.collectionId === collectionId &&
      collectionTarget.slugField === 'email' &&
      collectionTarget.fieldMap?.full_name === 'full_name' &&
      collectionTarget.fieldMap?.email === 'email' &&
      collectionTarget.fieldMap?.company === 'company'
    );
    const placeholder = form?.fields?.some((field) => field.key === 'full_name' && field.placeholder === 'Grace Hopper');
    const notificationTargets = form?.notificationEmail === 'forms-smoke-leads@example.com' && form?.notificationWebhook === webhookUrl;
    const spam = form?.settings?.spam || form?.spamSettings || {};
    const spamSettings = (
      Number(spam.minFillMs) === 2000 &&
      Number(spam.rateLimitWindowMs) === 45000 &&
      Number(spam.rateLimitMax) === 6 &&
      Number(spam.duplicateWindowMs) === 300000 &&
      Array.isArray(spam.blockedTerms) &&
      spam.blockedTerms.includes('blocky-spam')
    );
    const consent = form?.settings?.consent || form?.consentSettings || {};
    const consentSettings = (
      Number(consent.retentionDays) === 30 &&
      Number(consent.deleteAfterDays) === 365 &&
      consent.requestEmail === 'privacy@example.com' &&
      consent.policyLabel === 'Registration consent policy' &&
      consent.exportIncludesIp === false
    );

    if (saved.notice && editedTitle && company && hasCompanyMinLength && hasCompanyCopy && hasCollectionMapping && placeholder && notificationTargets && spamSettings && consentSettings) {
      return {
        ...saved,
        editedTitle,
        company,
        hasCompanyMinLength,
        hasCompanyCopy,
        duplicatedCompanyField,
        hasCollectionMapping,
        placeholder,
        notificationTargets,
        spamSettings,
        consentSettings,
      };
    }

    if (attempt === 79) {
      throw new Error(`Form builder changes did not persist: ${JSON.stringify({
        saved,
        title: form?.title,
        notificationEmail: form?.notificationEmail,
        notificationWebhook: form?.notificationWebhook,
        collectionTarget,
        duplicatedCompanyField,
        spam,
        consent,
        fields: form?.fields?.map((field) => ({ key: field.key, label: field.label, placeholder: field.placeholder, validation: field.validation })),
      })}`);
    }

    await sleep(250);
  }

  return null;
};

const submitRegistration = async (formId) => {
  const requestId = `forms-smoke-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
    method: 'POST',
    body: JSON.stringify({
      requestId,
      rateLimitBypass: true,
      startedAt: Date.now() - 3000,
      honeypot: '',
      values: {
        full_name: 'Forms Smoke User',
        email: 'forms-smoke@example.com',
        phone: '+1 555 0199',
        member_type: 'Creator',
        consent: true,
        company: 'Backy Smoke Co',
      },
    }),
  });

  const submission = payload.data?.submission;
  assert(submission?.id, `Public registration submit did not return a submission: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(submission.status === 'pending', `Registration submission should be pending for manual review: ${submission.status}`);
  assert(!submission.collectionRecord, `Pending registration submission should not create a collection record: ${JSON.stringify(submission.collectionRecord)}`);
  assert(!payload.data?.collectionRecord && !payload.collectionRecord, `Pending registration response should not expose a collection record: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(!payload.data?.contact && !payload.contact, `Pending registration response should not create a contact: ${JSON.stringify(payload).slice(0, 500)}`);
  return { ...submission, requestId };
};

const submitInvalidRegistration = async (formId) => {
  const response = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `forms-smoke-invalid-${Date.now().toString(36)}`,
      rateLimitBypass: true,
      startedAt: Date.now() - 3000,
      honeypot: '',
      data: {
        full_name: 'Forms Smoke User',
        email: 'forms-smoke-invalid@example.com',
        phone: '+1 555 0199',
        member_type: 'Creator',
        consent: true,
        company: 'ABC',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const serialized = JSON.stringify(payload);
  assert(!response.ok || payload.success === false, `Invalid registration unexpectedly succeeded: ${serialized}`);
  assert(serialized.includes('Company must be at least 4 characters.'), `Invalid registration did not return validation message: ${serialized}`);
  assert(
    payload.validation?.some((detail) => detail.field === 'company' && detail.code === 'min_length' && detail.message === 'Company must be at least 4 characters.'),
    `Invalid registration did not return machine-readable field errors: ${serialized}`,
  );
  return payload;
};

const submitBlockedSpamRegistration = async (formId) => {
  const response = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `forms-spam-${Date.now().toString(36)}`,
      startedAt: Date.now() - 3000,
      honeypot: '',
      values: {
        full_name: 'Spam Blocked User',
        email: 'forms-spam@example.com',
        phone: '+1 555 0100',
        member_type: 'Creator',
        consent: true,
        company: 'blocky-spam labs',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const serialized = JSON.stringify(payload);
  assert(response.status === 422, `Blocked spam registration should return 422: ${response.status} ${serialized}`);
  assert(
    payload.spamFlags?.includes('blocked-term') || payload.data?.spamFlags?.includes('blocked-term'),
    `Blocked spam registration did not expose blocked-term flag: ${serialized}`,
  );
  return payload;
};

const assertOpenApiFormSubmissionContract = async () => {
  const openapi = await requestApi(`/api/sites/${SITE_ID}/openapi`);
  const submissionsPath = openapi.paths?.[`/api/sites/${SITE_ID}/forms/{formId}/submissions`];
  const requestSchemaRef = submissionsPath?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
  assert(
    requestSchemaRef === '#/components/schemas/FormSubmissionRequest',
    `Form submission OpenAPI request schema is not reusable/typed: ${JSON.stringify(requestSchemaRef)}`,
  );

  const requestSchema = openapi.components?.schemas?.FormSubmissionRequest;
  assert(
    requestSchema?.properties?.values && requestSchema.properties.fields && requestSchema.properties.data && requestSchema.properties.submission,
    `Form submission OpenAPI request schema does not expose payload aliases: ${JSON.stringify(requestSchema)}`,
  );
  assert(
    requestSchema?.properties?.captchaToken &&
      requestSchema.properties.turnstileToken &&
      requestSchema.properties.hcaptchaToken &&
      requestSchema.properties['g-recaptcha-response'] &&
      requestSchema.properties['cf-turnstile-response'],
    `Form submission OpenAPI request schema does not expose captcha token aliases: ${JSON.stringify(requestSchema)}`,
  );
  assert(
    requestSchema.additionalProperties === true,
    `Form submission OpenAPI request schema does not allow direct field-key payloads: ${JSON.stringify(requestSchema)}`,
  );

  const validationResponse = submissionsPath?.post?.responses?.['422']?.content?.['application/json']?.schema?.$ref;
  assert(
    validationResponse === '#/components/schemas/FormSubmissionValidationErrorEnvelope',
    `Form submission OpenAPI 422 response is not the validation envelope: ${JSON.stringify(validationResponse)}`,
  );
  const validationDetail = openapi.components?.schemas?.FormSubmissionValidationDetail;
  assert(
    validationDetail?.properties?.field &&
      validationDetail.properties.code?.enum?.includes('min_length') &&
      validationDetail.properties.message &&
      validationDetail.properties.label,
    `Form submission OpenAPI validation detail is not machine-readable: ${JSON.stringify(validationDetail)}`,
  );

  const eventFilters = new Set((openapi.paths?.[`/api/sites/${SITE_ID}/events`]?.get?.parameters || []).map((parameter) => parameter.name));
  assert(
    eventFilters.has('kind') && eventFilters.has('requestId') && eventFilters.has('formId') && eventFilters.has('commentId') && eventFilters.has('contactId'),
    `Interaction events OpenAPI filters are incomplete: ${JSON.stringify(Array.from(eventFilters))}`,
  );
};

const waitForWebhookDelivery = async (receiver, formId, submission, expectedStatus = 'succeeded', requestId = submission.requestId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const delivery = receiver.deliveries.find((item) => (
      item.payload?.submissionId === submission.id &&
      item.payload?.formId === formId &&
      !item.payload?.kind &&
      (expectedStatus === 'succeeded' ? item.payload.retry === true || item.headers['x-backy-webhook-retry'] === 'true' : item.payload.retry !== true)
    ));
    const query = new URLSearchParams({
      kind: 'form-submission',
      formId,
      limit: '20',
    });
    if (requestId) {
      query.set('requestId', requestId);
    }
    const payload = await requestApi(`/api/sites/${SITE_ID}/events?${query.toString()}`);
    const events = payload.data?.events || payload.events || [];
    const webhookEvents = events.filter((event) => event.metadata?.channel !== 'email');
    const queued = webhookEvents.find((event) => event.status === 'queued' && event.submissionId === submission.id);
    const completed = webhookEvents.find((event) => event.status === expectedStatus && event.submissionId === submission.id);

    if (delivery && queued && completed) {
      assert(
        delivery.headers['x-backy-site-id'] === SITE_ID &&
          delivery.headers['x-backy-form-id'] === formId &&
          delivery.headers['x-backy-submission-id'] === submission.id,
        `Webhook receiver did not get Backy headers: ${JSON.stringify(delivery.headers)}`,
      );
      if (expectedStatus === 'succeeded') {
        assert(delivery.headers['x-backy-webhook-retry'] === 'true', `Retry webhook header missing: ${JSON.stringify(delivery.headers)}`);
        assert(Number(completed.statusCode) === 200, `Retry event did not record status 200: ${JSON.stringify(completed)}`);
      } else {
        assert(Number(completed.statusCode) === 503, `Initial failed event did not record status 503: ${JSON.stringify(completed)}`);
      }
      return {
        delivery,
        events: webhookEvents,
      };
    }

    await sleep(250);
  }

  throw new Error(`Webhook delivery did not complete for ${submission.id}: ${JSON.stringify(receiver.deliveries.slice(-5))}`);
};

const waitForEmailNotification = async (formId, submission) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const payload = await requestApi(`/api/sites/${SITE_ID}/events?kind=form-submission&formId=${encodeURIComponent(formId)}&requestId=${encodeURIComponent(submission.requestId)}&limit=50`);
    const events = payload.data?.events || payload.events || [];
    const emailEvents = events.filter((event) => event.submissionId === submission.id && event.metadata?.channel === 'email');
    const queued = emailEvents.find((event) => event.status === 'queued');
    const completed = emailEvents.find((event) => event.status === EXPECTED_EMAIL_INITIAL_STATUS);

    if (queued && completed) {
      assert(completed.target === 'mailto:forms-smoke-leads@example.com', `Email notification target mismatch: ${JSON.stringify(completed)}`);
      assert(completed.metadata?.provider === EXPECTED_EMAIL_PROVIDER, `Email notification provider mismatch: ${JSON.stringify(completed)}`);
      if (EXPECTED_EMAIL_PROVIDER === 'local-outbox' && EXPECTED_EMAIL_INITIAL_STATUS === 'succeeded') {
        assert(completed.metadata?.outboxOnly === true, `Email notification did not record local outbox handoff: ${JSON.stringify(completed)}`);
      }
      assert(Number(completed.statusCode) === EXPECTED_EMAIL_STATUS_CODE, `Email notification did not record expected status: ${JSON.stringify(completed)}`);
      return {
        delivery: completed,
        events: emailEvents,
      };
    }

    await sleep(250);
  }

  throw new Error(`Email notification events did not complete for ${submission.id}`);
};

const assertDeliveryPanelShowsEmail = async (client, submissionId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="forms-webhook-delivery-panel"]');
      const text = panel?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      if (panel && ${attempt % 20 === 0 ? 'true' : 'false'}) {
        const refresh = Array.from(panel.querySelectorAll('button')).find((button) => (
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          (button.textContent || '').replace(/\\s+/g, ' ').trim().includes('Refresh delivery')
        ));
        refresh?.click();
      }
      return {
        ok: Boolean(panel) &&
          text.includes(${JSON.stringify(submissionId)}) &&
          text.includes('email') &&
          text.includes('mailto:forms-smoke-leads@example.com'),
        text: text.slice(0, 800),
      };
    })()`);
    if (result.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Delivery panel did not render email notification event: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
};

const retryEmailDeliveryInUi = async (client, formId, submission) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const submissionId = ${JSON.stringify(submission.id)};
      const panel = document.querySelector('[data-testid="forms-webhook-delivery-panel"]');
      const button = panel
        ? Array.from(panel.querySelectorAll('button')).find((candidate) => (
          (candidate.getAttribute('aria-label') || '') === 'Retry email notification delivery ' + submissionId &&
          candidate instanceof HTMLButtonElement &&
          !candidate.disabled
        ))
        : null;
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        return { ok: true, clicked: true };
      }
      return {
        ok: false,
        hasPanel: Boolean(panel),
        panelText: panel?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 500) || null,
        buttons: panel ? Array.from(panel.querySelectorAll('button')).map((candidate) => ({
          label: candidate.getAttribute('aria-label') || candidate.textContent || '',
          disabled: candidate.disabled,
        })) : [],
      };
    })()`);

    if (result.ok) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Unable to retry email delivery in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const payload = await requestApi(`/api/sites/${SITE_ID}/events?kind=form-submission&formId=${encodeURIComponent(formId)}&limit=50`);
    const events = payload.data?.events || payload.events || [];
    const delivery = events.find((event) => (
      event.status === 'succeeded' &&
      event.submissionId === submission.id &&
      event.metadata?.channel === 'email' &&
      event.metadata?.retry === true
    ));

    if (delivery) {
      assert(Number(delivery.statusCode) === EXPECTED_EMAIL_RETRY_STATUS_CODE, `UI email retry event did not record expected status: ${JSON.stringify(delivery)}`);
      return {
        delivery,
        events,
      };
    }

    await sleep(250);
  }

  throw new Error(`UI email retry did not record a successful retry event for ${submission.id}`);
};

const assertConsentExportInUi = async (client, submissionId) => {
  const result = await evaluate(client, `(() => {
    const submissionId = ${JSON.stringify(submissionId)};
    const panel = document.querySelector('[data-testid="forms-consent-export-panel"]');
    const text = panel?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const button = panel
      ? Array.from(panel.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Export consent CSV'
      ))
      : null;
    const anonymizeButton = panel?.querySelector('[data-testid="forms-consent-anonymize-due-button"]') || null;

    if (button instanceof HTMLButtonElement && !button.disabled) {
      button.click();
    }

    return {
      ok: Boolean(panel) &&
        text.includes('Consent export') &&
        text.includes('Consent fields') &&
        text.includes('Granted') &&
        text.includes('1') &&
        text.includes('Delete/anonymize after 365 days') &&
        text.includes('Privacy requests: privacy@example.com') &&
        text.includes('Exports omit IP hash and user-agent') &&
        text.includes('Registration consent policy') &&
        button instanceof HTMLButtonElement &&
        anonymizeButton instanceof HTMLButtonElement &&
        anonymizeButton.disabled &&
        !button.disabled,
      text: text.slice(0, 800),
      buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
      anonymizeDisabled: anonymizeButton instanceof HTMLButtonElement ? anonymizeButton.disabled : null,
      hasSubmission: document.body?.innerText?.includes(submissionId) || false,
    };
  })()`);
  assert(result.ok, `Consent export panel did not render enabled consent export: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const notice = await evaluate(client, `(() => document.body?.innerText?.includes('Consent CSV exported with') || false)()`);
    if (notice) return;
    await sleep(250);
  }

  throw new Error('Consent export action did not show the expected notice');
};

const assertConsentRetentionApi = async (formId, submissionId) => {
  const futureNow = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
  const formDryRunPayload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/consent-retention`, {
    method: 'POST',
    body: JSON.stringify({ now: futureNow, dryRun: true, actor: 'forms-smoke' }),
  });
  const formDryRun = formDryRunPayload.data || {};
  assert(formDryRun.scanned >= 1, `Per-form consent retention dry run did not scan submissions: ${JSON.stringify(formDryRun)}`);
  assert(formDryRun.due >= 1, `Per-form consent retention dry run did not find due submissions: ${JSON.stringify(formDryRun)}`);

  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/consent-retention`, {
    method: 'POST',
    body: JSON.stringify({ now: futureNow, actor: 'forms-smoke-scheduled' }),
  });
  const result = payload.data || {};
  assert(result.scannedSubmissions >= 1, `Consent retention did not scan submissions: ${JSON.stringify(result)}`);
  assert(result.due >= 1, `Consent retention did not find due submissions: ${JSON.stringify(result)}`);
  assert(result.anonymized >= 1, `Consent retention did not anonymize submissions: ${JSON.stringify(result)}`);
  assert(
    Array.isArray(result.results) && result.results.some((item) => item.formId === formId && item.anonymized >= 1),
    `Scheduled consent retention did not report the target form: ${JSON.stringify(result.results)}`,
  );

  const detail = await getFormWithSubmissions(formId);
  const updated = detail.submissions.find((submission) => submission.id === submissionId);
  assert(updated, `Anonymized submission was not returned by form detail: ${submissionId}`);
  assert(updated.values?.consent === null, `Consent field was not anonymized: ${JSON.stringify(updated.values)}`);
  assert(updated.ipHash === null || updated.ipHash === undefined, `Submission ipHash was not scrubbed: ${JSON.stringify(updated)}`);
  assert(updated.userAgent === null || updated.userAgent === undefined, `Submission userAgent was not scrubbed: ${JSON.stringify(updated)}`);
  assert(
    typeof updated.adminNotes === 'string' && updated.adminNotes.includes('Consent evidence anonymized by forms-smoke-scheduled'),
    `Anonymization audit note missing: ${JSON.stringify(updated.adminNotes)}`,
  );
  return { ...result, submission: updated };
};

const retryWebhookDeliveryInUi = async (client, formId, submission) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const submissionId = ${JSON.stringify(submission.id)};
      const panel = document.querySelector('[data-testid="forms-webhook-delivery-panel"]');
      const button = panel
        ? Array.from(panel.querySelectorAll('button')).find((candidate) => (
          (candidate.getAttribute('aria-label') || '') === 'Retry webhook delivery ' + submissionId &&
          candidate instanceof HTMLButtonElement &&
          !candidate.disabled
        ))
        : null;
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        return { ok: true, clicked: true };
      }
      return {
        ok: false,
        hasPanel: Boolean(panel),
        panelText: panel?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 500) || null,
        buttons: panel ? Array.from(panel.querySelectorAll('button')).map((candidate) => ({
          label: candidate.getAttribute('aria-label') || candidate.textContent || '',
          disabled: candidate.disabled,
        })) : [],
      };
    })()`);

    if (result.ok) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Unable to retry webhook delivery in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const payload = await requestApi(`/api/sites/${SITE_ID}/events?kind=form-submission&formId=${encodeURIComponent(formId)}&limit=50`);
    const events = payload.data?.events || payload.events || [];
    const delivery = events.find((event) => (
      event.status === 'succeeded' &&
      event.submissionId === submission.id &&
      event.metadata?.retry === true &&
      event.metadata?.channel !== 'email'
    ));

    if (delivery) {
      assert(Number(delivery.statusCode) === 200, `UI retry event did not record status 200: ${JSON.stringify(delivery)}`);
      return {
        delivery,
        events,
      };
    }

    await sleep(250);
  }

  throw new Error(`UI webhook retry did not record a successful retry event for ${submission.id}`);
};

const refreshForms = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Refresh forms'
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, button: button?.textContent || null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to refresh forms UI: ${JSON.stringify(result)}`);
  await sleep(1000);
};

const createEmbedBlockInUi = async (client, formId) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="forms-create-embed-block-button"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          body: document.body?.innerText?.slice(0, 800) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (result.ok) break;

    if (attempt === 99) {
      throw new Error(`Unable to click Save embed block: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const created = sections.find((section) => (
      section.sourceElementId === formId &&
      section.category === 'forms' &&
      section.metadata?.formEmbedBlock?.formId === formId
    ));
    const state = await evaluate(client, `(() => ({
      result: Boolean(document.querySelector('[data-testid="forms-embed-block-result"]')),
      notice: document.body?.innerText?.includes('saved to reusable sections') || false,
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);

    if (created && state.result) {
      assert(created.content?.elements?.[0]?.type === 'form', `Embed section does not contain a form element: ${JSON.stringify(created.content)}`);
      assert(created.content.elements[0].props?.formId === formId, `Embed formId not preserved: ${JSON.stringify(created.content.elements[0].props)}`);
      const embedProps = created.content.elements[0].props || {};
      assert(Array.isArray(embedProps.fields) && embedProps.fields.length > 0, `Embed form schema props missing: ${JSON.stringify(embedProps)}`);
      assert(embedProps.formAudience, `Embed formAudience prop missing: ${JSON.stringify(embedProps)}`);
      assert(Object.prototype.hasOwnProperty.call(embedProps, 'formActive'), `Embed formActive prop missing: ${JSON.stringify(embedProps)}`);
      assert(Object.prototype.hasOwnProperty.call(embedProps, 'enableHoneypot'), `Embed honeypot prop missing: ${JSON.stringify(embedProps)}`);
      assert(Object.prototype.hasOwnProperty.call(embedProps, 'enableCaptcha'), `Embed captcha prop missing: ${JSON.stringify(embedProps)}`);
      assert(Object.prototype.hasOwnProperty.call(embedProps, 'notificationEmail'), `Embed notification email prop missing: ${JSON.stringify(embedProps)}`);
      assert(Object.prototype.hasOwnProperty.call(embedProps, 'notificationWebhook'), `Embed notification webhook prop missing: ${JSON.stringify(embedProps)}`);
      if (embedProps.contactShare?.enabled) {
        assert(embedProps.contactShareEnabled === true, `Embed contact-share flattened props missing: ${JSON.stringify(embedProps)}`);
        assert(embedProps.contactShareEmailField || embedProps.contactSharePhoneField, `Embed contact-share identity props missing: ${JSON.stringify(embedProps)}`);
      }
      if (embedProps.collectionTarget?.enabled) {
        assert(embedProps.collectionWriteEnabled === true, `Embed collection-write flattened props missing: ${JSON.stringify(embedProps)}`);
        assert(embedProps.collectionWriteCollectionId === embedProps.collectionTarget.collectionId, `Embed collection-write collection id mismatch: ${JSON.stringify(embedProps)}`);
        assert(embedProps.collectionWriteFieldMap, `Embed collection-write field map missing: ${JSON.stringify(embedProps)}`);
      }
      assert(created.metadata?.frontendDesignTemplateId, `Embed frontend design metadata missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.formEmbedBlock?.definitionUrl?.includes(`/forms/${formId}/definition`), `Definition URL missing from embed metadata: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.formEmbedBlock?.fields) && created.metadata.formEmbedBlock.fields.length === embedProps.fields.length, `Embed metadata form schema missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.formEmbedBlock?.notificationEmail === embedProps.notificationEmail, `Embed metadata notification email mismatch: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.formEmbedBlock?.enableHoneypot === embedProps.enableHoneypot, `Embed metadata honeypot mismatch: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.formEmbedBlock?.contactShare?.enabled === embedProps.contactShare?.enabled, `Embed metadata contact-share mismatch: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.formEmbedBlock?.collectionTarget?.enabled === embedProps.collectionTarget?.enabled, `Embed metadata collection target mismatch: ${JSON.stringify(created.metadata)}`);
      return created;
    }

    if (attempt === 99) {
      throw new Error(`Reusable embed block was not created: ${JSON.stringify({ sections: sections.slice(0, 5), state })}`);
    }

    await sleep(250);
  }

  return null;
};

const assertFormsAnalytics = async (client, formId, submissionId) => {
  const analytics = await getFormsAnalytics();
  const form = analytics?.forms?.find((entry) => entry.formId === formId);
  assert(analytics?.summary?.submissions >= 1, `Forms analytics did not count submissions: ${JSON.stringify(analytics)}`);
  assert(form?.submissions >= 1, `Forms analytics did not count selected form: ${JSON.stringify(analytics?.forms)}`);
  assert(
    analytics.trend.some((point) => point.total >= 1),
    `Forms analytics trend did not include a submission: ${JSON.stringify(analytics.trend)}`,
  );
  assert(analytics.leads?.summary, `Forms analytics did not include lead segmentation summary: ${JSON.stringify(analytics).slice(0, 700)}`);
  assert(Array.isArray(analytics.leads?.segments), `Forms analytics did not include lead segments: ${JSON.stringify(analytics?.leads).slice(0, 700)}`);
  assert(Array.isArray(analytics.leads?.savedLists), `Forms analytics did not include saved lead list analytics: ${JSON.stringify(analytics?.leads).slice(0, 700)}`);

  const state = await evaluate(client, `(() => ({
    panel: Boolean(document.querySelector('[data-testid="forms-analytics-panel"]')),
    trend: Boolean(document.querySelector('[data-testid="forms-analytics-trend"]')),
    topForms: Boolean(document.querySelector('[data-testid="forms-analytics-top-forms"]')),
    leadAnalytics: Boolean(document.querySelector('[data-testid="forms-lead-analytics"]')),
    savedListAnalytics: Boolean(document.querySelector('[data-testid="forms-saved-list-analytics"]')),
    body: document.body?.innerText || '',
  }))()`);
  assert(state.panel && state.trend && state.topForms && state.leadAnalytics && state.savedListAnalytics, `Forms analytics panel missing expected regions: ${JSON.stringify(state).slice(0, 800)}`);
  assert(state.body.includes('Submission analytics'), 'Forms analytics title is not rendered');
  assert(state.body.includes('Lead segments'), 'Forms lead segments analytics are not rendered');
  assert(state.body.includes('Saved lead lists'), 'Forms saved lead list analytics are not rendered');
  assert(state.body.includes(submissionId) || state.body.includes('Registration edited'), 'Forms analytics/top form context is not rendered');

  return analytics;
};

const assertFormsAuditTrail = async (client, formId, submissionId) => {
  const logs = await getAdminAuditLogs();
  const formLogs = logs.filter((log) => log.entity === 'form' && log.entityId === formId);
  const submissionLogs = logs.filter((log) => log.entity === 'formSubmission' && log.entityId === submissionId);
  const embedLogs = logs.filter((log) => (
    log.entity === 'reusableSection' &&
    log.action === 'reusableSection.create' &&
    log.metadata?.source === 'form-embed-block' &&
    log.metadata?.formId === formId
  ));
  assert(formLogs.some((log) => log.action === 'form.create' && log.requestId), `Form create audit log missing request id: ${JSON.stringify(formLogs)}`);
  assert(formLogs.some((log) => log.action === 'form.update' && log.requestId), `Form update audit log missing request id: ${JSON.stringify(formLogs)}`);
  assert(submissionLogs.some((log) => log.action === 'formSubmission.review' && log.requestId), `Submission review audit log missing request id: ${JSON.stringify(submissionLogs)}`);
  assert(embedLogs.some((log) => log.requestId), `Form embed audit log missing request id: ${JSON.stringify(embedLogs)}`);

  const state = await evaluate(client, `(() => ({
    panel: Boolean(document.querySelector('[data-testid="forms-audit-panel"]')),
    list: Boolean(document.querySelector('[data-testid="forms-audit-list"]')),
    body: document.querySelector('[data-testid="forms-audit-panel"]')?.innerText || '',
  }))()`);
  assert(state.panel && state.list, `Forms audit panel missing expected regions: ${JSON.stringify(state).slice(0, 800)}`);
  assert(state.body.includes('Forms activity'), 'Forms audit panel title is not rendered');
  assert(
    state.body.includes('Form updated') || state.body.includes('Submission reviewed') || state.body.includes('Embed block saved'),
    `Forms audit panel did not render expected audit actions: ${JSON.stringify(state).slice(0, 800)}`,
  );

  return {
    form: formLogs.length,
    submission: submissionLogs.length,
    embed: embedLogs.length,
  };
};

const approveSubmissionInUi = async (client, formId, submissionId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const submissionId = ${JSON.stringify(submissionId)};
      const card = Array.from(document.querySelectorAll('[aria-label^="Select submission"], div')).find((candidate) => (
        (candidate.textContent || '').includes(submissionId)
      ));
      const toolbar = document.querySelector('[data-testid="forms-submission-bulk-toolbar"]');
      const status = document.querySelector('[data-testid="forms-submission-bulk-action-status"]');
      const selectionSummary = document.querySelector('[data-testid="forms-submission-bulk-selection-summary"]');
      const checkbox = document.querySelector('input[aria-label="Select submission ' + submissionId + '"]');
      const approve = document.querySelector('[data-testid="forms-submission-bulk-approve"]');
      const reject = document.querySelector('[data-testid="forms-submission-bulk-reject"]');
      const spam = document.querySelector('[data-testid="forms-submission-bulk-spam"]');
      if (
        !(toolbar instanceof HTMLElement) ||
        !(status instanceof HTMLElement) ||
        !(selectionSummary instanceof HTMLElement) ||
        !(checkbox instanceof HTMLInputElement) ||
        !(approve instanceof HTMLButtonElement) ||
        !(reject instanceof HTMLButtonElement) ||
        !(spam instanceof HTMLButtonElement)
      ) {
        return {
          ok: false,
          reason: 'bulk-controls-missing',
          hasSubmission: Boolean(card),
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      }

      const statusId = status.id || '';
      const initial = {
        role: toolbar.getAttribute('role') || '',
        label: toolbar.getAttribute('aria-label') || '',
        describedBy: toolbar.getAttribute('aria-describedby') || '',
        statusId,
        statusText: (status.textContent || '').replace(/\\s+/g, ' ').trim(),
        statusData: toolbar.getAttribute('data-action-status') || '',
        actionState: toolbar.getAttribute('data-action-state') || '',
        selectedCount: toolbar.getAttribute('data-selected-count') || '',
        visibleSelectedCount: toolbar.getAttribute('data-visible-selected-count') || '',
        hiddenSelectedCount: toolbar.getAttribute('data-hidden-selected-count') || '',
        selectionSummary: (selectionSummary.textContent || '').replace(/\\s+/g, ' ').trim(),
        approveState: approve.getAttribute('data-action-state') || '',
        approveReason: approve.getAttribute('data-disabled-reason') || '',
        approveDescribedBy: approve.getAttribute('aria-describedby') || '',
        rejectState: reject.getAttribute('data-action-state') || '',
        spamState: spam.getAttribute('data-action-state') || '',
      };

      if (!checkbox.checked) {
        if (
          initial.role !== 'group' ||
          initial.label !== 'Selected submission bulk actions' ||
          !initial.describedBy.includes(statusId) ||
          initial.statusText !== initial.statusData ||
          initial.actionState !== 'blocked' ||
          initial.selectedCount !== '0' ||
          initial.visibleSelectedCount !== '0' ||
          !initial.selectionSummary.startsWith('0 selected') ||
          initial.approveState !== 'blocked' ||
          !initial.approveReason.includes('Select one or more loaded submissions first') ||
          initial.approveDescribedBy !== statusId
        ) {
          return { ok: false, reason: 'initial-bulk-status', initial };
        }
        checkbox.click();
        return { ok: false, clickedSelection: true, initial };
      }

      const clear = document.querySelector('[data-testid="forms-submission-bulk-clear-selection"]');
      const selected = {
        statusText: (status.textContent || '').replace(/\\s+/g, ' ').trim(),
        statusData: toolbar.getAttribute('data-action-status') || '',
        actionState: toolbar.getAttribute('data-action-state') || '',
        selectedCount: toolbar.getAttribute('data-selected-count') || '',
        visibleSelectedCount: toolbar.getAttribute('data-visible-selected-count') || '',
        hiddenSelectedCount: toolbar.getAttribute('data-hidden-selected-count') || '',
        selectionSummary: (selectionSummary.textContent || '').replace(/\\s+/g, ' ').trim(),
        approveState: approve.getAttribute('data-action-state') || '',
        approveReason: approve.getAttribute('data-disabled-reason') || '',
        approveDescribedBy: approve.getAttribute('aria-describedby') || '',
        rejectState: reject.getAttribute('data-action-state') || '',
        rejectDescribedBy: reject.getAttribute('aria-describedby') || '',
        spamState: spam.getAttribute('data-action-state') || '',
        spamDescribedBy: spam.getAttribute('aria-describedby') || '',
        clearState: clear?.getAttribute('data-action-state') || '',
        clearDescribedBy: clear?.getAttribute('aria-describedby') || '',
      };
      if (
        selected.statusText !== selected.statusData ||
        selected.actionState !== 'ready' ||
        selected.selectedCount !== '1' ||
        selected.visibleSelectedCount !== '1' ||
        !selected.selectionSummary.startsWith('1 selected') ||
        !selected.statusText.includes('1 selected submission') ||
        selected.approveState !== 'ready' ||
        selected.approveReason !== '' ||
        selected.approveDescribedBy !== statusId ||
        selected.rejectState !== 'ready' ||
        selected.rejectDescribedBy !== statusId ||
        selected.spamState !== 'ready' ||
        selected.spamDescribedBy !== statusId ||
        selected.clearState !== 'ready' ||
        selected.clearDescribedBy !== statusId
      ) {
        return { ok: false, reason: 'selected-bulk-status', selected };
      }

      approve.click();
      return { ok: true, clicked: 'bulk-approve', selected };
    })()`);

    if (result.ok) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Unable to approve submission in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const detail = await getFormWithSubmissions(formId);
    const submission = detail.submissions.find((item) => item.id === submissionId);
    if (submission?.status === 'approved') {
      return submission;
    }
    await sleep(250);
  }

  throw new Error(`Submission ${submissionId} was not approved after UI action`);
};

const assertCreateActionsReady = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const createStatus = document.querySelector('[data-testid="forms-create-action-status"]');
      const createStatusId = createStatus?.id || '';
      const createStatusText = (createStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
      const commandCreate = document.querySelector('[data-testid="forms-create-blank-button"]');
      const templateCreate = document.querySelector('[data-testid="forms-template-create-blank-button"]');
      const frontendCreate = document.querySelector('[data-testid="forms-frontend-template-${FRONTEND_FORM_TEMPLATE_ID}"]');
      const createButtons = [commandCreate, templateCreate, frontendCreate];
      const contracts = createButtons.map((button) => ({
        exists: button instanceof HTMLButtonElement,
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        describedBy: button instanceof HTMLElement ? button.getAttribute('aria-describedby') || '' : '',
        actionState: button instanceof HTMLElement ? button.getAttribute('data-action-state') || '' : '',
        actionStatus: button instanceof HTMLElement ? button.getAttribute('data-action-status') || '' : '',
        disabledReason: button instanceof HTMLElement ? button.getAttribute('data-disabled-reason') || '' : '',
        targetSiteId: button instanceof HTMLElement ? button.getAttribute('data-target-site-id') || '' : '',
      }));
      return {
        ready: createStatus instanceof HTMLElement &&
          createStatusId === 'forms-create-action-status' &&
          createStatusText.includes('New blank form available for ${SITE_ID}.') &&
          contracts.every((contract) => (
            contract.exists &&
            contract.disabled === false &&
            contract.describedBy === createStatusId &&
            contract.actionState === 'ready' &&
            contract.disabledReason === '' &&
            contract.targetSiteId === '${SITE_ID}' &&
            contract.actionStatus.includes('available for ${SITE_ID}.')
          )),
        statusText: createStatusText,
        contracts,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready) return state;
    if (attempt === 79) throw new Error(`Forms create actions did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const accountContractPanel = document.querySelector('[data-testid="forms-account-contract"]');
    const accountHandoffDetails = document.querySelector('[data-testid="forms-account-registration-handoff-details"]');
    const accountHandoffText = accountContractPanel?.textContent || '';
    const persistencePanel = document.querySelector('[data-testid="forms-persistence-certification"]');
    const persistenceDetails = document.querySelector('[data-testid="forms-persistence-certification-details"]');
    const persistenceText = persistencePanel?.textContent || '';
    const controlMapDetails = document.querySelector('[data-testid="forms-control-map-details"]');
    const frontendContractDetails = document.querySelector('[data-testid="forms-frontend-contract-details"]');
    const createStatus = document.querySelector('[data-testid="forms-create-action-status"]');
    const createStatusId = createStatus?.id || '';
    const createStatusText = (createStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
    const firstPrimaryActionText = (document.querySelector('[data-testid="forms-primary-actions"] button')?.textContent || '').replace(/\\s+/g, ' ').trim();
    const secondaryActions = document.querySelector('[data-testid="forms-secondary-actions"]');
    const secondaryStatus = document.querySelector('[data-testid="forms-command-secondary-action-status"]');
    const secondaryStatusId = secondaryStatus?.id || '';
    const readCommandAction = (testId) => {
      const element = document.querySelector('[data-testid="' + testId + '"]');
      return {
        exists: element instanceof HTMLElement,
        describedBy: element instanceof HTMLElement ? element.getAttribute('aria-describedby') || '' : '',
        actionState: element instanceof HTMLElement ? element.getAttribute('data-action-state') || '' : '',
        actionStatus: element instanceof HTMLElement ? element.getAttribute('data-action-status') || '' : '',
        disabledReason: element instanceof HTMLElement ? element.getAttribute('data-disabled-reason') || '' : '',
        disabled: element instanceof HTMLButtonElement ? element.disabled : null,
      };
    };
    const commandCreate = document.querySelector('[data-testid="forms-create-blank-button"]');
    const templateCreate = document.querySelector('[data-testid="forms-template-create-blank-button"]');
    const frontendCreate = document.querySelector('[data-testid="forms-frontend-template-${FRONTEND_FORM_TEMPLATE_ID}"]');
    const createButtons = [commandCreate, templateCreate, frontendCreate];
    const createButtonContracts = createButtons.map((button) => ({
      exists: button instanceof HTMLButtonElement,
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      describedBy: button instanceof HTMLElement ? button.getAttribute('aria-describedby') || '' : '',
      actionState: button instanceof HTMLElement ? button.getAttribute('data-action-state') || '' : '',
      actionStatus: button instanceof HTMLElement ? button.getAttribute('data-action-status') || '' : '',
      disabledReason: button instanceof HTMLElement ? button.getAttribute('data-disabled-reason') || '' : '',
      targetSiteId: button instanceof HTMLElement ? button.getAttribute('data-target-site-id') || '' : '',
    }));
    const isCollapsedDetails = (element) => (
      element instanceof HTMLDetailsElement &&
      element.open === false &&
      element.getAttribute('data-default-collapsed') === 'true'
    );
    const persistenceCertification = {
      panel: Boolean(persistencePanel),
      details: Boolean(persistenceDetails),
      detailsCollapsed: isCollapsedDetails(persistenceDetails),
      runtimeEvidence: Boolean(document.querySelector('[data-testid="forms-persistence-runtime-evidence"]')),
      scenarioEvidence: Boolean(document.querySelector('[data-testid="forms-persistence-scenario-evidence"]')),
      commandBuilder: Boolean(document.querySelector('[data-testid="forms-postgres-certification-command-builder"]')),
      envCopyButton: Boolean(document.querySelector('[data-testid="forms-postgres-certification-env-copy-button"]')),
      envTemplate: Boolean(document.querySelector('[data-testid="forms-postgres-certification-env-template"]')),
      envTemplateBody: Boolean(document.querySelector('[data-testid="forms-postgres-certification-env-template-body"]')),
      commandCopyButton: Boolean(document.querySelector('[data-testid="forms-postgres-certification-command-builder-copy-button"]')),
      requiredInputs: Boolean(document.querySelector('[data-testid="forms-postgres-certification-required-inputs"]')),
      title: persistenceText.includes('Persistence certification'),
      runtimeEvidenceText: persistenceText.includes('Runtime evidence'),
      scenarioEvidenceText: persistenceText.includes('Persistence scenario evidence'),
      scenarioSchema: persistenceText.includes('backy.forms-persistence-scenario-evidence.v1'),
      envTemplateSchema: persistenceText.includes('backy.forms-postgres-certification-env-template.v1'),
      publicSubmissionScenario: persistenceText.includes('Public submission intake'),
      collectionRoutingScenario: persistenceText.includes('Collection routing'),
      commandBuilderText: persistenceText.includes('Postgres certification command builder'),
      envTemplateText: persistenceText.includes('Env template') || persistenceText.includes('ENV TEMPLATE'),
      copyEnvTemplateText: persistenceText.includes('Copy env template'),
      databaseUrlPlaceholder: persistenceText.includes('BACKY_DATABASE_URL=<disposable-postgres-url>'),
      disposableConfirmation: persistenceText.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'),
      releaseDoctorEnv: persistenceText.includes('BACKY_RELEASE_CERTIFY_DATABASE'),
      targetGuardHost: persistenceText.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'),
      secretBoundary: persistenceText.includes('Database URLs and credentials are never returned'),
      formsPostgresGate: persistenceText.includes('test:forms-postgres'),
      downloadButton: Boolean(document.querySelector('[data-testid="forms-persistence-certification-download-button"]')),
      copyButton: Boolean(document.querySelector('[data-testid="forms-persistence-certification-copy-button"]')),
      downloadButtonText: bodyText.includes('Download DB JSON'),
    };
    return {
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="forms-command-center"]')),
    firstPrimaryActionText,
    secondaryActionsCollapsed: secondaryActions instanceof HTMLDetailsElement &&
      secondaryActions.open === false &&
      secondaryActions.getAttribute('data-default-collapsed') === 'true',
    hasMoreActionsTrigger: Boolean(document.querySelector('[data-testid="forms-more-actions"]')),
    hasCommandHandoffActionsNested: Boolean(
      document.querySelector('[data-testid="forms-secondary-action-menu"] [data-testid="forms-command-copy-manifest"]') &&
      document.querySelector('[data-testid="forms-secondary-action-menu"] [data-testid="forms-command-download-json"]'),
    ),
    secondaryActionStatus: {
      exists: secondaryStatus instanceof HTMLElement,
      statusId: secondaryStatusId,
      statusText: (secondaryStatus?.textContent || '').replace(/\\s+/g, ' ').trim(),
      groupState: secondaryActions instanceof HTMLElement ? secondaryActions.getAttribute('data-action-state') || '' : '',
      groupStatus: secondaryActions instanceof HTMLElement ? secondaryActions.getAttribute('data-action-status') || '' : '',
      groupDescribedBy: secondaryActions instanceof HTMLElement ? secondaryActions.getAttribute('aria-describedby') || '' : '',
      copy: readCommandAction('forms-command-copy-manifest'),
      download: readCommandAction('forms-command-download-json'),
    },
    createActionStatus: {
      exists: createStatus instanceof HTMLElement,
      statusId: createStatusId,
      statusText: createStatusText,
      statusExplainsState: createStatusText.includes('New blank form available for ${SITE_ID}.') || createStatusText.includes('New blank form unavailable:'),
      contracts: createButtonContracts,
      allConsistent: createButtonContracts.every((contract) => (
        contract.exists &&
        contract.describedBy === createStatusId &&
        contract.actionState === (contract.disabled ? 'blocked' : 'ready') &&
        (contract.disabled ? contract.disabledReason.length > 0 : contract.disabledReason === '') &&
        contract.targetSiteId === '${SITE_ID}' &&
        (
          contract.disabled
            ? contract.actionStatus.includes('unavailable:')
            : contract.actionStatus.includes('available for ${SITE_ID}.')
        )
      )),
    },
    hasControlMap: isCollapsedDetails(controlMapDetails) &&
      Boolean(document.querySelector('[data-testid="forms-control-map"]')) &&
      Boolean(document.querySelector('[data-testid="forms-control-map"] a[href="#forms-inbox"]')),
    hasFrontendContractSystems: isCollapsedDetails(frontendContractDetails) &&
      Boolean(document.querySelector('[data-testid="forms-frontend-contract-systems"]')) &&
      (document.querySelector('[data-testid="forms-frontend-contract-systems"]')?.textContent || '').includes('Dynamic form definition'),
    hasAnalytics: Boolean(document.querySelector('[data-testid="forms-analytics-panel"]')) &&
      bodyText.includes('Submission analytics'),
    hasAudit: Boolean(document.querySelector('[data-testid="forms-audit-panel"]')) &&
      bodyText.includes('Forms activity'),
    hasAccountContract: Boolean(accountContractPanel) &&
      isCollapsedDetails(accountHandoffDetails) &&
      Boolean(document.querySelector('[data-testid="forms-account-registration-handoff"]')) &&
      Boolean(document.querySelector('[data-testid="forms-account-registration-handoff-copy-button"]')) &&
      bodyText.includes('Registration/account handoff') &&
      bodyText.includes('Create registration form') &&
      accountHandoffText.includes('backy.form-account-registration-handoff.v1') &&
      bodyText.includes('Copy account handoff') &&
      accountHandoffText.includes('Users/Auth handoff'),
    persistenceCertification,
    hasPersistenceCertification: Object.values(persistenceCertification).every(Boolean),
    hasLaunchReadiness: Boolean(document.querySelector('[data-testid="forms-launch-readiness"]')) &&
      Boolean(document.querySelector('[data-testid="forms-launch-readiness-copy-button"]')) &&
      Boolean(document.querySelector('[data-testid="forms-launch-readiness-action-plan"]')) &&
      bodyText.includes('Form launch readiness') &&
      bodyText.includes('backy.form-launch-readiness.v1') &&
      bodyText.includes('Copy launch JSON') &&
      bodyText.includes('Selected form') &&
      bodyText.includes('Public API') &&
      bodyText.includes('Next action'),
    hasDeliveryPanel: Boolean(document.querySelector('[data-testid="forms-webhook-delivery-panel"]')) &&
      Boolean(document.querySelector('[data-testid="forms-delivery-handoff-copy-button"]')) &&
      bodyText.includes('Webhook delivery') &&
      bodyText.includes('backy.form-delivery-handoff.v1') &&
      bodyText.includes('Copy delivery JSON'),
    hasTemplates: bodyText.includes('Form templates') || false,
    hasInbox: bodyText.includes('Submission inbox') || false,
  };
  })()`);
  assert(layout.scrollWidth <= layout.width + 8, `Forms page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasControlMap && layout.hasFrontendContractSystems, `Forms command center collapsed maps are missing or open by default: ${JSON.stringify(layout)}`);
  assert(
    layout.firstPrimaryActionText === 'New blank form' &&
      layout.secondaryActionsCollapsed &&
      layout.hasMoreActionsTrigger &&
      layout.hasCommandHandoffActionsNested,
    `Forms command center action hierarchy regressed: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.secondaryActionStatus.exists &&
      layout.secondaryActionStatus.statusId === 'forms-command-secondary-action-status' &&
      layout.secondaryActionStatus.groupDescribedBy === layout.secondaryActionStatus.statusId &&
      ['ready', 'blocked'].includes(layout.secondaryActionStatus.groupState) &&
      layout.secondaryActionStatus.groupStatus === layout.secondaryActionStatus.statusText &&
      layout.secondaryActionStatus.statusText.includes('Copy manifest') &&
      layout.secondaryActionStatus.statusText.includes('Download JSON') &&
      [layout.secondaryActionStatus.copy, layout.secondaryActionStatus.download].every((action) => (
        action.exists &&
        action.describedBy === layout.secondaryActionStatus.statusId &&
        ['ready', 'blocked'].includes(action.actionState) &&
        action.actionState === (action.disabled ? 'blocked' : 'ready') &&
        (
          action.disabled
            ? action.actionStatus.includes('unavailable:') && action.disabledReason.length > 0
            : action.actionStatus.includes('available for') && action.disabledReason === ''
        )
      )),
    `Forms command center secondary actions missing ready action metadata: ${JSON.stringify(layout.secondaryActionStatus)}`,
  );
  assert(layout.createActionStatus.exists && layout.createActionStatus.statusExplainsState && layout.createActionStatus.allConsistent, `Forms create action status contract is missing or inconsistent: ${JSON.stringify(layout.createActionStatus)}`);
  assert(layout.hasCommandCenter && layout.hasAnalytics && layout.hasAudit && layout.hasAccountContract && layout.hasPersistenceCertification && layout.hasLaunchReadiness && layout.hasDeliveryPanel && layout.hasTemplates && layout.hasInbox, `Forms page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-forms-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanupBrowser = async ({ client, childProcess, userDataDir }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const runDeleteDialogSmoke = async () => {
  const form = await createDeleteDialogSmokeForm();
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    await navigateToForms(client, { formId: form.id, expectedText: form.title });
    await assertFormActionsWired(client);
    console.log(JSON.stringify({ ok: true, mode: 'delete-dialog', route: 'forms', formId: form.id }, null, 2));
  } finally {
    await deleteForm(form.id).catch(() => {});
    await cleanupBrowser({ client, childProcess, userDataDir });
  }
};

const main = async () => {
  assertFormsPersistenceCertificationSource();
  if (process.env.BACKY_FORMS_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, mode: 'source-only', route: 'forms' }, null, 2));
    return;
  }

  await loginAdminApi();
  const formsSmokeFixtureQuotaSettings = await temporarilyAllowFormsSmokeFixtureQuotas();
  if (process.env.BACKY_FORMS_DELETE_DIALOG_SMOKE === '1') {
    try {
      await runDeleteDialogSmoke();
      return;
    } finally {
      await restoreFormsSmokeFixtureQuotas(formsSmokeFixtureQuotaSettings).catch((error) => {
        console.warn('Unable to restore forms smoke fixture quota:', error instanceof Error ? error.message : error);
      });
    }
  }

  const suffix = Date.now().toString(36);
  let client;
  let childProcess = null;
  let userDataDir = null;
  let originalFrontendDesign = null;
  let beforeIds = new Set();
  let captchaHook = null;
  let smokeCollection = null;
  let webhookReceiver = null;
  let frontendCreatedFormId = null;
  let blankCreatedFormId = null;
  let createdFormId = null;
  let createdEmbedSectionId = null;
  let frontendCleaned = false;
  let blankCleaned = false;
  let cleaned = false;
  let embedCleaned = false;
  let collectionCleaned = false;
  let frontendTemplateForm = null;
  let webhookFailure = null;
  let webhookRetry = null;
  let webhookDelivery = null;
  let emailDelivery = null;
  let emailRetry = null;

  try {
    await assertFormsPermissionOverridesAreEnforced();
    await assertFormCreateFieldSanitization();
    await assertFormBillingLimitEnforced(suffix);
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());
    beforeIds = new Set((await listForms()).map((form) => form.id));
    captchaHook = await assertCaptchaProviderHook();
    smokeCollection = await createCollection();
    webhookReceiver = await startWebhookReceiver({ failFirstFormSubmission: true });
    ({ childProcess, userDataDir } = launchChrome());

    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    await navigateToForms(client);
    await assertCreateActionsReady(client);
    await clickBlankCreateForm(client);
    const blankCreated = await waitForBlankStandaloneForm(client, beforeIds);
    blankCreatedFormId = blankCreated.form.id;
    await deleteForm(blankCreatedFormId);
    blankCleaned = true;
    await navigateToForms(client);

    await clickFrontendTemplateCreateForm(client);
    frontendTemplateForm = await waitForFrontendTemplateForm(beforeIds);
    frontendCreatedFormId = frontendTemplateForm.id;
    frontendTemplateForm = await assertFrontendTemplateForm(frontendCreatedFormId);
    await deleteForm(frontendCreatedFormId);
    frontendCleaned = true;

    await clickRegistrationCreateForm(client);
    const created = await waitForCreatedForm(client, beforeIds);
    createdFormId = created.form.id;
    await assertFormActionsWired(client);
    await editFormBuilderInUi(client, createdFormId, smokeCollection.id, webhookReceiver.url);
    const embedSection = await createEmbedBlockInUi(client, createdFormId);
    createdEmbedSectionId = embedSection.id;

    const definition = await requestApi(`/api/sites/${SITE_ID}/forms/${createdFormId}/definition`);
    await assertOpenApiFormSubmissionContract();
    assert(definition.data?.form?.title === 'Registration edited', `Edited registration title did not persist: ${definition.data?.form?.title}`);
    assert(definition.data?.form?.fields?.length === 7, 'Edited registration definition did not expose seven fields after duplicating Company');
    assert(
      definition.data.form.fields.some((field) => field.key === 'company' && field.label === 'Company'),
      'Edited registration definition did not expose Company field',
    );
    assert(
      definition.data.form.fields.some((field) => (
        field.key === 'company' &&
        field.validation?.some((rule) => rule.type === 'minLength' && Number(rule.value) === 4)
      )),
      'Edited registration definition did not expose Company minLength validation',
    );
    assert(
      definition.data.form.fields.some((field) => (
        field.key === 'company_copy' &&
        field.label === 'Company copy' &&
        field.validation?.some((rule) => (
          rule.type === 'minLength' &&
          Number(rule.value) === 4 &&
          rule.message === 'Company must be at least 4 characters.'
        ))
      )),
      'Edited registration definition did not expose duplicated Company field with copied validation',
    );
    assert(
      definition.data.form.collectionTarget?.enabled === true &&
      definition.data.form.collectionTarget.collectionId === smokeCollection.id &&
      definition.data.form.collectionTarget.fieldMap?.company === 'company',
      `Edited registration definition did not expose collection mapping: ${JSON.stringify(definition.data.form.collectionTarget)}`,
    );
    assert(
      definition.data.form.fields.some((field) => field.key === 'full_name' && field.placeholder === 'Grace Hopper'),
      'Edited registration definition did not expose updated placeholder',
    );
    assert(
      definition.data.form.notificationEmail === 'forms-smoke-leads@example.com' &&
        definition.data.form.notificationWebhook === webhookReceiver.url,
      `Edited registration definition did not expose notification routing: ${JSON.stringify({
        notificationEmail: definition.data.form.notificationEmail,
        notificationWebhook: definition.data.form.notificationWebhook,
      })}`,
    );

    const invalidSubmission = await submitInvalidRegistration(createdFormId);
    const spamSubmission = await submitBlockedSpamRegistration(createdFormId);
    const submitted = await submitRegistration(createdFormId);
    webhookFailure = await waitForWebhookDelivery(webhookReceiver, createdFormId, submitted, 'failed');
    emailDelivery = await waitForEmailNotification(createdFormId, submitted);
    await refreshForms(client);
    const formsAnalytics = await assertFormsAnalytics(client, createdFormId, submitted.id);
    await assertDeliveryPanelShowsEmail(client, submitted.id);
    const pendingRecords = await listCollectionRecords(smokeCollection.id);
    assert(
      !pendingRecords.some((record) => record.values?.source_submission_id === submitted.id),
      `Pending submission ${submitted.id} created a collection record before approval: ${JSON.stringify(pendingRecords.slice(0, 5))}`,
    );
    const pendingContacts = await listFormContacts(createdFormId);
    assert(
      !pendingContacts.some((contact) => contact.sourceSubmissionId === submitted.id || contact.email === 'forms-smoke@example.com'),
      `Pending submission ${submitted.id} created a contact before approval: ${JSON.stringify(pendingContacts.slice(0, 5))}`,
    );
    if (EXPECTED_EMAIL_INITIAL_STATUS === 'failed') {
      emailRetry = await retryEmailDeliveryInUi(client, createdFormId, submitted);
    }
    await assertConsentExportInUi(client, submitted.id);
    webhookRetry = await retryWebhookDeliveryInUi(client, createdFormId, submitted);
    webhookDelivery = await waitForWebhookDelivery(webhookReceiver, createdFormId, submitted, 'succeeded', webhookRetry.delivery.requestId);
    const consentRetention = await assertConsentRetentionApi(createdFormId, submitted.id);
    await refreshForms(client);
    const approved = await approveSubmissionInUi(client, createdFormId, submitted.id);
    const records = await listCollectionRecords(smokeCollection.id);
    const createdRecord = records.find((record) => record.values?.source_submission_id === submitted.id);
    assert(createdRecord, `Collection record was not created after approving submission ${submitted.id}: ${JSON.stringify(records.slice(0, 5))}`);
    assert(createdRecord.values?.company === 'Backy Smoke Co', `Collection record did not persist company value: ${JSON.stringify(createdRecord)}`);
    const approvedContacts = await listFormContacts(createdFormId);
    const approvedContact = approvedContacts.find((contact) => contact.sourceSubmissionId === submitted.id || contact.email === 'forms-smoke@example.com');
    assert(approvedContact, `Contact was not created after approving submission ${submitted.id}: ${JSON.stringify(approvedContacts.slice(0, 5))}`);
    await refreshForms(client);
    const auditTrail = await assertFormsAuditTrail(client, createdFormId, submitted.id);
    const layout = await assertLayout(client);

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    await deleteReusableSection(createdEmbedSectionId);
    embedCleaned = true;
    await deleteForm(createdFormId);
    cleaned = true;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      url: `${ADMIN_BASE_URL}/forms?siteId=${SITE_ID}`,
      frontendTemplateForm: {
        id: frontendTemplateForm.id,
        title: frontendTemplateForm.title,
        templateId: frontendTemplateForm.settings?.frontendDesignTemplateId,
        bindingHints: frontendTemplateForm.settings?.frontendDesignBindingHints?.length || 0,
        fieldCount: frontendTemplateForm.fields?.length || 0,
      },
      blankForm: {
        id: blankCreatedFormId,
        cleaned: blankCleaned,
      },
      form: {
        id: createdFormId,
        title: definition.data.form.title,
        fieldCount: definition.data.form.fields.length,
        contactShare: Boolean(definition.data.form.contactShare?.enabled),
        collectionTarget: definition.data.form.collectionTarget,
        companyValidation: definition.data.form.fields.find((field) => field.key === 'company')?.validation || [],
        notificationWebhook: Boolean(definition.data.form.notificationWebhook),
      },
      invalidSubmissionRejected: Boolean(invalidSubmission.error || invalidSubmission.errorMessage),
      spamSubmissionRejected: spamSubmission.spamFlags || spamSubmission.data?.spamFlags || [],
      submission: {
        id: submitted.id,
        initialStatus: submitted.status,
        finalStatus: approved.status,
      },
      webhook: {
        deliveries: webhookReceiver.deliveries.length,
        initialEventStatuses: webhookFailure.events.map((event) => event.status),
        retryEventStatuses: webhookDelivery.events.map((event) => event.status),
        retryStatusCode: webhookRetry.delivery.statusCode,
      },
      email: {
        target: emailDelivery.delivery.target,
        provider: emailDelivery.delivery.metadata?.provider,
        statusCode: emailDelivery.delivery.statusCode,
        eventStatuses: emailDelivery.events.map((event) => event.status),
        retryStatusCode: emailRetry?.delivery?.statusCode || null,
      },
      consentRetention: {
        scanned: consentRetention.scannedSubmissions,
        due: consentRetention.due,
        anonymized: consentRetention.anonymized,
      },
      analytics: {
        submissions: formsAnalytics.summary.submissions,
        approved: formsAnalytics.summary.approved,
        spam: formsAnalytics.summary.spam,
        routedToCollections: formsAnalytics.summary.routedToCollections,
      },
      captchaHook,
      auditTrail,
      collectionRecord: {
        id: createdRecord.id,
        slug: createdRecord.slug,
        collectionId: smokeCollection.id,
      },
      embedBlock: {
        id: createdEmbedSectionId,
        slug: embedSection.slug,
        category: embedSection.category,
        fieldCount: embedSection.content?.elements?.[0]?.children?.length || 0,
      },
      layout,
      frontendCleaned,
      embedCleaned,
      cleaned,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!blankCleaned && blankCreatedFormId) {
      await deleteForm(blankCreatedFormId).catch((error) => {
        console.warn('Unable to delete blank smoke form:', error instanceof Error ? error.message : error);
      });
    }
    if (!frontendCleaned && frontendCreatedFormId) {
      await deleteForm(frontendCreatedFormId).catch((error) => {
        console.warn('Unable to delete frontend template smoke form:', error instanceof Error ? error.message : error);
      });
    }
    if (!cleaned && createdFormId) {
      await deleteForm(createdFormId).catch((error) => {
        console.warn('Unable to delete smoke form:', error instanceof Error ? error.message : error);
      });
    }
    if (!embedCleaned && createdEmbedSectionId) {
      await deleteReusableSection(createdEmbedSectionId).then(() => {
        embedCleaned = true;
      }).catch((error) => {
        console.warn('Unable to delete smoke embed block:', error instanceof Error ? error.message : error);
      });
    }
    if (!collectionCleaned && smokeCollection?.id) {
      await deleteCollection(smokeCollection.id).then(() => {
        collectionCleaned = true;
      }).catch((error) => {
        console.warn('Unable to delete smoke collection:', error instanceof Error ? error.message : error);
      });
    }
    if (originalFrontendDesign) {
      await patchFrontendDesign(originalFrontendDesign).catch((error) => {
        console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
      });
    }

    if (childProcess && userDataDir) {
      await cleanupBrowser({ client, childProcess, userDataDir }).catch((error) => {
        console.warn('Unable to clean up forms smoke browser:', error instanceof Error ? error.message : error);
      });
    }
    if (webhookReceiver) {
      await webhookReceiver.close().catch((error) => {
        console.warn('Unable to close forms smoke webhook receiver:', error instanceof Error ? error.message : error);
      });
    }
    await restoreFormsSmokeFixtureQuotas(formsSmokeFixtureQuotaSettings).catch((error) => {
      console.warn('Unable to restore forms smoke fixture quota:', error instanceof Error ? error.message : error);
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
