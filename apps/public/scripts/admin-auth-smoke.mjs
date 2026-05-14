#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
const adminDevOrigin = 'http://localhost:5173';
const recoveryRateLimitMax = Math.min(Math.max(Number.parseInt(process.env.BACKY_AUTH_RECOVERY_RATE_LIMIT_MAX || '5', 10) || 5, 1), 100);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, init) {
  const url = `${baseUrl}${path}`;
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

function assertCorsAndRequestId(result) {
  assert(result.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${result.url} missing CORS header`);
  assert(result.response.headers.get('x-backy-request-id'), `${result.url} missing request id header`);
  assert(result.response.headers.get('cache-control') === 'no-store', `${result.url} expected admin no-store cache control`);
  assert(result.response.headers.get('x-backy-cache-scope') === 'admin', `${result.url} expected admin cache scope`);
  assert(result.response.headers.get('x-backy-admin-contract-version') === 'backy.admin.v1', `${result.url} missing admin contract version`);
}

function assertSessionDurationMinutes(session, expectedMinutes, label) {
  const issuedAt = Date.parse(session?.issuedAt || '');
  const expiresAt = Date.parse(session?.expiresAt || '');
  assert(Number.isFinite(issuedAt) && Number.isFinite(expiresAt), `${label} expected issuedAt/expiresAt session timestamps`);
  const actualMinutes = Math.round((expiresAt - issuedAt) / 60000);
  assert(actualMinutes === expectedMinutes, `${label} expected ${expectedMinutes} minute session, got ${actualMinutes}`);
}

assert(adminApiKey, 'BACKY_ADMIN_API_KEY or BACKY_ADMIN_SECRET_KEY is required for admin auth smoke');

const checks = [];

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

await record('admin api rejects missing key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
    },
  });

  assert(result.response.status === 401, `${result.url} expected 401 without admin key, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'UNAUTHORIZED', `${result.url} expected UNAUTHORIZED error code`);
  assertCorsAndRequestId(result);
});

await record('admin api rejects wrong key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': `${adminApiKey}-wrong`,
    },
  });

  assert(result.response.status === 401, `${result.url} expected 401 with wrong admin key, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'UNAUTHORIZED', `${result.url} expected UNAUTHORIZED error code`);
  assertCorsAndRequestId(result);
});

await record('admin api accepts x-backy-admin-key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': adminApiKey,
    },
  });

  assert(result.response.status === 200, `${result.url} expected 200 with admin key, got ${result.response.status}`);
  assert(result.json?.success === true, `${result.url} expected success envelope`);
  assertCorsAndRequestId(result);
});

await record('admin api accepts bearer key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      authorization: `Bearer ${adminApiKey}`,
    },
  });

  assert(result.response.status === 200, `${result.url} expected 200 with bearer key, got ${result.response.status}`);
  assert(result.json?.success === true, `${result.url} expected success envelope`);
  assertCorsAndRequestId(result);
});

await record('admin api key cannot use owner-only permissions', async () => {
  const result = await request('/api/admin/settings', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-backy-admin-key': adminApiKey,
    },
    body: JSON.stringify({ action: 'regenerate-api-keys', scope: 'public' }),
  });

  assert(result.response.status === 403, `${result.url} expected 403 for owner-only API key route, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'FORBIDDEN_PERMISSION', `${result.url} expected FORBIDDEN_PERMISSION error code`);
  assertCorsAndRequestId(result);
});

await record('password recovery does not enumerate local accounts', async () => {
  const known = await request('/api/admin/auth/password-recovery', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({ email: 'admin@backy.io' }),
  });
  const unknown = await request('/api/admin/auth/password-recovery', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.11',
    },
    body: JSON.stringify({ email: `missing-${Date.now()}@example.invalid` }),
  });

  assert(known.response.status === 200, `${known.url} expected 200 for known recovery request, got ${known.response.status}`);
  assert(unknown.response.status === 200, `${unknown.url} expected 200 for unknown recovery request, got ${unknown.response.status}`);
  assert(known.json?.success === true && unknown.json?.success === true, 'recovery requests should return success envelopes');
  assert(known.json?.data?.accepted === true && unknown.json?.data?.accepted === true, 'recovery requests should be accepted generically');
  assert(!Object.hasOwn(known.json?.data || {}, 'localRecovery'), 'known recovery response must not include localRecovery');
  assert(!Object.hasOwn(unknown.json?.data || {}, 'localRecovery'), 'unknown recovery response must not include localRecovery');
  assert(
    JSON.stringify(known.json.data) === JSON.stringify(unknown.json.data),
    'known and unknown recovery responses should have the same data envelope',
  );
  assertCorsAndRequestId(known);
  assertCorsAndRequestId(unknown);
});

