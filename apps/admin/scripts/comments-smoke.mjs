#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COMMENTS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COMMENTS_CDP_PORT || 9381);
const SCREENSHOT_PATH = process.env.BACKY_COMMENTS_SCREENSHOT || path.join(os.tmpdir(), 'backy-comments-smoke.png');
let apiAdminSessionToken = '';
let apiAdminSessionData = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
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
  apiAdminSessionData = payload.data;
  return payload.data;
};

const createPage = async () => {
  const suffix = Date.now().toString(36);
  const title = `Comments Smoke Page ${suffix}`;
  const slug = `comments-smoke-${suffix}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      status: 'published',
      description: 'Temporary page for the comments moderation smoke test.',
      content: [],
      meta: {
        title,
        description: 'Temporary page for the comments moderation smoke test.',
        canonical: `/${slug}`,
      },
    }),
  });
  const page = payload.data?.page || payload.page;
  assert(page?.id, `Unable to create comments smoke page: ${JSON.stringify(payload).slice(0, 500)}`);
  return page;
};

const deletePage = async (pageId) => {
  if (!pageId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
};

const submitComment = async ({ pageId, authorName, authorEmail, content, requestId, parentId, commentThreadId }) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/pages/${pageId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      authorName,
      authorEmail,
      requestId,
      parentId,
      commentThreadId,
      honeypot: '',
      rateLimitBypass: true,
      startedAt: Date.now() - 3000,
      moderationMode: 'manual',
      commentRequireEmail: true,
    }),
  });
  const comment = payload.data?.comment || payload.comment;
  assert(comment?.id, `Comment submission did not return a comment: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(comment.status === 'pending', `Expected pending comment, received ${comment.status}`);
  return comment;
};

const submitCommentExpectFailure = async ({ pageId, authorName, authorEmail, content, requestId }) => {
  const response = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/pages/${pageId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      authorName,
      authorEmail,
      requestId,
      honeypot: '',
      rateLimitBypass: true,
      startedAt: Date.now() - 3000,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(!response.ok || payload.success === false, `Expected comment failure, received ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  return { status: response.status, payload };
};

const getAdminSite = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`);
  return payload.data?.site || payload.site;
};

const patchSiteCommentPolicy = async (policy) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      settings: {
        commentPolicy: policy,
      },
    }),
  });
  return payload.data?.site || payload.site;
};

const listComments = async (requestId) => {
  const query = new URLSearchParams({
    status: 'all',
    limit: '100',
    sort: 'newest',
    requestId,
  });
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments?${query.toString()}`);
  return payload.data?.comments || payload.comments || [];
};

const listBlocklist = async (q = '') => {
  const query = new URLSearchParams({
    limit: '100',
  });
  if (q) query.set('q', q);
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments/blocklist?${query.toString()}`);
  return payload.data?.blocklist || payload.blocklist || [];
};

const getCommentAnalytics = async () => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments/analytics?days=30`);
  return payload.data?.analytics || payload.analytics;
};

const deleteBlocklistEntries = async (ids) => {
  if (!ids.length) return { deleted: [] };
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments/blocklist`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
  return payload.data || payload;
};

const cleanupSmokeBlocklistResidue = async () => {
  const staleEntries = (await listBlocklist()).filter((entry) => (
    String(entry.requestId || '').startsWith('comments-smoke-') ||
    String(entry.reason || '').includes('comments smoke') ||
    String(entry.value || '').startsWith('comments-')
  ));

  if (staleEntries.length > 0) {
    await deleteBlocklistEntries(staleEntries.map((entry) => entry.id));
  }
};

const waitForCommentStatus = async (commentId, requestId, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const comments = await listComments(requestId);
    const comment = comments.find((item) => item.id === commentId);
    if (comment?.status === status) {
      return comment;
    }
    await sleep(250);
  }

  throw new Error(`Comment ${commentId} did not become ${status}`);
};

const waitForCommentReports = async (commentId, requestId, expectedCount) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const comments = await listComments(requestId);
    const comment = comments.find((item) => item.id === commentId);
    if (comment && (comment.reportCount || 0) === expectedCount) {
      return comment;
    }
    await sleep(250);
  }

  throw new Error(`Comment ${commentId} did not reach report count ${expectedCount}`);
};

const waitForBlocklistEntry = async (value) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const blocklist = await listBlocklist(value);
    const entry = blocklist.find((item) => item.value === value);
    if (entry) {
      return entry;
    }
    await sleep(250);
  }

  throw new Error(`Blocklist entry ${value} was not created`);
};

const waitForBlocklistRemoved = async (value) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const blocklist = await listBlocklist(value);
    if (!blocklist.some((item) => item.value === value)) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Blocklist entry ${value} was not removed`);
};

const reportComment = async ({ commentId, reason, requestId }) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments/${commentId}/report`, {
    method: 'POST',
    body: JSON.stringify({
      reason,
      actor: 'comments-smoke',
      requestId,
    }),
  });
  const comment = payload.data?.comment || payload.comment;
  assert(comment?.id, `Comment report did not return a comment: ${JSON.stringify(payload).slice(0, 500)}`);
  assert((comment.reportCount || 0) > 0, `Reported comment did not increment report count: ${JSON.stringify(comment)}`);
  return comment;
};

const reportCommentExpectFailure = async ({ commentId, reason, requestId }) => {
  const response = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/comments/${commentId}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      reason,
      actor: 'comments-smoke',
      requestId,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(!response.ok || payload.success === false, `Expected report failure, received ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  return { status: response.status, payload };
};

const waitForCommentsDeleted = async (requestIds) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const remaining = [];
    for (const requestId of requestIds) {
      const comments = await listComments(requestId);
      remaining.push(...comments);
    }
    if (remaining.length === 0) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary comments still exist after page cleanup: ${requestIds.join(', ')}`);
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
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
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
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
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

const getAuthStorageScript = () => {
  const user = apiAdminSessionData?.user || {
    id: 'user-admin',
    email: 'admin@backy.io',
    fullName: 'Admin User',
    role: 'admin',
  };
  const session = apiAdminSessionData?.session || {
    token: apiAdminSessionToken,
  };

  return `localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({ state: { user, session }, version: 0 }))});`;
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

const navigateToComments = async (client, expectedAuthors) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/comments?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
      queue: document.body?.innerText?.includes('Moderation Queue') || false,
      api: document.body?.innerText?.includes('Comment moderation API') || false,
      analytics: Boolean(document.querySelector('[data-testid="comments-analytics-panel"]')),
      authors: ${JSON.stringify(expectedAuthors)}.every((author) => document.body?.innerText?.includes(author)),
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);

    if (state.ready && state.queue && state.api && state.analytics && state.authors) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Comments page did not render expected comments: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const moderateCommentInUi = async (client, authorName, action, reason = '') => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setTextareaValue = (textarea, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        descriptor?.set?.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(authorName)})
      ));
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      if (${JSON.stringify(reason)}.length > 0) {
        const textarea = document.querySelector('textarea[aria-label="Comment moderation reason"]');
        if (textarea instanceof HTMLTextAreaElement) {
          setTextareaValue(textarea, ${JSON.stringify(reason)});
        }
      }
      const labels = {
        approved: 'Approve comment from ',
        rejected: 'Reject comment from ',
        spam: 'Mark comment from ',
        blocked: 'Block comment from ',
      };
      const prefix = labels[${JSON.stringify(action)}];
      const button = Array.from(card.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '').startsWith(prefix)
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'button-missing',
          buttons: Array.from(card.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || ''),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to mark ${authorName} ${action}: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const resolveReportsInUi = async (client, authorName) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(authorName)})
      ));
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      const button = Array.from(card.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '').startsWith('Resolve reports for comment from ')
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'button-missing',
          buttons: Array.from(card.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || ''),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to resolve reports for ${authorName}: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const removeBlocklistEntryInUi = async (client, value) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="comments-blocklist-panel"]');
      if (!panel) return { ok: false, reason: 'panel-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
      const button = Array.from(panel.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Remove blocklist entry ${value}`)}
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'remove-button-missing',
          text: panel.textContent || '',
          buttons: Array.from(panel.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || ''),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to remove blocklist entry ${value}: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const savePolicyInUi = async (client, blockedTermsText) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const policy = document.querySelector('[data-testid="comments-policy-panel"]');
      if (!policy) return { ok: false, reason: 'policy-panel-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      const requireEmailLabel = Array.from(policy.querySelectorAll('label')).find((label) => (label.textContent || '').includes('Require email'));
      const reportsLabel = Array.from(policy.querySelectorAll('label')).find((label) => (label.textContent || '').includes('Enable reports'));
      const requireEmail = requireEmailLabel?.querySelector('input[type="checkbox"]');
      const reports = reportsLabel?.querySelector('input[type="checkbox"]');
      const moderation = policy.querySelector('select[aria-label="Default comment moderation"]');
      const blockedTerms = policy.querySelector('textarea[aria-label="Comment blocked terms"]');
      if (!(requireEmail instanceof HTMLInputElement) || !(reports instanceof HTMLInputElement) || !(moderation instanceof HTMLSelectElement) || !(blockedTerms instanceof HTMLTextAreaElement)) {
        return { ok: false, reason: 'policy-controls-missing' };
      }
      if (!requireEmail.checked) requireEmail.click();
      if (reports.checked) reports.click();
      moderation.value = 'auto-approve';
      moderation.dispatchEvent(new Event('input', { bubbles: true }));
      moderation.dispatchEvent(new Event('change', { bubbles: true }));
      setInputValue(blockedTerms, ${JSON.stringify(blockedTermsText)});
      const save = Array.from(policy.querySelectorAll('button')).find((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save policy');
      if (!(save instanceof HTMLButtonElement)) return { ok: false, reason: 'save-missing' };
      if (save.disabled) return { ok: false, reason: 'save-disabled', text: policy.textContent || '' };
      save.click();
      return { ok: true };
    })()`);

    if (result.ok) return;

    if (attempt === 79) {
      throw new Error(`Unable to save comment policy in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
    hasAnalytics: Boolean(document.querySelector('[data-testid="comments-analytics-panel"]')),
    hasThreadPanel: Boolean(document.querySelector('[data-testid="comments-thread-panel"]')),
    hasBlocklist: Boolean(document.querySelector('[data-testid="comments-blocklist-panel"]')),
    hasQueue: document.body?.innerText?.includes('Moderation Queue') || false,
    hasApi: document.body?.innerText?.includes('Comment moderation API') || false,
    hasBulk: document.body?.innerText?.includes('Bulk decisions') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Comments page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasAnalytics && layout.hasThreadPanel && layout.hasBlocklist && layout.hasQueue && layout.hasApi && layout.hasBulk, `Comments page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
};

const assertThreadContext = async (client, parentAuthor, replyAuthor) => {
  const state = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="comments-thread-panel"]');
    const filter = document.querySelector('[data-testid="comments-thread-filter"]');
    const bodyText = document.body?.innerText || '';
    const parentCard = Array.from(document.querySelectorAll('[data-testid="comment-card"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(parentAuthor)}) &&
      !(candidate.textContent || '').includes(${JSON.stringify(replyAuthor)})
    ));
    const replyCard = Array.from(document.querySelectorAll('[data-testid="comment-card"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(replyAuthor)})
    ));

    return {
      hasPanel: Boolean(panel),
      hasFilter: filter instanceof HTMLSelectElement,
      optionCount: filter instanceof HTMLSelectElement ? filter.options.length : 0,
      panelText: panel?.textContent || '',
      hasParentReplyCount: Boolean(parentCard && (parentCard.textContent || '').includes('1 reply')),
      hasReplyParent: Boolean(replyCard && (replyCard.textContent || '').includes(${JSON.stringify(`Reply to ${parentAuthor}`)})),
      hasThreadCopy: bodyText.includes('Thread map') && bodyText.includes('Thread triage'),
    };
  })()`);

  assert(state.hasPanel && state.hasFilter && state.optionCount > 1, `Comments thread panel did not expose thread controls: ${JSON.stringify(state)}`);
  assert(state.hasParentReplyCount && state.hasReplyParent && state.hasThreadCopy, `Comments thread context missing parent/reply details: ${JSON.stringify(state)}`);
  return state;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-comments-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, pageId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) {
      childProcess.kill('SIGKILL');
    }
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  if (pageId) {
    try {
      await deletePage(pageId);
    } catch (error) {
      console.warn(`Unable to delete comments smoke page ${pageId}:`, error instanceof Error ? error.message : error);
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let page;
  const requestIds = [];
  const blocklistIdsToCleanup = new Set();
  let restoredPolicy = false;

  try {
    await loginAdminApi();
    await cleanupSmokeBlocklistResidue();
    page = await createPage();
    const suffix = Date.now().toString(36);
    const approveRequestId = `comments-smoke-approve-${suffix}`;
    const rejectRequestId = `comments-smoke-reject-${suffix}`;
    const reportRequestId = `comments-smoke-report-${suffix}`;
    const blockRequestId = `comments-smoke-block-${suffix}`;
    const threadParentRequestId = `comments-smoke-thread-parent-${suffix}`;
    const threadReplyRequestId = `comments-smoke-thread-reply-${suffix}`;
    requestIds.push(approveRequestId, rejectRequestId, reportRequestId, blockRequestId, threadParentRequestId, threadReplyRequestId);

    const approveComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Approve',
      authorEmail: 'comments-approve@example.com',
      content: 'Please approve this temporary page comment from the moderation smoke.',
      requestId: approveRequestId,
    });
    const rejectComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Reject',
      authorEmail: 'comments-reject@example.com',
      content: 'Please reject this temporary page comment from the moderation smoke.',
      requestId: rejectRequestId,
    });
    const reportedComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Report',
      authorEmail: 'comments-report@example.com',
      content: 'Please resolve this temporary reported page comment from the moderation smoke.',
      requestId: reportRequestId,
    });
    const blockedComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Block',
      authorEmail: 'comments-block@example.com',
      content: 'Please block this temporary page comment from the moderation smoke.',
      requestId: blockRequestId,
    });
    const threadParentComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Thread Parent',
      authorEmail: 'comments-thread-parent@example.com',
      content: 'Temporary parent comment for the comments thread map smoke.',
      requestId: threadParentRequestId,
    });
    const threadReplyComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Thread Reply',
      authorEmail: 'comments-thread-reply@example.com',
      content: 'Temporary reply comment for the comments thread map smoke.',
      requestId: threadReplyRequestId,
      parentId: threadParentComment.id,
      commentThreadId: threadParentComment.commentThreadId,
    });
    assert(threadReplyComment.parentId === threadParentComment.id, `Reply comment did not preserve parent id: ${JSON.stringify(threadReplyComment)}`);
    await reportComment({
      commentId: reportedComment.id,
      reason: 'harassment',
      requestId: reportRequestId,
    });
    await waitForCommentReports(reportedComment.id, reportRequestId, 1);
    const analytics = await getCommentAnalytics();
    assert(analytics?.totals?.pending >= 6, `Comment analytics did not include seeded pending comments: ${JSON.stringify(analytics)}`);
    assert(analytics?.totals?.reported >= 1, `Comment analytics did not count reported comments: ${JSON.stringify(analytics)}`);
    assert(analytics?.threads?.withReplies >= 1, `Comment analytics did not count threaded replies: ${JSON.stringify(analytics)}`);
    assert(
      analytics?.reports?.reasons?.some((reason) => reason.reason === 'harassment' && reason.count >= 1),
      `Comment analytics did not expose harassment report reason: ${JSON.stringify(analytics?.reports)}`,
    );

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1680,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: getAuthStorageScript() });

    await navigateToComments(client, [
      'Comments Smoke Approve',
      'Comments Smoke Reject',
      'Comments Smoke Report',
      'Comments Smoke Block',
      'Comments Smoke Thread Parent',
      'Comments Smoke Thread Reply',
    ]);
    await assertThreadContext(client, 'Comments Smoke Thread Parent', 'Comments Smoke Thread Reply');
    await savePolicyInUi(client, 'bannedphrase');
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const site = await getAdminSite();
      const policy = site?.settings?.commentPolicy;
      if (
        policy?.requireEmail === true &&
        policy?.enableReports === false &&
        policy?.moderationMode === 'auto-approve' &&
        policy?.blockedTerms?.includes('bannedphrase')
      ) {
        break;
      }
      if (attempt === 79) {
        throw new Error(`Comment policy did not persist: ${JSON.stringify(policy)}`);
      }
      await sleep(250);
    }
    const blockedTerm = await submitCommentExpectFailure({
      pageId: page.id,
      authorName: 'Comments Smoke Policy',
      authorEmail: 'comments-policy@example.com',
      content: 'This temporary comment contains bannedphrase and should be blocked.',
      requestId: `comments-smoke-policy-${suffix}`,
    });
    assert(blockedTerm.status === 422, `Blocked-term policy should reject with 422: ${JSON.stringify(blockedTerm)}`);

    const reportDisabledRequestId = `comments-smoke-report-disabled-${suffix}`;
    requestIds.push(reportDisabledRequestId);
    const reportDisabledComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Reports Disabled',
      authorEmail: 'comments-policy-report@example.com',
      content: 'Please keep this temporary comment clean so report policy can be tested.',
      requestId: reportDisabledRequestId,
    });
    const reportDisabled = await reportCommentExpectFailure({
      commentId: reportDisabledComment.id,
      reason: 'harassment',
      requestId: reportDisabledRequestId,
    });
    assert(reportDisabled.status === 403, `Reports-disabled policy should reject with 403: ${JSON.stringify(reportDisabled)}`);

    await moderateCommentInUi(client, 'Comments Smoke Approve', 'approved');
    const approved = await waitForCommentStatus(approveComment.id, approveRequestId, 'approved');
    assert(approved.reviewedBy, `Approved comment did not record reviewer: ${JSON.stringify(approved)}`);

    await moderateCommentInUi(client, 'Comments Smoke Reject', 'rejected', 'Rejected by comments smoke.');
    const rejected = await waitForCommentStatus(rejectComment.id, rejectRequestId, 'rejected');
    assert(rejected.rejectionReason === 'Rejected by comments smoke.', `Reject reason did not persist: ${JSON.stringify(rejected)}`);

    await resolveReportsInUi(client, 'Comments Smoke Report');
    const resolvedReport = await waitForCommentReports(reportedComment.id, reportRequestId, 0);
    assert(!resolvedReport.reportReasons?.length, `Report reasons were not cleared: ${JSON.stringify(resolvedReport)}`);

    await moderateCommentInUi(client, 'Comments Smoke Block', 'blocked', 'harassment');
    const blocked = await waitForCommentStatus(blockedComment.id, blockRequestId, 'blocked');
    assert(blocked.blockReason === 'harassment', `Block reason did not persist: ${JSON.stringify(blocked)}`);
    const blocklistEntry = await waitForBlocklistEntry('comments-block@example.com');
    blocklistIdsToCleanup.add(blocklistEntry.id);
    await navigateToComments(client, ['Comments Smoke Block']);
    await removeBlocklistEntryInUi(client, 'comments-block@example.com');
    await waitForBlocklistRemoved('comments-block@example.com');
    blocklistIdsToCleanup.delete(blocklistEntry.id);

    await assertLayout(client);
    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deletePage(page.id);
    page = null;
    await waitForCommentsDeleted(requestIds);
    await patchSiteCommentPolicy({
      enabled: true,
      moderationMode: 'manual',
      allowGuests: true,
      requireName: true,
      requireEmail: false,
      allowReplies: true,
      enableReports: true,
      blockedTerms: [],
      closedMessage: 'Comments are closed for this site.',
      sort: 'newest',
    });
    restoredPolicy = true;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      policy: {
        requireEmail: true,
        reportsDisabled: true,
        reportsDisabledStatus: 403,
        blockedTerms: ['bannedphrase'],
      },
      approvedCommentId: approveComment.id,
      rejectedCommentId: rejectComment.id,
      resolvedReportCommentId: reportedComment.id,
      blockedCommentId: blockedComment.id,
      threadParentCommentId: threadParentComment.id,
      threadReplyCommentId: threadReplyComment.id,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (blocklistIdsToCleanup.size > 0) {
      await deleteBlocklistEntries(Array.from(blocklistIdsToCleanup)).catch((error) => {
        console.warn('Unable to clean comment blocklist entries:', error instanceof Error ? error.message : error);
      });
    }
    if (!restoredPolicy) {
      await patchSiteCommentPolicy({
        enabled: true,
        moderationMode: 'manual',
        allowGuests: true,
        requireName: true,
        requireEmail: false,
        allowReplies: true,
        enableReports: true,
        blockedTerms: [],
        closedMessage: 'Comments are closed for this site.',
        sort: 'newest',
      }).catch((error) => {
        console.warn('Unable to restore comment policy:', error instanceof Error ? error.message : error);
      });
    }
    await cleanup({ client, childProcess, userDataDir, pageId: page?.id });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
