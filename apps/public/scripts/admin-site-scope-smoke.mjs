#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
const adminDevOrigin = 'http://localhost:5173';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(adminApiKey, 'BACKY_ADMIN_API_KEY or BACKY_ADMIN_SECRET_KEY is required for admin site-scope smoke');

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (!headers.has('authorization') && !headers.has('x-backy-admin-key')) {
    headers.set('x-backy-admin-key', adminApiKey);
  }
  if (!headers.has('origin')) {
    headers.set('origin', adminDevOrigin);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text in diagnostics.
  }

  return { response, json, text, url: `${baseUrl}${path}` };
}

async function requireOk(path, init) {
  const result = await request(path, init);
  assert(
    result.response.ok && result.json?.success !== false,
    `${result.url} returned ${result.response.status}: ${JSON.stringify(result.json || result.text).slice(0, 500)}`,
  );
  return result.json;
}

async function expectForbiddenSiteScope(path, init) {
  const result = await request(path, init);
  assert(
    result.response.status === 403,
    `${result.url} expected 403, got ${result.response.status}: ${JSON.stringify(result.json || result.text).slice(0, 500)}`,
  );
  assert(
    result.json?.error?.code === 'FORBIDDEN_SITE_SCOPE',
    `${result.url} expected FORBIDDEN_SITE_SCOPE, got ${JSON.stringify(result.json?.error || result.json).slice(0, 500)}`,
  );
  return result;
}

const suffix = Date.now().toString(36);
const cleanup = {
  siteId: '',
  teamId: '',
  userId: '',
};

