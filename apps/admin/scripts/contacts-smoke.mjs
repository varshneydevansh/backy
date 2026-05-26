#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_CONTACTS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_CONTACTS_CDP_PORT || 9380);
const SYNC_PORT = Number(process.env.BACKY_CONTACTS_SYNC_PORT || 9480);
const SCREENSHOT_PATH = process.env.BACKY_CONTACTS_SCREENSHOT || path.join(os.tmpdir(), 'backy-contacts-smoke.png');
const BULK_ACTION_STATUS_SMOKE = process.env.BACKY_CONTACTS_BULK_ACTION_STATUS_SMOKE === '1';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertContactsEmptyStatesUseSharedComponent = () => {
  const source = fs.readFileSync(new URL('../src/routes/contacts.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Contacts route must use the shared EmptyState component');
  assert(source.includes('title="No saved lists yet"'), 'Contacts saved-lists panel must keep the no-lists empty-state title visible');
  assert(source.includes('Save a filtered contact view to reuse lead segments'), 'Contacts saved-lists empty state must explain what saved views unlock');
  assert(source.includes('title="No contact audit activity yet"'), 'Contacts audit panel must keep the audit empty-state title visible');
  assert(source.includes('Contact imports, lifecycle changes, merges, promotions, syncs, and retention actions will appear here'), 'Contacts audit empty state must explain what will populate the audit log');
  assert(source.includes('title="No contact API form selected"'), 'Contacts API panel must keep the no-form-selected empty-state title visible');
  assert(source.includes('Select one source form to expose its contact list and update endpoints. The all-forms view is an admin aggregate.'), 'Contacts API empty state must explain why one source form is required');
  assert(source.includes('title="No contacts match this view"'), 'Contacts inbox filter empty state must keep the shared title visible');
  assert(source.includes('Change the search, form, lifecycle, or lead quality filters to broaden the inbox.'), 'Contacts inbox filter empty state must explain how to recover from filters');
  assert(
    !source.includes('before auth provider credentials are wired') &&
      !source.includes('still belong to the Users/Auth integration pass') &&
      !source.includes('Users/Auth roadmap'),
    'Contacts route must not expose stale member/auth roadmap copy.',
  );
  assert(
    source.includes("const CONTACT_MEMBER_CAPTURE_HANDOFF_SCHEMA_VERSION = 'backy.contact-member-capture-handoff.v1'") &&
      source.includes('bindings: CONTACT_MEMBER_CAPTURE_BINDINGS') &&
      source.includes('actionBindings: CONTACT_MEMBER_CAPTURE_ACTIONS') &&
      source.includes('data-testid="contacts-member-capture-handoff"') &&
      source.includes('Copy member handoff') &&
      source.includes('providerGate') &&
      source.includes('auth provider secrets') &&
      source.includes('raw contact values'),
    'Contacts route must expose a versioned member capture handoff with bindings, actions, provider gate, and privacy boundary.',
  );
  assert(
    source.includes('const selectedVisibleContacts = useMemo') &&
      source.includes('const hiddenSelectedContactCount = Math.max') &&
      source.includes('data-testid="contacts-bulk-selection-summary"') &&
      source.includes('outside this view'),
    'Contacts bulk toolbar must summarize selected contacts outside the current filtered view',
  );
  assert(
    source.includes('const loadContactPermissions = useCallback(() => {') &&
      source.includes('const canUseContactRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseContactRoleDefaults;') &&
      source.includes('const isContactPermissionAllowed = (key: ContactsPermissionKey) => (') &&
      source.includes("const canViewForms = isContactPermissionAllowed('forms.view');") &&
      source.includes("const canManageForms = isContactPermissionAllowed('forms.manage');") &&
      source.includes("const canExportForms = isContactPermissionAllowed('forms.export');") &&
      source.includes("const canExportActivity = isContactPermissionAllowed('activity.export');") &&
      source.includes("const canViewUsers = isContactPermissionAllowed('users.view');") &&
      source.includes("const canCreateUsers = isContactPermissionAllowed('users.create');") &&
      source.includes("const canEditCollections = isContactPermissionAllowed('collections.edit');") &&
      source.includes("const canEditPages = isContactPermissionAllowed('pages.edit');") &&
      source.includes("const canViewSettings = isContactPermissionAllowed('settings.view');") &&
      source.includes('const isContactsBusy = isLoading || isContactMutationBusy;') &&
      source.includes('const contactAuditDisabled = isLoadingContactAudit || !canExportActivity;') &&
      !source.includes('const canViewForms = !isPermissionMatrixPending') &&
      !source.includes('const isContactsBusy = isLoading || isContactMutationBusy || isPermissionMatrixPending;') &&
      source.includes('data-testid="contacts-permission-state"') &&
      source.includes('Contact permissions could not be verified') &&
      source.includes('aria-label="Retry loading contact permissions"') &&
      source.includes('Retry permissions') &&
      source.includes('to="/users"') &&
      source.includes('Review users'),
    'Contacts permission state must expose retryable permission recovery and keep role-default workflows usable while permission details hydrate',
  );
  assert(
    source.includes('data-testid="contacts-control-map-details"') &&
      source.includes('data-testid="contacts-control-map"') &&
      source.includes('data-testid="contacts-connected-workflows-details"') &&
      source.includes('data-testid="contacts-connected-workflows"') &&
      source.includes('data-testid="contacts-promotion-contract-details"') &&
      source.includes('data-testid="contacts-promotion-contract"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Show map') &&
      source.includes('Hide map') &&
      source.includes('Show workflows') &&
      source.includes('Hide workflows') &&
      source.includes('Show promotion') &&
      source.includes('Hide promotion') &&
      source.includes('Keep capture pages, form definitions, member handoff, and runtime infrastructure available without stretching the daily inbox.') &&
      source.includes('Promotion rules, Users handoff, registration pages, and custom frontend member-capture contracts.'),
    'Contacts command center must keep low-frequency maps, workflows, and member-capture contracts behind collapsed disclosures.',
  );
  assert(
    source.includes("const contactsCreateActionStatusId = 'contacts-create-action-status';") &&
      source.includes('contactsCreateMutationDisabledReason') &&
      source.includes("const contactsCreateActionStatus = contactsCreateActionStatusFor('Save contact');") &&
      source.includes("const contactsImportCsvActionStatus = contactsCreateActionStatusFor('Import CSV');") &&
      source.includes("const contactsImportTemplateActionStatus = contactsCreateActionStatusFor('CSV template', contactsCreateTemplateDisabledReason);") &&
      source.includes('data-testid="contacts-create-action-status"') &&
      source.includes('data-testid="contacts-save-contact"') &&
      source.includes('data-action-status={contactsCreateActionStatus}') &&
      source.includes('data-action-status={contactsImportCsvActionStatus}') &&
      source.includes('data-action-status={contactsImportTemplateActionStatus}') &&
      source.includes('aria-describedby={contactsCreateActionStatusId}') &&
      source.includes('data-disabled-reason={contactsCreateMutationDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId}'),
    'Contacts primary create/import actions must expose a shared action-status contract with ready/blocked state and target-site metadata.',
  );
  assert(
    source.includes('const [savedListSubmitted, setSavedListSubmitted] = useState(false);') &&
      source.includes('const savedListNameInlineError = savedListSubmitted') &&
      source.includes('data-testid="contacts-saved-list-name-input"') &&
      source.includes('data-testid="contacts-saved-list-name-error"') &&
      source.includes('aria-invalid={Boolean(savedListNameInlineError)}') &&
      source.includes("aria-describedby={savedListNameInlineError ? 'contacts-saved-list-name-error' : undefined}") &&
      source.includes('data-testid="contacts-saved-list-save"') &&
      /disabled=\{contactMutationDisabled\}[\s\S]{0,300}data-testid="contacts-saved-list-save"/.test(source),
    'Contacts saved-list creation must keep Save reachable and expose inline list-name validation',
  );
  assert(
    source.includes('const [contactSyncSubmitted, setContactSyncSubmitted] = useState(false);') &&
      source.includes('const contactSyncTargetInlineError = contactSyncSubmitted') &&
      source.includes('data-testid="contacts-sync-webhook-url-error"') &&
      source.includes('aria-invalid={Boolean(contactSyncTargetInlineError)}') &&
      source.includes("aria-describedby={contactSyncTargetInlineError ? `contacts-sync-webhook-url-error ${contactsBulkActionStatusId}` : contactsBulkActionStatusId}") &&
      /disabled=\{Boolean\(contactsBulkMutationDisabledReason\)\}[\s\S]{0,500}data-testid="contacts-sync-webhook"/.test(source),
    'Contacts sync webhook action must keep selected-contact sync reachable and expose inline webhook URL validation',
  );
  assert(!source.includes('disabled={contactMutationDisabled || !savedListName.trim()}'), 'Contacts saved-list Save must not hide blank-name validation behind a disabled state');
  assert(!source.includes('disabled={contactMutationDisabled || selectedContacts.length === 0 || !contactSyncTarget.trim()}'), 'Contacts sync action must not hide webhook URL validation behind a disabled state');
  assert(
    source.includes('const handleContactDeleteDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || updatingId === `delete-contact-${pendingDeleteContact.id}`) return;") &&
      source.includes("document.addEventListener('keydown', handleContactDeleteDialogKeyDown, true)") &&
      source.includes('role="dialog"') &&
      source.includes('aria-modal="true"') &&
      source.includes('aria-labelledby="contacts-delete-confirm-title"') &&
      source.includes('aria-describedby="contacts-delete-confirm-description contacts-delete-confirm-impact"') &&
      source.includes('id="contacts-delete-confirm-title"') &&
      source.includes('id="contacts-delete-confirm-description"') &&
      source.includes('id="contacts-delete-confirm-impact"') &&
      source.includes('data-testid="contacts-delete-cancel-button"') &&
      source.includes('aria-label={`Cancel deleting ${pendingDeleteContact.name || pendingDeleteContact.email || pendingDeleteContact.id}`}') &&
      source.includes('aria-label={`Confirm deleting ${pendingDeleteContact.name || pendingDeleteContact.email || pendingDeleteContact.id}`}'),
    'Contacts delete confirmation must expose accessible dialog semantics, labelled impact copy, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const contactActionStatusId = `contacts-actions-status-${contact.id}`;') &&
      source.includes('const contactActionStatus = [') &&
      source.includes('role="group"') &&
      source.includes('aria-label={`Actions for ${contactActionLabel}`}') &&
      source.includes('aria-describedby={contactActionStatusId}') &&
      source.includes('data-testid="contacts-action-group"') &&
      source.includes('data-action-status={contactActionStatus}') &&
      source.includes('data-testid="contacts-action-status"') &&
      source.includes('data-action-state={contactedDisabledReason ? \'blocked\' : \'ready\'}') &&
      source.includes('data-disabled-reason={promoteUserDisabledReason || undefined}') &&
      source.includes('data-testid="contacts-mark-contacted"') &&
      source.includes('data-testid="contacts-mark-qualified"') &&
      source.includes('data-testid="contacts-mark-new"') &&
      source.includes('data-testid="contacts-archive-contact"'),
    'Contacts card action strip must expose a named group, status summary, ready/blocked metadata, and stable hooks for lifecycle, promotion, archive, and delete actions.',
  );
  assert(
    source.includes("const contactsBulkActionStatusId = 'contacts-bulk-action-status';") &&
      source.includes('const contactsBulkActionStatus = [') &&
      source.includes('role="group"') &&
      source.includes('aria-label="Selected contact bulk actions"') &&
      source.includes('data-testid="contacts-bulk-actions"') &&
      source.includes('data-action-status={contactsBulkActionStatus}') &&
      source.includes('data-action-state={contactsBulkActionState}') &&
      source.includes('data-selected-count={selectedContacts.length}') &&
      source.includes('data-testid="contacts-bulk-action-status"') &&
      source.includes('data-testid="contacts-select-visible"') &&
      source.includes('data-testid="contacts-retention-export"') &&
      source.includes('data-testid="contacts-bulk-status-select"') &&
      source.includes('data-testid="contacts-bulk-apply-lifecycle"') &&
      source.includes('data-disabled-reason={contactsBulkMergeDisabledReason || undefined}'),
    'Contacts bulk action toolbar must expose a named group, shared status summary, selected-count metadata, stable hooks, and ready/blocked reasons for retention, sync, lifecycle, and merge actions.',
  );
};

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

const startContactSyncReceiver = () => {
  const received = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }
      received.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(SYNC_PORT, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({
        url: `http://127.0.0.1:${SYNC_PORT}/contacts-sync`,
        received,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
};

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
  const smokeMfaCode = process.env.BACKY_CONTACTS_SMOKE_MFA_CODE
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

const createLeadForm = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms`, {
    method: 'POST',
    body: JSON.stringify({
      name: `contacts-smoke-${Date.now().toString(36)}`,
      title: 'Contacts Smoke Lead',
      description: 'Temporary form for the contacts page smoke test.',
      audience: 'public',
      isActive: true,
      successMessage: 'Lead received.',
      enableHoneypot: true,
      enableCaptcha: false,
      moderationMode: 'auto-approve',
      contactShare: {
        enabled: true,
        nameField: 'full_name',
        emailField: 'email',
        phoneField: 'phone',
        notesField: 'interest',
        dedupeByEmail: true,
      },
      fields: [
        { key: 'full_name', label: 'Full name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'phone', label: 'Phone', type: 'tel' },
        { key: 'interest', label: 'Interest', type: 'textarea', required: true },
        { key: 'consent', label: 'I agree to be contacted.', type: 'checkbox', required: true },
      ],
    }),
  });

  const form = payload.data?.form || payload.form;
  assert(form?.id, `Unable to create contacts smoke form: ${JSON.stringify(payload).slice(0, 500)}`);
  return form;
};

const deleteForm = async (formId) => {
  if (!formId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}`, { method: 'DELETE' });
};

const submitLead = async (formId) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
    method: 'POST',
    body: JSON.stringify({
      requestId: `contacts-smoke-${Date.now().toString(36)}`,
      rateLimitBypass: true,
      startedAt: Date.now() - 3500,
      honeypot: '',
      values: {
        full_name: 'Contacts Smoke User',
        email: 'contacts-smoke@example.com',
        phone: '+1 555 0166',
        interest: 'Interested in a member account and product updates.',
        consent: true,
      },
    }),
  });

  const submission = payload.data?.submission;
  assert(submission?.id, `Lead submission did not return a submission: ${JSON.stringify(payload).slice(0, 500)}`);
  return submission;
};

