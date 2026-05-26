#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COLLECTIONS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COLLECTIONS_CDP_PORT || 9386);
const SCREENSHOT_PATH = process.env.BACKY_COLLECTIONS_SCREENSHOT || path.join(os.tmpdir(), 'backy-collections-smoke.png');
const FRONTEND_COLLECTION_TEMPLATE_ID = 'smoke-collection-contract';
const FRONTEND_COLLECTION_TEMPLATE_NAME = 'Smoke frontend directory';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertCollectionsRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/collections.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Collections route must use the shared EmptyState component for the primary no-collections state');
  assert(source.includes('title="No collections yet"'), 'Collections empty state must keep the no-collections title visible');
  assert(source.includes('reusable CMS data for pages, APIs, and custom frontends'), 'Collections empty state must explain what the first schema unlocks');
  assert(source.includes('data-testid="collections-error-state"') && source.includes('Collections workspace needs attention'), 'Collections route must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading collections"') && source.includes('Clear filters'), 'Collections backend error state must expose retry and filter recovery actions');
  assert(source.includes('data-testid="collections-permission-state"') && source.includes('Collection permissions could not be verified'), 'Collections route must expose a labelled permission error state');
  assert(source.includes('to="/users"') && source.includes('Review users'), 'Collections permission error state must link to user access management');
  assert(source.includes('data-testid="collections-rbac-permission-state"') && source.includes('aria-label="Retry loading collection permissions"'), 'Collections permission contract must expose a retryable permission error state');
  assert(
    source.includes('const canUseCollectionRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseCollectionRoleDefaults;') &&
      source.includes('return COLLECTION_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role);') &&
      source.includes("const canViewCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view');") &&
      source.includes("const canEditCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit');") &&
      source.includes("const canExportCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.export');") &&
      source.includes("const canDeleteCollections = isCollectionPermissionAllowed(permissionMatrix, currentAdmin, 'collections.delete');") &&
      source.includes("const canViewMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes("const canCreateMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.create', COLLECTION_MEDIA_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes('data-testid="collections-permission-sync-state"') &&
      source.includes('const pending = isPermissionMatrixPending;') &&
      !source.includes('const canViewCollections = !isPermissionMatrixPending') &&
      !source.includes('const canViewMedia = !isPermissionMatrixPending') &&
      !source.includes('const pending = isPermissionsLoading && !permissionMatrix;'),
    'Collections route must keep role-default collection and media workflows usable while permission details hydrate',
  );
  assert(
    source.includes('data-testid="collections-control-map-details"') &&
      source.includes('data-testid="collections-control-map"') &&
      source.includes('data-testid="collections-connected-workflows-details"') &&
      source.includes('data-testid="collections-connected-workflows"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Show map') &&
      source.includes('Hide map') &&
      source.includes('Show workflows') &&
      source.includes('Hide workflows') &&
      source.includes('Keep page, media, commerce, form, site, and API shortcuts available without stretching the schema workspace.'),
    'Collections command center must keep low-frequency maps and workflow shortcuts behind collapsed disclosures.',
  );
  assert(
    source.includes('data-testid="collections-audit-details"') &&
      source.includes('data-testid="collections-audit-panel"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Permission keys plus request-id-backed schema and record activity evidence.') &&
      source.includes('Show activity') &&
      source.includes('Hide activity'),
    'Collections audit and permission evidence must live behind a default-collapsed disclosure instead of stretching the default schema workspace.',
  );
  assert(
    source.includes("const collectionActionStatusId = 'collections-collection-action-status';") &&
      source.includes('const backupImportDisabledReason = isLoading') &&
      source.includes('const newCollectionActionStatus = newCollectionDisabledReason') &&
      source.includes('const backupImportActionStatus = backupImportDisabledReason') &&
      source.includes('const collectionActionStatus = `${newCollectionActionStatus} ${backupImportActionStatus}`;') &&
      source.includes('data-testid="collections-collection-action-status"') &&
      source.includes('data-action-status={newCollectionActionStatus}') &&
      source.includes('data-action-status={backupImportActionStatus}') &&
      source.includes('data-action-state={actionState(newCollectionDisabledReason || \'\')}') &&
      source.includes('data-action-state={actionState(backupImportDisabledReason)}') &&
      source.includes('data-disabled-reason={newCollectionDisabledReason || undefined}') &&
      source.includes('data-disabled-reason={backupImportDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId}') &&
      source.includes('disabled={Boolean(backupImportDisabledReason)}') &&
      source.includes('data-testid="collections-new-collection-button"') &&
      source.includes('data-testid="collections-library-new-collection-button"') &&
      source.includes('data-testid="collections-empty-new-collection-button"') &&
      source.includes('data-testid="collections-import-backup"') &&
      source.includes('data-testid="collections-import-backup-input"'),
    'Collections primary schema actions must expose shared ready/blocked status metadata for New collection and JSON backup import entry points.',
  );
  assert(source.includes('title="No collection activity yet"'), 'Collections audit panel must keep the empty activity title visible');
  assert(source.includes('Collection schema changes, record edits, imports, exports, and deletes will appear here for audit review.'), 'Collections audit empty state must explain which actions populate activity');
  assert(source.includes('title="No outgoing relationships"'), 'Collections relationship browser must keep the outgoing empty-state title visible');
  assert(source.includes('Add a reference or multi-reference field to connect this schema to another collection.'), 'Collections outgoing relationship empty state must explain how to connect schemas');
  assert(source.includes('title="No incoming relationships"'), 'Collections relationship browser must keep the incoming empty-state title visible');
  assert(source.includes('No saved collections currently point at this schema.'), 'Collections incoming relationship empty state must explain why the graph is empty');
  assert(source.includes('title="No list template capture history"'), 'Collections list template history must use a shared empty-state title');
  assert(source.includes('Capture a list canvas to create rollback-ready versions for generated collection index pages.'), 'Collections list template history empty state must explain the capture workflow');
  assert(source.includes('title="No item template capture history"'), 'Collections item template history must use a shared empty-state title');
  assert(source.includes('Capture an item canvas to create rollback-ready versions for generated collection detail pages.'), 'Collections item template history empty state must explain the capture workflow');
  assert(
      source.includes('customJS?: string;') &&
      source.includes('themeTokenRefs?: Record<string, string>;') &&
      source.includes('animations?: unknown[] | Record<string, unknown>;') &&
      source.includes('contentDocument?: Record<string, unknown>;') &&
      source.includes('authoredDynamicTemplateDesignStateSummary') &&
      source.includes('Design state') &&
      source.includes('editable targets'),
    'Collections authored dynamic templates must preserve and display rich custom frontend design state for list/detail pages',
  );
  assert(source.includes('data-testid="collections-slug-policy-controls"'), 'Collections schema editor must expose dynamic record slug policy controls');
  assert(source.includes('backy.collection-slug-policy.v1'), 'Collections metadata must persist a named slug policy contract');
  assert(source.includes('backy.collection-slug-policy-readiness.v1'), 'Collections route must compute slug policy readiness for dynamic routes');
  assert(source.includes('backy.collection-slug-policy-action-plan.v1'), 'Collections route must expose a copyable slug policy action plan');
  assert(
    source.includes('sourceField: sourceField?.key || null') &&
      source.includes('fallbackField: fallbackField?.key || null') &&
      source.includes('updateBehavior: slugPolicy.updateBehavior') &&
      source.includes("transform: 'lowercase-dashes'") &&
      source.includes("conflictStrategy: 'reject-duplicates'"),
    'Collections copied slug policy action plan must expose selected source/fallback fields, update behavior, transform, and duplicate strategy for custom frontends.',
  );
  assert(source.includes('data-testid="collections-slug-policy-copy-plan"'), 'Collections schema editor must expose a copy slug policy plan action');
  assert(source.includes('Slug policy'), 'Collections readiness must include slug policy status');
  assert(
    source.includes('listAllCollectionRecords') &&
      source.includes('const selectedRecordIdSet = useMemo') &&
      source.includes('const hiddenSelectedRecordCount = Math.max') &&
      source.includes('data-testid="collections-record-select-matching"') &&
      source.includes('data-testid="collections-record-bulk-selection-summary"') &&
      source.includes('data-testid="collections-record-bulk-clear-selection"') &&
      source.includes('outside this view'),
    'Collections record bulk toolbar must load/select every matching record and summarize hidden selected records before bulk mutations',
  );
  assert(
    source.includes('const actionState = (disabledReason: string) =>') &&
      source.includes('const recordBulkActionStatusId =') &&
      source.includes('data-testid="collections-record-bulk-action-status"') &&
      source.includes('data-action-status={recordBulkActionStatus}') &&
      source.includes('data-action-state={actionState(recordBulkEditDisabledReason)}') &&
      source.includes('data-action-state={actionState(recordBulkClearDisabledReason)}') &&
      source.includes('data-action-state={actionState(recordBulkDeleteDisabledReason)}') &&
      source.includes('data-testid="collections-record-bulk-delete"') &&
      source.includes('data-disabled-reason={recordBulkDeleteDisabledReason || undefined}'),
    'Collections record bulk toolbar must expose action-status, ready/blocked states, and disabled reasons for selected-record mutations',
  );
  assert(
    source.includes('const [recordFormSubmitted, setRecordFormSubmitted] = useState(false);') &&
      source.includes('const validateRecordFieldValue = (field: CollectionField, value: string): string | null =>') &&
      source.includes('<form id="collections-record-editor"') &&
      source.includes('noValidate') &&
      source.includes("setError('Fix collection record fields before saving.');") &&
      source.includes('data-testid="collections-record-save-button"') &&
      source.includes('disabled={recordMutationDisabled}') &&
      source.includes('data-testid="collections-record-scheduled-at-error"') &&
      source.includes('data-testid={`collections-record-field-error-${field.key}`}') &&
      source.includes('inlineError={recordFieldInlineErrors[field.key] || null}') &&
      source.includes("validateRecordFieldValue(field, recordForm.values[field.key] || '')") &&
      !source.includes('disabled={recordMutationDisabled || scheduledRecordMissingTime}'),
    'Collections record editor must use source-guarded inline validation with a reachable save action for scheduled time and schema field errors',
  );
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
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok || payload?.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload?.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const requestApiRaw = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  return {
    response,
    payload,
  };
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
  const smokeMfaCode = process.env.BACKY_COLLECTIONS_SMOKE_MFA_CODE
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

const createSite = async ({ name, slug }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary collections smoke workspace.',
      status: 'published',
    }),
  });
  const site = payload.data?.site || payload.site;
  assert(site?.id, `Create site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
};

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
};

const getSite = async (siteId = SITE_ID) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`);
  return payload.data?.site || payload.site;
};

const updateSite = async (siteId, input) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.site || payload.site;
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings;
};

const updateSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings;
};

const tryDeleteSite = async (siteId) => {
  if (!siteId) return;
  try {
    await deleteSite(siteId);
  } catch {
    // Temporary smoke sites are cleaned up when the active admin role allows it.
  }
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke collections frontend',
    url: 'https://example.com/smoke-collections-frontend',
    repository: 'example/backy-smoke-collections-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-collection-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeCollectionsHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeCollectionsNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeCollectionsFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_COLLECTION_TEMPLATE_ID,
      type: 'collection',
      name: FRONTEND_COLLECTION_TEMPLATE_NAME,
      routePattern: '/smoke-contract-directory/:recordSlug',
      description: 'Frontend contract collection template used by the collections smoke.',
      content: {
        name: 'Smoke contract directory',
        slug: `smoke-contract-directory-${Date.now().toString(36)}`,
        description: 'A directory schema seeded from the connected frontend design contract.',
        listRoutePattern: '/smoke-contract-directory',
        publicRead: true,
        publicCreate: true,
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
          { key: 'category', label: 'Category', type: 'select', required: true, options: ['Featured', 'Smoke', 'Reference'] },
          { key: 'summary', label: 'Summary', type: 'richText', required: false },
          { key: 'image', label: 'Image', type: 'image', required: false },
          { key: 'website', label: 'Website', type: 'url', required: false },
        ],
      },
      bindingHints: [
        { role: 'collection.list', binding: 'collections.smokeContractDirectory.records' },
        { role: 'collection.item.title', binding: 'record.title' },
        { role: 'collection.item.image', binding: 'record.image' },
      ],
    },
  ],
  editableMap: [
    { role: 'collection.list', binding: 'collections.smokeContractDirectory.records', fields: ['title', 'category', 'summary', 'image'] },
  ],
  notes: 'Temporary frontend design contract for collections smoke validation.',
  updatedAt: new Date().toISOString(),
});

const createCollection = async ({ name, slug, extraFields = [] }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke collection for dynamic frontend datasets.',
      status: 'published',
      routePattern: `/${slug}/:recordSlug`,
      listRoutePattern: `/${slug}`,
      permissions: {
        publicRead: true,
        publicCreate: true,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          unique: true,
          sortOrder: 10,
        },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          unique: false,
          sortOrder: 20,
          options: ['Smoke', 'Reference', 'Live'],
        },
        {
          key: 'summary',
          label: 'Summary',
          type: 'richText',
          required: false,
          unique: false,
          sortOrder: 30,
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
          required: false,
          unique: false,
          sortOrder: 40,
          defaultValue: false,
        },
        {
          key: 'website',
          label: 'Website',
          type: 'url',
          required: false,
          unique: false,
          sortOrder: 50,
        },
        ...extraFields,
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Create collection did not return a collection: ${JSON.stringify(payload).slice(0, 500)}`);
  return collection;
};

const deleteCollection = async (collectionId) => {
  if (!collectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
};

const deletePage = async (pageId) => {
  if (!pageId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
};

const createAuthoredTemplatePage = async ({ kind, suffix }) => {
  const isList = kind === 'list';
  const rootId = isList ? 'authored-dynamic-list-root' : 'authored-dynamic-item-root';
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Smoke authored ${kind} template ${suffix}`,
      slug: `smoke-authored-${kind}-template-${suffix}`,
      description: `Temporary authored ${kind} template for collections smoke.`,
      status: 'draft',
      content: {
        canvasSize: { width: 1200, height: 760 },
        elements: [
          {
            id: rootId,
            type: 'section',
            x: 0,
            y: 0,
            width: 1200,
            height: 680,
            props: { backgroundColor: '#ffffff' },
            styles: {},
            actions: [],
            dataBindings: [],
            children: isList
              ? [
                  {
                    id: 'authored-dynamic-list-title',
                    type: 'heading',
                    x: 72,
                    y: 72,
                    width: 720,
                    height: 72,
                    props: {
                      content: 'Authored collection list',
                      binding: 'collection.name',
                      level: 1,
                      fontSize: 48,
                      fontWeight: 800,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                  {
                    id: 'authored-dynamic-list-repeater',
                    type: 'repeater',
                    x: 72,
                    y: 192,
                    width: 1056,
                    height: 320,
                    props: {
                      binding: 'collection.records',
                      columns: 3,
                      gap: 16,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                ]
              : [
                  {
                    id: 'authored-dynamic-item-title',
                    type: 'heading',
                    x: 72,
                    y: 72,
                    width: 760,
                    height: 82,
                    props: {
                      content: 'Authored record title',
                      binding: 'record.title',
                      level: 1,
                      fontSize: 48,
                      fontWeight: 800,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                  {
                    id: 'authored-dynamic-item-summary',
                    type: 'text',
                    x: 76,
                    y: 176,
                    width: 720,
                    height: 96,
                    props: {
                      content: 'Authored record summary',
                      binding: 'record.summary',
                      fontSize: 18,
                      lineHeight: 1.6,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                ],
          },
        ],
      },
      meta: {
        title: `Smoke authored ${kind} template ${suffix}`,
        description: `Temporary authored ${kind} template for collections smoke.`,
      },
    }),
  });
  const page = payload.data?.page || payload.page;
  assert(page?.id, `Create authored ${kind} template page did not return a page: ${JSON.stringify(payload).slice(0, 500)}`);
  return page;
};

const createRecord = async ({ collectionId, slug, title }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records`, {
    method: 'POST',
    body: JSON.stringify({
      slug,
      status: 'draft',
      values: {
        title,
        category: 'Smoke',
        summary: 'Record created by the Collections smoke test.',
        featured: true,
        website: 'https://backy.local/smoke',
      },
    }),
  });
  const record = payload.data?.record || payload.record;
  assert(record?.id, `Create collection record did not return a record: ${JSON.stringify(payload).slice(0, 500)}`);
  return record;
};

const selectRecordForEdit = async (client, recordSlug) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const params = new URLSearchParams(window.location.search);
      const slugInput = document.querySelector('#collections-record-slug');
      const editor = document.querySelector('[data-testid="collections-record-editor"]');
      const editState = {
        hasEditMode: editor?.textContent?.includes('Edit record') || false,
        slugValue: slugInput instanceof HTMLInputElement ? slugInput.value : null,
        recordId: params.get('recordId'),
      };
      if (editState.hasEditMode && editState.slugValue === ${JSON.stringify(recordSlug)} && editState.recordId) {
        return { ok: true, settled: true, ...editState };
      }
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === ${JSON.stringify(recordSlug)}
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          reason: 'record-row-button-missing',
          ...editState,
          body: document.body?.innerText?.slice(0, 1000) || '',
        };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'record-row-button-disabled',
          ...editState,
          buttonText: button.textContent || '',
        };
      }
      button.scrollIntoView({ block: 'center' });
      button.click();
      return {
        ok: false,
        clicked: true,
        ...editState,
        buttonText: button.textContent || '',
      };
    })()`);
    if (state.ok && state.settled) return state;
    if (attempt === 79) {
      throw new Error(`Collection record edit state did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const fetchRecordBySlug = async (collectionId, recordSlug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  return records[0] || null;
};

const fetchCollections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`);
  return payload.data?.collections || payload.collections || [];
};

const fetchCollection = async (collectionId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`);
  return payload.data?.collection || payload.collection || null;
};

const assertCollectionBillingLimitEnforced = async (suffix) => {
  const site = await getSite();
  const settings = await getSettings();
  const existingCollections = await fetchCollections();
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedSlug = `blocked-collection-limit-${suffix}`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'block',
      },
    },
  });
  await updateSite(SITE_ID, {
    settings: {
      ...originalSiteSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          collections: existingCollections.length,
        },
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(`/api/admin/sites/${SITE_ID}/collections`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Blocked Collection Limit ${suffix}`,
        slug: blockedSlug,
        description: 'Temporary collection that should be blocked by billing quota.',
        status: 'draft',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
        ],
      }),
    });

    assert(response.status === 402, `Billing collection limit should reject collection creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_COLLECTION_LIMIT', `Billing collection limit should return BILLING_COLLECTION_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    const afterCollections = await fetchCollections();
    assert(!afterCollections.some((collection) => collection.slug === blockedSlug), 'Billing-limited collection creation unexpectedly persisted a collection.');
  } finally {
    await updateSite(SITE_ID, { settings: originalSiteSettings });
    await updateSettings({ integrations: originalIntegrations });
  }
};

const waitForRecordStatus = async (collectionId, recordSlug, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const record = await fetchRecordBySlug(collectionId, recordSlug);
    if (record?.status === status) {
      return record;
    }
    await sleep(250);
  }

  throw new Error(`Collection record ${recordSlug} did not reach status ${status}`);
};

const assertPublicRecord = async (collectionSlug, recordSlug) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/collections/${collectionSlug}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  assert(
    records.some((record) => record.slug === recordSlug && record.status === 'published'),
    `Public collection endpoint did not return published record ${recordSlug}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return records[0];
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

const navigate = async (client, url, readyExpression, description) => {
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const navigateToCollections = (client, { collectionId, recordSlug }) => {
  const params = new URLSearchParams({
    siteId: SITE_ID,
    collectionId,
    search: recordSlug,
  });

  return navigate(
    client,
    `${ADMIN_BASE_URL}/collections?${params.toString()}`,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="collections-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="collections-templates"]')) &&
        Boolean(document.querySelector('[data-testid="collections-audit-panel"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)})) &&
        document.body?.innerText?.includes('Collections command center') &&
        document.body?.innerText?.includes('Collections access and activity') &&
        document.body?.innerText?.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}) &&
        document.body?.innerText?.includes(${JSON.stringify(recordSlug)}),
      body: document.body?.innerText?.slice(0, 1200) || '',
      path: window.location.pathname,
      search: window.location.search,
    }))()`,
    'Collections page',
  );
};

const navigateToEmptyCollections = (client, siteId) => {
  const params = new URLSearchParams({ siteId });

  return navigate(
    client,
    `${ADMIN_BASE_URL}/collections?${params.toString()}`,
    `(() => {
      const body = document.body?.innerText || '';
      const params = new URLSearchParams(window.location.search);
      const emptyButton = document.querySelector('[data-testid="collections-empty-new-collection-button"]');
      return {
        ready: emptyButton instanceof HTMLButtonElement &&
          !emptyButton.disabled &&
          body.includes('No collections yet') &&
          params.get('siteId') === ${JSON.stringify(siteId)} &&
          params.get('draft') === null &&
          !document.querySelector('[data-testid="collections-draft-banner"]') &&
          !document.querySelector('[data-testid="collections-new-draft-state"]'),
        body: body.slice(0, 1200),
        path: window.location.pathname,
        search: window.location.search,
      };
    })()`,
    'Empty collections page',
  );
};