try {
  const teamPayload = await requireOk('/api/admin/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: `Site Scope Smoke ${suffix}`,
      slug: `site-scope-smoke-${suffix}`,
      ownerId: 'user-admin',
    }),
  });
  const team = teamPayload.data?.team;
  assert(team?.id, `Team create did not return a team: ${JSON.stringify(teamPayload).slice(0, 500)}`);
  cleanup.teamId = team.id;

  const sitePayload = await requireOk('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name: `Scoped Site ${suffix}`,
      slug: `scoped-site-${suffix}`,
      teamId: team.id,
      status: 'draft',
    }),
  });
  const site = sitePayload.data?.site;
  assert(site?.id, `Site create did not return a site: ${JSON.stringify(sitePayload).slice(0, 500)}`);
  cleanup.siteId = site.id;

  const userPayload = await requireOk('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `Site Scope Admin ${suffix}`,
      email: `site-scope-admin-${suffix}@example.com`,
      role: 'admin',
      status: 'invited',
      createInvite: true,
    }),
  });
  const user = userPayload.data?.user;
  const invite = userPayload.data?.invite;
  assert(user?.id && invite?.token, `User create did not return an invite token: ${JSON.stringify(userPayload).slice(0, 500)}`);
  cleanup.userId = user.id;

  const acceptPayload = await requireOk('/api/admin/auth/accept-invite', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: adminDevOrigin,
    },
    body: JSON.stringify({ token: invite.token }),
  });
  const scopedSessionToken = acceptPayload.data?.session?.token;
  assert(scopedSessionToken, `Accept invite did not return a session token: ${JSON.stringify(acceptPayload).slice(0, 500)}`);

  const scopedHeaders = {
    authorization: `Bearer ${scopedSessionToken}`,
    origin: adminDevOrigin,
  };

  const listResult = await requireOk('/api/admin/sites?includeUnpublished=true', {
    headers: scopedHeaders,
  });
  const visibleSites = listResult.data?.sites || [];
  assert(
    !visibleSites.some((candidate) => candidate.id === site.id),
    `Non-member admin site list leaked team-owned site: ${JSON.stringify(visibleSites).slice(0, 500)}`,
  );

  await expectForbiddenSiteScope(`/api/admin/sites/${encodeURIComponent(site.id)}`, {
    headers: scopedHeaders,
  });

  await expectForbiddenSiteScope(`/api/admin/sites/${encodeURIComponent(site.id)}`, {
    method: 'PATCH',
    headers: {
      ...scopedHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ description: `This should not persist ${suffix}` }),
  });

  await expectForbiddenSiteScope(`/api/admin/sites/${encodeURIComponent(site.id)}/pages?includeUnpublished=true`, {
    headers: scopedHeaders,
  });

  await expectForbiddenSiteScope(`/api/admin/sites/${encodeURIComponent(site.id)}/pages`, {
    method: 'POST',
    headers: {
      ...scopedHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: `Denied Nested Page ${suffix}`,
      slug: `denied-nested-page-${suffix}`,
      status: 'draft',
    }),
  });

  const representativeNestedRequests = [
    {
      label: 'non-member admin nested media list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/media`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested media create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/media`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: `denied-media-${suffix}.png` }),
      },
    },
    {
      label: 'non-member admin nested collections list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/collections`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested collection create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/collections`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Denied Collection ${suffix}`, slug: `denied-collection-${suffix}` }),
      },
    },
    {
      label: 'non-member admin nested forms list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/forms`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested form create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/forms`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ title: `Denied Form ${suffix}`, slug: `denied-form-${suffix}` }),
      },
    },
    {
      label: 'non-member admin nested navigation read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/navigation`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested navigation update denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/navigation`,
      init: {
        method: 'PATCH',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ primary: [], footer: [] }),
      },
    },
    {
      label: 'non-member admin nested frontend-design read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/frontend-design`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested frontend-design update denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/frontend-design`,
      init: {
        method: 'PATCH',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'site-scope-smoke', contract: {} }),
      },
    },
    {
      label: 'non-member admin nested blog list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/blog?includeUnpublished=true`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested blog create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/blog`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `Denied Blog Post ${suffix}`,
          slug: `denied-blog-post-${suffix}`,
          status: 'draft',
        }),
      },
    },
    {
      label: 'non-member admin nested SEO read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/seo`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested SEO update denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/seo`,
      init: {
        method: 'PATCH',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ title: `Denied SEO ${suffix}`, description: 'Denied' }),
      },
    },
    {
      label: 'non-member admin nested redirects read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/redirects`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested redirects update denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/redirects`,
      init: {
        method: 'PATCH',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ redirects: [] }),
      },
    },
    {
      label: 'non-member admin nested reusable sections list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/reusable-sections`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested reusable section create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/reusable-sections`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Denied Section ${suffix}`, slug: `denied-section-${suffix}`, content: [] }),
      },
    },
    {
      label: 'non-member admin nested interactive components list denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/interactive-components`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested interactive component create denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/interactive-components`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Denied Component ${suffix}`, key: `denied-component-${suffix}` }),
      },
    },
    {
      label: 'non-member admin nested readiness read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/readiness`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin site duplicate denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/duplicate`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Denied Duplicate ${suffix}`, slug: `denied-duplicate-${suffix}` }),
      },
    },
    {
      label: 'non-member admin nested site settings read denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/settings`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested site settings update denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/settings`,
      init: {
        method: 'PATCH',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ seo: { titleTemplate: `Denied settings ${suffix}` } }),
      },
    },
    {
      label: 'non-member admin nested commerce analytics denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/commerce/orders/analytics`,
      init: { headers: scopedHeaders },
    },
    {
      label: 'non-member admin nested commerce reconcile denied',
      path: `/api/admin/sites/${encodeURIComponent(site.id)}/commerce/reconcile`,
      init: {
        method: 'POST',
        headers: { ...scopedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      },
    },
  ];

  for (const check of representativeNestedRequests) {
    await expectForbiddenSiteScope(check.path, check.init);
  }

  const ownerDetail = await requireOk(`/api/admin/sites/${encodeURIComponent(site.id)}`);
  assert(ownerDetail.data?.site?.id === site.id, 'Admin key should still read the team-owned site for cleanup verification');

  console.log(JSON.stringify({
    ok: true,
    checks: [
      'team-owned site created',
      'non-member admin list filtered',
      'non-member admin detail denied',
      'non-member admin update denied',
      'non-member admin nested pages list denied',
      'non-member admin nested page create denied',
      ...representativeNestedRequests.map((check) => check.label),
      'admin key still bypasses team scope for service cleanup',
    ],
    siteId: site.id,
    teamId: team.id,
    userId: user.id,
  }, null, 2));
} finally {
  if (cleanup.siteId) {
    await request(`/api/admin/sites/${encodeURIComponent(cleanup.siteId)}`, { method: 'DELETE' }).catch(() => undefined);
  }
  if (cleanup.teamId) {
    await request(`/api/admin/teams/${encodeURIComponent(cleanup.teamId)}`, { method: 'DELETE' }).catch(() => undefined);
  }
  if (cleanup.userId) {
    await request(`/api/admin/users/${encodeURIComponent(cleanup.userId)}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