const listContacts = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts?limit=100`);
  return payload.data?.contacts || payload.contacts || [];
};

const waitForContactByEmail = async (formId, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(formId);
    const contact = contacts.find((item) => item.email === email);
    if (contact?.id) {
      return contact;
    }
    await sleep(250);
  }

  throw new Error(`Contact ${email} did not appear for form ${formId}`);
};

const listContactSegments = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/contact-segments?formId=${encodeURIComponent(formId)}`);
  return payload.data?.analytics || {
    segments: payload.segments || [],
    summary: payload.summary,
  };
};

const exportContactRetention = async (formId, contact) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/consent-retention`, {
    method: 'POST',
    body: JSON.stringify({
      contactIds: [contact.id],
      dryRun: true,
      retentionDays: 0,
      actor: 'contacts-smoke',
    }),
  });
  const result = payload.data;
  assert(result?.formId === formId, `Contact retention export did not return form scope: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(result.consentFieldKeys?.includes('consent'), `Contact retention export did not detect consent field: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(result.scanned === 1 && result.due === 1 && result.anonymized === 0, `Contact retention export counts are wrong: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(result.contacts?.[0]?.consentValues?.consent === true, `Contact retention export did not include consent evidence: ${JSON.stringify(payload).slice(0, 500)}`);
  return result;
};

const createContactSavedList = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/contact-lists`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke Qualified Leads',
      filters: {
        formId,
        status: 'qualified',
        quality: 'ready-to-promote',
      },
    }),
  });
  const list = payload.data?.list || payload.list;
  const savedLists = payload.data?.lists || payload.lists || [];
  assert(list?.id, `Contact saved list create did not return a list: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(savedLists.some((item) => item.id === list.id && item.matchedCount >= 3), `Contact saved list did not include qualified contacts: ${JSON.stringify(payload).slice(0, 500)}`);
  return list;
};

const deleteContactSavedList = async (listId) => {
  if (!listId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/forms/contact-lists`, {
    method: 'DELETE',
    body: JSON.stringify({ listId }),
  });
};

const findUserByEmail = async (email) => {
  const payload = await requestApi(`/api/admin/users?search=${encodeURIComponent(email)}`);
  const users = payload.data?.users || payload.users || [];
  return users.find((user) => user.email === email);
};

const listUsers = async () => {
  const payload = await requestApi('/api/admin/users');
  return payload.data?.users || payload.users || [];
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const findCollectionBySlug = async (slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections?includeUnpublished=true&limit=100`);
  const collections = payload.data?.collections || payload.collections || [];
  return collections.find((collection) => collection.slug === slug) || null;
};

const deleteCollection = async (collectionId) => {
  if (!collectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
};

const deleteCollectionRecord = async (collectionId, recordId) => {
  if (!collectionId || !recordId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`, { method: 'DELETE' });
};

const createContactDirectly = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Contacts Direct User',
      email: 'contacts-direct@example.com',
      phone: '+1 555 0191',
      status: 'contacted',
      notes: 'Created by contacts smoke API.',
      sourceValues: { source: 'api-smoke' },
      upsertByEmail: true,
    }),
  });
  const contact = payload.data?.contact || payload.contact;
  assert(contact?.id, `Direct contact create did not return a contact: ${JSON.stringify(payload).slice(0, 500)}`);
  return contact;
};

const createQualifiedPromotionContact = async (formId, email) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Contacts Billing Blocked',
      email,
      phone: '+1 555 0198',
      status: 'qualified',
      notes: 'Created for contact promotion billing smoke.',
      sourceValues: { source: 'promotion-billing-smoke' },
      upsertByEmail: false,
    }),
  });
  const contact = payload.data?.contact || payload.contact;
  assert(contact?.id, `Promotion billing contact create did not return a contact: ${JSON.stringify(payload).slice(0, 500)}`);
  return contact;
};

const assertContactPromotionBillingSeatLimitEnforced = async (formId) => {
  const settings = await getSettings();
  const existingUsers = await listUsers();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedEmail = `contacts-seat-blocked-${Date.now().toString(36)}@example.com`;
  const contact = await createQualifiedPromotionContact(formId, blockedEmail);

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        seatLimit: Math.max(1, existingUsers.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/${contact.id}/promote`, {
      method: 'POST',
      body: JSON.stringify({
        role: 'viewer',
        status: 'invited',
        createInvite: true,
      }),
    });

    assert(response.status === 402, `Billing seat limit should reject contact promotion, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_SEAT_LIMIT', `Billing seat-limited contact promotion should return BILLING_SEAT_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findUserByEmail(blockedEmail)), 'Billing-limited contact promotion unexpectedly persisted a user.');
    const contacts = await listContacts(formId);
    const current = contacts.find((item) => item.id === contact.id);
    assert(!current?.sourceValues?.__backyPromotion, 'Billing-limited contact promotion unexpectedly marked the contact promoted.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
};

const assertContactHardDelete = async (formId) => {
  const email = `contacts-delete-${Date.now().toString(36)}@example.com`;
  const createPayload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Contacts Delete User',
      email,
      phone: '+1 555 0196',
      status: 'new',
      notes: 'Created for hard delete smoke.',
      sourceValues: { source: 'delete-smoke' },
      upsertByEmail: false,
    }),
  });
  const contact = createPayload.data?.contact || createPayload.contact;
  assert(contact?.id, `Delete smoke contact create did not return a contact: ${JSON.stringify(createPayload).slice(0, 500)}`);

  const deletePayload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/${contact.id}`, {
    method: 'DELETE',
  });
  assert(deletePayload.success === true && (deletePayload.data?.deleted === true || deletePayload.deleted === true), `Contact delete did not report success: ${JSON.stringify(deletePayload).slice(0, 500)}`);

  const contacts = await listContacts(formId);
  assert(!contacts.some((item) => item.id === contact.id || item.email === email), `Deleted contact still appears in contact list: ${JSON.stringify(contacts).slice(0, 500)}`);
};

const createDuplicateContacts = async (formId) => {
  const email = `contacts-duplicate-${Date.now().toString(36)}@example.com`;
  const contacts = [];

  for (const [index, name] of ['Duplicate Primary', 'Duplicate Secondary'].entries()) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        phone: index === 0 ? '+1 555 0193' : '+1 555 0194',
        status: 'qualified',
        notes: `${name} note.`,
        sourceValues: { source: `duplicate-${index + 1}` },
        upsertByEmail: false,
      }),
    });
    const contact = payload.data?.contact || payload.contact;
    assert(contact?.id, `Duplicate contact create did not return a contact: ${JSON.stringify(payload).slice(0, 500)}`);
    contacts.push(contact);
  }

  return contacts;
};

const importContactsCsv = async (formId) => {
  const email = `contacts-import-${Date.now().toString(36)}@example.com`;
  const csv = [
    ['name', 'email', 'phone', 'status', 'notes', 'sourceValues'],
    ['Contacts Imported User', email, '+1 555 0192', 'qualified', 'Imported by contacts smoke.', '{"source":"csv-smoke"}'],
  ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/import?upsertByEmail=true`, {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      ...(apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
    },
    body: csv,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(`Contact CSV import failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
  }

  const result = payload.data?.import;
  assert(result?.created === 1, `Contact CSV import should create one contact: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data?.contacts?.[0];
};

const assertInvalidContactEmailRejected = async (formId, contactId) => {
  const invalidCreate = await requestApiRaw(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Invalid Email Contact',
      email: 'not-an-email',
      phone: '+1 555 0199',
    }),
  });
  assert(invalidCreate.response.status === 400, `Invalid contact create should be rejected: ${invalidCreate.response.status} ${JSON.stringify(invalidCreate.payload).slice(0, 500)}`);
  assert(invalidCreate.payload?.error?.code === 'INVALID_CONTACT_EMAIL', `Invalid contact create should return INVALID_CONTACT_EMAIL: ${JSON.stringify(invalidCreate.payload).slice(0, 500)}`);

  const invalidImport = await requestApiRaw(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/import`, {
    method: 'POST',
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    body: [
      'name,email,phone,status',
      'Invalid Imported Contact,invalid-import,555,new',
    ].join('\n'),
  });
  assert(invalidImport.response.status === 200, `Invalid contact import should return import summary: ${invalidImport.response.status} ${JSON.stringify(invalidImport.payload).slice(0, 500)}`);
  assert(invalidImport.payload?.data?.import?.created === 0, `Invalid contact import should not create rows: ${JSON.stringify(invalidImport.payload).slice(0, 500)}`);
  assert(invalidImport.payload?.data?.import?.skipped === 1, `Invalid contact import should skip one row: ${JSON.stringify(invalidImport.payload).slice(0, 500)}`);
  assert(
    invalidImport.payload?.data?.import?.errors?.some((error) => error.code === 'INVALID_CONTACT_EMAIL'),
    `Invalid contact import should report INVALID_CONTACT_EMAIL: ${JSON.stringify(invalidImport.payload).slice(0, 500)}`,
  );

  const invalidUpdate = await requestApiRaw(`/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ email: 'still-invalid' }),
  });
  assert(invalidUpdate.response.status === 400, `Invalid contact update should be rejected: ${invalidUpdate.response.status} ${JSON.stringify(invalidUpdate.payload).slice(0, 500)}`);
  assert(invalidUpdate.payload?.error?.code === 'INVALID_CONTACT_EMAIL', `Invalid contact update should return INVALID_CONTACT_EMAIL: ${JSON.stringify(invalidUpdate.payload).slice(0, 500)}`);
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

