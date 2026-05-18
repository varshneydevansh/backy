#!/usr/bin/env node

import { validateAiFrontendManifest } from '../../public/scripts/validate-ai-render-payload.mjs';

const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_FRONTEND_DESIGN_SMOKE_SITE_ID || 'site-demo';
const PRODUCT_COLLECTION_SLUG = 'products';
let apiAdminSessionToken = '';

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
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const payload = await response.json().catch(() => ({}));

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

const getFrontendDesignResponse = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
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
  return { captured, payload };
};

const assertFrontendDesignAudit = async (action, requestId, predicate, message) => {
  const payload = await requestApi(`/api/admin/audit-logs?siteId=${SITE_ID}&entity=site&entityId=${SITE_ID}&action=${encodeURIComponent(action)}&requestId=${encodeURIComponent(requestId)}`);
  const match = payload.data?.logs?.some((entry) => (
    entry.entity === 'site' &&
    entry.entityId === SITE_ID &&
    entry.action === action &&
    entry.requestId === requestId &&
    predicate(entry)
  ));
  assert(match, `${message}: ${JSON.stringify(payload).slice(0, 1000)}`);
};

const getManifest = async () => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/manifest`);
  assert(payload.data?.schemaVersion === 'backy.frontend-manifest.v1', `Manifest returned unexpected schema: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
};

const assertTemplateRegistry = async () => {
  const allPayload = await requestApi(`/api/admin/sites/${SITE_ID}/templates`);
  const registry = allPayload.data?.registry;
  assert(registry?.schemaVersion === 'backy.template-registry.v1', `Template registry returned unexpected schema: ${JSON.stringify(allPayload).slice(0, 500)}`);
  assert(registry.templateCount === 6, `Template registry count was unexpected: ${registry.templateCount}`);
  assert(registry.totalTemplateCount === 6, `Template registry total count was unexpected: ${registry.totalTemplateCount}`);
  assert(registry.cloneField === 'frontendDesignTemplateId', `Template registry clone field was unexpected: ${registry.cloneField}`);
  assert(registry.cloneTargets?.page === `/api/admin/sites/${SITE_ID}/pages`, 'Template registry missing page clone target');
  assert(registry.cloneTargets?.blogPost === `/api/admin/sites/${SITE_ID}/blog`, 'Template registry missing blog clone target');
  assert(registry.cloneTargets?.form === `/api/admin/sites/${SITE_ID}/forms`, 'Template registry missing form clone target');
  assert(registry.cloneTargets?.section === `/api/admin/sites/${SITE_ID}/reusable-sections`, 'Template registry missing section clone target');
  assert(registry.cloneTargets?.collection === `/api/admin/sites/${SITE_ID}/collections`, 'Template registry missing collection clone target');
  assert(registry.cloneTargets?.product === `/api/admin/sites/${SITE_ID}/collections/products/records`, 'Template registry missing product clone target');

  const pageTemplate = registry.templates?.find((template) => template.id === 'smoke-page-template');
  assert(pageTemplate?.clone?.endpoint === registry.cloneTargets.page, `Template registry missing page clone payload: ${JSON.stringify(pageTemplate).slice(0, 500)}`);
  assert(pageTemplate.clone.body?.frontendDesignTemplateId === 'smoke-page-template', 'Template registry page clone body missing frontendDesignTemplateId');
  assert(pageTemplate.clone.body?.title === 'Smoke Page Template', 'Template registry page clone body missing title');
  assert(pageTemplate.contentSummary?.elementCount > 0, 'Template registry page summary missing element count');

  const formTemplate = registry.byType?.form?.[0];
  assert(formTemplate?.clone?.body?.name === 'Smoke Form Template', `Template registry missing form clone name: ${JSON.stringify(formTemplate).slice(0, 500)}`);
  assert(formTemplate.contentSummary?.fieldCount === 2, 'Template registry form summary missing field count');

  const productTemplate = registry.byType?.product?.[0];
  assert(productTemplate?.clone?.endpoint === registry.cloneTargets.product, `Template registry missing product clone target: ${JSON.stringify(productTemplate).slice(0, 500)}`);
  assert(productTemplate.clone.body?.values?.title === 'Smoke Product Template', 'Template registry product clone body missing title value');

  const filteredPayload = await requestApi(`/api/admin/sites/${SITE_ID}/templates?type=product&search=product`);
  const filtered = filteredPayload.data?.registry;
  assert(filtered?.templateCount === 1, `Filtered product template count was unexpected: ${JSON.stringify(filteredPayload).slice(0, 500)}`);
  assert(filtered.templates?.[0]?.id === 'smoke-product-template', 'Filtered product template did not return smoke-product-template');
};

