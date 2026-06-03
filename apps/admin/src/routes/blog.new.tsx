/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useCallback, useEffect, useState, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, Eye, FileText, Globe, Image as ImageIcon, LayoutTemplate, Maximize2, Minimize2, MoreHorizontal, PenLine, RefreshCw, Save, Search, SearchCheck, Tags, UserRound, X } from 'lucide-react';
import {
    createBlogPost,
    createBlogPostPreview,
    getAdminApiBase,
    getSiteFrontendDesign,
    getUserPermissions,
    listBlogPosts,
    listBlogAuthors,
    listBlogCategories,
    listBlogTags,
    type AdminUserPermissionMatrix,
    type BlogPostInput,
    type BlogAuthor,
    type BlogCategory,
    type BlogTag,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor, collectInteractiveReadinessIssues } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useAuthStore, type User } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import {
  getVisiblePageTemplateOptions,
  PAGE_TEMPLATE_LIBRARY_CATEGORIES,
  type PageTemplateLibraryCategory,
  type PageTemplateLibraryOption,
} from '@/lib/pageCreateTemplateLibrary';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import type { SiteSettings } from '@backy-cms/core';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  extractFrontendTemplateDesignSerialization,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

interface BlogNewSearch {
    siteId?: string;
    focus?: 'canvas';
    templateSource?: BlogTemplateSourceMode;
    starterTemplate?: BlogStarterTemplate;
    designTemplate?: string;
    frontendDesignTemplateId?: string;
    frontendTemplate?: string;
}

type BlogTemplateSourceMode = 'backy-canvas' | 'custom-frontend';
type BlogStarterIntent = 'article' | 'investigation' | 'audio-transcript' | 'newsletter' | 'case-study';
type BlogStarterTemplate = 'blank' | 'landing' | 'storefront' | 'product-detail' | 'pricing' | 'services' | 'booking' | 'portfolio' | 'gallery' | 'events' | 'privacy' | 'terms' | 'cookie-policy' | 'accessibility-statement' | 'refund-policy' | 'shipping-policy' | 'cart' | 'checkout' | 'order-confirmation' | 'help-center' | 'faq' | 'testimonials' | 'blog-index' | 'blog-post' | 'team' | 'careers' | 'about' | 'contact' | 'newsletter' | 'survey' | 'registration' | 'member-login' | 'member-account';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface BlogCreateAutosaveDraft {
    version: 1;
    savedAt: string;
    activeSiteId: string;
    title: string;
    slug: string;
    excerpt: string;
    status: 'draft' | 'published' | 'scheduled';
    scheduledAt: string | null;
    seoTitle: string;
    seoDescription: string;
    canonicalPath: string;
    featuredImageId: string | null;
    ogImage: string;
    noIndex: boolean;
    noFollow: boolean;
    selectedCategoryIds: string[];
    selectedTagIds: string[];
    selectedAuthorId: string;
    canvasElements: CanvasElement[];
    canvasSize: CanvasSize;
    selectedBlogStarterIntent?: BlogStarterIntent;
    selectedBlogStarterTemplate?: BlogStarterTemplate;
    templateSourceMode?: BlogTemplateSourceMode;
    designTemplateId?: string;
    frontendDesignSource?: SiteFrontendDesignContract['source'] | null;
    frontendDesignTokens?: SiteFrontendDesignContract['tokens'] | null;
    frontendDesignChrome?: SiteFrontendDesignContract['chrome'] | null;
}

type BlogCreationStatus = BlogCreateAutosaveDraft['status'];

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizedFrontendDesignTemplateSearch = (search: Record<string, unknown>): string | undefined => (
    normalizedSearchString(search.designTemplate)
    || normalizedSearchString(search.frontendDesignTemplateId)
    || normalizedSearchString(search.frontendTemplate)
);

const isBlogTemplateSourceMode = (value: unknown): value is BlogTemplateSourceMode => (
    value === 'backy-canvas' || value === 'custom-frontend'
);

export const Route = createFileRoute('/blog/new')({
    validateSearch: (search: Record<string, unknown>): BlogNewSearch => ({
        siteId: normalizedSearchString(search.siteId),
        focus: search.focus === 'canvas' ? 'canvas' : undefined,
        templateSource: isBlogTemplateSourceMode(search.templateSource) ? search.templateSource : undefined,
        starterTemplate: isBlogStarterTemplate(search.starterTemplate) ? search.starterTemplate : undefined,
        designTemplate: normalizedFrontendDesignTemplateSearch(search),
        frontendDesignTemplateId: normalizedSearchString(search.frontendDesignTemplateId),
        frontendTemplate: normalizedSearchString(search.frontendTemplate),
    }),
    component: NewBlogPostPage,
});

const BLOG_CREATE_AUTOSAVE_KEY = 'backy:blog-new:draft:v1';

type BlogCreatePermissionKey =
  | 'pages.view'
  | 'pages.edit'
  | 'pages.publish'
  | 'media.view'
  | 'media.create'
  | 'collections.view'
  | 'sites.view'
  | 'sites.configure';

const BLOG_CREATE_PERMISSION_ROLE_DEFAULTS: Record<BlogCreatePermissionKey, Array<User['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.create': ['owner', 'admin', 'editor'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.configure': ['owner', 'admin'],
};

const BLOG_CREATE_CONTROL_AREAS = [
    {
        title: 'Editorial draft',
        detail: 'Title, slug, excerpt, status, and SEO summary for lists and feeds.',
        href: '#blog-create-draft',
    },
    {
        title: 'Design canvas',
        detail: 'Reusable component editor for the public article page.',
        href: '#blog-create-canvas',
    },
    {
        title: 'Writing structure',
        detail: 'Article sections, pull quotes, word count, and reading-time planning.',
        href: '#blog-create-writing',
    },
    {
        title: 'Publishing',
        detail: 'Draft, publish, schedule, readiness, and save controls.',
        href: '#blog-create-publish',
    },
    {
        title: 'SEO',
        detail: 'Search title, canonical path, description, Open Graph image, and robots controls.',
        href: '#blog-create-seo',
    },
    {
        title: 'Site and author',
        detail: 'Target website and author profile for the new article.',
        href: '#blog-create-owner',
    },
    {
        title: 'Featured media',
        detail: 'Select the image used by blog lists, social previews, feeds, and custom frontend cards.',
        href: '#blog-create-media',
    },
    {
        title: 'Taxonomy',
        detail: 'Categories and tags used by blog lists, filters, and feeds.',
        href: '#blog-create-taxonomy',
    },
    {
        title: 'API handoff',
        detail: 'Create endpoint, payload preview, frontend route, and canvas contract.',
        href: '#blog-create-api',
    },
] as const;

const BLOG_CREATE_WORKFLOW = [
    { label: 'Draft', detail: 'Write title, slug, excerpt, author, and taxonomy for the article record.' },
    { label: 'Design', detail: 'Use the canvas to build the public post layout with reusable components and bindings.' },
    { label: 'Check', detail: 'Confirm summary, route, schedule state, and canvas content before saving.' },
    { label: 'Ship', detail: 'Save draft, publish immediately, or schedule the post for the selected site.' },
] as const;

const BLOG_STARTER_INTENTS: Array<{
    id: BlogStarterIntent;
    name: string;
    desc: string;
    sections: string[];
    aliases: string[];
}> = [
    {
        id: 'article',
        name: 'Article post',
        desc: 'Editorial hero, body, taxonomy, and related story structure.',
        sections: ['Hero', 'Body', 'Related'],
        aliases: ['article', 'blog post', 'post', 'story', 'editorial'],
    },
    {
        id: 'investigation',
        name: 'Investigation report',
        desc: 'Long-form reporting with evidence, timeline, sources, and quote blocks.',
        sections: ['Report', 'Evidence', 'Sources'],
        aliases: ['investigation', 'report', 'journalism', 'analysis', 'scam', 'evidence'],
    },
    {
        id: 'audio-transcript',
        name: 'Audio transcript',
        desc: 'Audio player, transcript body, notes, and downloadable source files.',
        sections: ['Audio', 'Transcript', 'Files'],
        aliases: ['audio', 'podcast', 'transcript', 'recording', 'voice'],
    },
    {
        id: 'newsletter',
        name: 'Newsletter issue',
        desc: 'Issue header, intro, curated links, subscriber CTA, and archive metadata.',
        sections: ['Issue', 'Links', 'Subscribe'],
        aliases: ['newsletter', 'issue', 'digest', 'subscriber', 'email'],
    },
    {
        id: 'case-study',
        name: 'Case study',
        desc: 'Problem, process, media, outcomes, and reusable proof sections.',
        sections: ['Problem', 'Process', 'Outcome'],
        aliases: ['case study', 'case', 'portfolio', 'proof', 'project'],
    },
];

type BlogStarterTemplateOption = PageTemplateLibraryOption<BlogStarterTemplate> & {
    intent: BlogStarterIntent;
    aliases: string[];
};

const BLOG_STARTER_TEMPLATE_OPTIONS: BlogStarterTemplateOption[] = [
    { id: 'blank', name: 'Blank post', desc: 'A clean article canvas with title, excerpt, and body blocks.', detail: 'Best when you want to compose a custom story layout from scratch.', sections: ['Article hero', 'Body'], intent: 'article', aliases: ['blank', 'article', 'story', 'post'] },
    { id: 'landing', name: 'Announcement post', desc: 'Hero, value points, and a reader call to action.', detail: 'Useful for launches, public notices, campaign updates, and editorial announcements.', sections: ['Hero', 'Highlights', 'CTA'], intent: 'article', aliases: ['landing', 'announcement', 'launch', 'update'] },
    { id: 'storefront', name: 'Store update', desc: 'Product story, catalog references, and shopping CTA.', detail: 'Turns commerce updates into editable editorial posts that can bind to products.', sections: ['Product story', 'Catalog links', 'CTA'], intent: 'case-study', aliases: ['store', 'shop', 'product', 'commerce'] },
    { id: 'product-detail', name: 'Product story', desc: 'Product media, details, use cases, and related items.', detail: 'Good for deep product articles, launch notes, and comparison posts.', sections: ['Product media', 'Details', 'Related'], intent: 'case-study', aliases: ['product', 'detail', 'feature'] },
    { id: 'pricing', name: 'Pricing explainer', desc: 'Plan context, feature comparison, and buyer FAQ.', detail: 'Use when a post needs to explain packages, pricing changes, or subscription choices.', sections: ['Context', 'Plan table', 'FAQ'], intent: 'article', aliases: ['pricing', 'plans', 'subscription'] },
    { id: 'services', name: 'Service guide', desc: 'Service overview, process, outcomes, and booking CTA.', detail: 'Creates a practical service article that can become an onboarding or sales resource.', sections: ['Overview', 'Process', 'Booking'], intent: 'case-study', aliases: ['services', 'guide', 'process'] },
    { id: 'booking', name: 'Booking article', desc: 'Session intro, availability notes, and scheduling handoff.', detail: 'Good for explaining appointments, consultations, workshops, or public sessions.', sections: ['Intro', 'Availability', 'Schedule'], intent: 'article', aliases: ['booking', 'appointment', 'calendar'] },
    { id: 'portfolio', name: 'Portfolio story', desc: 'Featured work, project context, media, and inquiry CTA.', detail: 'Turns portfolio work into a rich case-study post.', sections: ['Work hero', 'Project media', 'Inquiry'], intent: 'case-study', aliases: ['portfolio', 'work', 'project'] },
    { id: 'gallery', name: 'Media essay', desc: 'Image, video, audio, and file-backed story blocks.', detail: 'Useful for photo essays, evidence galleries, travel logs, and visual reporting.', sections: ['Media hero', 'Gallery', 'Files'], intent: 'article', aliases: ['gallery', 'media', 'images', 'video', 'files'] },
    { id: 'events', name: 'Event recap', desc: 'Event context, agenda, media, and RSVP/follow-up actions.', detail: 'Good for event reports, upcoming event announcements, and meeting notes.', sections: ['Event hero', 'Agenda', 'Follow-up'], intent: 'article', aliases: ['event', 'webinar', 'meetup', 'recap'] },
    { id: 'privacy', name: 'Privacy update', desc: 'Policy summary, data-use sections, and reader action.', detail: 'Use for transparent public notes about privacy, data use, or policy changes.', sections: ['Summary', 'Data use', 'Contact'], intent: 'article', aliases: ['privacy', 'policy', 'data'] },
    { id: 'terms', name: 'Terms update', desc: 'Service rule changes, acceptable use, and support handoff.', detail: 'Good for publishing terms changes or platform operation notes.', sections: ['Summary', 'Rules', 'Support'], intent: 'article', aliases: ['terms', 'rules', 'policy'] },
    { id: 'cookie-policy', name: 'Cookie update', desc: 'Cookie category explanation and preference CTA.', detail: 'Use for consent, analytics, and tracking transparency posts.', sections: ['Categories', 'Consent', 'Preferences'], intent: 'article', aliases: ['cookie', 'consent', 'analytics'] },
    { id: 'accessibility-statement', name: 'Accessibility note', desc: 'Access commitment, known limitations, and feedback CTA.', detail: 'Creates an accessibility progress post with public feedback routing.', sections: ['Commitment', 'Standards', 'Feedback'], intent: 'article', aliases: ['accessibility', 'wcag', 'assistive'] },
    { id: 'refund-policy', name: 'Refund update', desc: 'Refund windows, exceptions, and customer support path.', detail: 'Good for commerce policy explainers and customer support updates.', sections: ['Rules', 'Exceptions', 'Support'], intent: 'article', aliases: ['refund', 'returns', 'support'] },
    { id: 'shipping-policy', name: 'Shipping update', desc: 'Delivery timelines, methods, rates, and tracking notes.', detail: 'Use for shipping explainers, delay notices, and fulfillment updates.', sections: ['Timeline', 'Methods', 'Tracking'], intent: 'article', aliases: ['shipping', 'delivery', 'tracking'] },
    { id: 'cart', name: 'Cart guide', desc: 'Cart behavior, discounts, checkout handoff, and FAQ.', detail: 'Creates a support article for shopping, cart, and checkout workflows.', sections: ['Cart items', 'Totals', 'FAQ'], intent: 'article', aliases: ['cart', 'checkout', 'shopping'] },
    { id: 'checkout', name: 'Checkout guide', desc: 'Checkout steps, payment handoff, and customer details.', detail: 'Use to explain checkout flows without exposing payment secrets.', sections: ['Steps', 'Payment', 'Help'], intent: 'article', aliases: ['checkout', 'payment', 'order'] },
    { id: 'order-confirmation', name: 'Order update', desc: 'Receipt status, fulfillment notes, and support actions.', detail: 'Good for post-purchase guides and fulfillment announcement posts.', sections: ['Status', 'Receipt', 'Next steps'], intent: 'article', aliases: ['order', 'receipt', 'confirmation'] },
    { id: 'help-center', name: 'Help article', desc: 'Searchable support article with steps, FAQs, and escalation.', detail: 'Creates a practical knowledge-base style blog post.', sections: ['Problem', 'Steps', 'FAQ'], intent: 'article', aliases: ['help', 'support', 'knowledge base'] },
    { id: 'faq', name: 'FAQ post', desc: 'Question list, category notes, and support CTA.', detail: 'Good for explainer posts where answers should be skimmable.', sections: ['Questions', 'Answers', 'Support'], intent: 'article', aliases: ['faq', 'questions', 'answers'] },
    { id: 'testimonials', name: 'Proof story', desc: 'Quote, proof points, source context, and inquiry CTA.', detail: 'Turns testimonials and proof into a reusable public story.', sections: ['Proof hero', 'Quotes', 'Inquiry'], intent: 'case-study', aliases: ['testimonials', 'reviews', 'proof'] },
    { id: 'blog-index', name: 'Editorial index note', desc: 'Publication intro, featured story, and article-list context.', detail: 'Use when explaining a publication series, beat, archive, or editorial package.', sections: ['Editorial intro', 'Featured story', 'Article list'], intent: 'article', aliases: ['blog index', 'archive', 'publication'] },
    { id: 'blog-post', name: 'Blog post', desc: 'Article hero, post body, author card, taxonomy, and related posts.', detail: 'The default long-form post template for articles, reports, and essays.', sections: ['Article hero', 'Post body', 'Related posts'], intent: 'article', aliases: ['blog post', 'article', 'post', 'story', 'editorial'] },
    { id: 'team', name: 'Profile story', desc: 'Person or team context, role notes, and hiring/contact CTA.', detail: 'Good for founder notes, team profiles, interviews, and organization updates.', sections: ['Profile', 'Role', 'CTA'], intent: 'case-study', aliases: ['team', 'profile', 'people'] },
    { id: 'careers', name: 'Careers post', desc: 'Role story, benefits, hiring process, and application CTA.', detail: 'Creates an editorial job or hiring announcement with Backy-managed content.', sections: ['Role', 'Benefits', 'Apply'], intent: 'article', aliases: ['careers', 'jobs', 'hiring'] },
    { id: 'about', name: 'About story', desc: 'Origin story, values, people, and trust-building sections.', detail: 'Good for personal updates, organization stories, and background essays.', sections: ['Story', 'Values', 'People'], intent: 'case-study', aliases: ['about', 'story', 'values'] },
    { id: 'contact', name: 'Contact update', desc: 'Contact context, response expectations, and form CTA.', detail: 'Use for public callouts, intake posts, or reader-response workflows.', sections: ['Intro', 'Form CTA', 'Response'], intent: 'article', aliases: ['contact', 'intake', 'response'] },
    { id: 'newsletter', name: 'Newsletter issue', desc: 'Issue header, intro, curated links, subscriber CTA, and archive metadata.', detail: 'Creates a newsletter-style blog post that can also appear as a public archive issue.', sections: ['Issue hero', 'Curated links', 'Subscribe'], intent: 'newsletter', aliases: ['newsletter', 'issue', 'digest', 'subscriber', 'email'] },
    { id: 'survey', name: 'Survey results', desc: 'Question summary, response findings, and next-step CTA.', detail: 'Use to publish survey results or request structured reader feedback.', sections: ['Question', 'Findings', 'CTA'], intent: 'investigation', aliases: ['survey', 'results', 'feedback'] },
    { id: 'registration', name: 'Registration post', desc: 'Signup context, fields, consent, and confirmation notes.', detail: 'Good for event, member, or campaign registration explainers.', sections: ['Signup intro', 'Fields', 'Consent'], intent: 'article', aliases: ['registration', 'signup', 'members'] },
    { id: 'member-login', name: 'Member access note', desc: 'Access instructions, account copy, and registration handoff.', detail: 'Use to explain private-resource access without collecting passwords in content forms.', sections: ['Access', 'Account', 'Register'], intent: 'article', aliases: ['member login', 'access', 'account'] },
    { id: 'member-account', name: 'Member account guide', desc: 'Profile, preferences, resources, and protected-content notes.', detail: 'Good for guides that explain member dashboards or private content workflows.', sections: ['Profile', 'Preferences', 'Resources'], intent: 'article', aliases: ['member account', 'profile', 'preferences'] },
];

const BLOG_STARTER_TEMPLATE_BY_ID = new Map(BLOG_STARTER_TEMPLATE_OPTIONS.map((template) => [template.id, template]));

const getBlogStarterTemplate = (templateId: BlogStarterTemplate) => (
    BLOG_STARTER_TEMPLATE_BY_ID.get(templateId) || BLOG_STARTER_TEMPLATE_BY_ID.get('blog-post') || BLOG_STARTER_TEMPLATE_OPTIONS[0]
);

const isBlogStarterTemplate = (value: unknown): value is BlogStarterTemplate => (
    typeof value === 'string' && BLOG_STARTER_TEMPLATE_BY_ID.has(value as BlogStarterTemplate)
);

const blogStarterTemplateFromIntent = (intent: BlogStarterIntent | undefined): BlogStarterTemplate => {
    switch (intent) {
        case 'investigation':
            return 'survey';
        case 'audio-transcript':
            return 'gallery';
        case 'newsletter':
            return 'newsletter';
        case 'case-study':
            return 'portfolio';
        case 'article':
        default:
            return 'blog-post';
    }
};

const createInitialBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-article-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 360,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'coverImage'] }],
        props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 74, 64, {
                id: 'blog-article-kicker',
                width: 220,
                height: 28,
                props: { content: 'Article', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 104, {
                id: 'blog-article-heading',
                width: 660,
                height: 106,
                props: { content: 'Article title', level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
            }),
            createCanvasElement('paragraph', 76, 226, {
                id: 'blog-article-excerpt',
                width: 560,
                height: 72,
                props: { content: 'Use the excerpt for feed previews, SEO summaries, and the public article opening.', fontSize: 17, lineHeight: 1.55, color: '#475569' },
            }),
            createCanvasElement('box', 790, 70, {
                id: 'blog-article-cover',
                width: 300,
                height: 220,
                dataBindings: [{ source: 'blog', mode: 'current', fields: ['coverImage'] }],
                props: { backgroundColor: '#e2e8f0', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
            }),
        ],
    }),
    createCanvasElement('section', 0, 360, {
        id: 'blog-article-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 480,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('paragraph', 220, 72, {
                id: 'blog-article-lede',
                width: 760,
                height: 112,
                props: {
                    content: 'Start writing your story here. Replace this with rich text, media, quotes, product embeds, forms, or collection-backed sections.',
                    fontSize: 20,
                    lineHeight: 1.7,
                    color: '#334155',
                },
            }),
            createCanvasElement('quote', 260, 226, {
                id: 'blog-article-quote',
                width: 680,
                height: 120,
                props: {
                    content: 'Save reusable article sections and reuse them across posts when the publication has a repeated style.',
                    fontSize: 22,
                    lineHeight: 1.5,
                    color: '#0f172a',
                },
            }),
        ],
    }),
], {
    title: 'Blog article',
    variant: 'blog-article',
    navItems: ['Home', 'Blog', 'About', 'Contact'],
    headerActionLabel: 'Subscribe',
    footerCopy: 'Edit this article footer, save it as a reusable section, or bind it to publication navigation.',
});

const createInvestigationBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-investigation-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 430,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'coverImage'] }],
        props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 72, 62, {
                id: 'blog-investigation-kicker',
                width: 260,
                height: 28,
                props: { content: 'Investigation', fontSize: 13, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 106, {
                id: 'blog-investigation-heading',
                width: 690,
                height: 120,
                props: { content: 'Report title', level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827', binding: 'post.title' },
            }),
            createCanvasElement('paragraph', 76, 248, {
                id: 'blog-investigation-summary',
                width: 610,
                height: 92,
                props: { content: 'Summarize the public-interest question, who is affected, and what readers will learn from the evidence.', fontSize: 18, lineHeight: 1.55, color: '#475569', binding: 'post.excerpt' },
            }),
            createCanvasElement('box', 800, 78, {
                id: 'blog-investigation-evidence-card',
                width: 300,
                height: 250,
                props: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 28, {
                        id: 'blog-investigation-evidence-heading',
                        width: 230,
                        height: 42,
                        props: { content: 'Evidence status', level: 'h2', fontSize: 24, fontWeight: '800', color: '#7c2d12' },
                    }),
                    createCanvasElement('paragraph', 28, 88, {
                        id: 'blog-investigation-evidence-copy',
                        width: 230,
                        height: 118,
                        props: { content: 'List records checked, source confidence, and what still needs verification before publishing.', fontSize: 15, lineHeight: 1.55, color: '#7c2d12' },
                    }),
                ],
            }),
        ],
    }),
    createCanvasElement('section', 0, 430, {
        id: 'blog-investigation-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 780,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content', 'taxonomy', 'relatedPosts'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('heading', 120, 70, {
                id: 'blog-investigation-findings-heading',
                width: 440,
                height: 56,
                props: { content: 'Key findings', level: 'h2', fontSize: 38, fontWeight: '800', lineHeight: 1.15, color: '#0f172a', binding: 'post.content.section' },
            }),
            createCanvasElement('paragraph', 120, 146, {
                id: 'blog-investigation-findings-copy',
                width: 760,
                height: 120,
                props: { content: 'Write the verified findings in plain language. Use short paragraphs and cite the evidence cards below when readers need the source trail.', fontSize: 18, lineHeight: 1.7, color: '#334155', binding: 'post.content.body' },
            }),
            createCanvasElement('box', 120, 320, {
                id: 'blog-investigation-timeline',
                width: 450,
                height: 290,
                props: { backgroundColor: '#f8fafc', borderColor: '#dbe3ef', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 26, {
                        id: 'blog-investigation-timeline-heading',
                        width: 360,
                        height: 40,
                        props: { content: 'Timeline', level: 'h3', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                    }),
                    createCanvasElement('list', 28, 84, {
                        id: 'blog-investigation-timeline-list',
                        width: 380,
                        height: 170,
                        props: { items: ['Date - event and source', 'Date - official response', 'Date - reader impact'], fontSize: 16, lineHeight: 1.7, color: '#334155' },
                    }),
                ],
            }),
            createCanvasElement('box', 630, 320, {
                id: 'blog-investigation-sources',
                width: 450,
                height: 290,
                props: { backgroundColor: '#f8fafc', borderColor: '#dbe3ef', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 26, {
                        id: 'blog-investigation-sources-heading',
                        width: 360,
                        height: 40,
                        props: { content: 'Sources and documents', level: 'h3', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 28, 84, {
                        id: 'blog-investigation-sources-copy',
                        width: 380,
                        height: 150,
                        props: { content: 'Attach public documents, media, quotes, and source notes here. Private source details should stay outside the public render payload.', fontSize: 16, lineHeight: 1.65, color: '#334155' },
                    }),
                ],
            }),
            createCanvasElement('quote', 220, 656, {
                id: 'blog-investigation-editor-note',
                width: 760,
                height: 82,
                props: { content: 'Editorial note: separate verified facts, allegations, and open questions before publishing.', fontSize: 22, fontWeight: '700', lineHeight: 1.45, color: '#0f172a' },
            }),
        ],
    }),
], {
    title: 'Investigation report',
    variant: 'blog-investigation',
    navItems: ['Home', 'Blog', 'Reports', 'Contact'],
    headerActionLabel: 'Subscribe',
    footerCopy: 'Keep source notes, corrections, and public-interest context reusable across investigation posts.',
});

const createAudioTranscriptBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-audio-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 420,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'media'] }],
        props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 72, 62, {
                id: 'blog-audio-kicker',
                width: 250,
                height: 28,
                props: { content: 'Audio transcript', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 104, {
                id: 'blog-audio-heading',
                width: 640,
                height: 112,
                props: { content: 'Interview or recording title', level: 'h1', fontSize: 50, fontWeight: '800', lineHeight: 1.1, color: '#111827', binding: 'post.title' },
            }),
            createCanvasElement('paragraph', 76, 238, {
                id: 'blog-audio-excerpt',
                width: 560,
                height: 82,
                props: { content: 'Introduce the recording, speaker, date, and why this transcript matters.', fontSize: 18, lineHeight: 1.6, color: '#475569', binding: 'post.excerpt' },
            }),
            createCanvasElement('audio', 760, 110, {
                id: 'blog-audio-player',
                width: 340,
                height: 126,
                props: {
                    caption: 'Upload or select the audio recording',
                    transcript: 'Transcript will be edited below.',
                    controls: true,
                    preload: 'metadata',
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderRadius: 12,
                },
            }),
            createCanvasElement('button', 760, 258, {
                id: 'blog-audio-download-action',
                width: 210,
                height: 48,
                props: { label: 'Attach source file', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: 8, fontWeight: '700', action: 'media.download' },
            }),
        ],
    }),
    createCanvasElement('section', 0, 420, {
        id: 'blog-audio-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 820,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content', 'media', 'attachments'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('heading', 180, 74, {
                id: 'blog-audio-transcript-heading',
                width: 420,
                height: 54,
                props: { content: 'Transcript', level: 'h2', fontSize: 38, fontWeight: '800', color: '#0f172a', binding: 'post.content.section' },
            }),
            createCanvasElement('paragraph', 180, 150, {
                id: 'blog-audio-transcript-copy',
                width: 760,
                height: 230,
                props: {
                    content: 'Paste the cleaned transcript here. Add speaker labels, timestamps, corrections, and links to referenced documents or pages.',
                    fontSize: 18,
                    lineHeight: 1.75,
                    color: '#334155',
                    binding: 'post.content.body',
                },
            }),
            createCanvasElement('box', 180, 430, {
                id: 'blog-audio-notes',
                width: 760,
                height: 170,
                props: { backgroundColor: '#f8fafc', borderColor: '#dbe3ef', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 24, {
                        id: 'blog-audio-notes-heading',
                        width: 380,
                        height: 36,
                        props: { content: 'Notes and corrections', level: 'h3', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 28, 78, {
                        id: 'blog-audio-notes-copy',
                        width: 680,
                        height: 70,
                        props: { content: 'Track edits, speaker clarifications, source links, and public correction history before publishing.', fontSize: 16, lineHeight: 1.55, color: '#334155' },
                    }),
                ],
            }),
            createCanvasElement('box', 180, 640, {
                id: 'blog-audio-files',
                width: 760,
                height: 120,
                props: { backgroundColor: '#ecfeff', borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('paragraph', 28, 28, {
                        id: 'blog-audio-files-copy',
                        width: 680,
                        height: 58,
                        props: { content: 'Attach audio, transcript PDF, source documents, or supporting files from Media. Public and protected file visibility stays controlled by media settings.', fontSize: 16, lineHeight: 1.55, color: '#0f766e' },
                    }),
                ],
            }),
        ],
    }),
], {
    title: 'Audio transcript',
    variant: 'blog-audio-transcript',
    navItems: ['Home', 'Blog', 'Audio', 'Contact'],
    headerActionLabel: 'Subscribe',
    footerCopy: 'Audio, transcript, and source-file metadata remain editable through Backy media and post content APIs.',
});

const createNewsletterIssueBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-newsletter-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 390,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'publishedAt', 'newsletter'] }],
        props: { backgroundColor: '#f0fdfa', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 72, 62, {
                id: 'blog-newsletter-kicker',
                width: 230,
                height: 28,
                props: { content: 'Newsletter issue', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 104, {
                id: 'blog-newsletter-heading',
                width: 640,
                height: 112,
                props: { content: 'Issue headline', level: 'h1', fontSize: 50, fontWeight: '800', lineHeight: 1.1, color: '#0f172a', binding: 'post.title' },
            }),
            createCanvasElement('paragraph', 76, 238, {
                id: 'blog-newsletter-intro',
                width: 580,
                height: 84,
                props: { content: 'Write the short opening note subscribers see before curated links, updates, and the archive version.', fontSize: 18, lineHeight: 1.6, color: '#334155', binding: 'post.excerpt' },
            }),
            createCanvasElement('form', 790, 92, {
                id: 'blog-newsletter-signup',
                width: 310,
                height: 220,
                props: { formType: 'newsletter', title: 'Subscribe', submitLabel: 'Join newsletter', backgroundColor: '#ffffff', borderColor: '#99f6e4', borderWidth: 1, borderStyle: 'solid', borderRadius: 12 },
                children: [
                    createCanvasElement('input', 28, 70, {
                        id: 'blog-newsletter-email',
                        width: 250,
                        height: 48,
                        props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true },
                    }),
                    createCanvasElement('button', 28, 140, {
                        id: 'blog-newsletter-submit',
                        width: 190,
                        height: 46,
                        props: { label: 'Join newsletter', type: 'submit', backgroundColor: '#0f766e', color: '#ffffff', borderRadius: 8, fontWeight: '700' },
                    }),
                ],
            }),
        ],
    }),
    createCanvasElement('section', 0, 390, {
        id: 'blog-newsletter-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 700,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content', 'newsletterIssue', 'relatedPosts'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('heading', 180, 72, {
                id: 'blog-newsletter-top-stories-heading',
                width: 440,
                height: 52,
                props: { content: 'In this issue', level: 'h2', fontSize: 38, fontWeight: '800', color: '#0f172a' },
            }),
            createCanvasElement('list', 180, 150, {
                id: 'blog-newsletter-link-list',
                width: 760,
                height: 210,
                props: { items: ['Lead story or investigation', 'Curated link with one-line context', 'Update, note, or call to action'], fontSize: 18, lineHeight: 1.75, color: '#334155', binding: 'post.content.links' },
            }),
            createCanvasElement('box', 180, 420, {
                id: 'blog-newsletter-archive-note',
                width: 760,
                height: 180,
                props: { backgroundColor: '#f8fafc', borderColor: '#dbe3ef', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 26, {
                        id: 'blog-newsletter-archive-heading',
                        width: 420,
                        height: 38,
                        props: { content: 'Archive and delivery notes', level: 'h3', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 28, 84, {
                        id: 'blog-newsletter-archive-copy',
                        width: 680,
                        height: 74,
                        props: { content: 'Backy stores the issue draft, subscriber-safe handoff, and public archive payload. External email delivery remains provider-backed.', fontSize: 16, lineHeight: 1.55, color: '#334155' },
                    }),
                ],
            }),
        ],
    }),
], {
    title: 'Newsletter issue',
    variant: 'blog-newsletter',
    navItems: ['Home', 'Blog', 'Newsletter', 'Contact'],
    headerActionLabel: 'Subscribe',
    footerCopy: 'Newsletter archive content, signup forms, and subscriber-safe issue metadata stay API-addressable.',
});

const createCaseStudyBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-case-study-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 420,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'coverImage', 'content'] }],
        props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 72, 62, {
                id: 'blog-case-study-kicker',
                width: 220,
                height: 28,
                props: { content: 'Case study', fontSize: 13, fontWeight: '800', color: '#2563eb', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 104, {
                id: 'blog-case-study-heading',
                width: 620,
                height: 112,
                props: { content: 'Project outcome headline', level: 'h1', fontSize: 50, fontWeight: '800', lineHeight: 1.1, color: '#111827', binding: 'post.title' },
            }),
            createCanvasElement('paragraph', 76, 238, {
                id: 'blog-case-study-excerpt',
                width: 560,
                height: 82,
                props: { content: 'Summarize the problem, audience, and measurable outcome.', fontSize: 18, lineHeight: 1.6, color: '#475569', binding: 'post.excerpt' },
            }),
            createCanvasElement('box', 770, 80, {
                id: 'blog-case-study-media',
                width: 330,
                height: 230,
                props: { backgroundColor: '#dbeafe', borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, binding: 'post.coverImage' },
            }),
        ],
    }),
    createCanvasElement('section', 0, 420, {
        id: 'blog-case-study-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 760,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content', 'media', 'relatedPosts'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            ...['Problem', 'Process', 'Outcome'].map((label, index) => createCanvasElement('box', 92 + index * 354, 76, {
                id: `blog-case-study-${label.toLowerCase()}`,
                width: 300,
                height: 250,
                props: { backgroundColor: '#f8fafc', borderColor: '#dbe3ef', borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 0 },
                children: [
                    createCanvasElement('heading', 28, 28, {
                        id: `blog-case-study-${label.toLowerCase()}-heading`,
                        width: 230,
                        height: 38,
                        props: { content: label, level: 'h2', fontSize: 24, fontWeight: '800', color: '#0f172a' },
                    }),
                    createCanvasElement('paragraph', 28, 86, {
                        id: `blog-case-study-${label.toLowerCase()}-copy`,
                        width: 230,
                        height: 126,
                        props: { content: `Describe the ${label.toLowerCase()} with concrete details, media, and data points.`, fontSize: 15, lineHeight: 1.55, color: '#334155' },
                    }),
                ],
            })),
            createCanvasElement('quote', 220, 390, {
                id: 'blog-case-study-proof-quote',
                width: 760,
                height: 120,
                props: { content: 'Add a measurable result, testimonial, or proof point that can be reused in portfolio and landing pages.', fontSize: 24, fontWeight: '700', lineHeight: 1.45, color: '#0f172a' },
            }),
            createCanvasElement('repeater', 220, 560, {
                id: 'blog-case-study-related-work',
                width: 760,
                height: 150,
                props: { collection: 'related-work', columns: 3, gap: 16, limit: 3, titleField: 'title', descriptionField: 'summary', emptyMessage: 'Add related work records from Collections.' },
            }),
        ],
    }),
], {
    title: 'Case study',
    variant: 'blog-case-study',
    navItems: ['Home', 'Blog', 'Work', 'Contact'],
    headerActionLabel: 'Start project',
    footerCopy: 'Case-study sections can be reused in portfolio pages and custom frontend proof rails.',
});

function createBlogStarterElements(intent: BlogStarterIntent): CanvasElement[] {
    switch (intent) {
        case 'investigation':
            return createInvestigationBlogElements();
        case 'audio-transcript':
            return createAudioTranscriptBlogElements();
        case 'newsletter':
            return createNewsletterIssueBlogElements();
        case 'case-study':
            return createCaseStudyBlogElements();
        case 'article':
        default:
            return createInitialBlogElements();
    }
}

function createBlogStarterTemplateElements(templateId: BlogStarterTemplate): CanvasElement[] {
    return createBlogStarterElements(getBlogStarterTemplate(templateId).intent);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildFrontendBlogTemplateElements(
    template: SiteFrontendDesignTemplate,
    input: { title: string; slug: string; excerpt: string },
): CanvasElement[] {
    const content = isRecord(template.content) ? template.content : {};
    const contentDocument = isRecord(content.contentDocument) ? content.contentDocument : {};

    if (Array.isArray(content.elements)) {
        return content.elements as CanvasElement[];
    }

    if (Array.isArray(contentDocument.elements)) {
        return contentDocument.elements as CanvasElement[];
    }

    const canvasWidth = template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width;
    const canvasHeight = template.canvasSize?.height || 900;

    return [
        createCanvasElement('section', 0, 0, {
            id: `frontend-blog-template-${template.id}`,
            width: canvasWidth,
            height: Math.max(620, canvasHeight - 160),
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'coverImage', 'content'] }],
            props: {
                backgroundColor: '#ffffff',
                borderRadius: 0,
                padding: 0,
                frontendTemplateId: template.id,
                frontendTemplateName: template.name,
                routePattern: template.routePattern,
            },
            children: [
                createCanvasElement('text', 72, 64, {
                    id: `frontend-blog-template-${template.id}-kicker`,
                    width: Math.min(280, canvasWidth - 144),
                    height: 32,
                    props: {
                        content: 'Article',
                        fontSize: 13,
                        fontWeight: '800',
                        color: '#0f766e',
                        textTransform: 'uppercase',
                    },
                }),
                createCanvasElement('heading', 72, 112, {
                    id: `frontend-blog-template-${template.id}-heading`,
                    width: Math.min(760, canvasWidth - 144),
                    height: 112,
                    props: {
                        content: input.title || template.name,
                        level: 'h1',
                        fontSize: 52,
                        fontWeight: '800',
                        lineHeight: 1.08,
                        color: '#111827',
                        binding: 'post.title',
                    },
                }),
                createCanvasElement('paragraph', 76, 246, {
                    id: `frontend-blog-template-${template.id}-excerpt`,
                    width: Math.min(680, canvasWidth - 152),
                    height: 92,
                    props: {
                        content: input.excerpt || template.description || 'This article page was seeded from the connected frontend design contract.',
                        fontSize: 18,
                        lineHeight: 1.6,
                        color: '#4b5563',
                        binding: 'post.excerpt',
                    },
                }),
                createCanvasElement('box', 76, 390, {
                    id: `frontend-blog-template-${template.id}-body-region`,
                    width: Math.min(860, canvasWidth - 152),
                    height: 220,
                    props: {
                        backgroundColor: '#f8fafc',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderRadius: 8,
                        binding: 'post.content',
                        bindingHints: template.bindingHints || [],
                    },
                    children: [
                        createCanvasElement('paragraph', 28, 30, {
                            id: `frontend-blog-template-${template.id}-body-copy`,
                            width: Math.min(760, canvasWidth - 220),
                            height: 96,
                            props: {
                                content: 'Replace this placeholder with captured article components, rich text blocks, embeds, or reusable frontend sections.',
                                fontSize: 16,
                                lineHeight: 1.5,
                                color: '#334155',
                            },
                        }),
                    ],
                }),
            ],
        }),
    ];
}

function updateFrontendBlogTemplateText(
    elements: CanvasElement[],
    template: SiteFrontendDesignTemplate,
    input: { title: string; excerpt: string },
): CanvasElement[] {
    const headingId = `frontend-blog-template-${template.id}-heading`;
    const excerptId = `frontend-blog-template-${template.id}-excerpt`;
    const nextTitle = input.title.trim();
    const nextExcerpt = input.excerpt.trim();

    const updateElement = (element: CanvasElement): CanvasElement => {
        const nextChildren = Array.isArray(element.children)
            ? element.children.map(updateElement)
            : element.children;

        if (element.id === headingId && nextTitle) {
            return {
                ...element,
                props: {
                    ...element.props,
                    content: nextTitle,
                },
                children: nextChildren,
            };
        }

        if (element.id === excerptId && nextExcerpt) {
            return {
                ...element,
                props: {
                    ...element.props,
                    content: nextExcerpt,
                },
                children: nextChildren,
            };
        }

        return nextChildren === element.children ? element : { ...element, children: nextChildren };
    };

    return elements.map(updateElement);
}

function hasFrontendBlogTemplateRoot(elements: CanvasElement[], template: SiteFrontendDesignTemplate): boolean {
    const templateRootId = `frontend-blog-template-${template.id}`;
    const visit = (element: CanvasElement): boolean => {
        if (element.id === templateRootId || element.props?.frontendTemplateId === template.id) {
            return true;
        }

        return Array.isArray(element.children) && element.children.some(visit);
    };

    return elements.some(visit);
}

function findFrontendBlogTemplateRoot(elements: CanvasElement[], templateId: string): CanvasElement | null {
    const templateRootId = `frontend-blog-template-${templateId}`;
    const visit = (element: CanvasElement): CanvasElement | null => {
        if (element.id === templateRootId || element.props?.frontendTemplateId === templateId) {
            return element;
        }

        if (!Array.isArray(element.children)) {
            return null;
        }

        for (const child of element.children) {
            const match = visit(child);
            if (match) {
                return match;
            }
        }

        return null;
    };

    for (const element of elements) {
        const match = visit(element);
        if (match) {
            return match;
        }
    }

    return null;
}

function collectFrontendTemplateBindingHints(elements: CanvasElement[], templateId: string): Array<Record<string, unknown>> {
    const hints: Array<Record<string, unknown>> = [];
    const visit = (element: CanvasElement) => {
        if (
            (element.id.startsWith(`frontend-blog-template-${templateId}`) || element.props?.frontendTemplateId === templateId)
            && Array.isArray(element.props?.bindingHints)
        ) {
            element.props.bindingHints.forEach((hint: unknown) => {
                if (isRecord(hint)) {
                    hints.push(hint);
                }
            });
        }

        if (Array.isArray(element.children)) {
            element.children.forEach(visit);
        }
    };

    elements.forEach(visit);
    return hints;
}

