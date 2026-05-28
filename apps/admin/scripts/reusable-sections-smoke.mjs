#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_REUSABLE_SECTIONS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_REUSABLE_SECTIONS_CDP_PORT || 9387);
const SCREENSHOT_PATH = process.env.BACKY_REUSABLE_SECTIONS_SCREENSHOT || path.join(os.tmpdir(), 'backy-reusable-sections-smoke.png');
const RESPONSIVE_SCREENSHOT_DIR = process.env.BACKY_REUSABLE_SECTIONS_RESPONSIVE_SCREENSHOT_DIR || os.tmpdir();
const FRONTEND_SECTION_TEMPLATE_ID = 'smoke-section-contract-template';
const FRONTEND_SECTION_TEMPLATE_NAME = 'Smoke Frontend Hero Section';
let apiAdminSessionToken = '';

const RESPONSIVE_VIEWPORTS = [
  { key: 'mobile', width: 390, height: 900, expectedBreakpoint: 'mobile' },
  { key: 'tablet', width: 820, height: 1024, expectedBreakpoint: 'tablet' },
];

const RESPONSIVE_SCREENSHOT_THRESHOLDS = {
  minSampledPixels: 45000,
  minLumaRange: 90,
  minCanvasNonWhiteRatio: 0.003,
  minCanvasDarkRatio: 0.00045,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertReusableSectionsRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/reusable-sections.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Reusable sections route must use the shared EmptyState component for library empty states');
  assert(source.includes("'No reusable sections yet'"), 'Reusable sections empty state must distinguish a new library from filtered results');
  assert(source.includes('frontend handoff APIs'), 'Reusable sections empty state must explain the frontend handoff value');
  assert(source.includes("schemaVersion: 'backy.reusable-section-portable-pack.v1'"), 'Reusable sections route must expose the portable section pack contract');
  assert(source.includes("schemaVersion: 'backy.reusable-section-portability-readiness.v1'"), 'Reusable sections route must expose portability readiness evidence');
  assert(source.includes("schemaVersion: 'backy.reusable-section-portability-action-plan.v1'"), 'Reusable sections route must expose a copyable portability action plan');
  assert(source.includes('data-testid="reusable-section-portability-readiness-details"'), 'Reusable sections command center must expose collapsed portability readiness details');
  assert(source.includes('data-default-collapsed="true"'), 'Reusable sections portability readiness details must be collapsed by default');
  assert(source.includes('Show readiness') && source.includes('Hide readiness'), 'Reusable sections portability readiness disclosure must expose visible toggle labels');
  assert(source.includes('data-testid="reusable-section-portability-readiness"'), 'Reusable sections command center must render portability readiness');
  assert(source.includes('data-testid="reusable-section-portability-action-plan"'), 'Reusable sections command center must keep the portability action-plan copy control');
  assert(
    source.includes("const reusableSectionsCommandActionStatusId = 'reusable-sections-command-action-status';") &&
      source.includes("const reusableSectionsCommandSecondaryActionStatusId = 'reusable-sections-command-secondary-action-status';") &&
      source.includes("const reusableSectionsWorkflowActionStatusId = 'reusable-sections-workflow-action-status';") &&
      source.includes('data-testid="reusable-sections-command-action-status"') &&
      source.includes('data-testid="reusable-sections-command-secondary-action-status"') &&
      source.includes('data-testid="reusable-sections-primary-actions"') &&
      source.includes('data-testid="reusable-sections-command-create"') &&
      source.includes('data-testid="reusable-sections-workflow-action-status"') &&
      source.includes('data-testid="reusable-sections-copy-manifest"') &&
      source.includes('data-testid="reusable-sections-secondary-actions"') &&
      source.includes('aria-describedby={reusableSectionsCommandSecondaryActionStatusId}') &&
      source.includes('data-action-status={reusableSectionsCommandSecondaryActionStatus}') &&
      source.includes('data-testid="reusable-sections-more-actions"') &&
      source.includes('data-testid="reusable-sections-secondary-action-menu"') &&
      source.includes('data-testid="reusable-sections-command-refresh"') &&
      source.includes('data-testid="reusable-sections-workflow-export-visible"') &&
      source.includes('data-testid="reusable-sections-workflow-import"') &&
      source.includes('data-testid="reusable-section-workflow-dry-run"') &&
      source.includes('data-testid="reusable-section-workflow-refresh-instances"') &&
      source.includes('data-testid={`reusable-section-version-restore-${version.version}`}') &&
      source.includes('data-action-status={reusableSectionsCommandCopyManifestActionStatus}') &&
      source.includes('data-action-status={reusableSectionsCommandCopyPortabilityPlanActionStatus}') &&
      source.includes('data-action-status={reusableSectionsCommandExportVisibleActionStatus}') &&
      source.includes('data-action-status={reusableSectionsCommandImportActionStatus}') &&
      source.includes('data-action-status={actionStatus(') &&
      source.includes('data-action-state={actionStateFromDisabledReason('),
    'Reusable sections command/workflow controls must publish explicit action status, state, and stable hooks instead of relying on disabled styling',
  );
  const commandCenterStart = source.indexOf('data-testid="reusable-sections-command-center"');
  const commandCenterEnd = source.indexOf('<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">', commandCenterStart);
  const commandCenterSource = commandCenterStart >= 0 && commandCenterEnd > commandCenterStart
    ? source.slice(commandCenterStart, commandCenterEnd)
    : '';
  const createActionIndex = commandCenterSource.indexOf('data-testid="reusable-sections-command-create"');
  const refreshActionIndex = commandCenterSource.indexOf('data-testid="reusable-sections-command-refresh"');
  const moreActionsIndex = commandCenterSource.indexOf('data-testid="reusable-sections-more-actions"');
  const copyManifestIndex = commandCenterSource.indexOf('data-testid="reusable-sections-copy-manifest"');
  const importJsonIndex = commandCenterSource.indexOf('data-testid="reusable-sections-import"');
  assert(
    commandCenterSource.includes('data-testid="reusable-sections-primary-actions"') &&
      commandCenterSource.includes('data-testid="reusable-sections-secondary-actions"') &&
      commandCenterSource.includes('data-default-collapsed="true"') &&
      createActionIndex >= 0 &&
      refreshActionIndex > createActionIndex &&
      moreActionsIndex > refreshActionIndex &&
      copyManifestIndex > moreActionsIndex &&
      importJsonIndex > copyManifestIndex,
    'Reusable sections command center must prioritize Create section and Refresh before collapsed handoff actions',
  );
  assert(
    source.includes('data-testid="reusable-sections-workflows-details"') &&
      source.includes('data-testid="reusable-sections-workflow-panels"') &&
      source.includes('Portable exports, version restore, metadata, and synced-instance refreshes.') &&
      source.includes('Show workflows') &&
      source.includes('Hide workflows'),
    'Reusable sections import/version/instance workflows must live behind a default-collapsed disclosure so the default page prioritizes the editor and library',
  );
  assert(source.includes('title="No section versions yet"'), 'Reusable sections workflow must keep the empty version-history title visible');
  assert(source.includes('Save this reusable section or restore an imported version to start building a backend version history.'), 'Reusable sections empty version history must explain how versions are created');
  assert(source.includes('title="Version history not loaded"'), 'Reusable sections workflow must keep the unloaded version-history title visible');
  assert(source.includes('Load workflow state to inspect saved versions before restoring a captured section.'), 'Reusable sections unloaded version history must explain the next action');
  assert(source.includes('title="No frontend section templates captured"'), 'Reusable sections frontend contract panel must keep the empty template title visible');
  assert(source.includes('Save section templates in the connected frontend design contract to create reusable editor blocks'), 'Reusable sections frontend template empty state must explain how templates are captured');
  assert(source.includes('frontendDesignCustomJs'), 'Reusable sections frontend metadata must retain custom JS provenance for custom frontend hydration');
  assert(source.includes('frontendDesignContentDocument'), 'Reusable sections frontend metadata must retain the content-document snapshot');
  assert(source.includes('frontendDesignThemeTokenRefs'), 'Reusable sections frontend metadata must retain token-reference provenance');
  assert(source.includes('frontendDesignAnimations'), 'Reusable sections frontend metadata must retain animation provenance');
  assert(source.includes('frontendDesignInteractions'), 'Reusable sections frontend metadata must retain interaction provenance');
  assert(source.includes('frontendDesignDataBindings'), 'Reusable sections frontend metadata must retain data-binding provenance');
  assert(source.includes('frontendDesignEditableMap'), 'Reusable sections frontend metadata must retain editable-map provenance');
  assert(source.includes('frontendDesignSeo'), 'Reusable sections frontend metadata must retain SEO provenance');
  assert(source.includes('frontendDesignMetadata'), 'Reusable sections frontend metadata must retain template metadata provenance');
  assert(source.includes('const [sectionFormSubmitted, setSectionFormSubmitted] = useState(false);'), 'Reusable sections route must track submitted state for inline validation');
  assert(source.includes('const reusableSectionContentValidationError = (rawJson: string): string | null =>'), 'Reusable sections route must expose reusable content validation for inline errors');
  assert(source.includes('<form onSubmit={handleFormSubmit} className="space-y-4" noValidate>'), 'Reusable sections form must opt out of browser validation for custom inline errors');
  assert(source.includes('data-testid="reusable-section-name-error"'), 'Reusable sections route must render a stable name inline error');
  assert(source.includes('data-testid="reusable-section-content-error"'), 'Reusable sections route must render a stable content JSON inline error');
  assert(source.includes("setError('Fix required reusable section fields before saving.')"), 'Reusable sections route must block invalid saves with focused validation copy');
  assert(
    source.includes('const canUseReusableSectionRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseReusableSectionRoleDefaults;') &&
      source.includes('const isReusableSectionPermissionAllowed = (key: ReusableSectionPermissionKey) => (') &&
      source.includes("const canViewSections = isReusableSectionPermissionAllowed('pages.view');") &&
      source.includes("const canEditSections = isReusableSectionPermissionAllowed('pages.edit');") &&
      source.includes("const canDeleteSections = isReusableSectionPermissionAllowed('pages.delete');") &&
      source.includes('const isBusy = isLoading || isSaving || Boolean(isCreatingTemplateId);') &&
      !source.includes('const canViewSections = !isPermissionMatrixPending') &&
      !source.includes('const isBusy = isLoading || isSaving || Boolean(isCreatingTemplateId) || isPermissionMatrixPending;'),
    'Reusable sections permissions must keep role-default page-builder workflows usable while backend permission details hydrate.',
  );
  assert(/disabled=\{isBusy \|\| !canEditSections\}[\s\S]{0,500}data-testid="reusable-section-save"/.test(source), 'Reusable sections save button must stay reachable for custom inline validation');
  assert(source.includes('const actionState = (disabledReason: string) =>'), 'Reusable sections route must expose shared action-state semantics for controls');
  assert(source.includes('aria-label={`Actions for ${section.name}`}'), 'Reusable section cards must expose named action groups');
  assert(source.includes('data-testid={`reusable-section-actions-${section.id}`}'), 'Reusable section cards must expose a stable action-group hook');
  assert(source.includes('data-testid={`reusable-section-actions-status-${section.id}`}'), 'Reusable section cards must expose a stable hidden action status hook');
  assert(source.includes('data-action-status={sectionActionStatus}'), 'Reusable section cards must publish action status summaries');
  assert(source.includes('data-testid={`reusable-section-select-${section.id}`}'), 'Reusable section cards must expose a stable select/edit action hook');
  assert(source.includes('data-action-state={actionState(sectionOpenDisabledReason)}'), 'Reusable section select/edit actions must publish ready or blocked state');
  assert(source.includes('data-action-state={actionState(sectionDeleteDisabledReason)}'), 'Reusable section delete actions must publish ready or blocked state');
  assert(source.includes('data-disabled-reason={sectionDeleteDisabledReason || undefined}'), 'Reusable section delete actions must publish blocked reasons');
};

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