const assertCollectionsLayout = async (client, { collectionId, collectionName, collectionSlug, recordSlug, targetCollectionName, incomingCollectionName }) => {
  let layout = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    const relationshipText = document.querySelector('[data-testid="collections-relationship-browser"]')?.textContent || '';
    const authoringText = document.querySelector('[data-testid="collections-authoring-shortcuts"]')?.textContent || '';
    const listTemplateHistoryText = document.querySelector('[data-testid="collections-list-template-history"]')?.textContent || '';
    const itemTemplateHistoryText = document.querySelector('[data-testid="collections-item-template-history"]')?.textContent || '';
    const controlMapDetails = document.querySelector('[data-testid="collections-control-map-details"]');
    const connectedWorkflowsDetails = document.querySelector('[data-testid="collections-connected-workflows-details"]');
    const auditDetails = document.querySelector('[data-testid="collections-audit-details"]');
    const controlMapText = controlMapDetails?.textContent || '';
    const connectedWorkflowsText = connectedWorkflowsDetails?.textContent || '';
    const auditText = auditDetails?.textContent || '';
    const dynamicTemplateChecks = {
      hasControls: Boolean(document.querySelector('[data-testid="collections-dynamic-template-controls"]')),
      hasFrontendControl: Boolean(document.querySelector('[data-testid="collections-frontend-template-control"]')),
      hasFrontendSelect: Boolean(document.querySelector('[data-testid="collections-frontend-template-select"]')),
      hasPreviewControls: Boolean(document.querySelector('[data-testid="collections-template-preview-controls"]')),
      hasPreviewRecordSelect: Boolean(document.querySelector('[data-testid="collections-template-preview-record-select"]')),
      hasPreviewCopy: Boolean(document.querySelector('[data-testid="collections-template-preview-copy-render"]')),
      hasListHistory: Boolean(document.querySelector('[data-testid="collections-list-template-history"]')),
      hasItemHistory: Boolean(document.querySelector('[data-testid="collections-item-template-history"]')),
      hasCapturedTemplateText: body.includes('Captured frontend template'),
      hasPreviewRecordText: body.includes('Template preview record'),
      hasHistoryText: listTemplateHistoryText.includes('Template capture history') &&
        itemTemplateHistoryText.includes('Template capture history'),
      hasRenderItemText: body.includes('Render item API'),
      hasGeneratedTemplateText: body.includes('Use generated Backy templates'),
      hasFrontendTemplateName: body.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}),
    };
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      path: window.location.pathname,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="collections-command-center"]')),
      controlMapCollapsed: controlMapDetails instanceof HTMLDetailsElement &&
        controlMapDetails.open === false &&
        controlMapDetails.getAttribute('data-default-collapsed') === 'true',
      connectedWorkflowsCollapsed: connectedWorkflowsDetails instanceof HTMLDetailsElement &&
        connectedWorkflowsDetails.open === false &&
        connectedWorkflowsDetails.getAttribute('data-default-collapsed') === 'true',
      auditCollapsed: auditDetails instanceof HTMLDetailsElement &&
        auditDetails.open === false &&
        auditDetails.getAttribute('data-default-collapsed') === 'true',
      hasControlMap: Boolean(document.querySelector('[data-testid="collections-control-map"]')) &&
        controlMapText.includes('Collections control map') &&
        controlMapText.includes('Show map') &&
        controlMapText.includes('API delivery') &&
        controlMapText.includes('record operations'),
      hasConnectedWorkflows: Boolean(document.querySelector('[data-testid="collections-connected-workflows"]')) &&
        connectedWorkflowsText.includes('Connected data workflows') &&
        connectedWorkflowsText.includes('Show workflows') &&
        connectedWorkflowsText.includes('commerce objects') &&
        connectedWorkflowsText.includes('runtime API delivery'),
      hasTemplates: Boolean(document.querySelector('[data-testid="collections-templates"]')),
      hasFrontendTemplates: Boolean(document.querySelector('[data-testid="collections-frontend-template-options"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)})) &&
        body.includes('Frontend design collections') &&
        body.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}),
      hasApiContract: body.includes('Collection API contract') &&
        body.includes('Public records') &&
        body.includes('Bulk records') &&
        body.includes('JSON backup export') &&
        body.includes('JSON backup import') &&
        Boolean(document.querySelector('[data-testid="collections-export-backup"]')) &&
        Boolean(document.querySelector('[data-testid="collections-import-backup"]')) &&
        Boolean(document.querySelector('[data-testid="collections-import-backup-input"]')),
      collectionActionStatus: (() => {
        const status = document.querySelector('[data-testid="collections-collection-action-status"]');
        const header = document.querySelector('[data-testid="collections-new-collection-button"]');
        const library = document.querySelector('[data-testid="collections-library-new-collection-button"]');
        const backup = document.querySelector('[data-testid="collections-import-backup"]');
        const backupInput = document.querySelector('[data-testid="collections-import-backup-input"]');
        return {
          statusId: status?.id || '',
          statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim(),
          headerDescribedBy: header?.getAttribute('aria-describedby') || '',
          headerStatus: header?.getAttribute('data-action-status') || '',
          headerState: header?.getAttribute('data-action-state') || '',
          headerTargetSite: header?.getAttribute('data-target-site-id') || '',
          libraryDescribedBy: library?.getAttribute('aria-describedby') || '',
          libraryStatus: library?.getAttribute('data-action-status') || '',
          libraryState: library?.getAttribute('data-action-state') || '',
          backupDescribedBy: backup?.getAttribute('aria-describedby') || '',
          backupStatus: backup?.getAttribute('data-action-status') || '',
          backupState: backup?.getAttribute('data-action-state') || '',
          backupTargetSite: backup?.getAttribute('data-target-site-id') || '',
          backupInputState: backupInput?.getAttribute('data-action-state') || '',
          backupInputDisabled: backupInput instanceof HTMLInputElement ? backupInput.disabled : null,
        };
      })(),
      hasFrontendContract: body.includes('Dynamic data frontend contract') && body.includes('Frontend wiring'),
      hasBindingContract: Boolean(document.querySelector('[data-testid="collections-binding-contract"]')) &&
        body.includes('Editor data-binding contract') &&
        body.includes('Repeater/list sections') &&
        body.includes('Public write flows'),
      hasAuthoringShortcuts: Boolean(document.querySelector('[data-testid="collections-authoring-shortcuts"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-repeater"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-binding"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-list-brief"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-item-brief"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-open-list-builder"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-open-item-builder"]')) &&
        Boolean(document.querySelector('[data-testid="collections-list-authored-template"]')) &&
        Boolean(document.querySelector('[data-testid="collections-item-authored-template"]')) &&
        Boolean(document.querySelector('[data-testid="collections-list-authored-template-select"]')) &&
        Boolean(document.querySelector('[data-testid="collections-item-authored-template-select"]')) &&
        Boolean(document.querySelector('[data-testid="collections-list-template-compare"]')) &&
        Boolean(document.querySelector('[data-testid="collections-item-template-compare"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-write-policy"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-write-policy-mode"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-mutation-policy"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-write-token"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-update-policy-mode"]')) &&
        Boolean(document.querySelector('[data-testid="collections-public-update-toggle"]')) &&
        Boolean(document.querySelector('[data-testid="collections-public-delete-toggle"]')) &&
        body.includes('Visitor update/delete policy') &&
        body.includes('Public write token') &&
        authoringText.includes('Dataset authoring shortcuts') &&
        authoringText.includes(${JSON.stringify(`dataset_${collectionId}`)}) &&
        authoringText.includes('Copy repeater preset') &&
        authoringText.includes('Copy field binding') &&
        authoringText.includes('Open list builder') &&
        authoringText.includes('Open item builder') &&
        authoringText.includes('/pages/new?siteId='),
      hasRelationshipBrowser: Boolean(document.querySelector('[data-testid="collections-relationship-browser"]')) &&
        Boolean(document.querySelector('[data-testid="collections-relationship-outgoing"]')) &&
        Boolean(document.querySelector('[data-testid="collections-relationship-incoming"]')) &&
        relationshipText.includes('Relationship browser') &&
        relationshipText.includes('Outgoing references') &&
        relationshipText.includes('Incoming references') &&
        relationshipText.includes(${JSON.stringify(targetCollectionName)}) &&
        relationshipText.includes(${JSON.stringify(incomingCollectionName)}) &&
        relationshipText.includes('related_target') &&
        relationshipText.includes('Directory reference'),
      hasDynamicTemplateControl: Object.values(dynamicTemplateChecks).every(Boolean),
      hasAuditPanel: Boolean(document.querySelector('[data-testid="collections-audit-panel"]')) &&
        Boolean(document.querySelector('[data-testid="collections-permission-contract"]')) &&
        Boolean(document.querySelector('[data-testid="collections-audit-list"]')) &&
        auditText.includes('Collections access and activity') &&
        auditText.includes('Show activity') &&
        auditText.includes('collections.view') &&
        auditText.includes('collections.edit') &&
        auditText.includes('Collection created') &&
        auditText.includes('Collection record created'),
      hasBuilder: body.includes('Schema builder') && body.includes('Public read') && body.includes('Visitor create'),
      hasRecords: body.includes('Records') && body.includes('Import CSV') && body.includes('Export CSV') && body.includes('New record'),
      hasCollection: body.includes(${JSON.stringify(collectionName)}) && body.includes(${JSON.stringify(`/${collectionSlug}`)}),
      hasRecord: body.includes(${JSON.stringify(recordSlug)}) && body.includes(${JSON.stringify(`/${collectionSlug}/${recordSlug}`)}),
      hasFieldControls: body.includes('Title') && body.includes('Category') && body.includes('Featured') && body.includes('Website'),
      hasSelectionControl: Boolean(Array.from(document.querySelectorAll('input')).find((input) => (
        (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
      ))),
      relationshipText,
      authoringText,
      dynamicTemplateChecks,
    };
    })()`);

    assert(layout.scrollWidth <= layout.width + 8, `Collections page has horizontal overflow: ${JSON.stringify(layout)}`);
    const layoutReady = layout.path === '/collections' &&
      layout.hasCommandCenter &&
      layout.controlMapCollapsed &&
      layout.connectedWorkflowsCollapsed &&
      layout.auditCollapsed &&
      layout.hasControlMap &&
      layout.hasConnectedWorkflows &&
      layout.hasTemplates &&
      layout.hasFrontendTemplates &&
      layout.hasApiContract &&
      layout.hasFrontendContract &&
      layout.hasBindingContract &&
      layout.hasAuthoringShortcuts &&
      layout.hasRelationshipBrowser &&
      layout.hasDynamicTemplateControl &&
      layout.hasAuditPanel &&
      layout.hasBuilder &&
      layout.hasRecords &&
      layout.hasCollection &&
      layout.hasRecord &&
      layout.hasFieldControls &&
      layout.hasSelectionControl;
    const collectionActionReady = layout.collectionActionStatus.statusId === 'collections-collection-action-status' &&
      layout.collectionActionStatus.statusText.includes('New collection available') &&
      layout.collectionActionStatus.statusText.includes('Import JSON available') &&
      layout.collectionActionStatus.headerDescribedBy.includes(layout.collectionActionStatus.statusId) &&
      layout.collectionActionStatus.headerStatus.includes('New collection available') &&
      layout.collectionActionStatus.headerState === 'ready' &&
      layout.collectionActionStatus.headerTargetSite === SITE_ID &&
      layout.collectionActionStatus.libraryDescribedBy.includes(layout.collectionActionStatus.statusId) &&
      layout.collectionActionStatus.libraryStatus === layout.collectionActionStatus.headerStatus &&
      layout.collectionActionStatus.libraryState === 'ready' &&
      layout.collectionActionStatus.backupDescribedBy === layout.collectionActionStatus.statusId &&
      layout.collectionActionStatus.backupStatus.includes('Import JSON available') &&
      layout.collectionActionStatus.backupState === 'ready' &&
      layout.collectionActionStatus.backupTargetSite === SITE_ID &&
      layout.collectionActionStatus.backupInputState === 'ready' &&
      layout.collectionActionStatus.backupInputDisabled === false;
    if (layoutReady && collectionActionReady) {
      return layout;
    }
    await sleep(250);
  }

  throw new Error(`Collections page missing expected regions: ${JSON.stringify(layout)}`);
};

const assertAuthoringShortcutCopy = async (client) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="collections-authoring-copy-repeater"]');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'authoring-copy-button-missing' };
      }
      if (button.disabled) return { ok: false, reason: 'authoring-copy-button-disabled' };
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to use authoring shortcut copy action: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: body.includes('Repeater dataset preset copied.') ||
          (body.includes('backy.dataset-authoring.v1') && body.includes('collection-repeater')),
        body: body.slice(0, 1200),
      };
    })()`);
    if (state.ready) return state;
    await sleep(100);
  }

  throw new Error('Authoring shortcut copy action did not surface copied preset feedback');
};

const assertCollectionBackupControls = async (client, collectionId) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const exportClicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="collections-export-backup"]');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'backup-export-button-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (button.disabled) return { ok: false, reason: 'backup-export-button-disabled' };
      button.click();
      return { ok: true };
    })()`);
    if (exportClicked.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to click collection JSON backup export: ${JSON.stringify(exportClicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: (document.body?.innerText || '').includes('Collections JSON backup exported'),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.ready) break;
    if (attempt === 39) {
      throw new Error(`Collection JSON backup export did not show feedback: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const backupPayload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/export?ids=${encodeURIComponent(collectionId)}`);
  const backup = backupPayload.data;
  assert(backup?.backup?.schemaVersion === 'backy.collections.backup.v1', `Backup API missing schema version: ${JSON.stringify(backupPayload).slice(0, 500)}`);
  assert(backup.collections?.length === 1, `Backup API expected one collection: ${JSON.stringify(backupPayload).slice(0, 500)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const importState = await evaluate(client, `(() => {
      const input = document.querySelector('[data-testid="collections-import-backup-input"]');
      const button = document.querySelector('[data-testid="collections-import-backup"]');
      const status = document.querySelector('[data-testid="collections-collection-action-status"]');
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false, reason: 'backup-import-input-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      const actionState = {
        statusId: status?.id || '',
        statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim(),
        inputDescribedBy: input.getAttribute('aria-describedby') || '',
        inputStatus: input.getAttribute('data-action-status') || '',
        inputState: input.getAttribute('data-action-state') || '',
        buttonDescribedBy: button?.getAttribute('aria-describedby') || '',
        buttonStatus: button?.getAttribute('data-action-status') || '',
        buttonState: button?.getAttribute('data-action-state') || '',
        disabledReason: button?.getAttribute('data-disabled-reason') || '',
        targetSiteId: button?.getAttribute('data-target-site-id') || '',
      };
      if (
        !(status instanceof HTMLElement) ||
        !(button instanceof HTMLButtonElement) ||
        actionState.statusId !== 'collections-collection-action-status' ||
        actionState.inputDescribedBy !== actionState.statusId ||
        actionState.buttonDescribedBy !== actionState.statusId ||
        !actionState.statusText.includes(actionState.buttonStatus) ||
        actionState.buttonStatus !== actionState.inputStatus ||
        !actionState.buttonStatus.includes('Import JSON available') ||
        actionState.buttonState !== 'ready' ||
        actionState.inputState !== 'ready' ||
        actionState.disabledReason !== '' ||
        actionState.targetSiteId !== ${JSON.stringify(SITE_ID)}
      ) {
        return { ok: false, reason: 'backup-import-action-status', actionState };
      }
      if (input.disabled) return { ok: false, reason: 'backup-import-input-disabled' };
      const file = new File([${JSON.stringify(JSON.stringify(backup))}], 'collections-smoke-backup.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);
    if (importState.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to import collection JSON backup through UI: ${JSON.stringify(importState)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: (document.body?.innerText || '').includes('Collections JSON backup imported from collections-smoke-backup.json') &&
        (document.body?.innerText || '').includes('records updated'),
      body: document.body?.innerText?.slice(0, 1200) || '',
    }))()`);
    if (state.ready) return state;
    if (attempt === 79) {
      throw new Error(`Collection JSON backup import did not show feedback: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertNewCollectionButtonReset = async (client, testId = 'collections-new-collection-button') => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
      const status = document.querySelector('[data-testid="collections-collection-action-status"]');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'new-collection-button-missing' };
      }
      const actionState = {
        statusId: status?.id || '',
        statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim(),
        describedBy: button.getAttribute('aria-describedby') || '',
        dataStatus: button.getAttribute('data-action-status') || '',
        dataState: button.getAttribute('data-action-state') || '',
        disabledReason: button.getAttribute('data-disabled-reason') || '',
        targetSiteId: button.getAttribute('data-target-site-id') || '',
      };
      if (
        !(status instanceof HTMLElement) ||
        actionState.statusId !== 'collections-collection-action-status' ||
        !actionState.describedBy.includes(actionState.statusId) ||
        !actionState.statusText.includes(actionState.dataStatus) ||
        !(
          actionState.dataStatus.includes('New collection available') ||
          actionState.dataStatus.includes('New collection draft is open')
        ) ||
        actionState.dataState !== 'ready' ||
        actionState.disabledReason !== '' ||
        actionState.targetSiteId !== ${JSON.stringify(SITE_ID)}
      ) {
        return { ok: false, reason: 'new-collection-action-status', actionState };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'new-collection-button-disabled',
          title: button.getAttribute('title') || '',
          actionState,
          body: document.body?.innerText?.slice(0, 1200) || '',
        };
      }
      button.click();
      return { ok: true, actionState };
    })()`);
    if (clicked.ok) break;
    if (attempt === 119) {
      throw new Error(`Unable to click New collection button: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      const nameInput = document.querySelector('#collections-schema-name');
      const form = document.querySelector('#collections-schema');
      const draftStarter = document.querySelector('[data-testid="collections-draft-starter"]');
      const params = new URLSearchParams(window.location.search);
      return {
        hasNotice: body.includes('New collection draft opened') || body.includes('New collection draft is already open'),
        hasActionState: Boolean(document.querySelector('[data-testid="collections-new-draft-action-state"]')) &&
          body.includes('Draft ready below'),
        hasDraftBanner: Boolean(document.querySelector('[data-testid="collections-draft-banner"]')) &&
          body.includes('Blank collection draft is open') &&
          body.includes('Edit schema'),
        hasDraftStarter: Boolean(document.querySelector('[data-testid="collections-draft-starter"]')) &&
          body.includes('Blank collection draft') &&
          body.includes('Add fields'),
        hasDraftState: Boolean(document.querySelector('[data-testid="collections-new-draft-state"]')),
        draftNameValue: document.querySelector('[data-testid="collections-draft-name-input"]') instanceof HTMLInputElement
          ? document.querySelector('[data-testid="collections-draft-name-input"]').value
          : null,
        draftSlugValue: document.querySelector('[data-testid="collections-draft-slug-input"]') instanceof HTMLInputElement
          ? document.querySelector('[data-testid="collections-draft-slug-input"]').value
          : null,
        hasStarterSave: Boolean(document.querySelector('[data-testid="collections-draft-save-schema"]')),
        nameValue: nameInput instanceof HTMLInputElement ? nameInput.value : null,
        activeElementId: document.activeElement?.id || '',
        formTop: form instanceof HTMLElement ? form.getBoundingClientRect().top : null,
        draftStarterTop: draftStarter instanceof HTMLElement ? draftStarter.getBoundingClientRect().top : null,
        viewportHeight: window.innerHeight,
        draft: params.get('draft'),
        collectionId: params.get('collectionId'),
        recordId: params.get('recordId'),
        search: params.get('search'),
      };
    })()`);
    if (
      state.hasActionState &&
      state.hasDraftBanner &&
      state.hasDraftStarter &&
      state.hasDraftState &&
      state.hasStarterSave &&
      state.draftNameValue === '' &&
      state.draftSlugValue === '' &&
      state.nameValue === '' &&
      state.draft === 'new' &&
      state.collectionId === null &&
      state.recordId === null &&
      state.search === null &&
      (
        state.activeElementId === 'collections-draft-name' ||
        (state.draftStarterTop !== null && state.draftStarterTop >= 0 && state.draftStarterTop < state.viewportHeight * 0.85)
      )
    ) {
      const clickedOpenDraft = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false, reason: 'new-collection-button-missing' };
        }
        if (button.disabled) return { ok: false, reason: 'new-collection-button-disabled' };
        button.click();
        return { ok: true };
      })()`);
      if (!clickedOpenDraft.ok && clickedOpenDraft.reason === 'new-collection-button-missing') {
        return;
      }
      assert(clickedOpenDraft.ok, `Unable to click already-open New collection draft button: ${JSON.stringify(clickedOpenDraft)}`);

      for (let alreadyOpenAttempt = 0; alreadyOpenAttempt < 40; alreadyOpenAttempt += 1) {
        const alreadyOpenState = await evaluate(client, `(() => {
          const body = document.body?.innerText || '';
          const nameInput = document.querySelector('#collections-schema-name');
          const form = document.querySelector('#collections-schema');
          const draftStarter = document.querySelector('[data-testid="collections-draft-starter"]');
          const params = new URLSearchParams(window.location.search);
          return {
            hasAlreadyOpenNotice: body.includes('New collection draft is already open'),
            activeElementId: document.activeElement?.id || '',
            formTop: form instanceof HTMLElement ? form.getBoundingClientRect().top : null,
            draftStarterTop: draftStarter instanceof HTMLElement ? draftStarter.getBoundingClientRect().top : null,
            viewportHeight: window.innerHeight,
            nameValue: nameInput instanceof HTMLInputElement ? nameInput.value : null,
            draft: params.get('draft'),
            collectionId: params.get('collectionId'),
          };
        })()`);
        if (
          alreadyOpenState.hasAlreadyOpenNotice &&
          alreadyOpenState.nameValue === '' &&
          alreadyOpenState.draft === 'new' &&
          alreadyOpenState.collectionId === null &&
          (
            alreadyOpenState.activeElementId === 'collections-draft-name' ||
            (
              alreadyOpenState.draftStarterTop !== null &&
              alreadyOpenState.draftStarterTop >= 0 &&
              alreadyOpenState.draftStarterTop < alreadyOpenState.viewportHeight * 0.85
            )
          )
        ) {
          return;
        }
        if (alreadyOpenAttempt === 39) {
          throw new Error(`Already-open New collection draft button did not show feedback: ${JSON.stringify(alreadyOpenState)}`);
        }
        await sleep(250);
      }
      return;
    }
    if (attempt === 39) {
      throw new Error(`New collection button did not reveal blank schema state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }
};

const assertNewRecordButtonReset = async (client, recordSlug) => {
  await selectRecordForEdit(client, recordSlug);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="collections-new-record-button"]');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'new-record-button-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (button.disabled) return { ok: false, reason: 'new-record-button-disabled' };
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to click New record button: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      const params = new URLSearchParams(window.location.search);
      const slugInput = document.querySelector('#collections-record-slug');
      const editor = document.querySelector('[data-testid="collections-record-editor"]');
      const bulkToolbar = document.querySelector('[data-testid="collections-record-bulk-toolbar"]');
      return {
        hasNotice: body.includes('New record draft ready'),
        hasCreateMode: editor?.textContent?.includes('Create record') || false,
        hasDraftState: Boolean(document.querySelector('[data-testid="collections-record-draft-state"]')) &&
          body.includes('New record draft'),
        slugValue: slugInput instanceof HTMLInputElement ? slugInput.value : null,
        activeElementId: document.activeElement?.id || '',
        editorTop: editor instanceof HTMLElement ? editor.getBoundingClientRect().top : null,
        viewportHeight: window.innerHeight,
        recordId: params.get('recordId'),
        bulkToolbarVisible: Boolean(bulkToolbar),
      };
    })()`);
    if (
      state.hasNotice &&
      state.hasCreateMode &&
      state.hasDraftState &&
      state.slugValue === '' &&
      state.recordId === null &&
      state.bulkToolbarVisible === false &&
      (state.activeElementId === 'collections-record-slug' || (state.editorTop !== null && state.editorTop < state.viewportHeight))
    ) {
      return state;
    }
    if (attempt === 39) {
      throw new Error(`New record button did not reveal blank record state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const openCollectionRecordMediaPicker = async (client, fieldKey, expectedAllowedTypes, expectedUploadFilter) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="collections-record-media-picker-${fieldKey}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'media-picker-button-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
      }
      if (button.disabled) return { ok: false, reason: 'media-picker-button-disabled', title: button.title || '' };
      button.scrollIntoView({ block: 'center' });
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to open ${fieldKey} media picker: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="media-library-modal"]');
      const body = document.body?.innerText || '';
      const itemTypes = Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).map((item) => item.getAttribute('data-media-type') || '');
      return {
        ready: Boolean(modal) &&
          modal?.getAttribute('data-allowed-types') === ${JSON.stringify(expectedAllowedTypes)} &&
          modal?.getAttribute('data-upload-filter') === ${JSON.stringify(expectedUploadFilter)} &&
          !body.includes('Loading media...') &&
          itemTypes.length > 0,
        allowedTypes: modal?.getAttribute('data-allowed-types') || '',
        uploadFilter: modal?.getAttribute('data-upload-filter') || '',
        typeFilters: Array.from(document.querySelectorAll('[data-testid^="media-library-type-filter-"]')).map((item) => item.getAttribute('data-testid') || ''),
        uploadFilters: Array.from(document.querySelectorAll('[data-testid^="media-upload-filter-"]')).map((item) => item.getAttribute('data-testid') || ''),
        hasInsertControls: Boolean(document.querySelector('[data-testid="media-library-insert-controls"]')),
        insertPreset: document.querySelector('[data-testid="media-library-insert-preset"]')?.value || '',
        hasFocalControls: Boolean(document.querySelector('[data-testid="media-library-focal-x"]')) &&
          Boolean(document.querySelector('[data-testid="media-library-focal-y"]')) &&
          Boolean(document.querySelector('[data-testid="media-library-image-fit"]')) &&
          Boolean(document.querySelector('[data-testid="media-library-focal-preview"]')),
        focalPreview: {
          x: document.querySelector('[data-testid="media-library-focal-preview"]')?.getAttribute('data-focal-x') || '',
          y: document.querySelector('[data-testid="media-library-focal-preview"]')?.getAttribute('data-focal-y') || '',
          mediaId: document.querySelector('[data-testid="media-library-focal-preview"]')?.getAttribute('data-preview-media-id') || '',
        },
        hasFontControls: Boolean(document.querySelector('[data-testid="media-library-font-controls"]')),
        itemTypes,
        error: document.querySelector('[data-testid="media-library-error"]')?.textContent || '',
        body: body.slice(0, 1000),
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 79) {
      throw new Error(`${fieldKey} media picker did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const selectMediaLibraryItem = async (client, mediaId, { expectModalClose = true } = {}) => {
  const selected = await evaluate(client, `(() => {
    const item = document.querySelector(${JSON.stringify(`[data-testid="media-library-item"][data-media-id="${mediaId}"]`)});
    if (!(item instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'media-item-missing',
        available: Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).map((candidate) => ({
          id: candidate.getAttribute('data-media-id') || '',
          type: candidate.getAttribute('data-media-type') || '',
          name: candidate.getAttribute('data-media-name') || '',
        })),
      };
    }
    if (item.getAttribute('data-media-private-select-disabled') === 'true') {
      return { ok: false, reason: 'media-item-private', id: item.getAttribute('data-media-id') || '' };
    }
    item.scrollIntoView({ block: 'center' });
    item.click();
    return { ok: true, id: item.getAttribute('data-media-id') || '', type: item.getAttribute('data-media-type') || '' };
  })()`);
  assert(selected.ok, `Unable to select media item ${mediaId}: ${JSON.stringify(selected)}`);

  if (!expectModalClose) {
    return selected;
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      modalOpen: Boolean(document.querySelector('[data-testid="media-library-modal"]')),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (!state.modalOpen) return selected;
    if (attempt === 39) {
      throw new Error(`Media picker did not close after selecting ${mediaId}: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return selected;
};