await record('password recovery rate limits repeated requests', async () => {
  const email = `rate-limit-${Date.now()}@example.invalid`;
  const headers = {
    origin: adminDevOrigin,
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.12',
  };
  let limited = null;

  for (let attempt = 0; attempt < recoveryRateLimitMax + 1; attempt += 1) {
    const result = await request('/api/admin/auth/password-recovery', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (result.response.status === 429) {
      limited = result;
      break;
    }
  }

  assert(limited, 'expected repeated password recovery requests to be rate limited');
  assert(limited.response.status === 429, `${limited.url} expected 429, got ${limited.response.status}`);
  assert(limited.json?.success === false, `${limited.url} expected error envelope`);
  assert(limited.json?.error?.code === 'RATE_LIMITED', `${limited.url} expected RATE_LIMITED error code`);
  assert(Number(limited.response.headers.get('retry-after')) > 0, `${limited.url} expected retry-after header`);
  assertCorsAndRequestId(limited);
});

await record('password reset follows configured minimum length', async () => {
  const settingsBefore = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': adminApiKey,
    },
  });
  assert(settingsBefore.response.status === 200, `${settingsBefore.url} expected settings read 200`);
  const originalAuth = settingsBefore.json?.data?.settings?.auth || {};
  const minPasswordLength = 14;
  const sessionTimeoutMinutes = 45;
  const unique = Date.now().toString(36);
  let userId = '';

  try {
    const updateSettings = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        auth: {
          ...originalAuth,
          minPasswordLength,
          sessionTimeoutMinutes,
        },
      }),
    });
    assert(updateSettings.response.status === 200, `${updateSettings.url} expected settings patch 200`);
    assert(updateSettings.json?.data?.settings?.auth?.minPasswordLength === minPasswordLength, `${updateSettings.url} did not persist minimum password length`);
    assert(updateSettings.json?.data?.settings?.auth?.sessionTimeoutMinutes === sessionTimeoutMinutes, `${updateSettings.url} did not persist session timeout`);

    const createUser = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        fullName: `Password Policy ${unique}`,
        email: `password-policy-${unique}@example.test`,
        role: 'viewer',
        status: 'active',
      }),
    });
    assert(createUser.response.status === 201, `${createUser.url} expected user create 201, got ${createUser.response.status}`);
    userId = createUser.json?.data?.user?.id || '';
    assert(userId, `${createUser.url} missing created user id`);

    const resetTokenResponse = await request(`/api/admin/users/${userId}/password-reset`, {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ expiresInMinutes: 15 }),
    });
    assert(resetTokenResponse.response.status === 200, `${resetTokenResponse.url} expected reset token 200, got ${resetTokenResponse.response.status}`);
    const token = resetTokenResponse.json?.data?.reset?.token;
    assert(token, `${resetTokenResponse.url} missing reset token`);

    const shortReset = await request('/api/admin/auth/reset-password', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.31',
      },
      body: JSON.stringify({ token, password: '1234567890123' }),
    });
    assert(shortReset.response.status === 400, `${shortReset.url} expected configured minimum-length rejection`);
    assert(shortReset.json?.error?.code === 'VALIDATION_ERROR', `${shortReset.url} expected validation error`);
    assert(shortReset.json?.error?.message === `Password must be at least ${minPasswordLength} characters.`, `${shortReset.url} expected configured minimum in message`);

    const validReset = await request('/api/admin/auth/reset-password', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.32',
      },
      body: JSON.stringify({ token, password: '12345678901234' }),
    });
    assert(validReset.response.status === 200, `${validReset.url} expected valid reset 200, got ${validReset.response.status}`);
    assert(validReset.json?.data?.reset === true, `${validReset.url} expected reset success`);
    assert(validReset.json?.data?.session?.token, `${validReset.url} expected reset session`);
    assertSessionDurationMinutes(validReset.json?.data?.session, sessionTimeoutMinutes, validReset.url);

    const login = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: `password-policy-${unique}@example.test`,
        password: '12345678901234',
      }),
    });
    assert(login.response.status === 200, `${login.url} expected login 200, got ${login.response.status}`);
    assertSessionDurationMinutes(login.json?.data?.session, sessionTimeoutMinutes, login.url);
  } finally {
    if (userId) {
      await request(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          origin: adminDevOrigin,
          'x-backy-admin-key': adminApiKey,
        },
      }).catch(() => {});
    }
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ auth: originalAuth }),
    }).catch(() => {});
  }
});

await record('admin user creation follows configured email domains', async () => {
  const settingsBefore = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': adminApiKey,
    },
  });
  assert(settingsBefore.response.status === 200, `${settingsBefore.url} expected settings read 200`);
  const originalAuth = settingsBefore.json?.data?.settings?.auth || {};
  const unique = Date.now().toString(36);
  let userId = '';

  try {
    const updateSettings = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        auth: {
          ...originalAuth,
          allowedEmailDomains: 'example.com, agency.dev',
        },
      }),
    });
    assert(updateSettings.response.status === 200, `${updateSettings.url} expected settings patch 200`);
    assert(
      updateSettings.json?.data?.settings?.auth?.allowedEmailDomains === 'example.com, agency.dev',
      `${updateSettings.url} did not persist allowed email domains`,
    );

    const blockedCreate = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        fullName: `Blocked Domain ${unique}`,
        email: `blocked-domain-${unique}@blocked.test`,
        role: 'viewer',
        status: 'invited',
      }),
    });
    assert(blockedCreate.response.status === 400, `${blockedCreate.url} expected blocked domain 400, got ${blockedCreate.response.status}`);
    assert(blockedCreate.json?.error?.code === 'EMAIL_DOMAIN_NOT_ALLOWED', `${blockedCreate.url} expected EMAIL_DOMAIN_NOT_ALLOWED`);

    const allowedCreate = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        fullName: `Allowed Domain ${unique}`,
        email: `allowed-domain-${unique}@example.com`,
        role: 'viewer',
        status: 'invited',
      }),
    });
    assert(allowedCreate.response.status === 201, `${allowedCreate.url} expected allowed domain create 201, got ${allowedCreate.response.status}`);
    userId = allowedCreate.json?.data?.user?.id || '';
    assert(userId, `${allowedCreate.url} missing created user id`);

    const blockedUpdate = await request(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        email: `blocked-update-${unique}@blocked.test`,
      }),
    });
    assert(blockedUpdate.response.status === 400, `${blockedUpdate.url} expected blocked email update 400, got ${blockedUpdate.response.status}`);
    assert(blockedUpdate.json?.error?.code === 'EMAIL_DOMAIN_NOT_ALLOWED', `${blockedUpdate.url} expected EMAIL_DOMAIN_NOT_ALLOWED on update`);
  } finally {
    if (userId) {
      await request(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          origin: adminDevOrigin,
          'x-backy-admin-key': adminApiKey,
        },
      }).catch(() => {});
    }
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ auth: originalAuth }),
    }).catch(() => {});
  }
});