const requestApi = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const requestMethod = String(options.method || 'GET').toUpperCase();
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
          ...Object.fromEntries(headers.entries()),
        },
      });
      break;
    } catch (requestError) {
      const message = requestError instanceof Error ? `${requestError.message} ${(requestError.cause && typeof requestError.cause === 'object' && 'code' in requestError.cause) ? String(requestError.cause.code) : ''}` : '';
      if (requestMethod !== 'GET' || attempt === 2 || !/fetch failed|ECONNRESET|UND_ERR_SOCKET|ECONNREFUSED/.test(message)) {
        throw requestError;
      }
      await sleep(250 * (attempt + 1));
    }
  }

  assert(response, `${endpoint} did not return a response`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_REUSABLE_SECTIONS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE
    || 'backy-dev-mfa';
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const getFrontendDesign = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'PATCH',
    body: JSON.stringify({ frontendDesign }),
  });
  const updated = payload.data?.frontendDesign;
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Frontend design patch failed: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke reusable sections frontend',
    url: 'https://example.com/smoke-reusable-sections-frontend',
    repository: 'example/backy-smoke-reusable-sections-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      surface: '#f8fafc',
      text: '#111827',
      muted: '#475569',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-section-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeSectionsHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeSectionsNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeSectionsFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_SECTION_TEMPLATE_ID,
      type: 'section',
      name: FRONTEND_SECTION_TEMPLATE_NAME,
      routePattern: '/smoke-section',
      description: 'Frontend contract reusable section template used by the smoke test.',
      content: {
        name: 'Smoke contract hero section',
        slug: `smoke-contract-hero-section-${Date.now().toString(36)}`,
        description: 'Reusable hero section seeded from a connected custom frontend contract.',
        category: 'hero',
        tags: ['hero', 'smoke', 'frontend-contract'],
        canvasSize: { width: 1200, height: 540 },
        customCSS: '.smoke-contract-hero { color: var(--backy-smoke-section-primary); }',
        customJS: 'window.__backySmokeSectionHydrated = true;',
        contentDocument: {
          schemaVersion: 'backy.content.v1',
          id: 'smoke-section-content-document',
          kind: 'template',
          version: '1',
          elements: [
            {
              id: 'smoke-section-document-root',
              type: 'section',
              props: { content: 'Document snapshot for section template' },
              children: [],
            },
          ],
          editableMap: {},
          metadata: {
            canvasSize: { width: 1200, height: 540 },
            customJS: 'window.__backySmokeSectionDocument = true;',
          },
        },
        themeTokenRefs: {
          'smoke-section-root.backgroundColor': 'colors.surface',
          'smoke-section-heading.color': 'colors.text',
        },
        assets: [
          {
            id: 'smoke-section-asset',
            type: 'image',
            role: 'hero-background',
            alt: 'Reusable section smoke asset',
          },
        ],
        animations: [
          {
            id: 'smoke-section-intro',
            timeline: 'section-intro',
            targetElementId: 'smoke-section-root',
            trigger: 'load',
            keyframes: [
              { opacity: 0, transform: 'translateY(24px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
          },
        ],
        interactions: [
          {
            id: 'smoke-section-hover',
            trigger: 'hover',
            targetElementId: 'smoke-section-root',
            action: 'class.toggle',
            value: 'is-active',
          },
        ],
        dataBindings: {
          sectionHeading: {
            source: 'sections.smokeHero.heading',
            targetPath: 'elements.smoke-section-heading.props.content',
          },
        },
        editableMap: {
          'section.heading': {
            elementId: 'smoke-section-heading',
            targetPath: 'props.content',
            label: 'Hero heading',
          },
        },
        seo: {
          title: 'Smoke reusable section',
          description: 'Reusable section design provenance smoke template.',
        },
        metadata: {
          templateKind: 'reusable-section',
          importedFrom: 'smoke-frontend-design-contract',
        },
        elements: [
          {
            id: 'smoke-section-root',
            type: 'section',
            name: 'Smoke contract hero',
            x: 0,
            y: 0,
            width: 1200,
            height: 540,
            zIndex: 1,
            props: {
              content: 'Smoke contract hero section',
              className: 'smoke-contract-hero',
            },
            styles: {
              backgroundColor: '#f8fafc',
              color: '#111827',
              padding: 64,
            },
            children: [
              {
                id: 'smoke-section-heading',
                type: 'heading',
                name: 'Smoke contract hero heading',
                x: 72,
                y: 104,
                width: 760,
                height: 86,
                zIndex: 2,
                props: { content: 'Design-preserved backend section', level: 'h2' },
                styles: { fontFamily: 'Inter', fontSize: 52, fontWeight: 700, color: '#111827' },
              },
              {
                id: 'smoke-section-copy',
                type: 'paragraph',
                name: 'Smoke contract hero copy',
                x: 72,
                y: 216,
                width: 680,
                height: 112,
                zIndex: 2,
                props: { content: 'Backy should retain frontend section structure, tokens, chrome, and binding hints.' },
                styles: { fontFamily: 'Inter', fontSize: 18, lineHeight: 1.6, color: '#475569' },
              },
            ],
          },
        ],
      },
      bindingHints: [
        { role: 'section.root', binding: 'sections.smokeHero.root' },
        { role: 'section.heading', binding: 'sections.smokeHero.heading' },
        { role: 'section.copy', binding: 'sections.smokeHero.copy' },
      ],
    },
  ],
  editableMap: [
    { role: 'section.heading', binding: 'sections.smokeHero.heading', fields: ['content'] },
    { role: 'section.copy', binding: 'sections.smokeHero.copy', fields: ['content'] },
  ],
  notes: 'Temporary frontend design contract for reusable sections smoke validation.',
  updatedAt: new Date().toISOString(),
});

