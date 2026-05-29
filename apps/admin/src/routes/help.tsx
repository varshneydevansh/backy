import { useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import {
  BookOpen,
  Code2,
  Compass,
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
type HelpRoute = '/' | '/sites' | '/sites/new' | '/pages' | '/blog' | '/media' | '/collections' | '/reusable-sections' | '/forms' | '/newsletter' | '/contacts' | '/settings';

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
    summary: 'Use the top-left site selector in the sidebar. You do not need to sign out.',
    details: [
      'The active site id travels through Backy routes as siteId so Pages, Blog, Media, Forms, Products, and API handoff stay scoped to that website.',
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
      'The issue handoff combines recent published Blog reports, subscriber counts, and private sync route templates so a delivery worker can draft a provider campaign without reading secrets from the frontend.',
      'Backy should own the subscriber database and API handoff. Bulk outbound delivery, inbox hosting, bounce handling, and domain reputation should stay behind a real email provider until Backy has a dedicated mail service.',
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
      'When a report is ready, copy the issue handoff. It includes recent published posts, public render/resolve URLs, subscriber counts, sync routes, and provider-safe draft metadata.',
      'Use an email provider only for outbound sending, unsubscribe enforcement in delivered messages, bounces, complaints, and SPF/DKIM/DMARC.',
    ],
    route: '/newsletter',
    routeLabel: 'Open Newsletter',
  },
  {
    id: 'roles',
    category: 'security',
    title: 'Understand workspace access',
    summary: 'Backy separates private admin users from public visitors, contacts, and members.',
    details: [
      'Owners and admins control settings, domains, users, and API keys. Editors focus on content and canvas work. Viewers can review without changing records.',
      'Public visitors, leads, members, and customers should be captured through Forms, Contacts, Collections, and commerce records.',
      'Protected API and settings features expose readiness states before they become release-critical.',
    ],
    route: '/settings',
    routeLabel: 'Open Settings',
  },
];

const categoryById = new Map(HELP_CATEGORIES.map((category) => [category.id, category]));

function HelpPage() {
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

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
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-accent focus-ring"
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
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Site command center', 'Open Sites, choose the workspace, then copy API URL or handoff JSON.'],
              ['Editor composition handoff', 'Open a page or post editor, then use Composition handoff in the right panel.'],
              ['Content contract', 'Render frontends from structured elements, theme tokens, bindings, assets, responsive overrides, and animations.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg bg-muted/35 p-3">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </PanelContent>
      </Panel>
    </PageShell>
  );
}
