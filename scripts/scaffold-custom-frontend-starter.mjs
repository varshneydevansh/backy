#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const starterRoot = path.join(repoRoot, 'examples/custom-frontend-next');
const materializerPath = path.join(repoRoot, 'scripts/materialize-custom-frontend-starter.mjs');

const SCHEMA_VERSION = 'backy.custom-frontend-starter-export.v1';
const STARTER_PROJECT_SCHEMA_VERSION = 'backy.custom-frontend-starter-project.v1';
const MATERIALIZER_COMMAND =
  'npm run custom-frontend:materialize -- --manifest <downloaded-starter-json> --out ../<website-frontend-repo>';

const starterFiles = [
  { path: 'README.md', role: 'starter-documentation' },
  { path: 'package.json', role: 'runtime-package' },
  { path: 'next.config.mjs', role: 'next-config' },
  { path: 'tsconfig.json', role: 'typescript-config' },
  { path: 'src/app/layout.tsx', role: 'app-layout' },
  { path: 'src/app/styles.css', role: 'app-styles' },
  { path: 'src/app/[[...path]]/page.tsx', role: 'public-page-renderer' },
  { path: 'src/app/api/backy-connection/route.ts', role: 'connection-probe' },
  { path: 'src/app/api/newsletter/route.ts', role: 'newsletter-bridge' },
  { path: 'src/app/api/backy-form/route.ts', role: 'form-bridge' },
  { path: 'src/lib/backy-client.ts', role: 'backy-public-client' },
  { path: 'src/lib/backy.ts', role: 'backy-client-bootstrap' },
  { path: 'src/lib/render.tsx', role: 'backy-renderer' },
];

const FORBIDDEN_PRIVATE_ENV = [
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'BACKY_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'BACKY_ADMIN_API_KEY',
  'BACKY_ADMIN_SECRET_KEY',
  'BACKY_BOOTSTRAP_TOKEN',
  'CRON_SECRET',
  'SMTP_PASSWORD',
  'STRIPE_SECRET_KEY',
];

const STARTER_FILES_TO_PRESERVE = [
  'src/lib/backy-client.ts',
  'src/lib/backy.ts',
  'src/lib/render.tsx',
  'src/app/[[...path]]/page.tsx',
  'src/app/api/backy-connection/route.ts',
  'src/app/api/newsletter/route.ts',
  'src/app/api/backy-form/route.ts',
];

const REQUIRED_DOM_ATTRIBUTES = [
  'data-backy-site-id',
  'data-backy-route',
  'data-backy-element-id',
  'data-backy-element-type',
  'data-backy-component-contract-pointer',
  'data-backy-editable-map-pointer',
  'data-backy-responsive-css',
  'data-backy-responsive-style-pointer',
];

const usage = () => {
  console.error(
    [
      'Usage:',
      '  npm run custom-frontend:scaffold -- --site-id <site-id-or-slug> --public-host <domain> --api-base <https://backy-public-domain/api> --out <target-dir> [--manifest <starter-export.json>] [--force] [--skip-site-verify]',
      '',
      'Examples:',
      '  npm run custom-frontend:scaffold -- --site-id site-demo --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --out ../devanshvarshney-frontend',
      '  npm run custom-frontend:scaffold -- --site-id site-demo --public-host devanshvarshney.com --api-base https://backy-public.vercel.app/api --manifest ./backy-starter.json',
      '',
      'Creates the same non-secret file-list starter export used by the protected admin download, then optionally materializes it into a separate frontend repo.',
      'By default the command verifies the public Backy site discovery, manifest, and home render payload before writing files.',
    ].join('\n'),
  );
};

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const hasFlag = (name) => args.includes(name);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const normalizeHost = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/\/.*$/u, '')
    .replace(/\.$/u, '');

const normalizeApiBaseUrl = (value) => {
  const trimmed = String(value || '').trim().replace(/\/+$/u, '');
  assert(trimmed, '--api-base is required.');
  const url = new URL(trimmed);
  const pathname = url.pathname.replace(/\/+$/u, '');
  url.pathname = pathname.endsWith('/api') ? pathname : `${pathname}/api`.replace(/\/{2,}/gu, '/');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
};

const apiUrl = (apiBaseUrl, pathName) =>
  `${apiBaseUrl}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;

const safeProjectName = (siteId, publicHost) =>
  `${publicHost || siteId || 'backy'}-frontend`
    .toLowerCase()
    .replace(/^www\./u, '')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-') || 'backy-custom-frontend';

const readStarterFile = (relativePath) => {
  const absolutePath = path.resolve(starterRoot, relativePath);
  assert(
    absolutePath === starterRoot || absolutePath.startsWith(starterRoot + path.sep),
    `Refusing to read outside starter root: ${relativePath}`,
  );
  return fs.readFileSync(absolutePath, 'utf8');
};

const requestJson = async (url, label) => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON from ${url}; body starts ${JSON.stringify(text.slice(0, 160))}`);
  }
  if (response.status !== 200 || json?.success === false) {
    const code = json?.error?.code ? ` ${json.error.code}` : '';
    const message = json?.error?.message ? `: ${json.error.message}` : '';
    throw new Error(`${label} returned ${response.status}${code}${message}`);
  }
  return json;
};

const firstSiteRecord = (json) => {
  if (json?.data?.site && typeof json.data.site === 'object') return json.data.site;
  if (Array.isArray(json?.data?.sites) && json.data.sites[0]) return json.data.sites[0];
  if (Array.isArray(json?.data) && json.data[0]) return json.data[0];
  return null;
};

const verifyPublicSite = async ({ apiBaseUrl, siteId, publicHost }) => {
  const discoveryUrl = apiUrl(apiBaseUrl, `/sites?identifier=${encodeURIComponent(siteId)}`);
  const discovery = await requestJson(discoveryUrl, 'Public site discovery');
  const site = firstSiteRecord(discovery);
  if (!site?.id) {
    throw new Error(`Public site discovery did not return a site record for ${siteId}.`);
  }

  const canonicalSiteId = String(site.id);
  const manifestUrl = apiUrl(apiBaseUrl, `/sites/${encodeURIComponent(canonicalSiteId)}/manifest`);
  const manifest = await requestJson(manifestUrl, 'Public site manifest');
  const renderUrl = apiUrl(
    apiBaseUrl,
    `/sites/${encodeURIComponent(canonicalSiteId)}/render?path=/&domain=${encodeURIComponent(publicHost)}`,
  );
  const render = await requestJson(renderUrl, 'Public site home render');

  return {
    status: 'verified',
    siteId: canonicalSiteId,
    siteSlug: typeof site.slug === 'string' ? site.slug : siteId,
    siteName: typeof site.name === 'string' ? site.name : siteId,
    discoveryUrl,
    manifestUrl,
    renderUrl,
    manifestSchemaVersion: manifest?.data?.schemaVersion || '',
    renderRoute: render?.data?.route?.path || render?.data?.path || '/',
  };
};

const envExample = ({ apiBaseUrl, siteId, publicHost }) =>
  `${[
    '# Browser-safe values for the separate public website frontend.',
    `NEXT_PUBLIC_BACKY_API_BASE_URL=${apiBaseUrl}`,
    `NEXT_PUBLIC_BACKY_SITE_ID=${siteId}`,
    `NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=${publicHost}`,
    '',
    '# Optional server-loader aliases. Keep these out of client-only config files.',
    `BACKY_PUBLIC_API_BASE_URL=${apiBaseUrl}`,
    `BACKY_SITE_ID=${siteId}`,
    `BACKY_SITE_PUBLIC_HOST=${publicHost}`,
    '',
    '# Never add database, Supabase service role, admin, cron, SMTP, or provider secrets to this project.',
  ].join('\n')}\n`;

