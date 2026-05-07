#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [];
let createdUserId = null;
let originalDeliveryMode = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(pathOrUrl, init) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }

  return {
    response,
    text,
    json,
    url,
  };
}

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

async function cleanup() {
  if (createdUserId) {
    await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (originalDeliveryMode) {
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: originalDeliveryMode }),
    }).catch(() => {});
  }
}

try {
  await record('admin users list returns success envelope', async () => {
    const { response, json, url } = await request('/api/admin/users');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(Array.isArray(json?.data?.users), `${url} expected users array`);
  });

  const email = `admin-contract-${Date.now()}@backy.test`;
  await record('admin users create validates and persists user', async () => {
    const { response, json, url } = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Admin Contract User',
        email,
        role: 'viewer',
        status: 'invited',
      }),
    });

    assert(response.status === 201, `${url} expected 201, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.user?.email === email, `${url} returned wrong user email`);
    assert(json?.data?.user?.role === 'viewer', `${url} returned wrong user role`);
    createdUserId = json.data.user.id;
  });

  await record('admin users duplicate email is rejected', async () => {
    const { response, json, url } = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Duplicate Contract User',
        email,
        role: 'viewer',
      }),
    });

    assert(response.status === 409, `${url} expected 409, got ${response.status}`);
    assert(json?.success === false, `${url} expected error envelope`);
    assert(json?.error?.code === 'EMAIL_CONFLICT', `${url} expected EMAIL_CONFLICT`);
  });

  await record('admin users detail and update return edited user', async () => {
    const detail = await request(`/api/admin/users/${createdUserId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.user?.id === createdUserId, `${detail.url} returned wrong user`);

    const update = await request(`/api/admin/users/${createdUserId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: 'editor',
        status: 'active',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.user?.role === 'editor', `${update.url} expected editor role`);
    assert(update.json?.data?.user?.status === 'active', `${update.url} expected active status`);
  });

  await record('admin users delete removes temporary user', async () => {
    const { response, json, url } = await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' });
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.deleted === true, `${url} expected deleted true`);
    createdUserId = null;
  });

  await record('admin settings read returns delivery mode and keys', async () => {
    const { response, json, url } = await request('/api/admin/settings');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.deliveryMode, `${url} missing deliveryMode`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey, `${url} missing publicApiKey`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey, `${url} missing adminApiKey`);
    originalDeliveryMode = json.data.settings.deliveryMode;
  });

  await record('admin settings update validates delivery mode', async () => {
    const invalid = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: 'invalid-mode' }),
    });
    assert(invalid.response.status === 400, `${invalid.url} expected 400, got ${invalid.response.status}`);
    assert(invalid.json?.success === false, `${invalid.url} expected error envelope`);

    const nextMode = originalDeliveryMode === 'custom-frontend' ? 'managed-hosting' : 'custom-frontend';
    const valid = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: nextMode }),
    });
    assert(valid.response.status === 200, `${valid.url} expected 200, got ${valid.response.status}`);
    assert(valid.json?.success === true, `${valid.url} expected success envelope`);
    assert(valid.json?.data?.settings?.deliveryMode === nextMode, `${valid.url} did not persist delivery mode`);
  });

  await record('admin settings regenerates API keys', async () => {
    const before = await request('/api/admin/settings');
    const oldPublicKey = before.json?.data?.settings?.apiKeys?.publicApiKey;
    const oldAdminKey = before.json?.data?.settings?.apiKeys?.adminApiKey;

    const { response, json, url } = await request('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'regenerate-api-keys' }),
    });

    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey !== oldPublicKey, `${url} public key did not rotate`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey !== oldAdminKey, `${url} admin key did not rotate`);
  });

  await cleanup();

  console.log(`Admin contract smoke passed against ${baseUrl}`);
  for (const check of checks) {
    console.log(`- ${check.name} (${check.ms}ms)`);
  }
} catch (error) {
  await cleanup();
  throw error;
}
