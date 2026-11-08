import assert from 'node:assert/strict';
import { buildSync, transformSync } from 'esbuild';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { load } from '../../public/scripts/collection-import-postgres-handlers.mjs';

// Execute real card callbacks and their transitive pure helpers. Auth/provider
// callbacks are fixtures; local POST validation, trusted seeding and persistence are real.
function helperClosure(source: string, roots: string[]) {
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const definitions = new Map<string, ts.Node>();
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) definitions.set(declaration.name.text, statement);
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) definitions.set(statement.name.text, statement);
  }
  const selected = new Set<ts.Node>();
  const visitName = (name: string) => {
    const node = definitions.get(name);
    if (!node || selected.has(node)) return;
    selected.add(node);
    const visit = (child: ts.Node) => {
      if (ts.isIdentifier(child)) visitName(child.text);
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  roots.forEach(visitName);
  roots.forEach(name => assert(definitions.has(name), `Actual helper missing: ${name}`));
  return [...selected].sort((a, b) => a.pos - b.pos).map(node => node.getText(ast)).join('\n');
}

const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'backy-definition-card-intent-'));
let assertions = 0;
const same = (actual: unknown, expected: unknown, message?: string) => { assert.deepEqual(actual, expected, message); assertions++; };
try {
  process.chdir(scratch);
  const imported: any = await import('../../public/src/lib/backyStore.ts');
  const store = imported.default || imported;
  const site = store.createAdminSite({ name: 'Definition card fixture', slug: 'definition-card-fixture' });
  const mocks: any = {
    'next/server': { NextRequest, NextResponse }, '@/lib/backyStore': store,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => true },
    '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'synthetic-owner' } } }) },
    '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionSlugAccess: async () => null },
    '@/lib/adminAudit': { recordAdminAudit: async () => ({}) },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] },
  };
  for (const [key, value] of Object.entries({ ...mocks })) if (key.startsWith('@/lib/')) mocks['./' + key.slice('@/lib/'.length)] = value;
  const contract: any = load('../src/lib/frontendDesignContract.ts', mocks);
  const provenance: any = load('../src/lib/templateInstanceProvenance.ts', mocks);
  const templates = ['form', 'collection', 'section'].flatMap(type => ['first', 'selected'].map((suffix, index) => ({
    id: `${type}-${suffix}`, name: `${type} ${suffix}`, type, version: '1.0.0',
    content: {
      fields: [{ id: 'registered-field', key: 'registered_field', type: 'text', label: 'Registered field', required: true }],
      elements: [{ id: `${type}-${suffix}-hero`, type: 'section', width: 900 + index,
        responsive: { mobile: { width: 280 } }, props: { extension: [false, 0, null] } }],
      canvasSize: { width: 1200, height: 800 }, metadata: { extension: { retained: [false, 0, null] }, serverSeedMarker: `${type}-${suffix}`, frontendDesignUnrecognized: { retained: [false, 0, null] } },
      settings: { serverSeedMarker: `${type}-${suffix}`, ownerUnknown: [false, 0, null], frontendDesignUnrecognized: { retained: [false, 0, null] } },
    },
  })));
  const frontendDesign = contract.normalizeFrontendDesignContract({ status: 'captured', source: { type: 'manual' }, templates });
  store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: provenance.templateInstanceFingerprint(site.settings.frontendDesign ?? null), frontendDesign, source: 'fixture' });
  const routes: any = {
    form: load('../src/app/api/admin/sites/[siteId]/forms/route.ts', mocks),
    collection: load('../src/app/api/admin/sites/[siteId]/collections/route.ts', mocks),
    section: load('../src/app/api/admin/sites/[siteId]/reusable-sections/route.ts', mocks),
  };
  const requests: any[] = [], responses: any[] = [];
  const module = { exports: {} as any };
  const output = buildSync({ entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
  vm.runInNewContext(output, { module, exports: module.exports, console, URL, Headers, Request, Response,
    fetch: async (url: string, init: RequestInit) => {
      const type = url.endsWith('/forms') ? 'form' : url.endsWith('/reusable-sections') ? 'section' : 'collection';
      requests.push({ type, body: JSON.parse(String(init.body)) });
      const response = await routes[type].POST(new NextRequest(new URL(url, 'http://fixture.invalid'), init), { params: Promise.resolve({ siteId: site.id }) });
      responses.push({ status: response.status, payload: await response.clone().json() });
      return response;
    },
  });
  let clock = 1000;
  const kinds = process.env.BACKY_DEFINITION_KIND ? [process.env.BACKY_DEFINITION_KIND] : ['form', 'collection', 'section'];
  assert(kinds.every(kind => ['form', 'collection', 'section'].includes(kind)));
  for (const type of kinds) {
    const source = readFileSync(process.env[type === 'form' ? 'BACKY_FORMS_SOURCE_FILE' : type === 'section' ? 'BACKY_SECTIONS_SOURCE_FILE' : 'BACKY_COLLECTIONS_SOURCE_FILE'] || new URL(`../src/routes/${type === 'form' ? 'forms' : type === 'section' ? 'reusable-sections' : 'collections'}.tsx`, import.meta.url), 'utf8');
    const name = type === 'form' ? 'createFormFromFrontendTemplate' : type === 'section' ? 'createFromFrontendTemplate' : 'createCollectionFromFrontendTemplate';
    const begin = source.indexOf(`  const ${name} = async`);
    const end = source.indexOf(type === 'form' ? '  const createBlankStandaloneForm = async' : type === 'section' ? '  const requestDeleteSection =' : '  const selectCollection =', begin);
    assert(begin >= 0 && end > begin, `Actual ${type} card callback not found`);
    const callback = source.slice(begin, end);
    const helpers = helperClosure(source, type === 'form'
      ? ['normalizeFieldKey', 'buildFrontendFormTemplateSettings']
      : type === 'section' ? ['buildFrontendSectionTemplateMetadata']
      : ['collectionMetadataWithDynamicTemplates', 'buildFrontendCollectionTemplateMetadata', 'defaultDynamicTemplates', 'cloneTemplateFields', 'collectionMetadataWithSlugPolicy', 'defaultSlugPolicy']);
    for (const negative of [false, true]) {
      const state: any = { setForms: [], setCollections: [], setSections: [], setInboxByForm: {}, setDeliveryEventsByForm: {} };
      const context: any = {
        activeSiteId: site.id, frontendDesign, isFormMutationBusy: false, canCreateForms: true, canUseCollectionTargets: true,
        schemaMutationDisabled: false, canEditCollections: true, createForm: module.exports.createForm, createCollection: module.exports.createCollection,
        Date: { now: () => ++clock }, navigate: () => {}, buildFormCanvasNoticeAction: () => null,
        selectCollection: (record: any) => { state.selectedCollection = record; },
        isBusy: false, canEditSections: true, createReusableSection: module.exports.createReusableSection,
        setFormFromSection: () => {}, updateRouteSearch: () => {}, isAdminPermissionDeniedError: () => false,
        showPermissionDenied: () => { throw Error('Unexpected permission denial'); },
        showApiError: (error: Error) => { state.setError = error.message; }, Error, JSON,
      };
      for (const setter of new Set([...callback.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) {
        context[setter] = (value: any) => { state[setter] = typeof value === 'function' ? value(state[setter]) : value; };
      }
      const mutated = negative ? callback.replace(/^\s*frontendDesignTemplateId: template\.id,\s*$/m, '') : callback;
      if (negative) assert.notEqual(mutated, callback, `Negative control must remove only the ${type} intent`);
      vm.runInNewContext(transformSync(helpers + mutated + `\nglobalThis.create = ${name};`, { loader: 'tsx' }).code, context);
      for (const selected of frontendDesign.templates.filter((template: any) => template.type === type)) {
        const fields = [{ id: 'owner-field', key: 'owner_field', type: 'text', label: 'Owner field', required: true }];
        const blueprint = type === 'form'
          ? { title: 'Owner title', description: 'Owner description', audience: 'public', fields, moderationMode: 'manual', successMessage: 'Received', pageTemplate: 'contact', frontendFieldKeyMap: { original: 'owner_field' } }
          : type === 'section' ? { name: 'Owner section', slug: selected.id + (negative ? '-negative' : ''), status: 'active', category: 'hero', tags: ['fixture'], content: structuredClone(selected.content) }
          : { name: 'Owner collection', slug: selected.id + (negative ? '-negative' : ''), fields, status: 'draft', permissions: { publicRead: true, publicCreate: false, publicUpdate: false, publicDelete: false } };
        await context.create(selected, blueprint);
        same(state.setError, null, JSON.stringify(responses.at(-1) || { request: requests.at(-1) }));
        same(responses.at(-1).status, 201);
        const request = requests.at(-1).body;
        const record = type === 'form' ? store.getFormById(site.id, state.setSelectedFormId) : type === 'section' ? store.getReusableSectionByIdOrSlug(site.id, state.setSelectedSectionId, { status: 'all' }) : store.getCollectionByIdOrSlug(site.id, state.selectedCollection.id, { includeUnpublished: true });
        const metadata = type === 'form' ? record.settings : record.metadata;
        if (negative) {
          same(request.frontendDesignTemplateId, undefined);
          if (type === 'section') same(metadata.frontendTemplateInstance, undefined, 'Missing section intent must not invent a baseline');
          else same(metadata.serverSeedMarker, undefined, 'Missing card intent must miss the trusted server seed');
          assertions++;
          assert.throws(() => assert.equal(request.frontendDesignTemplateId, selected.id), /AssertionError/, 'Normal intent assertion must reject the one-line negative control');
          continue;
        }
        same(request.frontendDesignTemplateId, selected.id, 'Real card serializer must select the exact registered template');
        if (type === 'section') {
          same(metadata.frontendDesignTemplateId, selected.id);
          same(provenance.isValidSectionTemplateInstancePin(metadata.frontendTemplateInstance), true);
          same(metadata.frontendTemplateInstance.templateFingerprint, provenance.templateInstanceFingerprint(selected));
          same(metadata.frontendTemplateInstance.templateVersion, '1.0.0');
          same(metadata.frontendTemplateInstance.instanceType, 'section');
          same(record.content.elements[0].id, selected.content.elements[0].id);
          same(record.content.elements[0].responsive.mobile.width, 280);
          same(record.content.elements[0].props.extension, [false, 0, null]);
          same(record.content.metadata.extension.retained, [false, 0, null]);
          same(metadata.frontendDesignMetadata.frontendDesignUnrecognized, { retained: [false, 0, null] });
          same(record.status, 'active'); same(record.category, 'hero'); same(record.tags, ['fixture']);
          same(metadata.reusableSection.history.length, 0);
          continue;
        }
        same(metadata.serverSeedMarker, selected.id, 'Server-only seed marker proves trusted selection');
        same(metadata.frontendDesignTemplateId, selected.id);
        same(record.fields.map((field: any) => field.key), ['owner_field'], 'Caller form/schema fields remain current');
        same(record.fields[0].required, true);
        same(metadata.frontendDesignElements[0].id, selected.content.elements[0].id);
        same(metadata.frontendDesignElements[0].responsive.mobile.width, 280);
        same(metadata.frontendDesignElements[0].props.extension, [false, 0, null]);
        same(metadata.frontendDesignMetadata.extension.retained, [false, 0, null]);
        same(metadata.frontendDesignUnrecognized, { retained: [false, 0, null] });
        if (type === 'form') {
          same(record.title, blueprint.title); same(record.moderationMode, 'manual');
          same(metadata.ownerUnknown, [false, 0, null]); same(metadata.frontendFieldKeyMap, { original: 'owner_field' });
        } else {
          same(record.status, 'draft'); same(record.permissions.publicCreate, false);
          same(metadata.extension.retained, [false, 0, null]); same(metadata.slugPolicy.sourceField, 'owner_field');
        }
      }
    }
  }
  same(requests.length, kinds.length * 4);
  console.log(`Definition ${kinds.join('/')} cards + actual client serializer + trusted POST handlers passed ${assertions} assertions: two eligible templates per type, exact selection, declared current fields, mobile/false/0/unknown aliases, durable reopen, section baseline and one-line negative controls. Synthetic auth/followups; no form pin/native SQL/browser/provider claim.`);
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }
