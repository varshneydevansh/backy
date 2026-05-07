#!/usr/bin/env node

import { createBackyClient } from '../dist/index.js';

const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const configuredIdentifier = process.env.BACKY_SDK_SITE_IDENTIFIER || '';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const client = createBackyClient({
  baseUrl,
  requestIdFactory: () => 'sdk-smoke-request',
});

let identifier = configuredIdentifier;
if (!identifier) {
  const sites = await client.sites();
  const firstSite = sites.data.sites.find((candidate) => candidate.isPublished !== false);
  assert(firstSite?.slug || firstSite?.id, 'sites() did not return a published site to smoke');
  identifier = String(firstSite.slug || firstSite.id);
}

const site = await client.discoverSite(identifier);
assert(site.data.site?.id, 'discoverSite() did not return a site id');

const manifest = await client.manifest();
assert(manifest.data.capabilities?.renderPayload === true, 'manifest() missing render payload capability');
assert(typeof manifest.data.endpoints?.render === 'string', 'manifest() missing render endpoint');

const openapi = await client.openapi();
assert(openapi.openapi === '3.1.0', 'openapi() did not return an OpenAPI 3.1 document');
assert(openapi.paths?.[manifest.data.endpoints.openapi]?.get, 'openapi() missing manifest-advertised OpenAPI path');

const resolved = await client.resolve('/');
assert(resolved.data.route, 'resolve() did not return a route');

const rendered = await client.render('/');
assert(rendered.data, 'render() did not return a payload envelope');

const navigation = await client.navigation();
assert(navigation.data.navigation, 'navigation() missing navigation data');

const media = await client.media({ limit: 5 });
assert(media.data.media || media.data.pagination, 'media() missing media list data');

const forms = await client.forms();
assert(Array.isArray(forms.data.forms), 'forms() missing forms array');

const comments = await client.siteComments({ limit: 5 });
assert(Array.isArray(comments.data.comments), 'siteComments() missing comments array');

const events = await client.events({ limit: 5 });
assert(Array.isArray(events.data.events), 'events() missing events array');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  siteId: client.getSiteId(),
  identifier,
  checked: [
    'discoverSite',
    'sites',
    'manifest',
    'openapi',
    'resolve',
    'render',
    'navigation',
    'media',
    'forms',
    'siteComments',
    'events',
  ],
}, null, 2));