const starterReadme = ({ apiBaseUrl, siteId, publicHost, scaffoldCommand }) =>
  `${[
    '# Backy Custom Frontend Starter',
    '',
    'This project was scaffolded by Backy for a separate public website frontend.',
    '',
    '## Start',
    '',
    '1. Keep this as a separate frontend repo or Vercel project.',
    '2. Add the `.env.example` values to the frontend deployment.',
    '3. Run `npm install` and `npm run build`.',
    '4. Attach the website domain to this frontend project, not to `backy-admin` or `backy-public`.',
    '5. Deploy, then verify from Backy Site Detail before moving production DNS.',
    '',
    '## Recreate',
    '',
    'From the Backy repo, recreate this project with:',
    '',
    '```bash',
    scaffoldCommand,
    '```',
    '',
    'The protected admin download uses the same file-list schema. Downloaded starter JSON can also be materialized with:',
    '',
    '```bash',
    MATERIALIZER_COMMAND,
    '```',
    '',
    '## Site Values',
    '',
    `- Backy API base: ${apiBaseUrl}`,
    `- Backy site id: ${siteId}`,
    `- Public host: ${publicHost}`,
    '',
    '## Required Runtime Contract',
    '',
    'The deployed frontend must expose `GET /api/backy-connection` and rendered pages must keep:',
    '',
    ...REQUIRED_DOM_ATTRIBUTES.map((attribute) => `- \`${attribute}\``),
    '',
    'Keep Backy as the source of truth for content, design metadata, media, forms, newsletter subscribers, and commerce records.',
  ].join('\n')}\n`;

const buildStarterExport = ({ apiBaseUrl, siteId, publicHost, siteName, siteSlug, outPath }) => {
  const recommendedName = safeProjectName(siteId, publicHost);
  const scaffoldCommand = [
    'npm run custom-frontend:scaffold --',
    `--site-id ${siteId}`,
    `--public-host ${publicHost}`,
    `--api-base ${apiBaseUrl}`,
    `--out ${outPath || `../${recommendedName}`}`,
  ].join(' ');
  const siteSpecificFiles = [
    {
      path: '.env.example',
      role: 'site-specific-env',
      content: envExample({ apiBaseUrl, siteId, publicHost }),
    },
    {
      path: 'BACKY_FRONTEND_STARTER.md',
      role: 'site-specific-runbook',
      content: starterReadme({ apiBaseUrl, siteId, publicHost, scaffoldCommand }),
    },
  ];
  const copiedFiles = starterFiles.map((file) => ({
    ...file,
    source: 'examples/custom-frontend-next',
    content: readStarterFile(file.path),
  }));
  const files = [...siteSpecificFiles, ...copiedFiles];

  return {
    success: true,
    data: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'backy-local-custom-frontend-scaffold',
      site: {
        id: siteId,
        slug: siteSlug || siteId,
        name: siteName || siteSlug || siteId,
        primaryPublicHost: publicHost,
        publicHosts: [publicHost],
      },
      project: {
        recommendedName,
        sourceStarterPath: 'examples/custom-frontend-next',
        sourceStarterDescription:
          'Checked Next.js starter that keeps Backy render payloads, DOM control attributes, form submissions, newsletter signup, and /api/backy-connection intact.',
        targetRuntime: 'Next.js App Router on a separate Vercel project',
        domainOwner: 'custom-frontend-vercel-project',
        starterExportFormat: 'file-list',
        sourceStarterFileCount: starterFiles.length,
        rootDirectory: '.',
        installCommand: 'npm install',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
      },
      starterProject: {
        schemaVersion: STARTER_PROJECT_SCHEMA_VERSION,
        sourceRoot: 'examples/custom-frontend-next',
        exportFormat: 'file-list',
        rootDirectory: '.',
        fileCount: files.length,
        generatedFiles: siteSpecificFiles.map((file) => file.path),
        copiedFiles: copiedFiles.map((file) => file.path),
        materializerCommand: MATERIALIZER_COMMAND,
        scaffoldCommand,
        installCommand: 'npm install',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
        deploymentTarget: 'separate Vercel project',
        domainOwner: 'custom-frontend-vercel-project',
      },
      environment: {
        browserSafe: {
          NEXT_PUBLIC_BACKY_API_BASE_URL: apiBaseUrl,
          NEXT_PUBLIC_BACKY_SITE_ID: siteId,
          NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: publicHost,
        },
        serverSide: {
          BACKY_PUBLIC_API_BASE_URL: apiBaseUrl,
          BACKY_SITE_ID: siteId,
          BACKY_SITE_PUBLIC_HOST: publicHost,
        },
        forbiddenPrivateEnv: FORBIDDEN_PRIVATE_ENV,
      },
      files,
      fileCount: files.length,
      materializer: {
        command: MATERIALIZER_COMMAND,
        targetDirectoryPolicy: 'empty-directory-required-unless-force',
        pathSafety: 'rejects-absolute-parent-and-drive-paths',
      },
      preserveFiles: STARTER_FILES_TO_PRESERVE,
      readOrder: [
        `/api/sites/${siteId}/agent-handoff`,
        `/api/sites/${siteId}/manifest`,
        `/api/sites/${siteId}/openapi`,
        `/api/sites/${siteId}/resolve?path=/&domain=${encodeURIComponent(publicHost)}`,
        `/api/sites/${siteId}/render?path=/&domain=${encodeURIComponent(publicHost)}`,
      ],
      verification: {
        frontendProbePath: '/api/backy-connection',
        frontendProbeSchema: 'backy.custom-frontend-connection.v1',
        requiredDomAttributes: REQUIRED_DOM_ATTRIBUTES,
        cliCommand: [
          `BACKY_CUSTOM_FRONTEND_API_BASE_URL=${apiBaseUrl}`,
          `BACKY_CUSTOM_FRONTEND_SITE_ID=${siteId}`,
          'BACKY_CUSTOM_FRONTEND_URL=https://<frontend-domain>',
          'BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1',
          'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1',
          'npm run test:custom-frontend-connection',
        ].join(' '),
      },
    },
  };
};

const siteId = option('--site-id') || option('--site');
const publicHost = normalizeHost(option('--public-host') || option('--host') || option('--domain'));
const apiBaseUrl = option('--api-base') ? normalizeApiBaseUrl(option('--api-base')) : '';
const outPath = option('--out');
const manifestPath = option('--manifest');
const force = hasFlag('--force');
const skipSiteVerify = hasFlag('--skip-site-verify');

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}

try {
  assert(siteId, '--site-id is required.');
  assert(publicHost, '--public-host is required.');
  assert(apiBaseUrl, '--api-base is required.');
  assert(outPath || manifestPath, 'Provide --out to materialize a project, --manifest to write JSON, or both.');

  let publicSiteVerification = {
    status: 'skipped',
    reason: '--skip-site-verify',
    siteId,
  };
  if (!skipSiteVerify) {
    try {
      publicSiteVerification = await verifyPublicSite({ apiBaseUrl, siteId, publicHost });
    } catch (error) {
      throw new Error(
        [
          'Backy public site is not ready for custom frontend scaffolding.',
          error instanceof Error ? error.message : String(error),
          'Create/publish the Backy site first, or pass --skip-site-verify only for an offline manifest that will be verified before deployment.',
        ].join('\n'),
      );
    }
  }

  const starterExport = buildStarterExport({
    apiBaseUrl,
    siteId: publicSiteVerification.siteId || siteId,
    publicHost,
    siteName: option('--site-name') || publicSiteVerification.siteName,
    siteSlug: option('--site-slug') || publicSiteVerification.siteSlug,
    outPath,
  });
  starterExport.data.publicSiteVerification = publicSiteVerification;

  let manifestForMaterializer = '';
  if (manifestPath) {
    manifestForMaterializer = path.resolve(process.cwd(), manifestPath);
    fs.mkdirSync(path.dirname(manifestForMaterializer), { recursive: true });
    fs.writeFileSync(manifestForMaterializer, JSON.stringify(starterExport, null, 2));
  } else {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backy-custom-frontend-scaffold-'));
    manifestForMaterializer = path.join(tempDir, 'starter.json');
    fs.writeFileSync(manifestForMaterializer, JSON.stringify(starterExport, null, 2));
  }

  let materializerSummary = null;
  if (outPath) {
    const materializerArgs = [
      materializerPath,
      '--manifest',
      manifestForMaterializer,
      '--out',
      outPath,
      ...(force ? ['--force'] : []),
    ];
    const materializer = spawnSync('node', materializerArgs, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30000,
    });
    if (materializer.status !== 0) {
      throw new Error(`Materializer failed:\n${materializer.stdout}\n${materializer.stderr}`);
    }
    materializerSummary = JSON.parse(materializer.stdout);
  }

  console.log(
    JSON.stringify(
      {
        schemaVersion: 'backy.custom-frontend-scaffold.v1',
        siteId,
        resolvedSiteId: starterExport.data.site.id,
        publicHost,
        apiBaseUrl,
        publicSiteVerification,
        manifestPath: manifestPath ? manifestForMaterializer : null,
        materialized: Boolean(outPath),
        materializer: materializerSummary,
        fileCount: starterExport.data.fileCount,
        installCommand: starterExport.data.starterProject.installCommand,
        buildCommand: starterExport.data.starterProject.buildCommand,
        devCommand: starterExport.data.starterProject.devCommand,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