const listReusableSections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections?status=all`);
  return payload.data?.sections || payload.sections || [];
};

const deleteReusableSection = async (sectionId) => {
  if (!sectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, { method: 'DELETE' });
};

const exportReusableSections = async (sectionIds = []) => {
  const query = new URLSearchParams({ status: 'all' });
  if (sectionIds.length > 0) query.set('sectionIds', sectionIds.join(','));
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/export?${query.toString()}`);
  assert(payload.data?.export?.schemaVersion === 'backy.reusable-sections.export.v1', `Unexpected reusable section export: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
};

const updateReusableSection = async (sectionId, body) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return payload.data?.section;
};

const createDemoPageWithReusableSectionInstance = async (section, pageIds = []) => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Reusable section smoke page ${suffix}`,
      slug: `reusable-section-smoke-page-${suffix}`,
      status: 'draft',
      content: {
        elements: [
          {
            id: `smoke-instance-${suffix}`,
            type: 'section',
            name: 'Smoke reusable section instance',
            x: 0,
            y: 0,
            width: 1200,
            height: 520,
            zIndex: 1,
            props: {
              reusableSection: {
                mode: 'synced',
                sectionId: section.id,
                slug: section.slug,
                name: section.name,
                sourceUpdatedAt: '2000-01-01T00:00:00.000Z',
              },
            },
            styles: {},
            children: [],
          },
        ],
        canvasSize: { width: 1200, height: 520 },
      },
      seo: {},
    }),
  });
  const page = payload.data?.page;
  assert(page?.id, `Unable to create reusable section smoke page: ${JSON.stringify(payload).slice(0, 500)}`);
  pageIds.push(page.id);
  return page;
};

const createPreviewPageFromReusableSectionContent = async (section, pageIds = []) => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Reusable section responsive preview ${suffix}`,
      slug: `reusable-section-responsive-preview-${suffix}`,
      status: 'draft',
      content: {
        elements: section.content?.elements || [],
        canvasSize: section.content?.canvasSize || { width: 1200, height: 540 },
        customCSS: section.content?.customCSS || '',
      },
      seo: {},
    }),
  });
  const page = payload.data?.page;
  assert(page?.id, `Unable to create reusable section responsive preview page: ${JSON.stringify(payload).slice(0, 500)}`);
  pageIds.push(page.id);
  return page;
};

const deleteDemoPage = async (pageId) => {
  if (!pageId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
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
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
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
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
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

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
`;

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

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

const captureScreenshotData = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return {
    screenshotPath,
    data: screenshot.data,
  };
};

const assertScreenshotPixelThresholds = async (client, label, screenshotData) => {
  const metrics = await evaluate(client, `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${screenshotData}`)};
    await image.decode();

    const scale = Math.min(1, 360 / image.width, 360 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let nonWhitePixels = 0;
    let darkPixels = 0;
    let sampledPixels = 0;
    let minLuma = 255;
    let maxLuma = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 16) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
      sampledPixels += 1;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);

      if ((Math.abs(255 - red) + Math.abs(255 - green) + Math.abs(255 - blue)) > 36) {
        nonWhitePixels += 1;
      }

      if (luma < 190) {
        darkPixels += 1;
      }
    }

    return {
      width: image.width,
      height: image.height,
      sampledPixels,
      nonWhiteRatio: sampledPixels > 0 ? nonWhitePixels / sampledPixels : 0,
      darkRatio: sampledPixels > 0 ? darkPixels / sampledPixels : 0,
      minLuma: Math.round(minLuma),
      maxLuma: Math.round(maxLuma),
      lumaRange: Math.round(maxLuma - minLuma),
    };
  })()`);

  assert(metrics.sampledPixels >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minSampledPixels, `${label} screenshot sample was too small: ${JSON.stringify(metrics)}`);
  assert(metrics.nonWhiteRatio >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minCanvasNonWhiteRatio, `${label} screenshot appears visually blank: ${JSON.stringify(metrics)}`);
  assert(metrics.darkRatio >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minCanvasDarkRatio, `${label} screenshot is missing rendered text/detail contrast: ${JSON.stringify(metrics)}`);
  assert(metrics.lumaRange >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minLumaRange, `${label} screenshot is missing visual contrast range: ${JSON.stringify(metrics)}`);
  return metrics;
};

const requestPagePreview = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}/preview`, {
    method: 'POST',
    body: JSON.stringify({ ttlSeconds: 600 }),
  });
  const preview = payload.data || {};
  assert(preview.hostedUrl && preview.previewToken, `Unable to create page preview: ${JSON.stringify(payload).slice(0, 500)}`);
  return preview;
};

const openPublicPreviewTab = async (parentClient, url, viewport) => {
  const target = await parentClient.send('Target.createTarget', { url: 'about:blank' });
  const page = (await fetchJson('/json/list')).find((candidate) => candidate.id === target.targetId);
  assert(page?.webSocketDebuggerUrl, `No Chrome target found for public preview check ${target.targetId}`);

  const client = connectCdp(page.webSocketDebuggerUrl);
  await client.opened;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.expectedBreakpoint === 'mobile',
  });
  await client.send('Page.navigate', { url });
  return client;
};