const getProductCollection = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`);
  const collections = payload.data?.collections || [];
  const collection = collections.find((candidate) => candidate.slug === PRODUCT_COLLECTION_SLUG);
  assert(collection?.id, `Products collection was not found: ${JSON.stringify(collections).slice(0, 1000)}`);
  return collection;
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
    {
      id: 'smoke-form-template',
      type: 'form',
      name: 'Smoke Form Template',
      routePattern: '/forms/{slug}',
      content: {
        name: 'Smoke Lead Form',
        title: 'Smoke Lead Form',
        description: 'Lead form seeded from the connected frontend design contract.',
        successMessage: 'Thanks. We received your request.',
        fields: [
          { id: 'smoke-form-name', key: 'name', label: 'Name', type: 'text', required: true },
          { id: 'smoke-form-email', key: 'email', label: 'Email', type: 'email', required: true },
        ],
        settings: {
          layout: 'stacked',
          submitLabel: 'Send request',
        },
      },
      bindingHints: [
        { role: 'form.title', binding: 'form.title' },
        { role: 'form.fields', binding: 'form.fields' },
      ],
    },
    {
      id: 'smoke-section-template',
      type: 'section',
      name: 'Smoke Section Template',
      routePattern: '/sections/smoke',
      content: {
        name: 'Smoke Hero Section',
        category: 'layout',
        tags: ['frontend-design'],
        section: {
          elements: [
            {
              id: 'smoke-section-root',
              type: 'section',
              x: 0,
              y: 0,
              width: 1200,
              height: 360,
              props: { background: '#ffffff' },
            },
          ],
        },
      },
      bindingHints: [
        { role: 'section.root', binding: 'section.content' },
      ],
    },
    {
      id: 'smoke-collection-template',
      type: 'collection',
      name: 'Smoke Directory Collection',
      routePattern: '/directory/:recordSlug',
      content: {
        name: 'Smoke Directory',
        slug: 'smoke-directory',
        status: 'published',
        routePattern: '/directory/:recordSlug',
        listRoutePattern: '/directory',
        fields: [
          { id: 'smoke-directory-title', key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
          { id: 'smoke-directory-summary', key: 'summary', label: 'Summary', type: 'textarea', required: false, unique: false, sortOrder: 20 },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      },
      bindingHints: [
        { role: 'collection.list', binding: 'collection.records' },
      ],
    },
    {
      id: 'smoke-product-template',
      type: 'product',
      name: 'Smoke Product Template',
      routePattern: '/products/smoke-design-product',
      content: {
        slug: 'smoke-design-product',
        values: {
          title: 'Smoke design product',
          sku: 'SMOKE-DESIGN-PRODUCT',
          price: 49,
          currency: 'USD',
          inventory: 7,
          productType: 'digital',
          shippingRequired: false,
          imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
          description: 'Product seeded from the connected frontend design contract.',
          featured: true,
          taxable: true,
        },
      },
      bindingHints: [
        { role: 'product.title', binding: 'product.title' },
        { role: 'product.price', binding: 'product.price' },
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
  const unauthResponse = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/frontend-design`);
  const unauthPayload = await unauthResponse.json().catch(() => ({}));
  assert(unauthResponse.status === 401, `Frontend design API should reject missing auth, got ${unauthResponse.status}`);
  assert(unauthPayload?.success === false && unauthPayload?.error?.code === 'UNAUTHORIZED', `Frontend design API missing auth envelope: ${JSON.stringify(unauthPayload).slice(0, 500)}`);

  const unauthTemplateResponse = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/templates`);
  const unauthTemplatePayload = await unauthTemplateResponse.json().catch(() => ({}));
  assert(unauthTemplateResponse.status === 401, `Template registry API should reject missing auth, got ${unauthTemplateResponse.status}`);
  assert(unauthTemplatePayload?.success === false && unauthTemplatePayload?.error?.code === 'UNAUTHORIZED', `Template registry API missing auth envelope: ${JSON.stringify(unauthTemplatePayload).slice(0, 500)}`);

  await loginAdminApi();
  const original = await getFrontendDesign();
  const unique = Date.now().toString(36);
  let createdPageId = null;
  let createdPostId = null;
  let createdFormId = null;
  let createdSectionId = null;
  let createdCollectionId = null;
  let createdProductRecordId = null;
  let productCollectionId = null;

  try {
    const patchPayload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
      method: 'PATCH',
      body: JSON.stringify({ frontendDesign: smokeContract() }),
    });
    const patched = patchPayload.data?.frontendDesign;
    assert(patched.status === 'synced', `Patched status was not synced: ${patched.status}`);
    assert(patched.source?.type === 'custom-frontend', `Patched source type was not custom frontend: ${patched.source?.type}`);
    assert(patched.templates?.length === 6, `Patched template count was unexpected: ${patched.templates?.length}`);
    assert(patched.chrome?.header?.component === 'SiteHeader', 'Patched chrome header was not preserved');
    await assertFrontendDesignAudit(
      'frontendDesign.update',
      patchPayload.requestId,
      (entry) => (
        entry.before?.schemaVersion === 'backy.frontend-design.v1' &&
        entry.after?.status === 'synced' &&
        entry.metadata?.sourceType === 'custom-frontend' &&
        entry.metadata?.templateCount === 6
      ),
      'Frontend design update audit log was not recorded',
    );

    const frontendDesignResponse = await getFrontendDesignResponse();
    assert(frontendDesignResponse.endpoints?.templates === `/api/admin/sites/${SITE_ID}/templates`, 'Frontend design response did not advertise template registry endpoint');
    assert(frontendDesignResponse.templateRegistry?.schemaVersion === 'backy.template-registry.v1', 'Frontend design response missing template registry summary');
    assert(frontendDesignResponse.templateRegistry?.templateCount === 6, 'Frontend design response template registry summary had unexpected template count');
    assert(frontendDesignResponse.templateRegistry?.cloneField === 'frontendDesignTemplateId', 'Frontend design response missing template registry clone field');
    const afterPatch = frontendDesignResponse.frontendDesign;
    assert(afterPatch.tokens?.colors?.primary === '#0f766e', 'GET did not persist patched color token');
    await assertTemplateRegistry();

    const manifestAfterPatch = await getManifest();
    validateAiFrontendManifest({ success: true, requestId: 'frontend-design-smoke', data: manifestAfterPatch }, 'frontend design manifest after patch');
    assert(manifestAfterPatch.site?.frontendDesign?.status === 'synced', 'Manifest did not expose synced frontend design contract');
    assert(manifestAfterPatch.capabilities?.frontendDesignContract === true, 'Manifest did not advertise frontend design capability');
    assert(manifestAfterPatch.endpoints?.frontendDesign === `/api/sites/${SITE_ID}/frontend-design`, 'Manifest did not expose frontend design endpoint');

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

    const seededForm = await requestApi(`/api/admin/sites/${SITE_ID}/forms`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Lead Form ${unique}`,
        title: `Smoke Lead Form ${unique}`,
        frontendDesignTemplateId: 'smoke-form-template',
      }),
    });
    createdFormId = seededForm.data?.form?.id;
    assert(createdFormId, 'Template-seeded form create did not return a form id');
    assert(seededForm.data?.form?.settings?.frontendDesignTemplateId === 'smoke-form-template', 'Template-seeded form did not preserve template metadata');
    assert(seededForm.data?.form?.settings?.frontendDesignChrome?.footer?.component === 'SiteFooter', 'Template-seeded form did not preserve frontend chrome');
    assert(seededForm.data?.form?.settings?.frontendDesignTokens?.colors?.primary === '#0f766e', 'Template-seeded form did not preserve frontend tokens');
    assert(Array.isArray(seededForm.data?.form?.fields) && seededForm.data.form.fields.length === 2, 'Template-seeded form did not preserve frontend fields');

    const seededSection = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Hero Section ${unique}`,
        slug: `smoke-hero-section-${unique}`,
        frontendDesignTemplateId: 'smoke-section-template',
      }),
    });
    createdSectionId = seededSection.data?.section?.id;
    assert(createdSectionId, 'Template-seeded reusable section create did not return a section id');
    assert(seededSection.data?.section?.metadata?.frontendDesignTemplateId === 'smoke-section-template', 'Template-seeded section did not preserve template metadata');
    assert(seededSection.data?.section?.metadata?.frontendDesignSource?.type === 'custom-frontend', 'Template-seeded section did not preserve frontend source');
    assert(Array.isArray(seededSection.data?.section?.content?.elements) && seededSection.data.section.content.elements.length > 0, 'Template-seeded section did not preserve frontend elements');

    const seededCollection = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Directory ${unique}`,
        slug: `smoke-directory-${unique}`,
        routePattern: `/directory-${unique}/:recordSlug`,
        listRoutePattern: `/directory-${unique}`,
        frontendDesignTemplateId: 'smoke-collection-template',
      }),
    });
    createdCollectionId = seededCollection.data?.collection?.id;
    assert(createdCollectionId, 'Template-seeded collection create did not return a collection id');
    assert(seededCollection.data?.collection?.metadata?.frontendDesignTemplateId === 'smoke-collection-template', 'Template-seeded collection did not preserve template metadata');
    assert(seededCollection.data?.collection?.metadata?.frontendDesignTokens?.fonts?.heading === 'Inter', 'Template-seeded collection did not preserve frontend tokens');
    assert(Array.isArray(seededCollection.data?.collection?.fields) && seededCollection.data.collection.fields.length === 2, 'Template-seeded collection did not preserve frontend fields');

    const productCollection = await getProductCollection();
    productCollectionId = productCollection.id;
    const seededProductRecord = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records`, {
      method: 'POST',
      body: JSON.stringify({
        slug: `smoke-design-product-${unique}`,
        status: 'published',
        frontendDesignTemplateId: 'smoke-product-template',
        values: {
          title: `Smoke design product ${unique}`,
          sku: `SMOKE-DESIGN-${unique.toUpperCase()}`,
        },
      }),
    });
    createdProductRecordId = seededProductRecord.data?.record?.id;
    assert(createdProductRecordId, 'Template-seeded product record create did not return a record id');
    assert(seededProductRecord.data?.record?.values?.frontendDesignTemplateId === 'smoke-product-template', 'Template-seeded product did not preserve template metadata');
    assert(seededProductRecord.data?.record?.values?.frontendDesignRoutePattern === '/products/smoke-design-product', 'Template-seeded product did not preserve frontend route pattern');
    assert(seededProductRecord.data?.record?.values?.frontendDesignChrome?.header?.component === 'SiteHeader', 'Template-seeded product did not preserve frontend chrome');
    assert(seededProductRecord.data?.record?.values?.price === 49, 'Template-seeded product did not preserve template values');

    const { captured, payload: capturePayload } = await captureSiteDefaults();
    assert(captured.chrome?.navigation, 'Capture did not include navigation chrome');
    await assertFrontendDesignAudit(
      'frontendDesign.capture',
      capturePayload.requestId,
      (entry) => (
        entry.before?.status === 'synced' &&
        entry.after?.status === 'captured' &&
        entry.metadata?.sourceType === 'managed-site' &&
        entry.metadata?.editableBindingCount >= 3
      ),
      'Frontend design capture audit log was not recorded',
    );

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
    if (createdFormId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/forms/${createdFormId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (createdSectionId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${createdSectionId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (createdProductRecordId && productCollectionId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/collections/${productCollectionId}/records/${createdProductRecordId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (createdCollectionId) {
      await requestApi(`/api/admin/sites/${SITE_ID}/collections/${createdCollectionId}`, { method: 'DELETE' }).catch(() => {});
    }
    await patchFrontendDesign(original);
  }

  console.log('Frontend design contract smoke passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
