#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_EDITOR_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_EDITOR_CDP_PORT || 9378);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_EDITOR_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-editor-smoke.png');
const FRONTEND_BLOG_TEMPLATE_ID = 'smoke-blog-editor-template';
const FRONTEND_BLOG_TEMPLATE_NAME = 'Smoke Blog Editor Template';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertBlogEditorFallbackIsReadOnly = () => {
  const source = fs.readFileSync(new URL('../src/routes/blog.$postId.tsx', import.meta.url), 'utf8');
  assert(source.includes('isUsingLocalPostCopy'), 'Blog editor must track backend-load fallback state');
  assert(source.includes('localPostCopyDisabledMessage'), 'Blog editor must explain that local fallback copies are read-only');
  assert(source.includes('canEdit={canEditBlog && !isUsingLocalPostCopy}'), 'Blog editor canvas editing must be disabled for local fallback copies');
  assert(source.includes('editorBusy || !canEditBlog || isUsingLocalPostCopy'), 'Blog editor canvas changes must ignore local fallback copies');
  assert(source.includes('setLoadError(null);') && source.includes('Latest backend post loaded into the editor.'), 'Blog editor reload must clear fallback state after loading backend content');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Blog editor must use the shared EmptyState component for sidebar empty states');
  assert(source.includes('Public comments for this post will appear here for quick review'), 'Blog editor comments empty state must explain how post comments populate');
  assert(source.includes('create a restorable revision snapshot'), 'Blog editor revision empty state must explain how revisions populate');
  assert(source.includes('blogRevisionDiff') && source.includes('data-testid={`blog-editor-revision-diff-${revision.id}`}') && source.includes('compareToCurrent: revisionDiffById.get(revision.id)'), 'Blog editor revisions must expose current-vs-snapshot diff summaries in the UI and handoff manifest');
  assert(source.includes("schema: 'backy.blog-revision-compare.v1'") && source.includes('copyBlogRevisionCompare') && source.includes('data-testid={`blog-editor-copy-revision-compare-${revision.id}`}'), 'Blog editor revisions must expose copyable revision comparison briefs');
  assert(source.includes('details: BlogRevisionDiffDetail[]') && source.includes('data-testid={`blog-editor-revision-diff-details-${revision.id}`}') && source.includes('Snapshot </span>'), 'Blog editor revision cards must show field-level diff details, not only summary text');
  assert(
    source.includes('getScheduledBlogEditorDateError') &&
      source.includes('Date.parse(scheduledAt)') &&
      source.includes('scheduledAtMs <= Date.now()') &&
      source.includes('Choose a future publish date before scheduling changes.'),
    'Blog editor must block scheduled posts with non-future publish dates before save',
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
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 400)}`);
  }

  return payload;
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
  const smokeMfaCode = process.env.BACKY_BLOG_EDITOR_SMOKE_MFA_CODE
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

const createBlogPost = async (slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Smoke Blog Editor',
      slug,
      excerpt: 'Temporary blog editor smoke excerpt for editor layout, focus mode, handoff, and publishing controls.',
      status: 'draft',
      authorId: 'admin',
      categoryIds: [],
      tagIds: [],
      meta: {
        title: 'Smoke Blog Editor SEO',
        description: 'Temporary SEO description long enough to validate the blog editor readiness and frontend handoff contract.',
        canonical: `/blog/${slug}`,
        noIndex: true,
        frontendDesignTemplateId: FRONTEND_BLOG_TEMPLATE_ID,
        frontendDesignTemplateName: FRONTEND_BLOG_TEMPLATE_NAME,
        frontendDesignRoutePattern: '/blog/smoke-editor-template',
        frontendDesignSource: {
          type: 'custom-frontend',
          label: 'Smoke blog editor frontend',
        },
        frontendDesignChrome: {
          header: { component: 'SmokeHeader' },
          footer: { component: 'SmokeFooter' },
        },
        frontendDesignTokens: {
          colors: { primary: '#0f766e' },
          fonts: { heading: 'Inter', body: 'Inter' },
        },
        frontendDesignBindingHints: [
          { role: 'post.title', binding: 'post.title' },
          { role: 'post.content', binding: 'post.content' },
        ],
      },
      content: {
        elements: [
          {
            id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}`,
            type: 'section',
            x: 0,
            y: 0,
            width: 1200,
            height: 760,
            props: {
              frontendTemplateId: FRONTEND_BLOG_TEMPLATE_ID,
              frontendTemplateName: FRONTEND_BLOG_TEMPLATE_NAME,
              routePattern: '/blog/smoke-editor-template',
              backgroundColor: '#ffffff',
              borderRadius: 0,
            },
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'content'] }],
            children: [
              {
                id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-title`,
                type: 'heading',
                x: 72,
                y: 72,
                width: 820,
                height: 96,
                props: {
                  content: 'Smoke Blog Editor',
                  level: 'h1',
                  fontSize: 52,
                  binding: 'post.title',
                },
              },
              {
                id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-body`,
                type: 'paragraph',
                x: 72,
                y: 192,
                width: 780,
                height: 140,
                props: {
                  content: 'This template-backed post verifies the editable blog canvas and focus workspace.',
                  fontSize: 18,
                  binding: 'post.content',
                },
              },
            ],
          },
        ],
        canvasSize: {
          width: 1200,
          height: 800,
        },
      },
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Create post did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const assertBlogUpdateConflict = async (post) => {
  assert(post.updatedAt, `Created smoke post did not include updatedAt for conflict testing: ${JSON.stringify(post).slice(0, 500)}`);
  const firstUpdate = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: `${post.title} conflict baseline`,
      expectedUpdatedAt: post.updatedAt,
      revisionNote: 'Smoke conflict baseline',
    }),
  });
  const updatedPost = firstUpdate.data?.post || firstUpdate.post;
  assert(updatedPost?.updatedAt && updatedPost.updatedAt !== post.updatedAt, `Initial conflict setup did not advance updatedAt: ${JSON.stringify(firstUpdate).slice(0, 500)}`);

  const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/blog/${post.id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      title: `${post.title} stale overwrite`,
      expectedUpdatedAt: post.updatedAt,
      revisionNote: 'Smoke stale overwrite',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 409, `Stale blog update should return 409, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'BLOG_VERSION_CONFLICT', `Stale blog update should return BLOG_VERSION_CONFLICT: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.details?.currentUpdatedAt === updatedPost.updatedAt, `Conflict response missing current updatedAt: ${JSON.stringify(payload).slice(0, 500)}`);
  return updatedPost;
};

