import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse, NextRequest } from 'next/server';
import * as sessionStore from '../src/lib/admin-auth/sessionStore.ts';
import * as adminAccess from '../src/lib/adminAccess.ts';
import * as repositoryRuntime from '../src/lib/repositoryRuntime.ts';

process.env.BACKY_DATA_MODE = 'database';

const sessions = (sessionStore.default || sessionStore) as typeof sessionStore;
const access = (adminAccess.default || adminAccess) as typeof adminAccess;
const repositoriesRuntime = (repositoryRuntime.default || repositoryRuntime) as typeof repositoryRuntime;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRouteRoot = path.resolve(scriptDir, '../src/app/api/admin/sites/[siteId]');

const coveredSiteRoutePrefixes = [
  '',
  'blog',
  'collections',
  'comments',
  'collections/export',
  'collections/import',
  'custom-frontend/connection',
  'custom-frontend/compatibility',
  'custom-frontend/starter',
  'commerce',
  'duplicate',
  'editor/collection-binding-presets',
  'editor/page-links',
  'editor/canvas-sources',
  'forms',
  'forms/analytics',
  'forms/contact-lists',
  'frontend-design',
  'interactive-components',
  'media',
  'media/provider-analytics',
  'navigation',
  'newsletter/issues/draft',
  'newsletter/campaigns',
  'newsletter/subscribers',
  'pages',
  'readiness',
  'redirects',
  'reusable-sections',
  'reusable-sections/export',
  'reusable-sections/import',
  'seo',
  'settings',
  'templates',
  'visitors',
  'backup',
];

const listRouteKeys = (directory: string, prefix = ''): string[] => (
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listRouteKeys(fullPath, nextPrefix);
    }
    return entry.isFile() && entry.name === 'route.ts'
      ? [prefix]
      : [];
  })
);

const assertSiteScopeRouteInventoryCovered = () => {
  const uncovered = listRouteKeys(siteRouteRoot)
    .filter((routeKey) => !coveredSiteRoutePrefixes.some((prefix) => (
      routeKey === prefix || (prefix && routeKey.startsWith(`${prefix}/`))
    )));
  assert.equal(
    uncovered.length,
    0,
    `Site-scope repository smoke is missing coverage prefixes for route families: ${uncovered.join(', ')}`,
  );
};

type AdminAuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited' | 'suspended';
};

const site = {
  id: 'repo-site',
  slug: 'repo-site-slug',
  teamId: 'repo-team',
  isPublished: true,
  settings: { commentPolicy: { enabled: true, moderationMode: 'manual', allowGuests: true, requireName: true, allowReplies: true, enableCaptcha: false } },
};

const users = new Map<string, AdminAuthUser>([
  ['repo-non-member', {
    id: 'repo-non-member',
    email: 'repo-non-member@example.com',
    fullName: 'Repository Non Member',
    role: 'admin',
    status: 'active',
  }],
  ['repo-viewer', {
    id: 'repo-viewer',
    email: 'repo-viewer@example.com',
    fullName: 'Repository Viewer',
    role: 'admin',
    status: 'active',
  }],
  ['repo-editor', {
    id: 'repo-editor',
    email: 'repo-editor@example.com',
    fullName: 'Repository Editor',
    role: 'admin',
    status: 'active',
  }],
]);

const memberRoles = new Map<string, AdminAuthUser['role']>([
  ['repo-viewer', 'viewer'],
  ['repo-editor', 'editor'],
]);

// Match production session persistence: repository auth must contain issued sessions.
let repositoryAuth: Record<string, unknown> = {};

assertSiteScopeRouteInventoryCovered();
let commentCreationWrites = 0;
let privateCommentReads = 0;
let projectedScopeReads = 0;
let fullSiteReads = 0;
const useScopeProjection = process.env.BACKY_TEST_SCOPE_PROJECTION === '1';

