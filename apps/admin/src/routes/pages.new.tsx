/**
 * BACKY CMS - NEW PAGE
 */

import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Code2, FileText, Globe, Home, Layout, Save, Sparkles } from 'lucide-react';
import { createPage } from '@/lib/adminContentApi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';
import {
    DEFAULT_CANVAS_SIZE,
    createCanvasElement,
    serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';

interface NewPageSearch {
    siteId?: string;
}

type PageTemplate = 'blank' | 'landing' | 'about' | 'contact' | 'registration';

const TEMPLATE_OPTIONS: Array<{
    id: PageTemplate;
    name: string;
    desc: string;
    detail: string;
    sections: string[];
}> = [
    {
        id: 'blank',
        name: 'Blank page',
        desc: 'A clean canvas with a title and starter text.',
        detail: 'Best for custom layouts, landing pages, and one-off experiments.',
        sections: ['Heading', 'Intro copy'],
    },
    {
        id: 'landing',
        name: 'Landing page',
        desc: 'Hero, value cards, and a call to action.',
        detail: 'Good for offers, products, launches, and lead capture pages.',
        sections: ['Hero', 'Feature grid', 'CTA'],
    },
    {
        id: 'about',
        name: 'About page',
        desc: 'Story, values, and team-ready content blocks.',
        detail: 'Useful for company, portfolio, studio, or brand background pages.',
        sections: ['Story', 'Values', 'Team'],
    },
    {
        id: 'contact',
        name: 'Contact page',
        desc: 'Contact copy, form fields, and response expectations.',
        detail: 'Starts with an editable Backy form that appears in the Forms inbox.',
        sections: ['Intro', 'Form', 'Response note'],
    },
    {
        id: 'registration',
        name: 'Registration page',
        desc: 'Signup copy, member fields, consent, and submission routing.',
        detail: 'Creates a public registration form API without needing a separate frontend first.',
        sections: ['Hero', 'Registration form', 'Consent'],
    },
];

const slugify = (value: string) => (
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
);

export const Route = createFileRoute('/pages/new')({
    validateSearch: (search: Record<string, unknown>): NewPageSearch => ({
        siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
    }),
    component: NewPageRoute,
});

function NewPageRoute() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const { sites, pages, setPages } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSiteId = search.siteId && sites.some((site) => (site.publicSiteId || site.id) === search.siteId)
        ? search.siteId
        : defaultSiteId;

    // Default to first site if available
    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        siteId: requestedSiteId,
        template: 'blank' as PageTemplate,
        status: 'draft' as 'draft' | 'published' | 'scheduled',
        scheduledAt: null as string | null,
        isHomepage: false,
        description: '',
    });
    const selectedSite = sites.find((site) => (site.publicSiteId || site.id) === formData.siteId);
    const selectedTemplate = useMemo(
        () => TEMPLATE_OPTIONS.find((template) => template.id === formData.template) || TEMPLATE_OPTIONS[0],
        [formData.template],
    );
    const routePreview = formData.isHomepage
        ? '/'
        : `/${slugify(formData.slug || formData.title || 'new-page')}`;
    const canSubmit = Boolean(formData.title.trim() && formData.siteId && (!formData.isHomepage || formData.slug.trim() || formData.title.trim()));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) {
            setError('Add a page title and select a site before creating the page.');
            return;
        }

        setIsLoading(true);
        setError(null);

        const title = formData.title.trim();
        const slug = formData.isHomepage ? 'home' : slugify(formData.slug || title);
        const content = createInitialPageContent({
            template: formData.template,
            title,
            slug,
            status: formData.status,
            description: formData.description,
        });

        const input = {
            title,
            slug,
            siteId: formData.siteId,
            status: formData.status,
            scheduledAt: formData.status === 'scheduled' ? formData.scheduledAt : null,
            template: formData.template,
            description: formData.description,
            isHomepage: formData.isHomepage,
            meta: {
                title,
                description: formData.description,
                template: formData.template,
            },
            content,
        };

        try {
            const created = await createPage(formData.siteId, input);
            setPages([created, ...pages.filter((page) => page.id !== created.id)]);
            navigate({ to: '/pages' });
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Unable to create page');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageShell
            title="Create page"
            description={selectedSite ? `Add a routable, editable page to ${selectedSite.name}.` : 'Add a new page to your site.'}
            action={
                <button
                    type="button"
                    onClick={() => navigate({ to: '/pages' })}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Pages
                </button>
            }
            className="w-full"
        >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                {error && (
                    <div className="xl:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {error}. The page was not created because the backend did not persist it.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-6 rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                                <FileText className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Page basics</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    The title, route, status, and template are saved through the pages API.
                                </p>
                            </div>
                        </div>
                        {/* Site Selection */}
                        <div>
                            <label htmlFor="page-target-site" className="mb-2 block text-sm font-medium">Target site</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <select
                                    id="page-target-site"
                                    value={formData.siteId}
                                    onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                                    className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                                    required
                                >
                                    <option value="" disabled>Select a site...</option>
                                    {sites.map(site => (
                                        <option key={site.id} value={site.publicSiteId || site.id}>{site.name}</option>
                                    ))}
                                </select>
                            </div>
                            {sites.length === 0 && (
                                <p className="text-sm text-yellow-600 mt-1">
                                    You need to create a site first!
                                </p>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-title" className="mb-2 block text-sm font-medium">Page title</label>
                                <input
                                    id="page-title"
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        title: e.target.value,
                                        slug: formData.slug ? formData.slug : slugify(e.target.value),
                                    })}
                                    placeholder="About us"
                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="page-slug" className="mb-2 block text-sm font-medium">URL slug</label>
                                <div className="flex items-center">
                                    <span className="rounded-l-lg border border-r-0 bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                                        /
                                    </span>
                                    <input
                                        id="page-slug"
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: slugify(e.target.value) })}
                                        placeholder="about"
                                        disabled={formData.isHomepage}
                                        className="min-w-0 flex-1 rounded-r-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-60"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-description" className="mb-2 block text-sm font-medium">SEO description</label>
                            <textarea
                                id="page-description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Short summary for search previews and frontend route metadata."
                                rows={3}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 transition hover:bg-accent">
                            <input
                                type="checkbox"
                                checked={formData.isHomepage}
                                onChange={(e) => {
                                    const isHomepage = e.target.checked;
                                    setFormData({
                                        ...formData,
                                        isHomepage,
                                        slug: isHomepage ? 'home' : formData.slug,
                                    });
                                }}
                                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                            />
                            <span>
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <Home className="h-4 w-4" />
                                    Set as homepage route
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                    Creates the page as `/` for the selected site. Existing homepage conflicts are still handled by the backend.
                                </span>
                            </span>
                        </label>
                    </div>

                    <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Starter design</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Templates seed real editable canvas elements instead of leaving the editor empty.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            {TEMPLATE_OPTIONS.map((tmpl) => (
                                    <label
                                        key={tmpl.id}
                                        className={cn(
                                            'flex cursor-pointer flex-col rounded-lg border p-4 transition-all hover:shadow-sm',
                                            formData.template === tmpl.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={tmpl.id}
                                            checked={formData.template === tmpl.id}
                                            onChange={(e) => setFormData({ ...formData, template: e.target.value as PageTemplate })}
                                            className="sr-only"
                                        />
                                        <div className="mb-1 flex items-center gap-2">
                                            <Layout className={cn(
                                                'h-4 w-4',
                                                formData.template === tmpl.id ? 'text-primary' : 'text-muted-foreground'
                                            )} />
                                            <span className="font-semibold">{tmpl.name}</span>
                                        </div>
                                        <span className="text-xs leading-5 text-muted-foreground">{tmpl.desc}</span>
                                        <span className="mt-3 flex flex-wrap gap-1">
                                            {tmpl.sections.map((section) => (
                                                <span key={section} className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                                    {section}
                                                </span>
                                            ))}
                                        </span>
                                    </label>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-status" className="mb-2 block text-sm font-medium">Status</label>
                                <select
                                    id="page-status"
                                    value={formData.status}
                                    onChange={(e) => {
                                        const status = e.target.value as typeof formData.status;
                                        setFormData({
                                            ...formData,
                                            status,
                                            scheduledAt: status === 'scheduled' ? formData.scheduledAt : null,
                                        });
                                    }}
                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="scheduled">Scheduled</option>
                                </select>
                            </div>

                            {formData.status === 'scheduled' && (
                                <div>
                                    <label htmlFor="page-scheduled-at" className="mb-2 block text-sm font-medium">Publish date</label>
                                    <input
                                        id="page-scheduled-at"
                                        type="datetime-local"
                                        value={toDateTimeLocalValue(formData.scheduledAt)}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            scheduledAt: fromDateTimeLocalValue(e.target.value),
                                        })}
                                        className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                                        required
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/pages' })}
                            className="rounded-lg border px-6 py-2.5 font-medium transition hover:bg-accent"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !canSubmit}
                            className={cn(
                                'flex items-center gap-2 rounded-lg px-6 py-2.5',
                                'bg-primary text-primary-foreground font-medium',
                                'hover:bg-primary/90 disabled:opacity-50 shadow-md'
                            )}
                        >
                            <Save className="w-4 h-4" />
                            {isLoading ? 'Creating...' : 'Create Page'}
                        </button>
                    </div>
                </form>

                <aside className="space-y-4">
                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                                <Globe className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Route preview</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    This is the frontend path created for the selected site.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm">
                            {selectedSite?.slug || selectedSite?.name || 'site'}{routePreview}
                        </div>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Template</dt>
                                <dd className="mt-1 font-semibold text-foreground">{selectedTemplate.name}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Canvas</dt>
                                <dd className="mt-1 text-foreground">{DEFAULT_CANVAS_SIZE.width} x {DEFAULT_CANVAS_SIZE.height}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                                <dd className="mt-1 capitalize text-foreground">{formData.status}</dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Layout className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">{selectedTemplate.name}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.detail}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            {selectedTemplate.sections.map((section) => (
                                <div key={section} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    {section}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                                <Code2 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Create payload</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    The submit action sends page metadata plus seeded canvas content.
                                </p>
                            </div>
                        </div>
                        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify({
    title: formData.title.trim() || 'Untitled page',
    slug: formData.isHomepage ? 'home' : slugify(formData.slug || formData.title || 'new-page'),
    status: formData.status,
    template: formData.template,
    isHomepage: formData.isHomepage,
    content: `${selectedTemplate.sections.length} starter blocks`,
    forms: ['contact', 'registration'].includes(formData.template) ? 'Backy form API seeded' : 'none',
}, null, 2)}
                        </pre>
                    </section>
                </aside>
            </div>
        </PageShell>
    );
}

