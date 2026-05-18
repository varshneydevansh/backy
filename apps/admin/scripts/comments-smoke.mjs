#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COMMENTS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COMMENTS_CDP_PORT || 9381);
const SCREENSHOT_PATH = process.env.BACKY_COMMENTS_SCREENSHOT || path.join(os.tmpdir(), 'backy-comments-smoke.png');
const COMMENT_NOTIFICATION_EMAIL = 'comments-smoke-moderation@example.com';
const EXPECTED_EMAIL_PROVIDER = process.env.BACKY_COMMENTS_SMOKE_EXPECT_EMAIL_PROVIDER || 'local-outbox';
const EXPECTED_EMAIL_STATUS_CODE = Number(process.env.BACKY_COMMENTS_SMOKE_EXPECT_EMAIL_STATUS_CODE || (EXPECTED_EMAIL_PROVIDER === 'local-outbox' ? 202 : 200));
const COMMENT_CAPTCHA_MOCK_TOKEN = process.env.BACKY_FORM_CAPTCHA_MOCK_TOKEN || 'backy-captcha-pass';
let apiAdminSessionToken = '';
let apiAdminSessionData = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertCommentsRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/comments.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Comments route must use the shared EmptyState component for primary list empty states');
  assert(source.includes("title={hasComments ? 'No comments match this view' : 'No comments yet'}"), 'Comments queue empty state must distinguish empty queues from filtered views');
  assert(source.includes('Page and blog comments will appear here for review'), 'Comments queue empty state must tell admins what will populate the queue');
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

const startCommentWebhookReceiver = async ({ failFirstKind } = {}) => new Promise((resolve, reject) => {
  const deliveries = [];
  const failedKinds = new Set();
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
      const shouldFail = (
        failFirstKind &&
        payload?.kind === failFirstKind &&
        payload?.retry !== true &&
        request.headers['x-backy-webhook-retry'] !== 'true' &&
        !failedKinds.has(failFirstKind)
      );
      if (shouldFail) {
        failedKinds.add(failFirstKind);
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
      reject(new Error('Unable to bind comment webhook receiver'));
      return;
    }

    resolve({
      url: `http://127.0.0.1:${address.port}/backy/comments`,
      deliveries,
      close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
    });
  });
});

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
  const smokeMfaCode = process.env.BACKY_COMMENTS_SMOKE_MFA_CODE
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
  apiAdminSessionData = payload.data;
  return payload.data;
};

const setAdminPermissionOverrides = async (overrides) => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({ overrides }),
  });
};

