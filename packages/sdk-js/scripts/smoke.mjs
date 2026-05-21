#!/usr/bin/env node

import { createServer } from 'node:http';

import {
  buildBackyCommentInput,
  buildBackyCommentReportInput,
  buildBackyCollectionRecordWriteInput,
  buildBackyCommerceOrderInput,
  buildBackyFormSubmissionInput,
  buildBackyInteractiveRuntimeEventInput,
  buildBackyLiveManagedBlogPostEditableMapUpdate,
  buildBackyMediaBindingInput,
  buildBackyMediaSignedUrlInput,
  createBackyClient,
  findBackyContentElement,
  groupBackyContentElements,
  listBackyContentElements,
  patchBackyContentEditableFields,
  patchBackyContentEditableMapEntries,
  patchBackyContentEditableMapValues,
  patchBackyContentElement,
  patchBackyContentElements,
  ungroupBackyContentElements,
} from '../dist/index.js';

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

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

const minimalPdf = (text) => {
  const safeText = text.replace(/[()\\]/g, '');
  return Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${safeText.length + 54} >>
stream
BT /F1 12 Tf 20 80 Td (${safeText}) Tj ET
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF
`, 'utf8');
};

async function startSmokeWebhookReceiver(pathname) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      json = null;
    }

    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
      json,
    });
    response.writeHead(204).end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object' && address.port, 'smoke webhook receiver did not bind a local port');

  return {
    requests,
    url: `http://127.0.0.1:${address.port}${pathname}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

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
  const operatorTemplate = certification.operatorCommandTemplate;
  const operatorEnvTemplate = certification.operatorEnvTemplate;
  assert(
    typeof operatorTemplate?.command === 'string' &&
      operatorTemplate.command.includes('npm run ci:commerce-provider-certification'),
    `${label} missing commerce provider operator command template`,
  );
  assert(
    operatorTemplate.command.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED') &&
      operatorTemplate.command.includes('BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED'),
    `${label} missing guarded commerce certification command env`,
  );
  assert(
    operatorTemplate.envTemplateSchemaVersion === 'backy.commerce-provider-certification-env-template.v1',
    `${label} missing commerce operator env-template schema`,
  );
  assert(
    typeof operatorTemplate.envTemplate === 'string' &&
      operatorTemplate.envTemplate.includes('# Backy commerce provider certification environment') &&
      operatorTemplate.envTemplate.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1') &&
      operatorTemplate.envTemplate.includes('BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER=auto') &&
      operatorTemplate.envTemplate.includes('BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1'),
    `${label} missing commerce operator env-template body`,
  );
  assert(
    operatorEnvTemplate?.schemaVersion === 'backy.commerce-provider-certification-env-template.v1' &&
      operatorEnvTemplate.format === 'shell-env' &&
      operatorEnvTemplate.fileName === '.env.backy-commerce-provider-certification',
    `${label} missing commerce operator env-template handoff`,
  );
  assert(
    typeof operatorEnvTemplate.body === 'string' &&
      operatorEnvTemplate.body === operatorTemplate.envTemplate &&
      operatorEnvTemplate.body.includes('BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER=auto'),
    `${label} commerce operator env-template body drifted`,
  );
  assert(
    typeof operatorEnvTemplate.secretHandling === 'string' &&
      operatorEnvTemplate.secretHandling.includes('keep real commerce provider credentials in CI secrets'),
    `${label} missing commerce operator env-template secret boundary`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.payment) &&
      operatorTemplate.providerChoices.payment.includes('stripe') &&
      operatorTemplate.providerChoices.payment.includes('razorpay'),
    `${label} missing payment provider selector choices`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.tax) &&
      operatorTemplate.providerChoices.tax.includes('taxjar') &&
      operatorTemplate.providerChoices.tax.includes('avalara'),
    `${label} missing tax provider selector choices`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.shipping) &&
      operatorTemplate.providerChoices.shipping.includes('easypost') &&
      operatorTemplate.providerChoices.shipping.includes('shippo'),
    `${label} missing shipping provider selector choices`,
  );
  assert(
    Array.isArray(operatorTemplate.requiredInputs) &&
      operatorTemplate.requiredInputs.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1') &&
      operatorTemplate.requiredInputs.includes('BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET'),
    `${label} missing commerce operator required-input aliases`,
  );
  assert(
    Array.isArray(operatorTemplate.targetInputs) &&
      operatorTemplate.targetInputs.includes('BACKY_COMMERCE_CERTIFICATION_BASE_URL'),
    `${label} missing commerce external target guard inputs`,
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
    'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
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
  const postSlug = `sdk-smoke-post-${unique}`;

  const post = await request(`/api/admin/sites/${siteId}/blog`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'SDK Smoke Post',
      slug: postSlug,
      excerpt: 'Temporary blog post for SDK live-management smoke.',
      status: 'draft',
      content: {
        elements: [
          {
            id: 'sdk-smoke-post-heading',
            type: 'heading',
            x: 80,
            y: 80,
            width: 720,
            height: 96,
            props: { content: 'SDK live blog post', level: 'h1' },
          },
        ],
        canvasSize: { width: 1200, height: 760 },
      },
    }),
  });
  assert(post.response.status === 201, `${post.url} expected blog post create 201, got ${post.response.status}`);
  const postId = post.json?.data?.post?.id;
  assert(postId, 'temporary SDK smoke blog post missing id');
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
    postId,
    postSlug,
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
const interactiveRuntimeEventInput = buildBackyInteractiveRuntimeEventInput({
  type: 'backy.interactive-component.error',
  component: {
    key: 'backy.custom.sandboxed',
    version: '1.0.0',
  },
  data: {
    elementId: 'sdk-smoke-code-component',
  },
  error: {
    message: 'SDK smoke sandbox runtime error',
  },
  requestId: `sdk-interactive-runtime-${Date.now()}`,
});
assert(interactiveRuntimeEventInput.type === 'error', 'buildBackyInteractiveRuntimeEventInput() did not normalize prefixed event type');
assert(interactiveRuntimeEventInput.componentKey === 'backy.custom.sandboxed', 'buildBackyInteractiveRuntimeEventInput() did not normalize component key');
assert(interactiveRuntimeEventInput.version === '1.0.0', 'buildBackyInteractiveRuntimeEventInput() did not normalize component version');
assert(interactiveRuntimeEventInput.message === 'SDK smoke sandbox runtime error', 'buildBackyInteractiveRuntimeEventInput() did not normalize error message');
const interactiveRuntimeEvent = await client.recordInteractiveRuntimeEvent(interactiveRuntimeEventInput);
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
assert(manifestMedia.capabilities?.authenticatedUpload === true, 'manifest() media discovery missing authenticated upload capability');
assert(manifestMedia.capabilities?.folderManagement === true, 'manifest() media discovery missing folder management capability');
assert(manifestMedia.capabilities?.retainedVersions === true, 'manifest() media discovery missing retained version capability');
assert(manifestMedia.capabilities?.responsiveTransformPreparation === true, 'manifest() media discovery missing responsive transform preparation capability');
assert(manifestMedia.capabilities?.bindingMetadata === true, 'manifest() media discovery missing binding metadata capability');
assert(manifestMedia.capabilities?.providerAnalyticsIngestion === true, 'manifest() media discovery missing provider analytics ingestion capability');
assert(manifestMedia.fileCategories?.some?.((category) => (
  category.type === 'document' &&
  category.aliases?.includes?.('file') &&
  category.pickerUse === 'downloadable-document' &&
  category.delivery === 'public-or-signed-file' &&
  category.transformEligible === false
)), 'manifest() media discovery missing document category');
assert(manifestMedia.fileCategories?.some?.((category) => (
  category.type === 'font' &&
  category.pickerUse === 'typography' &&
  category.fontManifestEligible === true
)), 'manifest() media discovery missing font category');
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
assert(manifestMedia.deliveryPolicy?.privateFiles === 'signed-url-required', 'manifest() media discovery missing signed URL policy');
assert(manifestMedia.deliveryPolicy?.signedUrlEndpoint === `/api/admin/sites/${client.getSiteId()}/media/{mediaId}/signed-url`, 'manifest() media discovery signed URL endpoint drifted');
assert(manifestMedia.deliveryPolicy?.acceptedDispositions?.includes?.('attachment'), 'manifest() media discovery missing attachment disposition');
assert(manifestMedia.deliveryPolicy?.downloadableTypes?.includes?.('document'), 'manifest() media discovery missing document downloadable type');
assert(manifestMedia.managementPolicy?.schemaVersion === 'backy.media-management.v1', 'manifest() missing media management policy');
assert(manifestMedia.managementPolicy?.endpoints?.upload === `/api/admin/sites/${client.getSiteId()}/media`, 'manifest() media management upload endpoint drifted');
assert(manifestMedia.managementPolicy?.endpoints?.signedUrl === `/api/admin/sites/${client.getSiteId()}/media/{mediaId}/signed-url`, 'manifest() media management signed URL endpoint drifted');
assert(manifestMedia.managementPolicy?.methods?.upload === 'POST', 'manifest() media management upload method drifted');
assert(manifestMedia.managementPolicy?.methods?.replace === 'POST', 'manifest() media management replace method drifted');
assert(manifestMedia.managementPolicy?.methods?.delete === 'DELETE', 'manifest() media management delete method drifted');
assert(manifestMedia.managementPolicy?.auth?.requiredPermissions?.create === 'media.create', 'manifest() media management create permission drifted');
assert(manifestMedia.managementPolicy?.auth?.requiredPermissions?.update === 'media.edit', 'manifest() media management update permission drifted');
assert(manifestMedia.managementPolicy?.auth?.requiredPermissions?.delete === 'media.delete', 'manifest() media management delete permission drifted');
assert(manifestMedia.managementPolicy?.auth?.requiredPermissions?.privateDelivery === 'media.view', 'manifest() media management private delivery permission drifted');
assert(manifestMedia.managementPolicy?.uploadFields?.includes?.('file'), 'manifest() media management missing file upload field');
assert(manifestMedia.managementPolicy?.uploadFields?.includes?.('folderId'), 'manifest() media management missing folderId upload field');
assert(manifestMedia.managementPolicy?.uploadFields?.includes?.('fontFamily'), 'manifest() media management missing fontFamily upload field');
assert(manifestMedia.managementPolicy?.sdkHelpers?.upload === 'uploadMedia', 'manifest() media management missing upload helper');
assert(manifestMedia.managementPolicy?.sdkHelpers?.signedUrl === 'createMediaSignedUrl', 'manifest() media management missing signed URL helper');
assert(manifestMedia.managementPolicy?.sdkHelpers?.bind === 'bindMedia', 'manifest() media management missing bind helper');
assert(manifestMedia.managementPolicy?.sdkHelpers?.transforms === 'prepareMediaTransforms', 'manifest() media management missing transforms helper');
assert(manifestMedia.managementPolicy?.responseContracts?.signedUrl === 'backy.media-signed-url.v1', 'manifest() media management missing signed URL response contract');
assert(manifestMedia.schemas?.folders === 'backy.media-folders.v1', 'manifest() media discovery missing folder schema');
assert(manifestMedia.schemas?.fileCategories === 'backy.media-file-categories.v1', 'manifest() media discovery missing file category schema');
const mediaBindingInput = buildBackyMediaBindingInput({
  target: {
    type: 'blog-post',
    id: 'sdk-smoke-post',
  },
  usage: 'featured',
  editor: 'sdk-smoke',
  requestId: 'sdk-media-bind',
});
assert(mediaBindingInput.targetType === 'post', 'buildBackyMediaBindingInput() did not normalize blog-post targets');
assert(mediaBindingInput.targetId === 'sdk-smoke-post', 'buildBackyMediaBindingInput() did not normalize target id');
assert(mediaBindingInput.usageType === 'featured', 'buildBackyMediaBindingInput() did not normalize usage alias');
assert(mediaBindingInput.attachedBy === 'sdk-smoke', 'buildBackyMediaBindingInput() did not normalize attachedBy alias');
const mediaSignedUrlInput = buildBackyMediaSignedUrlInput({
  access: {
    disposition: 'download',
    ttl: '900',
  },
  requestId: 'sdk-media-signed-url',
});
assert(mediaSignedUrlInput.disposition === 'attachment', 'buildBackyMediaSignedUrlInput() did not normalize download disposition');
assert(mediaSignedUrlInput.expiresInSeconds === 900, 'buildBackyMediaSignedUrlInput() did not normalize ttl seconds');
assert(mediaSignedUrlInput.requestId === 'sdk-media-signed-url', 'buildBackyMediaSignedUrlInput() did not preserve request id');
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
assert(manifestLiveManagement.endpoints?.post === manifest.data.endpoints.liveManagePost, 'manifest() live-management blog post endpoint drifted');
assert(manifestLiveManagement.methods?.read === 'GET' && manifestLiveManagement.methods?.update === 'PATCH', 'manifest() live-management methods drifted');
assert(manifestLiveManagement.auth?.requiredPermissions?.read === 'pages.view', 'manifest() live-management missing read permission');
assert(manifestLiveManagement.auth?.requiredPermissions?.update === 'pages.edit', 'manifest() live-management missing update permission');
assert(manifestLiveManagement.auth?.siteScope === true, 'manifest() live-management missing site scope requirement');
assert(manifestLiveManagement.capabilities?.editableMap === true, 'manifest() live-management missing editable map capability');
assert(manifestLiveManagement.capabilities?.postMetadata === true, 'manifest() live-management missing blog post metadata capability');
assert(manifestLiveManagement.capabilities?.optimisticConcurrency === true, 'manifest() live-management missing optimistic concurrency capability');
assert(manifestLiveManagement.capabilities?.editorComposition === true, 'manifest() live-management missing editor composition capability');
assert(manifestLiveManagement.editableTargets?.includes?.('props.content'), 'manifest() live-management missing content editable target');
assert(manifestLiveManagement.editableTargets?.includes?.('props.formId'), 'manifest() live-management missing form id editable target');
assert(manifestLiveManagement.editableTargets?.includes?.('props.options'), 'manifest() live-management missing form options editable target');
assert(manifestLiveManagement.editorComposition?.schemaVersion === 'backy.editor-composition-commands.v1', 'manifest() live-management missing editor composition command contract');
assert(manifestLiveManagement.editorComposition?.sdkHelpers?.group === 'groupBackyContentElements', 'manifest() live-management missing SDK group helper');
assert(manifestLiveManagement.editorComposition?.sdkHelpers?.ungroup === 'ungroupBackyContentElements', 'manifest() live-management missing SDK ungroup helper');
assert(manifestLiveManagement.editorComposition?.commands?.some?.((command) => command.id === 'group' && command.shortcut === 'Cmd/Ctrl+G' && command.minSelected === 2), 'manifest() live-management missing group command metadata');
assert(manifestLiveManagement.editorComposition?.commands?.some?.((command) => command.id === 'ungroup' && command.shortcut === 'Shift+Cmd/Ctrl+G' && command.editorGroupRequired === true), 'manifest() live-management missing ungroup command metadata');
assert(manifestLiveManagement.editorComposition?.constraints?.editorGroupMarker === 'props.editorGroup', 'manifest() live-management missing editor group marker constraint');
assert(manifestLiveManagement.editorComposition?.constraints?.responsiveBreakpoints?.includes?.('mobile'), 'manifest() live-management missing responsive grouping breakpoint metadata');
assert(manifestLiveManagement.updateBody?.expectedUpdatedAt, 'manifest() live-management missing expectedUpdatedAt update guidance');
assert(manifestLiveManagement.errors?.conflict === 'PAGE_VERSION_CONFLICT', 'manifest() live-management conflict code drifted');
assert(manifestLiveManagement.errors?.postConflict === 'BLOG_VERSION_CONFLICT', 'manifest() live-management blog conflict code drifted');
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
assert(manifestFormsRuntime.capabilities?.authenticatedManagement === true, 'manifest() forms runtime missing authenticated management capability');
assert(manifestFormsRuntime.capabilities?.contactCrm === true, 'manifest() forms runtime missing contact CRM capability');
assert(manifestFormsRuntime.capabilities?.deliveryRetries === true, 'manifest() forms runtime missing delivery retry capability');
assert(manifestFormsRuntime.cache?.definition === 'public-discovery', 'manifest() forms runtime definition cache policy drifted');
assert(manifestFormsRuntime.cache?.submissions === 'private-no-store', 'manifest() forms runtime submissions cache policy drifted');
assert(manifestFormsRuntime.privacy?.publicDefinitionExcludesSubmissions === true, 'manifest() forms runtime missing public definition privacy boundary');
assert(manifestFormsRuntime.managementPolicy?.schemaVersion === 'backy.forms-management.v1', 'manifest() missing forms management policy');
assert(manifestFormsRuntime.managementPolicy?.endpoints?.create === `/api/admin/sites/${client.getSiteId()}/forms`, 'manifest() forms management create endpoint drifted');
assert(manifestFormsRuntime.managementPolicy?.endpoints?.retryWebhook === `/api/admin/sites/${client.getSiteId()}/forms/{formId}/submissions/{submissionId}/webhook-retry`, 'manifest() forms management webhook retry endpoint drifted');
assert(manifestFormsRuntime.managementPolicy?.methods?.reviewSubmission === 'POST', 'manifest() forms management review method drifted');
assert(manifestFormsRuntime.managementPolicy?.auth?.requiredPermissions?.manage === 'forms.manage', 'manifest() forms management manage permission drifted');
assert(manifestFormsRuntime.managementPolicy?.auth?.requiredPermissions?.delete === 'forms.delete', 'manifest() forms management delete permission drifted');
assert(manifestFormsRuntime.managementPolicy?.sdkHelpers?.clone === 'cloneAdminForm', 'manifest() forms management missing clone helper');
assert(manifestFormsRuntime.managementPolicy?.sdkHelpers?.retryWebhook === 'retryFormSubmissionWebhook', 'manifest() forms management missing webhook retry helper');
assert(manifestFormsRuntime.managementPolicy?.sdkHelpers?.promoteContactCustomer === 'promoteFormContactToCustomer', 'manifest() forms management missing customer promotion helper');
assert(manifestFormsRuntime.managementPolicy?.responseContracts?.persistenceCertification === 'backy.forms-persistence-certification.v1', 'manifest() forms management missing persistence certification contract');
assert(manifestFormsRuntime.managementPolicy?.privacy?.databaseCredentialsNeverReturned === true, 'manifest() forms management missing database credential privacy boundary');
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
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('commerce'), 'manifest() missing commerce database certification coverage');
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('generated-sdk'), 'manifest() missing generated SDK database certification coverage');
assert(manifest.data.contract?.databaseCertification?.coverage?.includes('interactive-components'), 'manifest() missing interactive component database certification coverage');
assert(manifest.data.contract?.databaseCertification?.scenarioEvidence?.schemaVersion === 'backy.frontend-database-certification-evidence.v1', 'manifest() missing database certification scenario evidence schema');
assert(manifest.data.contract?.databaseCertification?.scenarioEvidence?.requiredGate === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke', 'manifest() database certification scenario evidence gate drifted');
assert(manifest.data.contract?.databaseCertification?.scenarioEvidence?.scenarios?.some((scenario) => scenario.key === 'manifest-openapi-discovery'), 'manifest() missing manifest/openapi database certification scenario');
assert(manifest.data.contract?.databaseCertification?.scenarioEvidence?.scenarios?.some((scenario) => scenario.key === 'commerce-contracts'), 'manifest() missing commerce database certification scenario');
assert(manifest.data.contract?.databaseCertification?.scenarioEvidence?.scenarios?.some((scenario) => scenario.key === 'generated-sdk-cache'), 'manifest() missing generated SDK database certification scenario');
assert(
  typeof manifest.data.contract?.databaseCertification?.scenarioEvidence?.secretHandling === 'string' &&
    manifest.data.contract.databaseCertification.scenarioEvidence.secretHandling.includes('database URLs, service credentials, private orders, submissions, and contact payloads stay private'),
  'manifest() missing non-secret database certification scenario boundary',
);
const databaseOperatorCommandTemplate = manifest.data.contract?.databaseCertification?.operatorCommandTemplate || {};
const databaseOperatorEnvTemplate = manifest.data.contract?.databaseCertification?.operatorEnvTemplate || {};
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.command?.includes('npm run ci:sdk-postgres-smoke'), 'manifest() missing SDK Postgres operator command template');
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.command?.includes('BACKY_SDK_REQUIRE_DATABASE'), 'manifest() missing SDK database-mode operator env');
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.command?.includes('npm run doctor:release-certification'), 'manifest() missing SDK release doctor command');
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.databaseUrlAliases?.includes('BACKY_DATABASE_URL'), 'manifest() missing operator BACKY_DATABASE_URL alias');
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.requiredInputs?.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'), 'manifest() missing operator disposable confirmation input');
assert(manifest.data.contract?.databaseCertification?.operatorCommandTemplate?.targetGuards?.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'), 'manifest() missing operator database-name guard');
assert(databaseOperatorCommandTemplate.envTemplateSchemaVersion === 'backy.frontend-database-certification-env-template.v1', 'manifest() missing SDK Postgres operator env-template schema');
assert(
  typeof databaseOperatorCommandTemplate.envTemplate === 'string' &&
    databaseOperatorCommandTemplate.envTemplate.includes('BACKY_DATABASE_URL=<disposable-postgres-url>') &&
    databaseOperatorCommandTemplate.envTemplate.includes('BACKY_SDK_REQUIRE_DATABASE=1') &&
    databaseOperatorCommandTemplate.envTemplate.includes('BACKY_RELEASE_CERTIFY_DATABASE=1'),
  'manifest() missing SDK Postgres operator env template body',
);
assert(
  typeof databaseOperatorCommandTemplate.secretHandling === 'string' &&
    databaseOperatorCommandTemplate.secretHandling.includes('Disposable database URLs stay in CI secrets'),
  'manifest() missing SDK Postgres operator env-template secret boundary',
);
assert(databaseOperatorEnvTemplate.schemaVersion === 'backy.frontend-database-certification-env-template.v1', 'manifest() missing SDK Postgres operator env template schema');
assert(databaseOperatorEnvTemplate.format === 'shell-env', 'manifest() SDK Postgres operator env template must be shell-env format');
assert(databaseOperatorEnvTemplate.fileName === '.env.backy-frontend-database-certification', 'manifest() SDK Postgres operator env template filename drifted');
assert(
  typeof databaseOperatorEnvTemplate.body === 'string' &&
    databaseOperatorEnvTemplate.body.includes('# Backy frontend SDK database certification environment') &&
    databaseOperatorEnvTemplate.body.includes('BACKY_DATABASE_URL=<disposable-postgres-url>') &&
    databaseOperatorEnvTemplate.body.includes('BACKY_SDK_REQUIRE_DATABASE=1') &&
    databaseOperatorEnvTemplate.body.includes('BACKY_RELEASE_CERTIFY_DATABASE=1'),
  'manifest() missing SDK Postgres operator env template body handoff',
);
assert(
  typeof databaseOperatorEnvTemplate.secretHandling === 'string' &&
    databaseOperatorEnvTemplate.secretHandling.includes('replace the database URL placeholder with a disposable migrated Supabase/Postgres secret'),
  'manifest() missing SDK Postgres operator env template secret handling',
);
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
assert(manifest.data.contract?.frontendLaunchReadiness?.schemaVersion === 'backy.frontend-launch-readiness.v1', 'manifest() missing frontend launch readiness schema');
assert(['ready', 'attention', 'blocked'].includes(manifest.data.contract.frontendLaunchReadiness.status), 'manifest() frontend launch readiness status drifted');
assert(typeof manifest.data.contract.frontendLaunchReadiness.score === 'number', 'manifest() missing frontend launch readiness score');
assert(manifest.data.contract.frontendLaunchReadiness.actionPlan?.schemaVersion === 'backy.frontend-launch-action-plan.v1', 'manifest() missing frontend launch action plan schema');
assert(manifest.data.contract.frontendLaunchReadiness.checks?.some((check) => check.key === 'routing-render-contracts'), 'manifest() missing routing/render launch readiness check');
assert(manifest.data.contract.frontendLaunchReadiness.checks?.some((check) => check.key === 'database-certification'), 'manifest() missing database launch readiness check');
assert(manifest.data.contract.frontendLaunchReadiness.privacy?.includesSecretValues === false, 'manifest() launch readiness must not include secret values');
assert(manifest.data.contract.frontendLaunchReadiness.privacy?.adminEndpointsRequireAuth === true, 'manifest() launch readiness missing admin auth boundary');
assert(manifest.data.contract.frontendLaunchReadiness.actionPlan?.recommendedCommands?.includes('npm run ci:sdk-postgres-smoke'), 'manifest() launch readiness missing SDK Postgres recommended command');
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
assert(openapi.components?.schemas?.LiveManagementDiscovery?.properties?.editorComposition, 'openapi() missing editor composition discovery schema');
assert(openapi['x-backy-live-management']?.editorComposition?.sdkHelpers?.group === 'groupBackyContentElements', 'openapi() missing live-management group helper metadata');
assert(openapi['x-backy-live-management']?.editorComposition?.commands?.some?.((command) => command.id === 'ungroup' && command.shortcut === 'Shift+Cmd/Ctrl+G'), 'openapi() missing live-management ungroup command metadata');
assert(openapi['x-backy-media-file-categories']?.managementPolicy?.schemaVersion === 'backy.media-management.v1', 'openapi() missing media management policy');
assert(openapi['x-backy-media-file-categories']?.managementPolicy?.sdkHelpers?.upload === 'uploadMedia', 'openapi() media management missing upload helper metadata');
assert(openapi.components?.schemas?.MediaManagementPolicy, 'openapi() missing media management policy schema');
assert(openapi['x-backy-forms-management']?.schemaVersion === 'backy.forms-management.v1', 'openapi() missing forms management policy');
assert(openapi['x-backy-forms-management']?.sdkHelpers?.clone === 'cloneAdminForm', 'openapi() forms management missing clone helper metadata');
assert(openapi.components?.schemas?.FormsManagementPolicy, 'openapi() missing forms management policy schema');
assert(openapi['x-backy-commerce-management']?.schemaVersion === 'backy.commerce-management.v1', 'openapi() missing commerce management policy');
assert(openapi['x-backy-commerce-management']?.sdkHelpers?.orderStatusHandoff === 'commerceOrderStatusHandoff', 'openapi() commerce management missing order status handoff helper metadata');
assert(openapi['x-backy-commerce-management']?.responseContracts?.providerCertification === 'backy.commerce-provider-certification-handoff.v1', 'openapi() commerce management missing provider certification contract metadata');
assert(openapi.components?.schemas?.CommerceManagementPolicy, 'openapi() missing commerce management policy schema');
assert(openapi['x-backy-database-certification']?.schemaVersion === manifest.data.contract.databaseCertification.schemaVersion, 'openapi() missing database certification schema extension');
assert(openapi['x-backy-database-certification']?.gate?.command === manifest.data.contract.databaseCertification.gate.command, 'openapi() database certification command drifted from manifest');
assert(openapi['x-backy-database-certification']?.operatorCommandTemplate?.command === manifest.data.contract.databaseCertification.operatorCommandTemplate.command, 'openapi() database certification operator command drifted from manifest');
assert(openapi['x-backy-database-certification']?.operatorCommandTemplate?.envTemplate === manifest.data.contract.databaseCertification.operatorCommandTemplate.envTemplate, 'openapi() database certification operator env template drifted from manifest');
assert(openapi['x-backy-database-certification']?.operatorEnvTemplate?.body === manifest.data.contract.databaseCertification.operatorEnvTemplate.body, 'openapi() database certification operator env-template handoff drifted from manifest');
assert(openapi['x-backy-database-certification']?.environment?.secretAliases?.includes('DATABASE_URL'), 'openapi() missing DATABASE_URL certification alias');
assert(openapi['x-backy-database-certification']?.environment?.requiredConfirmationEnv === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true', 'openapi() missing SDK Postgres disposable confirmation env requirement');
assert(openapi['x-backy-database-certification']?.environment?.targetGuards?.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'), 'openapi() missing database expected-host guard');
assert(openapi['x-backy-database-certification']?.requires?.includes('disposable_database_confirmed=true'), 'openapi() missing disposable database confirmation requirement');
assert(openapi['x-backy-database-certification']?.coverage?.includes('media'), 'openapi() missing media database certification coverage');
assert(openapi['x-backy-database-certification']?.coverage?.includes('forms'), 'openapi() missing forms database certification coverage');
assert(openapi['x-backy-database-certification']?.coverage?.includes('commerce'), 'openapi() missing commerce database certification coverage');
assert(openapi['x-backy-database-certification']?.coverage?.includes('generated-sdk'), 'openapi() missing generated SDK database certification coverage');
assert(typeof openapi['x-backy-database-certification']?.runtime?.databaseUrlConfigured === 'boolean', 'openapi() missing non-secret database URL runtime state');
assert(typeof openapi['x-backy-database-certification']?.runtime?.readyForCertification === 'boolean', 'openapi() missing SDK Postgres readiness runtime state');
assert(openapi['x-backy-database-certification']?.coverage?.includes('interactive-components'), 'openapi() missing interactive component database certification coverage');
assert(openapi['x-backy-database-certification']?.scenarioEvidence?.schemaVersion === manifest.data.contract.databaseCertification.scenarioEvidence.schemaVersion, 'openapi() missing database certification scenario evidence schema');
assert(openapi['x-backy-database-certification']?.scenarioEvidence?.requiredGate === manifest.data.contract.databaseCertification.scenarioEvidence.requiredGate, 'openapi() database certification scenario evidence gate drifted from manifest');
assert(openapi['x-backy-database-certification']?.scenarioEvidence?.scenarios?.some((scenario) => scenario.key === 'generated-sdk-cache'), 'openapi() missing generated SDK database certification scenario');
assert(
  typeof openapi['x-backy-database-certification']?.secretHandling === 'string' &&
    openapi['x-backy-database-certification'].secretHandling.includes('OpenAPI exposes only non-secret gate names and requirements'),
  'openapi() missing non-secret database certification boundary',
);
assert(openapi['x-backy-frontend-launch-readiness']?.schemaVersion === manifest.data.contract.frontendLaunchReadiness.schemaVersion, 'openapi() missing frontend launch readiness extension');
assert(openapi['x-backy-frontend-launch-readiness']?.actionPlan?.schemaVersion === 'backy.frontend-launch-action-plan.v1', 'openapi() missing frontend launch action plan extension');
assert(openapi['x-backy-frontend-launch-readiness']?.checks?.some((check) => check.key === 'database-certification'), 'openapi() missing database frontend launch check');
assert(openapi['x-backy-frontend-launch-readiness']?.privacy?.includesSecretValues === false, 'openapi() launch readiness must not include secret values');
assert(openapi['x-backy-frontend-launch-readiness']?.actionPlan?.recommendedCommands?.includes('npm run ci:sdk-postgres-smoke'), 'openapi() launch readiness missing SDK Postgres recommended command');
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
assert(manifestBlogRuntime.endpoints?.liveManage === manifest.data.endpoints.liveManagePost, 'manifest() blog runtime live manage endpoint drifted');
assert(manifestBlogRuntime.endpoints?.rss === manifest.data.endpoints.blogRss, 'manifest() blog runtime RSS endpoint drifted');
assert(manifestBlogRuntime.endpoints?.categories === manifest.data.endpoints.blogCategories, 'manifest() blog runtime categories endpoint drifted');
assert(manifestBlogRuntime.methods?.detail === 'GET', 'manifest() blog runtime detail method drifted');
assert(manifestBlogRuntime.methods?.liveManageUpdate === 'PATCH', 'manifest() blog runtime live update method drifted');
assert(manifestBlogRuntime.capabilities?.taxonomyFilters === true, 'manifest() blog runtime missing taxonomy filters capability');
assert(manifestBlogRuntime.capabilities?.rssFeed === true, 'manifest() blog runtime missing RSS feed capability');
assert(manifestBlogRuntime.capabilities?.liveManagement === true, 'manifest() blog runtime missing live management capability');
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
const commentAnalytics = await privateClient.commentAnalytics({ days: 30 });
assert(commentAnalytics.data.analytics?.totals && typeof commentAnalytics.data.analytics.totals.comments === 'number', 'commentAnalytics() missing moderation totals');
assert(typeof privateClient.retryCommentDelivery === 'function', 'retryCommentDelivery() missing SDK method');

const events = await privateClient.events({ limit: 5 });
assert(Array.isArray(events.data.events), 'events() missing events array');

const adminSettings = await privateClient.adminSettings();
assert(adminSettings.data.settings?.schemaVersion === 'backy.admin-settings.v1', 'adminSettings() missing settings schema version');
assert(adminSettings.data.settings?.providerCertification?.schemaVersion === 'backy.settings-provider-certification-handoff.v1', 'adminSettings() missing provider certification handoff');
assert(adminSettings.data.settings?.frontendDatabaseCertification?.schemaVersion === 'backy.frontend-database-certification.v1', 'adminSettings() missing frontend database certification handoff');
assert(typeof privateClient.regenerateAdminSettingsApiKeys === 'function', 'regenerateAdminSettingsApiKeys() missing SDK method');
assert(typeof privateClient.issueAdminSettingsApiKey === 'function', 'issueAdminSettingsApiKey() missing SDK method');
assert(typeof privateClient.revokeAdminSettingsApiKey === 'function', 'revokeAdminSettingsApiKey() missing SDK method');
assert(typeof privateClient.validateAdminSettingsInfrastructure === 'function', 'validateAdminSettingsInfrastructure() missing SDK method');
assert(typeof privateClient.runAdminSettingsStorageProvisioningProbe === 'function', 'runAdminSettingsStorageProvisioningProbe() missing SDK method');
assert(typeof privateClient.runAdminSettingsStorageCredentialRotationProbe === 'function', 'runAdminSettingsStorageCredentialRotationProbe() missing SDK method');
assert(typeof privateClient.runAdminSettingsStorageSecretManager === 'function', 'runAdminSettingsStorageSecretManager() missing SDK method');
assert(typeof privateClient.testAdminSettingsNotificationWebhook === 'function', 'testAdminSettingsNotificationWebhook() missing SDK method');

const issuedSettingsApiKey = await privateClient.issueAdminSettingsApiKey({
  label: `SDK Smoke Service Key ${Date.now()}`,
  requestId: 'sdk-settings-service-key-issue',
});
const issuedServiceKey = issuedSettingsApiKey.data.issuedKey;
assert(issuedServiceKey?.id, 'issueAdminSettingsApiKey() missing issued key id');
assert(issuedServiceKey?.label?.startsWith('SDK Smoke Service Key'), 'issueAdminSettingsApiKey() did not preserve label');
assert(typeof issuedServiceKey?.adminApiKey === 'string' && issuedServiceKey.adminApiKey.startsWith('sk_srv_'), 'issueAdminSettingsApiKey() missing one-time raw service key');
assert(issuedServiceKey.keyFingerprint, 'issueAdminSettingsApiKey() missing key fingerprint');
assert(!JSON.stringify(issuedSettingsApiKey.data.settings || {}).includes(issuedServiceKey.adminApiKey), 'issueAdminSettingsApiKey() leaked raw service key into settings payload');
assert(!JSON.stringify(issuedSettingsApiKey.data.settings || {}).includes('"keyHash"'), 'issueAdminSettingsApiKey() leaked service key hash into settings payload');

const serviceKeyClient = createBackyClient({
  baseUrl,
  siteId: client.getSiteId(),
  requestIdFactory: () => 'sdk-settings-service-key-request',
  defaultHeaders: {
    'x-backy-admin-key': issuedServiceKey.adminApiKey,
  },
});
const serviceKeySettings = await serviceKeyClient.adminSettings();
assert(serviceKeySettings.data.settings?.schemaVersion === 'backy.admin-settings.v1', 'issued service key could not read settings through SDK');
assert(serviceKeySettings.data.settings?.apiKeys?.adminApiKey === '', 'issued service key should not expose owner admin key');
assert(!JSON.stringify(serviceKeySettings.data.settings || {}).includes(issuedServiceKey.adminApiKey), 'issued service key leaked raw key on authenticated read');

const revokedSettingsApiKey = await privateClient.revokeAdminSettingsApiKey({
  keyId: issuedServiceKey.id,
  requestId: 'sdk-settings-service-key-revoke',
});
const revokedServiceKeyGrant = revokedSettingsApiKey.data.settings?.auth?.apiKeyServiceKeys?.find?.((grant) => grant.id === issuedServiceKey.id);
assert(revokedServiceKeyGrant?.status === 'revoked', 'revokeAdminSettingsApiKey() did not mark service key revoked');
assert(revokedServiceKeyGrant?.revokedAt, 'revokeAdminSettingsApiKey() missing revoked timestamp');
assert(!JSON.stringify(revokedSettingsApiKey.data.settings || {}).includes(issuedServiceKey.adminApiKey), 'revokeAdminSettingsApiKey() leaked raw service key into settings payload');
assert(!JSON.stringify(revokedSettingsApiKey.data.settings || {}).includes('"keyHash"'), 'revokeAdminSettingsApiKey() leaked service key hash into settings payload');
let revokedServiceKeyRejected = false;
try {
  await serviceKeyClient.adminSettings();
} catch (error) {
  revokedServiceKeyRejected = error?.status === 401 || error?.code === 'UNAUTHORIZED';
}
assert(revokedServiceKeyRejected, 'revoked service key should stop authenticating through SDK');

const settingsInfrastructure = await privateClient.validateAdminSettingsInfrastructure({
  deliveryMode: adminSettings.data.settings?.deliveryMode || 'managed-hosting',
  integrations: adminSettings.data.settings?.integrations || {},
  recordHistory: false,
  requestId: 'sdk-settings-infrastructure',
});
assert(Array.isArray(settingsInfrastructure.data.diagnostics), 'validateAdminSettingsInfrastructure() missing diagnostics array');
const settingsDiagnosticAreas = new Set(settingsInfrastructure.data.diagnostics.map((diagnostic) => diagnostic.area));
for (const area of ['database', 'storage', 'notifications']) {
  assert(settingsDiagnosticAreas.has(area), `validateAdminSettingsInfrastructure() missing ${area} diagnostic`);
}

const settingsStorageProvisioning = await privateClient.runAdminSettingsStorageProvisioningProbe({
  requestId: 'sdk-settings-storage-provisioning',
});
assert(settingsStorageProvisioning.data.provider, 'runAdminSettingsStorageProvisioningProbe() missing provider');
assert(settingsStorageProvisioning.data.status, 'runAdminSettingsStorageProvisioningProbe() missing status');
assert(Array.isArray(settingsStorageProvisioning.data.checks), 'runAdminSettingsStorageProvisioningProbe() missing checks');

const settingsCredentialRotation = await privateClient.runAdminSettingsStorageCredentialRotationProbe({
  requestId: 'sdk-settings-credential-rotation',
});
assert(settingsCredentialRotation.data.provider, 'runAdminSettingsStorageCredentialRotationProbe() missing provider');
assert(settingsCredentialRotation.data.probePath, 'runAdminSettingsStorageCredentialRotationProbe() missing probe path');
assert(Array.isArray(settingsCredentialRotation.data.fields), 'runAdminSettingsStorageCredentialRotationProbe() missing rotation fields');
assert(Array.isArray(settingsCredentialRotation.data.checks), 'runAdminSettingsStorageCredentialRotationProbe() missing checks');

const settingsSecretManager = await privateClient.runAdminSettingsStorageSecretManager({
  mode: 'plan',
  dryRun: true,
  targetEnvironments: ['preview'],
  requestId: 'sdk-settings-secret-manager',
});
assert(settingsSecretManager.data.secretManager === 'vercel-env', 'runAdminSettingsStorageSecretManager() returned wrong secret manager');
assert(settingsSecretManager.data.mode === 'plan', 'runAdminSettingsStorageSecretManager() did not preserve plan mode');
assert(settingsSecretManager.data.dryRun === true, 'runAdminSettingsStorageSecretManager() did not preserve dryRun');
assert(settingsSecretManager.data.executed === false, 'runAdminSettingsStorageSecretManager() should not execute in dry-run plan mode');
assert(Array.isArray(settingsSecretManager.data.operations), 'runAdminSettingsStorageSecretManager() missing operations');

const settingsNotificationReceiver = await startSmokeWebhookReceiver('/sdk-settings-notification');
try {
  const settingsNotification = await privateClient.testAdminSettingsNotificationWebhook({
    webhookUrl: settingsNotificationReceiver.url,
    requestId: 'sdk-settings-notification-webhook',
  });
  assert(settingsNotification.data.settings?.schemaVersion === 'backy.admin-settings.v1', 'testAdminSettingsNotificationWebhook() missing settings payload');
  assert(settingsNotification.data.delivery?.attempted === true, 'testAdminSettingsNotificationWebhook() did not attempt delivery');
  assert(settingsNotification.data.delivery?.status === 'succeeded', 'testAdminSettingsNotificationWebhook() did not report success');
  assert(settingsNotification.data.delivery?.statusCode === 204, 'testAdminSettingsNotificationWebhook() returned wrong status code');
  const settingsNotificationRequest = settingsNotificationReceiver.requests[0];
  assert(settingsNotificationRequest?.method === 'POST', 'testAdminSettingsNotificationWebhook() did not POST to the receiver');
  assert(settingsNotificationRequest?.url === '/sdk-settings-notification', 'testAdminSettingsNotificationWebhook() posted to the wrong path');
  assert(settingsNotificationRequest?.headers?.['x-backy-settings-webhook-test'] === 'true', 'testAdminSettingsNotificationWebhook() missing test header');
  assert(settingsNotificationRequest?.headers?.['x-backy-event-kind'] === 'settings.notification_webhook.test', 'testAdminSettingsNotificationWebhook() missing event-kind header');
  assert(settingsNotificationRequest?.headers?.['x-backy-request-id'] === 'sdk-settings-notification-webhook', 'testAdminSettingsNotificationWebhook() missing request id header');
  assert(settingsNotificationRequest?.json?.schemaVersion === 'backy.settings-notification-webhook-test.v1', 'testAdminSettingsNotificationWebhook() missing schema version');
  assert(settingsNotificationRequest?.json?.kind === 'settings.notification_webhook.test', 'testAdminSettingsNotificationWebhook() missing payload kind');
  assert(settingsNotificationRequest?.json?.requestId === 'sdk-settings-notification-webhook', 'testAdminSettingsNotificationWebhook() missing payload request id');
} finally {
  await settingsNotificationReceiver.close();
}

const adminSiteSettings = await privateClient.adminSiteSettings();
assert(adminSiteSettings.data.settings?.schemaVersion === 'backy.site-settings-scope.v1', 'adminSiteSettings() missing site settings schema version');
assert(adminSiteSettings.data.settings?.scope?.siteId === privateClient.getSiteId(), 'adminSiteSettings() returned wrong site settings scope');
assert(adminSiteSettings.data.settings?.frontendDatabaseCertification?.source === 'admin-site-settings-api', 'adminSiteSettings() missing site-scoped database certification handoff');

const adminFrontendDesign = await privateClient.adminFrontendDesign();
assert(adminFrontendDesign.data.frontendDesign?.schemaVersion === 'backy.frontend-design.v1', 'adminFrontendDesign() missing design contract');
assert(adminFrontendDesign.data.templateRegistry?.schemaVersion === 'backy.template-registry.v1', 'adminFrontendDesign() missing template registry summary');
assert(adminFrontendDesign.data.endpoints?.templates?.includes('/templates'), 'adminFrontendDesign() missing templates endpoint');

const adminTemplates = await privateClient.adminTemplates({ type: 'page' });
assert(adminTemplates.data.registry?.schemaVersion === 'backy.template-registry.v1', 'adminTemplates() missing registry schema');
assert(Array.isArray(adminTemplates.data.templates), 'adminTemplates() missing templates array');
assert(adminTemplates.data.registry?.cloneField === 'frontendDesignTemplateId', 'adminTemplates() missing clone field');
assert(typeof privateClient.updateAdminCollectionBindingPresets === 'function', 'updateAdminCollectionBindingPresets() missing SDK method');
const adminBindingPresets = await privateClient.adminCollectionBindingPresets();
assert(Array.isArray(adminBindingPresets.data.presets), 'adminCollectionBindingPresets() missing presets array');
assert(adminBindingPresets.data.site?.id === privateClient.getSiteId(), 'adminCollectionBindingPresets() returned wrong site');

const adminInteractiveComponents = await privateClient.adminInteractiveComponents({ status: 'all' });
assert(Array.isArray(adminInteractiveComponents.data.components), 'adminInteractiveComponents() missing components array');
assert(typeof privateClient.uploadAdminInteractiveComponentBundle === 'function', 'uploadAdminInteractiveComponentBundle() missing SDK method');
assert(typeof privateClient.migrateAdminInteractiveComponentVersion === 'function', 'migrateAdminInteractiveComponentVersion() missing SDK method');
assert(typeof privateClient.rollbackAdminInteractiveComponentVersion === 'function', 'rollbackAdminInteractiveComponentVersion() missing SDK method');
const firstAdminInteractiveComponent = adminInteractiveComponents.data.components[0];
if (firstAdminInteractiveComponent?.componentKey && firstAdminInteractiveComponent?.version) {
  const adminInteractiveComponent = await privateClient.adminInteractiveComponent(
    firstAdminInteractiveComponent.componentKey,
    firstAdminInteractiveComponent.version,
  );
  assert(adminInteractiveComponent.data.component?.componentKey === firstAdminInteractiveComponent.componentKey, 'adminInteractiveComponent() returned wrong component');
  const adminInteractiveComponentUsage = await privateClient.adminInteractiveComponentUsage(
    firstAdminInteractiveComponent.componentKey,
    firstAdminInteractiveComponent.version,
  );
  assert(Array.isArray(adminInteractiveComponentUsage.data.usage), 'adminInteractiveComponentUsage() missing usage array');
  const adminInteractiveComponentExport = await privateClient.exportAdminInteractiveComponent(
    firstAdminInteractiveComponent.componentKey,
    firstAdminInteractiveComponent.version,
  );
  assert(adminInteractiveComponentExport.data.exportPackage?.schemaVersion === 'backy.interactive-component-export.v1', 'exportAdminInteractiveComponent() missing export package schema');
}

const adminNavigation = await privateClient.adminNavigation();
assert(Array.isArray(adminNavigation.data.navigation?.settings?.primary), 'adminNavigation() missing editable primary settings');
assert(Array.isArray(adminNavigation.data.navigation?.resolved?.primary), 'adminNavigation() missing resolved public primary navigation');

const adminSeo = await privateClient.adminSeo();
assert(adminSeo.data.seo && typeof adminSeo.data.seo === 'object', 'adminSeo() missing editable SEO settings');
assert(Array.isArray(adminSeo.data.preview?.supportedVariables), 'adminSeo() missing SEO preview supported variables');

const adminRedirects = await privateClient.adminRedirects();
assert(Array.isArray(adminRedirects.data.redirects?.rules), 'adminRedirects() missing redirect rules');
assert(Array.isArray(adminRedirects.data.redirects?.conflicts), 'adminRedirects() missing redirect conflict diagnostics');

const adminSites = await privateClient.adminSites({ includeUnpublished: true });
assert(Array.isArray(adminSites.data.sites), 'adminSites() missing sites array');
assert(adminSites.data.sites.some((site) => site.id === privateClient.getSiteId()), 'adminSites() missing active site');
const adminSite = await privateClient.adminSite();
assert(adminSite.data.site?.id === privateClient.getSiteId(), 'adminSite() returned wrong site');
const adminSiteReadiness = await privateClient.adminSiteReadiness();
assert(adminSiteReadiness.data.readiness, 'adminSiteReadiness() missing readiness payload');

const adminUsers = await privateClient.adminUsers({ limit: 5 });
assert(Array.isArray(adminUsers.data.users), 'adminUsers() missing users array');
const firstAdminUserId = adminUsers.data.users[0]?.id;
if (firstAdminUserId) {
  const adminUser = await privateClient.adminUser(firstAdminUserId);
  assert(adminUser.data.user?.id === firstAdminUserId, 'adminUser() returned wrong user');
  const userPermissions = await privateClient.adminUserPermissions(firstAdminUserId);
  assert(userPermissions.data.permissions?.userId === firstAdminUserId, 'adminUserPermissions() returned wrong user');
  const userMfa = await privateClient.adminUserMfa(firstAdminUserId);
  assert(typeof userMfa.data.mfa?.enabled === 'boolean', 'adminUserMfa() missing enabled state');
}
if (adminSessionToken && !adminRequestApiKey) {
  const authSessions = await privateClient.adminAuthSessions();
  assert(Array.isArray(authSessions.data.sessions), 'adminAuthSessions() missing sessions array');
}

const adminTeams = await privateClient.adminTeams();
assert(Array.isArray(adminTeams.data.teams), 'adminTeams() missing teams array');
const firstAdminTeamId = adminTeams.data.teams[0]?.id;
if (firstAdminTeamId) {
  const adminTeam = await privateClient.adminTeam(firstAdminTeamId);
  assert(adminTeam.data.team?.id === firstAdminTeamId, 'adminTeam() returned wrong team');
  const teamMembers = await privateClient.adminTeamMembers(firstAdminTeamId);
  assert(Array.isArray(teamMembers.data.members), 'adminTeamMembers() missing members array');
}

const adminAuditLogs = await privateClient.adminAuditLogs({ limit: 5 });
assert(Array.isArray(adminAuditLogs.data.logs), 'adminAuditLogs() missing logs array');
assert(typeof adminAuditLogs.data.count === 'number', 'adminAuditLogs() missing count');

const adminPages = await privateClient.adminPages({ limit: 5 });
assert(Array.isArray(adminPages.data.pages), 'adminPages() missing pages array');
const firstAdminPageId = adminPages.data.pages[0]?.id;
if (firstAdminPageId) {
  const adminPage = await privateClient.adminPage(firstAdminPageId);
  assert(adminPage.data.page?.id === firstAdminPageId, 'adminPage() returned wrong page');
  const pageReadiness = await privateClient.adminPageReadiness(firstAdminPageId);
  assert(pageReadiness.data.readiness, 'adminPageReadiness() missing readiness payload');
  const pageRevisions = await privateClient.adminPageRevisions(firstAdminPageId, { limit: 5 });
  assert(Array.isArray(pageRevisions.data.revisions), 'adminPageRevisions() missing revisions array');
}

assert(typeof privateClient.createAdminBlogCategory === 'function', 'createAdminBlogCategory() missing SDK method');
assert(typeof privateClient.updateAdminBlogCategory === 'function', 'updateAdminBlogCategory() missing SDK method');
assert(typeof privateClient.deleteAdminBlogCategory === 'function', 'deleteAdminBlogCategory() missing SDK method');
assert(typeof privateClient.createAdminBlogTag === 'function', 'createAdminBlogTag() missing SDK method');
assert(typeof privateClient.updateAdminBlogTag === 'function', 'updateAdminBlogTag() missing SDK method');
assert(typeof privateClient.deleteAdminBlogTag === 'function', 'deleteAdminBlogTag() missing SDK method');
const adminBlogCategories = await privateClient.adminBlogCategories();
assert(Array.isArray(adminBlogCategories.data.categories), 'adminBlogCategories() missing categories array');
const firstAdminBlogCategoryId = adminBlogCategories.data.categories[0]?.id;
if (firstAdminBlogCategoryId) {
  const adminBlogCategory = await privateClient.adminBlogCategory(firstAdminBlogCategoryId);
  assert(adminBlogCategory.data.category?.id === firstAdminBlogCategoryId, 'adminBlogCategory() returned wrong category');
}
const adminBlogTags = await privateClient.adminBlogTags();
assert(Array.isArray(adminBlogTags.data.tags), 'adminBlogTags() missing tags array');
const firstAdminBlogTagId = adminBlogTags.data.tags[0]?.id;
if (firstAdminBlogTagId) {
  const adminBlogTag = await privateClient.adminBlogTag(firstAdminBlogTagId);
  assert(adminBlogTag.data.tag?.id === firstAdminBlogTagId, 'adminBlogTag() returned wrong tag');
}
const adminBlogAuthors = await privateClient.adminBlogAuthors();
assert(Array.isArray(adminBlogAuthors.data.authors), 'adminBlogAuthors() missing authors array');

const adminBlogPosts = await privateClient.adminBlogPosts({ limit: 5 });
assert(Array.isArray(adminBlogPosts.data.posts), 'adminBlogPosts() missing posts array');
const firstAdminBlogPostId = adminBlogPosts.data.posts[0]?.id;
if (firstAdminBlogPostId) {
  const adminBlogPost = await privateClient.adminBlogPost(firstAdminBlogPostId);
  assert(adminBlogPost.data.post?.id === firstAdminBlogPostId, 'adminBlogPost() returned wrong post');
  const postReadiness = await privateClient.adminBlogPostReadiness(firstAdminBlogPostId);
  assert(postReadiness.data.readiness, 'adminBlogPostReadiness() missing readiness payload');
  const postRevisions = await privateClient.adminBlogPostRevisions(firstAdminBlogPostId, { limit: 5 });
  assert(Array.isArray(postRevisions.data.revisions), 'adminBlogPostRevisions() missing revisions array');
}

const adminCollections = await privateClient.adminCollections({ limit: 50 });
assert(Array.isArray(adminCollections.data.collections), 'adminCollections() missing collections array');
const adminCollectionsBackup = await privateClient.exportAdminCollectionsBackup({ includeRecords: false });
assert(adminCollectionsBackup.data.backup?.schemaVersion === 'backy.collections.backup.v1', 'exportAdminCollectionsBackup() missing backup schema');
assert(Array.isArray(adminCollectionsBackup.data.collections), 'exportAdminCollectionsBackup() missing collections array');
const firstAdminCollectionId = adminCollections.data.collections[0]?.id;
if (firstAdminCollectionId) {
  const adminCollection = await privateClient.adminCollection(firstAdminCollectionId);
  assert(adminCollection.data.collection?.id === firstAdminCollectionId, 'adminCollection() returned wrong collection');
  const adminCollectionRecords = await privateClient.adminCollectionRecords(firstAdminCollectionId, { limit: 5 });
  assert(Array.isArray(adminCollectionRecords.data.records), 'adminCollectionRecords() missing records array');
  const adminCollectionRecordsCsv = await privateClient.adminCollectionRecordsCsv(firstAdminCollectionId, { limit: 5 });
  assert(typeof adminCollectionRecordsCsv === 'string', 'adminCollectionRecordsCsv() did not return CSV text');
  const firstAdminRecordId = adminCollectionRecords.data.records[0]?.id;
  if (firstAdminRecordId) {
    const adminCollectionRecord = await privateClient.adminCollectionRecord(firstAdminCollectionId, firstAdminRecordId);
    assert(adminCollectionRecord.data.record?.id === firstAdminRecordId, 'adminCollectionRecord() returned wrong record');
  }
}
const hasAdminProductsCollection = adminCollections.data.collections.some((collection) => collection.slug === 'products' || collection.id === 'products');
if (hasAdminProductsCollection) {
  const adminCommerceProducts = await privateClient.adminCommerceProducts({ limit: 5 });
  assert(Array.isArray(adminCommerceProducts.data.records), 'adminCommerceProducts() missing records array');
  assert(adminCommerceProducts.data.collection?.slug === 'products', 'adminCommerceProducts() returned wrong collection');
  const adminCommerceProductsCsv = await privateClient.adminCommerceProductsCsv({ limit: 5 });
  assert(typeof adminCommerceProductsCsv === 'string', 'adminCommerceProductsCsv() did not return CSV text');
  const firstAdminProductId = adminCommerceProducts.data.records[0]?.id;
  if (firstAdminProductId) {
    const adminCommerceProduct = await privateClient.adminCommerceProduct(firstAdminProductId);
    assert(adminCommerceProduct.data.record?.id === firstAdminProductId, 'adminCommerceProduct() returned wrong product');
  }
}
const hasAdminOrdersCollection = adminCollections.data.collections.some((collection) => collection.slug === 'orders' || collection.id === 'orders');
if (hasAdminOrdersCollection) {
  const adminCommerceOrders = await privateClient.adminCommerceOrders({ limit: 5 });
  assert(Array.isArray(adminCommerceOrders.data.records), 'adminCommerceOrders() missing records array');
  assert(adminCommerceOrders.data.collection?.slug === 'orders', 'adminCommerceOrders() returned wrong collection');
  const adminCommerceOrdersCsv = await privateClient.adminCommerceOrdersCsv({ limit: 5 });
  assert(typeof adminCommerceOrdersCsv === 'string', 'adminCommerceOrdersCsv() did not return CSV text');
  const firstAdminOrderId = adminCommerceOrders.data.records[0]?.id;
  if (firstAdminOrderId) {
    const adminCommerceOrder = await privateClient.adminCommerceOrder(firstAdminOrderId);
    assert(adminCommerceOrder.data.record?.id === firstAdminOrderId, 'adminCommerceOrder() returned wrong order');
  }
}

const adminReusableSections = await privateClient.adminReusableSections({ status: 'all', search: '' });
assert(Array.isArray(adminReusableSections.data.sections), 'adminReusableSections() missing sections array');
assert(typeof privateClient.exportAdminReusableSections === 'function', 'exportAdminReusableSections() missing SDK method');
assert(typeof privateClient.importAdminReusableSections === 'function', 'importAdminReusableSections() missing SDK method');
assert(typeof privateClient.adminReusableSectionInstances === 'function', 'adminReusableSectionInstances() missing SDK method');
assert(typeof privateClient.refreshAdminReusableSectionInstances === 'function', 'refreshAdminReusableSectionInstances() missing SDK method');
assert(typeof privateClient.adminReusableSectionMetadata === 'function', 'adminReusableSectionMetadata() missing SDK method');
assert(typeof privateClient.updateAdminReusableSectionMetadata === 'function', 'updateAdminReusableSectionMetadata() missing SDK method');
const exportedReusableSections = await privateClient.exportAdminReusableSections({ status: 'all' });
assert(exportedReusableSections.data.export?.schemaVersion === 'backy.reusable-sections.export.v1', 'exportAdminReusableSections() missing export schema version');
assert(Array.isArray(exportedReusableSections.data.sections), 'exportAdminReusableSections() missing sections array');
const firstAdminReusableSectionId = adminReusableSections.data.sections[0]?.id;
if (firstAdminReusableSectionId) {
  const adminReusableSection = await privateClient.adminReusableSection(firstAdminReusableSectionId);
  assert(adminReusableSection.data.section?.id === firstAdminReusableSectionId, 'adminReusableSection() returned wrong section');
  const reusableSectionVersions = await privateClient.adminReusableSectionVersions(firstAdminReusableSectionId);
  assert(Array.isArray(reusableSectionVersions.data.versions), 'adminReusableSectionVersions() missing versions array');
  const reusableSectionMetadata = await privateClient.adminReusableSectionMetadata(firstAdminReusableSectionId);
  assert(reusableSectionMetadata.data.sectionId === firstAdminReusableSectionId, 'adminReusableSectionMetadata() returned wrong section');
  assert(reusableSectionMetadata.data.library && typeof reusableSectionMetadata.data.library === 'object', 'adminReusableSectionMetadata() missing library metadata');
  const reusableSectionInstances = await privateClient.adminReusableSectionInstances(firstAdminReusableSectionId);
  assert(Array.isArray(reusableSectionInstances.data.targets), 'adminReusableSectionInstances() missing targets array');
  const reusableSectionRefresh = await privateClient.refreshAdminReusableSectionInstances(firstAdminReusableSectionId, { dryRun: true });
  assert(reusableSectionRefresh.data.dryRun === true, 'refreshAdminReusableSectionInstances() did not preserve dryRun');
  assert(Array.isArray(reusableSectionRefresh.data.refreshedTargets), 'refreshAdminReusableSectionInstances() missing refreshed targets array');
}

const adminMedia = await privateClient.adminMedia({ limit: 5 });
assert(Array.isArray(adminMedia.data.media), 'adminMedia() missing media array');
assert(adminMedia.data.quota, 'adminMedia() missing quota payload');
const firstAdminMediaId = adminMedia.data.media[0]?.id;
if (firstAdminMediaId) {
  const adminMediaVersions = await privateClient.adminMediaVersions(firstAdminMediaId, { limit: 5 });
  assert(Array.isArray(adminMediaVersions.data.versions), 'adminMediaVersions() missing versions array');
  assert(adminMediaVersions.data.mediaId === firstAdminMediaId, 'adminMediaVersions() returned wrong media id');
}
const adminMediaFolders = await privateClient.adminMediaFolders();
assert(Array.isArray(adminMediaFolders.data.folders), 'adminMediaFolders() missing folders array');

const adminForms = await privateClient.adminForms({ limit: 5 });
assert(Array.isArray(adminForms.data.forms), 'adminForms() missing forms array');
assert(adminForms.data.persistenceCertification?.schemaVersion === 'backy.forms-persistence-certification.v1', 'adminForms() missing forms persistence certification handoff');
assert(typeof privateClient.adminSiteEvents === 'function', 'adminSiteEvents() missing SDK method');
assert(typeof privateClient.formDeliveryEvents === 'function', 'formDeliveryEvents() missing SDK method');
assert(typeof privateClient.orderDeliveryEvents === 'function', 'orderDeliveryEvents() missing SDK method');
assert(typeof privateClient.productNotificationEvents === 'function', 'productNotificationEvents() missing SDK method');
const adminSiteEvents = await privateClient.adminSiteEvents({ kind: 'form-submission', limit: 5 });
assert(Array.isArray(adminSiteEvents.data.events), 'adminSiteEvents() missing events array');
if (adminForms.data.forms.length > 0) {
  const adminForm = await privateClient.adminForm(adminForms.data.forms[0].id);
  assert(adminForm.data.form?.id === adminForms.data.forms[0].id, 'adminForm() returned wrong form');
  const formDeliveryEvents = await privateClient.formDeliveryEvents(adminForms.data.forms[0].id, { limit: 5 });
  assert(Array.isArray(formDeliveryEvents.data.events), 'formDeliveryEvents() missing events array');
}
const orderDeliveryEvents = await privateClient.orderDeliveryEvents({ limit: 5 });
assert(Array.isArray(orderDeliveryEvents.data.events), 'orderDeliveryEvents() missing events array');
const productNotificationEvents = await privateClient.productNotificationEvents({ limit: 5 });
assert(Array.isArray(productNotificationEvents.data.events), 'productNotificationEvents() missing events array');
const formsAnalytics = await privateClient.formsAnalytics({ days: 30 });
assert(formsAnalytics.data.analytics, 'formsAnalytics() missing analytics payload');
const formContactSegments = await privateClient.formContactSegments();
assert(formContactSegments.data.analytics, 'formContactSegments() missing analytics payload');
const formContactLists = await privateClient.formContactLists();
assert(Array.isArray(formContactLists.data.lists), 'formContactLists() missing saved lists array');
assert(typeof privateClient.cloneAdminForm === 'function', 'cloneAdminForm() missing SDK method');
assert(typeof privateClient.createAdminFormEmbedBlock === 'function', 'createAdminFormEmbedBlock() missing SDK method');
assert(typeof privateClient.reviewFormSubmission === 'function', 'reviewFormSubmission() missing SDK method');
assert(typeof privateClient.retryFormSubmissionWebhook === 'function', 'retryFormSubmissionWebhook() missing SDK method');
assert(typeof privateClient.retryFormSubmissionEmail === 'function', 'retryFormSubmissionEmail() missing SDK method');
assert(typeof privateClient.applyAdminFormConsentRetention === 'function', 'applyAdminFormConsentRetention() missing SDK method');
assert(typeof privateClient.applyAdminFormsConsentRetention === 'function', 'applyAdminFormsConsentRetention() missing SDK method');
assert(typeof privateClient.createFormContact === 'function', 'createFormContact() missing SDK method');
assert(typeof privateClient.importFormContactsCsv === 'function', 'importFormContactsCsv() missing SDK method');
assert(typeof privateClient.promoteFormContactToUser === 'function', 'promoteFormContactToUser() missing SDK method');
assert(typeof privateClient.promoteFormContactToCustomer === 'function', 'promoteFormContactToCustomer() missing SDK method');
assert(typeof privateClient.syncFormContacts === 'function', 'syncFormContacts() missing SDK method');
assert(typeof privateClient.applyFormContactConsentRetention === 'function', 'applyFormContactConsentRetention() missing SDK method');

let commerceCatalogChecked = false;
try {
  const canonicalOrderInput = buildBackyCommerceOrderInput({
    customerName: 'SDK Customer',
    customerEmail: 'SDK-CUSTOMER@EXAMPLE.COM',
    cart: {
      items: [
        {
          productSlug: 'starter-template',
          variant_sku: 'STARTER-001-STANDARD',
          qty: '2',
        },
      ],
    },
    couponCode: 'launch',
    payment: {
      provider: 'manual',
      reference: 'manual:sdk',
    },
    checkoutSession: {
      id: 'cs_sdk',
    },
  }, {
    requestId: 'sdk-commerce-order-builder',
  });
  assert(canonicalOrderInput.customer?.email === 'sdk-customer@example.com', 'buildBackyCommerceOrderInput() did not normalize customer email');
  assert(canonicalOrderInput.items?.[0]?.slug === 'starter-template', 'buildBackyCommerceOrderInput() did not normalize product slug');
  assert(canonicalOrderInput.items?.[0]?.quantity === 2, 'buildBackyCommerceOrderInput() did not normalize quantity');
  assert(canonicalOrderInput.discountCode === 'LAUNCH', 'buildBackyCommerceOrderInput() did not normalize discount code');
  assert(canonicalOrderInput.checkoutSessionId === 'cs_sdk', 'buildBackyCommerceOrderInput() did not normalize checkout session id');

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
  assert(manifestCommerceRuntime.capabilities?.authenticatedManagement === true, 'manifest() commerce runtime missing authenticated management capability');
  assert(manifestCommerceRuntime.capabilities?.providerOperations === true, 'manifest() commerce runtime missing provider operations capability');
  assert(manifestCommerceRuntime.managementPolicy?.schemaVersion === 'backy.commerce-management.v1', 'manifest() commerce management missing schema version');
  assert(manifestCommerceRuntime.managementPolicy?.endpoints?.products?.includes?.('/collections/products/records'), 'manifest() commerce management missing products endpoint');
  assert(manifestCommerceRuntime.managementPolicy?.endpoints?.orderQuote?.includes?.('/quote'), 'manifest() commerce management missing order quote endpoint');
  assert(manifestCommerceRuntime.managementPolicy?.methods?.refreshOrderQuote === 'POST', 'manifest() commerce management missing quote refresh method');
  assert(manifestCommerceRuntime.managementPolicy?.auth?.requiredPermissions?.write === 'commerce.edit', 'manifest() commerce management write permission drifted');
  assert(manifestCommerceRuntime.managementPolicy?.auth?.requiredPermissions?.collectionExport === 'collections.export', 'manifest() commerce management collection export permission drifted');
  assert(manifestCommerceRuntime.managementPolicy?.sdkHelpers?.syncProductProvider === 'syncCommerceProductProvider', 'manifest() commerce management missing product provider sync helper');
  assert(manifestCommerceRuntime.managementPolicy?.sdkHelpers?.orderStatusHandoff === 'commerceOrderStatusHandoff', 'manifest() commerce management missing order status handoff helper');
  assert(manifestCommerceRuntime.managementPolicy?.responseContracts?.providerCertification === 'backy.commerce-provider-certification-handoff.v1', 'manifest() commerce management missing provider certification contract');
  assert(manifestCommerceRuntime.managementPolicy?.privacy?.providerSecretsNeverReturned === true, 'manifest() commerce management must not expose provider secrets');
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

  try {
    const orderAnalytics = await privateClient.commerceOrderAnalytics();
    assert(orderAnalytics.data.analytics, 'commerceOrderAnalytics() missing analytics payload');
    assertCommerceProviderCertification(
      { providerCertification: orderAnalytics.data.providerCertification },
      'commerceOrderAnalytics()',
    );
    const orderOperationId = orderAnalytics.data.analytics.recentOrders?.[0]?.id
      || orderAnalytics.data.analytics.recentOrders?.[0]?.slug;
    if (orderOperationId) {
      const orderOperationReads = [
        ['commerceOrderQuote()', () => privateClient.commerceOrderQuote(String(orderOperationId)), 'quote'],
        ['commerceOrderTracking()', () => privateClient.commerceOrderTracking(String(orderOperationId)), 'tracking'],
        ['commerceOrderProviderRefund()', () => privateClient.commerceOrderProviderRefund(String(orderOperationId)), 'refund'],
        ['commerceOrderFulfillment()', () => privateClient.commerceOrderFulfillment(String(orderOperationId)), 'fulfillment'],
        ['commerceOrderShippingLabel()', () => privateClient.commerceOrderShippingLabel(String(orderOperationId)), 'label'],
      ];
      for (const [name, readOperation, payloadKey] of orderOperationReads) {
        try {
          const operation = await readOperation();
          assert(operation.data.record, `${name} missing order record`);
          assert(Object.prototype.hasOwnProperty.call(operation.data, payloadKey), `${name} missing ${payloadKey} payload`);
        } catch (operationError) {
          if (
            operationError?.status !== 404 ||
            !['ORDER_NOT_FOUND', 'ORDER_QUEUE_NOT_FOUND', 'SITE_NOT_FOUND'].includes(operationError?.code)
          ) {
            throw operationError;
          }
        }
      }
    }
    try {
      const reconciliation = await privateClient.runCommerceReconciliation({ dryRun: true, limit: 10 });
      assert(reconciliation.data.schemaVersion === 'backy.commerce-reconciliation.v1', 'runCommerceReconciliation() missing schema version');
      assert(reconciliation.data.dryRun === true, 'runCommerceReconciliation() dry run drifted');
    } catch (reconciliationError) {
      if (reconciliationError?.status !== 404 || !['ORDER_QUEUE_NOT_FOUND', 'SITE_NOT_FOUND'].includes(reconciliationError?.code)) {
        throw reconciliationError;
      }
    }
    const reconciliationReadiness = await privateClient.commerceReconciliationReadiness();
    assert(
      reconciliationReadiness.data.cronReadiness?.schemaVersion === 'backy.commerce-cron-readiness.v1',
      'commerceReconciliationReadiness() missing cron readiness payload',
    );
    const platformReconciliation = await privateClient.scheduledPlatformCommerceReconciliation({ dryRun: true, limit: 10 });
    assert(
      platformReconciliation.data.schemaVersion === 'backy.commerce-reconciliation-batch.v1',
      'scheduledPlatformCommerceReconciliation() missing batch schema version',
    );
    assert(platformReconciliation.data.dryRun === true, 'scheduledPlatformCommerceReconciliation() dry run drifted');
  } catch (analyticsError) {
    if (analyticsError?.status !== 404 || !['ORDER_QUEUE_NOT_FOUND', 'SITE_NOT_FOUND'].includes(analyticsError?.code)) {
      throw analyticsError;
    }
  }

  const syncProduct = commerceCatalog.data.products?.[0];
  const syncProductId = syncProduct?.id || syncProduct?.slug;
  if (syncProductId) {
    try {
      const providerSync = await privateClient.commerceProductProviderSync(String(syncProductId));
      assert(Object.prototype.hasOwnProperty.call(providerSync.data, 'sync'), 'commerceProductProviderSync() missing sync key');
      assert(providerSync.data.product?.id || providerSync.data.product?.slug, 'commerceProductProviderSync() missing product payload');
      assertCommerceProviderCertification(
        { providerCertification: providerSync.data.providerCertification },
        'commerceProductProviderSync()',
      );
    } catch (syncError) {
      if (
        syncError?.status !== 404 ||
        !['PRODUCT_CATALOG_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'SITE_NOT_FOUND'].includes(syncError?.code)
      ) {
        throw syncError;
      }
    }
    try {
      const subscriptions = await privateClient.commerceProductSubscriptions(String(syncProductId));
      assert(subscriptions.data.lifecycle, 'commerceProductSubscriptions() missing lifecycle payload');
      assert(subscriptions.data.lifecycle.schemaVersion === 'backy.product-subscription-lifecycle.v1', 'commerceProductSubscriptions() schema drifted');
    } catch (subscriptionsError) {
      if (
        subscriptionsError?.status !== 404 ||
        !['PRODUCT_CATALOG_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'ORDER_QUEUE_NOT_FOUND', 'SITE_NOT_FOUND'].includes(subscriptionsError?.code)
      ) {
        throw subscriptionsError;
      }
    }
  }
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

    const liveManagedPage = await writeClient.liveManagedPage(fixture.pageId, {
      actor: 'sdk-smoke-live-editor',
      requestId: 'sdk-live-managed-page-read',
    });
    assert(liveManagedPage.data.page?.id === fixture.pageId, 'liveManagedPage() returned wrong page');
    assert(findBackyContentElement(liveManagedPage.data.page.content, 'sdk-smoke-form-title')?.id === 'sdk-smoke-form-title', 'findBackyContentElement() missing nested page form input');
    const liveManagedPageElements = listBackyContentElements(liveManagedPage.data.page.content);
    assert(
      liveManagedPageElements.some((element) => (
        element.id === 'sdk-smoke-form-message' &&
        element.parentId === 'sdk-smoke-form' &&
        element.depth === 1 &&
        element.editableTargetPaths.includes('props.placeholder') &&
        element.editableTargetPaths.includes('layout.y')
      )),
      'listBackyContentElements() missing editable nested page element metadata',
    );
    writeChecks.push('liveManagedPage');

    const groupedLivePageContent = groupBackyContentElements(
      liveManagedPage.data.page.content,
      ['sdk-smoke-form-title', 'sdk-smoke-form-message'],
      {
        groupId: 'sdk-smoke-form-field-group',
        name: 'SDK form field group',
      },
    );
    assert(groupedLivePageContent?.groupId === 'sdk-smoke-form-field-group', 'groupBackyContentElements() did not return the expected group id');
    assert(groupedLivePageContent.childCount === 2, 'groupBackyContentElements() did not group both selected form fields');
    const groupedFormField = findBackyContentElement(groupedLivePageContent.content, 'sdk-smoke-form-field-group');
    assert(groupedFormField?.props?.editorGroup === true, 'groupBackyContentElements() did not mark the new layer as an editor group');
    assert(Array.isArray(groupedFormField.children) && groupedFormField.children.length === 2, 'groupBackyContentElements() did not move children under the group');
    assert(
      groupedFormField.children.every((child) => child.parentId === 'sdk-smoke-form-field-group'),
      'groupBackyContentElements() did not rewrite child parent ids',
    );
    writeChecks.push('groupBackyContentElements');

    const groupedLiveManagedPageUpdate = await writeClient.updateLiveManagedPage(fixture.pageId, {
      title: liveManagedPage.data.page.title,
      content: groupedLivePageContent.content,
      expectedUpdatedAt: liveManagedPage.data.page.updatedAt,
      requestId: 'sdk-live-managed-page-group',
    }, {
      actor: 'sdk-smoke-live-editor',
    });
    assert(
      findBackyContentElement(groupedLiveManagedPageUpdate.data.page?.content, 'sdk-smoke-form-field-group')?.id === 'sdk-smoke-form-field-group',
      'updateLiveManagedPage() did not persist SDK-grouped page content',
    );
    writeChecks.push('updateLiveManagedPage:grouped');

    const ungroupedLivePageContent = ungroupBackyContentElements(
      groupedLiveManagedPageUpdate.data.page.content,
      ['sdk-smoke-form-field-group'],
    );
    assert(
      ungroupedLivePageContent?.expandedIds.includes('sdk-smoke-form-title') &&
        ungroupedLivePageContent.expandedIds.includes('sdk-smoke-form-message'),
      'ungroupBackyContentElements() did not expand the grouped form fields',
    );
    assert(
      findBackyContentElement(ungroupedLivePageContent.content, 'sdk-smoke-form-field-group') === null,
      'ungroupBackyContentElements() left the editor group in the content tree',
    );
    writeChecks.push('ungroupBackyContentElements');

    const patchedLivePageContent = patchBackyContentElements(ungroupedLivePageContent.content, [
      {
        elementId: 'sdk-smoke-form-title',
        changes: {
          'props.placeholder': 'Live-managed title',
          'visibility.locked': false,
        },
      },
      {
        elementId: 'sdk-smoke-form-message',
        changes: {
          'props.placeholder': 'Message edited through SDK bulk helper',
          'layout.y': 72,
        },
      },
    ]);
    assert(patchedLivePageContent, 'patchBackyContentElements() did not patch the page content tree');
    const liveManagedPageUpdate = await writeClient.updateLiveManagedPage(fixture.pageId, {
      title: groupedLiveManagedPageUpdate.data.page.title,
      content: patchedLivePageContent,
      expectedUpdatedAt: groupedLiveManagedPageUpdate.data.page.updatedAt,
      requestId: 'sdk-live-managed-page-update',
    }, {
      actor: 'sdk-smoke-live-editor',
    });
    assert(liveManagedPageUpdate.data.page?.id === fixture.pageId, 'updateLiveManagedPage() returned wrong page');
    writeChecks.push('updateLiveManagedPage');

    const lifecyclePageSlug = `sdk-lifecycle-page-${Date.now()}`;
    const lifecyclePage = await writeClient.createAdminPage({
      title: 'SDK Lifecycle Page',
      slug: lifecyclePageSlug,
      status: 'draft',
      meta: {
        title: 'SDK Lifecycle Page',
        description: 'Temporary page for SDK lifecycle coverage.',
        canonical: `/${lifecyclePageSlug}`,
      },
      content: {
        canvasSize: { width: 960, height: 640 },
        elements: [
          {
            id: 'sdk-lifecycle-heading',
            type: 'heading',
            x: 80,
            y: 80,
            width: 640,
            height: 88,
            props: {
              content: 'SDK lifecycle page',
              level: 'h1',
            },
          },
        ],
      },
      requestId: 'sdk-admin-page-create',
    });
    const lifecyclePageId = lifecyclePage.data.page?.id;
    assert(lifecyclePageId, 'createAdminPage() missing created page id');
    assert(lifecyclePage.data.page.slug === lifecyclePageSlug, 'createAdminPage() returned wrong page slug');
    assert(lifecyclePage.data.page.updatedAt, 'createAdminPage() missing updatedAt for conflict-safe writes');
    writeChecks.push('createAdminPage');

    const updatedLifecyclePage = await writeClient.updateAdminPage(lifecyclePageId, {
      title: 'SDK Lifecycle Page Updated',
      expectedUpdatedAt: lifecyclePage.data.page.updatedAt,
      content: {
        canvasSize: { width: 960, height: 640 },
        elements: [
          {
            id: 'sdk-lifecycle-heading',
            type: 'heading',
            x: 96,
            y: 96,
            width: 660,
            height: 88,
            props: {
              content: 'SDK lifecycle page updated',
              level: 'h1',
            },
          },
        ],
      },
      requestId: 'sdk-admin-page-update',
    });
    assert(updatedLifecyclePage.data.page?.title === 'SDK Lifecycle Page Updated', 'updateAdminPage() did not update the page title');
    assert(updatedLifecyclePage.data.page?.updatedAt, 'updateAdminPage() missing updatedAt');
    writeChecks.push('updateAdminPage');

    const lifecycleReadiness = await writeClient.adminPageReadiness(lifecyclePageId, {
      requestId: 'sdk-admin-page-lifecycle-readiness',
    });
    const lifecycleReadinessErrors = lifecycleReadiness.data.readiness?.checks?.filter?.((check) => (
      check?.severity === 'error' && check?.status !== 'pass'
    )) || [];
    assert(lifecycleReadiness.data.readiness?.id === lifecyclePageId, 'adminPageReadiness() returned wrong lifecycle page');
    assert(lifecycleReadinessErrors.length === 0, 'adminPageReadiness() found lifecycle page readiness errors');
    writeChecks.push('adminPageReadiness:lifecycle');

    const lifecyclePreview = await writeClient.createAdminPagePreviewToken(lifecyclePageId, {
      ttlSeconds: 300,
      requestId: 'sdk-admin-page-preview-token',
    });
    assert(lifecyclePreview.data.targetId === lifecyclePageId, 'createAdminPagePreviewToken() returned wrong target');
    assert(lifecyclePreview.data.previewToken, 'createAdminPagePreviewToken() missing preview token');
    assert(lifecyclePreview.data.renderUrl?.includes('previewToken='), 'createAdminPagePreviewToken() missing render preview URL');
    writeChecks.push('createAdminPagePreviewToken');

    const publishedLifecyclePage = await writeClient.publishAdminPage(lifecyclePageId, {
      expectedUpdatedAt: updatedLifecyclePage.data.page.updatedAt,
      requestId: 'sdk-admin-page-publish',
    });
    assert(publishedLifecyclePage.data.page?.status === 'published', 'publishAdminPage() did not publish lifecycle page');
    writeChecks.push('publishAdminPage');

    const archivedLifecyclePage = await writeClient.archiveAdminPage(lifecyclePageId, {
      expectedUpdatedAt: publishedLifecyclePage.data.page.updatedAt,
      requestId: 'sdk-admin-page-archive',
    });
    assert(archivedLifecyclePage.data.page?.status === 'archived', 'archiveAdminPage() did not archive lifecycle page');
    writeChecks.push('archiveAdminPage');

    const lifecyclePageRevisions = await writeClient.adminPageRevisions(lifecyclePageId, {
      limit: 5,
      requestId: 'sdk-admin-page-lifecycle-revisions',
    });
    assert(Array.isArray(lifecyclePageRevisions.data.revisions), 'adminPageRevisions() missing lifecycle page revisions array');
    writeChecks.push('adminPageRevisions:lifecycle');

    const deletedLifecyclePage = await writeClient.deleteAdminPage(lifecyclePageId, {
      requestId: 'sdk-admin-page-delete',
    });
    assert(deletedLifecyclePage.data.deleted === true, 'deleteAdminPage() did not delete lifecycle page');
    assert(deletedLifecyclePage.data.pageId === lifecyclePageId, 'deleteAdminPage() returned wrong page id');
    writeChecks.push('deleteAdminPage');

    const mediaLifecycleSlug = `sdk-media-${Date.now()}`;
    const mediaFolder = await writeClient.createMediaFolder({
      name: `SDK Media ${mediaLifecycleSlug}`,
      sortOrder: 7,
      requestId: 'sdk-media-folder-create',
    });
    const mediaFolderId = mediaFolder.data.folder?.id;
    assert(mediaFolderId, 'createMediaFolder() missing created folder id');
    assert(mediaFolder.data.folder.name.includes(mediaLifecycleSlug), 'createMediaFolder() returned wrong folder name');
    writeChecks.push('createMediaFolder');

    const updatedMediaFolder = await writeClient.updateMediaFolder(mediaFolderId, {
      name: `SDK Media ${mediaLifecycleSlug} Updated`,
      sortOrder: 9,
      requestId: 'sdk-media-folder-update',
    });
    assert(updatedMediaFolder.data.folder?.id === mediaFolderId, 'updateMediaFolder() returned wrong folder');
    assert(updatedMediaFolder.data.folder.name.endsWith('Updated'), 'updateMediaFolder() did not update the folder name');
    writeChecks.push('updateMediaFolder');

    const uploadedImage = await writeClient.uploadMedia({
      file: new Blob([ONE_PIXEL_PNG], { type: 'image/png' }),
      filename: `${mediaLifecycleSlug}.png`,
      folderId: mediaFolderId,
      visibility: 'public',
      tags: ['sdk', 'smoke', 'image'],
      altText: 'SDK media lifecycle image',
      caption: 'Temporary image uploaded by SDK smoke.',
      metadata: {
        purpose: 'sdk-media-lifecycle-smoke',
        source: 'packages/sdk-js/scripts/smoke.mjs',
      },
      uploadedBy: 'sdk-smoke',
      requestId: 'sdk-media-upload-image',
    }, {
      actor: 'sdk-smoke-media',
    });
    const uploadedImageId = uploadedImage.data.media?.id;
    assert(uploadedImageId, 'uploadMedia() missing image media id');
    assert(uploadedImage.data.media.type === 'image', 'uploadMedia() did not classify PNG as image media');
    assert(uploadedImage.data.media.folderId === mediaFolderId, 'uploadMedia() did not preserve folder id');
    assert(uploadedImage.data.media.visibility === 'public', 'uploadMedia() did not preserve public visibility');
    assert(uploadedImage.data.quota, 'uploadMedia() missing quota payload');
    writeChecks.push('uploadMedia:image');

    const updatedMedia = await writeClient.updateAdminMedia(uploadedImageId, {
      altText: 'SDK media lifecycle image updated',
      caption: 'Updated by SDK smoke.',
      tags: ['sdk', 'smoke', 'image', 'updated'],
      metadata: {
        ...(uploadedImage.data.media.metadata || {}),
        lifecycleStage: 'metadata-updated',
      },
      requestId: 'sdk-media-update',
    }, {
      actor: 'sdk-smoke-media',
    });
    assert(updatedMedia.data.media?.id === uploadedImageId, 'updateAdminMedia() returned wrong media id');
    assert(updatedMedia.data.media?.altText === 'SDK media lifecycle image updated', 'updateAdminMedia() did not update alt text');
    assert(updatedMedia.data.media?.metadata?.lifecycleStage === 'metadata-updated', 'updateAdminMedia() did not merge metadata');
    writeChecks.push('updateAdminMedia');

    const mediaBindInput = buildBackyMediaBindingInput({
      pageId: fixture.pageId,
      usage: 'hero',
      actor: 'sdk-smoke-media',
      requestId: 'sdk-media-bind-page',
    });
    const mediaBinding = await writeClient.bindMedia(uploadedImageId, mediaBindInput, {
      actor: 'sdk-smoke-media',
    });
    assert(mediaBinding.data.media?.id === uploadedImageId, 'bindMedia() returned wrong media id');
    assert(mediaBinding.data.target?.type === 'page', 'bindMedia() did not normalize page target');
    assert(mediaBinding.data.target?.id === fixture.pageId, 'bindMedia() returned wrong target page');
    assert(mediaBinding.data.target?.bound === true, 'bindMedia() did not bind the media asset');
    writeChecks.push('bindMedia:page');

    const mediaUnbinding = await writeClient.bindMedia(uploadedImageId, {
      ...mediaBindInput,
      action: 'unbind',
      requestId: 'sdk-media-unbind-page',
    }, {
      actor: 'sdk-smoke-media',
    });
    assert(mediaUnbinding.data.target?.bound === false, 'bindMedia() unbind action did not detach the media asset');
    writeChecks.push('bindMedia:unbind');

    const preparedTransforms = await writeClient.prepareMediaTransforms(uploadedImageId, {
      widths: [16],
      quality: 80,
      sizes: '16px',
      preparedBy: 'sdk-smoke',
      requestId: 'sdk-media-transforms',
    }, {
      actor: 'sdk-smoke-media',
    });
    assert(preparedTransforms.data.media?.id === uploadedImageId, 'prepareMediaTransforms() returned wrong media id');
    assert(Array.isArray(preparedTransforms.data.responsive?.variants), 'prepareMediaTransforms() missing responsive variants');
    assert(preparedTransforms.data.responsive.variants.length > 0, 'prepareMediaTransforms() did not generate variants');
    writeChecks.push('prepareMediaTransforms');

    const replacedMedia = await writeClient.replaceMedia(uploadedImageId, {
      file: new Blob([ONE_PIXEL_PNG], { type: 'image/png' }),
      filename: `${mediaLifecycleSlug}-replacement.png`,
      reason: 'SDK smoke media replacement',
      replacedBy: 'sdk-smoke',
      requestId: 'sdk-media-replace',
    }, {
      actor: 'sdk-smoke-media',
    });
    assert(replacedMedia.data.media?.id === uploadedImageId, 'replaceMedia() returned wrong media id');
    assert(replacedMedia.data.media?.originalName === `${mediaLifecycleSlug}-replacement.png`, 'replaceMedia() did not update original filename');
    assert(replacedMedia.data.replacement, 'replaceMedia() missing replacement metadata');
    writeChecks.push('replaceMedia');

    const mediaVersions = await writeClient.adminMediaVersions(uploadedImageId, {
      limit: 5,
      requestId: 'sdk-media-versions',
    });
    assert(mediaVersions.data.mediaId === uploadedImageId, 'adminMediaVersions() returned wrong media id after replacement');
    assert(Array.isArray(mediaVersions.data.versions), 'adminMediaVersions() missing versions array after replacement');
    assert(mediaVersions.data.versions.length > 0, 'adminMediaVersions() did not list retained media versions after replacement');
    writeChecks.push('adminMediaVersions:lifecycle');

    const uploadedPrivateDocument = await writeClient.uploadMedia({
      file: new Blob([minimalPdf(`SDK private media ${mediaLifecycleSlug}`)], { type: 'application/pdf' }),
      filename: `${mediaLifecycleSlug}.pdf`,
      folderId: mediaFolderId,
      visibility: 'private',
      tags: ['sdk', 'smoke', 'document'],
      metadata: {
        purpose: 'sdk-private-document-smoke',
      },
      uploadedBy: 'sdk-smoke',
      requestId: 'sdk-media-upload-private-document',
    }, {
      actor: 'sdk-smoke-media',
    });
    const privateDocumentId = uploadedPrivateDocument.data.media?.id;
    assert(privateDocumentId, 'uploadMedia() missing private document id');
    assert(uploadedPrivateDocument.data.media.type === 'document', 'uploadMedia() did not classify PDF as document media');
    assert(uploadedPrivateDocument.data.media.visibility === 'private', 'uploadMedia() did not preserve private visibility');
    writeChecks.push('uploadMedia:privateDocument');

    const privateSignedUrlInput = buildBackyMediaSignedUrlInput({
      download: true,
      ttl: 300,
      requestId: 'sdk-media-private-signed-url',
    });
    const privateSignedUrl = await writeClient.createMediaSignedUrl(privateDocumentId, privateSignedUrlInput, {
      actor: 'sdk-smoke-media',
    });
    assert(privateSignedUrl.data.media?.id === privateDocumentId, 'createMediaSignedUrl() returned wrong media id');
    assert(privateSignedUrl.data.disposition === 'attachment', 'createMediaSignedUrl() did not preserve attachment disposition');
    assert(privateSignedUrl.data.signedUrl?.includes('token='), 'createMediaSignedUrl() missing signed token URL');
    assert(privateSignedUrl.data.path?.includes('expiresAt='), 'createMediaSignedUrl() missing expiry path');
    writeChecks.push('createMediaSignedUrl:privateDocument');

    const deletedPrivateDocument = await writeClient.deleteAdminMedia(privateDocumentId, {
      actor: 'sdk-smoke-media',
      requestId: 'sdk-media-delete-private-document',
    });
    assert(deletedPrivateDocument.data.deleted === true, 'deleteAdminMedia() did not delete private document');
    assert(deletedPrivateDocument.data.mediaId === privateDocumentId, 'deleteAdminMedia() returned wrong private document id');
    writeChecks.push('deleteAdminMedia:privateDocument');

    const deletedImage = await writeClient.deleteAdminMedia(uploadedImageId, {
      actor: 'sdk-smoke-media',
      requestId: 'sdk-media-delete-image',
    });
    assert(deletedImage.data.deleted === true, 'deleteAdminMedia() did not delete image');
    assert(deletedImage.data.mediaId === uploadedImageId, 'deleteAdminMedia() returned wrong image id');
    writeChecks.push('deleteAdminMedia:image');

    const deletedMediaFolder = await writeClient.deleteMediaFolder(mediaFolderId, {
      actor: 'sdk-smoke-media',
      requestId: 'sdk-media-folder-delete',
    });
    assert(deletedMediaFolder.data.deleted === true, 'deleteMediaFolder() did not delete folder');
    assert(deletedMediaFolder.data.folderId === mediaFolderId, 'deleteMediaFolder() returned wrong folder id');
    writeChecks.push('deleteMediaFolder');

    const liveManagedPost = await writeClient.liveManagedBlogPost(fixture.postId, {
      actor: 'sdk-smoke-live-editor',
      requestId: 'sdk-live-managed-blog-read',
    });
    assert(liveManagedPost.data.post?.id === fixture.postId, 'liveManagedBlogPost() returned wrong post');
    assert(findBackyContentElement(liveManagedPost.data.post.content, 'sdk-smoke-post-heading')?.id === 'sdk-smoke-post-heading', 'findBackyContentElement() missing blog heading');
    writeChecks.push('liveManagedBlogPost');

    const liveManagedPostEditableMap = {
      'sdk-smoke-post-heading.content': {
        elementId: 'sdk-smoke-post-heading',
        field: 'props.content',
        editable: true,
      },
      'sdk-smoke-post-heading.color': {
        elementId: 'sdk-smoke-post-heading',
        field: 'styles.color',
        editable: true,
      },
      'sdk-smoke-post-heading.x': {
        elementId: 'sdk-smoke-post-heading',
        field: 'layout.x',
        editable: true,
      },
    };
    const liveManagedPostUpdateInput = buildBackyLiveManagedBlogPostEditableMapUpdate(liveManagedPost.data.post, liveManagedPostEditableMap, {
      'sdk-smoke-post-heading.content': 'SDK live-managed blog post',
      'sdk-smoke-post-heading.color': '#111827',
      'sdk-smoke-post-heading.x': 96,
    }, {
      requestId: 'sdk-live-managed-blog-update',
    });
    assert(liveManagedPostUpdateInput?.content, 'buildBackyLiveManagedBlogPostEditableMapUpdate() did not build a content update');
    const liveManagedPostUpdate = await writeClient.updateLiveManagedBlogPost(fixture.postId, liveManagedPostUpdateInput, {
      actor: 'sdk-smoke-live-editor',
    });
    assert(liveManagedPostUpdate.data.post?.id === fixture.postId, 'updateLiveManagedBlogPost() returned wrong post');
    writeChecks.push('updateLiveManagedBlogPost');

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

    const collectionForWrites = await writeClient.collectionCached(fixture.collectionId);
    assert(collectionForWrites.notModified === false, 'collectionCached() should return SDK smoke collection for writes');
    const sdkWriteCollection = {
      ...collectionForWrites.body.data.collection,
      metadata: {
        ...(collectionForWrites.body.data.collection?.metadata || {}),
        visitorWritePolicy: {
          createFieldMode: 'all',
          updateFieldMode: 'selected',
          allowedUpdateFields: ['summary', 'category'],
        },
      },
    };
    const collectionRecordCreateInput = buildBackyCollectionRecordWriteInput(sdkWriteCollection, {
      fields: {
        Title: 'SDK Public Record',
        Summary: 'Created through the SDK write smoke.',
        Category: 'Featured',
        Unknown: 'ignored by the SDK builder',
      },
      slug: `sdk-public-record-${Date.now()}`,
      requestId: 'sdk-record-create',
    });
    assert(collectionRecordCreateInput.values.title === 'SDK Public Record', 'buildBackyCollectionRecordWriteInput() did not map title label');
    assert(collectionRecordCreateInput.values.summary === 'Created through the SDK write smoke.', 'buildBackyCollectionRecordWriteInput() did not map summary label');
    assert(collectionRecordCreateInput.values.Unknown === undefined, 'buildBackyCollectionRecordWriteInput() leaked unknown fields');
    assert(collectionRecordCreateInput.options.slug?.startsWith('sdk-public-record-'), 'buildBackyCollectionRecordWriteInput() did not preserve slug option');
    const createdRecord = await writeClient.createRecord(
      fixture.collectionId,
      collectionRecordCreateInput.values,
      collectionRecordCreateInput.options,
    );
    assert(createdRecord.data.record?.status === 'draft', 'createRecord() should create draft public records');
    writeChecks.push('createRecord');

    const collectionRecordUpdateInput = buildBackyCollectionRecordWriteInput(sdkWriteCollection, {
      fields: {
        Title: 'SDK Public Record Ignored Title',
        Summary: 'Updated through the SDK write smoke.',
        Category: 'Standard',
      },
      publicWriteToken: fixture.publicWriteToken,
    }, { mode: 'update' });
    assert(collectionRecordUpdateInput.values.title === undefined, 'buildBackyCollectionRecordWriteInput() should omit disallowed update fields');
    assert(collectionRecordUpdateInput.ignoredFields.includes('title'), 'buildBackyCollectionRecordWriteInput() should report ignored update fields');
    const updatedRecord = await writeClient.updateRecord(
      fixture.collectionId,
      createdRecord.data.record.id,
      collectionRecordUpdateInput.values,
      collectionRecordUpdateInput.options,
    );
    assert(updatedRecord.data.record?.values?.summary === 'Updated through the SDK write smoke.', 'updateRecord() did not update an allowed public field');
    assert(updatedRecord.data.record?.values?.category === 'Standard', 'updateRecord() did not update select field value');
    assert(updatedRecord.data.record?.values?.title === 'SDK Public Record', 'updateRecord() should respect public update field policy');
    const ignoredPublicUpdateFields = updatedRecord.data.visitorWritePolicy?.ignoredFields?.length
      ? updatedRecord.data.visitorWritePolicy.ignoredFields
      : collectionRecordUpdateInput.ignoredFields;
    assert(ignoredPublicUpdateFields.includes('title'), 'updateRecord() should expose ignored public update fields');
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

    const importedRecordSlug = `sdk-imported-record-${Date.now()}`;
    const importedRecords = await writeClient.importAdminCollectionRecordsCsv(
      fixture.collectionId,
      [
        'slug,status,title,summary,category',
        `${importedRecordSlug},draft,SDK Imported Record,Imported through SDK CSV,Featured`,
      ].join('\n'),
      { requestId: 'sdk-record-csv-import' },
    );
    const importedRecord = importedRecords.data.records?.[0];
    assert(importedRecords.data.import?.created === 1, 'importAdminCollectionRecordsCsv() should create one record');
    assert(importedRecords.data.import?.errors?.length === 0, 'importAdminCollectionRecordsCsv() returned row errors');
    assert(importedRecord?.slug === importedRecordSlug, 'importAdminCollectionRecordsCsv() returned wrong record slug');
    assert(importedRecord.values?.title === 'SDK Imported Record', 'importAdminCollectionRecordsCsv() did not map CSV values');
    writeChecks.push('importAdminCollectionRecordsCsv');

    const bulkPublished = await writeClient.bulkAdminCollectionRecords(fixture.collectionId, {
      action: 'updateStatus',
      recordIds: [importedRecord.id],
      status: 'published',
      requestId: 'sdk-record-bulk-publish',
    });
    assert(bulkPublished.data.updated === 1, 'bulkAdminCollectionRecords() did not update record status');
    assert(bulkPublished.data.records?.[0]?.status === 'published', 'bulkAdminCollectionRecords() returned wrong status');
    writeChecks.push('bulkAdminCollectionRecords:updateStatus');

    const bulkDeleted = await writeClient.bulkAdminCollectionRecords(fixture.collectionId, {
      action: 'delete',
      recordIds: [importedRecord.id],
      requestId: 'sdk-record-bulk-delete',
    });
    assert(bulkDeleted.data.deleted === 1, 'bulkAdminCollectionRecords() did not delete imported record');
    writeChecks.push('bulkAdminCollectionRecords:delete');

    const productAliasSlug = `sdk-product-alias-${Date.now()}`;
    const importedProductAlias = await writeClient.importAdminCommerceProductsCsv(
      [
        'slug,status,title,summary,category',
        `${productAliasSlug},draft,SDK Product Alias Record,Imported through product batch alias,Featured`,
      ].join('\n'),
      { collectionId: fixture.collectionId, requestId: 'sdk-product-alias-import' },
    );
    const productAliasRecord = importedProductAlias.data.records?.[0];
    assert(importedProductAlias.data.import?.created === 1, 'importAdminCommerceProductsCsv() should create one record through override collection');
    assert(productAliasRecord?.slug === productAliasSlug, 'importAdminCommerceProductsCsv() returned wrong alias record');
    writeChecks.push('importAdminCommerceProductsCsv:override');

    const productAliasBulkDelete = await writeClient.bulkAdminCommerceProducts(
      {
        action: 'delete',
        recordIds: [productAliasRecord.id],
        requestId: 'sdk-product-alias-bulk-delete',
      },
      { collectionId: fixture.collectionId },
    );
    assert(productAliasBulkDelete.data.deleted === 1, 'bulkAdminCommerceProducts() did not delete override collection record');
    writeChecks.push('bulkAdminCommerceProducts:override');

    const orderAliasSlug = `sdk-order-alias-${Date.now()}`;
    const importedOrderAlias = await writeClient.importAdminCommerceOrdersCsv(
      [
        'slug,status,title,summary,category',
        `${orderAliasSlug},draft,SDK Order Alias Record,Imported through order batch alias,Standard`,
      ].join('\n'),
      { collectionId: fixture.collectionId, requestId: 'sdk-order-alias-import' },
    );
    const orderAliasRecord = importedOrderAlias.data.records?.[0];
    assert(importedOrderAlias.data.import?.created === 1, 'importAdminCommerceOrdersCsv() should create one record through override collection');
    assert(orderAliasRecord?.slug === orderAliasSlug, 'importAdminCommerceOrdersCsv() returned wrong alias record');
    writeChecks.push('importAdminCommerceOrdersCsv:override');

    const orderAliasBulkDelete = await writeClient.bulkAdminCommerceOrders(
      {
        action: 'delete',
        recordIds: [orderAliasRecord.id],
        requestId: 'sdk-order-alias-bulk-delete',
      },
      { collectionId: fixture.collectionId },
    );
    assert(orderAliasBulkDelete.data.deleted === 1, 'bulkAdminCommerceOrders() did not delete override collection record');
    writeChecks.push('bulkAdminCommerceOrders:override');

    const backupCollectionSlug = `sdk-backup-collection-${Date.now()}`;
    const importedBackup = await writeClient.importAdminCollectionsBackup(
      {
        backup: {
          schemaVersion: 'backy.collections.backup.v1',
          exportedAt: new Date().toISOString(),
          siteId: fixture.siteId,
          collectionCount: 1,
          recordCount: 1,
        },
        collections: [
          {
            name: 'SDK Backup Collection',
            slug: backupCollectionSlug,
            status: 'published',
            fields: [
              { key: 'title', label: 'Title', type: 'text', required: true },
              { key: 'summary', label: 'Summary', type: 'richText' },
            ],
            permissions: {
              publicRead: true,
            },
            records: [
              {
                slug: 'sdk-backup-record',
                status: 'published',
                values: {
                  title: 'SDK Backup Record',
                  summary: 'Imported through the SDK backup bridge.',
                },
              },
            ],
          },
        ],
      },
      { requestId: 'sdk-collections-backup-import' },
    );
    const backupCollection = importedBackup.data.collections?.[0];
    assert(importedBackup.data.import?.createdCollections === 1, 'importAdminCollectionsBackup() should create one collection');
    assert(importedBackup.data.import?.createdRecords === 1, 'importAdminCollectionsBackup() should create one record');
    assert(backupCollection?.slug === backupCollectionSlug, 'importAdminCollectionsBackup() returned wrong collection slug');
    writeChecks.push('importAdminCollectionsBackup');

    const backupExport = await writeClient.exportAdminCollectionsBackup({
      collectionIds: [backupCollection.id],
      includeRecords: true,
      requestId: 'sdk-collections-backup-export-records',
    });
    assert(backupExport.data.backup?.recordCount === 1, 'exportAdminCollectionsBackup() did not include imported backup records');
    assert(backupExport.data.collections?.[0]?.records?.[0]?.slug === 'sdk-backup-record', 'exportAdminCollectionsBackup() returned wrong backup record');
    writeChecks.push('exportAdminCollectionsBackup:includeRecords');

    const deletedBackupCollection = await writeClient.deleteAdminCollection(backupCollection.id, {
      requestId: 'sdk-delete-backup-collection',
    });
    assert(deletedBackupCollection.data.deleted === true, 'deleteAdminCollection() did not delete imported backup collection');
    writeChecks.push('deleteAdminCollection');

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

    const embeddedFormBlock = await writeClient.createAdminFormEmbedBlock('sdk-smoke-form', {
      name: 'SDK Smoke Form Embed',
      slug: `sdk-smoke-form-embed-${Date.now()}`,
      actor: 'sdk-smoke',
      publicBaseUrl: baseUrl,
      requestId: 'sdk-form-embed-block',
    });
    assert(embeddedFormBlock.data.section?.sourceElementId === 'sdk-smoke-form', 'createAdminFormEmbedBlock() did not bind the source form');
    assert(embeddedFormBlock.data.embed?.definitionUrl?.includes('/forms/sdk-smoke-form/definition'), 'createAdminFormEmbedBlock() missing form definition URL');
    writeChecks.push('createAdminFormEmbedBlock');

    const clonedAdminForm = await writeClient.cloneAdminForm('sdk-smoke-form', {
      name: 'SDK Smoke Form Clone',
      title: 'SDK Smoke Form Clone',
      isActive: false,
      requestId: 'sdk-form-clone',
    });
    assert(clonedAdminForm.data.form?.id && clonedAdminForm.data.form.id !== 'sdk-smoke-form', 'cloneAdminForm() did not create a distinct form');
    assert(clonedAdminForm.data.sourceFormId === 'sdk-smoke-form', 'cloneAdminForm() returned the wrong source form id');
    writeChecks.push('cloneAdminForm');

    const formSubmissionInput = buildBackyFormSubmissionInput(formDefinition.body.data.form, {
      fields: {
        title: 'SDK Form Record',
        message: 'Submitted through the SDK.',
        category: 'Standard',
        requestId: 'should stay inside form values only when explicitly mapped',
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
    assert(formSubmissionInput.values?.title === 'SDK Form Record', 'buildBackyFormSubmissionInput() did not preserve title value');
    assert(formSubmissionInput.values?.message === 'Submitted through the SDK.', 'buildBackyFormSubmissionInput() did not preserve message value');
    assert(formSubmissionInput.values?.requestId === undefined, 'buildBackyFormSubmissionInput() leaked reserved metadata into values');
    assert(formSubmissionInput.pageId === fixture.pageId, 'buildBackyFormSubmissionInput() did not preserve page id metadata');
    assert(formSubmissionInput.contactShareOverride?.nameField === 'title', 'buildBackyFormSubmissionInput() did not normalize contact share fields');
    const submittedForm = await writeClient.submitForm('sdk-smoke-form', formSubmissionInput);
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

    const reviewedSubmission = await writeClient.reviewFormSubmission('sdk-smoke-form', submissionId, {
      status: 'approved',
      reviewedBy: 'sdk-reviewer',
      adminNotes: 'Reviewed through the SDK smoke.',
      requestId: 'sdk-form-review',
    });
    assert(reviewedSubmission.data.submission?.id === submissionId, 'reviewFormSubmission() returned wrong submission');
    assert(reviewedSubmission.data.submission?.reviewedBy === 'sdk-reviewer', 'reviewFormSubmission() did not preserve reviewer');
    assert(reviewedSubmission.data.submission?.adminNotes === 'Reviewed through the SDK smoke.', 'reviewFormSubmission() did not preserve admin notes');
    writeChecks.push('reviewFormSubmission');

    const deliveryRetryReceiver = await startSmokeWebhookReceiver('/sdk-form-delivery-retry');
    let deliveryRetryFormId = null;
    try {
      const deliveryRetryForm = await writeClient.createAdminForm({
        name: 'SDK Smoke Delivery Retry Form',
        title: 'SDK Smoke Delivery Retry Form',
        description: 'Temporary backend form for SDK delivery retry coverage.',
        fields: [
          {
            key: 'email',
            label: 'Email',
            type: 'email',
            required: true,
          },
          {
            key: 'message',
            label: 'Message',
            type: 'textarea',
            required: true,
          },
        ],
        isActive: true,
        enableHoneypot: false,
        moderationMode: 'manual',
        requestId: 'sdk-form-delivery-create',
      });
      deliveryRetryFormId = deliveryRetryForm.data.form?.id;
      assert(deliveryRetryFormId, 'createAdminForm() missing delivery retry form id');
      assert(deliveryRetryForm.data.form?.fields?.length === 2, 'createAdminForm() did not preserve delivery retry fields');
      writeChecks.push('createAdminForm:deliveryRetry');

      const deliveryDefinition = await writeClient.formDefinition(deliveryRetryFormId);
      const deliverySubmissionInput = buildBackyFormSubmissionInput(deliveryDefinition.data.form, {
        fields: {
          email: 'sdk-delivery@example.com',
          message: 'Delivery retry smoke submission.',
        },
        requestId: 'sdk-form-delivery-submit',
        rateLimitBypass: true,
      });
      const deliverySubmittedForm = await writeClient.submitForm(deliveryRetryFormId, deliverySubmissionInput);
      const deliverySubmissionId = deliverySubmittedForm.data.submission?.id;
      assert(deliverySubmissionId, 'submitForm() missing delivery retry submission id');
      writeChecks.push('submitForm:deliveryRetry');

      const deliveryConfiguredForm = await writeClient.updateAdminForm(deliveryRetryFormId, {
        notificationEmail: 'sdk-form-notify@example.com',
        notificationWebhook: deliveryRetryReceiver.url,
        requestId: 'sdk-form-delivery-config',
      });
      assert(deliveryConfiguredForm.data.form?.notificationEmail === 'sdk-form-notify@example.com', 'updateAdminForm() did not preserve notification email');
      assert(deliveryConfiguredForm.data.form?.notificationWebhook === deliveryRetryReceiver.url, 'updateAdminForm() did not preserve notification webhook');
      writeChecks.push('updateAdminForm:deliveryConfig');

      const webhookRetry = await writeClient.retryFormSubmissionWebhook(deliveryRetryFormId, deliverySubmissionId, {
        requestId: 'sdk-form-webhook-retry',
      });
      assert(webhookRetry.data.delivery?.attempted === true, 'retryFormSubmissionWebhook() did not attempt delivery');
      assert(webhookRetry.data.delivery?.status === 'succeeded', 'retryFormSubmissionWebhook() did not report success');
      assert(webhookRetry.data.delivery?.statusCode === 204, 'retryFormSubmissionWebhook() returned the wrong webhook status code');
      assert(webhookRetry.data.submission?.id === deliverySubmissionId, 'retryFormSubmissionWebhook() returned wrong submission');
      const retryRequest = deliveryRetryReceiver.requests[0];
      assert(retryRequest?.method === 'POST', 'retryFormSubmissionWebhook() did not POST to the receiver');
      assert(retryRequest?.url === '/sdk-form-delivery-retry', 'retryFormSubmissionWebhook() posted to the wrong webhook path');
      assert(retryRequest?.headers?.['x-backy-webhook-retry'] === 'true', 'retryFormSubmissionWebhook() missing retry header');
      assert(retryRequest?.headers?.['x-backy-form-id'] === deliveryRetryFormId, 'retryFormSubmissionWebhook() missing form id header');
      assert(retryRequest?.headers?.['x-backy-submission-id'] === deliverySubmissionId, 'retryFormSubmissionWebhook() missing submission id header');
      assert(retryRequest?.json?.retry === true, 'retryFormSubmissionWebhook() payload missing retry flag');
      assert(retryRequest?.json?.submissionId === deliverySubmissionId, 'retryFormSubmissionWebhook() payload missing submission id');
      assert(retryRequest?.json?.values?.message === 'Delivery retry smoke submission.', 'retryFormSubmissionWebhook() payload missing submitted values');
      writeChecks.push('retryFormSubmissionWebhook');

      const emailRetryProvider = String(adminSettings.data.settings?.runtimeNotifications?.emailProvider || 'unknown');
      const allowExternalEmailRetry = process.env.BACKY_SDK_ALLOW_EXTERNAL_EMAIL_RETRY_SMOKE === '1';
      if (emailRetryProvider === 'local-outbox' || allowExternalEmailRetry) {
        const emailRetry = await writeClient.retryFormSubmissionEmail(deliveryRetryFormId, deliverySubmissionId, {
          requestId: 'sdk-form-email-retry',
        });
        assert(emailRetry.data.delivery?.attempted === true, 'retryFormSubmissionEmail() did not attempt delivery');
        assert(emailRetry.data.delivery?.status === 'succeeded', 'retryFormSubmissionEmail() did not report success');
        assert(emailRetry.data.delivery?.target === 'mailto:sdk-form-notify@example.com', 'retryFormSubmissionEmail() returned wrong target');
        assert(emailRetry.data.delivery?.provider === emailRetryProvider || allowExternalEmailRetry, 'retryFormSubmissionEmail() returned wrong provider');
        if (emailRetryProvider === 'local-outbox') {
          assert(emailRetry.data.delivery?.statusCode === 202, 'retryFormSubmissionEmail() returned wrong local-outbox status code');
          assert(emailRetry.data.delivery?.metadata?.outboxOnly === true, 'retryFormSubmissionEmail() missing local-outbox evidence');
        }
        assert(emailRetry.data.submission?.id === deliverySubmissionId, 'retryFormSubmissionEmail() returned wrong submission');
        writeChecks.push('retryFormSubmissionEmail');
      }

      const deletedDeliveryForm = await writeClient.deleteAdminForm(deliveryRetryFormId, {
        requestId: 'sdk-form-delivery-delete',
      });
      assert(deletedDeliveryForm.data.deleted === true, 'deleteAdminForm() did not delete delivery retry form');
      writeChecks.push('deleteAdminForm:deliveryRetry');
    } finally {
      await deliveryRetryReceiver.close();
    }

    const contacts = await writeClient.formContacts('sdk-smoke-form', { requestId: 'sdk-form-submit' });
    assert(contacts.data.contacts?.some?.((contact) => contact.id === contactId), 'formContacts() missing generated contact');
    writeChecks.push('formContacts');

    const updatedContact = await writeClient.updateFormContact('sdk-smoke-form', contactId, { status: 'qualified' });
    assert(updatedContact.data.contact?.status === 'qualified', 'updateFormContact() did not update contact status');
    writeChecks.push('updateFormContact');

    const createdContact = await writeClient.createFormContact('sdk-smoke-form', {
      name: 'SDK Manual Contact',
      email: 'sdk-manual-contact@example.com',
      status: 'qualified',
      notes: 'Created through the SDK contact helper.',
      sourceValues: {
        company: 'Backy SDK',
      },
      upsertByEmail: true,
      requestId: 'sdk-contact-create',
    });
    const manualContactId = createdContact.data.contact?.id;
    assert(manualContactId, 'createFormContact() missing contact id');
    assert(createdContact.data.contact?.email === 'sdk-manual-contact@example.com', 'createFormContact() did not preserve contact email');
    assert(createdContact.data.contact?.status === 'qualified', 'createFormContact() did not preserve contact status');
    writeChecks.push('createFormContact');

    const importedContacts = await writeClient.importFormContactsCsv(
      'sdk-smoke-form',
      [
        'name,email,status,notes,requestId,sourceCompany',
        'SDK Imported Contact,sdk-imported-contact@example.com,qualified,Imported through SDK smoke,sdk-contact-import-row,Backy SDK',
      ].join('\n'),
      {
        upsertByEmail: true,
        requestId: 'sdk-contact-import',
      },
    );
    const importedContactCount = (importedContacts.data.import?.created ?? 0) + (importedContacts.data.import?.updated ?? 0);
    assert(importedContactCount >= 1, 'importFormContactsCsv() did not import or update a contact');
    assert(importedContacts.data.contacts?.some?.((contact) => contact.email === 'sdk-imported-contact@example.com'), 'importFormContactsCsv() missing imported contact');
    writeChecks.push('importFormContactsCsv');

    const savedContactList = await writeClient.saveFormContactList({
      name: 'SDK Qualified Contacts',
      description: 'Temporary saved list created by the SDK smoke.',
      filters: {
        formId: 'sdk-smoke-form',
        status: 'qualified',
        quality: 'all',
      },
      requestId: 'sdk-contact-list-save',
    });
    const savedContactListId = savedContactList.data.list?.id;
    assert(savedContactListId, 'saveFormContactList() missing saved list id');
    assert(savedContactList.data.created === true, 'saveFormContactList() did not report creation');
    assert(savedContactList.data.lists?.some?.((list) => list.id === savedContactListId), 'saveFormContactList() missing saved list in response');
    writeChecks.push('saveFormContactList');

    const deletedContactList = await writeClient.deleteFormContactList({
      listId: savedContactListId,
      requestId: 'sdk-contact-list-delete',
    });
    assert(deletedContactList.data.deleted === true, 'deleteFormContactList() did not report deletion');
    assert(deletedContactList.data.listId === savedContactListId, 'deleteFormContactList() returned wrong list id');
    writeChecks.push('deleteFormContactList');

    const promotedCustomer = await writeClient.promoteFormContactToCustomer('sdk-smoke-form', manualContactId, {
      customerStatus: 'lead',
      notes: 'SDK smoke customer promotion.',
      requestId: 'sdk-contact-promote-customer',
    });
    assert(promotedCustomer.data.contact?.id === manualContactId, 'promoteFormContactToCustomer() returned wrong contact');
    assert(promotedCustomer.data.collection?.slug === 'customers', 'promoteFormContactToCustomer() did not use the customer collection');
    assert(promotedCustomer.data.record?.values?.email === 'sdk-manual-contact@example.com', 'promoteFormContactToCustomer() did not create a customer email value');
    writeChecks.push('promoteFormContactToCustomer');

    const promotionEmailDomain = await getCleanupOwnerEmailDomain();
    const promotionEmail = `sdk-promoted-contact-${Date.now()}@${promotionEmailDomain}`;
    const userPromotionContact = await writeClient.createFormContact('sdk-smoke-form', {
      name: 'SDK User Promotion Contact',
      email: promotionEmail,
      status: 'qualified',
      notes: 'Created for SDK contact-to-user promotion coverage.',
      sourceValues: {
        company: 'Backy SDK',
      },
      requestId: 'sdk-contact-user-promotion-create',
    });
    const userPromotionContactId = userPromotionContact.data.contact?.id;
    assert(userPromotionContactId, 'createFormContact() missing user-promotion contact id');
    let promotedUserId = null;
    try {
      const promotedUser = await writeClient.promoteFormContactToUser('sdk-smoke-form', userPromotionContactId, {
        role: 'viewer',
        status: 'invited',
        createInvite: false,
        requestId: 'sdk-contact-promote-user',
      });
      promotedUserId = promotedUser.data.user?.id;
      assert(promotedUserId, 'promoteFormContactToUser() missing promoted user id');
      assert(promotedUser.data.existingUser === false, 'promoteFormContactToUser() should create a new smoke user');
      assert(promotedUser.data.user?.email === promotionEmail, 'promoteFormContactToUser() returned wrong user email');
      assert(promotedUser.data.user?.role === 'viewer', 'promoteFormContactToUser() returned wrong user role');
      assert(promotedUser.data.user?.status === 'invited', 'promoteFormContactToUser() returned wrong user status');
      assert(!promotedUser.data.invite, 'promoteFormContactToUser() should not create an invite when createInvite is false');
      assert(promotedUser.data.contact?.id === userPromotionContactId, 'promoteFormContactToUser() returned wrong contact');
      assert(promotedUser.data.contact?.sourceValues?.__backyPromotion?.userId === promotedUserId, 'promoteFormContactToUser() missing contact promotion metadata');
      writeChecks.push('promoteFormContactToUser');
    } finally {
      if (promotedUserId) {
        const deletedPromotedUser = await writeClient.deleteAdminUser(promotedUserId, {
          requestId: 'sdk-contact-promote-user-cleanup',
        });
        assert(deletedPromotedUser.data.deleted === true, 'deleteAdminUser() did not clean up promoted smoke user');
      }
    }

    const contactSyncReceiver = await startSmokeWebhookReceiver('/sdk-contact-sync');
    try {
      const syncedContacts = await writeClient.syncFormContacts('sdk-smoke-form', {
        contactIds: [manualContactId],
        targetUrl: contactSyncReceiver.url,
        includeSourceValues: false,
        reason: 'sdk-smoke-contact-sync',
        requestId: 'sdk-contact-sync',
      });
      assert(syncedContacts.data.delivery?.status === 'succeeded', 'syncFormContacts() did not report a successful delivery');
      assert(syncedContacts.data.delivery?.statusCode === 204, 'syncFormContacts() returned the wrong webhook status code');
      assert(syncedContacts.data.delivery?.count === 1, 'syncFormContacts() returned the wrong contact count');
      assert(syncedContacts.data.delivery?.contactIds?.includes?.(manualContactId), 'syncFormContacts() missing synced contact id');
      const syncRequest = contactSyncReceiver.requests[0];
      assert(syncRequest?.method === 'POST', 'syncFormContacts() did not POST to the webhook receiver');
      assert(syncRequest?.url === '/sdk-contact-sync', 'syncFormContacts() posted to the wrong webhook path');
      assert(syncRequest?.headers?.['x-backy-contact-sync'] === 'true', 'syncFormContacts() missing contact sync header');
      assert(syncRequest?.json?.kind === 'contact-sync', 'syncFormContacts() missing contact-sync payload kind');
      assert(syncRequest?.json?.contactIds?.includes?.(manualContactId), 'syncFormContacts() payload missing contact id');
      assert(syncRequest?.json?.contacts?.[0]?.id === manualContactId, 'syncFormContacts() payload missing contact detail');
      assert(syncRequest?.json?.contacts?.[0]?.sourceValues === undefined, 'syncFormContacts() should omit sourceValues when includeSourceValues is false');
      writeChecks.push('syncFormContacts');
    } finally {
      await contactSyncReceiver.close();
    }

    const contactRetention = await writeClient.applyFormContactConsentRetention('sdk-smoke-form', {
      contactIds: [manualContactId],
      dryRun: true,
      retentionDays: 0,
      now: '2035-01-01T00:00:00.000Z',
      actor: 'sdk-smoke',
      requestId: 'sdk-contact-retention',
    });
    assert(contactRetention.data.dryRun === true, 'applyFormContactConsentRetention() did not preserve dryRun');
    assert(contactRetention.data.scanned === 1, 'applyFormContactConsentRetention() did not scan the selected contact');
    assert(contactRetention.data.contacts?.[0]?.id === manualContactId, 'applyFormContactConsentRetention() returned wrong contact evidence');
    writeChecks.push('applyFormContactConsentRetention');

    const formRetention = await writeClient.applyAdminFormConsentRetention('sdk-smoke-form', {
      dryRun: true,
      now: '2035-01-01T00:00:00.000Z',
      actor: 'sdk-smoke',
      requestId: 'sdk-form-retention',
    });
    assert(formRetention.data.dryRun === true, 'applyAdminFormConsentRetention() did not preserve dryRun');
    assert(formRetention.data.formId === 'sdk-smoke-form', 'applyAdminFormConsentRetention() returned wrong form id');
    writeChecks.push('applyAdminFormConsentRetention');

    const formsRetention = await writeClient.applyAdminFormsConsentRetention({
      dryRun: true,
      now: '2035-01-01T00:00:00.000Z',
      actor: 'sdk-smoke',
      requestId: 'sdk-forms-retention',
    });
    assert(formsRetention.data.dryRun === true, 'applyAdminFormsConsentRetention() did not preserve dryRun');
    assert(formsRetention.data.scannedForms >= 1, 'applyAdminFormsConsentRetention() did not scan fixture forms');
    assert(formsRetention.data.results?.some?.((result) => result.formId === 'sdk-smoke-form'), 'applyAdminFormsConsentRetention() missing fixture form result');
    writeChecks.push('applyAdminFormsConsentRetention');

    const commentInput = buildBackyCommentInput({
      message: 'SDK comment body',
      name: 'SDK Commenter',
      email: 'SDK-COMMENTER@EXAMPLE.COM',
      threadId: 'sdk-smoke-thread',
      requestId: 'sdk-page-comment',
      startedAt: Date.now() - 1000,
      captcha: {
        token: 'sdk-comment-captcha',
      },
      rateLimitBypass: true,
    }, {
      moderationMode: 'auto-approve',
    });
    assert(commentInput.content === 'SDK comment body', 'buildBackyCommentInput() did not normalize message content');
    assert(commentInput.authorEmail === 'sdk-commenter@example.com', 'buildBackyCommentInput() did not normalize email');
    assert(commentInput.commentThreadId === 'sdk-smoke-thread', 'buildBackyCommentInput() did not normalize thread id');
    assert(commentInput.captchaToken === 'sdk-comment-captcha', 'buildBackyCommentInput() did not normalize captcha token');
    assert(commentInput.rateLimitBypass === true, 'buildBackyCommentInput() dropped rate-limit bypass metadata');
    const comment = await writeClient.submitPageComment(fixture.pageId, commentInput);
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

    const commentReportInput = buildBackyCommentReportInput({
      reportReason: 'spam',
      reporterEmail: 'SDK-REPORTER@EXAMPLE.COM',
      message: 'SDK smoke report detail',
      requestId: 'sdk-comment-report',
    });
    assert(commentReportInput.reason === 'spam', 'buildBackyCommentReportInput() did not normalize reason');
    assert(commentReportInput.actor === 'SDK-REPORTER@EXAMPLE.COM', 'buildBackyCommentReportInput() did not normalize reporter actor');
    assert(commentReportInput.details === 'SDK smoke report detail', 'buildBackyCommentReportInput() did not normalize report details');
    const report = await writeClient.reportComment(commentId, commentReportInput);
    assert(report.data.comment?.id === commentId, 'reportComment() returned wrong comment');
    assert(report.data.report?.reason === 'spam', 'reportComment() missing normalized report reason');
    assert(report.data.report?.actor === 'SDK-REPORTER@EXAMPLE.COM', 'reportComment() missing normalized report actor');
    writeChecks.push('reportComment');

    const reportEvents = await writeClient.events({
      kind: 'comment-reported',
      requestId: 'sdk-comment-report',
    });
    assert(reportEvents.data.events?.some?.((event) => event.commentId === commentId && event.metadata?.details === 'SDK smoke report detail'), 'events() missing comment report event details');
    writeChecks.push('events:write');

    const clearedReports = await writeClient.clearCommentReports([commentId], {
      reviewedBy: 'sdk-smoke',
      requestId: 'sdk-comment-clear-reports',
    });
    assert(clearedReports.data.updatedCount === 1, 'clearCommentReports() did not update the reported comment');
    assert(clearedReports.data.updated?.[0]?.reportCount === 0, 'clearCommentReports() did not clear report count');
    writeChecks.push('clearCommentReports');

    const blockedComments = await writeClient.updateComments({
      commentIds: [commentId],
      status: 'blocked',
      reviewedBy: 'sdk-smoke',
      blockReason: 'spam',
      requestId: 'sdk-comment-block',
    });
    assert(blockedComments.data.updatedCount === 1, 'updateComments() did not bulk block the comment');
    assert(blockedComments.data.updated?.[0]?.status === 'blocked', 'updateComments() did not return blocked status');
    writeChecks.push('updateComments');

    const blocklist = await writeClient.commentBlocklist({
      type: 'email',
      q: 'sdk-commenter@example.com',
    });
    const blocklistEntry = blocklist.data.blocklist?.find?.((entry) => entry.value === 'sdk-commenter@example.com');
    assert(blocklistEntry?.id, 'commentBlocklist() missing blocked commenter email entry');
    writeChecks.push('commentBlocklist');

    const deletedBlocklist = await writeClient.deleteCommentBlocklistEntries([blocklistEntry.id], {
      requestId: 'sdk-comment-blocklist-delete',
    });
    assert(deletedBlocklist.data.deletedCount === 1, 'deleteCommentBlocklistEntries() did not remove blocklist entry');
    writeChecks.push('deleteCommentBlocklistEntries');

    const deletedComment = await writeClient.deleteComment(commentId);
    assert(deletedComment.data.deletedCount >= 1, 'deleteComment() did not delete the moderated comment');
    assert(deletedComment.data.deleted?.some?.((item) => item.id === commentId), 'deleteComment() response missing deleted comment');
    writeChecks.push('deleteComment');
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
    'liveManagedPage',
    'updateLiveManagedPage',
    'liveManagedBlogPost',
    'updateLiveManagedBlogPost',
    'buildBackyCommerceOrderInput',
    'buildBackyLiveManagedBlogPostEditableMapUpdate',
    'groupBackyContentElements',
    'ungroupBackyContentElements',
    'patchBackyContentElement',
    'patchBackyContentElements',
    'patchBackyContentEditableFields',
    'patchBackyContentEditableMapEntries',
    'patchBackyContentEditableMapValues',
    'findBackyContentElement',
    'listBackyContentElements',
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
    'mediaFolders',
    'mediaFoldersCached',
    'mediaAsset',
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
    'commentAnalytics',
    'retryCommentDelivery',
    'events',
    'issueAdminSettingsApiKey',
    'revokeAdminSettingsApiKey',
    'validateAdminSettingsInfrastructure',
    'runAdminSettingsStorageProvisioningProbe',
    'runAdminSettingsStorageCredentialRotationProbe',
    'runAdminSettingsStorageSecretManager',
    'testAdminSettingsNotificationWebhook',
    ...(commerceCatalogChecked ? ['commerceOrderContract', 'commerceOrderContractCached', 'commerceCatalog', 'commerceCatalogCached'] : []),
  ],
  writeChecked: writeChecks,
}, null, 2));