function createInitialPageContent(input: {
    template: PageTemplate;
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled';
    description: string;
}) {
    const elements = buildTemplateElements(input);
    return JSON.parse(serializeCanvasContent(elements, DEFAULT_CANVAS_SIZE, undefined, {
        documentId: `page_${input.slug || 'new-page'}`,
        kind: 'page',
        title: input.title,
        slug: input.slug,
        status: input.status,
        locale: 'en',
    }));
}

function buildTemplateElements(input: {
    template: PageTemplate;
    title: string;
    slug?: string;
    description: string;
}): CanvasElement[] {
    const title = input.title || 'New page';
    const description = input.description || 'Use this space to explain the promise of this page and guide visitors to the next action.';
    const formSlug = slugify(input.slug || title || 'new-page');

    if (input.template === 'landing') {
        return [
            createCanvasElement('section', 0, 0, {
                id: 'landing-hero-section',
                width: 1200,
                height: 430,
                props: { backgroundColor: '#0f172a', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 72, {
                        id: 'landing-hero-heading',
                        width: 560,
                        height: 120,
                        props: { content: title, level: 'h1', fontSize: 54, fontWeight: '800', lineHeight: 1.05, color: '#ffffff' },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'landing-hero-copy',
                        width: 520,
                        height: 90,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#cbd5e1' },
                    }),
                    createCanvasElement('button', 76, 326, {
                        id: 'landing-hero-button',
                        width: 180,
                        height: 52,
                        props: { label: 'Get started', backgroundColor: '#14b8a6', color: '#042f2e', borderRadius: 8, fontSize: 16, fontWeight: '700' },
                    }),
                    createCanvasElement('box', 720, 76, {
                        id: 'landing-hero-media',
                        width: 360,
                        height: 260,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#334155', borderWidth: 1, borderStyle: 'solid' },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 430, {
                id: 'landing-feature-section',
                width: 1200,
                height: 330,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: ['Design freely', 'Bind content', 'Publish faster'].map((item, index) => createCanvasElement('box', 72 + index * 360, 76, {
                    id: `landing-feature-${index}`,
                    width: 320,
                    height: 160,
                    props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                    children: [
                        createCanvasElement('heading', 22, 24, {
                            id: `landing-feature-heading-${index}`,
                            width: 260,
                            height: 40,
                            props: { content: item, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
                        }),
                        createCanvasElement('paragraph', 22, 80, {
                            id: `landing-feature-copy-${index}`,
                            width: 250,
                            height: 60,
                            props: { content: 'Edit this block, save it as a section, or connect it to Backy data.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                        }),
                    ],
                })),
            }),
        ];
    }

    if (input.template === 'about') {
        return [
            createCanvasElement('heading', 80, 72, {
                id: 'about-heading',
                width: 640,
                height: 84,
                props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', color: '#111827' },
            }),
            createCanvasElement('paragraph', 82, 178, {
                id: 'about-story-copy',
                width: 720,
                height: 130,
                props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#374151' },
            }),
            createCanvasElement('section', 0, 360, {
                id: 'about-values-section',
                width: 1200,
                height: 330,
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                children: ['Craft', 'Clarity', 'Ownership'].map((item, index) => createCanvasElement('box', 80 + index * 330, 74, {
                    id: `about-value-${index}`,
                    width: 280,
                    height: 160,
                    props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                    children: [
                        createCanvasElement('heading', 22, 24, {
                            id: `about-value-heading-${index}`,
                            width: 220,
                            height: 38,
                            props: { content: item, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
                        }),
                        createCanvasElement('paragraph', 22, 76, {
                            id: `about-value-copy-${index}`,
                            width: 220,
                            height: 60,
                            props: { content: 'Write a specific value statement that explains how the team makes decisions.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                        }),
                    ],
                })),
            }),
        ];
    }

    if (input.template === 'contact') {
        return [
            createCanvasElement('heading', 72, 72, {
                id: 'contact-heading',
                width: 520,
                height: 70,
                props: { content: title, level: 'h1', fontSize: 46, fontWeight: '800', color: '#111827' },
            }),
            createCanvasElement('paragraph', 74, 158, {
                id: 'contact-copy',
                width: 500,
                height: 100,
                props: { content: description, fontSize: 18, lineHeight: 1.6, color: '#475569' },
            }),
            createCanvasElement('form', 680, 72, {
                id: 'contact-form-card',
                width: 420,
                height: 430,
                props: {
                    formId: `form-${formSlug}-contact`,
                    formName: `${formSlug}-contact`,
                    formTitle: 'Contact form',
                    formDescription: 'Public contact form generated from the page canvas.',
                    successMessage: 'Thanks. We will reply soon.',
                    enableHoneypot: true,
                    contactShareEnabled: true,
                    contactShareNameField: 'name',
                    contactShareEmailField: 'email',
                    contactShareNotesField: 'message',
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    borderStyle: 'solid',
                },
                children: [
                    createCanvasElement('input', 24, 30, { id: 'contact-name', width: 360, height: 54, props: { label: 'Name', name: 'name', placeholder: 'Your name', required: true } }),
                    createCanvasElement('input', 24, 104, { id: 'contact-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                    createCanvasElement('textarea', 24, 180, { id: 'contact-message', width: 360, height: 110, props: { label: 'Message', name: 'message', placeholder: 'Tell us what you need', required: true } }),
                    createCanvasElement('button', 24, 326, { id: 'contact-submit', width: 170, height: 48, props: { label: 'Send message', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                ],
            }),
        ];
    }

    if (input.template === 'registration') {
        return [
            createCanvasElement('section', 0, 0, {
                id: 'registration-hero-section',
                width: 1200,
                height: 680,
                props: { backgroundColor: '#f7f8f4', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 74, 96, {
                        id: 'registration-heading',
                        width: 540,
                        height: 120,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 78, 238, {
                        id: 'registration-copy',
                        width: 500,
                        height: 110,
                        props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#4b5563' },
                    }),
                    createCanvasElement('box', 78, 392, {
                        id: 'registration-note',
                        width: 470,
                        height: 112,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#d8ded2', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 18, {
                                id: 'registration-note-heading',
                                width: 380,
                                height: 32,
                                props: { content: 'What happens next', level: 'h3', fontSize: 18, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 56, {
                                id: 'registration-note-copy',
                                width: 390,
                                height: 42,
                                props: { content: 'Submissions land in Backy Forms and Contacts, ready for approval, export, or collection routing.', fontSize: 14, lineHeight: 1.45, color: '#556052' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 70, {
                        id: 'registration-form-card',
                        width: 430,
                        height: 560,
                        props: {
                            formId: `form-${formSlug}-registration`,
                            formName: `${formSlug}-registration`,
                            formTitle: 'Registration form',
                            formDescription: 'Public registration form generated from the page canvas.',
                            successMessage: 'Registration received. Check your inbox for the next step.',
                            enableHoneypot: true,
                            moderationMode: 'manual',
                            contactShareEnabled: true,
                            contactShareNameField: 'full_name',
                            contactShareEmailField: 'email',
                            contactSharePhoneField: 'phone',
                            contactShareNotesField: 'member_type',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#d8ded2',
                            borderWidth: 1,
                            borderStyle: 'solid',
                        },
                        children: [
                            createCanvasElement('input', 24, 34, { id: 'registration-name', width: 360, height: 54, props: { label: 'Full name', name: 'full_name', placeholder: 'Ada Lovelace', required: true } }),
                            createCanvasElement('input', 24, 106, { id: 'registration-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                            createCanvasElement('input', 24, 178, { id: 'registration-phone', width: 360, height: 54, props: { label: 'Phone', name: 'phone', inputType: 'tel', placeholder: '+1 555 0100', required: false } }),
                            createCanvasElement('select', 24, 250, { id: 'registration-member-type', width: 360, height: 54, props: { label: 'Member type', name: 'member_type', options: ['Customer', 'Creator', 'Partner'], placeholder: 'Choose a type', required: true } }),
                            createCanvasElement('checkbox', 24, 330, { id: 'registration-consent', width: 360, height: 42, props: { label: 'I agree to be contacted about this registration.', name: 'consent', required: true } }),
                            createCanvasElement('button', 24, 414, { id: 'registration-submit', width: 190, height: 50, props: { label: 'Create account', backgroundColor: '#14532d', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                        ],
                    }),
                ],
            }),
        ];
    }

    return [
        createCanvasElement('heading', 100, 96, {
            id: 'blank-heading',
            width: 560,
            height: 72,
            props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', color: '#111827' },
        }),
        createCanvasElement('paragraph', 102, 188, {
            id: 'blank-intro',
            width: 620,
            height: 110,
            props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#475569' },
        }),
    ];
}
