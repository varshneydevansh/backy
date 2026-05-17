import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse, type NextRequest } from 'next/server';
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
  'collections/export',
  'collections/import',
  'commerce',
  'duplicate',
  'editor/collection-binding-presets',
  'forms',
  'forms/analytics',
  'forms/contact-lists',
  'frontend-design',
  'interactive-components',
  'media',
  'media/provider-analytics',
  'navigation',
  'pages',
  'readiness',
  'redirects',
  'reusable-sections',
  'reusable-sections/export',
  'reusable-sections/import',
  'seo',
  'settings',
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

assertSiteScopeRouteInventoryCovered();

repositoriesRuntime.setPublicRepositoryRuntimeForTests({
  mode: 'database',
  repositories: {
    users: {
      getById: async (userId: string) => users.get(userId) || null,
    },
    sites: {
      getById: async (siteId: string) => (siteId === site.id ? site : null),
      getBySlug: async (slug: string) => (slug === site.slug ? site : null),
    },
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
        auth: {},
      }),
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
  return sessions.createAdminSessionForExternalUser(user, 'supabase', { sessionTimeoutMinutes: 120 });
};

const expectForbiddenSiteScope = async (input: {
  userId: string;
  path: string;
  permission: string;
}) => {
  const session = sessionFor(input.userId);
  const result = await access.requireAdminAccess(
    requestFor(session.token, input.path),
    `repo-smoke-${input.userId}`,
    { permission: input.permission },
  );

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
  const result = await access.requireAdminAccess(
    requestFor(session.token, input.path),
    `repo-smoke-${input.userId}`,
    { permission: input.permission },
  );

  assert(!(result instanceof NextResponse), `${input.userId} ${input.permission} should be allowed`);
  assert.equal(result.type, 'session');
  assert.equal(result.session?.user.id, input.userId);
};

const main = async () => {
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
      label: 'repository non-member nested frontend-design denied',
      path: `/api/admin/sites/${site.id}/frontend-design`,
      permission: 'sites.view',
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

  console.log(JSON.stringify({
    ok: true,
    checks: [
      'repository non-member nested site read denied',
      ...nonMemberNestedChecks.map((check) => check.label),
      'repository non-member nested site settings read denied',
      'repository non-member nested site settings write denied',
      'repository viewer nested site read allowed by slug',
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
