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
const FRONTEND_FORM_TEMPLATE_ID = 'smoke-form-contract-template';
const FRONTEND_FORM_TEMPLATE_NAME = 'Smoke Frontend Intake';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
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
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
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
  return payload.data?.forms || payload.forms || [];
};

const getFormWithSubmissions = async (formId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}/submissions?limit=100`);
  return {
    form: payload.data?.form || payload.form,
    submissions: payload.data?.submissions?.data || payload.submissions?.data || [],
  };
};

const deleteForm = async (formId) => {
  if (!formId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/forms/${formId}`, { method: 'DELETE' });
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

const navigateToForms = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/forms?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="forms-command-center"]')),
      templates: document.body?.innerText?.includes('Form templates') || false,
      registration: document.body?.innerText?.includes('Registration') || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (state.ready && state.templates && state.registration) {
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
  assert(form?.fields?.some((field) => field.key === 'project_budget' && field.type === 'select' && field.options?.includes('$25k+')), `Frontend fields did not persist: ${JSON.stringify(form?.fields)}`);
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
      const addButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add field'
      ));

      if (
        !(title instanceof HTMLInputElement) ||
        !(machineName instanceof HTMLInputElement) ||
        !(firstPlaceholder instanceof HTMLInputElement) ||
        !(notificationEmail instanceof HTMLInputElement) ||
        !(notificationWebhook instanceof HTMLInputElement) ||
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
      const fieldCard = fieldCards.find((candidate) => (
        Array.from(candidate.querySelectorAll('input')).some((input) => input.value === 'field_6')
      ));
      const fieldInputs = Array.from((fieldCard || panel).querySelectorAll('input'));
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

      return { ok: true };
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
      const fieldInputs = Array.from((fieldCard || panel).querySelectorAll('input'));
      const minLengthValue = fieldInputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length value'));
      const minLengthMessage = fieldInputs.find((input) => (input.getAttribute('aria-label') || '').includes('Min length message'));
      const collectionWriteToggle = Array.from(panel.querySelectorAll('label')).find((label) => (
        (label.textContent || '').includes('Collection write')
      ))?.querySelector('input[type="checkbox"]');
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
    }))()`);
    const form = await getAdminForm(formId);
    const editedTitle = form?.title === 'Registration edited';
    const company = form?.fields?.some((field) => field.key === 'company' && field.label === 'Company');
    const companyValidation = form?.fields?.find((field) => field.key === 'company')?.validation || [];
    const collectionTarget = form?.collectionTarget;
    const hasCompanyMinLength = companyValidation.some((rule) => (
      rule.type === 'minLength' &&
      Number(rule.value) === 4 &&
      rule.message === 'Company must be at least 4 characters.'
    ));
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

    if (saved.notice && editedTitle && company && hasCompanyMinLength && hasCollectionMapping && placeholder && notificationTargets) {
      return { ...saved, editedTitle, company, hasCompanyMinLength, hasCollectionMapping, placeholder, notificationTargets };
    }

    if (attempt === 79) {
      throw new Error(`Form builder changes did not persist: ${JSON.stringify({
        saved,
        title: form?.title,
        notificationEmail: form?.notificationEmail,
        notificationWebhook: form?.notificationWebhook,
        collectionTarget,
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
    const queued = events.find((event) => event.status === 'queued' && event.submissionId === submission.id);
    const completed = events.find((event) => event.status === expectedStatus && event.submissionId === submission.id);

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
        events,
      };
    }

    await sleep(250);
  }

  throw new Error(`Webhook delivery did not complete for ${submission.id}: ${JSON.stringify(receiver.deliveries.slice(-5))}`);
};

const retryWebhookDeliveryInUi = async (client, formId, submission) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const submissionId = ${JSON.stringify(submission.id)};
      const panel = document.querySelector('[data-testid="forms-webhook-delivery-panel"]');
      const button = panel
        ? Array.from(panel.querySelectorAll('button')).find((candidate) => (
          (candidate.getAttribute('aria-label') || '') === 'Retry webhook delivery ' + submissionId
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
      event.metadata?.retry === true
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

const approveSubmissionInUi = async (client, formId, submissionId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const submissionId = ${JSON.stringify(submissionId)};
      const card = Array.from(document.querySelectorAll('[aria-label^="Approve submission"], div')).find((candidate) => (
        (candidate.textContent || '').includes(submissionId)
      ));
      const approve = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.getAttribute('aria-label') || '') === 'Approve submission ' + submissionId
      ));
      if (approve instanceof HTMLButtonElement && !approve.disabled) {
        approve.click();
        return { ok: true, clicked: true };
      }
      return {
        ok: false,
        hasSubmission: Boolean(card),
        buttons: Array.from(document.querySelectorAll('button')).map((button) => button.getAttribute('aria-label') || button.textContent || '').slice(-20),
      };
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

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="forms-command-center"]')),
    hasAccountContract: Boolean(document.querySelector('[data-testid="forms-account-contract"]')) &&
      document.body?.innerText?.includes('Registration/account handoff') &&
      document.body?.innerText?.includes('Create registration form'),
    hasDeliveryPanel: Boolean(document.querySelector('[data-testid="forms-webhook-delivery-panel"]')) &&
      document.body?.innerText?.includes('Webhook delivery'),
    hasTemplates: document.body?.innerText?.includes('Form templates') || false,
    hasInbox: document.body?.innerText?.includes('Submission inbox') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Forms page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasAccountContract && layout.hasDeliveryPanel && layout.hasTemplates && layout.hasInbox, `Forms page missing expected regions: ${JSON.stringify(layout)}`);
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

const main = async () => {
  await loginAdminApi();
  const originalFrontendDesign = await getFrontendDesign();
  await patchFrontendDesign(smokeFrontendDesignContract());
  const beforeIds = new Set((await listForms()).map((form) => form.id));
  const smokeCollection = await createCollection();
  const webhookReceiver = await startWebhookReceiver({ failFirstFormSubmission: true });
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let frontendCreatedFormId = null;
  let createdFormId = null;
  let frontendCleaned = false;
  let cleaned = false;
  let collectionCleaned = false;
  let frontendTemplateForm = null;
  let webhookFailure = null;
  let webhookRetry = null;
  let webhookDelivery = null;

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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

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
    await editFormBuilderInUi(client, createdFormId, smokeCollection.id, webhookReceiver.url);

    const definition = await requestApi(`/api/sites/${SITE_ID}/forms/${createdFormId}/definition`);
    await assertOpenApiFormSubmissionContract();
    assert(definition.data?.form?.title === 'Registration edited', `Edited registration title did not persist: ${definition.data?.form?.title}`);
    assert(definition.data?.form?.fields?.length === 6, 'Edited registration definition did not expose six fields');
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
    const submitted = await submitRegistration(createdFormId);
    webhookFailure = await waitForWebhookDelivery(webhookReceiver, createdFormId, submitted, 'failed');
    await refreshForms(client);
    webhookRetry = await retryWebhookDeliveryInUi(client, createdFormId, submitted);
    webhookDelivery = await waitForWebhookDelivery(webhookReceiver, createdFormId, submitted, 'succeeded', webhookRetry.delivery.requestId);
    const records = await listCollectionRecords(smokeCollection.id);
    const createdRecord = records.find((record) => record.values?.source_submission_id === submitted.id);
    assert(createdRecord, `Collection record was not created for submission ${submitted.id}: ${JSON.stringify(records.slice(0, 5))}`);
    assert(createdRecord.values?.company === 'Backy Smoke Co', `Collection record did not persist company value: ${JSON.stringify(createdRecord)}`);
    await refreshForms(client);
    const approved = await approveSubmissionInUi(client, createdFormId, submitted.id);
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
      collectionRecord: {
        id: createdRecord.id,
        slug: createdRecord.slug,
        collectionId: smokeCollection.id,
      },
      layout,
      frontendCleaned,
      cleaned,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
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
    if (!collectionCleaned && smokeCollection?.id) {
      await deleteCollection(smokeCollection.id).then(() => {
        collectionCleaned = true;
      }).catch((error) => {
        console.warn('Unable to delete smoke collection:', error instanceof Error ? error.message : error);
      });
    }
    await patchFrontendDesign(originalFrontendDesign).catch((error) => {
      console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
    });

    await cleanupBrowser({ client, childProcess, userDataDir }).catch((error) => {
      console.warn('Unable to clean up forms smoke browser:', error instanceof Error ? error.message : error);
    });
    await webhookReceiver.close().catch((error) => {
      console.warn('Unable to close forms smoke webhook receiver:', error instanceof Error ? error.message : error);
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