const assertCommentsPermissionOverridesAreEnforced = async () => {
  await setAdminPermissionOverrides({
    'comments.manage': 'deny',
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/comments`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        status: 'approved',
        commentIds: ['comments-smoke-denied-permission'],
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied comments.manage override should reject moderation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied comments.manage override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
  } finally {
    await setAdminPermissionOverrides({
      'comments.manage': null,
    });
  }

  await setAdminPermissionOverrides({
    'comments.configure': 'deny',
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        settings: {
          commentPolicy: {
            enabled: true,
            moderationMode: 'manual',
            allowGuests: true,
            requireName: true,
            requireEmail: false,
            allowReplies: true,
            enableReports: true,
            enableCaptcha: false,
            captchaProvider: 'mock',
            captchaSiteKey: '',
            blockedTerms: [],
            closedMessage: 'Comments are closed for this site.',
            sort: 'newest',
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied comments.configure override should reject policy save, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied comments.configure override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
  } finally {
    await setAdminPermissionOverrides({
      'comments.configure': null,
    });
  }
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

const submitComment = async ({ pageId, authorName, authorEmail, content, requestId, parentId, commentThreadId, captchaToken }) => {
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
      ...(captchaToken ? { captchaToken } : {}),
    }),
  });
  const comment = payload.data?.comment || payload.comment;
  assert(comment?.id, `Comment submission did not return a comment: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(comment.status === 'pending', `Expected pending comment, received ${comment.status}`);
  return comment;
};

const submitCommentExpectFailure = async ({ pageId, authorName, authorEmail, content, requestId, captchaToken }) => {
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
      ...(captchaToken ? { captchaToken } : {}),
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

const getAdminSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings;
};

const patchAdminSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings;
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

const listCommentReplies = async (parentId) => {
  const query = new URLSearchParams({
    status: 'all',
    limit: '100',
    sort: 'newest',
    parentId,
  });
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments?${query.toString()}`);
  return payload.data?.comments || payload.comments || [];
};

const deleteComment = async (commentId) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/comments/${commentId}`, {
    method: 'DELETE',
  });
  return payload.data || payload;
};

const assertCommentHardDelete = async ({ pageId, requestId }) => {
  const comment = await submitComment({
    pageId,
    authorName: 'Comments Smoke Delete',
    authorEmail: 'comments-delete@example.com',
    content: 'This temporary comment should be hard-deleted by the smoke.',
    requestId,
  });
  const result = await deleteComment(comment.id);
  assert(result.deletedCount === 1, `Comment hard delete should remove one comment: ${JSON.stringify(result).slice(0, 500)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const comments = await listComments(requestId);
    if (!comments.some((item) => item.id === comment.id)) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Hard-deleted comment still appears in comment list: ${comment.id}`);
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

const listCommentEvents = async () => {
  const query = new URLSearchParams({
    kind: 'all',
    limit: '100',
  });
  const payload = await requestApi(`/api/sites/${SITE_ID}/events?${query.toString()}`);
  const events = payload.data?.events || payload.events || [];
  return events.filter((event) => String(event.kind || '').startsWith('comment-'));
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

const waitForCommentEvents = async (expectations) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const events = await listCommentEvents();
    const hasAllExpected = expectations.every((expected) => events.some((event) => (
      event.kind === expected.kind &&
      (!expected.requestId || event.requestId === expected.requestId) &&
      (!expected.commentId || event.commentId === expected.commentId)
    )));

    if (hasAllExpected) {
      return events;
    }

    await sleep(250);
  }

  throw new Error(`Comment delivery events did not include expected records: ${JSON.stringify(expectations)}`);
};

const waitForCommentNotificationDelivery = async (receiver, {
  kind,
  commentId,
  requestId,
  expectedWebhookStatus = 'succeeded',
}) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const delivery = receiver.deliveries.find((item) => (
      item.payload?.kind === kind &&
      item.payload?.commentId === commentId &&
      item.payload?.requestId === requestId &&
      item.payload?.retry !== true
    ));
    const events = await listCommentEvents();
    const scoped = events.filter((event) => (
      event.kind === kind &&
      event.commentId === commentId &&
      event.requestId === requestId
    ));
    const webhookQueued = scoped.find((event) => event.metadata?.channel === 'webhook' && event.status === 'queued');
    const webhookCompleted = scoped.find((event) => event.metadata?.channel === 'webhook' && event.status === expectedWebhookStatus);
    const emailQueued = scoped.find((event) => event.metadata?.channel === 'email' && event.status === 'queued');
    const emailCompleted = scoped.find((event) => event.metadata?.channel === 'email' && event.status === 'succeeded');

    if (delivery && webhookQueued && webhookCompleted && emailQueued && emailCompleted) {
      assert(
        delivery.headers['x-backy-site-id'] === SITE_ID &&
          delivery.headers['x-backy-comment-id'] === commentId &&
          delivery.headers['x-backy-comment-event'] === kind,
        `Comment webhook receiver did not get Backy headers: ${JSON.stringify(delivery.headers)}`,
      );
      const expectedStatusCode = expectedWebhookStatus === 'succeeded' ? 200 : 503;
      assert(
        Number(webhookCompleted.statusCode) === expectedStatusCode,
        `Comment webhook did not record status ${expectedStatusCode}: ${JSON.stringify(webhookCompleted)}`,
      );
      assert(emailCompleted.target === `mailto:${COMMENT_NOTIFICATION_EMAIL}`, `Comment email target mismatch: ${JSON.stringify(emailCompleted)}`);
      assert(emailCompleted.metadata?.provider === EXPECTED_EMAIL_PROVIDER, `Comment email provider mismatch: ${JSON.stringify(emailCompleted)}`);
      assert(Number(emailCompleted.statusCode) === EXPECTED_EMAIL_STATUS_CODE, `Comment email status mismatch: ${JSON.stringify(emailCompleted)}`);
      return {
        delivery,
        events: scoped,
      };
    }

    await sleep(250);
  }

  throw new Error(`Comment notification delivery did not complete for ${kind}/${commentId}: ${JSON.stringify(receiver.deliveries.slice(-5))}`);
};

