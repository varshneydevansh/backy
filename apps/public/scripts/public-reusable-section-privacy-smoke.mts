import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';

const site = { id: 'section-public-site', slug: 'section-public', isPublished: true };
const section = {
  id: 'section-public', siteId: site.id, slug: 'current-section', status: 'active',
  name: 'Current design', createdBy: 'private-creator', updatedBy: 'private-editor',
  content: { elements: [{ id: 'root', type: 'section', children: [{ id: 'child', type: 'heading', x: 44, responsive: { mobile: { width: 280 } }, props: { content: 'Public current content' } }] }], metadata: { retained: [false, 0, null] } },
  metadata: {
    frontendDesignTemplateId: 'registered-section', extension: { retained: [false, 0, null] },
    frontendTemplateInstance: { baseContent: { private: 'private-baseline' } },
    reusableSection: { version: 4, library: { summary: 'Public library summary' },
      requestId: 'private-request', updatedBy: 'private-actor',
      history: [{ content: { private: 'private-historical-content' }, templateProvenance: { private: 'private-old-pin' } }] },
  },
};
const original = JSON.stringify(section);
let checks = 0;
const frontendDesign = { frontendDesignProvenanceFromMetadata: (metadata: any) => ({ templateId: metadata.frontendDesignTemplateId }) };
const projection = load('../src/lib/publicReusableSection.ts', { './frontendDesignContract': frontendDesign });
for (const demo of [false, true]) {
  const scopedSite = (id: string) => id === site.id || id === site.slug ? site : null;
  const scopedSection = (siteId: string, id: string) => siteId === site.id && [section.id, section.slug].includes(id) ? section : null;
  const mocks = {
    '@/lib/frontendDesignContract': frontendDesign,
    '@/lib/publicReusableSection': projection,
    '@/lib/publicContractResponse': load('../src/lib/publicContractResponse.ts'),
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => ({
      sites: { getById: async (id: string) => scopedSite(id), getBySlug: async (id: string) => scopedSite(id) },
      reusableSections: { getById: async (s: string, id: string) => scopedSection(s, id), getBySlug: async (s: string, id: string) => scopedSection(s, id), list: async () => ({ items: [section], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } }) },
      cacheInvalidations: { latestRevision: async () => 'current-revision' },
    }) },
    '@/lib/backyStore': { getSiteByIdOrSlug: scopedSite, getReusableSectionByIdOrSlug: scopedSection, listReusableSections: () => [section] },
  };
  const list = load('../src/app/api/sites/[siteId]/reusable-sections/route.ts', mocks);
  const detail = load('../src/app/api/sites/[siteId]/reusable-sections/[sectionId]/route.ts', mocks);
  for (const [route, sectionId] of [[list, undefined], [detail, section.id], [detail, section.slug]] as const) {
    const response = await route.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/reusable-sections/${sectionId || ''}`), { params: Promise.resolve({ siteId: site.slug, sectionId }) });
    assert.equal(response.status, 200); checks++;
    const body = await response.json(), value = sectionId ? body.data.section : body.data.sections[0];
    assert.equal(JSON.stringify(body).includes('private-'), false, 'Public list/detail and legacy aliases must exclude retained snapshots, baseline and internal actors'); checks++;
    assert.deepEqual(value.content, section.content); checks++;
    assert.deepEqual(value.metadata.extension, section.metadata.extension); checks++;
    assert.equal(value.metadata.reusableSection.version, 4); checks++;
    assert.deepEqual(value.metadata.reusableSection.library, section.metadata.reusableSection.library); checks++;
    assert.equal(value.frontendDesign.templateId, 'registered-section'); checks++;
    assert.equal(JSON.stringify(section), original, 'Public projection must not mutate authenticated history'); checks++;
  }
  for (const [siteId, sectionId] of [['foreign-site', section.id], [site.id, 'missing-section']]) {
    const response = await detail.GET(new NextRequest('http://fixture.invalid/'), { params: Promise.resolve({ siteId, sectionId }) });
    assert.equal(response.status, 404); checks++;
  }
}
console.log(`Public reusable section privacy passed: ${checks}`);