const setBrowserSession = async (client, sessionToken) => {
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

const navigateToContacts = async (client, formId) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/contacts?siteId=${encodeURIComponent(SITE_ID)}&formId=${encodeURIComponent(formId)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="contacts-command-center"]')),
      inbox: document.body?.innerText?.includes('Lead Inbox') || false,
      contact: document.body?.innerText?.includes('contacts-smoke@example.com') || false,
      form: document.body?.innerText?.includes('Contacts Smoke Lead') || false,
      body: document.body?.innerText?.slice(0, 600) || '',
    }))()`);

    if (state.ready && state.inbox && state.contact && state.form) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Contacts page did not render expected lead: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertContactDeleteDialogRecovery = async (client, contact) => {
  const contactCardSelector = JSON.stringify(`[data-testid="contacts-contact-card"][data-contact-id="${contact.id}"]`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const card = document.querySelector(${contactCardSelector});
      if (!(card instanceof HTMLElement)) {
        return { ok: false, reason: 'contact-card-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      }
      const deleteButton = card.querySelector('[data-testid="contacts-delete-contact"]');
      if (!(deleteButton instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'delete-button-missing', buttons: Array.from(card.querySelectorAll('button')).map((button) => button.getAttribute('aria-label') || button.textContent || '') };
      }
      if (deleteButton.disabled) {
        return { ok: false, reason: 'delete-button-disabled' };
      }
      deleteButton.click();
      const dialog = document.querySelector('[data-testid="contacts-delete-confirm-dialog"]');
      const cancelButton = document.querySelector('[data-testid="contacts-delete-cancel-button"]');
      const confirmButton = document.querySelector('[data-testid="contacts-delete-confirm-button"]');
      if (!(dialog instanceof HTMLElement) || !(cancelButton instanceof HTMLButtonElement) || !(confirmButton instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'delete-dialog-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      }
      const semantics = {
        role: dialog.getAttribute('role') || '',
        modal: dialog.getAttribute('aria-modal') || '',
        labelledBy: dialog.getAttribute('aria-labelledby') || '',
        describedBy: dialog.getAttribute('aria-describedby') || '',
        hasTitle: Boolean(document.querySelector('#contacts-delete-confirm-title')),
        hasDescription: Boolean(document.querySelector('#contacts-delete-confirm-description')),
        hasImpact: Boolean(document.querySelector('#contacts-delete-confirm-impact')),
        cancelLabel: cancelButton.getAttribute('aria-label') || '',
        confirmLabel: confirmButton.getAttribute('aria-label') || '',
      };
      if (
        semantics.role !== 'dialog' ||
        semantics.modal !== 'true' ||
        semantics.labelledBy !== 'contacts-delete-confirm-title' ||
        !semantics.describedBy.includes('contacts-delete-confirm-description') ||
        !semantics.describedBy.includes('contacts-delete-confirm-impact') ||
        !semantics.hasTitle ||
        !semantics.hasDescription ||
        !semantics.hasImpact ||
        !semantics.cancelLabel.startsWith('Cancel deleting') ||
        !semantics.confirmLabel.startsWith('Confirm deleting')
      ) {
        return { ok: false, reason: 'delete-dialog-semantics', semantics };
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return { ok: true, phase: 'opened-and-escaped', semantics };
    })()`);

    if (result.ok) {
      for (let closeAttempt = 0; closeAttempt < 20; closeAttempt += 1) {
        const closedState = await evaluate(client, `(() => ({
          closed: !document.querySelector('[data-testid="contacts-delete-confirm-dialog"]'),
          body: document.body?.innerText?.slice(0, 500) || '',
        }))()`);
        if (closedState.closed) break;
        if (closeAttempt === 19) {
          throw new Error(`Contacts delete confirmation did not close on Escape: ${JSON.stringify(closedState)}`);
        }
        await sleep(100);
      }

      for (let reopenAttempt = 0; reopenAttempt < 30; reopenAttempt += 1) {
        const reopenState = await evaluate(client, `(() => {
          const card = document.querySelector(${contactCardSelector});
          const deleteButton = card?.querySelector('[data-testid="contacts-delete-contact"]');
          if (!(deleteButton instanceof HTMLButtonElement)) {
            return { ok: false, reason: 'delete-button-missing-after-escape', body: document.body?.innerText?.slice(0, 800) || '' };
          }
          if (deleteButton.disabled) return { ok: false, reason: 'delete-button-disabled-after-escape' };
          deleteButton.click();
          const dialog = document.querySelector('[data-testid="contacts-delete-confirm-dialog"]');
          const cancelButton = document.querySelector('[data-testid="contacts-delete-cancel-button"]');
          if (!(dialog instanceof HTMLElement) || !(cancelButton instanceof HTMLButtonElement)) {
            return { ok: false, reason: 'dialog-reopen-failed', body: document.body?.innerText?.slice(0, 800) || '' };
          }
          cancelButton.click();
          return { ok: true };
        })()`);
        if (reopenState.ok) return result.semantics;
        if (reopenAttempt === 29) {
          throw new Error(`Unable to reopen/cancel contacts delete confirmation after Escape: ${JSON.stringify(reopenState)}`);
        }
        await sleep(150);
      }
      return result.semantics;
    }

    if (attempt === 79) {
      throw new Error(`Contacts delete confirmation recovery was not wired: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  return null;
};

const updateContactInUi = async (client, contactId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const card = document.querySelector('[data-testid="contacts-contact-card"][data-contact-id="${contactId.id}"]');
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      const editIdentity = card.querySelector('[data-testid="contacts-edit-identity-button"]');
      if (!(editIdentity instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'edit-identity-missing', buttons: Array.from(card.querySelectorAll('button')).map((button) => button.textContent || '') };
      }
      const name = card.querySelector('[data-testid="contacts-identity-name-input"]');
      const email = card.querySelector('[data-testid="contacts-identity-email-input"]');
      const phone = card.querySelector('[data-testid="contacts-identity-phone-input"]');
      if (!(name instanceof HTMLInputElement) || !(email instanceof HTMLInputElement) || !(phone instanceof HTMLInputElement)) {
        if ((editIdentity.textContent || '').includes('Edit identity')) {
          editIdentity.click();
        }
        return { ok: false, reason: 'identity-controls-pending', body: card.textContent?.slice(0, 800) || '' };
      }

      setInputValue(name, 'Contacts Smoke Edited');
      setInputValue(email, 'contacts-smoke@example.com');
      setInputValue(phone, '+1 555 0177');
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to save contact identity in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const card = document.querySelector('[data-testid="contacts-contact-card"][data-contact-id="${contactId.id}"]');
      const saveIdentity = card?.querySelector('[data-testid="contacts-save-identity-button"]');
      if (!(saveIdentity instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'save-identity-missing', body: card?.textContent?.slice(0, 800) || '' };
      }
      if (saveIdentity.disabled) {
        return { ok: false, reason: 'save-identity-disabled' };
      }
      saveIdentity.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to trigger contact identity save in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(contactId.formId);
    const contact = contacts.find((item) => item.id === contactId.id);
    if (contact?.name === 'Contacts Smoke Edited' && contact.phone === '+1 555 0177') {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Contact identity did not persist: ${JSON.stringify(contact)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setTextAreaValue = (textarea, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        descriptor?.set?.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const card = document.querySelector('[data-testid="contacts-contact-card"][data-contact-id="${contactId.id}"]');
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      const notes = card.querySelector('textarea');
      const save = Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Save notes for')
      ));
      const qualified = Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').includes('as qualified')
      ));

      if (!(notes instanceof HTMLTextAreaElement) || !(save instanceof HTMLButtonElement) || !(qualified instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'controls-missing',
          buttons: Array.from(card.querySelectorAll('button')).map((button) => button.getAttribute('aria-label') || button.textContent || ''),
        };
      }

      setTextAreaValue(notes, 'Qualified in contacts smoke.');
      if (save.disabled) return { ok: false, reason: 'save-disabled' };
      save.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to save contact notes in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(contactId.formId);
    const contact = contacts.find((item) => item.id === contactId.id);
    if (contact?.notes === 'Qualified in contacts smoke.') {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Contact notes did not persist: ${JSON.stringify(contact)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const card = document.querySelector('[data-testid="contacts-contact-card"][data-contact-id="${contactId.id}"]');
      const qualified = card && Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').includes('as qualified')
      ));
      if (qualified instanceof HTMLButtonElement && !qualified.disabled) {
        qualified.click();
        return { ok: true };
      }
      return { ok: false, hasCard: Boolean(card), disabled: qualified instanceof HTMLButtonElement ? qualified.disabled : null };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to mark contact qualified in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(contactId.formId);
    const contact = contacts.find((item) => item.id === contactId.id);
    if (contact?.status === 'qualified' && contact.notes === 'Qualified in contacts smoke.') {
      return contact;
    }
    await sleep(250);
  }

  throw new Error(`Contact ${contactId.id} did not become qualified`);
};

const archiveContactWithBulkAction = async (client, contactId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="contacts-bulk-actions"]');
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes('contacts-smoke@example.com')
      ));
      const checkbox = card?.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
      const status = panel?.querySelector('select[aria-label="Bulk contact lifecycle status"]');
      const apply = Array.from(panel?.querySelectorAll('button') || []).find((button) => (
        (button.textContent || '').includes('Apply lifecycle')
      ));

      if (!(panel instanceof HTMLElement) || !(card instanceof HTMLElement) || !(checkbox instanceof HTMLInputElement) || !(status instanceof HTMLSelectElement) || !(apply instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'bulk-controls-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      }

      if (!checkbox.checked) {
        checkbox.click();
      }

      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(status, 'archived');
      status.dispatchEvent(new Event('input', { bubbles: true }));
      status.dispatchEvent(new Event('change', { bubbles: true }));

      if (apply.disabled) {
        return { ok: false, reason: 'apply-disabled', selected: checkbox.checked, value: status.value };
      }

      apply.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to run bulk contact archive in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(contactId.formId);
    const contact = contacts.find((item) => item.id === contactId.id);
    if (contact?.status === 'archived' && contact.notes === 'Qualified in contacts smoke.') {
      return contact;
    }

    await sleep(250);
  }

  throw new Error(`Contact ${contactId.id} did not archive through bulk lifecycle controls`);
};

const mergeDuplicateContactsInUi = async (client, formId, duplicateContacts) => {
  const duplicateEmail = duplicateContacts[0].email;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const cards = Array.from(document.querySelectorAll('article')).filter((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(duplicateEmail)})
      ));
      const panel = document.querySelector('[data-testid="contacts-bulk-actions"]');
      const merge = panel && Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').includes('Merge duplicates')
      ));

      if (cards.length < 2 || !(merge instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'merge-controls-missing',
          cards: cards.length,
          hasMerge: merge instanceof HTMLButtonElement,
          body: document.body?.innerText?.slice(0, 1000) || '',
        };
      }

      for (const card of cards.slice(0, 2)) {
        const checkbox = card.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
        if (checkbox instanceof HTMLInputElement && !checkbox.checked) {
          checkbox.click();
        }
      }

      if (merge.disabled) {
        return {
          ok: false,
          reason: 'merge-disabled',
          selected: cards.slice(0, 2).map((card) => {
            const checkbox = card.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
            return checkbox instanceof HTMLInputElement ? checkbox.checked : null;
          }),
        };
      }

      merge.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to merge duplicate contacts in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(formId);
    const mergedGroup = contacts.filter((contact) => contact.email === duplicateEmail);
    const archived = mergedGroup.filter((contact) => contact.status === 'archived');
    const active = mergedGroup.filter((contact) => contact.status !== 'archived');

    if (archived.length === 1 && active.length === 1 && (active[0].notes || '').includes('Merged duplicate contacts')) {
      return {
        primary: active[0],
        archived: archived[0],
      };
    }

    await sleep(250);
  }

  throw new Error(`Duplicate contacts did not merge for ${duplicateEmail}`);
};

const promoteContactInUi = async (client, formId, contact) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((item) => (item.innerText || '').includes(${JSON.stringify(contact.email)}));
      if (!card) return { ok: false, reason: 'missing-card' };
      const button = Array.from(card.querySelectorAll('button')).find((item) => item.textContent?.includes('Promote user'));
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'missing-button', text: card.innerText.slice(0, 500) };
      if (button.disabled) return { ok: false, reason: 'disabled-button', text: card.innerText.slice(0, 500) };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to promote contact in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(formId);
    const promoted = contacts.find((item) => item.id === contact.id);
    const promotion = promoted?.sourceValues?.__backyPromotion;
    const user = await findUserByEmail(contact.email);

    if (promotion?.userId && user?.id === promotion.userId && (promoted.notes || '').includes('Promoted to')) {
      return { contact: promoted, user, promotion };
    }

    await sleep(250);
  }

  throw new Error(`Contact was not promoted to user: ${contact.email}`);
};

const promoteContactToCustomerInUi = async (client, formId, contact) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((item) => (item.innerText || '').includes(${JSON.stringify(contact.email)}));
      if (!card) return { ok: false, reason: 'missing-card' };
      const button = Array.from(card.querySelectorAll('button')).find((item) => item.textContent?.includes('Promote customer'));
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'missing-button', text: card.innerText.slice(0, 500) };
      if (button.disabled) return { ok: false, reason: 'disabled-button', text: card.innerText.slice(0, 500) };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to promote contact to customer in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(formId);
    const promoted = contacts.find((item) => item.id === contact.id);
    const promotion = promoted?.sourceValues?.__backyCustomerPromotion;

    if (promotion?.collectionId && promotion?.recordId && (promoted.notes || '').includes('customer record')) {
      const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${promotion.collectionId}/records/${promotion.recordId}`);
      const record = payload.data?.record || payload.record;
      if (record?.id === promotion.recordId && record.values?.email === contact.email) {
        return { contact: promoted, record, promotion };
      }
    }

    await sleep(250);
  }

  throw new Error(`Contact was not promoted to customer: ${contact.email}`);
};

