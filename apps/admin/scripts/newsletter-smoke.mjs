#!/usr/bin/env node

import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const routeSource = read('../src/routes/newsletter.tsx');
const pagesNewSource = read('../src/routes/pages.new.tsx');
const adminContentApiSource = read('../src/lib/adminContentApi.ts');
const sidebarSource = read('../src/components/layout/sidebarModel.ts');
const headerModelSource = read('../src/components/layout/headerModel.ts');
const headerSource = read('../src/components/layout/Header.tsx');
const helpSource = read('../src/routes/help.tsx');
const routeTreeSource = read('../src/routeTree.gen.ts');
const publicNewsletterSubscribersRouteSource = read('../../public/src/app/api/sites/[siteId]/newsletter/subscribers/route.ts');
const adminNewsletterSubscribersRouteSource = read('../../public/src/app/api/admin/sites/[siteId]/newsletter/subscribers/route.ts');

assert(routeSource.includes("createFileRoute('/newsletter')"), 'Newsletter route must be registered at /newsletter.');
assert(routeSource.includes("const NEWSLETTER_SCHEMA_VERSION = 'backy.newsletter-management-handoff.v1';"), 'Newsletter route must expose a versioned handoff schema.');
assert(routeSource.includes("const NEWSLETTER_SYNC_POLICY_VERSION = 'backy.newsletter-sync-boundary.v1';"), 'Newsletter route must document the email-provider boundary.');
assert(routeSource.includes("const NEWSLETTER_ISSUE_SCHEMA_VERSION = 'backy.newsletter-issue-handoff.v1';"), 'Newsletter route must expose a versioned issue handoff schema.');
assert(routeSource.includes("import { CUSTOM_FRONTEND_AGENT_HANDOFF_DOC, CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA } from '@backy-cms/core';"), 'Newsletter route must reuse the canonical custom frontend agent handoff constants.');
assert(routeSource.includes('createForm('), 'Newsletter route must create a native Backy signup form.');
assert(routeSource.includes('listFormContacts('), 'Newsletter route must read subscriber records from Contacts APIs.');
assert(routeSource.includes('listBlogPosts(activeSiteId, { status: \'published\' })'), 'Newsletter route must read published posts for issue handoff drafts.');
assert(routeSource.includes('saveNewsletterSubscriber('), 'Newsletter route must support manual subscriber add/update through the private newsletter API.');
assert(routeSource.includes('updateContact('), 'Newsletter route must manage subscriber lifecycle status.');
assert(routeSource.includes('buildNewsletterLifecycleUpdate('), 'Newsletter route must map admin lifecycle actions to explicit newsletter subscription fields.');
assert(routeSource.includes("newsletterSubscriptionStatus: 'unsubscribed'"), 'Newsletter archive action must mark the subscriber as unsubscribed.');
assert(routeSource.includes("newsletterSubscriptionStatus: 'subscribed'"), 'Newsletter reactivate/ready actions must mark the subscriber as subscribed.');
assert(routeSource.includes('newsletterUnsubscribedAt: now'), 'Newsletter unsubscribe lifecycle must persist an unsubscribe timestamp.');
assert(routeSource.includes('newsletterSubscribedAt: contact.newsletterSubscribedAt || now'), 'Newsletter subscribe lifecycle must preserve or create a subscribe timestamp.');
assert(routeSource.includes('buildNewsletterLifecycleSourceValues('), 'Newsletter lifecycle actions must keep sourceValues newsletter metadata in sync.');
assert(routeSource.includes('subscriptionStatus: status'), 'Newsletter sourceValues must expose machine-readable subscriptionStatus.');
assert(routeSource.includes("contact.status === 'qualified' || !isSubscriberSendReady(contact)"), 'Newsletter ready action must not target held or unsubscribed subscribers.');
assert(routeSource.includes("settings: {\n    backyIntent: 'newsletter'"), 'Created newsletter forms must carry a machine-readable newsletter intent.');
assert(routeSource.includes("fields: [\n    { key: 'email'"), 'Created newsletter forms must include an email field.');
assert(routeSource.includes("key: 'topics'"), 'Created newsletter forms must include topic preference capture.');
assert(routeSource.includes("key: 'consent'"), 'Created newsletter forms must include consent capture.');
assert(routeSource.includes("key: 'signup_source'"), 'Created newsletter forms must include signup source capture.');
assert(routeSource.includes('supportedPayloadShapes') && routeSource.includes('Backy form values payload'), 'Newsletter handoff must document flat and Backy form-values payload shapes.');
assert(routeSource.includes('customFrontendAgent:') && routeSource.includes('CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA') && routeSource.includes('CUSTOM_FRONTEND_AGENT_HANDOFF_DOC'), 'Newsletter handoff must point frontend agents back to the canonical site handoff contract.');
assert(routeSource.includes('readStart: `${publicBaseUrl}/api/sites/${activeSiteId}/agent-handoff`') && routeSource.includes('manifest: `${publicBaseUrl}/api/sites/${activeSiteId}/manifest`') && routeSource.includes('openapi: `${publicBaseUrl}/api/sites/${activeSiteId}/openapi`'), 'Newsletter handoff must include site-scoped agent-handoff, manifest, and OpenAPI URLs.');
assert(routeSource.includes('providerBoundary') && routeSource.includes('external-delivery-required'), 'Newsletter handoff must keep outbound delivery behind an external-provider boundary.');
assert(routeSource.includes('mailbox delivery') && routeSource.includes('SPF/DKIM/DMARC'), 'Newsletter delivery boundary must name deliverability responsibilities.');
assert(routeSource.includes('sendableSubscribersUrl') && routeSource.includes('audience=sendable'), 'Newsletter handoff must expose a strict send-ready subscriber sync URL.');
assert(routeSource.includes('const sendableSubscribersUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/newsletter/subscribers?audience=sendable`;') && routeSource.includes('const newsletterContactSyncUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/forms/{formId}/contacts/sync`;'), 'Newsletter route must derive visible provider-safe sync URLs for the active site.');
assert(routeSource.includes('sendReadySubscribers') && routeSource.includes('heldOrSuppressed'), 'Newsletter issue handoff must distinguish send-ready subscribers from held/suppressed contacts.');
assert(routeSource.includes('function isSubscriberSendReady(contact: AdminContact): boolean'), 'Newsletter route must compute strict send-ready subscriber state.');
assert(routeSource.includes("disabled={disabled || contact.status === 'qualified' || !isSubscriberSendReady(contact)}"), 'Newsletter ready action must only target send-ready subscribers.');
assert(routeSource.includes('data-testid="newsletter-command-center"'), 'Newsletter page must expose a command-center test hook.');
assert(routeSource.includes('data-testid="newsletter-subscriber-list"'), 'Newsletter page must expose a subscriber-list test hook.');
assert(routeSource.includes('data-testid="newsletter-manual-subscriber"'), 'Newsletter page must expose a manual subscriber management form.');
assert(routeSource.includes('data-testid="newsletter-manual-consent"'), 'Newsletter manual subscriber form must require explicit consent evidence.');
assert(routeSource.includes('data-testid="newsletter-api-handoff"'), 'Newsletter page must expose an API-handoff test hook.');
assert(routeSource.includes('data-agent-handoff-url={agentHandoffUrl}') && routeSource.includes('data-manifest-url={manifestUrl}') && routeSource.includes('data-openapi-url={openApiUrl}'), 'Newsletter API handoff must expose site-scoped custom frontend agent URLs as machine-readable attributes.');
assert(routeSource.includes('<ApiSnippet label="Agent read first" value={agentHandoffUrl} />') && routeSource.includes('<ApiSnippet label="Manifest" value={manifestUrl} />') && routeSource.includes('<ApiSnippet label="OpenAPI" value={openApiUrl} />'), 'Newsletter API handoff must visibly list the canonical frontend agent read order.');
assert(routeSource.includes('<ApiSnippet label="Send-ready sync" value={sendableSubscribersUrl} />') && routeSource.includes('<ApiSnippet label="Contact sync" value={newsletterContactSyncUrl} />'), 'Newsletter API handoff must visibly list provider-safe send-ready and contact-sync URLs.');
assert(routeSource.includes('data-testid="newsletter-copy-api-handoff"') && routeSource.includes('data-target-site-id={activeSiteId}'), 'Newsletter API handoff copy action must expose site-scoped copy metadata.');
assert(routeSource.includes('data-testid="newsletter-issue-handoff"'), 'Newsletter page must expose a newsletter issue handoff section.');
assert(routeSource.includes('data-testid="newsletter-copy-issue-handoff"'), 'Newsletter page must expose a copyable issue handoff action.');
assert(routeSource.includes('data-issue-handoff-schema={NEWSLETTER_ISSUE_SCHEMA_VERSION}') && routeSource.includes('data-agent-handoff-url={agentHandoffUrl}'), 'Newsletter issue handoff must expose schema and canonical agent-handoff metadata.');
assert(routeSource.includes('data-testid="newsletter-copy-handoff"'), 'Newsletter page must expose a copy-handoff action.');
assert(routeSource.includes('data-testid="newsletter-export-csv"'), 'Newsletter page must expose a subscriber CSV export action.');
assert(routeSource.includes("navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'newsletter', templateSource: 'backy-canvas', focus: 'canvas' } })"), 'Newsletter page creation must land in focused Backy canvas mode.');
assert(routeSource.includes("navigate({ to: '/blog/new', search: { siteId: activeSiteId, templateSource: 'backy-canvas', focus: 'canvas' } })"), 'Newsletter writing workflow must open focused blog canvas mode.');
assert(routeSource.includes('Manually added in Backy Newsletter workspace after explicit reader consent.'), 'Manual subscriber adds must persist an explicit consent note.');
assert(routeSource.includes('provider API keys') && routeSource.includes('SMTP credentials') && routeSource.includes('bounce webhook secrets'), 'Newsletter issue handoff must keep provider secrets outside Backy/content payloads.');
assert(routeSource.includes('overflow-x-auto') && routeSource.includes('min-w-[900px]'), 'Newsletter subscriber table must avoid admin-table text overlap on narrow screens.');
assert(pagesNewSource.includes("id: 'newsletter-signup-form'") && pagesNewSource.includes("backyIntent: 'newsletter'") && pagesNewSource.includes("schemaVersion: 'backy.newsletter-form.v1'"), 'Generated newsletter page canvas must mark its signup form with machine-readable newsletter metadata.');
assert(pagesNewSource.includes("consentField: 'consent'") && pagesNewSource.includes("name: 'consent'") && pagesNewSource.includes("sourceField: 'signup_source'"), 'Generated newsletter page canvas must use canonical consent and signup-source fields for subscriber management.');