await record('admin invite-only setting blocks direct activation', async () => {
  const settingsBefore = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': adminApiKey,
    },
  });
  assert(settingsBefore.response.status === 200, `${settingsBefore.url} expected settings read 200`);
  const originalAuth = settingsBefore.json?.data?.settings?.auth || {};
  const unique = Date.now().toString(36);
  let invitedUserId = '';

  try {
    const updateSettings = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        auth: {
          ...originalAuth,
          inviteOnly: true,
        },
      }),
    });
    assert(updateSettings.response.status === 200, `${updateSettings.url} expected settings patch 200`);
    assert(updateSettings.json?.data?.settings?.auth?.inviteOnly === true, `${updateSettings.url} did not persist invite-only setting`);

    const blockedCreate = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        fullName: `Invite Only Active ${unique}`,
        email: `invite-only-active-${unique}@example.test`,
        role: 'viewer',
        status: 'active',
      }),
    });
    assert(blockedCreate.response.status === 400, `${blockedCreate.url} expected active create 400, got ${blockedCreate.response.status}`);
    assert(blockedCreate.json?.error?.code === 'INVITE_ONLY_REQUIRED', `${blockedCreate.url} expected INVITE_ONLY_REQUIRED on create`);

    const allowedCreate = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        fullName: `Invite Only Invited ${unique}`,
        email: `invite-only-invited-${unique}@example.test`,
        role: 'viewer',
        status: 'invited',
      }),
    });
    assert(allowedCreate.response.status === 201, `${allowedCreate.url} expected invited create 201, got ${allowedCreate.response.status}`);
    invitedUserId = allowedCreate.json?.data?.user?.id || '';
    assert(invitedUserId, `${allowedCreate.url} missing invited user id`);
    assert(allowedCreate.json?.data?.invite?.token, `${allowedCreate.url} missing invited user create token`);
    assert(allowedCreate.json?.data?.invite?.inviteUrl, `${allowedCreate.url} missing invited user create URL`);

    const blockedActivation = await request(`/api/admin/users/${invitedUserId}`, {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ status: 'active' }),
    });
    assert(blockedActivation.response.status === 400, `${blockedActivation.url} expected direct activation 400, got ${blockedActivation.response.status}`);
    assert(blockedActivation.json?.error?.code === 'INVITE_ONLY_REQUIRED', `${blockedActivation.url} expected INVITE_ONLY_REQUIRED on activation`);

    const blockedResetToken = await request(`/api/admin/users/${invitedUserId}/password-reset`, {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ expiresInMinutes: 15 }),
    });
    assert(blockedResetToken.response.status === 400, `${blockedResetToken.url} expected invited reset-token create 400, got ${blockedResetToken.response.status}`);
    assert(blockedResetToken.json?.error?.code === 'INVITE_ONLY_REQUIRED', `${blockedResetToken.url} expected INVITE_ONLY_REQUIRED on reset-token create`);

    const temporarilyDisableInviteOnly = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        auth: {
          ...originalAuth,
          inviteOnly: false,
        },
      }),
    });
    assert(temporarilyDisableInviteOnly.response.status === 200, `${temporarilyDisableInviteOnly.url} expected invite-only disable 200`);

    const legacyResetToken = await request(`/api/admin/users/${invitedUserId}/password-reset`, {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ expiresInMinutes: 15 }),
    });
    assert(legacyResetToken.response.status === 200, `${legacyResetToken.url} expected legacy reset token 200, got ${legacyResetToken.response.status}`);
    const legacyToken = legacyResetToken.json?.data?.reset?.token;
    assert(legacyToken, `${legacyResetToken.url} missing legacy reset token`);

    const reenableInviteOnly = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        auth: {
          ...originalAuth,
          inviteOnly: true,
        },
      }),
    });
    assert(reenableInviteOnly.response.status === 200, `${reenableInviteOnly.url} expected invite-only re-enable 200`);

    const blockedResetAccept = await request('/api/admin/auth/reset-password', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.61',
      },
      body: JSON.stringify({ token: legacyToken, password: '12345678901234' }),
    });
    assert(blockedResetAccept.response.status === 409, `${blockedResetAccept.url} expected invited reset accept 409, got ${blockedResetAccept.response.status}`);
    assert(blockedResetAccept.json?.error?.code === 'INVITE_ONLY_REQUIRED', `${blockedResetAccept.url} expected INVITE_ONLY_REQUIRED on reset accept`);

    const blockedBulkActivation = await request('/api/admin/users/bulk', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({
        action: 'updateStatus',
        userIds: [invitedUserId],
        status: 'active',
      }),
    });
    assert(blockedBulkActivation.response.status === 400, `${blockedBulkActivation.url} expected bulk activation 400, got ${blockedBulkActivation.response.status}`);
    assert(blockedBulkActivation.json?.error?.code === 'INVITE_ONLY_REQUIRED', `${blockedBulkActivation.url} expected INVITE_ONLY_REQUIRED on bulk activation`);

    const csv = [
      'full_name,email,role,status',
      `Invite Only CSV ${unique},invite-only-csv-${unique}@example.test,viewer,active`,
    ].join('\n');
    const blockedImport = await request('/api/admin/users/import?dryRun=true', {
      method: 'POST',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'text/csv',
        'x-backy-admin-key': adminApiKey,
      },
      body: csv,
    });
    assert(blockedImport.response.status === 200, `${blockedImport.url} expected import dry-run 200, got ${blockedImport.response.status}`);
    assert(blockedImport.json?.data?.import?.created === 0, `${blockedImport.url} should not create active preview users`);
    assert(blockedImport.json?.data?.import?.skipped === 1, `${blockedImport.url} expected one skipped import row`);
    assert(
      blockedImport.json?.data?.import?.errors?.some((error) => error.code === 'INVITE_ONLY_REQUIRED'),
      `${blockedImport.url} expected INVITE_ONLY_REQUIRED import error`,
    );
  } finally {
    if (invitedUserId) {
      await request(`/api/admin/users/${invitedUserId}`, {
        method: 'DELETE',
        headers: {
          origin: adminDevOrigin,
          'x-backy-admin-key': adminApiKey,
        },
      }).catch(() => {});
    }
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        origin: adminDevOrigin,
        'content-type': 'application/json',
        'x-backy-admin-key': adminApiKey,
      },
      body: JSON.stringify({ auth: originalAuth }),
    }).catch(() => {});
  }
});

console.log(`Admin auth smoke passed against ${baseUrl}`);
for (const check of checks) {
  console.log(`- ${check.name} (${check.ms}ms)`);
}
