import { useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Compass,
  Copy,
  Database,
  Globe2,
  LayoutTemplate,
  LifeBuoy,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/help')({
  validateSearch: (search: Record<string, unknown>): { siteId?: string } => ({
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
  component: HelpPage,
});

type HelpCategoryId = 'start' | 'sites' | 'editor' | 'api' | 'content' | 'security';
type HelpRoute = '/' | '/sites' | '/sites/new' | '/pages' | '/blog' | '/media' | '/collections' | '/reusable-sections' | '/forms' | '/newsletter' | '/contacts' | '/products' | '/orders' | '/users' | '/settings';

interface HelpTopic {
  id: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  details: string[];
  route?: HelpRoute;
  routeLabel?: string;
}

const HELP_CATEGORIES: Array<{
  id: HelpCategoryId;
  label: string;
  icon: typeof Compass;
  description: string;
}> = [
  { id: 'start', label: 'Start', icon: Compass, description: 'Move around Backy without losing context.' },
  { id: 'sites', label: 'Sites and domains', icon: Globe2, description: 'Create sites, choose domains, and prepare subdomains.' },
  { id: 'editor', label: 'Canvas editor', icon: LayoutTemplate, description: 'Build pages, posts, sections, and responsive layouts.' },
  { id: 'api', label: 'API handoff', icon: Code2, description: 'Give custom frontends and AI agents the right data contract.' },
  { id: 'content', label: 'CMS data', icon: Database, description: 'Manage media, collections, blog, forms, and reusable content.' },
  { id: 'security', label: 'Security', icon: ShieldCheck, description: 'Understand accounts, roles, readiness, and protected settings.' },
];

const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'switch-sites',
    category: 'start',
    title: 'Switch the active site',
    summary: 'Use the top-left Site selector in the sidebar. You do not need to sign out.',
    details: [
      'The active site id travels through Backy routes as siteId so Pages, Blog, Media, Forms, Products, and API handoff stay scoped to that website.',
      'The Site dropdown sits directly under the Backy logo in the left sidebar; choosing a different site keeps you on the equivalent workspace when that route supports site scope.',
      'Use the Manage link beside Backy to open the active site command center, readiness checks, domains, subdomains, and frontend handoff.',
      'Use the Domains link under the sidebar Site selector, or the Domains shortcut beside the desktop header Site selector, to jump straight to domain and subdomain DNS setup for the active site.',
      'Opening Sites shows all workspaces. Selecting a site opens its command center, readiness checks, domain state, and frontend handoff.',
      'The Backy logo still returns to the dashboard for the currently selected site.',
    ],
    route: '/sites',
    routeLabel: 'Open Sites',
  },
  {
    id: 'create-site',
    category: 'sites',
    title: 'Create a website workspace',
    summary: 'Create each brand, client, storefront, or subsite as a Backy site workspace.',
    details: [
      'The New site flow stores name, slug, domain contract, plan limits, design source, and starter page content.',
      'A site can begin with Backy canvas templates or imported frontend design metadata so future pages keep the same visual system.',
      'After creation, use the site command center to open Pages, Blog, Products, Forms, Media, Collections, and handoff exports for that site.',
    ],
    route: '/sites/new',
    routeLabel: 'Create site',
  },
  {
    id: 'subdomains',
    category: 'sites',
    title: 'Use a subdomain',
    summary: 'Create a site with a custom domain such as blog.example.com or docs.example.com.',
    details: [
      'Backy treats subdomains as normal custom domains because DNS ownership still needs TXT/CNAME verification.',
      'For managed Backy previews, use the generated Backy subdomain. For production, save the exact custom domain on the site.',
      'The site domain panel shows the TXT host, TXT value, CNAME target, and verification status needed by your DNS provider.',
      'The site Agent handoff includes a routing block with resolve/render URLs, Host/domain rules, and examples for blog.example.com, docs.example.com, and shop.example.com.',
    ],
    route: '/sites',
    routeLabel: 'Manage domains',
  },
  {
    id: 'verified-domain-routing',
    category: 'sites',
    title: 'Verify domains before public routing',
    summary: 'A saved custom domain is setup intent; verified DNS is what allows public discovery and hosted routing.',
    details: [
      'Public site discovery by domain and hosted host-to-site rendering require site.settings.domainVerification.status to be verified for the exact host.',
      'Until a domain is verified, keep using the Backy managed preview, the site id, or the site slug while you finish DNS setup.',
      'For Vercel custom frontends, attach the production domain to the frontend project, keep Backy as the API/content source, and pass the browser Host/domain context to resolve/render when locale or subdomain routing depends on the host.',
      'Use one Backy site per independent public subdomain when blog.example.com, docs.example.com, shop.example.com, or a client subsite needs its own content, navigation, SEO, or design tokens.',
    ],
    route: '/sites',
    routeLabel: 'Open domain setup',
  },
  {
    id: 'deployment-topology',
    category: 'sites',
    title: 'Deploy Backy and custom frontends',
    summary: 'Run Backy admin, Backy public APIs, and each custom website as separate deployment surfaces.',
    details: [
      'Use a protected backy-admin Vercel project for the editor shell. It should only receive VITE_BACKY_PUBLIC_API_BASE_URL and VITE_BACKY_ADMIN_API_BASE_URL.',
      'Use a public backy-public Vercel project for render, resolve, manifest, OpenAPI, forms, comments, newsletter signup, and protected admin API routes.',
      'Deploy each custom website as its own frontend project when it has a separate domain, team, release cadence, or framework. Browser bundles should use NEXT_PUBLIC_BACKY_API_BASE_URL, NEXT_PUBLIC_BACKY_SITE_ID, and NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST; server-side loaders may use BACKY_PUBLIC_API_BASE_URL, BACKY_SITE_ID, and BACKY_SITE_PUBLIC_HOST.',
      'Never put database URLs, provider secrets, cron secrets, admin API keys, session cookies, or copied Backy content into a custom frontend bundle.',
      'Before preview deploy, run npm run test:vercel-release-config and npm run test:vercel-preview-readiness. Use strict readiness mode after linking apps/public to backy-public and apps/admin to backy-admin.',
      'Before production promotion, run BACKY_VERCEL_PRODUCTION_URL=https://<public-domain> BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1 npm run test:vercel-production-readiness so the final public domain proves agent-handoff, manifest, OpenAPI, and render JSON.',
      'Before publishing the repository, run npm run test:repo-public-hygiene so local paths, personal emails, generated Vercel deployment URLs, and actual Vercel ids stay out of tracked files.',
      'Optional Vercel Agent Code Review is enabled from each project Project Settings -> AI page; it is a Vercel platform setting, not a Backy runtime package or client-visible secret.',
      'For independent subdomains such as studio.example.com, blog.example.com, or docs.example.com, create one Backy site per independent content/design/navigation model.',
    ],
    route: '/sites',
    routeLabel: 'Open deployment handoff',
  },
  {
    id: 'canvas-basics',
    category: 'editor',
    title: 'Build with the canvas editor',
    summary: 'Use Components for adding blocks, Layers for structure, and Inspector for selected-element editing.',
    details: [
      'Components adds headings, media, buttons, sections, forms, repeaters, embeds, and code components to the canvas.',
      'Layers exposes every root and nested element so you can select, reorder, rename, hide, lock, duplicate, or delete precisely.',
      'Inspector edits the selected element properties: content, layout, style, look, data bindings, animation, files, and advanced behavior.',
    ],
    route: '/pages',
    routeLabel: 'Open Pages',
  },
  {
    id: 'canvas-zoom-selection',
    category: 'editor',
    title: 'Zoom, pan, and select on the canvas',
    summary: 'Canvas zoom should change the work surface, not the whole browser page.',
    details: [
      'Use the in-canvas zoom controls, keyboard zoom shortcuts, or supported trackpad/wheel zoom gestures while the editor is focused.',
      'Use pan mode or hold Space to move around a large canvas without changing selected content.',
      'Click-drag marquee selection should start from the pointer position inside the canvas coordinate space, then select every visible element inside the bounded rectangle.',
      'For precise multi-select, use Layers to select siblings, children, hidden elements, and locked-state context before grouping or alignment.',
    ],
    route: '/pages',
    routeLabel: 'Open canvas pages',
  },
  {
    id: 'navigation-shared-chrome',
    category: 'editor',
    title: 'Edit navigation, headers, and footers',
    summary: 'Navigation is not one opaque text block; items can be selected, linked, and bound to site navigation.',
    details: [
      'A navigation element stores raw navigation items plus selectable child link layers so each menu item can be inspected, linked, styled, and moved.',
      'Site primary navigation and footer navigation can bind to shared site chrome so new pages reuse the same header/footer pattern.',
      'Root sections, headers, footers, and nav bars participate in root-section flow so resizing one area pushes later page sections instead of covering them.',
      'Save stable headers, footers, and repeated blocks as reusable sections when you need the same design across pages and posts.',
    ],
    route: '/reusable-sections',
    routeLabel: 'Open Sections',
  },
  {
    id: 'global-design',
    category: 'editor',
    title: 'Reuse headers, footers, sections, and design style',
    summary: 'Save repeated page chrome and content blocks as reusable sections.',
    details: [
      'Use Save selection from the component library to store a header, nav, footer, hero, card row, or article section as a reusable section.',
      'Saved sections appear under Sections and the component library so new pages and posts can reuse the same design language.',
      'Synced reusable section instances can be refreshed or detached when a page needs a local variation.',
    ],
    route: '/reusable-sections',
    routeLabel: 'Open Sections',
  },
  {
    id: 'responsive-editor',
    category: 'editor',
    title: 'Edit responsive layouts',
    summary: 'Use Desktop, tablet, and mobile breakpoints in the editor toolbar.',
    details: [
      'Each element can carry responsive geometry, props, styles, and token overrides so the same page adapts across screens.',
      'Preview mode uses the same canvas content contract and should stay scrollable when authored content extends beyond the chosen viewport.',
      'Section resizing should preserve document flow by pushing later root sections when a section height changes.',
    ],
  },
  {
    id: 'apiable-elements',
    category: 'api',
    title: 'Every element is API-addressable',
    summary: 'Frontends receive structured element data, not a private screenshot.',
    details: [
      'The content contract includes element id, type, name, children, layout, props, styles, responsive overrides, token refs, animations, actions, data bindings, binding slots, accessibility, and assets.',
      'That structure is generated from the same canvas state the editor saves, so custom frontends and AI agents can read and render the authored page accurately.',
      'Use the editor Composition handoff card when a frontend agent needs the current endpoint, route shape, visible elements, binding coverage, and design metadata.',
    ],
    route: '/pages',
    routeLabel: 'Open editor pages',
  },
  {
    id: 'custom-frontend-agent-start',
    category: 'api',
    title: 'Start a custom frontend or AI agent',
    summary: 'The canonical machine-readable starting point is GET /api/sites/:siteId/agent-handoff.',
    details: [
      'Give frontend agents the site id and ask them to read GET /api/sites/:siteId/agent-handoff before writing UI code.',
      'That handoff points to manifest, OpenAPI, render, resolve, routing, component API contracts, newsletter sync boundaries, and custom frontend design state.',
      'Use /api/sites/:siteId/manifest for discovery, /api/sites/:siteId/openapi for typed endpoint contracts, /api/sites/:siteId/render?path=/... for render payloads, and /api/sites/:siteId/resolve?path=/... for route resolution.',
      'The written agent guide lives at specs/custom-frontend-agent-handoff.md for humans and review checklists.',
    ],
    route: '/sites',
    routeLabel: 'Open Sites',
  },
  {
    id: 'connect-custom-frontend',
    category: 'api',
    title: 'Connect a separate custom frontend',
    summary: 'Host the public website as its own frontend project and keep Backy as the CMS/API source of truth.',
    details: [
      'Attach the production domain to the custom frontend Vercel project, not to backy-admin. Backy-public remains the public API/render origin.',
      'In Backy, create or select the site, save the exact customDomain or domainAliases host, and verify DNS before relying on public host discovery.',
      'Use aliases for multiple hosts that should show the same site. Create a separate Backy site when a subdomain needs independent content, navigation, SEO, design tokens, or launch state.',
      'Frontend agents should read agent-handoff, manifest, OpenAPI, resolve, and render before writing routes or components; the render payload keeps content, fonts, colors, assets, responsive overrides, motion, and component metadata structured.',
      'After the frontend deploys, open Site Detail -> Separate custom frontend project -> Verify deployed frontend. Backy checks /api/backy-connection, required data-backy-* DOM attributes, expected API/site/host values, and forbidden private env names.',
      'Only browser-safe public env belongs in the custom frontend bundle. Supabase, database, provider, admin session, bootstrap, cron, and transactional mail secrets stay on backy-public/admin or private delivery workers.',
    ],
    route: '/sites',
    routeLabel: 'Open frontend setup',
  },
  {
    id: 'frontend-handoff',
    category: 'api',
    title: 'Copy frontend and AI handoff data',
    summary: 'Use the site command center or editor handoff panels before building a custom frontend.',
    details: [
      'Site handoff includes the admin/public endpoints, OpenAPI route, render route, resolve route, SDK pointers, and site readiness context.',
      'The routing handoff tells a custom frontend or frontend AI agent how to resolve root domains and subdomains without copying site content into the frontend repo.',
      'Editor handoff includes the selected page or post composition, content document, editable map, assets, theme token refs, data bindings, and animation metadata.',
      'Give this handoff to the frontend AI agent so it can bind components to Backy APIs instead of inventing a parallel schema.',
    ],
    route: '/sites',
    routeLabel: 'Open handoff',
  },
  {
    id: 'frontend-design-state',
    category: 'api',
    title: 'Preserve custom frontend design state',
    summary: 'Backy stores design metadata so new pages can follow an imported or generated site style.',
    details: [
      'Frontend design templates preserve content documents, editable maps, theme token references, assets, interactions, SEO metadata, and provenance.',
      'New pages, blog posts, products, forms, collections, and reusable sections can start from Backy canvas templates or a custom frontend design template.',
      'The component API contract uses backy.canvas-component-api-contract.v1 and keeps every canvas element addressable by id, type, props, styles, responsive overrides, tokens, assets, animations, and data bindings.',
      'Custom frontends should render from Backy data and keep their local code as a presentation layer, not a separate source of truth.',
    ],
    route: '/sites',
    routeLabel: 'Open design handoff',
  },
  {
    id: 'media-files-fonts',
    category: 'content',
    title: 'Manage media, files, and fonts',
    summary: 'Media is the shared asset library for images, documents, videos, downloads, and font files.',
    details: [
      'Media assets can be selected from page, post, form, product, and section editors.',
      'File/download props preserve media ids and signed URL endpoints so frontends can fetch protected files correctly.',
      'Fonts and reusable assets should be stored once and referenced by elements or design tokens.',
    ],
    route: '/media',
    routeLabel: 'Open Media',
  },
  {
    id: 'dynamic-data',
    category: 'content',
    title: 'Use collections for dynamic content',
    summary: 'Collections define schema-backed records that repeaters, cards, pages, and custom frontends can consume.',
    details: [
      'Use Collections for team profiles, FAQs, pricing plans, services, docs, portfolio items, events, member data, or any custom dataset.',
      'Repeaters and binding slots map collection fields into canvas elements while keeping the field mapping visible in the inspector.',
      'Custom frontends can query collection records through Backy APIs using the same site id.',
    ],
    route: '/collections',
    routeLabel: 'Open Collections',
  },
  {
    id: 'newsletter-subscribers',
    category: 'content',
    title: 'Run newsletter signup and subscriber management',
    summary: 'Use Newsletter for subscriber capture, consent, export, and custom frontend handoff.',
    details: [
      'The Newsletter workspace creates active signup forms with email, name, topic preference, consent, and source fields, then links you to a canvas newsletter page or blog composer.',
      'Subscriber records are still stored through Backy Contacts so status, notes, source values, consent evidence, saved lists, segments, CSV export, and private management APIs stay site-scoped.',
      'The issue handoff combines recent published Blog reports, send-ready subscriber counts, and private audience=sendable sync route templates so a delivery worker can draft a provider campaign without reading secrets from the frontend.',
      'Backy should own the subscriber database and API handoff. Bulk outbound delivery, inbox hosting, bounce handling, and domain reputation should stay behind a real email provider until Backy has a dedicated mail service.',
    ],
    route: '/newsletter',
    routeLabel: 'Open Newsletter',
  },
  {
    id: 'newsletter-mail-boundary',
    category: 'content',
    title: 'Understand newsletter delivery boundaries',
    summary: 'Backy owns subscriber data and issue handoff; a mail provider should own outbound delivery for now.',
    details: [
      'Backy can manage signup forms, subscribers, topics, segments, consent evidence, imports, exports, suppression status, and provider-safe sync routes.',
      'Actual mailbox hosting, bulk outbound sending, bounces, complaints, provider unsubscribe enforcement, SPF/DKIM/DMARC, and sender reputation need a real email provider until Backy has a dedicated mail service.',
      'Keep provider secrets in private settings or delivery workers, not in public manifests, canvas JSON, frontend bundles, or copied issue handoff.',
      'Newsletter subscriber APIs expose subscriptionStatus for audience state and newsletterStatus for provider lifecycle states such as pending, bounced, and complained, plus audience=sendable for delivery-worker sync.',
    ],
    route: '/newsletter',
    routeLabel: 'Open Newsletter',
  },
  {
    id: 'publish-reports-newsletter',
    category: 'content',
    title: 'Publish reports and prepare newsletter issues',
    summary: 'Use Backy as the source of truth for posts, subscribers, consent, and issue handoff.',
    details: [
      'Write each report in Blog so slug, SEO, authoring history, categories, comments, and canvas design stay attached to the site.',
      'Use Newsletter to create a signup form, place it on a Backy canvas page or custom frontend, and collect consent, topic, and source values into Contacts.',
      'When a report is ready, copy the issue handoff. It includes recent published posts, public render/resolve URLs, send-ready subscriber counts, sync routes, and provider-safe draft metadata.',
      'Use an email provider only for outbound sending, unsubscribe enforcement in delivered messages, bounces, complaints, and SPF/DKIM/DMARC.',
    ],
    route: '/newsletter',
    routeLabel: 'Open Newsletter',
  },
  {
    id: 'roles',
    category: 'security',
    title: 'Understand workspace access',
    summary: 'Backy filters the admin UI from the signed-in profile role and permission matrix.',
    details: [
      'Backy uses the signed-in Backy profile role plus the backend permission matrix to decide which navigation groups, quick-create buttons, dashboard shortcuts, Settings panels, and Users controls are visible or enabled.',
      'Owners and admins control settings, domains, users, API keys, invites, and role changes. Editors focus on pages, posts, media, forms, commerce content, and canvas work when those permissions are allowed. Viewers can review without changing records.',
      'If the permission matrix cannot be fetched, Backy keeps role-default navigation active, shows the sync state, and keeps privileged actions blocked until backend permissions verify.',
      'Hosted login validates the identity provider first, then Backy checks profile status, role, invite state, and activity state. A Supabase/Auth identity by itself is not the permission source.',
      'New provider-created identities start invited and inactive until an owner or admin activates them through Users, an invite flow, or the owner-bootstrap path.',
      'If Settings unavailable appears, the active session is signed in as a role without settings.view, the account is inactive/invited, or the permission matrix does not allow that capability; refresh or sign out/in after a role change.',
      'Public visitors, leads, members, and customers should be captured through Forms, Contacts, Collections, and commerce records.',
      'Protected API and settings features expose readiness states before they become release-critical.',
    ],
    route: '/users',
    routeLabel: 'Open Users',
  },
  {
    id: 'provider-certification-partials',
    category: 'security',
    title: 'Why some release rows can stay Partial',
    summary: 'The remaining Partial rows are live provider certification evidence, not missing local editor or API models.',
    details: [
      'The current audit tracks Settings, Settings admin APIs, Products, and Orders as Partial until redacted live provider evidence artifacts are accepted.',
      'Forms and SDK/Postgres readiness are already covered by disposable database gates; the remaining gate is external provider proof for Settings and Commerce paths.',
      'Provider evidence artifacts must prove selected-site handoff, scenario coverage, freshness, no raw secrets, API readiness, and release-doctor acceptance.',
      'Use Settings for the operator evidence packet and run the Settings/Commerce provider certification commands only with real provider credentials available outside public code.',
    ],
    route: '/settings',
    routeLabel: 'Open Settings',
  },
];

const FRONTEND_AGENT_STARTERS = [
  {
    id: 'agent-handoff',
    label: 'Agent handoff',
    value: 'GET /api/sites/:siteId/agent-handoff',
    detail: 'First read for frontend agents. Includes routing, API alignment, design state, and component contracts.',
  },
  {
    id: 'manifest',
    label: 'Manifest',
    value: 'GET /api/sites/:siteId/manifest',
    detail: 'Discovery document for site metadata, modules, completion status, and handoff pointers.',
  },
  {
    id: 'openapi',
    label: 'OpenAPI',
    value: 'GET /api/sites/:siteId/openapi',
    detail: 'Typed endpoint contract for SDKs, AI agents, and custom frontend implementation.',
  },
  {
    id: 'component-contract',
    label: 'Component contract',
    value: 'agent-handoff.componentApiContract.componentTypeContracts + componentApiContract.propertyMap',
    detail: 'Exact map of every API-addressable canvas component type, prop group, responsive override, token, asset, action, data binding, and child policy.',
  },
  {
    id: 'render-resolve',
    label: 'Render and resolve',
    value: 'GET /api/sites/:siteId/render?path=/...  |  GET /api/sites/:siteId/resolve?path=/...',
    detail: 'Use render for page payloads and resolve for route decisions across root domains and subdomains.',
  },
  {
    id: 'frontend-env',
    label: 'Custom frontend env',
    value: 'NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api  |  NEXT_PUBLIC_BACKY_SITE_ID=:siteId  |  NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=<custom-host>',
    detail: 'Use browser-safe env in each public website project. Server loaders may use BACKY_PUBLIC_API_BASE_URL, BACKY_SITE_ID, and BACKY_SITE_PUBLIC_HOST. Keep admin URLs, sessions, provider keys, database URLs, and copied Backy content out.',
  },
  {
    id: 'deployment-topology',
    label: 'Deploy topology',
    value: 'agent-handoff.deploymentTopology.verification.previewReadinessSmoke = npm run test:vercel-preview-readiness',
    detail: 'Read before creating Vercel projects. It names backy-admin, backy-public, required/forbidden env, domain policy, and release checks.',
  },
  {
    id: 'connection-smoke',
    label: 'Connection smoke',
    value: 'BACKY_CUSTOM_FRONTEND_API_BASE_URL=https://<backy-public-domain>/api BACKY_CUSTOM_FRONTEND_SITE_ID=:siteId npm run test:custom-frontend-connection  |  BACKY_CUSTOM_FRONTEND_URL=https://<frontend-domain> BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 npm run test:custom-frontend-connection',
    detail: 'Run this in the Backy repo or use Site Detail -> Separate custom frontend project -> Verify deployed frontend to prove the deployed custom website keeps Backy DOM control attributes and exposes a secret-free /api/backy-connection probe.',
  },
];

const CUSTOM_FRONTEND_ENV_CARDS = [
  {
    id: 'browser-env',
    label: 'Browser-safe frontend env',
    description: 'Put only these public values in the separate website frontend project.',
    value: (siteId: string) => [
      'NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api',
      `NEXT_PUBLIC_BACKY_SITE_ID=${siteId}`,
      'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=<your-domain.com>',
    ].join('\n'),
  },
  {
    id: 'server-env',
    label: 'Optional server loader env',
    description: 'Use these only in server-side loaders, route handlers, or build-time fetch code.',
    value: (siteId: string) => [
      'BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api',
      `BACKY_SITE_ID=${siteId}`,
      'BACKY_SITE_PUBLIC_HOST=<your-domain.com>',
    ].join('\n'),
  },
  {
    id: 'frontend-endpoints',
    label: 'Agent/API read order',
    description: 'Give this read order to any AI agent or custom frontend repository.',
    value: (siteId: string) => [
      `GET /api/sites/${siteId}/agent-handoff`,
      `GET /api/sites/${siteId}/manifest`,
      `GET /api/sites/${siteId}/openapi`,
      `GET /api/sites/${siteId}/resolve?path=/&domain=<your-domain.com>`,
      `GET /api/sites/${siteId}/render?path=/&domain=<your-domain.com>`,
    ].join('\n'),
  },
  {
    id: 'starter-export',
    label: 'Starter project export',
    description: 'Download this from Site Detail so the frontend project starts with a complete file-list project bundle, safe env, and verification runbook.',
    value: (siteId: string) => [
      'Site Detail -> Separate custom frontend project -> Download starter project',
      `GET /api/admin/sites/${siteId}/custom-frontend/starter`,
      'schemaVersion=backy.custom-frontend-starter-export.v1',
      'starterProject.schemaVersion=backy.custom-frontend-starter-project.v1',
      'starterProject.exportFormat=file-list',
      'sourceStarterPath=examples/custom-frontend-next',
      'files[]=complete project file list: package.json, next.config.mjs, app routes, Backy client, renderer, probes',
      'Write every files[].path into the separate frontend repo before deploying.',
      'materializer.command=npm run custom-frontend:materialize -- --manifest <downloaded-starter-json> --out ../<website-frontend-repo>',
      `ensureSite.command=npm run custom-frontend:ensure-site -- --site-id ${siteId} --name "<site name>" --public-host <your-domain.com> --api-base https://<backy-public-domain>/api`,
      'ensureSite requires a server-side operator credential: BACKY_CUSTOM_FRONTEND_ADMIN_KEY/BACKY_ADMIN_API_KEY, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY when the admin key is intentionally empty.',
      'ensureSite refuses --admin-key and --service-role-key command-line secrets.',
      `scaffold.command=npm run custom-frontend:scaffold -- --site-id ${siteId} --public-host <your-domain.com> --api-base https://<backy-public-domain>/api --out ../<website-frontend-repo>`,
      'scaffold verifies public site discovery, manifest, and render before writing files; use --skip-site-verify only for offline fixture manifests.',
      'files also include generated .env.example + BACKY_FRONTEND_STARTER.md',
      'preserveFiles=Backy client, renderer, route, /api/backy-connection, newsletter, and form endpoints',
      'verification.cliCommand=npm run test:custom-frontend-connection',
    ].join('\n'),
  },
  {
    id: 'sdk-bootstrap',
    label: 'SDK bootstrap',
    description: 'Use this in a separate Next/Vercel website project instead of hand-rolling API URL and host glue.',
    value: () => [
      "import { createBackyCustomFrontendClient } from '@backy/sdk-js';",
      '',
      'const backy = createBackyCustomFrontendClient({ env: process.env });',
      'const [handoff, manifest, page] = await Promise.all([',
      '  backy.customFrontendAgentHandoff(),',
      '  backy.manifest(),',
      "  backy.render('/'),",
      ']);',
    ].join('\n'),
  },
  {
    id: 'admin-verifier',
    label: 'Admin connection verifier',
    description: 'Use this from Backy after the separate frontend is deployed, before moving production DNS.',
    value: (siteId: string) => [
      'Site Detail -> Separate custom frontend project -> Verify deployed frontend',
      `POST /api/admin/sites/${siteId}/custom-frontend/connection`,
      'Checks /api/backy-connection',
      'Checks data-backy-site-id, data-backy-route, data-backy-element-id, data-backy-element-type',
      'Checks data-backy-component-contract-pointer and data-backy-editable-map-pointer',
      'Checks expected Backy API base, site id, public host, and forbidden private env names',
    ].join('\n'),
  },
  {
    id: 'forbidden-secrets',
    label: 'Never expose from frontend',
    description: 'These belong only in protected Backy projects, private workers, or provider dashboards.',
    value: () => [
      'POSTGRES_URL / POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING',
      'BACKY_DATABASE_URL / DATABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY / SUPABASE_JWT_SECRET',
      'BACKY_ADMIN_BOOTSTRAP_TOKEN / BACKY_ADMIN_SESSION_SECRET / BACKY_CRON_SECRET',
      'Admin API keys, session cookies, provider secrets, SMTP passwords, webhook secrets, and raw subscriber/order exports',
    ].join('\n'),
  },
] satisfies Array<{
  id: string;
  label: string;
  description: string;
  value: (siteId: string) => string;
}>;