const retryCommentDeliveryInUi = async (client, failedEventId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const eventId = ${JSON.stringify(failedEventId)};
      const panel = document.querySelector('[data-testid="comments-delivery-panel"]');
      const button = panel
        ? Array.from(panel.querySelectorAll('[data-testid="comments-delivery-retry"]')).find((candidate) => (
          candidate instanceof HTMLButtonElement &&
          (candidate.getAttribute('aria-label') || '').includes(eventId) &&
          !candidate.disabled
        ))
        : null;
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        return { ok: true };
      }

      return {
        ok: false,
        hasPanel: Boolean(panel),
        panelText: panel?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 700) || '',
        buttons: panel ? Array.from(panel.querySelectorAll('button')).map((candidate) => ({
          label: candidate.getAttribute('aria-label') || candidate.textContent || '',
          disabled: candidate.disabled,
        })) : [],
      };
    })()`);

    if (result.ok) return;

    if (attempt === 79) {
      throw new Error(`Unable to retry comment delivery in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const waitForCommentWebhookRetry = async (receiver, { kind, commentId, retryOf }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const delivery = receiver.deliveries.find((item) => (
      item.payload?.kind === kind &&
      item.payload?.commentId === commentId &&
      item.payload?.retry === true &&
      item.headers['x-backy-webhook-retry'] === 'true'
    ));
    const events = await listCommentEvents();
    const retryEvent = events.find((event) => (
      event.kind === kind &&
      event.commentId === commentId &&
      event.status === 'succeeded' &&
      event.metadata?.channel === 'webhook' &&
      event.metadata?.retry === true &&
      event.metadata?.retryOf === retryOf
    ));

    if (delivery && retryEvent) {
      assert(Number(retryEvent.statusCode) === 200, `Comment webhook retry did not record status 200: ${JSON.stringify(retryEvent)}`);
      return {
        delivery,
        retryEvent,
        events,
      };
    }

    await sleep(250);
  }

  throw new Error(`Comment webhook retry did not complete for ${kind}/${commentId}/${retryOf}: ${JSON.stringify(receiver.deliveries.slice(-5))}`);
};

const waitForCommentParent = async (commentId, requestId, parentId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const comments = await listComments(requestId);
    const comment = comments.find((item) => item.id === commentId);
    if (comment?.parentId === parentId && (comment.commentThreadId === parentId || comment.commentThreadId)) {
      return comment;
    }
    await sleep(250);
  }

  throw new Error(`Comment ${commentId} did not move under parent ${parentId}`);
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
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authMode: 'local-demo',
  };

  return `localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({ state: { user, session }, version: 0 }))});`;
};

const seedBrowserSessionCookie = async (client) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: apiAdminSessionToken,
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

const assertCommentsFilterRouteSearch = async (client, targetId) => {
  const routeUrl = new URL(`${ADMIN_BASE_URL}/comments`);
  routeUrl.searchParams.set('siteId', SITE_ID);
  routeUrl.searchParams.set('q', 'Comments Smoke Report');
  routeUrl.searchParams.set('status', 'pending');
  routeUrl.searchParams.set('targetType', 'page');
  routeUrl.searchParams.set('targetId', targetId);
  routeUrl.searchParams.set('triage', 'reported');
  routeUrl.searchParams.set('sort', 'oldest');
  await client.send('Page.navigate', { url: routeUrl.toString() });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const search = document.querySelector('input[aria-label="Search comments"]');
      const targetType = document.querySelector('select[aria-label="Target type filter"]');
      const target = document.querySelector('select[aria-label="Specific target filter"]');
      const triage = document.querySelector('select[aria-label="Comment triage filter"]');
      const sort = document.querySelector('select[aria-label="Comment sort order"]');
      const pendingButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim().toLowerCase() === 'pending'
      ));
      return {
        ready: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
        searchValue: search instanceof HTMLInputElement ? search.value : null,
        targetTypeValue: targetType instanceof HTMLSelectElement ? targetType.value : null,
        targetValue: target instanceof HTMLSelectElement ? target.value : null,
        triageValue: triage instanceof HTMLSelectElement ? triage.value : null,
        sortValue: sort instanceof HTMLSelectElement ? sort.value : null,
        pendingPressed: pendingButton instanceof HTMLButtonElement ? pendingButton.getAttribute('aria-pressed') : null,
        reportVisible: document.body?.innerText?.includes('Comments Smoke Report') || false,
        url: window.location.href,
      };
    })()`);

    if (
      state.ready &&
      state.searchValue === 'Comments Smoke Report' &&
      state.targetTypeValue === 'page' &&
      state.targetValue === targetId &&
      state.triageValue === 'reported' &&
      state.sortValue === 'oldest' &&
      state.pendingPressed === 'true' &&
      state.reportVisible &&
      state.url.includes('status=pending') &&
      state.url.includes('targetType=page') &&
      state.url.includes(`targetId=${encodeURIComponent(targetId)}`) &&
      state.url.includes('triage=reported')
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Comments route search filters did not hydrate: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clearCommentFiltersInUi = async (client) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const search = document.querySelector('input[aria-label="Search comments"]');
      const targetType = document.querySelector('select[aria-label="Target type filter"]');
      const target = document.querySelector('select[aria-label="Specific target filter"]');
      const triage = document.querySelector('select[aria-label="Comment triage filter"]');
      const thread = document.querySelector('select[aria-label="Comment queue thread filter"]');
      const sort = document.querySelector('select[aria-label="Comment sort order"]');
      const pendingButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim().toLowerCase() === 'pending'
      ));
      const isDefault = (
        search instanceof HTMLInputElement &&
        targetType instanceof HTMLSelectElement &&
        target instanceof HTMLSelectElement &&
        triage instanceof HTMLSelectElement &&
        thread instanceof HTMLSelectElement &&
        sort instanceof HTMLSelectElement &&
        search.value === '' &&
        targetType.value === 'all' &&
        target.value === 'all' &&
        triage.value === 'all' &&
        thread.value === 'all' &&
        sort.value === 'newest' &&
        pendingButton instanceof HTMLButtonElement &&
        pendingButton.getAttribute('aria-pressed') !== 'true'
      );
      if (isDefault) return { ok: true };
      const clear = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Clear filters'
      ));
      if (!(clear instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'clear-missing',
          search: search instanceof HTMLInputElement ? search.value : null,
          targetType: targetType instanceof HTMLSelectElement ? targetType.value : null,
          target: target instanceof HTMLSelectElement ? target.value : null,
          triage: triage instanceof HTMLSelectElement ? triage.value : null,
          thread: thread instanceof HTMLSelectElement ? thread.value : null,
          sort: sort instanceof HTMLSelectElement ? sort.value : null,
          pendingPressed: pendingButton instanceof HTMLButtonElement ? pendingButton.getAttribute('aria-pressed') : null,
        };
      }
      if (clear.disabled) return { ok: false, reason: 'clear-disabled' };
      clear.click();
      return { ok: false, reason: 'clear-clicked' };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 59) {
      throw new Error(`Unable to clear comment filters in UI: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const focusCommentInUi = async (client, { requestId, authorName, targetId }) => {
  const routeUrl = new URL(`${ADMIN_BASE_URL}/comments`);
  routeUrl.searchParams.set('siteId', SITE_ID);
  routeUrl.searchParams.set('q', authorName);
  routeUrl.searchParams.set('targetType', 'page');
  routeUrl.searchParams.set('targetId', targetId);
  await client.send('Page.navigate', { url: routeUrl.toString() });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const card = Array.from(document.querySelectorAll('[data-testid="comment-card"]')).find((candidate) => {
        const text = candidate.textContent || '';
        return text.includes(${JSON.stringify(requestId)}) && text.includes(${JSON.stringify(authorName)});
      });
      return {
        ready: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
        found: Boolean(card),
        text: card?.textContent?.slice(0, 500) || '',
        body: document.body?.innerText?.slice(0, 900) || '',
        url: window.location.href,
      };
    })()`);

    if (state.ready && state.found) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Unable to focus comment ${requestId}: ${JSON.stringify(state)}`);
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

const resolveReportsInUi = async (client, authorName, requestId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const card = Array.from(document.querySelectorAll('article')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(authorName)}) &&
        (candidate.textContent || '').includes(${JSON.stringify(requestId)})
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
    hasDelivery: Boolean(document.querySelector('[data-testid="comments-delivery-panel"]')),
    hasAudit: Boolean(document.querySelector('[data-testid="comments-audit-panel"]')),
    hasThreadPanel: Boolean(document.querySelector('[data-testid="comments-thread-panel"]')),
    hasBlocklist: Boolean(document.querySelector('[data-testid="comments-blocklist-panel"]')),
    hasQueue: document.body?.innerText?.includes('Moderation Queue') || false,
    hasApi: document.body?.innerText?.includes('Comment moderation API') || false,
    hasBulk: document.body?.innerText?.includes('Bulk decisions') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Comments page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasAnalytics && layout.hasDelivery && layout.hasAudit && layout.hasThreadPanel && layout.hasBlocklist && layout.hasQueue && layout.hasApi && layout.hasBulk, `Comments page missing expected regions: ${JSON.stringify(layout)}`);
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

