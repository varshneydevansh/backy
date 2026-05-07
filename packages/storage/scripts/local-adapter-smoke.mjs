#!/usr/bin/env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAdapter, createStoragePath } from '../dist/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const root = await mkdtemp(join(tmpdir(), 'backy-storage-'));

try {
  const storage = createLocalAdapter({
    provider: 'local',
    basePath: root,
    publicUrl: '/uploads',
  });

  const key = createStoragePath({
    siteId: 'site-demo',
    type: 'images',
    filename: 'hero.png',
    date: new Date('2026-05-08T00:00:00.000Z'),
  });

  assert(key === 'sites/site-demo/images/2026-05/hero.png', `Unexpected storage key: ${key}`);

  const uploaded = await storage.upload(Buffer.from('hello-media'), {
    path: key,
    filename: 'hero.png',
    mimeType: 'image/png',
    metadata: {
      altText: 'Hero image',
    },
  });

  assert(uploaded.path === key, 'upload() returned the wrong path');
  assert(uploaded.url === `/uploads/${key}`, 'upload() returned the wrong public URL');
  assert(uploaded.size === 11, 'upload() returned the wrong size');

  const exists = await storage.exists(key);
  assert(exists, 'exists() did not find uploaded file');

  const body = await storage.read(key);
  assert(body.toString('utf8') === 'hello-media', 'read() returned the wrong bytes');

  const stat = await storage.stat(key);
  assert(stat?.size === 11, 'stat() returned the wrong size');

  const listed = await storage.list('sites/site-demo/images/2026-05');
  assert(listed.some((item) => item.path === key && item.size === 11), 'list() missed uploaded file');

  let blockedTraversal = false;
  try {
    await storage.upload(Buffer.from('bad'), {
      path: '../escape.txt',
      filename: 'escape.txt',
    });
  } catch {
    blockedTraversal = true;
  }
  assert(blockedTraversal, 'local adapter allowed path traversal');

  await storage.delete(key);
  assert(!(await storage.exists(key)), 'delete() did not remove uploaded file');

  console.log(JSON.stringify({
    ok: true,
    provider: storage.provider,
    key,
    root,
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