assert(sidebarSource.includes("{ id: 'newsletter', label: 'Newsletter', to: '/newsletter'"), 'Sidebar must expose Newsletter in the Audience section.');
assert(sidebarSource.includes("'/newsletter'"), 'Sidebar site-scoped routes must preserve siteId on Newsletter navigation.');
assert(headerModelSource.includes("| '/newsletter'"), 'Header static route types must include Newsletter.');
assert(headerModelSource.includes("'/newsletter': 'contacts'"), 'Newsletter header access must use contact permissions.');
assert(headerModelSource.includes("if (path.startsWith('/newsletter')) return 'Newsletter';"), 'Header title must identify Newsletter routes.');
assert(headerSource.includes("if (to === '/newsletter')"), 'Header search/tool navigation must preserve site scope for Newsletter.');
assert(headerSource.includes("title: 'Newsletter'") && headerSource.includes("to: '/newsletter'"), 'Global search must include the Newsletter tool.');
assert(helpSource.includes("route: '/newsletter'") && helpSource.includes('Open Newsletter'), 'Help must point newsletter guidance to the dedicated Newsletter workspace.');
assert(helpSource.includes("id: 'publish-reports-newsletter'") && helpSource.includes('provider-safe draft metadata') && helpSource.includes('SPF/DKIM/DMARC'), 'Help must explain the report-to-newsletter issue workflow and delivery-provider boundary.');
assert(routeTreeSource.includes("Route as NewsletterRouteImport") && routeTreeSource.includes("'/newsletter': typeof NewsletterRoute"), 'Generated route tree must include /newsletter.');
assert(adminContentApiSource.includes('newsletterSubscriptionStatus?: AdminContact') && adminContentApiSource.includes('newsletterUnsubscribedAt?: string | null'), 'Admin content API contact updates must accept newsletter subscription lifecycle fields.');
assert(adminContentApiSource.includes("newsletterStatus?: NonNullable<Contact['newsletterSubscriptionStatus']>"), 'Admin content API newsletter subscriber records must expose the full provider lifecycle status.');
assert(adminContentApiSource.includes('export async function saveNewsletterSubscriber') && adminContentApiSource.includes('/newsletter/subscribers'), 'Admin content API must expose a private newsletter subscriber save helper.');
assert(publicNewsletterSubscribersRouteSource.includes('readNewsletterBodyField') && publicNewsletterSubscribersRouteSource.includes("readNewsletterBodyField(body, 'signup_source')"), 'Public newsletter subscriber API must accept Backy form values payloads and signup_source aliases.');
assert(adminNewsletterSubscribersRouteSource.includes('readNewsletterBodyField') && adminNewsletterSubscribersRouteSource.includes("readNewsletterBodyField(body, 'signup_source')"), 'Admin newsletter subscriber API must accept Backy form values payloads and signup_source aliases.');
assert(adminNewsletterSubscribersRouteSource.includes("const NEWSLETTER_OPERATIONAL_STATUSES: NewsletterOperationalStatus[] = ['subscribed', 'unsubscribed', 'pending', 'bounced', 'complained'];"), 'Admin newsletter subscribers API must preserve full provider lifecycle filter states.');
assert(adminNewsletterSubscribersRouteSource.includes('newsletterOperationalStatusFromContact(contact) === input.status'), 'Admin newsletter subscribers API must filter bounced, complained, and pending lifecycle states directly.');
assert(adminNewsletterSubscribersRouteSource.includes("const NEWSLETTER_AUDIENCE_FILTERS = ['all', 'sendable', 'held'] as const;"), 'Admin newsletter subscribers API must expose strict sendable/held audience filters.');
assert(adminNewsletterSubscribersRouteSource.includes('isNewsletterSubscriberSendable(contact)'), 'Admin newsletter subscribers API must filter send-ready contacts through canonical newsletter logic.');
assert(adminNewsletterSubscribersRouteSource.includes("sendableSubscribers: `/api/admin/sites/${site.id}/newsletter/subscribers?audience=sendable`"), 'Admin newsletter subscribers API handoff must expose the send-ready delivery sync URL.');

console.log('Newsletter source smoke passed.');
