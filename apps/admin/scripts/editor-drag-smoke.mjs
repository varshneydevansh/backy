#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_EDITOR_SMOKE_SITE_ID || 'site-demo';
const EDITOR_PATH = process.env.BACKY_EDITOR_SMOKE_PATH || '';
const COMPONENT_SMOKE = process.env.BACKY_EDITOR_COMPONENT_SMOKE || '';
const LIBRARY_SMOKE = process.env.BACKY_EDITOR_LIBRARY_SMOKE === '1';
const CLIPBOARD_SMOKE = process.env.BACKY_EDITOR_CLIPBOARD_SMOKE === '1';
const Z_ORDER_SMOKE = process.env.BACKY_EDITOR_Z_ORDER_SMOKE === '1';
const SAVE_SMOKE = process.env.BACKY_EDITOR_SAVE_SMOKE === '1';
const CONFLICT_SMOKE = process.env.BACKY_EDITOR_CONFLICT_SMOKE === '1';
const PAGE_SETTINGS_SMOKE = process.env.BACKY_EDITOR_PAGE_SETTINGS_SMOKE === '1';
const RICH_TEXT_SMOKE = process.env.BACKY_EDITOR_RICH_TEXT_SMOKE === '1';
const DELETE_SMOKE = process.env.BACKY_EDITOR_DELETE_SMOKE === '1';
const LAYERS_SMOKE = process.env.BACKY_EDITOR_LAYERS_SMOKE === '1';
const SHORTCUTS_SMOKE = process.env.BACKY_EDITOR_SHORTCUTS_SMOKE === '1';
const MULTI_SELECT_SMOKE = process.env.BACKY_EDITOR_MULTI_SELECT_SMOKE === '1';
const ZOOM_SMOKE = process.env.BACKY_EDITOR_ZOOM_SMOKE === '1';
const GRID_SNAP_SMOKE = process.env.BACKY_EDITOR_GRID_SNAP_SMOKE === '1';
const ALIGNMENT_GUIDES_SMOKE = process.env.BACKY_EDITOR_ALIGNMENT_GUIDES_SMOKE === '1';
const MEDIA_UPLOAD_SMOKE = process.env.BACKY_EDITOR_MEDIA_UPLOAD_SMOKE === '1';
const RESIZE_SMOKE = process.env.BACKY_EDITOR_RESIZE_SMOKE === '1';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_CDP_PORT || 9365);
const SCREENSHOT_PATH = process.env.BACKY_EDITOR_DRAG_SCREENSHOT || path.join(os.tmpdir(), 'backy-editor-drag-smoke.png');
const SMOKE_IMAGE_SRC = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22340%22%20height%3D%22240%22%3E%3Crect%20width%3D%22340%22%20height%3D%22240%22%20fill%3D%22%23e0f2fe%22%2F%3E%3Ccircle%20cx%3D%22270%22%20cy%3D%2260%22%20r%3D%2236%22%20fill%3D%22%230ea5e9%22%2F%3E%3Cpath%20d%3D%22M24%20208l92-92%2066%2066%2038-38%2096%2064z%22%20fill%3D%22%230f766e%22%2F%3E%3C%2Fsvg%3E';
const SMOKE_VIDEO_SRC = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const SMOKE_VIDEO_POSTER = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%230f172a%22%2F%3E%3C%2Fsvg%3E';
const SMOKE_EMBED_SRC = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SMOKE_EMBED_PREVIEW_SRC = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
const SMOKE_EMBED_ALLOWED_HOSTS = 'trusted.backy.test';
const SMOKE_EMBED_ALLOW = 'fullscreen; geolocation';
const SMOKE_EMBED_SANDBOX = 'allow-forms allow-popups';
const SMOKE_MAP_ADDRESS = 'Mumbai India';
const SMOKE_MAP_MARKER_LABEL = 'Backy Mumbai office';
const SMOKE_MAP_MARKER_LATITUDE = '19.076';
const SMOKE_MAP_MARKER_LONGITUDE = '72.8777';
const SMOKE_ICON_PICKER_EMOJI = '\u{1F680}';
const FORM_SCHEMA_FIELDS = [
  {
    key: 'full_name',
    label: 'Full name',
    type: 'text',
    placeholder: 'Ada Lovelace',
    required: true,
    validation: [{ type: 'minLength', value: 2, message: 'Name is too short' }],
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'ada@example.com',
    required: true,
  },
  {
    key: 'message',
    label: 'Message',
    type: 'textarea',
    helpText: 'Tell us what you need.',
    validation: [{ type: 'maxLength', value: 240, message: 'Keep it concise' }],
  },
  {
    key: 'plan',
    label: 'Plan',
    type: 'select',
    placeholder: 'Choose a plan',
    options: ['Starter', 'Growth'],
    required: true,
  },
];
const FORM_BUILDER_FIELD = {
  key: 'company',
  label: 'Company',
  type: 'text',
  placeholder: 'Acme Inc.',
  required: true,
};
const FORM_SCHEMA_FIELDS_WITH_BUILDER = [...FORM_SCHEMA_FIELDS, FORM_BUILDER_FIELD];
const createSmokeUploadImageFile = () => {
  const filename = `backy-editor-upload-smoke-${Date.now().toString(36)}.png`;
  const filePath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(
    filePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAYAAAC9vt6cAAAACXBIWXMAAAsTAAALEwEAmpwYAAAALklEQVR4nGNkYGD4z0AEYCJGEGKgAqAOiP///2dQBSM1TRqGAqMGjBoAAEyDBwIXt2QHAAAAAElFTkSuQmCC',
      'base64',
    ),
  );

  return { filename, filePath };
};
const CHECKBOX_BEHAVIOR_SPEC = {
  label: 'Smoke checkbox label',
  name: 'smoke_channels',
  placeholder: 'Choose channels',
  helpText: 'Pick at least one channel.',
  options: ['Email', 'SMS', 'Phone'],
  value: 'SMS',
};
const RADIO_BEHAVIOR_SPEC = {
  label: 'Smoke radio label',
  name: 'smoke_frequency',
  placeholder: 'Choose frequency',
  helpText: 'Pick one frequency.',
  options: ['Daily', 'Weekly', 'Monthly'],
  value: 'Weekly',
};
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
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

const createSmokePage = async () => {
  const slug = `editor-drag-smoke-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Editor Drag Smoke',
      slug,
      status: 'draft',
      content: {
        elements: [
          {
            id: 'smoke-heading',
            type: 'heading',
            x: 120,
            y: 100,
            width: 420,
            height: 72,
            zIndex: 1,
            props: {
              content: 'Drag Smoke Heading',
              level: 'h1',
              fontSize: '54px',
              fontWeight: 'bold',
              color: '#111827',
            },
            styles: {
              position: 'relative',
              left: '4px',
              top: '6px',
              width: '80px',
              height: '40px',
              transform: 'translateX(30px)',
            },
          },
          {
            id: 'smoke-image',
            type: 'image',
            x: 120,
            y: 220,
            width: 260,
            height: 170,
            zIndex: 2,
            props: {
              src: SMOKE_IMAGE_SRC,
              alt: 'Workspace',
              objectFit: 'cover',
            },
          },
          {
            id: 'smoke-video',
            type: 'video',
            x: 820,
            y: 120,
            width: 320,
            height: 180,
            zIndex: 7,
            props: {
              src: SMOKE_VIDEO_SRC,
              poster: '',
              controls: true,
              autoplay: false,
              loop: false,
              muted: false,
              playsInline: true,
              objectFit: 'cover',
            },
          },
          {
            id: 'smoke-icon',
            type: 'icon',
            x: 690,
            y: 110,
            width: 80,
            height: 80,
            zIndex: 7,
            props: {
              icon: '★',
              size: 32,
              color: '#374151',
            },
          },
          {
            id: 'smoke-embed',
            type: 'embed',
            x: 820,
            y: 325,
            width: 320,
            height: 150,
            zIndex: 8,
            props: {
              src: SMOKE_EMBED_SRC,
              title: 'Initial embed',
              allow: '',
              loading: 'lazy',
              allowFullScreen: true,
            },
          },
          {
            id: 'smoke-map',
            type: 'map',
            x: 820,
            y: 500,
            width: 320,
            height: 180,
            zIndex: 9,
            props: {
              address: 'New Delhi India',
              zoom: 12,
              title: 'Initial map',
              loading: 'lazy',
              referrerPolicy: 'no-referrer',
              allowFullScreen: true,
            },
          },
          {
            id: 'smoke-top-edge',
            type: 'paragraph',
            x: 360,
            y: 10,
            width: 300,
            height: 64,
            zIndex: 5,
            props: {
              content: 'Top edge handle check',
              fontSize: 18,
              color: '#0f172a',
            },
          },
          {
            id: 'smoke-list',
            type: 'list',
            x: 980,
            y: 110,
            width: 280,
            height: 150,
            zIndex: 5,
            props: {
              listType: 'bullet',
              listMarker: 'disc',
              listIndent: 0,
              items: ['Initial item A', 'Initial item B'],
              content: [
                {
                  type: 'ul',
                  children: [
                    { type: 'li', children: [{ text: 'Initial item A' }] },
                    { type: 'li', children: [{ text: 'Initial item B' }] },
                  ],
                },
              ],
              fontSize: 16,
              color: '#111827',
            },
          },
          {
            id: 'smoke-divider',
            type: 'divider',
            x: 980,
            y: 290,
            width: 280,
            height: 12,
            zIndex: 5,
            props: {
              borderColor: '#e5e7eb',
              borderStyle: 'solid',
              thickness: 1,
              margin: 0,
            },
          },
          {
            id: 'smoke-columns',
            type: 'columns',
            x: 980,
            y: 335,
            width: 360,
            height: 170,
            zIndex: 5,
            props: {
              columns: 2,
              gap: 16,
              backgroundColor: '#ffffff',
              borderRadius: 6,
            },
          },
          {
            id: 'smoke-nav',
            type: 'nav',
            x: 980,
            y: 535,
            width: 360,
            height: 72,
            zIndex: 5,
            props: {
              navItems: ['Home', 'About', 'Contact'],
              navDirection: 'horizontal',
              gap: 18,
              ariaLabel: 'Initial nav',
              backgroundColor: 'transparent',
              color: '#111827',
              padding: 12,
            },
          },
          {
            id: 'smoke-spacer',
            type: 'spacer',
            x: 120,
            y: 860,
            width: 220,
            height: 32,
            zIndex: 5,
            props: {
              backgroundColor: '#ffffff',
            },
          },
          {
            id: 'smoke-quote',
            type: 'quote',
            x: 360,
            y: 920,
            width: 360,
            height: 90,
            zIndex: 5,
            props: {
              content: [
                {
                  type: 'blockquote',
                  children: [{ text: 'Initial smoke quote' }],
                },
              ],
              citation: 'Initial source',
              fontSize: 18,
              fontStyle: 'italic',
              color: '#334155',
              quoteBorderColor: '#cbd5e1',
              quoteBorderWidth: 4,
            },
          },
          {
            id: 'smoke-link',
            type: 'link',
            x: 760,
            y: 920,
            width: 220,
            height: 36,
            zIndex: 5,
            props: {
              content: 'Initial link',
              href: '#',
              target: '_self',
              color: '#2563eb',
              fontSize: 16,
              underline: true,
            },
          },
          {
            id: 'smoke-box',
            type: 'box',
            x: 460,
            y: 220,
            width: 330,
            height: 220,
            zIndex: 3,
            props: {
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              borderColor: '#cbd5e1',
              borderWidth: 1,
            },
            children: [
              {
                id: 'smoke-child-button',
                type: 'button',
                x: 32,
                y: 36,
                width: 160,
                height: 48,
                zIndex: 1,
                props: {
                  label: 'Nested button',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  borderRadius: 6,
                  fontSize: 16,
                },
              },
            ],
          },
          {
            id: 'smoke-form',
            type: 'form',
            x: 120,
            y: 460,
            width: 360,
            height: 220,
            zIndex: 4,
            props: {
              formTitle: 'Smoke form',
              backgroundColor: '#ffffff',
              borderRadius: 8,
            },
          },
          {
            id: 'smoke-comment',
            type: 'comment',
            x: 1180,
            y: 880,
            width: 360,
            height: 320,
            zIndex: 5,
            props: {
              commentTitle: 'Initial comments',
              commentAllowGuests: true,
              commentRequireName: true,
              commentRequireEmail: false,
              commentAllowReplies: true,
              commentModerationMode: 'manual',
              commentSortOrder: 'newest',
            },
          },
          {
            id: 'smoke-input',
            type: 'input',
            x: 520,
            y: 820,
            width: 320,
            height: 88,
            zIndex: 5,
            props: {
              label: 'Initial input',
              name: 'initial_input',
              inputType: 'text',
              placeholder: 'Initial placeholder',
              required: false,
              borderRadius: 4,
              borderColor: '#d1d5db',
            },
          },
          {
            id: 'smoke-textarea',
            type: 'textarea',
            x: 860,
            y: 760,
            width: 300,
            height: 130,
            zIndex: 5,
            props: {
              label: 'Initial textarea',
              name: 'initial_message',
              placeholder: 'Initial message',
              rows: 4,
              required: false,
              borderRadius: 4,
              borderColor: '#d1d5db',
            },
          },
          {
            id: 'smoke-select',
            type: 'select',
            x: 860,
            y: 610,
            width: 280,
            height: 96,
            zIndex: 5,
            props: {
              label: 'Initial select',
              name: 'initial_select',
              options: ['Option 1', 'Option 2'],
              placeholder: 'Choose',
              required: false,
              borderRadius: 4,
              borderColor: '#d1d5db',
            },
          },
          {
            id: 'smoke-checkbox',
            type: 'checkbox',
            x: 120,
            y: 720,
            width: 280,
            height: 120,
            zIndex: 5,
            props: {
              label: 'Initial checkbox',
              name: 'initial_checkbox',
              options: ['Option A', 'Option B'],
              required: false,
            },
          },
          {
            id: 'smoke-radio',
            type: 'radio',
            x: 420,
            y: 720,
            width: 280,
            height: 120,
            zIndex: 5,
            props: {
              label: 'Initial radio',
              name: 'initial_radio',
              options: ['Option A', 'Option B'],
              required: false,
            },
          },
          {
            id: 'smoke-repeater',
            type: 'repeater',
            x: 520,
            y: 500,
            width: 430,
            height: 260,
            zIndex: 6,
            props: {
              columns: 2,
              gap: 14,
              limit: 4,
              titleField: 'title',
              descriptionField: 'summary',
              backgroundColor: '#f8fafc',
              borderRadius: 8,
            },
          },
        ],
        canvasSize: {
          width: 1200,
          height: 1040,
        },
      },
    }),
  });

  const pageId = payload.data?.page?.id;
  assert(pageId, `Unable to create smoke page: ${JSON.stringify(payload).slice(0, 300)}`);
  return pageId;
};

const deleteSmokePage = async (pageId) => {
  if (!pageId) {
    return;
  }

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn(`Unable to delete smoke page ${pageId}:`, error instanceof Error ? error.message : error);
  }
};

const createSmokeReusableSection = async () => {
  const slug = `editor-smoke-synced-section-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Editor Smoke Synced Section',
      slug,
      category: 'saved',
      status: 'active',
      tags: ['editor-smoke', 'synced'],
      sourceElementId: 'editor-smoke-source',
      content: {
        canvasSize: { width: 240, height: 90 },
        elements: [
          {
            id: 'editor-smoke-reusable-root',
            type: 'box',
            x: 0,
            y: 0,
            width: 240,
            height: 90,
            zIndex: 1,
            props: {
              backgroundColor: '#eef2ff',
              borderColor: '#818cf8',
              borderWidth: 1,
              borderRadius: 10,
            },
            children: [
              {
                id: 'editor-smoke-reusable-label',
                type: 'heading',
                x: 20,
                y: 20,
                width: 180,
                height: 40,
                zIndex: 1,
                props: {
                  content: 'Reusable v1',
                  level: 'h2',
                  fontSize: 24,
                  color: '#312e81',
                },
              },
            ],
          },
        ],
      },
      createdBy: 'admin',
      updatedBy: 'admin',
    }),
  });

  const sectionId = payload.data?.section?.id;
  assert(sectionId, `Unable to create smoke reusable section: ${JSON.stringify(payload).slice(0, 300)}`);
  return sectionId;
};

const deleteSmokeReusableSection = async (sectionId) => {
  if (!sectionId) {
    return;
  }

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn(`Unable to delete smoke reusable section ${sectionId}:`, error instanceof Error ? error.message : error);
  }
};

const createSmokeCollection = async () => {
  const slug = `editor-smoke-dataset-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Editor Smoke Dataset',
      slug,
      description: 'Temporary collection for editor dataset query controls.',
      status: 'published',
      routePattern: `/${slug}/:recordSlug`,
      listRoutePattern: `/${slug}`,
      permissions: {
        publicRead: true,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true, unique: true, sortOrder: 10 },
        { key: 'category', label: 'Category', type: 'select', required: false, unique: false, sortOrder: 20, options: ['Featured', 'Reference'] },
        { key: 'summary', label: 'Summary', type: 'richText', required: false, unique: false, sortOrder: 30 },
        { key: 'rank', label: 'Rank', type: 'number', required: false, unique: false, sortOrder: 40 },
        { key: 'thumbnail', label: 'Thumbnail', type: 'image', required: false, unique: false, sortOrder: 50 },
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Unable to create smoke collection: ${JSON.stringify(payload).slice(0, 500)}`);

  for (const [index, title] of ['Alpha item', 'Beta featured item'].entries()) {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collection.id}/records`, {
      method: 'POST',
      body: JSON.stringify({
        slug: `${slug}-${index + 1}`,
        status: 'published',
        values: {
          title,
          category: index === 1 ? 'Featured' : 'Reference',
          summary: `${title} summary`,
          rank: index + 1,
          thumbnail: `https://cdn.backy.test/${slug}-${index + 1}.jpg`,
        },
      }),
    });
  }

  return collection;
};

const deleteSmokeCollection = async (collectionId) => {
  if (!collectionId) {
    return;
  }

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn(`Unable to delete smoke collection ${collectionId}:`, error instanceof Error ? error.message : error);
  }
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

const authStorageScript = () => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: apiAdminSessionToken,
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

const openAuthenticatedEditorTab = async (parentClient, url) => {
  const target = await parentClient.send('Target.createTarget', { url: 'about:blank' });
  const page = (await fetchJson('/json/list')).find((candidate) => candidate.id === target.targetId);
  assert(page?.webSocketDebuggerUrl, `No Chrome target found for reload check ${target.targetId}`);

  const client = connectCdp(page.webSocketDebuggerUrl);
  await client.opened;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(),
  });
  await client.send('Page.navigate', { url });
  return client;
};

const waitForEditorElements = async (client, elementIds) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(client, `(() => ({
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      elements: ${JSON.stringify(elementIds)}.map((id) => Boolean(document.querySelector('[data-element-id="' + id + '"]'))),
      body: document.body?.innerText?.slice(0, 160) || '',
    }))()`);

    if (ready.canvas && ready.elements.every(Boolean)) {
      return ready;
    }

    if (attempt === 119) {
      throw new Error(`Editor did not render expected elements: ${JSON.stringify(ready)}`);
    }

    await sleep(250);
  }

  return null;
};

const getElementBox = async (client, elementId) => (
  evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const canvas = document.querySelector('[data-testid="editor-canvas"]');
    const canvasRect = canvas?.getBoundingClientRect?.();
    const style = window.getComputedStyle(node);
    const cssWidth = Number.parseFloat(style.width);
    const cssHeight = Number.parseFloat(style.height);
    const scaleX = Number.isFinite(cssWidth) && cssWidth > 0 ? rect.width / cssWidth : 1;
    const scaleY = Number.isFinite(cssHeight) && cssHeight > 0 ? rect.height / cssHeight : 1;
    return {
      id: node.getAttribute('data-element-id'),
      x: rect.x,
      y: rect.y,
      canvasX: canvasRect ? (rect.x - canvasRect.x) / scaleX : rect.x,
      canvasY: canvasRect ? (rect.y - canvasRect.y) / scaleY : rect.y,
      width: rect.width,
      height: rect.height,
      left: style.left,
      top: style.top,
      cssWidth: style.width,
      cssHeight: style.height,
      text: node.textContent.trim().slice(0, 100),
    };
  })()`)
);

const getElementDragStartPoint = async (client, elementId, box) => {
  const fallback = {
    x: Math.round(box.x + Math.min(box.width / 2, 90)),
    y: Math.round(box.y + Math.min(box.height / 2, 30)),
  };
  const point = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const inset = Math.min(14, Math.max(4, Math.min(rect.width, rect.height) / 5));
    const candidates = [
      [rect.left + inset, rect.top + inset],
      [rect.right - inset, rect.top + inset],
      [rect.left + inset, rect.bottom - inset],
      [rect.right - inset, rect.bottom - inset],
      [rect.left + rect.width / 2, rect.top + inset],
      [rect.left + inset, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
    ];

    for (const [x, y] of candidates) {
      const target = document.elementFromPoint(x, y);
      const host = target instanceof Element ? target.closest('[data-element-id]') : null;
      if (host?.getAttribute('data-element-id') === '${elementId}') {
        return { x: Math.round(x), y: Math.round(y) };
      }
    }

    return null;
  })()`);

  return point || fallback;
};

const scrollElementIntoView = async (client, elementId) => {
  await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return;

    node.scrollIntoView({ block: 'center', inline: 'center' });

    const scrollers = [];
    let scroller = node.parentElement;
    while (scroller) {
      const style = window.getComputedStyle(scroller);
      const canScrollX = scroller.scrollWidth > scroller.clientWidth && /(auto|scroll)/.test(style.overflowX);
      const canScrollY = scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(style.overflowY);
      if (canScrollX || canScrollY) {
        scrollers.push(scroller);
      }
      scroller = scroller.parentElement;
    }

    const pageScroller = document.scrollingElement || document.documentElement;
    if (pageScroller && !scrollers.includes(pageScroller)) {
      scrollers.push(pageScroller);
    }

    const margin = 160;

    for (const currentScroller of scrollers.reverse()) {
      const nodeRect = node.getBoundingClientRect();
      const scrollerRect = currentScroller === pageScroller
        ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
        : currentScroller.getBoundingClientRect();

      if (nodeRect.left < scrollerRect.left + margin) {
        currentScroller.scrollLeft -= (scrollerRect.left + margin) - nodeRect.left;
      } else if (nodeRect.right > scrollerRect.right - margin) {
        currentScroller.scrollLeft += nodeRect.right - (scrollerRect.right - margin);
      }

      if (nodeRect.top < scrollerRect.top + margin) {
        currentScroller.scrollTop -= (scrollerRect.top + margin) - nodeRect.top;
      } else if (nodeRect.bottom > scrollerRect.bottom - margin) {
        currentScroller.scrollTop += nodeRect.bottom - (scrollerRect.bottom - margin);
      }
    }

    const finalRect = node.getBoundingClientRect();
    if (finalRect.top < margin || finalRect.bottom > window.innerHeight - margin) {
      window.scrollBy({
        top: finalRect.top + finalRect.height / 2 - window.innerHeight / 2,
        left: 0,
        behavior: 'instant',
      });
    }
  })()`);
  await sleep(120);
};

const parseCssPixel = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getVisualScale = (box, axis) => {
  const cssSize = parseCssPixel(axis === 'x' ? box.cssWidth : box.cssHeight);
  const visualSize = axis === 'x' ? box.width : box.height;

  if (!cssSize || !Number.isFinite(cssSize) || !Number.isFinite(visualSize) || visualSize <= 0) {
    return null;
  }

  return visualSize / cssSize;
};

const measureDragDelta = (before, after, expectedScreenDeltaX, expectedScreenDeltaY) => {
  const cssDeltaX = parseCssPixel(after.left) !== null && parseCssPixel(before.left) !== null
    ? parseCssPixel(after.left) - parseCssPixel(before.left)
    : null;
  const cssDeltaY = parseCssPixel(after.top) !== null && parseCssPixel(before.top) !== null
    ? parseCssPixel(after.top) - parseCssPixel(before.top)
    : null;
  const screenDeltaX = after.x - before.x;
  const screenDeltaY = after.y - before.y;
  const scaleX = getVisualScale(before, 'x');
  const scaleY = getVisualScale(before, 'y');
  const expectedCanvasDeltaX = scaleX && cssDeltaX !== null
    ? expectedScreenDeltaX / scaleX
    : expectedScreenDeltaX;
  const expectedCanvasDeltaY = scaleY && cssDeltaY !== null
    ? expectedScreenDeltaY / scaleY
    : expectedScreenDeltaY;

  return {
    screen: {
      x: Math.round(screenDeltaX),
      y: Math.round(screenDeltaY),
      expectedX: expectedScreenDeltaX,
      expectedY: expectedScreenDeltaY,
    },
    canvas: {
      x: Math.round(cssDeltaX ?? screenDeltaX),
      y: Math.round(cssDeltaY ?? screenDeltaY),
      expectedX: Math.round(expectedCanvasDeltaX),
      expectedY: Math.round(expectedCanvasDeltaY),
    },
    scale: {
      x: scaleX,
      y: scaleY,
    },
  };
};

const assertDragDelta = (delta, label) => {
  const canvasMatches = Math.abs(delta.canvas.x - delta.canvas.expectedX) <= 18 &&
    Math.abs(delta.canvas.y - delta.canvas.expectedY) <= 18;

  assert(
    canvasMatches,
    `${label}: expected screen ${delta.screen.expectedX},${delta.screen.expectedY} and canvas ${delta.canvas.expectedX},${delta.canvas.expectedY}; got screen ${delta.screen.x},${delta.screen.y}, canvas ${delta.canvas.x},${delta.canvas.y}; scale ${JSON.stringify(delta.scale)}`,
  );
};

const findCanvasElement = (elements, elementId) => {
  for (const element of elements || []) {
    if (element?.id === elementId) {
      return element;
    }

    const child = findCanvasElement(element?.children, elementId);
    if (child) {
      return child;
    }
  }

  return null;
};

const collectSlateLeaves = (value, leaves = []) => {
  if (!value) {
    return leaves;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSlateLeaves(item, leaves));
    return leaves;
  }

  if (typeof value !== 'object') {
    return leaves;
  }

  if (typeof value.text === 'string') {
    leaves.push(value);
  }

  if (Array.isArray(value.children)) {
    collectSlateLeaves(value.children, leaves);
  }

  return leaves;
};

const collectSlateTypes = (value, types = []) => {
  if (!value) {
    return types;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSlateTypes(item, types));
    return types;
  }

  if (typeof value !== 'object') {
    return types;
  }

  if (typeof value.type === 'string') {
    types.push(value.type);
  }

  if (Array.isArray(value.children)) {
    collectSlateTypes(value.children, types);
  }

  return types;
};

const readEditorElementState = async (client, elementIds) => {
  const entries = await Promise.all(elementIds.map(async (elementId) => {
    const box = await getElementBox(client, elementId);
    assert(box, `Missing element ${elementId} while reading editor state`);

    return [
      elementId,
      {
        x: Math.round(parseCssPixel(box.left) ?? box.x),
        y: Math.round(parseCssPixel(box.top) ?? box.y),
        width: Math.round(parseCssPixel(box.cssWidth) ?? box.width),
        height: Math.round(parseCssPixel(box.cssHeight) ?? box.height),
      },
    ];
  }));

  return Object.fromEntries(entries);
};

const getCanvasVisualX = (box) => (
  typeof box?.canvasX === 'number' && Number.isFinite(box.canvasX) ? box.canvasX : box.x
);

const getCanvasVisualY = (box) => (
  typeof box?.canvasY === 'number' && Number.isFinite(box.canvasY) ? box.canvasY : box.y
);

const assertElementState = (actualState, expectedState, label) => {
  for (const [elementId, expected] of Object.entries(expectedState)) {
    const actual = actualState[elementId];
    assert(actual, `${label}: missing ${elementId}`);
    assert(
      Math.abs(actual.x - expected.x) <= 1 &&
      Math.abs(actual.y - expected.y) <= 1 &&
      Math.abs(actual.width - expected.width) <= 1 &&
      Math.abs(actual.height - expected.height) <= 1,
      `${label}: ${elementId} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const getInputModifiers = (options = {}) => (
  (options.shiftKey ? 8 : 0) |
  (options.ctrlKey ? 2 : 0) |
  (options.metaKey ? 4 : 0)
);

const dispatchModifierKeys = async (client, options = {}, type) => {
  const keys = [
    options.shiftKey ? { key: 'Shift', code: 'ShiftLeft', virtualKey: 16 } : null,
    options.ctrlKey ? { key: 'Control', code: 'ControlLeft', virtualKey: 17 } : null,
    options.metaKey ? { key: 'Meta', code: 'MetaLeft', virtualKey: 91 } : null,
  ].filter(Boolean);
  const modifiers = type === 'keyUp' ? 0 : getInputModifiers(options);

  for (const key of keys) {
    await client.send('Input.dispatchKeyEvent', {
      type: type === 'keyDown' ? 'rawKeyDown' : 'keyUp',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.virtualKey,
      nativeVirtualKeyCode: key.virtualKey,
      modifiers,
    });
  }
};

const selectElement = async (client, elementId, options = {}) => {
  await scrollElementIntoView(client, elementId);
  const box = await getElementBox(client, elementId);
  assert(box, `Missing selectable element ${elementId}`);
  const modifiers = getInputModifiers(options);
  const point = await getElementDragStartPoint(client, elementId, box);

  await dispatchModifierKeys(client, options, 'keyDown');
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    modifiers,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    modifiers,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    modifiers,
  });
  await dispatchModifierKeys(client, options, 'keyUp');
  await sleep(150);
};

const pressKey = async (client, key, options = {}) => {
  const codeByKey = {
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    Enter: 'Enter',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Escape: 'Escape',
    a: 'KeyA',
    c: 'KeyC',
    d: 'KeyD',
    g: 'KeyG',
    s: 'KeyS',
    v: 'KeyV',
    x: 'KeyX',
    z: 'KeyZ',
  };
  const virtualKeyByKey = {
    ArrowLeft: 37,
    ArrowRight: 39,
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Delete: 46,
    Backspace: 8,
    Escape: 27,
    a: 65,
    c: 67,
    d: 68,
    g: 71,
    v: 86,
    x: 88,
    z: 90,
  };
  const modifiers = getInputModifiers(options);

  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    modifiers,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    modifiers,
  });
  await sleep(150);
};

const getPrintableKeyCode = (character) => {
  if (character === ' ') return 'Space';
  if (/^[a-z]$/i.test(character)) return `Key${character.toUpperCase()}`;
  if (/^[0-9]$/.test(character)) return `Digit${character}`;
  const codeByCharacter = {
    '*': 'Digit8',
    '_': 'Minus',
    '~': 'Backquote',
    '`': 'Backquote',
  };
  return codeByCharacter[character] || character;
};

const typeText = async (client, text) => {
  for (const character of Array.from(text)) {
    if (character === '\n') {
      await pressKey(client, 'Enter');
      continue;
    }

    const key = character;
    const code = getPrintableKeyCode(character);
    const virtualKey = character === ' ' ? 32 : character.toUpperCase?.().charCodeAt(0) || 0;

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      text: character,
      unmodifiedText: character,
      windowsVirtualKeyCode: virtualKey,
      nativeVirtualKeyCode: virtualKey,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: virtualKey,
      nativeVirtualKeyCode: virtualKey,
    });
  }
  await sleep(150);
};

const mouseDownControlByTestId = async (client, testId) => {
  const state = await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="${testId}"]');
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-control',
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }

    control.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      view: window,
    }));
    control.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      view: window,
    }));
    control.click();
    return {
      ok: true,
      testId: ${JSON.stringify(testId)},
      disabled: control instanceof HTMLButtonElement ? control.disabled : false,
    };
  })()`);

  assert(state?.ok, `Unable to mouse down rich text control ${testId}: ${JSON.stringify(state)}`);
  await sleep(350);
  return state;
};

const dispatchMouseDownByTestId = async (client, testId) => {
  const state = await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="${testId}"]');
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-control',
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }

    control.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      view: window,
    }));
    return {
      ok: true,
      testId: ${JSON.stringify(testId)},
      tagName: control.tagName,
      value: control.value || '',
    };
  })()`);

  assert(state?.ok, `Unable to mouse down ${testId}: ${JSON.stringify(state)}`);
  await sleep(150);
  return state;
};

const clickButtonByAriaLabel = async (client, ariaLabel) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="${ariaLabel}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to click button with aria-label ${ariaLabel}`);
  await sleep(250);
};

const clickEnabledButtonByAriaLabel = async (client, ariaLabel) => {
  const interactiveButtonPredicate = `
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return rect.width > 0 &&
            rect.height > 0 &&
            x >= 0 &&
            y >= 0 &&
            x <= window.innerWidth &&
            y <= window.innerHeight &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            hit instanceof Element &&
            hit.closest('button') === candidate;`;
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button[aria-label="${ariaLabel}"]'))
        .find((candidate) => {
${interactiveButtonPredicate}
        });
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'missing' };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'disabled',
          saveState: document.querySelector('[data-testid="editor-save-status"]')?.getAttribute('data-save-state') || '',
        };
      }
      return { ok: true };
    })()`);

    if (lastState?.ok) {
      const clicked = await evaluate(client, `(() => {
        const button = Array.from(document.querySelectorAll('button[aria-label="${ariaLabel}"]'))
          .find((candidate) => {
${interactiveButtonPredicate}
          });
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.click();
        return true;
      })()`);
      assert(clicked, `Unable to click enabled button with aria-label ${ariaLabel}: ${JSON.stringify(lastState)}`);
      await sleep(350);
      return lastState;
    }
    await sleep(100);
  }

  throw new Error(`Unable to click enabled button with aria-label ${ariaLabel}: ${JSON.stringify(lastState)}`);
};

const setLayoutNumberInput = async (client, label, value) => {
  const testIdByLabel = {
    X: 'editor-layout-x',
    Y: 'editor-layout-y',
    Width: 'editor-layout-width',
    Height: 'editor-layout-height',
    'Z-Index': 'editor-layout-z-index',
    Rotation: 'editor-layout-rotation',
  };
  const testId = testIdByLabel[label];
  assert(testId, `Unknown layout label ${label}`);

  const focused = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    input.focus();
    input.select();
    return { ok: true, testId: ${JSON.stringify(testId)} };
  })()`);

  assert(focused?.ok, `Unable to focus ${label} layout input: ${JSON.stringify(focused)}`);
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(String(value))};
  })()`);

  assert(changed, `Unable to change ${label} layout input to ${value}`);
  await sleep(250);
};

const setFormControlByTestId = async (client, testId, value) => {
  let changed = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    changed = await evaluate(client, `(() => {
      const control = document.querySelector('[data-testid="${testId}"]');
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLSelectElement) && !(control instanceof HTMLTextAreaElement)) {
        return {
          ok: false,
          testId: ${JSON.stringify(testId)},
          reason: 'missing-control',
          inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
        };
      }

      if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === ${JSON.stringify(String(value))})) {
        return {
          ok: false,
          testId: ${JSON.stringify(testId)},
          reason: 'missing-option',
          value: control.value,
          options: Array.from(control.options).map((option) => option.value),
        };
      }

      const prototype = control instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(control, ${JSON.stringify(String(value))});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        ok: control.value === ${JSON.stringify(String(value))},
        value: control.value,
        testId: ${JSON.stringify(testId)},
        options: control instanceof HTMLSelectElement ? Array.from(control.options).map((option) => option.value) : undefined,
      };
    })()`);

    if (changed?.ok) {
      await sleep(250);
      return changed;
    }

    await sleep(250);
  }

  assert(changed?.ok, `Unable to set ${testId} to ${value}: ${JSON.stringify(changed)}`);
  return changed;
};

const setInputValueByTestId = async (client, testId, value) => {
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      ok: input.value === ${JSON.stringify(String(value))},
      value: input.value,
      testId: ${JSON.stringify(testId)},
    };
  })()`);

  assert(changed?.ok, `Unable to set ${testId} to ${value}: ${JSON.stringify(changed)}`);
  await sleep(250);
  return changed;
};

const setCheckboxByTestId = async (client, testId, checked) => {
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }

    if (input.checked !== ${checked ? 'true' : 'false'}) {
      input.click();
    }
    return {
      ok: input.checked === ${checked ? 'true' : 'false'},
      checked: input.checked,
      testId: ${JSON.stringify(testId)},
    };
  })()`);

  assert(changed?.ok, `Unable to set ${testId} checked=${checked}: ${JSON.stringify(changed)}`);
  await sleep(250);
  return changed;
};

const clickControlByTestId = async (client, testId) => {
  const clicked = await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="${testId}"]');
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    control.click();
    return { ok: true, testId: ${JSON.stringify(testId)} };
  })()`);

  assert(clicked?.ok, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);
  await sleep(250);
  return clicked;
};

const clickControlBySelector = async (client, selector, label = selector) => {
  const clicked = await evaluate(client, `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        selector: ${JSON.stringify(selector)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    control.click();
    return { ok: true, selector: ${JSON.stringify(selector)} };
  })()`);

  assert(clicked?.ok, `Unable to click ${label}: ${JSON.stringify(clicked)}`);
  await sleep(250);
  return clicked;
};

const hoverControlBySelector = async (client, selector, label = selector) => {
  const target = await evaluate(client, `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        selector: ${JSON.stringify(selector)},
        libraryText: document.querySelector('[data-testid="editor-component-library"]')?.textContent || '',
      };
    }
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = control.getBoundingClientRect();
    control.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    control.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, view: window }));
    return {
      ok: true,
      selector: ${JSON.stringify(selector)},
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);

  assert(target?.ok, `Unable to hover ${label}: ${JSON.stringify(target)}`);
  await sleep(250);
  return target;
};

const leaveControlBySelector = async (client, selector, label = selector) => {
  const left = await evaluate(client, `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement)) {
      return {
        ok: false,
        selector: ${JSON.stringify(selector)},
        libraryText: document.querySelector('[data-testid="editor-component-library"]')?.textContent || '',
      };
    }
    control.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window }));
    control.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true, view: window }));
    return { ok: true, selector: ${JSON.stringify(selector)} };
  })()`);

  assert(left?.ok, `Unable to leave ${label}: ${JSON.stringify(left)}`);
  await sleep(250);
  return left;
};

const setFileInputByTestId = async (client, testId, filePaths) => {
  const documentNode = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await client.send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: `[data-testid="${testId}"]`,
  });

  assert(nodeId, `Unable to find file input ${testId}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId,
    files: filePaths,
  });

  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
      return { ok: false, reason: 'missing-file-input', testId: ${JSON.stringify(testId)} };
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ok: true,
      testId: ${JSON.stringify(testId)},
      files: Array.from(input.files || []).map((file) => file.name),
    };
  })()`);

  assert(changed?.ok, `Unable to set files for ${testId}: ${JSON.stringify(changed)}`);
  await sleep(250);
  return changed;
};

const blurActiveElement = async (client) => {
  await evaluate(client, `(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body?.focus?.();
    return true;
  })()`);
  await sleep(100);
};

const scrollEditorToolbarIntoView = async (client, ariaLabel = 'Undo') => {
  await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="${ariaLabel}"]');
    button?.scrollIntoView?.({ block: 'center', inline: 'center' });
    return true;
  })()`);
  await sleep(150);
};

const switchToPropertiesPanel = async (client) => {
  let state = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    state = await evaluate(client, `(() => {
      const propertiesTab = document.querySelector('[data-testid="editor-tab-properties"]');
      if (propertiesTab instanceof HTMLButtonElement) {
        propertiesTab.click();
        return {
          ok: true,
          action: 'clicked-properties-tab',
          hasInspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
        };
      }

      const focusButton = document.querySelector('button[aria-label="Exit wide canvas focus"]');
      if (focusButton instanceof HTMLButtonElement) {
        focusButton.click();
        return { ok: false, action: 'exit-focus-mode' };
      }

      const inspectorButton = document.querySelector('button[aria-label="Show inspector panel"]');
      if (inspectorButton instanceof HTMLButtonElement) {
        inspectorButton.click();
        return { ok: false, action: 'show-inspector-panel' };
      }

      return {
        ok: false,
        action: 'missing-properties-tab',
        hasInspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
        hasCanvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
        selectedText: document.querySelector('[data-testid="editor-inspector-selection"]')?.textContent || '',
        toolbarText: Array.from(document.querySelectorAll('button')).map((button) => button.textContent?.trim()).filter(Boolean).slice(0, 20),
        bodyText: document.body?.textContent?.slice(0, 500) || '',
      };
    })()`);

    if (state?.ok) {
      await sleep(250);
      return state;
    }

    await sleep(250);
  }

  assert(false, `Unable to switch editor inspector to Properties panel: ${JSON.stringify(state)}`);
  await sleep(250);
};

const ensurePropertySectionExpanded = async (client, sectionTitle) => {
  const expanded = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('[data-testid="editor-inspector"] button'));
    const button = buttons.find((candidate) => (candidate.textContent || '').trim().includes(${JSON.stringify(sectionTitle)}));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-section-button',
        sectionTitle: ${JSON.stringify(sectionTitle)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    const parent = button.parentElement;
    const wasExpanded = Boolean(parent && parent.children.length > 1);
    if (!wasExpanded) {
      button.click();
    }
    return {
      ok: true,
      wasExpanded,
      sectionTitle: ${JSON.stringify(sectionTitle)},
    };
  })()`);

  assert(expanded?.ok, `Unable to expand ${sectionTitle} section: ${JSON.stringify(expanded)}`);
  await sleep(250);
  return expanded;
};

const selectLayerById = async (client, elementId) => {
  const layerSelector = `[data-layer-id="${elementId}"]`;
  const layersReady = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-layers-tab',
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(layersReady?.ok, `Unable to open Layers panel: ${JSON.stringify(layersReady)}`);
  await sleep(150);

  let clicked = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clicked = await evaluate(client, `(() => {
    const layer = document.querySelector(${JSON.stringify(layerSelector)});
    if (!(layer instanceof HTMLElement)) {
      return {
        ok: false,
        availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]'))
          .map((node) => node.getAttribute('data-layer-id')),
        panelText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    layer.click();
    return { ok: true };
  })()`);

    if (clicked?.ok) {
      break;
    }
    await sleep(100);
  }

  assert(clicked?.ok, `Unable to select layer ${elementId}: ${JSON.stringify(clicked)}`);
  await sleep(250);
  await switchToPropertiesPanel(client);
};

const readLayerActionState = async (client, elementId) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel for ${elementId}: ${JSON.stringify(opened)}`);
  await sleep(150);

  let state = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    state = await evaluate(client, `(() => {
    const row = document.querySelector('[data-layer-id="${elementId}"]');
    if (!(row instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-layer-row',
        availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]'))
          .map((node) => node.getAttribute('data-layer-id')),
      };
    }
    return {
      ok: true,
      hidden: row.classList.contains('hidden'),
      locked: row.classList.contains('locked'),
      visibilityLabel: document.querySelector('[data-layer-action="visibility"][data-layer-action-id="${elementId}"]')?.getAttribute('aria-label') || '',
      lockLabel: document.querySelector('[data-layer-action="lock"][data-layer-action-id="${elementId}"]')?.getAttribute('aria-label') || '',
    };
  })()`);

    if (state?.ok) {
      break;
    }
    await sleep(100);
  }

  assert(state?.ok, `Unable to read layer action state for ${elementId}: ${JSON.stringify(state)}`);
  return state;
};

const setLayerHiddenState = async (client, elementId, hidden) => {
  const state = await readLayerActionState(client, elementId);
  if (state.hidden === hidden) {
    return state;
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="visibility"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to toggle visibility for layer ${elementId}`);
  await sleep(250);
  const nextState = await readLayerActionState(client, elementId);
  assert(nextState.hidden === hidden, `Layer ${elementId} hidden state did not become ${hidden}: ${JSON.stringify(nextState)}`);
  return nextState;
};

const setLayerLockedState = async (client, elementId, locked) => {
  const state = await readLayerActionState(client, elementId);
  if (state.locked === locked) {
    return state;
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="lock"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to toggle lock for layer ${elementId}`);
  await sleep(250);
  const nextState = await readLayerActionState(client, elementId);
  assert(nextState.locked === locked, `Layer ${elementId} locked state did not become ${locked}: ${JSON.stringify(nextState)}`);
  return nextState;
};

const clickLayerAction = async (client, action, elementId) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel before ${action} on ${elementId}: ${JSON.stringify(opened)}`);
  await sleep(150);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="${action}"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-button',
        availableActions: Array.from(document.querySelectorAll('[data-layer-action]')).map((node) => ({
          action: node.getAttribute('data-layer-action'),
          id: node.getAttribute('data-layer-action-id'),
          disabled: node instanceof HTMLButtonElement ? node.disabled : null,
        })),
      };
    }

    if (button.disabled) {
      return {
        ok: false,
        reason: 'disabled',
        label: button.getAttribute('aria-label') || '',
      };
    }

    button.click();
    return {
      ok: true,
      label: button.getAttribute('aria-label') || '',
    };
  })()`);

  assert(clicked?.ok, `Unable to click layer ${action} for ${elementId}: ${JSON.stringify(clicked)}`);
  await sleep(300);
  return clicked;
};

const readLayerTreeState = async (client, elementIds) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel for tree state: ${JSON.stringify(opened)}`);
  await sleep(150);

  const state = await evaluate(client, `(() => {
    const wanted = ${JSON.stringify(elementIds)};
    const rows = Array.from(document.querySelectorAll('[data-layer-id]')).map((row, index) => ({
      id: row.getAttribute('data-layer-id'),
      depth: Number(row.getAttribute('data-layer-depth') || 0),
      selected: row.getAttribute('data-layer-selected') === 'true',
      index,
    }));
    return {
      rows,
      byId: Object.fromEntries(wanted.map((id) => [
        id,
        rows.find((row) => row.id === id) || null,
      ])),
    };
  })()`);

  assert(
    elementIds.every((elementId) => state.byId?.[elementId]),
    `Layer tree state missing expected rows: ${JSON.stringify(state)}`,
  );

  return state;
};

const dragLayerRow = async (client, fromId, toId) => {
  const before = await readLayerTreeState(client, [fromId, toId]);
  const startResult = await evaluate(client, `(() => {
    const from = document.querySelector('[data-layer-id="${fromId}"]');
    if (!(from instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-from-layer-row',
        availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]')).map((node) => node.getAttribute('data-layer-id')),
      };
    }

    const dataTransfer = new DataTransfer();
    const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
    const started = from.dispatchEvent(dragStart);
    return { ok: true, started };
  })()`);
  assert(startResult?.ok, `Unable to start dragging layer ${fromId}: ${JSON.stringify(startResult)}`);
  await sleep(150);

  const overResult = await evaluate(client, `(() => {
    const to = document.querySelector('[data-layer-id="${toId}"]');
    if (!(to instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-to-layer-row',
        availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]')).map((node) => node.getAttribute('data-layer-id')),
      };
    }

    const dataTransfer = new DataTransfer();
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
    const overed = to.dispatchEvent(dragOver);
    return { ok: true, overed };
  })()`);
  assert(overResult?.ok, `Unable to drag layer ${fromId} over ${toId}: ${JSON.stringify(overResult)}`);
  await sleep(300);

  const endResult = await evaluate(client, `(() => {
    const from = document.querySelector('[data-layer-id="${fromId}"]');
    if (!(from instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-from-layer-row' };
    }

    const dataTransfer = new DataTransfer();
    const dragEnd = new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer });
    const ended = from.dispatchEvent(dragEnd);
    return { ok: true, ended };
  })()`);
  assert(endResult?.ok, `Unable to end dragging layer ${fromId}: ${JSON.stringify(endResult)}`);
  await sleep(300);

  const after = await readLayerTreeState(client, [fromId, toId]);
  assert(
    after.byId[fromId].index !== before.byId[fromId].index ||
      after.byId[toId].index !== before.byId[toId].index,
    `Layer drag did not reorder rows: ${JSON.stringify({ before, after, startResult, overResult, endResult })}`,
  );

  return {
    fromId,
    toId,
    startResult,
    overResult,
    endResult,
    before,
    after,
  };
};

const waitForPersistedLayerState = async (pageId, expected) => {
  let lastState = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const elements = payload.data?.page?.content?.elements || [];
    lastState = Object.fromEntries(Object.entries(expected).map(([elementId]) => {
      const element = findCanvasElement(elements, elementId);
      return [
        elementId,
        element
          ? {
              exists: true,
              hidden: element.visible === false,
              locked: element.locked === true,
              zIndex: element.zIndex,
            }
          : { exists: false, hidden: false, locked: false, zIndex: null },
      ];
    }));

    const complete = Object.entries(expected).every(([elementId, expectedState]) => {
      const actual = lastState[elementId];
      if (!actual?.exists) {
        return false;
      }

      return Object.entries(expectedState).every(([key, value]) => actual[key] === value);
    });

    if (complete) {
      return lastState;
    }

    await sleep(250);
  }

  throw new Error(`Persisted layer state did not match. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(lastState)}`);
};

const readBreakpointOverrideControls = async (client) => {
  const controls = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    const groups = Object.fromEntries(
      ['layout', 'layer', 'content', 'style'].map((group) => {
        const button = document.querySelector('[data-testid="editor-breakpoint-reset-' + group + '"]');
        return [group, button instanceof HTMLButtonElement
          ? {
              exists: true,
              disabled: button.disabled,
              text: button.textContent || '',
              title: button.getAttribute('title') || '',
            }
          : { exists: false }];
      }),
    );
    return {
      panelText: panel?.textContent || '',
      groups,
    };
  })()`);

  assert(controls?.panelText, `Unable to read breakpoint override controls: ${JSON.stringify(controls)}`);
  return controls;
};

const clickBreakpointResetGroup = async (client, group) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-breakpoint-reset-${group}"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to click breakpoint ${group} reset control`);
  await sleep(250);
};

const waitForElementState = async (client, elementId, predicate, label) => {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = (await readEditorElementState(client, [elementId]))[elementId];
    if (predicate(lastState)) {
      return lastState;
    }
    await sleep(100);
  }
  throw new Error(`${label}: ${JSON.stringify(lastState)}`);
};

const readPersistedElement = async (pageId, elementId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  return findCanvasElement(elements, elementId);
};

const assertResponsiveBreakpointEditing = async (client, pageId, elementId, options = {}) => {
  const breakpoint = options.breakpoint || 'mobile';
  const breakpointLabel = breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1);
  const breakpointCanvasLabel = `${breakpointLabel} canvas`;
  const expectedBreakpointX = options.expectedX ?? (breakpoint === 'tablet' ? 64 : 24);
  const expectedBreakpointWidth = options.expectedWidth ?? (breakpoint === 'tablet' ? 360 : 300);

  await selectLayerById(client, elementId);
  await clickButtonByAriaLabel(client, 'Desktop canvas');
  await selectLayerById(client, elementId);
  const desktopBefore = (await readEditorElementState(client, [elementId]))[elementId];
  assert(desktopBefore, `Unable to read current desktop editor state before responsive edit: ${elementId}`);
  await clickButtonByAriaLabel(client, breakpointCanvasLabel);
  await selectLayerById(client, elementId);
  await setLayoutNumberInput(client, 'X', expectedBreakpointX);
  await setLayoutNumberInput(client, 'Width', expectedBreakpointWidth);

  const breakpointStateForElement = await waitForElementState(
    client,
    elementId,
    (state) => state.x === expectedBreakpointX && state.width === expectedBreakpointWidth,
    `${breakpointLabel} override did not update editor element state`,
  );
  const breakpointState = { [elementId]: breakpointStateForElement };
  assert(
    breakpointState[elementId].x === expectedBreakpointX && breakpointState[elementId].width === expectedBreakpointWidth,
    `${breakpointLabel} override did not update editor element state: ${JSON.stringify(breakpointState[elementId])}`,
  );

  const overridePanel = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    return {
      exists: Boolean(panel),
      text: panel?.textContent || '',
    };
  })()`);
  assert(
    overridePanel.exists && new RegExp(`${breakpoint} override`, 'i').test(overridePanel.text),
    `Responsive override panel did not appear: ${JSON.stringify(overridePanel)}`,
  );

  const layoutControls = await readBreakpointOverrideControls(client);
  assert(
    layoutControls.groups.layout.exists &&
      layoutControls.groups.layout.disabled === false &&
      layoutControls.groups.layer.exists &&
      layoutControls.groups.layer.disabled === Boolean(!options.expectExistingLayerOverride),
    `Breakpoint override controls did not expose active layout inheritance state: ${JSON.stringify(layoutControls)}`,
  );

  await clickBreakpointResetGroup(client, 'layout');
  await waitForElementState(
    client,
    elementId,
    (state) => state.x === Math.round(desktopBefore.x) && state.width === Math.round(desktopBefore.width),
    'Layout reset control did not restore inherited desktop layout',
  );
  await setLayoutNumberInput(client, 'X', expectedBreakpointX);
  await setLayoutNumberInput(client, 'Width', expectedBreakpointWidth);
  await waitForElementState(
    client,
    elementId,
    (state) => state.x === expectedBreakpointX && state.width === expectedBreakpointWidth,
    `${breakpointLabel} override did not reapply after layout reset`,
  );

  const breakpointLayerHidden = await setLayerHiddenState(client, elementId, true);
  const breakpointLayerLocked = await setLayerLockedState(client, elementId, true);
  const layerControls = await readBreakpointOverrideControls(client);
  assert(
    layerControls.groups.layout.disabled === false &&
      layerControls.groups.layer.disabled === false,
    `Breakpoint override controls did not expose active layout and layer state: ${JSON.stringify(layerControls)}`,
  );

  await clickBreakpointResetGroup(client, 'layer');
  const resetLayerState = await readLayerActionState(client, elementId);
  assert(
    resetLayerState.hidden === false && resetLayerState.locked === false,
    `Layer reset control did not restore inherited desktop layer state: ${JSON.stringify(resetLayerState)}`,
  );
  await setLayerHiddenState(client, elementId, true);
  await setLayerLockedState(client, elementId, true);

  await clickSave(client);

  let persistedElement = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    persistedElement = await readPersistedElement(pageId, elementId);
    const persistedOverride = persistedElement?.responsive?.[breakpoint];
    if (
      persistedOverride?.x === expectedBreakpointX &&
      persistedOverride?.width === expectedBreakpointWidth &&
      persistedOverride?.visible === false &&
      persistedOverride?.locked === true
    ) {
      break;
    }
    await sleep(250);
  }

  assert(
    (() => {
      const persistedOverride = persistedElement?.responsive?.[breakpoint];
      return (
        persistedElement?.x === desktopBefore.x &&
        persistedElement?.width === desktopBefore.width &&
        persistedOverride?.x === expectedBreakpointX &&
        persistedOverride?.width === expectedBreakpointWidth &&
        persistedOverride?.visible === false &&
        persistedOverride?.locked === true
      );
    })(),
    `Responsive override was not persisted without changing desktop layout: ${JSON.stringify({ desktopBefore, persistedElement })}`,
  );

  await clickButtonByAriaLabel(client, 'Desktop canvas');
  const desktopAfter = await readEditorElementState(client, [elementId]);
  assert(
    desktopAfter[elementId].x === Math.round(desktopBefore.x) &&
      desktopAfter[elementId].width === Math.round(desktopBefore.width),
    `Desktop canvas did not retain base layout after ${breakpoint} override: ${JSON.stringify({ desktopBefore, desktopAfter })}`,
  );

  await clickButtonByAriaLabel(client, breakpointCanvasLabel);
  const breakpointLayerAfter = await readLayerActionState(client, elementId);
  assert(
    breakpointLayerAfter.hidden === true && breakpointLayerAfter.locked === true,
    `${breakpointLabel} layer override did not hydrate after switching breakpoints: ${JSON.stringify(breakpointLayerAfter)}`,
  );

  return {
    breakpoint,
    elementId,
    desktopBefore: {
      x: desktopBefore.x,
      width: desktopBefore.width,
    },
    breakpointOverride: persistedElement.responsive[breakpoint],
    breakpointLayerHidden,
    breakpointLayerLocked,
    desktopAfter: desktopAfter[elementId],
    breakpointAfter: {
      ...breakpointState[elementId],
      hidden: breakpointLayerAfter.hidden,
      locked: breakpointLayerAfter.locked,
    },
  };
};

const testKeyboardNudge = async (client, elementId) => {
  await selectLayerById(client, elementId);
  await blurActiveElement(client);
  const before = await readEditorElementState(client, [elementId]);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  await pressKey(client, 'ArrowDown', { shiftKey: true });
  const after = await readEditorElementState(client, [elementId]);

  assert(
    after[elementId].x === before[elementId].x + 10 &&
    after[elementId].y === before[elementId].y + 10,
    `${elementId} keyboard nudge failed: before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}`,
  );

  return {
    elementId,
    before: before[elementId],
    after: after[elementId],
    delta: {
      x: after[elementId].x - before[elementId].x,
      y: after[elementId].y - before[elementId].y,
    },
  };
};

const readShortcutSelectionState = async (client, label) => evaluate(client, `(() => {
  const selectedLayers = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
    .map((node) => node.getAttribute('data-layer-id'))
    .filter(Boolean);
  const inspectorSelection = document.querySelector('[data-testid="editor-inspector-selection"]');
  const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');

  return {
    label: ${JSON.stringify(label)},
    selectedLayers,
    hasInspectorSelection: Boolean(inspectorSelection),
    hasMultiSelection: Boolean(multiSelection),
    inspectorText: inspectorSelection?.textContent || '',
    multiSelectionText: multiSelection?.textContent || '',
  };
})()`);

const testEscapeDeselectShortcut = async (client, elementId) => {
  await selectLayerIds(client, [elementId]);
  const before = await readShortcutSelectionState(client, 'before escape');
  assert(
    before.selectedLayers.includes(elementId) && before.hasInspectorSelection,
    `Escape shortcut setup did not select ${elementId}: ${JSON.stringify(before)}`,
  );

  await blurActiveElement(client);
  await pressKey(client, 'Escape');
  const after = await readShortcutSelectionState(client, 'after escape');
  assert(
    after.selectedLayers.length === 0 &&
      after.hasInspectorSelection === false &&
      after.hasMultiSelection === false,
    `Escape shortcut did not clear editor selection: ${JSON.stringify(after)}`,
  );

  return {
    elementId,
    before,
    after,
  };
};

const readClipboardEditingState = async (client, label) => {
  const state = await evaluate(client, `(() => {
    const buttonState = (ariaLabel) => {
      const button = Array.from(document.querySelectorAll('button[aria-label="' + ariaLabel + '"]'))
        .find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        });
      return button instanceof HTMLButtonElement
        ? {
            exists: true,
            disabled: button.disabled,
            title: button.getAttribute('title') || '',
          }
        : { exists: false, disabled: null, title: '' };
    };
    const selectedLayerIds = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean);

    const elementIds = Array.from(document.querySelectorAll('[data-element-id]'))
      .map((node) => node.getAttribute('data-element-id'))
      .filter(Boolean);
    const activeElement = document.activeElement instanceof HTMLElement
      ? {
          tagName: document.activeElement.tagName,
          ariaLabel: document.activeElement.getAttribute('aria-label') || '',
          role: document.activeElement.getAttribute('role') || '',
          testId: document.activeElement.getAttribute('data-testid') || '',
          elementId: document.activeElement.closest('[data-element-id]')?.getAttribute('data-element-id') || '',
          isContentEditable: document.activeElement.isContentEditable,
      }
      : null;
    const saveStatus = document.querySelector('[data-testid="editor-save-status"]');

    return {
      label: ${JSON.stringify(label)},
      elementCount: new Set(elementIds).size,
      elementIds,
      activeElement,
      saveStatus: {
        text: saveStatus?.textContent || '',
        title: saveStatus?.getAttribute('title') || '',
        state: saveStatus?.getAttribute('data-save-state') || '',
        mode: saveStatus?.getAttribute('data-save-mode') || '',
        pendingChanges: Number(saveStatus?.getAttribute('data-pending-changes') || 0),
      },
      copy: buttonState('Copy'),
      cut: buttonState('Cut'),
      paste: buttonState('Paste'),
      duplicate: buttonState('Duplicate'),
      undo: buttonState('Undo'),
      redo: buttonState('Redo'),
      selectedLayerIds,
      selectedText: document.querySelector('[data-testid="editor-inspector-selection"]')?.textContent || '',
      multiSelectedText: document.querySelector('[data-testid="editor-inspector-multi-selection"]')?.textContent || '',
    };
  })()`);

  assert(state.copy.exists, `Clipboard copy control missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.cut.exists, `Clipboard cut control missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.paste.exists, `Clipboard paste control missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.duplicate.exists, `Clipboard duplicate control missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.undo.exists, `Undo control missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.redo.exists, `Redo control missing during ${label}: ${JSON.stringify(state)}`);
  return state;
};

const waitForClipboardElementCount = async (client, expectedCount, label) => {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = await readClipboardEditingState(client, label);
    if (lastState.elementCount === expectedCount) {
      return lastState;
    }
    await sleep(100);
  }

  throw new Error(`${label} did not reach ${expectedCount} unique elements: ${JSON.stringify(lastState)}`);
};

const testClipboardEditingControls = async (client, elementId) => {
  await selectLayerById(client, elementId);
  await blurActiveElement(client);

  const before = await readClipboardEditingState(client, 'before copy');
  assert(before.copy.disabled === false, `Copy should be enabled for selected ${elementId}: ${JSON.stringify(before)}`);
  assert(before.cut.disabled === false, `Cut should be enabled for selected ${elementId}: ${JSON.stringify(before)}`);
  assert(before.duplicate.disabled === false, `Duplicate should be enabled for selected ${elementId}: ${JSON.stringify(before)}`);

  await pressKey(client, 'c', { ctrlKey: true });
  const afterCopy = await readClipboardEditingState(client, 'after copy');
  assert(afterCopy.paste.disabled === false, `Paste should be enabled after copy: ${JSON.stringify(afterCopy)}`);

  await pressKey(client, 'v', { ctrlKey: true });
  const afterPaste = await readClipboardEditingState(client, 'after paste');
  assert(
    afterPaste.elementCount === before.elementCount + 1,
    `Paste should add one canvas element: before ${JSON.stringify(before)}, after ${JSON.stringify(afterPaste)}`,
  );
  assert(afterPaste.undo.disabled === false, `Undo should be enabled after paste: ${JSON.stringify(afterPaste)}`);

  await waitForEditorMutationReady(client, 'before clipboard paste undo');
  await scrollEditorToolbarIntoView(client);
  await blurActiveElement(client);
  await clickEnabledButtonByAriaLabel(client, 'Undo');
  await waitForEditorMutationReady(client, 'after clipboard paste undo');
  const afterUndoPaste = await waitForClipboardElementCount(client, before.elementCount, 'after paste undo');

  await waitForEditorMutationReady(client, 'before clipboard paste redo');
  await scrollEditorToolbarIntoView(client);
  await blurActiveElement(client);
  await clickEnabledButtonByAriaLabel(client, 'Redo');
  await waitForEditorMutationReady(client, 'after clipboard paste redo');
  const afterRedoPaste = await waitForClipboardElementCount(client, before.elementCount + 1, 'after paste redo');

  await blurActiveElement(client);
  await pressKey(client, 'd', { ctrlKey: true });
  const afterDuplicate = await readClipboardEditingState(client, 'after duplicate');
  assert(
    afterDuplicate.elementCount === before.elementCount + 2,
    `Duplicate should add one additional canvas element: ${JSON.stringify(afterDuplicate)}`,
  );

  await pressKey(client, 'x', { ctrlKey: true });
  await waitForEditorMutationReady(client, 'after clipboard cut');
  const afterCut = await readClipboardEditingState(client, 'after cut');
  assert(
    afterCut.elementCount === before.elementCount + 1,
    `Cut should remove the selected duplicate and retain the earlier paste: ${JSON.stringify(afterCut)}`,
  );
  assert(afterCut.paste.disabled === false, `Paste should stay enabled after cut: ${JSON.stringify(afterCut)}`);

  await pressKey(client, 'v', { ctrlKey: true });
  const afterCutPaste = await readClipboardEditingState(client, 'after cut paste');
  assert(
    afterCutPaste.elementCount === before.elementCount + 2,
    `Paste after cut should reinsert the cut element: ${JSON.stringify(afterCutPaste)}`,
  );

  return {
    before,
    afterCopy,
    afterPaste,
    afterUndoPaste,
    afterRedoPaste,
    afterDuplicate,
    afterCut,
    afterCutPaste,
  };
};

const testEditorShortcutGuards = async (client, elementId) => {
  await selectElement(client, elementId);
  await switchToPropertiesPanel(client);
  const before = await readEditorElementState(client, [elementId]);

  const focusedSelect = await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="editor-heading-level"]');
    if (!(control instanceof HTMLSelectElement)) {
      return {
        ok: false,
        reason: 'heading-level-select-missing',
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    control.focus();
    return {
      ok: document.activeElement === control,
      tagName: document.activeElement?.tagName || null,
      value: control.value,
    };
  })()`);

  assert(focusedSelect?.ok, `Unable to focus heading level select for shortcut guard: ${JSON.stringify(focusedSelect)}`);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  await pressKey(client, 'Delete');
  await pressKey(client, 'g', { ctrlKey: true });

  const afterSelectShortcuts = await readEditorElementState(client, [elementId]);
  assertElementState(afterSelectShortcuts, before, 'focused select shortcuts');

  await blurActiveElement(client);
  let settingsOpened = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    settingsOpened = await evaluate(client, `(() => {
      const button = document.querySelector('button[aria-label="Page settings"]');
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="page-settings-dialog-title"]');
      if (dialog instanceof HTMLElement) {
        return { ok: true, clicked: false, disabled: false };
      }
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'settings-button-missing' };
      }
      if (button.disabled) {
        return { ok: false, reason: 'settings-button-disabled', disabled: true };
      }
      button.click();
      return { ok: false, clicked: true, disabled: false };
    })()`);
    if (settingsOpened?.ok) {
      break;
    }
    await sleep(150);
  }
  assert(settingsOpened?.ok, `Unable to open page settings dialog for shortcut guard: ${JSON.stringify(settingsOpened)}`);

  const focusedDialog = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="page-settings-dialog-title"]');
    if (!(dialog instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'page-settings-dialog-missing',
        body: document.body?.innerText?.slice(0, 300) || '',
      };
    }
    dialog.setAttribute('tabindex', '-1');
    dialog.focus();
    return {
      ok: document.activeElement === dialog,
      activeRole: document.activeElement?.getAttribute('role') || null,
      title: document.querySelector('#page-settings-dialog-title')?.textContent || '',
    };
  })()`);

  assert(focusedDialog?.ok, `Unable to focus page settings dialog for shortcut guard: ${JSON.stringify(focusedDialog)}`);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  await pressKey(client, 'Delete');
  await pressKey(client, 'g', { ctrlKey: true });

  const afterDialogShortcuts = await readEditorElementState(client, [elementId]);
  assertElementState(afterDialogShortcuts, before, 'focused dialog shortcuts');

  const dialogStillOpen = await evaluate(client, `(() => Boolean(
    document.querySelector('[role="dialog"][aria-labelledby="page-settings-dialog-title"]')
  ))()`);
  assert(dialogStillOpen === true, 'Page settings dialog closed while exercising guarded shortcuts');

  const closedDialog = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="page-settings-dialog-title"]');
    const cancelButton = Array.from(dialog?.querySelectorAll('button') || [])
      .find((button) => (button.textContent || '').trim() === 'Cancel');
    if (!(cancelButton instanceof HTMLButtonElement)) {
      return false;
    }
    cancelButton.click();
    return true;
  })()`);
  assert(closedDialog === true, 'Unable to close page settings dialog after shortcut guard check');
  await sleep(200);

  return {
    elementId,
    focusedSelect,
    focusedDialog,
    before: before[elementId],
    afterSelectShortcuts: afterSelectShortcuts[elementId],
    afterDialogShortcuts: afterDialogShortcuts[elementId],
  };
};

const testUndoRedoAfterKeyboardNudge = async (client, elementId) => {
  await selectLayerById(client, elementId);
  await blurActiveElement(client);
  const before = await readEditorElementState(client, [elementId]);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  const nudged = await readEditorElementState(client, [elementId]);

  assert(
    nudged[elementId].x === before[elementId].x + 10 &&
    nudged[elementId].y === before[elementId].y,
    `${elementId} keyboard nudge before undo failed: before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(nudged[elementId])}`,
  );

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readEditorElementState(client, [elementId]);
  assertElementState(undone, before, `${elementId} keyboard Ctrl+Z`);

  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readEditorElementState(client, [elementId]);
  assertElementState(redone, nudged, `${elementId} keyboard Ctrl+Shift+Z`);

  return {
    elementId,
    before: before[elementId],
    nudged: nudged[elementId],
    undone: undone[elementId],
    redone: redone[elementId],
  };
};

const testUndoRedoAfterDrag = async (client, elementId) => {
  const before = await readEditorElementState(client, [elementId]);
  const drag = await dragElement(client, elementId, 30, 20);
  const moved = await readEditorElementState(client, [elementId]);

  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readEditorElementState(client, [elementId]);
  assertElementState(undone, before, `${elementId} Ctrl+Z`);

  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readEditorElementState(client, [elementId]);
  assertElementState(redone, moved, `${elementId} Ctrl+Shift+Z`);

  return {
    elementId,
    drag,
    before: before[elementId],
    moved: moved[elementId],
    undone: undone[elementId],
    redone: redone[elementId],
  };
};

const testUndoRedoAfterInspectorLayoutChange = async (client, elementId) => {
  await selectLayerById(client, elementId);
  const before = await readEditorElementState(client, [elementId]);
  const targetX = before[elementId].x + 37;
  await setInputValueByTestId(client, 'editor-layout-x', targetX);
  const changed = await readEditorElementState(client, [elementId]);

  assert(
    Math.abs(changed[elementId].x - targetX) <= 1,
    `${elementId} inspector layout change failed: expected x ${targetX}, got ${JSON.stringify(changed[elementId])}`,
  );

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readEditorElementState(client, [elementId]);
  assertElementState(undone, before, `${elementId} inspector Ctrl+Z`);

  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readEditorElementState(client, [elementId]);
  assertElementState(redone, changed, `${elementId} inspector Ctrl+Shift+Z`);

  return {
    elementId,
    before: before[elementId],
    changed: changed[elementId],
    undone: undone[elementId],
    redone: redone[elementId],
  };
};

const testUndoRedoAfterLayerVisibilityToggle = async (client, elementId) => {
  await setLayerHiddenState(client, elementId, false);
  const before = await readLayerActionState(client, elementId);
  await setLayerHiddenState(client, elementId, true);
  const hidden = await readLayerActionState(client, elementId);
  assert(hidden.hidden === true, `${elementId} layer visibility toggle did not hide layer: ${JSON.stringify(hidden)}`);

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readLayerActionState(client, elementId);
  assert(undone.hidden === before.hidden, `${elementId} layer visibility Ctrl+Z mismatch: before ${JSON.stringify(before)}, after ${JSON.stringify(undone)}`);

  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readLayerActionState(client, elementId);
  assert(redone.hidden === true, `${elementId} layer visibility Ctrl+Shift+Z mismatch: ${JSON.stringify(redone)}`);

  await pressKey(client, 'z', { ctrlKey: true });
  const restored = await readLayerActionState(client, elementId);
  assert(restored.hidden === before.hidden, `${elementId} layer visibility restore mismatch: before ${JSON.stringify(before)}, after ${JSON.stringify(restored)}`);

  return {
    elementId,
    before,
    hidden,
    undone,
    redone,
    restored,
  };
};

const activateTextEditing = async (client, elementId) => {
  await selectLayerById(client, elementId);

  let state = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = await evaluate(client, `(() => {
      window.dispatchEvent(new CustomEvent('backy-open-text-editor', { detail: { elementId: ${JSON.stringify(elementId)} } }));
      const node = document.querySelector('[data-element-id="${elementId}"]');
      const host = node?.querySelector('[data-backy-text-editor]');
      const editor = node?.querySelector('[contenteditable="true"], [role="textbox"]');
      return {
        selected: Boolean(node?.className?.toString?.().includes('ring-sky-500')),
        editable: node?.getAttribute('data-backy-text-editor-editable') === 'true' || host?.getAttribute('data-backy-text-editor-editable') === 'true',
        hasMoveHandle: Boolean(node?.querySelector('[data-role="canvas-move-handle"]')),
        hasEditor: editor instanceof HTMLElement,
        hostEditable: host?.getAttribute('data-backy-text-editor-editable') || '',
      };
    })()`);

    if (state?.editable && state.hasEditor) {
      return state;
    }
    await sleep(150);
  }

  assert(state?.editable && state.hasEditor, `Text editing did not activate for ${elementId}: ${JSON.stringify(state)}`);
  assert(state.hasMoveHandle, `Move handle missing while editing ${elementId}: ${JSON.stringify(state)}`);
  return state;
};

const testRichTextInlineMarkdownControls = async (client, elementId = 'smoke-heading') => {
  await activateTextEditing(client, elementId);

  const focused = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const editor = host?.querySelector('[contenteditable="true"], [role="textbox"]');
    if (!(editor instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-editor',
        hostText: host?.textContent || '',
        html: host?.innerHTML || '',
      };
    }
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return { ok: true, text: editor.textContent || '' };
  })()`);
  assert(focused?.ok, `Unable to focus rich text editor for ${elementId}: ${JSON.stringify(focused)}`);

  await typeText(client, ' **Inline bold** _Inline italic_ ~~Inline strike~~ `Inline code`');
  await sleep(750);

  const state = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const editor = host?.querySelector('[contenteditable="true"], [role="textbox"]');
    const leaves = Array.from(host?.querySelectorAll('[data-slate-string="true"]') || []);
    const marked = leaves.map((node) => {
      const element = node instanceof HTMLElement
        ? node.closest('[data-slate-leaf="true"]') || node
        : node.parentElement?.closest('[data-slate-leaf="true"]') || node.parentElement;
      const style = element ? window.getComputedStyle(element) : null;
      return {
        text: node.textContent || '',
        fontWeight: style?.fontWeight || '',
        fontStyle: style?.fontStyle || '',
        textDecoration: style?.textDecorationLine || '',
        fontFamily: style?.fontFamily || '',
        fontSize: style?.fontSize || '',
        color: style?.color || '',
        backgroundColor: style?.backgroundColor || '',
      };
    });
    return {
      text: editor?.textContent || host?.textContent || '',
      html: editor?.innerHTML || host?.innerHTML || '',
      marked,
    };
  })()`);

  assert(!state.text.includes('**'), `Inline bold markdown wrapper was not removed: ${JSON.stringify(state)}`);
  assert(!state.text.includes('~~'), `Inline strike markdown wrapper was not removed: ${JSON.stringify(state)}`);
  assert(!state.text.includes('`Inline code`'), `Inline code markdown wrapper was not removed: ${JSON.stringify(state)}`);
  assert(state.text.includes('Inline bold'), `Inline bold text missing: ${JSON.stringify(state)}`);
  assert(state.text.includes('Inline italic'), `Inline italic text missing: ${JSON.stringify(state)}`);
  assert(state.text.includes('Inline strike'), `Inline strike text missing: ${JSON.stringify(state)}`);
  assert(state.text.includes('Inline code'), `Inline code text missing: ${JSON.stringify(state)}`);

  const boldLeaf = state.marked.find((leaf) => leaf.text.includes('Inline bold'));
  const italicLeaf = state.marked.find((leaf) => leaf.text.includes('Inline italic'));
  const strikeLeaf = state.marked.find((leaf) => leaf.text.includes('Inline strike'));
  const codeLeaf = state.marked.find((leaf) => leaf.text.includes('Inline code'));
  assert(boldLeaf && Number.parseInt(boldLeaf.fontWeight, 10) >= 600, `Inline bold leaf was not visually bold: ${JSON.stringify(state)}`);
  assert(italicLeaf?.fontStyle === 'italic', `Inline italic leaf was not visually italic: ${JSON.stringify(state)}`);
  assert(strikeLeaf?.textDecoration.includes('line-through'), `Inline strike leaf was not visually struck: ${JSON.stringify(state)}`);
  assert(codeLeaf?.fontFamily.toLowerCase().includes('mono'), `Inline code leaf was not visually monospace: ${JSON.stringify(state)}`);

  return state;
};

const selectEditorTextRange = async (client, elementId, startNeedle, endNeedle) => {
  const state = await evaluate(client, `(() => {
    let helperResult = null;
    if (typeof window.__backySelectActiveEditorText === 'function') {
      helperResult = window.__backySelectActiveEditorText(${JSON.stringify(startNeedle)}, ${JSON.stringify(endNeedle)});
      if (helperResult?.ok) {
        return helperResult;
      }
    }

    const host = document.querySelector('[data-element-id="${elementId}"]');
    const editor = host?.querySelector('[contenteditable="true"], [role="textbox"]');
    if (!(editor instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-editor',
        helperResult,
        html: host?.innerHTML || '',
      };
    }

    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let next = walker.nextNode();
    while (next) {
      textNodes.push(next);
      next = walker.nextNode();
    }

    const fullText = textNodes.map((node) => node.textContent || '').join('');
    const startIndex = fullText.indexOf(${JSON.stringify(startNeedle)});
    const endIndex = fullText.indexOf(${JSON.stringify(endNeedle)}, Math.max(0, startIndex));
    if (startIndex < 0 || endIndex < 0) {
      return {
        ok: false,
        reason: 'missing-needle',
        fullText,
        startNeedle: ${JSON.stringify(startNeedle)},
        endNeedle: ${JSON.stringify(endNeedle)},
      };
    }

    const absoluteStart = startIndex;
    const absoluteEnd = endIndex + ${JSON.stringify(endNeedle)}.length;
    const resolvePoint = (targetOffset) => {
      let offset = 0;
      for (const node of textNodes) {
        const text = node.textContent || '';
        const nextOffset = offset + text.length;
        if (targetOffset <= nextOffset) {
          return {
            node,
            offset: Math.max(0, Math.min(text.length, targetOffset - offset)),
          };
        }
        offset = nextOffset;
      }

      const last = textNodes[textNodes.length - 1];
      return last ? { node: last, offset: (last.textContent || '').length } : null;
    };

    const start = resolvePoint(absoluteStart);
    const end = resolvePoint(absoluteEnd);
    if (!start || !end) {
      return {
        ok: false,
        reason: 'missing-range-point',
        fullText,
        textNodeCount: textNodes.length,
      };
    }

    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Shift' }));

    return {
      ok: true,
      fullText,
      selectedText: selection?.toString() || '',
      startIndex,
      absoluteEnd,
    };
  })()`);

  assert(state?.ok, `Unable to select editor text range ${startNeedle}..${endNeedle}: ${JSON.stringify(state)}`);
  await sleep(250);
  return state;
};

const readRichTextLeafState = async (client, elementId) => {
  return evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const editor = host?.querySelector('[contenteditable="true"], [role="textbox"]');
    const leaves = Array.from(host?.querySelectorAll('[data-slate-string="true"]') || []);
    const marked = leaves.map((node) => {
      const element = node instanceof HTMLElement
        ? node.closest('[data-slate-leaf="true"]') || node
        : node.parentElement?.closest('[data-slate-leaf="true"]') || node.parentElement;
      const style = element ? window.getComputedStyle(element) : null;
      return {
        text: node.textContent || '',
        fontWeight: style?.fontWeight || '',
        fontStyle: style?.fontStyle || '',
        textDecoration: style?.textDecorationLine || '',
        fontFamily: style?.fontFamily || '',
        fontSize: style?.fontSize || '',
        color: style?.color || '',
        backgroundColor: style?.backgroundColor || '',
      };
    });
    return {
      text: editor?.textContent || host?.textContent || '',
      html: editor?.innerHTML || host?.innerHTML || '',
      marked,
    };
  })()`);
};

const testRichTextSelectedRangeControls = async (client, elementId = 'smoke-heading') => {
  await activateTextEditing(client, elementId);

  const cleared = await evaluate(client, `(() => {
    if (typeof window.__backySetActiveEditorContent === 'function') {
      return window.__backySetActiveEditorContent([
        {
          type: 'p',
          children: [
            { text: 'Alpha line ', smokeSegment: 'alpha' },
            { text: 'Beta line', smokeSegment: 'beta' }
          ]
        }
      ]);
    }

    if (typeof window.__backyReplaceActiveEditorText === 'function') {
      return window.__backyReplaceActiveEditorText('Alpha line Beta line');
    }

    const host = document.querySelector('[data-element-id="${elementId}"]');
    const editor = host?.querySelector('[contenteditable="true"], [role="textbox"]');
    if (!(editor instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-editor',
        html: host?.innerHTML || '',
      };
    }

    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return { ok: true, text: editor.textContent || '' };
  })()`);
  assert(cleared?.ok, `Unable to select all rich text before clear: ${JSON.stringify(cleared)}`);
  if (!cleared.text.includes('Alpha line') || !cleared.text.includes('Beta line')) {
    await pressKey(client, 'Backspace');
    await typeText(client, 'Alpha line Beta line');
  }
  await sleep(500);
  await activateTextEditing(client, elementId);

  const selected = await selectEditorTextRange(client, elementId, 'Beta', 'Beta');
  assert(selected.selectedText === 'Beta', `Slate selected range did not select Beta: ${JSON.stringify(selected)}`);

  await mouseDownControlByTestId(client, 'rich-text-italic');
  await sleep(500);

  const state = await readRichTextLeafState(client, elementId);
  const betaLeaf = state.marked.find((leaf) => leaf.text.includes('Beta'));
  const unselectedLeaf = state.marked.find((leaf) => leaf.text.includes('Alpha line'));

  assert(betaLeaf?.fontStyle === 'italic', `Selected range was not italic: ${JSON.stringify(state)}`);
  assert(unselectedLeaf?.fontStyle !== 'italic', `Unselected leading range was unexpectedly italic: ${JSON.stringify(state)}`);

  await activateTextEditing(client, elementId);
  await selectEditorTextRange(client, elementId, 'Beta', 'Beta');
  await mouseDownControlByTestId(client, 'rich-text-clear-formatting');
  await sleep(500);

  const clearedState = await readRichTextLeafState(client, elementId);
  const clearedBetaLeaf = clearedState.marked.find((leaf) => leaf.text.includes('Beta'));
  assert(clearedBetaLeaf?.fontStyle !== 'italic', `Clear formatting did not clear selected range: ${JSON.stringify(clearedState)}`);

  await activateTextEditing(client, elementId);
  await selectEditorTextRange(client, elementId, 'Alpha', 'Alpha');
  await dispatchMouseDownByTestId(client, 'rich-text-font-size');
  await setFormControlByTestId(client, 'rich-text-font-size', '32');
  await sleep(500);

  const sizedState = await readRichTextLeafState(client, elementId);
  const sizedAlphaLeaf = sizedState.marked.find((leaf) => leaf.text.includes('Alpha'));
  const unsizedBetaLeaf = sizedState.marked.find((leaf) => leaf.text.includes('Beta'));
  assert(sizedAlphaLeaf?.fontSize === '32px', `Selected range font size was not applied: ${JSON.stringify(sizedState)}`);
  assert(unsizedBetaLeaf?.fontSize !== '32px', `Unselected range unexpectedly received font size: ${JSON.stringify(sizedState)}`);

  await selectEditorTextRange(client, elementId, 'Beta', 'Beta');
  await dispatchMouseDownByTestId(client, 'rich-text-font-family');
  await setFormControlByTestId(client, 'rich-text-font-family', 'Georgia, serif');
  await sleep(500);

  const fontFamilyState = await readRichTextLeafState(client, elementId);
  const familyBetaLeaf = fontFamilyState.marked.find((leaf) => leaf.text.includes('Beta'));
  const familyAlphaLeaf = fontFamilyState.marked.find((leaf) => leaf.text.includes('Alpha'));
  assert(familyBetaLeaf?.fontFamily.toLowerCase().includes('georgia'), `Selected range font family was not applied: ${JSON.stringify(fontFamilyState)}`);
  assert(!familyAlphaLeaf?.fontFamily.toLowerCase().includes('georgia'), `Unselected range unexpectedly received font family: ${JSON.stringify(fontFamilyState)}`);

  await selectEditorTextRange(client, elementId, 'Beta', 'Beta');
  await mouseDownControlByTestId(client, 'rich-text-underline');
  await sleep(500);

  const underlineState = await readRichTextLeafState(client, elementId);
  const underlineBetaLeaf = underlineState.marked.find((leaf) => leaf.text.includes('Beta'));
  const underlineAlphaLeaf = underlineState.marked.find((leaf) => leaf.text.includes('Alpha'));
  assert(underlineBetaLeaf?.textDecoration.includes('underline'), `Selected range underline was not applied: ${JSON.stringify(underlineState)}`);
  assert(!underlineAlphaLeaf?.textDecoration.includes('underline'), `Unselected range unexpectedly received underline: ${JSON.stringify(underlineState)}`);

  await selectEditorTextRange(client, elementId, 'Alpha', 'Alpha');
  await mouseDownControlByTestId(client, 'rich-text-strikethrough');
  await sleep(500);

  const strikethroughState = await readRichTextLeafState(client, elementId);
  const strikeAlphaLeaf = strikethroughState.marked.find((leaf) => leaf.text.includes('Alpha'));
  const strikeBetaLeaf = strikethroughState.marked.find((leaf) => leaf.text.includes('Beta'));
  assert(strikeAlphaLeaf?.textDecoration.includes('line-through'), `Selected range strikethrough was not applied: ${JSON.stringify(strikethroughState)}`);
  assert(!strikeBetaLeaf?.textDecoration.includes('line-through'), `Unselected range unexpectedly received strikethrough: ${JSON.stringify(strikethroughState)}`);

  await selectEditorTextRange(client, elementId, 'Alpha', 'Alpha');
  await selectColorPickerValue(client, 'rich-text-text-color', '#ff0000');
  await sleep(500);

  const colorState = await readRichTextLeafState(client, elementId);
  const colorAlphaLeaf = colorState.marked.find((leaf) => leaf.text.includes('Alpha'));
  const colorBetaLeaf = colorState.marked.find((leaf) => leaf.text.includes('Beta'));
  assert(colorAlphaLeaf?.color === 'rgb(255, 0, 0)', `Selected range text color was not applied: ${JSON.stringify(colorState)}`);
  assert(colorBetaLeaf?.color !== 'rgb(255, 0, 0)', `Unselected range unexpectedly received text color: ${JSON.stringify(colorState)}`);

  return {
    selected,
    afterItalic: state,
    afterClear: clearedState,
    afterFontSize: sizedState,
    afterFontFamily: fontFamilyState,
    afterUnderline: underlineState,
    afterStrikethrough: strikethroughState,
    afterColor: colorState,
  };
};

const testRichTextBlockquoteAndTableControls = async (client, elementId = 'smoke-heading') => {
  await activateTextEditing(client, elementId);

  const seeded = await evaluate(client, `(() => {
    if (typeof window.__backySetActiveEditorContent !== 'function') {
      return { ok: false, reason: 'missing-set-content-helper' };
    }

    return window.__backySetActiveEditorContent([
      { type: 'p', children: [{ text: 'First block' }] },
      { type: 'p', children: [{ text: 'Second block' }] }
    ]);
  })()`);

  assert(seeded?.ok, `Unable to seed multi-block rich text content: ${JSON.stringify(seeded)}`);

  const selected = await selectEditorTextRange(client, elementId, 'First block', 'Second block');
  assert(selected.selectedText.includes('First block') && selected.selectedText.includes('Second block'), `Multi-block selection did not span both blocks: ${JSON.stringify(selected)}`);

  await mouseDownControlByTestId(client, 'rich-text-blockquote');
  await sleep(500);

  const blockquoteState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const blockquotes = Array.from(host?.querySelectorAll('blockquote') || []);
    return {
      text: host?.textContent || '',
      blockquoteCount: blockquotes.length,
      blockquoteTexts: blockquotes.map((node) => node.textContent || ''),
      html: host?.innerHTML || '',
    };
  })()`);

  assert(
    blockquoteState.blockquoteCount >= 2 &&
      blockquoteState.blockquoteTexts.some((text) => text.includes('First block')) &&
      blockquoteState.blockquoteTexts.some((text) => text.includes('Second block')),
    `Blockquote control did not convert both selected blocks: ${JSON.stringify(blockquoteState)}`,
  );

  const collapsed = await evaluate(client, `(() => {
    if (typeof window.__backyCollapseActiveEditorToEnd !== 'function') {
      return { ok: false, reason: 'missing-collapse-helper' };
    }

    return window.__backyCollapseActiveEditorToEnd();
  })()`);
  assert(collapsed?.ok, `Unable to collapse rich text selection before table insert: ${JSON.stringify(collapsed)}`);

  await mouseDownControlByTestId(client, 'rich-text-insert-table');
  const directInsert = await evaluate(client, `(() => {
    if (document.querySelector('[data-element-id="${elementId}"] table')) {
      return { ok: true, skipped: true, reason: 'table-already-inserted' };
    }

    if (typeof window.__backyInsertActiveEditorTable !== 'function') {
      return { ok: false, reason: 'missing-insert-table-helper' };
    }

    return window.__backyInsertActiveEditorTable();
  })()`);
  assert(directInsert?.ok, `Direct active-editor table insert failed after toolbar click: ${JSON.stringify(directInsert)}`);
  await sleep(500);

  const tableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const table = host?.querySelector('table');
    const cells = Array.from(host?.querySelectorAll('td, th') || []);
    return {
      text: host?.textContent || '',
      tableCount: host?.querySelectorAll('table').length || 0,
      rowCount: host?.querySelectorAll('tr').length || 0,
      cellCount: cells.length,
      cellTexts: cells.map((node) => node.textContent || ''),
      tableBorderCollapse: table ? window.getComputedStyle(table).borderCollapse : '',
      html: host?.innerHTML || '',
    };
  })()`);

  assert(tableState.tableCount >= 1, `Table control did not insert a table: ${JSON.stringify(tableState)}`);
  assert(tableState.rowCount >= 2 && tableState.cellCount >= 4, `Inserted table structure is incomplete: ${JSON.stringify(tableState)}`);
  assert(tableState.cellTexts.includes('Column 1') && tableState.cellTexts.includes('Value 2'), `Inserted table cell defaults missing: ${JSON.stringify(tableState)}`);
  assert(tableState.tableBorderCollapse === 'collapse', `Inserted table did not use stable table styling: ${JSON.stringify(tableState)}`);

  await mouseDownControlByTestId(client, 'rich-text-table-add-row');
  await sleep(250);
  await mouseDownControlByTestId(client, 'rich-text-table-add-column');
  await sleep(500);

  const editedTableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const rows = Array.from(host?.querySelectorAll('tr') || []);
    const cells = Array.from(host?.querySelectorAll('td, th') || []);
    return {
      text: host?.textContent || '',
      rowCount: rows.length,
      cellCount: cells.length,
      cellsPerRow: rows.map((row) => row.querySelectorAll('td, th').length),
      cellTexts: cells.map((node) => node.textContent || ''),
      html: host?.innerHTML || '',
    };
  })()`);

  assert(
    editedTableState.rowCount >= 3 &&
      editedTableState.cellCount >= 9 &&
      editedTableState.cellsPerRow.every((count) => count >= 3),
    `Table row/column controls did not expand the table: ${JSON.stringify(editedTableState)}`,
  );
  assert(
    editedTableState.cellTexts.includes('Column 1') && editedTableState.cellTexts.includes('Value 2'),
    `Table row/column controls lost existing cell content: ${JSON.stringify(editedTableState)}`,
  );

  await mouseDownControlByTestId(client, 'rich-text-table-remove-row');
  await sleep(250);
  await mouseDownControlByTestId(client, 'rich-text-table-remove-column');
  await sleep(500);

  const trimmedTableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const rows = Array.from(host?.querySelectorAll('tr') || []);
    const cells = Array.from(host?.querySelectorAll('td, th') || []);
    return {
      text: host?.textContent || '',
      rowCount: rows.length,
      cellCount: cells.length,
      cellsPerRow: rows.map((row) => row.querySelectorAll('td, th').length),
      cellTexts: cells.map((node) => node.textContent || ''),
      html: host?.innerHTML || '',
    };
  })()`);

  assert(
    trimmedTableState.rowCount === 2 &&
      trimmedTableState.cellCount === 4 &&
      trimmedTableState.cellsPerRow.every((count) => count === 2),
    `Table row/column remove controls did not shrink the table safely: ${JSON.stringify(trimmedTableState)}`,
  );
  assert(
    trimmedTableState.cellTexts.includes('Column 1') &&
      trimmedTableState.cellTexts.includes('Column 2') &&
      trimmedTableState.cellTexts.includes('Value 1') &&
      trimmedTableState.cellTexts.includes('Value 2'),
    `Table row/column remove controls lost original cell content: ${JSON.stringify(trimmedTableState)}`,
  );

  await activateTextEditing(client, elementId);
  const selectedHeaderCell = await evaluate(client, `(() => {
    if (typeof window.__backySelectActiveEditorTableCell !== 'function') {
      return { ok: false, reason: 'missing-active-editor-table-cell-helper' };
    }

    return window.__backySelectActiveEditorTableCell('Column 1');
  })()`);
  assert(selectedHeaderCell?.ok, `Unable to select first table cell before header-row toggle: ${JSON.stringify(selectedHeaderCell)}`);

  await mouseDownControlByTestId(client, 'rich-text-table-toggle-header-row');
  await sleep(500);

  const headerSlateState = await evaluate(client, `(() => {
    if (typeof window.__backyReadActiveEditorTableState !== 'function') {
      return { ok: false, reason: 'missing-table-state-helper' };
    }

    return window.__backyReadActiveEditorTableState();
  })()`);

  const headerTableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const rows = Array.from(host?.querySelectorAll('tr') || []);
    const firstRow = rows[0];
    const firstRowHeaders = Array.from(firstRow?.querySelectorAll('th') || []);
    const bodyCells = Array.from(host?.querySelectorAll('td') || []);
    return {
      text: host?.textContent || '',
      rowCount: rows.length,
      firstRowHeaderCount: firstRowHeaders.length,
      bodyCellCount: bodyCells.length,
      firstRowHeaderTexts: firstRowHeaders.map((node) => node.textContent || ''),
      slateState: ${JSON.stringify(null)},
      html: host?.innerHTML || '',
    };
  })()`);
  headerTableState.slateState = headerSlateState;

  assert(
    headerTableState.rowCount === 2 &&
      headerTableState.firstRowHeaderCount === 2 &&
      headerTableState.bodyCellCount === 2,
    `Table header-row toggle did not produce semantic header cells: ${JSON.stringify(headerTableState)}`,
  );
  assert(
    headerTableState.firstRowHeaderTexts.includes('Column 1') &&
      headerTableState.firstRowHeaderTexts.includes('Column 2'),
    `Table header-row toggle lost header text: ${JSON.stringify(headerTableState)}`,
  );

  await mouseDownControlByTestId(client, 'rich-text-table-remove');
  await sleep(500);

  const deletedTableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    return {
      text: host?.textContent || '',
      tableCount: host?.querySelectorAll('table').length || 0,
      blockquoteCount: host?.querySelectorAll('blockquote').length || 0,
      html: host?.innerHTML || '',
    };
  })()`);
  assert(
    deletedTableState.tableCount === 0 &&
      deletedTableState.blockquoteCount === 2 &&
      !deletedTableState.text.includes('Column 1'),
    `Table remove control did not remove only the active table: ${JSON.stringify(deletedTableState)}`,
  );

  const restoredCollapse = await evaluate(client, `(() => {
    if (typeof window.__backyCollapseActiveEditorToEnd !== 'function') {
      return { ok: false, reason: 'missing-collapse-helper' };
    }

    return window.__backyCollapseActiveEditorToEnd();
  })()`);
  assert(restoredCollapse?.ok, `Unable to collapse rich text selection before table restore: ${JSON.stringify(restoredCollapse)}`);

  await mouseDownControlByTestId(client, 'rich-text-insert-table');
  await sleep(500);
  const restoredDirectInsert = await evaluate(client, `(() => {
    if (document.querySelector('[data-element-id="${elementId}"] table')) {
      return { ok: true, skipped: true, reason: 'table-already-inserted' };
    }

    if (typeof window.__backyInsertActiveEditorTable !== 'function') {
      return { ok: false, reason: 'missing-insert-table-helper' };
    }

    return window.__backyInsertActiveEditorTable();
  })()`);
  assert(restoredDirectInsert?.ok, `Direct active-editor table restore failed after table removal: ${JSON.stringify(restoredDirectInsert)}`);

  const restoredHeaderCell = await evaluate(client, `(() => {
    if (typeof window.__backySelectActiveEditorTableCell !== 'function') {
      return { ok: false, reason: 'missing-active-editor-table-cell-helper' };
    }

    return window.__backySelectActiveEditorTableCell('Column 1');
  })()`);
  assert(restoredHeaderCell?.ok, `Unable to select restored table cell before header-row toggle: ${JSON.stringify(restoredHeaderCell)}`);

  await mouseDownControlByTestId(client, 'rich-text-table-toggle-header-row');
  await sleep(500);

  const restoredHeaderTableState = await evaluate(client, `(() => {
    const host = document.querySelector('[data-element-id="${elementId}"]');
    const rows = Array.from(host?.querySelectorAll('tr') || []);
    const firstRowHeaders = Array.from(rows[0]?.querySelectorAll('th') || []);
    return {
      tableCount: host?.querySelectorAll('table').length || 0,
      rowCount: rows.length,
      firstRowHeaderCount: firstRowHeaders.length,
      firstRowHeaderTexts: firstRowHeaders.map((node) => node.textContent || ''),
      html: host?.innerHTML || '',
    };
  })()`);
  assert(
    restoredHeaderTableState.tableCount === 1 &&
      restoredHeaderTableState.rowCount === 2 &&
      restoredHeaderTableState.firstRowHeaderCount === 2,
    `Restored table header-row state is incomplete before save: ${JSON.stringify(restoredHeaderTableState)}`,
  );

  return {
    seeded,
    selected,
    blockquoteState,
    collapsed,
    directInsert,
    tableState,
    editedTableState,
    trimmedTableState,
    selectedHeaderCell,
    headerTableState,
    deletedTableState,
    restoredDirectInsert,
    restoredHeaderCell,
    restoredHeaderTableState,
  };
};

const assertPersistedSelectedRichTextMarks = async (pageId, elementId = 'smoke-heading') => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const element = findCanvasElement(payload.data?.page?.content?.elements || [], elementId);
  assert(element, `Persisted rich text element ${elementId} was not found`);

  const leaves = collectSlateLeaves(element.props?.content);
  const alphaLeaf = leaves.find((leaf) => typeof leaf.text === 'string' && leaf.text.includes('Alpha'));
  const betaLeaf = leaves.find((leaf) => typeof leaf.text === 'string' && leaf.text.includes('Beta'));
  assert(alphaLeaf, `Persisted Alpha rich text leaf missing: ${JSON.stringify(leaves)}`);
  assert(betaLeaf, `Persisted Beta rich text leaf missing: ${JSON.stringify(leaves)}`);
  assert(alphaLeaf.fontSize === '32px', `Persisted selected font size missing from Alpha leaf: ${JSON.stringify(leaves)}`);
  assert(alphaLeaf.color === '#ff0000', `Persisted selected color missing from Alpha leaf: ${JSON.stringify(leaves)}`);
  assert(alphaLeaf.strikethrough === true, `Persisted selected strikethrough missing from Alpha leaf: ${JSON.stringify(leaves)}`);
  assert(betaLeaf.fontFamily === 'Georgia, serif', `Persisted selected font family missing from Beta leaf: ${JSON.stringify(leaves)}`);
  assert(betaLeaf.underline === true, `Persisted selected underline missing from Beta leaf: ${JSON.stringify(leaves)}`);
  assert(!alphaLeaf.fontFamily, `Unselected Alpha leaf unexpectedly received Beta font family: ${JSON.stringify(leaves)}`);
  assert(betaLeaf.color !== '#ff0000', `Unselected Beta leaf unexpectedly received Alpha color: ${JSON.stringify(leaves)}`);
  assert(betaLeaf.strikethrough !== true, `Unselected Beta leaf unexpectedly received Alpha strikethrough: ${JSON.stringify(leaves)}`);

  return {
    alphaLeaf,
    betaLeaf,
  };
};

const assertPersistedRichTextBlocks = async (pageId, elementId = 'smoke-heading') => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const element = findCanvasElement(payload.data?.page?.content?.elements || [], elementId);
  assert(element, `Persisted rich text element ${elementId} was not found`);

  const content = element.props?.content;
  const types = collectSlateTypes(content);
  const leaves = collectSlateLeaves(content);
  const blockquoteCount = types.filter((type) => type === 'blockquote').length;
  const tableCount = types.filter((type) => type === 'table').length;
  const rowCount = types.filter((type) => type === 'tr').length;
  const cellCount = types.filter((type) => type === 'td' || type === 'th').length;
  const headerCellCount = types.filter((type) => type === 'th').length;
  const text = leaves.map((leaf) => leaf.text || '').join(' ');

  assert(blockquoteCount >= 2, `Persisted multi-block blockquote nodes missing: ${JSON.stringify({ types, content })}`);
  assert(tableCount >= 1 && rowCount === 2 && cellCount === 4, `Persisted table structure missing: ${JSON.stringify({ types, content })}`);
  assert(headerCellCount === 2, `Persisted table header-row cells missing: ${JSON.stringify({ types, content })}`);
  assert(text.includes('First block') && text.includes('Second block'), `Persisted blockquote text missing: ${JSON.stringify(leaves)}`);
  assert(text.includes('Column 1') && text.includes('Value 2'), `Persisted table text missing: ${JSON.stringify(leaves)}`);

  return {
    blockquoteCount,
    tableCount,
    rowCount,
    cellCount,
    headerCellCount,
    text,
  };
};

const selectColorPickerValue = async (client, testId, color) => {
  await mouseDownControlByTestId(client, testId);
  await sleep(150);

  const selected = await evaluate(client, `(() => {
    const swatch = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === ${JSON.stringify(color)});
    if (!(swatch instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-swatch',
        color: ${JSON.stringify(color)},
        openPopoverText: document.body.textContent?.slice(-1000) || '',
      };
    }

    swatch.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      view: window,
    }));
    return { ok: true, color: ${JSON.stringify(color)} };
  })()`);

  assert(selected?.ok, `Unable to select ${color} from ${testId}: ${JSON.stringify(selected)}`);
  await sleep(350);
  return selected;
};

const clickSave = async (client) => {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const candidates = Array.from(document.querySelectorAll('button'));
      const button = candidates.find((candidate) => candidate.getAttribute('data-testid') === 'editor-save-page') ||
        candidates.find((candidate) => (candidate.textContent || '').trim() === 'Save');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'missing' };
      }
      button.scrollIntoView({ block: 'center', inline: 'center' });

      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        x >= 0 &&
        y >= 0 &&
        x <= window.innerWidth &&
        y <= window.innerHeight &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        hit instanceof Element &&
        hit.closest('button') === button;

      return {
        ok: visible && !button.disabled,
        reason: button.disabled ? 'disabled' : visible ? '' : 'not-visible',
        text: (button.textContent || '').trim(),
        saveState: document.querySelector('[data-testid="editor-save-status"]')?.getAttribute('data-save-state') || '',
      };
    })()`);

    if (lastState?.ok) {
      const clicked = await evaluate(client, `(() => {
        const candidates = Array.from(document.querySelectorAll('button'));
        const button = candidates.find((candidate) => candidate.getAttribute('data-testid') === 'editor-save-page') ||
          candidates.find((candidate) => (candidate.textContent || '').trim() === 'Save');
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.click();
        return true;
      })()`);
      assert(clicked, `Unable to click Save button: ${JSON.stringify(lastState)}`);
      await sleep(250);
      return;
    }

    await sleep(150);
  }

  throw new Error(`Unable to click enabled Save button: ${JSON.stringify(lastState)}`);
};

const readEditorSaveStatus = async (client) => {
  const status = await evaluate(client, `(() => {
    const node = document.querySelector('[data-testid="editor-save-status"]');
    return {
      exists: Boolean(node),
      text: node?.textContent || '',
      title: node?.getAttribute('title') || '',
      saveState: node?.getAttribute('data-save-state') || '',
      saveMode: node?.getAttribute('data-save-mode') || '',
      pendingChanges: Number(node?.getAttribute('data-pending-changes') || 0),
      lastSavedAt: node?.getAttribute('data-last-saved-at') || '',
      lastError: node?.getAttribute('data-last-error') || '',
    };
  })()`);

  assert(status.exists, `Editor save status is missing: ${JSON.stringify(status)}`);
  return status;
};

const waitForEditorSaveStatus = async (client, predicate, label = 'editor save status') => {
  let lastStatus = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    lastStatus = await readEditorSaveStatus(client);
    if (predicate(lastStatus)) {
      return lastStatus;
    }
    await sleep(100);
  }

  throw new Error(`${label}: status did not match expectation: ${JSON.stringify(lastStatus)}`);
};

const expectPageSaveConflict = async (client, pageId) => {
  const beforePayload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const beforePage = beforePayload.data?.page;
  const beforeHeading = findCanvasElement(beforePage?.content?.elements || [], 'smoke-heading');
  assert(beforePage?.updatedAt, `Conflict smoke page is missing updatedAt: ${JSON.stringify(beforePage).slice(0, 500)}`);
  assert(beforeHeading, 'Conflict smoke page is missing smoke-heading before stale save');

  const externalTitle = `Externally changed ${Date.now().toString(36)}`;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: externalTitle,
      revisionNote: 'External conflict smoke update',
      updatedBy: 'conflict-smoke',
    }),
  });

  await selectElement(client, 'smoke-heading');
  await pressKey(client, 'ArrowRight');
  await clickSave(client);

  const conflictStatus = await waitForEditorSaveStatus(
    client,
    (status) => status.saveState === 'error' && /changed since/i.test(`${status.lastError} ${status.title}`),
    'stale editor save conflict status',
  );

  const conflictBanner = await evaluate(client, `(() => {
    const banner = document.querySelector('[data-testid="page-editor-save-conflict"]');
    const reload = document.querySelector('[data-testid="page-editor-conflict-reload"]');
    return {
      exists: Boolean(banner),
      text: banner?.textContent || '',
      hasReload: reload instanceof HTMLButtonElement && !reload.disabled,
    };
  })()`);
  assert(
    conflictBanner.exists &&
      /Save conflict detected/.test(conflictBanner.text) &&
      /updated after this editor loaded/.test(conflictBanner.text) &&
      conflictBanner.hasReload,
    `Conflict banner did not render the reload action: ${JSON.stringify(conflictBanner)}`,
  );

  const afterPayload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const afterPage = afterPayload.data?.page;
  const afterHeading = findCanvasElement(afterPage?.content?.elements || [], 'smoke-heading');
  assert(afterPage?.title === externalTitle, `Stale editor save overwrote the external title: ${JSON.stringify(afterPage).slice(0, 500)}`);
  assert(afterHeading?.x === beforeHeading.x, `Stale editor save persisted local canvas movement despite conflict: before ${beforeHeading.x}, after ${afterHeading?.x}`);

  const reloadClicked = await evaluate(client, `(() => {
    const reload = document.querySelector('[data-testid="page-editor-conflict-reload"]');
    if (!(reload instanceof HTMLButtonElement) || reload.disabled) return false;
    reload.click();
    return true;
  })()`);
  assert(reloadClicked, `Unable to click conflict reload action: ${JSON.stringify(conflictBanner)}`);

  let reloadState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    reloadState = await evaluate(client, `(() => ({
      hasConflict: Boolean(document.querySelector('[data-testid="page-editor-save-conflict"]')),
      hasHeading: Boolean(document.querySelector('[data-element-id="smoke-heading"]')),
      notice: document.body.textContent || '',
    }))()`);
    if (!reloadState.hasConflict && reloadState.hasHeading && /Latest backend page loaded/.test(reloadState.notice)) {
      break;
    }
    await sleep(250);
  }
  assert(
    reloadState && !reloadState.hasConflict && reloadState.hasHeading,
    `Conflict reload did not restore the latest page cleanly: ${JSON.stringify(reloadState)}`,
  );

  return {
    expectedUpdatedAt: beforePage.updatedAt,
    externalTitle,
    conflictStatus,
    conflictBanner,
    persistedHeadingX: afterHeading?.x,
    reloaded: reloadState,
  };
};

const waitForEditorMutationReady = async (client, label = 'editor mutation readiness') => {
  let lastState = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="editor-save-status"]');
      const saveButton = document.querySelector('[data-testid="editor-save-page"]') || Array.from(document.querySelectorAll('button')).find((candidate) => {
        const label = (candidate.textContent || '').trim();
        return label === 'Save' || label === 'Saving...';
      });
      return {
        statusText: status?.textContent || '',
        statusTitle: status?.getAttribute('title') || '',
        saveState: status?.getAttribute('data-save-state') || '',
        saveMode: status?.getAttribute('data-save-mode') || '',
        pendingChanges: Number(status?.getAttribute('data-pending-changes') || 0),
        lastSavedAt: status?.getAttribute('data-last-saved-at') || '',
        lastError: status?.getAttribute('data-last-error') || '',
        saveDisabled: saveButton instanceof HTMLButtonElement ? saveButton.disabled : null,
      };
    })()`);

    if (!/Saving|Writing to backend/i.test(lastState.statusText) && lastState.saveDisabled !== true) {
      return lastState;
    }

    await sleep(250);
  }

  throw new Error(`${label}: editor stayed busy too long: ${JSON.stringify(lastState)}`);
};

const waitForPersistedCanvasState = async (pageId, expectedState) => {
  let lastState = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const elements = payload.data?.page?.content?.elements || [];
    const persistedState = {};

    for (const [elementId, expected] of Object.entries(expectedState)) {
      const element = findCanvasElement(elements, elementId);
      persistedState[elementId] = element
        ? {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          }
        : null;

      if (!element) {
        break;
      }

      const matches =
        Math.abs(element.x - expected.x) <= 1 &&
        Math.abs(element.y - expected.y) <= 1 &&
        Math.abs(element.width - expected.width) <= 1 &&
        Math.abs(element.height - expected.height) <= 1;

      if (!matches) {
        break;
      }
    }

    lastState = persistedState;

    const complete = Object.entries(expectedState).every(([elementId, expected]) => {
      const persisted = persistedState[elementId];
      return persisted &&
        Math.abs(persisted.x - expected.x) <= 1 &&
        Math.abs(persisted.y - expected.y) <= 1 &&
        Math.abs(persisted.width - expected.width) <= 1 &&
        Math.abs(persisted.height - expected.height) <= 1;
    });

    if (complete) {
      return persistedState;
    }

    await sleep(250);
  }

  throw new Error(`Saved canvas state did not match editor state. Expected ${JSON.stringify(expectedState)}, got ${JSON.stringify(lastState)}`);
};

const testSaveEditingControls = async (client, pageId, editorPath) => {
  const elementId = 'smoke-top-edge';

  await waitForElementPresence(client, elementId, true, 'before save smoke');
  const initialStatus = await waitForEditorSaveStatus(
    client,
    (status) => status.saveState === 'saved' && status.pendingChanges === 0,
    'initial saved status before save smoke',
  );
  assert(
    Boolean(initialStatus.lastSavedAt) || initialStatus.saveMode === '',
    `Initial save status did not settle before save smoke: ${JSON.stringify(initialStatus)}`,
  );

  await waitForEditorMutationReady(client, 'before toolbar save smoke');
  await clickSave(client);
  const toolbarSavedStatus = await waitForEditorSaveStatus(
    client,
    (status) => (
      status.saveState === 'saved' &&
      status.saveMode === 'manual' &&
      status.pendingChanges === 0 &&
      Boolean(status.lastSavedAt)
    ),
    'manual status after toolbar save smoke',
  );
  assert(
    toolbarSavedStatus.saveState === 'saved' &&
      toolbarSavedStatus.saveMode === 'manual' &&
      toolbarSavedStatus.pendingChanges === 0 &&
      Boolean(toolbarSavedStatus.lastSavedAt),
    `Toolbar save did not expose manual saved metadata: ${JSON.stringify(toolbarSavedStatus)}`,
  );

  const beforeShortcutSave = await readEditorElementState(client, [elementId]);
  const shortcutDrag = await dragElement(client, elementId, 30, 20);
  const afterShortcutNudge = await readEditorElementState(client, [elementId]);
  assert(
    afterShortcutNudge[elementId].x !== beforeShortcutSave[elementId].x ||
      afterShortcutNudge[elementId].y !== beforeShortcutSave[elementId].y,
    `Save smoke shortcut drag did not move ${elementId}: ${JSON.stringify({ beforeShortcutSave, afterShortcutNudge, shortcutDrag })}`,
  );
  await blurActiveElement(client);
  await pressKey(client, 's', { ctrlKey: true });
  const shortcutSavedStatus = await waitForEditorSaveStatus(
    client,
    (status) => (
      status.saveState === 'saved' &&
      status.saveMode === 'manual' &&
      status.pendingChanges === 0 &&
      Boolean(status.lastSavedAt)
    ),
    'manual status after keyboard save smoke',
  );
  assert(
    shortcutSavedStatus.saveState === 'saved' &&
      shortcutSavedStatus.saveMode === 'manual' &&
      shortcutSavedStatus.pendingChanges === 0 &&
      Boolean(shortcutSavedStatus.lastSavedAt),
    `Ctrl/Cmd+S save did not expose manual saved metadata: ${JSON.stringify(shortcutSavedStatus)}`,
  );
  const persistedAfterShortcut = await waitForPersistedCanvasState(pageId, afterShortcutNudge);

  let reloadClient = null;
  let reloadedState = null;
  try {
    reloadClient = await openAuthenticatedEditorTab(client, `${ADMIN_BASE_URL}${editorPath}`);
    await waitForEditorElements(reloadClient, [elementId]);
    reloadedState = await readEditorElementState(reloadClient, [elementId]);
    assertElementState(reloadedState, afterShortcutNudge, 'save smoke reload');
  } finally {
    if (reloadClient) {
      try {
        await reloadClient.send('Page.close');
      } catch {
        // Chrome may already be closing during cleanup.
      }
      reloadClient.close();
    }
  }

  return {
    elementId,
    initialStatus,
    toolbarSavedStatus,
    beforeShortcutSave: beforeShortcutSave[elementId],
    shortcutDrag,
    afterShortcutNudge: afterShortcutNudge[elementId],
    shortcutSavedStatus,
    persistedAfterShortcut,
    reloadedState,
  };
};

const testKeyboardShortcutControls = async (client, pageId) => {
  const shiftNudge = await testKeyboardNudge(client, 'smoke-image');
  const undoRedo = await testUndoRedoAfterKeyboardNudge(client, 'smoke-top-edge');
  const escapeDeselect = await testEscapeDeselectShortcut(client, 'smoke-icon');
  const siblingScopeSelection = await testSiblingScopeSelectionShortcut(client, ['smoke-heading', 'smoke-image']);
  const grouping = await testLayerGrouping(client, ['smoke-heading', 'smoke-image']);
  const clipboard = await testClipboardEditingControls(client, 'smoke-heading');
  const shortcutGuards = await testEditorShortcutGuards(client, 'smoke-heading');

  const saveElementId = 'smoke-map';
  await waitForEditorMutationReady(client, 'before keyboard shortcuts save');
  const beforeShortcutSave = await readEditorElementState(client, [saveElementId]);
  await selectLayerById(client, saveElementId);
  await blurActiveElement(client);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  const afterShortcutSave = await readEditorElementState(client, [saveElementId]);
  assert(
    afterShortcutSave[saveElementId].x === beforeShortcutSave[saveElementId].x + 10 &&
      afterShortcutSave[saveElementId].y === beforeShortcutSave[saveElementId].y,
    `Keyboard shortcuts save nudge did not move ${saveElementId}: ${JSON.stringify({ beforeShortcutSave, afterShortcutSave })}`,
  );

  await blurActiveElement(client);
  await pressKey(client, 's', { ctrlKey: true });
  const shortcutSavedStatus = await waitForEditorSaveStatus(
    client,
    (status) => (
      status.saveState === 'saved' &&
      status.saveMode === 'manual' &&
      status.pendingChanges === 0 &&
      Boolean(status.lastSavedAt)
    ),
    'manual status after keyboard shortcuts save',
  );
  const persistedAfterShortcutSave = await waitForPersistedCanvasState(pageId, afterShortcutSave);

  return {
    shiftNudge,
    undoRedo,
    escapeDeselect,
    siblingScopeSelection,
    grouping,
    clipboard,
    shortcutGuards,
    shortcutSave: {
      elementId: saveElementId,
      before: beforeShortcutSave[saveElementId],
      after: afterShortcutSave[saveElementId],
      status: shortcutSavedStatus,
      persisted: persistedAfterShortcutSave[saveElementId],
    },
  };
};

const readZoomControlState = async (client, label) => {
  const state = await evaluate(client, `(() => {
    const controls = document.querySelector('[data-testid="editor-zoom-controls"]');
    const surface = document.querySelector('[data-testid="editor-canvas-scale-surface"]');
    const canvas = document.querySelector('[data-testid="editor-canvas"]');
    const percent = document.querySelector('[data-testid="editor-zoom-percent"]');
    const auto = document.querySelector('[data-testid="editor-zoom-autofit"]');
    const style = surface instanceof HTMLElement ? window.getComputedStyle(surface) : null;
    const canvasStyle = canvas instanceof HTMLElement ? window.getComputedStyle(canvas) : null;
    const canvasRect = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
    const cssCanvasWidth = Number.parseFloat(canvasStyle?.width || '0');
    const visualScale = cssCanvasWidth > 0 && canvasRect ? Number((canvasRect.width / cssCanvasWidth).toFixed(3)) : 0;
    return {
      label: ${JSON.stringify(label)},
      hasControls: Boolean(controls),
      percentText: percent?.textContent || '',
      scale: Number(surface?.getAttribute('data-canvas-scale') || 0),
      controlScale: Number(controls?.getAttribute('data-canvas-scale') || 0),
      controlPercent: Number(controls?.getAttribute('data-zoom-percent') || 0),
      transform: style?.transform || '',
      autoFit: controls?.getAttribute('data-auto-fit') === 'true',
      hasAutoBadge: Boolean(auto),
      visualScale,
    };
  })()`);

  assert(state.hasControls, `Zoom controls are missing during ${label}: ${JSON.stringify(state)}`);
  assert(Number.isFinite(state.scale) && state.scale > 0, `Zoom scale is invalid during ${label}: ${JSON.stringify(state)}`);
  assert(Math.abs(state.controlScale - state.scale) < 0.001, `Zoom control scale does not match canvas surface during ${label}: ${JSON.stringify(state)}`);
  assert(state.controlPercent === Math.round(state.scale * 100), `Zoom control percent does not match scale during ${label}: ${JSON.stringify(state)}`);
  assert(state.percentText === `${Math.round(state.scale * 100)}%`, `Zoom percent does not match scale during ${label}: ${JSON.stringify(state)}`);
  assert(Math.abs(state.visualScale - state.scale) < 0.03, `Zoom visual scale does not match canvas scale during ${label}: ${JSON.stringify(state)}`);
  return state;
};

const readCanvasNavigationState = async (client, label) => {
  const state = await evaluate(client, `(() => {
    const viewport = document.querySelector('[data-testid="editor-canvas-viewport"]');
    const horizontalRuler = document.querySelector('[data-testid="editor-canvas-ruler-horizontal"]');
    const verticalRuler = document.querySelector('[data-testid="editor-canvas-ruler-vertical"]');
    const horizontalTicks = Array.from(document.querySelectorAll('[data-ruler-tick="horizontal"]')).map((tick) => ({
      value: Number(tick.getAttribute('data-ruler-tick-value') || 0),
      major: tick.getAttribute('data-ruler-tick-major') === 'true',
    }));
    const verticalTicks = Array.from(document.querySelectorAll('[data-ruler-tick="vertical"]')).map((tick) => ({
      value: Number(tick.getAttribute('data-ruler-tick-value') || 0),
      major: tick.getAttribute('data-ruler-tick-major') === 'true',
    }));

    return {
      label: ${JSON.stringify(label)},
      hasViewport: Boolean(viewport),
      panMode: viewport?.getAttribute('data-pan-mode') === 'true',
      panActive: viewport?.getAttribute('data-pan-active') === 'true',
      spacePanActive: viewport?.getAttribute('data-space-pan-active') === 'true',
      panning: viewport?.getAttribute('data-panning') === 'true',
      scrollLeft: viewport instanceof HTMLElement ? viewport.scrollLeft : 0,
      scrollTop: viewport instanceof HTMLElement ? viewport.scrollTop : 0,
      hasHorizontalRuler: Boolean(horizontalRuler),
      hasVerticalRuler: Boolean(verticalRuler),
      horizontalMajorTicks: horizontalTicks.filter((tick) => tick.major).map((tick) => tick.value),
      verticalMajorTicks: verticalTicks.filter((tick) => tick.major).map((tick) => tick.value),
    };
  })()`);

  assert(state.hasViewport, `Canvas viewport missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.hasHorizontalRuler && state.hasVerticalRuler, `Canvas rulers missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.horizontalMajorTicks.includes(0) && state.horizontalMajorTicks.includes(100), `Horizontal ruler major ticks missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.verticalMajorTicks.includes(100), `Vertical ruler major ticks missing during ${label}: ${JSON.stringify(state)}`);
  return state;
};

const dragCanvasViewportPan = async (client, deltaX, deltaY) => {
  const start = await evaluate(client, `(() => {
    const viewport = document.querySelector('[data-testid="editor-canvas-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-viewport' };
    }
    viewport.scrollLeft = 120;
    viewport.scrollTop = 140;
    const rect = viewport.getBoundingClientRect();
    const x = rect.left + Math.max(24, Math.min(rect.width - 24, rect.width / 2));
    const y = rect.top + Math.max(24, Math.min(rect.height - 24, rect.height / 2));
    return {
      ok: true,
      x,
      y,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  })()`);

  assert(start?.ok, `Unable to prepare canvas viewport pan: ${JSON.stringify(start)}`);

  const dispatched = await evaluate(client, `(() => {
    const viewport = document.querySelector('[data-testid="editor-canvas-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-viewport' };
    }
    const startX = 240;
    const startY = 220;
    viewport.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: startX + ${JSON.stringify(deltaX)},
      clientY: startY + ${JSON.stringify(deltaY)},
    }));
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 0,
      clientX: startX + ${JSON.stringify(deltaX)},
      clientY: startY + ${JSON.stringify(deltaY)},
    }));
    return {
      ok: true,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      panMode: viewport.getAttribute('data-pan-mode'),
      panning: viewport.getAttribute('data-panning'),
    };
  })()`);

  assert(dispatched?.ok, `Unable to dispatch canvas viewport pan: ${JSON.stringify(dispatched)}`);
  await sleep(250);

  return {
    start,
    dispatched,
    end: await readCanvasNavigationState(client, 'after viewport pan'),
  };
};

const testZoomControls = async (client) => {
  const initial = await readZoomControlState(client, 'initial');
  const initialNavigation = await readCanvasNavigationState(client, 'initial navigation');

  await clickControlByTestId(client, 'editor-zoom-out');
  const afterZoomOut = await readZoomControlState(client, 'after zoom out');
  assert(afterZoomOut.scale < initial.scale, `Zoom out did not reduce canvas scale: ${JSON.stringify({ initial, afterZoomOut })}`);
  assert(afterZoomOut.autoFit === false, `Zoom out should disable auto-fit: ${JSON.stringify(afterZoomOut)}`);

  await clickControlByTestId(client, 'editor-zoom-in');
  const afterZoomIn = await readZoomControlState(client, 'after zoom in');
  assert(afterZoomIn.scale > afterZoomOut.scale, `Zoom in did not increase canvas scale: ${JSON.stringify({ afterZoomOut, afterZoomIn })}`);
  assert(afterZoomIn.autoFit === false, `Zoom in should keep manual zoom mode: ${JSON.stringify(afterZoomIn)}`);

  await clickControlByTestId(client, 'editor-zoom-fit');
  const afterFit = await readZoomControlState(client, 'after fit');
  assert(afterFit.autoFit === true, `Fit canvas did not enable auto-fit: ${JSON.stringify(afterFit)}`);
  assert(afterFit.scale > 0 && afterFit.scale <= 2, `Fit canvas produced out-of-range scale: ${JSON.stringify(afterFit)}`);

  await clickControlByTestId(client, 'editor-pan-toggle');
  const panEnabled = await readCanvasNavigationState(client, 'pan enabled');
  assert(panEnabled.panMode === true && panEnabled.panActive === true, `Pan toggle did not enable pan mode: ${JSON.stringify(panEnabled)}`);

  const panDrag = await dragCanvasViewportPan(client, 72, 58);
  assert(
    panDrag.end.scrollLeft < panDrag.start.scrollLeft && panDrag.end.scrollTop < panDrag.start.scrollTop,
    `Canvas pan drag did not update viewport scroll offsets: ${JSON.stringify(panDrag)}`,
  );

  await clickControlByTestId(client, 'editor-pan-toggle');
  const panDisabled = await readCanvasNavigationState(client, 'pan disabled');
  assert(panDisabled.panMode === false && panDisabled.panActive === false, `Pan toggle did not disable pan mode: ${JSON.stringify(panDisabled)}`);

  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(150);
  const spacePanActive = await readCanvasNavigationState(client, 'space pan active');
  assert(spacePanActive.spacePanActive === true && spacePanActive.panActive === true, `Spacebar did not temporarily enable pan mode: ${JSON.stringify(spacePanActive)}`);
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(150);
  const spacePanReleased = await readCanvasNavigationState(client, 'space pan released');
  assert(spacePanReleased.spacePanActive === false && spacePanReleased.panActive === false, `Spacebar release did not clear temporary pan mode: ${JSON.stringify(spacePanReleased)}`);

  return {
    initial,
    initialNavigation,
    afterZoomOut,
    afterZoomIn,
    afterFit,
    panEnabled,
    panDrag,
    panDisabled,
    spacePanActive,
    spacePanReleased,
  };
};

const readGridSnapControlState = async (client, label) => {
  const state = await evaluate(client, `(() => {
    const controls = document.querySelector('[data-testid="editor-grid-snap-controls"]');
    const toggle = document.querySelector('[data-testid="editor-snap-toggle"]');
    const gridToggle = document.querySelector('[data-testid="editor-grid-visibility-toggle"]');
    const input = document.querySelector('[data-testid="editor-grid-size"]');
    const grid = document.querySelector('[data-testid="editor-canvas-grid"]');
    const gridStyle = grid instanceof HTMLElement ? window.getComputedStyle(grid) : null;
    return {
      label: ${JSON.stringify(label)},
      hasControls: Boolean(controls),
      snapEnabled: controls?.getAttribute('data-snap-enabled') === 'true',
      gridVisible: controls?.getAttribute('data-grid-visible') === 'true',
      togglePressed: toggle?.getAttribute('aria-pressed') === 'true',
      gridTogglePressed: gridToggle?.getAttribute('aria-pressed') === 'true',
      gridSize: Number(controls?.getAttribute('data-grid-size') || 0),
      inputValue: input instanceof HTMLInputElement ? input.value : '',
      hasGrid: Boolean(grid),
      gridDataSize: Number(grid?.getAttribute('data-grid-size') || 0),
      backgroundSize: gridStyle?.backgroundSize || '',
    };
  })()`);

  assert(state.hasControls, `Grid/snap controls are missing during ${label}: ${JSON.stringify(state)}`);
  assert(state.snapEnabled === state.togglePressed, `Snap toggle state mismatch during ${label}: ${JSON.stringify(state)}`);
  assert(state.gridVisible === state.gridTogglePressed, `Grid visibility toggle state mismatch during ${label}: ${JSON.stringify(state)}`);
  assert(state.gridSize === Number(state.inputValue), `Grid input does not match control state during ${label}: ${JSON.stringify(state)}`);
  if (state.gridVisible) {
    assert(state.hasGrid, `Canvas grid should be visible during ${label}: ${JSON.stringify(state)}`);
    assert(state.gridSize === state.gridDataSize, `Canvas grid data size does not match control state during ${label}: ${JSON.stringify(state)}`);
    assert(state.backgroundSize.includes(`${state.gridSize}px`), `Canvas grid background size does not reflect grid size during ${label}: ${JSON.stringify(state)}`);
  } else {
    assert(!state.hasGrid, `Canvas grid should be hidden during ${label}: ${JSON.stringify(state)}`);
  }
  return state;
};

const dragElementByCanvasDelta = async (client, elementId, canvasDeltaX, canvasDeltaY) => {
  await scrollElementIntoView(client, elementId);
  const before = await getElementBox(client, elementId);
  assert(before, `Missing draggable element ${elementId}`);

  const canvasScale = await readCanvasScale(client);
  const startPoint = await getElementDragStartPoint(client, elementId, before);
  const screenDeltaX = Math.round(canvasDeltaX * canvasScale);
  const screenDeltaY = Math.round(canvasDeltaY * canvasScale);

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startPoint.x,
    y: startPoint.y,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startPoint.x,
    y: startPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startPoint.x + (screenDeltaX * step) / 8),
      y: Math.round(startPoint.y + (screenDeltaY * step) / 8),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: startPoint.x + screenDeltaX,
    y: startPoint.y + screenDeltaY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after grid/snap drag`);

  return {
    elementId,
    canvasScale,
    before,
    after,
    canvasDelta: {
      x: Math.round(after.canvasX - before.canvasX),
      y: Math.round(after.canvasY - before.canvasY),
      expectedX: canvasDeltaX,
      expectedY: canvasDeltaY,
    },
  };
};

const distanceToGridLine = (value, gridSize) => {
  const remainder = Math.abs(value % gridSize);
  return Math.min(remainder, Math.abs(gridSize - remainder));
};

const testGridSnapControls = async (client) => {
  const initial = await readGridSnapControlState(client, 'initial');
  assert(initial.snapEnabled === true, `Snap should default to enabled: ${JSON.stringify(initial)}`);
  assert(initial.gridVisible === true, `Grid should default to visible: ${JSON.stringify(initial)}`);

  await clickControlByTestId(client, 'editor-grid-visibility-toggle');
  await sleep(150);
  const gridHidden = await readGridSnapControlState(client, 'grid hidden');
  assert(gridHidden.gridVisible === false, `Grid visibility toggle did not hide the grid: ${JSON.stringify(gridHidden)}`);

  await clickControlByTestId(client, 'editor-grid-visibility-toggle');
  await sleep(150);
  const gridRestored = await readGridSnapControlState(client, 'grid restored');
  assert(gridRestored.gridVisible === true, `Grid visibility toggle did not restore the grid: ${JSON.stringify(gridRestored)}`);

  await setFormControlByTestId(client, 'editor-grid-size', '20');
  await sleep(150);
  const grid20 = await readGridSnapControlState(client, 'grid size 20');
  assert(grid20.gridSize === 20, `Grid size input did not apply 20px grid: ${JSON.stringify(grid20)}`);

  const snapOnDrag = await dragElementByCanvasDelta(client, 'smoke-icon', 17, 13);
  const snapOnState = await getElementBox(client, 'smoke-icon');
  assert(
    distanceToGridLine(snapOnState.canvasX, 20) <= 1 && distanceToGridLine(snapOnState.canvasY, 20) <= 1,
    `Snap-on drag did not land on 20px grid: ${JSON.stringify({ grid20, snapOnDrag, snapOnState })}`,
  );

  await clickControlByTestId(client, 'editor-snap-toggle');
  await sleep(150);
  const snapOff = await readGridSnapControlState(client, 'snap off');
  assert(snapOff.snapEnabled === false, `Snap toggle did not turn snapping off: ${JSON.stringify(snapOff)}`);

  const snapOffBefore = await getElementBox(client, 'smoke-icon');
  const snapOffDrag = await dragElementByCanvasDelta(client, 'smoke-icon', 7, 5);
  const snapOffAfter = await getElementBox(client, 'smoke-icon');
  assert(
    Math.abs((snapOffAfter.canvasX - snapOffBefore.canvasX) - 7) <= 2 &&
      Math.abs((snapOffAfter.canvasY - snapOffBefore.canvasY) - 5) <= 2,
    `Snap-off drag should preserve unsnapped canvas delta: ${JSON.stringify({ snapOffBefore, snapOffDrag, snapOffAfter })}`,
  );
  assert(
    distanceToGridLine(snapOffAfter.canvasX, 20) > 1 || distanceToGridLine(snapOffAfter.canvasY, 20) > 1,
    `Snap-off drag unexpectedly stayed on the 20px grid: ${JSON.stringify({ snapOffBefore, snapOffDrag, snapOffAfter })}`,
  );

  await clickControlByTestId(client, 'editor-snap-toggle');
  await sleep(150);
  const restored = await readGridSnapControlState(client, 'snap restored');
  assert(restored.snapEnabled === true, `Snap toggle did not restore snapping: ${JSON.stringify(restored)}`);

  return {
    initial,
    gridHidden,
    gridRestored,
    grid20,
    snapOnDrag,
    snapOff,
    snapOffDrag,
    restored,
  };
};

const readAlignmentGuideState = async (client, label) => (
  evaluate(client, `(() => {
    const guides = Array.from(document.querySelectorAll('[data-testid="editor-alignment-guide"]')).map((guide) => {
      const rect = guide.getBoundingClientRect();
      return {
        orientation: guide.getAttribute('data-guide-orientation') || '',
        position: Number(guide.getAttribute('data-guide-position') || 0),
        width: rect.width,
        height: rect.height,
      };
    });

    return {
      label: ${JSON.stringify(label)},
      count: guides.length,
      verticalCount: guides.filter((guide) => guide.orientation === 'vertical').length,
      horizontalCount: guides.filter((guide) => guide.orientation === 'horizontal').length,
      guides,
    };
  })()`)
);

const readCanvasScale = async (client) => {
  const scale = await evaluate(client, `(() => {
    const surface = document.querySelector('[data-testid="editor-canvas-scale-surface"]');
    return Number(surface?.getAttribute('data-canvas-scale') || 1);
  })()`);

  assert(Number.isFinite(scale) && scale > 0, `Invalid canvas scale for alignment guide smoke: ${scale}`);
  return scale;
};

const dragElementToCanvasPositionWithGuideProbe = async (client, elementId, targetCanvasX, targetCanvasY) => {
  await scrollElementIntoView(client, elementId);
  const before = await getElementBox(client, elementId);
  assert(before, `Missing draggable element ${elementId}`);

  const canvasScale = await readCanvasScale(client);
  const startPoint = await getElementDragStartPoint(client, elementId, before);
  const deltaX = Math.round((targetCanvasX - before.canvasX) * canvasScale);
  const deltaY = Math.round((targetCanvasY - before.canvasY) * canvasScale);
  const endX = startPoint.x + deltaX;
  const endY = startPoint.y + deltaY;

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startPoint.x,
    y: startPoint.y,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startPoint.x,
    y: startPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 12; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startPoint.x + (deltaX * step) / 12),
      y: Math.round(startPoint.y + (deltaY * step) / 12),
      button: 'left',
      buttons: 1,
    });
    await sleep(35);
  }

  await sleep(120);
  const during = await getElementBox(client, elementId);
  const guidesDuringDrag = await readAlignmentGuideState(client, 'during drag');

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  const guidesAfterRelease = await readAlignmentGuideState(client, 'after release');

  return {
    elementId,
    targetCanvasX,
    targetCanvasY,
    canvasScale,
    before,
    during,
    after,
    guidesDuringDrag,
    guidesAfterRelease,
  };
};

const testAlignmentGuideControls = async (client) => {
  const drag = await dragElementToCanvasPositionWithGuideProbe(client, 'smoke-image', 124, 104);

  assert(drag.guidesDuringDrag.verticalCount >= 1, `Expected at least one vertical alignment guide during drag: ${JSON.stringify(drag.guidesDuringDrag)}`);
  assert(drag.guidesDuringDrag.horizontalCount >= 1, `Expected at least one horizontal alignment guide during drag: ${JSON.stringify(drag.guidesDuringDrag)}`);
  assert(drag.guidesDuringDrag.guides.some((guide) => guide.orientation === 'vertical' && Math.abs(guide.position - 120) <= 1), `Expected vertical guide at peer x=120: ${JSON.stringify(drag.guidesDuringDrag)}`);
  assert(drag.guidesDuringDrag.guides.some((guide) => guide.orientation === 'horizontal' && Math.abs(guide.position - 100) <= 1), `Expected horizontal guide at peer y=100: ${JSON.stringify(drag.guidesDuringDrag)}`);
  assert(Math.abs(drag.after.canvasX - 120) <= 1, `Smart guide snap did not align x to peer edge: ${JSON.stringify(drag.after)}`);
  assert(Math.abs(drag.after.canvasY - 100) <= 1, `Smart guide snap did not align y to peer edge: ${JSON.stringify(drag.after)}`);
  assert(drag.guidesAfterRelease.count === 0, `Alignment guides should clear after drag release: ${JSON.stringify(drag.guidesAfterRelease)}`);

  return drag;
};

const dragElement = async (client, elementId, deltaX, deltaY, options = {}) => {
  await scrollElementIntoView(client, elementId);
  const before = await getElementBox(client, elementId);
  assert(before, `Missing draggable element ${elementId}`);

  const startPoint = await getElementDragStartPoint(client, elementId, before);
  const startX = startPoint.x;
  const startY = startPoint.y;
  const endX = startX + deltaX;
  const endY = startY + deltaY;
  const hitTarget = await evaluate(client, `(() => {
    const node = document.elementFromPoint(${startX}, ${startY});
    const element = node instanceof Element ? node : node?.parentElement;
    const host = element?.closest?.('[data-element-id]');
    return {
      tag: element?.tagName || null,
      className: element?.className?.toString?.() || '',
      elementId: host?.getAttribute('data-element-id') || null,
      role: element?.getAttribute?.('data-role') || null,
      editable: host?.getAttribute('data-backy-text-editor-editable') || null,
      text: element?.textContent?.trim?.().slice(0, 120) || '',
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
    };
  })()`);

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startX + (deltaX * step) / 10),
      y: Math.round(startY + (deltaY * step) / 10),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after drag`);

  const delta = measureDragDelta(before, after, deltaX, deltaY);
  if (!options.skipDeltaAssert) {
    assertDragDelta(
      delta,
      `${elementId} did not drag correctly; before ${JSON.stringify(before)}; start ${startX},${startY}; hit ${JSON.stringify(hitTarget)}`,
    );
  }

  return {
    elementId,
    before: { x: Math.round(before.x), y: Math.round(before.y), left: before.left, top: before.top },
    after: { x: Math.round(after.x), y: Math.round(after.y), left: after.left, top: after.top },
    delta,
  };
};

const getMoveHandleBox = async (client, elementId) => {
  const { result } = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const handle = document.querySelector('[data-element-id="${elementId}"] [data-role="canvas-move-handle"]');
      if (!handle) return null;
      const rect = handle.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })()`,
    returnByValue: true,
  });

  return result.value || null;
};

const waitForMoveHandleBox = async (client, elementId) => {
  let lastHandle = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastHandle = await getMoveHandleBox(client, elementId);
    if (lastHandle) {
      return lastHandle;
    }
    await sleep(75);
  }

  return lastHandle;
};

const readInspectorState = async (client) => {
  const { result } = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const inspector = document.querySelector('[data-testid="editor-inspector"]');
      const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
      const empty = document.querySelector('[data-testid="editor-inspector-empty"]');
      const workflow = document.querySelector('[data-testid="page-workflow-panel"]');
      const inspectorRect = inspector?.getBoundingClientRect();
      const workflowRect = workflow?.getBoundingClientRect();
      const overlapsWorkflow = Boolean(inspectorRect && workflowRect && !(
        workflowRect.right <= inspectorRect.left ||
        workflowRect.left >= inspectorRect.right ||
        workflowRect.bottom <= inspectorRect.top ||
        workflowRect.top >= inspectorRect.bottom
      ));
      return {
        hasInspector: Boolean(inspector),
        hasSelection: Boolean(selected),
        hasEmpty: Boolean(empty),
        selectedText: selected?.textContent || '',
        overlapsWorkflow,
      };
    })()`,
    returnByValue: true,
  });

  return result.value || null;
};

const assertInspectorSelection = async (client, elementId) => {
  await selectElement(client, elementId);
  const state = await readInspectorState(client);
  assert(state?.hasInspector, 'Editor inspector dock was not rendered');
  assert(state.hasSelection, `Inspector did not show selection for ${elementId}: ${JSON.stringify(state)}`);
  assert(!state.hasEmpty, `Inspector still showed empty state for ${elementId}: ${JSON.stringify(state)}`);
  assert(!state.overlapsWorkflow, `Workflow panel overlaps editor inspector: ${JSON.stringify(state)}`);
  return state;
};

const assertFontMediaPicker = async (client) => {
  const state = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-font-media-picker"]');
    return {
      exists: Boolean(button),
      text: button?.textContent || '',
      disabled: button instanceof HTMLButtonElement ? button.disabled : false,
    };
  })()`);

  assert(state?.exists, `Font upload/select control missing from inspector: ${JSON.stringify(state)}`);
  assert(!state.disabled, `Font upload/select control disabled unexpectedly: ${JSON.stringify(state)}`);
  assert(/upload or select font/i.test(state.text), `Font upload/select control label changed: ${JSON.stringify(state)}`);
  return state;
};

const testComponentClickAdd = async (client, componentKey = 'divider') => {
  const before = await evaluate(client, `(() => ({
    count: document.querySelectorAll('[data-element-id]').length,
    selected: document.querySelector('[data-testid="editor-inspector-selection"]')?.textContent || '',
  }))()`);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-component-add="${componentKey}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-add-button' };
    }
    button.click();
    return { ok: true, label: button.getAttribute('aria-label') || button.textContent || '' };
  })()`);

  assert(clicked?.ok, `Unable to click component add button for ${componentKey}: ${JSON.stringify(clicked)}`);
  await sleep(250);

  const after = await evaluate(client, `(() => {
    const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
    const selectedElement = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ));
    return {
      count: document.querySelectorAll('[data-element-id]').length,
      selectedText: selected?.textContent || '',
      selectedElementId: selectedElement?.getAttribute('data-element-id') || null,
    };
  })()`);

  assert(
    after.count === before.count + 1,
    `Component click-add did not insert exactly one element: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`,
  );
  assert(after.selectedElementId, `Component click-add did not select the inserted element: ${JSON.stringify(after)}`);

  return {
    componentKey,
    clicked,
    before,
    after,
  };
};

const readComponentLibraryState = async (client, label) => (
  evaluate(client, `(() => {
    const itemIds = Array.from(document.querySelectorAll('[data-component-library-item]')).map((node) => (
      node.getAttribute('data-component-library-item') || ''
    ));
    const categories = Array.from(document.querySelectorAll('[data-component-category]')).map((node) => ({
      id: node.getAttribute('data-component-category') || '',
      itemIds: Array.from(node.querySelectorAll('[data-component-library-item]')).map((item) => (
        item.getAttribute('data-component-library-item') || ''
      )),
    }));
    const favoriteButton = document.querySelector('[data-component-favorite="divider"]');
    const preview = document.querySelector('[data-testid="editor-component-preview"]');
    return {
      label: ${JSON.stringify(label)},
      hasLibrary: Boolean(document.querySelector('[data-testid="editor-component-library"]')),
      searchValue: document.querySelector('[data-testid="editor-component-search"]')?.value || '',
      itemIds,
      categories,
      hasEmpty: /No components found/i.test(document.querySelector('[data-testid="editor-component-library"]')?.textContent || ''),
      dividerFavoritePressed: favoriteButton?.getAttribute('aria-pressed') === 'true',
      previewKey: preview?.getAttribute('data-component-preview') || null,
      previewText: preview?.textContent || '',
      storedFavorites: (() => {
        try {
          return JSON.parse(window.localStorage.getItem('backy.editor.componentLibrary.favorites') || '[]');
        } catch {
          return [];
        }
      })(),
    };
  })()`)
);

const testComponentLibraryControls = async (client) => {
  const initial = await readComponentLibraryState(client, 'initial');
  assert(initial.hasLibrary, `Component library missing: ${JSON.stringify(initial)}`);
  assert(initial.itemIds.includes('divider'), `Divider component missing from library: ${JSON.stringify(initial)}`);
  assert(initial.itemIds.includes('image'), `Image component missing from library: ${JSON.stringify(initial)}`);

  await setFormControlByTestId(client, 'editor-component-search', 'divider');
  await sleep(150);
  const searchFiltered = await readComponentLibraryState(client, 'search divider');
  assert(searchFiltered.searchValue === 'divider', `Component search value mismatch: ${JSON.stringify(searchFiltered)}`);
  assert(searchFiltered.itemIds.includes('divider'), `Divider missing after component search: ${JSON.stringify(searchFiltered)}`);
  assert(!searchFiltered.itemIds.includes('image'), `Component search did not filter image out: ${JSON.stringify(searchFiltered)}`);

  await clickControlByTestId(client, 'editor-component-category-layout');
  await sleep(150);
  const layoutFiltered = await readComponentLibraryState(client, 'layout filtered');
  assert(layoutFiltered.itemIds.includes('divider'), `Layout category did not retain divider search result: ${JSON.stringify(layoutFiltered)}`);
  assert(layoutFiltered.categories.every((category) => category.id === 'layout'), `Layout category rendered unexpected groups: ${JSON.stringify(layoutFiltered)}`);

  await setFormControlByTestId(client, 'editor-component-search', '');
  await clickControlByTestId(client, 'editor-component-category-all');
  await sleep(150);

  await hoverControlBySelector(client, '[data-component-library-item="divider"]');
  const dividerPreview = await readComponentLibraryState(client, 'divider preview');
  assert(dividerPreview.previewKey === 'divider', `Hovering divider did not show divider preview: ${JSON.stringify(dividerPreview)}`);
  assert(/Divider/.test(dividerPreview.previewText) && /300 x 2/.test(dividerPreview.previewText), `Divider preview content missing expected metadata: ${JSON.stringify(dividerPreview)}`);

  await hoverControlBySelector(client, '[data-component-library-item="image"]');
  const imagePreview = await readComponentLibraryState(client, 'image preview');
  assert(imagePreview.previewKey === 'image', `Hovering image did not update component preview: ${JSON.stringify(imagePreview)}`);
  assert(/Image/.test(imagePreview.previewText) && /300 x 200/.test(imagePreview.previewText), `Image preview content missing expected metadata: ${JSON.stringify(imagePreview)}`);

  await leaveControlBySelector(client, '[data-component-library-item="image"]');
  const clearedPreview = await readComponentLibraryState(client, 'preview cleared');
  assert(clearedPreview.previewKey === null, `Component preview did not clear after leaving item: ${JSON.stringify(clearedPreview)}`);

  let beforeFavorite = await readComponentLibraryState(client, 'before favorite');
  if (beforeFavorite.dividerFavoritePressed) {
    await clickControlBySelector(client, '[data-component-favorite="divider"]');
    await sleep(150);
    beforeFavorite = await readComponentLibraryState(client, 'favorite cleared');
    assert(beforeFavorite.dividerFavoritePressed === false, `Unable to clear existing divider favorite: ${JSON.stringify(beforeFavorite)}`);
  }

  await clickControlBySelector(client, '[data-component-favorite="divider"]');
  await sleep(150);
  const favorited = await readComponentLibraryState(client, 'divider favorited');
  const favoritesGroup = favorited.categories.find((category) => category.id === 'favorites');
  assert(favorited.dividerFavoritePressed === true, `Divider favorite button did not become pressed: ${JSON.stringify(favorited)}`);
  assert(favorited.storedFavorites.includes('divider'), `Divider favorite did not persist to localStorage: ${JSON.stringify(favorited)}`);
  assert(favoritesGroup?.itemIds.includes('divider'), `Favorites group did not include divider: ${JSON.stringify(favorited)}`);

  await clickControlByTestId(client, 'editor-component-category-favorites');
  await sleep(150);
  const favoritesFiltered = await readComponentLibraryState(client, 'favorites category');
  assert(favoritesFiltered.itemIds.includes('divider'), `Favorites category did not show favorited divider: ${JSON.stringify(favoritesFiltered)}`);
  assert(favoritesFiltered.categories.length === 1 && favoritesFiltered.categories[0].id === 'favorites', `Favorites category rendered unexpected groups: ${JSON.stringify(favoritesFiltered)}`);

  await setFormControlByTestId(client, 'editor-component-search', 'zz-no-component');
  await sleep(150);
  const emptySearch = await readComponentLibraryState(client, 'empty search');
  assert(emptySearch.hasEmpty === true && emptySearch.itemIds.length === 0, `Component library empty search state missing: ${JSON.stringify(emptySearch)}`);

  await setFormControlByTestId(client, 'editor-component-search', '');
  await clickControlByTestId(client, 'editor-component-category-all');
  await sleep(150);
  const restored = await readComponentLibraryState(client, 'restored');
  assert(restored.itemIds.includes('divider') && restored.itemIds.includes('image'), `Component library did not restore all items: ${JSON.stringify(restored)}`);

  return {
    initial,
    searchFiltered,
    layoutFiltered,
    dividerPreview,
    imagePreview,
    clearedPreview,
    favorited,
    favoritesFiltered,
    emptySearch,
    restored,
  };
};

const assertGroupingControls = async (client) => {
  const state = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const ungroupButton = document.querySelector('[data-testid="editor-ungroup-selection"]');
    const selectSiblingsButton = document.querySelector('[data-testid="editor-select-sibling-layers"]');
    const deleteButton = document.querySelector('[data-testid="editor-delete-selection"]');
    const sendToBackButton = document.querySelector('[data-testid="editor-send-to-back"]');
    const sendBackwardButton = document.querySelector('[data-testid="editor-send-backward"]');
    const bringForwardButton = document.querySelector('[data-testid="editor-bring-forward"]');
    const bringToFrontButton = document.querySelector('[data-testid="editor-bring-to-front"]');
    const distributeHorizontalButton = document.querySelector('[data-testid="editor-distribute-horizontal"]');
    const distributeVerticalButton = document.querySelector('[data-testid="editor-distribute-vertical"]');
    return {
      hasGroupButton: Boolean(groupButton),
      hasUngroupButton: Boolean(ungroupButton),
      hasSelectSiblingsButton: Boolean(selectSiblingsButton),
      hasDeleteButton: Boolean(deleteButton),
      hasSendToBackButton: Boolean(sendToBackButton),
      hasSendBackwardButton: Boolean(sendBackwardButton),
      hasBringForwardButton: Boolean(bringForwardButton),
      hasBringToFrontButton: Boolean(bringToFrontButton),
      hasDistributeHorizontalButton: Boolean(distributeHorizontalButton),
      hasDistributeVerticalButton: Boolean(distributeVerticalButton),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
      ungroupDisabled: ungroupButton instanceof HTMLButtonElement ? ungroupButton.disabled : null,
      selectSiblingsDisabled: selectSiblingsButton instanceof HTMLButtonElement ? selectSiblingsButton.disabled : null,
      deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
      sendToBackDisabled: sendToBackButton instanceof HTMLButtonElement ? sendToBackButton.disabled : null,
      sendBackwardDisabled: sendBackwardButton instanceof HTMLButtonElement ? sendBackwardButton.disabled : null,
      bringForwardDisabled: bringForwardButton instanceof HTMLButtonElement ? bringForwardButton.disabled : null,
      bringToFrontDisabled: bringToFrontButton instanceof HTMLButtonElement ? bringToFrontButton.disabled : null,
      distributeHorizontalDisabled: distributeHorizontalButton instanceof HTMLButtonElement ? distributeHorizontalButton.disabled : null,
      distributeVerticalDisabled: distributeVerticalButton instanceof HTMLButtonElement ? distributeVerticalButton.disabled : null,
    };
  })()`);

  assert(state?.hasGroupButton, `Group control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasUngroupButton, `Ungroup control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasSelectSiblingsButton, `Select sibling layers control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasDeleteButton, `Delete control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasSendToBackButton, `Send-to-back control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasSendBackwardButton, `Send-backward control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasBringForwardButton, `Bring-forward control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasBringToFrontButton, `Bring-to-front control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasDistributeHorizontalButton, `Horizontal distribute control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasDistributeVerticalButton, `Vertical distribute control missing from editor toolbar: ${JSON.stringify(state)}`);
  return state;
};

const readSelectedZIndexControl = async (client, elementId) => {
  await selectLayerIds(client, [elementId]);
  await switchToPropertiesPanel(client);
  await ensurePropertySectionExpanded(client, 'Layout');

  const state = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="editor-layout-z-index"]');
    return {
      ok: input instanceof HTMLInputElement,
      value: input instanceof HTMLInputElement ? Number(input.value) : null,
      rawValue: input instanceof HTMLInputElement ? input.value : null,
      inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent?.slice(0, 500) || '',
    };
  })()`);

  assert(state?.ok && Number.isFinite(state.value), `Unable to read selected Z-index control for ${elementId}: ${JSON.stringify(state)}`);
  return state;
};

const testZOrderQuickControls = async (client, elementId) => {
  const before = await readSelectedZIndexControl(client, elementId);
  await scrollEditorToolbarIntoView(client, 'Bring to front');

  await clickEnabledButtonByAriaLabel(client, 'Bring to front');
  const front = await readSelectedZIndexControl(client, elementId);
  assert(front.value > before.value, `Bring to front did not raise ${elementId}: ${JSON.stringify({ before, front })}`);

  await scrollEditorToolbarIntoView(client, 'Send to back');
  await clickEnabledButtonByAriaLabel(client, 'Send to back');
  const back = await readSelectedZIndexControl(client, elementId);
  assert(back.value === 1, `Send to back did not move ${elementId} to z-index 1: ${JSON.stringify({ front, back })}`);

  await scrollEditorToolbarIntoView(client, 'Bring forward');
  await clickEnabledButtonByAriaLabel(client, 'Bring forward');
  const forward = await readSelectedZIndexControl(client, elementId);
  assert(forward.value === back.value + 1, `Bring forward did not raise ${elementId} by one layer: ${JSON.stringify({ back, forward })}`);

  await scrollEditorToolbarIntoView(client, 'Send backward');
  await clickEnabledButtonByAriaLabel(client, 'Send backward');
  const backward = await readSelectedZIndexControl(client, elementId);
  assert(backward.value === back.value, `Send backward did not lower ${elementId} by one layer: ${JSON.stringify({ forward, backward })}`);

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readSelectedZIndexControl(client, elementId);
  assert(undone.value === forward.value, `Z-order undo did not restore previous layer: ${JSON.stringify({ forward, backward, undone })}`);

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readSelectedZIndexControl(client, elementId);
  assert(redone.value === backward.value, `Z-order redo did not restore lowered layer: ${JSON.stringify({ backward, undone, redone })}`);

  return {
    elementId,
    before,
    front,
    back,
    forward,
    backward,
    undone,
    redone,
  };
};

const readElementPresence = async (client, elementIds) => (
  evaluate(client, `(() => {
    const ids = ${JSON.stringify(elementIds)};
    const state = {
      elements: {},
      layers: {},
      layersPanelOpen: Boolean(document.querySelector('[data-layer-id]')),
    };

    for (const id of ids) {
      state.elements[id] = Boolean(document.querySelector('[data-element-id="' + CSS.escape(id) + '"]'));
      state.layers[id] = Boolean(document.querySelector('[data-layer-id="' + CSS.escape(id) + '"]'));
    }

    return state;
  })()`)
);

const waitForElementPresence = async (client, elementId, present, label) => {
  let lastPresence = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastPresence = await readElementPresence(client, [elementId]);
    const elementMatches = Boolean(lastPresence.elements?.[elementId]) === present;
    const layerMatches = !lastPresence.layersPanelOpen || Boolean(lastPresence.layers?.[elementId]) === present;

    if (elementMatches && layerMatches) {
      return lastPresence;
    }

    await sleep(150);
  }

  throw new Error(`${label}: element ${elementId} presence did not become ${present}: ${JSON.stringify(lastPresence)}`);
};

const waitForPersistedElementPresence = async (pageId, expected) => {
  let lastState = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const elements = payload.data?.page?.content?.elements || [];
    const deleted = Object.fromEntries((expected.deleted || []).map((id) => [id, findCanvasElement(elements, id) === null]));
    const present = Object.fromEntries((expected.present || []).map((id) => {
      const element = findCanvasElement(elements, id);
      return [id, element ? { exists: true, locked: element.locked === true } : { exists: false, locked: false }];
    }));
    lastState = { deleted, present };

    const deletedOk = Object.values(deleted).every(Boolean);
    const presentOk = Object.values(present).every((entry) => entry.exists);
    const lockedOk = Object.entries(expected.locked || {}).every(([id, locked]) => present[id]?.locked === locked);

    if (deletedOk && presentOk && lockedOk) {
      return lastState;
    }

    await sleep(250);
  }

  throw new Error(`Persisted delete state did not match: ${JSON.stringify({ expected, lastState })}`);
};

const testDeleteEditingControls = async (client, pageId) => {
  const toolbarId = 'smoke-divider';
  const keyboardId = 'smoke-spacer';
  const lockedId = 'smoke-icon';

  await waitForElementPresence(client, toolbarId, true, 'before toolbar delete');
  await waitForElementPresence(client, keyboardId, true, 'before keyboard delete');
  await waitForElementPresence(client, lockedId, true, 'before locked delete');

  await selectLayerIds(client, [toolbarId]);
  await scrollEditorToolbarIntoView(client, 'Delete');
  await clickEnabledButtonByAriaLabel(client, 'Delete');
  const toolbarDeleted = await waitForElementPresence(client, toolbarId, false, 'after toolbar delete');

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const toolbarUndone = await waitForElementPresence(client, toolbarId, true, 'after toolbar delete undo');

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const toolbarRedone = await waitForElementPresence(client, toolbarId, false, 'after toolbar delete redo');

  await selectLayerIds(client, [keyboardId]);
  await blurActiveElement(client);
  await pressKey(client, 'Delete');
  const keyboardDeleted = await waitForElementPresence(client, keyboardId, false, 'after keyboard delete');

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true });
  const keyboardUndone = await waitForElementPresence(client, keyboardId, true, 'after keyboard delete undo');

  await blurActiveElement(client);
  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const keyboardRedone = await waitForElementPresence(client, keyboardId, false, 'after keyboard delete redo');

  await setLayerLockedState(client, lockedId, true);
  await selectLayerIds(client, [lockedId]);
  await scrollEditorToolbarIntoView(client, 'Delete');
  await clickEnabledButtonByAriaLabel(client, 'Delete');
  const lockedAfterToolbar = await waitForElementPresence(client, lockedId, true, 'after locked toolbar delete attempt');

  await blurActiveElement(client);
  await pressKey(client, 'Delete');
  const lockedAfterKeyboard = await waitForElementPresence(client, lockedId, true, 'after locked keyboard delete attempt');

  await clickSave(client);
  const savedStatus = await waitForEditorMutationReady(client, 'after delete smoke save');
  const persisted = await waitForPersistedElementPresence(pageId, {
    deleted: [toolbarId, keyboardId],
    present: [lockedId],
    locked: {
      [lockedId]: true,
    },
  });

  return {
    toolbarId,
    keyboardId,
    lockedId,
    toolbarDeleted,
    toolbarUndone,
    toolbarRedone,
    keyboardDeleted,
    keyboardUndone,
    keyboardRedone,
    lockedAfterToolbar,
    lockedAfterKeyboard,
    savedStatus,
    persisted,
  };
};

const openPageSettingsDialog = async (client) => {
  let settingsOpened = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    settingsOpened = await evaluate(client, `(() => {
      const button = document.querySelector('button[aria-label="Page settings"]');
      const dialog = document.querySelector('[data-testid="page-settings-dialog"]');
      if (dialog instanceof HTMLElement) {
        return { ok: true, clicked: false, disabled: false };
      }
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'settings-button-missing' };
      }
      if (button.disabled) {
        return { ok: false, reason: 'settings-button-disabled', disabled: true };
      }
      button.click();
      return { ok: false, clicked: true, disabled: false };
    })()`);
    if (settingsOpened?.ok) {
      break;
    }
    await sleep(150);
  }

  assert(settingsOpened?.ok, `Unable to open page settings dialog: ${JSON.stringify(settingsOpened)}`);
  return settingsOpened;
};

const clickPageSettingsTab = async (client, tab) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="page-settings-tab-${tab}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        tab: ${JSON.stringify(tab)},
        dialogText: document.querySelector('[data-testid="page-settings-dialog"]')?.textContent?.slice(0, 500) || '',
      };
    }
    button.click();
    return { ok: true, tab: ${JSON.stringify(tab)} };
  })()`);

  assert(clicked?.ok, `Unable to click page settings ${tab} tab: ${JSON.stringify(clicked)}`);
  await sleep(200);
  return clicked;
};

const clickPageSettingsSave = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="page-settings-save"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-save-button' };
    }
    if (button.disabled) {
      return { ok: false, reason: 'save-disabled', text: button.textContent || '' };
    }
    button.click();
    return { ok: true, text: button.textContent || '' };
  })()`);

  assert(clicked?.ok, `Unable to click page settings save: ${JSON.stringify(clicked)}`);
  await sleep(300);
  return clicked;
};

const readPageSettingsValidation = async (client) => (
  evaluate(client, `(() => {
    const validation = document.querySelector('[data-testid="page-settings-validation-error"]');
    return {
      present: Boolean(validation),
      text: validation?.textContent || '',
      dialogOpen: Boolean(document.querySelector('[data-testid="page-settings-dialog"]')),
    };
  })()`)
);

const waitForPageSettingsPersisted = async (pageId, expected) => {
  let lastPage = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const page = payload.data?.page;
    lastPage = page;
    const meta = page?.meta || {};
    const jsonLd = Array.isArray(meta.jsonLd) ? meta.jsonLd : [];
    const keywords = Array.isArray(meta.keywords) ? meta.keywords : [];

    const matches = page &&
      page.title === expected.title &&
      page.slug === expected.slug &&
      page.status === expected.status &&
      meta.title === expected.meta.title &&
      meta.description === expected.meta.description &&
      meta.ogImage === expected.meta.ogImage &&
      JSON.stringify(keywords) === JSON.stringify(expected.meta.keywords) &&
      JSON.stringify(jsonLd) === JSON.stringify(expected.meta.jsonLd);

    if (matches) {
      return page;
    }

    await sleep(250);
  }

  throw new Error(`Page settings did not persist: expected ${JSON.stringify(expected)}, got ${JSON.stringify(lastPage)}`);
};

const testPageSettingsControls = async (client, pageId) => {
  assert(pageId, 'Page settings smoke requires an internally created smoke page');
  const suffix = Date.now().toString(36);
  const expected = {
    title: `Settings Smoke ${suffix}`,
    slug: `settings-smoke-${suffix}`,
    status: 'draft',
    meta: {
      title: `Settings Meta ${suffix}`,
      description: `Settings smoke description ${suffix}`,
      keywords: ['cms', 'canva builder', 'headless'],
      ogImage: `https://cdn.backy.test/settings-${suffix}.jpg`,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `Settings Smoke ${suffix}`,
        },
      ],
    },
  };

  await openPageSettingsDialog(client);
  await setFormControlByTestId(client, 'page-settings-status', 'scheduled');
  await clickPageSettingsSave(client);
  const scheduledValidation = await readPageSettingsValidation(client);
  assert(
    scheduledValidation.present && /publish date/i.test(scheduledValidation.text),
    `Scheduled settings save did not require a publish date: ${JSON.stringify(scheduledValidation)}`,
  );

  await setFormControlByTestId(client, 'page-settings-title', expected.title);
  await setFormControlByTestId(client, 'page-settings-slug', expected.slug);
  await setFormControlByTestId(client, 'page-settings-status', expected.status);

  await clickPageSettingsTab(client, 'seo');
  await setFormControlByTestId(client, 'page-settings-meta-title', expected.meta.title);
  await setFormControlByTestId(client, 'page-settings-meta-description', expected.meta.description);
  await setFormControlByTestId(client, 'page-settings-keywords', expected.meta.keywords.join(', '));
  await setFormControlByTestId(client, 'page-settings-json-ld', JSON.stringify(expected.meta.jsonLd, null, 2));

  await clickPageSettingsTab(client, 'social');
  await setFormControlByTestId(client, 'page-settings-og-image', expected.meta.ogImage);

  await clickPageSettingsSave(client);
  let closed = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    closed = await evaluate(client, `(() => !document.querySelector('[data-testid="page-settings-dialog"]'))()`);
    if (closed) {
      break;
    }
    await sleep(150);
  }
  assert(closed === true, 'Page settings dialog did not close after successful save');
  const savedStatus = await waitForEditorMutationReady(client, 'after page settings smoke save');
  const persisted = await waitForPageSettingsPersisted(pageId, expected);

  return {
    expected,
    scheduledValidation,
    savedStatus,
    persisted: {
      title: persisted.title,
      slug: persisted.slug,
      status: persisted.status,
      meta: persisted.meta,
    },
  };
};

const testSiblingScopeSelectionShortcut = async (client, requiredElementIds) => {
  const [firstId] = requiredElementIds;
  await selectElement(client, firstId);

  await evaluate(client, `(() => {
    const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
      (button.textContent || '').trim() === 'Layers'
    ));
    layersButton?.click();
    return true;
  })()`);
  await sleep(150);
  await pressKey(client, 'a', { ctrlKey: true });
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    const selectedLayers = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean);

    return {
      selectedLayers,
      hasMultiSelection: Boolean(multiSelection),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
      inspectorText: multiSelection?.textContent || '',
    };
  })()`);

  assert(state.hasMultiSelection, `Ctrl+A sibling selection did not reach multi-selection inspector: ${JSON.stringify(state)}`);
  assert(state.groupDisabled === false, `Ctrl+A sibling selection did not enable grouping: ${JSON.stringify(state)}`);
  assert(
    requiredElementIds.every((id) => state.selectedLayers.includes(id)),
    `Ctrl+A sibling selection missed expected layers: ${JSON.stringify({ requiredElementIds, state })}`,
  );

  return state;
};

const testLayerGrouping = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Layer grouping test needs at least two elements');
  const [firstId, secondId] = elementIds;
  const before = await readEditorElementState(client, [firstId, secondId]);

  await evaluate(client, `(() => {
    if (!document.querySelector('[data-layer-id="${firstId}"]')) {
      const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Layers'
      ));
      layersButton?.click();
    }
    return true;
  })()`);

  let layersReady = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layersReady = await evaluate(client, `(() => ({
      first: Boolean(document.querySelector('[data-layer-id="${firstId}"]')),
      second: Boolean(document.querySelector('[data-layer-id="${secondId}"]')),
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);
    if (layersReady.first && layersReady.second) {
      break;
    }
    await sleep(100);
  }

  assert(layersReady?.first && layersReady?.second, `Layer rows did not render for grouping: ${JSON.stringify(layersReady)}`);

  const selected = await selectLayerIds(client, [firstId, secondId]);
  const ready = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    return {
      selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
      hasMultiSelection: Boolean(multiSelection),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
    };
  })()`);

  assert(
    [firstId, secondId].every((id) => selected.selectedLayers?.includes(id)),
    `Unable to select layers for grouping: ${JSON.stringify(selected)}`,
  );
  assert(ready.hasMultiSelection, `Layer multi-selection did not reach inspector: ${JSON.stringify(ready)}`);
  assert(ready.groupDisabled === false, `Group button did not enable for sibling layers: ${JSON.stringify(ready)}`);
  assert(
    [firstId, secondId].every((id) => ready.selectedLayers.includes(id)),
    `Grouping selection drifted before grouping: ${JSON.stringify(ready)}`,
  );

  await pressKey(client, 'g', { ctrlKey: true });
  await sleep(250);
  const grouped = await evaluate(client, `(() => {
    const ungroupButton = document.querySelector('[data-testid="editor-ungroup-selection"]');
    const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
    return {
      hasSelection: Boolean(selected),
      selectedText: selected?.textContent || '',
      ungroupDisabled: ungroupButton instanceof HTMLButtonElement ? ungroupButton.disabled : null,
    };
  })()`);

  assert(grouped.hasSelection, `Grouped selection was not shown in inspector: ${JSON.stringify(grouped)}`);
  assert(grouped.ungroupDisabled === false, `Ungroup button did not enable after grouping: ${JSON.stringify(grouped)}`);

  await pressKey(client, 'g', { ctrlKey: true, shiftKey: true });
  await sleep(250);
  const after = await readEditorElementState(client, [firstId, secondId]);
  const ungroupedSelection = await evaluate(client, `(() => {
    const selectedLayers = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean);
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    return {
      selectedLayers,
      hasMultiSelection: Boolean(multiSelection),
      inspectorText: multiSelection?.textContent || '',
    };
  })()`);
  assertElementState(after, before, 'group/ungroup roundtrip');
  assert(
    ungroupedSelection.hasMultiSelection &&
      [firstId, secondId].every((id) => ungroupedSelection.selectedLayers.includes(id)),
    `Ungroup did not preserve expanded child multi-selection: ${JSON.stringify(ungroupedSelection)}`,
  );

  return {
    selected: ready,
    grouped,
    ungroupedSelection,
    before,
    after,
  };
};

const selectLayerIds = async (client, elementIds) => {
  const [firstId] = elementIds;

  await evaluate(client, `(() => {
    if (!document.querySelector('[data-layer-id="${firstId}"]')) {
      const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Layers'
      ));
      layersButton?.click();
    }
    return true;
  })()`);

  let layersReady = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layersReady = await evaluate(client, `(() => ({
      ready: ${JSON.stringify(elementIds)}.every((id) => Boolean(document.querySelector('[data-layer-id="' + id + '"]'))),
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);
    if (layersReady.ready) {
      break;
    }
    await sleep(100);
  }

  assert(layersReady?.ready, `Layer rows did not render for multi-selection: ${JSON.stringify(layersReady)}`);

  let selected = null;
  for (const [index, id] of elementIds.entries()) {
    selected = await evaluate(client, `(() => {
      const id = ${JSON.stringify(id)};
      const layer = document.querySelector('[data-layer-id="' + id + '"]');
      if (!layer) {
        return { ok: false, reason: 'missing-layer-item', id };
      }
      layer.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        ctrlKey: ${index > 0 ? 'true' : 'false'},
        metaKey: false,
      }));

      return { ok: true };
    })()`);
    assert(selected?.ok, `Unable to select layer ${id}: ${JSON.stringify(selected)}`);
    await sleep(120);
  }

  const ready = await evaluate(client, `(() => ({
    selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
    hasMultiSelection: Boolean(document.querySelector('[data-testid="editor-inspector-multi-selection"]')),
  }))()`);

  assert(
    elementIds.every((id) => ready.selectedLayers?.includes(id)),
    `Layer multi-selection missing expected ids: ${JSON.stringify(ready)}`,
  );

  return ready;
};

const testMultiSelectionCanvasDrag = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Multi-selection drag test needs at least two elements');
  await selectLayerIds(client, elementIds);

  const before = await readEditorElementState(client, elementIds);
  const drag = await dragSelectionHandle(client, elementIds[0], 50, 30, { selectFirst: false });
  const after = await readEditorElementState(client, elementIds);
  const expectedCanvasDeltaX = drag.delta?.canvas?.x ?? 50;
  const expectedCanvasDeltaY = drag.delta?.canvas?.y ?? 30;

  for (const elementId of elementIds) {
    const actualDeltaX = after[elementId].x - before[elementId].x;
    const actualDeltaY = after[elementId].y - before[elementId].y;
    assert(
      Math.abs(actualDeltaX - expectedCanvasDeltaX) <= 12 &&
      Math.abs(actualDeltaY - expectedCanvasDeltaY) <= 12,
      `${elementId} did not move with multi-selection drag: expected canvas ${expectedCanvasDeltaX},${expectedCanvasDeltaY}; got ${actualDeltaX},${actualDeltaY}; before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}`,
    );
  }

  return {
    selected: elementIds,
    drag,
    before,
    after,
  };
};

const testCanvasShiftMultiSelect = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Canvas shift multi-select test needs at least two elements');
  const [firstId, secondId] = elementIds;

  await selectElement(client, firstId);
  const shiftClick = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${secondId}"]');
    if (!(node instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-node' };
    }

    const rect = node.getBoundingClientRect();
    const x = Math.round(rect.left + Math.min(rect.width / 2, 60));
    const y = Math.round(rect.top + Math.min(rect.height / 2, 24));
    const dispatch = (EventConstructor, type, buttons) => {
      node.dispatchEvent(new EventConstructor(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        shiftKey: true,
      }));
    };

    if (typeof PointerEvent === 'function') {
      dispatch(PointerEvent, 'pointerdown', 1);
      dispatch(PointerEvent, 'pointerup', 0);
    }
    dispatch(MouseEvent, 'mousedown', 1);
    dispatch(MouseEvent, 'mouseup', 0);
    dispatch(MouseEvent, 'click', 0);

    return {
      ok: true,
      x,
      y,
      hitElementId: document.elementFromPoint(x, y)?.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
    };
  })()`);
  assert(shiftClick?.ok, `Unable to dispatch canvas shift-click: ${JSON.stringify(shiftClick)}`);
  await sleep(250);

  const selected = await evaluate(client, `(() => {
    const expected = ${JSON.stringify(elementIds)};
    const selectedNodes = expected.map((id) => document.querySelector('[data-element-id="' + id + '"]'));
    const selectedIdsByElement = Object.fromEntries(selectedNodes.map((node, index) => [
      expected[index],
      node instanceof HTMLElement ? node.getAttribute('data-selected-ids') || '' : '',
    ]));
    const selectedLayers = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean);
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');

    return {
      selectedIdsByElement,
      selectedLayers,
      hasMultiSelection: Boolean(multiSelection),
      inspectorText: multiSelection?.textContent || '',
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
    };
  })()`);

  assert(
    elementIds.every((id) => selected.selectedIdsByElement[id]?.split(',').includes(id)),
    `Canvas shift multi-select did not mark all selected elements: ${JSON.stringify(selected)}`,
  );
  assert(selected.hasMultiSelection, `Canvas shift multi-select did not show multi-selection inspector: ${JSON.stringify(selected)}`);
  assert(selected.groupDisabled === false, `Canvas shift multi-select did not enable group action: ${JSON.stringify(selected)}`);

  return selected;
};

const getStateBounds = (state) => {
  const entries = Object.values(state);
  const minX = Math.min(...entries.map((entry) => entry.x));
  const minY = Math.min(...entries.map((entry) => entry.y));
  const maxX = Math.max(...entries.map((entry) => entry.x + entry.width));
  const maxY = Math.max(...entries.map((entry) => entry.y + entry.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const testMultiSelectionResize = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Multi-selection resize test needs at least two sibling elements');

  await selectLayerIds(client, elementIds);
  await scrollElementIntoView(client, elementIds[0]);
  let canvasSelectionReady = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    canvasSelectionReady = await evaluate(client, `(() => {
      const expected = ${JSON.stringify(elementIds)};
      const selectedNodes = expected.map((id) => document.querySelector('[data-element-id="' + id + '"]'));
      const selectedIdsByElement = selectedNodes.map((node) => (
        node instanceof HTMLElement ? node.getAttribute('data-selected-ids') || '' : ''
      ));
      return {
        ready: selectedIdsByElement.every((value) => expected.every((id) => value.split(',').includes(id))),
        selectedIdsByElement,
      };
    })()`);
    if (canvasSelectionReady?.ready) {
      break;
    }
    await sleep(120);
  }
  assert(
    canvasSelectionReady?.ready,
    `Canvas multi-selection state was not ready for resize: ${JSON.stringify(canvasSelectionReady)}`,
  );

  const before = await readEditorElementState(client, elementIds);
  const beforeBounds = getStateBounds(before);

  const handle = await evaluate(client, `(() => {
    const handles = Array.from(document.querySelectorAll('[data-role="canvas-resize-handle"][data-resize-handle="se"]'));
    const handle = handles.find((candidate) => {
      const elementId = candidate.closest('[data-element-id]')?.getAttribute('data-element-id');
      return ${JSON.stringify(elementIds)}.includes(elementId || '');
    });
    if (!handle) {
      return {
        ok: false,
        reason: 'missing-se-handle',
        selected: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
        handles: Array.from(document.querySelectorAll('[data-role="canvas-resize-handle"]')).map((node) => ({
          elementId: node.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
          position: node.getAttribute('data-resize-handle'),
        })),
      };
    }
    const rect = handle.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      elementId: handle.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
      hit: (() => {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const element = hit instanceof Element ? hit : hit?.parentElement;
        return {
          tag: element?.tagName || null,
          role: element?.getAttribute('data-role') || null,
          handle: element?.getAttribute('data-resize-handle') || null,
          elementId: element?.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
          className: element?.className?.toString?.() || '',
        };
      })(),
      selected: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
    };
  })()`);

  assert(handle?.ok, `Unable to find multi-selection resize handle: ${JSON.stringify(handle)}`);

  const directStarted = await evaluate(client, `(() => {
    const handle = document.elementFromPoint(${handle.x}, ${handle.y});
    if (!(handle instanceof HTMLElement)) {
      return { ok: false, reason: 'handle-hit-missing' };
    }
    handle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: ${handle.x},
      clientY: ${handle.y},
      button: 0,
      buttons: 1,
    }));
    return {
      ok: true,
      role: handle.getAttribute('data-role'),
      handle: handle.getAttribute('data-resize-handle'),
      elementId: handle.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
    };
  })()`);
  assert(directStarted?.ok, `Unable to dispatch direct resize start: ${JSON.stringify(directStarted)}`);

  const deltaX = 70;
  const deltaY = 50;
  await sleep(50);

  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(handle.x + (deltaX * step) / 8),
      y: Math.round(handle.y + (deltaY * step) / 8),
      button: 'left',
      buttons: 1,
      pointerType: 'mouse',
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: handle.x + deltaX,
    y: handle.y + deltaY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  });
  await sleep(300);

  const after = await readEditorElementState(client, elementIds);
  const afterBounds = getStateBounds(after);

  for (const elementId of elementIds) {
    assert(
      after[elementId].width > before[elementId].width &&
        after[elementId].height > before[elementId].height,
      `${elementId} did not scale during multi-selection resize: before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}, handle ${JSON.stringify(handle)}, bounds ${JSON.stringify({ beforeBounds, afterBounds })}`,
    );
  }

  assert(
    afterBounds.width > beforeBounds.width && afterBounds.height > beforeBounds.height,
    `Multi-selection bounds did not expand after resize: before ${JSON.stringify(beforeBounds)}, after ${JSON.stringify(afterBounds)}`,
  );

  return {
    selected: elementIds,
    handleElementId: handle.elementId,
    canvasSelectionReady,
    before,
    after,
    beforeBounds,
    afterBounds,
  };
};

const centerGaps = (state, axis) => {
  const entries = Object.values(state).sort((left, right) => (
    axis === 'horizontal'
      ? (left.x + left.width / 2) - (right.x + right.width / 2)
      : (left.y + left.height / 2) - (right.y + right.height / 2)
  ));

  return entries.slice(0, -1).map((entry, index) => {
    const next = entries[index + 1];
    return axis === 'horizontal'
      ? Math.round((next.x + next.width / 2) - (entry.x + entry.width / 2))
      : Math.round((next.y + next.height / 2) - (entry.y + entry.height / 2));
  });
};

const assertEvenSpacing = (state, axis, label) => {
  const gaps = centerGaps(state, axis);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  assert(
    gaps.length >= 2 && Math.abs(max - min) <= 2,
    `${label}: expected even ${axis} center spacing, got ${JSON.stringify({ gaps, state })}`,
  );
  return gaps;
};

const testMultiSelectionDistribution = async (client, elementIds) => {
  assert(elementIds.length >= 3, 'Multi-selection distribution test needs at least three sibling elements');
  await selectLayerIds(client, elementIds);

  const ready = await evaluate(client, `(() => {
    const horizontal = document.querySelector('[data-testid="editor-distribute-horizontal"]');
    const vertical = document.querySelector('[data-testid="editor-distribute-vertical"]');
    const inspectorHorizontal = document.querySelector('[data-testid="editor-inspector-distribute-horizontal"]');
    const inspectorVertical = document.querySelector('[data-testid="editor-inspector-distribute-vertical"]');
    return {
      selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
      horizontalDisabled: horizontal instanceof HTMLButtonElement ? horizontal.disabled : null,
      verticalDisabled: vertical instanceof HTMLButtonElement ? vertical.disabled : null,
      inspectorHorizontalDisabled: inspectorHorizontal instanceof HTMLButtonElement ? inspectorHorizontal.disabled : null,
      inspectorVerticalDisabled: inspectorVertical instanceof HTMLButtonElement ? inspectorVertical.disabled : null,
      inspectorText: document.querySelector('[data-testid="editor-inspector-multi-selection"]')?.textContent || '',
    };
  })()`);

  assert(ready.horizontalDisabled === false, `Horizontal distribute did not enable for three selected layers: ${JSON.stringify(ready)}`);
  assert(ready.verticalDisabled === false, `Vertical distribute did not enable for three selected layers: ${JSON.stringify(ready)}`);
  assert(ready.inspectorHorizontalDisabled === false, `Inspector horizontal distribute did not enable: ${JSON.stringify(ready)}`);
  assert(ready.inspectorVerticalDisabled === false, `Inspector vertical distribute did not enable: ${JSON.stringify(ready)}`);

  await clickButtonByAriaLabel(client, 'Distribute horizontal spacing');
  await sleep(200);
  const afterHorizontal = await readEditorElementState(client, elementIds);
  const horizontalGaps = assertEvenSpacing(afterHorizontal, 'horizontal', 'horizontal distribution');

  await clickButtonByAriaLabel(client, 'Distribute vertical spacing');
  await sleep(200);
  const afterVertical = await readEditorElementState(client, elementIds);
  const verticalGaps = assertEvenSpacing(afterVertical, 'vertical', 'vertical distribution');

  return {
    ready,
    afterHorizontal,
    afterVertical,
    horizontalGaps,
    verticalGaps,
  };
};

const testMultiSelectionControls = async (client) => {
  const canvasShiftSelection = await testCanvasShiftMultiSelect(client, ['smoke-heading', 'smoke-image']);
  const canvasDrag = await testMultiSelectionCanvasDrag(client, ['smoke-heading', 'smoke-image']);
  const canvasResize = await testMultiSelectionResize(client, ['smoke-image', 'smoke-heading']);
  const distribution = await testMultiSelectionDistribution(client, ['smoke-heading', 'smoke-image', 'smoke-box']);
  const grouping = await testLayerGrouping(client, ['smoke-heading', 'smoke-image']);

  return {
    canvasShiftSelection,
    canvasDrag,
    canvasResize,
    distribution,
    grouping,
  };
};

const testLayerHierarchyControls = async (client) => {
  await selectLayerIds(client, ['smoke-image']);
  const beforeImageBox = await getElementBox(client, 'smoke-image');
  const beforeChildBox = await getElementBox(client, 'smoke-child-button');
  const beforeState = await readEditorElementState(client, ['smoke-image', 'smoke-box', 'smoke-child-button']);
  assert(beforeImageBox && beforeChildBox, 'Unable to read visual boxes before layer hierarchy controls');

  const nestedClick = await clickLayerAction(client, 'nest-selection', 'smoke-box');
  const afterNestTree = await readLayerTreeState(client, ['smoke-image', 'smoke-box', 'smoke-child-button']);
  const afterNestedImageBox = await getElementBox(client, 'smoke-image');
  const afterNestedState = await readEditorElementState(client, ['smoke-image']);
  assert(afterNestedImageBox, 'Unable to read image box after nesting');
  assert(
    afterNestTree.byId['smoke-image'].depth > afterNestTree.byId['smoke-box'].depth,
    `Nesting selected layer did not move smoke-image under smoke-box: ${JSON.stringify(afterNestTree)}`,
  );
  assert(
    Math.abs(getCanvasVisualX(afterNestedImageBox) - getCanvasVisualX(beforeImageBox)) <= 3 &&
      Math.abs(getCanvasVisualY(afterNestedImageBox) - getCanvasVisualY(beforeImageBox)) <= 3,
    `Nesting selected layer did not preserve visual position: before ${JSON.stringify(beforeImageBox)}, after ${JSON.stringify(afterNestedImageBox)}`,
  );
  assert(
    Math.abs(afterNestedState['smoke-image'].x - (beforeState['smoke-image'].x - beforeState['smoke-box'].x)) <= 1 &&
      Math.abs(afterNestedState['smoke-image'].y - (beforeState['smoke-image'].y - beforeState['smoke-box'].y)) <= 1,
    `Nested image did not convert to parent-relative coordinates: ${JSON.stringify({ beforeState, afterNestedState })}`,
  );

  const nestedDrag = await dragElement(client, 'smoke-image', 500, 0, { skipDeltaAssert: true });
  const afterNestedDragState = await readEditorElementState(client, ['smoke-image', 'smoke-box']);
  const maxNestedImageX = Math.max(0, afterNestedDragState['smoke-box'].width - afterNestedDragState['smoke-image'].width);
  assert(
    afterNestedDragState['smoke-image'].x >= 0 &&
      afterNestedDragState['smoke-image'].x <= maxNestedImageX + 1,
    `Nested image drag did not clamp to parent-relative bounds: ${JSON.stringify({ afterNestedState, afterNestedDragState, nestedDrag })}`,
  );

  const outdentClick = await clickLayerAction(client, 'outdent', 'smoke-child-button');
  const afterOutdentTree = await readLayerTreeState(client, ['smoke-child-button', 'smoke-box']);
  const afterOutdentChildBox = await getElementBox(client, 'smoke-child-button');
  const afterOutdentState = await readEditorElementState(client, ['smoke-child-button']);
  assert(afterOutdentChildBox, 'Unable to read child button after outdent');
  assert(
    afterOutdentTree.byId['smoke-child-button'].depth === afterOutdentTree.byId['smoke-box'].depth,
    `Outdent did not promote nested child to parent layer level: ${JSON.stringify(afterOutdentTree)}`,
  );
  assert(
    Math.abs(getCanvasVisualX(afterOutdentChildBox) - getCanvasVisualX(beforeChildBox)) <= 3 &&
      Math.abs(getCanvasVisualY(afterOutdentChildBox) - getCanvasVisualY(beforeChildBox)) <= 3,
    `Outdent did not preserve visual position: before ${JSON.stringify(beforeChildBox)}, after ${JSON.stringify(afterOutdentChildBox)}`,
  );
  assert(
    afterOutdentState['smoke-child-button'].x > beforeState['smoke-child-button'].x &&
      afterOutdentState['smoke-child-button'].y > beforeState['smoke-child-button'].y,
    `Outdent did not convert nested child to root-relative coordinates: ${JSON.stringify({ beforeState, afterOutdentState })}`,
  );

  return {
    nestedClick,
    nestedDrag,
    outdentClick,
    beforeState,
    afterNestedState,
    afterNestedDragState,
    afterNestTree,
    afterOutdentState,
    afterOutdentTree,
  };
};

const readSelectedLayerIds = async (client) => (
  evaluate(client, `(() => (
    Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean)
  ))()`)
);

const testLayersPanelControls = async (client, pageId) => {
  const initialTree = await readLayerTreeState(client, [
    'smoke-heading',
    'smoke-image',
    'smoke-box',
    'smoke-child-button',
    'smoke-form',
    'smoke-icon',
    'smoke-link',
  ]);
  assert(initialTree.rows.length >= 7, `Layers panel did not render expected layer rows: ${JSON.stringify(initialTree)}`);
  assert(
    initialTree.byId['smoke-child-button'].depth > initialTree.byId['smoke-box'].depth,
    `Layers panel did not show nested child depth: ${JSON.stringify(initialTree)}`,
  );

  const multiSelected = await selectLayerIds(client, ['smoke-heading', 'smoke-image']);
  assert(
    ['smoke-heading', 'smoke-image'].every((id) => multiSelected.selectedLayers?.includes(id)),
    `Layers panel multi-select did not retain selected rows: ${JSON.stringify(multiSelected)}`,
  );

  const reorder = await dragLayerRow(client, 'smoke-heading', 'smoke-image');

  await setLayerHiddenState(client, 'smoke-form', true);
  const hiddenState = await readLayerActionState(client, 'smoke-form');
  assert(hiddenState.hidden === true, `Layer visibility action did not hide smoke-form: ${JSON.stringify(hiddenState)}`);

  await setLayerLockedState(client, 'smoke-icon', true);
  const lockedState = await readLayerActionState(client, 'smoke-icon');
  assert(lockedState.locked === true, `Layer lock action did not lock smoke-icon: ${JSON.stringify(lockedState)}`);

  const duplicateClick = await clickLayerAction(client, 'duplicate', 'smoke-link');
  const selectedAfterDuplicate = await readSelectedLayerIds(client);
  const duplicateId = selectedAfterDuplicate.find((id) => id && id !== 'smoke-link');
  assert(
    duplicateId && duplicateId !== 'smoke-link',
    `Layer duplicate did not select a fresh duplicate row: ${JSON.stringify({ duplicateClick, selectedAfterDuplicate })}`,
  );
  const duplicateTree = await readLayerTreeState(client, ['smoke-link', duplicateId]);

  const deleteClick = await clickLayerAction(client, 'delete', duplicateId);
  const deletedDuplicate = await waitForElementPresence(client, duplicateId, false, 'after layer duplicate delete');

  await clickSave(client);
  const savedStatus = await waitForEditorSaveStatus(
    client,
    (status) => (
      status.saveState === 'saved' &&
      status.saveMode === 'manual' &&
      status.pendingChanges === 0 &&
      Boolean(status.lastSavedAt)
    ),
    'manual status after layers smoke save',
  );
  const persisted = await waitForPersistedLayerState(pageId, {
    'smoke-form': { hidden: true },
    'smoke-icon': { locked: true },
  });

  return {
    initialTree,
    multiSelected,
    reorder,
    hiddenState,
    lockedState,
    duplicateClick,
    duplicateId,
    duplicateTree,
    deleteClick,
    deletedDuplicate,
    savedStatus,
    persisted,
  };
};

const testSyncedReusableSectionInstance = async (client, sectionId) => {
  await selectElement(client, 'smoke-heading');

  const added = await evaluate(client, `(() => {
    const button = document.querySelector('[data-component-add="reusable-section:${sectionId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-add-button',
        reusableItems: Array.from(document.querySelectorAll('[data-component-library-item^="reusable-section:"]')).map((node) => ({
          item: node.getAttribute('data-component-library-item'),
          text: node.textContent?.trim?.().slice(0, 120) || '',
        })),
      };
    }

    button.click();
    return { ok: true, label: button.getAttribute('aria-label') || '' };
  })()`);
  assert(added?.ok, `Unable to add synced reusable section: ${JSON.stringify(added)}`);
  await sleep(350);

  const inserted = await evaluate(client, `(() => {
    const selectedElement = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ));
    const panel = document.querySelector('[data-testid="editor-reusable-instance"]');
    const refresh = document.querySelector('[data-testid="editor-refresh-reusable-instance"]');
    const detach = document.querySelector('[data-testid="editor-detach-reusable-instance"]');
    return {
      selectedElementId: selectedElement?.getAttribute('data-element-id') || null,
      panelText: panel?.textContent || '',
      refreshDisabled: refresh instanceof HTMLButtonElement ? refresh.disabled : null,
      detachDisabled: detach instanceof HTMLButtonElement ? detach.disabled : null,
      body: document.body?.innerText?.slice(0, 300) || '',
    };
  })()`);

  assert(inserted.selectedElementId, `Synced reusable insertion did not select the inserted root: ${JSON.stringify(inserted)}`);
  assert(/Synced section/i.test(inserted.panelText), `Synced reusable inspector card missing: ${JSON.stringify(inserted)}`);
  assert(inserted.refreshDisabled === false, `Synced reusable refresh control disabled: ${JSON.stringify(inserted)}`);
  assert(inserted.detachDisabled === false, `Synced reusable detach control disabled: ${JSON.stringify(inserted)}`);

  const beforeRefresh = await readEditorElementState(client, [inserted.selectedElementId]);

  await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      content: {
        canvasSize: { width: 360, height: 120 },
        elements: [
          {
            id: 'editor-smoke-reusable-root-updated',
            type: 'box',
            x: 0,
            y: 0,
            width: 360,
            height: 120,
            zIndex: 1,
            props: {
              backgroundColor: '#ecfeff',
              borderColor: '#0891b2',
              borderWidth: 1,
              borderRadius: 12,
            },
            children: [
              {
                id: 'editor-smoke-reusable-label-updated',
                type: 'heading',
                x: 24,
                y: 28,
                width: 260,
                height: 44,
                zIndex: 1,
                props: {
                  content: 'Reusable v2',
                  level: 'h2',
                  fontSize: 28,
                  color: '#155e75',
                },
              },
            ],
          },
        ],
      },
      updatedBy: 'admin',
    }),
  });

  const refreshedList = await evaluate(client, `(() => {
    const button = document.querySelector('button[title="Refresh saved sections"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(refreshedList, 'Unable to refresh saved section library after source update');
  await sleep(600);
  await selectLayerById(client, inserted.selectedElementId);
  await switchToPropertiesPanel(client);

  let reusableRefreshState = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    reusableRefreshState = await evaluate(client, `(() => {
      const selectedElement = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
        node.querySelector('[data-role="canvas-move-handle"]')
      ));
      const panel = document.querySelector('[data-testid="editor-reusable-instance"]');
      const button = document.querySelector('[data-testid="editor-refresh-reusable-instance"]');
      return {
        selectedElementId: selectedElement?.getAttribute('data-element-id') || null,
        hasPanel: Boolean(panel),
        panelText: panel?.textContent || '',
        hasButton: button instanceof HTMLButtonElement,
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent?.slice(0, 500) || '',
      };
    })()`);
    if (
      reusableRefreshState?.selectedElementId === inserted.selectedElementId &&
      reusableRefreshState.hasPanel &&
      reusableRefreshState.hasButton &&
      reusableRefreshState.disabled === false
    ) {
      break;
    }
    await sleep(150);
  }

  const refreshClicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-refresh-reusable-instance"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(refreshClicked, `Unable to refresh selected synced reusable instance: ${JSON.stringify(reusableRefreshState)}`);
  await sleep(350);

  const afterRefresh = await readEditorElementState(client, [inserted.selectedElementId]);
  const refreshedText = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${inserted.selectedElementId}"]');
    return node?.textContent || '';
  })()`);
  assert(
    afterRefresh[inserted.selectedElementId].width > beforeRefresh[inserted.selectedElementId].width &&
      afterRefresh[inserted.selectedElementId].height > beforeRefresh[inserted.selectedElementId].height,
    `Synced reusable refresh did not apply source dimensions: before ${JSON.stringify(beforeRefresh)}, after ${JSON.stringify(afterRefresh)}`,
  );
  assert(/Reusable v2/i.test(refreshedText), `Synced reusable refresh did not apply source content: ${JSON.stringify(refreshedText)}`);

  const detachClicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-detach-reusable-instance"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(detachClicked, 'Unable to detach synced reusable instance');
  await sleep(250);

  const afterDetach = await evaluate(client, `(() => ({
    hasPanel: Boolean(document.querySelector('[data-testid="editor-reusable-instance"]')),
    selectedElementId: Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ))?.getAttribute('data-element-id') || null,
  }))()`);
  assert(afterDetach.hasPanel === false, `Reusable section detach did not remove sync card: ${JSON.stringify(afterDetach)}`);

  return {
    sectionId,
    inserted,
    beforeRefresh,
    afterRefresh,
    afterDetach,
  };
};

const testCollectionDataBindingControls = async (client, collectionId) => {
  await selectLayerById(client, 'smoke-heading');

  let dataPanel = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    dataPanel = await evaluate(client, `(() => {
      const collection = document.querySelector('[data-testid="editor-data-collection"]');
      if (!collection) {
        const dataButton = Array.from(document.querySelectorAll('button')).find((button) => (
          (button.textContent || '').trim() === 'Data'
        ));
        if (dataButton instanceof HTMLButtonElement) {
          dataButton.click();
        }
      }
      const select = document.querySelector('[data-testid="editor-data-collection"]');
      return {
        hasCollectionSelect: select instanceof HTMLSelectElement,
        hasTargetCollection: select instanceof HTMLSelectElement
          ? Array.from(select.options).some((option) => option.value === ${JSON.stringify(collectionId)})
          : false,
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    })()`);

    if (dataPanel.hasCollectionSelect && dataPanel.hasTargetCollection) {
      break;
    }

    await sleep(200);
  }

  assert(dataPanel?.hasCollectionSelect && dataPanel?.hasTargetCollection, `Collection binding controls did not load target collection: ${JSON.stringify(dataPanel)}`);

  await setFormControlByTestId(client, 'editor-data-collection', collectionId);
  let queryControlsReady = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    queryControlsReady = await evaluate(client, `(() => {
      const optionValues = (testId) => {
        const select = document.querySelector('[data-testid="' + testId + '"]');
        return select instanceof HTMLSelectElement
          ? Array.from(select.options).map((option) => option.value)
          : [];
      };
      return {
        fields: optionValues('editor-data-field'),
        filterFields: optionValues('editor-data-query-filter-field'),
        sortFields: optionValues('editor-data-query-sort-by'),
      };
    })()`);
    if (
      queryControlsReady.fields.includes('title') &&
      queryControlsReady.filterFields.includes('category') &&
      queryControlsReady.sortFields.includes('rank')
    ) {
      break;
    }
    await sleep(200);
  }
  assert(
    queryControlsReady?.fields?.includes('title') &&
      queryControlsReady?.filterFields?.includes('category') &&
      queryControlsReady?.sortFields?.includes('rank'),
    `Collection binding field/query options did not render: ${JSON.stringify(queryControlsReady)}`,
  );
  await setFormControlByTestId(client, 'editor-data-field', 'title');
  await setFormControlByTestId(client, 'editor-data-target', 'props.content');
  await setFormControlByTestId(client, 'editor-data-query-search', 'featured');
  await setFormControlByTestId(client, 'editor-data-query-filter-field', 'category');
  await setFormControlByTestId(client, 'editor-data-query-filter-value', 'Featured');
  await setFormControlByTestId(client, 'editor-data-query-sort-by', 'rank');
  await setFormControlByTestId(client, 'editor-data-query-sort-direction', 'desc');
  await setFormControlByTestId(client, 'editor-data-query-limit', '1');
  await setFormControlByTestId(client, 'editor-data-query-offset', '0');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const summary = Array.from(document.querySelectorAll('[data-testid="editor-data-query-controls"] ~ div, [data-testid="editor-data-query-controls"]'))
      .map((node) => node.textContent || '')
      .join(' ');
    return {
      collectionId: value('editor-data-collection'),
      field: value('editor-data-field'),
      target: value('editor-data-target'),
      search: value('editor-data-query-search'),
      filterField: value('editor-data-query-filter-field'),
      filterValue: value('editor-data-query-filter-value'),
      sortBy: value('editor-data-query-sort-by'),
      sortDirection: value('editor-data-query-sort-direction'),
      limit: value('editor-data-query-limit'),
      offset: value('editor-data-query-offset'),
      summary,
    };
  })()`);

  assert(state.collectionId === collectionId, `Collection binding did not select collection: ${JSON.stringify(state)}`);
  assert(state.field === 'title' && state.target === 'props.content', `Collection binding field/target mismatch: ${JSON.stringify(state)}`);
  assert(state.search === 'featured' && state.filterField === 'category' && state.filterValue === 'Featured', `Collection query filter mismatch: ${JSON.stringify(state)}`);
  assert(state.sortBy === 'rank' && state.sortDirection === 'desc' && state.limit === '1' && state.offset === '0', `Collection query sort/page mismatch: ${JSON.stringify(state)}`);
  assert(/sort rank desc/i.test(state.summary) && /limit 1/i.test(state.summary), `Collection query summary missing: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedDataBinding = async (pageId, collectionId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const heading = findCanvasElement(elements, 'smoke-heading');
  const binding = Array.isArray(heading?.dataBindings)
    ? heading.dataBindings.find((candidate) => candidate?.source?.kind === 'collection')
    : null;

  assert(binding, `Persisted data binding missing from smoke-heading: ${JSON.stringify(heading)}`);
  assert(binding.datasetId === `dataset_${collectionId}`, `Persisted dataset id mismatch: ${JSON.stringify(binding)}`);
  assert(binding.targetPath === 'props.content', `Persisted binding target mismatch: ${JSON.stringify(binding)}`);
  assert(binding.source?.collectionId === collectionId && binding.source?.field === 'title', `Persisted binding source mismatch: ${JSON.stringify(binding)}`);
  assert(binding.query?.q === 'featured', `Persisted binding search query mismatch: ${JSON.stringify(binding)}`);
  assert(binding.query?.fieldKey === 'category' && binding.query?.fieldValue === 'Featured', `Persisted binding filter mismatch: ${JSON.stringify(binding)}`);
  assert(binding.query?.sortBy === 'rank' && binding.query?.sortDirection === 'desc', `Persisted binding sort mismatch: ${JSON.stringify(binding)}`);
  assert(binding.pagination?.limit === 1 && binding.pagination?.offset === 0, `Persisted binding pagination mismatch: ${JSON.stringify(binding)}`);

  return binding;
};

const testRepeaterControls = async (client, collectionId) => {
  await selectLayerById(client, 'smoke-repeater');

  let dataPanel = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    dataPanel = await evaluate(client, `(() => {
      const collection = document.querySelector('[data-testid="editor-repeater-collection"]');
      if (!collection) {
        const dataButton = Array.from(document.querySelectorAll('button')).find((button) => (
          (button.textContent || '').trim() === 'Data'
        ));
        if (dataButton instanceof HTMLButtonElement) {
          dataButton.click();
        }
      }
      const select = document.querySelector('[data-testid="editor-repeater-collection"]');
      return {
        hasCollectionSelect: select instanceof HTMLSelectElement,
        hasTargetCollection: select instanceof HTMLSelectElement
          ? Array.from(select.options).some((option) => option.value === ${JSON.stringify(collectionId)})
          : false,
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    })()`);

    if (dataPanel.hasCollectionSelect && dataPanel.hasTargetCollection) {
      break;
    }

    await sleep(200);
  }

  assert(dataPanel?.hasCollectionSelect && dataPanel?.hasTargetCollection, `Repeater controls did not load target collection: ${JSON.stringify(dataPanel)}`);

  await setFormControlByTestId(client, 'editor-repeater-collection', collectionId);
  let controlsReady = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    controlsReady = await evaluate(client, `(() => {
      const optionValues = (testId) => {
        const select = document.querySelector('[data-testid="' + testId + '"]');
        return select instanceof HTMLSelectElement
          ? Array.from(select.options).map((option) => option.value)
          : [];
      };
      return {
        titleFields: optionValues('editor-repeater-title-field'),
        descriptionFields: optionValues('editor-repeater-description-field'),
        imageFields: optionValues('editor-repeater-image-field'),
        filterFields: optionValues('editor-repeater-filter-field'),
        sortFields: optionValues('editor-repeater-sort-by'),
        hasLayoutControls: Boolean(document.querySelector('[data-testid="editor-repeater-layout-controls"]')),
      };
    })()`);
    if (
      controlsReady.titleFields.includes('title') &&
      controlsReady.descriptionFields.includes('summary') &&
      controlsReady.imageFields.includes('thumbnail') &&
      controlsReady.filterFields.includes('category') &&
      controlsReady.sortFields.includes('rank') &&
      controlsReady.hasLayoutControls
    ) {
      break;
    }
    await sleep(200);
  }

  assert(
    controlsReady?.titleFields?.includes('title') &&
      controlsReady?.descriptionFields?.includes('summary') &&
      controlsReady?.imageFields?.includes('thumbnail') &&
      controlsReady?.filterFields?.includes('category') &&
      controlsReady?.sortFields?.includes('rank') &&
      controlsReady?.hasLayoutControls,
    `Repeater field/query/layout controls did not render: ${JSON.stringify(controlsReady)}`,
  );

  await setFormControlByTestId(client, 'editor-repeater-dataset-id', `dataset_${collectionId}_smoke_repeater`);
  await setFormControlByTestId(client, 'editor-repeater-title-field', 'title');
  await setFormControlByTestId(client, 'editor-repeater-description-field', 'summary');
  await setFormControlByTestId(client, 'editor-repeater-image-field', 'thumbnail');
  await setFormControlByTestId(client, 'editor-repeater-search', 'featured');
  await setFormControlByTestId(client, 'editor-repeater-filter-field', 'category');
  await setFormControlByTestId(client, 'editor-repeater-filter-value', 'Featured');
  await setFormControlByTestId(client, 'editor-repeater-sort-by', 'rank');
  await setFormControlByTestId(client, 'editor-repeater-sort-direction', 'desc');
  await setFormControlByTestId(client, 'editor-repeater-limit', '2');
  await setFormControlByTestId(client, 'editor-repeater-offset', '0');
  await setFormControlByTestId(client, 'editor-repeater-columns', '2');
  await setFormControlByTestId(client, 'editor-repeater-gap', '18');
  await setFormControlByTestId(client, 'editor-repeater-empty-message', 'No matching records.');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const summary = Array.from(document.querySelectorAll('[data-testid="editor-repeater-controls"]'))
      .map((node) => node.textContent || '')
      .join(' ');
    return {
      collectionId: value('editor-repeater-collection'),
      datasetId: value('editor-repeater-dataset-id'),
      titleField: value('editor-repeater-title-field'),
      descriptionField: value('editor-repeater-description-field'),
      imageField: value('editor-repeater-image-field'),
      search: value('editor-repeater-search'),
      filterField: value('editor-repeater-filter-field'),
      filterValue: value('editor-repeater-filter-value'),
      sortBy: value('editor-repeater-sort-by'),
      sortDirection: value('editor-repeater-sort-direction'),
      limit: value('editor-repeater-limit'),
      offset: value('editor-repeater-offset'),
      columns: value('editor-repeater-columns'),
      gap: value('editor-repeater-gap'),
      emptyMessage: value('editor-repeater-empty-message'),
      summary,
    };
  })()`);

  assert(state.collectionId === collectionId, `Repeater did not select collection: ${JSON.stringify(state)}`);
  assert(state.datasetId === `dataset_${collectionId}_smoke_repeater`, `Repeater dataset id mismatch: ${JSON.stringify(state)}`);
  assert(state.titleField === 'title' && state.descriptionField === 'summary' && state.imageField === 'thumbnail', `Repeater field mapping mismatch: ${JSON.stringify(state)}`);
  assert(state.search === 'featured' && state.filterField === 'category' && state.filterValue === 'Featured', `Repeater query filter mismatch: ${JSON.stringify(state)}`);
  assert(state.sortBy === 'rank' && state.sortDirection === 'desc', `Repeater query sort mismatch: ${JSON.stringify(state)}`);
  assert(state.limit === '2' && state.offset === '0' && state.columns === '2' && state.gap === '18', `Repeater layout mismatch: ${JSON.stringify(state)}`);
  assert(/sort rank desc/i.test(state.summary) && /2 columns/i.test(state.summary), `Repeater summary missing: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedRepeater = async (pageId, collectionId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const repeater = findCanvasElement(elements, 'smoke-repeater');
  const props = repeater?.props || {};

  assert(repeater?.type === 'repeater', `Persisted repeater missing: ${JSON.stringify(repeater)}`);
  assert(props.collectionId === collectionId, `Persisted repeater collection mismatch: ${JSON.stringify(props)}`);
  assert(props.datasetId === `dataset_${collectionId}_smoke_repeater`, `Persisted repeater dataset mismatch: ${JSON.stringify(props)}`);
  assert(props.titleField === 'title' && props.descriptionField === 'summary' && props.imageField === 'thumbnail', `Persisted repeater field mapping mismatch: ${JSON.stringify(props)}`);
  assert(props.query?.q === 'featured', `Persisted repeater search mismatch: ${JSON.stringify(props)}`);
  assert(props.query?.fieldKey === 'category' && props.query?.fieldValue === 'Featured', `Persisted repeater filter mismatch: ${JSON.stringify(props)}`);
  assert(props.query?.sortBy === 'rank' && props.query?.sortDirection === 'desc', `Persisted repeater sort mismatch: ${JSON.stringify(props)}`);
  assert(props.limit === 2 && props.offset === 0 && props.columns === 2 && props.gap === 18, `Persisted repeater layout mismatch: ${JSON.stringify(props)}`);
  assert(props.emptyMessage === 'No matching records.', `Persisted repeater empty state mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testImageBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-image');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-image-src', SMOKE_IMAGE_SRC);
  await setFormControlByTestId(client, 'editor-image-alt', 'Smoke image alt');
  await setFormControlByTestId(client, 'editor-image-title', 'Smoke image title');
  await setFormControlByTestId(client, 'editor-image-object-fit', 'contain');
  await setFormControlByTestId(client, 'editor-image-object-position', '25% 75%');
  await setFormControlByTestId(client, 'editor-image-loading', 'eager');
  await setFormControlByTestId(client, 'editor-image-decoding', 'async');
  await setFormControlByTestId(client, 'editor-image-referrer-policy', 'origin');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-image"]');
    const image = node?.querySelector('img');
    return {
      src: value('editor-image-src'),
      alt: value('editor-image-alt'),
      title: value('editor-image-title'),
      objectFit: value('editor-image-object-fit'),
      objectPosition: value('editor-image-object-position'),
      loading: value('editor-image-loading'),
      decoding: value('editor-image-decoding'),
      referrerPolicy: value('editor-image-referrer-policy'),
      previewSrc: image?.getAttribute('src') || '',
      previewAlt: image?.getAttribute('alt') || '',
      previewTitle: image?.getAttribute('title') || '',
      previewLoading: image?.getAttribute('loading') || '',
      previewDecoding: image?.getAttribute('decoding') || '',
      previewReferrerPolicy: image?.getAttribute('referrerpolicy') || '',
      previewObjectFit: image ? getComputedStyle(image).objectFit : '',
      previewObjectPosition: image ? getComputedStyle(image).objectPosition : '',
    };
  })()`);

  assert(state.src === SMOKE_IMAGE_SRC && state.previewSrc === SMOKE_IMAGE_SRC, `Image src control mismatch: ${JSON.stringify(state)}`);
  assert(state.alt === 'Smoke image alt' && state.previewAlt === 'Smoke image alt', `Image alt control mismatch: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke image title' && state.previewTitle === 'Smoke image title', `Image title control mismatch: ${JSON.stringify(state)}`);
  assert(state.objectFit === 'contain' && state.previewObjectFit === 'contain', `Image object-fit mismatch: ${JSON.stringify(state)}`);
  assert(state.objectPosition === '25% 75%' && state.previewObjectPosition === '25% 75%', `Image object-position mismatch: ${JSON.stringify(state)}`);
  assert(state.loading === 'eager' && state.previewLoading === 'eager', `Image loading control mismatch: ${JSON.stringify(state)}`);
  assert(state.decoding === 'async' && state.previewDecoding === 'async', `Image decoding control mismatch: ${JSON.stringify(state)}`);
  assert(state.referrerPolicy === 'origin' && state.previewReferrerPolicy === 'origin', `Image referrer policy mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedImageBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const image = findCanvasElement(elements, 'smoke-image');
  const props = image?.props || {};

  assert(image?.type === 'image', `Persisted smoke-image missing: ${JSON.stringify(image)}`);
  assert(props.src === SMOKE_IMAGE_SRC, `Persisted image src mismatch: ${JSON.stringify(props)}`);
  assert(props.alt === 'Smoke image alt', `Persisted image alt mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Smoke image title', `Persisted image title mismatch: ${JSON.stringify(props)}`);
  assert(props.objectFit === 'contain', `Persisted image objectFit mismatch: ${JSON.stringify(props)}`);
  assert(props.objectPosition === '25% 75%', `Persisted image objectPosition mismatch: ${JSON.stringify(props)}`);
  assert(props.loading === 'eager', `Persisted image loading mismatch: ${JSON.stringify(props)}`);
  assert(props.decoding === 'async', `Persisted image decoding mismatch: ${JSON.stringify(props)}`);
  assert(props.referrerPolicy === 'origin', `Persisted image referrer policy mismatch: ${JSON.stringify(props)}`);

  return props;
};

const waitForUploadedMediaItem = async (client, filename) => {
  let lastState = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="media-library-modal"]');
      const items = Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).map((item) => ({
        id: item.getAttribute('data-media-id') || '',
        name: item.getAttribute('data-media-name') || '',
        type: item.getAttribute('data-media-type') || '',
        url: item.getAttribute('data-media-url') || '',
        scope: item.getAttribute('data-media-scope') || '',
        scopeTargetId: item.getAttribute('data-media-scope-target-id') || '',
      }));
      const uploadZone = document.querySelector('[data-testid="media-upload-dropzone"]');
      return {
        hasModal: Boolean(modal),
        activeTab: modal?.getAttribute('data-active-tab') || '',
        allowedTypes: modal?.getAttribute('data-allowed-types') || '',
        uploadFilter: modal?.getAttribute('data-upload-filter') || '',
        isUploading: uploadZone?.getAttribute('data-uploading') === 'true',
        error: document.querySelector('[data-testid="media-library-error"]')?.textContent || '',
        item: items.find((candidate) => candidate.name === ${JSON.stringify(filename)}) || null,
        itemCount: items.length,
      };
    })()`);

    if (lastState.error) {
      throw new Error(`Media upload modal reported an error: ${JSON.stringify(lastState)}`);
    }

    if (lastState.item?.id && lastState.item?.url) {
      return lastState;
    }

    await sleep(250);
  }

  throw new Error(`Uploaded media item did not appear in library: ${JSON.stringify(lastState)}`);
};

const clickMediaLibraryItemByName = async (client, filename) => {
  const clicked = await evaluate(client, `(() => {
    const item = Array.from(document.querySelectorAll('[data-testid="media-library-item"]'))
      .find((candidate) => candidate.getAttribute('data-media-name') === ${JSON.stringify(filename)});
    if (!(item instanceof HTMLButtonElement)) {
      return {
        ok: false,
        filename: ${JSON.stringify(filename)},
        available: Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).map((candidate) => candidate.getAttribute('data-media-name') || ''),
      };
    }
    item.click();
    return {
      ok: true,
      id: item.getAttribute('data-media-id') || '',
      name: item.getAttribute('data-media-name') || '',
      type: item.getAttribute('data-media-type') || '',
      url: item.getAttribute('data-media-url') || '',
      scope: item.getAttribute('data-media-scope') || '',
      scopeTargetId: item.getAttribute('data-media-scope-target-id') || '',
    };
  })()`);

  assert(clicked?.ok && clicked.id && clicked.url, `Unable to select uploaded media item: ${JSON.stringify(clicked)}`);
  await sleep(350);
  return clicked;
};

const waitForImageSourceValue = async (client, expectedUrl) => {
  let lastState = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const input = document.querySelector('[data-testid="editor-image-src"]');
      const modal = document.querySelector('[data-testid="media-library-modal"]');
      const node = document.querySelector('[data-element-id="smoke-image"]');
      const image = node?.querySelector('img');
      return {
        value: input instanceof HTMLInputElement ? input.value : '',
        modalOpen: Boolean(modal),
        previewSrc: image?.getAttribute('src') || '',
      };
    })()`);

    if (!lastState.modalOpen && lastState.value === expectedUrl && lastState.previewSrc === expectedUrl) {
      return lastState;
    }

    await sleep(150);
  }

  throw new Error(`Uploaded media did not update image source: ${JSON.stringify(lastState)}`);
};

const waitForPersistedImageMediaSelection = async (pageId, selectedMedia) => {
  let lastProps = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const element = findCanvasElement(payload.data?.page?.content?.elements || [], 'smoke-image');
    const props = element?.props || {};
    lastProps = props;

    if (
      props.src === selectedMedia.url &&
      props.mediaId === selectedMedia.id &&
      props.mediaScope === selectedMedia.scope &&
      (props.mediaScopeTargetId || '') === (selectedMedia.scopeTargetId || '')
    ) {
      return props;
    }

    await sleep(250);
  }

  throw new Error(`Persisted uploaded media selection mismatch: ${JSON.stringify({ selectedMedia, lastProps })}`);
};

const testMediaUploadModalControls = async (client, pageId) => {
  const uploadFile = createSmokeUploadImageFile();

  try {
    await selectLayerById(client, 'smoke-image');
    await switchToPropertiesPanel(client);
    await clickControlByTestId(client, 'editor-image-upload-media');

    const opened = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="media-library-modal"]');
      return {
        hasModal: Boolean(modal),
        activeTab: modal?.getAttribute('data-active-tab') || '',
        allowedTypes: modal?.getAttribute('data-allowed-types') || '',
        uploadFilter: modal?.getAttribute('data-upload-filter') || '',
        fileAccept: document.querySelector('[data-testid="media-upload-input"]')?.getAttribute('accept') || '',
        hasVisibility: Boolean(document.querySelector('[data-testid="media-upload-visibility"]')),
        hasFolder: Boolean(document.querySelector('[data-testid="media-upload-folder"]')),
      };
    })()`);

    assert(
      opened.hasModal &&
        opened.activeTab === 'upload' &&
        opened.allowedTypes === 'image' &&
        opened.uploadFilter === 'image' &&
        opened.fileAccept === 'image/*' &&
        opened.hasVisibility &&
        opened.hasFolder,
      `Image upload modal opened with unexpected state: ${JSON.stringify(opened)}`,
    );

    await setFileInputByTestId(client, 'media-upload-input', [uploadFile.filePath]);
    const uploaded = await waitForUploadedMediaItem(client, uploadFile.filename);
    const selected = await clickMediaLibraryItemByName(client, uploadFile.filename);
    const imageSource = await waitForImageSourceValue(client, selected.url);
    await clickSave(client);
    const savedStatus = await waitForEditorMutationReady(client, 'after media upload smoke save');
    const persisted = await waitForPersistedImageMediaSelection(pageId, selected);

    return {
      opened,
      uploaded,
      selected,
      imageSource,
      savedStatus,
      persisted,
    };
  } finally {
    try {
      fs.rmSync(uploadFile.filePath, { force: true });
    } catch {
      // Temp smoke upload file cleanup is best-effort.
    }
  }
};

const testIconBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-icon');
  await switchToPropertiesPanel(client);

  await clickControlByTestId(client, 'editor-icon-emoji-picker');
  const emojiPicker = await evaluate(client, `(() => {
    const modal = document.querySelector('[data-testid="editor-emoji-picker-modal"]');
    const option = document.querySelector('[data-testid="editor-emoji-option-2"]');
    return {
      hasModal: Boolean(modal),
      optionEmoji: option?.getAttribute('data-emoji') || '',
      modalText: modal?.textContent?.slice(0, 200) || '',
    };
  })()`);
  assert(
    emojiPicker.hasModal && emojiPicker.optionEmoji === SMOKE_ICON_PICKER_EMOJI,
    `Icon emoji picker did not open with expected common option: ${JSON.stringify(emojiPicker)}`,
  );
  await clickControlByTestId(client, 'editor-emoji-option-2');
  const emojiPickerClosed = await evaluate(client, `(() => !document.querySelector('[data-testid="editor-emoji-picker-modal"]'))()`);
  assert(emojiPickerClosed === true, 'Icon emoji picker did not close after selecting a common emoji');

  await setFormControlByTestId(client, 'editor-icon-size', '40');
  await setFormControlByTestId(client, 'editor-icon-color', '#0e7490');
  await setFormControlByTestId(client, 'editor-icon-title', 'Smoke icon title');
  await setFormControlByTestId(client, 'editor-icon-aria-label', 'Smoke check icon');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-icon"]');
    const icon = node?.querySelector('[role="img"]');
    return {
      icon: value('editor-icon-symbol'),
      size: value('editor-icon-size'),
      color: value('editor-icon-color'),
      title: value('editor-icon-title'),
      ariaLabel: value('editor-icon-aria-label'),
      previewText: icon?.textContent || '',
      previewTitle: icon?.getAttribute('title') || '',
      previewAriaLabel: icon?.getAttribute('aria-label') || '',
      previewFontSize: icon ? getComputedStyle(icon).fontSize : '',
      previewColor: icon ? getComputedStyle(icon).color : '',
    };
  })()`);

  assert(state.icon === SMOKE_ICON_PICKER_EMOJI && state.previewText === SMOKE_ICON_PICKER_EMOJI, `Icon picker symbol mismatch: ${JSON.stringify(state)}`);
  assert(state.size === '40' && state.previewFontSize === '40px', `Icon size mismatch: ${JSON.stringify(state)}`);
  assert(state.color === '#0e7490' && /14,\s*116,\s*144/.test(state.previewColor), `Icon color mismatch: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke icon title' && state.previewTitle === 'Smoke icon title', `Icon title mismatch: ${JSON.stringify(state)}`);
  assert(state.ariaLabel === 'Smoke check icon' && state.previewAriaLabel === 'Smoke check icon', `Icon aria label mismatch: ${JSON.stringify(state)}`);

  return {
    emojiPicker,
    state,
  };
};

const assertPersistedIconBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const icon = findCanvasElement(elements, 'smoke-icon');
  const props = icon?.props || {};

  assert(icon?.type === 'icon', `Persisted smoke-icon missing: ${JSON.stringify(icon)}`);
  assert(props.icon === SMOKE_ICON_PICKER_EMOJI, `Persisted icon symbol mismatch: ${JSON.stringify(props)}`);
  assert(props.size === 40, `Persisted icon size mismatch: ${JSON.stringify(props)}`);
  assert(props.color === '#0e7490', `Persisted icon color mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Smoke icon title', `Persisted icon title mismatch: ${JSON.stringify(props)}`);
  assert(props.ariaLabel === 'Smoke check icon', `Persisted icon aria label mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testListBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-list');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-list-type', 'number');
  await setFormControlByTestId(client, 'editor-list-marker', 'upper-alpha');
  await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="editor-list-indent"]');
    if (!(control instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(control, '-8');
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await setFormControlByTestId(client, 'editor-list-items', 'Discovery\n\nLaunch');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-list"]');
    const list = node?.querySelector('ol, ul');
    const items = Array.from(node?.querySelectorAll('li') || []).map((item) => item.textContent?.trim() || '');
    const style = list ? getComputedStyle(list) : null;
    return {
      listType: value('editor-list-type'),
      listMarker: value('editor-list-marker'),
      listIndent: value('editor-list-indent'),
      itemsText: value('editor-list-items'),
      previewTag: list?.tagName?.toLowerCase?.() || '',
      previewItems: items,
      previewListStyleType: style?.listStyleType || '',
      previewMarginLeft: style?.marginLeft || '',
    };
  })()`);

  assert(state.listType === 'number' && state.previewTag === 'ol', `List type mismatch: ${JSON.stringify(state)}`);
  assert(state.listMarker === 'upper-alpha' && state.previewListStyleType === 'upper-alpha', `List marker mismatch: ${JSON.stringify(state)}`);
  assert(state.listIndent === '0' && state.previewMarginLeft === '0px', `List indent clamp mismatch: ${JSON.stringify(state)}`);
  assert(
    state.itemsText === 'Discovery\n\nLaunch' &&
      JSON.stringify(state.previewItems) === JSON.stringify(['Discovery', '', 'Launch']),
    `List items mismatch: ${JSON.stringify(state)}`,
  );

  return state;
};

const assertPersistedListBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const list = findCanvasElement(elements, 'smoke-list');
  const props = list?.props || {};

  assert(list?.type === 'list', `Persisted smoke-list missing: ${JSON.stringify(list)}`);
  assert(props.listType === 'number', `Persisted list type mismatch: ${JSON.stringify(props)}`);
  assert(props.listMarker === 'upper-alpha', `Persisted list marker mismatch: ${JSON.stringify(props)}`);
  assert(props.listIndent === 0, `Persisted list indent clamp mismatch: ${JSON.stringify(props)}`);
  assert(JSON.stringify(props.items) === JSON.stringify(['Discovery', '', 'Launch']), `Persisted list items mismatch: ${JSON.stringify(props)}`);
  assert(Array.isArray(props.content), `Persisted list content missing: ${JSON.stringify(props)}`);
  assert(props.content?.[0]?.type === 'ol', `Persisted list content type mismatch: ${JSON.stringify(props.content)}`);
  assert(props.content?.[0]?.children?.length === 3, `Persisted list empty item structure mismatch: ${JSON.stringify(props.content)}`);

  return props;
};

const testDividerBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-divider');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-divider-color', '#dc2626');
  await setFormControlByTestId(client, 'editor-divider-thickness', '6');
  await setFormControlByTestId(client, 'editor-divider-style', 'dashed');
  await setFormControlByTestId(client, 'editor-divider-margin', '12');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-divider"]');
    const divider = node?.querySelector('hr');
    const style = divider ? getComputedStyle(divider) : null;
    return {
      color: value('editor-divider-color'),
      thickness: value('editor-divider-thickness'),
      borderStyle: value('editor-divider-style'),
      margin: value('editor-divider-margin'),
      previewBorderTopColor: style?.borderTopColor || '',
      previewBorderTopWidth: style?.borderTopWidth || '',
      previewBorderTopStyle: style?.borderTopStyle || '',
      previewMarginTop: style?.marginTop || '',
      previewMarginBottom: style?.marginBottom || '',
    };
  })()`);

  assert(state.color === '#dc2626' && /220,\s*38,\s*38/.test(state.previewBorderTopColor), `Divider color mismatch: ${JSON.stringify(state)}`);
  assert(state.thickness === '6' && state.previewBorderTopWidth === '6px', `Divider thickness mismatch: ${JSON.stringify(state)}`);
  assert(state.borderStyle === 'dashed' && state.previewBorderTopStyle === 'dashed', `Divider style mismatch: ${JSON.stringify(state)}`);
  assert(state.margin === '12' && state.previewMarginTop === '12px' && state.previewMarginBottom === '12px', `Divider margin mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedDividerBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const divider = findCanvasElement(elements, 'smoke-divider');
  const props = divider?.props || {};

  assert(divider?.type === 'divider', `Persisted smoke-divider missing: ${JSON.stringify(divider)}`);
  assert(props.borderColor === '#dc2626', `Persisted divider color mismatch: ${JSON.stringify(props)}`);
  assert(props.thickness === 6, `Persisted divider thickness mismatch: ${JSON.stringify(props)}`);
  assert(props.borderStyle === 'dashed', `Persisted divider style mismatch: ${JSON.stringify(props)}`);
  assert(props.margin === 12, `Persisted divider margin mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testColumnsBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-columns');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-columns-count', '3');
  await setFormControlByTestId(client, 'editor-columns-gap', '24');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-columns"]');
    const surface = node?.firstElementChild;
    const style = surface ? getComputedStyle(surface) : null;
    return {
      columns: value('editor-columns-count'),
      gap: value('editor-columns-gap'),
      previewDisplay: style?.display || '',
      previewGridTemplateColumns: style?.gridTemplateColumns || '',
      previewGap: style?.gap || '',
    };
  })()`);

  assert(state.columns === '3', `Columns count control mismatch: ${JSON.stringify(state)}`);
  assert(state.gap === '24' && state.previewGap === '24px', `Columns gap mismatch: ${JSON.stringify(state)}`);
  assert(state.previewDisplay === 'grid', `Columns preview did not render as grid: ${JSON.stringify(state)}`);
  assert((state.previewGridTemplateColumns.match(/\d+px/g) || []).length === 3, `Columns preview did not render three tracks: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedColumnsBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const columns = findCanvasElement(elements, 'smoke-columns');
  const props = columns?.props || {};

  assert(columns?.type === 'columns', `Persisted smoke-columns missing: ${JSON.stringify(columns)}`);
  assert(props.columns === 3, `Persisted columns count mismatch: ${JSON.stringify(props)}`);
  assert(props.gap === 24, `Persisted columns gap mismatch: ${JSON.stringify(props)}`);

  return props;
};

const normalizeNavItem = (item) => {
  if (typeof item === 'string') {
    const [label, ...hrefParts] = item.split(':');
    return {
      label: label.trim(),
      href: hrefParts.join(':').trim() || '',
    };
  }

  if (item && typeof item === 'object') {
    return {
      label: String(item.label || item.title || item.name || '').trim(),
      href: String(item.href || item.url || item.path || '').trim(),
    };
  }

  return { label: '', href: '' };
};

const testNavBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-nav');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-nav-items', 'Docs: /docs\nPricing: /pricing\nContact: /contact');
  await setFormControlByTestId(client, 'editor-nav-direction', 'vertical');
  await setFormControlByTestId(client, 'editor-nav-gap', '22');
  await setFormControlByTestId(client, 'editor-nav-aria-label', 'Smoke primary navigation');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const nav = document.querySelector('[data-element-id="smoke-nav"] nav');
    const style = nav ? getComputedStyle(nav) : null;
    const links = Array.from(nav?.querySelectorAll('a') || []).map((link) => ({
      label: link.textContent?.trim() || '',
      href: link.getAttribute('href') || '',
    }));
    return {
      items: value('editor-nav-items'),
      direction: value('editor-nav-direction'),
      gap: value('editor-nav-gap'),
      ariaLabel: value('editor-nav-aria-label'),
      previewAriaLabel: nav?.getAttribute('aria-label') || '',
      previewFlexDirection: style?.flexDirection || '',
      previewGap: style?.gap || '',
      links,
    };
  })()`);

  assert(state.items.includes('Docs: /docs') && state.items.includes('Pricing: /pricing'), `Nav items control mismatch: ${JSON.stringify(state)}`);
  assert(state.direction === 'vertical' && state.previewFlexDirection === 'column', `Nav direction mismatch: ${JSON.stringify(state)}`);
  assert(state.gap === '22' && state.previewGap === '22px', `Nav gap mismatch: ${JSON.stringify(state)}`);
  assert(state.ariaLabel === 'Smoke primary navigation' && state.previewAriaLabel === 'Smoke primary navigation', `Nav aria label mismatch: ${JSON.stringify(state)}`);
  assert(state.links.length === 3 && state.links[0].label === 'Docs' && state.links[1].label === 'Pricing', `Nav links mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedNavBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const nav = findCanvasElement(elements, 'smoke-nav');
  const props = nav?.props || {};
  const navItems = Array.isArray(props.navItems) ? props.navItems.map(normalizeNavItem) : [];

  assert(nav?.type === 'nav', `Persisted smoke-nav missing: ${JSON.stringify(nav)}`);
  assert(navItems.length === 3, `Persisted nav items length mismatch: ${JSON.stringify(props)}`);
  assert(navItems[0].label === 'Docs' && navItems[0].href === '/docs', `Persisted nav first item mismatch: ${JSON.stringify(props)}`);
  assert(navItems[1].label === 'Pricing' && navItems[1].href === '/pricing', `Persisted nav second item mismatch: ${JSON.stringify(props)}`);
  assert(props.navDirection === 'vertical', `Persisted nav direction mismatch: ${JSON.stringify(props)}`);
  assert(props.gap === 22, `Persisted nav gap mismatch: ${JSON.stringify(props)}`);
  assert(props.ariaLabel === 'Smoke primary navigation', `Persisted nav aria label mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testSpacerBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-spacer');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-layout-width', '260');
  await setFormControlByTestId(client, 'editor-layout-height', '48');
  await setFormControlByTestId(client, 'editor-spacer-background-color', '#f1f5f9');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-spacer"]');
    const surface = node?.firstElementChild;
    const nodeStyle = node ? getComputedStyle(node) : null;
    const style = surface ? getComputedStyle(surface) : null;
    return {
      width: value('editor-layout-width'),
      height: value('editor-layout-height'),
      backgroundColor: value('editor-spacer-background-color'),
      previewBackgroundColor: style?.backgroundColor || '',
      previewAriaHidden: surface?.getAttribute('aria-hidden') || '',
      previewWidth: nodeStyle?.width || '',
      previewHeight: nodeStyle?.height || '',
    };
  })()`);

  assert(state.width === '260' && state.previewWidth === '260px', `Spacer width mismatch: ${JSON.stringify(state)}`);
  assert(state.height === '48' && state.previewHeight === '48px', `Spacer height mismatch: ${JSON.stringify(state)}`);
  assert(state.backgroundColor === '#f1f5f9' && /241,\s*245,\s*249/.test(state.previewBackgroundColor), `Spacer background mismatch: ${JSON.stringify(state)}`);
  assert(state.previewAriaHidden === 'true', `Spacer aria-hidden mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedSpacerBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const spacer = findCanvasElement(elements, 'smoke-spacer');
  const props = spacer?.props || {};

  assert(spacer?.type === 'spacer', `Persisted smoke-spacer missing: ${JSON.stringify(spacer)}`);
  assert(spacer.width === 260, `Persisted spacer width mismatch: ${JSON.stringify(spacer)}`);
  assert(spacer.height === 48, `Persisted spacer height mismatch: ${JSON.stringify(spacer)}`);
  assert(props.backgroundColor === '#f1f5f9', `Persisted spacer background mismatch: ${JSON.stringify(props)}`);

  return { width: spacer.width, height: spacer.height, props };
};

const testQuoteBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-quote');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-quote-citation', 'Smoke source');
  await setFormControlByTestId(client, 'editor-quote-border-color', '#7c3aed');
  await setFormControlByTestId(client, 'editor-quote-border-width', '6');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-quote"]');
    const surface = node?.firstElementChild;
    const style = surface ? getComputedStyle(surface) : null;
    return {
      citation: value('editor-quote-citation'),
      borderColor: value('editor-quote-border-color'),
      borderWidth: value('editor-quote-border-width'),
      previewCitation: surface?.querySelector('cite')?.textContent?.trim() || '',
      previewBorderLeftWidth: style?.borderLeftWidth || '',
      previewBorderLeftColor: style?.borderLeftColor || '',
      previewText: surface?.textContent?.trim() || '',
    };
  })()`);

  assert(state.citation === 'Smoke source' && state.previewCitation === 'Smoke source', `Quote citation mismatch: ${JSON.stringify(state)}`);
  assert(state.borderColor === '#7c3aed' && /124,\s*58,\s*237/.test(state.previewBorderLeftColor), `Quote border color mismatch: ${JSON.stringify(state)}`);
  assert(state.borderWidth === '6' && state.previewBorderLeftWidth === '6px', `Quote border width mismatch: ${JSON.stringify(state)}`);
  assert(state.previewText.includes('Initial smoke quote'), `Quote rich text preview missing Slate content: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedQuoteBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const quote = findCanvasElement(elements, 'smoke-quote');
  const props = quote?.props || {};
  const quoteText = Array.isArray(props.content)
    ? props.content.map((node) => JSON.stringify(node)).join(' ')
    : String(props.content || '');

  assert(quote?.type === 'quote', `Persisted smoke-quote missing: ${JSON.stringify(quote)}`);
  assert(quoteText.includes('Initial smoke quote'), `Persisted quote Slate content mismatch: ${JSON.stringify(props.content)}`);
  assert(props.citation === 'Smoke source', `Persisted quote citation mismatch: ${JSON.stringify(props)}`);
  assert(props.quoteBorderColor === '#7c3aed', `Persisted quote border color mismatch: ${JSON.stringify(props)}`);
  assert(props.quoteBorderWidth === 6, `Persisted quote border width mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testInputFieldBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-input');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-field-label', 'Smoke input label');
  await setFormControlByTestId(client, 'editor-field-name', 'smoke_email');
  await setFormControlByTestId(client, 'editor-field-form-owner-id', 'smoke-lead-capture');
  await setCheckboxByTestId(client, 'editor-field-required', true);
  await setFormControlByTestId(client, 'editor-field-placeholder', 'name@example.com');
  await setFormControlByTestId(client, 'editor-field-help-text', 'Use a reachable email address.');
  await setFormControlByTestId(client, 'editor-input-type', 'email');
  await setFormControlByTestId(client, 'editor-input-pattern', '.+@example[.]com');
  await setFormControlByTestId(client, 'editor-input-min-length', '6');
  await setFormControlByTestId(client, 'editor-input-max-length', '64');
  await setFormControlByTestId(client, 'editor-input-default-value', 'test@example.com');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-input"]');
    const label = node?.querySelector('label');
    const input = node?.querySelector('input');
    const help = node?.querySelector('p');
    return {
      label: value('editor-field-label'),
      name: value('editor-field-name'),
      formOwnerId: value('editor-field-form-owner-id'),
      required: checked('editor-field-required'),
      placeholder: value('editor-field-placeholder'),
      helpText: value('editor-field-help-text'),
      inputType: value('editor-input-type'),
      pattern: value('editor-input-pattern'),
      minLength: value('editor-input-min-length'),
      maxLength: value('editor-input-max-length'),
      defaultValue: value('editor-input-default-value'),
      previewLabel: label?.textContent || '',
      previewName: input?.getAttribute('name') || '',
      previewFormOwnerId: input?.getAttribute('form') || '',
      previewOwnerData: node?.querySelector('[data-backy-form-owner-id]')?.getAttribute('data-backy-form-owner-id') || '',
      previewRequired: input instanceof HTMLInputElement ? input.required : null,
      previewPlaceholder: input?.getAttribute('placeholder') || '',
      previewType: input?.getAttribute('type') || '',
      previewPattern: input?.getAttribute('pattern') || '',
      previewMinLength: input?.getAttribute('minlength') || '',
      previewMaxLength: input?.getAttribute('maxlength') || '',
      previewValue: input instanceof HTMLInputElement ? input.value : '',
      previewHelpText: help?.textContent || '',
    };
  })()`);

  assert(state.label === 'Smoke input label' && state.previewLabel.includes('Smoke input label'), `Input label mismatch: ${JSON.stringify(state)}`);
  assert(state.name === 'smoke_email' && state.previewName === 'smoke_email', `Input name mismatch: ${JSON.stringify(state)}`);
  assert(state.formOwnerId === 'smoke-lead-capture' && state.previewFormOwnerId === 'smoke-lead-capture' && state.previewOwnerData === 'smoke-lead-capture', `Input form owner mismatch: ${JSON.stringify(state)}`);
  assert(state.required === true && state.previewRequired === true && state.previewLabel.includes('*'), `Input required mismatch: ${JSON.stringify(state)}`);
  assert(state.placeholder === 'name@example.com' && state.previewPlaceholder === 'name@example.com', `Input placeholder mismatch: ${JSON.stringify(state)}`);
  assert(state.helpText === 'Use a reachable email address.' && state.previewHelpText === 'Use a reachable email address.', `Input help text mismatch: ${JSON.stringify(state)}`);
  assert(state.inputType === 'email' && state.previewType === 'email', `Input type mismatch: ${JSON.stringify(state)}`);
  assert(state.pattern === '.+@example[.]com' && state.previewPattern === '.+@example[.]com', `Input pattern mismatch: ${JSON.stringify(state)}`);
  assert(state.minLength === '6' && state.previewMinLength === '6', `Input minLength mismatch: ${JSON.stringify(state)}`);
  assert(state.maxLength === '64' && state.previewMaxLength === '64', `Input maxLength mismatch: ${JSON.stringify(state)}`);
  assert(state.defaultValue === 'test@example.com' && state.previewValue === 'test@example.com', `Input default value mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedInputFieldBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const input = findCanvasElement(elements, 'smoke-input');
  const props = input?.props || {};

  assert(input?.type === 'input', `Persisted smoke-input missing: ${JSON.stringify(input)}`);
  assert(props.label === 'Smoke input label', `Persisted input label mismatch: ${JSON.stringify(props)}`);
  assert(props.name === 'smoke_email', `Persisted input name mismatch: ${JSON.stringify(props)}`);
  assert(props.formOwnerId === 'smoke-lead-capture', `Persisted input form owner mismatch: ${JSON.stringify(props)}`);
  assert(props.required === true, `Persisted input required mismatch: ${JSON.stringify(props)}`);
  assert(props.placeholder === 'name@example.com', `Persisted input placeholder mismatch: ${JSON.stringify(props)}`);
  assert(props.helpText === 'Use a reachable email address.', `Persisted input help text mismatch: ${JSON.stringify(props)}`);
  assert(props.inputType === 'email', `Persisted input type mismatch: ${JSON.stringify(props)}`);
  assert(props.pattern === '.+@example[.]com', `Persisted input pattern mismatch: ${JSON.stringify(props)}`);
  assert(props.minLength === 6, `Persisted input minLength mismatch: ${JSON.stringify(props)}`);
  assert(props.maxLength === 64, `Persisted input maxLength mismatch: ${JSON.stringify(props)}`);
  assert(props.defaultValue === 'test@example.com', `Persisted input default value mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testTextareaFieldBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-textarea');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-field-label', 'Smoke textarea label');
  await setFormControlByTestId(client, 'editor-field-name', 'smoke_message');
  await setCheckboxByTestId(client, 'editor-field-required', true);
  await setFormControlByTestId(client, 'editor-field-placeholder', 'Write a detailed message');
  await setFormControlByTestId(client, 'editor-field-help-text', 'Minimum ten characters.');
  await setFormControlByTestId(client, 'editor-textarea-rows', '6');
  await setFormControlByTestId(client, 'editor-textarea-min-length', '10');
  await setFormControlByTestId(client, 'editor-textarea-max-length', '240');
  await setFormControlByTestId(client, 'editor-textarea-default-value', 'Textarea default body');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-textarea"]');
    const label = node?.querySelector('label');
    const textarea = node?.querySelector('textarea');
    const help = node?.querySelector('p');
    return {
      label: value('editor-field-label'),
      name: value('editor-field-name'),
      required: checked('editor-field-required'),
      placeholder: value('editor-field-placeholder'),
      helpText: value('editor-field-help-text'),
      rows: value('editor-textarea-rows'),
      minLength: value('editor-textarea-min-length'),
      maxLength: value('editor-textarea-max-length'),
      defaultValue: value('editor-textarea-default-value'),
      previewLabel: label?.textContent || '',
      previewName: textarea?.getAttribute('name') || '',
      previewRequired: textarea instanceof HTMLTextAreaElement ? textarea.required : null,
      previewPlaceholder: textarea?.getAttribute('placeholder') || '',
      previewRows: textarea?.getAttribute('rows') || '',
      previewMinLength: textarea?.getAttribute('minlength') || '',
      previewMaxLength: textarea?.getAttribute('maxlength') || '',
      previewValue: textarea instanceof HTMLTextAreaElement ? textarea.value : '',
      previewHelpText: help?.textContent || '',
    };
  })()`);

  assert(state.label === 'Smoke textarea label' && state.previewLabel.includes('Smoke textarea label'), `Textarea label mismatch: ${JSON.stringify(state)}`);
  assert(state.name === 'smoke_message' && state.previewName === 'smoke_message', `Textarea name mismatch: ${JSON.stringify(state)}`);
  assert(state.required === true && state.previewRequired === true && state.previewLabel.includes('*'), `Textarea required mismatch: ${JSON.stringify(state)}`);
  assert(state.placeholder === 'Write a detailed message' && state.previewPlaceholder === 'Write a detailed message', `Textarea placeholder mismatch: ${JSON.stringify(state)}`);
  assert(state.helpText === 'Minimum ten characters.' && state.previewHelpText === 'Minimum ten characters.', `Textarea help text mismatch: ${JSON.stringify(state)}`);
  assert(state.rows === '6' && state.previewRows === '6', `Textarea rows mismatch: ${JSON.stringify(state)}`);
  assert(state.minLength === '10' && state.previewMinLength === '10', `Textarea minLength mismatch: ${JSON.stringify(state)}`);
  assert(state.maxLength === '240' && state.previewMaxLength === '240', `Textarea maxLength mismatch: ${JSON.stringify(state)}`);
  assert(state.defaultValue === 'Textarea default body' && state.previewValue === 'Textarea default body', `Textarea default value mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedTextareaFieldBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const textarea = findCanvasElement(elements, 'smoke-textarea');
  const props = textarea?.props || {};

  assert(textarea?.type === 'textarea', `Persisted smoke-textarea missing: ${JSON.stringify(textarea)}`);
  assert(props.label === 'Smoke textarea label', `Persisted textarea label mismatch: ${JSON.stringify(props)}`);
  assert(props.name === 'smoke_message', `Persisted textarea name mismatch: ${JSON.stringify(props)}`);
  assert(props.required === true, `Persisted textarea required mismatch: ${JSON.stringify(props)}`);
  assert(props.placeholder === 'Write a detailed message', `Persisted textarea placeholder mismatch: ${JSON.stringify(props)}`);
  assert(props.helpText === 'Minimum ten characters.', `Persisted textarea help text mismatch: ${JSON.stringify(props)}`);
  assert(props.rows === 6, `Persisted textarea rows mismatch: ${JSON.stringify(props)}`);
  assert(props.minLength === 10, `Persisted textarea minLength mismatch: ${JSON.stringify(props)}`);
  assert(props.maxLength === 240, `Persisted textarea maxLength mismatch: ${JSON.stringify(props)}`);
  assert(props.defaultValue === 'Textarea default body', `Persisted textarea default value mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testSelectFieldBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-select');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-field-label', 'Smoke select label');
  await setFormControlByTestId(client, 'editor-field-name', 'smoke_plan');
  await setCheckboxByTestId(client, 'editor-field-required', true);
  await setFormControlByTestId(client, 'editor-field-placeholder', 'Choose a plan');
  await setFormControlByTestId(client, 'editor-field-help-text', 'Select the plan that fits.');
  await setFormControlByTestId(client, 'editor-field-options', 'Starter\nGrowth\nScale');
  await setFormControlByTestId(client, 'editor-select-default-value', 'Growth');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-select"]');
    const label = node?.querySelector('label');
    const select = node?.querySelector('select');
    const help = node?.querySelector('p');
    return {
      label: value('editor-field-label'),
      name: value('editor-field-name'),
      required: checked('editor-field-required'),
      placeholder: value('editor-field-placeholder'),
      helpText: value('editor-field-help-text'),
      optionsText: value('editor-field-options'),
      defaultValue: value('editor-select-default-value'),
      previewLabel: label?.textContent || '',
      previewName: select?.getAttribute('name') || '',
      previewRequired: select instanceof HTMLSelectElement ? select.required : null,
      previewValue: select instanceof HTMLSelectElement ? select.value : '',
      previewOptions: select ? Array.from(select.options).map((option) => option.value) : [],
      previewHelpText: help?.textContent || '',
    };
  })()`);

  assert(state.label === 'Smoke select label' && state.previewLabel.includes('Smoke select label'), `Select label mismatch: ${JSON.stringify(state)}`);
  assert(state.name === 'smoke_plan' && state.previewName === 'smoke_plan', `Select name mismatch: ${JSON.stringify(state)}`);
  assert(state.required === true && state.previewRequired === true && state.previewLabel.includes('*'), `Select required mismatch: ${JSON.stringify(state)}`);
  assert(state.placeholder === 'Choose a plan', `Select placeholder control mismatch: ${JSON.stringify(state)}`);
  assert(state.helpText === 'Select the plan that fits.' && state.previewHelpText === 'Select the plan that fits.', `Select help text mismatch: ${JSON.stringify(state)}`);
  assert(state.optionsText === 'Starter\nGrowth\nScale', `Select options control mismatch: ${JSON.stringify(state)}`);
  assert(JSON.stringify(state.previewOptions) === JSON.stringify(['', 'Starter', 'Growth', 'Scale']), `Select preview options mismatch: ${JSON.stringify(state)}`);
  assert(state.defaultValue === 'Growth' && state.previewValue === 'Growth', `Select default value mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedSelectFieldBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const select = findCanvasElement(elements, 'smoke-select');
  const props = select?.props || {};

  assert(select?.type === 'select', `Persisted smoke-select missing: ${JSON.stringify(select)}`);
  assert(props.label === 'Smoke select label', `Persisted select label mismatch: ${JSON.stringify(props)}`);
  assert(props.name === 'smoke_plan', `Persisted select name mismatch: ${JSON.stringify(props)}`);
  assert(props.required === true, `Persisted select required mismatch: ${JSON.stringify(props)}`);
  assert(props.placeholder === 'Choose a plan', `Persisted select placeholder mismatch: ${JSON.stringify(props)}`);
  assert(props.helpText === 'Select the plan that fits.', `Persisted select help text mismatch: ${JSON.stringify(props)}`);
  assert(Array.isArray(props.options) && JSON.stringify(props.options) === JSON.stringify(['Starter', 'Growth', 'Scale']), `Persisted select options mismatch: ${JSON.stringify(props)}`);
  assert(props.defaultValue === 'Growth', `Persisted select default value mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testChoiceFieldBehaviorControls = async (client, elementId, fieldType, expected) => {
  await selectLayerById(client, elementId);
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-field-label', expected.label);
  await setFormControlByTestId(client, 'editor-field-name', expected.name);
  await setCheckboxByTestId(client, 'editor-field-required', true);
  await setFormControlByTestId(client, 'editor-field-placeholder', expected.placeholder);
  await setFormControlByTestId(client, 'editor-field-help-text', expected.helpText);
  await setFormControlByTestId(client, 'editor-field-options', expected.options.join('\n'));
  await setFormControlByTestId(client, 'editor-choice-value', expected.value);

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="${elementId}"]');
    const groupLabel = node?.querySelector('label, div');
    const inputs = Array.from(node?.querySelectorAll('input[type="${fieldType}"]') || []);
    const help = node?.querySelector('p');
    return {
      label: value('editor-field-label'),
      name: value('editor-field-name'),
      required: checked('editor-field-required'),
      placeholder: value('editor-field-placeholder'),
      helpText: value('editor-field-help-text'),
      optionsText: value('editor-field-options'),
      selectedValue: value('editor-choice-value'),
      previewLabel: groupLabel?.textContent || '',
      previewInputs: inputs.map((input) => ({
        name: input.getAttribute('name') || '',
        value: input.getAttribute('value') || '',
        required: input.required,
        checked: input.checked,
      })),
      previewHelpText: help?.textContent || '',
    };
  })()`);

  assert(state.label === expected.label && state.previewLabel.includes(expected.label), `${fieldType} label mismatch: ${JSON.stringify(state)}`);
  assert(state.name === expected.name, `${fieldType} name control mismatch: ${JSON.stringify(state)}`);
  assert(state.required === true && state.previewInputs.some((input) => input.required), `${fieldType} required mismatch: ${JSON.stringify(state)}`);
  assert(state.placeholder === expected.placeholder, `${fieldType} placeholder control mismatch: ${JSON.stringify(state)}`);
  assert(state.helpText === expected.helpText && state.previewHelpText === expected.helpText, `${fieldType} help text mismatch: ${JSON.stringify(state)}`);
  assert(state.optionsText === expected.options.join('\n'), `${fieldType} options control mismatch: ${JSON.stringify(state)}`);
  assert(JSON.stringify(state.previewInputs.map((input) => input.value)) === JSON.stringify(expected.options), `${fieldType} preview options mismatch: ${JSON.stringify(state)}`);
  assert(state.previewInputs.every((input) => input.name === expected.name), `${fieldType} preview names mismatch: ${JSON.stringify(state)}`);
  assert(state.selectedValue === expected.value && state.previewInputs.some((input) => input.value === expected.value && input.checked), `${fieldType} selected value mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedChoiceFieldBehavior = async (pageId, elementId, fieldType, expected) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const field = findCanvasElement(elements, elementId);
  const props = field?.props || {};

  assert(field?.type === fieldType, `Persisted ${elementId} missing: ${JSON.stringify(field)}`);
  assert(props.label === expected.label, `Persisted ${fieldType} label mismatch: ${JSON.stringify(props)}`);
  assert(props.name === expected.name, `Persisted ${fieldType} name mismatch: ${JSON.stringify(props)}`);
  assert(props.required === true, `Persisted ${fieldType} required mismatch: ${JSON.stringify(props)}`);
  assert(props.placeholder === expected.placeholder, `Persisted ${fieldType} placeholder mismatch: ${JSON.stringify(props)}`);
  assert(props.helpText === expected.helpText, `Persisted ${fieldType} help text mismatch: ${JSON.stringify(props)}`);
  assert(Array.isArray(props.options) && JSON.stringify(props.options) === JSON.stringify(expected.options), `Persisted ${fieldType} options mismatch: ${JSON.stringify(props)}`);
  assert(props.value === expected.value && props.defaultValue === expected.value, `Persisted ${fieldType} selected value mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testButtonLinkBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-child-button');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-button-label', 'Smoke signup button');
  await setFormControlByTestId(client, 'editor-button-action-preset', 'email');
  await setFormControlByTestId(client, 'editor-button-action-value', 'sales@example.com');
  await setFormControlByTestId(client, 'editor-button-target', '_blank');
  await setFormControlByTestId(client, 'editor-button-rel', 'noopener noreferrer nofollow');
  await setFormControlByTestId(client, 'editor-button-aria-label', 'Open signup page');
  await setFormControlByTestId(client, 'editor-button-title', 'Start signup');
  await setFormControlByTestId(client, 'editor-button-type', 'button');
  await setFormControlByTestId(client, 'editor-style-font-size', '18');
  await setFormControlByTestId(client, 'editor-style-font-weight', '700');
  await setFormControlByTestId(client, 'editor-style-text-color', '#ffffff');
  await setFormControlByTestId(client, 'editor-style-background-color', '#16a34a');
  await ensurePropertySectionExpanded(client, 'Appearance');
  await setFormControlByTestId(client, 'editor-appearance-border-radius', '12');
  await setFormControlByTestId(client, 'editor-appearance-padding', '14');
  await setFormControlByTestId(client, 'editor-appearance-box-shadow', '0 8px 16px rgba(22, 163, 74, 0.25)');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const node = document.querySelector('[data-element-id="smoke-child-button"]');
    const interactive = node?.querySelector('a, button');
    const style = interactive ? getComputedStyle(interactive) : null;
    return {
      label: value('editor-button-label'),
      actionPreset: value('editor-button-action-preset'),
      actionValue: value('editor-button-action-value'),
      href: value('editor-button-href'),
      target: value('editor-button-target'),
      rel: value('editor-button-rel'),
      ariaLabel: value('editor-button-aria-label'),
      title: value('editor-button-title'),
      type: value('editor-button-type'),
      previewText: interactive?.textContent || '',
      fontSize: value('editor-style-font-size'),
      fontWeight: value('editor-style-font-weight'),
      color: value('editor-style-text-color'),
      backgroundColor: value('editor-style-background-color'),
      borderRadius: value('editor-appearance-border-radius'),
      padding: value('editor-appearance-padding'),
      boxShadow: value('editor-appearance-box-shadow'),
      previewFontSize: style?.fontSize || '',
      previewFontWeight: style?.fontWeight || '',
      previewColor: style?.color || '',
      previewBackgroundColor: style?.backgroundColor || '',
      previewBorderRadius: style?.borderRadius || '',
      previewPadding: style?.padding || '',
      previewBoxShadow: style?.boxShadow || '',
    };
  })()`);

  assert(state.label === 'Smoke signup button' && state.previewText === 'Smoke signup button', `Button label mismatch: ${JSON.stringify(state)}`);
  assert(state.actionPreset === 'email', `Button action preset mismatch: ${JSON.stringify(state)}`);
  assert(state.actionValue === 'sales@example.com', `Button action value mismatch: ${JSON.stringify(state)}`);
  assert(state.href === 'mailto:sales@example.com', `Button href control mismatch: ${JSON.stringify(state)}`);
  assert(state.target === '_blank', `Button target control mismatch: ${JSON.stringify(state)}`);
  assert(state.rel === 'noopener noreferrer nofollow', `Button rel control mismatch: ${JSON.stringify(state)}`);
  assert(state.ariaLabel === 'Open signup page' && state.title === 'Start signup', `Button accessibility/title controls mismatch: ${JSON.stringify(state)}`);
  assert(state.type === 'button', `Button type control mismatch: ${JSON.stringify(state)}`);
  assert(state.fontSize === '18' && state.previewFontSize === '18px', `Button font size mismatch: ${JSON.stringify(state)}`);
  assert(state.fontWeight === '700' && state.previewFontWeight === '700', `Button font weight mismatch: ${JSON.stringify(state)}`);
  assert(state.color === '#ffffff' && /255,\s*255,\s*255/.test(state.previewColor), `Button text color mismatch: ${JSON.stringify(state)}`);
  assert(state.backgroundColor === '#16a34a' && /22,\s*163,\s*74/.test(state.previewBackgroundColor), `Button background mismatch: ${JSON.stringify(state)}`);
  assert(state.borderRadius === '12' && state.previewBorderRadius === '12px', `Button radius mismatch: ${JSON.stringify(state)}`);
  assert(state.padding === '14' && state.previewPadding === '14px', `Button padding mismatch: ${JSON.stringify(state)}`);
  assert(
    state.boxShadow === '0 8px 16px rgba(22, 163, 74, 0.25)' &&
      /rgba\(22,\s*163,\s*74,\s*0\.25\)/.test(state.previewBoxShadow),
    `Button shadow mismatch: ${JSON.stringify(state)}`,
  );

  return state;
};

const assertPersistedButtonLinkBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const button = findCanvasElement(elements, 'smoke-child-button');
  const props = button?.props || {};

  assert(button, `Persisted smoke-child-button missing: ${JSON.stringify(elements)}`);
  assert(props.label === 'Smoke signup button', `Persisted button label mismatch: ${JSON.stringify(props)}`);
  assert(props.actionPreset === 'email', `Persisted button action preset mismatch: ${JSON.stringify(props)}`);
  assert(props.actionValue === 'sales@example.com', `Persisted button action value mismatch: ${JSON.stringify(props)}`);
  assert(props.href === 'mailto:sales@example.com', `Persisted button href mismatch: ${JSON.stringify(props)}`);
  assert(props.download === false, `Persisted button download flag mismatch: ${JSON.stringify(props)}`);
  assert(props.target === '_blank', `Persisted button target mismatch: ${JSON.stringify(props)}`);
  assert(props.rel === 'noopener noreferrer nofollow', `Persisted button rel mismatch: ${JSON.stringify(props)}`);
  assert(props.ariaLabel === 'Open signup page', `Persisted button aria label mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Start signup', `Persisted button title mismatch: ${JSON.stringify(props)}`);
  assert(props.type === 'button', `Persisted button type mismatch: ${JSON.stringify(props)}`);
  assert(props.fontSize === 18, `Persisted button font size mismatch: ${JSON.stringify(props)}`);
  assert(props.fontWeight === '700', `Persisted button font weight mismatch: ${JSON.stringify(props)}`);
  assert(props.color === '#ffffff', `Persisted button text color mismatch: ${JSON.stringify(props)}`);
  assert(props.backgroundColor === '#16a34a', `Persisted button background mismatch: ${JSON.stringify(props)}`);
  assert(props.borderRadius === 12, `Persisted button radius mismatch: ${JSON.stringify(props)}`);
  assert(props.padding === 14, `Persisted button padding mismatch: ${JSON.stringify(props)}`);
  assert(props.boxShadow === '0 8px 16px rgba(22, 163, 74, 0.25)', `Persisted button shadow mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testLinkBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-link');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-link-text', 'Smoke docs link');
  await setFormControlByTestId(client, 'editor-link-href', '/docs');
  await setFormControlByTestId(client, 'editor-link-target', '_blank');
  await evaluate(client, `(() => {
    const control = document.querySelector('[data-testid="editor-link-rel"]');
    if (!(control instanceof HTMLInputElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(control, 'nofollow');
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  let normalizedRel = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    normalizedRel = await evaluate(client, `document.querySelector('[data-testid="editor-link-rel"]')?.value || ''`);
    if (normalizedRel === 'noopener noreferrer nofollow') {
      break;
    }
    await sleep(100);
  }
  assert(normalizedRel === 'noopener noreferrer nofollow', `Link rel normalization did not apply noopener/noreferrer: ${normalizedRel}`);
  await setFormControlByTestId(client, 'editor-link-aria-label', 'Read Backy docs');
  await setFormControlByTestId(client, 'editor-link-title', 'Open docs');
  await setCheckboxByTestId(client, 'editor-link-underline', false);

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => Boolean(document.querySelector('[data-testid="' + testId + '"]')?.checked);
    const link = document.querySelector('[data-element-id="smoke-link"] a');
    const style = link ? getComputedStyle(link) : null;
    return {
      text: value('editor-link-text'),
      href: value('editor-link-href'),
      target: value('editor-link-target'),
      rel: value('editor-link-rel'),
      ariaLabel: value('editor-link-aria-label'),
      title: value('editor-link-title'),
      underline: checked('editor-link-underline'),
      previewText: link?.textContent?.trim() || '',
      previewTarget: link?.getAttribute('target') || '',
      previewRel: link?.getAttribute('rel') || '',
      previewAriaLabel: link?.getAttribute('aria-label') || '',
      previewTitle: link?.getAttribute('title') || '',
      previewTextDecoration: style?.textDecorationLine || '',
    };
  })()`);

  assert(state.text === 'Smoke docs link' && state.previewText === 'Smoke docs link', `Link text mismatch: ${JSON.stringify(state)}`);
  assert(state.href === '/docs', `Link href control mismatch: ${JSON.stringify(state)}`);
  assert(state.target === '_blank' && state.previewTarget === '_blank', `Link target mismatch: ${JSON.stringify(state)}`);
  assert(state.rel === 'noopener noreferrer nofollow' && state.previewRel === 'noopener noreferrer nofollow', `Link rel mismatch: ${JSON.stringify(state)}`);
  assert(state.ariaLabel === 'Read Backy docs' && state.previewAriaLabel === 'Read Backy docs', `Link aria label mismatch: ${JSON.stringify(state)}`);
  assert(state.title === 'Open docs' && state.previewTitle === 'Open docs', `Link title mismatch: ${JSON.stringify(state)}`);
  assert(state.underline === false && state.previewTextDecoration === 'none', `Link underline mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedLinkBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const link = findCanvasElement(elements, 'smoke-link');
  const props = link?.props || {};

  assert(link?.type === 'link', `Persisted smoke-link missing: ${JSON.stringify(link)}`);
  assert(props.content === 'Smoke docs link', `Persisted link text mismatch: ${JSON.stringify(props)}`);
  assert(props.href === '/docs', `Persisted link href mismatch: ${JSON.stringify(props)}`);
  assert(props.target === '_blank', `Persisted link target mismatch: ${JSON.stringify(props)}`);
  assert(props.rel === 'noopener noreferrer nofollow', `Persisted link rel mismatch: ${JSON.stringify(props)}`);
  assert(props.ariaLabel === 'Read Backy docs', `Persisted link aria label mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Open docs', `Persisted link title mismatch: ${JSON.stringify(props)}`);
  assert(props.underline === false, `Persisted link underline mismatch: ${JSON.stringify(props)}`);

  return props;
};

const waitForSelectOption = async (client, testId, value) => {
  let state = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    state = await evaluate(client, `(() => {
      const select = document.querySelector('[data-testid="${testId}"]');
      return {
        hasSelect: select instanceof HTMLSelectElement,
        values: select instanceof HTMLSelectElement
          ? Array.from(select.options).map((option) => option.value)
          : [],
      };
    })()`);
    if (state.hasSelect && state.values.includes(value)) {
      return state;
    }
    await sleep(200);
  }

  assert(false, `Select ${testId} did not expose option ${value}: ${JSON.stringify(state)}`);
};

const enableFormCollectionWriteControls = async (client) => {
  let state = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    state = await evaluate(client, `(() => {
      const checkbox = document.querySelector('[data-testid="editor-form-collection-write-enabled"]');
      const select = document.querySelector('[data-testid="editor-form-collection-write-collection"]');
      if (checkbox instanceof HTMLInputElement && !checkbox.checked) {
        checkbox.click();
      }
      return {
        hasCheckbox: checkbox instanceof HTMLInputElement,
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        hasSelect: select instanceof HTMLSelectElement,
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    })()`);
    if (state.hasCheckbox && state.checked && state.hasSelect) {
      return state;
    }
    await sleep(250);
  }

  assert(false, `Form collection-write controls did not render after enabling: ${JSON.stringify(state)}`);
};

const testFormBehaviorControls = async (client, collectionId) => {
  await selectLayerById(client, 'smoke-form');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-form-title', 'Smoke lead capture');
  await setFormControlByTestId(client, 'editor-form-id', 'smoke-lead-capture');
  await setFormControlByTestId(client, 'editor-form-fields', JSON.stringify(FORM_SCHEMA_FIELDS, null, 2));
  await setFormControlByTestId(client, 'editor-form-builder-key', FORM_BUILDER_FIELD.key);
  await setFormControlByTestId(client, 'editor-form-builder-label', FORM_BUILDER_FIELD.label);
  await setFormControlByTestId(client, 'editor-form-builder-type', FORM_BUILDER_FIELD.type);
  await setFormControlByTestId(client, 'editor-form-builder-placeholder', FORM_BUILDER_FIELD.placeholder);
  await setCheckboxByTestId(client, 'editor-form-builder-required', true);
  await clickControlByTestId(client, 'editor-form-builder-add-field');
  await setFormControlByTestId(client, 'editor-form-submit-label', 'Send lead');
  await setCheckboxByTestId(client, 'editor-form-active', true);
  await setFormControlByTestId(client, 'editor-form-audience', 'authenticated');
  await setFormControlByTestId(client, 'editor-form-action-url', '/api/custom-lead-submit');
  await setFormControlByTestId(client, 'editor-form-method', 'POST');
  await setFormControlByTestId(client, 'editor-form-success-message', 'Smoke submission received.');
  await setFormControlByTestId(client, 'editor-form-success-redirect-url', '/thanks');
  await setFormControlByTestId(client, 'editor-form-notification-email', 'ops@example.com');
  await setFormControlByTestId(client, 'editor-form-notification-webhook', 'https://hooks.example.com/backy-smoke');
  await setCheckboxByTestId(client, 'editor-form-enable-honeypot', true);
  await setCheckboxByTestId(client, 'editor-form-enable-captcha', true);
  await setFormControlByTestId(client, 'editor-form-captcha-provider', 'turnstile');
  await setFormControlByTestId(client, 'editor-form-captcha-site-key', 'turnstile-smoke-site-key');
  await setFormControlByTestId(client, 'editor-form-moderation-mode', 'auto-approve');
  await setCheckboxByTestId(client, 'editor-form-contact-share-enabled', true);
  await setFormControlByTestId(client, 'editor-form-contact-share-name-field', 'full_name');
  await setFormControlByTestId(client, 'editor-form-contact-share-email-field', 'email');
  await setFormControlByTestId(client, 'editor-form-contact-share-phone-field', 'phone');
  await setFormControlByTestId(client, 'editor-form-contact-share-notes-field', 'message');
  await setCheckboxByTestId(client, 'editor-form-contact-share-dedupe-by-email', false);

  if (collectionId) {
    await selectLayerById(client, 'smoke-form');
    await switchToPropertiesPanel(client);
    await enableFormCollectionWriteControls(client);
    await waitForSelectOption(client, 'editor-form-collection-write-collection', collectionId);
    await setFormControlByTestId(client, 'editor-form-collection-write-collection', collectionId);
    await setFormControlByTestId(client, 'editor-form-collection-write-slug-field', 'full_name');
    await setFormControlByTestId(client, 'editor-form-collection-write-field-map', 'full_name: title\nmessage: summary');
  }

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => Boolean(document.querySelector('[data-testid="' + testId + '"]')?.checked);
    const form = document.querySelector('[data-element-id="smoke-form"]');
    return {
      title: value('editor-form-title'),
      formId: value('editor-form-id'),
      active: checked('editor-form-active'),
      audience: value('editor-form-audience'),
      actionUrl: value('editor-form-action-url'),
      method: value('editor-form-method'),
      successMessage: value('editor-form-success-message'),
      successRedirectUrl: value('editor-form-success-redirect-url'),
      notificationEmail: value('editor-form-notification-email'),
      notificationWebhook: value('editor-form-notification-webhook'),
      enableHoneypot: checked('editor-form-enable-honeypot'),
      enableCaptcha: checked('editor-form-enable-captcha'),
      captchaProvider: value('editor-form-captcha-provider'),
      captchaSiteKey: value('editor-form-captcha-site-key'),
      moderationMode: value('editor-form-moderation-mode'),
      contactShareEnabled: checked('editor-form-contact-share-enabled'),
      contactShareNameField: value('editor-form-contact-share-name-field'),
      contactShareEmailField: value('editor-form-contact-share-email-field'),
      contactSharePhoneField: value('editor-form-contact-share-phone-field'),
      contactShareNotesField: value('editor-form-contact-share-notes-field'),
      contactShareDedupeByEmail: checked('editor-form-contact-share-dedupe-by-email'),
      collectionWriteEnabled: checked('editor-form-collection-write-enabled'),
      collectionWriteCollectionId: value('editor-form-collection-write-collection'),
      collectionWriteSlugField: value('editor-form-collection-write-slug-field'),
      collectionWriteFieldMap: value('editor-form-collection-write-field-map'),
      fieldsJson: value('editor-form-fields'),
      builderKeys: Array.from(document.querySelectorAll('[data-testid="editor-form-builder-field"]')).map((node) => node.getAttribute('data-field-key')),
      submitLabel: value('editor-form-submit-label'),
      previewText: form?.textContent || '',
      schemaCount: Number(document.querySelector('[data-testid="editor-form-schema"]')?.getAttribute('data-form-field-count') || '0'),
      schemaKeys: Array.from(document.querySelectorAll('[data-testid="editor-form-schema-field"]')).map((node) => node.getAttribute('data-field-key')),
      fullNameRequired: document.querySelector('[data-testid="editor-form-schema-field-full_name"]')?.hasAttribute('required') || false,
      fullNameMinLength: document.querySelector('[data-testid="editor-form-schema-field-full_name"]')?.getAttribute('minlength') || '',
      emailType: document.querySelector('[data-testid="editor-form-schema-field-email"]')?.getAttribute('type') || '',
      messageMaxLength: document.querySelector('[data-testid="editor-form-schema-field-message"]')?.getAttribute('maxlength') || '',
      planOptions: Array.from(document.querySelectorAll('[data-testid="editor-form-schema-field-plan"] option')).map((option) => option.value),
      companyRequired: document.querySelector('[data-testid="editor-form-schema-field-company"]')?.hasAttribute('required') || false,
      companyPlaceholder: document.querySelector('[data-testid="editor-form-schema-field-company"]')?.getAttribute('placeholder') || '',
      schemaSubmitLabel: document.querySelector('[data-testid="editor-form-schema-submit"]')?.textContent?.trim() || '',
      hasHoneypot: Boolean(document.querySelector('[data-testid="editor-form-schema-honeypot"]')),
      hasCaptchaWidget: Boolean(document.querySelector('[data-testid="editor-form-captcha-widget"]')),
      captchaWidgetProvider: document.querySelector('[data-testid="editor-form-captcha-widget"]')?.getAttribute('data-backy-captcha-provider') || '',
      captchaWidgetSiteKey: document.querySelector('[data-testid="editor-form-captcha-widget"]')?.getAttribute('data-sitekey') || '',
    };
  })()`);

  assert(state.title === 'Smoke lead capture' && state.previewText.includes('Smoke lead capture'), `Form title mismatch: ${JSON.stringify(state)}`);
  assert(state.formId === 'smoke-lead-capture', `Form id mismatch: ${JSON.stringify(state)}`);
  assert(state.submitLabel === 'Send lead' && state.schemaSubmitLabel === 'Send lead', `Form submit label mismatch: ${JSON.stringify(state)}`);
  assert(state.schemaCount === FORM_SCHEMA_FIELDS_WITH_BUILDER.length, `Form schema count mismatch: ${JSON.stringify(state)}`);
  assert(JSON.stringify(state.schemaKeys) === JSON.stringify(FORM_SCHEMA_FIELDS_WITH_BUILDER.map((field) => field.key)), `Form schema keys mismatch: ${JSON.stringify(state)}`);
  assert(state.builderKeys.includes(FORM_BUILDER_FIELD.key), `Form builder field list mismatch: ${JSON.stringify(state)}`);
  assert(state.fullNameRequired === true && state.fullNameMinLength === '2', `Form name validation mismatch: ${JSON.stringify(state)}`);
  assert(state.emailType === 'email', `Form email field mismatch: ${JSON.stringify(state)}`);
  assert(state.messageMaxLength === '240', `Form message validation mismatch: ${JSON.stringify(state)}`);
  assert(JSON.stringify(state.planOptions) === JSON.stringify(['', 'Starter', 'Growth']), `Form select options mismatch: ${JSON.stringify(state)}`);
  assert(state.companyRequired === true && state.companyPlaceholder === 'Acme Inc.', `Form builder field preview mismatch: ${JSON.stringify(state)}`);
  assert(state.hasHoneypot === true, `Form schema honeypot mismatch: ${JSON.stringify(state)}`);
  assert(state.active === true, `Form active mismatch: ${JSON.stringify(state)}`);
  assert(state.audience === 'authenticated', `Form audience mismatch: ${JSON.stringify(state)}`);
  assert(state.actionUrl === '/api/custom-lead-submit', `Form action URL mismatch: ${JSON.stringify(state)}`);
  assert(state.method === 'POST', `Form method mismatch: ${JSON.stringify(state)}`);
  assert(state.successMessage === 'Smoke submission received.', `Form success message mismatch: ${JSON.stringify(state)}`);
  assert(state.successRedirectUrl === '/thanks', `Form success redirect mismatch: ${JSON.stringify(state)}`);
  assert(state.notificationEmail === 'ops@example.com', `Form notification email mismatch: ${JSON.stringify(state)}`);
  assert(state.notificationWebhook === 'https://hooks.example.com/backy-smoke', `Form notification webhook mismatch: ${JSON.stringify(state)}`);
  assert(state.enableHoneypot === true && state.enableCaptcha === true, `Form spam controls mismatch: ${JSON.stringify(state)}`);
  assert(
    state.captchaProvider === 'turnstile' &&
      state.captchaSiteKey === 'turnstile-smoke-site-key' &&
      state.hasCaptchaWidget === true &&
      state.captchaWidgetProvider === 'turnstile' &&
      state.captchaWidgetSiteKey === 'turnstile-smoke-site-key',
    `Form captcha widget mismatch: ${JSON.stringify(state)}`,
  );
  assert(state.moderationMode === 'auto-approve', `Form moderation mismatch: ${JSON.stringify(state)}`);
  assert(
    state.contactShareEnabled === true &&
      state.contactShareNameField === 'full_name' &&
      state.contactShareEmailField === 'email' &&
      state.contactSharePhoneField === 'phone' &&
      state.contactShareNotesField === 'message' &&
      state.contactShareDedupeByEmail === false,
    `Form contact-share controls mismatch: ${JSON.stringify(state)}`,
  );
  if (collectionId) {
    assert(
      state.collectionWriteEnabled === true &&
        state.collectionWriteCollectionId === collectionId &&
        state.collectionWriteSlugField === 'full_name' &&
        state.collectionWriteFieldMap === 'full_name: title\nmessage: summary',
      `Form collection-write controls mismatch: ${JSON.stringify(state)}`,
    );
  }

  return state;
};

const assertPersistedFormBehavior = async (pageId, collectionId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const form = findCanvasElement(elements, 'smoke-form');
  const props = form?.props || {};

  assert(form?.type === 'form', `Persisted smoke-form missing: ${JSON.stringify(form)}`);
  assert(props.formTitle === 'Smoke lead capture', `Persisted form title mismatch: ${JSON.stringify(props)}`);
  assert(props.formId === 'smoke-lead-capture', `Persisted form id mismatch: ${JSON.stringify(props)}`);
  assert(JSON.stringify(props.fields) === JSON.stringify(FORM_SCHEMA_FIELDS_WITH_BUILDER), `Persisted form fields mismatch: ${JSON.stringify(props)}`);
  assert(props.submitLabel === 'Send lead', `Persisted form submit label mismatch: ${JSON.stringify(props)}`);
  assert(props.formActive !== false, `Persisted form active mismatch: ${JSON.stringify(props)}`);
  assert(props.formAudience === 'authenticated', `Persisted form audience mismatch: ${JSON.stringify(props)}`);
  assert(props.actionUrl === '/api/custom-lead-submit', `Persisted form action URL mismatch: ${JSON.stringify(props)}`);
  assert(props.method === 'POST', `Persisted form method mismatch: ${JSON.stringify(props)}`);
  assert(props.successMessage === 'Smoke submission received.', `Persisted form success message mismatch: ${JSON.stringify(props)}`);
  assert(props.successRedirectUrl === '/thanks' && props.redirectUrl === '/thanks', `Persisted form success redirect mismatch: ${JSON.stringify(props)}`);
  assert(props.notificationEmail === 'ops@example.com', `Persisted form notification email mismatch: ${JSON.stringify(props)}`);
  assert(props.notificationWebhook === 'https://hooks.example.com/backy-smoke', `Persisted form notification webhook mismatch: ${JSON.stringify(props)}`);
  assert(props.enableHoneypot === true && props.enableCaptcha === true, `Persisted form spam controls mismatch: ${JSON.stringify(props)}`);
  assert(props.captchaProvider === 'turnstile' && props.captchaSiteKey === 'turnstile-smoke-site-key', `Persisted form captcha widget controls mismatch: ${JSON.stringify(props)}`);
  assert(props.moderationMode === 'auto-approve', `Persisted form moderation mismatch: ${JSON.stringify(props)}`);
  assert(
    props.contactShareEnabled === true &&
      props.contactShareNameField === 'full_name' &&
      props.contactShareEmailField === 'email' &&
      props.contactSharePhoneField === 'phone' &&
      props.contactShareNotesField === 'message' &&
      props.contactShareDedupeByEmail === false,
    `Persisted form contact-share mismatch: ${JSON.stringify(props)}`,
  );
  if (collectionId) {
    assert(
      props.collectionWriteEnabled === true &&
        props.collectionWriteCollectionId === collectionId &&
        props.collectionWriteSlugField === 'full_name' &&
        JSON.stringify(props.collectionWriteFieldMap) === JSON.stringify({ full_name: 'title', message: 'summary' }),
      `Persisted form collection-write mismatch: ${JSON.stringify(props)}`,
    );
  }

  return props;
};

const testCommentBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-comment');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-comment-title', 'Smoke discussion');
  await setFormControlByTestId(client, 'editor-comment-moderation-mode', 'auto-approve');
  await setCheckboxByTestId(client, 'editor-comment-require-name', false);
  await setCheckboxByTestId(client, 'editor-comment-require-email', true);
  await setCheckboxByTestId(client, 'editor-comment-allow-guests', false);
  await setCheckboxByTestId(client, 'editor-comment-allow-replies', false);
  await setFormControlByTestId(client, 'editor-comment-sort-order', 'oldest');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => Boolean(document.querySelector('[data-testid="' + testId + '"]')?.checked);
    const comment = document.querySelector('[data-element-id="smoke-comment"]');
    return {
      title: value('editor-comment-title'),
      moderationMode: value('editor-comment-moderation-mode'),
      requireName: checked('editor-comment-require-name'),
      requireEmail: checked('editor-comment-require-email'),
      allowGuests: checked('editor-comment-allow-guests'),
      allowReplies: checked('editor-comment-allow-replies'),
      sortOrder: value('editor-comment-sort-order'),
      previewText: comment?.textContent || '',
    };
  })()`);

  assert(state.title === 'Smoke discussion' && state.previewText.includes('Smoke discussion'), `Comment title mismatch: ${JSON.stringify(state)}`);
  assert(state.moderationMode === 'auto-approve' && state.previewText.includes('Moderation: auto-approve'), `Comment moderation mismatch: ${JSON.stringify(state)}`);
  assert(state.requireName === false && state.previewText.includes('Name required: off'), `Comment require-name mismatch: ${JSON.stringify(state)}`);
  assert(state.requireEmail === true && state.previewText.includes('Email required: on'), `Comment require-email mismatch: ${JSON.stringify(state)}`);
  assert(state.allowGuests === false && state.previewText.includes('Guests: off'), `Comment guest toggle mismatch: ${JSON.stringify(state)}`);
  assert(state.allowReplies === false && state.previewText.includes('Replies: off'), `Comment replies toggle mismatch: ${JSON.stringify(state)}`);
  assert(state.sortOrder === 'oldest' && state.previewText.includes('Sort: Oldest first'), `Comment sort mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedCommentBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const comment = findCanvasElement(elements, 'smoke-comment');
  const props = comment?.props || {};

  assert(comment?.type === 'comment', `Persisted smoke-comment missing: ${JSON.stringify(comment)}`);
  assert(props.commentTitle === 'Smoke discussion', `Persisted comment title mismatch: ${JSON.stringify(props)}`);
  assert(props.commentModerationMode === 'auto-approve', `Persisted comment moderation mismatch: ${JSON.stringify(props)}`);
  assert(props.commentRequireName === false, `Persisted comment require-name mismatch: ${JSON.stringify(props)}`);
  assert(props.commentRequireEmail === true, `Persisted comment require-email mismatch: ${JSON.stringify(props)}`);
  assert(props.commentAllowGuests === false, `Persisted comment allow-guests mismatch: ${JSON.stringify(props)}`);
  assert(props.commentAllowReplies === false, `Persisted comment allow-replies mismatch: ${JSON.stringify(props)}`);
  assert(props.commentSortOrder === 'oldest', `Persisted comment sort order mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testBoxBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-box');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-style-background-color', '#ecfeff');
  await ensurePropertySectionExpanded(client, 'Appearance');
  await setFormControlByTestId(client, 'editor-appearance-border-radius', '14');
  await setFormControlByTestId(client, 'editor-appearance-opacity', '0.8');
  await setFormControlByTestId(client, 'editor-appearance-border-width', '3');
  await setFormControlByTestId(client, 'editor-appearance-border-style', 'dashed');
  await setFormControlByTestId(client, 'editor-appearance-border-color', '#0891b2');
  await setFormControlByTestId(client, 'editor-appearance-padding', '18');
  await setFormControlByTestId(client, 'editor-appearance-margin', '4');
  await setFormControlByTestId(client, 'editor-appearance-box-shadow', '0 10px 20px rgba(8, 145, 178, 0.25)');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const root = document.querySelector('[data-element-id="smoke-box"]');
    const box = root?.firstElementChild;
    const child = root?.querySelector('[data-element-id="smoke-child-button"]');
    const style = box ? getComputedStyle(box) : null;
    const rootStyle = root ? getComputedStyle(root) : null;
    const childStyle = child ? getComputedStyle(child) : null;
    return {
      backgroundColor: value('editor-style-background-color'),
      borderRadius: value('editor-appearance-border-radius'),
      opacity: value('editor-appearance-opacity'),
      borderWidth: value('editor-appearance-border-width'),
      borderStyle: value('editor-appearance-border-style'),
      borderColor: value('editor-appearance-border-color'),
      padding: value('editor-appearance-padding'),
      margin: value('editor-appearance-margin'),
      boxShadow: value('editor-appearance-box-shadow'),
      previewBackgroundColor: style?.backgroundColor || '',
      previewBorderRadius: style?.borderRadius || '',
      previewBorderWidth: style?.borderWidth || '',
      previewBorderStyle: style?.borderStyle || '',
      previewBorderColor: style?.borderColor || '',
      previewPadding: style?.padding || '',
      previewMargin: style?.margin || '',
      previewBoxShadow: style?.boxShadow || '',
      previewOpacity: rootStyle?.opacity || '',
      nestedChildParentId: child?.parentElement?.getAttribute('data-element-id') || child?.parentElement?.parentElement?.getAttribute('data-element-id') || '',
      nestedChildPosition: childStyle?.position || '',
      nestedChildLeft: childStyle?.left || '',
      nestedChildTop: childStyle?.top || '',
      nestedChildWidth: childStyle?.width || '',
      nestedChildHeight: childStyle?.height || '',
    };
  })()`);

  assert(state.backgroundColor === '#ecfeff' && /236,\s*254,\s*255/.test(state.previewBackgroundColor), `Box background mismatch: ${JSON.stringify(state)}`);
  assert(state.borderRadius === '14' && state.previewBorderRadius === '14px', `Box border radius mismatch: ${JSON.stringify(state)}`);
  assert(state.opacity === '0.8' && state.previewOpacity === '0.8', `Box opacity mismatch: ${JSON.stringify(state)}`);
  assert(state.borderWidth === '3' && state.previewBorderWidth === '3px', `Box border width mismatch: ${JSON.stringify(state)}`);
  assert(state.borderStyle === 'dashed' && state.previewBorderStyle === 'dashed', `Box border style mismatch: ${JSON.stringify(state)}`);
  assert(state.borderColor === '#0891b2' && /8,\s*145,\s*178/.test(state.previewBorderColor), `Box border color mismatch: ${JSON.stringify(state)}`);
  assert(state.padding === '18' && state.previewPadding === '18px', `Box padding mismatch: ${JSON.stringify(state)}`);
  assert(state.margin === '4' && state.previewMargin === '4px', `Box margin mismatch: ${JSON.stringify(state)}`);
  assert(
    state.boxShadow === '0 10px 20px rgba(8, 145, 178, 0.25)' &&
      /rgba\(8,\s*145,\s*178,\s*0\.25\)/.test(state.previewBoxShadow) &&
      /0px\s+10px\s+20px/.test(state.previewBoxShadow),
    `Box shadow mismatch: ${JSON.stringify(state)}`,
  );
  assert(state.nestedChildParentId === 'smoke-box', `Box nested child parent mismatch: ${JSON.stringify(state)}`);
  assert(state.nestedChildPosition === 'absolute', `Box nested child positioning mismatch: ${JSON.stringify(state)}`);
  assert(state.nestedChildLeft === '32px' && state.nestedChildTop === '36px', `Box nested child offset mismatch: ${JSON.stringify(state)}`);
  assert(state.nestedChildWidth === '160px' && state.nestedChildHeight === '48px', `Box nested child size mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedBoxBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const box = findCanvasElement(elements, 'smoke-box');
  const props = box?.props || {};

  assert(box?.type === 'box', `Persisted smoke-box missing: ${JSON.stringify(box)}`);
  assert(props.backgroundColor === '#ecfeff', `Persisted box background mismatch: ${JSON.stringify(props)}`);
  assert(props.borderRadius === 14, `Persisted box border radius mismatch: ${JSON.stringify(props)}`);
  assert(props.opacity === 0.8, `Persisted box opacity mismatch: ${JSON.stringify(props)}`);
  assert(props.borderWidth === 3, `Persisted box border width mismatch: ${JSON.stringify(props)}`);
  assert(props.borderStyle === 'dashed', `Persisted box border style mismatch: ${JSON.stringify(props)}`);
  assert(props.borderColor === '#0891b2', `Persisted box border color mismatch: ${JSON.stringify(props)}`);
  assert(props.padding === 18, `Persisted box padding mismatch: ${JSON.stringify(props)}`);
  assert(props.margin === 4, `Persisted box margin mismatch: ${JSON.stringify(props)}`);
  assert(props.boxShadow === '0 10px 20px rgba(8, 145, 178, 0.25)', `Persisted box shadow mismatch: ${JSON.stringify(props)}`);
  assert(Array.isArray(box.children) && box.children.some((child) => child.id === 'smoke-child-button'), `Persisted box nested child missing: ${JSON.stringify(box)}`);

  return props;
};

const testHeadingTypographyControls = async (client) => {
  await selectLayerById(client, 'smoke-heading');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-heading-level', 'h3');
  await setFormControlByTestId(client, 'editor-style-font-size', '42');
  await setFormControlByTestId(client, 'editor-style-font-weight', '700');
  await setFormControlByTestId(client, 'editor-style-line-height', '1.2');
  await clickControlByTestId(client, 'editor-style-text-align-center');
  await setFormControlByTestId(client, 'editor-style-text-transform', 'uppercase');
  await setFormControlByTestId(client, 'editor-style-letter-spacing', '2');
  await setFormControlByTestId(client, 'editor-style-word-spacing', '4');
  await setFormControlByTestId(client, 'editor-style-text-indent', '6');
  await setFormControlByTestId(client, 'editor-style-text-shadow', '1px 2px 3px rgba(15, 23, 42, 0.35)');
  await setFormControlByTestId(client, 'editor-style-text-color', '#dc2626');
  await setFormControlByTestId(client, 'editor-style-background-color', '#fff7ed');
  await setFormControlByTestId(client, 'editor-style-text-decoration', 'underline');
  await setFormControlByTestId(client, 'editor-style-font-style', 'italic');

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const headingRoot = document.querySelector('[data-element-id="smoke-heading"]');
    const preview = headingRoot?.querySelector('[contenteditable="true"]') || headingRoot?.firstElementChild?.firstElementChild || headingRoot?.firstElementChild;
    const style = preview ? getComputedStyle(preview) : null;
    const feedback = document.querySelector('[data-testid="editor-property-feedback"]');
    return {
      level: value('editor-heading-level'),
      fontSize: value('editor-style-font-size'),
      fontWeight: value('editor-style-font-weight'),
      lineHeight: value('editor-style-line-height'),
      textTransform: value('editor-style-text-transform'),
      letterSpacing: value('editor-style-letter-spacing'),
      wordSpacing: value('editor-style-word-spacing'),
      textIndent: value('editor-style-text-indent'),
      textShadow: value('editor-style-text-shadow'),
      color: value('editor-style-text-color'),
      backgroundColor: value('editor-style-background-color'),
      textDecoration: value('editor-style-text-decoration'),
      fontStyle: value('editor-style-font-style'),
      previewText: headingRoot?.textContent || '',
      previewFontSize: style?.fontSize || '',
      previewFontWeight: style?.fontWeight || '',
      previewLineHeight: style?.lineHeight || '',
      previewTextAlign: style?.textAlign || '',
      previewTextTransform: style?.textTransform || '',
      previewLetterSpacing: style?.letterSpacing || '',
      previewWordSpacing: style?.wordSpacing || '',
      previewTextIndent: style?.textIndent || '',
      previewTextShadow: style?.textShadow || '',
      previewColor: style?.color || '',
      previewBackgroundColor: style?.backgroundColor || '',
      previewTextDecoration: style?.textDecorationLine || '',
      previewFontStyle: style?.fontStyle || '',
      feedbackState: feedback?.getAttribute('data-feedback-state') || '',
      feedbackCount: Number(feedback?.getAttribute('data-feedback-count') || 0),
      feedbackText: feedback?.textContent || '',
    };
  })()`);

  assert(state.level === 'h3', `Heading level control mismatch: ${JSON.stringify(state)}`);
  assert(state.previewText.includes('Drag Smoke Heading'), `Heading preview text missing: ${JSON.stringify(state)}`);
  assert(state.fontSize === '42' && state.previewFontSize === '42px', `Heading font size mismatch: ${JSON.stringify(state)}`);
  assert(state.fontWeight === '700' && state.previewFontWeight === '700', `Heading font weight mismatch: ${JSON.stringify(state)}`);
  assert(state.lineHeight === '1.2', `Heading line height control mismatch: ${JSON.stringify(state)}`);
  assert(state.previewTextAlign === 'center', `Heading text align mismatch: ${JSON.stringify(state)}`);
  assert(state.textTransform === 'uppercase' && state.previewTextTransform === 'uppercase', `Heading transform mismatch: ${JSON.stringify(state)}`);
  assert(state.letterSpacing === '2' && state.previewLetterSpacing === '2px', `Heading letter spacing mismatch: ${JSON.stringify(state)}`);
  assert(state.wordSpacing === '4' && state.previewWordSpacing === '4px', `Heading word spacing mismatch: ${JSON.stringify(state)}`);
  assert(state.textIndent === '6' && state.previewTextIndent === '6px', `Heading text indent mismatch: ${JSON.stringify(state)}`);
  assert(
    state.textShadow === '1px 2px 3px rgba(15, 23, 42, 0.35)' &&
      /rgba\(15,\s*23,\s*42,\s*0\.35\)/.test(state.previewTextShadow),
    `Heading text shadow mismatch: ${JSON.stringify(state)}`,
  );
  assert(state.color === '#dc2626' && /220,\s*38,\s*38/.test(state.previewColor), `Heading color mismatch: ${JSON.stringify(state)}`);
  assert(state.backgroundColor === '#fff7ed' && /255,\s*247,\s*237/.test(state.previewBackgroundColor), `Heading background mismatch: ${JSON.stringify(state)}`);
  assert(state.textDecoration === 'underline' && state.previewTextDecoration.includes('underline'), `Heading decoration mismatch: ${JSON.stringify(state)}`);
  assert(state.fontStyle === 'italic' && state.previewFontStyle === 'italic', `Heading font style mismatch: ${JSON.stringify(state)}`);
  assert(state.feedbackState === 'applied' && state.feedbackCount > 0 && /Applied/.test(state.feedbackText), `Property panel feedback did not show applied state: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedHeadingTypography = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const heading = findCanvasElement(elements, 'smoke-heading');
  const props = heading?.props || {};

  assert(heading?.type === 'heading', `Persisted smoke-heading missing: ${JSON.stringify(heading)}`);
  assert(props.level === 'h3', `Persisted heading level mismatch: ${JSON.stringify(props)}`);
  assert(props.fontSize === 42, `Persisted heading font size mismatch: ${JSON.stringify(props)}`);
  assert(props.fontWeight === '700', `Persisted heading font weight mismatch: ${JSON.stringify(props)}`);
  assert(props.lineHeight === 1.2, `Persisted heading line height mismatch: ${JSON.stringify(props)}`);
  assert(props.textAlign === 'center', `Persisted heading text align mismatch: ${JSON.stringify(props)}`);
  assert(props.textTransform === 'uppercase', `Persisted heading transform mismatch: ${JSON.stringify(props)}`);
  assert(props.letterSpacing === 2, `Persisted heading letter spacing mismatch: ${JSON.stringify(props)}`);
  assert(props.wordSpacing === 4, `Persisted heading word spacing mismatch: ${JSON.stringify(props)}`);
  assert(props.textIndent === 6, `Persisted heading indent mismatch: ${JSON.stringify(props)}`);
  assert(props.textShadow === '1px 2px 3px rgba(15, 23, 42, 0.35)', `Persisted heading shadow mismatch: ${JSON.stringify(props)}`);
  assert(props.color === '#dc2626', `Persisted heading color mismatch: ${JSON.stringify(props)}`);
  assert(props.backgroundColor === '#fff7ed', `Persisted heading background mismatch: ${JSON.stringify(props)}`);
  assert(props.textDecoration === 'underline', `Persisted heading decoration mismatch: ${JSON.stringify(props)}`);
  assert(props.fontStyle === 'italic', `Persisted heading font style mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testVideoBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-video');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-video-src', SMOKE_VIDEO_SRC);
  await setFormControlByTestId(client, 'editor-video-poster', SMOKE_VIDEO_POSTER);
  await setFormControlByTestId(client, 'editor-video-object-fit', 'contain');
  await setCheckboxByTestId(client, 'editor-video-controls', true);
  await setCheckboxByTestId(client, 'editor-video-autoplay', true);
  await setCheckboxByTestId(client, 'editor-video-loop', true);
  await setCheckboxByTestId(client, 'editor-video-muted', true);
  await setCheckboxByTestId(client, 'editor-video-playsInline', true);

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-video"]');
    const video = node?.querySelector('video');
    return {
      src: value('editor-video-src'),
      poster: value('editor-video-poster'),
      objectFit: value('editor-video-object-fit'),
      controls: checked('editor-video-controls'),
      autoplay: checked('editor-video-autoplay'),
      loop: checked('editor-video-loop'),
      muted: checked('editor-video-muted'),
      playsInline: checked('editor-video-playsInline'),
      previewObjectFit: video ? getComputedStyle(video).objectFit : '',
    };
  })()`);

  assert(state.src === SMOKE_VIDEO_SRC, `Video src control mismatch: ${JSON.stringify(state)}`);
  assert(state.poster === SMOKE_VIDEO_POSTER, `Video poster control mismatch: ${JSON.stringify(state)}`);
  assert(state.objectFit === 'contain' && state.previewObjectFit === 'contain', `Video object-fit mismatch: ${JSON.stringify(state)}`);
  assert(state.controls === true && state.autoplay === true && state.loop === true && state.muted === true && state.playsInline === true, `Video toggle controls mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedVideoBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const video = findCanvasElement(elements, 'smoke-video');
  const props = video?.props || {};

  assert(video?.type === 'video', `Persisted smoke-video missing: ${JSON.stringify(video)}`);
  assert(props.src === SMOKE_VIDEO_SRC, `Persisted video src mismatch: ${JSON.stringify(props)}`);
  assert(props.poster === SMOKE_VIDEO_POSTER, `Persisted video poster mismatch: ${JSON.stringify(props)}`);
  assert(props.objectFit === 'contain', `Persisted video objectFit mismatch: ${JSON.stringify(props)}`);
  assert(props.controls === true && props.autoplay === true && props.loop === true && props.muted === true && props.playsInline === true, `Persisted video toggles mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testEmbedBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-embed');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-embed-src', SMOKE_EMBED_SRC);
  await setFormControlByTestId(client, 'editor-embed-title', 'Smoke embed frame');
  await setFormControlByTestId(client, 'editor-embed-allow', SMOKE_EMBED_ALLOW);
  await setFormControlByTestId(client, 'editor-embed-allowed-hosts', SMOKE_EMBED_ALLOWED_HOSTS);
  await setFormControlByTestId(client, 'editor-embed-sandbox', SMOKE_EMBED_SANDBOX);
  await setFormControlByTestId(client, 'editor-embed-loading', 'eager');
  await setFormControlByTestId(client, 'editor-embed-referrer-policy', 'no-referrer');
  await setCheckboxByTestId(client, 'editor-embed-allow-fullscreen', false);

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-embed"]');
    const iframe = node?.querySelector('iframe');
    return {
      src: value('editor-embed-src'),
      title: value('editor-embed-title'),
      allow: value('editor-embed-allow'),
      allowedHosts: value('editor-embed-allowed-hosts'),
      sandbox: value('editor-embed-sandbox'),
      loading: value('editor-embed-loading'),
      referrerPolicy: value('editor-embed-referrer-policy'),
      allowFullScreen: checked('editor-embed-allow-fullscreen'),
      previewSrc: iframe?.getAttribute('src') || '',
      previewTitle: iframe?.getAttribute('title') || '',
      previewAllow: iframe?.getAttribute('allow') || '',
      previewAllowedHosts: iframe?.getAttribute('data-backy-embed-allowed-hosts') || '',
      previewSandbox: iframe?.getAttribute('sandbox') || '',
      previewLoading: iframe?.getAttribute('loading') || '',
      previewReferrerPolicy: iframe?.getAttribute('referrerpolicy') || '',
      previewAllowFullScreen: iframe instanceof HTMLIFrameElement ? iframe.allowFullscreen : null,
    };
  })()`);

  assert(state.src === SMOKE_EMBED_SRC && state.previewSrc === SMOKE_EMBED_PREVIEW_SRC, `Embed src control mismatch: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke embed frame' && state.previewTitle === 'Smoke embed frame', `Embed title control mismatch: ${JSON.stringify(state)}`);
  assert(state.allow === SMOKE_EMBED_ALLOW && state.previewAllow === SMOKE_EMBED_ALLOW, `Embed allow control mismatch: ${JSON.stringify(state)}`);
  assert(state.allowedHosts === SMOKE_EMBED_ALLOWED_HOSTS && state.previewAllowedHosts.includes('trusted.backy.test'), `Embed allowed hosts mismatch: ${JSON.stringify(state)}`);
  assert(state.previewAllowedHosts.includes('youtube.com') && state.previewAllowedHosts.includes('vimeo.com'), `Embed default allowlist missing: ${JSON.stringify(state)}`);
  assert(state.sandbox === SMOKE_EMBED_SANDBOX && state.previewSandbox === SMOKE_EMBED_SANDBOX, `Embed sandbox control mismatch: ${JSON.stringify(state)}`);
  assert(state.loading === 'eager' && state.previewLoading === 'eager', `Embed loading control mismatch: ${JSON.stringify(state)}`);
  assert(state.referrerPolicy === 'no-referrer' && state.previewReferrerPolicy === 'no-referrer', `Embed referrer policy mismatch: ${JSON.stringify(state)}`);
  assert(state.allowFullScreen === false && state.previewAllowFullScreen === false, `Embed fullscreen control mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedEmbedBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const embed = findCanvasElement(elements, 'smoke-embed');
  const props = embed?.props || {};

  assert(embed?.type === 'embed', `Persisted smoke-embed missing: ${JSON.stringify(embed)}`);
  assert(props.src === SMOKE_EMBED_SRC, `Persisted embed src mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Smoke embed frame', `Persisted embed title mismatch: ${JSON.stringify(props)}`);
  assert(props.allow === SMOKE_EMBED_ALLOW, `Persisted embed allow mismatch: ${JSON.stringify(props)}`);
  assert(props.allowedHosts === SMOKE_EMBED_ALLOWED_HOSTS, `Persisted embed allowed hosts mismatch: ${JSON.stringify(props)}`);
  assert(props.sandbox === SMOKE_EMBED_SANDBOX, `Persisted embed sandbox mismatch: ${JSON.stringify(props)}`);
  assert(props.loading === 'eager', `Persisted embed loading mismatch: ${JSON.stringify(props)}`);
  assert(props.referrerPolicy === 'no-referrer', `Persisted embed referrer policy mismatch: ${JSON.stringify(props)}`);
  assert(props.allowFullScreen === false, `Persisted embed fullscreen mismatch: ${JSON.stringify(props)}`);

  return props;
};

const testMapBehaviorControls = async (client) => {
  await selectLayerById(client, 'smoke-map');
  await switchToPropertiesPanel(client);

  await setFormControlByTestId(client, 'editor-map-address', SMOKE_MAP_ADDRESS);
  await setFormControlByTestId(client, 'editor-map-src', '');
  await setFormControlByTestId(client, 'editor-map-marker-label', SMOKE_MAP_MARKER_LABEL);
  await setFormControlByTestId(client, 'editor-map-marker-latitude', SMOKE_MAP_MARKER_LATITUDE);
  await setFormControlByTestId(client, 'editor-map-marker-longitude', SMOKE_MAP_MARKER_LONGITUDE);
  await setFormControlByTestId(client, 'editor-map-title', 'Smoke map frame');
  await setFormControlByTestId(client, 'editor-map-zoom', '17');
  await setFormControlByTestId(client, 'editor-map-loading', 'eager');
  await setFormControlByTestId(client, 'editor-map-referrer-policy', 'origin');
  await setCheckboxByTestId(client, 'editor-map-allow-fullscreen', false);

  const state = await evaluate(client, `(() => {
    const value = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.value || '';
    const checked = (testId) => {
      const input = document.querySelector('[data-testid="' + testId + '"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const node = document.querySelector('[data-element-id="smoke-map"]');
    const iframe = node?.querySelector('iframe');
    const previewSrc = iframe?.getAttribute('src') || '';
    return {
      address: value('editor-map-address'),
      src: value('editor-map-src'),
      markerLabel: value('editor-map-marker-label'),
      markerLatitude: value('editor-map-marker-latitude'),
      markerLongitude: value('editor-map-marker-longitude'),
      title: value('editor-map-title'),
      zoom: value('editor-map-zoom'),
      loading: value('editor-map-loading'),
      referrerPolicy: value('editor-map-referrer-policy'),
      allowFullScreen: checked('editor-map-allow-fullscreen'),
      previewSrc,
      decodedPreviewSrc: previewSrc ? decodeURIComponent(previewSrc) : '',
      previewTitle: iframe?.getAttribute('title') || '',
      previewMapAddress: iframe?.getAttribute('data-backy-map-address') || '',
      previewMarkerLabel: iframe?.getAttribute('data-backy-map-marker-label') || '',
      previewMarkerLatitude: iframe?.getAttribute('data-backy-map-marker-latitude') || '',
      previewMarkerLongitude: iframe?.getAttribute('data-backy-map-marker-longitude') || '',
      previewLoading: iframe?.getAttribute('loading') || '',
      previewReferrerPolicy: iframe?.getAttribute('referrerpolicy') || '',
      previewAllowFullScreen: iframe instanceof HTMLIFrameElement ? iframe.allowFullscreen : null,
    };
  })()`);

  assert(state.address === SMOKE_MAP_ADDRESS, `Map address control mismatch: ${JSON.stringify(state)}`);
  assert(state.src === '', `Map custom src control mismatch: ${JSON.stringify(state)}`);
  assert(state.markerLabel === SMOKE_MAP_MARKER_LABEL && state.previewMarkerLabel === SMOKE_MAP_MARKER_LABEL, `Map marker label mismatch: ${JSON.stringify(state)}`);
  assert(state.markerLatitude === SMOKE_MAP_MARKER_LATITUDE && state.previewMarkerLatitude === SMOKE_MAP_MARKER_LATITUDE, `Map marker latitude mismatch: ${JSON.stringify(state)}`);
  assert(state.markerLongitude === SMOKE_MAP_MARKER_LONGITUDE && state.previewMarkerLongitude === SMOKE_MAP_MARKER_LONGITUDE, `Map marker longitude mismatch: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke map frame' && state.previewTitle === 'Smoke map frame', `Map title control mismatch: ${JSON.stringify(state)}`);
  assert(state.zoom === '17' && /[?&]z=17(&|$)/.test(state.previewSrc), `Map zoom control mismatch: ${JSON.stringify(state)}`);
  assert(state.previewMapAddress === SMOKE_MAP_ADDRESS, `Map address data attribute mismatch: ${JSON.stringify(state)}`);
  assert(state.decodedPreviewSrc.includes(`${SMOKE_MAP_MARKER_LATITUDE},${SMOKE_MAP_MARKER_LONGITUDE}`) && state.previewSrc.includes('output=embed'), `Map marker coordinates were not reflected in embed URL: ${JSON.stringify(state)}`);
  assert(state.loading === 'eager' && state.previewLoading === 'eager', `Map loading control mismatch: ${JSON.stringify(state)}`);
  assert(state.referrerPolicy === 'origin' && state.previewReferrerPolicy === 'origin', `Map referrer policy mismatch: ${JSON.stringify(state)}`);
  assert(state.allowFullScreen === false && state.previewAllowFullScreen === false, `Map fullscreen control mismatch: ${JSON.stringify(state)}`);

  return state;
};

const assertPersistedMapBehavior = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  const map = findCanvasElement(elements, 'smoke-map');
  const props = map?.props || {};

  assert(map?.type === 'map', `Persisted smoke-map missing: ${JSON.stringify(map)}`);
  assert(props.address === SMOKE_MAP_ADDRESS, `Persisted map address mismatch: ${JSON.stringify(props)}`);
  assert(props.src === undefined || props.src === '', `Persisted map src mismatch: ${JSON.stringify(props)}`);
  assert(props.markerLabel === SMOKE_MAP_MARKER_LABEL, `Persisted map marker label mismatch: ${JSON.stringify(props)}`);
  assert(props.markerLatitude === Number(SMOKE_MAP_MARKER_LATITUDE), `Persisted map marker latitude mismatch: ${JSON.stringify(props)}`);
  assert(props.markerLongitude === Number(SMOKE_MAP_MARKER_LONGITUDE), `Persisted map marker longitude mismatch: ${JSON.stringify(props)}`);
  assert(props.title === 'Smoke map frame', `Persisted map title mismatch: ${JSON.stringify(props)}`);
  assert(props.zoom === 17, `Persisted map zoom mismatch: ${JSON.stringify(props)}`);
  assert(props.loading === 'eager', `Persisted map loading mismatch: ${JSON.stringify(props)}`);
  assert(props.referrerPolicy === 'origin', `Persisted map referrer policy mismatch: ${JSON.stringify(props)}`);
  assert(props.allowFullScreen === false, `Persisted map fullscreen mismatch: ${JSON.stringify(props)}`);

  return props;
};

const dragSelectionHandle = async (client, elementId, deltaX, deltaY, options = {}) => {
  await scrollElementIntoView(client, elementId);
  if (options.selectFirst !== false) {
    await selectElement(client, elementId);
  }
  const before = await getElementBox(client, elementId);
  assert(before, `Missing element ${elementId} before move-handle drag`);
  const handle = await waitForMoveHandleBox(client, elementId);
  if (!handle) {
    const selectionState = await evaluate(client, `(() => {
      const node = document.querySelector('[data-element-id="${elementId}"]');
      const selected = Array.from(document.querySelectorAll('[data-element-id]'))
        .filter((candidate) => candidate.querySelector('[data-role="canvas-move-handle"]'))
        .map((candidate) => ({
          id: candidate.getAttribute('data-element-id'),
          className: candidate.className?.toString?.() || '',
        }));
      return {
        exists: Boolean(node),
        className: node?.className?.toString?.() || '',
        text: node?.textContent?.trim?.().slice(0, 120) || '',
        box: (() => {
          const rect = node?.getBoundingClientRect?.();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        })(),
        centerHit: (() => {
          const rect = node?.getBoundingClientRect?.();
          if (!rect) return null;
          const hit = document.elementFromPoint(rect.x + Math.min(rect.width / 2, 60), rect.y + Math.min(rect.height / 2, 24));
          const element = hit instanceof Element ? hit : hit?.parentElement;
          const host = element?.closest?.('[data-element-id]');
          return {
            tag: element?.tagName || null,
            text: element?.textContent?.trim?.().slice(0, 80) || '',
            elementId: host?.getAttribute('data-element-id') || null,
            className: element?.className?.toString?.() || '',
          };
        })(),
        selected,
      };
    })()`);
    assert(handle, `Missing move handle for selected element ${elementId}: ${JSON.stringify(selectionState)}`);
  }

  const startX = Math.round(handle.x + Math.min(handle.width / 2, 56));
  const startY = Math.round(handle.y + Math.min(handle.height / 2, 12));
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startX + (deltaX * step) / 8),
      y: Math.round(startY + (deltaY * step) / 8),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after move-handle drag`);

  const delta = measureDragDelta(before, after, deltaX, deltaY);
  assertDragDelta(delta, `${elementId} move handle did not drag correctly`);

  return {
    elementId,
    before: { x: Math.round(before.x), y: Math.round(before.y), left: before.left, top: before.top },
    after: { x: Math.round(after.x), y: Math.round(after.y), left: after.left, top: after.top },
    delta,
  };
};

const dragEditingMoveHandle = async (client, elementId, deltaX, deltaY) => {
  const editing = await activateTextEditing(client, elementId);
  const drag = await dragSelectionHandle(client, elementId, deltaX, deltaY, { selectFirst: false });
  return { editing, drag };
};

const resizeElement = async (client, elementId, deltaX, deltaY, options = {}) => {
  await scrollElementIntoView(client, elementId);
  const selectionBox = await getElementBox(client, elementId);
  assert(selectionBox, `Missing element ${elementId}`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(150);

  const before = await getElementBox(client, elementId);
  const handle = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const requestedPosition = ${JSON.stringify(options.handle || 'se')};
    const handles = Array.from(node.children).filter((child) => (
      child.getAttribute('data-role') === 'canvas-resize-handle' &&
      (!requestedPosition || child.getAttribute('data-resize-handle') === requestedPosition)
    )).map((handle) => {
      const rect = handle.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        position: handle.getAttribute('data-resize-handle'),
      };
    });
    return handles[0] || null;
  })()`);
  assert(before && handle, `Missing ${options.handle || 'se'} resize handle for ${elementId}`);

  const startX = Math.round(handle.x + handle.width / 2);
  const startY = Math.round(handle.y + handle.height / 2);
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    modifiers: (options.shiftKey ? 8 : 0) | (options.altKey ? 1 : 0),
  });
  await sleep(50);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 1,
    modifiers: (options.shiftKey ? 8 : 0) | (options.altKey ? 1 : 0),
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after resize`);
  if (options.assert) {
    options.assert({ before, after, handle });
  } else {
    assert(
      after.width > before.width && after.height > before.height,
      `${elementId} did not resize larger: before ${Math.round(before.width)}x${Math.round(before.height)}, after ${Math.round(after.width)}x${Math.round(after.height)}`,
    );
  }

  return {
    elementId,
    handle,
    before: {
      x: Math.round(before.x),
      y: Math.round(before.y),
      width: Math.round(before.width),
      height: Math.round(before.height),
    },
    after: {
      x: Math.round(after.x),
      y: Math.round(after.y),
      width: Math.round(after.width),
      height: Math.round(after.height),
    },
  };
};

const testResizeControls = async (client) => {
  await selectElement(client, 'smoke-image');
  const edgeHandleInventory = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="smoke-image"]');
    if (!(node instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-smoke-image' };
    }
    return {
      ok: true,
      handles: Array.from(node.querySelectorAll('[data-role="canvas-resize-handle"]')).map((handle) => (
        handle.getAttribute('data-resize-handle')
      )).sort(),
    };
  })()`);
  assert(
    edgeHandleInventory?.ok && ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'].every((handle) => edgeHandleInventory.handles.includes(handle)),
    `Resize handle inventory missing expected edge/corner handles: ${JSON.stringify(edgeHandleInventory)}`,
  );

  const eastResize = await resizeElement(client, 'smoke-image', 70, 0, {
    handle: 'e',
    assert: ({ before, after }) => {
      assert(after.width > before.width, `East resize did not increase width: before ${before.width}, after ${after.width}`);
      assert(Math.abs(after.height - before.height) < 3, `East resize should not change height: before ${before.height}, after ${after.height}`);
    },
  });

  const southResize = await resizeElement(client, 'smoke-image', 0, 50, {
    handle: 's',
    assert: ({ before, after }) => {
      assert(after.height > before.height, `South resize did not increase height: before ${before.height}, after ${after.height}`);
      assert(Math.abs(after.width - before.width) < 3, `South resize should not change width: before ${before.width}, after ${after.width}`);
    },
  });

  const shiftAspectResize = await resizeElement(client, 'smoke-video', 90, 12, {
    handle: 'se',
    shiftKey: true,
    assert: ({ before, after }) => {
      const beforeRatio = before.width / before.height;
      const afterRatio = after.width / after.height;
      assert(after.width > before.width && after.height > before.height, `Shift resize did not expand both axes: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
      assert(Math.abs(beforeRatio - afterRatio) < 0.08, `Shift resize did not preserve aspect ratio: before ${beforeRatio}, after ${afterRatio}`);
    },
  });

  const altCenterResize = await resizeElement(client, 'smoke-image', 60, 40, {
    handle: 'se',
    altKey: true,
    assert: ({ before, after }) => {
      const beforeCenterX = before.x + before.width / 2;
      const beforeCenterY = before.y + before.height / 2;
      const afterCenterX = after.x + after.width / 2;
      const afterCenterY = after.y + after.height / 2;
      assert(after.width > before.width && after.height > before.height, `Alt resize did not expand both axes: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
      assert(Math.abs(beforeCenterX - afterCenterX) < 4 && Math.abs(beforeCenterY - afterCenterY) < 4, `Alt resize did not preserve center: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
    },
  });

  return {
    edgeHandleInventory,
    eastResize,
    southResize,
    shiftAspectResize,
    altCenterResize,
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-editor-drag-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir }) => {
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
  const tempPageId = EDITOR_PATH ? null : await createSmokePage();
  const skipsAuxiliaryFixtures = EDITOR_PATH || LIBRARY_SMOKE || CLIPBOARD_SMOKE || Z_ORDER_SMOKE || SAVE_SMOKE || CONFLICT_SMOKE || PAGE_SETTINGS_SMOKE || DELETE_SMOKE || LAYERS_SMOKE || SHORTCUTS_SMOKE || MULTI_SELECT_SMOKE || ZOOM_SMOKE || GRID_SNAP_SMOKE || ALIGNMENT_GUIDES_SMOKE || MEDIA_UPLOAD_SMOKE || RESIZE_SMOKE;
  const tempReusableSectionId = skipsAuxiliaryFixtures ? null : await createSmokeReusableSection();
  const tempCollection = skipsAuxiliaryFixtures ? null : await createSmokeCollection();
  const editorPath = EDITOR_PATH || `/pages/${tempPageId}/edit`;
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(),
    });
    await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}${editorPath}` });

    await waitForEditorElements(client, EDITOR_PATH
      ? ['home-heading', 'home-cta']
      : ['smoke-heading', 'smoke-child-button', 'smoke-top-edge', 'smoke-list', 'smoke-divider', 'smoke-columns', 'smoke-nav', 'smoke-spacer', 'smoke-quote', 'smoke-link', 'smoke-form', 'smoke-comment', 'smoke-video', 'smoke-icon', 'smoke-embed', 'smoke-map', 'smoke-input', 'smoke-textarea', 'smoke-select', 'smoke-checkbox', 'smoke-radio', 'smoke-repeater']);

    if (LIBRARY_SMOKE) {
      assert(!EDITOR_PATH, 'Component library smoke currently requires an internally created smoke page');
      const componentLibrary = await testComponentLibraryControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'component-library',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        componentLibrary,
      }, null, 2));
      return;
    }

    if (CLIPBOARD_SMOKE) {
      const targetElementId = EDITOR_PATH ? 'home-heading' : 'smoke-heading';
      const clipboardEditing = await testClipboardEditingControls(client, targetElementId);
      await clickSave(client);
      const savedStatus = await waitForEditorMutationReady(client, 'after clipboard smoke save');

      console.log(JSON.stringify({
        ok: true,
        mode: 'clipboard',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        targetElementId,
        clipboardEditing,
        savedStatus,
      }, null, 2));
      return;
    }

    if (Z_ORDER_SMOKE) {
      const targetElementId = EDITOR_PATH ? 'home-heading' : 'smoke-heading';
      const zOrderControls = await testZOrderQuickControls(client, targetElementId);
      await clickSave(client);
      const savedStatus = await waitForEditorMutationReady(client, 'after z-order smoke save');

      console.log(JSON.stringify({
        ok: true,
        mode: 'z-order',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        targetElementId,
        zOrderControls,
        savedStatus,
      }, null, 2));
      return;
    }

    if (SAVE_SMOKE) {
      assert(!EDITOR_PATH, 'Save smoke currently requires an internally created smoke page');
      const saveEditing = await testSaveEditingControls(client, tempPageId, editorPath);

      console.log(JSON.stringify({
        ok: true,
        mode: 'save',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        saveEditing,
      }, null, 2));
      return;
    }

    if (CONFLICT_SMOKE) {
      assert(!EDITOR_PATH, 'Conflict smoke currently requires an internally created smoke page');
      const conflict = await expectPageSaveConflict(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'conflict',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        conflict,
      }, null, 2));
      return;
    }

    if (DELETE_SMOKE) {
      assert(!EDITOR_PATH, 'Delete smoke currently requires an internally created smoke page');
      const deleteEditing = await testDeleteEditingControls(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'delete',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        deleteEditing,
      }, null, 2));
      return;
    }

    if (LAYERS_SMOKE) {
      assert(!EDITOR_PATH, 'Layers smoke currently requires an internally created smoke page');
      const layersPanel = await testLayersPanelControls(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'layers',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        layersPanel,
      }, null, 2));
      return;
    }

    if (SHORTCUTS_SMOKE) {
      assert(!EDITOR_PATH, 'Keyboard shortcuts smoke currently requires an internally created smoke page');
      const keyboardShortcuts = await testKeyboardShortcutControls(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'shortcuts',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        keyboardShortcuts,
      }, null, 2));
      return;
    }

    if (MULTI_SELECT_SMOKE) {
      assert(!EDITOR_PATH, 'Multi-select smoke currently requires an internally created smoke page');
      const multiSelect = await testMultiSelectionControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'multi-select',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        multiSelect,
      }, null, 2));
      return;
    }

    if (ZOOM_SMOKE) {
      assert(!EDITOR_PATH, 'Zoom smoke currently requires an internally created smoke page');
      const zoomControls = await testZoomControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'zoom',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        zoomControls,
      }, null, 2));
      return;
    }

    if (RESIZE_SMOKE) {
      assert(!EDITOR_PATH, 'Resize smoke currently requires an internally created smoke page');
      const resizeControls = await testResizeControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'resize',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        resizeControls,
      }, null, 2));
      return;
    }

    if (GRID_SNAP_SMOKE) {
      assert(!EDITOR_PATH, 'Grid/snap smoke currently requires an internally created smoke page');
      const gridSnapControls = await testGridSnapControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'grid-snap',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        gridSnapControls,
      }, null, 2));
      return;
    }

    if (ALIGNMENT_GUIDES_SMOKE) {
      assert(!EDITOR_PATH, 'Alignment guide smoke currently requires an internally created smoke page');
      const alignmentGuides = await testAlignmentGuideControls(client);

      console.log(JSON.stringify({
        ok: true,
        mode: 'alignment-guides',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        alignmentGuides,
      }, null, 2));
      return;
    }

    if (MEDIA_UPLOAD_SMOKE) {
      assert(!EDITOR_PATH, 'Media upload smoke currently requires an internally created smoke page');
      const mediaUpload = await testMediaUploadModalControls(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'media-upload',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        mediaUpload,
      }, null, 2));
      return;
    }

    if (PAGE_SETTINGS_SMOKE) {
      assert(!EDITOR_PATH, 'Page settings smoke currently requires an internally created smoke page');
      const pageSettings = await testPageSettingsControls(client, tempPageId);

      console.log(JSON.stringify({
        ok: true,
        mode: 'page-settings',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        pageSettings,
      }, null, 2));
      return;
    }

    if (RICH_TEXT_SMOKE) {
      assert(!EDITOR_PATH, 'Rich text smoke currently requires an internally created smoke page');
      const richText = await testRichTextInlineMarkdownControls(client, 'smoke-heading');
      const selectedRange = await testRichTextSelectedRangeControls(client, 'smoke-heading');
      await clickSave(client);
      const selectedRangeSavedStatus = await waitForEditorMutationReady(client, 'after selected rich text smoke save');
      const persistedSelectedRange = await assertPersistedSelectedRichTextMarks(tempPageId, 'smoke-heading');
      const blockquoteAndTable = await testRichTextBlockquoteAndTableControls(client, 'smoke-heading');
      await clickSave(client);
      const savedStatus = await waitForEditorMutationReady(client, 'after rich text block smoke save');
      const persistedBlocks = await assertPersistedRichTextBlocks(tempPageId, 'smoke-heading');

      console.log(JSON.stringify({
        ok: true,
        mode: 'rich-text',
        url: `${ADMIN_BASE_URL}${editorPath}`,
        richText,
        selectedRange,
        blockquoteAndTable,
        persistedSelectedRange,
        selectedRangeSavedStatus,
        persistedBlocks,
        savedStatus,
      }, null, 2));
      return;
    }

    const componentSmokeHandlers = {
      image: {
        targetElementId: 'smoke-image',
        test: () => testImageBehaviorControls(client),
        assertPersisted: () => assertPersistedImageBehavior(tempPageId),
      },
      icon: {
        targetElementId: 'smoke-icon',
        test: () => testIconBehaviorControls(client),
        assertPersisted: () => assertPersistedIconBehavior(tempPageId),
      },
      video: {
        targetElementId: 'smoke-video',
        test: () => testVideoBehaviorControls(client),
        assertPersisted: () => assertPersistedVideoBehavior(tempPageId),
      },
      embed: {
        targetElementId: 'smoke-embed',
        test: () => testEmbedBehaviorControls(client),
        assertPersisted: () => assertPersistedEmbedBehavior(tempPageId),
      },
      map: {
        targetElementId: 'smoke-map',
        test: () => testMapBehaviorControls(client),
        assertPersisted: () => assertPersistedMapBehavior(tempPageId),
      },
      input: {
        targetElementId: 'smoke-input',
        test: () => testInputFieldBehaviorControls(client),
        assertPersisted: () => assertPersistedInputFieldBehavior(tempPageId),
      },
      textarea: {
        targetElementId: 'smoke-textarea',
        test: () => testTextareaFieldBehaviorControls(client),
        assertPersisted: () => assertPersistedTextareaFieldBehavior(tempPageId),
      },
      select: {
        targetElementId: 'smoke-select',
        test: () => testSelectFieldBehaviorControls(client),
        assertPersisted: () => assertPersistedSelectFieldBehavior(tempPageId),
      },
      checkbox: {
        targetElementId: 'smoke-checkbox',
        test: () => testChoiceFieldBehaviorControls(client, 'smoke-checkbox', 'checkbox', CHECKBOX_BEHAVIOR_SPEC),
        assertPersisted: () => assertPersistedChoiceFieldBehavior(tempPageId, 'smoke-checkbox', 'checkbox', CHECKBOX_BEHAVIOR_SPEC),
      },
      radio: {
        targetElementId: 'smoke-radio',
        test: () => testChoiceFieldBehaviorControls(client, 'smoke-radio', 'radio', RADIO_BEHAVIOR_SPEC),
        assertPersisted: () => assertPersistedChoiceFieldBehavior(tempPageId, 'smoke-radio', 'radio', RADIO_BEHAVIOR_SPEC),
      },
      button: {
        targetElementId: 'smoke-child-button',
        test: () => testButtonLinkBehaviorControls(client),
        assertPersisted: () => assertPersistedButtonLinkBehavior(tempPageId),
      },
      repeater: {
        targetElementId: 'smoke-repeater',
        test: () => testRepeaterControls(client, tempCollection?.id),
        assertPersisted: () => assertPersistedRepeater(tempPageId, tempCollection?.id),
      },
      list: {
        targetElementId: 'smoke-list',
        test: () => testListBehaviorControls(client),
        assertPersisted: () => assertPersistedListBehavior(tempPageId),
      },
      divider: {
        targetElementId: 'smoke-divider',
        test: () => testDividerBehaviorControls(client),
        assertPersisted: () => assertPersistedDividerBehavior(tempPageId),
      },
      columns: {
        targetElementId: 'smoke-columns',
        test: () => testColumnsBehaviorControls(client),
        assertPersisted: () => assertPersistedColumnsBehavior(tempPageId),
      },
      nav: {
        targetElementId: 'smoke-nav',
        test: () => testNavBehaviorControls(client),
        assertPersisted: () => assertPersistedNavBehavior(tempPageId),
      },
      spacer: {
        targetElementId: 'smoke-spacer',
        test: () => testSpacerBehaviorControls(client),
        assertPersisted: () => assertPersistedSpacerBehavior(tempPageId),
      },
      quote: {
        targetElementId: 'smoke-quote',
        test: () => testQuoteBehaviorControls(client),
        assertPersisted: () => assertPersistedQuoteBehavior(tempPageId),
      },
      link: {
        targetElementId: 'smoke-link',
        test: () => testLinkBehaviorControls(client),
        assertPersisted: () => assertPersistedLinkBehavior(tempPageId),
      },
      form: {
        targetElementId: 'smoke-form',
        test: () => testFormBehaviorControls(client, tempCollection?.id),
        assertPersisted: () => assertPersistedFormBehavior(tempPageId, tempCollection?.id),
      },
      comment: {
        targetElementId: 'smoke-comment',
        test: () => testCommentBehaviorControls(client),
        assertPersisted: () => assertPersistedCommentBehavior(tempPageId),
      },
      box: {
        targetElementId: 'smoke-box',
        test: () => testBoxBehaviorControls(client),
        assertPersisted: () => assertPersistedBoxBehavior(tempPageId),
      },
      heading: {
        targetElementId: 'smoke-heading',
        test: () => testHeadingTypographyControls(client),
        assertPersisted: () => assertPersistedHeadingTypography(tempPageId),
      },
    };
    const componentSmoke = componentSmokeHandlers[COMPONENT_SMOKE];
    if (componentSmoke) {
      assert(tempPageId, `${COMPONENT_SMOKE} component smoke requires an internally created smoke page`);
      const targetElementId = componentSmoke.targetElementId;
      const behaviorControls = await componentSmoke.test();
      await clickSave(client);
      const savedStatus = await waitForEditorMutationReady(client, `after ${COMPONENT_SMOKE} component smoke save`);
      const persistedBehavior = await componentSmoke.assertPersisted();
      let reloadedState = null;
      let reloadClient = null;
      try {
        reloadClient = await openAuthenticatedEditorTab(client, `${ADMIN_BASE_URL}${editorPath}`);
        await waitForEditorElements(reloadClient, [targetElementId]);
        reloadedState = await readEditorElementState(reloadClient, [targetElementId]);
      } finally {
        if (reloadClient) {
          try {
            await reloadClient.send('Page.close');
          } catch {
            // The target may already be closed by Chrome during cleanup.
          }
          reloadClient.close();
        }
      }

      console.log(JSON.stringify({
        ok: true,
        mode: COMPONENT_SMOKE,
        url: `${ADMIN_BASE_URL}${editorPath}`,
        behaviorControls,
        savedStatus,
        persistedBehavior,
        reloadedState,
      }, null, 2));
      return;
    }

    const clickAdd = await testComponentClickAdd(client, 'divider');

    const drags = EDITOR_PATH
      ? [
          await dragElement(client, 'home-heading', 90, 40),
          await dragElement(client, 'home-cta', 70, 30),
        ]
      : [
          await dragElement(client, 'smoke-heading', 90, 40),
          await dragElement(client, 'smoke-image', 80, 40),
          await dragElement(client, 'smoke-box', 70, 30),
          await dragElement(client, 'smoke-child-button', 40, 20),
          await dragElement(client, 'smoke-form', 60, 30),
        ];
    const moveHandleDrags = EDITOR_PATH
      ? [
          await dragSelectionHandle(client, 'home-heading', 40, 20),
        ]
      : [
          await dragSelectionHandle(client, 'smoke-heading', 40, 20),
          await dragSelectionHandle(client, 'smoke-top-edge', 30, 20),
        ];
    const editingMoveHandleDrags = EDITOR_PATH
      ? [
          await dragEditingMoveHandle(client, 'home-heading', 25, 15),
        ]
      : [
          await dragEditingMoveHandle(client, 'smoke-heading', 25, 15),
        ];
    const resizes = EDITOR_PATH ? [] : [
      await resizeElement(client, 'smoke-image', 50, 40),
      await resizeElement(client, 'smoke-form', 50, 40),
    ];
    const keyboard = EDITOR_PATH
      ? {
          nudges: [
            await testKeyboardNudge(client, 'home-cta'),
          ],
          undoRedo: [
            await testUndoRedoAfterDrag(client, 'home-heading'),
          ],
        }
      : {
          nudges: [
            await testKeyboardNudge(client, 'smoke-child-button'),
          ],
          undoRedo: [
            await testUndoRedoAfterDrag(client, 'smoke-box'),
          ],
        };
    const nonDragUndoRedo = EDITOR_PATH
      ? null
      : {
          inspectorLayout: await testUndoRedoAfterInspectorLayoutChange(client, 'smoke-top-edge'),
          keyboardNudge: await testUndoRedoAfterKeyboardNudge(client, 'smoke-top-edge'),
          layerVisibility: await testUndoRedoAfterLayerVisibilityToggle(client, 'smoke-form'),
        };
    const inspector = await assertInspectorSelection(client, EDITOR_PATH ? 'home-heading' : 'smoke-heading');
    await switchToPropertiesPanel(client);
    const dirtySaveStatus = await readEditorSaveStatus(client);
    assert(
      /Unsaved|Autosaving|Saving|Saved|Save failed/.test(dirtySaveStatus.text),
      `Editor save status did not expose a known state: ${JSON.stringify(dirtySaveStatus)}`,
    );
    assert(
      ['dirty', 'autosaving', 'saving', 'saved', 'error'].includes(dirtySaveStatus.saveState),
      `Editor save status did not expose a structured state: ${JSON.stringify(dirtySaveStatus)}`,
    );
    if (dirtySaveStatus.saveState === 'dirty') {
      assert(
        /Autosave queued/.test(dirtySaveStatus.title) && dirtySaveStatus.pendingChanges > 0,
        `Dirty save status did not expose autosave queue details: ${JSON.stringify(dirtySaveStatus)}`,
      );
    }
    const clipboardEditing = await testClipboardEditingControls(client, EDITOR_PATH ? 'home-heading' : 'smoke-heading');
    const fontPicker = await assertFontMediaPicker(client);
    const groupingControls = await assertGroupingControls(client);
    const shortcutGuards = await testEditorShortcutGuards(client, EDITOR_PATH ? 'home-heading' : 'smoke-heading');
    const siblingScopeSelection = await testSiblingScopeSelectionShortcut(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const multiSelectionDrag = await testMultiSelectionCanvasDrag(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const multiSelectionResize = EDITOR_PATH
      ? null
      : await testMultiSelectionResize(client, ['smoke-image', 'smoke-heading']);
    const multiSelectionDistribution = EDITOR_PATH
      ? null
      : await testMultiSelectionDistribution(client, ['smoke-heading', 'smoke-image', 'smoke-box']);
    const grouping = await testLayerGrouping(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const layerHierarchy = EDITOR_PATH
      ? null
      : await testLayerHierarchyControls(client);
    const syncedReusableSection = tempReusableSectionId
      ? await testSyncedReusableSectionInstance(client, tempReusableSectionId)
      : null;
    const afterReusableMutationReady = tempReusableSectionId
      ? await waitForEditorMutationReady(client, 'after synced reusable section actions')
      : null;
    const dataBindingQueryControls = tempCollection
      ? await testCollectionDataBindingControls(client, tempCollection.id)
      : null;
    const repeaterControls = tempCollection
      ? await testRepeaterControls(client, tempCollection.id)
      : null;
    const imageBehaviorControls = EDITOR_PATH
      ? null
      : await testImageBehaviorControls(client);
    const iconBehaviorControls = EDITOR_PATH
      ? null
      : await testIconBehaviorControls(client);
    const listBehaviorControls = EDITOR_PATH
      ? null
      : await testListBehaviorControls(client);
    const dividerBehaviorControls = EDITOR_PATH
      ? null
      : await testDividerBehaviorControls(client);
    const columnsBehaviorControls = EDITOR_PATH
      ? null
      : await testColumnsBehaviorControls(client);
    const navBehaviorControls = EDITOR_PATH
      ? null
      : await testNavBehaviorControls(client);
    const spacerBehaviorControls = EDITOR_PATH
      ? null
      : await testSpacerBehaviorControls(client);
    const quoteBehaviorControls = EDITOR_PATH
      ? null
      : await testQuoteBehaviorControls(client);
    const inputFieldBehaviorControls = EDITOR_PATH
      ? null
      : await testInputFieldBehaviorControls(client);
    const textareaFieldBehaviorControls = EDITOR_PATH
      ? null
      : await testTextareaFieldBehaviorControls(client);
    const selectFieldBehaviorControls = EDITOR_PATH
      ? null
      : await testSelectFieldBehaviorControls(client);
    const checkboxFieldBehaviorControls = EDITOR_PATH
      ? null
      : await testChoiceFieldBehaviorControls(client, 'smoke-checkbox', 'checkbox', CHECKBOX_BEHAVIOR_SPEC);
    const radioFieldBehaviorControls = EDITOR_PATH
      ? null
      : await testChoiceFieldBehaviorControls(client, 'smoke-radio', 'radio', RADIO_BEHAVIOR_SPEC);
    const buttonLinkBehaviorControls = EDITOR_PATH
      ? null
      : await testButtonLinkBehaviorControls(client);
    const linkBehaviorControls = EDITOR_PATH
      ? null
      : await testLinkBehaviorControls(client);
    const formBehaviorControls = EDITOR_PATH
      ? null
      : await testFormBehaviorControls(client, tempCollection?.id);
    const commentBehaviorControls = EDITOR_PATH
      ? null
      : await testCommentBehaviorControls(client);
    const boxBehaviorControls = EDITOR_PATH
      ? null
      : await testBoxBehaviorControls(client);
    const headingTypographyControls = EDITOR_PATH
      ? null
      : await testHeadingTypographyControls(client);
    const videoBehaviorControls = EDITOR_PATH
      ? null
      : await testVideoBehaviorControls(client);
    const embedBehaviorControls = EDITOR_PATH
      ? null
      : await testEmbedBehaviorControls(client);
    const mapBehaviorControls = EDITOR_PATH
      ? null
      : await testMapBehaviorControls(client);

    let persistedState = null;
    let reloadedState = null;
    let responsiveEditing = null;
    let reloadedResponsiveEditing = null;
    let postSaveInspector = null;
    let savedStatus = null;
    let queuedAutosaveStatus = null;
    let persistedDataBinding = null;
    let persistedRepeater = null;
    let persistedImageBehavior = null;
    let persistedIconBehavior = null;
    let persistedListBehavior = null;
    let persistedDividerBehavior = null;
    let persistedColumnsBehavior = null;
    let persistedNavBehavior = null;
    let persistedSpacerBehavior = null;
    let persistedQuoteBehavior = null;
    let persistedInputFieldBehavior = null;
    let persistedTextareaFieldBehavior = null;
    let persistedSelectFieldBehavior = null;
    let persistedCheckboxFieldBehavior = null;
    let persistedRadioFieldBehavior = null;
    let persistedButtonLinkBehavior = null;
    let persistedLinkBehavior = null;
    let persistedFormBehavior = null;
    let persistedCommentBehavior = null;
    let persistedBoxBehavior = null;
    let persistedHeadingTypography = null;
    let persistedVideoBehavior = null;
    let persistedEmbedBehavior = null;
    let persistedMapBehavior = null;
    if (tempPageId) {
      const elementIds = ['smoke-heading', 'smoke-image', 'smoke-video', 'smoke-icon', 'smoke-embed', 'smoke-map', 'smoke-top-edge', 'smoke-list', 'smoke-divider', 'smoke-columns', 'smoke-nav', 'smoke-spacer', 'smoke-quote', 'smoke-link', 'smoke-box', 'smoke-child-button', 'smoke-form', 'smoke-comment', 'smoke-input', 'smoke-textarea', 'smoke-select', 'smoke-checkbox', 'smoke-radio', 'smoke-repeater'];
      responsiveEditing = {
        mobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-heading', {
          breakpoint: 'mobile',
          expectedX: 24,
          expectedWidth: 300,
        }),
        tablet: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-heading', {
          breakpoint: 'tablet',
          expectedX: 64,
          expectedWidth: 360,
        }),
      };
      await clickButtonByAriaLabel(client, 'Desktop canvas');
      await selectElement(client, 'smoke-heading');
      await pressKey(client, 'ArrowRight');
      queuedAutosaveStatus = await waitForEditorSaveStatus(
        client,
        (status) => (
          (
            status.saveState === 'dirty' &&
            status.pendingChanges > 0 &&
            /Autosave queued/.test(status.title) &&
            /unsaved change/.test(status.title)
          ) ||
          (
            status.saveState === 'saved' &&
            status.saveMode === 'autosave' &&
            status.pendingChanges === 0 &&
            Boolean(status.lastSavedAt)
          )
        ),
        'autosave queued status after desktop edit',
      );
      if (queuedAutosaveStatus.saveState === 'saved') {
        await selectElement(client, 'smoke-heading');
        await pressKey(client, 'ArrowRight');
      }
      const preSaveInspector = await readInspectorState(client);
      assert(
        preSaveInspector?.hasSelection && !preSaveInspector.hasEmpty,
        `Inspector selection was not ready before save: ${JSON.stringify(preSaveInspector)}`,
      );
      const expectedState = await readEditorElementState(client, elementIds);
      await clickSave(client);
      savedStatus = await waitForEditorMutationReady(client, 'after manual save');
      assert(
        /Saved/.test(savedStatus.statusText) &&
          savedStatus.saveState === 'saved' &&
          savedStatus.saveMode === 'manual' &&
          savedStatus.pendingChanges === 0 &&
          Boolean(savedStatus.lastSavedAt),
        `Editor save status did not expose manual saved metadata: ${JSON.stringify(savedStatus)}`,
      );
      postSaveInspector = await readInspectorState(client);
      assert(
        postSaveInspector?.hasSelection && !postSaveInspector.hasEmpty,
        `Inspector selection was not preserved after save: ${JSON.stringify(postSaveInspector)}`,
      );
      assert(
        !postSaveInspector.overlapsWorkflow,
        `Workflow panel overlaps editor inspector after save: ${JSON.stringify(postSaveInspector)}`,
      );
      persistedState = await waitForPersistedCanvasState(tempPageId, expectedState);
      persistedDataBinding = tempCollection
        ? await assertPersistedDataBinding(tempPageId, tempCollection.id)
        : null;
      persistedRepeater = tempCollection
        ? await assertPersistedRepeater(tempPageId, tempCollection.id)
        : null;
      persistedImageBehavior = imageBehaviorControls
        ? await assertPersistedImageBehavior(tempPageId)
        : null;
      persistedIconBehavior = iconBehaviorControls
        ? await assertPersistedIconBehavior(tempPageId)
        : null;
      persistedListBehavior = listBehaviorControls
        ? await assertPersistedListBehavior(tempPageId)
        : null;
      persistedDividerBehavior = dividerBehaviorControls
        ? await assertPersistedDividerBehavior(tempPageId)
        : null;
      persistedColumnsBehavior = columnsBehaviorControls
        ? await assertPersistedColumnsBehavior(tempPageId)
        : null;
      persistedNavBehavior = navBehaviorControls
        ? await assertPersistedNavBehavior(tempPageId)
        : null;
      persistedSpacerBehavior = spacerBehaviorControls
        ? await assertPersistedSpacerBehavior(tempPageId)
        : null;
      persistedQuoteBehavior = quoteBehaviorControls
        ? await assertPersistedQuoteBehavior(tempPageId)
        : null;
      persistedInputFieldBehavior = inputFieldBehaviorControls
        ? await assertPersistedInputFieldBehavior(tempPageId)
        : null;
      persistedTextareaFieldBehavior = textareaFieldBehaviorControls
        ? await assertPersistedTextareaFieldBehavior(tempPageId)
        : null;
      persistedSelectFieldBehavior = selectFieldBehaviorControls
        ? await assertPersistedSelectFieldBehavior(tempPageId)
        : null;
      persistedCheckboxFieldBehavior = checkboxFieldBehaviorControls
        ? await assertPersistedChoiceFieldBehavior(tempPageId, 'smoke-checkbox', 'checkbox', CHECKBOX_BEHAVIOR_SPEC)
        : null;
      persistedRadioFieldBehavior = radioFieldBehaviorControls
        ? await assertPersistedChoiceFieldBehavior(tempPageId, 'smoke-radio', 'radio', RADIO_BEHAVIOR_SPEC)
        : null;
      persistedButtonLinkBehavior = buttonLinkBehaviorControls
        ? await assertPersistedButtonLinkBehavior(tempPageId)
        : null;
      persistedLinkBehavior = linkBehaviorControls
        ? await assertPersistedLinkBehavior(tempPageId)
        : null;
      persistedFormBehavior = formBehaviorControls
        ? await assertPersistedFormBehavior(tempPageId, tempCollection?.id)
        : null;
      persistedCommentBehavior = commentBehaviorControls
        ? await assertPersistedCommentBehavior(tempPageId)
        : null;
      persistedBoxBehavior = boxBehaviorControls
        ? await assertPersistedBoxBehavior(tempPageId)
        : null;
      persistedHeadingTypography = headingTypographyControls
        ? await assertPersistedHeadingTypography(tempPageId)
        : null;
      persistedVideoBehavior = videoBehaviorControls
        ? await assertPersistedVideoBehavior(tempPageId)
        : null;
      persistedEmbedBehavior = embedBehaviorControls
        ? await assertPersistedEmbedBehavior(tempPageId)
        : null;
      persistedMapBehavior = mapBehaviorControls
        ? await assertPersistedMapBehavior(tempPageId)
        : null;

      let reloadClient = null;
      try {
        reloadClient = await openAuthenticatedEditorTab(client, `${ADMIN_BASE_URL}${editorPath}`);
        await waitForEditorElements(reloadClient, ['smoke-heading', 'smoke-video', 'smoke-icon', 'smoke-embed', 'smoke-map', 'smoke-list', 'smoke-divider', 'smoke-columns', 'smoke-nav', 'smoke-spacer', 'smoke-quote', 'smoke-link', 'smoke-form', 'smoke-comment', 'smoke-input', 'smoke-textarea', 'smoke-select', 'smoke-checkbox', 'smoke-radio', 'smoke-repeater']);
        reloadedState = await readEditorElementState(reloadClient, elementIds);
        reloadedResponsiveEditing = {
          mobile: await assertResponsiveBreakpointEditing(
            reloadClient,
            tempPageId,
            'smoke-heading',
            {
              breakpoint: 'mobile',
              expectedX: 24,
              expectedWidth: 300,
              expectExistingLayerOverride: true,
            },
          ),
          tablet: await assertResponsiveBreakpointEditing(
            reloadClient,
            tempPageId,
            'smoke-heading',
            {
              breakpoint: 'tablet',
              expectedX: 64,
              expectedWidth: 360,
              expectExistingLayerOverride: true,
            },
          ),
        };
      } finally {
        if (reloadClient) {
          try {
            await reloadClient.send('Page.close');
          } catch {
            // The target may already be closed by Chrome during cleanup.
          }
          reloadClient.close();
        }
      }

      assert(
        Object.entries(expectedState).every(([elementId, expected]) => {
          const reloaded = reloadedState[elementId];
          return reloaded &&
            Math.abs(reloaded.x - expected.x) <= 1 &&
            Math.abs(reloaded.y - expected.y) <= 1 &&
            Math.abs(reloaded.width - expected.width) <= 1 &&
            Math.abs(reloaded.height - expected.height) <= 1;
        }),
        `Reloaded canvas state did not match saved state. Expected ${JSON.stringify(expectedState)}, got ${JSON.stringify(reloadedState)}`,
      );
      assert(
        reloadedResponsiveEditing &&
          responsiveEditing &&
          reloadedResponsiveEditing.mobile.breakpointAfter.x === responsiveEditing.mobile.breakpointAfter.x &&
          reloadedResponsiveEditing.mobile.breakpointAfter.width === responsiveEditing.mobile.breakpointAfter.width &&
          reloadedResponsiveEditing.tablet.breakpointAfter.x === responsiveEditing.tablet.breakpointAfter.x &&
          reloadedResponsiveEditing.tablet.breakpointAfter.width === responsiveEditing.tablet.breakpointAfter.width,
        `Reloaded editor did not hydrate saved responsive overrides: ${JSON.stringify({ responsiveEditing, reloadedResponsiveEditing })}`,
      );
    }

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);
    const invalidInputWarnings = client.events
      .filter((event) => (
        event.method === 'Log.entryAdded'
        && event.params?.entry?.level === 'warning'
        && /cannot be parsed|out of range/i.test(event.params.entry.text || '')
      ))
      .map((event) => event.params.entry.text);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);
    assert(invalidInputWarnings.length === 0, `Browser emitted invalid input warnings: ${JSON.stringify(invalidInputWarnings.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}${editorPath}`,
      drags,
      moveHandleDrags,
      editingMoveHandleDrags,
      resizes,
      keyboard,
      nonDragUndoRedo,
      inspector,
      dirtySaveStatus,
      clipboardEditing,
      fontPicker,
      groupingControls,
      shortcutGuards,
      siblingScopeSelection,
      clickAdd,
      multiSelectionDrag,
      multiSelectionResize,
      multiSelectionDistribution,
      grouping,
      layerHierarchy,
      syncedReusableSection,
      afterReusableMutationReady,
      dataBindingQueryControls,
      repeaterControls,
      imageBehaviorControls,
      iconBehaviorControls,
      listBehaviorControls,
      dividerBehaviorControls,
      columnsBehaviorControls,
      navBehaviorControls,
      spacerBehaviorControls,
      quoteBehaviorControls,
      inputFieldBehaviorControls,
      textareaFieldBehaviorControls,
      selectFieldBehaviorControls,
      checkboxFieldBehaviorControls,
      radioFieldBehaviorControls,
      buttonLinkBehaviorControls,
      linkBehaviorControls,
      formBehaviorControls,
      commentBehaviorControls,
      boxBehaviorControls,
      headingTypographyControls,
      videoBehaviorControls,
      embedBehaviorControls,
      mapBehaviorControls,
      responsiveEditing,
      reloadedResponsiveEditing,
      postSaveInspector,
      queuedAutosaveStatus,
      savedStatus,
      persistedState,
      persistedDataBinding,
      persistedRepeater,
      persistedImageBehavior,
      persistedIconBehavior,
      persistedListBehavior,
      persistedDividerBehavior,
      persistedColumnsBehavior,
      persistedNavBehavior,
      persistedSpacerBehavior,
      persistedQuoteBehavior,
      persistedInputFieldBehavior,
      persistedTextareaFieldBehavior,
      persistedSelectFieldBehavior,
      persistedCheckboxFieldBehavior,
      persistedRadioFieldBehavior,
      persistedButtonLinkBehavior,
      persistedLinkBehavior,
      persistedFormBehavior,
      persistedCommentBehavior,
      persistedBoxBehavior,
      persistedHeadingTypography,
      persistedVideoBehavior,
      persistedEmbedBehavior,
      persistedMapBehavior,
      reloadedState,
      invalidInputWarnings: invalidInputWarnings.length,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } catch (error) {
    throw error;
  } finally {
    await cleanup({ client, childProcess, userDataDir });
    await deleteSmokePage(tempPageId);
    await deleteSmokeReusableSection(tempReusableSectionId);
    await deleteSmokeCollection(tempCollection?.id);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