const navigateToReusableSections = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/reusable-sections?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: Boolean(document.querySelector('[data-testid="reusable-sections-command-center"]')) &&
          Boolean(document.querySelector('[data-testid="reusable-sections-library"]')) &&
          Boolean(document.querySelector('[data-testid="reusable-sections-frontend-template-options"]')) &&
          Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)})) &&
          body.includes('Reusable section command center') &&
          body.includes(${JSON.stringify(FRONTEND_SECTION_TEMPLATE_NAME)}),
        body: body.slice(0, 1200),
        path: window.location.pathname,
        search: window.location.search,
      };
    })()`);

    if (state.ready) {
      return state;
    }

    if (attempt === 239) {
      throw new Error(`Reusable sections page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertReusableSectionsLayout = async (client) => {
  const layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    const portabilityDetails = document.querySelector('[data-testid="reusable-section-portability-readiness-details"]');
    const portabilityText = portabilityDetails?.textContent || '';
    const workflowDetails = document.querySelector('[data-testid="reusable-sections-workflows-details"]');
    const workflowText = workflowDetails?.textContent || '';
    const readAction = (testId) => {
      const element = document.querySelector('[data-testid="' + testId + '"]');
      return {
        testId,
        exists: element instanceof HTMLElement,
        describedBy: element?.getAttribute('aria-describedby') || '',
        state: element?.getAttribute('data-action-state') || '',
        status: element?.getAttribute('data-action-status') || '',
        reason: element?.getAttribute('data-disabled-reason') || '',
        targetSite: element?.getAttribute('data-target-site-id') || '',
        disabled: element instanceof HTMLButtonElement ? element.disabled : null,
      };
    };
    const commandStatus = document.querySelector('[data-testid="reusable-sections-command-action-status"]');
    const commandSecondaryStatus = document.querySelector('[data-testid="reusable-sections-command-secondary-action-status"]');
    const workflowStatus = document.querySelector('[data-testid="reusable-sections-workflow-action-status"]');
    const commandPrimaryActions = Array.from(document.querySelectorAll('[data-testid="reusable-sections-primary-actions"] button'))
      .map((button) => button.textContent?.replace(/\\s+/g, ' ').trim() || '');
    const commandPrimaryActionIds = Array.from(document.querySelectorAll('[data-testid="reusable-sections-primary-actions"] [data-testid]'))
      .map((element) => element.getAttribute('data-testid') || '')
      .filter(Boolean);
    const commandSecondaryDetails = document.querySelector('[data-testid="reusable-sections-secondary-actions"]');
    const commandSecondaryMenu = document.querySelector('[data-testid="reusable-sections-secondary-action-menu"]');
    const commandActions = [
      'reusable-sections-command-create',
      'reusable-sections-command-refresh',
      'reusable-section-portability-action-plan',
    ].map(readAction);
    const commandSecondaryActions = [
      'reusable-sections-copy-manifest',
      'reusable-sections-copy-portability-plan',
      'reusable-sections-export-visible',
      'reusable-sections-import',
    ].map(readAction);
    const workflowActions = [
      'reusable-sections-workflow-export-visible',
      'reusable-sections-export-selected',
      'reusable-sections-workflow-import',
      'reusable-section-workflow-load',
      'reusable-section-workflow-dry-run',
      'reusable-section-workflow-refresh-instances',
    ].map(readAction);
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="reusable-sections-command-center"]')),
      commandStatusId: commandStatus?.id || '',
      commandStatusText: commandStatus?.textContent?.trim() || '',
      commandSecondaryStatusId: commandSecondaryStatus?.id || '',
      commandSecondaryStatusText: commandSecondaryStatus?.textContent?.trim() || '',
      firstPrimaryCommandAction: commandPrimaryActions[0] || '',
      commandPrimaryActionIds,
      secondaryActionsCollapsed: commandSecondaryDetails instanceof HTMLDetailsElement &&
        commandSecondaryDetails.open === false &&
        commandSecondaryDetails.getAttribute('data-default-collapsed') === 'true',
      secondaryActionsDescribedBy: commandSecondaryDetails?.getAttribute('aria-describedby') || '',
      secondaryActionsState: commandSecondaryDetails?.getAttribute('data-action-state') || '',
      secondaryActionsStatus: commandSecondaryDetails?.getAttribute('data-action-status') || '',
      secondaryActionsTargetSite: commandSecondaryDetails?.getAttribute('data-target-site-id') || '',
      hasMoreActionsTrigger: Boolean(document.querySelector('[data-testid="reusable-sections-more-actions"]')),
      handoffActionsNested: ['reusable-sections-copy-manifest', 'reusable-sections-copy-portability-plan', 'reusable-sections-export-visible', 'reusable-sections-import']
        .every((testId) => Boolean(commandSecondaryMenu?.querySelector('[data-testid="' + testId + '"]'))),
      commandActions,
      commandSecondaryActions,
      portabilityReadinessCollapsed: portabilityDetails instanceof HTMLDetailsElement &&
        portabilityDetails.open === false &&
        portabilityDetails.getAttribute('data-default-collapsed') === 'true',
      hasPortabilityReadiness: Boolean(document.querySelector('[data-testid="reusable-section-portability-readiness"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-section-portability-action-plan"]')) &&
        portabilityText.includes('Portable section readiness') &&
        portabilityText.includes('Show readiness') &&
        portabilityText.includes('Copy action plan') &&
        portabilityText.includes('Detailed evidence for portable reusable-section exports'),
      hasFrontendTemplates: Boolean(document.querySelector('[data-testid="reusable-sections-frontend-template-options"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)})) &&
        body.includes('Frontend design sections') &&
        body.includes(${JSON.stringify(FRONTEND_SECTION_TEMPLATE_NAME)}),
      hasLibrary: Boolean(document.querySelector('[data-testid="reusable-sections-library"]')) &&
        body.includes('Section library'),
      hasEditor: body.includes('Create section') && body.includes('Content JSON'),
      hasVisualEditor: Boolean(document.querySelector('[data-testid="reusable-sections-visual-editor"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-section-canvas-editor"]')) &&
        Boolean(document.querySelector('[data-testid="editor-save-status"]')) &&
        body.includes('Visual section editor'),
      workflowCollapsed: workflowDetails instanceof HTMLDetailsElement &&
        workflowDetails.open === false &&
        workflowDetails.getAttribute('data-default-collapsed') === 'true',
      hasWorkflowPanel: Boolean(document.querySelector('[data-testid="reusable-sections-workflows"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-sections-workflow-panels"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-sections-export-visible"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-sections-import"]')) &&
        workflowText.includes('Import, versions, and instances') &&
        workflowText.includes('Show workflows') &&
        workflowText.includes('Instance propagation'),
      workflowStatusId: workflowStatus?.id || '',
      workflowStatusText: workflowStatus?.textContent?.trim() || '',
      workflowActions,
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Reusable sections page has horizontal overflow: ${JSON.stringify(layout)}`);
  const validActionStates = new Set(['ready', 'busy', 'blocked']);
  const actionContractOk = (statusId, action) => (
    action.exists &&
    action.describedBy === statusId &&
    validActionStates.has(action.state) &&
    action.status.length > 0 &&
    (action.disabled ? action.reason.length > 0 || action.state === 'busy' : action.state === 'ready')
  );
  assert(
    layout.hasCommandCenter && layout.portabilityReadinessCollapsed && layout.hasPortabilityReadiness && layout.hasFrontendTemplates && layout.hasLibrary && layout.hasEditor && layout.hasVisualEditor && layout.workflowCollapsed && layout.hasWorkflowPanel,
    `Reusable sections page missing expected regions: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.commandStatusId === 'reusable-sections-command-action-status' &&
      layout.commandStatusText.includes('Create section available.') &&
      layout.commandStatusText.includes('Copy manifest available.') &&
      layout.commandStatusText.includes('Refresh reusable sections available.') &&
      layout.firstPrimaryCommandAction === 'Create section' &&
      ['reusable-sections-copy-manifest', 'reusable-sections-copy-portability-plan', 'reusable-sections-export-visible', 'reusable-sections-import']
        .every((testId) => !layout.commandPrimaryActionIds.includes(testId)) &&
      layout.secondaryActionsCollapsed &&
      layout.hasMoreActionsTrigger &&
      layout.handoffActionsNested &&
      layout.commandActions.every((action) => actionContractOk(layout.commandStatusId, action)),
    `Reusable sections command actions are missing explicit ready/busy/blocked status: ${JSON.stringify(layout.commandActions)}`,
  );
  assert(
    layout.commandSecondaryStatusId === 'reusable-sections-command-secondary-action-status' &&
      layout.secondaryActionsDescribedBy === layout.commandSecondaryStatusId &&
      layout.secondaryActionsStatus === layout.commandSecondaryStatusText &&
      validActionStates.has(layout.secondaryActionsState) &&
      layout.secondaryActionsTargetSite === SITE_ID &&
      layout.commandSecondaryStatusText.includes('Copy manifest') &&
      layout.commandSecondaryStatusText.includes('Copy portability plan') &&
      layout.commandSecondaryStatusText.includes('Export visible reusable sections') &&
      layout.commandSecondaryStatusText.includes('Import JSON') &&
      layout.commandSecondaryActions.every((action) => (
        actionContractOk(layout.commandSecondaryStatusId, action) &&
        action.targetSite === SITE_ID &&
        layout.commandSecondaryStatusText.includes(action.status)
      )),
    `Reusable sections secondary command actions are missing aggregate ready/busy/blocked metadata: ${JSON.stringify(layout.commandSecondaryActions)}`,
  );
  assert(
    layout.workflowStatusId === 'reusable-sections-workflow-action-status' &&
      layout.workflowStatusText.includes('Export visible reusable sections available.') &&
      layout.workflowStatusText.includes('Load workflow state') &&
      layout.workflowActions.every((action) => actionContractOk(layout.workflowStatusId, action)),
    `Reusable sections workflow actions are missing explicit ready/busy/blocked status: ${JSON.stringify(layout.workflowActions)}`,
  );
  return layout;
};

const setReusableSectionField = async (client, testId, value) => evaluate(client, `(() => {
  const element = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return { ok: false, reason: 'field-missing', testId: ${JSON.stringify(testId)}, body: document.body?.innerText?.slice(0, 1200) || '' };
  }

  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
  descriptor?.set?.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
})()`);

const clickReusableSectionControl = async (client, testId) => evaluate(client, `(() => {
  const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!(button instanceof HTMLButtonElement)) {
    return { ok: false, reason: 'button-missing', testId: ${JSON.stringify(testId)}, body: document.body?.innerText?.slice(0, 1200) || '' };
  }
  if (button.disabled) return { ok: false, reason: 'button-disabled', testId: ${JSON.stringify(testId)} };
  button.click();
  return { ok: true };
})()`);

const waitForReusableSectionControlEnabled = async (client, testId, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
      return {
        exists: button instanceof HTMLButtonElement,
        disabled: button instanceof HTMLButtonElement ? button.disabled : true,
        body: document.body?.innerText?.slice(0, 1600) || '',
      };
    })()`);

    if (state.exists && !state.disabled) return state;
    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${label} control to become enabled`);
};

const waitForPageText = async (client, expectedText, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return { found: body.includes(${JSON.stringify(expectedText)}), body: body.slice(0, 1600) };
    })()`);

    if (state.found) return state;
    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${label}: ${expectedText}`);
};