repositoriesRuntime.setPublicRepositoryRuntimeForTests({
  mode: 'database',
  repositories: {
    users: {
      getById: async (userId: string) => users.get(userId) || null,
    },
    sites: {
      ...(useScopeProjection ? { getAccessScopeByIdOrSlug: async (identifier: string) => { projectedScopeReads++; return [site.id, site.slug].includes(identifier) ? { id: site.id, slug: site.slug, teamId: site.teamId } : null; } } : {}),
      getById: async (siteId: string) => { fullSiteReads++; return siteId === site.id ? site : null; },
      getBySlug: async (slug: string) => { fullSiteReads++; return slug === site.slug ? site : null; },
    },
    pages: { getById: async () => ({ id: 'page-home', status: 'published', siteId: site.id }) },
    posts: { getById: async () => ({ id: 'post-welcome', status: 'published', siteId: site.id }) },
    comments: { getById: async () => { privateCommentReads++; throw new Error('Denied moderator reply must not read a comment'); }, create: async (input: any) => { commentCreationWrites++; return { item: { ...input, id: 'scope-comment-' + commentCreationWrites, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }; } },
    teams: {
      listMembers: async ({ teamId }: { teamId: string }) => ({
        items: teamId === site.teamId
          ? Array.from(memberRoles.entries()).map(([userId, role]) => ({
              id: `member-${userId}`,
              teamId,
              userId,
              role,
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }))
          : [],
        pagination: {
          total: teamId === site.teamId ? memberRoles.size : 0,
          limit: 100,
          offset: 0,
          hasMore: false,
        },
      }),
    },
    settings: {
      get: async () => ({
        apiKeys: {},
        auth: repositoryAuth,
      }),
      update: async ({ auth }: { auth: Record<string, unknown> }) => { repositoryAuth = auth; },
    },
  } as never,
});

const requestFor = (token: string, path: string): NextRequest => (
  new Request(`http://localhost:3001${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      origin: 'http://localhost:5173',
    },
  }) as unknown as NextRequest
);

const sessionFor = (userId: string) => {
  const user = users.get(userId);
  assert(user, `Missing test user ${userId}`);
  const session = sessions.createAdminSessionForExternalUser(user, 'supabase', { sessionTimeoutMinutes: 120 }, { persist: false });
  repositoryAuth = sessions.upsertAdminSessionAuthRecord(repositoryAuth, session);
  return session;
};

const expectForbiddenSiteScope = async (input: {
  userId: string;
  path: string;
  permission: string;
}) => {
  const session = sessionFor(input.userId);
  const beforeScopeRead = fullSiteReads;
  const result = await access.requireAdminAccess(
    requestFor(session.token, input.path),
    `repo-smoke-${input.userId}`,
    { permission: input.permission },
  );

  if (useScopeProjection) assert.equal(fullSiteReads, beforeScopeRead, 'Authorization must not load the full site');
  assert(result instanceof NextResponse, `${input.userId} ${input.permission} should be denied`);
  assert.equal(result.status, 403, `${input.userId} ${input.permission} should return 403`);
  const body = await result.json();
  assert.equal(body.error?.code, 'FORBIDDEN_SITE_SCOPE', `${input.userId} ${input.permission} should return FORBIDDEN_SITE_SCOPE`);
};

const expectAllowed = async (input: {
  userId: string;
  path: string;
  permission: string;
}) => {
  const session = sessionFor(input.userId);
  const beforeScopeRead = fullSiteReads;
  const result = await access.requireAdminAccess(
    requestFor(session.token, input.path),
    `repo-smoke-${input.userId}`,
    { permission: input.permission },
  );

  if (useScopeProjection) assert.equal(fullSiteReads, beforeScopeRead, 'Authorization must not load the full site');
  assert(!(result instanceof NextResponse), `${input.userId} ${input.permission} should be allowed`);
  assert.equal(result.type, 'session');
  assert.equal(result.session?.user.id, input.userId);
};

const main = async () => {
  const actualFamilyHandlers = [
    { route: 'editor/canvas-sources', module: await import('../src/app/api/admin/sites/[siteId]/editor/canvas-sources/route.ts'), methods: ['GET'] },
    { route: 'editor/page-links', module: await import('../src/app/api/admin/sites/[siteId]/editor/page-links/route.ts'), methods: ['GET'] },
    { route: 'newsletter/campaigns', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/route.ts'), methods: ['GET', 'POST'] },
    { route: 'newsletter/campaigns/scope-campaign', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/route.ts'), methods: ['GET', 'PATCH'] },
    { route: 'newsletter/campaigns/scope-campaign/schedule', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/schedule/route.ts'), methods: ['POST'] },
    { route: 'newsletter/campaigns/scope-campaign/send', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/send/route.ts'), methods: ['POST'] },
    { route: 'newsletter/campaigns/scope-campaign/process', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/process/route.ts'), methods: ['POST'] },
    { route: 'newsletter/campaigns/scope-campaign/feedback', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/feedback/route.ts'), methods: ['POST'] },
    { route: 'newsletter/campaigns/scope-campaign/cancel', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/campaigns/[campaignId]/cancel/route.ts'), methods: ['POST'] },
    { route: 'collections/scope-collection/design-versions', module: await import('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/route.ts'), methods: ['GET'] },
    { route: 'collections/scope-collection/design-versions/scope-revision/restore', module: await import('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/[revisionId]/restore/route.ts'), methods: ['POST'] },
    { route: 'commerce/products/scope-product/design-versions', module: await import('../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/design-versions/route.ts'), methods: ['GET'] },
    { route: 'commerce/products/scope-product/design-versions/scope-revision/restore', module: await import('../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/design-versions/[revisionId]/restore/route.ts'), methods: ['POST'] },
    { route: 'forms/scope-form/design-versions', module: await import('../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/route.ts'), methods: ['GET'] },
    { route: 'forms/scope-form/design-versions/scope-revision/restore', module: await import('../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/[revisionId]/restore/route.ts'), methods: ['POST'] },
    { route: 'forms/scope-form/submissions/scope-submission/delivery-attempts/scope-attempt/reconciliation', module: await import('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/delivery-attempts/[attemptId]/reconciliation/route.ts'), methods: ['POST'] },
    { route: 'comments/scope-parent/replies', module: await import('../src/app/api/admin/sites/[siteId]/comments/[commentId]/replies/route.ts'), methods: ['POST'] },
    { route: 'backup', module: await import('../src/app/api/admin/sites/[siteId]/backup/route.ts'), methods: ['GET'] },
    { route: 'backup/restore', module: await import('../src/app/api/admin/sites/[siteId]/backup/restore/route.ts'), methods: ['POST'] },
    { route: 'backup/restore-jobs', module: await import('../src/app/api/admin/sites/[siteId]/backup/restore-jobs/route.ts'), methods: ['GET'] },
    { route: 'backup/restore-jobs/11111111-1111-4111-8111-111111111111/retry', module: await import('../src/app/api/admin/sites/[siteId]/backup/restore-jobs/[jobId]/retry/route.ts'), methods: ['POST'] },
    { route: 'visitors', module: await import('../src/app/api/admin/sites/[siteId]/visitors/route.ts'), methods: ['GET'] },
    { route: 'visitors/11111111-1111-4111-8111-111111111111', module: await import('../src/app/api/admin/sites/[siteId]/visitors/[memberId]/route.ts'), methods: ['GET', 'PATCH', 'DELETE'] },
    { route: 'visitors/11111111-1111-4111-8111-111111111111/revoke-sessions', module: await import('../src/app/api/admin/sites/[siteId]/visitors/[memberId]/revoke-sessions/route.ts'), methods: ['POST'] },
    { route: 'media/storage-recovery', module: await import('../src/app/api/admin/sites/[siteId]/media/storage-recovery/route.ts'), methods: ['GET'] },
    { route: 'media/storage-recovery/11111111-1111-4111-8111-111111111111', module: await import('../src/app/api/admin/sites/[siteId]/media/storage-recovery/[jobId]/route.ts'), methods: ['POST'] },
    { route: 'custom-frontend/compatibility', module: await import('../src/app/api/admin/sites/[siteId]/custom-frontend/compatibility/route.ts'), methods: ['GET', 'POST'] },
    { route: 'custom-frontend/connection', module: await import('../src/app/api/admin/sites/[siteId]/custom-frontend/connection/route.ts'), methods: ['POST'] },
    { route: 'custom-frontend/starter', module: await import('../src/app/api/admin/sites/[siteId]/custom-frontend/starter/route.ts'), methods: ['GET'] },
    { route: 'newsletter/subscribers', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/subscribers/route.ts'), methods: ['GET', 'POST'] },
    { route: 'newsletter/issues/draft', module: await import('../src/app/api/admin/sites/[siteId]/newsletter/issues/draft/route.ts'), methods: ['POST'] },
  ];
  let actualHandlerDenials = 0;
  for (const family of actualFamilyHandlers) for (const method of family.methods) for (const identifier of [site.id, site.slug]) {
    const session = sessionFor('repo-non-member');
    const request = new Request(`http://localhost:3001/api/admin/sites/${identifier}/${family.route}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, origin: 'http://localhost:5173', 'x-request-id': 'actual-family-scope-proof' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const beforeCommentWrites = commentCreationWrites;
    const beforePrivateCommentReads = privateCommentReads;
    const beforeFullSiteReads = fullSiteReads;
    let bodyReads = 0;
    request.json = async () => { bodyReads++; throw new Error('Denied request must not parse a body'); };
    request.text = async () => { bodyReads++; throw new Error('Denied request must not parse a body'); };
    const module = family.module.default || family.module;
    const handler = (module as unknown as Record<string, (request: NextRequest, context: { params: Promise<{ siteId: string; jobId?: string; memberId?: string; commentId?: string }> }) => Promise<NextResponse>>)[method];
    assert.equal(typeof handler, 'function', `${family.route} must expose ${method}`);
    const result = await handler(request as NextRequest, { params: Promise.resolve({ siteId: identifier, collectionId: 'scope-collection', productId: 'scope-product', formId: 'scope-form', revisionId: 'scope-revision', submissionId: 'scope-submission', attemptId: 'scope-attempt', ...(family.route.startsWith('comments/') ? { commentId: 'scope-parent' } : {}), ...(family.route.startsWith('visitors/') ? { memberId: '11111111-1111-4111-8111-111111111111' } : {}), ...((family.route.startsWith('media/storage-recovery/')||family.route.startsWith('backup/restore-jobs/')) ? { jobId: '11111111-1111-4111-8111-111111111111' } : {}) }) });
    assert.equal(result.status, 403, `${family.route} ${method} by ${identifier} must reject a non-member`);
    assert.equal((await result.json()).error?.code, 'FORBIDDEN_SITE_SCOPE');
    if (useScopeProjection) assert.equal(fullSiteReads, beforeFullSiteReads, 'Denied handler must not load the full site');
    assert.equal(bodyReads, 0, 'Scope denial must precede payload parsing');
    assert.equal(privateCommentReads, beforePrivateCommentReads, 'Denied reply must not read private comments');
    assert.equal(commentCreationWrites, beforeCommentWrites, 'Denied reply must not persist a comment');
    actualHandlerDenials++;
  }
  // Actual submission handlers use shared repository/session/site admission
  // before honoring the explicit operator publication intent.
  const publicationRoutes = [
    { handler: await import('../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts'), path: 'pages/page-home', target: { pageId: 'page-home' } },
    { handler: await import('../src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts'), path: 'blog/post-welcome', target: { postId: 'post-welcome' } },
  ];
  for (const family of publicationRoutes) for (const identifier of [site.id, site.slug]) {
    for (const userId of ['repo-non-member', 'repo-editor', null]) {
      const session = userId ? sessionFor(userId) : null;
      const before = commentCreationWrites;
      const response = await family.handler.POST(new NextRequest(`http://localhost:3001/api/sites/${identifier}/${family.path}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.token}` } : {}) },
        body: JSON.stringify({ content: `Explicit publication ${identifier} ${family.path} ${userId}`, authorName: 'Synthetic operator proof', moderationMode: 'auto-approve', startedAt: Date.now() - 3000 }),
      }), { params: Promise.resolve({ siteId: identifier, ...family.target }) } as never);
      const body = await response.json();
      if (userId === 'repo-non-member') { assert.equal(response.status, 403); assert.equal(body.error.code, 'FORBIDDEN_SITE_SCOPE'); assert.equal(commentCreationWrites, before); actualHandlerDenials++; }
      else { assert.equal(response.status, 201, JSON.stringify(body)); assert.equal(body.data.comment.status, userId ? 'approved' : 'pending'); assert.equal(commentCreationWrites, before + 1); }
    }
  }
  for (const path of [
    `/api/sites/${site.id}/comments`,
    `/api/sites/${site.slug}/pages/page-home/comments`,
    `/api/sites/${site.id}/blog/post-welcome/comments/comment-one`,
  ]) {
    await expectForbiddenSiteScope({ userId: 'repo-non-member', path, permission: 'comments.manage' });
    await expectAllowed({ userId: 'repo-editor', path, permission: 'comments.manage' });
  }
  await expectForbiddenSiteScope({
    userId: 'repo-non-member',
    path: `/api/admin/sites/${site.id}/pages`,
    permission: 'pages.view',
  });

  const nonMemberNestedChecks = [
    {
      label: 'repository non-member nested blog denied',
      path: `/api/admin/sites/${site.id}/blog`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested blog categories denied',
      path: `/api/admin/sites/${site.id}/blog/categories`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested media denied',
      path: `/api/admin/sites/${site.slug}/media`,
      permission: 'media.view',
    },
    {
      label: 'repository non-member nested collections denied',
      path: `/api/admin/sites/${site.id}/collections`,
      permission: 'collections.view',
    },
    {
      label: 'repository non-member nested collection export denied',
      path: `/api/admin/sites/${site.id}/collections/export`,
      permission: 'collections.export',
    },
    {
      label: 'repository non-member nested collection import denied',
      path: `/api/admin/sites/${site.id}/collections/import`,
      permission: 'collections.edit',
    },
    {
      label: 'repository non-member nested forms denied',
      path: `/api/admin/sites/${site.id}/forms`,
      permission: 'forms.view',
    },
    {
      label: 'repository non-member nested forms analytics denied',
      path: `/api/admin/sites/${site.id}/forms/analytics`,
      permission: 'forms.view',
    },
    {
      label: 'repository non-member nested form contact lists denied',
      path: `/api/admin/sites/${site.id}/forms/contact-lists`,
      permission: 'forms.view',
    },
    {
      label: 'repository non-member nested media provider analytics denied',
      path: `/api/admin/sites/${site.id}/media/provider-analytics`,
      permission: 'media.edit',
    },
    {
      label: 'repository non-member nested editor binding presets denied',
      path: `/api/admin/sites/${site.id}/editor/collection-binding-presets`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested navigation denied',
      path: `/api/admin/sites/${site.id}/navigation`,
      permission: 'sites.view',
    },
    {
      label: 'repository non-member nested SEO denied',
      path: `/api/admin/sites/${site.id}/seo`,
      permission: 'sites.view',
    },
    {
      label: 'repository non-member nested redirects denied',
      path: `/api/admin/sites/${site.id}/redirects`,
      permission: 'sites.view',
    },
    {
      label: 'repository non-member nested reusable sections denied',
      path: `/api/admin/sites/${site.id}/reusable-sections`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested reusable section export denied',
      path: `/api/admin/sites/${site.id}/reusable-sections/export`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested reusable section import denied',
      path: `/api/admin/sites/${site.id}/reusable-sections/import`,
      permission: 'pages.edit',
    },
    {
      label: 'repository non-member frontend compatibility denied',
      path: `/api/admin/sites/${site.id}/custom-frontend/compatibility`,
      permission: 'sites.view',
    },
    { label: 'repository non-member frontend connection denied', path: `/api/admin/sites/${site.id}/custom-frontend/connection`, permission: 'sites.view' },
    { label: 'repository non-member frontend starter denied', path: `/api/admin/sites/${site.id}/custom-frontend/starter`, permission: 'sites.view' },
    { label: 'repository non-member newsletter subscriber read denied', path: `/api/admin/sites/${site.id}/newsletter/subscribers`, permission: 'forms.view' },
    { label: 'repository non-member newsletter subscriber write denied', path: `/api/admin/sites/${site.id}/newsletter/subscribers`, permission: 'forms.manage' },
    { label: 'repository non-member newsletter issue draft denied', path: `/api/admin/sites/${site.id}/newsletter/issues/draft`, permission: 'forms.export' },
    {
      label: 'repository non-member nested frontend-design denied',
      path: `/api/admin/sites/${site.id}/frontend-design`,
      permission: 'sites.view',
    },
    {
      label: 'repository non-member nested template registry denied',
      path: `/api/admin/sites/${site.id}/templates`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested interactive components denied',
      path: `/api/admin/sites/${site.id}/interactive-components`,
      permission: 'pages.view',
    },
    {
      label: 'repository non-member nested readiness denied',
      path: `/api/admin/sites/${site.id}/readiness`,
      permission: 'dashboard.view',
    },
    {
      label: 'repository non-member site duplicate denied',
      path: `/api/admin/sites/${site.id}/duplicate`,
      permission: 'sites.create',
    },
    {
      label: 'repository non-member nested commerce denied',
      path: `/api/admin/sites/${site.id}/commerce/orders/analytics`,
      permission: 'commerce.view',
    },
  ];

  for (const check of nonMemberNestedChecks) {
    await expectForbiddenSiteScope({
      userId: 'repo-non-member',
      path: check.path,
      permission: check.permission,
    });
  }

  await expectForbiddenSiteScope({
    userId: 'repo-non-member',
    path: `/api/admin/sites/${site.id}/settings`,
    permission: 'settings.view',
  });

  await expectForbiddenSiteScope({
    userId: 'repo-non-member',
    path: `/api/admin/sites/${site.id}/settings`,
    permission: 'settings.configure',
  });

  await expectAllowed({
    userId: 'repo-viewer',
    path: `/api/admin/sites/${site.slug}/media`,
    permission: 'media.view',
  });

  await expectAllowed({
    userId: 'repo-viewer',
    path: `/api/admin/sites/${site.id}/templates`,
    permission: 'pages.view',
  });

  await expectForbiddenSiteScope({
    userId: 'repo-viewer',
    path: `/api/admin/sites/${site.id}/pages`,
    permission: 'pages.edit',
  });

  await expectAllowed({
    userId: 'repo-editor',
    path: `/api/admin/sites/${site.id}/collections`,
    permission: 'collections.edit',
  });

  if (useScopeProjection) assert(projectedScopeReads > 0);
  console.log(JSON.stringify({
    ok: true,
    projectedScopeReads,
    useScopeProjection,
    actualHandlerDenials,
    checks: [
      'actual moderator replies denied by site id and slug before body/private-comment access with zero comment writes',
      'repository non-member public-path comments moderation denied for site id, slug, page and blog',
      'repository editor public-path comments moderation allowed',
      'repository non-member nested site read denied',
      ...nonMemberNestedChecks.map((check) => check.label),
      'repository non-member nested site settings read denied',
      'repository non-member nested site settings write denied',
      'repository viewer nested site read allowed by slug',
      'repository viewer nested template registry read allowed',
      'repository viewer nested content write denied',
      'repository editor nested content write allowed',
    ],
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    repositoriesRuntime.resetPublicRepositoryRuntimeForTests();
  });