const syncContactInUi = async (client, formId, contact, targetUrl) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((item) => (item.innerText || '').includes(${JSON.stringify(contact.email)}));
      const checkbox = card?.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
      const input = document.querySelector('[data-testid="contacts-sync-webhook-url"]');
      const button = document.querySelector('[data-testid="contacts-sync-webhook"]');
      if (!(card instanceof HTMLElement) || !(checkbox instanceof HTMLInputElement) || !(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'sync-controls-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (!checkbox.checked) checkbox.click();
      setInputValue(input, ${JSON.stringify(targetUrl)});
      if (button.disabled) return { ok: false, reason: 'sync-disabled', selected: checkbox.checked, value: input.value };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to sync contact in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const eventPayload = await requestApi(`/api/sites/${SITE_ID}/events?kind=contact-sync&formId=${encodeURIComponent(formId)}&contactId=${encodeURIComponent(contact.id)}&limit=20`);
    const events = eventPayload.data?.events || eventPayload.events || [];
    const succeeded = events.find((event) => event.status === 'succeeded' && event.target === targetUrl);
    const uiState = await evaluate(client, `(() => ({
      hasLastSync: document.body?.innerText?.includes('Last sync:') || false,
      hasSyncEndpoint: document.body?.innerText?.includes('/contacts/sync') || false,
    }))()`);
    if (succeeded && uiState.hasLastSync && uiState.hasSyncEndpoint) {
      await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="contacts-bulk-actions"]');
        const clear = Array.from(panel?.querySelectorAll('button') || []).find((button) => (button.textContent || '').trim() === 'Clear');
        if (clear instanceof HTMLButtonElement && !clear.disabled) clear.click();
        return true;
      })()`);
      return { event: succeeded };
    }

    await sleep(250);
  }

  throw new Error(`Contact sync event was not recorded for ${contact.email}`);
};

const applyContactRetentionInUi = async (client, formId, contact) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((item) => (item.innerText || '').includes(${JSON.stringify(contact.email)}));
      const checkbox = card?.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
      const days = document.querySelector('[data-testid="contacts-retention-days"]');
      const button = document.querySelector('[data-testid="contacts-retention-apply"]');
      if (!(card instanceof HTMLElement) || !(checkbox instanceof HTMLInputElement) || !(days instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'retention-controls-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (!checkbox.checked) checkbox.click();
      setInputValue(days, '0');
      if (button.disabled) return { ok: false, reason: 'retention-disabled', selected: checkbox.checked, days: days.value };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to apply contact retention in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const contacts = await listContacts(formId);
    const updated = contacts.find((item) => item.id === contact.id);
    const uiState = await evaluate(client, `(() => ({
      hasRetentionSummary: Boolean(document.querySelector('[data-testid="contacts-retention-summary"]')) &&
        document.body?.innerText?.includes('Last retention:') &&
        document.body?.innerText?.includes('/contacts/consent-retention'),
    }))()`);

    if (updated?.sourceValues?.consent === null && (updated.notes || '').includes('Contact consent evidence anonymized') && uiState.hasRetentionSummary) {
      return updated;
    }

    await sleep(250);
  }

  throw new Error(`Contact retention did not anonymize consent evidence for ${contact.email}`);
};

const waitForContactAuditPanel = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="contacts-access-audit"]');
      const text = panel?.textContent || '';
      return {
        ok: Boolean(panel) &&
          text.includes('forms.view') &&
          text.includes('forms.manage') &&
          text.includes('forms.export') &&
          text.includes('activity.export') &&
          text.includes('Contact retention applied') &&
          text.includes('Selected contacts synced') &&
          text.includes('Contact promoted to user') &&
          text.includes('Contact promoted to customer'),
        text: text.slice(0, 1200),
      };
    })()`);

    if (state.ok) return state;

    if (attempt === 79) {
      throw new Error(`Contact access/audit panel did not show expected activity: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const readContactsBulkActionStatus = async (client) => evaluate(client, `(() => {
  const group = document.querySelector('[data-testid="contacts-bulk-actions"]');
  const selection = document.querySelector('[data-testid="contacts-bulk-selection-summary"]');
  const status = document.querySelector('[data-testid="contacts-bulk-action-status"]');
  const readControl = (testId) => {
    const control = document.querySelector('[data-testid="' + testId + '"]');
    return {
      found: Boolean(control),
      describedBy: control?.getAttribute('aria-describedby') || '',
      state: control?.getAttribute('data-action-state') || '',
      disabledReason: control?.getAttribute('data-disabled-reason') || '',
      disabled: control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement
        ? control.disabled
        : null,
      text: control?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    };
  };
  return {
    role: group?.getAttribute('role') || '',
    label: group?.getAttribute('aria-label') || '',
    describedBy: group?.getAttribute('aria-describedby') || '',
    actionState: group?.getAttribute('data-action-state') || '',
    selectedCount: group?.getAttribute('data-selected-count') || '',
    visibleSelectedCount: group?.getAttribute('data-visible-selected-count') || '',
    hiddenSelectedCount: group?.getAttribute('data-hidden-selected-count') || '',
    selectionId: selection?.id || '',
    selectionText: selection?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    statusId: status?.id || '',
    statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    statusData: group?.getAttribute('data-action-status') || '',
    selectVisible: readControl('contacts-select-visible'),
    exportEvidence: readControl('contacts-retention-export'),
    applyRetention: readControl('contacts-retention-apply'),
    syncSelected: readControl('contacts-sync-webhook'),
    statusSelect: readControl('contacts-bulk-status-select'),
    applyLifecycle: readControl('contacts-bulk-apply-lifecycle'),
    mergeDuplicates: readControl('contacts-merge-duplicates'),
  };
})()`);

const assertContactsBulkActionStatus = async (client, targetEmail) => {
  const initial = await readContactsBulkActionStatus(client);
  assert(initial.role === 'group' && initial.label === 'Selected contact bulk actions', `Contacts bulk toolbar must be a named group: ${JSON.stringify(initial)}`);
  assert(
    initial.describedBy.includes(initial.selectionId) && initial.describedBy.includes(initial.statusId),
    `Contacts bulk toolbar must reference selection and action statuses: ${JSON.stringify(initial)}`,
  );
  assert(initial.statusData === initial.statusText, `Contacts bulk status data must mirror hidden copy: ${JSON.stringify(initial)}`);
  assert(initial.selectedCount === '0' && initial.actionState === 'blocked', `Contacts bulk toolbar should start blocked with no selection: ${JSON.stringify(initial)}`);
  assert(
    initial.selectionText.startsWith('No contacts selected.') &&
      initial.statusText.includes('Export evidence unavailable: Select one or more contacts first.') &&
      initial.statusText.includes('Merge duplicates unavailable: Select one or more contacts first.'),
    `Contacts bulk toolbar no-selection guidance drifted: ${JSON.stringify(initial)}`,
  );
  for (const [key, control] of Object.entries({
    exportEvidence: initial.exportEvidence,
    applyRetention: initial.applyRetention,
    syncSelected: initial.syncSelected,
    statusSelect: initial.statusSelect,
    applyLifecycle: initial.applyLifecycle,
    mergeDuplicates: initial.mergeDuplicates,
  })) {
    assert(control.found, `Contacts bulk ${key} control missing: ${JSON.stringify(initial)}`);
    assert(control.state === 'blocked' && control.disabled === true, `Contacts bulk ${key} should be blocked without selection: ${JSON.stringify(initial)}`);
    assert(control.disabledReason.includes('Select one or more contacts first.'), `Contacts bulk ${key} missing no-selection reason: ${JSON.stringify(initial)}`);
  }

  let selected = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    selected = await evaluate(client, `(() => {
      const card = Array.from(document.querySelectorAll('[data-testid="contacts-contact-card"]')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(targetEmail)})
      ));
      const checkbox = card?.querySelector('input[type="checkbox"][aria-label^="Select contact"]');
      if (!(card instanceof HTMLElement) || !(checkbox instanceof HTMLInputElement)) {
        return { ok: false, reason: 'target-card-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (!checkbox.checked) {
        checkbox.click();
      }
      const group = document.querySelector('[data-testid="contacts-bulk-actions"]');
      const status = document.querySelector('[data-testid="contacts-bulk-action-status"]');
      const selection = document.querySelector('[data-testid="contacts-bulk-selection-summary"]');
      const readControl = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          found: Boolean(control),
          describedBy: control?.getAttribute('aria-describedby') || '',
          state: control?.getAttribute('data-action-state') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled: control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement
            ? control.disabled
            : null,
        };
      };
      return {
        ok: true,
        actionState: group?.getAttribute('data-action-state') || '',
        selectedCount: group?.getAttribute('data-selected-count') || '',
        visibleSelectedCount: group?.getAttribute('data-visible-selected-count') || '',
        hiddenSelectedCount: group?.getAttribute('data-hidden-selected-count') || '',
        statusId: status?.id || '',
        selectionText: selection?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        statusData: group?.getAttribute('data-action-status') || '',
        exportEvidence: readControl('contacts-retention-export'),
        applyRetention: readControl('contacts-retention-apply'),
        syncSelected: readControl('contacts-sync-webhook'),
        statusSelect: readControl('contacts-bulk-status-select'),
        applyLifecycle: readControl('contacts-bulk-apply-lifecycle'),
        mergeDuplicates: readControl('contacts-merge-duplicates'),
      };
    })()`);

    if (selected.ok && selected.selectedCount === '1' && selected.exportEvidence?.state === 'ready') {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Contacts bulk toolbar did not update after selecting a contact: ${JSON.stringify(selected)}`);
    }
    await sleep(250);
  }

  assert(selected.statusData === selected.statusText, `Contacts selected bulk status data must mirror hidden copy: ${JSON.stringify(selected)}`);
  assert(
    selected.actionState === 'mixed' &&
      selected.selectionText.includes('1 contact selected.') &&
      selected.visibleSelectedCount === '1' &&
      selected.hiddenSelectedCount === '0',
    `Contacts selected bulk toolbar should expose mixed ready/blocked state: ${JSON.stringify(selected)}`,
  );
  for (const [key, control] of Object.entries({
    exportEvidence: selected.exportEvidence,
    applyRetention: selected.applyRetention,
    syncSelected: selected.syncSelected,
    statusSelect: selected.statusSelect,
    applyLifecycle: selected.applyLifecycle,
  })) {
    assert(control.found, `Contacts selected bulk ${key} control missing: ${JSON.stringify(selected)}`);
    assert(control.describedBy === selected.statusId, `Contacts selected bulk ${key} must reference action status: ${JSON.stringify(selected)}`);
    assert(control.state === 'ready' && control.disabled === false && control.disabledReason === '', `Contacts selected bulk ${key} should be ready: ${JSON.stringify(selected)}`);
  }
  assert(
    selected.mergeDuplicates.found &&
      selected.mergeDuplicates.describedBy === selected.statusId &&
      selected.mergeDuplicates.state === 'blocked' &&
      selected.mergeDuplicates.disabled === true &&
      selected.mergeDuplicates.disabledReason.includes('Select two or more contacts with the same email'),
    `Contacts selected bulk merge guidance drifted: ${JSON.stringify(selected)}`,
  );
  assert(
    selected.statusText.includes('Export evidence available.') &&
      selected.statusText.includes('Apply retention available.') &&
      selected.statusText.includes('Sync selected available.') &&
      selected.statusText.includes('Apply lifecycle available for') &&
      selected.statusText.includes('Merge duplicates unavailable: Select two or more contacts with the same email'),
    `Contacts selected bulk action status copy drifted: ${JSON.stringify(selected)}`,
  );
  return { initial, selected };
};