const createManualReusableSectionThroughUi = async (client) => {
  const before = await listReusableSections();
  const beforeIds = new Set(before.map((section) => section.id));
  const suffix = Date.now().toString(36);
  const slug = `manual-smoke-section-${suffix}`;

  await waitForReusableSectionControlEnabled(client, 'reusable-section-reset', 'manual reusable section reset');
  const reset = await clickReusableSectionControl(client, 'reusable-section-reset');
  assert(reset.ok, `Unable to reset reusable section form: ${JSON.stringify(reset)}`);

  for (const [testId, value] of [
    ['reusable-section-name', `Manual smoke section ${suffix}`],
    ['reusable-section-slug', slug],
    ['reusable-section-category', 'manual-smoke'],
    ['reusable-section-description', 'Manual reusable section created by the smoke test.'],
    ['reusable-section-status', 'active'],
    ['reusable-section-tags', 'manual, smoke, starter'],
    ['reusable-section-content-json', '{"elements":[]}'],
  ]) {
    const changed = await setReusableSectionField(client, testId, value);
    assert(changed.ok, `Unable to set ${testId}: ${JSON.stringify(changed)}`);
  }

  const invalidSave = await clickReusableSectionControl(client, 'reusable-section-save');
  assert(invalidSave.ok, `Unable to submit invalid reusable section content: ${JSON.stringify(invalidSave)}`);
  await waitForPageText(client, 'Reusable section content must include at least one element.', 'manual JSON validation error');

  const starter = await clickReusableSectionControl(client, 'reusable-section-insert-starter');
  assert(starter.ok, `Unable to insert starter reusable section content: ${JSON.stringify(starter)}`);
  await waitForPageText(client, 'Starter section content inserted.', 'starter content message');

  const formatted = await clickReusableSectionControl(client, 'reusable-section-format-json');
  assert(formatted.ok, `Unable to format starter reusable section content: ${JSON.stringify(formatted)}`);
  await waitForPageText(client, '1 reusable root ready.', 'formatted content message');

  const saved = await clickReusableSectionControl(client, 'reusable-section-save');
  assert(saved.ok, `Unable to save manual reusable section: ${JSON.stringify(saved)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const created = sections.find((section) => !beforeIds.has(section.id) && section.slug === slug);

    if (created) {
      assert(created.name === `Manual smoke section ${suffix}`, `Manual section name was not saved: ${created.name}`);
      assert(created.category === 'manual-smoke', `Manual section category was not saved: ${created.category}`);
      assert(created.tags?.includes('starter'), `Manual section tags were not saved: ${JSON.stringify(created.tags)}`);
      assert(created.content?.elements?.length === 1, `Manual section starter element was not saved: ${JSON.stringify(created.content)}`);
      assert(created.content?.canvasSize?.width === 1200 && created.content?.canvasSize?.height === 520, `Manual section canvas size was not normalized: ${JSON.stringify(created.content?.canvasSize)}`);
      assert(typeof created.content?.customCSS === 'string', `Manual section custom CSS was not persisted: ${JSON.stringify(created.content)}`);
      return created;
    }

    await sleep(250);
  }

  throw new Error('Manual reusable section was not created');
};

const assertReusableSectionCardActionStatus = async (client, section) => {
  const state = await evaluate(client, `(() => {
    const group = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-actions-${section.id}"]`)});
    const status = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-actions-status-${section.id}"]`)});
    const select = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-select-${section.id}"]`)});
    const del = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-delete-${section.id}"]`)});
    return {
      hasGroup: group instanceof HTMLElement,
      role: group?.getAttribute('role') || '',
      label: group?.getAttribute('aria-label') || '',
      describedBy: group?.getAttribute('aria-describedby') || '',
      statusId: status?.id || '',
      statusText: status?.textContent?.trim() || '',
      dataStatus: group?.getAttribute('data-action-status') || '',
      selectState: select?.getAttribute('data-action-state') || '',
      selectReason: select?.getAttribute('data-disabled-reason') || '',
      selectDescribedBy: select?.getAttribute('aria-describedby') || '',
      deleteState: del?.getAttribute('data-action-state') || '',
      deleteReason: del?.getAttribute('data-disabled-reason') || '',
      deleteDescribedBy: del?.getAttribute('aria-describedby') || '',
      body: document.body?.innerText?.slice(0, 1600) || '',
    };
  })()`);

  assert(state.hasGroup, `Reusable section card is missing an action group: ${JSON.stringify(state)}`);
  assert(state.role === 'group', `Reusable section card actions must use role=group: ${JSON.stringify(state)}`);
  assert(state.label === `Actions for ${section.name}`, `Reusable section action group has the wrong accessible name: ${JSON.stringify(state)}`);
  assert(state.describedBy && state.describedBy === state.statusId, `Reusable section action group must describe itself with its hidden status: ${JSON.stringify(state)}`);
  assert(state.statusText.includes('Edit available.') && state.statusText.includes('Delete available.'), `Reusable section action status did not explain ready actions: ${JSON.stringify(state)}`);
  assert(state.dataStatus === state.statusText, `Reusable section action data status must mirror hidden text: ${JSON.stringify(state)}`);
  assert(state.selectState === 'ready' && !state.selectReason && state.selectDescribedBy === state.statusId, `Reusable section select action state is wrong: ${JSON.stringify(state)}`);
  assert(state.deleteState === 'ready' && !state.deleteReason && state.deleteDescribedBy === state.statusId, `Reusable section delete action state is wrong: ${JSON.stringify(state)}`);
  return state;
};

const assertReusableSectionsCommandCreateResetsEditor = async (client, section) => {
  const before = await evaluate(client, `(() => ({
    url: window.location.href,
    name: document.querySelector('[data-testid="reusable-section-name"]')?.value || '',
    sectionHeading: document.querySelector('#reusable-sections-editor')?.textContent || '',
  }))()`);
  assert(before.url.includes(`sectionId=${encodeURIComponent(section.id)}`) || before.sectionHeading.includes('Edit section'), `Reusable section should be selected before command create reset: ${JSON.stringify(before)}`);

  const clicked = await clickReusableSectionControl(client, 'reusable-sections-command-create');
  assert(clicked.ok, `Unable to click reusable sections command create: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const name = document.querySelector('[data-testid="reusable-section-name"]');
      const slug = document.querySelector('[data-testid="reusable-section-slug"]');
      const editor = document.querySelector('#reusable-sections-editor');
      return {
        url: window.location.href,
        nameValue: name instanceof HTMLInputElement ? name.value : null,
        slugValue: slug instanceof HTMLInputElement ? slug.value : null,
        focusedName: document.activeElement === name,
        editorText: editor?.textContent || '',
      };
    })()`);

    if (!state.url.includes('sectionId=') && state.nameValue === '' && state.slugValue === '' && state.focusedName && state.editorText.includes('Create section')) {
      return state;
    }
    await sleep(100);
  }

  throw new Error('Reusable sections command create did not clear the selected section, reset the form, and focus the name field');
};

const deleteReusableSectionThroughUi = async (client, section) => {
  const deleteTestId = `reusable-section-delete-${section.id}`;

  await assertReusableSectionCardActionStatus(client, section);

  const firstDelete = await clickReusableSectionControl(client, deleteTestId);
  assert(firstDelete.ok, `Unable to open reusable section delete confirmation: ${JSON.stringify(firstDelete)}`);

  await waitForPageText(client, 'Delete reusable section?', 'delete confirmation title');
  await waitForPageText(client, section.name, 'delete confirmation section name');

  const cancelled = await clickReusableSectionControl(client, 'reusable-section-delete-cancel');
  assert(cancelled.ok, `Unable to cancel reusable section deletion: ${JSON.stringify(cancelled)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      dialogOpen: Boolean(document.querySelector('[data-testid="reusable-section-delete-confirmation"]')),
      cardVisible: Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"]`)})),
    }))()`);
    if (!state.dialogOpen && state.cardVisible) break;
    if (attempt === 39) {
      throw new Error(`Reusable section delete cancel did not keep the section: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  const secondDelete = await clickReusableSectionControl(client, deleteTestId);
  assert(secondDelete.ok, `Unable to reopen reusable section delete confirmation: ${JSON.stringify(secondDelete)}`);
  const confirmed = await clickReusableSectionControl(client, 'reusable-section-delete-confirm');
  assert(confirmed.ok, `Unable to confirm reusable section deletion: ${JSON.stringify(confirmed)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const deleted = !sections.some((candidate) => candidate.id === section.id);
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        deleted: ${JSON.stringify(section.id)} && !document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"]`)}),
        hasNotice: body.includes(${JSON.stringify(`${section.name} deleted.`)}),
      };
    })()`);

    if (deleted && state.deleted && state.hasNotice) return true;
    await sleep(250);
  }

  throw new Error('Reusable section delete confirmation did not remove the section');
};

const createFrontendTemplateSectionThroughUi = async (client) => {
  const before = await listReusableSections();
  const beforeIds = new Set(before.map((section) => section.id));

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'frontend-template-button-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'frontend-template-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to create reusable section from frontend template: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const created = sections.find((section) => (
      !beforeIds.has(section.id) &&
      section.metadata?.frontendDesignTemplateId === FRONTEND_SECTION_TEMPLATE_ID
    ));

    if (created) {
      assert(created.name === 'Smoke contract hero section', `Frontend section name was not applied: ${created.name}`);
      assert(created.slug.startsWith('smoke-contract-hero-section'), `Frontend section slug was not applied: ${created.slug}`);
      assert(created.category === 'hero', `Frontend section category was not applied: ${created.category}`);
      assert(created.tags?.includes('frontend-contract'), `Frontend section tags were not applied: ${JSON.stringify(created.tags)}`);
      assert(created.metadata?.frontendDesignTemplateName === FRONTEND_SECTION_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignSource?.label === 'Smoke reusable sections frontend', `Frontend source snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignRoutePattern === '/smoke-section', `Frontend route pattern missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignChrome?.header?.component === 'SmokeSectionsHeader', `Frontend chrome snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignBindingHints) && created.metadata.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignCustomJs?.includes('__backySmokeSectionHydrated'), `Frontend custom JS provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignContentDocument?.schemaVersion === 'backy.content.v1', `Frontend content document provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignThemeTokenRefs?.['smoke-section-heading.color'] === 'colors.text', `Frontend theme-token refs missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignAssets) && created.metadata.frontendDesignAssets[0]?.id === 'smoke-section-asset', `Frontend asset provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignAnimations) && created.metadata.frontendDesignAnimations[0]?.timeline === 'section-intro', `Frontend animation provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignInteractions) && created.metadata.frontendDesignInteractions[0]?.trigger === 'hover', `Frontend interaction provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignDataBindings?.sectionHeading?.targetPath === 'elements.smoke-section-heading.props.content', `Frontend data-binding provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignEditableMap?.['section.heading']?.elementId === 'smoke-section-heading', `Frontend editable-map provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignSeo?.title === 'Smoke reusable section', `Frontend SEO provenance missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignMetadata?.templateKind === 'reusable-section', `Frontend template metadata missing: ${JSON.stringify(created.metadata)}`);
      assert(created.content?.canvasSize?.width === 1200 && created.content?.canvasSize?.height === 540, `Frontend canvas size was not retained: ${JSON.stringify(created.content?.canvasSize)}`);
      assert(created.content?.customCSS?.includes('smoke-contract-hero'), `Frontend custom CSS was not retained: ${created.content?.customCSS}`);
      assert(created.content?.customJS?.includes('__backySmokeSectionHydrated'), `Frontend custom JS was not retained: ${created.content?.customJS}`);
      assert(created.content?.contentDocument?.schemaVersion === 'backy.content.v1', `Frontend content document was not retained: ${JSON.stringify(created.content?.contentDocument)}`);
      assert(Array.isArray(created.content?.animations) && created.content.animations[0]?.timeline === 'section-intro', `Frontend animations were not retained: ${JSON.stringify(created.content?.animations)}`);
      assert(created.content?.themeTokenRefs?.['smoke-section-heading.color'] === 'colors.text', `Frontend theme-token refs were not retained: ${JSON.stringify(created.content?.themeTokenRefs)}`);
      assert(Array.isArray(created.content?.assets) && created.content.assets[0]?.id === 'smoke-section-asset', `Frontend assets were not retained: ${JSON.stringify(created.content?.assets)}`);
      assert(created.content?.dataBindings?.sectionHeading?.targetPath === 'elements.smoke-section-heading.props.content', `Frontend data bindings were not retained: ${JSON.stringify(created.content?.dataBindings)}`);
      assert(created.content?.editableMap?.['section.heading']?.elementId === 'smoke-section-heading', `Frontend editable map was not retained: ${JSON.stringify(created.content?.editableMap)}`);
      assert(created.content?.seo?.title === 'Smoke reusable section', `Frontend SEO was not retained: ${JSON.stringify(created.content?.seo)}`);
      assert(created.content?.metadata?.templateKind === 'reusable-section', `Frontend metadata was not retained: ${JSON.stringify(created.content?.metadata)}`);
      assert(created.content?.elements?.[0]?.id === 'smoke-section-root', `Frontend root element was not retained: ${JSON.stringify(created.content?.elements)}`);
      assert(created.content?.elements?.[0]?.children?.length === 2, `Frontend child elements were not retained: ${JSON.stringify(created.content?.elements?.[0]?.children)}`);
      return created;
    }

    await sleep(250);
  }

  throw new Error('Frontend template reusable section was not created');
};

const assertReusableSectionHostedResponsiveRender = async (parentClient, section, pageIds = []) => {
  const page = await createPreviewPageFromReusableSectionContent(section, pageIds);
  const preview = await requestPagePreview(page.id);
  const requiredElementIds = ['smoke-section-root', 'smoke-section-heading', 'smoke-section-copy'];
  const results = {};

  try {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      let publicClient = null;
      try {
        publicClient = await openPublicPreviewTab(parentClient, preview.hostedUrl, viewport);
        let renderState = null;

        for (let attempt = 0; attempt < 100; attempt += 1) {
          renderState = await evaluate(publicClient, `(() => {
            const root = document.querySelector('[data-backy-render-breakpoint]');
            const canvas = document.querySelector('.backy-canvas');
            const elements = Array.from(document.querySelectorAll('[data-element-id]'));
            const requiredElementIds = ${JSON.stringify(requiredElementIds)};
            const byId = new Map(elements.map((element) => [element.getAttribute('data-element-id'), element]));
            const requiredRects = requiredElementIds.map((id) => {
              const element = byId.get(id);
              const rect = element?.getBoundingClientRect();
              return {
                id,
                present: Boolean(element),
                width: Math.round(rect?.width || 0),
                height: Math.round(rect?.height || 0),
                left: Math.round(rect?.left || 0),
                top: Math.round(rect?.top || 0),
              };
            });
            const canvasRect = canvas?.getBoundingClientRect();
            const body = document.body?.innerText || '';
            return {
              viewport: { width: window.innerWidth, height: window.innerHeight },
              breakpoint: root?.getAttribute('data-backy-render-breakpoint') || '',
              renderScale: Number(root?.getAttribute('data-backy-render-scale') || 0),
              canvasScale: Number(document.querySelector('[data-backy-canvas-scale]')?.getAttribute('data-backy-canvas-scale') || 0),
              canvasWidth: Math.round(canvasRect?.width || 0),
              canvasHeight: Math.round(canvasRect?.height || 0),
              renderedElementCount: elements.length,
              missingElementIds: requiredRects.filter((rect) => !rect.present).map((rect) => rect.id),
              collapsedElementIds: requiredRects.filter((rect) => rect.present && (rect.width <= 0 || rect.height <= 0)).map((rect) => rect.id),
              requiredRects,
              horizontalOverflow: (document.documentElement?.scrollWidth || window.innerWidth) - window.innerWidth,
              hasFrontendHeading: body.includes('Design-preserved backend section'),
              hasFrontendCopy: body.includes('Backy should retain frontend section structure'),
              notFoundVisible: /not found|could not find|404/i.test(body),
              body: body.slice(0, 360),
            };
          })()`);

          if (
            renderState.breakpoint === viewport.expectedBreakpoint
            && renderState.renderedElementCount >= requiredElementIds.length
            && renderState.missingElementIds.length === 0
            && renderState.collapsedElementIds.length === 0
            && renderState.canvasWidth > 0
            && renderState.canvasHeight > 0
            && renderState.renderScale > 0
            && renderState.canvasScale > 0
            && renderState.horizontalOverflow <= 4
            && renderState.hasFrontendHeading
            && renderState.hasFrontendCopy
            && !renderState.notFoundVisible
          ) {
            break;
          }

          if (attempt === 99) {
            throw new Error(`Reusable section hosted ${viewport.key} preview did not render expected content: ${JSON.stringify(renderState)}`);
          }

          await sleep(200);
        }

        const screenshotPath = path.join(RESPONSIVE_SCREENSHOT_DIR, `backy-reusable-section-public-${viewport.key}.png`);
        const screenshot = await captureScreenshotData(publicClient, screenshotPath);
        const screenshotMetrics = await assertScreenshotPixelThresholds(
          publicClient,
          `Reusable section hosted ${viewport.key} preview`,
          screenshot.data,
        );

        results[viewport.key] = {
          ...renderState,
          screenshotPath,
          screenshotMetrics,
        };
      } finally {
        if (publicClient) {
          try {
            await publicClient.send('Page.close');
          } catch {
            // The target may already be closed by Chrome during cleanup.
          }
          publicClient.close();
        }
      }
    }
  } finally {
    await deleteDemoPage(page.id);
    const pageIndex = pageIds.indexOf(page.id);
    if (pageIndex !== -1) {
      pageIds.splice(pageIndex, 1);
    }
  }

  return {
    pageId: page.id,
    preview: {
      hostedUrl: preview.hostedUrl,
      renderUrl: preview.renderUrl,
      expiresAt: preview.expiresAt,
    },
    results,
  };
};

const exerciseReusableSectionWorkflows = async (client, section, pageIds = []) => {
  const visualSaved = await clickReusableSectionControl(client, 'editor-save-page');
  assert(visualSaved.ok, `Unable to save reusable section through visual editor: ${JSON.stringify(visualSaved)}`);
  await waitForPageText(client, `${section.name} saved from the visual editor.`, 'visual reusable section save notice');

  const exported = await exportReusableSections([section.id]);
  assert(exported.export.sectionCount === 1, `Selected reusable section export should contain one section: ${JSON.stringify(exported.export)}`);
  assert(exported.sections?.[0]?.slug === section.slug, `Selected reusable section export did not include expected slug: ${JSON.stringify(exported.sections?.[0])}`);

  const page = await createDemoPageWithReusableSectionInstance(section, pageIds);
  try {
    await evaluate(client, `(() => {
      const details = document.querySelector('[data-testid="reusable-sections-workflows-details"]');
      if (details instanceof HTMLDetailsElement) details.open = true;
    })()`);

    const workflowLoaded = await clickReusableSectionControl(client, 'reusable-section-workflow-load');
    assert(workflowLoaded.ok, `Unable to load reusable section workflow state: ${JSON.stringify(workflowLoaded)}`);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const body = document.body?.innerText || '';
        return {
          hasInstanceTotals: body.includes('1 stale') || body.includes('1\\nStale'),
          hasVersionHistory: body.includes('Version history') && body.includes('v1'),
          hasMetadataButton: Boolean(document.querySelector('[data-testid="reusable-section-metadata-save"]')),
          body: body.slice(0, 1800),
        };
      })()`);
      if (state.hasInstanceTotals && state.hasVersionHistory && state.hasMetadataButton) break;
      if (attempt === 99) {
        throw new Error(`Reusable section workflow state did not load: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }

    const workflowActionState = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="reusable-sections-workflow-action-status"]');
      const readAction = (testId) => {
        const element = document.querySelector('[data-testid="' + testId + '"]');
        return {
          testId,
          exists: element instanceof HTMLElement,
          describedBy: element?.getAttribute('aria-describedby') || '',
          state: element?.getAttribute('data-action-state') || '',
          status: element?.getAttribute('data-action-status') || '',
          reason: element?.getAttribute('data-disabled-reason') || '',
          disabled: element instanceof HTMLButtonElement ? element.disabled : null,
        };
      };
      return {
        statusId: status?.id || '',
        statusText: status?.textContent?.trim() || '',
        actions: [
          'reusable-section-workflow-load',
          'reusable-section-workflow-dry-run',
          'reusable-section-workflow-refresh-instances',
          'reusable-section-metadata-save',
        ].map(readAction),
        restoreActions: Array.from(document.querySelectorAll('[data-testid^="reusable-section-version-restore-"]')).map((element) => ({
          testId: element.getAttribute('data-testid') || '',
          describedBy: element.getAttribute('aria-describedby') || '',
          state: element.getAttribute('data-action-state') || '',
          status: element.getAttribute('data-action-status') || '',
          reason: element.getAttribute('data-disabled-reason') || '',
          disabled: element instanceof HTMLButtonElement ? element.disabled : null,
        })),
      };
    })()`);
    const validWorkflowActionStates = new Set(['ready', 'busy', 'blocked']);
    const workflowActionOk = (action) => (
      action.exists &&
      action.describedBy === workflowActionState.statusId &&
      validWorkflowActionStates.has(action.state) &&
      action.status.length > 0 &&
      (action.disabled ? action.reason.length > 0 || action.state === 'busy' : action.state === 'ready')
    );
    assert(
      workflowActionState.statusId === 'reusable-sections-workflow-action-status' &&
        workflowActionState.statusText.includes('Save metadata available.') &&
        workflowActionState.actions.every(workflowActionOk) &&
        workflowActionState.restoreActions.length > 0 &&
        workflowActionState.restoreActions.every((action) => action.describedBy === workflowActionState.statusId && validWorkflowActionStates.has(action.state) && action.status.length > 0),
      `Reusable section workflow controls did not expose complete action metadata: ${JSON.stringify(workflowActionState)}`,
    );

    const metadataSaved = await clickReusableSectionControl(client, 'reusable-section-metadata-save');
    assert(metadataSaved.ok, `Unable to save reusable section metadata: ${JSON.stringify(metadataSaved)}`);
    await waitForPageText(client, `${section.name} metadata saved.`, 'metadata save notice');

    const changed = await updateReusableSection(section.id, {
      name: section.name,
      content: {
        ...section.content,
        elements: [
          {
            ...section.content.elements[0],
            props: {
              ...(section.content.elements[0]?.props || {}),
              content: 'Reusable section smoke version changed',
            },
          },
        ],
      },
      updatedBy: 'smoke',
    });
    assert(changed?.id === section.id, `Unable to update reusable section for version smoke: ${JSON.stringify(changed)}`);

    await navigateToReusableSections(client);
    const selected = await evaluate(client, `(() => {
      const cardButton = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"] button`)});
      if (!(cardButton instanceof HTMLButtonElement)) return { ok: false, reason: 'section-card-button-missing' };
      cardButton.click();
      return { ok: true };
    })()`);
    assert(selected.ok, `Unable to reselect reusable section after version update: ${JSON.stringify(selected)}`);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const details = document.querySelector('[data-testid="reusable-sections-workflows-details"]');
        if (details instanceof HTMLDetailsElement) details.open = true;
        const body = document.body?.innerText || '';
        return {
          hasCurrentVersion: body.includes('v4 current'),
          hasPreviousVersion: body.includes('v3') && body.includes('v2') && body.includes('v1'),
          body: body.slice(0, 1800),
        };
      })()`);
      if (state.hasCurrentVersion && state.hasPreviousVersion) break;
      if (attempt === 99) {
        throw new Error(`Reusable section versions did not show update history: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }
  } finally {
    await deleteDemoPage(page.id);
    const pageIndex = pageIds.indexOf(page.id);
    if (pageIndex !== -1) {
      pageIds.splice(pageIndex, 1);
    }
  }
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-reusable-sections-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, sectionIds, pageIds, originalFrontendDesign }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) {
      childProcess.kill('SIGKILL');
    }
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  for (const pageId of pageIds || []) {
    if (pageId) {
      try {
        await deleteDemoPage(pageId);
      } catch {
        // Temporary smoke pages are deleted best-effort.
      }
    }
  }

  for (const sectionId of sectionIds || []) {
    if (sectionId) {
      try {
        await deleteReusableSection(sectionId);
      } catch {
        // Temporary smoke sections are deleted best-effort.
      }
    }
  }

  if (originalFrontendDesign) {
    try {
      await patchFrontendDesign(originalFrontendDesign);
    } catch {
      // Restore is best-effort so cleanup does not mask the primary failure.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  const sectionIds = [];
  const pageIds = [];
  let originalFrontendDesign;

  try {
    assertReusableSectionsRouteSourceContract();
    if (process.env.BACKY_REUSABLE_SECTIONS_SOURCE_ONLY === '1') {
      console.log(JSON.stringify({ ok: true, mode: 'source-only', route: 'reusable-sections' }, null, 2));
      return;
    }

    await loginAdminApi();
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1680,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToReusableSections(client);
    await assertReusableSectionsLayout(client);
    const manualSection = await createManualReusableSectionThroughUi(client);
    sectionIds.push(manualSection.id);
    await assertReusableSectionsCommandCreateResetsEditor(client, manualSection);
    await deleteReusableSectionThroughUi(client, manualSection);
    const deletedManualIndex = sectionIds.indexOf(manualSection.id);
    if (deletedManualIndex !== -1) {
      sectionIds.splice(deletedManualIndex, 1);
    }
    const section = await createFrontendTemplateSectionThroughUi(client);
    sectionIds.push(section.id);
    const hostedResponsiveRender = await assertReusableSectionHostedResponsiveRender(client, section, pageIds);
    await exerciseReusableSectionWorkflows(client, section, pageIds);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await Promise.all(sectionIds.splice(0).map((createdSectionId) => deleteReusableSection(createdSectionId)));
    await patchFrontendDesign(originalFrontendDesign);
    originalFrontendDesign = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      manualSectionId: manualSection.id,
      manualSectionSlug: manualSection.slug,
      frontendSectionId: section.id,
      frontendSectionSlug: section.slug,
      frontendTemplateId: FRONTEND_SECTION_TEMPLATE_ID,
      hostedResponsiveRender,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      sectionIds,
      pageIds,
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
