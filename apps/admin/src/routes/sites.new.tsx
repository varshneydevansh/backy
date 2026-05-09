/**
 * BACKY CMS - NEW SITE PAGE
 */

import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, FileText, Globe, Layers3, Link2, Save } from 'lucide-react';
import { createPage, createSite } from '@/lib/adminContentApi';
import { useStore, type Site } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';

export const Route = createFileRoute('/sites/new')({
  component: NewSitePage,
});

const STATUS_OPTIONS: Array<{ value: Site['status']; label: string; detail: string }> = [
  { value: 'draft', label: 'Draft', detail: 'Private while you build pages, navigation, products, and forms.' },
  { value: 'published', label: 'Published', detail: 'Public immediately after creation.' },
  { value: 'archived', label: 'Archived', detail: 'Creates the workspace but keeps it out of active work.' },
];

type SiteBlueprint = 'blank' | 'business' | 'storefront' | 'publication';

interface StarterPageSpec {
  title: string;
  slug: string;
  template: string;
  description: string;
  isHomepage?: boolean;
}

const BLUEPRINT_OPTIONS: Array<{
  id: SiteBlueprint;
  name: string;
  detail: string;
  pages: StarterPageSpec[];
}> = [
  {
    id: 'blank',
    name: 'Blank workspace',
    detail: 'Create only the site record and add pages later.',
    pages: [],
  },
  {
    id: 'business',
    name: 'Business site',
    detail: 'Home, About, Contact, and starter lead capture.',
    pages: [
      { title: 'Home', slug: 'home', template: 'landing', description: 'Introduce the offer and guide visitors to the next step.', isHomepage: true },
      { title: 'About', slug: 'about', template: 'about', description: 'Explain the story, values, and proof behind the brand.' },
      { title: 'Contact', slug: 'contact', template: 'contact', description: 'Invite visitors to ask a question or request a quote.' },
    ],
  },
  {
    id: 'storefront',
    name: 'Storefront',
    detail: 'Home, Shop, Contact, and commerce-ready copy.',
    pages: [
      { title: 'Home', slug: 'home', template: 'landing', description: 'Feature the flagship offer and route visitors to products.', isHomepage: true },
      { title: 'Shop', slug: 'shop', template: 'store', description: 'A flexible storefront page ready to bind to Backy products.' },
      { title: 'Contact', slug: 'contact', template: 'contact', description: 'Collect support, wholesale, or product questions.' },
    ],
  },
  {
    id: 'publication',
    name: 'Publication',
    detail: 'Home, Blog, About, and editorial setup.',
    pages: [
      { title: 'Home', slug: 'home', template: 'landing', description: 'Introduce the publication and highlight recent stories.', isHomepage: true },
      { title: 'Blog', slug: 'blog', template: 'blog', description: 'A public index page for articles and editorial content.' },
      { title: 'About', slug: 'about', template: 'about', description: 'Explain the editorial mission and contributors.' },
    ],
  },
];

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeDomain = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '');

const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isValidDomain = (value: string) => !value || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value);

