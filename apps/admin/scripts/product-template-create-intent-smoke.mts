import assert from 'node:assert/strict';
import { buildSync, transformSync } from 'esbuild';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { NextRequest, NextResponse } from 'next/server';
import { load } from '../../public/scripts/collection-import-postgres-handlers.mjs';

// Execute the normal card callback and real client serializer against the real
// create handler. Only auth, providers and persistence location are fixtures.
const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'backy-product-card-intent-'));
process.chdir(scratch);
try {
  const imported: any = await import('../../public/src/lib/backyStore.ts');
  const store = imported.default || imported;
  const site = store.createAdminSite({ name: 'Product card intent fixture', slug: 'product-card-intent' });
  const collection = store.createAdminCollection(site.id, {
    name: 'Legacy products', slug: 'products', status: 'published',
    fields: ['title', 'sku', 'price', 'currency', 'inventory'].map(key => ({
      id: key, key, label: key, type: ['price', 'inventory'].includes(key) ? 'number' : 'text', required: true,
    })),
  });
  const mocks: any = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/backyStore': store,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => true },
    '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'synthetic-owner' } } }) },
    '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionAccess: async () => null },
    '@/lib/adminAudit': { recordAdminAudit: async () => ({}) },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] },
  };
  for (const [key, value] of Object.entries({ ...mocks })) if (key.startsWith('@/lib/')) mocks['./' + key.slice('@/lib/'.length)] = value;
  const contract: any = load('../src/lib/frontendDesignContract.ts', mocks);
  const provenance: any = load('../src/lib/templateInstanceProvenance.ts', mocks);
  const templates = ['first-product', 'selected-product'].map((id, index) => ({
    id, name: id, type: 'product', version: 1,
    content: { title: id, price: 10 + index, inventory: 3, elements: [{
      id: id + '-hero', type: 'section', width: 900 + index,
      children: [{ id: id + '-text', type: 'text', props: { content: id }, responsive: { mobile: { width: 280 } } }],
    }], canvasSize: { width: 1200, height: 800 }, metadata: { extension: { nested: [false, 0] } } },
  }));
  const frontendDesign = contract.normalizeFrontendDesignContract({ status: 'captured', source: { type: 'manual' }, templates });
  store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: provenance.templateInstanceFingerprint(site.settings.frontendDesign ?? null), frontendDesign, source: 'fixture' });
  const route: any = load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts', mocks);
  const requests: any[] = [];
  const module = { exports: {} as any };
  const output = buildSync({ entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
  vm.runInNewContext(output, { module, exports: module.exports, console, URL, Headers, Request, Response,
    fetch: async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); requests.push(body);
      return route.POST(new NextRequest(new URL(url, 'http://fixture.invalid'), init), { params: Promise.resolve({ siteId: site.id, collectionId: collection.id }) });
    },
  });
  const source = readFileSync(process.env.BACKY_PRODUCTS_SOURCE_FILE || new URL('../src/routes/products.tsx', import.meta.url), 'utf8');
  const begin = source.indexOf('  const createProductFromFrontendTemplate = async');
  const end = source.indexOf('  const saveProduct = async', begin);
  const helpersBegin = source.indexOf('const isPlainRecord =');
  const helpersEnd = source.indexOf('const FRONTEND_PRODUCT_VALUE_KEYS =', helpersBegin);
  assert(begin >= 0 && end > begin && helpersBegin >= 0 && helpersEnd > helpersBegin);
  const state: any = { setProducts: [] };
  let suffix = 0;
  const context: any = {
    activeSiteId: site.id, productCollection: collection, isProductsBusy: false, canEditProducts: true,
    frontendDesign, crypto: { randomUUID: () => `${String(++suffix).padStart(8, '0')}-fixture` },
    productFieldKey: (key: string) => key.toLowerCase(), createCollectionRecord: module.exports.createCollectionRecord,
    normalizeProductRecord: (record: any) => record, productToForm: (record: any) => record,
    updateProductsRouteSearch: () => {}, buildProductCanvasNoticeAction: () => null, Error, JSON,
  };
  for (const setter of new Set([...source.slice(begin, end).matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) {
    context[setter] = (value: any) => { state[setter] = typeof value === 'function' ? value(state[setter]) : value; };
  }
  vm.runInNewContext(transformSync(source.slice(helpersBegin, helpersEnd) + source.slice(begin, end) + '\nglobalThis.create = createProductFromFrontendTemplate;', { loader: 'tsx' }).code, context);
  for (const selected of frontendDesign.templates) {
    await context.create(selected, { slug: selected.id, sku: selected.id, values: { title: selected.name, sku: selected.id, price: 59.25, inventory: 11, currency: 'USD' } });
    assert.equal(state.setError, null);
    const request = requests.at(-1);
    assert.equal(request.frontendDesignTemplateId, selected.id, 'Normal card transport must explicitly select its registered template');
    assert.equal(request.values.frontendTemplateInstance, undefined, 'Trusted baseline comes from server registration');
    const record = store.getCollectionRecordByIdOrSlug(site.id, collection.id, state.setSelectedProductId, { includeUnpublished: true });
    assert.equal(record.status, 'draft');
    assert.equal(record.values.price, 59.25); assert.equal(record.values.inventory, 11);
    assert.equal(record.values.frontendDesignTemplateId, selected.id);
    assert.equal(record.values.design.elements[0].id, selected.content.elements[0].id);
    assert.equal(record.values.design.elements[0].children[0].responsive.mobile.width, 280);
    assert.deepEqual(record.values.design.metadata.extension.nested, [false, 0]);
    assert.equal(record.values.frontendTemplateInstance.templateId, selected.id);
    assert.equal(record.values.frontendTemplateInstance.instanceType, 'product');
    assert(provenance.isValidProductTemplateInstancePin(record.values.frontendTemplateInstance));
    assert.equal(record.values.frontendTemplateInstance.templateFingerprint, provenance.templateInstanceFingerprint(selected));
    assert.equal(store.validateCollectionRecordValues(collection, record.values).length, 0);
    assert.deepEqual(store.normalizeCollectionRecordValues(collection, record.values).frontendTemplateInstance, record.values.frontendTemplateInstance);
  }
  assert.equal(requests.length, 2); assert.equal(state.setProducts.length, 2);
  console.log('Product normal card + actual admin transport + trusted create handler passed 34 assertions: two eligible registrations, exact selection, legacy required fields, server design/mobile/unknown fields and valid baseline retained. Synthetic Owner/provider boundaries; durable disposable demo persistence.');
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }
