#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return '';
  return args[index + 1] || '';
};

const hasFlag = (name) => args.includes(name);

const usage = () => {
  console.error(
    [
      'Usage:',
      '  npm run custom-frontend:ensure-site -- --site-id <site-slug-or-id> --name <site-name> --public-host <domain> --api-base <https://backy-public-domain/api> [--team-id <team-id>] [--description <text>] [--verify-only] [--skip-home-seed] [--publish-existing-home]',
      '',
      'Authentication:',
      '  Set a server-side admin key in BACKY_CUSTOM_FRONTEND_ADMIN_KEY, BACKY_ADMIN_API_KEY, or BACKY_ADMIN_SECRET_KEY.',
      '  If the admin key is not configured, the command can use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as a server-side operator fallback.',
      '  Do not pass admin keys or service-role keys as command-line arguments; this command intentionally rejects --admin-key and --service-role-key.',
      '  Optional: pass --owner-email <email> to activate that existing Backy profile as owner on the resolved team.',
      '',
      'What it does:',
      '  1. Verifies whether the public site is already discoverable and renderable.',
      '  2. If needed, creates or updates the site through /api/admin/sites using the existing admin-key boundary.',
      '  3. Falls back to Supabase REST with a service-role key only for server-side operator shells.',
      '  4. Optionally seeds a minimal published homepage when the site has no homepage.',
      '  5. Rechecks public discovery, manifest, and home render, then prints safe frontend env and scaffold command.',
    ].join('\n'),
  );
};

const fail = (message) => {
  console.error(message);
  usage();
  process.exit(1);
};

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}

if (hasFlag('--admin-key')) {
  fail('Refusing --admin-key. Put the server-side admin key in an environment variable so it is not stored in shell history.');
}

if (hasFlag('--service-role-key') || hasFlag('--supabase-service-role-key')) {
  fail(
    'Refusing --service-role-key. Put the Supabase service-role key in an environment variable so it is not stored in shell history.',
  );
}

const normalizeApiBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Invalid --api-base URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    fail('--api-base must be https for remote Backy public runtimes.');
  }
  const normalized = parsed.toString().replace(/\/$/u, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};

const normalizeSupabaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Invalid Supabase URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:') {
    fail('Supabase REST operator fallback requires an https Supabase URL.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/u, '');
};

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeHost = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/\/.*$/u, '')
    .replace(/\/+$/u, '');

const siteIdInput = option('--site-id') || option('--slug') || process.env.BACKY_SITE_ID || '';
const siteId = normalizeSlug(siteIdInput);
const siteName = String(option('--name') || process.env.BACKY_SITE_NAME || siteIdInput || '').trim();
const publicHost = normalizeHost(option('--public-host') || process.env.BACKY_SITE_PUBLIC_HOST || '');
const apiBaseUrl = normalizeApiBaseUrl(
  option('--api-base') ||
    process.env.BACKY_CUSTOM_FRONTEND_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKY_API_BASE_URL ||
    process.env.BACKY_PUBLIC_API_BASE_URL ||
    '',
);
const teamId = String(option('--team-id') || process.env.BACKY_TEAM_ID || process.env.BACKY_DEFAULT_TEAM_ID || '').trim();
const description = String(option('--description') || process.env.BACKY_SITE_DESCRIPTION || '').trim();
const verifyOnly = hasFlag('--verify-only');
const skipHomeSeed = hasFlag('--skip-home-seed');
const publishExistingHome = hasFlag('--publish-existing-home');
const silent = hasFlag('--silent');
const ownerEmail = String(option('--owner-email') || process.env.BACKY_OWNER_EMAIL || process.env.BACKY_CUSTOM_FRONTEND_OWNER_EMAIL || '')
  .trim()
  .toLowerCase();

if (!siteId) fail('--site-id is required.');
if (!siteName && !verifyOnly) fail('--name is required unless --verify-only is used.');
if (!publicHost) fail('--public-host is required.');
if (!apiBaseUrl) fail('--api-base is required.');

const adminKeyEnvCandidates = [
  option('--admin-key-env'),
  'BACKY_CUSTOM_FRONTEND_ADMIN_KEY',
  'BACKY_ADMIN_API_KEY',
  'BACKY_ADMIN_SECRET_KEY',
].filter(Boolean);

