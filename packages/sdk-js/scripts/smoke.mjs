#!/usr/bin/env node

import { createBackyClient } from '../dist/index.js';

const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const configuredIdentifier = process.env.BACKY_SDK_SITE_IDENTIFIER || '';
const runWriteSmoke = process.env.BACKY_SDK_SKIP_WRITE_SMOKE !== '1';
const configuredAdminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
let adminRequestApiKey = configuredAdminApiKey;
let adminSessionToken = '';
let cleanupOwnerSession = null;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function endpointPath(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.includes('#')) {
    return null;
  }
  return endpoint.split('?')[0];
}

function assertManifestEndpointsDocumented(manifestData, openapiDocument) {
  const endpoints = manifestData?.endpoints || {};
  const paths = openapiDocument?.paths || {};
  const missing = Object.entries(endpoints)
    .map(([key, value]) => [key, endpointPath(value)])
    .filter(([, path]) => path && !paths[path])
    .map(([key, path]) => `${key}:${path}`);

  assert(
    missing.length === 0,
    `openapi() is missing manifest-advertised endpoint paths: ${missing.join(', ')}`,
  );
}

function assertCommerceProviderCertification(commerce, label) {
  const certification = commerce?.providerCertification;
  assert(certification, `${label} missing commerce provider certification handoff`);
  assert(
    certification.schemaVersion === 'backy.commerce-provider-certification-handoff.v1',
    `${label} provider certification schema drifted`,
  );
  assert(certification.status === 'external-live-provider-gate', `${label} missing live-provider gate status`);
  assert(certification.localMockGate === 'ci:commerce-provider-smoke', `${label} missing mock provider gate`);
  assert(certification.liveCertificationGate === 'ci:commerce-provider-certification', `${label} missing live provider certification gate`);
  assert(certification.requiredFor === 'live-commerce-provider-launch', `${label} missing live launch requirement`);
  assert(
    typeof certification.secretHandling === 'string' &&
      certification.secretHandling.includes('Provider credentials stay in server environment/configuration'),
    `${label} missing non-secret credential handling guidance`,
  );
  assert(typeof certification.runtime?.paymentConfigured === 'boolean', `${label} missing payment provider runtime readiness`);
  assert(typeof certification.runtime?.taxConfigured === 'boolean', `${label} missing tax provider runtime readiness`);
  assert(typeof certification.runtime?.shippingConfigured === 'boolean', `${label} missing shipping provider runtime readiness`);
  assert(typeof certification.runtime?.catalogSyncConfigured === 'boolean', `${label} missing catalog provider runtime readiness`);
  assert(typeof certification.runtime?.subscriptionConfigured === 'boolean', `${label} missing subscription provider runtime readiness`);
  assert(typeof certification.runtime?.webhookSecretConfigured === 'boolean', `${label} missing webhook secret runtime readiness`);
  assert(Array.isArray(certification.runtime?.configuredFamilies), `${label} missing configured provider-family runtime list`);
  assert(Array.isArray(certification.runtime?.missingFamilies), `${label} missing missing provider-family runtime list`);
  assert(
    typeof certification.runtime?.secretHandling === 'string' &&
      certification.runtime.secretHandling.includes('Provider secret values are never returned'),
    `${label} missing non-secret runtime credential boundary`,
  );

  const groups = Array.isArray(certification.groups) ? certification.groups : [];
  const families = groups.map((group) => group.family);
  const providers = groups.flatMap((group) => (Array.isArray(group.providers) ? group.providers : []));
  const requiredInputs = groups.flatMap((group) => (Array.isArray(group.requiredInputs) ? group.requiredInputs : []));
  for (const family of [
    'Checkout and payment settlement',
    'Tax quote providers',
    'Shipping rate, label, and tracking providers',
    'Discount quote providers',
    'Catalog sync providers',
    'Subscription lifecycle providers',
    'Mock provider regression',
  ]) {
    assert(families.includes(family), `${label} missing certification family ${family}`);
  }
  for (const provider of [
    'Stripe webhooks',
    'TaxJar',
    'Avalara',
    'EasyPost',
    'Shippo',
    'Stripe promotion codes',
    'Magento',
    'Razorpay',
    'Local provider mocks',
  ]) {
    assert(providers.includes(provider), `${label} missing certification provider ${provider}`);
  }
  for (const requiredInput of [
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
  ]) {
    assert(requiredInputs.includes(requiredInput), `${label} missing certification required input ${requiredInput}`);
  }
}

async function request(path, init) {
  const headers = new Headers(init?.headers || {});

  if (path.startsWith('/api/admin/')) {
    if (adminRequestApiKey && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
      headers.set('x-backy-admin-key', adminRequestApiKey);
    } else if (adminSessionToken && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${adminSessionToken}`);
    }
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
    // Keep null JSON for clear assertion failures below.
  }

  return { response, json, text, url: `${baseUrl}${path}` };
}

function parseAllowedEmailDomains(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, ''))
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, ''))
    .filter(Boolean);
}

async function loginAdminApi() {
  if (adminRequestApiKey || adminSessionToken) {
    return;
  }

  const login = (twoFactorCode) => fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });
  let response = await login();
  let json = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_SDK_MFA_CODE
    || process.env.BACKY_ADMIN_CONTRACT_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && json.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    json = await response.json().catch(() => ({}));
  }

  if (!response.ok || json.success === false || !json.data?.session?.token) {
    throw new Error(`Unable to create admin session for SDK smoke: ${JSON.stringify(json).slice(0, 500)}`);
  }

  adminSessionToken = json.data.session.token;
}

async function getCleanupOwnerEmailDomain() {
  const configuredDomain = process.env.BACKY_ADMIN_EMAIL_DOMAIN
    || process.env.BACKY_SDK_ADMIN_EMAIL_DOMAIN;
  if (configuredDomain) {
    return configuredDomain.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '') || 'backy.test';
  }

  const settings = await request('/api/admin/settings').catch(() => null);
  const allowedDomains = parseAllowedEmailDomains(settings?.json?.data?.settings?.auth?.allowedEmailDomains);
  return allowedDomains[0] || 'backy.test';
}

function adminClientHeaders() {
  if (adminRequestApiKey) {
    return { 'x-backy-admin-key': adminRequestApiKey };
  }

  if (adminSessionToken) {
    return { authorization: `Bearer ${adminSessionToken}` };
  }

  return {};
}

async function createSdkSmokeFixture() {
  await loginAdminApi();

  const unique = Date.now();
  const siteSlug = `sdk-smoke-site-${unique}`;
  const pageSlug = `sdk-smoke-page-${unique}`;
  const collectionSlug = `sdk-smoke-collection-${unique}`;
  const publicWriteToken = `sdk-public-write-${unique}`;

  const site = await request('/api/admin/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Site',
      slug: siteSlug,
      description: 'Temporary site for SDK write smoke.',
      status: 'published',
    }),
  });
  assert(site.response.status === 201, `${site.url} expected site create 201, got ${site.response.status}`);
  const siteId = site.json?.data?.site?.id;
  assert(siteId, 'temporary SDK smoke site missing id');

  const collection = await request(`/api/admin/sites/${siteId}/collections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Collection',
      slug: collectionSlug,
      status: 'published',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
        { key: 'summary', label: 'Summary', type: 'richText' },
        { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
      ],
      permissions: {
        publicRead: true,
        publicCreate: true,
        publicUpdate: true,
        publicDelete: true,
      },
      metadata: {
        visitorWritePolicy: {
          publicWriteToken,
          updateFieldMode: 'selected',
          allowedUpdateFields: ['summary', 'category'],
        },
      },
    }),
  });
  assert(collection.response.status === 201, `${collection.url} expected collection create 201, got ${collection.response.status}`);
  const collectionId = collection.json?.data?.collection?.id;
  assert(collectionId, 'temporary SDK smoke collection missing id');

  const publishedRecordSlug = `sdk-published-record-${unique}`;
  const publishedRecord = await request(`/api/admin/sites/${siteId}/collections/${collectionId}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: publishedRecordSlug,
      status: 'published',
      values: {
        title: 'SDK Published Record',
        summary: 'Published record for SDK cached reads.',
        category: 'Featured',
      },
    }),
  });
  assert(publishedRecord.response.status === 201, `${publishedRecord.url} expected record create 201, got ${publishedRecord.response.status}`);
  const publishedRecordId = publishedRecord.json?.data?.record?.id;
  assert(publishedRecordId, 'temporary SDK smoke published record missing id');

  const page = await request(`/api/admin/sites/${siteId}/pages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'SDK Smoke Page',
      slug: pageSlug,
      status: 'published',
      content: {
        elements: [
          {
            id: 'sdk-smoke-form',
            type: 'form',
            x: 80,
            y: 80,
            width: 520,
            height: 360,
            props: {
              formId: 'sdk-smoke-form',
              formTitle: 'SDK Smoke Form',
              formActive: true,
              moderationMode: 'auto-approve',
              enableHoneypot: false,
              contactShareEnabled: true,
              contactShareNameField: 'title',
              contactShareNotesField: 'message',
              contactShareDedupeByEmail: true,
              collectionWriteEnabled: true,
              collectionWriteCollectionId: collectionId,
              collectionWriteSlugField: 'title',
              collectionWriteFieldMap: {
                title: 'title',
                message: 'summary',
                category: 'category',
              },
            },
            children: [
              {
                id: 'sdk-smoke-form-title',
                type: 'input',
                x: 0,
                y: 0,
                width: 420,
                height: 44,
                props: { name: 'title', placeholder: 'Title', required: true },
              },
              {
                id: 'sdk-smoke-form-message',
                type: 'textarea',
                x: 0,
                y: 64,
                width: 420,
                height: 120,
                props: { name: 'message', placeholder: 'Message' },
              },
              {
                id: 'sdk-smoke-form-category',
                type: 'select',
                x: 0,
                y: 204,
                width: 260,
                height: 44,
                props: { name: 'category', options: ['Featured', 'Standard'] },
              },
            ],
          },
        ],
        canvasSize: { width: 1200, height: 760 },
      },
    }),
  });
  assert(page.response.status === 201, `${page.url} expected page create 201, got ${page.response.status}`);
  const pageId = page.json?.data?.page?.id;
  assert(pageId, 'temporary SDK smoke page missing id');
  const redirectPath = `/sdk-old-${pageSlug}`;
  const gonePath = `/sdk-retired-${pageSlug}`;

  const routeSettings = await request(`/api/admin/sites/${siteId}/redirects`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirectRules: [
        {
          id: 'sdk-smoke-redirect',
          from: redirectPath,
          to: `/${pageSlug}`,
          statusCode: 301,
          enabled: true,
        },
        {
          id: 'sdk-smoke-gone',
          from: gonePath,
          statusCode: 410,
          enabled: true,
        },
      ],
    }),
  });
  assert(routeSettings.response.status === 200, `${routeSettings.url} expected redirect settings update 200`);

  const navigationSettings = await request(`/api/admin/sites/${siteId}/navigation`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      primary: [
        {
          id: 'sdk-smoke-nav-page',
          type: 'page',
          pageId,
          label: 'SDK Smoke Page',
          children: [
            {
              id: 'sdk-smoke-nav-child',
              type: 'route',
              label: 'SDK Child',
              path: `/${pageSlug}#child`,
            },
          ],
        },
        {
          id: 'sdk-smoke-nav-docs',
          type: 'url',
          label: 'SDK Docs',
          href: 'https://example.com/sdk',
          target: '_blank',
        },
      ],
    }),
  });
  assert(navigationSettings.response.status === 200, `${navigationSettings.url} expected navigation settings update 200`);

  const reusableSection = await request(`/api/admin/sites/${siteId}/reusable-sections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Reusable Section',
      slug: `sdk-smoke-section-${unique}`,
      description: 'Temporary reusable section for SDK smoke.',
      category: 'layout',
      tags: ['sdk', 'template'],
      content: {
        canvasSize: { width: 720, height: 240 },
        elements: [
          {
            id: 'sdk-smoke-section-root',
            type: 'section',
            x: 0,
            y: 0,
            width: 720,
            height: 240,
            zIndex: 1,
            props: { backgroundColor: '#f8fafc' },
            children: [
              {
                id: 'sdk-smoke-section-heading',
                type: 'heading',
                x: 48,
                y: 48,
                width: 520,
                height: 72,
                zIndex: 1,
                props: { content: 'SDK reusable section', level: 'h2' },
              },
            ],
          },
        ],
      },
    }),
  });
  assert(reusableSection.response.status === 201, `${reusableSection.url} expected reusable section create 201, got ${reusableSection.response.status}`);
  const reusableSectionId = reusableSection.json?.data?.section?.id;
  assert(reusableSectionId, 'temporary SDK smoke reusable section missing id');

  return {
    siteId,
    siteSlug,
    pageId,
    pageSlug,
    redirectPath,
    gonePath,
    collectionId,
    publishedRecordId,
    publishedRecordSlug,
    publicWriteToken,
    reusableSectionId,
  };
}

async function getCleanupOwnerSession() {
  if (cleanupOwnerSession) {
    return cleanupOwnerSession;
  }

  await loginAdminApi();

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmailDomain = await getCleanupOwnerEmailDomain();
  const user = await request('/api/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'SDK Smoke Cleanup Owner',
      email: `sdk-smoke-owner-${unique}@${adminEmailDomain}`,
      role: 'owner',
      status: 'invited',
      createInvite: true,
    }),
  });
  assert(user.response.status === 201, `${user.url} expected cleanup owner create 201, got ${user.response.status}: ${JSON.stringify(user.json || user.text).slice(0, 500)}`);
  const userId = user.json?.data?.user?.id;
  const inviteToken = user.json?.data?.invite?.token;
  assert(userId && inviteToken, 'cleanup owner creation did not return user and invite token');

  const accepted = await request('/api/admin/auth/accept-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: inviteToken }),
  });
  assert(accepted.response.status === 200, `${accepted.url} expected cleanup owner invite accept 200, got ${accepted.response.status}`);
  const token = accepted.json?.data?.session?.token;
  assert(token, 'cleanup owner invite acceptance did not return a session token');

  cleanupOwnerSession = { userId, token };
  return cleanupOwnerSession;
}

async function deleteFixture(siteId) {
  if (!siteId) {
    return;
  }

  const owner = await getCleanupOwnerSession();
  try {
    const deleted = await request(`/api/admin/sites/${siteId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert(deleted.response.status === 200, `${deleted.url} expected fixture site delete 200, got ${deleted.response.status}: ${JSON.stringify(deleted.json || deleted.text).slice(0, 500)}`);
  } finally {
    const deletedOwner = await request(`/api/admin/users/${owner.userId}`, { method: 'DELETE' }).catch((error) => ({ error }));
    assert(!deletedOwner?.error, `cleanup owner delete failed: ${deletedOwner?.error?.message || deletedOwner?.error}`);
    cleanupOwnerSession = null;
  }
}