const assertCommentDeliveryPanel = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="comments-delivery-panel"]');
      const events = Array.from(document.querySelectorAll('[data-testid="comments-delivery-event"]'));
      const text = panel?.textContent || '';

      return {
        hasPanel: Boolean(panel),
        eventCount: events.length,
        hasSubmitted: text.includes('comment-submitted'),
        hasReported: text.includes('comment-reported'),
        hasApiCopy: text.includes('Events API') && text.includes('Recent comment handoffs'),
        panelText: text.slice(0, 1200),
      };
    })()`);

    if (state.hasPanel && state.eventCount > 0 && state.hasSubmitted && state.hasReported && state.hasApiCopy) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Comments delivery panel did not render seeded comment events: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertCommentAuditPanel = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="comments-audit-panel"]');
      const events = Array.from(document.querySelectorAll('[data-testid="comments-audit-event"]'));
      const text = panel?.textContent || '';

      return {
        hasPanel: Boolean(panel),
        eventCount: events.length,
        hasPolicy: text.includes('commentPolicy.update') || text.includes('Policy updated'),
        hasAuditCopy: text.includes('Admin audit API') && text.includes('Recent moderation audit'),
        panelText: text.slice(0, 1200),
      };
    })()`);

    if (state.hasPanel && state.eventCount > 0 && state.hasPolicy && state.hasAuditCopy) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Comments audit panel did not render seeded audit events: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const createReplyInUi = async (client, parentAuthor, replyContent) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const card = Array.from(document.querySelectorAll('[data-testid="comment-card"]')).find((candidate) => {
        const text = candidate.textContent || '';
        return text.includes(${JSON.stringify(parentAuthor)}) && !text.includes(${JSON.stringify(`Reply to ${parentAuthor}`)});
      });
      if (!card) return { ok: false, reason: 'card-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      const open = card.querySelector('[data-testid="comments-reply-open"]');
      if (!(open instanceof HTMLButtonElement)) return { ok: false, reason: 'reply-open-missing', text: card.textContent || '' };
      if (open.disabled) return { ok: false, reason: 'reply-open-disabled' };
      open.click();
      const composer = card.querySelector('[data-testid="comments-reply-composer"]');
      if (!composer) return { ok: false, reason: 'composer-missing-after-click' };
      const textarea = composer.querySelector('textarea[aria-label="Comment reply content"]');
      if (!(textarea instanceof HTMLTextAreaElement)) return { ok: false, reason: 'textarea-missing' };
      setInputValue(textarea, ${JSON.stringify(replyContent)});
      const submit = composer.querySelector('[data-testid="comments-reply-submit"]');
      if (!(submit instanceof HTMLButtonElement)) return { ok: false, reason: 'submit-missing' };
      if (submit.disabled) return { ok: false, reason: 'submit-disabled', content: textarea.value };
      submit.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to create UI reply for ${parentAuthor}: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const moveReplyInUi = async (client, replyAuthor, nextParentAuthor) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const replyCard = Array.from(document.querySelectorAll('[data-testid="comment-card"]')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(replyAuthor)})
      ));
      if (!replyCard) return { ok: false, reason: 'reply-card-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      const open = replyCard.querySelector('[data-testid="comments-move-open"]');
      if (!(open instanceof HTMLButtonElement)) return { ok: false, reason: 'move-open-missing', text: replyCard.textContent || '' };
      if (open.disabled) return { ok: false, reason: 'move-open-disabled' };
      open.click();
      const composer = replyCard.querySelector('[data-testid="comments-move-composer"]');
      if (!composer) return { ok: false, reason: 'move-composer-missing' };
      const select = composer.querySelector('select[aria-label="Comment reply parent"]');
      if (!(select instanceof HTMLSelectElement)) return { ok: false, reason: 'move-parent-select-missing' };
      const option = Array.from(select.options).find((candidate) => candidate.textContent?.includes(${JSON.stringify(nextParentAuthor)}));
      if (!option) {
        return {
          ok: false,
          reason: 'move-parent-option-missing',
          options: Array.from(select.options).map((candidate) => candidate.textContent || ''),
        };
      }
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const submit = composer.querySelector('[data-testid="comments-move-submit"]');
      if (!(submit instanceof HTMLButtonElement)) return { ok: false, reason: 'move-submit-missing' };
      if (submit.disabled) return { ok: false, reason: 'move-submit-disabled', selected: select.value };
      submit.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to move reply ${replyAuthor} under ${nextParentAuthor}: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const waitForReplyContent = async (parentId, content) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const replies = await listCommentReplies(parentId);
    const reply = replies.find((item) => item.content === content);
    if (reply) {
      return reply;
    }
    await sleep(250);
  }

  throw new Error(`Reply content did not appear for parent ${parentId}: ${content}`);
};

