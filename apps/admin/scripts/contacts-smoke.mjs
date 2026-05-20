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
    source.includes('const selectedVisibleContacts = useMemo') &&
      source.includes('const hiddenSelectedContactCount = Math.max') &&
      source.includes('data-testid="contacts-bulk-selection-summary"') &&
      source.includes('outside this view'),
    'Contacts bulk toolbar must summarize selected contacts outside the current filtered view',
  );
  assert(
    source.includes('const loadContactPermissions = useCallback(() => {') &&
      source.includes('data-testid="contacts-permission-state"') &&
      source.includes('Contact permissions could not be verified') &&
      source.includes('aria-label="Retry loading contact permissions"') &&
      source.includes('Retry permissions') &&
      source.includes('to="/users"') &&
      source.includes('Review users'),
    'Contacts permission state must expose retryable permission recovery and user-access handoff',
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
    || process.env.BACKY_ADMIN_2FA_CODE;
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

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="contacts-command-center"]')),
      hasPromotionContract: Boolean(document.querySelector('[data-testid="contacts-promotion-contract"]')) &&
        document.body?.innerText?.includes('Lead promotion contract') &&
        document.body?.innerText?.includes('Registration page'),
      hasBulkActions: Boolean(document.querySelector('[data-testid="contacts-bulk-actions"]')),
      hasCreateContact: Boolean(document.querySelector('[data-testid="contacts-create-contact"]')),
      hasImportCsv: Boolean(document.querySelector('[data-testid="contacts-import-csv"]')),
      hasImportTemplate: Boolean(document.querySelector('[data-testid="contacts-import-template"]')),
      hasMergeDuplicates: Boolean(document.querySelector('[data-testid="contacts-merge-duplicates"]')),
      hasSegmentAnalytics: Boolean(document.querySelector('[data-testid="contacts-segment-analytics"]')) &&
        document.body?.innerText?.includes('Backend contact segments') &&
        document.body?.innerText?.includes('/forms/contact-segments'),
      hasSavedLists: Boolean(document.querySelector('[data-testid="contacts-saved-lists"]')) &&
        document.body?.innerText?.includes('Saved lead lists') &&
        document.body?.innerText?.includes('Smoke Qualified Leads') &&
        document.body?.innerText?.includes('/forms/contact-lists'),
      hasPromoteUser: Boolean(document.querySelector('[data-testid="contacts-promote-user"]')) &&
        document.body?.innerText?.includes('/contacts/{contactId}/promote') &&
        document.body?.innerText?.includes('Promoted user'),
      hasPromoteCustomer: Boolean(document.querySelector('[data-testid="contacts-promote-customer"]')) &&
        document.body?.innerText?.includes('/contacts/{contactId}/promote-customer') &&
        document.body?.innerText?.includes('Promoted customer'),
      hasContactSync: Boolean(document.querySelector('[data-testid="contacts-sync-webhook"]')) &&
        document.body?.innerText?.includes('/contacts/sync') &&
        document.body?.innerText?.includes('Last sync:'),
      hasContactRetention: Boolean(document.querySelector('[data-testid="contacts-retention-apply"]')) &&
        document.body?.innerText?.includes('/contacts/consent-retention') &&
        document.body?.innerText?.includes('Last retention:'),
      hasAccessAudit: Boolean(document.querySelector('[data-testid="contacts-access-audit"]')) &&
        document.body?.innerText?.includes('Contacts access and audit') &&
        document.body?.innerText?.includes('forms.manage') &&
        document.body?.innerText?.includes('activity.export') &&
        document.body?.innerText?.includes('Contact retention applied'),
      hasInbox: document.body?.innerText?.includes('Lead Inbox') || false,
      hasApi: document.body?.innerText?.includes('Contact pipeline API') || false,
      hasLead: document.body?.innerText?.includes('contacts-smoke@example.com') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Contacts page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter
    && layout.hasPromotionContract
    && layout.hasBulkActions
    && layout.hasCreateContact
    && layout.hasImportCsv
    && layout.hasImportTemplate
    && layout.hasMergeDuplicates
    && layout.hasSegmentAnalytics
    && layout.hasSavedLists
    && layout.hasPromoteUser
    && layout.hasPromoteCustomer
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

const main = async () => {
  assertContactsEmptyStatesUseSharedComponent();
  if (process.env.BACKY_CONTACTS_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'contacts-source' }));
    return;
  }

  const syncReceiver = await startContactSyncReceiver();
  await loginAdminApi();
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
