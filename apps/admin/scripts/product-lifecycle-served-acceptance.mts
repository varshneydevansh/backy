/** Read-only evidence plus denied writes after the CUA-owned disposable product journey. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:5186';
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
async function json(path: string, init?: RequestInit) {
  const response = await fetch(base + path, init);
  return { response, body: await response.json() };
}
const before = (await json('/fixture/evidence')).body;
check(before.records.length === 1, 'One owned product created through UI');
const record = before.records[0], values = record.values;
check(record.status === 'published', 'UI publish persisted');
check(values.title === 'Edited disposable acceptance product' && values.price === 29, 'Catalog edits persisted');
check(values.downloadmediaid === before.downloadId && values.downloadurl === '', 'Private download ID preserved without URL');
check(values.frontendDesignElements[0].children[1].props.mediaId === before.imageId, 'Image identity preserved');
check(values.frontendDesignContentDocument.version.id === 'fixture-v2', 'Versioned canonical document preserved');
check(JSON.stringify(values.frontendDesignContentDocument).includes('Edited nested product canvas'), 'Canvas-authored nested text persisted');
check(values.frontendDesignElements[0].responsive.mobile.width === '100%', 'Responsive override preserved in canvas state');
check(values.frontendDesignTokens.fonts.body === 'Georgia', 'Font tokens preserved');
check(values.frontendDesignContentDocument.extension.keep && values.frontendDesignExtension.keep[0] === false && values.frontendDesignExtension.keep[1] === 0, 'Safe extension JSON preserved');
check(JSON.stringify(before.persisted.find((item: any) => item.id === record.id)) === JSON.stringify(record), 'Disk readback matches reopened store');
check(before.events.some((event: any) => event.method === 'POST' && event.path.endsWith('/records') && event.status === 201), 'Actual handler created product');
check(before.events.filter((event: any) => event.method === 'PATCH' && event.path.endsWith('/' + record.id) && event.status === 200).length >= 4, 'Actual save/import/canvas/publish handlers executed');

const publicResult = await json('/api/sites/' + before.siteId + '/commerce/catalog');
check(publicResult.response.status === 200, 'Actual public catalog succeeds');
const catalog = publicResult.body.data, product = catalog.products[0];
check(catalog.products.length === 1 && product.id === record.id && product.status === 'published', 'Published product enters catalog');
check(product.title === values.title && product.price === 29 && product.imageUrl.endsWith('/fixture/media.svg'), 'Safe public scalar/image projection');
check(!JSON.stringify(publicResult.body).includes('private.pdf') && !JSON.stringify(publicResult.body).includes('must-not-be-in-public-product'), 'Private file URL and arbitrary private values absent');
check(product.delivery.hasDigitalDelivery === true && !('downloadMediaId' in product), 'Public delivery capability does not expose private media identity');
check(product.checkout.enabled === false && product.checkout.mode === 'not-configured' && product.checkout.url === null, 'Product checkout explicitly unavailable');
check(catalog.commerce.mode === 'catalog-only' && catalog.commerce.paymentProvider === 'none' && catalog.commerce.capabilities.providerCheckout === false, 'No configured payment capability');
check(product.design.contentDocument.version.id === 'fixture-v2' && JSON.stringify(product.design).includes('Edited nested product canvas'), 'Public authored design/version projection retained');
check((await fetch(base + '/fixture/media.svg')).status === 200, 'Owned public image loads');
check((await fetch(base + '/fixture/private.pdf')).status === 403, 'Synthetic private delivery endpoint denies direct access');

const recordPath = `/api/admin/sites/${before.siteId}/collections/${record.collectionId}/records/${record.id}`;
const forbidden = await json(recordPath.replace('/' + before.siteId + '/', '/product-foreign/'), {
  method: 'PATCH', headers: { 'content-type': 'application/json', 'x-backy-admin-session': 'synthetic-product-limited' },
  body: JSON.stringify({ values: { title: 'Forbidden mutation' } }),
});
check(forbidden.response.status === 403, 'Selected-site session cannot write another site');
const unauthenticated = await json(recordPath, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: { title: 'Anonymous mutation' } }) });
check(unauthenticated.response.status === 401, 'Missing session denied before write');
const wrongTenant = await json(recordPath.replace('/' + before.siteId + '/', '/product-foreign/'), { headers: { 'x-backy-admin-session': 'synthetic-product-owner' } });
check(wrongTenant.response.status === 404, 'Owner-wide permission does not bypass canonical record tenant lookup');
const after = (await json('/fixture/evidence')).body;
check(JSON.stringify(after.records) === JSON.stringify(before.records) && JSON.stringify(after.persisted) === JSON.stringify(before.persisted), 'Denied requests changed neither memory nor persisted product');

await mkdir('/tmp/backy-product-acceptance', { recursive: true });
await writeFile('/tmp/backy-product-acceptance/result.json', JSON.stringify({ checks, status: 'PASS', boundary: before.boundary, publishedProducts: 1, checkoutAvailable: false, scopeDenials: [403, 401, 404], providerWrites: 0 }, null, 2) + '\n');
console.log(`PASS ${checks} served product acceptance checks (CUA authoring required; isolated demo/shared auth; no provider writes)`);
