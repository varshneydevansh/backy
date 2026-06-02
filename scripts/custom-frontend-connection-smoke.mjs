#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const failures = [];
const warnings = [];
const checks = [];

const pass = (message) => checks.push(message);
const warn = (message) => warnings.push(message);
const fail = (message) => failures.push(message);

const rel = (file) => path.join(repoRoot, file);
const read = (file) => fs.readFileSync(rel(file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

const rootPackage = readJson('package.json');
const readme = read('README.md');
const agents = read('AGENTS.md');
const helpRoute = read('apps/admin/src/routes/help.tsx');
const handoffSpec = read('specs/custom-frontend-agent-handoff.md');
const starterSmoke = read('scripts/custom-frontend-starter-smoke.mjs');
const starterScaffold = read('scripts/scaffold-custom-frontend-starter.mjs');
const ensureSite = read('scripts/ensure-custom-frontend-site.mjs');
const starterConnectionProbe = read('examples/custom-frontend-next/src/app/api/backy-connection/route.ts');
const starterTemplateModule = read('apps/public/src/lib/customFrontendStarterProjectTemplate.ts');
const adminConnectionVerifierRoute = read('apps/public/src/app/api/admin/sites/[siteId]/custom-frontend/connection/route.ts');
const adminStarterExportRoute = read('apps/public/src/app/api/admin/sites/[siteId]/custom-frontend/starter/route.ts');
const adminSiteDetailRoute = read('apps/admin/src/routes/sites.$siteId.tsx');
const adminContentApi = read('apps/admin/src/lib/adminContentApi.ts');
const handoffSource = read('packages/core/src/custom-frontend-agent-handoff.ts');
const openApiRoute = read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts');
const manifestSchema = read('specs/ai-frontend-contract/frontend-manifest.schema.json');

const siteId =
  process.env.BACKY_CUSTOM_FRONTEND_SITE_ID ||
  process.env.NEXT_PUBLIC_BACKY_SITE_ID ||
  process.env.BACKY_SITE_ID ||
  'site-demo';
const apiBaseInput =
  process.env.BACKY_CUSTOM_FRONTEND_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKY_API_BASE_URL ||
  process.env.BACKY_PUBLIC_API_BASE_URL ||
  '';
const sitePublicHost =
  process.env.BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST ||
  process.env.NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST ||
  process.env.BACKY_SITE_PUBLIC_HOST ||
  '';
const siteIdPath = encodeURIComponent(siteId);
const frontendUrlInput =
  process.env.BACKY_CUSTOM_FRONTEND_URL ||
  process.env.NEXT_PUBLIC_BACKY_CUSTOM_FRONTEND_URL ||
  '';
const requireLiveApi = process.env.BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE === '1';
const requireFrontend = process.env.BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND === '1';
const requireProbe = process.env.BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE === '1';

const assert = (condition, message) => {
  if (condition) pass(message);
  else fail(message);
};

const includesAll = (text, snippets, label) => {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  assert(missing.length === 0, `${label}${missing.length ? ` missing: ${missing.join(', ')}` : ''}`);
};

assert(
  rootPackage.scripts?.['test:custom-frontend-connection'] ===
    'node scripts/custom-frontend-connection-smoke.mjs',
  'Root package exposes test:custom-frontend-connection',
);
assert(
  rootPackage.scripts?.['test:custom-frontend-control-plane'] ===
    'npm run test:custom-frontend-starter && npm run test:custom-frontend-connection && npm run test:vercel-production-readiness && npm run test:repo-public-hygiene',
  'Root package exposes the custom frontend control-plane launch gate',
);
assert(
  rootPackage.scripts?.['custom-frontend:materialize'] ===
    'node scripts/materialize-custom-frontend-starter.mjs',
  'Root package exposes custom-frontend:materialize',
);
assert(
  rootPackage.scripts?.['custom-frontend:scaffold'] ===
    'node scripts/scaffold-custom-frontend-starter.mjs',
  'Root package exposes custom-frontend:scaffold',
);
assert(
  rootPackage.scripts?.['custom-frontend:ensure-site'] ===
    'node scripts/ensure-custom-frontend-site.mjs',
  'Root package exposes custom-frontend:ensure-site',
);
assert(
  (rootPackage.scripts?.['test:partial-gate-preflights'] || '').includes(
    'npm run test:custom-frontend-connection',
  ),
  'Partial gate aggregate includes test:custom-frontend-connection',
);
includesAll(
  starterSmoke,
  [
    'data-backy-element-id',
    'data-backy-element-type',
    'data-backy-component-contract-pointer',
    'data-backy-editable-map-pointer',
    'data-backy-responsive-css',
    'data-backy-responsive-style-pointer',
    '/api/backy-connection',
    'subscribeNewsletter',
    'submitForm',
  ],
  'Starter smoke preserves API-addressable DOM, newsletter, and form boundaries',
);
includesAll(
  starterScaffold,
  [
    'backy.custom-frontend-starter-export.v1',
    'backy.custom-frontend-starter-project.v1',
    'backy.custom-frontend-scaffold.v1',
    'custom-frontend:materialize',
    'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1',
    'forbiddenPrivateEnv',
    '/sites?identifier=',
    '/render?path=/',
    '--skip-site-verify',
    'publicSiteVerification',
  ],
  'Starter scaffold CLI emits the same safe file-list export and verification boundaries',
);
includesAll(
  ensureSite,
  [
    'backy.custom-frontend-site-readiness.v1',
    'BACKY_CUSTOM_FRONTEND_ADMIN_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'Refusing --admin-key',
    'Refusing --service-role-key',
    '/api/admin/sites',
    '/rest/v1/',
    '/pages?includeUnpublished=true',
    '/render?path=/',
    'publicSiteVerification',
    '--frontend-url',
    'buildConnectedFrontendDesignContract',
    'buildDefaultCustomFrontendTemplates',
    'mergeDefaultCustomFrontendTemplates',
    "status: 'synced'",
    "type: 'custom-frontend'",
    'custom-frontend-page',
    'custom-frontend-blog-post',
    'custom-frontend-section',
    'frontendDesignStatus',
    'defaultTemplateIds',
    'buildDomainVerificationPatch',
    'NEXT_PUBLIC_BACKY_API_BASE_URL',
    'custom-frontend:scaffold',
  ],
  'Custom frontend site ensure CLI uses the protected admin boundary, preserves domain state, syncs deployed frontend design, seeds reusable templates, and prints safe frontend handoff',
);
includesAll(
  starterConnectionProbe,
  [
    'backy.custom-frontend-connection.v1',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1',
    'forbiddenEnvPresent',
    'includesSecretValues: false',
    'backy.custom-frontend-control-plane.v1',
    'agentHandoff: siteEndpoint("/agent-handoff")',
    'openapi: siteEndpoint("/openapi")',
    'renderHome: renderEndpoint("/")',
    'componentTypeContracts: "agent-handoff.componentApiContract.componentTypeContracts"',
    'propertyMap: "agent-handoff.componentApiContract.propertyMap"',
    'renderElements: "render.data.content.elements[]"',
    'editableMap: "render.data.editableMap"',
    'responsiveStyles: "render.generatedResponsiveCss"',
    'frontendDesign: "manifest.data.site.frontendDesign"',
    'backy.render("/")',
    'renderReachable: true',
    'data-backy-component-contract-pointer',
    'data-backy-editable-map-pointer',
    'data-backy-responsive-css',
    'data-backy-responsive-style-pointer',
    'templateReuse:',
    'templateRegistry:',
    'templateCloneFields:',
    'templateAliasField:',
    'templateAliasFields:',
    'adminEntryPoints:',
  ],
  'Starter exposes a public custom frontend connection probe without secret values',
);
includesAll(
  adminConnectionVerifierRoute,
  [
    'backy.admin-custom-frontend-connection-check.v1',
    'requireAdminAccess',
    'assertPublicFrontendUrl',
    'isPrivateAddress',
    'lookup(host',
    'a === 100 && b >= 64 && b <= 127',
    'a === 198 && (b === 18 || b === 19)',
    'a === 203 && b === 0 && c === 113',
    '/api/backy-connection',
    'data-backy-component-contract-pointer',
    'data-backy-editable-map-pointer',
    'data-backy-responsive-css',
    'data-backy-responsive-style-pointer',
    'forbiddenEnvPresent',
    'includesSecretValues',
  ],
  'Admin custom frontend verifier is protected, SSRF-aware, and checks probe plus DOM control attributes',
);
includesAll(
  adminStarterExportRoute,
  [
    'backy.custom-frontend-starter-export.v1',
    'backy.custom-frontend-starter-project.v1',
    'requireAdminAccess',
    'permission: "sites.view"',
    'CUSTOM_FRONTEND_STARTER_TEMPLATE_FILES',
    'CUSTOM_FRONTEND_STARTER_TEMPLATE_ROOT',
    'NEXT_PUBLIC_BACKY_API_BASE_URL',
    'BACKY_FRONTEND_STARTER.md',
    'STARTER_FILES_TO_PRESERVE',
    'src/app/api/backy-connection/route.ts',
    '/custom-frontend/connection',
    'starterProject',
    'starterProjectFiles',
    'fileCount',
    'copiedFiles',
    'materializerCommand',
    'scaffoldCommand',
    'custom-frontend:materialize',
    'custom-frontend:scaffold',
    'targetDirectoryPolicy',
    'pathSafety',
    'installCommand',
    'buildCommand',
    'forbiddenPrivateEnv',
    'cliCommand',
  ],
  'Admin custom frontend starter export is protected and returns safe env, bundled starter files, preserve list, and verification commands',
);
includesAll(
  starterTemplateModule,
  [
    'CUSTOM_FRONTEND_STARTER_TEMPLATE_FILES',
    'CUSTOM_FRONTEND_STARTER_TEMPLATE_ROOT',
    'examples/custom-frontend-next',
    'src/lib/backy-client.ts',
    'src/app/[[...path]]/page.tsx',
    'src/app/api/backy-connection/route.ts',
    'src/app/api/newsletter/route.ts',
    'src/app/api/backy-form/route.ts',
    'data-backy-component-contract-pointer',
    'data-backy-editable-map-pointer',
    'data-backy-responsive-css',
    'data-backy-responsive-style-pointer',
    'subscribeNewsletter',
    'submitForm',
  ],
  'Generated starter project template carries the self-contained custom frontend file list',
);
assert(
  !starterTemplateModule.includes('"path": ".next'),
  'Generated starter project template excludes local Next build artifacts',
);
includesAll(
  adminSiteDetailRoute,
  [
    'site-custom-frontend-connection-verifier',
    'site-custom-frontend-connection-url',
    'site-custom-frontend-connection-run',
    'site-custom-frontend-connection-result',
    'site-custom-frontend-download-starter',
    'site-custom-frontend-starter-error',
    'getSiteCustomFrontendStarterExport',
    'verifySiteCustomFrontendConnection',
    'backy.admin-custom-frontend-connection-check.v1',
    'backy.custom-frontend-starter-export.v1',
    'backy.custom-frontend-starter-project.v1',
    'data-starter-project-format="file-list"',
    'Download starter project',
    'site-copy-custom-frontend-scaffold-command',
    'site-custom-frontend-scaffold-command',
    'custom-frontend:scaffold',
    'File-list + materializer',
    '/api/backy-connection',
  ],
  'Site detail exposes an in-admin custom frontend starter project export and connection verifier',
);
includesAll(
  adminContentApi,
  [
    'AdminCustomFrontendConnectionVerification',
    'AdminCustomFrontendStarterExport',
    'verifySiteCustomFrontendConnection',
    '/custom-frontend/connection',
    'getSiteCustomFrontendStarterExport',
    '/custom-frontend/starter',
    "schemaVersion: 'backy.custom-frontend-starter-project.v1'",
    'fileCount?: number',
    'materializer?:',
  ],
  'Admin content API exposes the custom frontend starter export and connection verifier clients',
);
includesAll(
  readme,
  [
    'npm run test:custom-frontend-connection',
    'BACKY_CUSTOM_FRONTEND_API_BASE_URL',
    'BACKY_CUSTOM_FRONTEND_URL',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE',
  ],
  'README documents the custom frontend connection gate',
);
includesAll(
  agents,
  [
    'npm run test:custom-frontend-connection',
    'BACKY_CUSTOM_FRONTEND_API_BASE_URL',
    'BACKY_CUSTOM_FRONTEND_URL',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE',
  ],
  'AGENTS documents the custom frontend connection gate',
);
includesAll(
  handoffSpec,
  [
    'npm run test:custom-frontend-connection',
    'BACKY_CUSTOM_FRONTEND_API_BASE_URL',
    'BACKY_CUSTOM_FRONTEND_URL',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE',
  ],
  'Custom frontend handoff spec documents the connection gate',
);
includesAll(
  helpRoute,
  [
    'test:custom-frontend-connection',
    'BACKY_CUSTOM_FRONTEND_API_BASE_URL',
    'BACKY_CUSTOM_FRONTEND_URL',
    'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE',
    'Site Detail -> Separate custom frontend project -> Verify deployed frontend',
    'Site Detail -> Separate custom frontend project -> Download starter project',
    '/api/admin/sites/${siteId}/custom-frontend/connection',
    '/api/admin/sites/${siteId}/custom-frontend/starter',
    'backy.custom-frontend-starter-project.v1',
    'files[]=complete project file list',
    'Write every files[].path',
    'materializer.command=npm run custom-frontend:materialize',
    'ensureSite.command=npm run custom-frontend:ensure-site',
    'ensureSite requires a server-side operator credential',
    'ensureSite refuses --admin-key and --service-role-key command-line secrets',
    'scaffold.command=npm run custom-frontend:scaffold',
    'scaffold verifies public site discovery, manifest, and render before writing files',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_FRONTEND_STARTER.md',
    'preserveFiles',
    'verification.cliCommand',
    'data-backy-component-contract-pointer',
    'data-backy-editable-map-pointer',
    'data-backy-responsive-css',
    'data-backy-responsive-style-pointer',
    'forbidden private env names',
  ],
  'Help route exposes the custom frontend connection gate',
);
includesAll(
  handoffSource,
  ["customFrontendConnectionSmoke: 'npm run test:custom-frontend-connection'"],
  'Core agent handoff topology exposes the custom frontend connection gate',
);
includesAll(
  openApiRoute,
  ['customFrontendConnectionSmoke', 'const: "npm run test:custom-frontend-connection"'],
  'OpenAPI schema exposes the custom frontend connection gate',
);
includesAll(
  manifestSchema,
  ['"customFrontendConnectionSmoke": { "const": "npm run test:custom-frontend-connection" }'],
  'Manifest schema exposes the custom frontend connection gate',
);

const normalizeApiBaseUrl = (value) => {
  const trimmed = String(value || '').trim().replace(/\/+$/u, '');
  if (!trimmed) return '';
  const url = new URL(trimmed);
  const normalizedPath = url.pathname.replace(/\/+$/u, '');
  if (normalizedPath.endsWith('/api')) {
    url.pathname = normalizedPath;
  } else {
    url.pathname = `${normalizedPath}/api`.replace(/\/{2,}/gu, '/');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
};

const requestJson = async (url, label) => {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200) {
    fail(`${label} returned ${response.status}; body starts ${JSON.stringify(text.slice(0, 120))}`);
    return null;
  }
  if (!contentType.includes('application/json')) {
    fail(`${label} returned non-JSON content-type ${contentType || '<missing>'}`);
    return null;
  }
  try {
    const json = JSON.parse(text);
    Object.defineProperty(json, '__headers', {
      value: response.headers,
      enumerable: false,
    });
    return json;
  } catch (error) {
    fail(`${label} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const firstRenderElements = (renderData) => {
  const content = renderData?.content || {};
  const contentDocument = content?.contentDocument || {};
  if (Array.isArray(content.elements) && content.elements.length > 0) return content.elements;
  if (Array.isArray(contentDocument.elements) && contentDocument.elements.length > 0) {
    return contentDocument.elements;
  }
  return [];
};

const editableMapCount = (editableMap) => {
  if (Array.isArray(editableMap)) return editableMap.length;
  if (editableMap && typeof editableMap === 'object') return Object.keys(editableMap).length;
  return 0;
};

const queryUrl = (apiBaseUrl, pathname, query = {}) => {
  const url = new URL(`${apiBaseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
};

const findOpenApiOperation = (openapi, suffix) => (
  Object.entries(openapi.paths || {})
    .find(([pathKey]) => pathKey.endsWith(suffix))?.[1]?.get ||
  null
);

const assertTemplateActionability = (handoffData, label) => {
  const contentCreation = handoffData?.contentCreation || {};
  const endpoints = handoffData?.endpoints || {};
  const templateCloneFields = Array.isArray(contentCreation.templateCloneFields)
    ? contentCreation.templateCloneFields
    : [];
  const templateRouteAliases = Array.isArray(contentCreation.customFrontendRouteFieldAliases)
    ? contentCreation.customFrontendRouteFieldAliases
    : [];
  const adminEntryPoints = contentCreation.adminEntryPoints || {};

  assert(
    Array.isArray(templateCloneFields),
    `${label} exposes template clone fields for actionability`,
  );
  assert(
    templateCloneFields.includes('frontendDesignTemplateId'),
    `${label} uses frontendDesignTemplateId in template clone fields`,
  );
  assert(
    templateCloneFields.includes('designTemplateId'),
    `${label} keeps designTemplateId alias in template clone fields`,
  );
  assert(
    contentCreation.customFrontendTemplateField === 'frontendDesignTemplateId',
    `${label} exposes frontendDesignTemplateId as the custom frontend template field`,
  );
  assert(
    templateRouteAliases.includes('frontendDesignTemplateId'),
    `${label} exposes frontendDesignTemplateId route alias`,
  );
  assert(
    templateRouteAliases.includes('frontendTemplate'),
    `${label} exposes frontendTemplate route alias`,
  );
  assert(
    typeof endpoints.templates === 'string' &&
      endpoints.templates.includes(`/api/admin/sites/${siteIdPath}/templates`),
    `${label} exposes the template registry endpoint`,
  );
  assert(
    typeof contentCreation.adminEntryPoints === 'object' && contentCreation.adminEntryPoints !== null,
    `${label} exposes admin entry points for safe creation surfaces`,
  );

  const safeReuseRoutes = [
    { key: 'pageCustomFrontend', label: 'page' },
    { key: 'blogCustomFrontend', label: 'blog post' },
    { key: 'formCustomFrontend', label: 'form' },
    { key: 'productCustomFrontend', label: 'product' },
    { key: 'collectionCustomFrontend', label: 'collection' },
    { key: 'reusableSectionCustomFrontend', label: 'section' },
  ];
  for (const { key, label: routeLabel } of safeReuseRoutes) {
    const route = adminEntryPoints[key];
    assert(
      typeof route === 'string' &&
        /(templateSource=custom-frontend)|(frontendTemplate=:templateId)|(frontendDesignTemplateId=:templateId)/u.test(route),
      `${label} exposes an admin route to create a reusable ${routeLabel}`,
    );
  }
};

const assertTemplateClassCoverage = (frontendDesign, label) => {
  const templates = Array.isArray(frontendDesign?.templates) ? frontendDesign.templates : [];
  const requiredTemplateTypes = ['page', 'blogPost', 'section', 'form', 'product', 'collection'];
  const templateTypeSet = new Set(
    templates
      .map((template) => template?.type)
      .filter((type) => typeof type === 'string'),
  );
  for (const templateType of requiredTemplateTypes) {
    assert(
      templateTypeSet.has(templateType),
      `${label} exposes reusable ${templateType} templates for actionability`,
    );
  }
};

const checkPublicApi = async (apiBaseUrl) => {
  const encodedSiteId = encodeURIComponent(siteId);
  const renderQuery = { path: '/', ...(sitePublicHost ? { domain: sitePublicHost } : {}) };
  const resolveQuery = { path: '/', ...(sitePublicHost ? { domain: sitePublicHost } : {}) };

  const siteDiscovery = await requestJson(
    queryUrl(apiBaseUrl, '/sites', { identifier: siteId }),
    'custom frontend site discovery',
  );
  if (siteDiscovery) {
    const site = siteDiscovery.data?.site || siteDiscovery.site;
    assert(siteDiscovery.success === true, 'Public site discovery returns success=true');
    assert(Boolean(site?.id), 'Public site discovery returns site identity');
  }

  const agentHandoff = await requestJson(
    `${apiBaseUrl}/sites/${encodedSiteId}/agent-handoff`,
    'custom frontend agent-handoff',
  );
  if (agentHandoff) {
    const data = agentHandoff.data || {};
    const contract = data.componentApiContract || data.handoff?.componentApiContract || {};
    const topology = data.deploymentTopology || data.handoff?.deploymentTopology || {};
    const typeContracts = contract.componentTypeContracts;
    const typeContractCount = Array.isArray(typeContracts)
      ? typeContracts.length
      : Object.keys(typeContracts || {}).length;
    assert(agentHandoff.success === true, 'Agent handoff returns success=true');
    assert(
      data.schemaVersion === 'backy.custom-frontend-agent-handoff-response.v1',
      'Agent handoff exposes the response schema',
    );
    assert(contract.everyComponentApiAddressable === true, 'Agent handoff guarantees every component is API-addressable');
    assert(contract.everyElementApiAddressable === true, 'Agent handoff guarantees every element is API-addressable');
    assert(typeContractCount > 0, 'Agent handoff exposes component type contracts');
    assert(Boolean(data.apiAlignment?.readStart), 'Agent handoff exposes API alignment read start');
    assert(topology.schemaVersion === 'backy.deployment-topology.v1', 'Agent handoff exposes deployment topology schema');
    assert(
      Array.isArray(topology.projects?.customFrontend?.browserSafeEnv) &&
        topology.projects.customFrontend.browserSafeEnv.includes('NEXT_PUBLIC_BACKY_API_BASE_URL'),
      'Agent handoff exposes browser-safe custom frontend env boundary',
    );
    assert(
      topology.verification?.customFrontendConnectionSmoke === 'npm run test:custom-frontend-connection',
      'Agent handoff exposes the custom frontend connection smoke',
    );
    assertTemplateActionability(data, 'Agent handoff');
  }

  const manifest = await requestJson(
    `${apiBaseUrl}/sites/${encodedSiteId}/manifest`,
    'custom frontend manifest',
  );
  if (manifest) {
    assert(manifest.success === true, 'Manifest returns success=true');
    assert(manifest.data?.schemaVersion === 'backy.frontend-manifest.v1', 'Manifest exposes frontend manifest schema');
    const handoffData = manifest.data?.contract?.customFrontendAgentHandoff;
    assert(
      Boolean(handoffData),
      'Manifest mirrors the custom frontend agent handoff',
    );
    if (handoffData) {
      assertTemplateActionability(handoffData, 'Manifest handoff mirror');
    }
    const frontendDesign = manifest.data?.site?.frontendDesign;
    if (frontendDesign?.status === 'synced' || frontendDesign?.source?.type === 'custom-frontend') {
      assert(
        frontendDesign.source?.type === 'custom-frontend',
        'Synced manifest frontend design is sourced from the custom frontend',
      );
      assertTemplateClassCoverage(frontendDesign, 'Manifest frontendDesign');
    }
  }

  const openapi = await requestJson(
    `${apiBaseUrl}/sites/${encodedSiteId}/openapi`,
    'custom frontend OpenAPI',
  );
  if (openapi) {
    assert(openapi.openapi === '3.1.0', 'OpenAPI returns openapi=3.1.0');
    assert(Boolean(openapi['x-backy-custom-frontend-agent-handoff']), 'OpenAPI mirrors the custom frontend handoff');
    const renderOperation = findOpenApiOperation(openapi, '/render');
    const resolveOperation = findOpenApiOperation(openapi, '/resolve');
    const renderParameters = (renderOperation?.parameters || []).map((parameter) => `${parameter.in}:${parameter.name}`);
    const resolveParameters = (resolveOperation?.parameters || []).map((parameter) => `${parameter.in}:${parameter.name}`);
    assert(renderParameters.includes('query:domain'), 'OpenAPI render documents domain query context');
    assert(resolveParameters.includes('query:domain'), 'OpenAPI resolve documents domain query context');
  }

  const resolve = await requestJson(
    queryUrl(apiBaseUrl, `/sites/${encodedSiteId}/resolve`, resolveQuery),
    'custom frontend route resolve',
  );
  if (resolve) {
    assert(resolve.success === true, 'Resolve returns success=true');
    assert(Boolean(resolve.data?.route || resolve.data?.resolvedRoute || resolve.route), 'Resolve returns route data');
  }

  const render = await requestJson(
    queryUrl(apiBaseUrl, `/sites/${encodedSiteId}/render`, renderQuery),
    'custom frontend render',
  );
  if (render) {
    const elements = firstRenderElements(render.data);
    const firstElement = elements[0] || {};
    assert(render.success === true, 'Render returns success=true');
    assert(Boolean(render.data?.site?.id), 'Render returns site identity');
    assert(render.__headers?.get('x-backy-schema-version') === 'backy.content-payload.v1', 'Render returns the content payload schema header');
    assert(elements.length > 0, 'Render returns Backy content elements');
    assert(Boolean(firstElement.id), 'Render element exposes stable id');
    assert(Boolean(firstElement.type), 'Render element exposes stable type');
    assert(firstElement.props && typeof firstElement.props === 'object', 'Render element exposes props object');
    assert(editableMapCount(render.data?.editableMap || render.data?.content?.editableMap) > 0, 'Render exposes editable-map metadata');
  }
};

const checkFrontendDom = async (frontendUrl) => {
  const url = new URL(frontendUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'text/html' },
  });
  const html = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200) {
    fail(`Custom frontend URL returned ${response.status}; body starts ${JSON.stringify(html.slice(0, 120))}`);
    return;
  }
  if (!contentType.includes('text/html')) {
    fail(`Custom frontend URL returned non-HTML content-type ${contentType || '<missing>'}`);
    return;
  }
  includesAll(
    html,
    [
      'data-backy-site-id',
      'data-backy-route',
      'data-backy-element-id',
      'data-backy-element-type',
      'data-backy-component-contract-pointer',
      'data-backy-editable-map-pointer',
      'data-backy-responsive-css',
      'data-backy-responsive-style-pointer',
    ],
    'Custom frontend DOM preserves Backy control attributes',
  );
};

const checkFrontendProbe = async (frontendUrl, expectedApiBaseUrl) => {
  const probeUrl = new URL('/api/backy-connection', frontendUrl);
  const response = await fetch(probeUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  if (response.status === 404) {
    const message = 'Custom frontend does not expose /api/backy-connection probe.';
    if (requireProbe) fail(message);
    else warn(message);
    return;
  }
  if (response.status !== 200) {
    fail(`Custom frontend probe returned ${response.status}; body starts ${JSON.stringify(text.slice(0, 120))}`);
    return;
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    fail(`Custom frontend probe returned non-JSON content-type ${contentType || '<missing>'}`);
    return;
  }

  let probe;
  try {
    probe = JSON.parse(text);
  } catch (error) {
    fail(`Custom frontend probe did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const requiredAttributes = probe.domContract?.requiredAttributes || [];
  assert(probe.success === true, 'Custom frontend probe returns success=true');
  assert(
    probe.schemaVersion === 'backy.custom-frontend-connection.v1',
    'Custom frontend probe exposes the connection schema',
  );
  assert(probe.configured?.siteId === siteId, 'Custom frontend probe reports the expected Backy site id');
  if (expectedApiBaseUrl) {
    assert(
      String(probe.configured?.apiBaseUrl || '').replace(/\/+$/u, '') === expectedApiBaseUrl,
      'Custom frontend probe reports the expected Backy API base URL',
    );
  }
  if (sitePublicHost) {
    assert(
      probe.configured?.sitePublicHost === sitePublicHost,
      'Custom frontend probe reports the expected public host',
    );
  }
  assert(probe.backy?.manifestReachable === true, 'Custom frontend probe can reach Backy manifest');
  assert(probe.backy?.hasCustomFrontendHandoff === true, 'Custom frontend probe sees the Backy custom frontend handoff');
  if (probe.controlPlane) {
    assert(
      probe.controlPlane.schemaVersion === 'backy.custom-frontend-control-plane.v1',
      'Custom frontend probe exposes the custom frontend control-plane schema',
    );
    includesAll(
      (probe.controlPlane.readOrder || []).join('\n'),
      ['agent-handoff', 'manifest', 'templates', 'admin-endpoints', 'openapi', 'resolve', 'render', 'component-dom', 'probe'],
      'Custom frontend probe exposes the Backy control-plane read order',
    );
    const endpointText = JSON.stringify(probe.controlPlane.endpoints || {});
    includesAll(
      endpointText,
      [
        '/agent-handoff',
        '/manifest',
        `/api/admin/sites/${siteIdPath}/templates`,
        `/api/admin/sites/${siteIdPath}/frontend-design`,
        '/openapi',
        '/resolve',
        '/render',
        '/api/backy-connection',
      ],
      'Custom frontend probe exposes the Backy control-plane endpoints',
    );
    const pointerText = JSON.stringify(probe.controlPlane.pointers || {});
    includesAll(
      pointerText,
      [
        'agent-handoff.componentApiContract.componentTypeContracts',
        'agent-handoff.componentApiContract.propertyMap',
        'render.data.content.elements[]',
        'render.data.editableMap',
        'render.generatedResponsiveCss',
        'manifest.data.site.frontendDesign',
        'agent-handoff.deploymentTopology',
        'agent-handoff.endpoints.templates',
        'agent-handoff.contentCreation.templateCloneFields',
        'agent-handoff.contentCreation.customFrontendTemplateField',
        'agent-handoff.contentCreation.customFrontendRouteFieldAliases',
        'agent-handoff.contentCreation.adminEntryPoints',
      ],
      'Custom frontend probe exposes the Backy control-plane pointers',
    );
    assert(
      typeof probe.controlPlane.templateReuse === 'object' && probe.controlPlane.templateReuse !== null,
      'Custom frontend probe exposes template reuse metadata in the control-plane',
    );
    includesAll(
      JSON.stringify(probe.controlPlane.templateReuse || {}),
      [
        'agent-handoff.endpoints.templates',
        'agent-handoff.contentCreation.customFrontendTemplateField',
        'agent-handoff.contentCreation.templateCloneFields',
        'agent-handoff.contentCreation.adminEntryPoints',
      ],
      'Custom frontend probe exposes template reuse control-plane pointers',
    );
  } else {
    warn('Custom frontend probe does not expose the optional controlPlane block; regenerate from the latest starter before redesigning.');
  }
  assert(probe.boundaries?.includesSecretValues === false, 'Custom frontend probe declares no secret values');
  assert(
    Array.isArray(probe.boundaries?.forbiddenEnvPresent) &&
      probe.boundaries.forbiddenEnvPresent.length === 0,
    'Custom frontend probe reports no forbidden private env in the frontend deployment',
  );
  includesAll(
    requiredAttributes.join('\n'),
    [
      'data-backy-site-id',
      'data-backy-route',
      'data-backy-element-id',
      'data-backy-element-type',
      'data-backy-component-contract-pointer',
      'data-backy-editable-map-pointer',
      'data-backy-responsive-css',
      'data-backy-responsive-style-pointer',
    ],
    'Custom frontend probe documents Backy DOM control attributes',
  );
};

if (apiBaseInput) {
  try {
    await checkPublicApi(normalizeApiBaseUrl(apiBaseInput));
  } catch (error) {
    fail(`Custom frontend public API check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  const message =
    'BACKY_CUSTOM_FRONTEND_API_BASE_URL is not set; skipped live public API connection proof.';
  if (requireLiveApi) fail(message);
  else warn(message);
}

if (frontendUrlInput) {
  try {
    await checkFrontendProbe(frontendUrlInput, apiBaseInput ? normalizeApiBaseUrl(apiBaseInput) : '');
    await checkFrontendDom(frontendUrlInput);
  } catch (error) {
    fail(`Custom frontend deployed check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  const message =
    'BACKY_CUSTOM_FRONTEND_URL is not set; skipped deployed custom frontend DOM proof.';
  if (requireFrontend || requireProbe) fail(message);
  else warn(message);
}

console.log(`Backy custom frontend connection checks passed: ${checks.length}`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
