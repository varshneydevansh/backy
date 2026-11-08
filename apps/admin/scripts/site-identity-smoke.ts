import assert from 'node:assert/strict';
import { getSiteSelectionFromSearch, getSiteSwitchTarget, siteMatchesIdentifier } from '../src/lib/siteSelection';
import type { Site } from '../src/stores/mockStore';
const sites: Site[] = [
  { id: 'site-one', publicSiteId: 'site-one', name: 'First', slug: 'first', customDomain: null, description: '', status: 'published', pageCount: 0, lastUpdated: '' },
  { id: 'site-two', publicSiteId: 'site-two', name: 'Second', slug: 'second', customDomain: 'second.example', description: '', status: 'draft', pageCount: 0, lastUpdated: '' },
];
const route = (pathname: string, search: string) => Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { pathname, search } } });
route('/sites/site-two', '?siteId=site-one');
assert.equal(getSiteSelectionFromSearch(sites), 'site-two', 'site-detail identity must win over stale query');
route('/sites/second', ''); assert.equal(getSiteSelectionFromSearch(sites), 'site-two');
route('/pages', '?siteId=second.example'); assert.equal(getSiteSelectionFromSearch(sites), 'site-two');
route('/pages', '?siteId=not-authorized');
assert.equal(getSiteSelectionFromSearch(sites), 'not-authorized');
assert.equal(sites.find(site => siteMatchesIdentifier(site, getSiteSelectionFromSearch(sites))), undefined, 'unknown site must not become the first available website');
route('/sites/new', '?siteId=site-two'); assert.equal(getSiteSelectionFromSearch(sites), 'site-two');
route('/sites/%E0%A4%A', '?siteId=site-two'); assert.equal(getSiteSelectionFromSearch(sites), 'site-two');
route('/', ''); assert.equal(getSiteSelectionFromSearch(sites), 'site-one');
assert.deepEqual(getSiteSwitchTarget({ pathname: '/sites/site-one', requestedSiteId: 'second', sites }), { type: 'siteDetail', siteId: 'site-two' });
console.log('Site identity passed: canonical IDs/aliases, path precedence, unknown-site isolation and switching.');