const selectFirstMediaLibraryItemExcluding = async (client, excludedIds, { expectModalClose = true } = {}) => {
  const selected = await evaluate(client, `(() => {
    const excluded = new Set(${JSON.stringify(excludedIds)});
    const item = Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).find((candidate) => (
      candidate instanceof HTMLButtonElement &&
      !excluded.has(candidate.getAttribute('data-media-id') || '') &&
      candidate.getAttribute('data-media-private-select-disabled') !== 'true'
    ));
    if (!(item instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'media-item-missing',
        excluded: Array.from(excluded),
        available: Array.from(document.querySelectorAll('[data-testid="media-library-item"]')).map((candidate) => ({
          id: candidate.getAttribute('data-media-id') || '',
          type: candidate.getAttribute('data-media-type') || '',
          name: candidate.getAttribute('data-media-name') || '',
          privateDisabled: candidate.getAttribute('data-media-private-select-disabled') || '',
        })),
      };
    }
    item.scrollIntoView({ block: 'center' });
    item.click();
    return { ok: true, id: item.getAttribute('data-media-id') || '', type: item.getAttribute('data-media-type') || '' };
  })()`);
  assert(selected.ok, `Unable to select a third media item: ${JSON.stringify(selected)}`);

  if (!expectModalClose) {
    return selected;
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      modalOpen: Boolean(document.querySelector('[data-testid="media-library-modal"]')),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (!state.modalOpen) return selected;
    if (attempt === 39) {
      throw new Error(`Media picker did not close after selecting ${selected.id}: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return selected;
};

const assertCollectionRecordMediaFieldsThroughUi = async (client, collectionId, recordSlug) => {
  await selectRecordForEdit(client, recordSlug);

  const imagePicker = await openCollectionRecordMediaPicker(client, 'hero_image', 'image', 'image');
  assert(
    imagePicker.itemTypes.every((type) => type === 'image') &&
      imagePicker.hasInsertControls &&
      imagePicker.insertPreset === 'fill-frame' &&
      imagePicker.hasFocalControls &&
      imagePicker.focalPreview.x === '50' &&
      imagePicker.focalPreview.y === '50' &&
      !imagePicker.hasFontControls &&
      imagePicker.typeFilters.includes('media-library-type-filter-image') &&
      !imagePicker.typeFilters.includes('media-library-type-filter-all') &&
      !imagePicker.typeFilters.includes('media-library-type-filter-video') &&
      !imagePicker.typeFilters.includes('media-library-type-filter-file'),
    `Image media picker did not restrict visible library options to images: ${JSON.stringify(imagePicker)}`,
  );
  await selectMediaLibraryItem(client, 'media-demo-hero');

  const imageFieldState = await evaluate(client, `(() => {
    const field = document.querySelector('[data-testid="collections-record-field-hero_image"]');
    return { value: field instanceof HTMLInputElement ? field.value : null };
  })()`);
  assert(
    imageFieldState.value === 'media-demo-hero',
    `Hero image field was not populated from media picker: ${JSON.stringify(imageFieldState)}`,
  );

  const galleryFirstPicker = await openCollectionRecordMediaPicker(client, 'gallery_files', 'any', 'file');
  assert(
    galleryFirstPicker.typeFilters.includes('media-library-type-filter-file') &&
      galleryFirstPicker.typeFilters.includes('media-library-type-filter-image') &&
      galleryFirstPicker.hasInsertControls &&
      galleryFirstPicker.hasFontControls,
    `File media picker did not expose mixed media filters: ${JSON.stringify(galleryFirstPicker)}`,
  );
  await selectMediaLibraryItem(client, 'media-demo-hero');

  await openCollectionRecordMediaPicker(client, 'gallery_files', 'any', 'file');
  await selectMediaLibraryItem(client, 'media-demo-logo');

  const galleryTwoState = await evaluate(client, `(() => {
    const field = document.querySelector('[data-testid="collections-record-field-gallery_files"]');
    return { value: field instanceof HTMLTextAreaElement ? field.value : null };
  })()`);
  const galleryTwoItems = String(galleryTwoState.value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  assert(
    galleryTwoItems.length === 2 &&
      galleryTwoItems.includes('media-demo-hero') &&
      galleryTwoItems.includes('media-demo-logo'),
    `Gallery field did not collect two media IDs: ${JSON.stringify(galleryTwoState)}`,
  );

  await openCollectionRecordMediaPicker(client, 'gallery_files', 'any', 'file');
  const rejectedThirdMedia = await selectFirstMediaLibraryItemExcluding(client, ['media-demo-hero', 'media-demo-logo'], { expectModalClose: false });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const field = document.querySelector('[data-testid="collections-record-field-gallery_files"]');
      const close = document.querySelector('button[aria-label="Close media library"]');
      return {
        hasMaxItemsError: (document.body?.innerText || '').includes('Gallery files allows at most 2 files.'),
        value: field instanceof HTMLTextAreaElement ? field.value : null,
        modalOpen: Boolean(document.querySelector('[data-testid="media-library-modal"]')),
        canClose: close instanceof HTMLButtonElement,
      };
    })()`);
    const items = String(state.value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    if (state.hasMaxItemsError && items.length === 2 && !items.includes(rejectedThirdMedia.id)) {
      if (state.modalOpen) {
        const closed = await evaluate(client, `(() => {
          const close = document.querySelector('button[aria-label="Close media library"]');
          if (!(close instanceof HTMLButtonElement)) return { ok: false };
          close.click();
          return { ok: true };
        })()`);
        assert(closed.ok, `Unable to close media picker after max-items check: ${JSON.stringify(closed)}`);
      }
      break;
    }
    if (attempt === 39) {
      throw new Error(`Gallery max-items guard did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const heroField = document.querySelector('[data-testid="collections-record-field-hero_image"]');
      const galleryField = document.querySelector('[data-testid="collections-record-field-gallery_files"]');
      return {
        modalOpen: Boolean(document.querySelector('[data-testid="media-library-modal"]')),
        heroValue: heroField instanceof HTMLInputElement ? heroField.value : null,
        galleryValue: galleryField instanceof HTMLTextAreaElement ? galleryField.value : null,
        error: document.querySelector('[data-testid="collections-error"]')?.textContent || '',
        saveDisabled: document.querySelector('[data-testid="collections-record-save-button"]')?.disabled ?? null,
      };
    })()`);
    const gallery = String(state.galleryValue || '').split(/[\\n,]/).map((item) => item.trim()).filter(Boolean);
    if (
      !state.modalOpen &&
      state.heroValue === 'media-demo-hero' &&
      gallery.length === 2 &&
      gallery.includes('media-demo-hero') &&
      gallery.includes('media-demo-logo') &&
      state.saveDisabled === false
    ) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`Media-backed collection record form did not settle before save: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  const clickedSave = await evaluate(client, `(() => {
    const form = document.querySelector('#collections-record-editor');
    const button = form?.querySelector('button[type="submit"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'record-save-button-missing' };
    if (button.disabled) return { ok: false, reason: 'record-save-button-disabled', text: button.textContent || '' };
    button.scrollIntoView({ block: 'center' });
    button.click();
    return { ok: true };
  })()`);
  assert(clickedSave.ok, `Unable to save media-backed collection record: ${JSON.stringify(clickedSave)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const record = await fetchRecordBySlug(collectionId, recordSlug);
    const gallery = Array.isArray(record?.values?.gallery_files) ? record.values.gallery_files : [];
    if (
      record?.values?.hero_image === 'media-demo-hero' &&
      gallery.length === 2 &&
      gallery.includes('media-demo-hero') &&
      gallery.includes('media-demo-logo')
    ) {
      return record;
    }
    await sleep(250);
  }

  const record = await fetchRecordBySlug(collectionId, recordSlug);
  const pageState = await evaluate(client, `(() => ({
    notice: document.querySelector('[data-testid="collections-success-notice"]')?.textContent || '',
    error: document.querySelector('[data-testid="collections-error"]')?.textContent || '',
    validation: Array.from(document.querySelectorAll('[data-testid="collections-validation-detail"]')).map((node) => node.textContent || ''),
    heroValue: document.querySelector('[data-testid="collections-record-field-hero_image"]')?.value || '',
    galleryValue: document.querySelector('[data-testid="collections-record-field-gallery_files"]')?.value || '',
  }))()`);
  throw new Error(`Media-backed collection record values did not persist: ${JSON.stringify({ record, pageState }).slice(0, 1200)}`);
};

const configureDraftCollectionSlugPolicyThroughUi = async (client, {
  sourceField,
  fallbackField,
  updateBehavior,
}) => {
  let state = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    state = await evaluate(client, `(() => {
      const setNativeValue = (element, value) => {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        descriptor?.set?.call(element, value);
      };
      const sourceSelect = document.querySelector('[data-testid="collections-slug-policy-source-field"]');
      const fallbackSelect = document.querySelector('[data-testid="collections-slug-policy-fallback-field"]');
      const behaviorSelect = document.querySelector('[data-testid="collections-slug-policy-update-behavior"]');
      const copyPlanButton = document.querySelector('[data-testid="collections-slug-policy-copy-plan"]');
      const controls = document.querySelector('[data-testid="collections-slug-policy-controls"]');
      const saveButton = document.querySelector('#collections-schema button[type="submit"]');
      if (!(sourceSelect instanceof HTMLSelectElement)) return { ok: false, reason: 'source-select-missing' };
      if (!(fallbackSelect instanceof HTMLSelectElement)) return { ok: false, reason: 'fallback-select-missing' };
      if (!(behaviorSelect instanceof HTMLSelectElement)) return { ok: false, reason: 'behavior-select-missing' };
      if (!(copyPlanButton instanceof HTMLButtonElement)) return { ok: false, reason: 'copy-plan-missing' };
      if (!(saveButton instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };

      const sourceOptionReady = Array.from(sourceSelect.options).some((option) => option.value === ${JSON.stringify(sourceField)});
      const fallbackOptionReady = Array.from(fallbackSelect.options).some((option) => option.value === ${JSON.stringify(fallbackField)});
      const behaviorOptionReady = Array.from(behaviorSelect.options).some((option) => option.value === ${JSON.stringify(updateBehavior)});
      if (!sourceOptionReady || !fallbackOptionReady || !behaviorOptionReady) {
        return {
          ok: false,
          reason: 'options-not-ready',
          sourceOptions: Array.from(sourceSelect.options).map((option) => option.value),
          fallbackOptions: Array.from(fallbackSelect.options).map((option) => option.value),
          behaviorOptions: Array.from(behaviorSelect.options).map((option) => option.value),
        };
      }

      if (sourceSelect.value !== ${JSON.stringify(sourceField)}) {
        setNativeValue(sourceSelect, ${JSON.stringify(sourceField)});
        sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (fallbackSelect.value !== ${JSON.stringify(fallbackField)}) {
        setNativeValue(fallbackSelect, ${JSON.stringify(fallbackField)});
        fallbackSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (behaviorSelect.value !== ${JSON.stringify(updateBehavior)}) {
        setNativeValue(behaviorSelect, ${JSON.stringify(updateBehavior)});
        behaviorSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return {
        ok: sourceSelect.value === ${JSON.stringify(sourceField)} &&
          fallbackSelect.value === ${JSON.stringify(fallbackField)} &&
          behaviorSelect.value === ${JSON.stringify(updateBehavior)} &&
          !copyPlanButton.disabled &&
          !saveButton.disabled,
        sourceField: sourceSelect.value,
        fallbackField: fallbackSelect.value,
        updateBehavior: behaviorSelect.value,
        copyPlanDisabled: copyPlanButton.disabled,
        saveDisabled: saveButton.disabled,
        readinessText: controls?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      };
    })()`);

    if (state.ok) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Collection slug policy controls did not settle: ${JSON.stringify(state)}`);
};

const copyDraftCollectionSlugPolicyPlanThroughUi = async (client, expected) => {
  const clickState = await evaluate(client, `(() => {
    window.__backySlugPolicyCopy = '';
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__backySlugPolicyCopy = String(value);
          },
        },
      });
    } catch {
      if (navigator.clipboard) {
        navigator.clipboard.writeText = async (value) => {
          window.__backySlugPolicyCopy = String(value);
        };
      }
    }
    const button = document.querySelector('[data-testid="collections-slug-policy-copy-plan"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'copy-plan-missing' };
    if (button.disabled) return { ok: false, reason: 'copy-plan-disabled' };
    button.scrollIntoView({ block: 'center' });
    button.click();
    return { ok: true };
  })()`);
  assert(clickState.ok, `Unable to click collection slug policy copy plan: ${JSON.stringify(clickState)}`);

  let copyState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    copyState = await evaluate(client, `(() => ({
      value: window.__backySlugPolicyCopy || '',
      notice: document.querySelector('[data-testid="collections-success-notice"]')?.textContent || '',
      error: document.querySelector('[data-testid="collections-error"]')?.textContent || '',
    }))()`);
    if (copyState.value) {
      break;
    }
    await sleep(100);
  }

  assert(copyState?.value, `Collection slug policy copy plan did not write clipboard payload: ${JSON.stringify(copyState)}`);
  const plan = JSON.parse(copyState.value);
  assert(plan.schemaVersion === 'backy.collection-slug-policy-action-plan.v1', `Slug policy copy plan schema mismatch: ${JSON.stringify(plan)}`);
  assert(plan.status === 'ready', `Slug policy copy plan was not ready: ${JSON.stringify(plan)}`);
  assert(plan.sourceField === expected.sourceField, `Slug policy copy plan source field mismatch: ${JSON.stringify(plan)}`);
  assert(plan.fallbackField === expected.fallbackField, `Slug policy copy plan fallback field mismatch: ${JSON.stringify(plan)}`);
  assert(plan.updateBehavior === expected.updateBehavior, `Slug policy copy plan update behavior mismatch: ${JSON.stringify(plan)}`);
  assert(plan.transform === 'lowercase-dashes' && plan.conflictStrategy === 'reject-duplicates', `Slug policy copy plan strategy mismatch: ${JSON.stringify(plan)}`);
  assert(String(plan.exampleItemPath || '').includes('example-record'), `Slug policy copy plan example path missing: ${JSON.stringify(plan)}`);

  return {
    plan,
    notice: copyState.notice,
  };
};

const ensureDraftCollectionCustomFieldRow = async (client) => {
  let state = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await evaluate(client, `(() => {
      const form = document.querySelector('#collections-schema');
      const rows = Array.from(form?.querySelectorAll('tbody tr') || []);
      if (rows.length >= 2) {
        return { ok: true, rowCount: rows.length };
      }
      const addButton = Array.from(form?.querySelectorAll('button') || [])
        .find((candidate) => (candidate.textContent || '').includes('Add field'));
      if (!(addButton instanceof HTMLButtonElement)) return { ok: false, reason: 'add-field-button-missing', rowCount: rows.length };
      if (addButton.disabled) return { ok: false, reason: 'add-field-button-disabled', rowCount: rows.length };
      addButton.scrollIntoView({ block: 'center' });
      addButton.click();
      return { ok: false, reason: 'add-field-clicked', rowCount: rows.length };
    })()`);

    if (state.ok) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Unable to add custom field row for draft collection: ${JSON.stringify(state)}`);
};

const createDraftCollectionWithCustomFieldThroughUi = async (client, suffix) => {
  const name = `Smoke Draft Schema ${suffix}`;
  const slug = `smoke-draft-schema-${suffix}`;
  const customFieldKey = `custom_note_${suffix.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
  const customFieldLabel = `Custom note ${suffix}`;
  const expectedSlugPolicy = {
    sourceField: 'title',
    fallbackField: customFieldKey,
    updateBehavior: 'sync-drafts',
  };

  await assertNewCollectionButtonReset(client, 'collections-new-collection-button');
  await ensureDraftCollectionCustomFieldRow(client);

  const filled = await evaluate(client, `(() => {
    const setNativeValue = (element, value) => {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, value);
    };
    const form = document.querySelector('#collections-schema');
    const nameInput = document.querySelector('#collections-schema-name');
    const slugInput = Array.from(form?.querySelectorAll('label') || [])
      .find((label) => (label.textContent || '').includes('Slug'))
      ?.querySelector('input');
    const statusSelect = Array.from(form?.querySelectorAll('select') || [])
      .find((select) => Array.from(select.options).some((option) => option.value === 'draft'));
    const fieldRows = Array.from(form?.querySelectorAll('tbody tr') || []);
    const customFieldRow = fieldRows[1];
    const fieldInputs = Array.from(customFieldRow?.querySelectorAll('input') || []);
    const fieldKeyInput = fieldInputs[0];
    const fieldLabelInput = fieldInputs[1];
    const saveButton = form
      ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
      : null;

    if (!(nameInput instanceof HTMLInputElement)) return { ok: false, reason: 'name-input-missing' };
    if (!(slugInput instanceof HTMLInputElement)) return { ok: false, reason: 'slug-input-missing' };
    if (!(statusSelect instanceof HTMLSelectElement)) return { ok: false, reason: 'status-select-missing' };
    if (fieldRows.length < 2) return { ok: false, reason: 'custom-field-row-missing', rowCount: fieldRows.length };
    if (!(fieldKeyInput instanceof HTMLInputElement)) return { ok: false, reason: 'field-key-input-missing' };
    if (!(fieldLabelInput instanceof HTMLInputElement)) return { ok: false, reason: 'field-label-input-missing' };
    if (!(saveButton instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };
    if (saveButton.disabled) return { ok: false, reason: 'save-button-disabled' };

    setNativeValue(nameInput, ${JSON.stringify(name)});
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    setNativeValue(slugInput, ${JSON.stringify(slug)});
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));
    setNativeValue(statusSelect, 'draft');
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    setNativeValue(fieldKeyInput, ${JSON.stringify(customFieldKey)});
    fieldKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    setNativeValue(fieldLabelInput, ${JSON.stringify(customFieldLabel)});
    fieldLabelInput.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      ok: true,
      name: nameInput.value,
      slug: slugInput.value,
      status: statusSelect.value,
      fieldKey: fieldKeyInput.value,
      fieldLabel: fieldLabelInput.value,
      saveDisabled: saveButton.disabled,
    };
  })()`);
  assert(filled.ok, `Unable to fill custom draft collection fields: ${JSON.stringify(filled)}`);

  const slugPolicyControls = await configureDraftCollectionSlugPolicyThroughUi(client, expectedSlugPolicy);
  const copiedSlugPolicyPlan = await copyDraftCollectionSlugPolicyPlanThroughUi(client, expectedSlugPolicy);
  const savedClick = await evaluate(client, `(() => {
    const button = document.querySelector('#collections-schema button[type="submit"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };
    if (button.disabled) return { ok: false, reason: 'save-button-disabled', text: button.textContent || '' };
    button.scrollIntoView({ block: 'center' });
    button.click();
    return { ok: true, text: button.textContent || '' };
  })()`);
  assert(savedClick.ok, `Unable to save custom draft collection after slug policy setup: ${JSON.stringify(savedClick)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collections = await fetchCollections();
    const collection = collections.find((candidate) => candidate.slug === slug);
    const customField = collection?.fields?.find((field) => field.key === customFieldKey);
    if (collection && customField) {
      const collectionDetail = await fetchCollection(collection.id);
      const savedCollection = collectionDetail || collection;
      const savedSlugPolicy = savedCollection.metadata?.slugPolicy || {};
      assert(collection.status === 'draft', `Draft collection status was not persisted: ${JSON.stringify(collection)}`);
      assert(customField.label === customFieldLabel, `Custom field label was not persisted: ${JSON.stringify(customField)}`);
      assert(typeof customField.id === 'string' && customField.id.trim(), `Custom field id was not a stable string: ${JSON.stringify(customField)}`);
      assert(savedSlugPolicy.schemaVersion === 'backy.collection-slug-policy.v1', `Slug policy schema was not persisted: ${JSON.stringify(savedCollection.metadata)}`);
      assert(savedSlugPolicy.sourceField === expectedSlugPolicy.sourceField, `Slug policy source field was not persisted: ${JSON.stringify(savedSlugPolicy)}`);
      assert(savedSlugPolicy.fallbackField === expectedSlugPolicy.fallbackField, `Slug policy fallback field was not persisted: ${JSON.stringify(savedSlugPolicy)}`);
      assert(savedSlugPolicy.updateBehavior === expectedSlugPolicy.updateBehavior, `Slug policy update behavior was not persisted: ${JSON.stringify(savedSlugPolicy)}`);
      assert(savedSlugPolicy.transform === 'lowercase-dashes' && savedSlugPolicy.conflictStrategy === 'reject-duplicates', `Slug policy strategy was not persisted: ${JSON.stringify(savedSlugPolicy)}`);

      const uiState = await evaluate(client, `(() => {
        const body = document.body?.innerText || '';
        const params = new URLSearchParams(window.location.search);
        const notice = document.querySelector('[data-testid="collections-success-notice"]');
        return {
          hasCreateNotice: Boolean(notice) && body.includes(${JSON.stringify(`${name} collection created.`)}),
          hasDraftState: Boolean(document.querySelector('[data-testid="collections-new-draft-state"]')),
          collectionId: params.get('collectionId'),
          draft: params.get('draft'),
        };
      })()`);

      if (uiState.hasCreateNotice && uiState.collectionId === collection.id && uiState.draft === null && !uiState.hasDraftState) {
        return {
          ...savedCollection,
          slugPolicySmoke: {
            controls: slugPolicyControls,
            copiedPlan: copiedSlugPolicyPlan.plan,
            notice: copiedSlugPolicyPlan.notice,
          },
        };
      }

      if (attempt === 79) {
        throw new Error(`Draft collection saved but UI success state did not settle: ${JSON.stringify(uiState)}`);
      }
    }
    await sleep(250);
  }

  throw new Error('Draft collection custom field did not persist');
};

