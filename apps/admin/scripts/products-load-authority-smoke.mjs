import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the actual route callbacks with deferred I/O. No user, provider,
// browser, or backend persistence is involved in this route-admission proof.
const source = readFileSync(process.env.BACKY_PRODUCTS_SOURCE_FILE || new URL('../src/routes/products.tsx', import.meta.url), 'utf8');
const authoritySource = readFileSync(new URL('../src/lib/workspaceLoadAuthority.ts', import.meta.url), 'utf8');
const authorityContext = {};
vm.runInNewContext(transformSync(authoritySource.replace('export function', 'function') + '\nglobalThis.makeAuthority = createWorkspaceLoadAuthority;', { loader: 'ts' }).code, authorityContext);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const start = source.indexOf('  const loadProducts = async');
const end = source.indexOf('  useEffect(() => {', start);
assert(start >= 0 && end > start);
const loaderCode = transformSync(source.slice(start, end) + '\nglobalThis.load = loadProducts; globalThis.more = loadMoreProducts;', { loader: 'tsx' }).code;
const contextCode = source.match(/  const productWorkspaceContext =[^\n]+\n  productLoadAuthority\.current\.setContext\(productWorkspaceContext\);/)?.[0] || '';
const replayCode = source.match(/  useEffect\(\(\) => \{\n    if \(!isProductMutationBusy[\s\S]+?\}, \[isProductMutationBusy, isPermissionMatrixPending\]\);/)?.[0] || '';
const resetCode = source.match(/  useEffect\(\(\) => \{\n    setProducts\(\[\]\);[\s\S]+?\}, \[productWorkspaceContext\]\);/)?.[0] || '';
const row = (site, id = site) => ({ id, siteId: site, values: {}, updatedAt: '2026-01-01T00:00:00Z' });
const page = (site, id = site) => ({ records: [row(site, id)], pagination: { offset: 0, limit: 100, hasMore: true } });
const enabled = name => !process.env.BACKY_PRODUCTS_PROOF_CASE || process.env.BACKY_PRODUCTS_PROOF_CASE === name;
function fixture() {
  const state = {}, calls = [], pending = [];
  const authority = { current: authorityContext.makeAuthority() }, deferredLoad = { current: false };
  function render(site, options = {}) {
    const context = {
      activeSiteId: site, routeSearch: { siteId: site }, currentAdmin: { id: options.user || 'owner' },
      canViewProducts: options.allowed !== false, canViewCommerce: true, isPermissionMatrixPending: false,
      isProductsBusy: Boolean(options.loading || options.mutating), isProductMutationBusy: Boolean(options.mutating),
      productLoadAuthority: authority, deferredProductLoad: deferredLoad,
      productCollection: { id: site + '-products' }, productPagination: { offset: 0, limit: 100, hasMore: true },
      PRODUCT_COLLECTION_SLUG: 'products', ORDERS_COLLECTION_SLUG: 'orders', CUSTOMERS_COLLECTION_SLUG: 'customers',
      PRODUCT_RECORD_PAGE_SIZE: 100, COMMERCE_SIGNAL_RECORD_LIMIT: 100,
      listCollections: async () => [{ id: site + '-products', slug: 'products' }], getSettings: async () => null,
      listCollectionRecords: (requestedSite, collection, query) => { const work = deferred(); calls.push({ site: requestedSite, collection, offset: query.offset }); pending.push(work); return work.promise; },
      normalizeProductRecord: value => value, customerProfileToDraft: () => ({}), clearProductEditorState: () => { state.editor = null; state.setSelectedProductId = null; },
      loadProductNotificationEvents: () => {}, loadCommerceOrderAnalytics: () => {}, loadCommerceReconciliationReadiness: () => {},
      Error, Promise, Set, JSON, useEffect: callback => callback(),
    };
    for (const name of new Set([...(source.slice(start, end) + resetCode).matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) {
      context[name] = value => { state[name] = typeof value === 'function' ? value(state[name]) : value; };
    }
    state.setProducts ||= [];
    vm.runInNewContext(transformSync(contextCode, { loader: 'tsx' }).code + loaderCode, context);
    return context;
  }
  return { state, calls, pending, render, authority, deferredLoad };
}
if (enabled('scope-reset')) {
  const f = fixture();
  for (const site of ['A', 'B']) {
    const current = f.render(site); f.state.setProducts = [row('old')];
    for (const field of ['setCommerceSettings', 'setRuntimeCommerce', 'setError', 'setNotice', 'setOrderAnalytics', 'setReconciliationResult']) f.state[field] = 'previous context';
    current.routeSearch.productId = site + '-owned';
    vm.runInNewContext(transformSync(resetCode, { loader: 'tsx' }).code, current);
    assert.equal(f.state.setProducts.length, 0, 'Scope transition clears old-site rows before the new request resolves');
    assert.equal(f.state.setSelectedProductId, site + '-owned', 'An explicit product deep link survives both initial mount and site reset');
    assert.equal(f.state.setProductCanvasDraft, null);
    for (const field of ['setCommerceSettings', 'setRuntimeCommerce', 'setError', 'setNotice', 'setOrderAnalytics', 'setReconciliationResult']) assert.equal(f.state[field], null, field + ' clears on context reset');
  }
}
if (enabled('ancillary')) {
  for (const [name, boundary, api, resultSetter, errorSetter, loadingSetter, value] of [
    ['loadProductNotificationEvents', 'loadCommerceOrderAnalytics', 'listProductNotificationEvents', 'setProductNotificationEvents', 'setProductNotificationError', null, { events: ['B'] }],
    ['loadCommerceOrderAnalytics', 'loadSelectedProductLifecycle', 'getOrderAnalytics', 'setOrderAnalytics', 'setOrderAnalyticsError', 'setIsOrderAnalyticsLoading', { siteId: 'B' }],
    ['loadCommerceReconciliationReadiness', 'previewCommerceReconciliation', 'getCommerceReconciliationReadiness', 'setReconciliationReadiness', 'setReconciliationError', 'setIsReconciliationLoading', { siteId: 'B' }],
  ]) {
    const begin = source.indexOf('  const ' + name + ' = async');
    const finish = source.indexOf('  const ' + boundary + ' = async', begin);
    assert(begin >= 0 && finish > begin);
    const callback = source.slice(begin, finish);
    const code = transformSync(callback + '\nglobalThis.read = ' + name + ';', { loader: 'tsx' }).code;
    for (const fails of [false, true]) {
      const state = {}, scope = { current: 'A' }, mounted = { current: true }, pending = [];
      const context = site => {
        const ctx = { activeSiteId: site, productWorkspaceContext: site, productWorkspaceContextRef: scope, productWorkspaceMountedRef: mounted, canViewCommerce: true, canConfigureCommerce: true, Error };
        ctx[api] = () => { const work = deferred(); pending.push(work); return work.promise; };
        for (const setter of new Set([...callback.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) ctx[setter] = next => { state[setter] = next; };
        vm.runInNewContext(code, ctx); return ctx;
      };
      const a = context('A'), old = a.read(); scope.current = 'B';
      const b = context('B'), current = b.read();
      if (fails) pending[0].reject(new Error('Old A failed')); else pending[0].resolve({ events: ['A'], siteId: 'A' });
      await old;
      assert.equal(state[resultSetter], undefined, name + ' cannot admit departed data');
      assert.equal(state[errorSetter], undefined, name + ' cannot admit departed errors');
      if (loadingSetter) assert.equal(state[loadingSetter], true, name + ' old finally cannot finish B');
      pending[1].resolve(value); await current;
      assert.equal(JSON.stringify(state[resultSetter]), JSON.stringify(value.events || value));
      assert.equal(state[errorSetter], null);
      if (loadingSetter) assert.equal(state[loadingSetter], false);
      // Old callbacks invoked after departure must not dispatch another read.
      await a.read(); assert.equal(pending.length, 2);
    }
  }
}
if (enabled('late-inventory')) {
  const f = fixture(), a = f.render('A'); const old = a.load(); await flush();
  const b = f.render('B'); const current = b.load(); await flush();
  f.pending[1].resolve(page('B')); await current;
  f.pending[0].resolve(page('A')); await old;
  assert.equal(f.state.setProducts.map(item => item.siteId).join(','), 'B', 'Late A inventory must never replace B');
  assert.equal(f.state.setProductCollection.id, 'B-products');
}
if (enabled('busy-load')) {
  const f = fixture(), a = f.render('A'); const old = a.load(); await flush();
  const b = f.render('B', { loading: true }); const current = b.load(); await flush();
  assert.equal(f.calls.length, 2, 'Old loading state must not drop the new site request');
  f.pending[0].reject(new Error('Old A failed')); await old;
  assert.equal(f.state.setError, null, 'Old catch cannot report an error for B');
  assert.equal(f.state.setIsLoading, true, 'Old finally cannot finish B loading');
  f.pending[1].resolve(page('B')); await current;
}
if (enabled('pagination')) {
  const f = fixture(), a = f.render('A'); const old = a.more(); await flush();
  const b = f.render('B'); const current = b.load(); await flush();
  f.pending[1].resolve(page('B')); await current;
  f.pending[0].resolve(page('A', 'A-next-page')); await old;
  assert.equal(f.state.setProducts.map(item => item.siteId).join(','), 'B', 'Late foreign pagination must not append');
}
if (enabled('revocation')) {
  const f = fixture(), a = f.render('A'); const old = a.load(); await flush();
  f.render('A', { user: 'other-user', allowed: false });
  f.pending[0].resolve(page('A')); await old;
  assert.equal(f.state.setProducts.length, 0, 'User/permission transition invalidates an outstanding read before another load');
}
if (enabled('refresh')) {
  const f = fixture(), a = f.render('A'); const old = a.load(); await flush();
  const next = a.load(); await flush();
  f.pending[1].resolve(page('A', 'newer')); await next;
  f.pending[0].resolve(page('A', 'older')); await old;
  assert.equal(f.state.setProducts[0].id, 'newer', 'Latest refresh owns the same-site result');
}
if (enabled('deferred-load')) {
  const f = fixture(), busy = f.render('B', { mutating: true }); await busy.load();
  assert.equal(f.calls.length, 0);
  assert.equal(f.deferredLoad.current, true, 'Mutation defers the new site read instead of discarding it');
  const idle = f.render('B'); vm.runInNewContext(transformSync(replayCode, { loader: 'tsx' }).code, idle); await flush();
  assert.equal(f.calls.length, 1, 'Actual replay effect starts the deferred read after mutation completion');
  f.pending[0].resolve(page('B')); await flush();
  assert.equal(f.state.setProducts[0].siteId, 'B');
}
if (enabled('save')) {
  const saveStart = source.indexOf('  const saveProduct = async');
  const saveEnd = source.indexOf('  const providerSyncLabel =', saveStart);
  assert(saveStart >= 0 && saveEnd > saveStart);
  const saveSource = source.slice(saveStart, saveEnd);
  const saveCode = transformSync(saveSource + '\nglobalThis.save = saveProduct;', { loader: 'tsx' }).code;
  const version = 'record-v1:' + 'a'.repeat(64), nextVersion = 'record-v1:' + 'b'.repeat(64);
  const state = { setProducts: [] }, writes = [];
  let pendingWrite, persistedVersion = version;
  function editor(snapshot = { ...row('A', 'item'), version }) {
    const scope = 'A:owner', context = {
      productCollection: { id: 'products' }, isProductsBusy: false, canEditProducts: true,
      productIdentityMissing: false, scheduledProductDateError: null,
      activeSiteId: 'A', selectedProduct: snapshot, selectedProductId: 'item',
      productWorkspaceContext: scope, productWorkspaceContextRef: { current: scope }, productSelectionRef: { current: 'item' },
      productWorkspaceMountedRef: { current: true },
      formState: new Proxy({ price: '32', title: 'Edited product', slug: 'edited', sku: 'fixture', currency: 'USD', status: 'draft' }, { get: (value, key) => value[key] ?? '' }),
      productVariants: [], galleryImageUrls: [], productCanvasDraft: { design: { geometry: 'retained' } },
      slugify: value => value, normalizeCurrency: value => value, productFieldKey: value => value, parseTags: () => [],
      getPersistedFrontendProductValues: () => ({ frontendDesignExtension: { keep: true } }), getPersistedProductProviderValues: () => ({}),
      normalizeProductRecord: value => value, updateProductsRouteSearch: () => {}, Error,
      updateCollectionRecord: async (_site, _collection, _id, input) => {
        writes.push(input);
        // Backend conflict behavior has a separate actual repository gate. Here
        // it verifies the route supplies its author's token and handles rejection.
        if (input.expectedVersion && input.expectedVersion !== persistedVersion) throw new Error('Synthetic stale author conflict');
        pendingWrite = deferred(); return pendingWrite.promise;
      },
    };
    for (const name of new Set([...saveSource.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) context[name] = value => { state[name] = typeof value === 'function' ? value(state[name]) : value; };
    vm.runInNewContext(saveCode, context);
    return context;
  }
  const first = editor(), second = editor();
  const saving = first.save();
  assert.equal(writes[0].expectedVersion, version, 'Product save sends its loaded author version');
  assert.equal(writes[0].values.price, 32);assert.equal(writes[0].values.design.geometry, 'retained');
  persistedVersion = nextVersion; pendingWrite.resolve({ ...row('A', 'item'), version: nextVersion, values: writes[0].values }); await saving;
  await assert.rejects(second.save(), /stale author conflict/);
  assert.equal(writes[1].expectedVersion, version, 'Second old author cannot silently adopt the newest version');
  const legacy = editor({ ...row('A', 'item') }); const legacySave = legacy.save();
  assert.equal(writes[2].expectedUpdatedAt, '2026-01-01T00:00:00Z', 'Legacy responses retain timestamp conflict protection');
  pendingWrite.resolve({ ...row('A', 'item') }); await legacySave;
  const switched = editor(); persistedVersion = version; const staleSave = switched.save();
  switched.productSelectionRef.current = 'other-product'; state.setProducts = []; state.setNotice = null;
  pendingWrite.resolve({ ...row('A', 'item') }); await staleSave;
  assert.equal(state.setProducts.length, 0, 'Old selection save completion cannot replace the current editor/list');
  assert.equal(state.setNotice, null);
  const foreign = editor(); const foreignSave = foreign.save();
  foreign.productWorkspaceContextRef.current = 'B:other-user'; state.setError = null;
  pendingWrite.reject(new Error('Old site save failed')); await assert.rejects(foreignSave, /Old site save failed/);
  assert.equal(state.setError, null, 'Old site/user error cannot appear in the new workspace');
  const departed = editor(); const departedSave = departed.save();
  departed.productWorkspaceMountedRef.current = false; state.setNotice = null;
  pendingWrite.resolve({ ...row('A', 'item') }); await departedSave;
  assert.equal(state.setNotice, null, 'Unmounted save completion cannot announce success or navigate');
}
console.log('Products actual callbacks PASS: scoped/latest inventory and pagination, stale errors/finalizers, user revocation, mutation-deferred replay; author version/fallback and departed save completion isolation. Backend conflict/browser behavior remain separate.');
