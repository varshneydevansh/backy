#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_FORMS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_FORMS_CDP_PORT || 9379);
const SCREENSHOT_PATH = process.env.BACKY_FORMS_SCREENSHOT || path.join(os.tmpdir(), 'backy-forms-smoke.png');

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

const editFormBuilderInUi = async (client, formId) => {
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
      const addButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add field'
      ));

      if (!(title instanceof HTMLInputElement) || !(machineName instanceof HTMLInputElement) || !(firstPlaceholder instanceof HTMLInputElement) || !(addButton instanceof HTMLButtonElement)) {
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
      const saveButton = Array.from(panel.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save form'
      ));
      if (
        !(minLengthValue instanceof HTMLInputElement) ||
        !(minLengthMessage instanceof HTMLInputElement) ||
        !(saveButton instanceof HTMLButtonElement)
      ) {
        return {
          ok: false,
          reason: 'validation-controls-missing',
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

      if (saveButton.disabled) {
        return { ok: false, reason: 'save-disabled', button: saveButton.textContent || '' };
      }
      saveButton.click();
      return { ok: true };
    })()`);

    if (result.ok) break;

    if (attempt === 79) {
      throw new Error(`Unable to save form validation changes: ${JSON.stringify(result)}`);
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
    const hasCompanyMinLength = companyValidation.some((rule) => (
      rule.type === 'minLength' &&
      Number(rule.value) === 4 &&
      rule.message === 'Company must be at least 4 characters.'
    ));
    const placeholder = form?.fields?.some((field) => field.key === 'full_name' && field.placeholder === 'Grace Hopper');

    if (saved.notice && editedTitle && company && hasCompanyMinLength && placeholder) {
      return { ...saved, editedTitle, company, hasCompanyMinLength, placeholder };
    }

    if (attempt === 79) {
      throw new Error(`Form builder changes did not persist: ${JSON.stringify({
        saved,
        title: form?.title,
        fields: form?.fields?.map((field) => ({ key: field.key, label: field.label, placeholder: field.placeholder, validation: field.validation })),
      })}`);
    }

    await sleep(250);
  }

  return null;
};

const submitRegistration = async (formId) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/forms/${formId}/submissions`, {
    method: 'POST',
    body: JSON.stringify({
      requestId: `forms-smoke-${Date.now().toString(36)}`,
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
  return submission;
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
      values: {
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
  return payload;
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
    hasTemplates: document.body?.innerText?.includes('Form templates') || false,
    hasInbox: document.body?.innerText?.includes('Submission inbox') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Forms page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasTemplates && layout.hasInbox, `Forms page missing expected regions: ${JSON.stringify(layout)}`);
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
  const beforeIds = new Set((await listForms()).map((form) => form.id));
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let createdFormId = null;
  let cleaned = false;

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
      source: AUTH_STORAGE_SCRIPT,
    });

    await navigateToForms(client);
    await clickRegistrationCreateForm(client);
    const created = await waitForCreatedForm(client, beforeIds);
    createdFormId = created.form.id;
    await editFormBuilderInUi(client, createdFormId);

    const definition = await requestApi(`/api/sites/${SITE_ID}/forms/${createdFormId}/definition`);
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
      definition.data.form.fields.some((field) => field.key === 'full_name' && field.placeholder === 'Grace Hopper'),
      'Edited registration definition did not expose updated placeholder',
    );

    const invalidSubmission = await submitInvalidRegistration(createdFormId);
    const submitted = await submitRegistration(createdFormId);
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
      form: {
        id: createdFormId,
        title: definition.data.form.title,
        fieldCount: definition.data.form.fields.length,
        contactShare: Boolean(definition.data.form.contactShare?.enabled),
        companyValidation: definition.data.form.fields.find((field) => field.key === 'company')?.validation || [],
      },
      invalidSubmissionRejected: Boolean(invalidSubmission.error || invalidSubmission.errorMessage),
      submission: {
        id: submitted.id,
        initialStatus: submitted.status,
        finalStatus: approved.status,
      },
      layout,
      cleaned,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!cleaned && createdFormId) {
      await deleteForm(createdFormId).catch((error) => {
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
