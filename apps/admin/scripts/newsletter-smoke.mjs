#!/usr/bin/env node

import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const routeSource = read('../src/routes/newsletter.tsx');
const adminContentApiSource = read('../src/lib/adminContentApi.ts');
const sidebarSource = read('../src/components/layout/sidebarModel.ts');
const headerModelSource = read('../src/components/layout/headerModel.ts');
const headerSource = read('../src/components/layout/Header.tsx');
const helpSource = read('../src/routes/help.tsx');
const routeTreeSource = read('../src/routeTree.gen.ts');

assert(routeSource.includes("createFileRoute('/newsletter')"), 'Newsletter route must be registered at /newsletter.');
assert(routeSource.includes("const NEWSLETTER_SCHEMA_VERSION = 'backy.newsletter-management-handoff.v1';"), 'Newsletter route must expose a versioned handoff schema.');
assert(routeSource.includes("const NEWSLETTER_SYNC_POLICY_VERSION = 'backy.newsletter-sync-boundary.v1';"), 'Newsletter route must document the email-provider boundary.');
assert(routeSource.includes('createForm('), 'Newsletter route must create a native Backy signup form.');
assert(routeSource.includes('listFormContacts('), 'Newsletter route must read subscriber records from Contacts APIs.');
assert(routeSource.includes('updateContact('), 'Newsletter route must manage subscriber lifecycle status.');
assert(routeSource.includes('buildNewsletterLifecycleUpdate('), 'Newsletter route must map admin lifecycle actions to explicit newsletter subscription fields.');
assert(routeSource.includes("newsletterSubscriptionStatus: 'unsubscribed'"), 'Newsletter archive action must mark the subscriber as unsubscribed.');
assert(routeSource.includes("newsletterSubscriptionStatus: 'subscribed'"), 'Newsletter reactivate/ready actions must mark the subscriber as subscribed.');
assert(routeSource.includes('newsletterUnsubscribedAt: now'), 'Newsletter unsubscribe lifecycle must persist an unsubscribe timestamp.');
assert(routeSource.includes('newsletterSubscribedAt: contact.newsletterSubscribedAt || now'), 'Newsletter subscribe lifecycle must preserve or create a subscribe timestamp.');
assert(routeSource.includes('buildNewsletterLifecycleSourceValues('), 'Newsletter lifecycle actions must keep sourceValues newsletter metadata in sync.');
assert(routeSource.includes('subscriptionStatus: status'), 'Newsletter sourceValues must expose machine-readable subscriptionStatus.');
assert(routeSource.includes("contact.status === 'qualified' || !isSubscriberSubscribed(contact)"), 'Newsletter ready action must not target unsubscribed subscribers.');
assert(routeSource.includes("settings: {\n    backyIntent: 'newsletter'"), 'Created newsletter forms must carry a machine-readable newsletter intent.');
assert(routeSource.includes("fields: [\n    { key: 'email'"), 'Created newsletter forms must include an email field.');
assert(routeSource.includes("key: 'topics'"), 'Created newsletter forms must include topic preference capture.');
assert(routeSource.includes("key: 'consent'"), 'Created newsletter forms must include consent capture.');
assert(routeSource.includes("key: 'signup_source'"), 'Created newsletter forms must include signup source capture.');
assert(routeSource.includes('providerBoundary') && routeSource.includes('external-delivery-required'), 'Newsletter handoff must keep outbound delivery behind an external-provider boundary.');
assert(routeSource.includes('mailbox delivery') && routeSource.includes('SPF/DKIM/DMARC'), 'Newsletter delivery boundary must name deliverability responsibilities.');
assert(routeSource.includes('data-testid="newsletter-command-center"'), 'Newsletter page must expose a command-center test hook.');
assert(routeSource.includes('data-testid="newsletter-subscriber-list"'), 'Newsletter page must expose a subscriber-list test hook.');
assert(routeSource.includes('data-testid="newsletter-api-handoff"'), 'Newsletter page must expose an API-handoff test hook.');
assert(routeSource.includes('data-testid="newsletter-copy-handoff"'), 'Newsletter page must expose a copy-handoff action.');
assert(routeSource.includes('data-testid="newsletter-export-csv"'), 'Newsletter page must expose a subscriber CSV export action.');
assert(routeSource.includes("navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'newsletter', templateSource: 'backy-canvas', focus: 'canvas' } })"), 'Newsletter page creation must land in focused Backy canvas mode.');
assert(routeSource.includes("navigate({ to: '/blog/new', search: { siteId: activeSiteId, templateSource: 'backy-canvas', focus: 'canvas' } })"), 'Newsletter writing workflow must open focused blog canvas mode.');
assert(routeSource.includes('overflow-x-auto') && routeSource.includes('min-w-[900px]'), 'Newsletter subscriber table must avoid admin-table text overlap on narrow screens.');

assert(sidebarSource.includes("{ id: 'newsletter', label: 'Newsletter', to: '/newsletter'"), 'Sidebar must expose Newsletter in the Audience section.');
assert(sidebarSource.includes("'/newsletter'"), 'Sidebar site-scoped routes must preserve siteId on Newsletter navigation.');
assert(headerModelSource.includes("| '/newsletter'"), 'Header static route types must include Newsletter.');
assert(headerModelSource.includes("'/newsletter': 'contacts'"), 'Newsletter header access must use contact permissions.');
assert(headerModelSource.includes("if (path.startsWith('/newsletter')) return 'Newsletter';"), 'Header title must identify Newsletter routes.');
assert(headerSource.includes("if (to === '/newsletter')"), 'Header search/tool navigation must preserve site scope for Newsletter.');
assert(headerSource.includes("title: 'Newsletter'") && headerSource.includes("to: '/newsletter'"), 'Global search must include the Newsletter tool.');
assert(helpSource.includes("route: '/newsletter'") && helpSource.includes('Open Newsletter'), 'Help must point newsletter guidance to the dedicated Newsletter workspace.');
assert(routeTreeSource.includes("Route as NewsletterRouteImport") && routeTreeSource.includes("'/newsletter': typeof NewsletterRoute"), 'Generated route tree must include /newsletter.');
assert(adminContentApiSource.includes('newsletterSubscriptionStatus?: AdminContact') && adminContentApiSource.includes('newsletterUnsubscribedAt?: string | null'), 'Admin content API contact updates must accept newsletter subscription lifecycle fields.');

console.log('Newsletter source smoke passed.');