const configureVisitorMutationPolicyThroughUi = async (client, collectionId, token) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const configured = await evaluate(client, `(() => {
      const setNativeValue = (element, value) => {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        descriptor?.set?.call(element, value);
      };
      const updateToggle = document.querySelector('[data-testid="collections-public-update-toggle"] input');
      const deleteToggle = document.querySelector('[data-testid="collections-public-delete-toggle"] input');
      const tokenInput = document.querySelector('[data-testid="collections-visitor-write-token"]');
      const createMode = document.querySelector('[data-testid="collections-visitor-write-policy-mode"]');
      const updateMode = document.querySelector('[data-testid="collections-visitor-update-policy-mode"]');
      const createTitleField = document.querySelector('[data-testid="collections-visitor-write-field-title"]');
      const createCategoryField = document.querySelector('[data-testid="collections-visitor-write-field-category"]');
      const createSummaryField = document.querySelector('[data-testid="collections-visitor-write-field-summary"]');
      const summaryField = document.querySelector('[data-testid="collections-visitor-update-field-summary"]');

      if (!(updateToggle instanceof HTMLInputElement)) return { ok: false, reason: 'update-toggle-missing' };
      if (!(deleteToggle instanceof HTMLInputElement)) return { ok: false, reason: 'delete-toggle-missing' };
      if (!(tokenInput instanceof HTMLInputElement)) return { ok: false, reason: 'token-input-missing' };
      if (!(createMode instanceof HTMLSelectElement)) return { ok: false, reason: 'create-mode-missing' };
      if (!(updateMode instanceof HTMLSelectElement)) return { ok: false, reason: 'update-mode-missing' };
      if (!(createTitleField instanceof HTMLInputElement)) return { ok: false, reason: 'create-title-field-missing' };
      if (!(createCategoryField instanceof HTMLInputElement)) return { ok: false, reason: 'create-category-field-missing' };
      if (!(createSummaryField instanceof HTMLInputElement)) return { ok: false, reason: 'create-summary-field-missing' };
      if (!(summaryField instanceof HTMLInputElement)) return { ok: false, reason: 'summary-field-missing' };
      if (updateToggle.disabled || deleteToggle.disabled || tokenInput.disabled || createMode.disabled || updateMode.disabled) {
        return {
          ok: false,
          reason: 'controls-disabled',
          updateDisabled: updateToggle.disabled,
          deleteDisabled: deleteToggle.disabled,
          tokenDisabled: tokenInput.disabled,
          createModeDisabled: createMode.disabled,
          updateModeDisabled: updateMode.disabled,
        };
      }

      if (!updateToggle.checked) updateToggle.click();
      if (!deleteToggle.checked) deleteToggle.click();
      setNativeValue(tokenInput, ${JSON.stringify(token)});
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
      setNativeValue(createMode, 'selected');
      createMode.dispatchEvent(new Event('change', { bubbles: true }));
      setNativeValue(updateMode, 'selected');
      updateMode.dispatchEvent(new Event('change', { bubbles: true }));
      if (createTitleField.disabled || createCategoryField.disabled || createSummaryField.disabled || summaryField.disabled) {
        return {
          ok: false,
          reason: 'field-controls-awaiting-mode',
          createMode: createMode.value,
          updateMode: updateMode.value,
          createTitleDisabled: createTitleField.disabled,
          createCategoryDisabled: createCategoryField.disabled,
          createSummaryDisabled: createSummaryField.disabled,
          summaryDisabled: summaryField.disabled,
        };
      }
      [createTitleField, createCategoryField, createSummaryField].forEach((field) => {
        if (!field.checked) field.click();
      });
      if (!summaryField.checked) summaryField.click();

      const createFieldsChecked = createTitleField.checked && createCategoryField.checked && createSummaryField.checked;
      const updateFieldsChecked = summaryField.checked;
      return {
        ok: updateToggle.checked &&
          deleteToggle.checked &&
          tokenInput.value === ${JSON.stringify(token)} &&
          createMode.value === 'selected' &&
          updateMode.value === 'selected' &&
          createFieldsChecked &&
          updateFieldsChecked,
        updateChecked: updateToggle.checked,
        deleteChecked: deleteToggle.checked,
        tokenValue: tokenInput.value,
        createMode: createMode.value,
        updateMode: updateMode.value,
        createTitleChecked: createTitleField.checked,
        createCategoryChecked: createCategoryField.checked,
        createSummaryChecked: createSummaryField.checked,
        summaryChecked: summaryField.checked,
      };
    })()`);
    if (configured.ok) break;
    if (attempt === 39) {
      throw new Error(`Unable to configure visitor mutation policy controls: ${JSON.stringify(configured)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      body: document.body?.innerText || '',
      updateChecked: document.querySelector('[data-testid="collections-public-update-toggle"] input')?.checked || false,
      deleteChecked: document.querySelector('[data-testid="collections-public-delete-toggle"] input')?.checked || false,
      tokenValue: document.querySelector('[data-testid="collections-visitor-write-token"]')?.value || '',
      createMode: document.querySelector('[data-testid="collections-visitor-write-policy-mode"]')?.value || '',
      updateMode: document.querySelector('[data-testid="collections-visitor-update-policy-mode"]')?.value || '',
      createTitleChecked: document.querySelector('[data-testid="collections-visitor-write-field-title"]')?.checked || false,
      createCategoryChecked: document.querySelector('[data-testid="collections-visitor-write-field-category"]')?.checked || false,
      createSummaryChecked: document.querySelector('[data-testid="collections-visitor-write-field-summary"]')?.checked || false,
      summaryChecked: document.querySelector('[data-testid="collections-visitor-update-field-summary"]')?.checked || false,
    }))()`);
    if (
      state.updateChecked &&
      state.deleteChecked &&
      state.tokenValue === token &&
      state.createMode === 'selected' &&
      state.updateMode === 'selected' &&
      state.createTitleChecked &&
      state.createCategoryChecked &&
      state.createSummaryChecked &&
      state.summaryChecked &&
      state.body.includes('3 fields writable from public POST') &&
      state.body.includes('Token configured for enabled public mutation routes.') &&
      state.body.includes('1 fields writable from public PATCH')
    ) {
      break;
    }
    if (attempt === 19) {
      throw new Error(`Visitor mutation policy controls did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  let lastPersistedState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const form = document.querySelector('#collections-schema');
      const button = form
        ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
        : null;
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };
      if (button.disabled || button.matches(':disabled') || (button.textContent || '').includes('Saving')) {
        return {
          ok: false,
          reason: 'save-button-busy',
          disabled: button.disabled,
          matchesDisabled: button.matches(':disabled'),
          text: button.textContent || '',
        };
      }
      button.click();
      return { ok: true };
    })()`);
    const collection = await fetchCollection(collectionId);
    const policy = collection?.metadata?.visitorWritePolicy;
    const pageState = await evaluate(client, `(() => ({
      notice: document.querySelector('[data-testid="collections-success-notice"]')?.textContent || '',
      error: document.querySelector('[data-testid="collections-error"]')?.textContent || '',
      validation: Array.from(document.querySelectorAll('[data-testid="collections-validation-detail"]')).map((node) => node.textContent || ''),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    lastPersistedState = {
      clicked,
      permissions: collection?.permissions || null,
      policy: policy || null,
      pageState,
    };
    if (
      collection?.permissions?.publicUpdate === true &&
      collection?.permissions?.publicDelete === true &&
      policy?.publicWriteToken === token &&
      policy?.createFieldMode === 'selected' &&
      Array.isArray(policy?.allowedCreateFields) &&
      policy.allowedCreateFields.includes('title') &&
      policy.allowedCreateFields.includes('category') &&
      policy.allowedCreateFields.includes('summary') &&
      !policy.allowedCreateFields.includes('website') &&
      policy?.updateFieldMode === 'selected' &&
      Array.isArray(policy?.allowedUpdateFields) &&
      policy.allowedUpdateFields.includes('summary')
    ) {
      return collection;
    }
    if (attempt === 79 && !clicked.ok) {
      throw new Error(`Unable to save visitor mutation policy: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  throw new Error(`Visitor mutation policy did not persist: ${JSON.stringify(lastPersistedState)}`);
};

const assertVisitorMutationPolicyPublicApi = async ({
  collectionId,
  collectionSlug,
  recordSlug,
  token,
  suffix,
}) => {
  const originalRecord = await fetchRecordBySlug(collectionId, recordSlug);
  assert(originalRecord?.id, `Visitor mutation policy record missing before public API checks: ${JSON.stringify(originalRecord)}`);

  const createRecordSlug = `smoke-public-create-${suffix}`;
  const publicCreateSummary = `Public create summary ${suffix}`;
  const publicCreateWebsite = `https://public-create-ignored-${suffix}.example.com`;
  const acceptedCreate = await requestApiRaw(
    `/api/sites/${SITE_ID}/collections/${collectionSlug}/records`,
    {
      method: 'POST',
      body: JSON.stringify({
        slug: createRecordSlug,
        values: {
          title: `Smoke public create ${suffix}`,
          category: 'Smoke',
          summary: publicCreateSummary,
          website: publicCreateWebsite,
        },
      }),
    },
  );
  assert(
    acceptedCreate.response.status === 201 && acceptedCreate.payload?.success === true,
    `Public create with selected fields failed: ${JSON.stringify({ status: acceptedCreate.response.status, payload: acceptedCreate.payload }).slice(0, 1000)}`,
  );
  const createPolicy = acceptedCreate.payload?.data?.visitorWritePolicy || acceptedCreate.payload?.visitorWritePolicy;
  assert(
    Array.isArray(createPolicy?.ignoredFields) &&
      createPolicy.ignoredFields.includes('website') &&
      Array.isArray(createPolicy.allowedCreateFields) &&
      createPolicy.allowedCreateFields.includes('title') &&
      createPolicy.allowedCreateFields.includes('category') &&
      createPolicy.allowedCreateFields.includes('summary') &&
      createPolicy.values?.summary === publicCreateSummary &&
      createPolicy.values?.website === undefined,
    `Public create field policy did not report ignored disallowed fields: ${JSON.stringify(createPolicy).slice(0, 800)}`,
  );
  const createdPublicRecord = await fetchRecordBySlug(collectionId, createRecordSlug);
  assert(
    createdPublicRecord?.status === 'draft' &&
      createdPublicRecord.values?.summary === publicCreateSummary &&
      createdPublicRecord.values?.website === undefined,
    `Public create did not persist selected fields as a moderated draft: ${JSON.stringify(createdPublicRecord).slice(0, 800)}`,
  );

  const rejectedUpdate = await requestApiRaw(
    `/api/sites/${SITE_ID}/collections/${collectionSlug}/records/${recordSlug}`,
    {
      method: 'PATCH',
      headers: { 'x-backy-public-write-token': 'wrong-token' },
      body: JSON.stringify({
        values: {
          summary: 'This update should be rejected.',
        },
      }),
    },
  );
  assert(
    rejectedUpdate.response.status === 403 &&
      rejectedUpdate.payload?.error?.code === 'PUBLIC_UPDATE_AUTH_REQUIRED',
    `Public update should reject an invalid token: ${JSON.stringify({ status: rejectedUpdate.response.status, payload: rejectedUpdate.payload }).slice(0, 800)}`,
  );

  const updatedSummary = `Public visitor summary ${suffix}`;
  const ignoredWebsite = `https://ignored-${suffix}.example.com`;
  const acceptedUpdate = await requestApiRaw(
    `/api/sites/${SITE_ID}/collections/${collectionSlug}/records/${recordSlug}`,
    {
      method: 'PATCH',
      headers: { 'x-backy-public-write-token': token },
      body: JSON.stringify({
        values: {
          summary: updatedSummary,
          website: ignoredWebsite,
        },
      }),
    },
  );
  assert(
    acceptedUpdate.response.ok && acceptedUpdate.payload?.success === true,
    `Public update with valid token failed: ${JSON.stringify({ status: acceptedUpdate.response.status, payload: acceptedUpdate.payload }).slice(0, 1000)}`,
  );
  const updatePolicy = acceptedUpdate.payload?.data?.visitorWritePolicy || acceptedUpdate.payload?.visitorWritePolicy;
  assert(
    Array.isArray(updatePolicy?.ignoredFields) &&
      updatePolicy.ignoredFields.includes('website') &&
      updatePolicy.values?.summary === updatedSummary &&
      updatePolicy.values?.website === undefined,
    `Public update field policy did not report ignored disallowed fields: ${JSON.stringify(updatePolicy).slice(0, 800)}`,
  );

  const updatedRecord = await fetchRecordBySlug(collectionId, recordSlug);
  assert(
    updatedRecord?.values?.summary === updatedSummary,
    `Public update did not persist allowed summary field: ${JSON.stringify(updatedRecord).slice(0, 800)}`,
  );
  assert(
    updatedRecord?.values?.website === originalRecord.values?.website,
    `Public update should not persist disallowed website field: ${JSON.stringify({ before: originalRecord.values?.website, after: updatedRecord?.values?.website }).slice(0, 500)}`,
  );

  const deleteRecordSlug = `smoke-delete-${suffix}`;
  const deleteRecord = await createRecord({
    collectionId,
    slug: deleteRecordSlug,
    title: `Smoke delete ${suffix}`,
  });

  const rejectedDelete = await requestApiRaw(
    `/api/sites/${SITE_ID}/collections/${collectionSlug}/records/${deleteRecordSlug}`,
    {
      method: 'DELETE',
      headers: { 'x-backy-public-write-token': 'wrong-token' },
    },
  );
  assert(
    rejectedDelete.response.status === 403 &&
      rejectedDelete.payload?.error?.code === 'PUBLIC_DELETE_AUTH_REQUIRED',
    `Public delete should reject an invalid token: ${JSON.stringify({ status: rejectedDelete.response.status, payload: rejectedDelete.payload }).slice(0, 800)}`,
  );
  assert(
    await fetchRecordBySlug(collectionId, deleteRecordSlug),
    `Public delete invalid-token attempt removed the record unexpectedly: ${JSON.stringify(deleteRecord).slice(0, 500)}`,
  );

  const acceptedDelete = await requestApiRaw(
    `/api/sites/${SITE_ID}/collections/${collectionSlug}/records/${deleteRecordSlug}`,
    {
      method: 'DELETE',
      headers: { 'x-backy-public-write-token': token },
    },
  );
  assert(
    acceptedDelete.response.ok &&
      acceptedDelete.payload?.success === true &&
      (acceptedDelete.payload?.data?.deleted === true || acceptedDelete.payload?.deleted === true),
    `Public delete with valid token failed: ${JSON.stringify({ status: acceptedDelete.response.status, payload: acceptedDelete.payload }).slice(0, 1000)}`,
  );
  assert(
    !(await fetchRecordBySlug(collectionId, deleteRecordSlug)),
    `Public delete did not remove temporary record ${deleteRecordSlug}`,
  );

  return {
    updatedSummary,
  };
};

const createFrontendTemplateCollectionThroughUi = async (client) => {
  const before = await fetchCollections();
  const beforeIds = new Set(before.map((collection) => collection.id));

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'frontend-template-button-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'frontend-template-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to create collection from frontend template: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collections = await fetchCollections();
    const created = collections.find((collection) => (
      !beforeIds.has(collection.id) &&
      collection.metadata?.frontendDesignTemplateId === FRONTEND_COLLECTION_TEMPLATE_ID
    ));
    if (created) {
      assert(created.metadata?.frontendDesignTemplateName === FRONTEND_COLLECTION_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignSource?.label === 'Smoke collections frontend', `Frontend source snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignRoutePattern === '/smoke-contract-directory/:recordSlug', `Frontend route pattern missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignChrome?.header?.component === 'SmokeCollectionsHeader', `Frontend chrome snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignBindingHints) && created.metadata.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(created.metadata)}`);
      assert(created.permissions?.publicCreate === true, `Frontend template permissions were not applied: ${JSON.stringify(created.permissions)}`);
      assert(created.fields?.some((field) => field.key === 'category' && field.type === 'select'), `Frontend template fields were not applied: ${JSON.stringify(created.fields)}`);
      return created;
    }
    await sleep(250);
  }

  throw new Error('Frontend template collection was not created');
};

const attachFrontendTemplateThroughUi = async (client, collectionId) => {
  const selected = await evaluate(client, `(() => {
    const select = document.querySelector('[data-testid="collections-frontend-template-select"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'template-select-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    const hasOption = Array.from(select.options).some((option) => option.value === ${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_ID)});
    if (!hasOption) return { ok: false, reason: 'template-option-missing', options: Array.from(select.options).map((option) => option.value) };
    select.value = ${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_ID)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ok: true,
      summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
    };
  })()`);
  assert(selected.ok, `Unable to choose captured collection template: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      selected: document.querySelector('[data-testid="collections-frontend-template-select"]')?.value || '',
      summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
    }))()`);
    if (
      state.selected === FRONTEND_COLLECTION_TEMPLATE_ID &&
      state.summary.includes(FRONTEND_COLLECTION_TEMPLATE_NAME) &&
      state.summary.includes(FRONTEND_COLLECTION_TEMPLATE_ID)
    ) {
      break;
    }
    if (attempt === 19) {
      throw new Error(`Captured collection template summary did not update: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const form = document.querySelector('#collections-schema');
      const button = form
        ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
        : null;
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'save-button-missing' };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'save-button-disabled',
          selected: document.querySelector('[data-testid="collections-frontend-template-select"]')?.value || '',
          summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
          busyText: document.body?.innerText?.includes('Loading') || false,
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    await sleep(250);
  }
  assert(clicked.ok, `Unable to save captured collection template selection: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collection = await fetchCollection(collectionId);
    if (
      collection?.metadata?.frontendDesignTemplateId === FRONTEND_COLLECTION_TEMPLATE_ID &&
      collection?.metadata?.frontendDesignTemplateName === FRONTEND_COLLECTION_TEMPLATE_NAME &&
      collection?.metadata?.frontendDesignSource?.label === 'Smoke collections frontend' &&
      Array.isArray(collection?.metadata?.frontendDesignBindingHints)
    ) {
      return collection;
    }
    await sleep(250);
  }

  throw new Error('Captured collection template selection did not persist');
};

const captureAuthoredTemplatesThroughUi = async (client, collectionId, { listPageId, itemPageId }) => {
  for (const [kind, pageId] of [['list', listPageId], ['item', itemPageId]]) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const captured = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-capture"]`)});
        const select = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-select"]`)});
        const panel = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template"]`)});
        const bodyText = document.body?.innerText || '';
        const panelText = panel?.textContent || '';
        if (panelText.includes('Captured') && panelText.includes('root elements')) {
          return { ok: true, reason: 'captured', selected: select instanceof HTMLSelectElement ? select.value : '', text: panelText };
        }
        if (!(select instanceof HTMLSelectElement)) {
          return { ok: false, reason: 'select-missing' };
        }
        const hasOption = Array.from(select.options).some((option) => option.value === ${JSON.stringify(pageId)});
        if (!hasOption) {
          return { ok: false, reason: 'page-option-missing', options: Array.from(select.options).map((option) => option.value) };
        }
        if (select.value !== ${JSON.stringify(pageId)}) {
          const previousValue = select.value;
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          setter?.call(select, ${JSON.stringify(pageId)});
          select._valueTracker?.setValue(previousValue);
          select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          return { ok: false, reason: 'select-updated', value: select.value };
        }
        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false, reason: 'capture-button-missing' };
        }
        if (button.disabled) {
          return {
            ok: false,
            reason: 'capture-button-disabled',
            selected: select.value,
            title: button.title || '',
            text: panel?.textContent || '',
            body: bodyText.slice(0, 1200),
          };
        }
        window.__backyCollectionsCaptureClicks = window.__backyCollectionsCaptureClicks || {};
        const lastClickAt = Number(window.__backyCollectionsCaptureClicks[${JSON.stringify(kind)}] || 0);
        if (lastClickAt && Date.now() - lastClickAt < 2500) {
          return { ok: false, reason: 'waiting-after-click', selected: select.value, text: panelText };
        }
        window.__backyCollectionsCaptureClicks[${JSON.stringify(kind)}] = Date.now();
        button.click();
        return {
          ok: false,
          reason: 'capture-clicked',
          selected: select.value,
          buttonText: button.textContent || '',
          text: panelText,
        };
      })()`);
      if (captured.ok) break;
      if (attempt === 79) {
        throw new Error(`Unable to capture ${kind} authored template page: ${JSON.stringify(captured)}`);
      }
      await sleep(250);
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template"]`)});
        const compare = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-template-compare"]`)});
        const compareSelect = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-template-compare-select"]`)});
        const diffSummary = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-template-diff-summary"]`)});
        const select = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-select"]`)});
        const button = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-capture"]`)});
        const bodyText = document.body?.innerText || '';
        return {
          text: panel?.textContent || '',
          compareText: compare?.textContent || '',
          selectReady: compareSelect instanceof HTMLSelectElement && compareSelect.options.length > 0 && !compareSelect.disabled,
          diffText: diffSummary?.textContent || '',
          selected: select instanceof HTMLSelectElement ? select.value : '',
          buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
          noticeText: document.querySelector('[data-testid="collections-success-notice"]')?.textContent || '',
          captureError: bodyText.includes('Choose a ${kind} template page before capturing its canvas.')
            ? 'Choose a ${kind} template page before capturing its canvas.'
            : bodyText.includes('The selected ${kind} template page has no canvas elements to capture.')
              ? 'The selected ${kind} template page has no canvas elements to capture.'
              : '',
          body: bodyText.slice(0, 1600),
        };
      })()`);
      if (
        state.text.includes('Captured') &&
        state.text.includes('root elements') &&
        state.compareText.includes('Compare active capture') &&
        state.selectReady &&
        state.diffText.includes(`${kind === 'list' ? 'List' : 'Item'} template diff`)
      ) break;
      if (attempt === 79) {
        throw new Error(`${kind} authored template capture did not update panel: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }
  }

  const clicked = await evaluate(client, `(() => {
    const form = document.querySelector('#collections-schema');
    const button = form
      ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
      : null;
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };
    if (button.disabled) return { ok: false, reason: 'save-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to save authored template selection: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collection = await fetchCollection(collectionId);
    const dynamicTemplates = collection?.metadata?.dynamicTemplates;
    if (
      dynamicTemplates?.list?.authoredCanvas?.pageId === listPageId &&
      dynamicTemplates?.item?.authoredCanvas?.pageId === itemPageId &&
      Array.isArray(dynamicTemplates.list.authoredCanvas.elements) &&
      Array.isArray(dynamicTemplates.item.authoredCanvas.elements) &&
      Array.isArray(dynamicTemplates.list.authoredHistory) &&
      Array.isArray(dynamicTemplates.item.authoredHistory) &&
      dynamicTemplates.list.authoredHistory.some((entry) => entry?.pageId === listPageId && entry?.version >= 1) &&
      dynamicTemplates.item.authoredHistory.some((entry) => entry?.pageId === itemPageId && entry?.version >= 1)
    ) {
      return collection;
    }
    await sleep(250);
  }

  throw new Error('Authored dynamic template selection did not persist');
};

const assertAuthoredDynamicTemplateRender = async ({
  collectionId,
  collectionSlug,
  collectionName,
  recordSlug,
  recordTitle,
  expectedSummary = 'Record created by the Collections smoke test.',
}) => {
  const listPayload = await requestApi(`/api/sites/${SITE_ID}/render?path=${encodeURIComponent(`/${collectionSlug}`)}`);
  const listElements = listPayload.data?.content?.elements || [];
  const listRoot = listElements.find((element) => element.id === 'authored-dynamic-list-root');
  const listTitle = listRoot?.children?.find((element) => element.id === 'authored-dynamic-list-title');
  const listRepeater = listRoot?.children?.find((element) => element.id === 'authored-dynamic-list-repeater');
  assert(listPayload.data?.route?.type === 'dynamicList', `Authored list route did not render dynamic list: ${JSON.stringify(listPayload.data?.route)}`);
  assert(listTitle?.props?.content === collectionName, `Authored list title was not bound to collection name: ${JSON.stringify(listTitle)}`);
  assert(listRepeater?.props?.collectionId === collectionId, `Authored list repeater was not bound to collection id: ${JSON.stringify(listRepeater)}`);

  const itemPayload = await requestApi(`/api/sites/${SITE_ID}/render?path=${encodeURIComponent(`/${collectionSlug}/${recordSlug}`)}`);
  const itemElements = itemPayload.data?.content?.elements || [];
  const itemRoot = itemElements.find((element) => element.id === 'authored-dynamic-item-root');
  const itemTitle = itemRoot?.children?.find((element) => element.id === 'authored-dynamic-item-title');
  const itemSummary = itemRoot?.children?.find((element) => element.id === 'authored-dynamic-item-summary');
  assert(itemPayload.data?.route?.type === 'dynamicItem', `Authored item route did not render dynamic item: ${JSON.stringify(itemPayload.data?.route)}`);
  assert(itemTitle?.props?.content === recordTitle, `Authored item title was not bound to record title: ${JSON.stringify(itemTitle)}`);
  assert(
    `${itemSummary?.props?.content || ''} ${itemSummary?.props?.html || ''}`.includes(expectedSummary),
    `Authored item summary was not bound to record summary: ${JSON.stringify(itemSummary)}`,
  );
  assert(
    itemPayload.data?.dataBindings?.datasets?.some((dataset) => (
      dataset.collectionId === collectionId &&
      dataset.records?.some((record) => record.slug === recordSlug)
    )),
    'Authored item render did not include collection dataset manifest',
  );
};

const publishRecordThroughUi = async (client, recordSlug) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const selected = await evaluate(client, `(() => {
      const checkbox = Array.from(document.querySelectorAll('input')).find((input) => (
        (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
      ));
      if (!(checkbox instanceof HTMLInputElement)) {
        return { ok: false, reason: 'record-checkbox-missing', body: document.body?.innerText?.slice(0, 800) || '' };
      }
      if (checkbox.disabled) return { ok: false, reason: 'record-checkbox-disabled' };
      if (!checkbox.checked) checkbox.click();
      return { ok: true, checked: checkbox.checked };
    })()`);
    if (selected.ok) break;
    if (attempt === 79) {
      throw new Error(`Unable to select collection record: ${JSON.stringify(selected)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="collections-record-bulk-toolbar"]')) &&
        (document.querySelector('[data-testid="collections-record-bulk-toolbar"]')?.textContent || '').includes('1 selected'),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.ready) break;
    if (attempt === 79) {
      throw new Error(`Selected collection record toolbar did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const bulkActionStatus = await evaluate(client, `(() => {
    const toolbar = document.querySelector('[data-testid="collections-record-bulk-toolbar"]');
    const status = document.querySelector('[data-testid="collections-record-bulk-action-status"]');
    const publish = document.querySelector('[data-testid="collections-record-bulk-publish"]');
    const draft = document.querySelector('[data-testid="collections-record-bulk-draft"]');
    const archive = document.querySelector('[data-testid="collections-record-bulk-archive"]');
    const clear = document.querySelector('[data-testid="collections-record-bulk-clear-selection"]');
    const del = document.querySelector('[data-testid="collections-record-bulk-delete"]');
    return {
      role: toolbar?.getAttribute('role') || '',
      label: toolbar?.getAttribute('aria-label') || '',
      describedBy: toolbar?.getAttribute('aria-describedby') || '',
      statusId: status?.id || '',
      statusText: status?.textContent?.trim() || '',
      dataStatus: toolbar?.getAttribute('data-action-status') || '',
      publishState: publish?.getAttribute('data-action-state') || '',
      draftState: draft?.getAttribute('data-action-state') || '',
      archiveState: archive?.getAttribute('data-action-state') || '',
      clearState: clear?.getAttribute('data-action-state') || '',
      deleteState: del?.getAttribute('data-action-state') || '',
      publishReason: publish?.getAttribute('data-disabled-reason') || '',
      deleteReason: del?.getAttribute('data-disabled-reason') || '',
      publishDescribedBy: publish?.getAttribute('aria-describedby') || '',
      deleteDescribedBy: del?.getAttribute('aria-describedby') || '',
      body: document.body?.innerText?.slice(0, 1000) || '',
    };
  })()`);
  assert(bulkActionStatus.role === 'group', `Collection bulk toolbar must expose an action group: ${JSON.stringify(bulkActionStatus)}`);
  assert(bulkActionStatus.label === 'Selected collection record actions', `Collection bulk toolbar has the wrong accessible label: ${JSON.stringify(bulkActionStatus)}`);
  assert(bulkActionStatus.describedBy && bulkActionStatus.describedBy === bulkActionStatus.statusId, `Collection bulk toolbar must reference its hidden action status: ${JSON.stringify(bulkActionStatus)}`);
  assert(bulkActionStatus.dataStatus === bulkActionStatus.statusText, `Collection bulk toolbar data status must mirror hidden text: ${JSON.stringify(bulkActionStatus)}`);
  assert(
    bulkActionStatus.statusText.includes('Publish selected available for 1 selected record.') &&
      bulkActionStatus.statusText.includes('Draft selected available for 1 selected record.') &&
      bulkActionStatus.statusText.includes('Archive selected available for 1 selected record.') &&
      bulkActionStatus.statusText.includes('Clear selection available for 1 selected record.') &&
      bulkActionStatus.statusText.includes('Delete selected available for 1 selected record.'),
    `Collection bulk toolbar status did not explain ready actions: ${JSON.stringify(bulkActionStatus)}`,
  );
  assert(
    bulkActionStatus.publishState === 'ready' &&
      bulkActionStatus.draftState === 'ready' &&
      bulkActionStatus.archiveState === 'ready' &&
      bulkActionStatus.clearState === 'ready' &&
      bulkActionStatus.deleteState === 'ready' &&
      !bulkActionStatus.publishReason &&
      !bulkActionStatus.deleteReason &&
      bulkActionStatus.publishDescribedBy === bulkActionStatus.statusId &&
      bulkActionStatus.deleteDescribedBy === bulkActionStatus.statusId,
    `Collection bulk toolbar action states are wrong: ${JSON.stringify(bulkActionStatus)}`,
  );

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="collections-record-bulk-publish"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'publish-button-missing',
        toolbar: document.querySelector('[data-testid="collections-record-bulk-toolbar"]')?.textContent || '',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent?.trim()).filter(Boolean).slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'publish-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to publish selected collection record: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const details = document.querySelector('[data-testid="collections-audit-details"]');
      if (details instanceof HTMLDetailsElement) details.open = true;
      const body = document.body?.innerText || '';
      const auditText = details?.textContent || '';
      return {
        ready: body.includes('records moved to published') ||
          body.includes('1 records moved to published') ||
          false,
        hasPublishedBadge: body.includes('Published') || false,
        hasRecordAudit: auditText.includes('Collection record bulk-updated') &&
          auditText.includes('bulk updateStatus'),
        body: body.slice(0, 1000),
        auditText: auditText.slice(0, 1000),
      };
    })()`);
    if ((state.ready || state.hasPublishedBadge) && state.hasRecordAudit) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Collection record publish action did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-collections-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, collectionIds, pageIds, siteIds, originalFrontendDesign }) => {
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

  for (const collectionId of collectionIds || []) {
    if (collectionId) {
      try {
        await deleteCollection(collectionId);
      } catch {
        // The smoke creates temporary collections and deletes them best-effort.
      }
    }
  }

  for (const pageId of pageIds || []) {
    if (pageId) {
      try {
        await deletePage(pageId);
      } catch {
        // The smoke creates temporary pages and deletes them best-effort.
      }
    }
  }

  for (const siteId of siteIds || []) {
    if (siteId) {
      try {
        await deleteSite(siteId);
      } catch {
        // The smoke creates temporary sites and deletes them best-effort.
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
  let collectionId;
  let targetCollectionId;
  let incomingCollectionId;
  let frontendTemplateCollectionId;
  let draftCollectionId;
  let authoredListPageId;
  let authoredItemPageId;
  let emptyCollectionsSiteId;
  let originalFrontendDesign;
  const suffix = Date.now().toString(36);
  const collectionName = `Smoke Directory ${suffix}`;
  const collectionSlug = `smoke-directory-${suffix}`;
  const targetCollectionName = `Smoke Target ${suffix}`;
  const targetCollectionSlug = `smoke-target-${suffix}`;
  const incomingCollectionName = `Smoke Related ${suffix}`;
  const incomingCollectionSlug = `smoke-related-${suffix}`;
  const recordSlug = `smoke-record-${suffix}`;
  const recordTitle = `Smoke record ${suffix}`;

  try {
    assertCollectionsRouteSourceContract();
    if (process.env.BACKY_COLLECTIONS_SOURCE_ONLY === '1') {
      console.log(JSON.stringify({ ok: true, mode: 'source-only', route: 'collections' }, null, 2));
      return;
    }

    await loginAdminApi();
    await assertCollectionBillingLimitEnforced(suffix);
    const emptyCollectionsSite = await createSite({
      name: `Smoke empty collections ${suffix}`,
      slug: `smoke-empty-collections-${suffix}`,
    });
    emptyCollectionsSiteId = emptyCollectionsSite.id;

    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());

    const targetCollection = await createCollection({ name: targetCollectionName, slug: targetCollectionSlug });
    targetCollectionId = targetCollection.id;

    const collection = await createCollection({
      name: collectionName,
      slug: collectionSlug,
      extraFields: [
        {
          key: 'related_target',
          label: 'Related target',
          type: 'reference',
          required: false,
          unique: false,
          sortOrder: 60,
          referenceCollectionId: targetCollection.id,
        },
        {
          key: 'hero_image',
          label: 'Hero image',
          type: 'image',
          required: false,
          unique: false,
          sortOrder: 70,
        },
        {
          key: 'gallery_files',
          label: 'Gallery files',
          type: 'file',
          required: false,
          unique: false,
          sortOrder: 80,
          validation: { multiple: true, maxItems: 2 },
        },
      ],
    });
    collectionId = collection.id;
    const incomingCollection = await createCollection({
      name: incomingCollectionName,
      slug: incomingCollectionSlug,
      extraFields: [
        {
          key: 'directory_ref',
          label: 'Directory reference',
          type: 'reference',
          required: false,
          unique: false,
          sortOrder: 60,
          referenceCollectionId: collection.id,
        },
      ],
    });
    incomingCollectionId = incomingCollection.id;
    await createRecord({ collectionId, slug: recordSlug, title: recordTitle });
    const authoredListPage = await createAuthoredTemplatePage({ kind: 'list', suffix });
    authoredListPageId = authoredListPage.id;
    const authoredItemPage = await createAuthoredTemplatePage({ kind: 'item', suffix });
    authoredItemPageId = authoredItemPage.id;

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

    await navigateToEmptyCollections(client, emptyCollectionsSiteId);
    await assertNewCollectionButtonReset(client, 'collections-empty-new-collection-button');
    await tryDeleteSite(emptyCollectionsSiteId);
    emptyCollectionsSiteId = null;

    await navigateToCollections(client, { collectionId, recordSlug });
    await assertCollectionsLayout(client, { collectionId, collectionName, collectionSlug, recordSlug, targetCollectionName, incomingCollectionName });
    await assertCollectionRecordMediaFieldsThroughUi(client, collectionId, recordSlug);
    await assertAuthoringShortcutCopy(client);
    await assertCollectionBackupControls(client, collectionId);
    await navigateToCollections(client, { collectionId, recordSlug });
    const visitorWriteToken = `smoke-public-write-${suffix}`;
    await configureVisitorMutationPolicyThroughUi(client, collectionId, visitorWriteToken);
    const visitorMutationResult = await assertVisitorMutationPolicyPublicApi({
      collectionId,
      collectionSlug,
      recordSlug,
      token: visitorWriteToken,
      suffix,
    });
    await assertNewCollectionButtonReset(client, 'collections-new-collection-button');
    await navigateToCollections(client, { collectionId, recordSlug });
    await assertNewCollectionButtonReset(client, 'collections-library-new-collection-button');
    const draftCollection = await createDraftCollectionWithCustomFieldThroughUi(client, suffix);
    draftCollectionId = draftCollection.id;
    await navigateToCollections(client, { collectionId, recordSlug });
    await assertNewRecordButtonReset(client, recordSlug);
    await navigateToCollections(client, { collectionId, recordSlug });
    await captureAuthoredTemplatesThroughUi(client, collectionId, { listPageId: authoredListPageId, itemPageId: authoredItemPageId });
    await publishRecordThroughUi(client, recordSlug);
    await waitForRecordStatus(collectionId, recordSlug, 'published');
    await assertAuthoredDynamicTemplateRender({
      collectionId,
      collectionSlug,
      collectionName,
      recordSlug,
      recordTitle,
      expectedSummary: visitorMutationResult.updatedSummary,
    });
    await assertPublicRecord(collectionSlug, recordSlug);
    await attachFrontendTemplateThroughUi(client, collectionId);
    const frontendTemplateCollection = await createFrontendTemplateCollectionThroughUi(client);
    frontendTemplateCollectionId = frontendTemplateCollection.id;
    await navigateToCollections(client, { collectionId, recordSlug });

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteCollection(incomingCollectionId);
    incomingCollectionId = null;
    await deleteCollection(collectionId);
    collectionId = null;
    await deleteCollection(targetCollectionId);
    targetCollectionId = null;
    await deleteCollection(frontendTemplateCollectionId);
    frontendTemplateCollectionId = null;
    await deleteCollection(draftCollectionId);
    draftCollectionId = null;
    await deletePage(authoredListPageId);
    authoredListPageId = null;
    await deletePage(authoredItemPageId);
    authoredItemPageId = null;
    await patchFrontendDesign(originalFrontendDesign);
    originalFrontendDesign = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      collectionName,
      collectionSlug,
      recordSlug,
      frontendTemplateCollectionId: frontendTemplateCollection.id,
      draftCollectionId: draftCollection.id,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      collectionIds: [incomingCollectionId, collectionId, targetCollectionId, frontendTemplateCollectionId, draftCollectionId],
      pageIds: [authoredListPageId, authoredItemPageId],
      siteIds: [emptyCollectionsSiteId],
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
