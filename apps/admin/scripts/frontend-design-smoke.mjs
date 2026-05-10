#!/usr/bin/env node

import { validateAiFrontendManifest } from '../../public/scripts/validate-ai-render-payload.mjs';

const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_FRONTEND_DESIGN_SMOKE_SITE_ID || 'site-demo';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
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
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const captureSiteDefaults = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'POST',
    body: JSON.stringify({ action: 'capture-site-defaults' }),
  });
  const captured = payload.data?.frontendDesign;
  assert(captured?.status === 'captured', `Capture did not mark contract captured: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(captured.source?.type === 'managed-site', `Capture did not preserve managed-site source: ${JSON.stringify(captured).slice(0, 500)}`);
  assert(Array.isArray(captured.editableMap) && captured.editableMap.length >= 3, 'Capture did not include editable map defaults');
  return captured;
};

const getManifest = async () => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/manifest`);
  assert(payload.data?.schemaVersion === 'backy.frontend-manifest.v1', `Manifest returned unexpected schema: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
};

const smokeContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke custom frontend',
    url: 'https://example.com',
    repository: 'example/backy-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      surface: '#ffffff',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    spacing: {
      sectionY: 96,
    },
    radii: {
      card: 8,
    },
  },
  chrome: {
    header: {
      component: 'SiteHeader',
      variant: 'sticky',
    },
    navigation: {
      component: 'MainNavigation',
      source: 'site.navigation.primary',
    },
    footer: {
      component: 'SiteFooter',
      source: 'site.navigation.footer',
    },
  },
  templates: [
    {
      id: 'smoke-page-template',
      type: 'page',
      name: 'Smoke Page Template',
      routePattern: '/{slug}',
      canvasSize: { width: 1440, height: 1200 },
      bindingHints: [
        { role: 'page.title', binding: 'page.title' },
      ],
    },
    {
      id: 'smoke-blog-template',
      type: 'blogPost',
      name: 'Smoke Blog Template',
      routePattern: '/blog/{slug}',
      canvasSize: { width: 1200, height: 1000 },
      bindingHints: [
        { role: 'post.title', binding: 'post.title' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="site-header"]',
      role: 'site.header',
      binding: 'site.navigation.primary',
      fields: ['label', 'href'],
    },
    {
      selector: '[data-backy-role="post-body"]',
      role: 'post.body',
      binding: 'post.content',
      fields: ['content'],
    },
  ],
  notes: 'Smoke contract for validating custom frontend design persistence.',
});

const main = async () => {
  const original = await getFrontendDesign();
  const unique = Date.now().toString(36);
  let createdPageId = null;
  let createdPostId = null;

  try {
    const patched = await patchFrontendDesign(smokeContract());
    assert(patched.status === 'synced', `Patched status was not synced: ${patched.status}`);
    assert(patched.source?.type === 'custom-frontend', `Patched source type was not custom frontend: ${patched.source?.type}`);
    assert(patched.templates?.length === 2, `Patched template count was unexpected: ${patched.templates?.length}`);
    assert(patched.chrome?.header?.component === 'SiteHeader', 'Patched chrome header was not preserved');

    const afterPatch = await getFrontendDesign();
    assert(afterPatch.tokens?.colors?.primary === '#0f766e', 'GET did not persist patched color token');

    const manifestAfterPatch = await getManifest();
    validateAiFrontendManifest({ success: true, requestId: 'frontend-design-smoke', data: manifestAfterPatch }, 'frontend design manifest after patch');
    assert(manifestAfterPatch.site?.frontendDesign?.status === 'synced', 'Manifest did not expose synced frontend design contract');
    assert(manifestAfterPatch.capabilities?.frontendDesignContract === true, 'Manifest did not advertise frontend design capability');
    assert(manifestAfterPatch.endpoints?.frontendDesign?.includes('#data.site.frontendDesign'), 'Manifest did not expose frontend design endpoint anchor');

    const seededPage = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Frontend Seeded Page ${unique}`,
        slug: `frontend-seeded-page-${unique}`,
        status: 'published',
        frontendDesignTemplateId: 'smoke-page-template',
      }),
    });
    createdPageId = seededPage.data?.page?.id;
    assert(createdPageId, 'Template-seeded page create did not return a page id');
    assert(seededPage.data?.page?.meta?.frontendDesignTemplateId === 'smoke-page-template', 'Template-seeded page did not preserve template metadata');
    assert(seededPage.data?.page?.meta?.frontendDesignTokens?.colors?.primary === '#0f766e', 'Template-seeded page did not preserve frontend tokens');
    assert(Array.isArray(seededPage.data?.page?.content?.elements) && seededPage.data.page.content.elements.length > 0, 'Template-seeded page did not create editable content');

    const seededPost = await requestApi(`/api/admin/sites/${SITE_ID}/blog`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Frontend Seeded Post ${unique}`,
        slug: `frontend-seeded-post-${unique}`,
        excerpt: 'Generated by the frontend design smoke test.',
        status: 'published',
        frontendDesignTemplateId: 'smoke-blog-template',
      }),
    });
    createdPostId = seededPost.data?.post?.id;
    assert(createdPostId, 'Template-seeded post create did not return a post id');
    assert(seededPost.data?.post?.meta?.frontendDesignTemplateId === 'smoke-blog-template', 'Template-seeded post did not preserve template metadata');
    assert(seededPost.data?.post?.meta?.frontendDesignChrome?.header?.component === 'SiteHeader', 'Template-seeded post did not preserve frontend chrome');
    assert(Array.isArray(seededPost.data?.post?.content?.elements) && seededPost.data.post.content.elements.length > 0, 'Template-seeded post did not create editable content');

    const captured = await captureSiteDefaults();
    assert(captured.chrome?.navigation, 'Capture did not include navigation chrome');

    const manifestAfterCapture = await getManifest();
    validateAiFrontendManifest({ success: true, requestId: 'frontend-design-smoke', data: manifestAfterCapture }, 'frontend design manifest after capture');
    assert(manifestAfterCapture.site?.frontendDesign?.status === 'captured', 'Manifest did not expose captured frontend design contract');
    assert(manifestAfterCapture.site?.frontendDesign?.source?.type === 'managed-site', 'Manifest did not expose managed-site source after capture');
  } finally {
    if (createdPageId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/pages/${createdPageId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (createdPostId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/blog/${createdPostId}`, { method: 'DELETE' }).catch(() => {});
    }
    await patchFrontendDesign(original);
  }

  console.log('Frontend design contract smoke passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