const normalizeFrontendBlogTemplateMatchText = (value?: string) => (
    (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
);

const frontendTemplateScoreForBlogStarterTemplate = (
    template: SiteFrontendDesignTemplate,
    starterTemplateId: BlogStarterTemplate,
) => {
    const starterTemplate = getBlogStarterTemplate(starterTemplateId);
    const intent = BLOG_STARTER_INTENTS.find((entry) => entry.id === starterTemplate.intent);
    const routeSlug = routeSlugFromPattern(template.routePattern);
    const aliases = Array.from(new Set([
        starterTemplate.id,
        starterTemplate.name,
        starterTemplate.desc,
        starterTemplate.detail,
        ...starterTemplate.sections,
        ...starterTemplate.aliases,
        starterTemplate.intent,
        intent?.name,
        ...(intent?.aliases || []),
    ].map(normalizeFrontendBlogTemplateMatchText).filter(Boolean)));
    const id = normalizeFrontendBlogTemplateMatchText(template.id);
    const name = normalizeFrontendBlogTemplateMatchText(template.name);
    const route = normalizeFrontendBlogTemplateMatchText(routeSlug || template.routePattern || '');
    const description = normalizeFrontendBlogTemplateMatchText(template.description);
    const haystack = [id, name, route, description].filter(Boolean).join(' ');

    return aliases.reduce((score, alias) => {
        if (!alias) return score;
        if (id === alias || name === alias || route === alias) return score + 120;
        if (id.includes(alias) || name.includes(alias) || route.includes(alias)) return score + 50;
        if (haystack.includes(alias)) return score + 20;
        return score;
    }, 0);
};

const findFrontendBlogTemplateForStarterTemplate = (
    templates: SiteFrontendDesignTemplate[],
    starterTemplateId: BlogStarterTemplate,
) => templates
    .map((template, index) => ({
        template,
        index,
        score: frontendTemplateScoreForBlogStarterTemplate(template, starterTemplateId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.template || null;

function collectCanvasText(elements: CanvasElement[]): string {
    const chunks: string[] = [];
    const visit = (element: CanvasElement) => {
        const content = element.props?.content;
        if (typeof content === 'string') {
            chunks.push(content);
        }

        if (Array.isArray(element.children)) {
            element.children.forEach(visit);
        }
    };

    elements.forEach(visit);
    return chunks.join(' ');
}

function countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

function getWritingStats(title: string, excerpt: string, elements: CanvasElement[]) {
    const titleWords = countWords(title);
    const excerptWords = countWords(excerpt);
    const canvasWords = countWords(collectCanvasText(elements));
    const totalWords = titleWords + excerptWords + canvasWords;

    return {
        titleWords,
        excerptWords,
        canvasWords,
        totalWords,
        readingMinutes: Math.max(1, Math.ceil(totalWords / 225)),
    };
}

function appendLongFormBlockToElements(
    elements: CanvasElement[],
    options: {
        kind: 'section' | 'quote';
        selectedFrontendTemplateId?: string;
        sequence: number;
    },
): CanvasElement[] {
    const targetId = options.selectedFrontendTemplateId
        ? `frontend-blog-template-${options.selectedFrontendTemplateId}-body-region`
        : 'blog-article-body';
    let appended = false;

    const appendToTarget = (element: CanvasElement): CanvasElement => {
        if (element.id === targetId) {
            const children = Array.isArray(element.children) ? element.children : [];
            const nextY = children.reduce((max, child) => Math.max(max, (child.y || 0) + (child.height || 0)), 0) + 36;
            const idPrefix = `blog-longform-${options.kind}-${options.sequence}`;
            const nextChild = options.kind === 'section'
                ? createCanvasElement('section', 28, nextY, {
                    id: idPrefix,
                    width: Math.min(820, Math.max(320, (element.width || DEFAULT_CANVAS_SIZE.width) - 96)),
                    height: 240,
                    props: {
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderRadius: 10,
                        padding: 0,
                    },
                    children: [
                        createCanvasElement('heading', 28, 28, {
                            id: `${idPrefix}-heading`,
                            width: 620,
                            height: 54,
                            props: {
                                content: 'New article section',
                                level: 'h2',
                                fontSize: 32,
                                fontWeight: '800',
                                lineHeight: 1.15,
                                color: '#0f172a',
                                binding: 'post.content.section',
                            },
                        }),
                        createCanvasElement('paragraph', 28, 98, {
                            id: `${idPrefix}-body`,
                            width: 700,
                            height: 106,
                            props: {
                                content: 'Develop this section with supporting details, examples, media references, or product/context links before publishing.',
                                fontSize: 17,
                                lineHeight: 1.7,
                                color: '#334155',
                                binding: 'post.content.body',
                            },
                        }),
                    ],
                })
                : createCanvasElement('quote', 44, nextY, {
                    id: idPrefix,
                    width: Math.min(760, Math.max(300, (element.width || DEFAULT_CANVAS_SIZE.width) - 120)),
                    height: 130,
                    props: {
                        content: 'Add a memorable pull quote or editorial takeaway for readers scanning the article.',
                        fontSize: 24,
                        fontWeight: '700',
                        lineHeight: 1.45,
                        color: '#0f172a',
                        borderColor: '#0f766e',
                        borderWidth: 0,
                        binding: 'post.content.quote',
                    },
                });
            const nextHeight = Math.max(element.height || 0, nextY + nextChild.height + 48);
            appended = true;
            return {
                ...element,
                height: nextHeight,
                children: [...children, nextChild],
            };
        }

        if (!Array.isArray(element.children)) {
            return element;
        }

        const nextChildren = element.children.map(appendToTarget);
        const childrenChanged = nextChildren.some((child, index) => child !== element.children?.[index]);
        if (!childrenChanged) {
            return element;
        }

        return {
            ...element,
            height: Math.max(element.height || 0, ...nextChildren.map((child) => (child.y || 0) + (child.height || 0) + 48)),
            children: nextChildren,
        };
    };

    const nextElements = elements.map(appendToTarget);
    if (appended) {
        return nextElements;
    }

    const sequence = options.sequence;
    const y = getCanvasHeightForElements(elements) + 40;
    const fallback = options.kind === 'section'
        ? createCanvasElement('section', 0, y, {
            id: `blog-longform-section-${sequence}`,
            width: DEFAULT_CANVAS_SIZE.width,
            height: 260,
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['content'] }],
            props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
            children: [
                createCanvasElement('heading', 220, 48, {
                    id: `blog-longform-section-${sequence}-heading`,
                    width: 720,
                    height: 58,
                    props: { content: 'New article section', level: 'h2', fontSize: 32, fontWeight: '800', lineHeight: 1.15, color: '#0f172a' },
                }),
                createCanvasElement('paragraph', 220, 122, {
                    id: `blog-longform-section-${sequence}-body`,
                    width: 760,
                    height: 106,
                    props: { content: 'Develop this section with supporting details, examples, media references, or product/context links before publishing.', fontSize: 17, lineHeight: 1.7, color: '#334155' },
                }),
            ],
        })
        : createCanvasElement('quote', 260, y, {
            id: `blog-longform-quote-${sequence}`,
            width: 680,
            height: 130,
            props: { content: 'Add a memorable pull quote or editorial takeaway for readers scanning the article.', fontSize: 24, fontWeight: '700', lineHeight: 1.45, color: '#0f172a' },
        });

    return [...elements, fallback];
}

function getFrontendBlogTemplateCanvasSize(template: SiteFrontendDesignTemplate, elements: CanvasElement[]): CanvasSize {
    return {
        ...DEFAULT_CANVAS_SIZE,
        width: template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width,
        height: Math.max(template.canvasSize?.height || DEFAULT_CANVAS_SIZE.height, getCanvasHeightForElements(elements)),
    };
}

function NewBlogPostPage() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const { sites, posts, media, setPosts } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingPosts, setIsCheckingPosts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isPreviewAfterCreateBusy, setIsPreviewAfterCreateBusy] = useState(false);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [blogCreateFormSubmitted, setBlogCreateFormSubmitted] = useState(false);
    const [existingBlogPosts, setExistingBlogPosts] = useState<BlogPost[]>([]);
    const [isFeaturedMediaOpen, setIsFeaturedMediaOpen] = useState(false);
    const [hasHydratedAutosave, setHasHydratedAutosave] = useState(false);
    const [draftRecovery, setDraftRecovery] = useState<BlogCreateAutosaveDraft | null>(null);
    const [autosavePausedForRecovery, setAutosavePausedForRecovery] = useState(false);
    const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState('Autosave ready');
    const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
    const [recoveredFrontendDesignSnapshot, setRecoveredFrontendDesignSnapshot] = useState<Pick<SiteFrontendDesignContract, 'source' | 'tokens' | 'chrome'> | null>(null);
    const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
    const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSite = search.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
        : undefined;
    const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || defaultSiteId;
    const [activeSiteId, setActiveSiteId] = useState(requestedSiteId);
    const isWorkspaceFocus = search.focus === 'canvas';
    const initialTemplateSourceMode: BlogTemplateSourceMode = search.templateSource || (search.designTemplate ? 'custom-frontend' : 'backy-canvas');

    // Form State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [status, setStatus] = useState<BlogCreationStatus>('draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(null);
    const [seoTitle, setSeoTitle] = useState('');
    const [seoDescription, setSeoDescription] = useState('');
    const [canonicalPath, setCanonicalPath] = useState('');
    const [featuredImageId, setFeaturedImageId] = useState<string | null>(null);
    const [ogImage, setOgImage] = useState('');
    const [noIndex, setNoIndex] = useState(false);
    const [noFollow, setNoFollow] = useState(false);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [selectedAuthorId, setSelectedAuthorId] = useState(user?.id || 'admin');
    const [templateSourceMode, setTemplateSourceMode] = useState<BlogTemplateSourceMode>(initialTemplateSourceMode);
    const [designTemplateId, setDesignTemplateId] = useState(search.designTemplate || '');
    const initialBlogStarterTemplate = search.starterTemplate || 'blog-post';
    const [selectedBlogStarterIntent, setSelectedBlogStarterIntent] = useState<BlogStarterIntent>(getBlogStarterTemplate(initialBlogStarterTemplate).intent);
    const [selectedBlogStarterTemplate, setSelectedBlogStarterTemplate] = useState<BlogStarterTemplate>(initialBlogStarterTemplate);
    const [blogTemplateLibraryCategory, setBlogTemplateLibraryCategory] = useState<PageTemplateLibraryCategory>('all');
    const [blogTemplateSearchQuery, setBlogTemplateSearchQuery] = useState('');
    const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
    const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(user?.id));
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const canUseLoadingRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(user);
    const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseLoadingRoleDefaults;
    const isBlogCreatePermissionAllowed = (key: BlogCreatePermissionKey) => (
        isAdminPermissionAllowed(permissionMatrix, user, key, BLOG_CREATE_PERMISSION_ROLE_DEFAULTS)
        || (canUseLoadingRoleDefaults && Boolean(user && BLOG_CREATE_PERMISSION_ROLE_DEFAULTS[key].includes(user.role)))
    );
    const canViewBlog = isBlogCreatePermissionAllowed('pages.view');
    const canEditBlog = isBlogCreatePermissionAllowed('pages.edit');
    const canPublishBlog = isBlogCreatePermissionAllowed('pages.publish');
    const canViewMedia = isBlogCreatePermissionAllowed('media.view');
    const canCreateMedia = isBlogCreatePermissionAllowed('media.create');
    const canViewCollections = isBlogCreatePermissionAllowed('collections.view');
    const canViewSites = isBlogCreatePermissionAllowed('sites.view');
    const viewBlogPermissionTitle = canViewBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const editBlogPermissionTitle = canEditBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.edit', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const publishBlogPermissionTitle = canPublishBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.publish', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewMediaPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, user, 'media.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const createMediaPermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, user, 'media.create', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewCollectionsPermissionTitle = canViewCollections ? undefined : adminPermissionReason(permissionMatrix, user, 'collections.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewSitePermissionTitle = canViewSites ? undefined : adminPermissionReason(permissionMatrix, user, 'sites.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewBlogDeniedMessage = `Your account needs pages.view to load blog creation data. ${viewBlogPermissionTitle}`;
    const editBlogDeniedMessage = `Your account needs pages.edit to create or change blog drafts. ${editBlogPermissionTitle}`;
    const publishBlogDeniedMessage = `Your account needs pages.publish to create previews, publish posts, or schedule posts. ${publishBlogPermissionTitle}`;
    const viewMediaDeniedMessage = `Your account needs media.view to select featured media. ${viewMediaPermissionTitle}`;
    const createMediaDeniedMessage = `Your account needs media.create to upload featured media. ${createMediaPermissionTitle}`;
    const viewCollectionsDeniedMessage = `Your account needs collections.view to bind blog canvas elements to collection data. ${viewCollectionsPermissionTitle}`;
    const isCreateBusy = isLoading || isPreviewAfterCreateBusy;
    const createFormDisabled = isCreateBusy || !canEditBlog;

    const clearCreationFeedback = () => {
        setError((current) => current ? null : current);
        setNotice((current) => current ? null : current);
    };

    const loadBlogCreatePermissions = useCallback(() => {
        let cancelled = false;
        setPermissionError(null);

        if (!user?.id) {
            setPermissionMatrix(null);
            setPermissionError('Sign in with an admin account to load blog creation permissions.');
            setIsPermissionsLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setIsPermissionsLoading(true);
        getUserPermissions(user.id)
            .then((matrix) => {
                if (!cancelled) {
                    setPermissionMatrix(matrix);
                    setPermissionError(null);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPermissionMatrix(null);
                    setPermissionError(error instanceof Error ? error.message : 'Unable to load blog creation permissions.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsPermissionsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => loadBlogCreatePermissions(), [loadBlogCreatePermissions]);

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setCategories([]);
                setTags([]);
                setAuthors([]);
                setError(viewBlogDeniedMessage);
                return;
            }

            try {
                const [backendCategories, backendTags, backendAuthors] = await Promise.all([
                    listBlogCategories(activeSiteId),
                    listBlogTags(activeSiteId),
                    listBlogAuthors(activeSiteId),
                ]);
                if (!cancelled) {
                    setCategories(backendCategories);
                    setTags(backendTags);
                    setAuthors(backendAuthors);
                    if (!selectedAuthorId || selectedAuthorId === 'admin' || !backendAuthors.some((author) => author.id === selectedAuthorId)) {
                        setSelectedAuthorId(backendAuthors[0]?.id || user?.id || 'admin');
                    }
                }
            } catch {
                if (!cancelled) {
                    setCategories([]);
                    setTags([]);
                    setAuthors([]);
                }
            }
        };

        void loadTaxonomy();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, selectedAuthorId, user?.id, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadExistingPosts = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setExistingBlogPosts([]);
                setRouteCheckError(viewBlogDeniedMessage);
                setError(viewBlogDeniedMessage);
                setIsCheckingPosts(false);
                return;
            }

            setIsCheckingPosts(true);
            setRouteCheckError(null);

            try {
                const backendPosts = await listBlogPosts(activeSiteId);
                if (!cancelled) {
                    setExistingBlogPosts(backendPosts);
                    setRouteCheckError(null);
                    setError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'Unable to check existing blog routes for this site';
                    setExistingBlogPosts([]);
                    setRouteCheckError(message);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingPosts(false);
                }
            }
        };

        void loadExistingPosts();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, routeCheckRetry, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadFrontendDesignTemplates = async () => {
            if (!activeSiteId) return;
            if (isPermissionMatrixPending) return;

            if (!canViewSites) {
                setFrontendDesign(null);
                setFrontendDesignError(`Your account needs sites.view to load frontend design templates. ${viewSitePermissionTitle}`);
                return;
            }

            setFrontendDesignLoading(true);
            setFrontendDesignError(null);

            try {
                let response = await getSiteFrontendDesign(activeSiteId);
                if (
                    search.designTemplate &&
                    search.siteId &&
                    search.siteId !== activeSiteId &&
                    !(response.frontendDesign?.templates || []).some((template) => template.id === search.designTemplate)
                ) {
                    response = await getSiteFrontendDesign(search.siteId);
                }
                if (!cancelled) {
                    setFrontendDesign(response.frontendDesign);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setFrontendDesign(null);
                    setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design templates.');
                }
            } finally {
                if (!cancelled) {
                    setFrontendDesignLoading(false);
                }
            }
        };

        void loadFrontendDesignTemplates();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewSites, isPermissionMatrixPending, search.designTemplate, search.siteId, viewSitePermissionTitle]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, activeSiteId))) {
            const fallbackSiteId = sites[0].publicSiteId || sites[0].id;
            setActiveSiteId(fallbackSiteId);
            navigate({
                to: '/blog/new',
                search: {
                    siteId: fallbackSiteId,
                    ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}),
                    ...(selectedBlogStarterTemplate !== 'blog-post' ? { starterTemplate: selectedBlogStarterTemplate } : {}),
                    ...(templateSourceMode === 'custom-frontend' ? { templateSource: 'custom-frontend' as const } : {}),
                    ...(templateSourceMode === 'custom-frontend' && designTemplateId ? { designTemplate: designTemplateId } : {}),
                },
                replace: true,
            });
        }
    }, [activeSiteId, designTemplateId, isWorkspaceFocus, navigate, selectedBlogStarterTemplate, sites, templateSourceMode]);

    useEffect(() => {
        const nextRequestedSite = search.siteId
            ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
            : undefined;
        const nextSiteId = nextRequestedSite?.publicSiteId || nextRequestedSite?.id || search.siteId || defaultSiteId;
        if (nextSiteId === activeSiteId) return;

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setDesignTemplateId(search.designTemplate || '');
        setTemplateSourceMode(search.templateSource || (search.designTemplate ? 'custom-frontend' : 'backy-canvas'));
        setError(null);
        setNotice(null);
    }, [activeSiteId, defaultSiteId, search.designTemplate, search.siteId, search.templateSource, sites]);

    const selectBlogSite = (nextSiteId: string) => {
        if (isCreateBusy) return;
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setFeaturedImageId(null);
        setOgImage('');
        setTemplateSourceMode('backy-canvas');
        setDesignTemplateId('');
        setSelectedBlogStarterIntent('article');
        setSelectedBlogStarterTemplate('blog-post');
        setBlogTemplateLibraryCategory('all');
        setBlogTemplateSearchQuery('');
        const nextElements = createBlogStarterTemplateElements('blog-post');
        setCanvasElements(nextElements);
        setCanvasSize({
            ...DEFAULT_CANVAS_SIZE,
            height: getCanvasHeightForElements(nextElements),
        });
        setCanvasSeedKey(`blog-starter-blog-post-${Date.now()}`);
        clearCreationFeedback();
        navigate({
            to: '/blog/new',
            search: { siteId: nextSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}) },
            replace: true,
        });
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

        clearCreationFeedback();
        setSelectedIds(
            selectedIds.includes(id)
                ? selectedIds.filter((selectedId) => selectedId !== id)
                : [...selectedIds, id],
        );
    };

    // Canvas State
    const initialElements: CanvasElement[] = useMemo(() => createBlogStarterTemplateElements(initialBlogStarterTemplate), [initialBlogStarterTemplate]);
    const initialCanvasSize = useMemo<CanvasSize>(() => ({
        ...DEFAULT_CANVAS_SIZE,
        height: getCanvasHeightForElements(initialElements),
    }), [initialElements]);

    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(initialElements);
    const [canvasSize, setCanvasSize] = useState<CanvasSize>(initialCanvasSize);
    const [canvasSeedKey, setCanvasSeedKey] = useState('default-blog-template');
    const interactiveReadinessIssues = useMemo(
        () => collectInteractiveReadinessIssues(canvasElements),
        [canvasElements],
    );
    const interactivePublishDisabledReason = interactiveReadinessIssues.length
        ? `Resolve interactive block readiness before publishing: ${interactiveReadinessIssues[0]}`
        : null;
    const interactivePublishReady = interactiveReadinessIssues.length === 0;
    const appliedSearchTemplateRef = useRef<string | null>(null);
    const selectedBlogStarterTemplateOption = useMemo(
        () => getBlogStarterTemplate(selectedBlogStarterTemplate),
        [selectedBlogStarterTemplate],
    );
    const visibleBlogStarterTemplateOptions = useMemo(
        () => getVisiblePageTemplateOptions(BLOG_STARTER_TEMPLATE_OPTIONS, blogTemplateLibraryCategory, blogTemplateSearchQuery),
        [blogTemplateLibraryCategory, blogTemplateSearchQuery],
    );
    const frontendBlogTemplates = useMemo(
        () => (frontendDesign?.templates || []).filter((template) => template.type === 'blogPost'),
        [frontendDesign?.templates],
    );
    const isCustomFrontendTemplateSource = templateSourceMode === 'custom-frontend';
    const explicitSelectedFrontendTemplate = useMemo(
        () => frontendBlogTemplates.find((template) => template.id === designTemplateId) || null,
        [designTemplateId, frontendBlogTemplates],
    );
    const matchedFrontendBlogTemplate = useMemo(
        () => isCustomFrontendTemplateSource
            ? findFrontendBlogTemplateForStarterTemplate(frontendBlogTemplates, selectedBlogStarterTemplate)
            : null,
        [frontendBlogTemplates, isCustomFrontendTemplateSource, selectedBlogStarterTemplate],
    );
    const selectedFrontendTemplate = isCustomFrontendTemplateSource
        ? explicitSelectedFrontendTemplate || matchedFrontendBlogTemplate
        : null;
    const selectedFrontendTemplateMatchMode = selectedFrontendTemplate
        ? explicitSelectedFrontendTemplate
            ? 'selected'
            : 'starter-matched'
        : 'none';
    const frontendTemplateByStarterTemplate = useMemo(
        () => new Map<BlogStarterTemplate, SiteFrontendDesignTemplate | null>(
            BLOG_STARTER_TEMPLATE_OPTIONS.map((template) => [
                template.id,
                findFrontendBlogTemplateForStarterTemplate(frontendBlogTemplates, template.id),
            ]),
        ),
        [frontendBlogTemplates],
    );
    const recoveredFrontendTemplate = useMemo<SiteFrontendDesignTemplate | null>(() => {
        if (!isCustomFrontendTemplateSource || selectedFrontendTemplate || !designTemplateId) {
            return null;
        }

        const templateRoot = findFrontendBlogTemplateRoot(canvasElements, designTemplateId);
        if (!templateRoot) {
            return null;
        }

        const templateName = typeof templateRoot.props?.frontendTemplateName === 'string'
            ? templateRoot.props.frontendTemplateName
            : 'Recovered frontend template';
        const routePattern = typeof templateRoot.props?.routePattern === 'string'
            ? templateRoot.props.routePattern
            : '/blog/{slug}';
        const recoveredCanvasSize = {
            ...canvasSize,
            width: Math.max(templateRoot.width || 0, canvasSize.width || 0, DEFAULT_CANVAS_SIZE.width),
            height: Math.max(templateRoot.height || 0, canvasSize.height || 0, getCanvasHeightForElements(canvasElements)),
        };

        return {
            id: designTemplateId,
            type: 'blogPost',
            name: templateName,
            routePattern,
            description: 'Recovered from the local blog draft canvas.',
            canvasSize: recoveredCanvasSize,
            content: { elements: canvasElements },
            bindingHints: collectFrontendTemplateBindingHints(canvasElements, designTemplateId),
        };
    }, [canvasElements, canvasSize, designTemplateId, isCustomFrontendTemplateSource, selectedFrontendTemplate]);
    const effectiveFrontendTemplate = selectedFrontendTemplate || recoveredFrontendTemplate;
    const visibleFrontendBlogTemplates = useMemo(
        () => effectiveFrontendTemplate && !frontendBlogTemplates.some((template) => template.id === effectiveFrontendTemplate.id)
            ? [...frontendBlogTemplates, effectiveFrontendTemplate]
            : frontendBlogTemplates,
        [effectiveFrontendTemplate, frontendBlogTemplates],
    );
    const effectiveCanvasSource = effectiveFrontendTemplate ? 'frontend-design' : 'backy-starter';
    const templateSourceReady = !isCustomFrontendTemplateSource || Boolean(effectiveFrontendTemplate);
    const templateSourceStatus = isCustomFrontendTemplateSource
        ? effectiveFrontendTemplate
            ? selectedFrontendTemplateMatchMode === 'starter-matched'
                ? `Custom frontend starter matched: ${selectedBlogStarterTemplateOption.name} uses ${effectiveFrontendTemplate.name}.`
                : `Custom frontend blog template selected: ${effectiveFrontendTemplate.name}.`
            : frontendDesignLoading
                ? 'Loading custom frontend blog templates.'
                : frontendBlogTemplates.length > 0
                    ? `No captured custom frontend blog template matches ${selectedBlogStarterTemplateOption.name}. Choose another starter or select a captured template.`
                    : 'No custom frontend blog templates are captured for this site yet.'
        : `Backy canvas blog template selected: ${selectedBlogStarterTemplateOption.name}.`;
    const blogTemplateSelectionActionStatusId = 'blog-template-selection-action-status';
    const blogTemplateSelectionDisabledReason = isCreateBusy
        ? 'Blog post creation is already running.'
        : !canEditBlog
            ? editBlogDeniedMessage
            : '';
    const blogTemplateSelectionControlDisabled = Boolean(blogTemplateSelectionDisabledReason);
    const getBlogTemplateSelectionActionState = (selected: boolean) => blogTemplateSelectionDisabledReason
        ? isCreateBusy ? 'busy' : 'blocked'
        : selected ? 'selected' : 'ready';
    const getBlogTemplateSourceActionStatus = (sourceMode: BlogTemplateSourceMode) => {
        if (blogTemplateSelectionDisabledReason) {
            return `${sourceMode === 'backy-canvas' ? 'Backy canvas' : 'Custom frontend'} blog template source unavailable: ${blogTemplateSelectionDisabledReason}`;
        }

        if (sourceMode === 'backy-canvas') {
            return templateSourceMode === 'backy-canvas'
                ? 'Backy canvas blog template source selected.'
                : 'Switch to Backy canvas blog article template.';
        }

        if (templateSourceMode === 'custom-frontend') {
            return effectiveFrontendTemplate
                ? `Custom frontend blog template source selected with ${effectiveFrontendTemplate.name}.`
                : frontendBlogTemplates.length > 0
                    ? `Custom frontend blog template source selected. Choose one of ${frontendBlogTemplates.length} captured blog template${frontendBlogTemplates.length === 1 ? '' : 's'}.`
                    : 'Custom frontend blog template source selected, but no captured blog templates are available.';
        }

        return frontendBlogTemplates.length > 0
            ? `Switch to custom frontend blog template source with ${frontendBlogTemplates.length} captured blog template${frontendBlogTemplates.length === 1 ? '' : 's'}.`
            : 'Switch to custom frontend blog template source after capturing or importing a blog post template.';
    };
    const getBlogFrontendTemplateActionStatus = (template: SiteFrontendDesignTemplate) => {
        if (blogTemplateSelectionDisabledReason) {
            return `${template.name} blog frontend template unavailable: ${blogTemplateSelectionDisabledReason}`;
        }

        return designTemplateId === template.id
            ? `${template.name} blog frontend template selected with ${template.bindingHints?.length || 0} binding${(template.bindingHints?.length || 0) === 1 ? '' : 's'}.`
            : `Select ${template.name} blog frontend template with ${template.bindingHints?.length || 0} binding${(template.bindingHints?.length || 0) === 1 ? '' : 's'}.`;
    };
    const getBlogStarterTemplateActionStatus = (template: BlogStarterTemplateOption) => {
        if (blogTemplateSelectionDisabledReason) {
            return `${template.name} starter unavailable: ${blogTemplateSelectionDisabledReason}`;
        }

        const matchedTemplate = frontendTemplateByStarterTemplate.get(template.id) || null;
        if (!isCustomFrontendTemplateSource) {
            return selectedBlogStarterTemplate === template.id
                ? `${template.name} starter selected for Backy canvas generation.`
                : `Select ${template.name} starter with ${template.sections.length} section${template.sections.length === 1 ? '' : 's'}.`;
        }

        if (selectedBlogStarterTemplate === template.id) {
            return matchedTemplate
                ? `${template.name} custom frontend starter selected; it will use ${matchedTemplate.name}.`
                : `${template.name} custom frontend starter selected, but no captured template matches it.`;
        }

        return matchedTemplate
            ? `Select ${template.name}; Backy will use ${matchedTemplate.name}.`
            : `Select ${template.name}; no captured custom frontend blog template currently matches this starter.`;
    };
    const getBlogTemplateCategoryActionStatus = (category: (typeof PAGE_TEMPLATE_LIBRARY_CATEGORIES)[number]) => {
        if (blogTemplateSelectionDisabledReason) {
            return `${category.label} blog template filter unavailable: ${blogTemplateSelectionDisabledReason}`;
        }

        const templateCount = category.templates?.length || BLOG_STARTER_TEMPLATE_OPTIONS.length;
        return blogTemplateLibraryCategory === category.id
            ? `${category.label} blog template filter selected with ${visibleBlogStarterTemplateOptions.length} visible template${visibleBlogStarterTemplateOptions.length === 1 ? '' : 's'}.`
            : `Filter blog starter templates to ${category.label} (${templateCount} template${templateCount === 1 ? '' : 's'}).`;
    };
    const blogTemplateSelectionActionStatus = [
        getBlogTemplateSourceActionStatus('backy-canvas'),
        getBlogTemplateSourceActionStatus('custom-frontend'),
        `${visibleBlogStarterTemplateOptions.length} of ${BLOG_STARTER_TEMPLATE_OPTIONS.length} blog starter template${BLOG_STARTER_TEMPLATE_OPTIONS.length === 1 ? '' : 's'} visible.`,
        `${visibleFrontendBlogTemplates.length} custom frontend blog template${visibleFrontendBlogTemplates.length === 1 ? '' : 's'} available.`,
    ].join(' ');
    const effectiveFrontendDesignSource = effectiveFrontendTemplate
        ? frontendDesign?.source || recoveredFrontendDesignSnapshot?.source || { type: 'custom-frontend' as const, label: 'Recovered frontend design contract' }
        : undefined;
    const effectiveFrontendDesignTokens = effectiveFrontendTemplate
        ? frontendDesign?.tokens || recoveredFrontendDesignSnapshot?.tokens
        : undefined;
    const effectiveFrontendDesignChrome = effectiveFrontendTemplate
        ? frontendDesign?.chrome || recoveredFrontendDesignSnapshot?.chrome
        : undefined;
    const writingStats = useMemo(
        () => getWritingStats(title, excerpt, canvasElements),
        [canvasElements, excerpt, title],
    );
    const addLongFormBlock = (kind: 'section' | 'quote') => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

        clearCreationFeedback();
        const nextElements = appendLongFormBlockToElements(canvasElements, {
            kind,
            selectedFrontendTemplateId: effectiveFrontendTemplate?.id,
            sequence: Date.now(),
        });
        setCanvasElements(nextElements);
        setCanvasSize((current) => ({
            ...current,
            height: Math.max(current.height, getCanvasHeightForElements(nextElements)),
        }));
        setCanvasSeedKey(`longform-${kind}-${Date.now()}`);
        setNotice(kind === 'section' ? 'Added an editable article section to the canvas.' : 'Added an editable pull quote to the canvas.');
    };

    const handleTemplateSourceChange = (nextSourceMode: BlogTemplateSourceMode) => {
        if (isCreateBusy || !canEditBlog || nextSourceMode === templateSourceMode) return;

        clearCreationFeedback();

        if (nextSourceMode === 'backy-canvas') {
            const nextElements = createBlogStarterTemplateElements(selectedBlogStarterTemplate);
            setTemplateSourceMode('backy-canvas');
            setDesignTemplateId('');
            setRecoveredFrontendDesignSnapshot(null);
            setCanvasElements(nextElements);
            setCanvasSize({
                ...DEFAULT_CANVAS_SIZE,
                height: getCanvasHeightForElements(nextElements),
            });
            setCanvasSeedKey(`blog-starter-${selectedBlogStarterTemplate}-${Date.now()}`);
            navigate({
                to: '/blog/new',
                search: { siteId: activeSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), ...(selectedBlogStarterTemplate !== 'blog-post' ? { starterTemplate: selectedBlogStarterTemplate } : {}) },
                replace: true,
            });
            return;
        }

        setTemplateSourceMode('custom-frontend');
        const nextTemplate = findFrontendBlogTemplateForStarterTemplate(frontendBlogTemplates, selectedBlogStarterTemplate)
            || selectedFrontendTemplate
            || frontendBlogTemplates[0]
            || null;
        if (!nextTemplate) {
            setDesignTemplateId('');
            navigate({
                to: '/blog/new',
                search: { siteId: activeSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), starterTemplate: selectedBlogStarterTemplate, templateSource: 'custom-frontend' as const },
                replace: true,
            });
            return;
        }

        applyFrontendTemplate(nextTemplate, { syncRoute: true });
    };

    const handleBlogStarterTemplateChange = (nextTemplateId: BlogStarterTemplate) => {
        if (blogTemplateSelectionControlDisabled || !canEditBlog) return;

        const nextTemplateOption = getBlogStarterTemplate(nextTemplateId);
        clearCreationFeedback();
        setSelectedBlogStarterTemplate(nextTemplateId);
        setSelectedBlogStarterIntent(nextTemplateOption.intent);

        if (!isCustomFrontendTemplateSource) {
            const nextElements = createBlogStarterTemplateElements(nextTemplateId);
            setCanvasElements(nextElements);
            setCanvasSize({
                ...DEFAULT_CANVAS_SIZE,
                height: getCanvasHeightForElements(nextElements),
            });
            setCanvasSeedKey(`blog-starter-${nextTemplateId}-${Date.now()}`);
            setNotice(`${nextTemplateOption.name} selected.`);
            navigate({
                to: '/blog/new',
                search: { siteId: activeSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), ...(nextTemplateId !== 'blog-post' ? { starterTemplate: nextTemplateId } : {}) },
                replace: true,
            });
            return;
        }

        const nextTemplate = findFrontendBlogTemplateForStarterTemplate(frontendBlogTemplates, nextTemplateId);
        if (!nextTemplate) {
            setDesignTemplateId('');
            setNotice(null);
            setError(`No captured custom frontend blog template matches ${nextTemplateOption.name} yet.`);
            navigate({
                to: '/blog/new',
                search: { siteId: activeSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), starterTemplate: nextTemplateId, templateSource: 'custom-frontend' as const },
                replace: true,
            });
            return;
        }

        applyFrontendTemplate(nextTemplate, { syncRoute: true });
    };

    const applyFrontendTemplate = (template: SiteFrontendDesignTemplate, options: { syncRoute?: boolean } = {}) => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

        const currentSlugValue = slug || slugify(title);
        const nextElements = buildFrontendBlogTemplateElements(template, {
            title: title.trim() || template.name,
            slug: currentSlugValue || routeSlugFromPattern(template.routePattern) || 'post-slug',
            excerpt,
        });
        const nextCanvasSize = {
            ...DEFAULT_CANVAS_SIZE,
            width: template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width,
            height: Math.max(template.canvasSize?.height || DEFAULT_CANVAS_SIZE.height, getCanvasHeightForElements(nextElements)),
        };
        const routeSlug = routeSlugFromPattern(template.routePattern);

        clearCreationFeedback();
        setTemplateSourceMode('custom-frontend');
        setDesignTemplateId(template.id);
        setCanvasElements(nextElements);
        setCanvasSize(nextCanvasSize);
        setCanvasSeedKey(`frontend-${template.id}-${Date.now()}`);

        if (!title.trim()) {
            setTitle(template.name);
        }
        if (routeSlug && !slug.trim()) {
            setSlug(routeSlug);
        }
        if (!excerpt.trim() && template.description) {
            setExcerpt(template.description);
        }

        if (options.syncRoute) {
            navigate({
                to: '/blog/new',
                search: {
                    siteId: activeSiteId,
                    ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}),
                    starterTemplate: selectedBlogStarterTemplate,
                    templateSource: 'custom-frontend' as const,
                    designTemplate: template.id,
                    frontendDesignTemplateId: template.id,
                    frontendTemplate: template.id,
                },
                replace: true,
            });
        }
    };

    useEffect(() => {
        try {
            const storedDraft = window.localStorage.getItem(BLOG_CREATE_AUTOSAVE_KEY);
            if (storedDraft) {
                const parsedDraft = JSON.parse(storedDraft) as Partial<BlogCreateAutosaveDraft>;
                if (isRecoverableBlogCreateDraft(parsedDraft)) {
                    setDraftRecovery(parsedDraft);
                    setAutosavePausedForRecovery(true);
                    setAutosaveStatus('Recovered draft available');
                    setLastAutosavedAt(parsedDraft.savedAt);
                } else {
                    window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
                }
            }
        } catch {
            window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
        } finally {
            setHasHydratedAutosave(true);
        }
    }, []);

    const slugValue = slug || slugify(title);
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = sites.find((site) => siteMatchesIdentifier(site, activeSiteId));
    useEffect(() => {
        const nextTemplateId = search.designTemplate || '';
        const nextTemplateSourceMode = search.templateSource || (nextTemplateId ? 'custom-frontend' : 'backy-canvas');
        const nextStarterTemplate = search.starterTemplate || 'blog-post';
        if (nextTemplateSourceMode !== templateSourceMode) {
            setTemplateSourceMode(nextTemplateSourceMode);
        }
        if (nextStarterTemplate !== selectedBlogStarterTemplate && nextTemplateSourceMode !== 'custom-frontend') {
            const nextStarterOption = getBlogStarterTemplate(nextStarterTemplate);
            const nextElements = createBlogStarterTemplateElements(nextStarterTemplate);
            setSelectedBlogStarterTemplate(nextStarterTemplate);
            setSelectedBlogStarterIntent(nextStarterOption.intent);
            setCanvasElements(nextElements);
            setCanvasSize({
                ...DEFAULT_CANVAS_SIZE,
                height: getCanvasHeightForElements(nextElements),
            });
            setCanvasSeedKey(`blog-starter-${nextStarterTemplate}-${Date.now()}`);
        }
        if (nextTemplateId && nextTemplateId !== designTemplateId) {
            setDesignTemplateId(nextTemplateId);
        }
    }, [designTemplateId, search.designTemplate, search.starterTemplate, search.templateSource, selectedBlogStarterTemplate, templateSourceMode]);

    useEffect(() => {
        if (templateSourceMode !== 'custom-frontend' && designTemplateId) {
            setDesignTemplateId('');
            appliedSearchTemplateRef.current = null;
            return;
        }

        if (
            designTemplateId
            && frontendDesign
            && !frontendDesignLoading
            && !frontendBlogTemplates.some((template) => template.id === designTemplateId)
            && !findFrontendBlogTemplateRoot(canvasElements, designTemplateId)
        ) {
            setDesignTemplateId('');
            appliedSearchTemplateRef.current = null;
        }
    }, [canvasElements, designTemplateId, frontendBlogTemplates, frontendDesign, frontendDesignLoading, templateSourceMode]);

    useEffect(() => {
        if (!selectedFrontendTemplate) {
            return;
        }

        if (isCreateBusy || !canEditBlog) {
            return;
        }

        const templateCanvasApplied = hasFrontendBlogTemplateRoot(canvasElements, selectedFrontendTemplate);
        if (templateCanvasApplied) {
            appliedSearchTemplateRef.current = selectedFrontendTemplate.id;
            return;
        }

        appliedSearchTemplateRef.current = selectedFrontendTemplate.id;
        applyFrontendTemplate(selectedFrontendTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canEditBlog, canvasElements, isCreateBusy, selectedFrontendTemplate]);

    const adminBlogUrl = useMemo(
        () => `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/blog`,
        [activeSiteId],
    );
    const routePath = `/blog/${slugValue || 'post-slug'}`;
    const routeConflict = useMemo(
        () => slugValue.trim()
            ? existingBlogPosts.find((post) => slugify(post.slug) === slugValue) || null
            : null,
        [existingBlogPosts, slugValue],
    );
    const selectedFeaturedImage = featuredImageId
        ? media.find((asset) => asset.id === featuredImageId) || null
        : null;
    const selectedFeaturedImageUrl = selectedFeaturedImage
        ? selectedFeaturedImage.url || getPublicMediaFileUrl(selectedFeaturedImage.id, activeSiteId)
        : null;
    const normalizedCanonicalPath = normalizeCanonicalPath(canonicalPath || routePath);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const effectiveSeoTitle = seoTitle.trim() || title.trim();
    const effectiveSeoDescription = seoDescription.trim() || excerpt.trim();
    const scheduleValidationMessage = getScheduledBlogPostDateError(status, scheduledAt);
    const hasFutureSchedule = scheduleValidationMessage === null;
    const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
    const blogTitleInlineError = blogCreateFormSubmitted && !title.trim()
        ? 'Add a post title so Backy can create a named article, route, and editable canvas document.'
        : null;
    const blogSlugInlineError = blogCreateFormSubmitted
        ? !slugValue.trim()
            ? 'Add a URL slug so this blog post has a stable public route.'
            : routeCheckError
                ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                : routeConflict
                    ? `${routePath} is already used by "${routeConflict.title}". Choose another slug or edit that post first.`
                    : null
        : null;
    const blogCanonicalInlineError = blogCreateFormSubmitted && !canonicalValid
        ? 'Canonical path must start with / before saving.'
        : null;
    const blogScheduleInlineError = blogCreateFormSubmitted && scheduleValidationMessage
        ? scheduleValidationMessage
        : null;
    const readinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slugValue.trim().length > 0 },
        { label: 'Route', complete: !isCheckingPosts && !routeCheckError && !routeConflict },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'SEO', complete: effectiveSeoTitle.length > 0 && effectiveSeoDescription.length >= 50 && canonicalValid },
        { label: 'Featured image', complete: Boolean(featuredImageId) },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Template source', complete: templateSourceReady },
        { label: 'Schedule', complete: hasFutureSchedule },
    ];
    const readyCount = readinessChecks.filter((check) => check.complete).length;
    const readinessScore = Math.round((readyCount / readinessChecks.length) * 100);
    const canCreateDraft = title.trim().length > 0
        && canEditBlog
        && slugValue.trim().length > 0
        && !isCheckingPosts
        && !routeCheckError
        && !routeConflict
        && canonicalValid
        && templateSourceReady;
    const canCreatePreviewDraft = title.trim().length > 0
        && canEditBlog
        && canPublishBlog
        && slugValue.trim().length > 0
        && !isCheckingPosts
        && !routeCheckError
        && !routeConflict
        && canonicalValid
        && templateSourceReady
        && interactivePublishReady;
    const canAttemptCreatePreviewDraft = canEditBlog && canPublishBlog;
    const canSubmit = canCreateDraft
        && (status === 'draft' || canPublishBlog)
        && (status === 'draft' || interactivePublishReady)
        && hasFutureSchedule;
    const submitLabel = status === 'published' ? 'Publish post' : status === 'scheduled' ? 'Schedule post' : 'Save draft';
    const createPayloadPreview = useMemo(() => ({
        title: title.trim() || 'Untitled post',
        slug: slugValue || 'post-slug',
        routeAvailability: routeCheckError
            ? { status: 'unverified', message: routeCheckError }
            : routeConflict
                ? { status: 'conflict', postId: routeConflict.id, title: routeConflict.title, path: `/blog/${routeConflict.slug}` }
                : { status: 'available', checkedPosts: existingBlogPosts.length },
        excerpt: excerpt.trim(),
        status,
        scheduledAt: status === 'scheduled' ? scheduledAt : null,
        seo: {
            title: effectiveSeoTitle || 'Untitled post',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
            robots: {
                index: !noIndex,
                follow: !noFollow,
            },
        },
        featuredImageId,
        featuredImage: selectedFeaturedImage
            ? {
                id: selectedFeaturedImage.id,
                name: selectedFeaturedImage.name,
                url: selectedFeaturedImageUrl,
                altText: selectedFeaturedImage.altText || null,
            }
            : featuredImageId
                ? { id: featuredImageId, name: null, url: null, altText: null }
                : null,
        authorId: selectedAuthorId || user?.id || 'admin',
        categoryIds: selectedCategoryIds,
        tagIds: selectedTagIds,
        templateSource: templateSourceMode,
        templateSourceLabel: effectiveFrontendTemplate ? 'Custom frontend' : 'Backy canvas',
        template: effectiveFrontendTemplate
            ? { id: effectiveFrontendTemplate.id, source: 'frontend-design', name: effectiveFrontendTemplate.name }
            : { id: selectedBlogStarterTemplate, source: 'backy-starter', name: selectedBlogStarterTemplateOption.name },
        content: effectiveFrontendTemplate
            ? `${effectiveFrontendTemplate.name} frontend contract seed`
            : `${canvasElements.length} root layer${canvasElements.length === 1 ? '' : 's'}`,
        siteChrome: effectiveFrontendTemplate
            ? 'captured from frontend design contract'
            : 'editable header, navigation, article body, and footer seeded',
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
        },
    }), [
        canvasElements.length,
        canvasSize.height,
        canvasSize.width,
        effectiveFrontendTemplate,
        existingBlogPosts.length,
        excerpt,
        effectiveSeoDescription,
        effectiveSeoTitle,
        featuredImageId,
        normalizedCanonicalPath,
        noFollow,
        noIndex,
        ogImage,
        selectedFeaturedImage,
        selectedFeaturedImageUrl,
        routeCheckError,
        routeConflict,
        scheduledAt,
        selectedAuthorId,
        selectedBlogStarterTemplate,
        selectedBlogStarterTemplateOption.name,
        selectedCategoryIds,
        selectedTagIds,
        slugValue,
        status,
        templateSourceMode,
        title,
        user?.id,
    ]);
    const creationHandoff = useMemo(() => ({
        generatedAt: new Date().toISOString(),
        endpoint: {
            method: 'POST',
            url: adminBlogUrl,
        },
        site: {
            id: activeSiteId,
            name: selectedSite?.name || activeSiteId,
            slug: selectedSite?.slug || activeSiteId,
        },
        route: {
            path: routePath,
            slug: slugValue || 'post-slug',
            publicCollectionPath: '/blog',
            availability: routeCheckError
                ? {
                    status: 'unverified',
                    message: routeCheckError,
                }
                : routeConflict
                    ? {
                        status: 'conflict',
                        postId: routeConflict.id,
                        title: routeConflict.title,
                        path: `/blog/${routeConflict.slug}`,
                    }
                    : {
                        status: 'available',
                        checkedPosts: existingBlogPosts.length,
                    },
        },
        readiness: {
            score: readinessScore,
            checks: readinessChecks,
        },
        editorial: {
            title: title.trim() || 'Untitled post',
            excerpt: excerpt.trim(),
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            seo: {
                title: effectiveSeoTitle || 'Untitled post',
                description: effectiveSeoDescription,
                canonical: normalizedCanonicalPath,
                ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
                robots: {
                    index: !noIndex,
                    follow: !noFollow,
                },
            },
            featuredImageId,
            featuredImage: selectedFeaturedImage
                ? {
                    id: selectedFeaturedImage.id,
                    name: selectedFeaturedImage.name,
                    url: selectedFeaturedImageUrl,
                    altText: selectedFeaturedImage.altText || null,
                    responsive: selectedFeaturedImage.responsive || null,
                }
                : featuredImageId
                    ? { id: featuredImageId, name: null, url: null, altText: null, responsive: null }
                    : null,
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId || user?.id || 'admin', name: user?.fullName || 'Admin' },
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
        },
        template: {
            id: effectiveFrontendTemplate?.id || selectedBlogStarterTemplate,
            name: effectiveFrontendTemplate?.name || selectedBlogStarterTemplateOption.name,
            source: effectiveCanvasSource,
            templateSource: templateSourceMode,
            templateSourceLabel: effectiveFrontendTemplate ? 'Custom frontend' : 'Backy canvas',
            blogStarterTemplate: selectedBlogStarterTemplate,
            blogStarterTemplateName: selectedBlogStarterTemplateOption.name,
            blogStarterIntent: selectedBlogStarterIntent,
            backyCanvasTemplateId: effectiveFrontendTemplate ? null : `blog-${selectedBlogStarterTemplate}`,
            backyCanvasSeedIntent: effectiveFrontendTemplate ? null : selectedBlogStarterIntent,
            sections: effectiveFrontendTemplate ? effectiveFrontendTemplate.bindingHints || [] : selectedBlogStarterTemplateOption.sections,
            routePattern: effectiveFrontendTemplate?.routePattern || '/blog/{slug}',
        },
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            rootLayerCount: canvasElements.length,
            siteChrome: effectiveFrontendTemplate ? 'frontend design contract' : ['header', 'navigation', 'article hero', 'article body', 'footer'],
            supportsGrouping: true,
            supportsResponsivePreview: true,
            source: effectiveFrontendTemplate ? 'Frontend design contract template' : 'Backy CanvasEditor serialized content',
        },
        payloadPreview: createPayloadPreview,
        nextStep: 'Created posts open in the blog editor where publishing, revisions, taxonomy, SEO, and the public canvas can be refined.',
        guardrails: [
            'Backend owns duplicate slug validation per site.',
            'Scheduled posts require a future publish date before they can be created.',
            'The public frontend should render the saved canvas content for this route instead of hardcoding blog templates.',
            'New posts start with editable site chrome and article layout blocks so headers, nav, body, and footer remain controlled by Backy.',
            'Categories, tags, and author IDs are site-scoped and should be read from Backy before rendering filters or bylines.',
        ],
    }), [
        activeSiteId,
        adminBlogUrl,
        canvasElements.length,
        canvasSize.height,
        canvasSize.width,
        createPayloadPreview,
        effectiveCanvasSource,
        effectiveFrontendTemplate,
        effectiveSeoDescription,
        effectiveSeoTitle,
        existingBlogPosts.length,
        excerpt,
        featuredImageId,
        normalizedCanonicalPath,
        noFollow,
        noIndex,
        ogImage,
        readinessChecks,
        readinessScore,
        routeCheckError,
        routeConflict,
        routePath,
        scheduledAt,
        selectedAuthor,
        selectedFeaturedImage,
        selectedFeaturedImageUrl,
        selectedAuthorId,
        selectedBlogStarterIntent,
        selectedBlogStarterTemplate,
        selectedBlogStarterTemplateOption.name,
        selectedBlogStarterTemplateOption.sections,
        selectedCategoryIds,
        selectedSite?.name,
        selectedSite?.slug,
        selectedTagIds,
        slugValue,
        status,
        templateSourceMode,
        title,
        user?.fullName,
        user?.id,
    ]);
    const creationHandoffText = useMemo(() => JSON.stringify(creationHandoff, null, 2), [creationHandoff]);
    const hasAutosaveContent = useMemo(() => (
        title.trim().length > 0
        || slug.trim().length > 0
        || excerpt.trim().length > 0
        || status !== 'draft'
        || Boolean(scheduledAt)
        || seoTitle.trim().length > 0
        || seoDescription.trim().length > 0
        || canonicalPath.trim().length > 0
        || Boolean(featuredImageId)
        || ogImage.trim().length > 0
        || noIndex
        || noFollow
        || selectedCategoryIds.length > 0
        || selectedTagIds.length > 0
        || selectedAuthorId !== (user?.id || 'admin')
        || selectedBlogStarterTemplate !== 'blog-post'
        || templateSourceMode !== 'backy-canvas'
        || designTemplateId.trim().length > 0
        || canvasSize.width !== initialCanvasSize.width
        || canvasSize.height !== initialCanvasSize.height
        || JSON.stringify(canvasElements) !== JSON.stringify(initialElements)
    ), [
        canonicalPath,
        canvasElements,
        canvasSize.height,
        canvasSize.width,
        designTemplateId,
        excerpt,
        featuredImageId,
        initialCanvasSize.height,
        initialCanvasSize.width,
        initialElements,
        noFollow,
        noIndex,
        ogImage,
        scheduledAt,
        selectedAuthorId,
        selectedBlogStarterTemplate,
        selectedCategoryIds.length,
        selectedTagIds.length,
        seoDescription,
        seoTitle,
        slug,
        status,
        templateSourceMode,
        title,
        user?.id,
    ]);

    useEffect(() => {
        if (!hasHydratedAutosave || autosavePausedForRecovery || isLoading || isPreviewAfterCreateBusy) {
            return;
        }

        if (!hasAutosaveContent) {
            window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
            setLastAutosavedAt(null);
            setAutosaveStatus('Autosave ready');
            return;
        }

        setAutosaveStatus('Saving draft...');
        const autosaveTimer = window.setTimeout(() => {
            try {
                const savedAt = new Date().toISOString();
                const draft: BlogCreateAutosaveDraft = {
                    version: 1,
                    savedAt,
                    activeSiteId,
                    title,
                    slug,
                    excerpt,
                    status,
                    scheduledAt,
                    seoTitle,
                    seoDescription,
                    canonicalPath,
                    featuredImageId,
                    ogImage,
                    noIndex,
                    noFollow,
                    selectedCategoryIds,
                    selectedTagIds,
                    selectedAuthorId,
                    canvasElements,
                    canvasSize,
                    selectedBlogStarterIntent,
                    selectedBlogStarterTemplate,
                    templateSourceMode,
                    designTemplateId,
                    frontendDesignSource: effectiveFrontendTemplate ? effectiveFrontendDesignSource || null : null,
                    frontendDesignTokens: effectiveFrontendTemplate ? effectiveFrontendDesignTokens || null : null,
                    frontendDesignChrome: effectiveFrontendTemplate ? effectiveFrontendDesignChrome || null : null,
                };
                window.localStorage.setItem(BLOG_CREATE_AUTOSAVE_KEY, JSON.stringify(draft));
                setLastAutosavedAt(savedAt);
                setAutosaveStatus(`Autosaved ${new Date(savedAt).toLocaleTimeString()}`);
            } catch {
                setAutosaveStatus('Autosave failed');
            }
        }, 800);

        return () => window.clearTimeout(autosaveTimer);
    }, [
        activeSiteId,
        autosavePausedForRecovery,
        canonicalPath,
        canvasElements,
        canvasSize,
        designTemplateId,
        effectiveFrontendDesignChrome,
        effectiveFrontendDesignSource,
        effectiveFrontendDesignTokens,
        effectiveFrontendTemplate,
        excerpt,
        featuredImageId,
        hasAutosaveContent,
        hasHydratedAutosave,
        isLoading,
        isPreviewAfterCreateBusy,
        noFollow,
        noIndex,
        ogImage,
        scheduledAt,
        selectedAuthorId,
        selectedBlogStarterIntent,
        selectedBlogStarterTemplate,
        selectedCategoryIds,
        selectedTagIds,
        seoDescription,
        seoTitle,
        slug,
        status,
        templateSourceMode,
        title,
    ]);

    const clearAutosavedDraft = () => {
        window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(null);
        setAutosaveStatus('Autosave ready');
    };

    const restoreRecoveredDraft = () => {
        if (!draftRecovery || isLoading || isPreviewAfterCreateBusy) return;

        const recoveredSiteId = draftRecovery.activeSiteId || activeSiteId;
        setActiveSiteId(recoveredSiteId);
        setTitle(draftRecovery.title);
        setSlug(draftRecovery.slug);
        setExcerpt(draftRecovery.excerpt);
        setStatus(draftRecovery.status);
        setScheduledAt(draftRecovery.scheduledAt);
        setSeoTitle(draftRecovery.seoTitle);
        setSeoDescription(draftRecovery.seoDescription);
        setCanonicalPath(draftRecovery.canonicalPath);
        setFeaturedImageId(draftRecovery.featuredImageId);
        setOgImage(draftRecovery.ogImage);
        setNoIndex(draftRecovery.noIndex);
        setNoFollow(draftRecovery.noFollow);
        setSelectedCategoryIds(draftRecovery.selectedCategoryIds);
        setSelectedTagIds(draftRecovery.selectedTagIds);
        setSelectedAuthorId(draftRecovery.selectedAuthorId);
        const recoveredStarterIntent = draftRecovery.selectedBlogStarterIntent || 'article';
        const recoveredStarterTemplate = draftRecovery.selectedBlogStarterTemplate || blogStarterTemplateFromIntent(recoveredStarterIntent);
        setSelectedBlogStarterIntent(recoveredStarterIntent);
        setSelectedBlogStarterTemplate(recoveredStarterTemplate);
        const recoveredTemplateSourceMode = draftRecovery.templateSourceMode || (draftRecovery.designTemplateId ? 'custom-frontend' : 'backy-canvas');
        setTemplateSourceMode(recoveredTemplateSourceMode);
        setDesignTemplateId(draftRecovery.designTemplateId || '');
        setRecoveredFrontendDesignSnapshot(
            draftRecovery.frontendDesignSource || draftRecovery.frontendDesignTokens || draftRecovery.frontendDesignChrome
                ? {
                    source: draftRecovery.frontendDesignSource || { type: 'custom-frontend', label: 'Recovered frontend design contract' },
                    tokens: draftRecovery.frontendDesignTokens || {},
                    chrome: draftRecovery.frontendDesignChrome || {},
                }
                : null,
        );
        setCanvasElements(draftRecovery.canvasElements.length > 0 ? draftRecovery.canvasElements : initialElements);
        setCanvasSize(draftRecovery.canvasSize || initialCanvasSize);
        setCanvasSeedKey(`recovered-${Date.now()}`);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(draftRecovery.savedAt);
        setAutosaveStatus('Recovered draft restored');
        setRouteCheckError(null);
        setRouteCheckRetry((value) => value + 1);
        setError(null);
        setNotice('Recovered local blog draft.');
        navigate({
            to: '/blog/new',
            search: {
                siteId: recoveredSiteId,
                ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}),
                ...(recoveredStarterTemplate !== 'blog-post' ? { starterTemplate: recoveredStarterTemplate } : {}),
                ...(recoveredTemplateSourceMode === 'custom-frontend' ? { templateSource: 'custom-frontend' as const } : {}),
                ...(recoveredTemplateSourceMode === 'custom-frontend' && draftRecovery.designTemplateId ? {
                    designTemplate: draftRecovery.designTemplateId,
                    frontendDesignTemplateId: draftRecovery.designTemplateId,
                    frontendTemplate: draftRecovery.designTemplateId,
                } : {}),
            },
            replace: true,
        });
    };

    const discardRecoveredDraft = () => {
        if (isLoading || isPreviewAfterCreateBusy) return;

        clearAutosavedDraft();
        setError(null);
        setNotice('Recovered draft discarded.');
    };

    const setWorkspaceFocusRoute = (focused: boolean) => {
        navigate({
            to: '/blog/new',
            search: {
                siteId: activeSiteId,
                ...(focused ? { focus: 'canvas' as const } : {}),
                ...(selectedBlogStarterTemplate !== 'blog-post' ? { starterTemplate: selectedBlogStarterTemplate } : {}),
                ...(templateSourceMode === 'custom-frontend' ? { templateSource: 'custom-frontend' as const } : {}),
                ...(templateSourceMode === 'custom-frontend' && designTemplateId ? {
                    designTemplate: designTemplateId,
                    frontendDesignTemplateId: designTemplateId,
                    frontendTemplate: designTemplateId,
                } : {}),
            },
            replace: true,
        });
    };

    const autosaveLabel = draftRecovery
        ? `Recovery from ${new Date(draftRecovery.savedAt).toLocaleTimeString()}`
        : lastAutosavedAt
            ? `Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString()}`
            : autosaveStatus;

    // Dummy settings for CanvasEditor (since we manage settings externally)
    const dummySettings: PageSettings = {
        title,
        slug: slugValue,
        status: 'draft',
        scheduledAt: null,
        meta: {
            title: effectiveSeoTitle || title,
            description: effectiveSeoDescription || excerpt,
        }
    };

    const copyCreationText = async (value: string, label: string) => {
        if (isCreateBusy) return;
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            setError(null);
            setNotice(`${label} copied.`);
        } catch {
            setNotice(null);
            setError(value);
        }
    };

    const downloadCreationHandoff = () => {
        if (isCreateBusy) return;
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

        const blob = new Blob([creationHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${slugValue || 'new-post'}-backy-blog-create-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setError(null);
        setNotice('Blog creation handoff manifest downloaded.');
    };

    const buildPostInput = (nextStatus: BlogPostInput['status'] = status): BlogPostInput => {
        const resolvedStatus = nextStatus || status;
        const frontendTemplateElements = effectiveFrontendTemplate && hasFrontendBlogTemplateRoot(canvasElements, effectiveFrontendTemplate)
            ? canvasElements
            : effectiveFrontendTemplate
                ? buildFrontendBlogTemplateElements(effectiveFrontendTemplate, {
                    title,
                    slug: slugValue,
                    excerpt,
                })
                : canvasElements;
        const contentElements = effectiveFrontendTemplate
            ? updateFrontendBlogTemplateText(frontendTemplateElements, effectiveFrontendTemplate, {
                title,
                excerpt,
            })
            : canvasElements;
        const contentCanvasSize = effectiveFrontendTemplate
            ? getFrontendBlogTemplateCanvasSize(effectiveFrontendTemplate, contentElements)
            : canvasSize;
        const frontendTemplateDesignState = effectiveFrontendTemplate
            ? extractFrontendTemplateDesignSerialization(effectiveFrontendTemplate.content, effectiveFrontendDesignTokens?.customCss)
            : null;
        const templateMetadata = {
            ...(frontendTemplateDesignState?.options?.metadata || {}),
            templateSource: effectiveFrontendTemplate ? 'custom-frontend' : templateSourceMode,
            templateSourceLabel: effectiveFrontendTemplate ? 'Custom frontend' : 'Backy canvas',
            blogStarterTemplate: selectedBlogStarterTemplate,
            blogStarterTemplateName: selectedBlogStarterTemplateOption.name,
            blogStarterIntent: selectedBlogStarterIntent,
            ...(!effectiveFrontendTemplate ? {
                backyCanvasTemplateId: `blog-${selectedBlogStarterTemplate}`,
                backyCanvasSeedIntent: selectedBlogStarterIntent,
            } : {}),
            ...(effectiveFrontendTemplate?.id ? { frontendDesignTemplateId: effectiveFrontendTemplate.id } : {}),
            ...(effectiveFrontendTemplate?.name ? { frontendDesignTemplateName: effectiveFrontendTemplate.name } : {}),
            ...(effectiveFrontendTemplate?.routePattern ? { frontendDesignRoutePattern: effectiveFrontendTemplate.routePattern } : {}),
        };
        const content = serializeCanvasContent(contentElements, contentCanvasSize, frontendTemplateDesignState?.customCSS, {
            documentId: `new-post-${slugValue || title || 'draft'}`,
            kind: 'post',
            title,
            slug: slugValue,
            status: resolvedStatus,
            locale: 'en',
            ...(frontendTemplateDesignState?.options || {}),
            metadata: templateMetadata,
        });

        return {
            title,
            slug: slugValue,
            excerpt,
            status: resolvedStatus,
            scheduledAt: resolvedStatus === 'scheduled' ? scheduledAt : null,
            featuredImageId,
            authorId: selectedAuthorId || user?.id || 'admin',
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            content: JSON.parse(content),
            meta: {
                title: effectiveSeoTitle || title,
                description: effectiveSeoDescription || excerpt,
                canonical: normalizedCanonicalPath,
                ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
                noIndex,
                noFollow,
                template: 'blog-article',
                templateSource: effectiveFrontendTemplate ? 'custom-frontend' : templateSourceMode,
                templateSourceLabel: effectiveFrontendTemplate ? 'Custom frontend' : 'Backy canvas',
                blogStarterTemplate: selectedBlogStarterTemplate,
                blogStarterTemplateName: selectedBlogStarterTemplateOption.name,
                blogStarterIntent: selectedBlogStarterIntent,
                backyCanvasTemplateId: effectiveFrontendTemplate ? undefined : `blog-${selectedBlogStarterTemplate}`,
                backyCanvasSeedIntent: effectiveFrontendTemplate ? undefined : selectedBlogStarterIntent,
                frontendDesignTemplateId: effectiveFrontendTemplate?.id,
                frontendDesignTemplateName: effectiveFrontendTemplate?.name,
                frontendDesignSource: effectiveFrontendDesignSource,
                frontendDesignRoutePattern: effectiveFrontendTemplate?.routePattern,
                frontendDesignTokens: effectiveFrontendDesignTokens,
                frontendDesignChrome: effectiveFrontendDesignChrome,
                frontendDesignCustomCss: frontendTemplateDesignState?.customCSS,
                frontendDesignCustomJs: frontendTemplateDesignState?.provenance.customJS,
                frontendDesignContentDocument: frontendTemplateDesignState?.provenance.contentDocument,
                frontendDesignElements: frontendTemplateDesignState?.provenance.elements,
                frontendDesignCanvasSize: frontendTemplateDesignState?.provenance.canvasSize,
                frontendDesignThemeTokenRefs: frontendTemplateDesignState?.provenance.themeTokenRefs,
                frontendDesignAssets: frontendTemplateDesignState?.provenance.assets,
                frontendDesignAnimations: frontendTemplateDesignState?.provenance.animations,
                frontendDesignInteractions: frontendTemplateDesignState?.provenance.interactions,
                frontendDesignDataBindings: frontendTemplateDesignState?.provenance.dataBindings,
                frontendDesignEditableMap: frontendTemplateDesignState?.provenance.editableMap,
                frontendDesignSeo: frontendTemplateDesignState?.provenance.seo,
                frontendDesignMetadata: frontendTemplateDesignState?.provenance.metadata,
                frontendDesignBindingHints: effectiveFrontendTemplate?.bindingHints,
            },
        };
    };

    const getCreateBlockedMessage = (mode: 'save' | 'preview') => {
        if (!canEditBlog) return editBlogDeniedMessage;
        if (mode === 'preview' && !canPublishBlog) return publishBlogDeniedMessage;
        if (mode === 'save' && status !== 'draft' && !canPublishBlog) return publishBlogDeniedMessage;
        if ((mode === 'preview' || (mode === 'save' && status !== 'draft')) && interactivePublishDisabledReason) {
            return interactivePublishDisabledReason;
        }
        if (!templateSourceReady) {
            return isCustomFrontendTemplateSource
                ? frontendDesignLoading
                    ? 'Custom frontend blog templates are still loading.'
                    : frontendBlogTemplates.length > 0
                        ? 'Choose a custom frontend blog template before saving.'
                        : 'Capture a blog post template from the custom frontend, or switch back to Backy canvas.'
                : 'Choose a blog template source before saving.';
        }
        if (isCheckingPosts) return 'Checking existing blog routes before saving';
        if (routeCheckError) return 'Backy could not verify existing blog routes for this site. Retry the route check before saving.';
        if (routeConflict) return `The ${routePath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`;
        if (!canonicalValid) return 'Canonical path must start with / before saving';
        if (mode === 'save' && scheduleValidationMessage) return scheduleValidationMessage;
        return 'Add a title and URL slug before saving';
    };
    const submitBlockerMessage = isLoading || canSubmit ? null : getCreateBlockedMessage('save');
    const previewDraftBlockerMessage = isPreviewAfterCreateBusy || canCreatePreviewDraft ? null : getCreateBlockedMessage('preview');
    const isTemplateSourceBusy = isCustomFrontendTemplateSource && frontendDesignLoading && !effectiveFrontendTemplate;
    const submitControlState = canSubmit ? 'ready' : (isCreateBusy || isCheckingPosts || isPermissionMatrixPending || isTemplateSourceBusy) ? 'busy' : 'blocked';
    const previewDraftControlState = canCreatePreviewDraft ? 'ready' : (isCreateBusy || isCheckingPosts || isPermissionMatrixPending || isTemplateSourceBusy) ? 'busy' : 'blocked';
    const blogCreateSubmitActionStatusId = 'blog-create-submit-action-status';
    const blogCreatePreviewActionStatusId = 'blog-create-preview-action-status';
    const blogCreateCommandActionStatusId = 'blog-create-command-action-status';
    const blogCreateCommandSecondaryActionStatusId = 'blog-create-command-secondary-action-status';
    const blogCreatePermissionActionStatusId = 'blog-create-permission-action-status';
    const blogCreateRecoveryActionStatusId = 'blog-create-recovery-action-status';
    const blogCreateTemplateName = createPayloadPreview.template.name;
    const blogCreateSubmitActionLabel = status === 'published'
        ? 'Publish post'
        : status === 'scheduled'
            ? 'Schedule post'
            : 'Save draft';
    const blogCreateSubmitDisabledReason = isCreateBusy
        ? 'Blog post creation is already running.'
        : !canEditBlog
            ? editBlogDeniedMessage
            : '';
    const blogCreatePreviewDisabledReason = isCreateBusy
        ? 'Blog post creation is already running.'
        : !canAttemptCreatePreviewDraft
            ? !canEditBlog
                ? editBlogDeniedMessage
                : publishBlogDeniedMessage
            : '';
    const blogCreateSubmitActionState = blogCreateSubmitDisabledReason || submitBlockerMessage ? 'blocked' : 'ready';
    const blogCreatePreviewActionState = blogCreatePreviewDisabledReason || previewDraftBlockerMessage ? 'blocked' : 'ready';
    const blogCreateSubmitActionStatus = blogCreateSubmitDisabledReason
        ? `${blogCreateSubmitActionLabel} unavailable: ${blogCreateSubmitDisabledReason}`
        : submitBlockerMessage
            ? `${blogCreateSubmitActionLabel} needs attention: ${submitBlockerMessage}`
            : `${blogCreateSubmitActionLabel} available for ${activeSiteId} at ${routePath} using ${blogCreateTemplateName}.`;
    const blogCreatePreviewActionStatus = blogCreatePreviewDisabledReason
        ? `Preview draft unavailable: ${blogCreatePreviewDisabledReason}`
        : previewDraftBlockerMessage
            ? `Preview draft needs attention: ${previewDraftBlockerMessage}`
            : `Preview draft available for ${activeSiteId} at ${routePath} using ${blogCreateTemplateName}.`;
    const blogCreateSubmitDescribedBy = submitBlockerMessage
        ? `${blogCreateSubmitActionStatusId} blog-create-submit-blocker`
        : blogCreateSubmitActionStatusId;
    const blogCreatePreviewDescribedBy = previewDraftBlockerMessage && submitBlockerMessage
        ? `${blogCreatePreviewActionStatusId} blog-create-submit-blocker`
        : blogCreatePreviewActionStatusId;
    const blogCreateBackActionState = isCreateBusy ? 'busy' : 'ready';
    const blogCreateBackActionStatus = isCreateBusy
        ? 'Blog list unavailable while blog post creation is running.'
        : `Back to Blog posts available for ${activeSiteId}.`;
    const blogCreateFocusActionStatus = isCreateBusy
        ? 'Canvas focus switch unavailable while blog post creation is running.'
        : isWorkspaceFocus
            ? 'Show blog creation panels available.'
            : 'Focus blog creation canvas available.';
    const blogCreateHandoffActionState = isCreateBusy ? 'busy' : canViewBlog ? 'ready' : 'blocked';
    const blogCreateCopyActionStatus = isCreateBusy
        ? 'Copy blog creation handoff unavailable while blog post creation is running.'
        : !canViewBlog
            ? `Copy blog creation handoff unavailable: ${viewBlogDeniedMessage}`
            : `Copy blog creation handoff available for ${activeSiteId} at ${routePath}.`;
    const blogCreateDownloadActionStatus = isCreateBusy
        ? 'Download blog creation handoff unavailable while blog post creation is running.'
        : !canViewBlog
            ? `Download blog creation handoff unavailable: ${viewBlogDeniedMessage}`
            : `Download blog creation handoff available for ${activeSiteId} at ${routePath}.`;
    const blogCreateCommandSecondaryActionStatus = [
        blogCreateCopyActionStatus,
        blogCreateDownloadActionStatus,
    ].join(' ');
    const blogCreateRouteRetryActionStatus = isCreateBusy
        ? 'Retry blog route check unavailable while blog post creation is running.'
        : `Retry blog route check available for ${activeSiteId}.`;
    const blogCreatePermissionRetryActionStatus = isPermissionsLoading
        ? 'Retry blog creation permissions unavailable while permissions are loading.'
        : 'Retry blog creation permissions available.';
    const blogCreatePermissionReviewActionStatus = 'Review user access for blog creation permissions available.';
    const blogCreateRecoveryActionState = isCreateBusy ? 'busy' : 'ready';
    const blogCreateDiscardRecoveryActionStatus = isCreateBusy
        ? 'Discard recovered blog draft unavailable while blog post creation is running.'
        : 'Discard recovered blog draft available.';
    const blogCreateRestoreRecoveryActionStatus = isCreateBusy
        ? 'Restore recovered blog draft unavailable while blog post creation is running.'
        : 'Restore recovered blog draft available.';

    const handleCreatePreview = async () => {
        if (isLoading || isPreviewAfterCreateBusy) return;
        if (!canEditBlog || !canPublishBlog) {
            setError(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setNotice(null);
            return;
        }

        if (!canCreatePreviewDraft) {
            setError(previewDraftBlockerMessage || 'Review the required blog basics before creating this preview draft.');
            setNotice(null);
            return;
        }

        setIsPreviewAfterCreateBusy(true);
        setError(null);
        setNotice(null);

        let created: BlogPost | null = null;

        try {
            created = await createBlogPost(activeSiteId, buildPostInput('draft'));
            setPosts([created, ...posts.filter((post) => post.id !== created?.id)]);
            clearAutosavedDraft();

            const preview = await createBlogPostPreview(activeSiteId, created.id);
            window.open(preview.url, '_blank', 'noopener,noreferrer');
            navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId, focus: 'canvas' } });
        } catch (createError) {
            if (created) {
                navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId, focus: 'canvas' } });
                return;
            }

            setError(createError instanceof Error
                ? `${createError.message}. The preview draft was not created.`
                : 'Unable to create preview draft. The post was not persisted.');
        } finally {
            setIsPreviewAfterCreateBusy(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isCreateBusy) return;
        setBlogCreateFormSubmitted(true);

        if (!canEditBlog || (status !== 'draft' && !canPublishBlog)) {
            setError(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setNotice(null);
            return;
        }

        const currentScheduleValidationMessage = getScheduledBlogPostDateError(status, scheduledAt);
        if (currentScheduleValidationMessage) {
            setError(currentScheduleValidationMessage);
            setNotice(null);
            return;
        }

        if (!canSubmit) {
            setError(submitBlockerMessage || 'Review the required blog basics before saving.');
            setNotice(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setNotice(null);
        setRouteCheckError(null);

        try {
            const created = await createBlogPost(activeSiteId, buildPostInput(status));
            setPosts([created, ...posts.filter((post) => post.id !== created.id)]);
            clearAutosavedDraft();
            navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId, focus: 'canvas' } });
        } catch (createError) {
            setError(createError instanceof Error
                ? `${createError.message}. The post was not created because the backend did not persist it.`
                : 'Unable to create post. The post was not persisted.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            if (!isCreateBusy) {
                                void navigate({ to: '/blog', search: { siteId: activeSiteId } });
                            }
                        }}
                        disabled={isCreateBusy}
                        title={blogCreateBackActionStatus}
                        aria-label="Back to blog posts"
                        aria-describedby={blogCreateCommandActionStatusId}
                        data-testid="blog-create-back-to-blog"
                        data-action-state={blogCreateBackActionState}
                        data-action-status={blogCreateBackActionStatus}
                        data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : undefined}
                        className="rounded-lg border border-border bg-background p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>New Blog Post</span>
                </div>
            }
            description="Create a post and design its public page from the same workspace."
            className={cn(
                isWorkspaceFocus
                    ? 'h-[calc(100vh-1rem)] overflow-hidden lg:h-[calc(100vh-1.5rem)]'
                    : undefined,
            )}
            contentClassName={isWorkspaceFocus ? 'h-full min-h-0' : 'flex flex-col gap-5'}
            hideHeader={isWorkspaceFocus}
            action={
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWorkspaceFocusRoute(!isWorkspaceFocus)}
                    disabled={isCreateBusy}
                    title={blogCreateFocusActionStatus}
                    aria-describedby={blogCreateCommandActionStatusId}
                    data-testid="blog-create-focus-toggle"
                    data-action-state={blogCreateBackActionState}
                    data-action-status={blogCreateFocusActionStatus}
                    data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : undefined}
                    iconStart={isWorkspaceFocus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                >
                    {isWorkspaceFocus ? 'Show blog panels' : 'Focus canvas'}
                </Button>
            }
        >
            <div className={cn('w-full', isWorkspaceFocus ? 'h-full min-h-0 overflow-hidden pb-0' : 'pb-24')}>
                <span id={blogCreateCommandActionStatusId} className="sr-only" data-testid="blog-create-command-action-status" aria-live="polite">
                    {blogCreateBackActionStatus} {blogCreateFocusActionStatus} {blogCreateCopyActionStatus} {blogCreateDownloadActionStatus} {blogCreateRouteRetryActionStatus}
                </span>
                <span id={blogCreateCommandSecondaryActionStatusId} className="sr-only" data-testid="blog-create-command-secondary-action-status" aria-live="polite">
                    {blogCreateCommandSecondaryActionStatus}
                </span>
                {error && (
                    <Notice tone="warning" className="mb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{error}</span>
                            {routeCheckError && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isCreateBusy}
                                    aria-describedby={blogCreateCommandActionStatusId}
                                    data-testid="blog-create-route-check-retry"
                                    data-action-state={isCreateBusy ? 'busy' : 'ready'}
                                    data-action-status={blogCreateRouteRetryActionStatus}
                                    data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : undefined}
                                    onClick={() => {
                                        if (isCreateBusy) return;
                                        setRouteCheckRetry((value) => value + 1);
                                    }}
                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingPosts && 'animate-spin')} />}
                                >
                                    Retry route check
                                </Button>
                            )}
                        </div>
                    </Notice>
                )}
                {notice && (
                    <Notice tone="success" className="mb-4">
                        {notice}
                    </Notice>
                )}
                {permissionError && (
                    <Notice
                        tone="warning"
                        title="Blog creation permissions could not be verified"
                        className="mb-4"
                        role="alert"
                        data-testid="blog-create-permission-state"
                    >
                        <span id={blogCreatePermissionActionStatusId} className="sr-only" data-testid="blog-create-permission-action-status" aria-live="polite">
                            {blogCreatePermissionRetryActionStatus} {blogCreatePermissionReviewActionStatus}
                        </span>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{permissionError}</span>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={loadBlogCreatePermissions}
                                    disabled={isPermissionsLoading}
                                    aria-label="Retry loading blog creation permissions"
                                    aria-describedby={blogCreatePermissionActionStatusId}
                                    data-testid="blog-create-permission-retry"
                                    data-action-state={isPermissionsLoading ? 'busy' : 'ready'}
                                    data-action-status={blogCreatePermissionRetryActionStatus}
                                    data-disabled-reason={isPermissionsLoading ? 'Blog creation permissions are already loading.' : undefined}
                                    iconStart={<RefreshCw className={cn('size-3.5', isPermissionsLoading && 'animate-spin')} />}
                                >
                                    Retry permissions
                                </Button>
                                <Link
                                    to="/users"
                                    aria-describedby={blogCreatePermissionActionStatusId}
                                    data-testid="blog-create-permission-review-users"
                                    data-action-state="ready"
                                    data-action-status={blogCreatePermissionReviewActionStatus}
                                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-ring"
                                >
                                    Review users
                                </Link>
                            </div>
                        </div>
                    </Notice>
                )}
                {draftRecovery && (
                    <Notice tone="info" title="Recovered unsaved blog draft" className="mb-4">
                        <span id={blogCreateRecoveryActionStatusId} className="sr-only" data-testid="blog-create-recovery-action-status" aria-live="polite">
                            {blogCreateDiscardRecoveryActionStatus} {blogCreateRestoreRecoveryActionStatus}
                        </span>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                Local autosave found a draft from {new Date(draftRecovery.savedAt).toLocaleString()} for {draftRecovery.activeSiteId}.
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isLoading || isPreviewAfterCreateBusy}
                                    aria-describedby={blogCreateRecoveryActionStatusId}
                                    data-testid="blog-create-discard-recovery"
                                    data-action-state={blogCreateRecoveryActionState}
                                    data-action-status={blogCreateDiscardRecoveryActionStatus}
                                    data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : undefined}
                                    onClick={discardRecoveredDraft}
                                >
                                    Discard recovery
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isLoading || isPreviewAfterCreateBusy}
                                    aria-describedby={blogCreateRecoveryActionStatusId}
                                    data-testid="blog-create-restore-recovery"
                                    data-action-state={blogCreateRecoveryActionState}
                                    data-action-status={blogCreateRestoreRecoveryActionStatus}
                                    data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : undefined}
                                    onClick={restoreRecoveredDraft}
                                >
                                    Restore draft
                                </Button>
                            </div>
                        </div>
                    </Notice>
                )}

                <form id="blog-create-form" onSubmit={handleSubmit} noValidate className={cn('grid gap-5', isWorkspaceFocus && 'h-full min-h-0')}>
                    {!isWorkspaceFocus && (
                    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="blog-create-command-center">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold text-foreground">Post creation command center</h2>
                                    <span className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                                        readinessScore >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                    )}
                                    >
                                        {readinessScore}% ready
                                    </span>
                                    <span className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                                        draftRecovery
                                            ? 'bg-sky-50 text-sky-700'
                                            : autosaveStatus === 'Autosave failed'
                                                ? 'bg-red-50 text-red-700'
                                                : 'bg-slate-100 text-slate-700',
                                    )}
                                    >
                                        {autosaveLabel}
                                    </span>
                                </div>
                                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                    Draft, preview, publish, taxonomy, frontend handoff, and public canvas controls stay together without pushing the editor out of reach.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 xl:items-end">
                                <div className="flex flex-wrap items-center gap-2 xl:justify-end" data-testid="blog-create-primary-actions">
                                    <Button
                                        type="submit"
                                        disabled={createFormDisabled}
                                        title={submitBlockerMessage || 'Save the post and open the visual editor'}
                                        aria-describedby={blogCreateSubmitDescribedBy}
                                        data-testid="blog-create-submit-button"
                                        data-state={submitControlState}
                                        data-blocker={submitBlockerMessage || ''}
                                        data-can-submit={String(canSubmit)}
                                        data-can-preview={String(canCreatePreviewDraft)}
                                        data-action-state={blogCreateSubmitActionState}
                                        data-action-status={blogCreateSubmitActionStatus}
                                        data-disabled-reason={blogCreateSubmitDisabledReason || undefined}
                                        data-target-site-id={activeSiteId || undefined}
                                        data-target-route={routePath}
                                        data-target-status={status}
                                        data-target-template={blogCreateTemplateName}
                                        variant="primary"
                                        iconStart={<Save className="size-4" />}
                                    >
                                        {isLoading ? 'Saving...' : isCheckingPosts && !canSubmit ? 'Checking routes...' : submitLabel}
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy || !canAttemptCreatePreviewDraft}
                                        title={previewDraftBlockerMessage || 'Create a draft, open a preview link, and continue in the visual editor'}
                                        aria-describedby={blogCreatePreviewDescribedBy}
                                        data-testid="blog-create-preview-button"
                                        data-state={previewDraftControlState}
                                        data-can-preview={String(canCreatePreviewDraft)}
                                        data-blocker={previewDraftBlockerMessage || ''}
                                        data-action-state={blogCreatePreviewActionState}
                                        data-action-status={blogCreatePreviewActionStatus}
                                        data-disabled-reason={blogCreatePreviewDisabledReason || undefined}
                                        data-target-site-id={activeSiteId || undefined}
                                        data-target-route={routePath}
                                        data-target-status="draft"
                                        data-target-template={blogCreateTemplateName}
                                        onClick={() => void handleCreatePreview()}
                                        variant="outline"
                                        iconStart={<Eye className="size-4" />}
                                    >
                                        {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                    </Button>
                                </div>
                                <details
                                    className="group relative self-start xl:self-end"
                                    aria-describedby={blogCreateCommandSecondaryActionStatusId}
                                    data-action-state={blogCreateHandoffActionState}
                                    data-action-status={blogCreateCommandSecondaryActionStatus}
                                    data-target-site-id={activeSiteId || undefined}
                                    data-target-route={routePath}
                                    data-testid="blog-create-secondary-actions"
                                    data-default-collapsed="true"
                                >
                                    <summary
                                        className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-ring group-open:bg-accent [&::-webkit-details-marker]:hidden"
                                        aria-describedby={blogCreateCommandSecondaryActionStatusId}
                                        data-testid="blog-create-more-actions"
                                    >
                                        <MoreHorizontal className="size-4" />
                                        More actions
                                    </summary>
                                    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-72" data-testid="blog-create-secondary-action-menu">
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={isCreateBusy || !canViewBlog}
                                            title={viewBlogPermissionTitle}
                                            aria-describedby={blogCreateCommandSecondaryActionStatusId}
                                            data-testid="blog-create-copy-handoff"
                                            data-action-state={blogCreateHandoffActionState}
                                            data-action-status={blogCreateCopyActionStatus}
                                            data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : !canViewBlog ? viewBlogDeniedMessage : undefined}
                                            data-target-site-id={activeSiteId || undefined}
                                            data-target-route={routePath}
                                            onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                            variant="ghost"
                                            className="w-full justify-start"
                                            iconStart={<Copy className="size-4" />}
                                        >
                                            Copy handoff
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={isCreateBusy || !canViewBlog}
                                            title={viewBlogPermissionTitle}
                                            aria-describedby={blogCreateCommandSecondaryActionStatusId}
                                            data-testid="blog-create-download-handoff"
                                            data-action-state={blogCreateHandoffActionState}
                                            data-action-status={blogCreateDownloadActionStatus}
                                            data-disabled-reason={isCreateBusy ? 'Blog post creation is already running.' : !canViewBlog ? viewBlogDeniedMessage : undefined}
                                            data-target-site-id={activeSiteId || undefined}
                                            data-target-route={routePath}
                                            onClick={downloadCreationHandoff}
                                            variant="ghost"
                                            className="w-full justify-start"
                                            iconStart={<Download className="size-4" />}
                                        >
                                            Download JSON
                                        </Button>
                                    </div>
                                </details>
                            </div>
                        </div>

                        <span id={blogCreateSubmitActionStatusId} className="sr-only" data-testid="blog-create-submit-action-status" aria-live="polite">
                            {blogCreateSubmitActionStatus}
                        </span>
                        <span id={blogCreatePreviewActionStatusId} className="sr-only" data-testid="blog-create-preview-action-status" aria-live="polite">
                            {blogCreatePreviewActionStatus}
                        </span>
                        {submitBlockerMessage && (
                            <div
                                id="blog-create-submit-blocker"
                                role="status"
                                aria-live="polite"
                                data-testid="blog-create-submit-blocker"
                                data-state={submitControlState}
                                className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                            >
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    <div className="font-semibold">Save is blocked</div>
                                    <div className="mt-0.5">{submitBlockerMessage}</div>
                                </div>
                            </div>
                        )}

                        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                            <details
                                className="group rounded-lg border border-border bg-background/80 p-4"
                                data-testid="blog-create-readiness-summary"
                            >
                                <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold">Creation readiness</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {readinessChecks.filter((check) => check.complete).length} of {readinessChecks.length} checks passing.
                                        </p>
                                    </div>
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground group-open:bg-primary/10 group-open:text-primary">
                                        Review checks
                                    </span>
                                </summary>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn('h-full rounded-full', readinessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                                        style={{ width: `${readinessScore}%` }}
                                    />
                                </div>
                                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                                    {readinessChecks.map((check) => (
                                        <BlogCreateReadinessCheck key={check.label} label={check.label} ready={check.complete} />
                                    ))}
                                </div>
                            </details>

                            <details className="group rounded-lg border border-border bg-background/80 p-4">
                                <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <FileText className="size-4 shrink-0 text-primary" />
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold">Create-to-publish workflow</h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                Write, design, validate, then publish from the same draft.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground group-open:bg-primary/10 group-open:text-primary">
                                        {BLOG_CREATE_WORKFLOW.length} steps
                                    </span>
                                </summary>
                                <div className="mt-3 grid gap-2">
                                    {BLOG_CREATE_WORKFLOW.map((step, index) => (
                                        <BlogCreateWorkflowStep key={step.label} index={index + 1} {...step} />
                                    ))}
                                </div>
                            </details>
                        </div>

                        <details className="mt-4 rounded-lg border border-border bg-background/80 p-4" data-testid="blog-create-control-map">
                            <summary className="cursor-pointer list-none rounded-md outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="flex flex-wrap items-center justify-between gap-3">
                                    <span>
                                        <span className="block text-sm font-semibold">Post creation control map</span>
                                        <span className="mt-1 block text-sm text-muted-foreground">
                                            Jump directly to the creation area you need.
                                        </span>
                                    </span>
                                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                        {BLOG_CREATE_CONTROL_AREAS.length} areas
                                    </span>
                                </span>
                            </summary>
                            <nav className="mt-3 flex flex-wrap gap-2" aria-label="Post creation control map">
                                {BLOG_CREATE_CONTROL_AREAS.map((area) => (
                                    <a
                                        key={area.title}
                                        href={area.href}
                                        aria-label={`${area.title}: ${area.detail}`}
                                        className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                                    >
                                        {area.title}
                                    </a>
                                ))}
                            </nav>
                        </details>
                    </section>
                    )}

                    <div
                        className={cn('grid gap-5', isWorkspaceFocus && 'h-full min-h-0')}
                        data-testid="blog-create-workspace-grid"
                        data-editor-management-layout={isWorkspaceFocus ? 'hidden' : 'below-canvas'}
                    >
                    <div className={cn('min-w-0 space-y-6', isWorkspaceFocus && 'h-full min-h-0 space-y-0')}>
                        {!isWorkspaceFocus && (
                        <>
                        <Panel id="blog-create-draft" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="Editorial draft"
                                description="Title, canonical URL, and public summary."
                                icon={<PenLine className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="blog-create-title" className="text-xs font-medium text-muted-foreground">Post title</label>
                            <input
                                id="blog-create-title"
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    clearCreationFeedback();
                                    setTitle(e.target.value);
                                    if (!slug) {
                                        setSlug(slugify(e.target.value));
                                    }
                                }}
                                placeholder="Untitled post"
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
                                aria-invalid={Boolean(blogTitleInlineError)}
                                aria-describedby={blogTitleInlineError ? 'blog-create-title-error' : undefined}
                                data-testid="blog-create-title-input"
                                className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                autoFocus
                            />
                            {blogTitleInlineError && (
                                <p id="blog-create-title-error" className="text-xs text-destructive" data-testid="blog-create-title-error">
                                    {blogTitleInlineError}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                <label htmlFor="blog-create-slug" className="font-mono text-muted-foreground">/blog/</label>
                                <input
                                    id="blog-create-slug"
                                    type="text"
                                    value={slug}
                                    onChange={(e) => {
                                        clearCreationFeedback();
                                        setSlug(e.target.value);
                                    }}
                                    disabled={createFormDisabled}
                                    title={editBlogPermissionTitle}
                                    aria-invalid={Boolean(blogSlugInlineError)}
                                    aria-describedby={blogSlugInlineError ? 'blog-create-slug-error' : undefined}
                                    data-testid="blog-create-slug-input"
                                    className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="post-slug"
                                />
                            </div>
                            {blogSlugInlineError && (
                                <p id="blog-create-slug-error" className="text-xs text-destructive" data-testid="blog-create-slug-error">
                                    {blogSlugInlineError}
                                </p>
                            )}
                        </div>
                        {(routeConflict || routeCheckError) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                {routeCheckError
                                    ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                                    : `${routePath} is already used by "${routeConflict?.title}". Choose another slug or edit that post first.`}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="blog-create-excerpt" className="text-xs font-medium text-muted-foreground">Excerpt</label>
                            <textarea
                                id="blog-create-excerpt"
                                value={excerpt}
                                onChange={(e) => {
                                    clearCreationFeedback();
                                    setExcerpt(e.target.value);
                                }}
                                rows={3}
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="Write the summary that appears in blog lists, feeds, and SEO previews."
                            />
                            <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                        </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-writing" className="overflow-hidden scroll-mt-24" data-testid="blog-create-writing-panel">
                            <PanelHeader
                                title="Writing structure"
                                description="Plan long-form article flow before publishing: sections, pull quotes, word count, and reading time."
                                icon={<FileText className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-3" data-testid="blog-create-writing-metrics">
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Total words</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.totalWords}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Canvas words</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.canvasWords}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Reading time</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.readingMinutes} min</div>
                                    </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
                                        onClick={() => addLongFormBlock('section')}
                                        data-testid="blog-create-add-section"
                                    >
                                        Add section
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
                                        onClick={() => addLongFormBlock('quote')}
                                        data-testid="blog-create-add-quote"
                                    >
                                        Add pull quote
                                    </Button>
                                </div>
                                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
                                    Inserted blocks become normal editable canvas layers and are saved with the post content for hosted and custom frontends.
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-seo" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="SEO and discovery"
                                description="Search metadata, canonical path, Open Graph image, and robots controls for hosted pages and external frontends."
                                icon={<SearchCheck className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <label htmlFor="blog-create-seo-title" className="text-xs font-medium text-muted-foreground">Search title</label>
                                        <input
                                            id="blog-create-seo-title"
                                            type="text"
                                            value={seoTitle}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setSeoTitle(e.target.value);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={title || 'Search result title'}
                                        />
                                        <div className="text-xs text-muted-foreground">{effectiveSeoTitle.length} characters</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="blog-create-canonical" className="text-xs font-medium text-muted-foreground">Canonical path</label>
                                        <input
                                            id="blog-create-canonical"
                                            type="text"
                                            value={canonicalPath}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setCanonicalPath(e.target.value);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
                                            aria-invalid={Boolean(blogCanonicalInlineError)}
                                            aria-describedby={blogCanonicalInlineError ? 'blog-create-canonical-error' : undefined}
                                            data-testid="blog-create-canonical-input"
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={routePath}
                                        />
                                        {blogCanonicalInlineError && (
                                            <p id="blog-create-canonical-error" className="text-xs text-destructive" data-testid="blog-create-canonical-error">
                                                {blogCanonicalInlineError}
                                            </p>
                                        )}
                                        <div className={cn('text-xs', canonicalValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                            {normalizedCanonicalPath}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="blog-create-seo-description" className="text-xs font-medium text-muted-foreground">Search description</label>
                                    <textarea
                                        id="blog-create-seo-description"
                                        value={seoDescription}
                                        onChange={(e) => {
                                            clearCreationFeedback();
                                            setSeoDescription(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={excerpt || 'Describe the article for search, social previews, feeds, and generated frontends.'}
                                    />
                                    <div className={cn('text-xs', effectiveSeoDescription.length >= 50 ? 'text-muted-foreground' : 'text-amber-700')}>
                                        {effectiveSeoDescription.length} characters. Aim for at least 50.
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="blog-create-og-image" className="text-xs font-medium text-muted-foreground">Open Graph image URL</label>
                                    <input
                                        id="blog-create-og-image"
                                        type="url"
                                        value={ogImage}
                                        onChange={(e) => {
                                            clearCreationFeedback();
                                            setOgImage(e.target.value);
                                        }}
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={selectedFeaturedImageUrl || 'https://...'}
                                    />
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noIndex}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setNoIndex(e.target.checked);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No index</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers to keep this post out of search indexes.</span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noFollow}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setNoFollow(e.target.checked);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No follow</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers not to follow links from this post.</span>
                                        </span>
                                    </label>
                                </div>
                            </PanelContent>
                        </Panel>
                        </>
                        )}

                        {!isWorkspaceFocus && (
                            <Panel id="blog-create-design-template" className="overflow-hidden scroll-mt-24" data-testid="blog-frontend-template-panel">
                                <PanelHeader
                                    title="Template source"
                                    description="Choose Backy canvas generation or a captured custom frontend blog template."
                                    icon={<LayoutTemplate className="size-4" />}
                                />
                                <PanelContent className="space-y-4">
                                    <div
                                        className="rounded-lg border border-border bg-background p-3"
                                        data-testid="blog-template-source-switch"
                                        data-active-source={templateSourceMode}
                                        data-action-state={templateSourceReady ? 'ready' : 'blocked'}
                                        data-action-status={templateSourceStatus}
                                        data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                    >
                                        <span id={blogTemplateSelectionActionStatusId} className="sr-only" data-testid="blog-template-selection-action-status" aria-live="polite">
                                            {blogTemplateSelectionActionStatus}
                                        </span>
                                        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Blog template source">
                                            <button
                                                type="button"
                                                onClick={() => handleTemplateSourceChange('backy-canvas')}
                                                disabled={blogTemplateSelectionControlDisabled}
                                                aria-pressed={templateSourceMode === 'backy-canvas'}
                                                aria-describedby={blogTemplateSelectionActionStatusId}
                                                data-testid="blog-template-source-backy-canvas"
                                                data-active={templateSourceMode === 'backy-canvas'}
                                                data-action-state={getBlogTemplateSelectionActionState(templateSourceMode === 'backy-canvas')}
                                                data-action-status={getBlogTemplateSourceActionStatus('backy-canvas')}
                                                data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                className={cn(
                                                    'min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                                                    templateSourceMode === 'backy-canvas'
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent',
                                                )}
                                            >
                                                Backy canvas
                                                <span className="mt-0.5 block text-xs font-normal opacity-80">Generated editable article</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTemplateSourceChange('custom-frontend')}
                                                disabled={blogTemplateSelectionControlDisabled}
                                                aria-pressed={templateSourceMode === 'custom-frontend'}
                                                aria-describedby={blogTemplateSelectionActionStatusId}
                                                data-testid="blog-template-source-custom-frontend"
                                                data-active={templateSourceMode === 'custom-frontend'}
                                                data-template-count={frontendBlogTemplates.length}
                                                data-action-state={getBlogTemplateSelectionActionState(templateSourceMode === 'custom-frontend')}
                                                data-action-status={getBlogTemplateSourceActionStatus('custom-frontend')}
                                                data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                className={cn(
                                                    'min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                                                    templateSourceMode === 'custom-frontend'
                                                        ? 'border-teal-700 bg-teal-700 text-white'
                                                        : 'border-border bg-card text-foreground hover:border-teal-400 hover:bg-accent',
                                                )}
                                            >
                                                Custom frontend
                                                <span className="mt-0.5 block text-xs font-normal opacity-80">Stored design contract</span>
                                            </button>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground" data-testid="blog-template-source-status">
                                            {templateSourceStatus}
                                        </div>
                                    </div>

                                    <div
                                        className="rounded-lg border border-border bg-background p-3"
                                        data-testid="blog-starter-library-shell"
                                        data-template-source={templateSourceMode}
                                        data-selected-starter={selectedBlogStarterTemplate}
                                        data-selected-intent={selectedBlogStarterIntent}
                                        data-custom-frontend-match-mode={isCustomFrontendTemplateSource ? selectedFrontendTemplateMatchMode : undefined}
                                        data-custom-frontend-template-id={isCustomFrontendTemplateSource ? effectiveFrontendTemplate?.id || '' : undefined}
                                    >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <h3 className="text-sm font-semibold text-foreground">Starter templates</h3>
                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {isCustomFrontendTemplateSource
                                                        ? 'Pick the post purpose; Backy matches it to captured custom frontend blog structure when available.'
                                                        : 'Pick a focused starting point, then write into the editable blog canvas.'}
                                                </p>
                                            </div>
                                            <span className="w-fit rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                                                {visibleBlogStarterTemplateOptions.length} of {BLOG_STARTER_TEMPLATE_OPTIONS.length} templates
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)]" data-testid="blog-template-library-filters">
                                            <label className="relative block min-w-0" htmlFor="blog-template-library-search">
                                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                <input
                                                    id="blog-template-library-search"
                                                    type="search"
                                                    value={blogTemplateSearchQuery}
                                                    onChange={(event) => setBlogTemplateSearchQuery(event.target.value)}
                                                    disabled={blogTemplateSelectionControlDisabled}
                                                    placeholder="Search templates"
                                                    aria-label="Search blog starter templates"
                                                    data-testid="blog-template-library-search"
                                                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                                />
                                            </label>
                                            <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Filter blog starter templates">
                                                {PAGE_TEMPLATE_LIBRARY_CATEGORIES.map((category) => (
                                                    <button
                                                        key={category.id}
                                                        type="button"
                                                        onClick={() => setBlogTemplateLibraryCategory(category.id)}
                                                        disabled={blogTemplateSelectionControlDisabled}
                                                        aria-pressed={blogTemplateLibraryCategory === category.id}
                                                        aria-describedby={blogTemplateSelectionActionStatusId}
                                                        data-testid={`blog-template-category-${category.id}`}
                                                        data-active={blogTemplateLibraryCategory === category.id}
                                                        data-action-state={getBlogTemplateSelectionActionState(blogTemplateLibraryCategory === category.id)}
                                                        data-action-status={getBlogTemplateCategoryActionStatus(category)}
                                                        data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                        className={cn(
                                                            'inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                                                            blogTemplateLibraryCategory === category.id
                                                                ? 'border-primary bg-primary text-primary-foreground'
                                                                : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-accent',
                                                        )}
                                                    >
                                                        {category.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-3 max-h-[34rem] overflow-y-auto pr-1 [scrollbar-gutter:stable]" data-testid="blog-template-library-scroll">
                                            {visibleBlogStarterTemplateOptions.length > 0 ? (
                                                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                                    {visibleBlogStarterTemplateOptions.map((starterTemplate) => {
                                                        const frontendMatch = frontendTemplateByStarterTemplate.get(starterTemplate.id) || null;
                                                        const frontendMatchState = !isCustomFrontendTemplateSource
                                                            ? ''
                                                            : frontendMatch
                                                                ? 'matched'
                                                                : 'missing';

                                                        return (
                                                            <label
                                                                key={starterTemplate.id}
                                                                data-testid={`blog-template-option-${starterTemplate.id}`}
                                                                data-active={selectedBlogStarterTemplate === starterTemplate.id}
                                                                data-template-source={templateSourceMode}
                                                                data-starter-intent={starterTemplate.intent}
                                                                data-frontend-template-id={isCustomFrontendTemplateSource ? frontendMatch?.id || '' : undefined}
                                                                data-frontend-template-match={isCustomFrontendTemplateSource ? frontendMatchState : undefined}
                                                                data-action-state={getBlogTemplateSelectionActionState(selectedBlogStarterTemplate === starterTemplate.id)}
                                                                data-action-status={getBlogStarterTemplateActionStatus(starterTemplate)}
                                                                data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                                className={cn(
                                                                    'min-w-0 cursor-pointer rounded-lg border p-3 transition-all hover:shadow-sm',
                                                                    selectedBlogStarterTemplate === starterTemplate.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50',
                                                                    blogTemplateSelectionControlDisabled && 'cursor-not-allowed opacity-70',
                                                                )}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name="blogStarterTemplate"
                                                                    value={starterTemplate.id}
                                                                    checked={selectedBlogStarterTemplate === starterTemplate.id}
                                                                    onChange={(event) => handleBlogStarterTemplateChange(event.target.value as BlogStarterTemplate)}
                                                                    disabled={blogTemplateSelectionControlDisabled}
                                                                    aria-describedby={blogTemplateSelectionActionStatusId}
                                                                    data-action-state={getBlogTemplateSelectionActionState(selectedBlogStarterTemplate === starterTemplate.id)}
                                                                    data-action-status={getBlogStarterTemplateActionStatus(starterTemplate)}
                                                                    data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                                    className="sr-only"
                                                                />
                                                                <div className="mb-1 flex min-w-0 items-center gap-2">
                                                                    <FileText className={cn(
                                                                        'h-4 w-4 shrink-0',
                                                                        selectedBlogStarterTemplate === starterTemplate.id ? 'text-primary' : 'text-muted-foreground',
                                                                    )} />
                                                                    <span className="min-w-0 truncate font-semibold">{starterTemplate.name}</span>
                                                                </div>
                                                                <span className="text-xs leading-5 text-muted-foreground">{starterTemplate.desc}</span>
                                                                <span className="mt-3 flex flex-wrap gap-1">
                                                                    {starterTemplate.sections.map((section) => (
                                                                        <span key={section} className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                                                            {section}
                                                                        </span>
                                                                    ))}
                                                                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                                                        {BLOG_STARTER_INTENTS.find((intent) => intent.id === starterTemplate.intent)?.name || starterTemplate.intent}
                                                                    </span>
                                                                    {isCustomFrontendTemplateSource && (
                                                                        <span
                                                                            className={cn(
                                                                                'rounded-md px-2 py-1 text-[11px] font-semibold',
                                                                                frontendMatch ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800',
                                                                            )}
                                                                        >
                                                                            {frontendMatch ? `Uses ${frontendMatch.name}` : 'Needs captured template'}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground" data-testid="blog-template-library-empty">
                                                    No blog starter templates match this filter.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {frontendDesignLoading && (
                                        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                                            Loading frontend design templates...
                                        </div>
                                    )}
                                    {frontendDesignError && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            {frontendDesignError}
                                        </div>
                                    )}
                                    {isCustomFrontendTemplateSource && visibleFrontendBlogTemplates.length > 0 ? (
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="blog-frontend-template-options">
                                            {visibleFrontendBlogTemplates.map((template) => (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => applyFrontendTemplate(template, { syncRoute: true })}
                                                    disabled={blogTemplateSelectionControlDisabled}
                                                    title={editBlogPermissionTitle || viewSitePermissionTitle}
                                                    aria-describedby={blogTemplateSelectionActionStatusId}
                                                    data-testid={`blog-frontend-template-${template.id}`}
                                                    data-active={designTemplateId === template.id}
                                                    data-action-state={getBlogTemplateSelectionActionState(designTemplateId === template.id)}
                                                    data-action-status={getBlogFrontendTemplateActionStatus(template)}
                                                    data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}
                                                    className={cn(
                                                        'rounded-lg border bg-background p-3 text-left transition hover:border-teal-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70',
                                                        designTemplateId === template.id ? 'border-teal-600 ring-1 ring-teal-600' : 'border-border',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                                                        <span className="shrink-0 rounded-md bg-teal-100 px-2 py-1 text-[11px] font-semibold text-teal-800">
                                                            {template.canvasSize ? `${template.canvasSize.width} x ${template.canvasSize.height}` : 'Contract'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                        {template.description || template.routePattern || 'Captured blog template with frontend bindings.'}
                                                    </p>
                                                    <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                                        <span className="rounded-md bg-muted px-2 py-1">{template.bindingHints?.length || 0} bindings</span>
                                                        {template.routePattern && <span className="rounded-md bg-muted px-2 py-1">{template.routePattern}</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : isCustomFrontendTemplateSource && !frontendDesignLoading ? (
                                        <EmptyState
                                            icon={LayoutTemplate}
                                            title="No blog templates captured yet"
                                            description="Save a frontend design contract with blog post templates to seed this article from the connected custom frontend."
                                        />
                                    ) : (
                                        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
                                            Backy will create an editable article page with saved header, navigation, body, footer, and long-form blocks. Switch to Custom frontend when this site has captured blog post templates.
                                        </div>
                                    )}
                                </PanelContent>
                            </Panel>
                        )}

                        <div id="blog-create-canvas" className={cn('scroll-mt-24', isWorkspaceFocus && 'h-full min-h-0')} data-testid="blog-create-canvas-shell">
                            <EditorWorkspaceFrame
                                title={isWorkspaceFocus ? 'Post canvas' : 'Post design canvas'}
                                description={isWorkspaceFocus
                                    ? 'Focused article design workspace with the same component, layer, media, grouping, and data-binding controls used by pages.'
                                    : 'Use components, layers, grouping, resizing, reusable sections, and data bindings to design the public post page.'}
                                meta={
                                    <>
                                        <span className="rounded bg-muted px-2 py-1 tabular-nums">
                                            {canvasSize.width} x {canvasSize.height}px
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {canvasElements.length} root layer{canvasElements.length === 1 ? '' : 's'}
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {effectiveFrontendTemplate ? 'Frontend contract seed' : 'Header/nav/footer seeded'}
                                        </span>
                                        {effectiveFrontendTemplate && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                {effectiveFrontendTemplate.name}
                                            </span>
                                        )}
                                        {isWorkspaceFocus && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                Focused
                                            </span>
                                        )}
                                    </>
                                }
                                actions={isWorkspaceFocus ? (
                                    <>
                                        <Button
                                            type="submit"
                                            form="blog-create-form"
                                            size="sm"
                                            disabled={createFormDisabled}
                                            title={submitBlockerMessage || 'Save the post and open the visual editor'}
                                            aria-describedby={blogCreateSubmitDescribedBy}
                                            data-testid="blog-create-focus-submit-button"
                                            data-state={submitControlState}
                                            data-blocker={submitBlockerMessage || ''}
                                            data-can-submit={String(canSubmit)}
                                            data-can-preview={String(canCreatePreviewDraft)}
                                            data-action-state={blogCreateSubmitActionState}
                                            data-action-status={blogCreateSubmitActionStatus}
                                            data-disabled-reason={blogCreateSubmitDisabledReason || undefined}
                                            data-target-site-id={activeSiteId || undefined}
                                            data-target-route={routePath}
                                            data-target-status={status}
                                            data-target-template={blogCreateTemplateName}
                                            iconStart={<Save className="size-4" />}
                                        >
                                            {isLoading ? 'Saving...' : isCheckingPosts && !canSubmit ? 'Checking routes...' : submitLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isCreateBusy || !canAttemptCreatePreviewDraft}
                                            title={previewDraftBlockerMessage || 'Create a draft, open a preview link, and continue in the visual editor'}
                                            aria-describedby={blogCreatePreviewDescribedBy}
                                            data-state={previewDraftControlState}
                                            data-can-preview={String(canCreatePreviewDraft)}
                                            data-blocker={previewDraftBlockerMessage || ''}
                                            data-action-state={blogCreatePreviewActionState}
                                            data-action-status={blogCreatePreviewActionStatus}
                                            data-disabled-reason={blogCreatePreviewDisabledReason || undefined}
                                            data-target-site-id={activeSiteId || undefined}
                                            data-target-route={routePath}
                                            data-target-status="draft"
                                            data-target-template={blogCreateTemplateName}
                                            onClick={() => void handleCreatePreview()}
                                            iconStart={<Eye className="size-4" />}
                                        >
                                            {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceFocusRoute(false)}
                                            disabled={isCreateBusy}
                                            iconStart={<Minimize2 className="size-4" />}
                                        >
                                            Show panels
                                        </Button>
                                    </>
                                ) : undefined}
                                density={isWorkspaceFocus ? 'compact' : 'default'}
                                data-testid={isWorkspaceFocus ? 'blog-create-focus-banner' : undefined}
                                className={cn(
                                    'relative',
                                    isWorkspaceFocus
                                        ? 'h-full min-h-0'
                                        : 'min-h-[780px] xl:h-[calc(100vh-120px)] xl:min-h-[900px]',
                                )}
                            >
                                <CanvasEditor
                                    key={canvasSeedKey}
                                    mode="blog"
                                    initialElements={canvasElements}
                                    initialSettings={dummySettings}
                                    initialSize={canvasSize}
                                    initialCanvasFocusMode={isWorkspaceFocus}
                                    theme={selectedSite?.theme}
                                    onSave={() => { }}
                                    onChange={(elements, _settings, size) => {
                                        if (isCreateBusy || !canEditBlog) return;
                                        clearCreationFeedback();
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                    savePersistence="parent"
                                    saveOwnerLabel="post form"
                                    canView={canViewBlog}
                                    canEdit={canEditBlog}
                                    canPublish={canPublishBlog}
                                    canViewMedia={canViewMedia}
                                    canCreateMedia={canCreateMedia}
                                    canViewCollections={canViewCollections}
                                    mediaContext={{
                                      siteId: activeSiteId,
                                      scope: 'post',
                                      targetId: 'new-post',
                                      targetLabel: title.trim() || 'New blog post',
                                    }}
                                    editDisabledReason={editBlogPermissionTitle}
                                    publishDisabledReason={publishBlogPermissionTitle}
                                    mediaViewDisabledReason={viewMediaDeniedMessage}
                                    mediaCreateDisabledReason={createMediaDeniedMessage}
                                    collectionsViewDisabledReason={viewCollectionsDeniedMessage}
                                />
                                {isCreateBusy && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                                        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm">
                                            Saving post design...
                                        </div>
                                    </div>
                                )}
                            </EditorWorkspaceFrame>
                        </div>
                    </div>

                    {!isWorkspaceFocus && (
                    <aside
                        className="grid gap-4 xl:grid-cols-3"
                        data-testid="blog-create-management-panels"
                        data-editor-management-layout="below-canvas"
                    >
                        <Panel id="blog-create-publish" className="scroll-mt-24">
                            <PanelHeader
                                title="Publish"
                                description={selectedSite ? selectedSite.name : activeSiteId}
                                icon={<CalendarClock className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted p-1">
                                    {(['draft', 'published', 'scheduled'] as const).map((nextStatus) => (
                                        <button
                                            key={nextStatus}
                                            type="button"
                                            onClick={() => {
                                                if (isCreateBusy || !canEditBlog) return;

                                                clearCreationFeedback();
                                                setStatus(nextStatus);
                                                if (nextStatus !== 'scheduled') {
                                                    setScheduledAt(null);
                                                }
                                            }}
                                            disabled={createFormDisabled || (nextStatus !== 'draft' && !canPublishBlog)}
                                            title={nextStatus !== 'draft' ? publishBlogPermissionTitle : editBlogPermissionTitle}
                                            className={cn(
                                                'rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                                status === nextStatus
                                                    ? 'bg-background text-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                                            )}
                                        >
                                            {nextStatus}
                                        </button>
                                    ))}
                                </div>

                                {status === 'scheduled' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Publish date</label>
                                        <input
                                            type="datetime-local"
                                            value={toDateTimeLocalValue(scheduledAt)}
                                            min={minimumScheduledAt}
                                            onChange={(e) => {
                                                if (isCreateBusy || !canEditBlog || !canPublishBlog) return;

                                                clearCreationFeedback();
                                                setScheduledAt(fromDateTimeLocalValue(e.target.value));
                                            }}
                                            disabled={createFormDisabled || !canPublishBlog}
                                            title={publishBlogPermissionTitle}
                                            aria-invalid={Boolean(blogScheduleInlineError)}
                                            aria-describedby={blogScheduleInlineError ? 'blog-create-schedule-error' : undefined}
                                            data-testid="blog-create-schedule-input"
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            required
                                        />
                                        {blogScheduleInlineError && (
                                            <p id="blog-create-schedule-error" className="text-xs text-destructive" data-testid="blog-create-schedule-error">
                                                {blogScheduleInlineError}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                        <CheckCircle2 className="size-4 text-primary" />
                                        Readiness {readyCount}/{readinessChecks.length}
                                    </div>
                                    <div className="grid gap-2">
                                        {readinessChecks.map((check) => (
                                            <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="text-muted-foreground">{check.label}</span>
                                                <span className={cn('font-medium', check.complete ? 'text-success' : 'text-warning')}>
                                                    {check.complete ? 'Ready' : 'Needs work'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Button
                                        type="submit"
                                        disabled={createFormDisabled}
                                        title={submitBlockerMessage || 'Save the post and open the visual editor'}
                                        aria-describedby={blogCreateSubmitDescribedBy}
                                        data-testid="blog-create-publish-submit-button"
                                        data-state={submitControlState}
                                        data-blocker={submitBlockerMessage || ''}
                                        data-can-submit={String(canSubmit)}
                                        data-can-preview={String(canCreatePreviewDraft)}
                                        data-action-state={blogCreateSubmitActionState}
                                        data-action-status={blogCreateSubmitActionStatus}
                                        data-disabled-reason={blogCreateSubmitDisabledReason || undefined}
                                        data-target-site-id={activeSiteId || undefined}
                                        data-target-route={routePath}
                                        data-target-status={status}
                                        data-target-template={blogCreateTemplateName}
                                        variant="primary"
                                        iconStart={<Save className="size-4" />}
                                        className="w-full"
                                    >
                                        {isLoading ? 'Saving...' : isCheckingPosts && !canSubmit ? 'Checking routes...' : submitLabel}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void handleCreatePreview()}
                                        disabled={isCreateBusy || !canAttemptCreatePreviewDraft}
                                        title={previewDraftBlockerMessage || 'Create a draft, open a preview link, and continue in the visual editor'}
                                        aria-describedby={blogCreatePreviewDescribedBy}
                                        data-state={previewDraftControlState}
                                        data-can-preview={String(canCreatePreviewDraft)}
                                        data-blocker={previewDraftBlockerMessage || ''}
                                        data-action-state={blogCreatePreviewActionState}
                                        data-action-status={blogCreatePreviewActionStatus}
                                        data-disabled-reason={blogCreatePreviewDisabledReason || undefined}
                                        data-target-site-id={activeSiteId || undefined}
                                        data-target-route={routePath}
                                        data-target-status="draft"
                                        data-target-template={blogCreateTemplateName}
                                        variant="outline"
                                        iconStart={<Eye className="size-4" />}
                                        className="w-full"
                                    >
                                        {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!isCreateBusy) {
                                                void navigate({ to: '/blog', search: { siteId: activeSiteId } });
                                            }
                                        }}
                                        disabled={isCreateBusy}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        Discard
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-owner" className="scroll-mt-24">
                            <PanelHeader title="Site and author" icon={<Globe className="size-4" />} />
                            <PanelContent className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="blog-create-active-site" className="text-xs font-medium text-muted-foreground">Target site</label>
                                    <select
                                        id="blog-create-active-site"
                                        value={activeSiteId}
                                        onChange={(event) => selectBlogSite(event.target.value)}
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {sites.length === 0 ? (
                                            <option value="site-demo">Demo site</option>
                                        ) : sites.map((site) => (
                                            <option key={site.id} value={site.publicSiteId || site.id}>
                                                {site.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Author</label>
                                    <div className="relative">
                                        <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <select
                                            value={selectedAuthorId}
                                            onChange={(event) => {
                                                if (isCreateBusy || !canEditBlog) return;

                                                clearCreationFeedback();
                                                setSelectedAuthorId(event.target.value);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {authors.length === 0 ? (
                                                <option value={selectedAuthorId}>{user?.fullName || 'Admin'}</option>
                                            ) : authors.map((author) => (
                                                <option key={author.id} value={author.id}>
                                                    {author.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {selectedAuthor?.postCount ?? 0} existing post{(selectedAuthor?.postCount ?? 0) === 1 ? '' : 's'}
                                    </div>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-media" className="scroll-mt-24">
                            <PanelHeader
                                title="Featured media"
                                description="Image used by cards, feeds, Open Graph previews, and generated frontend lists."
                                icon={<ImageIcon className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="overflow-hidden rounded-lg border border-border bg-background">
                                    {selectedFeaturedImageUrl ? (
                                        <img
                                            src={selectedFeaturedImageUrl}
                                            alt={selectedFeaturedImage?.altText || selectedFeaturedImage?.name || 'Featured post image'}
                                            className="aspect-video w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                                            <ImageIcon className="size-8" />
                                        </div>
                                    )}
                                    <div className="space-y-1 px-3 py-3">
                                        <div className="truncate text-sm font-semibold text-foreground">
                                            {selectedFeaturedImage?.name || (featuredImageId ? featuredImageId : 'No featured image selected')}
                                        </div>
                                        <div className="text-xs leading-5 text-muted-foreground">
                                            {selectedFeaturedImage
                                                ? `${selectedFeaturedImage.type} · ${selectedFeaturedImage.visibility || 'public'} · ${selectedFeaturedImage.size}`
                                                : 'Select or upload an image scoped to this new post workflow.'}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (!canEditBlog) {
                                                setError(editBlogDeniedMessage);
                                                setNotice(null);
                                                return;
                                            }
                                            if (!canViewMedia) {
                                                setError(viewMediaDeniedMessage);
                                                setNotice(null);
                                                return;
                                            }
                                            setIsFeaturedMediaOpen(true);
                                        }}
                                        disabled={isCreateBusy || !canEditBlog || !canViewMedia}
                                        title={viewMediaPermissionTitle || editBlogPermissionTitle}
                                        iconStart={<ImageIcon className="size-4" />}
                                    >
                                        {featuredImageId ? 'Replace image' : 'Select image'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (isCreateBusy || !canEditBlog) return;

                                            clearCreationFeedback();
                                            setFeaturedImageId(null);
                                            setOgImage('');
                                        }}
                                        disabled={createFormDisabled || !featuredImageId}
                                        title={editBlogPermissionTitle}
                                        iconStart={<X className="size-4" />}
                                    >
                                        Clear image
                                    </Button>
                                </div>
                                {featuredImageId && (
                                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                                        featuredImageId: {featuredImageId}
                                    </div>
                                )}
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-taxonomy" className="scroll-mt-24">
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
                                    items={categories}
                                    selectedIds={selectedCategoryIds}
                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
                                    disabled={createFormDisabled}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                    disabled={createFormDisabled}
                                />
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-api" className="scroll-mt-24">
                            <PanelHeader
                                title="API handoff"
                                description="Create endpoint and frontend payload shape."
                                icon={<Code2 className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Create endpoint</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{adminBlogUrl}</div>
                                </div>

                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-medium text-muted-foreground">Public route</div>
                                            <div className="mt-1 font-mono text-xs text-foreground">{routePath}</div>
                                            <div className={cn('mt-1 text-xs font-medium', routeCheckError || routeConflict ? 'text-amber-700' : 'text-emerald-700')}>
                                                {routeCheckError
                                                    ? 'Route not verified'
                                                    : routeConflict
                                                        ? `Conflicts with ${routeConflict.title}`
                                                        : `${existingBlogPosts.length} existing post${existingBlogPosts.length === 1 ? '' : 's'} checked`}
                                            </div>
                                        </div>
                                        <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">POST</span>
                                    </div>
                                </div>

                                <pre data-testid="blog-create-payload" className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(createPayloadPreview, null, 2)}
                                </pre>

                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        onClick={() => void copyCreationText(adminBlogUrl, 'Blog create API URL')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy URL
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy handoff
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>
                    </aside>
                    )}
                    </div>

                </form>

                <MediaLibraryModal
                    isOpen={isFeaturedMediaOpen}
                    onClose={() => {
                        if (!isCreateBusy) {
                            setIsFeaturedMediaOpen(false);
                        }
                    }}
                    onSelect={(asset) => {
                        if (isCreateBusy || !canEditBlog || !canViewMedia) return;

                        const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
                        clearCreationFeedback();
                        setFeaturedImageId(asset.id);
                        setOgImage(deliveryUrl);
                        setNotice(`Selected ${asset.name} as the featured image.`);
                        setIsFeaturedMediaOpen(false);
                    }}
                    allowedTypes="image"
                    initialUploadFilter="image"
                    mediaContext={{
                        siteId: activeSiteId,
                        scope: 'post',
                        targetId: slugValue || title || 'new-post',
                        targetLabel: title || 'New blog post',
                    }}
                    allowScopeSwitcher={true}
                    canView={canViewMedia}
                    canCreate={canCreateMedia}
                    viewDisabledReason={viewMediaDeniedMessage}
                    createDisabledReason={createMediaDeniedMessage}
                />
            </div>
        </PageShell>
    );
}

const slugify = (value: string) => (
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
);

const routeSlugFromPattern = (value?: string) => {
    if (!value || value.includes('{')) return '';
    return slugify(value.replace(/^\/+|\/+$/g, '').replace(/^blog\//, ''));
};

const normalizeCanonicalPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '/';

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            return new URL(trimmed).pathname || '/';
        } catch {
            return trimmed;
        }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const getScheduledBlogPostDateError = (status: BlogCreationStatus, scheduledAt: string | null): string | null => {
    if (status !== 'scheduled') return null;
    if (!scheduledAt) return 'Choose a publish date before scheduling.';

    const scheduledAtMs = Date.parse(scheduledAt);
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
        return 'Choose a future publish date before scheduling.';
    }

    return null;
};

const isRecoverableBlogCreateDraft = (value: Partial<BlogCreateAutosaveDraft>): value is BlogCreateAutosaveDraft => (
    value.version === 1
    && typeof value.savedAt === 'string'
    && typeof value.activeSiteId === 'string'
    && typeof value.title === 'string'
    && typeof value.slug === 'string'
    && typeof value.excerpt === 'string'
    && (value.status === 'draft' || value.status === 'published' || value.status === 'scheduled')
    && (typeof value.scheduledAt === 'string' || value.scheduledAt === null)
    && typeof value.seoTitle === 'string'
    && typeof value.seoDescription === 'string'
    && typeof value.canonicalPath === 'string'
    && (typeof value.featuredImageId === 'string' || value.featuredImageId === null)
    && typeof value.ogImage === 'string'
    && typeof value.noIndex === 'boolean'
    && typeof value.noFollow === 'boolean'
    && Array.isArray(value.selectedCategoryIds)
    && Array.isArray(value.selectedTagIds)
    && typeof value.selectedAuthorId === 'string'
    && Array.isArray(value.canvasElements)
    && typeof value.canvasSize?.width === 'number'
    && typeof value.canvasSize?.height === 'number'
    && (
        value.selectedBlogStarterIntent === undefined
        || BLOG_STARTER_INTENTS.some((intent) => intent.id === value.selectedBlogStarterIntent)
    )
    && (
        value.selectedBlogStarterTemplate === undefined
        || isBlogStarterTemplate(value.selectedBlogStarterTemplate)
    )
    && (
        value.templateSourceMode === undefined
        || isBlogTemplateSourceMode(value.templateSourceMode)
    )
    && (value.designTemplateId === undefined || typeof value.designTemplateId === 'string')
    && (
        value.frontendDesignSource === undefined
        || value.frontendDesignSource === null
        || isRecord(value.frontendDesignSource)
    )
    && (
        value.frontendDesignTokens === undefined
        || value.frontendDesignTokens === null
        || isRecord(value.frontendDesignTokens)
    )
    && (
        value.frontendDesignChrome === undefined
        || value.frontendDesignChrome === null
        || isRecord(value.frontendDesignChrome)
    )
);

function BlogCreateReadinessCheck({ label, ready }: { label: string; ready: boolean }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
                {ready ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                )}
                <div>
                    <div className="text-sm font-semibold text-foreground">{label}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {ready ? 'Ready' : 'Needs work'}
                    </div>
                </div>
            </div>
        </div>
    );
}

function BlogCreateWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index}
            </span>
            <div>
                <div className="text-sm font-semibold text-foreground">{label}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

interface TaxonomyPickerProps {
    title: string;
    emptyLabel: string;
    items: Array<BlogCategory | BlogTag>;
    selectedIds: string[];
    onToggle: (id: string) => void;
    disabled?: boolean;
}

function TaxonomyPicker({ title, emptyLabel, items, selectedIds, onToggle, disabled = false }: TaxonomyPickerProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">{title}</label>
                <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            </div>
            <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-border bg-background p-3">
                {items.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{emptyLabel}</span>
                ) : items.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle(item.id)}
                            disabled={disabled}
                            className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {item.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