const adminKeyEnvName = adminKeyEnvCandidates.find((name) => process.env[name]?.trim());
const adminKey = adminKeyEnvName ? process.env[adminKeyEnvName].trim() : '';

const serviceRoleEnvCandidates = [
  option('--service-role-env'),
  'BACKY_CUSTOM_FRONTEND_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
].filter(Boolean);
const serviceRoleEnvName = serviceRoleEnvCandidates.find((name) => process.env[name]?.trim());
const serviceRoleKey = serviceRoleEnvName ? process.env[serviceRoleEnvName].trim() : '';
const supabaseUrl = normalizeSupabaseUrl(
  option('--supabase-url') ||
    process.env.BACKY_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '',
);
const hasSupabaseOperatorFallback = Boolean(supabaseUrl && serviceRoleKey);

const apiUrl = (pathName) => `${apiBaseUrl}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
const adminUrl = (pathName) => apiUrl(`/admin${pathName.startsWith('/') ? pathName : `/${pathName}`}`);

const jsonRequest = async (
  url,
  {
    method = 'GET',
    body,
    admin = false,
    allowStatuses = [200],
    label = url,
  } = {},
) => {
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(admin
        ? {
            authorization: `Bearer ${adminKey}`,
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON; status=${response.status}; body=${JSON.stringify(text.slice(0, 180))}`);
  }
  if (!allowStatuses.includes(response.status)) {
    const code = json?.error?.code ? ` ${json.error.code}` : '';
    const message = json?.error?.message ? `: ${json.error.message}` : '';
    const details = json?.error?.details ? ` (${JSON.stringify(json.error.details).slice(0, 240)})` : '';
    throw new Error(`${label} returned ${response.status}${code}${message}${details}`);
  }
  return { response, json };
};

const supabaseRestRequest = async (
  pathName,
  {
    method = 'GET',
    body,
    allowStatuses = [200],
    prefer = 'return=representation',
    label = pathName,
  } = {},
) => {
  if (!hasSupabaseOperatorFallback) {
    throw new Error('Supabase REST operator fallback is not configured.');
  }
  const url = `${supabaseUrl}/rest/v1/${pathName.replace(/^\/+/u, '')}`;
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${label} did not return JSON; status=${response.status}; body=${JSON.stringify(text.slice(0, 180))}`);
    }
  }
  if (!allowStatuses.includes(response.status)) {
    const code = json?.code ? ` ${json.code}` : '';
    const message = json?.message ? `: ${json.message}` : '';
    throw new Error(`${label} returned ${response.status}${code}${message}`);
  }
  return Array.isArray(json) ? json : json ? [json] : [];
};

const firstSiteRecord = (json) => {
  if (json?.data?.site && typeof json.data.site === 'object') return json.data.site;
  if (Array.isArray(json?.data?.sites) && json.data.sites[0]) return json.data.sites[0];
  if (Array.isArray(json?.data) && json.data[0]) return json.data[0];
  return null;
};

const isUuidIdentifier = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    String(value || ''),
  );

const restEq = (value) => `eq.${encodeURIComponent(String(value))}`;

const mapSupabaseSite = (row) =>
  row
    ? {
        id: row.id,
        teamId: row.team_id,
        name: row.name,
        slug: row.slug,
        description: row.description || '',
        customDomain: row.custom_domain || '',
        settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
        isPublished: Boolean(row.is_published),
      }
    : null;

const findSupabaseProfileByEmail = async (email) => {
  if (!email) return null;
  const rows = await supabaseRestRequest(
    `profiles?select=id,email,role,status,is_active&email=${restEq(email)}&limit=1`,
    { label: 'Supabase profile lookup' },
  );
  return rows[0] || null;
};

const resolveSupabaseTeam = async () => {
  if (teamId) {
    const rows = await supabaseRestRequest(`teams?select=id,name,slug,owner_id&id=${restEq(teamId)}&limit=1`, {
      label: 'Supabase explicit team lookup',
    });
    if (!rows[0]) {
      throw new Error(`No Supabase team exists for --team-id ${teamId}.`);
    }
    return { team: rows[0], source: 'explicit-team-id' };
  }

  const ownerProfile = await findSupabaseProfileByEmail(ownerEmail);
  if (ownerProfile?.id) {
    const memberships = await supabaseRestRequest(
      `team_members?select=team_id,role&user_id=${restEq(ownerProfile.id)}&role=in.(owner,admin)&limit=2`,
      { label: 'Supabase owner/admin membership lookup' },
    );
    if (memberships.length === 1) {
      const teams = await supabaseRestRequest(
        `teams?select=id,name,slug,owner_id&id=${restEq(memberships[0].team_id)}&limit=1`,
        { label: 'Supabase owner/admin team lookup' },
      );
      if (teams[0]) return { team: teams[0], source: 'owner-email-membership' };
    }
  }

  const teams = await supabaseRestRequest('teams?select=id,name,slug,owner_id&limit=2', {
    label: 'Supabase team lookup',
  });
  if (teams.length === 1) {
    return { team: teams[0], source: 'single-team' };
  }

  if (teams.length === 0 && ownerProfile?.id) {
    const teamSlug = `${siteId || 'workspace'}-workspace`;
    const createdTeams = await supabaseRestRequest('teams?select=id,name,slug,owner_id', {
      method: 'POST',
      body: {
        name: `${siteName || siteId} Workspace`,
        slug: teamSlug,
        owner_id: ownerProfile.id,
        settings: {
          source: 'custom-frontend-ensure-site-cli',
          createdForPublicHost: publicHost,
        },
      },
      allowStatuses: [201],
      prefer: 'return=representation',
      label: 'Supabase team create',
    });
    return { team: createdTeams[0], source: 'created-owner-team' };
  }

  throw new Error(
    [
      'Supabase REST fallback could not resolve a team.',
      'Pass --team-id, or pass --owner-email for an existing owner/admin profile with exactly one team membership.',
    ].join('\n'),
  );
};

const ensureSupabaseOwnerAccess = async (team) => {
  if (!ownerEmail) {
    return { status: 'not-requested' };
  }
  const profile = await findSupabaseProfileByEmail(ownerEmail);
  if (!profile?.id) {
    throw new Error(`No existing Backy profile was found for --owner-email ${ownerEmail}. Sign in once, then rerun.`);
  }
  await supabaseRestRequest(`profiles?id=${restEq(profile.id)}`, {
    method: 'PATCH',
    body: {
      role: 'owner',
      status: 'active',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    allowStatuses: [200, 204],
    prefer: 'return=minimal',
    label: 'Supabase owner profile activation',
  });
  const memberships = await supabaseRestRequest(
    `team_members?select=id,team_id,user_id,role&team_id=${restEq(team.id)}&user_id=${restEq(profile.id)}&limit=1`,
    { label: 'Supabase team member lookup' },
  );
  if (memberships[0]?.id) {
    await supabaseRestRequest(`team_members?id=${restEq(memberships[0].id)}`, {
      method: 'PATCH',
      body: { role: 'owner' },
      allowStatuses: [200, 204],
      prefer: 'return=minimal',
      label: 'Supabase team member owner update',
    });
    return { status: 'updated-owner', profileId: profile.id, teamId: team.id };
  }
  await supabaseRestRequest('team_members', {
    method: 'POST',
    body: {
      team_id: team.id,
      user_id: profile.id,
      role: 'owner',
    },
    allowStatuses: [201],
    prefer: 'return=minimal',
    label: 'Supabase team member owner create',
  });
  return { status: 'created-owner', profileId: profile.id, teamId: team.id };
};

const findSupabaseSite = async () => {
  const select = 'select=id,team_id,name,slug,description,custom_domain,settings,is_published';
  if (isUuidIdentifier(siteId)) {
    const byId = await supabaseRestRequest(`sites?${select}&id=${restEq(siteId)}&limit=1`, {
      label: 'Supabase site id lookup',
    });
    if (byId[0]) return mapSupabaseSite(byId[0]);
  }
  const bySlug = await supabaseRestRequest(`sites?${select}&slug=${restEq(siteId)}&limit=1`, {
    label: 'Supabase site slug lookup',
  });
  if (bySlug[0]) return mapSupabaseSite(bySlug[0]);
  const byDomain = await supabaseRestRequest(`sites?${select}&custom_domain=${restEq(publicHost)}&limit=1`, {
    label: 'Supabase site custom domain lookup',
  });
  return mapSupabaseSite(byDomain[0]);
};

const supabaseSitePayload = (site, resolvedTeam) => {
  const now = new Date().toISOString();
  return {
    team_id: resolvedTeam.id,
    name: siteName || site?.name || siteId,
    slug: normalizeSlug(site?.slug || siteId) || siteId,
    description: description || site?.description || `Backy site record for ${publicHost}.`,
    custom_domain: publicHost,
    settings: {
      ...(site?.settings || {}),
      ...siteSettingsPatch(),
    },
    is_published: true,
    published_at: now,
    updated_at: now,
  };
};

const createSupabaseSite = async (resolvedTeam) => {
  const rows = await supabaseRestRequest('sites', {
    method: 'POST',
    body: {
      ...supabaseSitePayload(null, resolvedTeam),
      theme: {
        colors: {},
        fonts: {},
        spacing: {},
        customCSS: '',
      },
      domain_status: 'pending',
      ssl_enabled: false,
    },
    allowStatuses: [201],
    prefer: 'return=representation',
    label: 'Supabase site create',
  });
  return mapSupabaseSite(rows[0]);
};

const updateSupabaseSite = async (site, resolvedTeam) => {
  const rows = await supabaseRestRequest(`sites?id=${restEq(site.id)}`, {
    method: 'PATCH',
    body: supabaseSitePayload(site, resolvedTeam),
    allowStatuses: [200],
    prefer: 'return=representation',
    label: 'Supabase site publish/update',
  });
  return mapSupabaseSite(rows[0]);
};

const verifyPublicSite = async (identifier) => {
  const discoveryUrl = apiUrl(`/sites?identifier=${encodeURIComponent(identifier)}`);
  const discovery = await jsonRequest(discoveryUrl, {
    allowStatuses: [200],
    label: 'Public site discovery',
  });
  const site = firstSiteRecord(discovery.json);
  if (!site?.id) {
    throw new Error(`Public site discovery did not return a site for ${identifier}.`);
  }
  const canonicalSiteId = String(site.id);
  const manifestUrl = apiUrl(`/sites/${encodeURIComponent(canonicalSiteId)}/manifest`);
  const renderUrl = apiUrl(
    `/sites/${encodeURIComponent(canonicalSiteId)}/render?path=/&domain=${encodeURIComponent(publicHost)}`,
  );
  const [manifest, render] = await Promise.all([
    jsonRequest(manifestUrl, { label: 'Public site manifest' }),
    jsonRequest(renderUrl, { label: 'Public site home render' }),
  ]);
  return {
    status: 'verified',
    siteId: canonicalSiteId,
    siteSlug: site.slug || identifier,
    siteName: site.name || siteName || identifier,
    discoveryUrl,
    manifestUrl,
    renderUrl,
    manifestSchemaVersion: manifest.json?.data?.schemaVersion || '',
    renderRoute: render.json?.data?.route?.path || render.json?.data?.path || '/',
  };
};

const findAdminSite = async () => {
  const { json } = await jsonRequest(adminUrl('/sites?includeUnpublished=true'), {
    admin: true,
    label: 'Admin site list',
  });
  const sites = Array.isArray(json?.data?.sites) ? json.data.sites : [];
  return sites.find((site) => {
    const candidateId = String(site?.id || '');
    const candidateSlug = normalizeSlug(site?.slug || '');
    const candidateDomain = normalizeHost(site?.customDomain || '');
    return candidateId === siteId || candidateSlug === siteId || candidateDomain === publicHost;
  }) || null;
};

const siteSettingsPatch = () => {
  const now = new Date().toISOString();
  return {
    siteStatus: 'published',
    domainVerification: {
      domain: publicHost,
      status: 'pending',
      requestedAt: now,
      checkedAt: null,
      verifiedAt: null,
      lastError: null,
    },
    launchSetup: {
      source: 'custom-frontend-ensure-site-cli',
      publicHost,
      backyPublicApiBaseUrl: apiBaseUrl,
      customFrontendProject: 'separate-vercel-project',
      updatedAt: now,
    },
  };
};

const createSite = async () => {
  const payload = {
    name: siteName,
    slug: siteId,
    description: description || `Backy site record for ${publicHost}.`,
    customDomain: publicHost,
    status: 'published',
    ...(teamId ? { teamId } : {}),
    settings: siteSettingsPatch(),
  };
  const { json } = await jsonRequest(adminUrl('/sites'), {
    method: 'POST',
    body: payload,
    admin: true,
    allowStatuses: [201],
    label: 'Admin site create',
  });
  return json?.data?.site || null;
};

const updateSite = async (site) => {
  const payload = {
    name: siteName || site.name,
    slug: normalizeSlug(site.slug || siteId) || siteId,
    description: description || site.description || `Backy site record for ${publicHost}.`,
    customDomain: publicHost,
    status: 'published',
    isPublished: true,
    settings: siteSettingsPatch(),
  };
  const { json } = await jsonRequest(adminUrl(`/sites/${encodeURIComponent(site.id || site.slug || siteId)}`), {
    method: 'PATCH',
    body: payload,
    admin: true,
    label: 'Admin site publish/update',
  });
  return json?.data?.site || null;
};

const buildHomepageContent = () => ({
  canvasSize: { width: 1200, height: 760 },
  elements: [
    {
      id: 'custom-frontend-launch-section',
      type: 'section',
      x: 0,
      y: 0,
      width: 1200,
      height: 760,
      props: {
        backgroundColor: '#f8fafc',
        padding: 0,
      },
      children: [
        {
          id: 'custom-frontend-launch-kicker',
          type: 'paragraph',
          x: 96,
          y: 92,
          width: 420,
          height: 36,
          props: {
            content: 'Backy powered site',
            fontSize: 14,
            fontWeight: '700',
            color: '#0f766e',
            letterSpacing: 0,
          },
        },
        {
          id: 'custom-frontend-launch-heading',
          type: 'heading',
          x: 96,
          y: 144,
          width: 680,
          height: 150,
          props: {
            content: siteName || siteId,
            level: 'h1',
            fontSize: 58,
            fontWeight: '800',
            lineHeight: 1.08,
            color: '#0f172a',
          },
        },
        {
          id: 'custom-frontend-launch-copy',
          type: 'paragraph',
          x: 100,
          y: 326,
          width: 620,
          height: 128,
          props: {
            content:
              description ||
              'This published starter page proves Backy public discovery, manifest, render, design metadata, and custom frontend handoff are ready for a separate website project.',
            fontSize: 20,
            lineHeight: 1.55,
            color: '#475569',
          },
        },
        {
          id: 'custom-frontend-launch-card',
          type: 'box',
          x: 820,
          y: 120,
          width: 280,
          height: 280,
          props: {
            backgroundColor: '#ffffff',
            borderColor: '#cbd5e1',
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 8,
          },
          children: [
            {
              id: 'custom-frontend-launch-card-title',
              type: 'heading',
              x: 28,
              y: 34,
              width: 224,
              height: 62,
              props: {
                content: 'Frontend contract ready',
                level: 'h2',
                fontSize: 26,
                fontWeight: '750',
                lineHeight: 1.15,
                color: '#0f172a',
              },
            },
            {
              id: 'custom-frontend-launch-card-copy',
              type: 'paragraph',
              x: 30,
              y: 124,
              width: 220,
              height: 104,
              props: {
                content: 'Use Backy APIs for pages, blog, media, forms, newsletter, and editable element metadata.',
                fontSize: 16,
                lineHeight: 1.45,
                color: '#475569',
              },
            },
          ],
        },
      ],
    },
  ],
  editableMap: {
    'home.hero.title': {
      elementId: 'custom-frontend-launch-heading',
      field: 'props.content',
      label: 'Homepage title',
    },
    'home.hero.copy': {
      elementId: 'custom-frontend-launch-copy',
      field: 'props.content',
      label: 'Homepage copy',
    },
  },
  metadata: {
    source: 'custom-frontend-ensure-site-cli',
    publicHost,
    apiBaseUrl,
  },
});

const findHomepage = (pages) =>
  pages.find((page) => page?.isHomepage) ||
  pages.find((page) => normalizeSlug(page?.slug || '') === 'index') ||
  pages.find((page) => normalizeSlug(page?.slug || '') === 'home') ||
  null;

const ensureHomepage = async (site) => {
  if (skipHomeSeed) {
    return { status: 'skipped', reason: '--skip-home-seed' };
  }
  const { json } = await jsonRequest(adminUrl(`/sites/${encodeURIComponent(site.id)}/pages?includeUnpublished=true`), {
    admin: true,
    label: 'Admin page list',
  });
  const pages = Array.isArray(json?.data?.pages) ? json.data.pages : [];
  const homepage = findHomepage(pages);
  if (homepage?.status === 'published') {
    return { status: 'existing-published', pageId: homepage.id, slug: homepage.slug };
  }
  if (homepage && !publishExistingHome) {
    return {
      status: 'existing-not-published',
      pageId: homepage.id,
      slug: homepage.slug,
      pageStatus: homepage.status || 'draft',
      guidance: 'Pass --publish-existing-home to publish the current homepage, or publish/edit it in Backy admin.',
    };
  }
  if (homepage && publishExistingHome) {
    const { json: publishJson } = await jsonRequest(
      adminUrl(`/sites/${encodeURIComponent(site.id)}/pages/${encodeURIComponent(homepage.id)}/publish`),
      {
        method: 'POST',
        body: { requestId: `ensure-home-${Date.now().toString(36)}` },
        admin: true,
        label: 'Admin homepage publish',
      },
    );
    const page = publishJson?.data?.page || homepage;
    return { status: 'published-existing', pageId: page.id, slug: page.slug };
  }
  const payload = {
    title: 'Home',
    slug: 'index',
    description: description || `Starter homepage for ${publicHost}.`,
    status: 'published',
    isHomepage: true,
    meta: {
      title: siteName || 'Home',
      description: description || `Starter homepage for ${publicHost}.`,
      canonical: '/',
    },
    content: buildHomepageContent(),
  };
  const { json: createJson } = await jsonRequest(adminUrl(`/sites/${encodeURIComponent(site.id)}/pages`), {
    method: 'POST',
    body: payload,
    admin: true,
    allowStatuses: [201],
    label: 'Admin homepage create',
  });
  const page = createJson?.data?.page || null;
  return { status: 'created-published', pageId: page?.id || '', slug: page?.slug || 'index' };
};

const mapSupabasePage = (row) =>
  row
    ? {
        id: row.id,
        slug: row.slug,
        status: row.status,
        isHomepage: Boolean(row.is_homepage),
      }
    : null;

const ensureSupabaseHomepage = async (site) => {
  if (skipHomeSeed) {
    return { status: 'skipped', reason: '--skip-home-seed' };
  }
  const rows = await supabaseRestRequest(
    `pages?select=id,slug,status,is_homepage&site_id=${restEq(site.id)}&limit=100`,
    { label: 'Supabase page list' },
  );
  const pages = rows.map(mapSupabasePage).filter(Boolean);
  const homepage = findHomepage(pages);
  if (homepage?.status === 'published') {
    return { status: 'existing-published', pageId: homepage.id, slug: homepage.slug };
  }
  const now = new Date().toISOString();
  if (homepage && !publishExistingHome) {
    return {
      status: 'existing-not-published',
      pageId: homepage.id,
      slug: homepage.slug,
      pageStatus: homepage.status || 'draft',
      guidance: 'Pass --publish-existing-home to publish the current homepage, or publish/edit it in Backy admin.',
    };
  }
  if (homepage && publishExistingHome) {
    await supabaseRestRequest(`pages?id=${restEq(homepage.id)}`, {
      method: 'PATCH',
      body: {
        status: 'published',
        is_homepage: true,
        published_at: now,
        updated_at: now,
      },
      allowStatuses: [200, 204],
      prefer: 'return=minimal',
      label: 'Supabase homepage publish',
    });
    return { status: 'published-existing', pageId: homepage.id, slug: homepage.slug };
  }
  const rowsCreated = await supabaseRestRequest('pages', {
    method: 'POST',
    body: {
      site_id: site.id,
      title: 'Home',
      slug: 'index',
      description: description || `Starter homepage for ${publicHost}.`,
      status: 'published',
      is_homepage: true,
      sort_order: 0,
      published_at: now,
      updated_at: now,
      meta: {
        title: siteName || 'Home',
        description: description || `Starter homepage for ${publicHost}.`,
        canonical: '/',
      },
      content: buildHomepageContent(),
    },
    allowStatuses: [201],
    prefer: 'return=representation',
    label: 'Supabase homepage create',
  });
  const page = mapSupabasePage(rowsCreated[0]);
  return { status: 'created-published', pageId: page?.id || '', slug: page?.slug || 'index' };
};

const scaffoldCommand = () =>
  [
    'npm run custom-frontend:scaffold --',
    `--site-id ${siteId}`,
    `--public-host ${publicHost}`,
    `--api-base ${apiBaseUrl}`,
    '--out ../<website-frontend-repo>',
  ].join(' ');

const run = async () => {
  let initialVerification = null;
  let site = null;
  let siteAction = 'none';
  let homepageAction = { status: 'not-needed' };

  try {
    initialVerification = await verifyPublicSite(siteId);
    site = {
      id: initialVerification.siteId,
      slug: initialVerification.siteSlug,
      name: initialVerification.siteName,
    };
  } catch (error) {
    initialVerification = {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!initialVerification || initialVerification.status !== 'verified') {
    if (verifyOnly) {
      throw new Error(`Public site is not ready and --verify-only was used.\n${initialVerification?.reason || ''}`);
    }
    if (adminKey) {
      site = await findAdminSite();
      if (site) {
        site = await updateSite(site);
        siteAction = 'updated-published';
      } else {
        site = await createSite();
        siteAction = 'created-published';
      }
      if (!site?.id) {
        throw new Error('Admin site create/update did not return a site id.');
      }
      homepageAction = await ensureHomepage(site);
    } else if (hasSupabaseOperatorFallback) {
      const { team, source: teamSource } = await resolveSupabaseTeam();
      const ownerAccess = await ensureSupabaseOwnerAccess(team);
      site = await findSupabaseSite();
      if (site) {
        site = await updateSupabaseSite(site, team);
        siteAction = 'supabase-rest-updated-published';
      } else {
        site = await createSupabaseSite(team);
        siteAction = 'supabase-rest-created-published';
      }
      if (!site?.id) {
        throw new Error('Supabase REST site create/update did not return a site id.');
      }
      homepageAction = {
        ...(await ensureSupabaseHomepage(site)),
        teamId: team.id,
        teamSource,
        ownerAccess,
      };
    } else {
      throw new Error(
        [
          'Public site is not ready and no server-side operator credential is configured.',
          'Set BACKY_CUSTOM_FRONTEND_ADMIN_KEY, BACKY_ADMIN_API_KEY, or BACKY_ADMIN_SECRET_KEY for the admin API path.',
          'Or set SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY for the server-side Supabase REST fallback.',
        ].join('\n'),
      );
    }
    if (homepageAction.status === 'existing-not-published') {
      throw new Error(
        [
          `Homepage exists but is not published (${homepageAction.pageStatus}).`,
          homepageAction.guidance,
        ].join('\n'),
      );
    }
  }

  const publicSiteVerification = await verifyPublicSite(siteId);
  const summary = {
    schemaVersion: 'backy.custom-frontend-site-readiness.v1',
    siteId,
    resolvedSiteId: publicSiteVerification.siteId,
    publicHost,
    apiBaseUrl,
    siteAction,
    homepageAction,
    publicSiteVerification,
    safeFrontendEnv: {
      NEXT_PUBLIC_BACKY_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_BACKY_SITE_ID: publicSiteVerification.siteId,
      NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: publicHost,
      BACKY_PUBLIC_API_BASE_URL: apiBaseUrl,
      BACKY_SITE_ID: publicSiteVerification.siteId,
      BACKY_SITE_PUBLIC_HOST: publicHost,
    },
    next: {
      scaffoldCommand: scaffoldCommand(),
      verificationCommand:
        `BACKY_CUSTOM_FRONTEND_API_BASE_URL=${apiBaseUrl} BACKY_CUSTOM_FRONTEND_SITE_ID=${publicSiteVerification.siteId} BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=${publicHost} BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1 npm run test:custom-frontend-connection`,
    },
  };

  if (!silent) {
    console.log(JSON.stringify(summary, null, 2));
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