const categoryById = new Map(HELP_CATEGORIES.map((category) => [category.id, category]));
const SITE_SCOPED_HELP_ROUTES = new Set<HelpRoute>([
  '/',
  '/sites',
  '/sites/new',
  '/pages',
  '/blog',
  '/media',
  '/collections',
  '/reusable-sections',
  '/forms',
  '/newsletter',
  '/contacts',
  '/products',
  '/orders',
  '/users',
  '/settings',
]);

const starterValueForSite = (value: string, siteId: string) => (
  value.split(':siteId').join(siteId)
);

const buildAgentCopyBrief = (siteId: string) => [
  `Backy custom frontend start for site ${siteId}`,
  '',
  `1. Read GET /api/sites/${siteId}/agent-handoff first.`,
  `2. Then read GET /api/sites/${siteId}/manifest and GET /api/sites/${siteId}/openapi before writing routes, UI, templates, or API clients.`,
  '3. Read agent-handoff.componentApiContract.componentTypeContracts and componentApiContract.propertyMap before mapping any UI component. Every canvas element is API-addressable by id, type, props, styles, responsive overrides, token refs, assets, actions, data bindings, binding slots, accessibility, metadata, and children.',
  `4. Verify route output with GET /api/sites/${siteId}/resolve?path=/ and GET /api/sites/${siteId}/render?path=/...`,
  '5. For custom domains or subdomains, verify DNS in Backy before relying on domain discovery or hosted host-to-site routing; pass Host/domain context to resolve/render when routing depends on the browser host.',
  '6. Preserve every Backy canvas element id/type/geometry/props/styles/responsive overrides/token refs/assets/animations/actions/dataBindings/bindingSlots/accessibility/metadata/children.',
  '7. Keep Backy as the source of truth. Do not fork content, design state, subscribers, orders, or form submissions into frontend-local JSON.',
  '8. Use authenticated /api/admin/sites/:siteId/* only for writes. Public endpoints are for discovery, rendering, visitor forms/comments/newsletter signup, and route resolution.',
  '9. Keep provider secrets, database URLs, mail credentials, webhook secrets, private orders/submissions, and admin sessions out of public frontend code.',
  '10. For Vercel release topology, deploy protected backy-admin, public backy-public, and separate custom frontend projects. Custom frontend browser bundles use NEXT_PUBLIC_BACKY_API_BASE_URL, NEXT_PUBLIC_BACKY_SITE_ID, and NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST only. Server-side loaders may use BACKY_PUBLIC_API_BASE_URL, BACKY_SITE_ID, and BACKY_SITE_PUBLIC_HOST.',
  "11. In custom frontend code, prefer @backy/sdk-js createBackyCustomFrontendClient({ env: process.env }); it accepts the /api env base URL and passes the public host as domain for resolve/render calls.",
  '12. Before preview deploy, run npm run test:vercel-release-config and npm run test:vercel-preview-readiness; after linking projects, strict mode can require apps/public/.vercel/project.json, apps/admin/.vercel/project.json, and remote backy-public/backy-admin projects.',
  '13. After the separate frontend deploys, paste its public URL into Site Detail -> Separate custom frontend project -> Verify deployed frontend. The protected Backy verifier checks /api/backy-connection, required data-backy-* DOM attributes, expected API/site/host values, and forbidden private env names.',
].join('\n');

function HelpPage() {
  const routeSearch = Route.useSearch();
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const activeSiteId = routeSearch.siteId || 'site-demo';
  const normalizedQuery = query.trim().toLowerCase();
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);

  const filteredTopics = useMemo(() => (
    HELP_TOPICS.filter((topic) => {
      const categoryMatches = activeCategory === 'all' || topic.category === activeCategory;
      if (!categoryMatches) return false;
      if (!normalizedQuery) return true;

      return [
        topic.title,
        topic.summary,
        categoryById.get(topic.category)?.label || '',
        ...topic.details,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    })
  ), [activeCategory, normalizedQuery]);
  const agentBrief = useMemo(() => buildAgentCopyBrief(activeSiteId), [activeSiteId]);
  const copyHelpText = async (key: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => current === key ? null : current);
      }, 1600);
    } catch {
      setCopiedKey(null);
    }
  };
  const getTopicRouteSearch = (route: HelpRoute) => (
    SITE_SCOPED_HELP_ROUTES.has(route) ? activeSiteSearch : undefined
  );

  return (
    <PageShell
      title="Help"
      description="Search Backy concepts, editor controls, site setup, and frontend API handoff."
      contentClassName="space-y-5"
      action={(
        <Link
          to="/sites"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition-colors hover:bg-accent focus-ring"
        >
          <Globe2 className="h-4 w-4" />
          Sites
        </Link>
      )}
    >
      <Panel className="overflow-hidden" data-testid="help-command-center">
        <div className="grid gap-0 lg:grid-cols-[18rem_1fr]">
          <aside className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help..."
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                data-testid="help-search"
              />
            </div>
            <nav className="mt-4 space-y-1" aria-label="Help categories" data-testid="help-category-nav">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={cn(
                  'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors',
                  activeCategory === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground',
                )}
                data-testid="help-category-all"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">All topics</span>
                </span>
                <span className="text-xs tabular-nums">{HELP_TOPICS.length}</span>
              </button>
              {HELP_CATEGORIES.map((category) => {
                const Icon = category.icon;
                const count = HELP_TOPICS.filter((topic) => topic.category === category.id).length;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors',
                      activeCategory === category.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground',
                    )}
                    data-testid={`help-category-${category.id}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{category.label}</span>
                    </span>
                    <span className="text-xs tabular-nums">{count}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 p-4 lg:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {filteredTopics.length} topic{filteredTopics.length === 1 ? '' : 's'} found
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeCategory === 'all' ? 'Across every Backy area.' : categoryById.get(activeCategory)?.description}
                </p>
              </div>
              <span
                className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                data-testid="help-api-contract-badge"
              >
                Canvas content is API-readable
              </span>
            </div>

            <div className="grid gap-3 xl:grid-cols-2" data-testid="help-topic-grid">
              {filteredTopics.map((topic) => {
                const category = categoryById.get(topic.category);
                const Icon = category?.icon || LifeBuoy;

                return (
                  <article
                    key={topic.id}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm"
                    data-testid={`help-topic-${topic.id}`}
                    data-help-category={topic.category}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-foreground">{topic.title}</h2>
                          {category && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {category.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{topic.summary}</p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground/80">
                      {topic.details.map((detail) => (
                        <li key={detail} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    {topic.route && topic.routeLabel && (
                      <div className="mt-4">
                        <Link
                          to={topic.route}
                          search={getTopicRouteSearch(topic.route)}
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-accent focus-ring"
                          data-testid={`help-topic-${topic.id}-route`}
                          data-target-site-id={activeSiteId}
                        >
                          {topic.routeLabel}
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {filteredTopics.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center" data-testid="help-empty">
                <LifeBuoy className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-semibold">No help topics matched</p>
                <p className="mt-1 text-sm text-muted-foreground">Try searching for site, domain, canvas, API, collection, or roles.</p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel data-testid="help-release-notes">
        <PanelHeader
          title="Where frontend agents should start"
          description="Copy the handoff from the site or editor before asking an AI agent to build a custom frontend."
          icon={<Code2 className="h-4 w-4" />}
          action={(
            <button
              type="button"
              onClick={() => void copyHelpText('agent-brief', agentBrief)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-accent focus-ring"
              data-testid="help-copy-agent-brief"
              data-target-site-id={activeSiteId}
              data-action-state={copiedKey === 'agent-brief' ? 'copied' : 'ready'}
            >
              {copiedKey === 'agent-brief' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'agent-brief' ? 'Copied' : 'Copy brief'}
            </button>
          )}
        />
        <PanelContent>
          <div
            className="mb-4 rounded-lg border border-border bg-muted/25 p-3 text-sm leading-6 text-muted-foreground"
            data-testid="help-agent-brief-preview"
            data-target-site-id={activeSiteId}
          >
            Use <span className="font-semibold text-foreground">{activeSiteId}</span> as the site id for the copied endpoints on this page.
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" data-testid="help-agent-starter-grid" data-target-site-id={activeSiteId}>
            {FRONTEND_AGENT_STARTERS.map((item) => {
              const copied = copiedKey === item.id;
              const starterValue = starterValueForSite(item.value, activeSiteId);

              return (
                <div key={item.id} className="rounded-lg border border-border bg-muted/25 p-3" data-testid={`help-agent-starter-${item.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <button
                      type="button"
                      onClick={() => void copyHelpText(item.id, starterValue)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
                      aria-label={`Copy ${item.label} endpoint`}
                      data-testid={`help-copy-agent-starter-${item.id}`}
                      data-action-state={copied ? 'copied' : 'ready'}
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <code className="mt-2 block min-w-0 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {starterValue}
                  </code>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-3 text-sm leading-6 text-muted-foreground" data-testid="help-agent-human-guide">
            Human review guide: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">specs/custom-frontend-agent-handoff.md</code>. Require agents to preserve Backy ids, component props, responsive overrides, token refs, assets, animation metadata, data bindings, and newsletter sync boundaries.
          </div>
        </PanelContent>
      </Panel>

      <Panel data-testid="help-custom-frontend-checklist">
        <PanelHeader
          title="Connect a separate custom frontend"
          description="Use this when your public website is a separate Vercel project and Backy is the CMS/API control plane."
          icon={<Globe2 className="h-4 w-4" />}
        />
        <PanelContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" data-testid="help-custom-frontend-steps">
            {[
              ['1', 'Create/select site', 'Create the Backy site, pick the starter or imported design source, then keep authoring content in Backy.'],
              ['2', 'Attach domain to frontend', 'Put the root domain or subdomain on the custom frontend Vercel project. Keep backy-admin protected.'],
              ['3', 'Verify host in Backy', 'Save the exact host as customDomain or domainAliases, then verify DNS before public host discovery.'],
              ['4', 'Configure safe env', 'Use only public API/site/host env in browser bundles; optional server loaders can use non-NEXT_PUBLIC mirrors.'],
              ['5', 'Render from APIs', 'Read agent-handoff, manifest, OpenAPI, resolve, and render so content/design stays controlled by Backy.'],
              ['6', 'Verify connection', 'Paste the deployed frontend URL into the Site Detail verifier before moving production DNS.'],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-lg border border-border bg-muted/20 p-3" data-testid={`help-custom-frontend-step-${step}`}>
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{step}</span>
                <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="help-custom-frontend-env-grid" data-target-site-id={activeSiteId}>
            {CUSTOM_FRONTEND_ENV_CARDS.map((card) => {
              const copied = copiedKey === card.id;
              const value = card.value(activeSiteId);

              return (
                <div key={card.id} className="rounded-lg border border-border bg-card p-3 shadow-sm" data-testid={`help-custom-frontend-card-${card.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{card.label}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{card.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyHelpText(card.id, value)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
                      aria-label={`Copy ${card.label}`}
                      data-testid={`help-copy-custom-frontend-${card.id}`}
                      data-action-state={copied ? 'copied' : 'ready'}
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <pre className="mt-3 max-h-52 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {value}
                  </pre>
                </div>
              );
            })}
          </div>
        </PanelContent>
      </Panel>
    </PageShell>
  );
}
