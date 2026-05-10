#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_CONTACTS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_CONTACTS_CDP_PORT || 9380);
const SCREENSHOT_PATH = process.env.BACKY_CONTACTS_SCREENSHOT || path.join(os.tmpdir(), 'backy-contacts-smoke.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
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

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
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
      moderationMode: 'manual',
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
  const csv = [
    ['name', 'email', 'phone', 'status', 'notes', 'sourceValues'],
    ['Contacts Imported User', 'contacts-import@example.com', '+1 555 0192', 'qualified', 'Imported by contacts smoke.', '{"source":"csv-smoke"}'],
  ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/forms/${formId}/contacts/import?upsertByEmail=true`, {
    method: 'POST',
    headers: { 'content-type': 'text/csv; charset=utf-8' },
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

const AUTH_STORAGE_SCRIPT = `
localStorage.setItem('backy-auth-storage', JSON.stringify({ state: { user: { id: '1', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' } }, version: 0 }));
`;

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
      const setTextAreaValue = (textarea, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        descriptor?.set?.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes('contacts-smoke@example.com')
      ));
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      const notes = card.querySelector('textarea');
      const save = Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Save notes for')
      ));
      const qualified = Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Mark Contacts Smoke User as qualified')
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
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes('contacts-smoke@example.com')
      ));
      const qualified = card && Array.from(card.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Mark Contacts Smoke User as qualified')
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

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="contacts-command-center"]')),
      hasBulkActions: Boolean(document.querySelector('[data-testid="contacts-bulk-actions"]')),
      hasCreateContact: Boolean(document.querySelector('[data-testid="contacts-create-contact"]')),
      hasImportCsv: Boolean(document.querySelector('[data-testid="contacts-import-csv"]')),
      hasImportTemplate: Boolean(document.querySelector('[data-testid="contacts-import-template"]')),
      hasMergeDuplicates: Boolean(document.querySelector('[data-testid="contacts-merge-duplicates"]')),
      hasInbox: document.body?.innerText?.includes('Lead Inbox') || false,
      hasApi: document.body?.innerText?.includes('Contact pipeline API') || false,
      hasLead: document.body?.innerText?.includes('contacts-smoke@example.com') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Contacts page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter
    && layout.hasBulkActions
    && layout.hasCreateContact
    && layout.hasImportCsv
    && layout.hasImportTemplate
    && layout.hasMergeDuplicates
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
  const form = await createLeadForm();
  let cleaned = false;
  let client;
  const { childProcess, userDataDir } = launchChrome();

  try {
    const directContact = await createContactDirectly(form.id);
    const importedContact = await importContactsCsv(form.id);
    const duplicateContacts = await createDuplicateContacts(form.id);
    const submission = await submitLead(form.id);
    const contacts = await listContacts(form.id);
    const contact = contacts.find((item) => item.email === 'contacts-smoke@example.com');
    assert(contact?.id, `Lead submission did not create a contact: ${JSON.stringify(contacts).slice(0, 500)}`);
    assert(contact.status === 'new', `New contact should start with new status: ${contact.status}`);
    assert(contacts.some((item) => item.id === directContact.id && item.status === 'contacted'), 'Direct contact create did not persist.');
    assert(contacts.some((item) => item.id === importedContact.id && item.status === 'qualified'), 'Imported contact did not persist.');
    assert(duplicateContacts.every((duplicate) => contacts.some((item) => item.id === duplicate.id)), 'Duplicate contacts did not persist.');

    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: AUTH_STORAGE_SCRIPT,
    });

    await navigateToContacts(client, form.id);
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
      mergedDuplicateContacts: {
        primaryId: mergedDuplicateContacts.primary.id,
        archivedId: mergedDuplicateContacts.archived.id,
      },
      layout,
      cleaned,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!cleaned && form?.id) {
      await deleteForm(form.id).catch((error) => {
        console.warn('Unable to delete smoke form:', error instanceof Error ? error.message : error);
      });
    }

    await cleanupBrowser({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
