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
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
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

const submitComment = async ({ pageId, authorName, authorEmail, content, requestId }) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/pages/${pageId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      authorName,
      authorEmail,
      requestId,
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

const navigateToComments = async (client, expectedAuthors) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/comments?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
      queue: document.body?.innerText?.includes('Moderation Queue') || false,
      api: document.body?.innerText?.includes('Comment moderation API') || false,
      authors: ${JSON.stringify(expectedAuthors)}.every((author) => document.body?.innerText?.includes(author)),
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);

    if (state.ready && state.queue && state.api && state.authors) {
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
        const textarea = document.querySelector('textarea');
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

const assertLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="comments-command-center"]')),
    hasQueue: document.body?.innerText?.includes('Moderation Queue') || false,
    hasApi: document.body?.innerText?.includes('Comment moderation API') || false,
    hasBulk: document.body?.innerText?.includes('Bulk decisions') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Comments page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasQueue && layout.hasApi && layout.hasBulk, `Comments page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
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

  try {
    page = await createPage();
    const suffix = Date.now().toString(36);
    const approveRequestId = `comments-smoke-approve-${suffix}`;
    const rejectRequestId = `comments-smoke-reject-${suffix}`;
    requestIds.push(approveRequestId, rejectRequestId);

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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: AUTH_STORAGE_SCRIPT });

    await navigateToComments(client, ['Comments Smoke Approve', 'Comments Smoke Reject']);
    await moderateCommentInUi(client, 'Comments Smoke Approve', 'approved');
    const approved = await waitForCommentStatus(approveComment.id, approveRequestId, 'approved');
    assert(approved.reviewedBy, `Approved comment did not record reviewer: ${JSON.stringify(approved)}`);

    await moderateCommentInUi(client, 'Comments Smoke Reject', 'rejected', 'Rejected by comments smoke.');
    const rejected = await waitForCommentStatus(rejectComment.id, rejectRequestId, 'rejected');
    assert(rejected.rejectionReason === 'Rejected by comments smoke.', `Reject reason did not persist: ${JSON.stringify(rejected)}`);

    await assertLayout(client);
    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deletePage(page.id);
    page = null;
    await waitForCommentsDeleted(requestIds);

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      approvedCommentId: approveComment.id,
      rejectedCommentId: rejectComment.id,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, pageId: page?.id });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