const deleteBlogPost = async (postId) => {
  if (!postId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
};

const launchChrome = () => {
  const userDataDir = path.join(os.tmpdir(), `backy-blog-editor-${Date.now()}`);
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

const waitForEditor = async (client, postId) => {
  await client.send('Page.navigate', {
    url: `${ADMIN_BASE_URL}/blog/${encodeURIComponent(postId)}?siteId=${encodeURIComponent(SITE_ID)}`,
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="blog-editor-workspace-grid"]');
      const canvasShell = document.querySelector('[data-testid="blog-editor-canvas-shell"]');
      const canvas = document.querySelector('[data-testid="editor-canvas"]');
      const saveStatus = document.querySelector('[data-testid="editor-save-status"]');
      const rect = canvasShell?.getBoundingClientRect();
      return {
        ready: Boolean(document.querySelector('[data-testid="blog-editor-command-center"]')),
        grid: Boolean(grid),
        canvasShell: Boolean(canvasShell),
        canvas: Boolean(canvas),
        draft: Boolean(document.querySelector('#blog-editor-draft')),
        seo: Boolean(document.querySelector('#blog-editor-seo')),
        publish: Boolean(document.querySelector('#blog-editor-publish')),
        media: Boolean(document.querySelector('#blog-editor-media')),
        comments: Boolean(document.querySelector('#blog-editor-comments')),
        handoff: Boolean(document.querySelector('#blog-editor-handoff')),
        taxonomy: Boolean(document.querySelector('#blog-editor-taxonomy')),
        revisions: Boolean(document.querySelector('#blog-editor-revisions')),
        templatePanel: Boolean(document.querySelector('[data-testid="blog-editor-template-provenance"]')),
        templateId: document.querySelector('[data-testid="blog-editor-template-provenance"]')?.getAttribute('data-template-id') || '',
        handoffTemplateId: (() => {
          try {
            return JSON.parse(document.querySelector('[data-testid="blog-editor-handoff-json"]')?.textContent || '{}')?.template?.id || '';
          } catch {
            return '';
          }
        })(),
        savePersistence: saveStatus?.getAttribute('data-save-persistence') || '',
        saveStatusText: saveStatus?.textContent || '',
        focusButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Focus canvas'),
        focusButtonReady: Array.from(document.querySelectorAll('button')).some((button) => (
          (button.textContent || '').trim() === 'Focus canvas' &&
          button instanceof HTMLButtonElement &&
          !button.disabled
        )),
        width: rect?.width || 0,
        height: rect?.height || 0,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    if (
      state.ready &&
      state.grid &&
      state.canvasShell &&
      state.canvas &&
      state.draft &&
      state.seo &&
      state.publish &&
      state.media &&
      state.comments &&
      state.handoff &&
      state.taxonomy &&
      state.revisions &&
      state.templatePanel &&
      state.templateId === FRONTEND_BLOG_TEMPLATE_ID &&
      state.handoffTemplateId === FRONTEND_BLOG_TEMPLATE_ID &&
      state.savePersistence === 'parent' &&
      state.saveStatusText.includes('Post save') &&
      !state.saveStatusText.includes('Saved') &&
      state.focusButtonReady &&
      state.width >= 900 &&
      state.height >= 760
    ) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Blog editor did not render the complete workspace: ${JSON.stringify(state)}`);
    }

    await sleep(200);
  }

  return null;
};

const assertFocusMode = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Focus canvas'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(200);
  }
  assert(clicked?.ok, `Focus canvas button was not ready: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const canvasShell = document.querySelector('[data-testid="blog-editor-canvas-shell"]');
      const rect = canvasShell?.getBoundingClientRect();
      return {
        path: window.location.pathname,
        search: window.location.search,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        banner: Boolean(document.querySelector('[data-testid="blog-editor-focus-banner"]')),
        commandCenter: Boolean(document.querySelector('[data-testid="blog-editor-command-center"]')),
        draftPanel: Boolean(document.querySelector('#blog-editor-draft')),
        publishPanel: Boolean(document.querySelector('#blog-editor-publish')),
        adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
        adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
        canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
        showPanels: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Show panels'),
        canvasShellWidth: rect?.width || 0,
        canvasShellHeight: rect?.height || 0,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })()`);

    if (
      state.banner &&
      state.canvas &&
      state.showPanels &&
      !state.commandCenter &&
      !state.draftPanel &&
      !state.publishPanel &&
      !state.adminSidebar &&
      !state.adminHeader &&
      state.search.includes('focus=canvas') &&
      state.canvasShellWidth >= state.viewport.width - 48 &&
      state.canvasShellHeight >= state.viewport.height - 140 &&
      state.horizontalOverflow <= 4
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Blog editor focus mode did not expose a full-width canvas: ${JSON.stringify(state)}`);
    }

    await sleep(200);
  }

  return null;
};

const assertUnsavedWorkflowGuard = async (client, originalTitle) => {
  const changed = await evaluate(client, `(() => {
    const draftPanel = document.querySelector('#blog-editor-draft');
    const titleInput = draftPanel?.querySelector('input[type="text"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      return { ok: false, reason: 'title-input-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(titleInput, ${JSON.stringify(`${originalTitle} unsaved`)});
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  assert(changed.ok, `Unable to create unsaved blog editor change: ${JSON.stringify(changed)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const guard = document.querySelector('[data-testid="blog-editor-unsaved-workflow-guard"]');
      const buttons = Array.from(document.querySelectorAll('#blog-editor-publish button'));
      const buttonState = (label) => {
        const button = buttons.find((candidate) => (candidate.textContent || '').trim() === label);
        return button instanceof HTMLButtonElement ? { found: true, disabled: button.disabled, title: button.getAttribute('title') || '' } : { found: false };
      };
      return {
        hasGuard: Boolean(guard),
        guardText: guard?.textContent || '',
        preview: buttonState('Preview'),
        publish: buttonState('Publish'),
        archive: buttonState('Archive'),
      };
    })()`);

    if (
      state.hasGuard &&
      state.guardText.includes('Save this post before preview') &&
      state.preview.found &&
      state.preview.disabled === true &&
      state.publish.found &&
      state.publish.disabled === true &&
      state.archive.found &&
      state.archive.disabled === true
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Unsaved blog workflow guard did not activate: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const assertPublishWorkflowVersionGuard = async (client, post) => {
  assert(post?.updatedAt, `Smoke post did not expose updatedAt before publish workflow: ${JSON.stringify(post).slice(0, 500)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogEditorPublishBodies = [];
    if (!window.__backyOriginalFetchForBlogEditorPublish) {
      window.__backyOriginalFetchForBlogEditorPublish = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${post.id}/publish`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyBlogEditorPublishBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForBlogEditorPublish(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog editor publish capture');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('#blog-editor-publish button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Publish'
      ));
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        return { ok: true };
      }
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        title: button instanceof HTMLButtonElement ? button.getAttribute('title') || '' : '',
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);
    if (clicked.ok) break;
    if (attempt === 79) {
      throw new Error(`Blog editor publish button was not ready: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const published = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`).then((payload) => {
      const posts = payload.data?.posts || payload.posts || [];
      return posts.find((candidate) => candidate.id === post.id);
    });
    const captured = await evaluate(client, `window.__backyBlogEditorPublishBodies || []`);
    const publishPost = captured.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));

    if (published?.status === 'published' && publishPost) {
      assert(
        publishPost.body.expectedUpdatedAt === post.updatedAt,
        `Blog editor publish workflow did not send expectedUpdatedAt guard: ${JSON.stringify(publishPost).slice(0, 500)}`,
      );
      return {
        status: published.status,
        expectedUpdatedAt: publishPost.body.expectedUpdatedAt,
      };
    }

    await sleep(250);
  }

  throw new Error('Blog editor publish workflow did not persist a guarded publish request');
};

const captureScreenshot = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const cleanup = async ({ client, childProcess, userDataDir, postId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closed.
    }
    client.close();
  }

  if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  if (postId) {
    try {
      await deleteBlogPost(postId);
    } catch (error) {
      console.warn(`Unable to delete smoke post ${postId}:`, error instanceof Error ? error.message : error);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  assertBlogEditorFallbackIsReadOnly();
  if (process.env.BACKY_BLOG_EDITOR_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'blog-editor-source' }));
    return;
  }

  await loginAdminApi();
  const slug = `blog-editor-smoke-${Date.now().toString(36)}`;
  const post = await assertBlogUpdateConflict(await createBlogPost(slug));
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    const editorState = await waitForEditor(client, post.id);
    const publishWorkflowState = await assertPublishWorkflowVersionGuard(client, post);
    const unsavedGuardState = await assertUnsavedWorkflowGuard(client, post.title);
    const focusState = await assertFocusMode(client);
    const screenshotPath = await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      postId: post.id,
      slug,
      editorState,
      publishWorkflowState,
      unsavedGuardState,
      focusState,
      screenshotPath,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId: post.id });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