const assertContactsCreateActionsReady = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="contacts-create-action-status"]');
      const statusId = status?.id || '';
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const save = document.querySelector('[data-testid="contacts-save-contact"]');
      const importCsv = document.querySelector('[data-testid="contacts-import-csv"]');
      const template = document.querySelector('[data-testid="contacts-import-template"]');
      const readControl = (button) => ({
        exists: button instanceof HTMLButtonElement,
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        describedBy: button instanceof HTMLElement ? button.getAttribute('aria-describedby') || '' : '',
        actionState: button instanceof HTMLElement ? button.getAttribute('data-action-state') || '' : '',
        actionStatus: button instanceof HTMLElement ? button.getAttribute('data-action-status') || '' : '',
        disabledReason: button instanceof HTMLElement ? button.getAttribute('data-disabled-reason') || '' : '',
        targetSiteId: button instanceof HTMLElement ? button.getAttribute('data-target-site-id') || '' : '',
      });
      const controls = [save, importCsv, template].map(readControl);
      return {
        ready: status instanceof HTMLElement &&
          statusId === 'contacts-create-action-status' &&
          statusText.includes('Save contact available for ${SITE_ID}.') &&
          controls.every((control) => (
            control.exists &&
            control.disabled === false &&
            control.describedBy === statusId &&
            control.actionState === 'ready' &&
            control.disabledReason === '' &&
            control.targetSiteId === '${SITE_ID}' &&
            control.actionStatus.includes('available for ${SITE_ID}.')
          )),
        statusText,
        controls,
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);

    if (state.ready) return state;
    if (attempt === 79) throw new Error(`Contacts create/import actions did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => {
    const text = document.body?.innerText || '';
    const controlMapDetails = document.querySelector('[data-testid="contacts-control-map-details"]');
	    const connectedWorkflowsDetails = document.querySelector('[data-testid="contacts-connected-workflows-details"]');
	    const promotionContractDetails = document.querySelector('[data-testid="contacts-promotion-contract-details"]');
	    const controlMapText = controlMapDetails?.textContent || '';
	    const connectedWorkflowsText = connectedWorkflowsDetails?.textContent || '';
	    const promotionContractText = promotionContractDetails?.textContent || '';
	    const actionGroup = document.querySelector('[data-testid="contacts-action-group"]');
	    const actionStatus = document.querySelector('[data-testid="contacts-action-status"]');
	    const bulkGroup = document.querySelector('[data-testid="contacts-bulk-actions"]');
	    const bulkSelection = document.querySelector('[data-testid="contacts-bulk-selection-summary"]');
	    const bulkStatus = document.querySelector('[data-testid="contacts-bulk-action-status"]');
	    const createStatus = document.querySelector('[data-testid="contacts-create-action-status"]');
	    const createStatusId = createStatus?.id || '';
	    const createStatusText = createStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
	    const actionAttr = (testId, attr) => document.querySelector('[data-testid="' + testId + '"]')?.getAttribute(attr) || '';
	    const createControl = (testId) => {
	      const control = document.querySelector('[data-testid="' + testId + '"]');
	      return {
	        exists: control instanceof HTMLButtonElement,
	        disabled: control instanceof HTMLButtonElement ? control.disabled : null,
	        describedBy: control?.getAttribute('aria-describedby') || '',
	        actionState: control?.getAttribute('data-action-state') || '',
	        actionStatus: control?.getAttribute('data-action-status') || '',
	        disabledReason: control?.getAttribute('data-disabled-reason') || '',
	        targetSiteId: control?.getAttribute('data-target-site-id') || '',
	      };
	    };
	    return {
	      width: window.innerWidth,
	      scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="contacts-command-center"]')),
      controlMapCollapsed: controlMapDetails instanceof HTMLDetailsElement &&
        controlMapDetails.open === false &&
        controlMapDetails.getAttribute('data-default-collapsed') === 'true',
      connectedWorkflowsCollapsed: connectedWorkflowsDetails instanceof HTMLDetailsElement &&
        connectedWorkflowsDetails.open === false &&
        connectedWorkflowsDetails.getAttribute('data-default-collapsed') === 'true',
      promotionContractCollapsed: promotionContractDetails instanceof HTMLDetailsElement &&
        promotionContractDetails.open === false &&
        promotionContractDetails.getAttribute('data-default-collapsed') === 'true',
      hasControlMap: Boolean(document.querySelector('[data-testid="contacts-control-map"]')) &&
        controlMapText.includes('Contacts control map') &&
        controlMapText.includes('Show map') &&
        controlMapText.includes('Contact API') &&
        controlMapText.includes('Lifecycle actions'),
      hasConnectedWorkflows: Boolean(document.querySelector('[data-testid="contacts-connected-workflows"]')) &&
        connectedWorkflowsText.includes('Connected lead workflows') &&
        connectedWorkflowsText.includes('Show workflows') &&
        connectedWorkflowsText.includes('Registration page') &&
        connectedWorkflowsText.includes('Settings'),
      hasPromotionContract: Boolean(document.querySelector('[data-testid="contacts-promotion-contract"]')) &&
        promotionContractText.includes('Lead promotion contract') &&
        promotionContractText.includes('Registration page') &&
        promotionContractText.includes('Show promotion'),
      hasMemberCaptureHandoff: Boolean(document.querySelector('[data-testid="contacts-member-capture-handoff"]')) &&
        promotionContractText.includes('backy.contact-member-capture-handoff.v1') &&
        promotionContractText.includes('Copy member handoff') &&
        promotionContractText.includes('Registration definition') &&
        promotionContractText.includes('Provider gate'),
      hasBulkActions: Boolean(document.querySelector('[data-testid="contacts-bulk-actions"]')),
	      bulkGroupRole: bulkGroup?.getAttribute('role') || '',
	      bulkGroupLabel: bulkGroup?.getAttribute('aria-label') || '',
	      bulkGroupDescribedBy: bulkGroup?.getAttribute('aria-describedby') || '',
	      bulkSelectionId: bulkSelection?.id || '',
	      bulkSelectionText: bulkSelection?.textContent?.replace(/\\s+/g, ' ').trim() || '',
	      bulkStatusId: bulkStatus?.id || '',
	      bulkStatusText: bulkStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
	      bulkStatusData: bulkGroup?.getAttribute('data-action-status') || '',
	      bulkActionState: bulkGroup?.getAttribute('data-action-state') || '',
	      bulkSelectedCount: bulkGroup?.getAttribute('data-selected-count') || '',
	      bulkExportState: actionAttr('contacts-retention-export', 'data-action-state'),
	      bulkApplyRetentionState: actionAttr('contacts-retention-apply', 'data-action-state'),
	      bulkSyncState: actionAttr('contacts-sync-webhook', 'data-action-state'),
	      bulkLifecycleState: actionAttr('contacts-bulk-apply-lifecycle', 'data-action-state'),
	      bulkMergeState: actionAttr('contacts-merge-duplicates', 'data-action-state'),
	      createStatusId,
	      createStatusText,
	      saveContactControl: createControl('contacts-save-contact'),
	      importCsvControl: createControl('contacts-import-csv'),
	      importTemplateControl: createControl('contacts-import-template'),
      hasCreateContact: Boolean(document.querySelector('[data-testid="contacts-create-contact"]')),
      hasImportCsv: Boolean(document.querySelector('[data-testid="contacts-import-csv"]')),
      hasImportTemplate: Boolean(document.querySelector('[data-testid="contacts-import-template"]')),
      hasMergeDuplicates: Boolean(document.querySelector('[data-testid="contacts-merge-duplicates"]')),
      hasSegmentAnalytics: Boolean(document.querySelector('[data-testid="contacts-segment-analytics"]')) &&
        text.includes('Backend contact segments') &&
        text.includes('/forms/contact-segments'),
      hasSavedLists: Boolean(document.querySelector('[data-testid="contacts-saved-lists"]')) &&
        text.includes('Saved lead lists') &&
        text.includes('Smoke Qualified Leads') &&
        text.includes('/forms/contact-lists'),
      hasPromoteUser: Boolean(document.querySelector('[data-testid="contacts-promote-user"]')) &&
        text.includes('/contacts/{contactId}/promote') &&
        text.includes('Promoted user'),
	      hasPromoteCustomer: Boolean(document.querySelector('[data-testid="contacts-promote-customer"]')) &&
	        text.includes('/contacts/{contactId}/promote-customer') &&
	        text.includes('Promoted customer'),
	      actionGroupRole: actionGroup?.getAttribute('role') || '',
	      actionGroupLabel: actionGroup?.getAttribute('aria-label') || '',
	      actionGroupDescribedBy: actionGroup?.getAttribute('aria-describedby') || '',
	      actionStatusId: actionStatus?.id || '',
	      actionStatusText: actionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
	      actionStatusData: actionGroup?.getAttribute('data-action-status') || '',
	      contactedState: actionAttr('contacts-mark-contacted', 'data-action-state'),
	      qualifiedState: actionAttr('contacts-mark-qualified', 'data-action-state'),
	      promoteUserState: actionAttr('contacts-promote-user', 'data-action-state'),
	      promoteCustomerState: actionAttr('contacts-promote-customer', 'data-action-state'),
	      newState: actionAttr('contacts-mark-new', 'data-action-state'),
	      archiveState: actionAttr('contacts-archive-contact', 'data-action-state'),
	      deleteState: actionAttr('contacts-delete-contact', 'data-action-state'),
	      deleteDescribedBy: actionAttr('contacts-delete-contact', 'aria-describedby'),
	      hasContactSync: Boolean(document.querySelector('[data-testid="contacts-sync-webhook"]')) &&
	        text.includes('/contacts/sync') &&
	        text.includes('Last sync:'),
      hasContactRetention: Boolean(document.querySelector('[data-testid="contacts-retention-apply"]')) &&
        text.includes('/contacts/consent-retention') &&
        text.includes('Last retention:'),
      hasAccessAudit: Boolean(document.querySelector('[data-testid="contacts-access-audit"]')) &&
        text.includes('Contacts access and audit') &&
        text.includes('forms.manage') &&
        text.includes('activity.export') &&
        text.includes('Contact retention applied'),
      hasInbox: text.includes('Lead Inbox') || false,
      hasApi: text.includes('Contact pipeline API') || false,
      hasLead: text.includes('contacts-smoke@example.com') || false,
    };
  })()`);
  assert(layout.scrollWidth <= layout.width + 8, `Contacts page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter
    && layout.controlMapCollapsed
    && layout.connectedWorkflowsCollapsed
    && layout.promotionContractCollapsed
    && layout.hasControlMap
    && layout.hasConnectedWorkflows
    && layout.hasPromotionContract
    && layout.hasMemberCaptureHandoff
    && layout.hasBulkActions
	    && layout.bulkGroupRole === 'group'
	    && layout.bulkGroupLabel === 'Selected contact bulk actions'
	    && layout.bulkGroupDescribedBy.includes(layout.bulkSelectionId)
	    && layout.bulkGroupDescribedBy.includes(layout.bulkStatusId)
	    && layout.bulkStatusText
	    && layout.bulkStatusData === layout.bulkStatusText
	    && layout.bulkActionState === 'blocked'
	    && layout.bulkSelectedCount === '0'
	    && layout.bulkSelectionText.startsWith('No contacts selected.')
	    && layout.bulkStatusText.includes('Export evidence unavailable')
	    && layout.bulkStatusText.includes('Merge duplicates unavailable')
	    && layout.bulkExportState === 'blocked'
	    && layout.bulkApplyRetentionState === 'blocked'
	    && layout.bulkSyncState === 'blocked'
	    && layout.bulkLifecycleState === 'blocked'
	    && layout.bulkMergeState === 'blocked'
	    && layout.createStatusId === 'contacts-create-action-status'
	    && layout.createStatusText.includes('Save contact available for')
	    && [layout.saveContactControl, layout.importCsvControl, layout.importTemplateControl].every((control) => (
	      control.exists
	      && control.disabled === false
	      && control.describedBy === layout.createStatusId
	      && control.actionState === 'ready'
	      && control.disabledReason === ''
	      && control.targetSiteId === SITE_ID
	      && control.actionStatus.includes(`available for ${SITE_ID}.`)
	    ))
    && layout.hasCreateContact
    && layout.hasImportCsv
    && layout.hasImportTemplate
    && layout.hasMergeDuplicates
    && layout.hasSegmentAnalytics
    && layout.hasSavedLists
	    && layout.hasPromoteUser
	    && layout.hasPromoteCustomer
	    && layout.actionGroupRole === 'group'
	    && layout.actionGroupLabel.includes('Actions for')
	    && layout.actionGroupDescribedBy === layout.actionStatusId
	    && layout.actionStatusText
	    && layout.actionStatusData === layout.actionStatusText
	    && layout.actionStatusText.includes('Contacted')
	    && layout.actionStatusText.includes('Promote user')
	    && layout.actionStatusText.includes('Delete')
	    && layout.contactedState
	    && layout.qualifiedState
	    && layout.promoteUserState
	    && layout.promoteCustomerState
	    && layout.newState
	    && layout.archiveState
	    && layout.deleteState === 'ready'
	    && layout.deleteDescribedBy === layout.actionStatusId
	    && layout.hasContactSync
    && layout.hasContactRetention
    && layout.hasAccessAudit
    && layout.hasInbox
    && layout.hasApi
    && layout.hasLead,
    `Contacts page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-contacts-${Date.now()}`);
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

const runContactDeleteDialogSmoke = async () => {
  const form = await createLeadForm();
  let client;
  const { childProcess, userDataDir } = launchChrome();

  try {
    await submitLead(form.id);
    const contact = await waitForContactByEmail(form.id, 'contacts-smoke@example.com');

    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await setBrowserSession(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    await navigateToContacts(client, form.id);
    const semantics = await assertContactDeleteDialogRecovery(client, contact);

    console.log(JSON.stringify({
      ok: true,
      guard: 'contacts-delete-dialog',
      siteId: SITE_ID,
      formId: form.id,
      contactId: contact.id,
      semantics,
    }, null, 2));
  } finally {
    await deleteForm(form.id).catch((error) => {
      console.warn('Unable to delete contacts delete-dialog smoke form:', error instanceof Error ? error.message : error);
    });
    await cleanupBrowser({ client, childProcess, userDataDir });
  }
};

const main = async () => {
  assertContactsEmptyStatesUseSharedComponent();
  if (process.env.BACKY_CONTACTS_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'contacts-source' }));
    return;
  }

  await loginAdminApi();
  if (process.env.BACKY_CONTACTS_DELETE_DIALOG_SMOKE === '1') {
    await runContactDeleteDialogSmoke();
    return;
  }

  const syncReceiver = await startContactSyncReceiver();
  const form = await createLeadForm();
  let savedListId;
  let promotedUserId;
  let promotedCustomerCleanup = null;
  let cleaned = false;
  let client;
  const { childProcess, userDataDir } = launchChrome();

  try {
    const directContact = await createContactDirectly(form.id);
    await assertInvalidContactEmailRejected(form.id, directContact.id);
    await assertContactHardDelete(form.id);
    await assertContactPromotionBillingSeatLimitEnforced(form.id);
    const importedContact = await importContactsCsv(form.id);
    const duplicateContacts = await createDuplicateContacts(form.id);
    const submission = await submitLead(form.id);
    const contacts = await listContacts(form.id);
    const contactSegments = await listContactSegments(form.id);
    const duplicateSegment = contactSegments.segments?.find((segment) => segment.id === 'duplicate-email');
    const readySegment = contactSegments.segments?.find((segment) => segment.id === 'ready-to-promote');
    const contact = contacts.find((item) => item.email === 'contacts-smoke@example.com');
    assert(contact?.id, `Lead submission did not create a contact: ${JSON.stringify(contacts).slice(0, 500)}`);
    assert(contact.status === 'new', `New contact should start with new status: ${contact.status}`);
    assert(contacts.some((item) => item.id === directContact.id && item.status === 'contacted'), 'Direct contact create did not persist.');
    assert(contacts.some((item) => item.id === importedContact.id && item.status === 'qualified'), 'Imported contact did not persist.');
    assert(duplicateContacts.every((duplicate) => contacts.some((item) => item.id === duplicate.id)), 'Duplicate contacts did not persist.');
    assert(contactSegments.summary?.contacts >= contacts.length, `Contact segments did not include current contacts: ${JSON.stringify(contactSegments).slice(0, 500)}`);
    assert(duplicateSegment?.count >= 2, `Duplicate contact segment did not report duplicate contacts: ${JSON.stringify(contactSegments).slice(0, 500)}`);
    assert(readySegment?.count >= 3, `Ready-to-promote segment did not include qualified contacts: ${JSON.stringify(contactSegments).slice(0, 500)}`);
    const savedList = await createContactSavedList(form.id);
    savedListId = savedList.id;

    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await setBrowserSession(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    await navigateToContacts(client, form.id);
    await assertContactsCreateActionsReady(client);
    if (BULK_ACTION_STATUS_SMOKE) {
      const bulkActionStatus = await assertContactsBulkActionStatus(client, contact.email);
      console.log(JSON.stringify({
        ok: true,
        mode: 'contacts-bulk-action-status',
        siteId: SITE_ID,
        formId: form.id,
        contactId: contact.id,
        bulkActionStatus,
      }, null, 2));
      return;
    }
    const existingCustomerCollection = await findCollectionBySlug('customers');
    const promotedContact = await promoteContactInUi(client, form.id, importedContact);
    promotedUserId = promotedContact.promotion.existingUser ? null : promotedContact.user.id;
    const promotedCustomer = await promoteContactToCustomerInUi(client, form.id, promotedContact.contact);
    promotedCustomerCleanup = promotedCustomer.promotion.createdCollection && !existingCustomerCollection
      ? { collectionId: promotedCustomer.promotion.collectionId, recordId: null }
      : { collectionId: promotedCustomer.promotion.collectionId, recordId: promotedCustomer.promotion.recordId };
    const syncedContact = await syncContactInUi(client, form.id, promotedCustomer.contact, syncReceiver.url);
    assert(syncReceiver.received.some((delivery) => (
      delivery.body?.kind === 'contact-sync'
      && delivery.body?.contactIds?.includes(promotedCustomer.contact.id)
      && delivery.body?.contacts?.some((item) => item.email === promotedCustomer.contact.email)
    )), `Contact sync receiver did not receive promoted contact: ${JSON.stringify(syncReceiver.received).slice(0, 500)}`);
    const retentionExport = await exportContactRetention(form.id, contact);
    const retainedContact = await applyContactRetentionInUi(client, form.id, contact);
    const contactAudit = await waitForContactAuditPanel(client);
    const mergedDuplicateContacts = await mergeDuplicateContactsInUi(client, form.id, duplicateContacts);
    await updateContactInUi(client, { id: contact.id, formId: form.id });
    const updatedContact = await archiveContactWithBulkAction(client, { id: contact.id, formId: form.id });
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

    await deleteContactSavedList(savedListId);
    savedListId = null;
    await deleteUser(promotedUserId);
    promotedUserId = null;
    if (promotedCustomerCleanup?.recordId) {
      await deleteCollectionRecord(promotedCustomerCleanup.collectionId, promotedCustomerCleanup.recordId);
    } else if (promotedCustomerCleanup?.collectionId) {
      await deleteCollection(promotedCustomerCleanup.collectionId);
    }
    promotedCustomerCleanup = null;
    await deleteForm(form.id);
    cleaned = true;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      url: `${ADMIN_BASE_URL}/contacts?siteId=${SITE_ID}&formId=${form.id}`,
      form: {
        id: form.id,
        title: form.title,
      },
      submission: {
        id: submission.id,
        status: submission.status,
      },
      contact: {
        id: updatedContact.id,
        status: updatedContact.status,
        notes: updatedContact.notes,
      },
      directContact: {
        id: directContact.id,
        status: directContact.status,
      },
      importedContact: {
        id: importedContact.id,
        status: importedContact.status,
      },
      promotedContact: {
        contactId: promotedContact.contact.id,
        userId: promotedContact.user.id,
        email: promotedContact.user.email,
      },
      promotedCustomer: {
        contactId: promotedCustomer.contact.id,
        collectionId: promotedCustomer.promotion.collectionId,
        recordId: promotedCustomer.record.id,
        email: promotedCustomer.record.values.email,
      },
      syncedContact: {
        contactId: promotedCustomer.contact.id,
        target: syncReceiver.url,
        eventId: syncedContact.event.id,
      },
      retainedContact: {
        contactId: retainedContact.id,
        consent: retainedContact.sourceValues?.consent,
        exportedDue: retentionExport.due,
      },
      contactAudit: {
        visible: contactAudit.ok,
      },
      mergedDuplicateContacts: {
        primaryId: mergedDuplicateContacts.primary.id,
        archivedId: mergedDuplicateContacts.archived.id,
      },
      contactSegments: {
        contacts: contactSegments.summary?.contacts,
        duplicateEmail: duplicateSegment?.count,
        readyToPromote: readySegment?.count,
      },
      savedList: {
        id: savedList.id,
        name: savedList.name,
      },
      layout,
      cleaned,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (savedListId) {
      await deleteContactSavedList(savedListId).catch((error) => {
        console.warn('Unable to delete smoke saved list:', error instanceof Error ? error.message : error);
      });
    }
    if (promotedUserId) {
      await deleteUser(promotedUserId).catch((error) => {
        console.warn('Unable to delete promoted smoke user:', error instanceof Error ? error.message : error);
      });
    }
    if (promotedCustomerCleanup?.recordId) {
      await deleteCollectionRecord(promotedCustomerCleanup.collectionId, promotedCustomerCleanup.recordId).catch((error) => {
        console.warn('Unable to delete promoted smoke customer record:', error instanceof Error ? error.message : error);
      });
    } else if (promotedCustomerCleanup?.collectionId) {
      await deleteCollection(promotedCustomerCleanup.collectionId).catch((error) => {
        console.warn('Unable to delete promoted smoke customer collection:', error instanceof Error ? error.message : error);
      });
    }

    if (!cleaned && form?.id) {
      await deleteForm(form.id).catch((error) => {
        console.warn('Unable to delete smoke form:', error instanceof Error ? error.message : error);
      });
    }

    await cleanupBrowser({ client, childProcess, userDataDir });
    await syncReceiver.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
