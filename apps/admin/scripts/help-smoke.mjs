#!/usr/bin/env node

import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const helpSource = read('../src/routes/help.tsx');
const sidebarModelSource = read('../src/components/layout/sidebarModel.ts');
const headerModelSource = read('../src/components/layout/headerModel.ts');
const headerSource = read('../src/components/layout/Header.tsx');
const routeTreeSource = read('../src/routeTree.gen.ts');
const newsletterSmokeSource = read('newsletter-smoke.mjs');

const requiredTopicIds = [
  'switch-sites',
  'subdomains',
  'canvas-basics',
  'canvas-zoom-selection',
  'navigation-shared-chrome',
  'apiable-elements',
  'custom-frontend-agent-start',
  'frontend-design-state',
  'newsletter-subscribers',
  'newsletter-mail-boundary',
  'provider-certification-partials',
];

assert(
  requiredTopicIds.every((topicId) => helpSource.includes(`id: '${topicId}'`)),
  `Help route is missing required topics: ${requiredTopicIds.filter((topicId) => !helpSource.includes(`id: '${topicId}'`)).join(', ')}`,
);

assert(
  helpSource.includes('GET /api/sites/:siteId/agent-handoff') &&
    helpSource.includes('GET /api/sites/:siteId/manifest') &&
    helpSource.includes('GET /api/sites/:siteId/openapi') &&
    helpSource.includes('GET /api/sites/:siteId/render?path=/...') &&
    helpSource.includes('GET /api/sites/:siteId/resolve?path=/...') &&
    helpSource.includes('specs/custom-frontend-agent-handoff.md') &&
    helpSource.includes('backy.canvas-component-api-contract.v1') &&
    helpSource.includes('starterValueForSite(item.value, activeSiteId)') &&
    helpSource.includes('buildAgentCopyBrief(activeSiteId)') &&
    helpSource.includes('navigator.clipboard?.writeText(text)') &&
    helpSource.includes('data-testid="help-copy-agent-brief"') &&
    helpSource.includes('data-testid={`help-copy-agent-starter-${item.id}`}') &&
    helpSource.includes('data-target-site-id={activeSiteId}') &&
    helpSource.includes('data-testid="help-agent-starter-grid"') &&
    helpSource.includes('data-testid="help-agent-human-guide"'),
  'Help route must expose canonical custom frontend agent endpoints, schema, copy controls, site-scoped values, and human guide.',
);

assert(
  helpSource.includes('SITE_SCOPED_HELP_ROUTES') &&
    helpSource.includes('search={getTopicRouteSearch(topic.route)}') &&
    helpSource.includes('const routeSearch = Route.useSearch()') &&
    helpSource.includes("const activeSiteId = routeSearch.siteId || 'site-demo'"),
  'Help route links and copyable endpoint values must preserve the active site context.',
);

assert(
  helpSource.includes('Canvas zoom should change the work surface, not the whole browser page.') &&
    helpSource.includes('marquee selection should start from the pointer position') &&
    helpSource.includes('Navigation is not one opaque text block') &&
    helpSource.includes('Root sections, headers, footers, and nav bars participate in root-section flow'),
  'Help route must document critical Wix-like canvas controls, selection behavior, navigation child links, and shared chrome flow.',
);

assert(
  helpSource.includes('Actual mailbox hosting, bulk outbound sending, bounces, complaints, provider unsubscribe enforcement, SPF/DKIM/DMARC') &&
    helpSource.includes('subscriptionStatus for audience state and newsletterStatus for provider lifecycle states') &&
    newsletterSmokeSource.includes('Help must explain the report-to-newsletter issue workflow and delivery-provider boundary.'),
  'Help route must document the newsletter management and mail-provider boundary.',
);

assert(
  helpSource.includes('The remaining Partial rows are live provider certification evidence') &&
    helpSource.includes('Settings, Settings admin APIs, Products, and Orders as Partial') &&
    helpSource.includes('no raw secrets') &&
    helpSource.includes('release-doctor acceptance'),
  'Help route must explain the current four Partial provider-certification rows without implying missing local editor/API models.',
);

assert(
  sidebarModelSource.includes("{ id: 'help', label: 'Help', to: '/help'") &&
    sidebarModelSource.includes("'/help'") &&
    headerModelSource.includes("'/help': 'help'") &&
    headerModelSource.includes("if (path.startsWith('/help')) return 'Help';") &&
    headerSource.includes("{ id: 'tool:help'") &&
    routeTreeSource.includes("path: '/help'"),
  'Help route must remain wired into sidebar, header search, header title, and generated route tree.',
);

console.log(JSON.stringify({
  ok: true,
  guard: 'help-source',
  requiredTopics: requiredTopicIds.length,
}));