function NewSitePage() {
  const navigate = useNavigate();
  const { sites, pages, setSites, setPages } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    customDomain: '',
    description: '',
    status: 'draft' as Site['status'],
    blueprint: 'business' as SiteBlueprint,
  });

  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[0],
    [formData.status],
  );
  const displaySlug = formData.slug || slugify(formData.name);
  const normalizedDomain = normalizeDomain(formData.customDomain);
  const publicAddress = normalizedDomain || `${displaySlug || 'new-site'}.backy.app`;
  const selectedBlueprint = useMemo(
    () => BLUEPRINT_OPTIONS.find((blueprint) => blueprint.id === formData.blueprint) || BLUEPRINT_OPTIONS[0],
    [formData.blueprint],
  );
  const canSubmit = formData.name.trim().length > 1
    && isValidSlug(displaySlug)
    && isValidDomain(normalizedDomain);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      setError('Add a site name, use a valid URL slug, and check the custom domain format.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const created = await createSite({
        name: formData.name.trim(),
        slug: displaySlug,
        customDomain: normalizedDomain || null,
        description: formData.description.trim(),
        status: formData.status,
      });
      const createdPages = await seedStarterPages(created.publicSiteId || created.id, selectedBlueprint.pages, formData.status);
      const createdWithCount = {
        ...created,
        pageCount: Math.max(created.pageCount || 0, createdPages.length),
      };
      setSites([createdWithCount, ...sites.filter((site) => site.id !== created.id)]);
      if (createdPages.length > 0) {
        setPages([...createdPages, ...pages.filter((page) => !createdPages.some((createdPage) => createdPage.id === page.id))]);
      }
      navigate({ to: '/sites' });
    } catch (createError) {
      setError(createError instanceof Error
        ? `${createError.message}. The site was not created because the backend did not persist it.`
        : 'Unable to create site. The site was not persisted.');
      setIsLoading(false);
    }
  };

  return (
    <PageShell
      title="Create site"
      description="Start a managed frontend workspace that Backy can drive through APIs and admin controls."
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/sites' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Sites
        </button>
      }
      className="mx-auto max-w-6xl"
    >
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Site identity</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This becomes the root record for pages, navigation, SEO, redirects, media, forms, and commerce.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Site name</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({
                  ...formData,
                  name: e.target.value,
                  slug: slugEdited ? formData.slug : slugify(e.target.value),
                })}
                placeholder="Northstar Studio"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Status</span>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Site['status'] })}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedStatus.detail}</span>
            </label>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">URL slug</span>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="border-r border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">backy.app/</span>
                <input
                  type="text"
                  value={displaySlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setFormData({ ...formData, slug: slugify(e.target.value) });
                  }}
                  placeholder="northstar-studio"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  required
                />
              </div>
              {!isValidSlug(displaySlug) && (
                <span className="mt-2 block text-xs text-red-600">Use lowercase letters, numbers, and hyphens.</span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium">Custom domain</span>
              <div className="relative mt-2">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.customDomain}
                  onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                  onBlur={(e) => setFormData({ ...formData, customDomain: normalizeDomain(e.target.value) })}
                  placeholder="example.com"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>
              {!isValidDomain(normalizedDomain) && (
                <span className="mt-2 block text-xs text-red-600">Use a domain like example.com.</span>
              )}
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Portfolio, product catalog, blog, booking site, or client workspace."
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-teal-700" />
              Starter structure
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Seed the first pages now so this site opens as a usable workspace instead of an empty shell.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {BLUEPRINT_OPTIONS.map((blueprint) => (
                <label
                  key={blueprint.id}
                  className={cn(
                    'cursor-pointer rounded-lg border p-4 transition hover:border-primary/50',
                    formData.blueprint === blueprint.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-background',
                  )}
                >
                  <input
                    type="radio"
                    name="site-blueprint"
                    value={blueprint.id}
                    checked={formData.blueprint === blueprint.id}
                    onChange={(event) => setFormData({ ...formData, blueprint: event.target.value as SiteBlueprint })}
                    className="sr-only"
                  />
                  <span className="block font-semibold text-foreground">{blueprint.name}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{blueprint.detail}</span>
                  <span className="mt-3 block text-xs font-medium text-muted-foreground">
                    {blueprint.pages.length === 0 ? 'No starter pages' : blueprint.pages.map((page) => page.title).join(' / ')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Globe className="h-4 w-4 text-teal-700" />
              Public address
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-3">
              <p className="break-all text-sm font-semibold text-foreground">{publicAddress}</p>
              <p className="mt-1 text-xs text-muted-foreground">{normalizedDomain ? 'Custom domain' : 'Managed Backy subdomain'}</p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers3 className="h-4 w-4 text-teal-700" />
              Workspace includes
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {[
                'Pages and blog content',
                'Navigation, redirects, SEO, and readiness checks',
                'Media, forms, comments, contacts, products, and orders',
                'Headless API records for a custom frontend',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-teal-700" />
              Pages to seed
            </div>
            <div className="mt-4 space-y-2">
              {selectedBlueprint.pages.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                  No pages will be created.
                </p>
              ) : selectedBlueprint.pages.map((page) => (
                <div key={page.slug} className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{page.title}</span>
                    {page.isHomepage && <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Home</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">/{page.isHomepage ? '' : page.slug}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading || !canSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Creating...' : 'Create site'}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/sites' })}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </aside>
      </form>
    </PageShell>
  );
}

async function seedStarterPages(
  siteId: string,
  pageSpecs: StarterPageSpec[],
  status: Site['status'],
) {
  const createdPages = [];

  for (const spec of pageSpecs) {
    createdPages.push(await createPage(siteId, {
      title: spec.title,
      slug: spec.slug,
      status,
      description: spec.description,
      template: spec.template,
      isHomepage: spec.isHomepage || false,
      meta: {
        title: spec.title,
        description: spec.description,
        template: spec.template,
      },
      content: createStarterPageContent(spec, status),
    }));
  }

  return createdPages;
}

function createStarterPageContent(spec: StarterPageSpec, status: Site['status']) {
  const elements = buildStarterElements(spec);
  return JSON.parse(serializeCanvasContent(elements, DEFAULT_CANVAS_SIZE, undefined, {
    documentId: `page_${spec.slug || 'home'}`,
    kind: 'page',
    title: spec.title,
    slug: spec.slug,
    status,
    locale: 'en',
  }));
}

function buildStarterElements(spec: StarterPageSpec): CanvasElement[] {
  const palette = getStarterPalette(spec.template);
  const hero = createCanvasElement('section', 0, 0, {
    id: `${spec.slug}-hero-section`,
    width: 1200,
    height: spec.template === 'contact' ? 620 : 520,
    props: { backgroundColor: palette.background, borderRadius: 0, padding: 0 },
    children: [
      createCanvasElement('heading', 72, 78, {
        id: `${spec.slug}-heading`,
        width: 560,
        height: 110,
        props: { content: spec.title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: palette.heading },
      }),
      createCanvasElement('paragraph', 76, 210, {
        id: `${spec.slug}-copy`,
        width: 520,
        height: 100,
        props: { content: spec.description, fontSize: 18, lineHeight: 1.6, color: palette.text },
      }),
      createCanvasElement('button', 76, 346, {
        id: `${spec.slug}-button`,
        width: 180,
        height: 50,
        props: { label: getStarterButtonLabel(spec.template), backgroundColor: palette.accent, color: palette.accentText, borderRadius: 8, fontWeight: '700' },
      }),
    ],
  });

  if (spec.template === 'contact') {
    hero.children = [
      ...(hero.children || []),
      createCanvasElement('form', 690, 72, {
        id: `${spec.slug}-form`,
        width: 420,
        height: 430,
        props: {
          formId: `form-${spec.slug}-contact`,
          formName: `${spec.slug}-contact`,
          formTitle: 'Contact form',
          formDescription: 'Starter contact form generated with the site blueprint.',
          successMessage: 'Thanks. We will reply soon.',
          enableHoneypot: true,
          contactShareEnabled: true,
          contactShareNameField: 'name',
          contactShareEmailField: 'email',
          contactShareNotesField: 'message',
          backgroundColor: '#ffffff',
          borderRadius: 8,
          borderColor: '#d8ded2',
          borderWidth: 1,
          borderStyle: 'solid',
        },
        children: [
          createCanvasElement('input', 24, 30, { id: `${spec.slug}-name`, width: 360, height: 54, props: { label: 'Name', name: 'name', placeholder: 'Your name', required: true } }),
          createCanvasElement('input', 24, 104, { id: `${spec.slug}-email`, width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
          createCanvasElement('textarea', 24, 180, { id: `${spec.slug}-message`, width: 360, height: 110, props: { label: 'Message', name: 'message', placeholder: 'Tell us what you need', required: true } }),
          createCanvasElement('button', 24, 326, { id: `${spec.slug}-submit`, width: 170, height: 48, props: { label: 'Send message', backgroundColor: palette.accent, color: palette.accentText, borderRadius: 8, fontWeight: '700' } }),
        ],
      }),
    ];

    return [hero];
  }

  return [
    hero,
    createCanvasElement('section', 0, 520, {
      id: `${spec.slug}-feature-section`,
      width: 1200,
      height: 330,
      props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
      children: getStarterFeatureLabels(spec.template).map((label, index) => createCanvasElement('box', 72 + index * 360, 72, {
        id: `${spec.slug}-feature-${index}`,
        width: 320,
        height: 160,
        props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
        children: [
          createCanvasElement('heading', 22, 24, {
            id: `${spec.slug}-feature-heading-${index}`,
            width: 260,
            height: 36,
            props: { content: label, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
          }),
          createCanvasElement('paragraph', 22, 78, {
            id: `${spec.slug}-feature-copy-${index}`,
            width: 250,
            height: 64,
            props: { content: 'Edit this section, bind it to CMS data, or save it as a reusable block.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
          }),
        ],
      })),
    }),
  ];
}

function getStarterPalette(template: string) {
  if (template === 'store') {
    return { background: '#f7f8f4', heading: '#111827', text: '#4b5563', accent: '#14532d', accentText: '#ffffff' };
  }
  if (template === 'blog') {
    return { background: '#111827', heading: '#ffffff', text: '#d1d5db', accent: '#f59e0b', accentText: '#111827' };
  }

  return { background: '#f8fafc', heading: '#111827', text: '#475569', accent: '#0f766e', accentText: '#ffffff' };
}

function getStarterButtonLabel(template: string) {
  if (template === 'store') return 'Shop products';
  if (template === 'blog') return 'Read articles';
  if (template === 'contact') return 'Contact us';
  return 'Get started';
}

function getStarterFeatureLabels(template: string) {
  if (template === 'store') return ['Featured products', 'Secure checkout', 'Digital delivery'];
  if (template === 'blog') return ['Latest articles', 'Categories', 'Newsletter'];
  if (template === 'about') return ['Story', 'Values', 'Team'];
  return ['Design freely', 'Bind content', 'Publish faster'];
}