const client = createBackyClient({
  baseUrl,
  requestIdFactory: () => 'sdk-smoke-request',
});

let identifier = configuredIdentifier;
if (!identifier) {
  const sites = await client.sites();
  const publishedSites = sites.data.sites.filter((candidate) => candidate.isPublished !== false);
  const firstSite = publishedSites.find((candidate) => candidate.slug === 'demo' || candidate.id === 'site-demo') || publishedSites[0];
  assert(firstSite?.slug || firstSite?.id, 'sites() did not return a published site to smoke');
  identifier = String(firstSite.slug || firstSite.id);
}

const site = await client.discoverSite(identifier);
assert(site.data.site?.id, 'discoverSite() did not return a site id');

const manifest = await client.manifest();
assert(manifest.data.capabilities?.renderPayload === true, 'manifest() missing render payload capability');
assert(typeof manifest.data.endpoints?.render === 'string', 'manifest() missing render endpoint');
assertCommerceProviderCertification(manifest.data.modules?.commerce, 'manifest() commerce module');
assert(manifest.data.capabilities?.interactiveComponents === true, 'manifest() missing interactive component capability');
assert(manifest.data.endpoints?.interactiveComponents === `/api/sites/${site.data.site.id}/interactive-components`, 'manifest() missing interactive component registry endpoint');
assert(manifest.data.endpoints?.interactiveRuntimeEvents === `/api/sites/${site.data.site.id}/interactive-components/runtime-events`, 'manifest() missing interactive runtime event endpoint');
assert(manifest.data.modules?.interactiveComponents?.schemaVersion === 'backy.interactive-components.v1', 'manifest() missing interactive component contract');
assert(manifest.data.modules?.interactiveComponents?.elementTypes?.includes('interactiveFigure'), 'manifest() missing interactiveFigure element type');
assert(manifest.data.modules?.interactiveComponents?.elementTypes?.includes('codeComponent'), 'manifest() missing codeComponent element type');
assert(manifest.data.modules?.interactiveComponents?.renderContract?.fallbackRequired === true, 'manifest() missing interactive fallback requirement');
assert(manifest.data.modules?.interactiveComponents?.security?.adminApiAccess === false, 'manifest() interactive contract should deny admin API access');
assert(manifest.data.modules?.interactiveComponents?.sandbox?.responseHeaders?.contentSecurityPolicy?.includes("default-src 'none'"), 'manifest() missing sandbox CSP response-header contract');
assert(manifest.data.modules?.interactiveComponents?.sandbox?.responseHeaders?.permissionsPolicy?.includes('camera=()'), 'manifest() missing sandbox permissions response-header contract');
const interactiveComponents = await client.interactiveComponents();
assert(interactiveComponents.data.schemaVersion === 'backy.interactive-component-registry.v1', 'interactiveComponents() missing registry schema');
assert(interactiveComponents.data.contract?.schemaVersion === 'backy.interactive-components.v1', 'interactiveComponents() missing manifest contract');
assert(interactiveComponents.data.contract?.sandbox?.responseHeaders?.contentSecurityPolicy?.includes("object-src 'none'"), 'interactiveComponents() missing sandbox CSP response-header contract');
assert(interactiveComponents.data.contract?.sandbox?.responseHeaders?.permissionsPolicy?.includes('microphone=()'), 'interactiveComponents() missing sandbox permissions response-header contract');
assert(interactiveComponents.data.components?.some?.((component) => component.componentKey === 'backy.figure.rounds'), 'interactiveComponents() missing communication rounds figure');
const sandboxedComponent = interactiveComponents.data.components?.find?.((component) => component.componentKey === 'backy.custom.sandboxed');
assert(sandboxedComponent?.renderMode === 'sandbox-iframe', 'interactiveComponents() missing sandboxed custom component render mode');
assert(sandboxedComponent?.runtime?.sandboxUrl?.includes('/interactive-components/backy.custom.sandboxed/1.0.0/sandbox'), 'interactiveComponents() missing sandbox runtime URL');
assert(sandboxedComponent?.runtime?.postMessageProtocol === 'backy.interactive-component.v1', 'interactiveComponents() missing sandbox postMessage protocol');
assert(interactiveComponents.data.components?.every?.((component) => component.security?.adminApiAccess === false), 'interactiveComponents() should not expose admin API-enabled components');
const interactiveRuntimeEvent = await client.recordInteractiveRuntimeEvent({
  componentKey: 'backy.custom.sandboxed',
  version: '1.0.0',
  elementId: 'sdk-smoke-code-component',
  type: 'backy.interactive-component.error',
  message: 'SDK smoke sandbox runtime error',
  requestId: `sdk-interactive-runtime-${Date.now()}`,
});
assert(interactiveRuntimeEvent.data.recorded === true, 'recordInteractiveRuntimeEvent() did not record runtime telemetry');
const cachedInteractiveComponents = await client.interactiveComponentsCached();
assert(cachedInteractiveComponents.notModified === false, 'interactiveComponentsCached() first request should return a body');
assert(cachedInteractiveComponents.meta.etag, 'interactiveComponentsCached() missing response ETag');
const revalidatedInteractiveComponents = await client.interactiveComponentsCached({ etag: cachedInteractiveComponents.meta.etag });
assert(revalidatedInteractiveComponents.notModified === true, 'interactiveComponentsCached() did not return notModified for matching ETag');
assert(manifest.data.admin?.auth?.authenticated === false, 'manifest() should expose anonymous admin state by default');
assert(manifest.data.admin?.permissions?.['sites.configure'] === false, 'manifest() should not expose site configure permission anonymously');
assert(manifest.data.admin?.capabilities?.frontendDesignWrite === false, 'manifest() should not expose frontend design write anonymously');
const manifestComments = manifest.data.modules?.comments;
assert(manifestComments?.schemaVersion === 'backy.comments-discovery.v1', 'manifest() missing comments discovery module');
assert(manifestComments.endpoints?.list === manifest.data.endpoints.comments, 'manifest() comments discovery list endpoint drifted');
assert(manifestComments.endpoints?.pageComments === manifest.data.endpoints.pageComments, 'manifest() comments discovery page endpoint drifted');
assert(manifestComments.endpoints?.blogComments === manifest.data.endpoints.blogComments, 'manifest() comments discovery blog endpoint drifted');
assert(manifestComments.endpoints?.reportReasons === manifest.data.endpoints.commentReportReasons, 'manifest() comments discovery report-reasons endpoint drifted');
assert(manifestComments.endpoints?.report === manifest.data.endpoints.commentReport, 'manifest() comments discovery report endpoint drifted');
assert(manifestComments.endpoints?.blocklist === `/api/sites/${client.getSiteId()}/comments/blocklist`, 'manifest() comments discovery missing blocklist endpoint');
assert(manifestComments.defaultSort === manifest.data.site.commentPolicy?.sort, 'manifest() comments discovery sort drifted from site policy');
assert(manifestComments.publicListStatus === 'approved', 'manifest() comments discovery must document public approved-list status');
assert(manifestComments.reportReasons?.includes?.('spam'), 'manifest() comments discovery missing spam report reason');
assert(manifestComments.reporting?.reportUrlTemplate === manifest.data.endpoints.commentReport, 'manifest() comments discovery report template drifted');
assert(manifestComments.spamProtection?.honeypotField === 'website', 'manifest() comments discovery missing honeypot field');
assert(manifestComments.spamProtection?.timingField === 'startedAt', 'manifest() comments discovery missing timing field');
const manifestMedia = manifest.data.modules?.media;
assert(manifestMedia?.schemaVersion === 'backy.media-discovery.v1', 'manifest() missing media discovery module');
assert(manifestMedia.endpoints?.list === manifest.data.endpoints.media, 'manifest() media discovery list endpoint drifted');
assert(manifestMedia.endpoints?.folders === `/api/sites/${client.getSiteId()}/media/folders`, 'manifest() media discovery folder endpoint drifted');
assert(manifestMedia.endpoints?.fonts === manifest.data.endpoints.mediaFonts, 'manifest() media discovery font endpoint drifted');
assert(manifestMedia.endpoints?.detail === manifest.data.endpoints.mediaDetail, 'manifest() media discovery detail endpoint drifted');
assert(manifestMedia.endpoints?.file === manifest.data.endpoints.mediaFile, 'manifest() media discovery file endpoint drifted');
assert(manifestMedia.endpoints?.transform === manifest.data.endpoints.mediaTransform, 'manifest() media discovery transform endpoint drifted');
assert(manifestMedia.capabilities?.signedPrivateFiles === true, 'manifest() media discovery missing signed private file capability');
assert(manifestMedia.capabilities?.responsiveImages === true, 'manifest() media discovery missing responsive image capability');
assert(manifestMedia.capabilities?.publicFolderDiscovery === true, 'manifest() media discovery missing public folder capability');
assert(manifestMedia.capabilities?.editableMetadata === true, 'manifest() media discovery missing editable metadata capability');
assert(manifestMedia.filters?.queryParams?.includes?.('folder'), 'manifest() media discovery missing folder filter');
assert(manifestMedia.filters?.queryParams?.includes?.('folderId'), 'manifest() media discovery missing folderId filter');
assert(manifestMedia.filters?.queryParams?.includes?.('search'), 'manifest() media discovery missing search filter');
assert(manifestMedia.filters?.queryParams?.includes?.('tag'), 'manifest() media discovery missing tag filter');
assert(manifestMedia.filters?.queryParams?.includes?.('scope'), 'manifest() media discovery missing scope filter');
assert(manifestMedia.filters?.queryParams?.includes?.('blogId'), 'manifest() media discovery missing blogId filter alias');
assert(manifestMedia.filters?.typeAliases?.file === 'document', 'manifest() media discovery missing file type alias');
assert(manifestMedia.filters?.aliases?.folder === 'folderId', 'manifest() media discovery missing folder alias');
assert(manifestMedia.filters?.maxLimit === 100, 'manifest() media discovery missing max limit');
assert(manifestMedia.filters?.scopes?.includes?.('page') && manifestMedia.filters?.scopes?.includes?.('post'), 'manifest() media discovery missing page/post scope filters');
assert(manifestMedia.methods?.folders === 'GET', 'manifest() media discovery missing folder method');
assert(manifestMedia.cache?.folders === 'public-discovery', 'manifest() media discovery missing folder cache policy');
assert(manifestMedia.schemas?.folders === 'backy.media-folders.v1', 'manifest() media discovery missing folder schema');
const manifestTheme = manifest.data.modules?.theme;
assert(manifestTheme?.schemaVersion === 'backy.theme-discovery.v1', 'manifest() missing theme discovery module');
assert(manifestTheme.tokenSchemaVersion === 'backy.theme.v1', 'manifest() theme discovery missing token schema marker');
assert(manifestTheme.tokens?.schemaVersion === 'backy.theme.v1', 'manifest() theme discovery missing compiled token contract');
assert(manifestTheme.cssVariables?.['--backy-color-primary'], 'manifest() theme discovery missing primary color CSS variable');
assert(manifestTheme.cssVariables?.['--backy-font-heading'], 'manifest() theme discovery missing heading font CSS variable');
assert(manifestTheme.selectors?.root === ':root', 'manifest() theme discovery missing root selector');
assert(manifestTheme.editableFields?.includes?.('colors.primary'), 'manifest() theme discovery missing editable color field');
assert(manifestTheme.capabilities?.cssVariables === true, 'manifest() theme discovery missing CSS variable capability');
assert(manifestTheme.capabilities?.liveEditable === true, 'manifest() theme discovery missing live editable capability');
const manifestLiveManagement = manifest.data.modules?.liveManagement;
assert(manifestLiveManagement?.schemaVersion === 'backy.live-management.v1', 'manifest() missing live-management discovery module');
assert(manifestLiveManagement.endpoints?.page === manifest.data.endpoints.liveManagePage, 'manifest() live-management page endpoint drifted');
assert(manifestLiveManagement.methods?.read === 'GET' && manifestLiveManagement.methods?.update === 'PATCH', 'manifest() live-management methods drifted');
assert(manifestLiveManagement.auth?.requiredPermissions?.read === 'pages.view', 'manifest() live-management missing read permission');
assert(manifestLiveManagement.auth?.requiredPermissions?.update === 'pages.edit', 'manifest() live-management missing update permission');
assert(manifestLiveManagement.auth?.siteScope === true, 'manifest() live-management missing site scope requirement');
assert(manifestLiveManagement.capabilities?.editableMap === true, 'manifest() live-management missing editable map capability');
assert(manifestLiveManagement.capabilities?.optimisticConcurrency === true, 'manifest() live-management missing optimistic concurrency capability');
assert(manifestLiveManagement.editableTargets?.includes?.('props.content'), 'manifest() live-management missing content editable target');
assert(manifestLiveManagement.updateBody?.expectedUpdatedAt, 'manifest() live-management missing expectedUpdatedAt update guidance');
assert(manifestLiveManagement.errors?.conflict === 'PAGE_VERSION_CONFLICT', 'manifest() live-management conflict code drifted');
const manifestPagesRuntime = manifest.data.modules?.pagesRuntime;
assert(manifestPagesRuntime?.schemaVersion === 'backy.pages-discovery.v1', 'manifest() missing pages runtime discovery module');
assert(manifestPagesRuntime.endpoints?.list === manifest.data.endpoints.pages, 'manifest() pages runtime list endpoint drifted');
assert(manifestPagesRuntime.endpoints?.resolve === '/api/sites/' + client.getSiteId() + '/resolve?path={path}', 'manifest() pages runtime resolve endpoint drifted');
assert(manifestPagesRuntime.endpoints?.render === '/api/sites/' + client.getSiteId() + '/render?path={path}', 'manifest() pages runtime render endpoint drifted');
assert(manifestPagesRuntime.endpoints?.liveManage === manifest.data.endpoints.liveManagePage, 'manifest() pages runtime live manage endpoint drifted');
assert(manifestPagesRuntime.methods?.liveManageUpdate === 'PATCH', 'manifest() pages runtime live update method drifted');
assert(manifestPagesRuntime.capabilities?.previewTokens === true, 'manifest() pages runtime missing preview token capability');
assert(manifestPagesRuntime.capabilities?.seoMetadata === true, 'manifest() pages runtime missing SEO metadata capability');
assert(manifestPagesRuntime.cache?.previewDetail === 'private-no-store', 'manifest() pages runtime preview cache policy drifted');
assert(manifestPagesRuntime.privacy?.draftPreviewRequiresToken === true, 'manifest() pages runtime missing draft preview privacy boundary');
assert(manifestPagesRuntime.filters?.maxLimit === 100, 'manifest() pages runtime max limit drifted');
assert(manifestPagesRuntime.schemas?.notFound === 'PAGE_NOT_FOUND', 'manifest() pages runtime not-found schema drifted');
const manifestFormsRuntime = manifest.data.modules?.formsRuntime;
assert(manifestFormsRuntime?.schemaVersion === 'backy.forms-discovery.v1', 'manifest() missing forms runtime discovery module');
assert(manifestFormsRuntime.endpoints?.list === manifest.data.endpoints.forms, 'manifest() forms runtime list endpoint drifted');
assert(manifestFormsRuntime.endpoints?.definition === manifest.data.endpoints.formDefinition, 'manifest() forms runtime definition endpoint drifted');
assert(manifestFormsRuntime.endpoints?.submit === manifest.data.endpoints.formSubmissions, 'manifest() forms runtime submit endpoint drifted');
assert(manifestFormsRuntime.methods?.submit === 'POST', 'manifest() forms runtime submit method drifted');
assert(manifestFormsRuntime.capabilities?.fieldValidation === true, 'manifest() forms runtime missing field validation capability');
assert(manifestFormsRuntime.capabilities?.cacheableDefinitions === true, 'manifest() forms runtime missing cacheable definition capability');
assert(manifestFormsRuntime.cache?.definition === 'public-discovery', 'manifest() forms runtime definition cache policy drifted');
assert(manifestFormsRuntime.cache?.submissions === 'private-no-store', 'manifest() forms runtime submissions cache policy drifted');
assert(manifestFormsRuntime.privacy?.publicDefinitionExcludesSubmissions === true, 'manifest() forms runtime missing public definition privacy boundary');
assert(manifestFormsRuntime.schemas?.definition === 'backy.form-definition.v1', 'manifest() forms runtime definition schema drifted');
assert(manifest.data.contract?.databaseCertification?.schemaVersion === 'backy.frontend-database-certification.v1', 'manifest() missing database certification schema');
assert(manifest.data.contract?.databaseCertification?.status === 'external-database-gate', 'manifest() missing external database certification status');
assert(manifest.data.contract?.databaseCertification?.gate?.command === 'npm run ci:sdk-postgres-smoke', 'manifest() missing SDK Postgres certification command');
assert(manifest.data.contract?.databaseCertification?.gate?.workflow === '.github/workflows/sdk-postgres-smoke.yml', 'manifest() missing SDK Postgres workflow handoff');
assert(manifest.data.contract?.databaseCertification?.gate?.localPreflight === 'npm run test:sdk-postgres-preflight-contract', 'manifest() missing SDK Postgres preflight handoff');
assert(manifest.data.contract?.databaseCertification?.environment?.dataMode === 'database', 'manifest() missing SDK Postgres database mode requirement');
assert(manifest.data.contract?.databaseCertification?.environment?.secretAliases?.includes('BACKY_DATABASE_URL'), 'manifest() missing BACKY_DATABASE_URL certification alias');
assert(manifest.data.contract?.databaseCertification?.environment?.secretAliases?.includes('DATABASE_URL'), 'manifest() missing DATABASE_URL certification alias');
assert(manifest.data.contract?.databaseCertification?.environment?.requiredConfirmationEnv === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true', 'manifest() missing SDK Postgres disposable confirmation env requirement');
assert(manifest.data.contract?.databaseCertification?.environment?.targetGuards?.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'), 'manifest() missing database expected-host guard');
assert(manifest.data.contract?.databaseCertification?.environment?.targetGuards?.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'), 'manifest() missing database expected-name guard');
assert(manifest.data.contract?.databaseCertification?.requires?.includes('disposable_database_confirmed=true'), 'manifest() missing disposable database confirmation requirement');
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('media'), 'manifest() missing media database certification coverage');
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('forms'), 'manifest() missing forms database certification coverage');
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('interactive-components'), 'manifest() missing interactive component database certification coverage');
assert(typeof manifest.data.contract?.databaseCertification?.runtime?.databaseUrlConfigured === 'boolean', 'manifest() missing non-secret database URL runtime state');
assert(Object.prototype.hasOwnProperty.call(manifest.data.contract.databaseCertification.runtime, 'databaseUrlAlias'), 'manifest() missing non-secret database URL alias runtime field');
assert(typeof manifest.data.contract.databaseCertification.runtime.disposableConfirmed === 'boolean', 'manifest() missing disposable confirmation runtime state');
assert(typeof manifest.data.contract.databaseCertification.runtime.readyForCertification === 'boolean', 'manifest() missing SDK Postgres readiness runtime state');
assert(Array.isArray(manifest.data.contract.databaseCertification.runtime.missing), 'manifest() missing SDK Postgres runtime missing-input list');
assert(
  typeof manifest.data.contract.databaseCertification.runtime.secretHandling === 'string' &&
    manifest.data.contract.databaseCertification.runtime.secretHandling.includes('Database URLs and service credentials are never returned'),
  'manifest() missing non-secret SDK Postgres runtime boundary',
);
assert(
  typeof manifest.data.contract?.databaseCertification?.secretHandling === 'string' &&
    manifest.data.contract.databaseCertification.secretHandling.includes('Database URLs and service credentials stay in CI/runtime environment'),
  'manifest() missing non-secret database certification boundary',
);
assert(manifest.data.delivery?.defaultLocale === 'en', 'manifest() missing default locale discovery');
assert(manifest.data.delivery?.localeStrategy === 'none', 'manifest() missing locale strategy discovery');
assert(manifest.data.delivery?.domains?.some?.((domain) => domain.type === 'managed' && typeof domain.baseUrl === 'string'), 'manifest() missing managed domain discovery');
assert(typeof manifest.data.delivery?.urls?.sitemap === 'string', 'manifest() missing sitemap URL discovery');
const smokePath = manifest.data.modules?.pages?.items?.find?.((page) => typeof page.path === 'string')?.path || '/';

const cachedManifest = await client.manifestCached();
assert(cachedManifest.notModified === false, 'manifestCached() first request should return a body');
assert(cachedManifest.meta.etag, 'manifestCached() missing response ETag');
assert(cachedManifest.body.data.capabilities?.renderPayload === true, 'manifestCached() missing render payload capability');
const revalidatedManifest = await client.manifestCached({ etag: cachedManifest.meta.etag });
assert(revalidatedManifest.notModified === true, 'manifestCached() did not return notModified for matching ETag');

const frontendDesign = await client.frontendDesign();
assert(frontendDesign.data.schemaVersion === 'backy.frontend-design-response.v1', 'frontendDesign() did not return the frontend design response schema');
assert(frontendDesign.data.frontendDesign?.schemaVersion === 'backy.frontend-design.v1', 'frontendDesign() missing frontend design contract');
assert(Array.isArray(frontendDesign.data.frontendDesign.templates), 'frontendDesign() missing template registry');
assert(Array.isArray(frontendDesign.data.frontendDesign.editableMap), 'frontendDesign() missing editable map');
assert(typeof frontendDesign.data.capabilities?.hasContract === 'boolean', 'frontendDesign() missing capability summary');
const cachedFrontendDesign = await client.frontendDesignCached();
assert(cachedFrontendDesign.notModified === false, 'frontendDesignCached() first request should return a body');
assert(cachedFrontendDesign.meta.etag, 'frontendDesignCached() missing response ETag');
assert(cachedFrontendDesign.body.data.frontendDesign?.schemaVersion === 'backy.frontend-design.v1', 'frontendDesignCached() missing frontend design contract');
const revalidatedFrontendDesign = await client.frontendDesignCached({ etag: cachedFrontendDesign.meta.etag });
assert(revalidatedFrontendDesign.notModified === true, 'frontendDesignCached() did not return notModified for matching ETag');