const clearThreadFilterInUi = async (client) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const filter = document.querySelector('[data-testid="comments-thread-filter"]');
      if (!(filter instanceof HTMLSelectElement)) return { ok: false, reason: 'filter-missing' };
      if (filter.value === 'all') return { ok: true };
      filter.value = 'all';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      filter.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);

    if (result.ok) return;

    if (attempt === 39) {
      throw new Error(`Unable to clear comments thread filter: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
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
  let webhookReceiver;
  let originalNotifications = null;
  const requestIds = [];
  const blocklistIdsToCleanup = new Set();
  let restoredPolicy = false;
  let restoredNotifications = false;

  try {
    assertCommentsRouteSourceContract();
    await loginAdminApi();
    await assertCommentsPermissionOverridesAreEnforced();
    webhookReceiver = await startCommentWebhookReceiver({ failFirstKind: 'comment-reported' });
    const currentSettings = await getAdminSettings();
    originalNotifications = currentSettings?.integrations?.notifications || {};
    await patchAdminSettings({
      integrations: {
        ...(currentSettings?.integrations || {}),
        notifications: {
          ...originalNotifications,
          email: {
            ...(originalNotifications.email || {}),
            comments: true,
            recipient: COMMENT_NOTIFICATION_EMAIL,
          },
          inApp: {
            ...(originalNotifications.inApp || {}),
            comments: true,
          },
          digestFrequency: 'instant',
          webhookUrl: webhookReceiver.url,
        },
      },
    });
    await cleanupSmokeBlocklistResidue();
    page = await createPage();
    const suffix = Date.now().toString(36);
    const approveRequestId = `comments-smoke-approve-${suffix}`;
    const rejectRequestId = `comments-smoke-reject-${suffix}`;
    const reportRequestId = `comments-smoke-report-${suffix}`;
    const blockRequestId = `comments-smoke-block-${suffix}`;
    const threadParentRequestId = `comments-smoke-thread-parent-${suffix}`;
    const threadReplyRequestId = `comments-smoke-thread-reply-${suffix}`;
    const moveParentRequestId = `comments-smoke-move-parent-${suffix}`;
    const captchaPassRequestId = `comments-smoke-captcha-pass-${suffix}`;
    const deleteRequestId = `comments-smoke-delete-${suffix}`;
    requestIds.push(approveRequestId, rejectRequestId, reportRequestId, blockRequestId, threadParentRequestId, threadReplyRequestId, moveParentRequestId, captchaPassRequestId, deleteRequestId);

    await patchSiteCommentPolicy({
      enabled: true,
      moderationMode: 'manual',
      allowGuests: true,
      requireName: true,
      requireEmail: true,
      allowReplies: true,
      enableReports: true,
      enableCaptcha: true,
      captchaProvider: 'mock',
      captchaSiteKey: 'comments-smoke-mock-site-key',
      blockedTerms: [],
      closedMessage: 'Comments are closed for this site.',
      sort: 'newest',
    });
    const captchaRejected = await submitCommentExpectFailure({
      pageId: page.id,
      authorName: 'Comments Smoke Captcha Missing',
      authorEmail: 'comments-captcha-missing@example.com',
      content: 'This temporary comment should fail because captcha is required.',
      requestId: `comments-smoke-captcha-missing-${suffix}`,
    });
    assert(
      captchaRejected.status === 422 && captchaRejected.payload?.captcha?.errorCode === 'CAPTCHA_REQUIRED',
      `Missing comment captcha should reject with CAPTCHA_REQUIRED: ${JSON.stringify(captchaRejected)}`,
    );
    const captchaAcceptedComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Captcha Pass',
      authorEmail: 'comments-captcha-pass@example.com',
      content: 'This temporary comment includes the mock captcha token.',
      requestId: captchaPassRequestId,
      captchaToken: COMMENT_CAPTCHA_MOCK_TOKEN,
    });
    assert(captchaAcceptedComment.status === 'pending', `Captcha-backed comment should enter moderation: ${JSON.stringify(captchaAcceptedComment)}`);
    await patchSiteCommentPolicy({
      enabled: true,
      moderationMode: 'manual',
      allowGuests: true,
      requireName: true,
      requireEmail: false,
      allowReplies: true,
      enableReports: true,
      enableCaptcha: false,
      captchaProvider: 'mock',
      captchaSiteKey: '',
      blockedTerms: [],
      closedMessage: 'Comments are closed for this site.',
      sort: 'newest',
    });
    await assertCommentHardDelete({ pageId: page.id, requestId: deleteRequestId });

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
    const moveParentComment = await submitComment({
      pageId: page.id,
      authorName: 'Comments Smoke Move Parent',
      authorEmail: 'comments-move-parent@example.com',
      content: 'Temporary parent comment for the comments reply reparent smoke.',
      requestId: moveParentRequestId,
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
    await waitForCommentEvents([
      { kind: 'comment-submitted', requestId: threadParentRequestId, commentId: threadParentComment.id },
      { kind: 'comment-submitted', requestId: threadReplyRequestId, commentId: threadReplyComment.id },
      { kind: 'comment-reported', requestId: reportRequestId, commentId: reportedComment.id },
    ]);
    const submittedDelivery = await waitForCommentNotificationDelivery(webhookReceiver, {
      kind: 'comment-submitted',
      requestId: threadParentRequestId,
      commentId: threadParentComment.id,
    });
    const reportDelivery = await waitForCommentNotificationDelivery(webhookReceiver, {
      kind: 'comment-reported',
      requestId: reportRequestId,
      commentId: reportedComment.id,
      expectedWebhookStatus: 'failed',
    });
    const failedReportWebhookEvent = reportDelivery.events.find((event) => (
      event.metadata?.channel === 'webhook' && event.status === 'failed'
    ));
    assert(failedReportWebhookEvent?.id, `Report delivery did not expose a failed webhook event: ${JSON.stringify(reportDelivery.events)}`);

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
    await seedBrowserSessionCookie(client);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: getAuthStorageScript() });

    await navigateToComments(client, [
      'Comments Smoke Approve',
      'Comments Smoke Reject',
      'Comments Smoke Report',
      'Comments Smoke Block',
      'Comments Smoke Thread Parent',
      'Comments Smoke Thread Reply',
      'Comments Smoke Move Parent',
    ]);
    await assertCommentsFilterRouteSearch(client, page.id);
    await clearCommentFiltersInUi(client);
    await navigateToComments(client, [
      'Comments Smoke Approve',
      'Comments Smoke Reject',
      'Comments Smoke Report',
      'Comments Smoke Block',
      'Comments Smoke Thread Parent',
      'Comments Smoke Thread Reply',
      'Comments Smoke Move Parent',
    ]);
    await assertCommentDeliveryPanel(client);
    await assertCommentAuditPanel(client);
    await retryCommentDeliveryInUi(client, failedReportWebhookEvent.id);
    const retryDelivery = await waitForCommentWebhookRetry(webhookReceiver, {
      kind: 'comment-reported',
      commentId: reportedComment.id,
      retryOf: failedReportWebhookEvent.id,
    });
    await assertThreadContext(client, 'Comments Smoke Thread Parent', 'Comments Smoke Thread Reply');
    const adminReplyContent = `Official admin reply from comments smoke ${suffix}.`;
    await createReplyInUi(client, 'Comments Smoke Thread Parent', adminReplyContent);
    const adminReplyComment = await waitForReplyContent(threadParentComment.id, adminReplyContent);
    assert(adminReplyComment.parentId === threadParentComment.id, `Admin reply did not preserve parent id: ${JSON.stringify(adminReplyComment)}`);
    assert(adminReplyComment.status === 'approved', `Admin reply should publish immediately: ${JSON.stringify(adminReplyComment)}`);
    await clearThreadFilterInUi(client);
    await moveReplyInUi(client, 'Comments Smoke Thread Reply', 'Comments Smoke Move Parent');
    const movedReply = await waitForCommentParent(threadReplyComment.id, threadReplyRequestId, moveParentComment.id);
    assert(movedReply.commentThreadId === moveParentComment.id, `Moved reply did not adopt the new parent thread: ${JSON.stringify(movedReply)}`);
    await clearThreadFilterInUi(client);
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

    await focusCommentInUi(client, { requestId: approveRequestId, authorName: 'Comments Smoke Approve', targetId: page.id });
    await moderateCommentInUi(client, 'Comments Smoke Approve', 'approved');
    const approved = await waitForCommentStatus(approveComment.id, approveRequestId, 'approved');
    assert(approved.reviewedBy, `Approved comment did not record reviewer: ${JSON.stringify(approved)}`);

    await focusCommentInUi(client, { requestId: rejectRequestId, authorName: 'Comments Smoke Reject', targetId: page.id });
    await moderateCommentInUi(client, 'Comments Smoke Reject', 'rejected', 'Rejected by comments smoke.');
    const rejected = await waitForCommentStatus(rejectComment.id, rejectRequestId, 'rejected');
    assert(rejected.rejectionReason === 'Rejected by comments smoke.', `Reject reason did not persist: ${JSON.stringify(rejected)}`);

    await focusCommentInUi(client, { requestId: reportRequestId, authorName: 'Comments Smoke Report', targetId: page.id });
    await resolveReportsInUi(client, 'Comments Smoke Report', reportRequestId);
    const resolvedReport = await waitForCommentReports(reportedComment.id, reportRequestId, 0);
    assert(!resolvedReport.reportReasons?.length, `Report reasons were not cleared: ${JSON.stringify(resolvedReport)}`);

    await focusCommentInUi(client, { requestId: blockRequestId, authorName: 'Comments Smoke Block', targetId: page.id });
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
      enableCaptcha: false,
      captchaProvider: 'mock',
      captchaSiteKey: '',
      blockedTerms: [],
      closedMessage: 'Comments are closed for this site.',
      sort: 'newest',
    });
    restoredPolicy = true;
    const finalSettings = await getAdminSettings();
    await patchAdminSettings({
      integrations: {
        ...(finalSettings?.integrations || {}),
        notifications: originalNotifications || {},
      },
    });
    restoredNotifications = true;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      policy: {
        requireEmail: true,
        reportsDisabled: true,
        reportsDisabledStatus: 403,
        captchaRequiredStatus: 422,
        blockedTerms: ['bannedphrase'],
      },
      captchaCommentId: captchaAcceptedComment.id,
      approvedCommentId: approveComment.id,
      rejectedCommentId: rejectComment.id,
      resolvedReportCommentId: reportedComment.id,
      blockedCommentId: blockedComment.id,
      threadParentCommentId: threadParentComment.id,
      threadReplyCommentId: threadReplyComment.id,
      moveParentCommentId: moveParentComment.id,
      adminReplyCommentId: adminReplyComment.id,
      notifications: {
        webhookDeliveries: webhookReceiver.deliveries.length,
        submittedEventStatuses: submittedDelivery.events.map((event) => `${event.metadata?.channel || 'activity'}:${event.status}`),
        reportEventStatuses: reportDelivery.events.map((event) => `${event.metadata?.channel || 'activity'}:${event.status}`),
        reportRetryStatus: retryDelivery.retryEvent.status,
      },
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
        enableCaptcha: false,
        captchaProvider: 'mock',
        captchaSiteKey: '',
        blockedTerms: [],
        closedMessage: 'Comments are closed for this site.',
        sort: 'newest',
      }).catch((error) => {
        console.warn('Unable to restore comment policy:', error instanceof Error ? error.message : error);
      });
    }
    if (!restoredNotifications && originalNotifications) {
      const settings = await getAdminSettings().catch(() => null);
      if (settings) {
        await patchAdminSettings({
          integrations: {
            ...(settings.integrations || {}),
            notifications: originalNotifications,
          },
        }).catch((error) => {
          console.warn('Unable to restore notification settings:', error instanceof Error ? error.message : error);
        });
      }
    }
    await cleanup({ client, childProcess, userDataDir, pageId: page?.id });
    if (webhookReceiver) {
      await webhookReceiver.close().catch((error) => {
        console.warn('Unable to close comments webhook receiver:', error instanceof Error ? error.message : error);
      });
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