const openapi = await client.openapi();
assert(openapi.openapi === '3.1.0', 'openapi() did not return an OpenAPI 3.1 document');
assert(openapi.paths?.['/api/sites']?.get?.operationId === 'discoverBackySite', 'openapi() missing global site discovery path');
assertManifestEndpointsDocumented(manifest.data, openapi);
assert(openapi.paths?.[manifest.data.endpoints.openapi]?.get, 'openapi() missing manifest-advertised OpenAPI path');
assert(openapi.paths?.[manifest.data.endpoints.blogCategories]?.get, 'openapi() missing manifest-advertised blog categories path');
assert(openapi.paths?.[manifest.data.endpoints.blogTags]?.get, 'openapi() missing manifest-advertised blog tags path');
assert(openapi.paths?.[manifest.data.endpoints.blogAuthors]?.get, 'openapi() missing manifest-advertised blog authors path');
assert(openapi.paths?.[manifest.data.endpoints.blogRss]?.get, 'openapi() missing manifest-advertised blog RSS path');
assert(openapi.paths?.[manifest.data.endpoints.blogRss]?.get?.['x-backy-feed']?.endpoint === manifest.data.endpoints.blogRss, 'openapi() missing blog RSS feed discovery extension');
assert(openapi.components?.schemas?.BlogFeedDiscovery?.properties?.limits, 'openapi() missing blog feed discovery schema');
assert(openapi['x-backy-database-certification']?.schemaVersion === manifest.data.contract.databaseCertification.schemaVersion, 'openapi() missing database certification schema extension');
assert(openapi['x-backy-database-certification']?.gate?.command === manifest.data.contract.databaseCertification.gate.command, 'openapi() database certification command drifted from manifest');
assert(openapi['x-backy-database-certification']?.environment?.secretAliases?.includes('DATABASE_URL'), 'openapi() missing DATABASE_URL certification alias');
assert(openapi['x-backy-database-certification']?.environment?.requiredConfirmationEnv === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true', 'openapi() missing SDK Postgres disposable confirmation env requirement');
assert(openapi['x-backy-database-certification']?.environment?.targetGuards?.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'), 'openapi() missing database expected-host guard');
assert(openapi['x-backy-database-certification']?.requires?.includes('disposable_database_confirmed=true'), 'openapi() missing disposable database confirmation requirement');
assert(openapi['x-backy-database-certification']?.coverage?.includes('media'), 'openapi() missing media database certification coverage');
assert(openapi['x-backy-database-certification']?.coverage?.includes('forms'), 'openapi() missing forms database certification coverage');
assert(typeof openapi['x-backy-database-certification']?.runtime?.databaseUrlConfigured === 'boolean', 'openapi() missing non-secret database URL runtime state');
assert(typeof openapi['x-backy-database-certification']?.runtime?.readyForCertification === 'boolean', 'openapi() missing SDK Postgres readiness runtime state');
assert(openapi['x-backy-database-certification']?.coverage?.includes('interactive-components'), 'openapi() missing interactive component database certification coverage');
assert(
  typeof openapi['x-backy-database-certification']?.secretHandling === 'string' &&
    openapi['x-backy-database-certification'].secretHandling.includes('OpenAPI exposes only non-secret gate names and requirements'),
  'openapi() missing non-secret database certification boundary',
);
assert(openapi['x-backy']?.delivery?.defaultLocale === manifest.data.delivery.defaultLocale, 'openapi() missing delivery locale discovery extension');
assert(openapi['x-backy']?.delivery?.canonicalBaseUrl === manifest.data.delivery.canonicalBaseUrl, 'openapi() missing delivery canonical base extension');
assert(openapi.components?.schemas?.RedirectRoute, 'openapi() missing redirect route schema');
assert(openapi.components?.schemas?.GoneRoute, 'openapi() missing gone route schema');

const cachedOpenapi = await client.openapiCached();
assert(cachedOpenapi.notModified === false, 'openapiCached() first request should return a body');
assert(cachedOpenapi.meta.etag, 'openapiCached() missing response ETag');
assert(cachedOpenapi.body.openapi === '3.1.0', 'openapiCached() did not return an OpenAPI 3.1 document');
const revalidatedOpenapi = await client.openapiCached({ etag: cachedOpenapi.meta.etag });
assert(revalidatedOpenapi.notModified === true, 'openapiCached() did not return notModified for matching ETag');

const resolved = await client.resolve(smokePath);
assert(resolved.data.route, 'resolve() did not return a route');

const rendered = await client.render(smokePath, { schemaVersion: 'backy.content-payload.v1' });
assert(rendered.data, 'render() did not return a payload envelope');

const cachedRender = await client.renderCached(smokePath, { schemaVersion: 'backy.content-payload.v1' });
assert(cachedRender.notModified === false, 'renderCached() first request should return a body');
assert(cachedRender.meta.etag, 'renderCached() missing response ETag');
assert(cachedRender.meta.schemaVersion === 'backy.content-payload.v1', 'renderCached() missing negotiated schema version metadata');
assert(cachedRender.body.data.content?.elements, 'renderCached() did not return a render payload');
const revalidatedRender = await client.renderCached(smokePath, { etag: cachedRender.meta.etag, schemaVersion: 'backy.content-payload.v1' });
assert(revalidatedRender.notModified === true, 'renderCached() did not return notModified for matching ETag');

const pageDetail = await client.pages({ path: smokePath });
assert(pageDetail.data.page, 'pages() path lookup missing page detail');
const cachedPageDetail = await client.pagesCached({ path: smokePath });
assert(cachedPageDetail.notModified === false, 'pagesCached() first path request should return a body');
assert(cachedPageDetail.body.data.page, 'pagesCached() path lookup missing page detail');
assert(cachedPageDetail.meta.etag, 'pagesCached() missing response ETag');
const revalidatedPageDetail = await client.pagesCached({ path: smokePath, etag: cachedPageDetail.meta.etag });
assert(revalidatedPageDetail.notModified === true, 'pagesCached() did not return notModified for matching ETag');

const blogList = await client.blog({ limit: 5 });
assert(Array.isArray(blogList.data.posts), 'blog() missing posts array');
assert(manifest.data.endpoints.blogRss === `/api/sites/${client.getSiteId()}/blog/rss`, 'manifest() missing blog RSS endpoint');
const manifestBlogRssFeed = manifest.data.modules?.blog?.feeds?.find?.((feed) => feed.id === 'blog-rss');
assert(manifestBlogRssFeed?.endpoint === manifest.data.endpoints.blogRss, 'manifest() missing structured blog RSS feed endpoint');
assert(manifestBlogRssFeed?.hostedPath === '/blog/rss.xml', 'manifest() missing structured hosted blog RSS feed path');
assert(manifestBlogRssFeed?.cache?.revisionHeader === 'x-backy-cache-revision', 'manifest() missing structured blog RSS cache metadata');
const manifestBlogRuntime = manifest.data.modules?.blogRuntime;
assert(manifestBlogRuntime?.schemaVersion === 'backy.blog-discovery.v1', 'manifest() missing blog runtime discovery module');
assert(manifestBlogRuntime.endpoints?.list === manifest.data.endpoints.blog, 'manifest() blog runtime list endpoint drifted');
assert(manifestBlogRuntime.endpoints?.rss === manifest.data.endpoints.blogRss, 'manifest() blog runtime RSS endpoint drifted');
assert(manifestBlogRuntime.endpoints?.categories === manifest.data.endpoints.blogCategories, 'manifest() blog runtime categories endpoint drifted');
assert(manifestBlogRuntime.methods?.detail === 'GET', 'manifest() blog runtime detail method drifted');
assert(manifestBlogRuntime.capabilities?.taxonomyFilters === true, 'manifest() blog runtime missing taxonomy filters capability');
assert(manifestBlogRuntime.capabilities?.rssFeed === true, 'manifest() blog runtime missing RSS feed capability');
assert(manifestBlogRuntime.cache?.previewDetail === 'private-no-store', 'manifest() blog runtime preview cache policy drifted');
assert(manifestBlogRuntime.privacy?.draftPreviewRequiresToken === true, 'manifest() blog runtime missing draft preview privacy boundary');
assert(manifestBlogRuntime.filters?.queryParams?.includes?.('categorySlug'), 'manifest() blog runtime missing categorySlug filter metadata');
assert(manifestBlogRuntime.schemas?.notFound === 'POST_NOT_FOUND', 'manifest() blog runtime not-found schema drifted');
const discoveredBlogFeeds = await client.blogFeeds();
assert(discoveredBlogFeeds.some((feed) => feed.id === 'blog-rss' && feed.endpoint === manifest.data.endpoints.blogRss), 'blogFeeds() missing RSS feed discovery');
const blogRssUrl = client.blogRssUrl({ limit: 5 });
assert(blogRssUrl.includes(`/api/sites/${client.getSiteId()}/blog/rss?limit=5`), 'blogRssUrl() returned wrong URL');
const blogRss = await client.blogRss({ limit: 5 });
assert(blogRss.includes('<rss version="2.0"'), 'blogRss() did not return RSS XML');
const cachedBlogList = await client.blogCached({ limit: 5 });
assert(cachedBlogList.notModified === false, 'blogCached() first list request should return a body');
assert(Array.isArray(cachedBlogList.body.data.posts), 'blogCached() missing posts array');
assert(cachedBlogList.meta.etag, 'blogCached() missing response ETag');
const revalidatedBlogList = await client.blogCached({ limit: 5, etag: cachedBlogList.meta.etag });
assert(revalidatedBlogList.notModified === true, 'blogCached() did not return notModified for matching ETag');
const firstBlogPost = blogList.data.posts?.find?.((post) => typeof post.slug === 'string' && post.slug.length > 0);
if (firstBlogPost) {
  const blogDetail = await client.blog({ slug: firstBlogPost.slug });
  assert(blogDetail.data.post?.id === firstBlogPost.id, 'blog() slug lookup returned wrong post');
  const cachedBlogDetail = await client.blogCached({ slug: firstBlogPost.slug });
  assert(cachedBlogDetail.notModified === false, 'blogCached() first slug request should return a body');
  assert(cachedBlogDetail.body.data.post?.id === firstBlogPost.id, 'blogCached() slug lookup returned wrong post');
  assert(cachedBlogDetail.meta.etag, 'blogCached() slug lookup missing response ETag');
  const revalidatedBlogDetail = await client.blogCached({ slug: firstBlogPost.slug, etag: cachedBlogDetail.meta.etag });
  assert(revalidatedBlogDetail.notModified === true, 'blogCached() slug lookup did not return notModified for matching ETag');
}

const blogCategories = await client.blogCategories();
assert(Array.isArray(blogCategories.data.categories), 'blogCategories() missing categories array');
const cachedBlogCategories = await client.blogCategoriesCached();
assert(cachedBlogCategories.notModified === false, 'blogCategoriesCached() first request should return a body');
assert(Array.isArray(cachedBlogCategories.body.data.categories), 'blogCategoriesCached() missing categories array');
assert(cachedBlogCategories.meta.etag, 'blogCategoriesCached() missing response ETag');
const revalidatedBlogCategories = await client.blogCategoriesCached({ etag: cachedBlogCategories.meta.etag });
assert(revalidatedBlogCategories.notModified === true, 'blogCategoriesCached() did not return notModified for matching ETag');

const blogTags = await client.blogTags();
assert(Array.isArray(blogTags.data.tags), 'blogTags() missing tags array');
const cachedBlogTags = await client.blogTagsCached();
assert(cachedBlogTags.notModified === false, 'blogTagsCached() first request should return a body');
assert(Array.isArray(cachedBlogTags.body.data.tags), 'blogTagsCached() missing tags array');
assert(cachedBlogTags.meta.etag, 'blogTagsCached() missing response ETag');
const revalidatedBlogTags = await client.blogTagsCached({ etag: cachedBlogTags.meta.etag });
assert(revalidatedBlogTags.notModified === true, 'blogTagsCached() did not return notModified for matching ETag');

const blogAuthors = await client.blogAuthors();
assert(Array.isArray(blogAuthors.data.authors), 'blogAuthors() missing authors array');
const cachedBlogAuthors = await client.blogAuthorsCached();
assert(cachedBlogAuthors.notModified === false, 'blogAuthorsCached() first request should return a body');
assert(Array.isArray(cachedBlogAuthors.body.data.authors), 'blogAuthorsCached() missing authors array');
assert(cachedBlogAuthors.meta.etag, 'blogAuthorsCached() missing response ETag');
const revalidatedBlogAuthors = await client.blogAuthorsCached({ etag: cachedBlogAuthors.meta.etag });
assert(revalidatedBlogAuthors.notModified === true, 'blogAuthorsCached() did not return notModified for matching ETag');

const navigation = await client.navigation();
assert(navigation.data.navigation, 'navigation() missing navigation data');
const cachedNavigation = await client.navigationCached();
assert(cachedNavigation.notModified === false, 'navigationCached() first request should return a body');
assert(cachedNavigation.body.data.navigation, 'navigationCached() missing navigation data');
assert(cachedNavigation.meta.etag, 'navigationCached() missing response ETag');
const revalidatedNavigation = await client.navigationCached({ etag: cachedNavigation.meta.etag });
assert(revalidatedNavigation.notModified === true, 'navigationCached() did not return notModified for matching ETag');

const seo = await client.seo();
assert(Array.isArray(seo.data.routes), 'seo() missing route metadata');
assert(seo.data.sitemap?.url, 'seo() missing sitemap URL');
assert(Array.isArray(seo.data.defaults?.jsonLd), 'seo() missing JSON-LD defaults array');
const cachedSeo = await client.seoCached();
assert(cachedSeo.notModified === false, 'seoCached() first request should return a body');
assert(cachedSeo.meta.etag, 'seoCached() missing response ETag');
assert(Array.isArray(cachedSeo.body.data.routes), 'seoCached() missing route metadata');
const revalidatedSeo = await client.seoCached({ etag: cachedSeo.meta.etag });
assert(revalidatedSeo.notModified === true, 'seoCached() did not return notModified for matching ETag');

const media = await client.media({ limit: 5 });
assert(media.data.media || media.data.pagination, 'media() missing media list data');
if (media.data.media?.length > 0) {
  assert(media.data.media[0].references?.schemaVersion === 'backy.media.references.v1', 'media() missing normalized reference metadata');
  assert(media.data.media[0].editableMetadata?.schemaVersion === 'backy.media.editable-metadata.v1', 'media() missing editable metadata contract');
}
const cachedMedia = await client.mediaCached({ limit: 5 });
assert(cachedMedia.notModified === false, 'mediaCached() first request should return a body');
assert(cachedMedia.meta.etag, 'mediaCached() missing response ETag');
assert(Array.isArray(cachedMedia.body.data.media), 'mediaCached() missing media array');
const revalidatedMedia = await client.mediaCached({ limit: 5, etag: cachedMedia.meta.etag });
assert(revalidatedMedia.notModified === true, 'mediaCached() did not return notModified for matching ETag');
const mediaFolders = await client.mediaFolders();
assert(mediaFolders.data.schemaVersion === 'backy.media-folders.v1', 'mediaFolders() missing folder schema version');
assert(Array.isArray(mediaFolders.data.folders), 'mediaFolders() missing folder array');
assert(mediaFolders.data.root?.id === null, 'mediaFolders() missing root folder metadata');
const cachedMediaFolders = await client.mediaFoldersCached();
assert(cachedMediaFolders.notModified === false, 'mediaFoldersCached() first request should return a body');
assert(Array.isArray(cachedMediaFolders.body.data.folders), 'mediaFoldersCached() missing folder array');
assert(cachedMediaFolders.meta.etag, 'mediaFoldersCached() missing response ETag');
const revalidatedMediaFolders = await client.mediaFoldersCached({ etag: cachedMediaFolders.meta.etag });
assert(revalidatedMediaFolders.notModified === true, 'mediaFoldersCached() did not return notModified for matching ETag');
if (media.data.media?.length > 0) {
  const mediaDetail = await client.mediaAsset(media.data.media[0].id);
  assert(mediaDetail.data.media?.id === media.data.media[0].id, 'mediaAsset() returned wrong media asset');
  assert(mediaDetail.data.media?.references?.schemaVersion === 'backy.media.references.v1', 'mediaAsset() missing normalized reference metadata');
  assert(mediaDetail.data.media?.editableMetadata?.metadata, 'mediaAsset() missing editable metadata values');
  const cachedMediaDetail = await client.mediaAssetCached(media.data.media[0].id);
  assert(cachedMediaDetail.notModified === false, 'mediaAssetCached() first request should return a body');
  assert(cachedMediaDetail.body.data.media?.id === media.data.media[0].id, 'mediaAssetCached() returned wrong media asset');
  assert(cachedMediaDetail.meta.etag, 'mediaAssetCached() missing response ETag');
  const revalidatedMediaDetail = await client.mediaAssetCached(media.data.media[0].id, { etag: cachedMediaDetail.meta.etag });
  assert(revalidatedMediaDetail.notModified === true, 'mediaAssetCached() did not return notModified for matching ETag');
  assert(
    client.mediaFileUrl(media.data.media[0].id).includes(`/api/sites/${client.getSiteId()}/media/${media.data.media[0].id}/file`),
    'mediaFileUrl() returned wrong media file URL',
  );
  assert(
    client.mediaTransformUrl(media.data.media[0].id, { width: 640, quality: 80 }).includes(`/api/sites/${client.getSiteId()}/media/${media.data.media[0].id}/transform?width=640&quality=80`),
    'mediaTransformUrl() returned wrong media transform URL',
  );
}

const mediaFonts = await client.mediaFonts();
assert(mediaFonts.data.schemaVersion === 'backy.font-manifest.v1', 'mediaFonts() missing font manifest schema version');
assert(Array.isArray(mediaFonts.data.families), 'mediaFonts() missing font families array');
assert(Array.isArray(mediaFonts.data.fonts), 'mediaFonts() missing font variants array');
const cachedMediaFonts = await client.mediaFontsCached();
assert(cachedMediaFonts.notModified === false, 'mediaFontsCached() first request should return a body');
assert(cachedMediaFonts.body.data.schemaVersion === 'backy.font-manifest.v1', 'mediaFontsCached() missing font manifest body');
assert(cachedMediaFonts.meta.etag, 'mediaFontsCached() missing response ETag');
const revalidatedMediaFonts = await client.mediaFontsCached({ etag: cachedMediaFonts.meta.etag });
assert(revalidatedMediaFonts.notModified === true, 'mediaFontsCached() did not return notModified for matching ETag');

const collections = await client.collections();
assert(Array.isArray(collections.data.collections), 'collections() missing collections array');
const manifestCollectionsRuntime = manifest.data.modules?.collectionsRuntime;
assert(manifestCollectionsRuntime?.schemaVersion === 'backy.collections-discovery.v1', 'manifest() missing collections runtime discovery module');
assert(manifestCollectionsRuntime.endpoints?.list === manifest.data.endpoints.collections, 'manifest() collections runtime list endpoint drifted');
assert(manifestCollectionsRuntime.endpoints?.records === '/api/sites/' + client.getSiteId() + '/collections/{collectionId}/records', 'manifest() collections runtime records endpoint drifted');
assert(manifestCollectionsRuntime.methods?.createRecord === 'POST', 'manifest() collections runtime create method drifted');
assert(manifestCollectionsRuntime.methods?.updateRecord === 'PATCH', 'manifest() collections runtime update method drifted');
assert(manifestCollectionsRuntime.capabilities?.fieldValidation === true, 'manifest() collections runtime missing field validation capability');
assert(manifestCollectionsRuntime.capabilities?.cacheableRecords === true, 'manifest() collections runtime missing cacheable records capability');
assert(manifestCollectionsRuntime.cache?.records === 'public-discovery', 'manifest() collections runtime records cache policy drifted');
assert(manifestCollectionsRuntime.cache?.mutations === 'private-no-store', 'manifest() collections runtime mutation cache policy drifted');
assert(manifestCollectionsRuntime.privacy?.visitorWritesRequirePublicPermission === true, 'manifest() collections runtime missing visitor write privacy boundary');
assert(manifestCollectionsRuntime.writePolicy?.createStatus === 'draft', 'manifest() collections runtime create status drifted');
assert(manifestCollectionsRuntime.writePolicy?.fieldPolicyMetadata === 'metadata.visitorWritePolicy', 'manifest() collections runtime field policy metadata drifted');
assert(manifestCollectionsRuntime.schemas?.validationError === 'VALIDATION_ERROR', 'manifest() collections runtime validation schema drifted');
const cachedCollections = await client.collectionsCached();
assert(cachedCollections.notModified === false, 'collectionsCached() first request should return a body');
assert(Array.isArray(cachedCollections.body.data.collections), 'collectionsCached() missing collections array');
assert(cachedCollections.meta.etag, 'collectionsCached() missing response ETag');
const revalidatedCollections = await client.collectionsCached({ etag: cachedCollections.meta.etag });
assert(revalidatedCollections.notModified === true, 'collectionsCached() did not return notModified for matching ETag');
if (collections.data.collections.length > 0) {
  const collection = await client.collection(collections.data.collections[0].id);
  assert(collection.data.collection?.id === collections.data.collections[0].id, 'collection() returned wrong collection');
  const cachedCollection = await client.collectionCached(collections.data.collections[0].id);
  assert(cachedCollection.notModified === false, 'collectionCached() first request should return a body');
  assert(cachedCollection.body.data.collection?.id === collections.data.collections[0].id, 'collectionCached() returned wrong collection');
  assert(cachedCollection.meta.etag, 'collectionCached() missing response ETag');
  const revalidatedCollection = await client.collectionCached(collections.data.collections[0].id, { etag: cachedCollection.meta.etag });
  assert(revalidatedCollection.notModified === true, 'collectionCached() did not return notModified for matching ETag');
}

const reusableSections = await client.reusableSections();
assert(Array.isArray(reusableSections.data.sections), 'reusableSections() missing sections array');
const manifestReusableSectionsRuntime = manifest.data.modules?.reusableSectionsRuntime;
assert(manifestReusableSectionsRuntime?.schemaVersion === 'backy.reusable-sections-discovery.v1', 'manifest() missing reusable sections runtime discovery module');
assert(manifestReusableSectionsRuntime.endpoints?.list === manifest.data.endpoints.reusableSections, 'manifest() reusable sections runtime list endpoint drifted');
assert(manifestReusableSectionsRuntime.endpoints?.detail === manifest.data.endpoints.reusableSectionDetail, 'manifest() reusable sections runtime detail endpoint drifted');
assert(manifestReusableSectionsRuntime.methods?.list === 'GET', 'manifest() reusable sections runtime list method drifted');
assert(manifestReusableSectionsRuntime.capabilities?.canvasContent === true, 'manifest() reusable sections runtime missing canvas content capability');
assert(manifestReusableSectionsRuntime.capabilities?.cacheableSections === true, 'manifest() reusable sections runtime missing cacheable sections capability');
assert(manifestReusableSectionsRuntime.cache?.detail === 'public-discovery', 'manifest() reusable sections runtime detail cache policy drifted');
assert(manifestReusableSectionsRuntime.privacy?.publicReadsOnlyIncludeActiveSections === true, 'manifest() reusable sections runtime missing active-only privacy boundary');
assert(manifestReusableSectionsRuntime.filters?.queryParams?.includes?.('tag'), 'manifest() reusable sections runtime missing tag filter metadata');
assert(manifestReusableSectionsRuntime.schemas?.section === 'backy.reusable-section.v1', 'manifest() reusable sections runtime section schema drifted');
const cachedReusableSections = await client.reusableSectionsCached();
assert(cachedReusableSections.notModified === false, 'reusableSectionsCached() first request should return a body');
assert(Array.isArray(cachedReusableSections.body.data.sections), 'reusableSectionsCached() missing sections array');
assert(cachedReusableSections.meta.etag, 'reusableSectionsCached() missing response ETag');
const revalidatedReusableSections = await client.reusableSectionsCached({ etag: cachedReusableSections.meta.etag });
assert(revalidatedReusableSections.notModified === true, 'reusableSectionsCached() did not return notModified for matching ETag');
if (reusableSections.data.sections.length > 0) {
  const reusableSection = await client.reusableSection(reusableSections.data.sections[0].id);
  assert(reusableSection.data.section?.content?.elements, 'reusableSection() missing reusable section content');
  const cachedReusableSection = await client.reusableSectionCached(reusableSections.data.sections[0].id);
  assert(cachedReusableSection.notModified === false, 'reusableSectionCached() first request should return a body');
  assert(cachedReusableSection.body.data.section?.id === reusableSections.data.sections[0].id, 'reusableSectionCached() returned wrong section');
  assert(cachedReusableSection.meta.etag, 'reusableSectionCached() missing response ETag');
  const revalidatedReusableSection = await client.reusableSectionCached(reusableSections.data.sections[0].id, { etag: cachedReusableSection.meta.etag });
  assert(revalidatedReusableSection.notModified === true, 'reusableSectionCached() did not return notModified for matching ETag');
}

const forms = await client.forms();
assert(Array.isArray(forms.data.forms), 'forms() missing forms array');
const cachedForms = await client.formsCached();
assert(cachedForms.notModified === false, 'formsCached() first request should return a body');
assert(Array.isArray(cachedForms.body.data.forms), 'formsCached() missing forms array');
assert(cachedForms.meta.etag, 'formsCached() missing response ETag');
const revalidatedForms = await client.formsCached({ etag: cachedForms.meta.etag });
assert(revalidatedForms.notModified === true, 'formsCached() did not return notModified for matching ETag');
if (forms.data.forms.length > 0) {
  const definition = await client.formDefinition(forms.data.forms[0].id);
  assert(definition.data.schemaVersion === 'backy.form-definition.v1', 'formDefinition() missing schema version');
  assert(definition.data.form?.id === forms.data.forms[0].id, 'formDefinition() returned wrong form');
  const cachedDefinition = await client.formDefinitionCached(forms.data.forms[0].id);
  assert(cachedDefinition.notModified === false, 'formDefinitionCached() first request should return a body');
  assert(cachedDefinition.meta.etag, 'formDefinitionCached() missing response ETag');
  const revalidatedDefinition = await client.formDefinitionCached(forms.data.forms[0].id, { etag: cachedDefinition.meta.etag });
  assert(revalidatedDefinition.notModified === true, 'formDefinitionCached() did not return notModified for matching ETag');
}

const reportReasons = await client.reportReasons();
assert(reportReasons.data.reasons?.includes?.('spam'), 'reportReasons() missing spam reason');
const cachedReportReasons = await client.reportReasonsCached();
assert(cachedReportReasons.notModified === false, 'reportReasonsCached() first request should return a body');
assert(cachedReportReasons.body.data.reasons?.includes?.('spam'), 'reportReasonsCached() missing spam reason');
assert(cachedReportReasons.meta.etag, 'reportReasonsCached() missing response ETag');
const revalidatedReportReasons = await client.reportReasonsCached({ etag: cachedReportReasons.meta.etag });
assert(revalidatedReportReasons.notModified === true, 'reportReasonsCached() did not return notModified for matching ETag');

await loginAdminApi();
const privateClient = createBackyClient({
  baseUrl,
  siteId: client.getSiteId(),
  requestIdFactory: () => 'sdk-private-smoke-request',
  defaultHeaders: adminClientHeaders(),
});

const comments = await privateClient.siteComments({ limit: 5 });
assert(Array.isArray(comments.data.comments), 'siteComments() missing comments array');

const events = await privateClient.events({ limit: 5 });
assert(Array.isArray(events.data.events), 'events() missing events array');

let commerceCatalogChecked = false;
try {
  const manifestCommerceRuntime = manifest.data.modules?.commerceRuntime;
  assert(manifestCommerceRuntime?.schemaVersion === 'backy.commerce-discovery.v1', 'manifest() missing commerce runtime discovery module');
  assert(manifestCommerceRuntime.endpoints?.catalog === manifest.data.endpoints.commerceCatalog, 'manifest() commerce runtime catalog endpoint drifted');
  assert(manifestCommerceRuntime.endpoints?.orderContract === manifest.data.endpoints.commerceOrders, 'manifest() commerce runtime order contract endpoint drifted');
  assert(manifestCommerceRuntime.methods?.createOrder === 'POST', 'manifest() commerce runtime create order method drifted');
  assert(manifestCommerceRuntime.capabilities?.productFilters === true, 'manifest() commerce runtime missing product filters capability');
  assert(manifestCommerceRuntime.orderRequest?.schemaVersion === 'backy.commerce-order-request.v1', 'manifest() commerce runtime missing order request contract');
  assert(manifestCommerceRuntime.orderRequest?.itemArrays?.includes?.('lineItems'), 'manifest() commerce runtime missing lineItems order alias');
  assert(manifestCommerceRuntime.orderRequest?.itemFields?.quantity?.includes?.('qty'), 'manifest() commerce runtime missing quantity alias');
  assert(manifestCommerceRuntime.orderRequest?.customer?.includes?.('customerName/customerEmail/customerPhone'), 'manifest() commerce runtime missing top-level customer aliases');
  assert(manifestCommerceRuntime.orderRequest?.checkoutSessionStatuses?.includes?.('provider_created'), 'manifest() commerce runtime missing provider-created checkout status');
  assert(manifestCommerceRuntime.cache?.createOrder === 'private-no-store', 'manifest() commerce runtime create order cache policy drifted');
  assert(manifestCommerceRuntime.privacy?.ordersCollectionMustRemainPrivate === true, 'manifest() commerce runtime missing private order queue boundary');
  assert(manifestCommerceRuntime.filters?.queryParams?.includes?.('productType'), 'manifest() commerce runtime missing productType filter metadata');
  assert(manifestCommerceRuntime.schemas?.orderQueueNotPrivate === 'ORDER_QUEUE_NOT_PRIVATE', 'manifest() commerce runtime order queue privacy schema drifted');

  const commerceOrderContract = await client.commerceOrderContract();
  assert(commerceOrderContract.data.schemaVersion === 'backy.commerce-orders.v1', 'commerceOrderContract() missing schema version');
  assert(commerceOrderContract.data.relatedEndpoints?.catalog, 'commerceOrderContract() missing catalog endpoint');
  assertCommerceProviderCertification(commerceOrderContract.data.commerce, 'commerceOrderContract()');
  const cachedCommerceOrderContract = await client.commerceOrderContractCached();
  assert(cachedCommerceOrderContract.notModified === false, 'commerceOrderContractCached() first request should return a body');
  assert(cachedCommerceOrderContract.body.data.schemaVersion === 'backy.commerce-orders.v1', 'commerceOrderContractCached() missing schema version');
  assertCommerceProviderCertification(cachedCommerceOrderContract.body.data.commerce, 'commerceOrderContractCached()');
  assert(cachedCommerceOrderContract.meta.etag, 'commerceOrderContractCached() missing response ETag');
  const revalidatedCommerceOrderContract = await client.commerceOrderContractCached({ etag: cachedCommerceOrderContract.meta.etag });
  assert(revalidatedCommerceOrderContract.notModified === true, 'commerceOrderContractCached() did not return notModified for matching ETag');

  const commerceCatalog = await client.commerceCatalog({ limit: 5 });
  assert(commerceCatalog.data.schemaVersion === 'backy.commerce-catalog.v1', 'commerceCatalog() missing schema version');
  assert(Array.isArray(commerceCatalog.data.products), 'commerceCatalog() missing products array');
  assertCommerceProviderCertification(commerceCatalog.data.commerce, 'commerceCatalog()');
  const cachedCommerceCatalog = await client.commerceCatalogCached({ limit: 5 });
  assert(cachedCommerceCatalog.notModified === false, 'commerceCatalogCached() first request should return a body');
  assert(cachedCommerceCatalog.body.data.schemaVersion === 'backy.commerce-catalog.v1', 'commerceCatalogCached() missing schema version');
  assertCommerceProviderCertification(cachedCommerceCatalog.body.data.commerce, 'commerceCatalogCached()');
  assert(cachedCommerceCatalog.meta.etag, 'commerceCatalogCached() missing response ETag');
  const revalidatedCommerceCatalog = await client.commerceCatalogCached({ limit: 5, etag: cachedCommerceCatalog.meta.etag });
  assert(revalidatedCommerceCatalog.notModified === true, 'commerceCatalogCached() did not return notModified for matching ETag');
  commerceCatalogChecked = true;
} catch (error) {
  if (error?.status !== 404 || !['PRODUCT_CATALOG_NOT_FOUND', 'SITE_NOT_FOUND'].includes(error?.code)) {
    throw error;
  }
}

const writeChecks = [];
let fixture = null;

if (runWriteSmoke) {
  fixture = await createSdkSmokeFixture();
  try {
    const writeClient = createBackyClient({
      baseUrl,
      requestIdFactory: () => 'sdk-write-smoke-request',
      defaultHeaders: adminClientHeaders(),
    });
    await writeClient.discoverSite(fixture.siteSlug);

    const fixtureManifest = await writeClient.manifest();
    assert(fixtureManifest.data.capabilities?.redirectRoutes === true, 'fixture manifest missing redirect route capability');
    assert(
      fixtureManifest.data.modules?.routing?.redirectRules?.items?.some?.((rule) => rule.from === fixture.redirectPath && rule.statusCode === 301),
      'fixture manifest missing redirect route metadata',
    );
    assert(
      fixtureManifest.data.navigation?.primary?.some?.((item) => (
        item.id === 'sdk-smoke-nav-page'
        && item.pageId === fixture.pageId
        && item.children?.some?.((child) => child.id === 'sdk-smoke-nav-child')
      )),
      'fixture manifest missing configured navigation',
    );
    assert(
      fixtureManifest.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-docs' && item.href === 'https://example.com/sdk'),
      'fixture manifest missing custom URL navigation',
    );
    assert(
      fixtureManifest.data.modules?.forms?.some?.((form) => (
        form.id === 'sdk-smoke-form'
        && form.definitionUrl === `/api/sites/${fixture.siteId}/forms/sdk-smoke-form/definition`
      )),
      'fixture manifest missing SDK smoke form definition URL',
    );
    assert(
      fixtureManifest.data.modules?.reusableSections?.items?.some?.((section) => section.id === fixture.reusableSectionId),
      'fixture manifest missing SDK smoke reusable section',
    );

    const fixtureOpenapi = await writeClient.openapi();
    assert(
      fixtureOpenapi['x-backy']?.redirectRules?.some?.((rule) => rule.from === fixture.redirectPath && rule.statusCode === 301),
      'fixture OpenAPI missing redirect route vendor metadata',
    );

    const redirected = await writeClient.resolve(fixture.redirectPath);
    assert(redirected.data.route?.type === 'redirect', 'resolve() did not return a redirect route');
    assert(redirected.data.route?.resource?.to === `/${fixture.pageSlug}`, 'resolve() returned the wrong redirect target');

    const gone = await writeClient.resolve(fixture.gonePath);
    assert(gone.success === false, 'resolve() should return a non-throwing gone envelope');
    assert(gone.data.route?.type === 'gone', 'resolve() did not expose gone route data');
    writeChecks.push('routeRedirects');

    const configuredNavigation = await writeClient.navigation();
    assert(
      configuredNavigation.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-page' && item.pageId === fixture.pageId),
      'navigation() missing configured page item',
    );
    assert(
      configuredNavigation.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-docs' && item.href === 'https://example.com/sdk'),
      'navigation() missing configured URL item',
    );
    writeChecks.push('navigation');

    const savedSections = await writeClient.reusableSections({ tag: 'sdk' });
    assert(savedSections.data.sections?.some?.((section) => section.id === fixture.reusableSectionId), 'reusableSections() missing SDK smoke reusable section');
    writeChecks.push('reusableSections');

    const savedSection = await writeClient.reusableSection(fixture.reusableSectionId);
    assert(savedSection.data.section?.content?.elements?.[0]?.id === 'sdk-smoke-section-root', 'reusableSection() missing SDK smoke section detail');
    writeChecks.push('reusableSection');

    const createdRecord = await writeClient.createRecord(fixture.collectionId, {
      title: 'SDK Public Record',
      summary: 'Created through the SDK write smoke.',
      category: 'Featured',
    }, `sdk-public-record-${Date.now()}`);
    assert(createdRecord.data.record?.status === 'draft', 'createRecord() should create draft public records');
    writeChecks.push('createRecord');

    const updatedRecord = await writeClient.updateRecord(fixture.collectionId, createdRecord.data.record.id, {
      title: 'SDK Public Record Ignored Title',
      summary: 'Updated through the SDK write smoke.',
      category: 'Standard',
    }, { publicWriteToken: fixture.publicWriteToken });
    assert(updatedRecord.data.record?.values?.summary === 'Updated through the SDK write smoke.', 'updateRecord() did not update an allowed public field');
    assert(updatedRecord.data.record?.values?.category === 'Standard', 'updateRecord() did not update select field value');
    assert(updatedRecord.data.record?.values?.title === 'SDK Public Record', 'updateRecord() should respect public update field policy');
    assert(updatedRecord.data.visitorWritePolicy?.ignoredFields?.includes?.('title'), 'updateRecord() should expose ignored public update fields');
    writeChecks.push('updateRecord');

    const deletedRecord = await writeClient.deleteRecord(fixture.collectionId, createdRecord.data.record.id, {
      publicWriteToken: fixture.publicWriteToken,
    });
    assert(deletedRecord.data.deleted === true, 'deleteRecord() should report deleted public records');
    assert(deletedRecord.data.recordId === createdRecord.data.record.id, 'deleteRecord() returned the wrong record id');
    writeChecks.push('deleteRecord');

    const cachedRecords = await writeClient.recordsCached(fixture.collectionId, {
      slug: fixture.publishedRecordSlug,
    });
    assert(cachedRecords.notModified === false, 'recordsCached() should return SDK smoke collection records body');
    assert(cachedRecords.body?.data?.records?.some?.((record) => record.id === fixture.publishedRecordId), 'recordsCached() missing published SDK smoke record');
    assert(cachedRecords.meta.cacheScope === 'discovery', 'recordsCached() expected discovery cache scope');
    assert(cachedRecords.meta.etag, 'recordsCached() SDK smoke missing response ETag');
    const revalidatedRecords = await writeClient.recordsCached(fixture.collectionId, {
      slug: fixture.publishedRecordSlug,
      etag: cachedRecords.meta.etag,
    });
    assert(revalidatedRecords.notModified === true, 'recordsCached() SDK smoke revalidation failed');
    writeChecks.push('recordsCached');

    const form = await writeClient.form('sdk-smoke-form');
    assert(form.data.form?.id === 'sdk-smoke-form', 'form() missing SDK smoke form');
    writeChecks.push('form');

    const formDefinition = await writeClient.formDefinitionCached('sdk-smoke-form');
    assert(formDefinition.notModified === false, 'formDefinitionCached() should return SDK smoke form body');
    assert(formDefinition.body?.data?.form?.id === 'sdk-smoke-form', 'formDefinitionCached() missing SDK smoke form');
    assert(formDefinition.meta.cacheScope === 'discovery', 'formDefinitionCached() expected discovery cache scope');
    assert(formDefinition.meta.etag, 'formDefinitionCached() SDK smoke missing response ETag');
    const revalidatedFormDefinition = await writeClient.formDefinitionCached('sdk-smoke-form', { etag: formDefinition.meta.etag });
    assert(revalidatedFormDefinition.notModified === true, 'formDefinitionCached() SDK smoke revalidation failed');
    writeChecks.push('formDefinitionCached');

    const submittedForm = await writeClient.submitForm('sdk-smoke-form', {
      values: {
        title: 'SDK Form Record',
        message: 'Submitted through the SDK.',
        category: 'Standard',
      },
      pageId: fixture.pageId,
      requestId: 'sdk-form-submit',
      rateLimitBypass: true,
      contactShareOverride: {
        enabled: true,
        nameField: 'title',
        notesField: 'message',
      },
    });
    const submissionId = submittedForm.data.submission?.id;
    const contactId = submittedForm.data.contact?.id;
    assert(submissionId, 'submitForm() missing submission id');
    assert(submittedForm.data.collectionRecord?.status === 'draft', 'submitForm() missing draft collection record');
    assert(contactId, 'submitForm() missing generated contact id');
    writeChecks.push('submitForm');

    const submissions = await writeClient.formSubmissions('sdk-smoke-form', {
      status: 'approved',
      requestId: 'sdk-form-submit',
    });
    assert(
      submissions.data.submissions?.data?.some?.((submission) => submission.id === submissionId),
      'formSubmissions() missing submitted form',
    );
    writeChecks.push('formSubmissions');

    const submissionDetail = await writeClient.formSubmission('sdk-smoke-form', submissionId);
    assert(submissionDetail.data.submission?.id === submissionId, 'formSubmission() returned wrong submission');
    writeChecks.push('formSubmission');

    const updatedSubmission = await writeClient.updateFormSubmission('sdk-smoke-form', submissionId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
    });
    assert(updatedSubmission.data.submission?.status === 'approved', 'updateFormSubmission() did not keep approved status');
    writeChecks.push('updateFormSubmission');

    const contacts = await writeClient.formContacts('sdk-smoke-form', { requestId: 'sdk-form-submit' });
    assert(contacts.data.contacts?.some?.((contact) => contact.id === contactId), 'formContacts() missing generated contact');
    writeChecks.push('formContacts');

    const updatedContact = await writeClient.updateFormContact('sdk-smoke-form', contactId, { status: 'qualified' });
    assert(updatedContact.data.contact?.status === 'qualified', 'updateFormContact() did not update contact status');
    writeChecks.push('updateFormContact');

    const comment = await writeClient.submitPageComment(fixture.pageId, {
      content: 'SDK comment body',
      authorName: 'SDK Commenter',
      moderationMode: 'auto-approve',
      requestId: 'sdk-page-comment',
      rateLimitBypass: true,
    });
    const commentId = comment.data.comment?.id;
    assert(commentId, 'submitPageComment() missing comment id');
    assert(comment.data.comment?.status === 'approved', 'submitPageComment() did not auto-approve comment');
    writeChecks.push('submitPageComment');

    const pageComments = await writeClient.pageComments(fixture.pageId, {
      status: 'approved',
      requestId: 'sdk-page-comment',
    });
    assert(pageComments.data.comments?.some?.((item) => item.id === commentId), 'pageComments() missing submitted comment');
    writeChecks.push('pageComments');

    const pageComment = await writeClient.pageComment(fixture.pageId, commentId);
    assert(pageComment.data.comment?.id === commentId, 'pageComment() returned wrong comment');
    writeChecks.push('pageComment');

    const updatedPageComment = await writeClient.updatePageComment(fixture.pageId, commentId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
      requestId: 'sdk-page-comment-review',
    });
    assert(updatedPageComment.data.comment?.id === commentId, 'updatePageComment() returned wrong comment');
    writeChecks.push('updatePageComment');

    const siteComment = await writeClient.comment(commentId);
    assert(siteComment.data.comment?.id === commentId, 'comment() returned wrong site comment');
    writeChecks.push('comment');

    const updatedSiteComment = await writeClient.updateComment(commentId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
      requestId: 'sdk-site-comment-review',
    });
    assert(updatedSiteComment.data.comment?.id === commentId, 'updateComment() returned wrong site comment');
    writeChecks.push('updateComment');

    const reasons = await writeClient.reportReasons();
    assert(reasons.data.reasons?.includes?.('spam'), 'reportReasons() missing spam reason');
    writeChecks.push('reportReasons');

    const report = await writeClient.reportComment(commentId, {
      reason: 'spam',
      requestId: 'sdk-comment-report',
    });
    assert(report.data.comment?.id === commentId, 'reportComment() returned wrong comment');
    writeChecks.push('reportComment');

    const reportEvents = await writeClient.events({
      kind: 'comment-reported',
      requestId: 'sdk-comment-report',
    });
    assert(reportEvents.data.events?.some?.((event) => event.commentId === commentId), 'events() missing comment report event');
    writeChecks.push('events:write');
  } finally {
    await deleteFixture(fixture.siteId);
  }
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  siteId: client.getSiteId(),
  identifier,
  checked: [
    'discoverSite',
    'sites',
    'manifest',
    'manifestCached',
    'frontendDesign',
    'frontendDesignCached',
    'openapi',
    'openapiCached',
    'resolve',
    'render',
    'renderCached',
    'pages',
    'pagesCached',
    'blog',
    'blogFeeds',
    'blogRss',
    'blogRssUrl',
    'blogCached',
    'blogCategories',
    'blogCategoriesCached',
    'blogTags',
    'blogTagsCached',
    'blogAuthors',
    'blogAuthorsCached',
    'navigation',
    'navigationCached',
    'seo',
    'seoCached',
    'media',
    'mediaCached',
    'mediaAssetCached',
    'mediaFonts',
    'mediaFontsCached',
    'mediaFileUrl',
    'mediaTransformUrl',
    'collections',
    'collectionsCached',
    'collectionCached',
    'reusableSections',
    'reusableSectionsCached',
    'reusableSectionCached',
    'forms',
    'formsCached',
    'formDefinition',
    'formDefinitionCached',
    'reportReasons',
    'reportReasonsCached',
    'siteComments',
    'events',
    ...(commerceCatalogChecked ? ['commerceOrderContract', 'commerceOrderContractCached', 'commerceCatalog', 'commerceCatalogCached'] : []),
  ],
  writeChecked: writeChecks,
}, null, 2));
